import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db/client";
import { shareLinks, chatMembers } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/join/:token — claim a share link, adds caller as a chat_member.
// Returns the chat id so the client can redirect to /chat/<id>.
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { token } = await ctx.params;
  const link = (
    await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
      .limit(1)
  )[0];
  if (!link) return Response.json({ error: "invalid or revoked link" }, { status: 404 });

  // Idempotent insert (skip if already a member)
  try {
    await db
      .insert(chatMembers)
      .values({
        chatId: link.chatId,
        userId: user.id,
        joinedViaToken: token,
      })
      .onConflictDoNothing();
  } catch (e) {
    console.error("[join] failed", e);
    return Response.json({ error: "join failed" }, { status: 500 });
  }

  return Response.json({ chatId: link.chatId });
}
