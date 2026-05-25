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
      <main className="join-shell">
        <h1 className="join-title">This link has been revoked</h1>
        <p className="join-copy" style={{ fontSize: 15, marginBottom: 24 }}>
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
    <main className="join-shell">
      <h1 className="join-title">Join a shared chat?</h1>
      <p className="join-copy" style={{ fontSize: 15, marginBottom: 24 }}>
        <strong>{owner?.name || owner?.email}</strong> shared a chat with you.
      </p>

      <div className="surface-card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="muted-text" style={{ fontSize: 12, marginBottom: 4, textTransform: "uppercase" }}>Chat</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{chat.title}</div>
      </div>

      <form action={joinAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="primary-button tap-target">
          Join chat
        </button>
      </form>
    </main>
  );
}
