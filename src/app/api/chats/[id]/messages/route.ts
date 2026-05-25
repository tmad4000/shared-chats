import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chats, messages } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { generateReply } from "@/lib/anthropic";

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
    const history = await withUserDb(user.id, async (tx) =>
      tx
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(asc(messages.createdAt)),
    );

    const turns = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const reply = await generateReply(turns);
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
