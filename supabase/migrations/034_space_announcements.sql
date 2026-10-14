-- 034 — Space-level announcement board (空間公告) at the top of the Tasks list.
-- Run after 032 (reuses mission_announcements / mission_announcement_reads). Idempotent.
--
-- * mission_announcements.mission_id becomes nullable: NULL = space-level announcement.
-- * New optional `title` column (space announcements show title + 1–2 lines of body).
-- * Space announcements: everyone in the space reads; ONLY owner/admin may post, edit, delete
--   (task announcements keep the 032 rules).
-- * Per-user 「收起」: public.announcement_dismissals (own rows only).
-- * Push `space_announcement_posted` to all members except the author, gated by the new
--   preference column user_notification_preferences.space_announcement (default true),
--   plus an activity_events row ('space_announcement_posted').
-- * Redeploy notify-event (+ _shared/copy.ts).
--
-- If NOT applied: the app probes `mission_announcements.title`, finds it missing and hides the
-- space board; nothing else changes.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.mission_announcements alter column mission_id drop not null;
alter table public.mission_announcements add column if not exists title text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mission_announcements_title_len') then
    alter table public.mission_announcements
      add constraint mission_announcements_title_len
      check (title is null or char_length(trim(title)) between 1 and 120);
  end if;
end $$;

create index if not exists idx_mission_announcements_space_level
  on public.mission_announcements (space_id, created_at desc)
  where mission_id is null;

create table if not exists public.announcement_dismissals (
  announcement_id uuid not null references public.mission_announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.user_notification_preferences
  add column if not exists space_announcement boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. RLS (replaces the 032 write policies; select policy unchanged = all members)
-- ---------------------------------------------------------------------------
drop policy if exists "mission_announcements_insert" on public.mission_announcements;
create policy "mission_announcements_insert" on public.mission_announcements
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (mission_id is null and public.is_space_admin(space_id, auth.uid()))
      or (
        mission_id is not null
        and public.is_space_editor(space_id, auth.uid())
        and exists (
          select 1 from public.missions m
          where m.id = mission_announcements.mission_id
            and m.space_id = mission_announcements.space_id
        )
      )
    )
  );

drop policy if exists "mission_announcements_update" on public.mission_announcements;
create policy "mission_announcements_update" on public.mission_announcements
  for update to authenticated
  using (
    case
      when mission_id is null then public.is_space_admin(space_id, auth.uid())
      else author_id = auth.uid()
        or public.is_space_admin(space_id, auth.uid())
        or exists (select 1 from public.missions m
                   where m.id = mission_announcements.mission_id and m.creator_id = auth.uid())
    end
  )
  with check (
    case
      when mission_id is null then public.is_space_admin(space_id, auth.uid())
      else public.is_space_member(space_id, auth.uid())
    end
  );

drop policy if exists "mission_announcements_delete" on public.mission_announcements;
create policy "mission_announcements_delete" on public.mission_announcements
  for delete to authenticated
  using (
    case
      when mission_id is null then public.is_space_admin(space_id, auth.uid())
      else author_id = auth.uid()
        or public.is_space_admin(space_id, auth.uid())
        or exists (select 1 from public.missions m
                   where m.id = mission_announcements.mission_id and m.creator_id = auth.uid())
    end
  );

-- Space / scope can't be changed after posting (keeps the admin check meaningful).
create or replace function public.trg_mission_announcements_scope_guard()
returns trigger
language plpgsql
as $$
begin
  if new.space_id is distinct from old.space_id
     or new.mission_id is distinct from old.mission_id
     or new.author_id is distinct from old.author_id then
    raise exception 'Announcement scope and author cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists mission_announcements_scope_guard on public.mission_announcements;
create trigger mission_announcements_scope_guard
  before update on public.mission_announcements
  for each row execute function public.trg_mission_announcements_scope_guard();

alter table public.announcement_dismissals enable row level security;

drop policy if exists "announcement_dismissals_select" on public.announcement_dismissals;
create policy "announcement_dismissals_select" on public.announcement_dismissals
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "announcement_dismissals_insert" on public.announcement_dismissals;
create policy "announcement_dismissals_insert" on public.announcement_dismissals
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.mission_announcements a
      where a.id = announcement_dismissals.announcement_id
        and public.is_space_member(a.space_id, auth.uid())
    )
  );

drop policy if exists "announcement_dismissals_delete" on public.announcement_dismissals;
create policy "announcement_dismissals_delete" on public.announcement_dismissals
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.announcement_dismissals to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push + activity (replaces the 032 trigger function; task announcements unchanged)
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
  v_preview text;
begin
  select name into v_space_name from public.spaces where id = new.space_id;

  if new.mission_id is null then
    v_preview := coalesce(nullif(trim(new.title), ''), left(new.body, 120));
    begin
      perform public.insert_activity_event(new.space_id, new.author_id, 'space_announcement_posted',
                                           null, null, left(v_preview, 200));
    exception when others then null;
    end;
    perform private.dispatch_notify_event(jsonb_build_object(
      'event', 'space_announcement_posted',
      'actor_id', new.author_id,
      'space_id', new.space_id,
      'announcement_id', new.id,
      'space_name', coalesce(v_space_name, ''),
      'mission_title', coalesce(nullif(trim(new.title), ''), ''),
      'comment_preview', left(new.body, 120)
    ));
    return new;
  end if;

  select title into v_mission_title from public.missions where id = new.mission_id;
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

-- Deploy checklist:
--   1. Run this file (after 032).
--   2. Redeploy notify-event (bundles _shared/copy.ts) for `space_announcement_posted`.
