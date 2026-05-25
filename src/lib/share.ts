import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { withUserDb } from "@/db/client";
import { shareLinks } from "@/db/schema";
import { userCanAdminChat } from "@/lib/access";

export type ShareMode = "multiplayer" | "viewer";

export type CreateShareLinkOptions = {
  baseUrl: string;
  reuse?: boolean;
  recipients?: string[];
  mode?: ShareMode;
};

export type CreateShareLinkResult = {
  token: string;
  url: string;
  createdAt: Date;
  reused: boolean;
  mode: ShareMode;
  recipients: string[];
};

export async function createShareLink(
  chatId: string,
  userId: string,
  options: CreateShareLinkOptions,
): Promise<CreateShareLinkResult | null> {
  const reuse = options.reuse !== false;
  const mode = options.mode ?? "multiplayer";
  const recipients = options.recipients ?? [];

  return withUserDb(userId, async (tx) => {
    if (!(await userCanAdminChat(userId, chatId, tx))) {
      return null;
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
        return {
          token: existing.token,
          url: buildShareUrl(options.baseUrl, existing.token),
          createdAt: existing.createdAt,
          reused: true,
          mode,
          recipients,
        };
      }
    }

    const token = generateToken();
    const [created] = await tx
      .insert(shareLinks)
      .values({ token, chatId, createdById: userId })
      .returning();

    return {
      token: created.token,
      url: buildShareUrl(options.baseUrl, created.token),
      createdAt: created.createdAt,
      reused: false,
      mode,
      recipients,
    };
  });
}

export function buildShareUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/c/${token}`;
}

function generateToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}
