-- 035 — Push notification locales for Simplified Chinese, Japanese and Korean (app 1.1).
-- Run after 020 (any time; independent of 021–034). Idempotent.
--
-- * user_notification_preferences.locale now accepts:
--     'zh' (Traditional Chinese — unchanged legacy default), 'zh-hans', 'en', 'ja', 'ko'.
-- * upsert_my_notification_preferences(...) keeps the same signature; it now stores the new
--   codes instead of coercing them to 'zh'.
-- * Redeploy notify-event (it builds the copy via _shared/copy.ts):
--     supabase functions deploy notify-event
--
-- If NOT applied: iOS 1.1 still works — the RPC coerces 'zh-hans' / 'ja' / 'ko' to 'zh', so
-- those users simply get Traditional Chinese pushes.

-- ---------------------------------------------------------------------------
-- 1. Widen the locale check constraint
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.user_notification_preferences'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%locale%'
  loop
    execute format('alter table public.user_notification_preferences drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_locale_check
  check (locale in ('zh', 'zh-hans', 'en', 'ja', 'ko'));

comment on column public.user_notification_preferences.locale is
  'Push copy locale: zh (Traditional Chinese, default), zh-hans, en, ja, ko.';

-- ---------------------------------------------------------------------------
-- 2. Upsert RPC: accept the new locales (same signature / grants as 020)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_my_notification_preferences(
  p_mission_due_today boolean default true,
  p_mission_due_soon boolean default true,
  p_step_claimed boolean default true,
  p_step_completed boolean default true,
  p_step_assigned_to_me boolean default true,
  p_new_comment boolean default true,
  p_mission_created boolean default true,
  p_mission_status_changed boolean default false,
  p_join_request_pending boolean default true,
  p_join_request_resolved boolean default true,
  p_member_joined boolean default true,
  p_member_kicked boolean default false,
  p_shift_reminder_enabled boolean default true,
  p_shift_reminder_minutes int default 60,
  p_shift_swap_pending boolean default true,
  p_step_claim_approval_pending boolean default true,
  p_locale text default 'zh'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes int := coalesce(p_shift_reminder_minutes, 60);
  v_locale text := lower(coalesce(nullif(trim(p_locale), ''), 'zh'));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_minutes not in (15, 30, 60, 120, 360, 720, 1440) then
    v_minutes := 60;
  end if;
  v_locale := replace(v_locale, '_', '-');
  -- Map regional / script variants; 'zh' stays Traditional Chinese (legacy default).
  if v_locale like 'zh-hans%' or v_locale in ('zh-cn', 'zh-sg', 'zh-my') then
    v_locale := 'zh-hans';
  elsif v_locale like 'zh%' then
    v_locale := 'zh';
  elsif v_locale like 'en%' then
    v_locale := 'en';
  elsif v_locale like 'ja%' then
    v_locale := 'ja';
  elsif v_locale like 'ko%' then
    v_locale := 'ko';
  else
    v_locale := 'zh';
  end if;

  insert into public.user_notification_preferences (
    user_id,
    mission_due_today, mission_due_soon,
    step_claimed, step_completed, step_assigned_to_me,
    new_comment, mission_created, mission_status_changed,
    join_request_pending, join_request_resolved,
    member_joined, member_kicked,
    shift_reminder_enabled, shift_reminder_minutes,
    shift_swap_pending, step_claim_approval_pending,
    locale, updated_at
  ) values (
    auth.uid(),
    coalesce(p_mission_due_today, true),
    coalesce(p_mission_due_soon, true),
    coalesce(p_step_claimed, true),
    coalesce(p_step_completed, true),
    coalesce(p_step_assigned_to_me, true),
    coalesce(p_new_comment, true),
    coalesce(p_mission_created, true),
    coalesce(p_mission_status_changed, false),
    coalesce(p_join_request_pending, true),
    coalesce(p_join_request_resolved, true),
    coalesce(p_member_joined, true),
    coalesce(p_member_kicked, false),
    coalesce(p_shift_reminder_enabled, true),
    v_minutes,
    coalesce(p_shift_swap_pending, true),
    coalesce(p_step_claim_approval_pending, true),
    v_locale,
    now()
  )
  on conflict (user_id) do update set
    mission_due_today = excluded.mission_due_today,
    mission_due_soon = excluded.mission_due_soon,
    step_claimed = excluded.step_claimed,
    step_completed = excluded.step_completed,
    step_assigned_to_me = excluded.step_assigned_to_me,
    new_comment = excluded.new_comment,
    mission_created = excluded.mission_created,
    mission_status_changed = excluded.mission_status_changed,
    join_request_pending = excluded.join_request_pending,
    join_request_resolved = excluded.join_request_resolved,
    member_joined = excluded.member_joined,
    member_kicked = excluded.member_kicked,
    shift_reminder_enabled = excluded.shift_reminder_enabled,
    shift_reminder_minutes = excluded.shift_reminder_minutes,
    shift_swap_pending = excluded.shift_swap_pending,
    step_claim_approval_pending = excluded.step_claim_approval_pending,
    locale = excluded.locale,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, int, boolean, boolean, text
) from public;
grant execute on function public.upsert_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, int, boolean, boolean, text
) to authenticated;
grant execute on function public.upsert_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, int, boolean, boolean, text
) to service_role;
