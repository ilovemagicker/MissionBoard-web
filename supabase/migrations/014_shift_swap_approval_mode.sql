-- Mirrored from MissionBoard-iOS (canonical). Already applied on shared Supabase; keep for parity.
-- Shift swap / cover approval mode per space (W4 follow-up)
-- Modes:
--   admin_required (default): only space admin/owner can accept → assignee changes
--   peer_accept: target member accept takes effect; admin may still accept/decline
-- Run in Supabase Dashboard → SQL Editor after 001–013.

-- ---------------------------------------------------------------------------
-- Column on spaces
-- ---------------------------------------------------------------------------
alter table public.spaces
  add column if not exists shift_swap_approval_mode text not null default 'admin_required'
    check (shift_swap_approval_mode in ('admin_required', 'peer_accept'));

comment on column public.spaces.shift_swap_approval_mode is
  'Who can accept shift swap/cover: admin_required | peer_accept';

-- ---------------------------------------------------------------------------
-- Guard: only admin/owner may change the mode (spaces UPDATE RLS is member-wide)
-- ---------------------------------------------------------------------------
create or replace function public._guard_shift_swap_approval_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.shift_swap_approval_mode is distinct from new.shift_swap_approval_mode then
    if auth.uid() is null
       or not public._is_space_admin_or_owner(new.id, auth.uid()) then
      raise exception 'Only a space admin/owner can change shift_swap_approval_mode';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_shift_swap_approval_mode on public.spaces;
create trigger trg_guard_shift_swap_approval_mode
  before update of shift_swap_approval_mode on public.spaces
  for each row
  execute function public._guard_shift_swap_approval_mode();

-- ---------------------------------------------------------------------------
-- set_shift_swap_approval_mode — admin/owner RPC
-- ---------------------------------------------------------------------------
create or replace function public.set_shift_swap_approval_mode(
  p_space_id uuid,
  p_mode text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_mode is distinct from 'admin_required'
     and p_mode is distinct from 'peer_accept' then
    raise exception 'Invalid shift_swap_approval_mode';
  end if;
  if not public._is_space_admin_or_owner(p_space_id, v_uid) then
    raise exception 'Only a space admin/owner can change shift swap approval mode';
  end if;
  if not exists (select 1 from public.spaces where id = p_space_id) then
    return false;
  end if;

  update public.spaces
  set shift_swap_approval_mode = p_mode
  where id = p_space_id;

  return true;
end;
$$;

grant execute on function public.set_shift_swap_approval_mode(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_shift_swap — respect space mode
-- admin_required: only admin/owner
-- peer_accept: target OR admin/owner (unchanged from 013 for peer path)
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
  v_mode text;
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

  select coalesce(shift_swap_approval_mode, 'admin_required')
    into v_mode
  from public.spaces
  where id = r.space_id;
  if v_mode is null then
    v_mode := 'admin_required';
  end if;

  if v_mode = 'peer_accept' then
    v_can := (r.target_user_id = v_uid)
          or public._is_space_admin_or_owner(r.space_id, v_uid);
    if not v_can then
      raise exception 'Only the target member or a space admin/owner can accept';
    end if;
  else
    -- admin_required (default): only admin/owner finalizes
    if not public._is_space_admin_or_owner(r.space_id, v_uid) then
      raise exception 'Only a space admin/owner can accept when admin approval is required';
    end if;
  end if;

  select * into v_shift from public.shifts where id = r.shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.status <> 'scheduled' then
    raise exception 'Shift is not scheduled';
  end if;

  if r.kind = 'cover' then
    if v_shift.user_id = r.requester_id then
      v_new_assignee := r.target_user_id;
    else
      v_new_assignee := r.requester_id;
    end if;

    update public.shifts
    set user_id = v_new_assignee, source = 'swap', updated_at = now()
    where id = r.shift_id;
  else
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

-- decline stays: target OR admin (peer can refuse; admin can intervene)
