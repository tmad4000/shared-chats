import { NextRequest } from "next/server";
import { signInWithEmail } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body?.email;
    const name = body?.name;
    if (typeof email !== "string") {
      return Response.json({ error: "email required" }, { status: 400 });
    }
    const user = await signInWithEmail(email, typeof name === "string" ? name : undefined);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Login failed";
    return Response.json({ error: msg }, { status: 400 });
  }
}
