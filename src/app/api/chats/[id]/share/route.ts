import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { userCanAdminChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { shareLinks } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

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

  return withUserDb(user.id, async (tx) => {
    if (!(await userCanAdminChat(user.id, chatId, tx))) {
      return Response.json({ error: "only the owner can share" }, { status: 403 });
    }

    if (reuse) {
      const existing = (
        await tx
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
    const [created] = await tx
      .insert(shareLinks)
      .values({ token, chatId, createdById: user.id })
      .returning();

    return Response.json({
      token: created.token,
      url: buildShareUrl(req, created.token),
      createdAt: created.createdAt,
      reused: false,
    });
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
