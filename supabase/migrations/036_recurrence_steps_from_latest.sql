-- 036 — Recurring instances copy steps from the latest prior checklist.
--
-- Root cause (seen in production): template_mission_id often stays on the original
-- empty create-time mission. Users add/edit steps on later instances; the generator
-- only read the template, so new occurrences got zero steps even though 033's tree
-- copy was correct.
--
-- Fix: when instantiating, keep title/description/flag/priority/decision/claim/
-- start-reminder from the template, but copy mission_steps (+ nested parent map +
-- step_assignees, is_done reset) from:
--   1. the most recent prior mission in the same recurrence that has at least one
--      step and start_date < occurrence day (tie-break created_at desc), else
--   2. any prior mission in the recurrence with steps (by created_at desc), else
--   3. template_mission_id.
-- Also copy mission_workers from that same step-source (fresh started_at).
--
-- Idempotent CREATE OR REPLACE. Depends on 031 + 033. Cron unchanged
-- (mb-mission-recurrence every 5 min). Existing empty instances are NOT backfilled;
-- the next generated occurrence will carry forward the latest checklist.

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
  v_src uuid;
  src_step record;
  v_step uuid;
  v_map jsonb := '{}'::jsonb;
  v_src_start date;
begin
  select * into rec from public.mission_recurrences where id = p_rec_id;
  if not found then
    return null;
  end if;

  select * into t from public.missions where id = rec.template_mission_id;
  if not found then
    return null;
  end if;

  v_day := (p_occurs_at at time zone rec.timezone)::date;

  -- Step source: latest prior checklist in this recurrence, else template.
  select m.id into v_src
    from public.missions m
   where m.recurrence_id = rec.id
     and m.id is distinct from rec.template_mission_id
     and m.start_date is not null
     and m.start_date < v_day
     and exists (select 1 from public.mission_steps ms where ms.mission_id = m.id)
   order by m.start_date desc, m.created_at desc
   limit 1;

  if v_src is null then
    select m.id into v_src
      from public.missions m
     where m.recurrence_id = rec.id
       and m.id is distinct from rec.template_mission_id
       and m.created_at < p_occurs_at
       and exists (select 1 from public.mission_steps ms where ms.mission_id = m.id)
     order by m.created_at desc
     limit 1;
  end if;

  if v_src is null then
    -- Template (may or may not have steps) — still create the mission shell.
    v_src := t.id;
  end if;

  select start_date into v_src_start from public.missions where id = v_src;

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

  -- Copy workers from the step-source (who was working on the checklist).
  insert into public.mission_workers (mission_id, user_id, started_at)
  select v_new, mw.user_id, now()
    from public.mission_workers mw
   where mw.mission_id = v_src
     and public.is_space_member(t.space_id, mw.user_id)
  on conflict do nothing;

  -- Depth-ordered tree copy so parents exist before children (one pass).
  -- parent_step_id is set immediately using the in-progress id map.
  for src_step in
    with recursive tree as (
      select ms.*, 0 as depth
        from public.mission_steps ms
       where ms.mission_id = v_src and ms.parent_step_id is null
      union all
      select child.*, tree.depth + 1
        from public.mission_steps child
        join tree on child.parent_step_id = tree.id
       where child.mission_id = v_src
         and tree.depth < 12
    )
    select * from tree order by depth, order_index, created_at
  loop
    begin
      v_step := gen_random_uuid();
      v_map := v_map || jsonb_build_object(src_step.id::text, v_step::text);
      insert into public.mission_steps (
        id, mission_id, title, order_index, is_done, completed_at,
        assignee_id, deadline_date, parent_step_id
      ) values (
        v_step, v_new, src_step.title, src_step.order_index, false, null,
        case when src_step.assignee_id is not null and public.is_space_member(t.space_id, src_step.assignee_id)
             then src_step.assignee_id end,
        case when src_step.deadline_date is not null and v_src_start is not null
             then v_day + (src_step.deadline_date - v_src_start) end,
        case when src_step.parent_step_id is not null and (v_map ? src_step.parent_step_id::text)
             then (v_map ->> src_step.parent_step_id::text)::uuid end
      );
      insert into public.step_assignees (step_id, user_id, is_done)
      select v_step, sa.user_id, false
        from public.step_assignees sa
       where sa.step_id = src_step.id
         and public.is_space_member(t.space_id, sa.user_id)
      on conflict do nothing;
    exception when others then
      -- One bad step must not abort the whole instance; log and continue.
      raise warning 'instantiate_recurrence % step % failed: %', p_rec_id, src_step.id, sqlerrm;
    end;
  end loop;

  return v_new;
end;
$$;

revoke all on function private.instantiate_recurrence(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.instantiate_recurrence(uuid, timestamptz) to postgres, service_role;

-- Verify cron still scheduled (no-op if already present):
--   select jobid, jobname, schedule, active from cron.job where jobname = 'mb-mission-recurrence';
-- Manual kick: select private.run_mission_recurrences();
--
-- Comment test (run in SQL editor after apply; roll back):
--   begin;
--   -- pick a recurrence whose latest instance has steps, call instantiate_recurrence,
--   -- assert new mission_steps count matches source, then rollback;
--   rollback;
