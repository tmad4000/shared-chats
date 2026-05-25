import { db } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// True if the user is the owner OR is in chat_members for this chat.
export async function userCanAccessChat(userId: string, chatId: string): Promise<boolean> {
  const chat = (await db.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
  if (!chat) return false;
  if (chat.ownerId === userId) return true;

  const member = (
    await db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
      .limit(1)
  )[0];
  return Boolean(member);
}

// True if the user can change sharing (currently: owner only).
export async function userCanAdminChat(userId: string, chatId: string): Promise<boolean> {
  const chat = (await db.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
  if (!chat) return false;
  return chat.ownerId === userId;
}
