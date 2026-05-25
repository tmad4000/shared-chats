import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { db } from "@/db/client";
import { chats, messages } from "@/db/schema";
import { asc, eq, gt } from "drizzle-orm";
import { generateReply } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

// GET /api/chats/:id/messages?after=<ISO timestamp> — polling endpoint
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  if (!(await userCanAccessChat(user.id, chatId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const afterParam = url.searchParams.get("after");
  const afterDate = afterParam ? new Date(afterParam) : null;

  const rows = await db
    .select()
    .from(messages)
    .where(
      afterDate && !isNaN(afterDate.getTime())
        ? gt(messages.createdAt, afterDate)
        : eq(messages.chatId, chatId),
    )
    .orderBy(asc(messages.createdAt));

  // Re-filter to the specific chat (drizzle "and" with afterDate would be cleaner but this is simpler)
  const filtered = rows.filter((m) => m.chatId === chatId);

  return Response.json({ messages: filtered });
}

// POST /api/chats/:id/messages — user sends a message; agent replies
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  if (!(await userCanAccessChat(user.id, chatId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const content = body?.content;
  if (typeof content !== "string" || !content.trim()) {
    return Response.json({ error: "content required" }, { status: 400 });
  }

  // 1. Insert user message
  const [userMsg] = await db
    .insert(messages)
    .values({
      chatId,
      authorId: user.id,
      role: "user",
      content: content.trim(),
    })
    .returning();

  // 2. Touch chat updated_at
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

  // 3. Fire off the agent reply in the same request — fine for MVP
  //    (later: queue + stream). For polling readers, the reply will appear on the next poll.
  let assistantMsg = null;
  try {
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));

    const turns = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const reply = await generateReply(turns);
    const [inserted] = await db
      .insert(messages)
      .values({
        chatId,
        authorId: null,
        role: "assistant",
        content: reply,
      })
      .returning();
    assistantMsg = inserted;
    await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
  } catch (e) {
    console.error("[anthropic] reply failed", e);
    // Don't fail the whole request — user message is saved; agent message can retry.
  }

  return Response.json({ message: userMsg, reply: assistantMsg });
}
