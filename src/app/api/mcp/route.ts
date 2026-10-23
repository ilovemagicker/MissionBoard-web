import { AuthError, authenticateBearer } from "@/lib/mcp/auth";
import { rateLimit } from "@/lib/mcp/rate-limit";
import { handleMcpHttpRequest } from "@/lib/mcp/server";
import { hashMcpSecret, looksLikeMcpSecret } from "@/lib/mcp/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function jsonError(status: number, message: string, extra?: Record<string, string>) {
  return withCors(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...(extra ?? {}),
      },
    })
  );
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const rlKey = looksLikeMcpSecret(bearer)
    ? `mcp:${hashMcpSecret(bearer).slice(0, 16)}`
    : `mcp:ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`;

  const rl = rateLimit(rlKey, 90, 60_000);
  if (!rl.ok) {
    return jsonError(429, "Rate limit exceeded", {
      "Retry-After": String(rl.retryAfterSec),
    });
  }

  let ctx;
  try {
    ctx = await authenticateBearer(authHeader);
  } catch (e) {
    if (e instanceof AuthError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(401, "Unauthorized");
  }

  try {
    const res = await handleMcpHttpRequest(request, ctx);
    return withCors(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MCP handler error";
    console.error("[mcp]", msg);
    return jsonError(500, "Internal MCP error");
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}
