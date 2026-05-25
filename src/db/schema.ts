import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

// ============ context_resources ============
// Small text/file snippets mounted into a chat with per-resource visibility.
export const contextResources = pgTable("context_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  addedById: uuid("added_by_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull(),
  permission: text("permission").notNull().default("shared"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  kindCheck: check("context_resources_kind_check", sql`${t.kind} in ('text', 'file')`),
  permissionCheck: check("context_resources_permission_check", sql`${t.permission} in ('private', 'shared')`),
  sizeCheck: check("context_resources_size_check", sql`${t.sizeBytes} >= 0 and ${t.sizeBytes} <= 102400`),
  contentBytesCheck: check("context_resources_content_bytes_check", sql`octet_length(${t.content}) <= 102400`),
}));

// ============ api_keys ============
// Bearer tokens for external MCP/automation callers. Only the SHA-256 hash is stored.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hashedKey: text("hashed_key").notNull().unique(),
  name: text("name").notNull().default("API key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// ============ audit_events ============
// Append-only security and safety event log. chatId intentionally has no FK so
// chat deletion does not erase the audit trail.
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  chatId: uuid("chat_id"),
  eventType: text("event_type").notNull(),
  meta: jsonb("meta").notNull().default({}),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type ContextResource = typeof contextResources.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
