-- Shift templates (班次模板) — space-scoped shared presets for quick apply on schedule.
-- Source of truth migration; mirror to mission-board-web/supabase/migrations/009_shift_templates.sql

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- Minutes from midnight [0, 1439]. If end < start, applied end falls on the next calendar day.
  default_start_minutes int not null
    check (default_start_minutes >= 0 and default_start_minutes < 1440),
  default_end_minutes int not null
    check (default_end_minutes >= 0 and default_end_minutes < 1440),
  color text not null default '#3B82F6',
  text_color text not null default '#FFFFFF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_name_not_blank check (char_length(trim(name)) > 0)
);

create index if not exists idx_shift_templates_space_id on public.shift_templates (space_id);
create index if not exists idx_shift_templates_created_by on public.shift_templates (created_by);

drop trigger if exists shift_templates_set_updated_at on public.shift_templates;
create trigger shift_templates_set_updated_at
  before update on public.shift_templates
  for each row execute function public.set_updated_at();

alter table public.shift_templates enable row level security;

-- Space members can read all templates in the space (shared presets).
drop policy if exists "shift_templates_select_member" on public.shift_templates;
create policy "shift_templates_select_member"
  on public.shift_templates for select
  to authenticated
  using (public.is_space_member(space_id, auth.uid()));

-- Any member can create a template in the space (must set created_by = self).
drop policy if exists "shift_templates_insert_member" on public.shift_templates;
create policy "shift_templates_insert_member"
  on public.shift_templates for insert
  to authenticated
  with check (
    public.is_space_member(space_id, auth.uid())
    and created_by = auth.uid()
  );

-- Creator or space admin/owner may update.
drop policy if exists "shift_templates_update_own_or_admin" on public.shift_templates;
create policy "shift_templates_update_own_or_admin"
  on public.shift_templates for update
  to authenticated
  using (
    public.is_space_member(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_member(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

-- Creator or space admin/owner may delete.
drop policy if exists "shift_templates_delete_own_or_admin" on public.shift_templates;
create policy "shift_templates_delete_own_or_admin"
  on public.shift_templates for delete
  to authenticated
  using (
    public.is_space_member(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

grant select, insert, update, delete on public.shift_templates to authenticated;

-- Optional: link shifts.template_id → shift_templates (set null on delete).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_template_id_fkey'
  ) then
    alter table public.shifts
      add constraint shifts_template_id_fkey
      foreign key (template_id) references public.shift_templates (id) on delete set null;
  end if;
end $$;
