import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { withUserDb } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function createChatAction() {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const chat = await withUserDb(user.id, async (tx) => {
    const [created] = await tx
      .insert(chats)
      .values({ ownerId: user.id, title: "New chat" })
      .returning();
    return created;
  });
  redirect(`/chat/${chat.id}`);
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allChats = await withUserDb(user.id, async (tx) => {
    const owned = await tx
      .select()
      .from(chats)
      .where(eq(chats.ownerId, user.id))
      .orderBy(desc(chats.updatedAt))
      .limit(50);

    const memberships = await tx
      .select()
      .from(chatMembers)
      .where(eq(chatMembers.userId, user.id));
    const memberIds = memberships
      .map((m) => m.chatId)
      .filter((id) => !owned.some((c) => c.id === id));
    const memberChats = memberIds.length
      ? await tx
          .select()
          .from(chats)
          .where(or(...memberIds.map((id) => eq(chats.id, id))))
          .orderBy(desc(chats.updatedAt))
      : [];

    return [...owned, ...memberChats];
  });

  return (
    <main className="page-shell">
      <header className="page-header">
        <h1 className="page-title">Shared Chats</h1>
        <span className="page-user">
          {user.name || user.email} ·{" "}
          <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
            <button type="submit" className="link-button">sign out</button>
          </form>
        </span>
      </header>

      <section className="surface-card home-card">
        <h2 className="section-title">Start a new chat</h2>
        <p className="muted-text" style={{ fontSize: 14, marginBottom: 14 }}>
          Start a conversation with Claude. Share it with teammates anytime.
        </p>
        <form action={createChatAction}>
          <button type="submit" className="primary-button tap-target">New chat</button>
        </form>
      </section>

      <section>
        <h2 className="section-title">Your chats</h2>
        {allChats.length === 0 ? (
          <p className="empty-panel">
            No chats yet. Start a private Claude thread, then invite collaborators when it is useful.
          </p>
        ) : (
          <div className="chat-link-list">
            {allChats.map((c) => (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className="surface-card chat-list-link tap-target"
              >
                <strong>{c.title}</strong>
                <span className={`role-pill ${c.ownerId === user.id ? "owner" : "member"}`}>
                  {c.ownerId === user.id ? "owner" : "member"}
                </span>
                <time className="muted-text" style={{ fontSize: 12 }}>
                  {new Date(c.updatedAt).toLocaleString()}
                </time>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="app-footer">
        v0.0.7 · <a href="https://github.com/tmad4000/shared-chats">github.com/tmad4000/shared-chats</a> · <a href="/api/health">health</a>
      </footer>
    </main>
  );
}
