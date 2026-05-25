import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanAdminChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { shareLinks } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { createShareLink } from "@/lib/share";
import { getRequestOrigin } from "@/lib/http";
import { getAuditRequestMeta, logEvent } from "@/lib/audit";
import { check as checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/chats/:id/share — list active share links for owners.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAdminChat(user.id, chatId, tx))) {
      return Response.json({ error: "only the owner can manage share links" }, { status: 403 });
    }

    const links = await tx
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.chatId, chatId), isNull(shareLinks.revokedAt)))
      .orderBy(asc(shareLinks.createdAt));

    return Response.json({
      links: links.map((link) => ({
        token: link.token,
        createdAt: link.createdAt,
      })),
    });
  });
}

// POST /api/chats/:id/share — create (or return existing) share link.
// THIS IS THE CORE SHARE ENDPOINT — exposed to UI button, agent tool, MCP, CLI.
//
// Body (all optional in v0.0.2):
//   { reuse?: boolean }  default true — returns existing un-revoked link if present
//
// Response: { url, token, created_at }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { id: chatId } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reuse = body?.reuse !== false; // default true
  const auditMeta = getAuditRequestMeta(req);

  const rate = checkRateLimit(`share:${user.id}`, 10, 60_000);
  if (!rate.ok) {
    await logEvent({
      userId: user.id,
      chatId,
      eventType: "rate_limit.exceeded",
      meta: { key: "share", limit: 10, windowMs: 60_000, retryAfterMs: rate.retryAfterMs, surface: "rest" },
      ...auditMeta,
    });
    return Response.json(
      { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(rate.retryAfterMs) } },
    );
  }

  const result = await createShareLink(chatId, user.id, {
    baseUrl: getRequestOrigin(req),
    reuse,
  });
  if (!result) {
    return Response.json({ error: "only the owner can share" }, { status: 403 });
  }
  await logEvent({
    userId: user.id,
    chatId,
    eventType: "share.create",
    meta: {
      token: result.token,
      reused: result.reused,
      recipientCount: result.recipients.length,
      mode: result.mode,
      surface: "rest",
    },
    ...auditMeta,
  });
  return Response.json(result);
}
