import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chats, messages } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  createClaudeMessage,
  extractText,
  SYSTEM_PROMPT,
  type ClaudeMessageParam,
  type ClaudeToolUseBlock,
} from "@/lib/anthropic";
import { createShareLink, type ShareMode } from "@/lib/share";
import { getRequestOrigin } from "@/lib/http";
import { buildSystemPromptWithContext, listVisibleContextResources } from "@/lib/context";

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

  const userMsg = await withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return null;
    }

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
    const reply = await generateReplyWithTools(turns, chatId, user.id, getRequestOrigin(req), systemPrompt);
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
  } catch (e) {
    console.error("[anthropic] reply failed", e);
    // Don't fail the whole request — user message is saved; agent message can retry.
  }

  return Response.json({ message: userMsg, reply: assistantMsg });
}

async function generateReplyWithTools(
  conversation: ClaudeMessageParam[],
  chatId: string,
  userId: string,
  baseUrl: string,
  systemPrompt: string,
): Promise<string> {
  const messages = [...conversation];

  for (let i = 0; i < 3; i++) {
    const resp = await createClaudeMessage(messages, { systemPrompt });
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
