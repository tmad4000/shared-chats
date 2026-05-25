import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { withUserDb } from "@/db/client";
import { shareLinks, chatMembers, chats, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function joinAction(formData: FormData) {
  "use server";
  const token = formData.get("token") as string;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/c/${token}`);

  const link = await withUserDb(
    user.id,
    async (tx) =>
      (
        await tx
          .select()
          .from(shareLinks)
          .where(eq(shareLinks.token, token))
          .limit(1)
      )[0],
    { shareToken: token },
  );
  if (!link) redirect("/");
  if (link.revokedAt) redirect(`/c/${token}`);

  await withUserDb(
    user.id,
    async (tx) => {
      await tx
        .insert(chatMembers)
        .values({ chatId: link.chatId, userId: user.id, joinedViaToken: token })
        .onConflictDoNothing();
    },
    { shareToken: token },
  );

  redirect(`/chat/${link.chatId}`);
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/c/${token}`);

  const data = await withUserDb(
    user.id,
    async (tx) => {
      const link = (
        await tx
          .select()
          .from(shareLinks)
          .where(eq(shareLinks.token, token))
          .limit(1)
      )[0];

      if (!link) return { state: "missing" as const };
      if (link.revokedAt) return { state: "revoked" as const };

      const chat = (await tx.select().from(chats).where(eq(chats.id, link.chatId)).limit(1))[0];
      if (!chat) return { state: "missing" as const };

      const existingMember = (
        await tx
          .select()
          .from(chatMembers)
          .where(and(eq(chatMembers.chatId, chat.id), eq(chatMembers.userId, user.id)))
          .limit(1)
      )[0];

      const owner = (await tx.select().from(users).where(eq(users.id, chat.ownerId)).limit(1))[0];
      return { state: "active" as const, chat, owner, existingMember };
    },
    { shareToken: token },
  );

  if (data.state === "revoked") {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "100px 24px" }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, letterSpacing: "-0.02em", marginBottom: 8 }}>
          This link has been revoked
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 24 }}>
          Ask the chat owner for a new share link if you still need access.
        </p>
      </main>
    );
  }

  if (data.state === "missing") notFound();

  const { chat, owner, existingMember } = data;

  // If user is already owner or member, auto-redirect
  if (chat.ownerId === user.id) redirect(`/chat/${chat.id}`);
  if (existingMember) redirect(`/chat/${chat.id}`);

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
