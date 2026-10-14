-- Follow-up for 009: clear client-generated orphan template references before adding the FK.
-- Safe to rerun after 009 has already been applied.

update public.shifts
set template_id = null
where template_id is not null
  and not exists (
    select 1
    from public.shift_templates t
    where t.id = shifts.template_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class tbl on tbl.oid = c.conrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    where c.conname = 'shifts_template_id_fkey'
      and ns.nspname = 'public'
      and tbl.relname = 'shifts'
  ) then
    alter table public.shifts
      add constraint shifts_template_id_fkey
      foreign key (template_id) references public.shift_templates (id) on delete set null;
  end if;
end $$;
