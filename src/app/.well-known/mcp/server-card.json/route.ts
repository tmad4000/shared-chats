import { MCP_TOOLS } from "@/lib/mcp-tools";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    name: "shared-chats",
    version: "0.0.5",
    description: "Multiplayer Claude chat workspaces with shareable chat sessions.",
    mcp: {
      endpoint: "/api/mcp",
      transport: "streamable-http",
      protocol: "json-rpc-2.0",
      requiredHeaders: {
        Accept: "application/json, text/event-stream",
      },
    },
    auth: {
      type: "bearer",
      header: "Authorization: Bearer <api_key>",
      apiKeyEndpoint: "/api/api-keys",
      apiKeyEndpointAuth: "cookie",
    },
    tools: MCP_TOOLS,
    openapi: {
      url: "/api/openapi.json",
      status: "planned",
    },
  });
}
