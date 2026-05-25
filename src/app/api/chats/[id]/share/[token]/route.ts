import { getCurrentUser } from "@/lib/auth";
import { userCanAdminChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { shareLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE /api/chats/:id/share/:token — revoke one share link.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; token: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId, token } = await ctx.params;
  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAdminChat(user.id, chatId, tx))) {
      return Response.json({ error: "only the owner can revoke share links" }, { status: 403 });
    }

    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.chatId, chatId), eq(shareLinks.token, token)));

    await logEvent({
      userId: user.id,
      chatId,
      eventType: "share.revoke",
      meta: { token },
      ...getAuditRequestMeta(req),
    });

    return Response.json({ ok: true });
  });
}
