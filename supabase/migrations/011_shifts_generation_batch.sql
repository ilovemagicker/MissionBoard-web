-- W2 / SCH-M3: generation batch id for undo + allow admin to insert shifts for other members.
-- Mirrored from MissionBoard-iOS; admin insert for other members + generation_batch_id (batch UI still later).

alter table public.shifts
  add column if not exists generation_batch_id uuid;

create index if not exists idx_shifts_generation_batch_id
  on public.shifts (generation_batch_id)
  where generation_batch_id is not null;

-- Admins/owners may create shifts for any space member (rotation generate).
-- Existing "shifts_insert_own" remains; policies OR together.
drop policy if exists "shifts_insert_admin" on public.shifts;
create policy "shifts_insert_admin"
  on public.shifts for insert
  to authenticated
  with check (
    public.is_space_member(space_id, auth.uid())
    and public.is_space_admin(space_id, auth.uid())
    and public.is_space_member(space_id, user_id)
  );
