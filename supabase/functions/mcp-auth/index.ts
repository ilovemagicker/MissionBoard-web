// Work Assistants MCP — exchange personal access token for short-lived user session.
// verify_jwt must be false (caller sends wa_mcp_…, not a Supabase JWT).
// Service role used ONLY for: token hash lookup + admin.generateLink. Never for missions/shifts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const PREFIX = "wa_mcp_";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return json(401, { error: "Missing Bearer token" });
  }
  const secret = auth.slice(7).trim();
  if (!secret.startsWith(PREFIX) || secret.length < PREFIX.length + 32) {
    return json(401, { error: "Invalid token format" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: "Server misconfigured" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const tokenHash = await sha256Hex(secret);
    const { data: pat, error: patErr } = await admin
      .from("mcp_personal_access_tokens")
      .select("id,user_id,scopes,expires_at,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (patErr) return json(500, { error: patErr.message });
    if (!pat) return json(401, { error: "Invalid token" });
    if (pat.revoked_at) return json(401, { error: "Token revoked" });
    if (pat.expires_at && new Date(pat.expires_at).getTime() <= Date.now()) {
      return json(401, { error: "Token expired" });
    }

    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
      pat.user_id
    );
    if (userErr || !userData.user?.email) {
      return json(401, { error: "User not found" });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json(500, { error: linkErr?.message || "Failed to mint session" });
    }

    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpErr || !otpData.session?.access_token) {
      return json(500, { error: otpErr?.message || "Failed to verify session" });
    }

    await admin
      .from("mcp_personal_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", pat.id);

    const expiresAt =
      otpData.session.expires_at ??
      Math.floor(Date.now() / 1000) + 3600;

    return json(200, {
      access_token: otpData.session.access_token,
      expires_at: expiresAt,
      user_id: pat.user_id,
      token_id: pat.id,
      scopes: pat.scopes ?? ["read"],
      email: userData.user.email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auth failed";
    return json(500, { error: msg });
  }
});
