import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type AuditEventType =
  | "share.create"
  | "share.revoke"
  | "chat.join"
  | "message.send"
  | "context.add"
  | "context.remove"
  | "api_key.create"
  | "api_key.revoke"
  | "budget.exceeded"
  | "rate_limit.exceeded";

export type AuditRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export function getAuditRequestMeta(req: Request): AuditRequestMeta {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return {
    ip: forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}

export async function logEvent(input: {
  userId?: string | null;
  chatId?: string | null;
  eventType: AuditEventType;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await db.execute(sql`
      select public.log_audit_event(
        ${input.userId ?? null}::uuid,
        ${input.chatId ?? null}::uuid,
        ${input.eventType},
        ${JSON.stringify(input.meta ?? {})}::jsonb,
        ${input.ip ?? null},
        ${input.userAgent ?? null}
      )
    `);
  } catch (error) {
    console.error("[audit] failed to log event", input.eventType, error);
  }
}
