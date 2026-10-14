-- Mirrored from MissionBoard-iOS (canonical). Already applied on shared Supabase; keep for parity.
-- W4 Schedule: shift swap / cover requests (換班／代班)
-- Source of truth migration; optional mirror to mission-board-web later.
-- Run in Supabase Dashboard → SQL Editor after 001–012.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  -- Who must approve (directed cover target, shift owner when offering, or counter-shift owner).
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (kind in ('cover', 'swap')),
  -- Required when kind = 'swap': the other shift being exchanged.
  counter_shift_id uuid references public.shifts (id) on delete cascade,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint shift_swap_counter_for_swap check (
    (kind = 'cover' and counter_shift_id is null)
    or (kind = 'swap' and counter_shift_id is not null)
  ),
  constraint shift_swap_distinct_shifts check (
    counter_shift_id is null or counter_shift_id is distinct from shift_id
  )
);

-- One pending request per primary shift
create unique index if not exists idx_shift_swap_requests_one_pending
  on public.shift_swap_requests (shift_id)
  where status = 'pending';

create index if not exists idx_shift_swap_requests_space_id
  on public.shift_swap_requests (space_id);
create index if not exists idx_shift_swap_requests_requester_id
  on public.shift_swap_requests (requester_id);
create index if not exists idx_shift_swap_requests_target_user_id
  on public.shift_swap_requests (target_user_id);
create index if not exists idx_shift_swap_requests_status
  on public.shift_swap_requests (status);

-- ---------------------------------------------------------------------------
-- RLS (reads for members; writes via security definer RPCs)
-- ---------------------------------------------------------------------------
alter table public.shift_swap_requests enable row level security;

drop policy if exists "shift_swap_requests_select" on public.shift_swap_requests;
create policy "shift_swap_requests_select"
  on public.shift_swap_requests for select
  to authenticated
  using (public.is_space_member(space_id, auth.uid()));

drop policy if exists "shift_swap_requests_insert" on public.shift_swap_requests;
drop policy if exists "shift_swap_requests_update" on public.shift_swap_requests;
drop policy if exists "shift_swap_requests_delete" on public.shift_swap_requests;

grant select on public.shift_swap_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._emit_shift_swap_activity(
  p_space_id uuid,
  p_actor_id uuid,
  p_kind text,
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
      p_space_id, p_actor_id, p_kind, null, null, coalesce(p_summary, '')
    );
  exception when others then
    null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_shift_cover
-- Owner asks target to cover, OR non-owner offers to cover (target = owner).
-- ---------------------------------------------------------------------------
create or replace function public.request_shift_cover(
  p_shift_id uuid,
  p_target_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_existing uuid;
  v_other uuid;
  v_id uuid;
  v_target uuid := p_target_user_id;
  v_summary text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.status <> 'scheduled' then
    raise exception 'Shift is not scheduled';
  end if;
  if not public.is_space_member(v_shift.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if not public.is_space_member(v_shift.space_id, v_target) then
    raise exception 'Target must be a space member';
  end if;
  if v_target = v_uid then
    raise exception 'Cannot target yourself';
  end if;

  -- Owner asks someone else to cover, or non-owner offers (target must be current assignee).
  if v_shift.user_id = v_uid then
    null; -- ask cover
  elsif v_target = v_shift.user_id then
    null; -- offer cover to owner
  else
    raise exception 'Only the assignee can ask for cover, or you may offer to the assignee';
  end if;

  select id into v_existing
  from public.shift_swap_requests
  where shift_id = p_shift_id
    and requester_id = v_uid
    and status = 'pending'
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_other
  from public.shift_swap_requests
  where shift_id = p_shift_id and status = 'pending'
  limit 1;
  if v_other is not null then
    raise exception 'Another swap/cover request is already pending for this shift';
  end if;

  insert into public.shift_swap_requests (
    space_id, shift_id, requester_id, target_user_id, kind, note, status
  ) values (
    v_shift.space_id, p_shift_id, v_uid, v_target, 'cover',
    nullif(trim(coalesce(p_note, '')), ''), 'pending'
  )
  returning id into v_id;

  v_summary := coalesce(v_shift.title, 'shift');
  perform public._emit_shift_swap_activity(
    v_shift.space_id, v_uid, 'shift_cover_requested', v_summary
  );

  return v_id;
end;
$$;

grant execute on function public.request_shift_cover(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- request_shift_swap — exchange assignees of two shifts
-- ---------------------------------------------------------------------------
create or replace function public.request_shift_swap(
  p_shift_id uuid,
  p_counter_shift_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_counter public.shifts%rowtype;
  v_existing uuid;
  v_other uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_shift_id = p_counter_shift_id then
    raise exception 'Shifts must be distinct';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  select * into v_counter from public.shifts where id = p_counter_shift_id for update;
  if not found then
    raise exception 'Counter shift not found';
  end if;

  if v_shift.status <> 'scheduled' or v_counter.status <> 'scheduled' then
    raise exception 'Both shifts must be scheduled';
  end if;
  if v_shift.space_id is distinct from v_counter.space_id then
    raise exception 'Shifts must be in the same space';
  end if;
  if not public.is_space_member(v_shift.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if v_shift.user_id is distinct from v_uid then
    raise exception 'Only the shift assignee can request a swap';
  end if;
  if v_counter.user_id = v_uid then
    raise exception 'Cannot swap with your own shift';
  end if;

  select id into v_existing
  from public.shift_swap_requests
  where shift_id = p_shift_id
    and requester_id = v_uid
    and status = 'pending'
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_other
  from public.shift_swap_requests
  where (shift_id = p_shift_id or shift_id = p_counter_shift_id
         or counter_shift_id = p_shift_id or counter_shift_id = p_counter_shift_id)
    and status = 'pending'
  limit 1;
  if v_other is not null then
    raise exception 'A pending swap already involves one of these shifts';
  end if;

  insert into public.shift_swap_requests (
    space_id, shift_id, requester_id, target_user_id, kind, counter_shift_id, note, status
  ) values (
    v_shift.space_id, p_shift_id, v_uid, v_counter.user_id, 'swap', p_counter_shift_id,
    nullif(trim(coalesce(p_note, '')), ''), 'pending'
  )
  returning id into v_id;

  perform public._emit_shift_swap_activity(
    v_shift.space_id, v_uid, 'shift_swap_requested', coalesce(v_shift.title, 'shift')
  );

  return v_id;
end;
$$;

grant execute on function public.request_shift_swap(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_shift_swap_request
-- ---------------------------------------------------------------------------
create or replace function public.cancel_shift_swap_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.shift_swap_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.shift_swap_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.requester_id is distinct from v_uid then
    raise exception 'Only the requester can cancel';
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  update public.shift_swap_requests
  set status = 'cancelled', resolved_at = now()
  where id = p_request_id;

  return true;
end;
$$;

grant execute on function public.cancel_shift_swap_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_shift_swap — target user OR space admin/owner
-- ---------------------------------------------------------------------------
create or replace function public.accept_shift_swap(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.shift_swap_requests%rowtype;
  v_shift public.shifts%rowtype;
  v_counter public.shifts%rowtype;
  v_can boolean;
  v_new_assignee uuid;
  v_tmp uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.shift_swap_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  v_can := (r.target_user_id = v_uid)
        or public._is_space_admin_or_owner(r.space_id, v_uid);
  if not v_can then
    raise exception 'Only the target member or a space admin/owner can accept';
  end if;

  select * into v_shift from public.shifts where id = r.shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.status <> 'scheduled' then
    raise exception 'Shift is not scheduled';
  end if;

  if r.kind = 'cover' then
    -- If requester owns the shift → give to target; if requester offered → give to requester.
    if v_shift.user_id = r.requester_id then
      v_new_assignee := r.target_user_id;
    else
      v_new_assignee := r.requester_id;
    end if;

    update public.shifts
    set user_id = v_new_assignee, source = 'swap', updated_at = now()
    where id = r.shift_id;
  else
    -- swap
    select * into v_counter from public.shifts where id = r.counter_shift_id for update;
    if not found then
      raise exception 'Counter shift not found';
    end if;
    if v_counter.status <> 'scheduled' then
      raise exception 'Counter shift is not scheduled';
    end if;

    v_tmp := v_shift.user_id;
    update public.shifts
    set user_id = v_counter.user_id, source = 'swap', updated_at = now()
    where id = v_shift.id;
    update public.shifts
    set user_id = v_tmp, source = 'swap', updated_at = now()
    where id = v_counter.id;
  end if;

  update public.shift_swap_requests
  set status = 'accepted', resolved_at = now()
  where id = p_request_id;

  -- Decline other pendings touching these shifts
  update public.shift_swap_requests
  set status = 'declined', resolved_at = now()
  where status = 'pending'
    and id is distinct from p_request_id
    and (
      shift_id = r.shift_id
      or counter_shift_id = r.shift_id
      or (r.counter_shift_id is not null and (
            shift_id = r.counter_shift_id or counter_shift_id = r.counter_shift_id
          ))
    );

  perform public._emit_shift_swap_activity(
    r.space_id, v_uid,
    case when r.kind = 'cover' then 'shift_cover_accepted' else 'shift_swap_accepted' end,
    coalesce(v_shift.title, 'shift')
  );

  return true;
end;
$$;

grant execute on function public.accept_shift_swap(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_shift_swap
-- ---------------------------------------------------------------------------
create or replace function public.decline_shift_swap(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.shift_swap_requests%rowtype;
  v_can boolean;
  v_title text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.shift_swap_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.status <> 'pending' then
    return false;
  end if;

  v_can := (r.target_user_id = v_uid)
        or public._is_space_admin_or_owner(r.space_id, v_uid);
  if not v_can then
    raise exception 'Only the target member or a space admin/owner can decline';
  end if;

  select title into v_title from public.shifts where id = r.shift_id;

  update public.shift_swap_requests
  set status = 'declined', resolved_at = now()
  where id = p_request_id;

  perform public._emit_shift_swap_activity(
    r.space_id, v_uid,
    case when r.kind = 'cover' then 'shift_cover_declined' else 'shift_swap_declined' end,
    coalesce(v_title, 'shift')
  );

  return true;
end;
$$;

grant execute on function public.decline_shift_swap(uuid) to authenticated;
