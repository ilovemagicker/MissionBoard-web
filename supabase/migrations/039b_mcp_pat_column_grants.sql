-- Hide token_hash from authenticated SELECT (PostgREST / app clients).
-- Insert still permitted with token_hash; service_role bypasses for lookup.

revoke select on public.mcp_personal_access_tokens from authenticated;
grant select (
  id,
  user_id,
  name,
  scopes,
  expires_at,
  revoked_at,
  last_used_at,
  created_at
) on public.mcp_personal_access_tokens to authenticated;

grant insert (
  id,
  user_id,
  token_hash,
  name,
  scopes,
  expires_at,
  revoked_at,
  last_used_at,
  created_at
) on public.mcp_personal_access_tokens to authenticated;

grant update (
  name,
  scopes,
  expires_at,
  revoked_at,
  last_used_at
) on public.mcp_personal_access_tokens to authenticated;

grant delete on public.mcp_personal_access_tokens to authenticated;
