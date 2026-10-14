-- 028 — Per-member shift templates (每人各自的班型).
-- Run in Supabase Dashboard → SQL Editor after 001–027. Safe to re-run (idempotent).
--
-- Model
--   shift_templates.owner_user_id (nullable)
--     • NULL      = 共用 / shared template (every member sees it in their list; legacy rows)
--     • <user id> = that member's personal template
--   created_by keeps meaning "who created the row" (an admin can create a template for a member).
--
-- Existing rows: deliberately left as shared (owner_user_id = NULL). This is the safest option —
-- nothing is duplicated, renamed or hidden, existing shifts keep their template_id links, and
-- every member still sees the same presets as before. Members then add personal templates;
-- admins/owners can still edit or delete the shared ones.
--
-- RLS
--   select : any space member (unchanged — needed for roster colours and the admin member switcher)
--   insert : schedule editors; owner must be yourself, NULL (shared), or — for admins/owners —
--            any schedule editor of the space
--   update / delete : creator, owner, or space admin/owner (editors only)
--
-- If this file is NOT applied: the iOS app detects the missing column and keeps the old
-- space-wide template list (the member switcher is hidden, new templates are shared).

alter table public.shift_templates
  add column if not exists owner_user_id uuid references public.profiles (id) on delete cascade;

comment on column public.shift_templates.owner_user_id is
  'Personal template owner; NULL = shared with the whole space (pre-028 rows).';

create index if not exists idx_shift_templates_space_owner
  on public.shift_templates (space_id, owner_user_id);

drop policy if exists "shift_templates_insert_member" on public.shift_templates;
create policy "shift_templates_insert_member"
  on public.shift_templates for insert
  to authenticated
  with check (
    public.is_space_editor(space_id, auth.uid())
    and created_by = auth.uid()
    and (
      owner_user_id is null
      or owner_user_id = auth.uid()
      or (
        public.is_space_admin(space_id, auth.uid())
        and public.is_space_editor(space_id, owner_user_id)
      )
    )
  );

drop policy if exists "shift_templates_update_own_or_admin" on public.shift_templates;
create policy "shift_templates_update_own_or_admin"
  on public.shift_templates for update
  to authenticated
  using (
    public.is_space_editor(space_id, auth.uid())
    and (
      created_by = auth.uid()
      or owner_user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  )
  with check (
    public.is_space_editor(space_id, auth.uid())
    and (
      owner_user_id is null
      or owner_user_id = auth.uid()
      or (
        public.is_space_admin(space_id, auth.uid())
        and public.is_space_editor(space_id, owner_user_id)
      )
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
      or owner_user_id = auth.uid()
      or public.is_space_admin(space_id, auth.uid())
    )
  );

-- Verify (optional):
--   select owner_user_id is null as shared, count(*) from public.shift_templates group by 1;
