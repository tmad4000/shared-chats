import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { contextResources } from "@/db/schema";
import { listVisibleContextResources, normalizeContextInput } from "@/lib/context";

export const dynamic = "force-dynamic";

// GET /api/chats/:id/context — list context visible to the caller.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const resources = await listVisibleContextResources(tx, chatId);
    return Response.json({ resources });
  });
}

// POST /api/chats/:id/context — add a small text/file context resource.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  const parsed = normalizeContextInput(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const [created] = await tx
      .insert(contextResources)
      .values({
        chatId,
        addedById: user.id,
        kind: parsed.value.kind,
        name: parsed.value.name,
        content: parsed.value.content,
        mimeType: parsed.value.mimeType,
        sizeBytes: parsed.value.sizeBytes,
        permission: parsed.value.permission,
      })
      .returning();

    const [resource] = await tx
      .select()
      .from(contextResources)
      .where(eq(contextResources.id, created.id))
      .limit(1);

    return Response.json({ resource }, { status: 201 });
  });
}
