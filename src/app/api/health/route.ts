export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "shared-chats",
    version: "0.0.6",
    timestamp: new Date().toISOString(),
  });
}
