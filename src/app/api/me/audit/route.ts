import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { withUserDb } from "@/db/client";
import { auditEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const events = await withUserDb(user.id, (tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.userId, user.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(100),
  );

  return Response.json({ events });
}
