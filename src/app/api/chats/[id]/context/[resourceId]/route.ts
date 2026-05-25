import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { contextResources } from "@/db/schema";
import { listVisibleContextResources, normalizeContextPatch } from "@/lib/context";

export const dynamic = "force-dynamic";

// PATCH /api/chats/:id/context/:resourceId — rename or change visibility.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId, resourceId } = await ctx.params;
  const parsed = normalizeContextPatch(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const updated = await tx
      .update(contextResources)
      .set(parsed.value)
      .where(and(eq(contextResources.chatId, chatId), eq(contextResources.id, resourceId)))
      .returning({ id: contextResources.id });

    if (updated.length === 0) {
      return Response.json({ error: "not found or not editable" }, { status: 404 });
    }

    const resource = (await listVisibleContextResources(tx, chatId)).find((r) => r.id === resourceId) ?? null;
    return Response.json({ resource });
  });
}

// DELETE /api/chats/:id/context/:resourceId — remove a context resource.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId, resourceId } = await ctx.params;
  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, chatId, tx))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const deleted = await tx
      .delete(contextResources)
      .where(and(eq(contextResources.chatId, chatId), eq(contextResources.id, resourceId)))
      .returning({ id: contextResources.id });

    if (deleted.length === 0) {
      return Response.json({ error: "not found or not editable" }, { status: 404 });
    }

    return Response.json({ ok: true });
  });
}
