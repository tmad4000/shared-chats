import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";

// ============ users ============
// Email is the natural identity (matches betterGPT design — see note-sharing-service.ts
// in Cortex: principal stays as email to avoid race on registration).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ chats ============
// One chat = one conversation thread. Owner is the user who created it.
// When promoted to shared, gains share_links + chat_members.
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ messages ============
// role = "user" (human) | "assistant" (Claude)
// authorId is null for assistant messages.
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ share_links ============
// One per share action. Token in URL: /c/<token>.
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// ============ chat_members ============
// Who has access to a chat (beyond the owner).
export const chatMembers = pgTable("chat_members", {
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  joinedViaToken: text("joined_via_token"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.chatId, t.userId] }),
}));

export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
