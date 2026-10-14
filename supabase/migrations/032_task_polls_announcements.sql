-- 032 — In-task polls (投票) + task announcement board (公告板).
-- Run in Supabase Dashboard → SQL Editor after 001–031 (uses 029's decision_maker_id and 030's
-- reminder dedup kinds). Safe to re-run (idempotent).
--
-- Visibility / audience (decision): tasks are already visible to every member of their space,
-- so polls and announcements are visible to ALL space members and pushes go to all space
-- members except the actor (same audience as mission_created / comment pushes). Family viewers
-- can read but not vote / post.
--
-- Polls
--   mission_polls (+ mission_poll_options 2–10, mission_poll_votes)
--   • single or multiple choice, optional deadline, anonymous or named
--   • anonymous polls: other people's vote rows are hidden by RLS; counts come from
--     public.poll_results() (security definer, members only)
--   • writes only through RPCs: create_mission_poll, cast_poll_vote (re-vote replaces),
--     close_mission_poll (creator, task 決策人 or space owner/admin; optional final options,
--     default = top-voted), delete_mission_poll (creator or owner/admin)
--   • deadline passed → auto-closed by pg_cron 'mb-close-expired-polls' (every 5 min)
--   • push: poll_created, poll_closed
-- Announcements
--   mission_announcements (pinned at the top of task detail) + mission_announcement_reads
--   • post: space editors; edit/delete: author, task creator or space owner/admin
--   • push: announcement_posted (body preview); activity_events row for the feed
--   • read count: members insert their own read row
-- Preference column user_notification_preferences.task_poll_announcement (default true).
-- Redeploy notify-event (+ _shared/copy.ts) for the new events.
--
-- If this file is NOT applied: the app detects the missing tables and hides the 投票 / 公告
-- sections; nothing else changes.

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.mission_polls (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  anonymous boolean not null default false,
  deadline_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  final_option_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint mission_polls_question_len check (char_length(trim(question)) between 1 and 300)
);
create index if not exists idx_mission_polls_mission on public.mission_polls (mission_id);
create index if not exists idx_mission_polls_open_deadline
  on public.mission_polls (deadline_at) where closed_at is null;

create table if not exists public.mission_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.mission_polls (id) on delete cascade,
  position int not null default 0,
  label text not null,
  constraint mission_poll_options_label_len check (char_length(trim(label)) between 1 and 120)
);
create index if not exists idx_mission_poll_options_poll on public.mission_poll_options (poll_id);

create table if not exists public.mission_poll_votes (
  poll_id uuid not null references public.mission_polls (id) on delete cascade,
  option_id uuid not null references public.mission_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists idx_mission_poll_votes_poll on public.mission_poll_votes (poll_id);

create table if not exists public.mission_announcements (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  pinned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_announcements_body_len check (char_length(trim(body)) between 1 and 2000)
);
create index if not exists idx_mission_announcements_mission on public.mission_announcements (mission_id);

create table if not exists public.mission_announcement_reads (
  announcement_id uuid not null references public.mission_announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.user_notification_preferences
  add column if not exists task_poll_announcement boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
alter table public.mission_polls enable row level security;
alter table public.mission_poll_options enable row level security;
alter table public.mission_poll_votes enable row level security;
alter table public.mission_announcements enable row level security;
alter table public.mission_announcement_reads enable row level security;

drop policy if exists "mission_polls_select" on public.mission_polls;
create policy "mission_polls_select" on public.mission_polls
  for select to authenticated
  using (public.is_space_member(space_id, auth.uid()));

drop policy if exists "mission_poll_options_select" on public.mission_poll_options;
create policy "mission_poll_options_select" on public.mission_poll_options
  for select to authenticated
  using (exists (
    select 1 from public.mission_polls p
    where p.id = mission_poll_options.poll_id
      and public.is_space_member(p.space_id, auth.uid())
  ));

-- Own votes always; other people's only on named (non-anonymous) polls.
drop policy if exists "mission_poll_votes_select" on public.mission_poll_votes;
create policy "mission_poll_votes_select" on public.mission_poll_votes
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.mission_polls p
      where p.id = mission_poll_votes.poll_id
        and not p.anonymous
        and public.is_space_member(p.space_id, auth.uid())
    )
  );

grant select on public.mission_polls, public.mission_poll_options, public.mission_poll_votes
  to authenticated;
-- Poll writes go through the security-definer RPCs below (no insert/update/delete policies).

drop policy if exists "mission_announcements_select" on public.mission_announcements;
create policy "mission_announcements_select" on public.mission_announcements
  for select to authenticated
  using (public.is_space_member(space_id, auth.uid()));

drop policy if exists "mission_announcements_insert" on public.mission_announcements;
create policy "mission_announcements_insert" on public.mission_announcements
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_space_editor(space_id, auth.uid())
    and exists (
      select 1 from public.missions m
      where m.id = mission_announcements.mission_id and m.space_id = mission_announcements.space_id
    )
  );

drop policy if exists "mission_announcements_update" on public.mission_announcements;
create policy "mission_announcements_update" on public.mission_announcements
  for update to authenticated
  using (
    author_id = auth.uid()
    or public.is_space_admin(space_id, auth.uid())
    or exists (select 1 from public.missions m
               where m.id = mission_announcements.mission_id and m.creator_id = auth.uid())
  )
  with check (public.is_space_member(space_id, auth.uid()));

drop policy if exists "mission_announcements_delete" on public.mission_announcements;
create policy "mission_announcements_delete" on public.mission_announcements
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_space_admin(space_id, auth.uid())
    or exists (select 1 from public.missions m
               where m.id = mission_announcements.mission_id and m.creator_id = auth.uid())
  );

grant select, insert, update, delete on public.mission_announcements to authenticated;

drop policy if exists "mission_announcement_reads_select" on public.mission_announcement_reads;
create policy "mission_announcement_reads_select" on public.mission_announcement_reads
  for select to authenticated
  using (exists (
    select 1 from public.mission_announcements a
    where a.id = mission_announcement_reads.announcement_id
      and public.is_space_member(a.space_id, auth.uid())
  ));

drop policy if exists "mission_announcement_reads_insert" on public.mission_announcement_reads;
create policy "mission_announcement_reads_insert" on public.mission_announcement_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.mission_announcements a
      where a.id = mission_announcement_reads.announcement_id
        and public.is_space_member(a.space_id, auth.uid())
    )
  );

drop policy if exists "mission_announcement_reads_delete" on public.mission_announcement_reads;
create policy "mission_announcement_reads_delete" on public.mission_announcement_reads
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.mission_announcement_reads to authenticated;

-- Keep updated_at fresh on edits.
drop trigger if exists mission_announcements_set_updated_at on public.mission_announcements;
create trigger mission_announcements_set_updated_at
  before update on public.mission_announcements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Poll helpers + RPCs
-- ---------------------------------------------------------------------------
-- Top-voted options (ties → all tied; no votes → empty).
create or replace function private.poll_top_options(p_poll_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select o.id, count(v.user_id) as c
      from public.mission_poll_options o
      left join public.mission_poll_votes v on v.option_id = o.id
     where o.poll_id = p_poll_id
     group by o.id
  )
  select coalesce(array_agg(id), '{}')
    from counts
   where c > 0 and c = (select max(c) from counts);
$$;

revoke all on function private.poll_top_options(uuid) from public, anon, authenticated;
grant execute on function private.poll_top_options(uuid) to postgres, service_role;

create or replace function private.dispatch_poll_event(p_event text, p_poll_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  p public.mission_polls%rowtype;
  v_mission_title text;
  v_space_name text;
  v_result text;
begin
  select * into p from public.mission_polls where id = p_poll_id;
  if not found then return; end if;
  select title into v_mission_title from public.missions where id = p.mission_id;
  select name into v_space_name from public.spaces where id = p.space_id;
  if p_event = 'poll_closed' then
    select string_agg(label, '、' order by position) into v_result
      from public.mission_poll_options where id = any(p.final_option_ids);
  end if;
  perform private.dispatch_notify_event(jsonb_build_object(
    'event', p_event,
    'actor_id', p_actor,
    'space_id', p.space_id,
    'mission_id', p.mission_id,
    'mission_title', coalesce(v_mission_title, ''),
    'space_name', coalesce(v_space_name, ''),
    'comment_preview', left(p.question, 120),
    'step_title', coalesce(v_result, '')
  ));
exception when others then
  raise warning 'dispatch_poll_event failed: %', sqlerrm;
end;
$$;

revoke all on function private.dispatch_poll_event(text, uuid, uuid) from public, anon, authenticated;
grant execute on function private.dispatch_poll_event(text, uuid, uuid) to postgres, service_role;

create or replace function public.create_mission_poll(
  p_mission_id uuid,
  p_question text,
  p_options text[],
  p_allow_multiple boolean default false,
  p_anonymous boolean default false,
  p_deadline_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_poll uuid := gen_random_uuid();
  v_labels text[];
  i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select space_id into v_space from public.missions where id = p_mission_id;
  if v_space is null then raise exception 'Mission not found'; end if;
  if not public.is_space_editor(v_space, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  select coalesce(array_agg(trim(x) order by ord), '{}') into v_labels
    from unnest(p_options) with ordinality as t(x, ord)
   where char_length(trim(x)) > 0;
  if coalesce(array_length(v_labels, 1), 0) < 2 or array_length(v_labels, 1) > 10 then
    raise exception 'A poll needs 2–10 options';
  end if;
  if p_deadline_at is not null and p_deadline_at <= now() then
    raise exception 'Deadline must be in the future';
  end if;

  insert into public.mission_polls (id, mission_id, space_id, created_by, question,
                                    allow_multiple, anonymous, deadline_at)
  values (v_poll, p_mission_id, v_space, v_uid, trim(p_question),
          coalesce(p_allow_multiple, false), coalesce(p_anonymous, false), p_deadline_at);

  for i in 1..array_length(v_labels, 1) loop
    insert into public.mission_poll_options (poll_id, position, label)
    values (v_poll, i - 1, left(v_labels[i], 120));
  end loop;

  begin
    perform public.insert_activity_event(v_space, v_uid, 'poll_created', p_mission_id, null,
                                         left(trim(p_question), 200));
  exception when others then null;
  end;
  perform private.dispatch_poll_event('poll_created', v_poll, v_uid);
  return v_poll;
end;
$$;

create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.mission_polls%rowtype;
  v_ids uuid[] := coalesce(p_option_ids, '{}');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.mission_polls where id = p_poll_id;
  if not found then raise exception 'Poll not found'; end if;
  if not public.is_space_editor(p.space_id, v_uid) then
    raise exception 'Not a member of this space';
  end if;
  if p.closed_at is not null or (p.deadline_at is not null and p.deadline_at <= now()) then
    raise exception 'Poll is closed';
  end if;
  if not p.allow_multiple and array_length(v_ids, 1) > 1 then
    raise exception 'Single-choice poll';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x(id)
    where not exists (select 1 from public.mission_poll_options o where o.id = x.id and o.poll_id = p_poll_id)
  ) then
    raise exception 'Option does not belong to this poll';
  end if;

  delete from public.mission_poll_votes where poll_id = p_poll_id and user_id = v_uid;
  insert into public.mission_poll_votes (poll_id, option_id, user_id)
  select p_poll_id, x.id, v_uid from (select distinct unnest(v_ids) as id) x;
end;
$$;

create or replace function public.close_mission_poll(p_poll_id uuid, p_final_option_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  p public.mission_polls%rowtype;
  v_dm uuid;
  v_final uuid[];
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.mission_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found'; end if;
  select decision_maker_id into v_dm from public.missions where id = p.mission_id;
  if not (p.created_by = v_uid or v_dm = v_uid or public.is_space_admin(p.space_id, v_uid)) then
    raise exception 'Only the poll creator, the decision maker or an admin can close this poll';
  end if;

  if p_final_option_ids is not null and array_length(p_final_option_ids, 1) > 0 then
    select coalesce(array_agg(o.id), '{}') into v_final
      from public.mission_poll_options o
     where o.poll_id = p_poll_id and o.id = any(p_final_option_ids);
  else
    v_final := private.poll_top_options(p_poll_id);
  end if;

  update public.mission_polls
     set closed_at = coalesce(closed_at, now()),
         closed_by = v_uid,
         final_option_ids = v_final
   where id = p_poll_id;
  perform private.dispatch_poll_event('poll_closed', p_poll_id, v_uid);
end;
$$;

create or replace function public.delete_mission_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.mission_polls%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.mission_polls where id = p_poll_id;
  if not found then return; end if;
  if not (p.created_by = v_uid or public.is_space_admin(p.space_id, v_uid)) then
    raise exception 'Only the poll creator or an admin can delete this poll';
  end if;
  delete from public.mission_polls where id = p_poll_id;
end;
$$;

-- Counts per option (works for anonymous polls without exposing who voted).
create or replace function public.poll_results(p_poll_ids uuid[])
returns table (poll_id uuid, option_id uuid, vote_count int, voter_count int)
language sql
stable
security definer
set search_path = public
as $$
  select o.poll_id, o.id,
         (select count(*)::int from public.mission_poll_votes v where v.option_id = o.id),
         (select count(distinct v2.user_id)::int from public.mission_poll_votes v2 where v2.poll_id = o.poll_id)
    from public.mission_poll_options o
    join public.mission_polls p on p.id = o.poll_id
   where o.poll_id = any(p_poll_ids)
     and public.is_space_member(p.space_id, auth.uid());
$$;

revoke all on function public.create_mission_poll(uuid, text, text[], boolean, boolean, timestamptz) from public, anon;
revoke all on function public.cast_poll_vote(uuid, uuid[]) from public, anon;
revoke all on function public.close_mission_poll(uuid, uuid[]) from public, anon;
revoke all on function public.delete_mission_poll(uuid) from public, anon;
revoke all on function public.poll_results(uuid[]) from public, anon;
grant execute on function public.create_mission_poll(uuid, text, text[], boolean, boolean, timestamptz) to authenticated;
grant execute on function public.cast_poll_vote(uuid, uuid[]) to authenticated;
grant execute on function public.close_mission_poll(uuid, uuid[]) to authenticated;
grant execute on function public.delete_mission_poll(uuid) to authenticated;
grant execute on function public.poll_results(uuid[]) to authenticated;

-- Deadline passed → close with the top-voted options + notify.
create or replace function private.close_expired_polls()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id from public.mission_polls
     where closed_at is null and deadline_at is not null and deadline_at <= now()
     for update skip locked
  loop
    update public.mission_polls
       set closed_at = now(), final_option_ids = private.poll_top_options(r.id)
     where id = r.id;
    perform private.dispatch_poll_event('poll_closed', r.id, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.close_expired_polls() from public, anon, authenticated;
grant execute on function private.close_expired_polls() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4. Announcement push + activity
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_mission_announcements()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_mission_title text;
  v_space_name text;
begin
  select title into v_mission_title from public.missions where id = new.mission_id;
  select name into v_space_name from public.spaces where id = new.space_id;
  begin
    perform public.insert_activity_event(new.space_id, new.author_id, 'announcement_posted',
                                         new.mission_id, null, left(new.body, 200));
  exception when others then null;
  end;
  perform private.dispatch_notify_event(jsonb_build_object(
    'event', 'announcement_posted',
    'actor_id', new.author_id,
    'space_id', new.space_id,
    'mission_id', new.mission_id,
    'mission_title', coalesce(v_mission_title, ''),
    'space_name', coalesce(v_space_name, ''),
    'comment_preview', left(new.body, 120)
  ));
  return new;
end;
$$;

drop trigger if exists push_mission_announcements_ins on public.mission_announcements;
create trigger push_mission_announcements_ins
  after insert on public.mission_announcements
  for each row execute function public.trg_push_mission_announcements();

-- ---------------------------------------------------------------------------
-- 5. Cron + optional realtime publication
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'mb-close-expired-polls' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'mb-close-expired-polls',
    '*/5 * * * *',
    $cron$select private.close_expired_polls()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron not available — enable it in Dashboard → Database → Extensions, then re-run this block';
end;
$$;

do $$
begin
  begin alter publication supabase_realtime add table public.mission_polls; exception when others then null; end;
  begin alter publication supabase_realtime add table public.mission_poll_votes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.mission_announcements; exception when others then null; end;
end;
$$;

-- Deploy checklist:
--   1. Run this file (after 031).
--   2. supabase functions deploy notify-event   (poll_created / poll_closed / announcement_posted)
--   3. Verify: open a task → 投票 ＋ → create; another member votes; 結束投票 → everyone gets the
--      result push. 公告 ＋ → post; members get a push and see it pinned at the top.
