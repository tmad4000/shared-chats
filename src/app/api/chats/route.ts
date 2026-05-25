import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withUserDb } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/chats — list chats the current user can access
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const allChats = await withUserDb(user.id, async (tx) => {
    const owned = await tx
      .select()
      .from(chats)
      .where(eq(chats.ownerId, user.id))
      .orderBy(desc(chats.updatedAt))
      .limit(50);

    const memberships = await tx
      .select()
      .from(chatMembers)
      .where(eq(chatMembers.userId, user.id));
    const memberIds = memberships.map((m) => m.chatId).filter((id) => !owned.some((c) => c.id === id));

    const memberChats = memberIds.length
      ? await tx
          .select()
          .from(chats)
          .where(or(...memberIds.map((id) => eq(chats.id, id))))
          .orderBy(desc(chats.updatedAt))
      : [];

    return [...owned, ...memberChats];
  });

  return Response.json({ chats: allChats });
}

// POST /api/chats — create a new chat
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const title = typeof body?.title === "string" && body.title.trim().length > 0
    ? body.title.trim()
    : "New chat";

  const chat = await withUserDb(user.id, async (tx) => {
    const [created] = await tx.insert(chats).values({ ownerId: user.id, title }).returning();
    return created;
  });
  return Response.json({ chat });
}
