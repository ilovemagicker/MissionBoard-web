-- 037 — Step deadline morning reminder (步驟到期提醒).
-- Run after 036. Safe to re-run (idempotent).
--
-- What this adds
--   1. user_notification_preferences.step_deadline_reminder (bool, default true)
--   2. private.push_reminder_sent kind 'step_deadline_reminder'
--   3. private.run_step_deadline_reminders() — incomplete steps whose deadline_date is
--      today in the recipient's resolved timezone, morning window 09:00–09:59 (same as
--      mission_due_today). Recipients = step_assignees + legacy assignee_id; if none,
--      the mission creator. Skips done / archived missions. Dedup per
--      (kind, step_id, user_id, deadline_date).
--   4. pg_cron job 'mb-step-deadline-reminder' every 15 min.
--   5. Trigger: changing mission_steps.deadline_date clears dedup for that step.
--
-- Redeploy notify-event (+ _shared/copy.ts) for event step_deadline_reminder.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Preference column
-- ---------------------------------------------------------------------------
alter table public.user_notification_preferences
  add column if not exists step_deadline_reminder boolean not null default true;

comment on column public.user_notification_preferences.step_deadline_reminder is
  '037: morning-of remote push when a step assigned to me (or my task with no assignees) is due today.';

-- Dedup kind check: keep prior kinds + step_deadline_reminder.
alter table private.push_reminder_sent drop constraint if exists push_reminder_sent_kind_check;
alter table private.push_reminder_sent add constraint push_reminder_sent_kind_check
  check (kind in (
    'mission_due_today',
    'shift_reminder',
    'mission_start_reminder',
    'mission_recurrence',
    'poll_closed',
    'step_deadline_reminder'
  ));

-- ---------------------------------------------------------------------------
-- 2. Reminder runner
-- ---------------------------------------------------------------------------
create or replace function private.run_step_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  s record;
  r record;
  v_tz text;
  v_local_date date;
  v_local_hour int;
  v_space_name text;
  v_recipient_ids uuid[];
  v_uid uuid;
  v_enabled boolean;
  v_count int := 0;
begin
  for s in
    select
      ms.id as step_id,
      ms.title as step_title,
      ms.deadline_date,
      ms.assignee_id as legacy_assignee_id,
      m.id as mission_id,
      m.space_id,
      m.title as mission_title,
      m.creator_id
    from public.mission_steps ms
    join public.missions m on m.id = ms.mission_id
    where ms.deadline_date is not null
      and ms.is_done is not true
      and m.status is distinct from 'done'
      and m.archived_at is null
      and ms.deadline_date between (current_date - 1) and (current_date + 1)
  loop
    begin
      -- Recipients: multi-assignees + legacy assignee; else creator.
      select coalesce(array_agg(distinct x.uid) filter (where x.uid is not null), '{}')
      into v_recipient_ids
      from (
        select sa.user_id as uid
        from public.step_assignees sa
        where sa.step_id = s.step_id
        union
        select s.legacy_assignee_id
      ) x;

      if coalesce(array_length(v_recipient_ids, 1), 0) = 0 then
        if s.creator_id is null then
          continue;
        end if;
        v_recipient_ids := array[s.creator_id];
      end if;

      select name into v_space_name from public.spaces where id = s.space_id;

      foreach v_uid in array v_recipient_ids
      loop
        begin
          -- Must still be a space member.
          if not exists (
            select 1 from public.space_members sm
            where sm.space_id = s.space_id and sm.user_id = v_uid
          ) then
            continue;
          end if;

          select coalesce(p.step_deadline_reminder, true)
          into v_enabled
          from (select 1) _
          left join public.user_notification_preferences p on p.user_id = v_uid;
          if not coalesce(v_enabled, true) then
            continue;
          end if;

          v_tz := private.resolve_reminder_timezone(v_uid, s.space_id);
          v_local_date := (timezone(v_tz, now()))::date;
          v_local_hour := extract(hour from timezone(v_tz, now()))::int;

          if s.deadline_date is distinct from v_local_date then
            continue;
          end if;
          if v_local_hour <> 9 then
            continue;
          end if;

          if not private.try_claim_reminder_send(
            'step_deadline_reminder', s.step_id, v_uid, s.deadline_date
          ) then
            continue;
          end if;

          perform private.dispatch_notify_event(jsonb_build_object(
            'event', 'step_deadline_reminder',
            'space_id', s.space_id,
            'mission_id', s.mission_id,
            'step_id', s.step_id,
            'target_user_id', v_uid,
            'mission_title', coalesce(s.mission_title, ''),
            'step_title', coalesce(s.step_title, ''),
            'space_name', coalesce(v_space_name, '')
          ));
          v_count := v_count + 1;
        exception when others then
          raise warning 'run_step_deadline_reminders recipient failed: %', sqlerrm;
        end;
      end loop;
    exception when others then
      raise warning 'run_step_deadline_reminders step failed: %', sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.run_step_deadline_reminders()
  from public, anon, authenticated;
grant execute on function private.run_step_deadline_reminders()
  to postgres, service_role;

-- Changing deadline_date re-arms the reminder for that step.
create or replace function public.trg_mission_steps_deadline_rearm()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.deadline_date is distinct from old.deadline_date then
    delete from private.push_reminder_sent
     where kind = 'step_deadline_reminder' and entity_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists mission_steps_deadline_rearm on public.mission_steps;
create trigger mission_steps_deadline_rearm
  after update of deadline_date on public.mission_steps
  for each row execute function public.trg_mission_steps_deadline_rearm();

-- ---------------------------------------------------------------------------
-- 3. Cron (idempotent by job name)
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'mb-step-deadline-reminder' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'mb-step-deadline-reminder',
    '*/15 * * * *',
    $cron$select private.run_step_deadline_reminders()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron not available — enable it in Dashboard → Database → Extensions, then re-run this block';
end;
$$;

-- Deploy checklist:
--   1. Apply this migration (after 036).
--   2. supabase functions deploy notify-event
--   3. Verify: incomplete step with deadline_date = today, assignee = you;
--      around 09:00 local with app killed → one APNs.
--      select * from cron.job where jobname = 'mb-step-deadline-reminder';
--      select * from private.push_reminder_sent where kind = 'step_deadline_reminder' order by sent_at desc limit 20;
