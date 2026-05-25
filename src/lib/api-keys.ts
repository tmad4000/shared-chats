import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { withApiKeyDb, withUserDb } from "@/db/client";
import { apiKeys, users } from "@/db/schema";

const API_KEY_PREFIX = "sc_";

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("base64url");
}

export async function createApiKey(userId: string, name: string) {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const created = await withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(apiKeys)
      .values({
        userId,
        name: name.trim() || "API key",
        hashedKey: hashApiKey(key),
      })
      .returning();
    return row;
  });

  return { key, apiKey: created };
}

export async function listApiKeys(userId: string) {
  return withUserDb(userId, (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt)),
  );
}

export async function revokeApiKey(userId: string, id: string) {
  const updated = await withUserDb(userId, async (tx) => {
    const [row] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    return row;
  });
  return Boolean(updated);
}

export async function authenticateBearerToken(authorization: string | null) {
  const token = parseBearerToken(authorization);
  if (!token) return null;

  const hashedKey = hashApiKey(token);
  const row = await withApiKeyDb(hashedKey, async (tx) =>
    (
      await tx
        .select({
          id: apiKeys.id,
          user: users,
        })
        .from(apiKeys)
        .innerJoin(users, eq(apiKeys.userId, users.id))
        .where(and(eq(apiKeys.hashedKey, hashedKey), isNull(apiKeys.revokedAt)))
        .limit(1)
    )[0],
  );

  return row ? { apiKeyId: row.id, user: row.user, token } : null;
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
