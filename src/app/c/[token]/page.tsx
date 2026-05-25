import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db/client";
import { shareLinks, chatMembers, chats, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function joinAction(formData: FormData) {
  "use server";
  const token = formData.get("token") as string;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/c/${token}`);

  const link = (
    await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
      .limit(1)
  )[0];
  if (!link) redirect("/");

  await db
    .insert(chatMembers)
    .values({ chatId: link.chatId, userId: user.id, joinedViaToken: token })
    .onConflictDoNothing();

  redirect(`/chat/${link.chatId}`);
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/c/${token}`);

  const link = (
    await db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
      .limit(1)
  )[0];
  if (!link) notFound();

  // If user is already owner or member, auto-redirect
  const chat = (await db.select().from(chats).where(eq(chats.id, link.chatId)).limit(1))[0];
  if (!chat) notFound();
  if (chat.ownerId === user.id) redirect(`/chat/${chat.id}`);
  const existingMember = (
    await db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chat.id), eq(chatMembers.userId, user.id)))
      .limit(1)
  )[0];
  if (existingMember) redirect(`/chat/${chat.id}`);

  // Otherwise show join confirmation
  const owner = (await db.select().from(users).where(eq(users.id, chat.ownerId)).limit(1))[0];

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "100px 24px" }}>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Join a shared chat?
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 24 }}>
        <strong>{owner?.name || owner?.email}</strong> shared a chat with you.
      </p>

      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Chat
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{chat.title}</div>
      </div>

      <form action={joinAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" style={{
          background: "var(--accent)", color: "white", border: 0,
          padding: "12px 22px", borderRadius: 8, fontSize: 15, fontWeight: 500,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Join chat
        </button>
      </form>
    </main>
  );
}
