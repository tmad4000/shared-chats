// Minimum-viable email auth for v0.0.2 MVP.
// Cookie stores an HMAC-signed payload: { uid, email, ts }.
// No password. No magic link. Trust on first use.
// PRODUCTION: replace with Better Auth + email verification before real-user launch.

import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "sc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET must be set and >= 16 chars");
  }
  return s;
}

function sign(payload: string): string {
  const h = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${h}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  // constant-time compare
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return payload;
}

export async function signInWithEmail(email: string, name?: string) {
  const lower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    throw new Error("Invalid email");
  }

  let user = (await db.select().from(users).where(eq(users.email, lower)).limit(1))[0];
  if (!user) {
    const inserted = await db
      .insert(users)
      .values({ email: lower, name: name ?? null })
      .returning();
    user = inserted[0];
  } else if (name && !user.name) {
    const updated = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, user.id))
      .returning();
    user = updated[0];
  }

  const payload = JSON.stringify({ uid: user.id, email: user.email, ts: Date.now() });
  const signed = sign(Buffer.from(payload).toString("base64url"));

  const c = await cookies();
  c.set(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return user;
}

export async function getCurrentUser() {
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = verify(raw);
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid: string;
      email: string;
      ts: number;
    };
    const user = (await db.select().from(users).where(eq(users.id, decoded.uid)).limit(1))[0];
    return user ?? null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
