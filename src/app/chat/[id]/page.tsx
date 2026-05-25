import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { db } from "@/db/client";
import { chats, messages, chatMembers, users } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { ChatClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/chat/${id}`);
  if (!(await userCanAccessChat(user.id, id))) notFound();

  const chat = (await db.select().from(chats).where(eq(chats.id, id)).limit(1))[0];
  if (!chat) notFound();

  const initialMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, id))
    .orderBy(asc(messages.createdAt));

  // member list (for presence display)
  const memberRows = await db
    .select()
    .from(chatMembers)
    .where(eq(chatMembers.chatId, id));
  const memberUserIds = [chat.ownerId, ...memberRows.map((m) => m.userId)];
  const memberUsers = memberUserIds.length
    ? await db.select().from(users).where(inArray(users.id, Array.from(new Set(memberUserIds))))
    : [];

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
