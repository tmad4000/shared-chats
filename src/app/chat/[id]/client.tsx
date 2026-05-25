"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import type { Chat, Message } from "@/db/schema";

type Member = { id: string; email: string; name: string | null; isOwner: boolean };
type CurrentUser = { id: string; email: string; name: string | null };
type ShareLink = { token: string; createdAt: string | Date };

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
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isOwner = chat.ownerId === currentUser.id;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  // Stream messages. The browser handles reconnects for EventSource.
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }

    const events = new EventSource(`/api/chats/${chat.id}/messages/stream`);
    events.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data) as Message;
        setMsgs((prev) => mergeMessages(prev, [msg]));
      } catch {}
    });

    return () => {
      events.close();
    };
  }, [chat.id]);

  useEffect(() => {
    if (isOwner && sharePanelOpen) {
      void loadShareLinks();
    }
  }, [isOwner, sharePanelOpen]);

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
    } catch (e) {
      console.error(e);
      // restore the input on failure
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function loadShareLinks() {
    setLinksLoading(true);
    try {
      const r = await fetch(`/api/chats/${chat.id}/share`, { cache: "no-store" });
      if (!r.ok) throw new Error("list links failed");
      const j = await r.json();
      setShareLinks(j.links ?? []);
    } catch {
      setShareLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }

  async function share() {
    setShareStatus("loading");
    try {
      const r = await fetch(`/api/chats/${chat.id}/share`, { method: "POST" });
      if (!r.ok) throw new Error("share failed");
      const j = await r.json();
      setShareUrl(j.url);
      setSharePanelOpen(true);
      await loadShareLinks();
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

  async function copyLink(token: string) {
    const url = buildShareUrl(token);
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 1800);
    } catch {
      setShareStatus("idle");
    }
  }

  async function revoke(token: string) {
    setRevokingToken(token);
    try {
      const r = await fetch(`/api/chats/${chat.id}/share/${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("revoke failed");
      setShareLinks((prev) => prev.filter((link) => link.token !== token));
      if (shareUrl?.endsWith(`/c/${token}`)) setShareUrl(null);
    } finally {
      setRevokingToken(null);
    }
  }

  function buildShareUrl(token: string) {
    return `${window.location.origin}/c/${token}`;
  }

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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setSharePanelOpen((open) => !open)}
              style={{
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Links
            </button>
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
              {shareStatus === "loading" ? "Sharing..." :
               shareStatus === "copied" ? "Copied" :
               shareStatus === "error" ? "Failed" :
               "Share"}
            </button>
          </div>
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

      {isOwner && sharePanelOpen && (
        <div style={{
          padding: "14px 24px 16px",
          background: "rgba(255, 255, 255, 0.74)",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>Manage share links</strong>
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                {linksLoading ? "Loading..." : `${shareLinks.length} active`}
              </span>
            </div>
            {shareLinks.length === 0 && !linksLoading ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                No active links. Create one with Share.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shareLinks.map((link) => (
                  <div
                    key={link.token}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      gap: 10,
                      alignItems: "center",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "9px 10px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <code style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {link.token}
                      </code>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                        Created {new Date(link.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={() => copyLink(link.token)}
                      style={{
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        padding: "6px 10px",
                        borderRadius: 7,
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 12,
                      }}
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => revoke(link.token)}
                      disabled={revokingToken === link.token}
                      style={{
                        border: "1px solid rgba(150, 40, 40, 0.22)",
                        background: "rgba(150, 40, 40, 0.06)",
                        color: "#963030",
                        padding: "6px 10px",
                        borderRadius: 7,
                        cursor: revokingToken === link.token ? "wait" : "pointer",
                        font: "inherit",
                        fontSize: 12,
                      }}
                    >
                      {revokingToken === link.token ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const msg of incoming) byId.set(msg.id, msg);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
