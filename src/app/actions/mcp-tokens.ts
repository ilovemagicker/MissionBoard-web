"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import { generateMcpSecret, hashMcpSecret } from "@/lib/mcp/token-crypto";
import type { McpScope } from "@/lib/mcp/types";

export type McpTokenListItem = {
  id: string;
  name: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

async function requireUser() {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

function normalizeScopes(input: string[] | undefined): McpScope[] {
  const set = new Set<McpScope>(["read"]);
  for (const s of input ?? []) {
    if (s === "write_missions") set.add("write_missions");
  }
  return Array.from(set);
}

export async function listMcpTokensAction(): Promise<{
  tokens?: McpTokenListItem[];
  error?: string;
}> {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("mcp_personal_access_tokens")
      .select("id,name,scopes,expires_at,revoked_at,last_used_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { tokens: (data ?? []) as McpTokenListItem[] };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function createMcpTokenAction(input: {
  name: string;
  scopes?: string[];
  expiresInDays?: number | null;
}): Promise<{ token?: string; id?: string; error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const name = (input.name || "MCP").trim().slice(0, 80) || "MCP";
    const scopes = normalizeScopes(input.scopes);
    const secret = generateMcpSecret();
    const token_hash = hashMcpSecret(secret);

    let expires_at: string | null = null;
    if (input.expiresInDays && input.expiresInDays > 0) {
      const d = Math.min(365, Math.floor(input.expiresInDays));
      expires_at = new Date(Date.now() + d * 86400_000).toISOString();
    }

    const { data, error } = await supabase
      .from("mcp_personal_access_tokens")
      .insert({
        user_id: user.id,
        token_hash,
        name,
        scopes,
        expires_at,
      })
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/app/settings");
    // Plaintext returned once — never stored.
    return { token: secret, id: data.id };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function revokeMcpTokenAction(
  tokenId: string
): Promise<{ ok?: true; error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("mcp_personal_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (error) throw error;
    revalidatePath("/app/settings");
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
