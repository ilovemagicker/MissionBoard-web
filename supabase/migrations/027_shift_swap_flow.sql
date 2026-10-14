-- Mirrored from MissionBoard-iOS (canonical). Already applied on shared Supabase; keep for parity.
-- 027 — Shift swap / cover (換班／代班) flow fixes.
-- Run in Supabase Dashboard → SQL Editor after 001–026. Safe to re-run (idempotent).
--
-- What this fixes / adds
--   1. Counterpart consent in admin_required mode: the target member first 「同意」
--      (target_accepted_at is set, request stays pending), then a space admin/owner
--      「核准」 to apply the change. Before, an admin could reassign a shift onto someone
--      who never agreed, and the target could only decline.
--      peer_accept mode is unchanged (target accept applies immediately).
--   2. Stale-request guard: accept now refuses when the shift(s) were reassigned after the
--      request was created (previously a cover could silently move a third person's shift).
--   3. Viewers (family read-only) can no longer create cover/swap requests or be targets.
--   4. Push fan-out (via private.dispatch_notify_event → Edge Function notify-event):
--        • new request            → target          (event shift_swap_pending, unchanged)
--        • target agreed (admin)  → admins/owners   (event shift_swap_approval_needed)
--        • accepted / declined    → requester (+ target when someone else resolved it)
--                                                   (event shift_swap_resolved)
--        • cancelled              → target          (event shift_swap_cancelled)
--      Redeploy notify-event (supabase/functions/notify-event + _shared/copy.ts) so the new
--      events get copy; without the redeploy the new events are simply ignored.
--
-- If this file is NOT applied: the iOS app detects the missing target_accepted_at column and
-- keeps the old behaviour (admin approves directly; target can only decline). In-app activity
-- alerts for requests / results still work (they are computed on device from sync diffs).

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
alter table public.shift_swap_requests
  add column if not exists target_accepted_at timestamptz;

comment on column public.shift_swap_requests.target_accepted_at is
  'admin_required mode: when the target member agreed (request still pending until an admin approves).';

-- ---------------------------------------------------------------------------
-- 2. request_shift_cover — editors only (no viewers)
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
  if not public.is_space_editor(v_shift.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if not public.is_space_editor(v_shift.space_id, v_target) then
    raise exception 'Target must be a space member';
  end if;
  if v_target = v_uid then
    raise exception 'Cannot target yourself';
  end if;

  if v_shift.user_id = v_uid then
    null; -- owner asks someone to cover
  elsif v_target = v_shift.user_id then
    null; -- non-owner offers to cover (target = current assignee)
  else
    raise exception 'Only the assignee can ask for cover, or you may offer to the assignee';
  end if;

  select id into v_existing
  from public.shift_swap_requests
  where shift_id = p_shift_id and requester_id = v_uid and status = 'pending'
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_other
  from public.shift_swap_requests
  where (shift_id = p_shift_id or counter_shift_id = p_shift_id) and status = 'pending'
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

  perform public._emit_shift_swap_activity(
    v_shift.space_id, v_uid, 'shift_cover_requested', coalesce(v_shift.title, 'shift')
  );
  return v_id;
end;
$$;

grant execute on function public.request_shift_cover(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. request_shift_swap — editors only (counter owner must be an editor too)
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
  if not public.is_space_editor(v_shift.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if not public.is_space_editor(v_shift.space_id, v_counter.user_id) then
    raise exception 'Target must be a space member';
  end if;
  if v_shift.user_id is distinct from v_uid then
    raise exception 'Only the shift assignee can request a swap';
  end if;
  if v_counter.user_id = v_uid then
    raise exception 'Cannot swap with your own shift';
  end if;

  select id into v_existing
  from public.shift_swap_requests
  where shift_id = p_shift_id and requester_id = v_uid and status = 'pending'
    and counter_shift_id = p_counter_shift_id
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_other
  from public.shift_swap_requests
  where (shift_id in (p_shift_id, p_counter_shift_id)
         or counter_shift_id in (p_shift_id, p_counter_shift_id))
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
-- 4. accept_shift_swap — consent stage + stale guard
--   admin_required: target (non-admin) → records consent; admin/owner → applies, but only
--                   after the target agreed (or when the admin is the target).
--   peer_accept:    target or admin/owner → applies.
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
  v_is_admin boolean;
  v_is_target boolean;
  v_new_assignee uuid;
  v_tmp uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.shift_swap_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'Request is no longer pending';
  end if;

  select coalesce(shift_swap_approval_mode, 'admin_required') into v_mode
  from public.spaces where id = r.space_id;
  v_mode := coalesce(v_mode, 'admin_required');
  v_is_admin := public._is_space_admin_or_owner(r.space_id, v_uid);
  v_is_target := (r.target_user_id = v_uid);

  if not v_is_admin and not v_is_target then
    raise exception 'Only the target member or a space admin/owner can accept';
  end if;

  -- Stage 1 (admin_required): the target agrees; an admin applies it later.
  if v_mode = 'admin_required' and v_is_target and not v_is_admin then
    if r.target_accepted_at is null then
      update public.shift_swap_requests
      set target_accepted_at = now()
      where id = p_request_id;
      perform public._emit_shift_swap_activity(
        r.space_id, v_uid, 'shift_swap_target_accepted',
        coalesce((select title from public.shifts where id = r.shift_id), 'shift')
      );
    end if;
    return true;
  end if;

  if v_mode = 'admin_required' and not v_is_target and r.target_accepted_at is null then
    raise exception 'Waiting for the other member to agree';
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
      v_new_assignee := r.target_user_id;      -- owner asked target to cover
    elsif v_shift.user_id = r.target_user_id then
      v_new_assignee := r.requester_id;        -- requester offered to cover
    else
      raise exception 'Shift assignment changed; request is stale';
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
    if v_shift.user_id is distinct from r.requester_id
       or v_counter.user_id is distinct from r.target_user_id then
      raise exception 'Shift assignment changed; request is stale';
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
  set status = 'accepted',
      resolved_at = now(),
      target_accepted_at = coalesce(target_accepted_at, case when v_is_target then now() end)
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

-- ---------------------------------------------------------------------------
-- 5. Push fan-out trigger (replaces 021 version; same trigger names)
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_shift_swap_requests()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_space_name text;
  v_shift_title text;
  v_event text;
  v_resolved text;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      return new;
    end if;
    v_event := 'shift_swap_pending';
  elsif tg_op = 'UPDATE' then
    if new.status = 'pending'
       and old.target_accepted_at is null and new.target_accepted_at is not null then
      v_event := 'shift_swap_approval_needed';
    elsif old.status = 'pending' and new.status in ('accepted', 'declined') then
      v_event := 'shift_swap_resolved';
      v_resolved := new.status;
    elsif old.status = 'pending' and new.status = 'cancelled' then
      v_event := 'shift_swap_cancelled';
    elsif new.status = 'pending' and old.status is distinct from 'pending' then
      v_event := 'shift_swap_pending';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select name into v_space_name from public.spaces where id = new.space_id;
  select coalesce(title, '') into v_shift_title from public.shifts where id = new.shift_id;

  -- 021 (push pipeline) not applied → skip push, never fail the write.
  if to_regprocedure('private.dispatch_notify_event(jsonb)') is null then
    return new;
  end if;

  perform private.dispatch_notify_event(jsonb_build_object(
    'event', v_event,
    'actor_id', coalesce(auth.uid(), new.requester_id),
    'space_id', new.space_id,
    'shift_id', new.shift_id,
    'target_user_id', new.target_user_id,
    'requester_id', new.requester_id,
    'space_name', coalesce(v_space_name, ''),
    'shift_title', coalesce(v_shift_title, ''),
    'kind', new.kind,
    'resolved', v_resolved
  ));
  return new;
end;
$$;

drop trigger if exists push_shift_swap_requests_ins on public.shift_swap_requests;
create trigger push_shift_swap_requests_ins
  after insert on public.shift_swap_requests
  for each row execute function public.trg_push_shift_swap_requests();

drop trigger if exists push_shift_swap_requests_upd on public.shift_swap_requests;
create trigger push_shift_swap_requests_upd
  after update of status, target_accepted_at on public.shift_swap_requests
  for each row execute function public.trg_push_shift_swap_requests();

-- Verify (optional):
--   select column_name from information_schema.columns
--   where table_name = 'shift_swap_requests' and column_name = 'target_accepted_at';
