import { createHash, randomBytes } from "node:crypto";

export const MCP_TOKEN_PREFIX = "wa_mcp_";

/** Generate plaintext secret (shown once). */
export function generateMcpSecret(): string {
  return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashMcpSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function looksLikeMcpSecret(value: string): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(MCP_TOKEN_PREFIX) &&
    value.length >= MCP_TOKEN_PREFIX.length + 32 &&
    value.length <= 200
  );
}
