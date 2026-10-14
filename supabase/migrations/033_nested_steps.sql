-- 033_nested_steps.sql — nested steps (子步驟), like folders/subfolders in a file manager.
--
-- * mission_steps.parent_step_id (nullable). NULL = top level, so every existing flat step stays at
--   the root. order_index keeps its meaning but is now compared among siblings (same parent).
-- * Integrity: parent must be a step of the same task, a step can't be its own ancestor (cycle
--   prevention, serialized per task with an advisory lock), max 12 levels deep (app caps at 5).
-- * RLS: existing member policies still apply; an extra RESTRICTIVE insert/update policy rejects a
--   parent from another task (defence in depth; the trigger enforces the same thing).
-- * Parent completion is derived: a step that has children is done exactly when all its children are
--   done. Enforced by a BEFORE trigger (a parent can't be checked by hand while children are open)
--   and propagated upwards by an AFTER trigger. Assignees / claims / deadlines work on every level.
-- * Task status (_recompute_mission_status) now counts leaf steps only.
-- * complete_step_part refuses parent steps; recurrence instances (031) copy the whole tree.
--
-- Idempotent. Depends on 025 (step_assignees) and 031 (instantiate_recurrence) being applied.

-- ---------------------------------------------------------------------------
-- 1. Column, constraints, index
-- ---------------------------------------------------------------------------
alter table public.mission_steps add column if not exists parent_step_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mission_steps_parent_step_id_fkey'
  ) then
    alter table public.mission_steps
      add constraint mission_steps_parent_step_id_fkey
      foreign key (parent_step_id) references public.mission_steps (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'mission_steps_parent_not_self'
  ) then
    alter table public.mission_steps
      add constraint mission_steps_parent_not_self
      check (parent_step_id is null or parent_step_id <> id);
  end if;
end $$;

create index if not exists idx_mission_steps_parent
  on public.mission_steps (parent_step_id, order_index)
  where parent_step_id is not null;

-- ---------------------------------------------------------------------------
-- 2. RLS helper + restrictive policies (parent must belong to the same task)
-- ---------------------------------------------------------------------------
create or replace function public._step_parent_in_mission(p_parent uuid, p_mission uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_parent is null
      or exists (
        select 1 from public.mission_steps p
        where p.id = p_parent and p.mission_id = p_mission
      );
$$;

revoke all on function public._step_parent_in_mission(uuid, uuid) from public, anon;
grant execute on function public._step_parent_in_mission(uuid, uuid) to authenticated;

drop policy if exists "mission_steps_parent_same_mission_ins" on public.mission_steps;
create policy "mission_steps_parent_same_mission_ins"
  on public.mission_steps
  as restrictive
  for insert
  to authenticated
  with check (public._step_parent_in_mission(parent_step_id, mission_id));

drop policy if exists "mission_steps_parent_same_mission_upd" on public.mission_steps;
create policy "mission_steps_parent_same_mission_upd"
  on public.mission_steps
  as restrictive
  for update
  to authenticated
  using (true)
  with check (public._step_parent_in_mission(parent_step_id, mission_id));

-- ---------------------------------------------------------------------------
-- 3. BEFORE trigger: same-task parent, cycle prevention, depth cap, derived parent completion
-- ---------------------------------------------------------------------------
create or replace function public.trg_mission_steps_tree_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_mission uuid;
  v_cursor uuid;
  v_depth int := 0;
  v_total int;
  v_done int;
begin
  if new.parent_step_id is not null
     and (tg_op = 'INSERT'
          or new.parent_step_id is distinct from old.parent_step_id
          or new.mission_id is distinct from old.mission_id) then
    if new.parent_step_id = new.id then
      raise exception 'A step cannot be its own parent';
    end if;

    -- Serialize tree edits per task so two concurrent moves can't build a cycle together.
    perform pg_advisory_xact_lock(hashtext('mission_steps_tree:' || new.mission_id::text));

    select mission_id into v_parent_mission
    from public.mission_steps where id = new.parent_step_id;
    if not found then
      raise exception 'Parent step not found';
    end if;
    if v_parent_mission <> new.mission_id then
      raise exception 'Parent step must belong to the same task';
    end if;

    v_cursor := new.parent_step_id;
    while v_cursor is not null loop
      v_depth := v_depth + 1;
      if v_cursor = new.id then
        raise exception 'Cannot move a step into its own sub-step (cycle)';
      end if;
      if v_depth >= 12 then
        raise exception 'Steps can be nested at most 12 levels deep';
      end if;
      select parent_step_id into v_cursor from public.mission_steps where id = v_cursor;
    end loop;
  end if;

  -- A step with children is done exactly when every child is done.
  if tg_op = 'UPDATE' then
    select count(*), count(*) filter (where is_done)
      into v_total, v_done
    from public.mission_steps
    where parent_step_id = new.id;

    if v_total > 0 then
      new.is_done := (v_done = v_total);
      if new.is_done then
        new.completed_at := coalesce(new.completed_at, old.completed_at, now());
      else
        new.completed_at := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists mission_steps_tree_guard on public.mission_steps;
create trigger mission_steps_tree_guard
  before insert or update on public.mission_steps
  for each row execute function public.trg_mission_steps_tree_guard();

-- ---------------------------------------------------------------------------
-- 4. AFTER trigger: propagate completion to the parent (recurses up via the parent's own update)
-- ---------------------------------------------------------------------------
create or replace function private.recompute_step_parent(p_parent uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_total int;
  v_done int;
  v_all boolean;
  v_rows int;
begin
  if p_parent is null then
    return false;
  end if;
  select count(*), count(*) filter (where is_done)
    into v_total, v_done
  from public.mission_steps
  where parent_step_id = p_parent;

  if v_total = 0 then
    -- Parent lost its last child: it is a normal step again and keeps its own state.
    return false;
  end if;

  v_all := (v_done = v_total);
  update public.mission_steps
  set is_done = v_all,
      completed_at = case when v_all then coalesce(completed_at, now()) else null end
  where id = p_parent
    and is_done is distinct from v_all;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function private.recompute_step_parent(uuid) from public, anon, authenticated;

create or replace function public.trg_mission_steps_tree_rollup()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_changed boolean := false;
  v_mission uuid;
begin
  if tg_op = 'DELETE' then
    v_mission := old.mission_id;
    v_changed := private.recompute_step_parent(old.parent_step_id);
  elsif tg_op = 'INSERT' then
    v_mission := new.mission_id;
    v_changed := private.recompute_step_parent(new.parent_step_id);
  else
    v_mission := new.mission_id;
    if new.parent_step_id is distinct from old.parent_step_id then
      v_changed := private.recompute_step_parent(old.parent_step_id);
      v_changed := private.recompute_step_parent(new.parent_step_id) or v_changed;
    elsif new.is_done is distinct from old.is_done then
      v_changed := private.recompute_step_parent(new.parent_step_id);
    end if;
  end if;

  if v_changed then
    perform public._recompute_mission_status(v_mission);
  end if;
  return null;
end;
$$;

drop trigger if exists mission_steps_tree_rollup on public.mission_steps;
create trigger mission_steps_tree_rollup
  after insert or delete or update of is_done, parent_step_id on public.mission_steps
  for each row execute function public.trg_mission_steps_tree_rollup();

-- ---------------------------------------------------------------------------
-- 5. Task status counts leaf steps only
-- ---------------------------------------------------------------------------
create or replace function public._recompute_mission_status(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
  v_status text;
begin
  if p_mission_id is null then
    return;
  end if;

  select count(*), count(*) filter (where s.is_done)
    into v_total, v_done
  from public.mission_steps s
  where s.mission_id = p_mission_id
    and not exists (
      select 1 from public.mission_steps c where c.parent_step_id = s.id
    );

  if v_total = 0 then
    return;
  end if;

  if v_done = v_total then
    v_status := 'done';
  elsif v_done > 0 then
    v_status := 'inProgress';
  else
    v_status := 'todo';
  end if;

  update public.missions
  set status = v_status, updated_at = now()
  where id = p_mission_id
    and status is distinct from v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. complete_step_part — same as 025, but parent steps complete automatically
-- ---------------------------------------------------------------------------
create or replace function public.complete_step_part(p_step_id uuid, p_done boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_step public.mission_steps%rowtype;
  v_mission public.missions%rowtype;
  v_is_assignee boolean;
  v_can_admin boolean;
  v_has_any boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_step from public.mission_steps where id = p_step_id for update;
  if not found then
    raise exception 'Step not found';
  end if;

  select * into v_mission from public.missions where id = v_step.mission_id;
  if not found then
    raise exception 'Mission not found';
  end if;

  if not public.is_space_member(v_mission.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;

  if exists (select 1 from public.mission_steps c where c.parent_step_id = p_step_id) then
    raise exception 'Parent step completes automatically when all sub-steps are done';
  end if;

  select exists (
    select 1 from public.step_assignees where step_id = p_step_id
  ) into v_has_any;

  select exists (
    select 1 from public.step_assignees
    where step_id = p_step_id and user_id = v_uid
  ) into v_is_assignee;

  v_can_admin := public._is_mission_creator(v_mission.id, v_uid)
              or public._is_space_admin_or_owner(v_mission.space_id, v_uid);

  if not v_has_any then
    if not v_can_admin then
      raise exception 'Claim this step first to mark it done';
    end if;
    update public.mission_steps
    set
      is_done = p_done,
      completed_at = case when p_done then coalesce(completed_at, now()) else null end
    where id = p_step_id;
    perform public._recompute_mission_status(v_mission.id);
    return true;
  end if;

  if v_is_assignee then
    update public.step_assignees
    set
      is_done = p_done,
      completed_at = case when p_done then now() else null end
    where step_id = p_step_id and user_id = v_uid;

    perform public._sync_step_assignee_mirror(p_step_id);

    if p_done then
      perform public._emit_step_claim_activity(
        v_mission.space_id,
        v_uid,
        'step_part_done',
        v_mission.id,
        p_step_id,
        coalesce(v_step.title, '')
      );
    end if;
    return true;
  end if;

  if v_can_admin then
    update public.step_assignees
    set
      is_done = p_done,
      completed_at = case when p_done then coalesce(completed_at, now()) else null end
    where step_id = p_step_id;

    perform public._sync_step_assignee_mirror(p_step_id);
    return true;
  end if;

  raise exception 'Only an assignee (or mission creator / space admin) can complete this step';
end;
$$;

grant execute on function public.complete_step_part(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Recurring tasks copy the step tree (replaces the 031 version)
-- ---------------------------------------------------------------------------
create or replace function private.instantiate_recurrence(p_rec_id uuid, p_occurs_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  rec public.mission_recurrences%rowtype;
  t public.missions%rowtype;
  v_day date;
  v_new uuid := gen_random_uuid();
  s record;
  v_step uuid;
  v_map jsonb := '{}'::jsonb;
begin
  select * into rec from public.mission_recurrences where id = p_rec_id;
  select * into t from public.missions where id = rec.template_mission_id;
  if not found then
    return null;
  end if;
  v_day := (p_occurs_at at time zone rec.timezone)::date;

  insert into public.missions (
    id, space_id, title, description, start_date, due_date, status, flag_icon, creator_id,
    step_claim_approval_override, priority, decision_maker_id,
    start_time_minutes, start_timezone, start_reminder_minutes, recurrence_id
  ) values (
    v_new, t.space_id, t.title, t.description, v_day,
    case
      when t.due_date is not null and t.start_date is not null then v_day + (t.due_date - t.start_date)
      when t.due_date is not null then v_day
      else null
    end,
    'todo', t.flag_icon, t.creator_id,
    t.step_claim_approval_override, t.priority,
    case when t.decision_maker_id is not null
              and public.is_space_member(t.space_id, t.decision_maker_id)
         then t.decision_maker_id end,
    rec.time_minutes, rec.timezone, t.start_reminder_minutes, rec.id
  );

  -- Pass 1: copy every step flat (old id → new id map).
  for s in
    select * from public.mission_steps where mission_id = t.id order by order_index, created_at
  loop
    v_step := gen_random_uuid();
    v_map := v_map || jsonb_build_object(s.id::text, v_step::text);
    insert into public.mission_steps (id, mission_id, title, order_index, is_done, assignee_id, deadline_date)
    values (
      v_step, v_new, s.title, s.order_index, false,
      case when s.assignee_id is not null and public.is_space_member(t.space_id, s.assignee_id)
           then s.assignee_id end,
      case when s.deadline_date is not null and t.start_date is not null
           then v_day + (s.deadline_date - t.start_date) end
    );
    insert into public.step_assignees (step_id, user_id, is_done)
    select v_step, sa.user_id, false
      from public.step_assignees sa
     where sa.step_id = s.id
       and public.is_space_member(t.space_id, sa.user_id)
    on conflict do nothing;
  end loop;

  -- Pass 2: rebuild the tree with the new ids.
  for s in
    select id, parent_step_id from public.mission_steps
    where mission_id = t.id and parent_step_id is not null
  loop
    if v_map ? s.parent_step_id::text then
      update public.mission_steps
      set parent_step_id = (v_map ->> s.parent_step_id::text)::uuid
      where id = (v_map ->> s.id::text)::uuid;
    end if;
  end loop;

  return v_new;
end;
$$;

revoke all on function private.instantiate_recurrence(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.instantiate_recurrence(uuid, timestamptz) to postgres, service_role;
