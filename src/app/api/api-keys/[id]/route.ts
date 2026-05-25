import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";
import { check as checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const auditMeta = getAuditRequestMeta(req);
  const rate = checkRateLimit(`api_key:${user.id}`, 5, 60 * 60_000);
  if (!rate.ok) {
    await logEvent({
      userId: user.id,
      eventType: "rate_limit.exceeded",
      meta: { key: "api_key", limit: 5, windowMs: 60 * 60_000, retryAfterMs: rate.retryAfterMs },
      ...auditMeta,
    });
    return Response.json(
      { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.retryAfterMs) } },
    );
  }

  const revoked = await revokeApiKey(user.id, id);
  if (!revoked) return Response.json({ error: "not found" }, { status: 404 });
  await logEvent({
    userId: user.id,
    eventType: "api_key.revoke",
    meta: { apiKeyId: id },
    ...auditMeta,
  });
  return Response.json({ ok: true });
}
