import type { Message } from "@/db/schema";

export type ChatStreamEvent =
  | { type: "message"; message: Message }
  | { type: "assistant.delta"; delta: string }
  | { type: "assistant.done" }
  | { type: "assistant.error"; message: string };

type Listener = (event: ChatStreamEvent) => void;

const listenersByChat = new Map<string, Set<Listener>>();

export function subscribeToChatStream(chatId: string, listener: Listener): () => void {
  let listeners = listenersByChat.get(chatId);
  if (!listeners) {
    listeners = new Set();
    listenersByChat.set(chatId, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) listenersByChat.delete(chatId);
  };
}

export function broadcastChatEvent(chatId: string, event: ChatStreamEvent) {
  const listeners = listenersByChat.get(chatId);
  if (!listeners) return;

  for (const listener of listeners) {
    listener(event);
  }
}
