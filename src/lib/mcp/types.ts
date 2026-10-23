import type { SupabaseClient, User } from "@supabase/supabase-js";

export type McpScope = "read" | "write_missions";

export type McpAuthContext = {
  userId: string;
  email: string | null;
  displayName: string | null;
  tokenId: string;
  scopes: McpScope[];
  /** User-scoped Supabase client — RLS applies. Never service_role. */
  supabase: SupabaseClient;
  user: User;
};

export const MCP_SCOPES: McpScope[] = ["read", "write_missions"];

export function hasScope(scopes: readonly string[], needed: McpScope): boolean {
  return scopes.includes(needed);
}
