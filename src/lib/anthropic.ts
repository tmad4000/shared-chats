import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  // Don't throw at import time — modules used in build won't have the key set.
  console.warn("[anthropic] ANTHROPIC_API_KEY not set; chat replies will fail.");
}

export const anthropic = new Anthropic({ apiKey });

const MODEL = "claude-sonnet-4-5";

export async function generateReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!apiKey) {
    return "(Demo mode — no ANTHROPIC_API_KEY configured. Set the env var in Cloud Run.)";
  }
  // Anthropic requires alternating turns starting with "user"
  const messages = history.filter((m) => m.content.trim().length > 0);
  if (messages.length === 0) return "(Empty conversation — say something to start)";

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "You are Claude in a shared-chat workspace where multiple humans can prompt you. Be concise, helpful, and aware that other people may see your responses. When referenced files or context aren't available yet (this is an MVP), be transparent about that.",
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text || "(No reply)";
}
