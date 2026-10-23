import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeArgs } from "@/lib/mcp/sanitize";

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    tokenId: string;
    userId: string;
    tool: string;
    args?: Record<string, unknown>;
    ok: boolean;
    error?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("mcp_audit_log").insert({
      token_id: params.tokenId,
      user_id: params.userId,
      tool: params.tool,
      args_summary: summarizeArgs(params.tool, params.args),
      ok: params.ok,
      error: params.error ? String(params.error).slice(0, 500) : null,
    });
  } catch {
    // Never fail the tool because audit insert failed
  }
}
