-- Work Assistants MCP v1: personal access tokens + audit log
-- Tokens: plaintext shown once at mint; only sha256 hex stored.

create table if not exists public.mcp_personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  name text not null default 'MCP',
  scopes text[] not null default array['read']::text[],
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_pat_token_hash_unique unique (token_hash),
  constraint mcp_pat_name_nonempty check (char_length(trim(name)) > 0),
  constraint mcp_pat_scopes_valid check (
    scopes <@ array['read', 'write_missions']::text[]
    and cardinality(scopes) >= 1
    and 'read' = any (scopes)
  )
);

create index if not exists mcp_pat_user_id_idx
  on public.mcp_personal_access_tokens (user_id);

create index if not exists mcp_pat_active_hash_idx
  on public.mcp_personal_access_tokens (token_hash)
  where revoked_at is null;

alter table public.mcp_personal_access_tokens enable row level security;

drop policy if exists mcp_pat_select_own on public.mcp_personal_access_tokens;
create policy mcp_pat_select_own
  on public.mcp_personal_access_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists mcp_pat_insert_own on public.mcp_personal_access_tokens;
create policy mcp_pat_insert_own
  on public.mcp_personal_access_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists mcp_pat_update_own on public.mcp_personal_access_tokens;
create policy mcp_pat_update_own
  on public.mcp_personal_access_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists mcp_pat_delete_own on public.mcp_personal_access_tokens;
create policy mcp_pat_delete_own
  on public.mcp_personal_access_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());

comment on table public.mcp_personal_access_tokens is
  'MCP personal access tokens. Store sha256(hex) of secret only; never plaintext.';

create table if not exists public.mcp_audit_log (
  id bigserial primary key,
  token_id uuid references public.mcp_personal_access_tokens (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  tool text not null,
  args_summary jsonb,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists mcp_audit_user_created_idx
  on public.mcp_audit_log (user_id, created_at desc);

create index if not exists mcp_audit_token_created_idx
  on public.mcp_audit_log (token_id, created_at desc);

alter table public.mcp_audit_log enable row level security;

drop policy if exists mcp_audit_select_own on public.mcp_audit_log;
create policy mcp_audit_select_own
  on public.mcp_audit_log
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists mcp_audit_insert_own on public.mcp_audit_log;
create policy mcp_audit_insert_own
  on public.mcp_audit_log
  for insert
  to authenticated
  with check (user_id = auth.uid());

comment on table public.mcp_audit_log is
  'MCP tool call audit. args_summary must never include secrets or full free text dumps.';
