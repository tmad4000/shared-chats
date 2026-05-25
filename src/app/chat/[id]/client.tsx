"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import type { Chat, Message } from "@/db/schema";

type Member = { id: string; email: string; name: string | null; isOwner: boolean };
type CurrentUser = { id: string; email: string; name: string | null };

const POLL_MS = 2000;

export function ChatClient({
  chat,
  currentUser,
  initialMessages,
  members,
}: {
  chat: Chat;
  currentUser: CurrentUser;
  initialMessages: Message[];
  members: Member[];
}) {
  const [msgs, setMsgs] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<string | null>(
    initialMessages.length > 0 ? new Date(initialMessages[initialMessages.length - 1].createdAt).toISOString() : null,
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  // Poll for new messages every POLL_MS
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const url = lastTimestampRef.current
          ? `/api/chats/${chat.id}/messages?after=${encodeURIComponent(lastTimestampRef.current)}`
          : `/api/chats/${chat.id}/messages`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const newMsgs: Message[] = j.messages ?? [];
        if (newMsgs.length > 0 && active) {
          setMsgs((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const additions = newMsgs.filter((m) => !seen.has(m.id));
            if (additions.length === 0) return prev;
            const next = [...prev, ...additions];
            lastTimestampRef.current = new Date(next[next.length - 1].createdAt).toISOString();
            return next;
          });
        }
      } catch {}
    }
    const interval = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [chat.id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const content = input.trim();
    setSending(true);
    setInput("");
    try {
      const r = await fetch(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error("send failed");
      const j = await r.json();
      const additions: Message[] = [];
      if (j.message) additions.push(j.message);
      if (j.reply) additions.push(j.reply);
      setMsgs((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const newOnes = additions.filter((m) => !seen.has(m.id));
        const next = [...prev, ...newOnes];
        if (next.length > 0) {
          lastTimestampRef.current = new Date(next[next.length - 1].createdAt).toISOString();
        }
        return next;
      });
    } catch (e) {
      console.error(e);
      // restore the input on failure
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function share() {
    setShareStatus("loading");
    try {
      const r = await fetch(`/api/chats/${chat.id}/share`, { method: "POST" });
      if (!r.ok) throw new Error("share failed");
      const j = await r.json();
      setShareUrl(j.url);
      try {
        await navigator.clipboard.writeText(j.url);
        setShareStatus("copied");
        setTimeout(() => setShareStatus("idle"), 2500);
      } catch {
        setShareStatus("idle");
      }
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 2500);
    }
  }

  const isOwner = chat.ownerId === currentUser.id;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}>
        <Link href="/" style={{ color: "var(--text-secondary)", fontSize: 18, textDecoration: "none" }}>‹</Link>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, letterSpacing: "-0.01em", flex: 1,
        }}>
          {chat.title}
        </h1>

        {/* Members */}
        <div style={{ display: "flex", marginRight: 8 }}>
          {members.slice(0, 4).map((m, i) => (
            <span
              key={m.id}
              title={`${m.name || m.email}${m.isOwner ? " (owner)" : ""}`}
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: m.isOwner ? "var(--accent)" : "#6b6b6b",
                color: "white", fontWeight: 500, fontSize: 12,
                display: "grid", placeItems: "center",
                border: "2px solid var(--bg-card)",
                marginLeft: i === 0 ? 0 : -8,
              }}
            >
              {(m.name || m.email)[0].toUpperCase()}
            </span>
          ))}
        </div>

        {isOwner && (
          <button
            onClick={share}
            disabled={shareStatus === "loading"}
            style={{
              background: shareStatus === "copied" ? "#4a8c42" : "var(--accent)",
              color: "white", border: 0,
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {shareStatus === "loading" ? "Sharing…" :
             shareStatus === "copied" ? "✓ Copied" :
             shareStatus === "error" ? "Failed" :
             "⤴ Share"}
          </button>
        )}
      </header>

      {shareUrl && (
        <div style={{
          padding: "12px 24px",
          background: "var(--accent-bg)",
          borderBottom: "1px solid var(--border)",
          fontSize: 13,
          color: "var(--accent)",
        }}>
          <strong>Share link:</strong>{" "}
          <code style={{ background: "white", padding: "2px 8px", borderRadius: 4 }}>{shareUrl}</code>{" "}
          — anyone with this link can join and chat
        </div>
      )}

      <div style={{
        flex: 1, overflowY: "auto",
        padding: "24px 24px 12px",
        maxWidth: 820, width: "100%", margin: "0 auto",
      }}>
        {msgs.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-tertiary)", padding: "40px 0", fontSize: 14 }}>
            Say something to start the conversation.
          </div>
        ) : (
          msgs.map((m) => {
            const isAssistant = m.role === "assistant";
            const authorMember = isAssistant ? null : members.find((mem) => mem.id === m.authorId);
            const authorName = isAssistant
              ? "Claude"
              : authorMember?.name || authorMember?.email || (m.authorId === currentUser.id ? (currentUser.name || currentUser.email) : "Someone");
            const isCurrent = m.authorId === currentUser.id;
            return (
              <div key={m.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                <span style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isAssistant ? "var(--accent)" : isCurrent ? "var(--accent)" : "#6b6b6b",
                  color: "white", fontWeight: 500, fontSize: 13,
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  {isAssistant ? "🦊" : authorName[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ color: isAssistant ? "var(--accent)" : "var(--text-primary)" }}>{authorName}</strong>
                    {isCurrent && (
                      <span style={{ fontSize: 9, padding: "1px 5px", background: "var(--accent-bg)", color: "var(--accent)", borderRadius: 3, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        you
                      </span>
                    )}
                    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={{
        padding: "12px 24px 24px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "10px 12px",
          maxWidth: 820, margin: "0 auto",
          display: "flex", gap: 10, alignItems: "flex-end",
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as FormEvent);
              }
            }}
            placeholder="Message Claude… (Enter to send, Shift+Enter for newline)"
            rows={2}
            style={{
              flex: 1, border: 0, outline: 0, resize: "none",
              fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.5,
              background: "transparent", color: "var(--text-primary)",
            }}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            style={{
              background: "var(--accent)", color: "white", border: 0,
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: sending ? "wait" : "pointer", fontFamily: "inherit",
              opacity: !input.trim() ? 0.5 : 1,
              alignSelf: "flex-end",
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
