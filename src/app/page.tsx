import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function createChatAction() {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [chat] = await db
    .insert(chats)
    .values({ ownerId: user.id, title: "New chat" })
    .returning();
  redirect(`/chat/${chat.id}`);
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const owned = await db
    .select()
    .from(chats)
    .where(eq(chats.ownerId, user.id))
    .orderBy(desc(chats.updatedAt))
    .limit(50);

  const memberships = await db
    .select()
    .from(chatMembers)
    .where(eq(chatMembers.userId, user.id));
  const memberIds = memberships
    .map((m) => m.chatId)
    .filter((id) => !owned.some((c) => c.id === id));
  const memberChats = memberIds.length
    ? await db
        .select()
        .from(chats)
        .where(or(...memberIds.map((id) => eq(chats.id, id))))
        .orderBy(desc(chats.updatedAt))
    : [];

  const allChats = [...owned, ...memberChats];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 40px" }}>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 36, gap: 16 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, letterSpacing: "-0.02em", flex: 1 }}>
          Shared Chats
        </h1>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {user.name || user.email} ·{" "}
          <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
            <button type="submit" style={{
              border: 0, background: "transparent", color: "var(--accent)", cursor: "pointer",
              padding: 0, font: "inherit", fontSize: 13,
            }}>sign out</button>
          </form>
        </span>
      </header>

      <section style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
      }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 4 }}>
          Start a new chat
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 14 }}>
          Start a conversation with Claude. Share it with teammates anytime.
        </p>
        <form action={createChatAction}>
          <button type="submit" style={{
            background: "var(--accent)", color: "white", border: 0,
            padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            + New chat
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 12 }}>
          Your chats
        </h2>
        {allChats.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>No chats yet — start one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allChats.map((c) => (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  textDecoration: "none",
                  color: "var(--text-primary)",
                  display: "flex", alignItems: "baseline", gap: 12,
                }}
              >
                <span style={{ fontWeight: 500, flex: 1 }}>{c.title}</span>
                <span style={{
                  fontSize: 11,
                  color: c.ownerId === user.id ? "var(--accent)" : "var(--text-tertiary)",
                  background: c.ownerId === user.id ? "var(--accent-bg)" : "transparent",
                  padding: "1px 8px", borderRadius: 4,
                }}>
                  {c.ownerId === user.id ? "owner" : "member"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {new Date(c.updatedAt).toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer style={{ marginTop: 40, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
        v0.0.2 · <a href="https://github.com/tmad4000/shared-chats" style={{ color: "var(--text-tertiary)" }}>github.com/tmad4000/shared-chats</a> · <a href="/api/health" style={{ color: "var(--text-tertiary)" }}>health</a>
      </footer>
    </main>
  );
}
