-- Step claim requests + assignee change guards
-- Run in Supabase Dashboard → SQL Editor after 001–006.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.step_claim_requests (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  step_id uuid not null references public.mission_steps (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- One pending claim request per step
create unique index if not exists idx_step_claim_requests_one_pending
  on public.step_claim_requests (step_id)
  where status = 'pending';

create index if not exists idx_step_claim_requests_mission_id
  on public.step_claim_requests (mission_id);

create index if not exists idx_step_claim_requests_requester_id
  on public.step_claim_requests (requester_id);

create index if not exists idx_step_claim_requests_status
  on public.step_claim_requests (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.step_claim_requests enable row level security;

drop policy if exists "step_claim_requests_select" on public.step_claim_requests;
create policy "step_claim_requests_select"
  on public.step_claim_requests for select
  to authenticated
  using (
    exists (
      select 1
      from public.missions m
      where m.id = step_claim_requests.mission_id
        and public.is_space_member(m.space_id, auth.uid())
    )
  );

-- Inserts / updates go through security definer RPCs; no direct client writes.
drop policy if exists "step_claim_requests_insert" on public.step_claim_requests;
drop policy if exists "step_claim_requests_update" on public.step_claim_requests;
drop policy if exists "step_claim_requests_delete" on public.step_claim_requests;

-- ---------------------------------------------------------------------------
-- Guard: clients cannot freely change assignee_id via UPDATE
-- RPCs set local session var app.allow_assignee_change = '1'
-- ---------------------------------------------------------------------------
create or replace function public.prevent_assignee_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.assignee_id is distinct from new.assignee_id
     and auth.uid() is not null
     and coalesce(current_setting('app.allow_assignee_change', true), '') is distinct from '1'
  then
    raise exception 'assignee_id can only be changed via claim/assign RPCs';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_assignee_change on public.mission_steps;
create trigger trg_prevent_assignee_change
  before update on public.mission_steps
  for each row execute function public.prevent_assignee_change();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._allow_assignee_change()
returns void
language plpgsql
as $$
begin
  perform set_config('app.allow_assignee_change', '1', true);
end;
$$;

create or replace function public._emit_step_claim_activity(
  p_space_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_mission_id uuid,
  p_step_id uuid,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.insert_activity_event(uuid,uuid,text,uuid,uuid,text)') is null then
    return;
  end if;
  begin
    perform public.insert_activity_event(
      p_space_id, p_actor_id, p_kind, p_mission_id, p_step_id, coalesce(p_summary, '')
    );
  exception when others then
    null;
  end;
end;
$$;

create or replace function public._is_mission_creator(p_mission_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.missions m
    where m.id = p_mission_id and m.creator_id = p_user_id
  );
$$;

create or replace function public._is_space_admin_or_owner(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = p_user_id
      and sm.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- request_step_claim
-- ---------------------------------------------------------------------------
create or replace function public.request_step_claim(p_step_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_step public.mission_steps%rowtype;
  v_mission public.missions%rowtype;
  v_existing uuid;
  v_other uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_step from public.mission_steps where id = p_step_id for update;
  if not found then
    raise exception 'Step not found';
  end if;

  select * into v_mission from public.missions where id = v_step.mission_id;
  if not found then
    raise exception 'Mission not found';
  end if;

  if not public.is_space_member(v_mission.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;

  if v_step.assignee_id is not null then
    raise exception 'Step is already assigned';
  end if;

  select id into v_existing
  from public.step_claim_requests
  where step_id = p_step_id
    and requester_id = v_uid
    and status = 'pending'
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_other
  from public.step_claim_requests
  where step_id = p_step_id and status = 'pending'
  limit 1;

  if v_other is not null then
    raise exception 'Another claim request is already pending for this step';
  end if;

  -- Re-open the most recent declined/cancelled row from this requester if present
  select id into v_id
  from public.step_claim_requests
  where step_id = p_step_id
    and requester_id = v_uid
    and status in ('declined', 'cancelled')
  order by created_at desc
  limit 1;

  if v_id is not null then
    update public.step_claim_requests
    set status = 'pending', resolved_at = null, created_at = now()
    where id = v_id;
  else
    insert into public.step_claim_requests (mission_id, step_id, requester_id, status)
    values (v_mission.id, p_step_id, v_uid, 'pending')
    returning id into v_id;
  end if;

  perform public._emit_step_claim_activity(
    v_mission.space_id,
    v_uid,
    'step_claim_requested',
    v_mission.id,
    p_step_id,
    coalesce(v_step.title, '')
  );

  return v_id;
end;
$$;

grant execute on function public.request_step_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_step_claim_request
-- ---------------------------------------------------------------------------
create or replace function public.cancel_step_claim_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.step_claim_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.step_claim_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.requester_id is distinct from v_uid then
    raise exception 'Only the requester can cancel';
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  update public.step_claim_requests
  set status = 'cancelled', resolved_at = now()
  where id = p_request_id;

  return true;
end;
$$;

grant execute on function public.cancel_step_claim_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_step_claim
-- ---------------------------------------------------------------------------
create or replace function public.accept_step_claim(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.step_claim_requests%rowtype;
  v_mission public.missions%rowtype;
  v_step public.mission_steps%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.step_claim_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  select * into v_mission from public.missions where id = r.mission_id;
  if not found then
    raise exception 'Mission not found';
  end if;

  if v_mission.creator_id is distinct from v_uid then
    raise exception 'Only the mission creator can accept claim requests';
  end if;

  select * into v_step from public.mission_steps where id = r.step_id for update;
  if not found then
    raise exception 'Step not found';
  end if;

  if v_step.assignee_id is not null then
    raise exception 'Step is already assigned';
  end if;

  perform public._allow_assignee_change();

  update public.mission_steps
  set assignee_id = r.requester_id
  where id = r.step_id;

  update public.step_claim_requests
  set status = 'accepted', resolved_at = now()
  where id = p_request_id;

  -- Decline any other pendings on same step (defensive; unique index should prevent)
  update public.step_claim_requests
  set status = 'declined', resolved_at = now()
  where step_id = r.step_id
    and status = 'pending'
    and id is distinct from p_request_id;

  perform public._emit_step_claim_activity(
    v_mission.space_id,
    v_uid,
    'step_claim_accepted',
    v_mission.id,
    r.step_id,
    coalesce(v_step.title, '')
  );

  return true;
end;
$$;

grant execute on function public.accept_step_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_step_claim
-- ---------------------------------------------------------------------------
create or replace function public.decline_step_claim(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.step_claim_requests%rowtype;
  v_mission public.missions%rowtype;
  v_title text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.step_claim_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  select * into v_mission from public.missions where id = r.mission_id;
  if not found then
    raise exception 'Mission not found';
  end if;

  if v_mission.creator_id is distinct from v_uid then
    raise exception 'Only the mission creator can decline claim requests';
  end if;

  select title into v_title from public.mission_steps where id = r.step_id;

  update public.step_claim_requests
  set status = 'declined', resolved_at = now()
  where id = p_request_id;

  perform public._emit_step_claim_activity(
    v_mission.space_id,
    v_uid,
    'step_claim_declined',
    v_mission.id,
    r.step_id,
    coalesce(v_title, '')
  );

  return true;
end;
$$;

grant execute on function public.decline_step_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_step (creator OR space owner/admin); null = force unassign
-- ---------------------------------------------------------------------------
create or replace function public.assign_step(p_step_id uuid, p_assignee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_step public.mission_steps%rowtype;
  v_mission public.missions%rowtype;
  v_can boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_step from public.mission_steps where id = p_step_id for update;
  if not found then
    raise exception 'Step not found';
  end if;

  select * into v_mission from public.missions where id = v_step.mission_id;
  if not found then
    raise exception 'Mission not found';
  end if;

  v_can := public._is_mission_creator(v_mission.id, v_uid)
        or public._is_space_admin_or_owner(v_mission.space_id, v_uid);

  if not v_can then
    raise exception 'Only mission creator or space admin/owner can assign steps';
  end if;

  if p_assignee_id is not null
     and not public.is_space_member(v_mission.space_id, p_assignee_id) then
    raise exception 'Assignee must be a space member';
  end if;

  perform public._allow_assignee_change();

  update public.mission_steps
  set assignee_id = p_assignee_id
  where id = p_step_id;

  -- Clear pending claims when assigned/force-unassigned by admin/creator
  update public.step_claim_requests
  set status = 'cancelled', resolved_at = now()
  where step_id = p_step_id and status = 'pending';

  perform public._emit_step_claim_activity(
    v_mission.space_id,
    v_uid,
    case when p_assignee_id is null then 'step_unassigned' else 'step_assigned' end,
    v_mission.id,
    p_step_id,
    coalesce(v_step.title, '')
  );

  return true;
end;
$$;

grant execute on function public.assign_step(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unclaim_step — current assignee only
-- ---------------------------------------------------------------------------
create or replace function public.unclaim_step(p_step_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_step public.mission_steps%rowtype;
  v_mission public.missions%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_step from public.mission_steps where id = p_step_id for update;
  if not found then
    raise exception 'Step not found';
  end if;

  if v_step.assignee_id is distinct from v_uid then
    raise exception 'Only the current assignee can unclaim';
  end if;

  select * into v_mission from public.missions where id = v_step.mission_id;

  perform public._allow_assignee_change();

  update public.mission_steps
  set assignee_id = null
  where id = p_step_id;

  perform public._emit_step_claim_activity(
    v_mission.space_id,
    v_uid,
    'step_unclaimed',
    v_mission.id,
    p_step_id,
    coalesce(v_step.title, '')
  );

  return true;
end;
$$;

grant execute on function public.unclaim_step(uuid) to authenticated;
