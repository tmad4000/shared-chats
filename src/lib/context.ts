import { asc, eq } from "drizzle-orm";
import { contextResources, users, type ContextResource } from "@/db/schema";
import type { UserScopedDB } from "@/db/client";

export const MAX_CONTEXT_RESOURCE_BYTES = 100 * 1024;
export const MAX_CONTEXT_INJECTION_BYTES = 50 * 1024;

export type ContextKind = "text" | "file";
export type ContextPermission = "private" | "shared";

export type ContextResourceWithAuthor = ContextResource & {
  addedByName: string | null;
  addedByEmail: string | null;
};

export function normalizeContextInput(input: unknown):
  | {
      ok: true;
      value: {
        kind: ContextKind;
        name: string;
        content: string;
        mimeType: string | null;
        permission: ContextPermission;
        sizeBytes: number;
      };
    }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "JSON body required" };
  const raw = input as Record<string, unknown>;
  const kind = raw.kind === "file" || raw.kind === "text" ? raw.kind : null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const content = typeof raw.content === "string" ? raw.content : "";
  const mimeType = typeof raw.mimeType === "string" && raw.mimeType.trim() ? raw.mimeType.trim() : null;
  const permission = raw.permission === "private" || raw.permission === "shared" ? raw.permission : "shared";
  const sizeBytes = Buffer.byteLength(content, "utf8");

  if (!kind) return { ok: false, error: "kind must be text or file" };
  if (!name) return { ok: false, error: "name required" };
  if (!content.trim()) return { ok: false, error: "content required" };
  if (sizeBytes > MAX_CONTEXT_RESOURCE_BYTES) {
    return { ok: false, error: "context content must be 100KB or smaller" };
  }

  return { ok: true, value: { kind, name, content, mimeType, permission, sizeBytes } };
}

export function normalizeContextPatch(input: unknown):
  | { ok: true; value: { name?: string; permission?: ContextPermission } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "JSON body required" };
  const raw = input as Record<string, unknown>;
  const value: { name?: string; permission?: ContextPermission } = {};

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return { ok: false, error: "name must be non-empty" };
    value.name = name;
  }
  if ("permission" in raw) {
    if (raw.permission !== "private" && raw.permission !== "shared") {
      return { ok: false, error: "permission must be private or shared" };
    }
    value.permission = raw.permission;
  }
  if (!("name" in value) && !("permission" in value)) {
    return { ok: false, error: "nothing to update" };
  }

  return { ok: true, value };
}

export async function listVisibleContextResources(
  tx: UserScopedDB,
  chatId: string,
): Promise<ContextResourceWithAuthor[]> {
  const rows = await tx
    .select({
      resource: contextResources,
      addedByName: users.name,
      addedByEmail: users.email,
    })
    .from(contextResources)
    .leftJoin(users, eq(users.id, contextResources.addedById))
    .where(eq(contextResources.chatId, chatId))
    .orderBy(asc(contextResources.createdAt));

  return rows.map((row) => ({
    ...row.resource,
    addedByName: row.addedByName,
    addedByEmail: row.addedByEmail,
  }));
}

export function buildSystemPromptWithContext(
  basePrompt: string,
  resources: ContextResourceWithAuthor[],
): string {
  if (resources.length === 0) return basePrompt;

  let remaining = MAX_CONTEXT_INJECTION_BYTES;
  const blocks: string[] = [];

  for (const resource of resources) {
    if (remaining <= 0) break;

    const author = resource.addedByName || resource.addedByEmail || "Unknown";
    const openTag = `<context name="${escapeXmlAttr(resource.name)}" added_by="${escapeXmlAttr(author)}">`;
    const closeTag = "</context>";
    const overhead = Buffer.byteLength(`${openTag}\n\n${closeTag}\n\n`, "utf8");
    const available = Math.max(0, remaining - overhead);
    if (available <= 0) break;

    const { text, truncated } = truncateUtf8(resource.content, available);
    const note = truncated ? "\n\n[Truncated because attached context exceeds the 50KB prompt budget.]" : "";
    const block = `${openTag}\n${text}${note}\n${closeTag}`;
    remaining -= Buffer.byteLength(`${block}\n\n`, "utf8");
    blocks.push(block);
  }

  if (blocks.length === 0) return basePrompt;

  return [
    "The user has attached the following context to this chat:",
    "",
    blocks.join("\n\n"),
    "",
    basePrompt,
  ].join("\n");
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const size = Buffer.byteLength(value, "utf8");
  if (size <= maxBytes) return { text: value, truncated: false };

  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) {
    end = Math.floor(end * 0.9);
  }
  while (end < value.length && Buffer.byteLength(value.slice(0, end + 1), "utf8") <= maxBytes) {
    end += 1;
  }

  return { text: value.slice(0, end), truncated: true };
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
