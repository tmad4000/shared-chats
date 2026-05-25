import { db, type DB, type UserScopedDB } from "@/db/client";
import { chats, chatMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type ReadDb = Pick<DB | UserScopedDB, "select">;

// True if the user is the owner OR is in chat_members for this chat.
export async function userCanAccessChat(userId: string, chatId: string, database: ReadDb = db): Promise<boolean> {
  const chat = (await database.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
  if (!chat) return false;
  if (chat.ownerId === userId) return true;

  const member = (
    await database
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
      .limit(1)
  )[0];
  return Boolean(member);
}

// True if the user can change sharing (currently: owner only).
export async function userCanAdminChat(userId: string, chatId: string, database: ReadDb = db): Promise<boolean> {
  const chat = (await database.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0];
  if (!chat) return false;
  return chat.ownerId === userId;
}
