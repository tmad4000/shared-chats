"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      router.push(next);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      maxWidth: 440,
      margin: "0 auto",
      padding: "80px 24px",
    }}>
      <h1 style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 40,
        letterSpacing: "-0.02em",
        marginBottom: 12,
      }}>
        Shared Chats
      </h1>
      <p style={{
        color: "var(--text-secondary)",
        fontSize: 15,
        marginBottom: 32,
      }}>
        v0.0.2 MVP · enter your email to start chatting. No password. Trust on first use.
      </p>

      <form onSubmit={submit} style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Email</span>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
            Display name <span style={{ color: "var(--text-tertiary)" }}>(optional)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jacob"
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
        </label>
        {err && (
          <div style={{
            padding: "8px 12px",
            background: "rgba(194, 120, 92, 0.10)",
            color: "#c2785c",
            borderRadius: 6,
            fontSize: 13,
          }}>{err}</div>
        )}
        <button
          type="submit"
          disabled={busy || !email}
          style={{
            background: "var(--accent)",
            color: "white",
            border: 0,
            padding: "12px 20px",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 500,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: 80, textAlign: "center" }}>Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}
