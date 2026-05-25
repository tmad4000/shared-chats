import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chats, messages } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  extractText,
  streamClaudeMessage,
  SYSTEM_PROMPT,
  type ClaudeMessageParam,
  type ClaudeToolUseBlock,
} from "@/lib/anthropic";
import { createShareLink, type ShareMode } from "@/lib/share";
import { getRequestOrigin } from "@/lib/http";
import { buildSystemPromptWithContext, listVisibleContextResources } from "@/lib/context";
import { getAuditRequestMeta, logEvent, type AuditRequestMeta } from "@/lib/audit";
import { checkBudget } from "@/lib/budget";
import { check as checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { broadcastChatEvent } from "@/lib/message-stream";

export const dynamic = "force-dynamic";

// GET /api/chats/:id/messages?after=<ISO timestamp> — polling endpoint
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  const url = new URL(req.url);
  const afterParam = url.searchParams.get("after");
  const afterDate = afterParam ? new Date(afterParam) : null;

  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const filtered = await tx
      .select()
      .from(messages)
      .where(
        afterDate && !isNaN(afterDate.getTime())
          ? and(eq(messages.chatId, chatId), gt(messages.createdAt, afterDate))
          : eq(messages.chatId, chatId),
      )
      .orderBy(asc(messages.createdAt));

    return Response.json({ messages: filtered });
  });
}

// POST /api/chats/:id/messages — user sends a message; agent replies
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  const body = await req.json();
  const content = body?.content;
  if (typeof content !== "string" || !content.trim()) {
    return Response.json({ error: "content required" }, { status: 400 });
  }

  const auditMeta = getAuditRequestMeta(req);
  const canAccess = await withUserDb(user.id, (tx) => userCanAccessChat(user.id, chatId, tx));
  if (!canAccess) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const rate = checkRateLimit(`msg:${user.id}`, 30, 60_000);
  if (!rate.ok) {
    await logEvent({
      userId: user.id,
      chatId,
      eventType: "rate_limit.exceeded",
      meta: { key: "msg", limit: 30, windowMs: 60_000, retryAfterMs: rate.retryAfterMs, surface: "rest" },
      ...auditMeta,
    });
    return Response.json(
      { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.retryAfterMs) } },
    );
  }

  const budget = await checkBudget(user.id);
  if (!budget.ok) {
    await logEvent({
      userId: user.id,
      chatId,
      eventType: "budget.exceeded",
      meta: { used: budget.used, cap: budget.cap, resetAt: budget.resetAt.toISOString(), surface: "rest" },
      ...auditMeta,
    });
    return Response.json(
      {
        error: "daily_budget_exceeded",
        used: budget.used,
        cap: budget.cap,
        resetAt: budget.resetAt.toISOString(),
      },
      { status: 429 },
    );
  }

  const userMsg = await withUserDb(user.id, async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        chatId,
        authorId: user.id,
        role: "user",
        content: content.trim(),
      })
      .returning();

    await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
    return inserted;
  });

  if (!userMsg) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  await logEvent({
    userId: user.id,
    chatId,
    eventType: "message.send",
    meta: { messageId: userMsg.id, contentLength: userMsg.content.length, surface: "rest" },
    ...auditMeta,
  });
  broadcastChatEvent(chatId, { type: "message", message: userMsg });

  let assistantMsg = null;
  try {
    const replyInput = await withUserDb(user.id, async (tx) => {
      const history = await tx
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(asc(messages.createdAt));
      const resources = await listVisibleContextResources(tx, chatId);
      return { history, resources };
    });

    const turns: ClaudeMessageParam[] = replyInput.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const systemPrompt = buildSystemPromptWithContext(SYSTEM_PROMPT, replyInput.resources);
    const reply = await generateReplyWithTools(
      turns,
      chatId,
      user.id,
      getRequestOrigin(req),
      systemPrompt,
      auditMeta,
      (delta) => broadcastChatEvent(chatId, { type: "assistant.delta", delta }),
    );
    assistantMsg = await withUserDb(user.id, async (tx) => {
      const [inserted] = await tx
        .insert(messages)
        .values({
          chatId,
          authorId: null,
          role: "assistant",
          content: reply,
        })
        .returning();
      await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
      return inserted;
    });
    if (assistantMsg) {
      broadcastChatEvent(chatId, { type: "message", message: assistantMsg });
      broadcastChatEvent(chatId, { type: "assistant.done" });
    }
  } catch (e) {
    console.error("[anthropic] reply failed", e);
    broadcastChatEvent(chatId, {
      type: "assistant.error",
      message: "Claude failed to respond. Your message was saved.",
    });
    return Response.json(
      {
        message: userMsg,
        reply: null,
        error: { code: "assistant_failed", message: "Claude failed to respond. Your message was saved." },
      },
      { status: 502 },
    );
  }

  return Response.json({ message: userMsg, reply: assistantMsg });
}

async function generateReplyWithTools(
  conversation: ClaudeMessageParam[],
  chatId: string,
  userId: string,
  baseUrl: string,
  systemPrompt: string,
  auditMeta: AuditRequestMeta,
  onDelta: (delta: string) => void,
): Promise<string> {
  const messages = [...conversation];

  for (let i = 0; i < 3; i++) {
    const resp = await streamClaudeMessage(messages, onDelta, { systemPrompt, billedUserId: userId, chatId });
    const toolUses = resp.content.filter((block): block is ClaudeToolUseBlock => block.type === "tool_use");

    if (toolUses.length === 0) {
      return extractText(resp) || "(No reply)";
    }

    messages.push({
      role: "assistant",
      content: resp.content as ClaudeMessageParam["content"],
    });

    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        if (toolUse.name !== "share_chat") {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Unknown tool: ${toolUse.name}`,
          };
        }

        const input = parseShareToolInput(toolUse.input);
        const result = await createShareLink(chatId, userId, {
          baseUrl,
          recipients: input.recipients,
          mode: input.mode,
          reuse: true,
        });

        if (!result) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            is_error: true,
            content: "Only the chat owner can share this chat.",
          };
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
            surface: "agent_tool",
          },
          ...auditMeta,
        });

        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result.url,
        };
      }),
    );

    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  return "I tried to use a tool, but the tool loop did not finish. Please try again.";
}

function parseShareToolInput(input: unknown): { recipients?: string[]; mode?: ShareMode } {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const recipients = Array.isArray(raw.recipients)
    ? raw.recipients.filter((recipient): recipient is string => typeof recipient === "string")
    : undefined;
  const mode = raw.mode === "viewer" || raw.mode === "multiplayer" ? raw.mode : undefined;
  return { recipients, mode };
}
