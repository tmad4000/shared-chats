import Anthropic from "@anthropic-ai/sdk";
import { withUserDb } from "@/db/client";
import { usageEvents } from "@/db/schema";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  // Don't throw at import time — modules used in build won't have the key set.
  console.warn("[anthropic] ANTHROPIC_API_KEY not set; chat replies will fail.");
}

export const anthropic = new Anthropic({ apiKey });

export const CLAUDE_MODEL = "claude-sonnet-4-5";
export const SYSTEM_PROMPT =
  "You are Claude in a shared-chat workspace where multiple humans can prompt you. Be concise, helpful, and aware that other people may see your responses. When referenced files or context aren't available yet (this is an MVP), be transparent about that. If the user asks to share the current chat, use the share_chat tool and include the returned URL in your reply.";

export const SHARE_CHAT_TOOL: Anthropic.Tool = {
  name: "share_chat",
  description: "Promote the current chat session to a shared workspace. Returns a URL teammates can use to join.",
  input_schema: {
    type: "object",
    properties: {
      recipients: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of emails to invite. Informational only until invite emails ship.",
      },
      mode: {
        type: "string",
        enum: ["multiplayer", "viewer"],
        default: "multiplayer",
        description: "Access mode for the shared workspace.",
      },
    },
    required: [],
  },
};

export type ClaudeMessageParam = Anthropic.MessageParam;
export type ClaudeMessage = Anthropic.Message;
export type ClaudeToolUseBlock = Anthropic.ToolUseBlock;

export async function generateReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!apiKey) {
    return "(Demo mode — no ANTHROPIC_API_KEY configured. Set the env var in Cloud Run.)";
  }
  // Anthropic requires alternating turns starting with "user"
  const messages = history.filter((m) => m.content.trim().length > 0);
  if (messages.length === 0) return "(Empty conversation — say something to start)";

  const resp = await createClaudeMessage(
    messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  );

  return extractText(resp) || "(No reply)";
}

export async function createClaudeMessage(
  messages: ClaudeMessageParam[],
  options?: { systemPrompt?: string; billedUserId?: string; chatId?: string },
): Promise<ClaudeMessage> {
  if (!apiKey) {
    return {
      id: "demo",
      type: "message",
      role: "assistant",
      model: CLAUDE_MODEL,
      content: [
        {
          type: "text",
          text: "(Demo mode — no ANTHROPIC_API_KEY configured. Set the env var in Cloud Run.)",
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        server_tool_use: null,
      },
    } as ClaudeMessage;
  }

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: options?.systemPrompt ?? SYSTEM_PROMPT,
    messages,
    tools: [SHARE_CHAT_TOOL],
    tool_choice: { type: "auto" },
  });

  if (options?.billedUserId && options.chatId) {
    await logUsageEvent({
      userId: options.billedUserId,
      chatId: options.chatId,
      inputTokens: resp.usage.input_tokens ?? 0,
      outputTokens: resp.usage.output_tokens ?? 0,
    });
  }

  return resp;
}

export function extractText(resp: ClaudeMessage): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function logUsageEvent(input: {
  userId: string;
  chatId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  await withUserDb(input.userId, async (tx) => {
    await tx.insert(usageEvents).values({
      userId: input.userId,
      chatId: input.chatId,
      model: CLAUDE_MODEL,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    });
  });
}
