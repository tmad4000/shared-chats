import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { chats, messages, chatMembers, users } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { ChatClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/chat/${id}`);

  const data = await withUserDb(user.id, async (tx) => {
    if (!(await userCanAccessChat(user.id, id, tx))) return null;

    const chat = (await tx.select().from(chats).where(eq(chats.id, id)).limit(1))[0];
    if (!chat) return null;

    const initialMessages = await tx
      .select()
      .from(messages)
      .where(eq(messages.chatId, id))
      .orderBy(asc(messages.createdAt));

    // member list (for presence display)
    const memberRows = await tx
      .select()
      .from(chatMembers)
      .where(eq(chatMembers.chatId, id));
    const memberUserIds = [chat.ownerId, ...memberRows.map((m) => m.userId)];
    const memberUsers = memberUserIds.length
      ? await tx.select().from(users).where(inArray(users.id, Array.from(new Set(memberUserIds))))
      : [];

    return { chat, initialMessages, memberUsers };
  });

  if (!data) notFound();
  const { chat, initialMessages, memberUsers } = data;
  if (!chat) notFound();

  return (
    <ChatClient
      chat={chat}
      currentUser={{ id: user.id, email: user.email, name: user.name }}
      initialMessages={initialMessages}
      members={memberUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isOwner: u.id === chat.ownerId,
      }))}
    />
  );
}
