import { getCurrentUser } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/api-keys";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";

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
  const { key, apiKey } = await createApiKey(user.id, name);
  await logEvent({
    userId: user.id,
    eventType: "api_key.create",
    meta: { apiKeyId: apiKey.id, name: apiKey.name },
    ...getAuditRequestMeta(req),
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
