import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/chats — list chats the current user can access
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  // Owned chats
  const owned = await db
    .select()
    .from(chats)
    .where(eq(chats.ownerId, user.id))
    .orderBy(desc(chats.updatedAt))
    .limit(50);

  // Member-only chats
  const memberships = await db
    .select()
    .from(chatMembers)
    .where(eq(chatMembers.userId, user.id));
  const memberIds = memberships.map((m) => m.chatId).filter((id) => !owned.some((c) => c.id === id));

  const memberChats = memberIds.length
    ? await db
        .select()
        .from(chats)
        .where(or(...memberIds.map((id) => eq(chats.id, id))))
        .orderBy(desc(chats.updatedAt))
    : [];

  return Response.json({ chats: [...owned, ...memberChats] });
}

// POST /api/chats — create a new chat
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const title = typeof body?.title === "string" && body.title.trim().length > 0
    ? body.title.trim()
    : "New chat";

  const [chat] = await db.insert(chats).values({ ownerId: user.id, title }).returning();
  return Response.json({ chat });
}
