import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const revoked = await revokeApiKey(user.id, id);
  if (!revoked) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
