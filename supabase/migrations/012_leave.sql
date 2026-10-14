-- Mirrored from MissionBoard-iOS (canonical). Already applied on shared Supabase; keep for parity.
-- W3 Schedule: leave tracking (休假)
-- Source of truth migration; optional mirror to mission-board-web later.

create table if not exists public.leave_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  -- Fraction of each calendar day in [start_date, end_date] (0.25-day steps).
  day_fraction numeric(3,2) not null default 1.00
    check (day_fraction in (0.25, 0.50, 0.75, 1.00)),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_entries_end_on_or_after_start check (end_date >= start_date)
);

create index if not exists idx_leave_entries_space_id on public.leave_entries (space_id);
create index if not exists idx_leave_entries_user_id on public.leave_entries (user_id);
create index if not exists idx_leave_entries_space_start on public.leave_entries (space_id, start_date);
create index if not exists idx_leave_entries_space_range on public.leave_entries (space_id, start_date, end_date);

drop trigger if exists leave_entries_set_updated_at on public.leave_entries;
create trigger leave_entries_set_updated_at
  before update on public.leave_entries
  for each row execute function public.set_updated_at();

alter table public.leave_entries enable row level security;

drop policy if exists "leave_entries_select_member" on public.leave_entries;
create policy "leave_entries_select_member"
  on public.leave_entries for select
  to authenticated
  using (public.is_space_member(space_id, auth.uid()));

drop policy if exists "leave_entries_insert_own" on public.leave_entries;
create policy "leave_entries_insert_own"
  on public.leave_entries for insert
  to authenticated
  with check (
    public.is_space_member(space_id, auth.uid())
    and user_id = auth.uid()
  );

drop policy if exists "leave_entries_update_own_or_admin" on public.leave_entries;
create policy "leave_entries_update_own_or_admin"
  on public.leave_entries for update
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

drop policy if exists "leave_entries_delete_own_or_admin" on public.leave_entries;
create policy "leave_entries_delete_own_or_admin"
  on public.leave_entries for delete
  to authenticated
  using (
    public.is_space_member(space_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

grant select, insert, update, delete on public.leave_entries to authenticated;
