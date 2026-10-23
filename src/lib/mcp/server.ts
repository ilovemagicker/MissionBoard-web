import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerWaTools } from "@/lib/mcp/tools";
import type { McpAuthContext } from "@/lib/mcp/types";

export function createWaMcpServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer({
    name: "work-assistants",
    version: "1.0.0",
  });
  registerWaTools(server, ctx);
  return server;
}

/** Handle one MCP HTTP request (stateless). */
export async function handleMcpHttpRequest(
  request: Request,
  ctx: McpAuthContext
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session id — works on Vercel serverless
    sessionIdGenerator: undefined,
  });
  const server = createWaMcpServer(ctx);
  await server.connect(transport);
  return transport.handleRequest(request);
}
