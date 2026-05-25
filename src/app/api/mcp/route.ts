import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { asc, desc, eq, or } from "drizzle-orm";
import { authenticateBearerToken } from "@/lib/api-keys";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chatMembers, chats, messages } from "@/db/schema";
import { createShareLink } from "@/lib/share";
import { getRequestOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await authenticateBearerToken(req.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: "unauthorized", message: "Bearer API key required" },
      { status: 401, headers: corsHeaders() },
    );
  }

  const server = createServer(auth.user.id, getRequestOrigin(req));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ error: "invalid JSON-RPC body" }, { status: 400, headers: corsHeaders() });
    }

    const response = await transport.handleRequest(req, { parsedBody: body });
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    await server.close();
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function createServer(userId: string, baseUrl: string) {
  const server = new McpServer(
    { name: "shared-chats", version: "0.0.4" },
    {
      capabilities: { tools: {} },
      instructions: "Use list_chats to discover visible chats. Use share_chat with a chatId to create a join URL.",
    },
  );

  server.registerTool(
    "list_chats",
    {
      title: "List Chats",
      description: "List chats visible to the authenticated user.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const data = await listVisibleChats(userId);
      return jsonToolResult({ chats: data });
    },
  );

  server.registerTool(
    "get_chat",
    {
      title: "Get Chat",
      description: "Return chat metadata and messages for a visible chat.",
      inputSchema: z.object({ chatId: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ chatId }) => {
      const data = await getChat(userId, chatId);
      if (!data) {
        return { content: [{ type: "text", text: "Chat not found or not visible." }], isError: true };
      }
      return jsonToolResult(data);
    },
  );

  server.registerTool(
    "share_chat",
    {
      title: "Share Chat",
      description: "Promote a chat to a shared workspace and return a join URL.",
      inputSchema: z.object({
        chatId: z.string().min(1),
        recipients: z.array(z.string().email()).optional(),
        mode: z.enum(["multiplayer", "viewer"]).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ chatId, recipients, mode }) => {
      const result = await createShareLink(chatId, userId, {
        baseUrl,
        recipients,
        mode,
        reuse: true,
      });
      if (!result) {
        return { content: [{ type: "text", text: "Only the chat owner can share this chat." }], isError: true };
      }
      return jsonToolResult(result);
    },
  );

  server.registerTool(
    "send_message",
    {
      title: "Send Message",
      description: "Append a user message to a visible chat. This v0 tool does not invoke the in-app Claude reply.",
      inputSchema: z.object({
        chatId: z.string().min(1),
        content: z.string().min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ chatId, content }) => {
      const created = await appendUserMessage(userId, chatId, content);
      if (!created) {
        return { content: [{ type: "text", text: "Chat not found or not visible." }], isError: true };
      }
      return jsonToolResult({ message: created });
    },
  );

  void LATEST_PROTOCOL_VERSION;
  return server;
}

async function listVisibleChats(userId: string) {
  return withUserDb(userId, async (tx) => {
    const owned = await tx
      .select()
      .from(chats)
      .where(eq(chats.ownerId, userId))
      .orderBy(desc(chats.updatedAt))
      .limit(50);

    const memberships = await tx.select().from(chatMembers).where(eq(chatMembers.userId, userId));
    const memberIds = memberships.map((m) => m.chatId).filter((id) => !owned.some((c) => c.id === id));
    const memberChats = memberIds.length
      ? await tx
          .select()
          .from(chats)
          .where(or(...memberIds.map((id) => eq(chats.id, id))))
          .orderBy(desc(chats.updatedAt))
      : [];

    return [...owned, ...memberChats].map((chat) => ({
      id: chat.id,
      title: chat.title,
      role: chat.ownerId === userId ? "owner" : "member",
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }));
  });
}

async function getChat(userId: string, chatId: string) {
  return withUserDb(userId, async (tx) => {
    if (!(await userCanAccessChat(userId, chatId, tx))) return null;
    const chat = (await tx.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
    if (!chat) return null;
    const rows = await tx
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
    return { chat, messages: rows };
  });
}

async function appendUserMessage(userId: string, chatId: string, content: string) {
  return withUserDb(userId, async (tx) => {
    if (!(await userCanAccessChat(userId, chatId, tx))) return null;
    const [inserted] = await tx
      .insert(messages)
      .values({
        chatId,
        authorId: userId,
        role: "user",
        content: content.trim(),
      })
      .returning();
    await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
    return inserted;
  });
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
  };
}
