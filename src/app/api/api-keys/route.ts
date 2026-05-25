import { getCurrentUser } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/api-keys";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";
import { check as checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const keys = await listApiKeys(user.id);
  return Response.json({ keys });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "MCP key";
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

  const { key, apiKey } = await createApiKey(user.id, name);
  await logEvent({
    userId: user.id,
    eventType: "api_key.create",
    meta: { apiKeyId: apiKey.id, name: apiKey.name },
    ...auditMeta,
  });

  return Response.json({
    key,
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      revokedAt: apiKey.revokedAt,
    },
  });
}
