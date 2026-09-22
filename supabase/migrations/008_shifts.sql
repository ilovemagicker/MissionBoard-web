-- W1 Schedule / Shifts (排班)
-- Source of truth migration; mirror to mission-board-web/supabase/migrations/008_shifts.sql

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  title text,
  note text,
  color text not null default '#3B82F6',
  text_color text not null default '#FFFFFF',
  template_id uuid,
  source text not null default 'manual'
    check (source in ('manual', 'generated', 'swap')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_end_after_start check (end_at > start_at)
);

create index if not exists idx_shifts_space_id on public.shifts (space_id);
create index if not exists idx_shifts_user_id on public.shifts (user_id);
create index if not exists idx_shifts_space_start on public.shifts (space_id, start_at);
create index if not exists idx_shifts_status on public.shifts (status);

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

alter table public.shifts enable row level security;

-- Members can read all shifts in their spaces (non-members see nothing via RLS).
drop policy if exists "shifts_select_member" on public.shifts;
create policy "shifts_select_member"
  on public.shifts for select
  to authenticated
  using (public.is_space_member(space_id, auth.uid()));

-- Any member can create a shift for themselves.
drop policy if exists "shifts_insert_own" on public.shifts;
create policy "shifts_insert_own"
  on public.shifts for insert
  to authenticated
  with check (
    public.is_space_member(space_id, auth.uid())
    and user_id = auth.uid()
  );

-- Owner may edit own; space admin/owner may edit any in space.
drop policy if exists "shifts_update_own_or_admin" on public.shifts;
create policy "shifts_update_own_or_admin"
  on public.shifts for update
  to authenticated
  using (
    public.is_space_member(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_member(space_id, auth.uid())
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
    public.is_space_member(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

grant select, insert, update, delete on public.shifts to authenticated;
