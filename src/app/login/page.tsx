"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/");

  // Read `next` from URL on the client — avoids the useSearchParams Suspense
  // bailout that was leaving the page stuck on "Loading…" on first paint.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setNext(params.get("next") || "/");
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "login failed");
      }
      // Hard-navigate so the auth cookie is sent on the next request
      window.location.href = next;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "login failed");
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <h1 className="auth-title">Shared Chats</h1>
      <p className="auth-copy" style={{ fontSize: 15, marginBottom: 32 }}>
        v0.0.7 MVP · enter your email to start chatting. No password. Trust on first use.
      </p>

      <form onSubmit={submit} className="surface-card form-card">
        <label className="form-label">
          <span>Email</span>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="field tap-target"
          />
        </label>
        <label className="form-label">
          <span>
            Display name <span className="muted-text">(optional)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jacob"
            className="field tap-target"
          />
        </label>
        {err && <div className="inline-error">{err}</div>}
        <button
          type="submit"
          disabled={busy || !email}
          className="primary-button tap-target"
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>

      <p className="app-footer" style={{ marginTop: 24 }}>
        v0.0.7 · <a href="https://github.com/tmad4000/shared-chats">tmad4000/shared-chats</a>
      </p>
    </main>
  );
}
