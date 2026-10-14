-- Mirrored from MissionBoard-iOS (canonical). Already applied on shared Supabase; keep for parity.
-- W5 Schedule wrap-up: family read-only share (viewer role + share codes) + RLS hardening.
-- Web schedule export (ICS / PNG) is client-side and does not use schedule_share_codes.

-- ---------------------------------------------------------------------------
-- Extend space_members.role with viewer (family read-only)
-- ---------------------------------------------------------------------------
alter table public.space_members
  drop constraint if exists space_members_role_check;

alter table public.space_members
  add constraint space_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));

-- Editors = owner / admin / member (not viewer). Used for schedule write gates.
create or replace function public.is_space_editor(p_space_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = p_user_id
      and sm.role in ('owner', 'admin', 'member')
  );
$$;

grant execute on function public.is_space_editor(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- schedule_share_codes — family invite codes that join as role=viewer
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_share_codes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  code text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint schedule_share_codes_code_nonempty check (length(trim(code)) >= 6)
);

create unique index if not exists idx_schedule_share_codes_code_upper
  on public.schedule_share_codes (upper(trim(code)));

-- At most one active (non-revoked) code per space
create unique index if not exists idx_schedule_share_codes_one_active
  on public.schedule_share_codes (space_id)
  where revoked_at is null;

create index if not exists idx_schedule_share_codes_space_id
  on public.schedule_share_codes (space_id);

alter table public.schedule_share_codes enable row level security;

drop policy if exists "schedule_share_codes_select_member" on public.schedule_share_codes;
create policy "schedule_share_codes_select_member"
  on public.schedule_share_codes for select
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and revoked_at is null
  );

-- Mutations go through security definer RPCs only
drop policy if exists "schedule_share_codes_insert" on public.schedule_share_codes;
drop policy if exists "schedule_share_codes_update" on public.schedule_share_codes;
drop policy if exists "schedule_share_codes_delete" on public.schedule_share_codes;

grant select on public.schedule_share_codes to authenticated;

-- ---------------------------------------------------------------------------
-- Harden schedule write policies: require editor (exclude viewer)
-- ---------------------------------------------------------------------------

-- shifts
drop policy if exists "shifts_insert_own" on public.shifts;
create policy "shifts_insert_own"
  on public.shifts for insert
  to authenticated
  with check (
    public.is_space_editor(space_id, auth.uid())
    and user_id = auth.uid()
  );

drop policy if exists "shifts_insert_admin" on public.shifts;
create policy "shifts_insert_admin"
  on public.shifts for insert
  to authenticated
  with check (
    public.is_space_editor(space_id, auth.uid())
    and public.is_space_admin(space_id, auth.uid())
    and public.is_space_editor(space_id, user_id)
  );

drop policy if exists "shifts_update_own_or_admin" on public.shifts;
create policy "shifts_update_own_or_admin"
  on public.shifts for update
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

drop policy if exists "shifts_delete_own_or_admin" on public.shifts;
create policy "shifts_delete_own_or_admin"
  on public.shifts for delete
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

-- shift_templates (009)
drop policy if exists "shift_templates_insert_member" on public.shift_templates;
create policy "shift_templates_insert_member"
  on public.shift_templates for insert
  to authenticated
  with check (
    public.is_space_editor(space_id, auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists "shift_templates_update_own_or_admin" on public.shift_templates;
create policy "shift_templates_update_own_or_admin"
  on public.shift_templates for update
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_editor(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

drop policy if exists "shift_templates_delete_own_or_admin" on public.shift_templates;
create policy "shift_templates_delete_own_or_admin"
  on public.shift_templates for delete
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

-- leave_entries (012)
drop policy if exists "leave_entries_insert_own" on public.leave_entries;
create policy "leave_entries_insert_own"
  on public.leave_entries for insert
  to authenticated
  with check (
    public.is_space_editor(space_id, auth.uid())
    and user_id = auth.uid()
  );

drop policy if exists "leave_entries_update_own_or_admin" on public.leave_entries;
create policy "leave_entries_update_own_or_admin"
  on public.leave_entries for update
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

drop policy if exists "leave_entries_delete_own_or_admin" on public.leave_entries;
create policy "leave_entries_delete_own_or_admin"
  on public.leave_entries for delete
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers: generate family share code (MB-FAM-XXXX)
-- ---------------------------------------------------------------------------
create or replace function public._generate_schedule_share_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  chunk text := '';
  i int;
begin
  for i in 1..4 loop
    chunk := chunk || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'MB-FAM-' || chunk;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_schedule_share_code — admin creates or returns active code
-- ---------------------------------------------------------------------------
create or replace function public.ensure_schedule_share_code(p_space_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_attempt int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_space_admin(p_space_id, v_uid) then
    raise exception 'Only admins can manage schedule share codes';
  end if;

  select code into v_code
  from public.schedule_share_codes
  where space_id = p_space_id and revoked_at is null
  limit 1;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public._generate_schedule_share_code();
    begin
      insert into public.schedule_share_codes (space_id, code, created_by)
      values (p_space_id, v_code, v_uid);
      return v_code;
    exception when unique_violation then
      if v_attempt >= 8 then
        raise exception 'Could not allocate a unique schedule share code';
      end if;
    end;
  end loop;
end;
$$;

grant execute on function public.ensure_schedule_share_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rotate_schedule_share_code — revoke active + issue new
-- ---------------------------------------------------------------------------
create or replace function public.rotate_schedule_share_code(p_space_id uuid)
returns text
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
  if not public.is_space_admin(p_space_id, v_uid) then
    raise exception 'Only admins can manage schedule share codes';
  end if;

  update public.schedule_share_codes
  set revoked_at = now()
  where space_id = p_space_id and revoked_at is null;

  return public.ensure_schedule_share_code(p_space_id);
end;
$$;

grant execute on function public.rotate_schedule_share_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- lookup_schedule_share_code — limited preview for redeem UI
-- ---------------------------------------------------------------------------
create or replace function public.lookup_schedule_share_code(p_code text)
returns table (
  space_id uuid,
  space_name text,
  code text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, c.code
  from public.schedule_share_codes c
  join public.spaces s on s.id = c.space_id
  where c.revoked_at is null
    and upper(trim(c.code)) = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.lookup_schedule_share_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- join_as_schedule_viewer — redeem family code → role=viewer (direct join)
-- ---------------------------------------------------------------------------
create or replace function public.join_as_schedule_viewer(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space_id uuid;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select c.space_id into v_space_id
  from public.schedule_share_codes c
  where c.revoked_at is null
    and upper(trim(c.code)) = upper(trim(p_code))
  limit 1;

  if v_space_id is null then
    raise exception 'Schedule share code not found';
  end if;

  select role into v_existing
  from public.space_members
  where space_id = v_space_id and user_id = v_uid;

  if v_existing is not null then
    -- Already a member (any role): keep existing role; do not demote.
    return v_space_id;
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_space_id, v_uid, 'viewer');

  return v_space_id;
end;
$$;

grant execute on function public.join_as_schedule_viewer(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Block viewers from shift-swap mutations (RPCs are security definer)
-- ---------------------------------------------------------------------------
create or replace function public._shift_swap_reject_viewer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_space_editor(new.space_id, auth.uid()) then
      raise exception 'Viewers cannot create shift swap or cover requests';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    -- Accept / decline / cancel resolve rows; viewers must not finalize.
    if new.status is distinct from old.status
       and not public.is_space_editor(old.space_id, auth.uid()) then
      raise exception 'Viewers cannot resolve shift swap or cover requests';
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists shift_swap_reject_viewer on public.shift_swap_requests;
create trigger shift_swap_reject_viewer
  before insert or update on public.shift_swap_requests
  for each row execute function public._shift_swap_reject_viewer();

-- Tighten request_* actor checks when those RPCs exist (idempotent replace of guard).
-- request_shift_cover / request_shift_swap still call is_space_member; the trigger above
-- is the hard stop for viewers. App UI also hides mutating actions for viewer role.
