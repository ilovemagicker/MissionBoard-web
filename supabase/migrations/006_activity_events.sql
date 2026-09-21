-- Activity events for Web Activity feed + Realtime
-- Run in Supabase Dashboard → SQL Editor after 001–005.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  mission_id uuid null references public.missions (id) on delete set null,
  step_id uuid null references public.mission_steps (id) on delete set null,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_space_created
  on public.activity_events (space_id, created_at desc);

create index if not exists idx_activity_events_mission_id
  on public.activity_events (mission_id)
  where mission_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: space members can SELECT; inserts via security definer triggers
-- ---------------------------------------------------------------------------
alter table public.activity_events enable row level security;

drop policy if exists "activity_events_select" on public.activity_events;
create policy "activity_events_select"
  on public.activity_events for select
  using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = activity_events.space_id
        and sm.user_id = auth.uid()
    )
  );

-- Authenticated insert allowed only if actor is a member (fallback; triggers use security definer)
drop policy if exists "activity_events_insert" on public.activity_events;
create policy "activity_events_insert"
  on public.activity_events for insert
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.space_members sm
      where sm.space_id = activity_events.space_id
        and sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Helper: insert activity (security definer so triggers bypass RLS cleanly)
-- ---------------------------------------------------------------------------
create or replace function public.insert_activity_event(
  p_space_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_mission_id uuid,
  p_step_id uuid,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (
    space_id, actor_id, kind, mission_id, step_id, summary
  ) values (
    p_space_id, p_actor_id, p_kind, p_mission_id, p_step_id, coalesce(p_summary, '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: missions
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_missions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.insert_activity_event(
      new.space_id,
      new.creator_id,
      'mission_created',
      new.id,
      null,
      coalesce(new.title, '')
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.insert_activity_event(
      new.space_id,
      auth.uid(),
      'mission_status',
      new.id,
      null,
      coalesce(new.title, '') || ': ' || coalesce(old.status, '') || ' → ' || coalesce(new.status, '')
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_missions_ins on public.missions;
create trigger activity_missions_ins
  after insert on public.missions
  for each row execute function public.trg_activity_missions();

drop trigger if exists activity_missions_upd on public.missions;
create trigger activity_missions_upd
  after update of status on public.missions
  for each row execute function public.trg_activity_missions();

-- ---------------------------------------------------------------------------
-- Triggers: mission_steps (done / claim)
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_mission_steps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  mtitle text;
begin
  select m.space_id, m.title into sid, mtitle
  from public.missions m
  where m.id = new.mission_id;

  if sid is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_done is distinct from old.is_done and new.is_done = true then
      perform public.insert_activity_event(
        sid,
        auth.uid(),
        'step_done',
        new.mission_id,
        new.id,
        coalesce(new.title, '') || ' @ ' || coalesce(mtitle, '')
      );
    end if;

    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
      perform public.insert_activity_event(
        sid,
        coalesce(new.assignee_id, auth.uid()),
        'step_claimed',
        new.mission_id,
        new.id,
        coalesce(new.title, '') || ' @ ' || coalesce(mtitle, '')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists activity_mission_steps_upd on public.mission_steps;
create trigger activity_mission_steps_upd
  after update of is_done, assignee_id on public.mission_steps
  for each row execute function public.trg_activity_mission_steps();

-- ---------------------------------------------------------------------------
-- Triggers: mission_comments
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_mission_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  mtitle text;
  snippet text;
begin
  select m.space_id, m.title into sid, mtitle
  from public.missions m
  where m.id = new.mission_id;

  if sid is null then
    return new;
  end if;

  snippet := left(trim(coalesce(new.body, '')), 80);
  perform public.insert_activity_event(
    sid,
    new.author_id,
    'comment_added',
    new.mission_id,
    new.step_id,
    snippet || ' @ ' || coalesce(mtitle, '')
  );
  return new;
end;
$$;

drop trigger if exists activity_mission_comments_ins on public.mission_comments;
create trigger activity_mission_comments_ins
  after insert on public.mission_comments
  for each row execute function public.trg_activity_mission_comments();

-- ---------------------------------------------------------------------------
-- Triggers: space_members (join)
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_space_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip the automatic owner row created with the space (role=owner on insert)
  if new.role = 'owner' then
    return new;
  end if;

  perform public.insert_activity_event(
    new.space_id,
    new.user_id,
    'member_joined',
    null,
    null,
    coalesce(new.nickname, '')
  );
  return new;
end;
$$;

drop trigger if exists activity_space_members_ins on public.space_members;
create trigger activity_space_members_ins
  after insert on public.space_members
  for each row execute function public.trg_activity_space_members();

-- ---------------------------------------------------------------------------
-- Realtime publication (guard if already added)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
exception
  when undefined_object then
    -- publication may not exist outside Supabase; ignore
    null;
end;
$$;

-- Also enable Realtime for missions (web list light refresh); guarded
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'missions'
  ) then
    alter publication supabase_realtime add table public.missions;
  end if;
exception
  when undefined_object then
    null;
end;
$$;
