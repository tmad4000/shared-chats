import { getCurrentUser } from "@/lib/auth";
import { withUserDb } from "@/db/client";
import { shareLinks, chatMembers } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";
import { check as checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/join/:token — claim a share link, adds caller as a chat_member.
// Returns the chat id so the client can redirect to /chat/<id>.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const auditMeta = getAuditRequestMeta(req);
  const ip = auditMeta.ip ?? "unknown";
  const rate = checkRateLimit(`join:${ip}`, 20, 60_000);
  if (!rate.ok) {
    await logEvent({
      eventType: "rate_limit.exceeded",
      meta: { key: "join", limit: 20, windowMs: 60_000, retryAfterMs: rate.retryAfterMs },
      ...auditMeta,
    });
    return Response.json(
      { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.retryAfterMs) } },
    );
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { token } = await ctx.params;
  return withUserDb(
    user.id,
    async (tx) => {
      const link = (
        await tx
          .select()
          .from(shareLinks)
          .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
          .limit(1)
      )[0];
      if (!link) return Response.json({ error: "invalid or revoked link" }, { status: 404 });

      try {
        await tx
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

      await logEvent({
        userId: user.id,
        chatId: link.chatId,
        eventType: "chat.join",
        meta: { token },
        ...auditMeta,
      });

      return Response.json({ chatId: link.chatId });
    },
    { shareToken: token },
  );
}
