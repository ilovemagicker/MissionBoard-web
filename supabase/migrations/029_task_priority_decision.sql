-- 029 — Task priority (優先度) + decision maker (決策人) approval gate.
-- Run in Supabase Dashboard → SQL Editor after 001–028. Safe to re-run (idempotent).
--
-- What this adds
--   1. missions.priority            'high' | 'medium' | 'low' | null (= 無). The app defaults new
--                                   tasks to 'medium'; existing rows stay null.
--   2. missions.decision_maker_id   optional single space member. When set, the task can only
--                                   become 'done' once the decision maker approves (核准):
--        • decision_requested_at / _by  — someone asked for approval (or every step finished)
--        • decision_approved_at  / _by  — the decision maker approved
--      Server guard (trigger, not an error): a non-decision-maker update that would set
--      status = 'done' without approval is coerced to 'inProgress' and records an approval
--      request instead (this also covers complete_step_part auto-completing the last step).
--      The decision maker setting 'done' counts as approval. Re-opening a task (done → other)
--      or changing the decision maker clears the approval.
--   3. RPCs (security definer): request_mission_decision, approve_mission_decision,
--      return_mission_decision.
--   4. Push (private.dispatch_notify_event → notify-event):
--        • approval requested → decision maker            (event mission_decision_needed)
--        • approved           → creator + requester       (event mission_decision_approved)
--      Preference column user_notification_preferences.mission_decision (default true).
--      Redeploy notify-event (+ _shared/copy.ts) for the copy; without it the events are ignored.
--
-- If this file is NOT applied: the app detects the missing columns and hides the 優先度 / 決策人
-- rows, the priority badge/filter and approval UI; tasks behave exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.missions add column if not exists priority text;
alter table public.missions add column if not exists decision_maker_id uuid
  references public.profiles (id) on delete set null;
alter table public.missions add column if not exists decision_requested_at timestamptz;
alter table public.missions add column if not exists decision_requested_by uuid
  references public.profiles (id) on delete set null;
alter table public.missions add column if not exists decision_approved_at timestamptz;
alter table public.missions add column if not exists decision_approved_by uuid
  references public.profiles (id) on delete set null;

alter table public.missions drop constraint if exists missions_priority_check;
alter table public.missions add constraint missions_priority_check
  check (priority is null or priority in ('high', 'medium', 'low'));

create index if not exists idx_missions_decision_maker_id on public.missions (decision_maker_id);

comment on column public.missions.priority is 'high | medium | low | null (none).';
comment on column public.missions.decision_maker_id is
  'Optional 決策人: task cannot become done until this member approves.';

alter table public.user_notification_preferences
  add column if not exists mission_decision boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Guard trigger (BEFORE INSERT/UPDATE)
-- ---------------------------------------------------------------------------
create or replace function public.trg_missions_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.decision_maker_id is not null
     and (tg_op = 'INSERT' or new.decision_maker_id is distinct from old.decision_maker_id)
     and not public.is_space_member(new.space_id, new.decision_maker_id) then
    raise exception 'Decision maker must be a member of this space';
  end if;

  if tg_op = 'UPDATE' then
    -- Changing the decision maker resets the approval cycle.
    if new.decision_maker_id is distinct from old.decision_maker_id then
      new.decision_approved_at := null;
      new.decision_approved_by := null;
      new.decision_requested_at := null;
      new.decision_requested_by := null;
    -- Only the decision maker (or service role) may write the approval columns directly.
    elsif v_uid is not null
          and v_uid is distinct from new.decision_maker_id
          and (new.decision_approved_at is distinct from old.decision_approved_at
               or new.decision_approved_by is distinct from old.decision_approved_by) then
      new.decision_approved_at := old.decision_approved_at;
      new.decision_approved_by := old.decision_approved_by;
    end if;

    -- Re-opened → needs a fresh approval next time.
    if old.status = 'done' and new.status is distinct from 'done' then
      new.decision_approved_at := null;
      new.decision_approved_by := null;
      new.decision_requested_at := null;
      new.decision_requested_by := null;
    end if;
  end if;

  if new.decision_maker_id is null then
    return new;
  end if;

  if new.status = 'done'
     and (tg_op = 'INSERT' or old.status is distinct from 'done')
     and new.decision_approved_at is null then
    if v_uid is not null and v_uid = new.decision_maker_id then
      -- The decision maker completing the task is the approval.
      new.decision_approved_at := now();
      new.decision_approved_by := v_uid;
    else
      -- Not approved yet: keep it open and ask the decision maker.
      new.status := 'inProgress';
      if new.decision_requested_at is null then
        new.decision_requested_at := now();
        new.decision_requested_by := v_uid;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists missions_decision_guard on public.missions;
create trigger missions_decision_guard
  before insert or update on public.missions
  for each row execute function public.trg_missions_decision_guard();

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.request_mission_decision(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.missions%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  if not public.is_space_editor(v_m.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if v_m.decision_maker_id is null or v_m.decision_approved_at is not null then
    return;
  end if;
  update public.missions
     set decision_requested_at = now(), decision_requested_by = v_uid
   where id = p_mission_id;
end;
$$;

create or replace function public.approve_mission_decision(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.missions%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  if v_m.decision_maker_id is distinct from v_uid then
    raise exception 'Only the decision maker can approve';
  end if;
  update public.missions
     set decision_approved_at = now(),
         decision_approved_by = v_uid,
         status = 'done'
   where id = p_mission_id;
end;
$$;

-- Decision maker sends it back (clears the pending request; task stays open).
create or replace function public.return_mission_decision(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.missions%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.missions where id = p_mission_id for update;
  if not found then raise exception 'Mission not found'; end if;
  if v_m.decision_maker_id is distinct from v_uid then
    raise exception 'Only the decision maker can return the task';
  end if;
  update public.missions
     set decision_requested_at = null, decision_requested_by = null
   where id = p_mission_id;
end;
$$;

revoke all on function public.request_mission_decision(uuid) from public, anon;
revoke all on function public.approve_mission_decision(uuid) from public, anon;
revoke all on function public.return_mission_decision(uuid) from public, anon;
grant execute on function public.request_mission_decision(uuid) to authenticated;
grant execute on function public.approve_mission_decision(uuid) to authenticated;
grant execute on function public.return_mission_decision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Push fan-out (AFTER UPDATE)
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_mission_decision()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_space_name text;
begin
  if new.decision_maker_id is null then
    return new;
  end if;
  select name into v_space_name from public.spaces where id = new.space_id;

  if new.decision_requested_at is not null
     and new.decision_requested_at is distinct from old.decision_requested_at
     and new.decision_approved_at is null then
    perform private.dispatch_notify_event(jsonb_build_object(
      'event', 'mission_decision_needed',
      'actor_id', coalesce(auth.uid(), new.decision_requested_by),
      'space_id', new.space_id,
      'mission_id', new.id,
      'target_user_id', new.decision_maker_id,
      'mission_title', coalesce(new.title, ''),
      'space_name', coalesce(v_space_name, '')
    ));
  end if;

  if new.decision_approved_at is not null
     and old.decision_approved_at is null then
    perform private.dispatch_notify_event(jsonb_build_object(
      'event', 'mission_decision_approved',
      'actor_id', coalesce(auth.uid(), new.decision_approved_by),
      'space_id', new.space_id,
      'mission_id', new.id,
      'target_user_id', new.creator_id,
      'requester_id', old.decision_requested_by,
      'mission_title', coalesce(new.title, ''),
      'space_name', coalesce(v_space_name, '')
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists push_mission_decision on public.missions;
create trigger push_mission_decision
  after update of decision_requested_at, decision_approved_at on public.missions
  for each row execute function public.trg_push_mission_decision();

-- Deploy checklist:
--   1. Run this file.
--   2. supabase functions deploy notify-event   (new events + zh/en copy)
--   3. Verify: set a 決策人 on a task, mark it 完成 as someone else → stays 進行中 with
--      「待決策人核准」, decision maker gets a push; 核准 → 完成.
