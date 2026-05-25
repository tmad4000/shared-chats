import { getCurrentUser } from "@/lib/auth";
import { userCanAccessChat } from "@/lib/access";
import { withUserDb } from "@/db/client";
import { messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STREAM_POLL_MS = 1000;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const userId = user.id;

  const { id: chatId } = await ctx.params;
  const canAccess = await withUserDb(userId, (tx) => userCanAccessChat(userId, chatId, tx));
  if (!canAccess) return Response.json({ error: "forbidden" }, { status: 403 });

  const encoder = new TextEncoder();
  const seen = new Set<string>();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      async function emitNewMessages() {
        if (closed) return;
        try {
          const rows = await withUserDb(userId, async (tx) =>
            tx
              .select()
              .from(messages)
              .where(eq(messages.chatId, chatId))
              .orderBy(asc(messages.createdAt)),
          );

          for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(row)}\n\n`));
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "stream query failed" })}\n\n`),
          );
          console.error("[messages:stream] query failed", error);
        }
      }

      controller.enqueue(encoder.encode(": connected\n\n"));
      await emitNewMessages();
      interval = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
        void emitNewMessages();
      }, STREAM_POLL_MS);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
