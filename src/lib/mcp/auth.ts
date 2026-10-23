import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  hashMcpSecret,
  looksLikeMcpSecret,
} from "@/lib/mcp/token-crypto";
import type { McpAuthContext, McpScope } from "@/lib/mcp/types";

type PatRow = {
  id: string;
  user_id: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
};

type SessionCacheEntry = {
  accessToken: string;
  expiresAt: number;
  userId: string;
  tokenId: string;
  scopes: McpScope[];
  email: string | null;
};

const sessionCache = new Map<string, SessionCacheEntry>();

function requirePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anon };
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname; // {ref}.supabase.co
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function serviceRoleRef(key: string): string | null {
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { ref?: string; role?: string };
    if (parsed.role && parsed.role !== "service_role") return null;
    return parsed.ref ?? null;
  } catch {
    return null;
  }
}

function createServiceClient(): SupabaseClient | null {
  const { url } = requirePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const expected = projectRefFromUrl(url);
  const actual = serviceRoleRef(key);
  if (!expected || !actual || expected !== actual) {
    // Wrong-project service role in the environment — fall back to Edge exchange.
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createUserClient(accessToken: string): SupabaseClient {
  const { url, anon } = requirePublicEnv();
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseScopes(raw: string[] | null | undefined): McpScope[] {
  const out: McpScope[] = [];
  for (const s of raw ?? []) {
    if (s === "read" || s === "write_missions") out.push(s);
  }
  if (!out.includes("read")) out.unshift("read");
  return out;
}

async function mintUserSession(
  admin: SupabaseClient,
  userId: string
): Promise<{ accessToken: string; expiresAt: number; user: User; email: string | null }> {
  const { data: userData, error: userErr } =
    await admin.auth.admin.getUserById(userId);
  if (userErr || !userData.user) {
    throw new Error("User not found for token");
  }
  const email = userData.user.email;
  if (!email) {
    throw new Error("User has no email; cannot mint MCP session");
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(linkErr?.message || "Failed to mint session link");
  }

  const { url, anon } = requirePublicEnv();
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !otpData.session?.access_token) {
    throw new Error(otpErr?.message || "Failed to verify session");
  }

  const expiresAt =
    (otpData.session.expires_at
      ? otpData.session.expires_at * 1000
      : Date.now() + 55 * 60_000) - 60_000; // refresh 1 min early

  return {
    accessToken: otpData.session.access_token,
    expiresAt,
    user: otpData.user ?? userData.user,
    email,
  };
}

async function lookupPatWithServiceRole(
  admin: SupabaseClient,
  tokenHash: string
): Promise<PatRow> {
  const { data, error } = await admin
    .from("mcp_personal_access_tokens")
    .select("id,user_id,scopes,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid token");
  const row = data as PatRow;
  if (row.revoked_at) throw new Error("Token revoked");
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error("Token expired");
  }
  return row;
}

async function exchangeViaEdgeFunction(secret: string): Promise<SessionCacheEntry> {
  const { url, anon } = requirePublicEnv();
  const res = await fetch(`${url}/functions/v1/mcp-auth`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    access_token?: string;
    expires_at?: number;
    user_id?: string;
    token_id?: string;
    scopes?: string[];
    email?: string | null;
  };
  if (!res.ok || !body.access_token || !body.user_id || !body.token_id) {
    throw new Error(body.error || `Auth exchange failed (${res.status})`);
  }
  return {
    accessToken: body.access_token,
    expiresAt: (body.expires_at ?? Math.floor(Date.now() / 1000) + 3300) * 1000,
    userId: body.user_id,
    tokenId: body.token_id,
    scopes: parseScopes(body.scopes),
    email: body.email ?? null,
  };
}

async function exchangeDirect(secret: string): Promise<SessionCacheEntry> {
  const admin = createServiceClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  const tokenHash = hashMcpSecret(secret);
  const pat = await lookupPatWithServiceRole(admin, tokenHash);
  const session = await mintUserSession(admin, pat.user_id);

  // Touch last_used_at (control plane only)
  await admin
    .from("mcp_personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", pat.id);

  return {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    userId: pat.user_id,
    tokenId: pat.id,
    scopes: parseScopes(pat.scopes),
    email: session.email,
  };
}

export async function authenticateBearer(
  authorizationHeader: string | null
): Promise<McpAuthContext> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing Bearer token", 401);
  }
  const secret = authorizationHeader.slice("Bearer ".length).trim();
  if (!looksLikeMcpSecret(secret)) {
    throw new AuthError("Invalid token format", 401);
  }

  const cacheKey = hashMcpSecret(secret);
  const cached = sessionCache.get(cacheKey);
  let entry: SessionCacheEntry;

  if (cached && cached.expiresAt > Date.now()) {
    entry = cached;
  } else {
    try {
      // Prefer direct mint only when service role matches this project.
      const admin = createServiceClient();
      entry = admin ? await exchangeDirect(secret) : await exchangeViaEdgeFunction(secret);
      sessionCache.set(cacheKey, entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unauthorized";
      throw new AuthError(msg, 401);
    }
  }

  const supabase = createUserClient(entry.accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(entry.accessToken);
  if (error || !user || user.id !== entry.userId) {
    sessionCache.delete(cacheKey);
    throw new AuthError("Session invalid", 401);
  }

  let displayName: string | null = null;
  {
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    displayName = (data?.display_name as string | undefined) ?? null;
  }

  return {
    userId: user.id,
    email: entry.email ?? user.email ?? null,
    displayName,
    tokenId: entry.tokenId,
    scopes: entry.scopes,
    supabase,
    user,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}
