-- 030 — Task start time + start-time reminder push (開始提醒).
-- Run in Supabase Dashboard → SQL Editor after 001–029 (uses 024's reminder pipeline and
-- 029's missions.decision_maker_id). Safe to re-run (idempotent).
--
-- What this adds
--   1. missions.start_time_minutes   optional time of day for start_date (0–1439, local wall clock)
--      missions.start_timezone       IANA tz the time was entered in (app sends the device tz);
--                                    null → private.resolve_reminder_timezone(creator, space)
--      missions.start_reminder_minutes  per-task lead: null = each recipient's own default,
--                                    0 = 不提醒, 15 / 60 / 1440 = 15 分鐘 / 1 小時 / 1 天
--   2. user_notification_preferences.mission_start_reminder (bool, default true)
--      user_notification_preferences.mission_start_reminder_minutes (default 60)
--      → 我的 › 通知 › 任務開始提醒 (toggle + default lead).
--   3. private.run_mission_start_reminders() + pg_cron job 'mb-mission-start-reminder' (every
--      5 min). Recipients = task participants: creator, step assignees, decision maker and
--      members currently 進行中 on it. Each gets one push when now ≥ start − lead (before start).
--      Dedup via private.push_reminder_sent (kind 'mission_start_reminder').
--   4. Push event mission_start_reminder → redeploy notify-event (+ _shared/copy.ts).
--
-- If this file is NOT applied: the app detects the missing column and hides the 開始時間 /
-- 開始提醒 rows; nothing else changes.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.missions add column if not exists start_time_minutes int;
alter table public.missions add column if not exists start_timezone text;
alter table public.missions add column if not exists start_reminder_minutes int;

alter table public.missions drop constraint if exists missions_start_time_minutes_check;
alter table public.missions add constraint missions_start_time_minutes_check
  check (start_time_minutes is null or (start_time_minutes between 0 and 1439));

alter table public.missions drop constraint if exists missions_start_reminder_minutes_check;
alter table public.missions add constraint missions_start_reminder_minutes_check
  check (start_reminder_minutes is null or start_reminder_minutes in (0, 15, 60, 1440));

alter table public.user_notification_preferences
  add column if not exists mission_start_reminder boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists mission_start_reminder_minutes int not null default 60;

alter table public.user_notification_preferences
  drop constraint if exists user_notif_prefs_start_minutes_check;
alter table public.user_notification_preferences
  add constraint user_notif_prefs_start_minutes_check
  check (mission_start_reminder_minutes in (15, 60, 1440));

-- Dedup log: allow the new kinds (031 recurrence uses 'mission_recurrence').
alter table private.push_reminder_sent drop constraint if exists push_reminder_sent_kind_check;
alter table private.push_reminder_sent add constraint push_reminder_sent_kind_check
  check (kind in ('mission_due_today', 'shift_reminder', 'mission_start_reminder',
                  'mission_recurrence', 'poll_closed'));

-- ---------------------------------------------------------------------------
-- 2. Reminder runner
-- ---------------------------------------------------------------------------
create or replace function private.run_mission_start_reminders()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  m record;
  r record;
  v_tz text;
  v_start_at timestamptz;
  v_lead int;
  v_space_name text;
  v_count int := 0;
begin
  for m in
    select mi.id, mi.space_id, mi.title, mi.creator_id, mi.start_date,
           mi.start_time_minutes, mi.start_timezone, mi.start_reminder_minutes,
           mi.decision_maker_id
    from public.missions mi
    where mi.start_date is not null
      and mi.start_time_minutes is not null
      and mi.status is distinct from 'done'
      and mi.archived_at is null
      and coalesce(mi.start_reminder_minutes, -1) <> 0
      and mi.start_date between (current_date - 1) and (current_date + 2)
  loop
    begin
      v_tz := coalesce(
        nullif(trim(m.start_timezone), ''),
        private.resolve_reminder_timezone(m.creator_id, m.space_id)
      );
      v_start_at := (m.start_date::timestamp + make_interval(mins => m.start_time_minutes))
                    at time zone v_tz;
      if v_start_at <= now() or v_start_at > now() + interval '25 hours' then
        continue;
      end if;

      select name into v_space_name from public.spaces where id = m.space_id;

      for r in
        select distinct u.user_id,
               coalesce(p.mission_start_reminder, true) as pref_enabled,
               coalesce(p.mission_start_reminder_minutes, 60) as pref_minutes
        from (
          select m.creator_id as user_id
          union select m.decision_maker_id
          union select ms.assignee_id from public.mission_steps ms
                 where ms.mission_id = m.id and ms.assignee_id is not null
          union select sa.user_id from public.step_assignees sa
                 join public.mission_steps ms2 on ms2.id = sa.step_id
                 where ms2.mission_id = m.id
          union select mw.user_id from public.mission_workers mw where mw.mission_id = m.id
        ) u
        join public.space_members sm on sm.space_id = m.space_id and sm.user_id = u.user_id
        left join public.user_notification_preferences p on p.user_id = u.user_id
        where u.user_id is not null
      loop
        if not r.pref_enabled then
          continue;
        end if;
        v_lead := coalesce(m.start_reminder_minutes, r.pref_minutes, 60);
        if v_lead not in (15, 60, 1440) then
          continue;
        end if;
        if now() < v_start_at - make_interval(mins => v_lead) then
          continue;
        end if;
        if not private.try_claim_reminder_send(
          'mission_start_reminder', m.id, r.user_id, m.start_date
        ) then
          continue;
        end if;
        perform private.dispatch_notify_event(jsonb_build_object(
          'event', 'mission_start_reminder',
          'space_id', m.space_id,
          'mission_id', m.id,
          'target_user_id', r.user_id,
          'mission_title', coalesce(m.title, ''),
          'space_name', coalesce(v_space_name, ''),
          'reminder_minutes', v_lead
        ));
        v_count := v_count + 1;
      end loop;
    exception when others then
      raise warning 'run_mission_start_reminders row failed: %', sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.run_mission_start_reminders() from public, anon, authenticated;
grant execute on function private.run_mission_start_reminders() to postgres, service_role;

-- Changing the start date/time re-arms the reminder (drop the dedup rows for this mission).
create or replace function public.trg_missions_start_rearm()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.start_date is distinct from old.start_date
     or new.start_time_minutes is distinct from old.start_time_minutes
     or new.start_reminder_minutes is distinct from old.start_reminder_minutes then
    delete from private.push_reminder_sent
     where kind = 'mission_start_reminder' and entity_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists missions_start_rearm on public.missions;
create trigger missions_start_rearm
  after update of start_date, start_time_minutes, start_reminder_minutes on public.missions
  for each row execute function public.trg_missions_start_rearm();

-- ---------------------------------------------------------------------------
-- 3. Cron (idempotent by job name)
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'mb-mission-start-reminder' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'mb-mission-start-reminder',
    '*/5 * * * *',
    $cron$select private.run_mission_start_reminders()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron not available — enable it in Dashboard → Database → Extensions, then re-run this block';
end;
$$;

-- Deploy checklist:
--   1. Run this file (after 029).
--   2. supabase functions deploy notify-event   (mission_start_reminder copy)
--   3. Verify: task with start = now + 20 min and 提醒 15 分鐘 → one push ~5 min later (app closed).
--      select * from cron.job where jobname = 'mb-mission-start-reminder';
