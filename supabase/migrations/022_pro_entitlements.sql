-- Pro entitlements (StoreKit 2 / Apple IAP) + server-side Free/Pro gates.
-- Free: ≤1 owned space, ≤5 members per space (gate by SPACE OWNER entitlement).
-- Pro: ≤20 owned spaces, ≤25 members per space.
-- Invited memberships do not count toward the create-space limit.
-- Run after 001–021 in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- user_entitlements
-- ---------------------------------------------------------------------------
create table if not exists public.user_entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_pro_active boolean not null default false,
  product_id text,
  expires_at timestamptz,
  original_transaction_id text,
  source text not null default 'apple'
    check (source in ('apple')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_entitlements_pro
  on public.user_entitlements (is_pro_active)
  where is_pro_active = true;

create index if not exists idx_user_entitlements_original_tx
  on public.user_entitlements (original_transaction_id)
  where original_transaction_id is not null;

drop trigger if exists user_entitlements_set_updated_at on public.user_entitlements;
create trigger user_entitlements_set_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();

alter table public.user_entitlements enable row level security;

-- Users can read their own row (Me / settings / create-space precheck).
drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own"
  on public.user_entitlements for select
  to authenticated
  using (user_id = auth.uid());

-- Space members can read owner entitlements (member-limit wall needs owner plan).
drop policy if exists "user_entitlements_select_space_owner" on public.user_entitlements;
create policy "user_entitlements_select_space_owner"
  on public.user_entitlements for select
  to authenticated
  using (
    exists (
      select 1
      from public.space_members viewer
      join public.space_members owner_m
        on owner_m.space_id = viewer.space_id
       and owner_m.role = 'owner'
       and owner_m.user_id = user_entitlements.user_id
      where viewer.user_id = auth.uid()
    )
  );

-- No direct client insert/update/delete — Edge Function uses service_role.
drop policy if exists "user_entitlements_no_client_write" on public.user_entitlements;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.user_is_pro_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.is_pro_active
      and (e.expires_at is null or e.expires_at > now())
    from public.user_entitlements e
    where e.user_id = p_user_id
  ), false);
$$;

create or replace function public.space_owner_is_pro(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select bool_or(public.user_is_pro_active(sm.user_id))
    from public.space_members sm
    where sm.space_id = p_space_id
      and sm.role = 'owner'
  ), false);
$$;

create or replace function public.plan_max_owned_spaces(p_is_pro boolean)
returns int
language sql
immutable
as $$
  select case when p_is_pro then 20 else 1 end;
$$;

create or replace function public.plan_max_members(p_is_pro boolean)
returns int
language sql
immutable
as $$
  select case when p_is_pro then 25 else 5 end;
$$;

-- Effective limits for a space (callable by members). Used by clients + gates.
create or replace function public.get_space_plan_limits(p_space_id uuid)
returns table (
  owner_is_pro boolean,
  max_members int,
  plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pro boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_space_member(p_space_id, auth.uid()) then
    raise exception 'Not a space member';
  end if;
  v_pro := public.space_owner_is_pro(p_space_id);
  return query
    select
      v_pro,
      public.plan_max_members(v_pro),
      case when v_pro then 'pro'::text else 'free'::text end;
end;
$$;

grant execute on function public.user_is_pro_active(uuid) to authenticated;
grant execute on function public.space_owner_is_pro(uuid) to authenticated;
grant execute on function public.get_space_plan_limits(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce owned-space create limit (invited spaces do not count)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_owned_space_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro boolean;
  v_limit int;
  v_owned int;
begin
  v_pro := public.user_is_pro_active(new.created_by);
  v_limit := public.plan_max_owned_spaces(v_pro);

  select count(*)::int into v_owned
  from public.space_members sm
  where sm.user_id = new.created_by
    and sm.role = 'owner';

  -- BEFORE INSERT: current owned count is spaces already owned; new one would be +1.
  if v_owned >= v_limit then
    raise exception 'SPACE_LIMIT'
      using errcode = 'P0001',
            detail = format('plan=%s limit=%s current=%s',
              case when v_pro then 'pro' else 'free' end, v_limit, v_owned);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_owned_space_limit on public.spaces;
create trigger trg_enforce_owned_space_limit
  before insert on public.spaces
  for each row execute function public.enforce_owned_space_limit();

-- ---------------------------------------------------------------------------
-- Enforce member limit on accept_join_request (gate by SPACE OWNER Pro)
-- ---------------------------------------------------------------------------
create or replace function public.accept_join_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.space_join_requests%rowtype;
  v_count int;
  v_pro boolean;
  v_limit int;
begin
  select * into r from public.space_join_requests where id = p_request_id for update;
  if not found then
    return false;
  end if;
  if r.status <> 'pending' then
    return false;
  end if;
  if not public.is_space_member(r.space_id, auth.uid()) then
    raise exception 'Only space members can accept join requests';
  end if;

  select count(*)::int into v_count
  from public.space_members
  where space_id = r.space_id;

  v_pro := public.space_owner_is_pro(r.space_id);
  v_limit := public.plan_max_members(v_pro);

  if v_count >= v_limit then
    raise exception 'MEMBER_LIMIT'
      using errcode = 'P0001',
            detail = format('plan=%s limit=%s current=%s',
              case when v_pro then 'pro' else 'free' end, v_limit, v_count);
  end if;

  update public.space_join_requests
  set status = 'accepted', resolved_at = now()
  where id = p_request_id;

  insert into public.space_members (space_id, user_id, role)
  values (r.space_id, r.requester_id, 'member')
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.accept_join_request(uuid) to authenticated;

comment on table public.user_entitlements is
  'Apple StoreKit 2 Pro subscription entitlement per user. Written by verify-apple-entitlement Edge Function (service_role). App Store Server Notifications V2 is a recommended follow-up for renewals/refunds.';
