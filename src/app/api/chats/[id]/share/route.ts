import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { userCanAdminChat } from "@/lib/access";
import { db } from "@/db/client";
import { shareLinks } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
  if (!(await userCanAdminChat(user.id, chatId))) {
    return Response.json({ error: "only the owner can share" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reuse = body?.reuse !== false; // default true

  if (reuse) {
    const existing = (
      await db
        .select()
        .from(shareLinks)
        .where(and(eq(shareLinks.chatId, chatId), isNull(shareLinks.revokedAt)))
        .limit(1)
    )[0];
    if (existing) {
      return Response.json({
        token: existing.token,
        url: buildShareUrl(req, existing.token),
        createdAt: existing.createdAt,
        reused: true,
      });
    }
  }

  const token = generateToken();
  const [created] = await db
    .insert(shareLinks)
    .values({ token, chatId, createdById: user.id })
    .returning();

  return Response.json({
    token: created.token,
    url: buildShareUrl(req, created.token),
    createdAt: created.createdAt,
    reused: false,
  });
}

function generateToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

function buildShareUrl(req: NextRequest, token: string): string {
  // Prefer X-Forwarded-Host for Cloud Run (sets the right origin).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}/c/${token}`;
}
