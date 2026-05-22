export default function Home() {
  return (
    <main style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "80px 24px 40px",
    }}>
      <header style={{ marginBottom: 48 }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 56,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          marginBottom: 12,
        }}>
          Shared Chats
        </h1>
        <p style={{
          fontSize: 19,
          color: "var(--text-secondary)",
          maxWidth: 560,
        }}>
          Promote any local Claude session into a shared workspace. Permission-gated context, real-time multiplayer prompting.
        </p>
      </header>

      <section style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "28px 32px",
        marginBottom: 16,
        boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "var(--accent)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}>v0.0.1 · deployed scaffold</div>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 28,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}>
          The pipeline works.
        </h2>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 20 }}>
          This is a placeholder. The real product is being built. The next blocks add Better Auth, Postgres on Cloud SQL, real Claude sessions, the share endpoint with four caller surfaces (UI · agent tool · MCP · CLI), and per-resource context ACLs.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a
            href="https://jacobcole.ai/notestream-mockups/bettergpt-multiplayer-v5.html"
            style={{
              background: "var(--accent)",
              color: "white",
              padding: "10px 18px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            View v5 mockups →
          </a>
          <a
            href="https://jacobcole.ai/notestream-mockups/PLAN-option-A-vs-B.md"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              padding: "10px 18px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid var(--border)",
            }}
          >
            Plan: A vs B
          </a>
          <a
            href="https://github.com/tmad4000/shared-chats"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              padding: "10px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            github.com/tmad4000/shared-chats →
          </a>
        </div>
      </section>

      <section style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "22px 26px",
        marginBottom: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}>
        <h3 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22,
          letterSpacing: "-0.01em",
          marginBottom: 12,
        }}>
          What's coming
        </h3>
        <ul style={{
          listStyle: "none",
          padding: 0,
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.9,
        }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Block 1</strong> · Workspace schema · share-link routing</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Block 2</strong> · Share endpoint with 4 surfaces — UI · agent tool · MCP · CLI</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Block 3</strong> · Multiplayer prompting · presence · live updates</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Block 4</strong> · Per-resource ACL · files / MCPs / memory · the moat</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Block 5</strong> · Mobile polish · revoke flow</li>
        </ul>
      </section>

      <footer style={{
        marginTop: 32,
        textAlign: "center",
        color: "var(--text-tertiary)",
        fontSize: 13,
      }}>
        Running on Cloud Run · <code>boreal-conquest-464203-v2</code> ·{" "}
        <a href="/api/health" style={{ color: "var(--text-tertiary)" }}>/api/health</a>
      </footer>
    </main>
  );
}
