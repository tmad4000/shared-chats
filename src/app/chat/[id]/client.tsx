"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import type { Chat, Message } from "@/db/schema";

type Member = { id: string; email: string; name: string | null; isOwner: boolean };
type CurrentUser = { id: string; email: string; name: string | null };
type ShareLink = { token: string; createdAt: string | Date };
type ContextResource = {
  id: string;
  chatId: string;
  addedById: string;
  kind: "text" | "file";
  name: string;
  content: string;
  mimeType: string | null;
  sizeBytes: number;
  permission: "private" | "shared";
  createdAt: string | Date;
  addedByName?: string | null;
  addedByEmail?: string | null;
};
type SendError = {
  code: "rate_limited" | "daily_budget_exceeded" | "assistant_failed" | "send_failed";
  message: string;
  content: string;
  retryAfterMs?: number;
  resetAt?: string;
};
type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const MAX_CONTEXT_BYTES = 100 * 1024;

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
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [pendingAssistant, setPendingAssistant] = useState("");
  const [streamActive, setStreamActive] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextResources, setContextResources] = useState<ContextResource[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextFormOpen, setContextFormOpen] = useState(false);
  const [contextKind, setContextKind] = useState<"text" | "file">("text");
  const [contextName, setContextName] = useState("");
  const [contextContent, setContextContent] = useState("");
  const [contextMimeType, setContextMimeType] = useState<string | null>(null);
  const [contextPermission, setContextPermission] = useState<"private" | "shared">("shared");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<{
    id: string;
    name: string;
    permission: "private" | "shared";
  } | null>(null);
  const [deletingContextId, setDeletingContextId] = useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const isOwner = chat.ownerId === currentUser.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, pendingAssistant]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const events = new EventSource(`/api/chats/${chat.id}/messages/stream`);
    events.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data) as Message;
        setMsgs((prev) => mergeMessages(prev, [msg]));
        if (msg.role === "assistant") {
          setPendingAssistant("");
          setStreamActive(false);
        }
      } catch {}
    });
    events.addEventListener("assistant.delta", (event) => {
      try {
        const data = JSON.parse(event.data) as { delta?: string };
        if (!data.delta) return;
        setStreamActive(true);
        setPendingAssistant((prev) => prev + data.delta);
      } catch {}
    });
    events.addEventListener("assistant.done", () => setStreamActive(false));
    events.addEventListener("assistant.error", (event) => {
      let message = "Claude failed to respond.";
      try {
        const data = JSON.parse(event.data) as { message?: string };
        if (data.message) message = data.message;
      } catch {}
      setPendingAssistant("");
      setStreamActive(false);
      pushToast(message, "error");
    });

    return () => events.close();
  }, [chat.id]);

  useEffect(() => {
    if (isOwner && sharePanelOpen) void loadShareLinks();
  }, [isOwner, sharePanelOpen]);

  useEffect(() => {
    void loadContextResources();
  }, [chat.id]);

  useEffect(() => {
    if (!sendError?.retryAfterMs) return;
    const timer = setInterval(() => {
      setSendError((current) => {
        if (!current?.retryAfterMs) return current;
        return { ...current, retryAfterMs: Math.max(0, current.retryAfterMs - 1000) };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sendError?.retryAfterMs]);

  function pushToast(message: string, tone: Toast["tone"] = "info") {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    await sendContent(input);
  }

  async function sendContent(rawContent: string) {
    if (!rawContent.trim() || sending) return;
    const content = rawContent.trim();
    setSending(true);
    setSendError(null);
    setInput("");
    setPendingAssistant("");
    setStreamActive(true);
    try {
      const r = await fetch(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await r.json().catch(() => ({}));
      if (payload.message) setMsgs((prev) => mergeMessages(prev, [payload.message as Message]));
      if (payload.reply) {
        setMsgs((prev) => mergeMessages(prev, [payload.reply as Message]));
        setPendingAssistant("");
        setStreamActive(false);
      }
      if (!r.ok) throw buildSendError(r.status, payload, content);
    } catch (e) {
      setSendError(
        isSendError(e)
          ? e
          : { code: "send_failed", message: e instanceof Error ? e.message : "Message failed to send.", content },
      );
      setInput(content);
      setPendingAssistant("");
      setStreamActive(false);
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
      pushToast("Could not load share links.", "error");
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
      setActionsMenuOpen(false);
      await loadShareLinks();
      try {
        await navigator.clipboard.writeText(j.url);
        setShareStatus("copied");
        pushToast("Share link copied.", "success");
        setTimeout(() => setShareStatus("idle"), 2500);
      } catch {
        setShareStatus("idle");
        pushToast("Share link created.", "success");
      }
    } catch {
      setShareStatus("error");
      pushToast("Could not create share link.", "error");
      setTimeout(() => setShareStatus("idle"), 2500);
    }
  }

  async function copyLink(token: string) {
    const url = buildShareUrl(token);
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      pushToast("Share link copied.", "success");
      setTimeout(() => setShareStatus("idle"), 1800);
    } catch {
      setShareStatus("idle");
      pushToast("Could not copy link.", "error");
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
      pushToast("Share link revoked.", "success");
    } catch {
      pushToast("Could not revoke share link.", "error");
    } finally {
      setRevokingToken(null);
    }
  }

  async function loadContextResources() {
    setContextLoading(true);
    try {
      const r = await fetch(`/api/chats/${chat.id}/context`, { cache: "no-store" });
      if (!r.ok) throw new Error("list context failed");
      const j = await r.json();
      setContextResources(j.resources ?? []);
    } catch {
      setContextResources([]);
      pushToast("Could not load context.", "error");
    } finally {
      setContextLoading(false);
    }
  }

  async function addContext(e: FormEvent) {
    e.preventDefault();
    setContextError(null);
    const sizeBytes = utf8Bytes(contextContent);
    if (!contextName.trim()) {
      setContextError("Name is required.");
      return;
    }
    if (!contextContent.trim()) {
      setContextError("Content is required.");
      return;
    }
    if (sizeBytes > MAX_CONTEXT_BYTES) {
      setContextError("Context must be 100KB or smaller.");
      return;
    }

    setContextSaving(true);
    try {
      const r = await fetch(`/api/chats/${chat.id}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: contextKind,
          name: contextName.trim(),
          content: contextContent,
          mimeType: contextMimeType,
          permission: contextPermission,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "add context failed");
      }
      resetContextForm();
      setContextFormOpen(false);
      await loadContextResources();
      pushToast("Context attached.", "success");
    } catch (err) {
      setContextError(err instanceof Error ? err.message : "Could not add context.");
    } finally {
      setContextSaving(false);
    }
  }

  async function updateContext(resourceId: string) {
    if (!editingContext) return;
    const r = await fetch(`/api/chats/${chat.id}/context/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingContext.name, permission: editingContext.permission }),
    });
    if (r.ok) {
      setEditingContext(null);
      await loadContextResources();
      pushToast("Context updated.", "success");
    } else {
      pushToast("Could not update context.", "error");
    }
  }

  async function deleteContext(resourceId: string) {
    setDeletingContextId(resourceId);
    try {
      const r = await fetch(`/api/chats/${chat.id}/context/${resourceId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      setContextResources((prev) => prev.filter((resource) => resource.id !== resourceId));
      pushToast("Context removed.", "success");
    } catch {
      pushToast("Could not remove context.", "error");
    } finally {
      setDeletingContextId(null);
    }
  }

  async function readContextFile(file: File) {
    setContextError(null);
    if (file.size > MAX_CONTEXT_BYTES) {
      setContextError("File must be 100KB or smaller.");
      return;
    }
    const text = await file.text();
    if (utf8Bytes(text) > MAX_CONTEXT_BYTES) {
      setContextError("File content must be 100KB or smaller.");
      return;
    }
    setContextKind("file");
    setContextName(file.name);
    setContextMimeType(file.type || "text/plain");
    setContextContent(text);
  }

  function resetContextForm() {
    setContextKind("text");
    setContextName("");
    setContextContent("");
    setContextMimeType(null);
    setContextPermission("shared");
    setContextError(null);
  }

  function buildShareUrl(token: string) {
    return `${window.location.origin}/c/${token}`;
  }

  function openContextPanel() {
    setContextPanelOpen((open) => !open);
    setActionsMenuOpen(false);
    if (!contextPanelOpen) void loadContextResources();
  }

  const activeMembers = members.length;
  const hiddenMobileMembers = Math.max(0, activeMembers - 1);

  return (
    <div className="chat-shell">
      <ToastStack toasts={toasts} />
      <header className="chat-header">
        <Link href="/" className="icon-link tap-target" aria-label="Back to chats">
          ‹
        </Link>
        <div className="chat-title-group">
          <h1>{chat.title}</h1>
          <span>{activeMembers} member{activeMembers === 1 ? "" : "s"}</span>
        </div>

        <div className="member-stack member-stack-desktop" aria-label={`${activeMembers} chat members`}>
          {members.slice(0, 4).map((m, i) => (
            <Avatar key={m.id} member={m} overlap={i > 0} />
          ))}
          {members.length > 4 && <span className="avatar avatar-count">+{members.length - 4}</span>}
        </div>
        <div className="member-stack member-stack-mobile" aria-label={`${activeMembers} chat members`}>
          {members[0] && <Avatar member={members[0]} />}
          {hiddenMobileMembers > 0 && <span className="avatar avatar-count">+{hiddenMobileMembers}</span>}
        </div>

        <div className="chat-actions chat-actions-desktop">
          <button
            type="button"
            onClick={openContextPanel}
            className={`secondary-button tap-target ${contextPanelOpen ? "is-active" : ""}`}
          >
            Context {contextResources.length ? `(${contextResources.length})` : ""}
          </button>
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => setSharePanelOpen((open) => !open)}
                className="secondary-button tap-target"
              >
                Links
              </button>
              <button
                type="button"
                onClick={share}
                disabled={shareStatus === "loading"}
                className="primary-button tap-target"
              >
                {shareStatus === "loading" ? <Spinner label="Sharing" /> : shareStatus === "copied" ? "Copied" : "Share"}
              </button>
            </>
          )}
        </div>

        <div className="chat-actions-mobile">
          <button
            type="button"
            className="secondary-button icon-button tap-target"
            onClick={() => setActionsMenuOpen((open) => !open)}
            aria-expanded={actionsMenuOpen}
            aria-label="More actions"
          >
            ⋯
          </button>
          {actionsMenuOpen && (
            <div className="mobile-action-menu">
              <button type="button" onClick={openContextPanel} className="menu-button">
                Context {contextResources.length ? `(${contextResources.length})` : ""}
              </button>
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSharePanelOpen((open) => !open);
                      setActionsMenuOpen(false);
                    }}
                    className="menu-button"
                  >
                    Links
                  </button>
                  <button type="button" onClick={share} disabled={shareStatus === "loading"} className="menu-button">
                    {shareStatus === "loading" ? "Sharing..." : "Share"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {shareUrl && (
        <div className="share-banner">
          <strong>Share link:</strong> <code>{shareUrl}</code> <span>Anyone with this link can join and chat.</span>
        </div>
      )}

      {isOwner && sharePanelOpen && (
        <section className="chat-panel">
          <div className="panel-inner">
            <div className="panel-heading">
              <strong>Manage share links</strong>
              <span>{linksLoading ? "Loading..." : `${shareLinks.length} active`}</span>
            </div>
            {linksLoading ? (
              <SkeletonList />
            ) : shareLinks.length === 0 ? (
              <div className="empty-panel">No active links. Create one with Share.</div>
            ) : (
              <div className="stack-list">
                {shareLinks.map((link) => (
                  <div key={link.token} className="share-row">
                    <div className="truncate">
                      <code>{link.token}</code>
                      <span>Created {new Date(link.createdAt).toLocaleString()}</span>
                    </div>
                    <button type="button" onClick={() => copyLink(link.token)} className="secondary-button tap-target">
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(link.token)}
                      disabled={revokingToken === link.token}
                      className="danger-button tap-target"
                    >
                      {revokingToken === link.token ? <Spinner label="Revoking" /> : "Revoke"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {contextPanelOpen && (
        <section className="chat-panel context-panel">
          <div className="panel-inner">
            <div className="panel-heading">
              <strong>Mounted context</strong>
              <span>{contextLoading ? "Loading..." : `${contextResources.length} visible`}</span>
              <button
                type="button"
                onClick={() => setContextFormOpen((open) => !open)}
                className="primary-button tap-target"
              >
                Add context
              </button>
            </div>

            {contextFormOpen && (
              <form onSubmit={addContext} className="context-form">
                <div className="context-form-grid">
                  <input
                    value={contextName}
                    onChange={(e) => setContextName(e.target.value)}
                    placeholder="Context name"
                    className="field"
                  />
                  <select
                    value={contextPermission}
                    onChange={(e) => setContextPermission(e.target.value as "private" | "shared")}
                    className="field"
                  >
                    <option value="shared">Shared</option>
                    <option value="private">Private</option>
                  </select>
                  <label className="file-button tap-target">
                    File
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file) void readContextFile(file);
                      }}
                    />
                  </label>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) void readContextFile(file);
                  }}
                >
                  <textarea
                    value={contextContent}
                    onChange={(e) => {
                      setContextKind("text");
                      setContextMimeType(null);
                      setContextContent(e.target.value);
                    }}
                    placeholder="Paste context text, or drop a small text file here."
                    rows={6}
                    className="field mono-field"
                  />
                </div>

                <div className="form-footer">
                  <span className={utf8Bytes(contextContent) > MAX_CONTEXT_BYTES ? "danger-text" : ""}>
                    {contextKind === "file" ? "file" : "text"} · {formatBytes(utf8Bytes(contextContent))} / 100KB
                  </span>
                  {contextError && <span className="danger-text">{contextError}</span>}
                  <button
                    type="button"
                    onClick={() => {
                      resetContextForm();
                      setContextFormOpen(false);
                    }}
                    className="secondary-button tap-target"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={contextSaving} className="primary-button tap-target">
                    {contextSaving ? <Spinner label="Adding" /> : "Add"}
                  </button>
                </div>
              </form>
            )}

            {contextLoading ? (
              <SkeletonList />
            ) : contextResources.length === 0 ? (
              <div className="empty-panel">
                No context attached. Paste text or drop a small file to give Claude something to reference.
              </div>
            ) : (
              <div className="stack-list">
                {contextResources.map((resource) => {
                  const canManage = isOwner || resource.addedById === currentUser.id;
                  const editing = editingContext?.id === resource.id;
                  return (
                    <div key={resource.id} className="context-row">
                      <span className={`resource-icon ${resource.kind === "file" ? "file" : ""}`}>
                        {resource.kind === "file" ? "F" : "T"}
                      </span>
                      <div className="truncate">
                        {editing ? (
                          <div className="edit-grid">
                            <input
                              value={editingContext.name}
                              onChange={(e) => setEditingContext({ ...editingContext, name: e.target.value })}
                              className="field"
                            />
                            <select
                              value={editingContext.permission}
                              onChange={(e) =>
                                setEditingContext({
                                  ...editingContext,
                                  permission: e.target.value as "private" | "shared",
                                })
                              }
                              className="field"
                            >
                              <option value="shared">Shared</option>
                              <option value="private">Private</option>
                            </select>
                          </div>
                        ) : (
                          <>
                            <div className="resource-title">
                              <strong>{resource.name}</strong>
                              <span className={`permission-pill ${resource.permission}`}>{resource.permission}</span>
                            </div>
                            <span>
                              {formatBytes(resource.sizeBytes)} · added by{" "}
                              {resource.addedByName || resource.addedByEmail || "unknown"}
                            </span>
                          </>
                        )}
                      </div>
                      {canManage && (
                        <div className="row-actions">
                          {editing ? (
                            <>
                              <button type="button" onClick={() => updateContext(resource.id)} className="secondary-button tap-target">
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingContext(null)} className="secondary-button tap-target">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingContext({
                                    id: resource.id,
                                    name: resource.name,
                                    permission: resource.permission,
                                  })
                                }
                                className="secondary-button tap-target"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteContext(resource.id)}
                                disabled={deletingContextId === resource.id}
                                className="danger-button tap-target"
                              >
                                {deletingContextId === resource.id ? <Spinner label="Deleting" /> : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      <main className="message-list">
        {msgs.length === 0 && !pendingAssistant ? (
          <div className="empty-chat">Start the conversation. Try &apos;@Claude help me...&apos;</div>
        ) : (
          <>
            {msgs.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                members={members}
                currentUser={currentUser}
              />
            ))}
            {pendingAssistant && <PendingAssistant content={pendingAssistant} active={streamActive} />}
            {!pendingAssistant && streamActive && <PendingAssistant content="" active />}
          </>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={send} className="composer-shell">
        {sendError && (
          <div className="send-error">
            <span>{formatSendError(sendError)}</span>
            <button
              type="button"
              onClick={() => void sendContent(sendError.content)}
              disabled={sending || (sendError.retryAfterMs ?? 0) > 0}
              className="secondary-button tap-target"
            >
              Retry{sendError.retryAfterMs ? ` in ${Math.ceil(sendError.retryAfterMs / 1000)}s` : ""}
            </button>
          </div>
        )}
        <div className="composer-box">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendContent(input);
              }
            }}
            placeholder="Message Claude..."
            rows={2}
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()} className="primary-button tap-target">
            {sending ? <Spinner label="Sending" /> : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageRow({
  message,
  members,
  currentUser,
}: {
  message: Message;
  members: Member[];
  currentUser: CurrentUser;
}) {
  const isAssistant = message.role === "assistant";
  const authorMember = isAssistant ? null : members.find((mem) => mem.id === message.authorId);
  const authorName = isAssistant
    ? "Claude"
    : authorMember?.name ||
      authorMember?.email ||
      (message.authorId === currentUser.id ? currentUser.name || currentUser.email : "Someone");
  const isCurrent = message.authorId === currentUser.id;

  return (
    <div className="message-row">
      <span className={`message-avatar ${isAssistant || isCurrent ? "accent" : ""}`}>{isAssistant ? "C" : authorName[0].toUpperCase()}</span>
      <div className="message-body">
        <div className="message-meta">
          <strong>{authorName}</strong>
          {isCurrent && <span className="you-pill">you</span>}
          <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
        </div>
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  );
}

function PendingAssistant({ content, active }: { content: string; active: boolean }) {
  return (
    <div className="message-row pending-row">
      <span className={`message-avatar accent ${active ? "pulse" : ""}`}>C</span>
      <div className="message-body">
        <div className="message-meta">
          <strong>Claude</strong>
          <span>typing</span>
        </div>
        <div className="message-content">
          {content || <span className="typing-dots">Thinking</span>}
          <span className="stream-cursor" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function Avatar({ member, overlap = false }: { member: Member; overlap?: boolean }) {
  return (
    <span
      className={`avatar ${member.isOwner ? "owner" : ""} ${overlap ? "overlap" : ""}`}
      title={`${member.name || member.email}${member.isOwner ? " (owner)" : ""}`}
    >
      {(member.name || member.email)[0].toUpperCase()}
    </span>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner-label">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="stack-list">
      <div className="skeleton-row" />
      <div className="skeleton-row short" />
    </div>
  );
}

function buildSendError(status: number, payload: Record<string, unknown>, content: string): SendError {
  const code = typeof payload.error === "string" ? payload.error : "send_failed";
  if (code === "rate_limited") {
    return {
      code: "rate_limited",
      message: "Slow down.",
      retryAfterMs: typeof payload.retryAfterMs === "number" ? payload.retryAfterMs : 30_000,
      content,
    };
  }
  if (code === "daily_budget_exceeded") {
    return {
      code: "daily_budget_exceeded",
      message: "Daily limit reached.",
      resetAt: typeof payload.resetAt === "string" ? payload.resetAt : undefined,
      content,
    };
  }
  if (code === "assistant_failed" || status >= 500) {
    const nested = payload.error && typeof payload.error === "object" ? (payload.error as Record<string, unknown>) : null;
    return {
      code: "assistant_failed",
      message: typeof nested?.message === "string" ? nested.message : "Claude failed to respond.",
      content,
    };
  }
  return { code: "send_failed", message: "Message failed to send.", content };
}

function isSendError(value: unknown): value is SendError {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value && "content" in value);
}

function formatSendError(error: SendError) {
  if (error.code === "rate_limited") {
    return `Slow down — try again in ${Math.ceil((error.retryAfterMs ?? 0) / 1000)} seconds.`;
  }
  if (error.code === "daily_budget_exceeded") {
    return `Daily limit reached. Resets at ${error.resetAt ? new Date(error.resetAt).toLocaleTimeString() : "the next reset"}.`;
  }
  return error.message;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const msg of incoming) byId.set(msg.id, msg);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}
