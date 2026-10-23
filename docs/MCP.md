# Work Assistants MCP v1

HTTP MCP endpoint for Cursor / assistants to operate **Work Assistants** with the same RLS as the web/app clients.

## Endpoint

- URL: `https://app.onyxlab.dev/api/mcp`
- Transport: Streamable HTTP (Web Standard), stateless
- Auth: `Authorization: Bearer wa_mcp_…` (personal access token)

## Mint a token (老闆)

1. Sign in at https://app.onyxlab.dev
2. Open **Settings → MCP（助手連線）**
3. Name the token, optionally enable **write_missions**, set expiry
4. **Create token** — copy the `wa_mcp_…` secret **once**
5. Revoke anytime from the same page

Plaintext is never stored; only SHA-256 hex of the secret is in `mcp_personal_access_tokens`.

## Cursor `mcp.json`

```json
{
  "mcpServers": {
    "work-assistants": {
      "url": "https://app.onyxlab.dev/api/mcp",
      "headers": {
        "Authorization": "Bearer wa_mcp_YOUR_SECRET"
      }
    }
  }
}
```

## Tools

| Tool | Scope | Notes |
|------|--------|------|
| `whoami` | read | user id, email, display name, scopes |
| `list_spaces` | read | |
| `list_members` | read | `space_id` |
| `list_missions` | read | `space_id`, optional `status` |
| `get_mission` | read | `mission_id` + steps |
| `create_mission` | write_missions | |
| `update_mission_status` | write_missions | |
| `list_shifts` | read | `space_id`, `from`, `to` |

Not in v1: delete space, kick, swaps, leave admin.

## Auth architecture

1. Client sends PAT (`wa_mcp_…`).
2. Server hashes secret → looks up row (via `SUPABASE_SERVICE_ROLE_KEY` **or** Edge Function `mcp-auth`).
3. Mints a short-lived **user** session JWT (`generateLink` + `verifyOtp`).
4. All mission/shift/space queries use that user JWT + anon key → **RLS applies**.
5. Service role is never used for the data plane.

## Audit

Each tool call writes `mcp_audit_log` (token_id, user_id, tool, args_summary, ok, error). Summaries omit secrets and long free text.

## Local / ops

- Migration: `039_mcp_pat_and_audit.sql`
- Edge Function: `supabase/functions/mcp-auth` (`verify_jwt = false`)
- Optional Vercel env: `SUPABASE_SERVICE_ROLE_KEY` (skips edge hop; still data-plane user-scoped)
