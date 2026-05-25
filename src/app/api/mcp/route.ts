import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { authenticateBearerToken } from "@/lib/api-keys";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chatMembers, chats, contextResources, messages } from "@/db/schema";
import { createShareLink } from "@/lib/share";
import { getRequestOrigin } from "@/lib/http";
import { listVisibleContextResources, normalizeContextInput } from "@/lib/context";
import { getAuditRequestMeta, logEvent, type AuditRequestMeta } from "@/lib/audit";
import { checkBudget } from "@/lib/budget";

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

  const server = createServer(auth.user.id, getRequestOrigin(req), getAuditRequestMeta(req));
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

function createServer(userId: string, baseUrl: string, auditMeta: AuditRequestMeta) {
  const server = new McpServer(
    { name: "shared-chats", version: "0.0.5" },
    {
      capabilities: { tools: {} },
      instructions: "Use list_chats to discover visible chats. Use attach_context to mount small text/file context on a chat. Use share_chat with a chatId to create a join URL.",
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
      await logEvent({
        userId,
        chatId,
        eventType: "share.create",
        meta: {
          token: result.token,
          reused: result.reused,
          recipientCount: result.recipients.length,
          mode: result.mode,
          surface: "mcp",
        },
        ...auditMeta,
      });
      return jsonToolResult(result);
    },
  );

  server.registerTool(
    "list_context",
    {
      title: "List Context",
      description: "List context resources visible to the authenticated user for a chat.",
      inputSchema: z.object({ chatId: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ chatId }) => {
      const data = await listContext(userId, chatId);
      if (!data) {
        return { content: [{ type: "text", text: "Chat not found or not visible." }], isError: true };
      }
      return jsonToolResult({ resources: data });
    },
  );

  server.registerTool(
    "attach_context",
    {
      title: "Attach Context",
      description: "Attach a small text or file context resource to a visible chat. Content must be 100KB or smaller.",
      inputSchema: z.object({
        chatId: z.string().min(1),
        kind: z.enum(["text", "file"]),
        name: z.string().min(1),
        content: z.string().min(1),
        mimeType: z.string().optional(),
        permission: z.enum(["private", "shared"]).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ chatId, kind, name, content, mimeType, permission }) => {
      const result = await attachContext(userId, chatId, { kind, name, content, mimeType, permission });
      if (!result.ok) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }
      await logEvent({
        userId,
        chatId,
        eventType: "context.add",
        meta: {
          resourceId: getRecordId(result.resource),
          kind,
          permission: permission ?? "shared",
          sizeBytes: Buffer.byteLength(content, "utf8"),
          surface: "mcp",
        },
        ...auditMeta,
      });
      return jsonToolResult({ resource: result.resource });
    },
  );

  server.registerTool(
    "remove_context",
    {
      title: "Remove Context",
      description: "Remove a context resource from a chat if the authenticated user uploaded it or owns the chat.",
      inputSchema: z.object({
        chatId: z.string().min(1),
        resourceId: z.string().min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ chatId, resourceId }) => {
      const removed = await removeContext(userId, chatId, resourceId);
      if (!removed) {
        return { content: [{ type: "text", text: "Context not found or not removable." }], isError: true };
      }
      await logEvent({
        userId,
        chatId,
        eventType: "context.remove",
        meta: { resourceId, surface: "mcp" },
        ...auditMeta,
      });
      return jsonToolResult({ ok: true, resourceId });
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
      const accessible = await withUserDb(userId, (tx) => userCanAccessChat(userId, chatId, tx));
      if (!accessible) {
        return { content: [{ type: "text", text: "Chat not found or not visible." }], isError: true };
      }

      const budget = await checkBudget(userId);
      if (!budget.ok) {
        await logEvent({
          userId,
          chatId,
          eventType: "budget.exceeded",
          meta: { used: budget.used, cap: budget.cap, resetAt: budget.resetAt.toISOString(), surface: "mcp" },
          ...auditMeta,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "daily_budget_exceeded",
                used: budget.used,
                cap: budget.cap,
                resetAt: budget.resetAt.toISOString(),
              }),
            },
          ],
          isError: true,
        };
      }

      const created = await appendUserMessage(userId, chatId, content);
      if (!created) {
        return { content: [{ type: "text", text: "Chat not found or not visible." }], isError: true };
      }
      await logEvent({
        userId,
        chatId,
        eventType: "message.send",
        meta: { messageId: created.id, contentLength: created.content.length, surface: "mcp" },
        ...auditMeta,
      });
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

async function listContext(userId: string, chatId: string) {
  return withUserDb(userId, async (tx) => {
    if (!(await userCanAccessChat(userId, chatId, tx))) return null;
    return listVisibleContextResources(tx, chatId);
  });
}

async function attachContext(
  userId: string,
  chatId: string,
  input: {
    kind: "text" | "file";
    name: string;
    content: string;
    mimeType?: string;
    permission?: "private" | "shared";
  },
): Promise<{ ok: true; resource: unknown } | { ok: false; error: string }> {
  const parsed = normalizeContextInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return withUserDb(userId, async (tx) => {
    if (!(await userCanAccessChat(userId, chatId, tx))) {
      return { ok: false, error: "Chat not found or not visible." };
    }

    const [resource] = await tx
      .insert(contextResources)
      .values({
        chatId,
        addedById: userId,
        kind: parsed.value.kind,
        name: parsed.value.name,
        content: parsed.value.content,
        mimeType: parsed.value.mimeType,
        sizeBytes: parsed.value.sizeBytes,
        permission: parsed.value.permission,
      })
      .returning();
    return { ok: true, resource };
  });
}

async function removeContext(userId: string, chatId: string, resourceId: string) {
  return withUserDb(userId, async (tx) => {
    if (!(await userCanAccessChat(userId, chatId, tx))) return false;
    const deleted = await tx
      .delete(contextResources)
      .where(and(eq(contextResources.chatId, chatId), eq(contextResources.id, resourceId)))
      .returning({ id: contextResources.id });
    return deleted.length > 0;
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

function getRecordId(value: unknown): string | undefined {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : undefined;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
  };
}
