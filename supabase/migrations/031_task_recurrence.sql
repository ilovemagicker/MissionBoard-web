-- 031 — Recurring tasks (重複任務), generated server-side by pg_cron.
-- Run in Supabase Dashboard → SQL Editor after 001–030 (copies 029/030 columns). Idempotent.
--
-- Model
--   public.mission_recurrences — one row per recurring task:
--     frequency  'daily' | 'weekly' (weekdays int[] ISO 1=Mon … 7=Sun) |
--                'monthly' (month_day 1–31; clamps to the month's last day) |
--                'interval' (every interval_days days, counted from start_on)
--     time_minutes + timezone  local wall-clock time the new instance is created
--     end_on / max_count       optional end (date or number of generated instances)
--     template_mission_id      the task copied on every run (title, description, flag, steps,
--                              step assignees, priority, 決策人, claim-approval override,
--                              start-reminder lead). Edits to the template affect future runs.
--     next_run_at              computed by trigger; active = false stops it (管理 › 停止重複).
--   start_on                   the template's own day (its occurrence = the template itself);
--                              the first copy is the next occurrence after start_on + time.
--   missions.recurrence_id     set on the template and on every generated instance (repeat icon).
--
-- Generation: private.run_mission_recurrences() every 5 minutes (pg_cron job
-- 'mb-mission-recurrence'). Each due recurrence creates ONE new task (status 待辦, creator =
-- template creator, start_date = occurrence day, start time = recurrence time, due date shifted
-- by the template's start→due span) and advances next_run_at past now() — missed runs while
-- the database was paused are skipped, not back-filled. The new task fires the normal
-- mission_created push to space members (no edge-function change needed).
-- If the template task is deleted the recurrence moves to its latest instance; with no
-- instance left it stops.
--
-- If this file is NOT applied: the app hides the 重複 row (create + detail) and the repeat icon.
-- Fallback without pg_cron: call `select private.run_mission_recurrences();` from any scheduler
-- (e.g. a Supabase scheduled Edge Function or external cron hitting an RPC) every few minutes.

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.mission_recurrences (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  template_mission_id uuid references public.missions (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  frequency text not null default 'daily',
  interval_days int,
  weekdays int[] not null default '{}',
  month_day int,
  time_minutes int not null default 540,
  timezone text not null default 'Asia/Hong_Kong',
  start_on date not null default current_date,
  end_on date,
  max_count int,
  generated_count int not null default 0,
  next_run_at timestamptz,
  last_run_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mission_recurrences drop constraint if exists mission_recurrences_frequency_check;
alter table public.mission_recurrences add constraint mission_recurrences_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'interval'));
alter table public.mission_recurrences drop constraint if exists mission_recurrences_values_check;
alter table public.mission_recurrences add constraint mission_recurrences_values_check
  check (
    time_minutes between 0 and 1439
    and (interval_days is null or interval_days between 1 and 365)
    and (month_day is null or month_day between 1 and 31)
    and (max_count is null or max_count between 1 and 1000)
    and weekdays <@ array[1,2,3,4,5,6,7]
  );

create index if not exists idx_mission_recurrences_space on public.mission_recurrences (space_id);
create index if not exists idx_mission_recurrences_due
  on public.mission_recurrences (next_run_at) where active;
create unique index if not exists uq_mission_recurrences_template
  on public.mission_recurrences (template_mission_id) where template_mission_id is not null;

alter table public.missions add column if not exists recurrence_id uuid
  references public.mission_recurrences (id) on delete set null;
create index if not exists idx_missions_recurrence_id on public.missions (recurrence_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — space members read; editors (owner/admin/member, not viewers) manage.
-- ---------------------------------------------------------------------------
alter table public.mission_recurrences enable row level security;

drop policy if exists "mission_recurrences_select" on public.mission_recurrences;
create policy "mission_recurrences_select" on public.mission_recurrences
  for select to authenticated
  using (public.is_space_member(space_id, auth.uid()));

drop policy if exists "mission_recurrences_insert" on public.mission_recurrences;
create policy "mission_recurrences_insert" on public.mission_recurrences
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_space_editor(space_id, auth.uid())
    and (template_mission_id is null or exists (
      select 1 from public.missions m
      where m.id = template_mission_id and m.space_id = mission_recurrences.space_id
    ))
  );

drop policy if exists "mission_recurrences_update" on public.mission_recurrences;
create policy "mission_recurrences_update" on public.mission_recurrences
  for update to authenticated
  using (public.is_space_editor(space_id, auth.uid()))
  with check (public.is_space_editor(space_id, auth.uid()));

drop policy if exists "mission_recurrences_delete" on public.mission_recurrences;
create policy "mission_recurrences_delete" on public.mission_recurrences
  for delete to authenticated
  using (public.is_space_editor(space_id, auth.uid()));

grant select, insert, update, delete on public.mission_recurrences to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Next occurrence
-- ---------------------------------------------------------------------------
create or replace function private.recurrence_next_run(
  p_frequency text,
  p_interval_days int,
  p_weekdays int[],
  p_month_day int,
  p_time_minutes int,
  p_timezone text,
  p_start_on date,
  p_end_on date,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Hong_Kong');
  v_day date;
  v_last int;
  v_at timestamptz;
  v_ok boolean;
  i int;
begin
  v_day := greatest((p_after at time zone v_tz)::date, p_start_on);
  for i in 0..800 loop
    if p_end_on is not null and v_day > p_end_on then
      return null;
    end if;
    v_ok := false;
    if p_frequency = 'daily' then
      v_ok := true;
    elsif p_frequency = 'weekly' then
      v_ok := extract(isodow from v_day)::int = any(coalesce(p_weekdays, '{}'));
    elsif p_frequency = 'monthly' then
      v_last := extract(day from (date_trunc('month', v_day) + interval '1 month - 1 day'))::int;
      v_ok := extract(day from v_day)::int = least(coalesce(p_month_day, 1), v_last);
    elsif p_frequency = 'interval' then
      v_ok := ((v_day - p_start_on) % greatest(coalesce(p_interval_days, 1), 1)) = 0;
    end if;
    if v_ok then
      v_at := (v_day::timestamp + make_interval(mins => p_time_minutes)) at time zone v_tz;
      if v_at > p_after then
        return v_at;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return null;
end;
$$;

revoke all on function private.recurrence_next_run(text, int, int[], int, int, text, date, date, timestamptz)
  from public, anon, authenticated;
grant execute on function private.recurrence_next_run(text, int, int[], int, int, text, date, date, timestamptz)
  to postgres, service_role;

-- BEFORE INSERT/UPDATE: validate + (re)compute next_run_at when the pattern changes.
create or replace function public.trg_mission_recurrences_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.updated_at := now();
  if new.frequency = 'weekly' and coalesce(array_length(new.weekdays, 1), 0) = 0 then
    raise exception 'Weekly recurrence needs at least one weekday';
  end if;
  if new.frequency = 'monthly' and new.month_day is null then
    new.month_day := extract(day from new.start_on)::int;
  end if;
  if new.frequency = 'interval' and new.interval_days is null then
    new.interval_days := 2;
  end if;
  begin
    perform now() at time zone new.timezone;
  exception when others then
    new.timezone := 'Asia/Hong_Kong';
  end;

  if tg_op = 'INSERT'
     or new.frequency is distinct from old.frequency
     or new.interval_days is distinct from old.interval_days
     or new.weekdays is distinct from old.weekdays
     or new.month_day is distinct from old.month_day
     or new.time_minutes is distinct from old.time_minutes
     or new.timezone is distinct from old.timezone
     or new.start_on is distinct from old.start_on
     or new.end_on is distinct from old.end_on
     or new.max_count is distinct from old.max_count
     or (new.active and not old.active) then
    if tg_op = 'UPDATE' and new.active and not old.active
       and new.max_count is not null and new.generated_count >= new.max_count then
      -- Resuming a finished count-limited recurrence restarts the count.
      new.generated_count := 0;
    end if;
    if new.active then
      -- start_on is the template's own day: its occurrence is the template itself, so the
      -- first generated copy is the next occurrence strictly after it (and after now()).
      new.next_run_at := private.recurrence_next_run(
        new.frequency, new.interval_days, new.weekdays, new.month_day,
        new.time_minutes, new.timezone, new.start_on, new.end_on,
        greatest(
          now(),
          (new.start_on::timestamp + make_interval(mins => new.time_minutes)) at time zone new.timezone
        )
      );
      if new.next_run_at is null then
        new.active := false;
      end if;
    end if;
  end if;
  if not new.active then
    new.next_run_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mission_recurrences_schedule on public.mission_recurrences;
create trigger mission_recurrences_schedule
  before insert or update on public.mission_recurrences
  for each row execute function public.trg_mission_recurrences_schedule();

-- Template deleted → hand the recurrence to its latest instance (else FK sets null → stops).
create or replace function public.trg_missions_recurrence_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  if old.recurrence_id is null then
    return old;
  end if;
  select m.id into v_next
    from public.missions m
   where m.recurrence_id = old.recurrence_id and m.id <> old.id
   order by m.created_at desc
   limit 1;
  update public.mission_recurrences
     set template_mission_id = v_next
   where id = old.recurrence_id and template_mission_id = old.id;
  return old;
end;
$$;

drop trigger if exists missions_recurrence_handoff on public.missions;
create trigger missions_recurrence_handoff
  before delete on public.missions
  for each row execute function public.trg_missions_recurrence_handoff();

-- ---------------------------------------------------------------------------
-- 4. Generator
-- ---------------------------------------------------------------------------
-- Copies one template into a new task. Returns the new mission id.
create or replace function private.instantiate_recurrence(p_rec_id uuid, p_occurs_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  rec public.mission_recurrences%rowtype;
  t public.missions%rowtype;
  v_day date;
  v_new uuid := gen_random_uuid();
  s record;
  v_step uuid;
begin
  select * into rec from public.mission_recurrences where id = p_rec_id;
  select * into t from public.missions where id = rec.template_mission_id;
  if not found then
    return null;
  end if;
  v_day := (p_occurs_at at time zone rec.timezone)::date;

  insert into public.missions (
    id, space_id, title, description, start_date, due_date, status, flag_icon, creator_id,
    step_claim_approval_override, priority, decision_maker_id,
    start_time_minutes, start_timezone, start_reminder_minutes, recurrence_id
  ) values (
    v_new, t.space_id, t.title, t.description, v_day,
    case
      when t.due_date is not null and t.start_date is not null then v_day + (t.due_date - t.start_date)
      when t.due_date is not null then v_day
      else null
    end,
    'todo', t.flag_icon, t.creator_id,
    t.step_claim_approval_override, t.priority,
    case when t.decision_maker_id is not null
              and public.is_space_member(t.space_id, t.decision_maker_id)
         then t.decision_maker_id end,
    rec.time_minutes, rec.timezone, t.start_reminder_minutes, rec.id
  );

  for s in
    select * from public.mission_steps where mission_id = t.id order by order_index, created_at
  loop
    v_step := gen_random_uuid();
    insert into public.mission_steps (id, mission_id, title, order_index, is_done, assignee_id, deadline_date)
    values (
      v_step, v_new, s.title, s.order_index, false,
      case when s.assignee_id is not null and public.is_space_member(t.space_id, s.assignee_id)
           then s.assignee_id end,
      case when s.deadline_date is not null and t.start_date is not null
           then v_day + (s.deadline_date - t.start_date) end
    );
    insert into public.step_assignees (step_id, user_id, is_done)
    select v_step, sa.user_id, false
      from public.step_assignees sa
     where sa.step_id = s.id
       and public.is_space_member(t.space_id, sa.user_id)
    on conflict do nothing;
  end loop;

  return v_new;
end;
$$;

revoke all on function private.instantiate_recurrence(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.instantiate_recurrence(uuid, timestamptz) to postgres, service_role;

create or replace function private.run_mission_recurrences()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r record;
  v_new uuid;
  v_count int := 0;
  v_next timestamptz;
  v_generated int;
begin
  for r in
    select * from public.mission_recurrences
     where active and next_run_at is not null and next_run_at <= now()
     order by next_run_at
     for update skip locked
  loop
    begin
      if r.template_mission_id is null then
        update public.mission_recurrences set active = false where id = r.id;
        continue;
      end if;

      v_new := private.instantiate_recurrence(r.id, r.next_run_at);
      v_generated := r.generated_count + case when v_new is null then 0 else 1 end;
      v_next := private.recurrence_next_run(
        r.frequency, r.interval_days, r.weekdays, r.month_day,
        r.time_minutes, r.timezone, r.start_on, r.end_on, greatest(now(), r.next_run_at)
      );

      update public.mission_recurrences
         set generated_count = v_generated,
             last_run_at = now(),
             next_run_at = v_next,
             active = (v_next is not null
                       and (max_count is null or v_generated < max_count)
                       and v_new is not null)
       where id = r.id;

      if v_new is not null then
        v_count := v_count + 1;
      end if;
    exception when others then
      raise warning 'run_mission_recurrences % failed: %', r.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.run_mission_recurrences() from public, anon, authenticated;
grant execute on function private.run_mission_recurrences() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 5. Cron (idempotent by job name)
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'mb-mission-recurrence' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'mb-mission-recurrence',
    '*/5 * * * *',
    $cron$select private.run_mission_recurrences()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron not available — enable it in Dashboard → Database → Extensions, then re-run this block';
end;
$$;

-- Deploy checklist:
--   1. Run this file (after 029 + 030).
--   2. No edge-function change (instances use the existing mission_created push).
--   3. Verify: set a task to repeat daily at now()+6 min → within ~10 min a new 待辦 copy appears
--      (app closed is fine). select * from public.mission_recurrences order by updated_at desc;
