# Shared Chats · the A vs B decision (and why we're doing both)

**Date:** 2026-05-22
**Context:** Session brainstorm exploring "Shared Chats" — a multiplayer Claude session product where you can promote any local chat into a shared workspace your team can join, with permission-gated context inheritance.

---

## TL;DR

We're building **both paths in parallel** because:

- **Path A** (multiplayer as a feature of betterGPT) ships fastest and reuses momentum
- **Path B** (separate `shared-chats` repo with fresh architecture) hedges against betterGPT's solo-first design constraining the multiplayer UX

Path A is primary. Path B is a parallel scaffold so the design doesn't bottleneck on which container ships first.

---

## The product · what we're actually building

A workflow where a Claude Code session that lives locally on your machine — with your codebase, your MCPs, your knowledge graph — can be **promoted** to a shared workspace your team can join. Specifically:

1. **Local solo state** — you're chatting with Claude in your terminal or browser, normal workflow.
2. **Click "Share"** — a dialog asks who joins and which context comes along (per-resource ACL).
3. **Promotion** (≤ 8s) — cloud workspace created, conversation mirrored, chosen context mounted read-only on a cloud sandbox, invites sent.
4. **Multiplayer** — invited teammates join via link, see the conversation, prompt the same agent. The agent responds with the shared context. Your unselected context (Linear MCP, personal Gmail, private notes) stays private.
5. **Revoke anytime** — removes cloud access, conversation stays in your local session.

The mockup at `mockups/bettergpt-multiplayer-v5.html` shows all of this.

---

## Why this is the differentiator

From the competitive research earlier in this session:

- **Anthropic's Claude Code session sharing** already exists but is *transcript-only* — read-only, no prompting.
- **Cursor 3's multi-user roadmap** is announced but not shipped.
- **Sauna.ai / Dust.tt** do "multiplayer AI for knowledge work" — chat with shared agent — but for Slack/Gmail/Notion, not coding agents.
- **Nobody has shipped** the specific combo: shared coding-agent session **with permission-gated personal context projection**.

That gap is what we're aiming at. The mockup's Frame 07 (per-resource ACL) is the actual moat.

---

## Path A — Inside betterGPT

**Repo:** `IdeaFlowCo/cortex`, branch `bettergpt/prototype-core`
**Brand:** betterGPT, domain `bettergpt.ai`
**Approach:** Multiplayer becomes Story 6 of the existing user-stories doc, shipped after solo polish (Stories 1-5) reaches demo quality.

### What's already in place
- 30+ commits in last 7 days on the bettergpt branch
- Working prototype (Cortex-hosted) with chat, memory cards, files, publishing
- Active UX polish phase (yesterday's Gemini audit + commits)
- Story 6 framing already in the user-stories doc: *"A private or group chat with an agent."*
- `bettergpt.ai` domain owned
- App Store assets ready

### What needs to be built
1. **Workspace schema** — formalize the durable shared-workspace entity (separate from solo session)
2. **Local → shared promotion API** — endpoint that snapshots conversation, provisions sandbox, mounts context
3. **Multiplayer prompting** — multiple humans in same workspace timeline (Yjs for ordering, or simpler: server-authoritative)
4. **Per-resource context ACL** — opt-in mounting of files, MCPs, memory graph
5. **Share UI** — the dialog from Frame 03 of v5 mockup
6. **Mobile** — phone variant per Frame 06
7. **GCE sandbox provider** — port from Cortex's Hetzner pattern

### Sequencing
- **Block 1:** Story 6 design doc + schema migration (1-2 sessions)
- **Block 2:** Local → shared promotion API + minimum UI (2-3 sessions)
- **Block 3:** Multiplayer prompting + presence (2 sessions)
- **Block 4:** Per-resource ACL + revoke flow (1-2 sessions)
- **Block 5:** Polish + mobile (1 session)

**Total estimate:** 7-10 agent-sessions after solo polish lands.

### Risk
- **Cortex tech debt** (3,848-line `cloudcli/server/index.js`, scattered workspace lifecycle) bites Block 3+. Mitigation: extract `ClaudeSessionEngine.js` into a typed module before scaling multiplayer on top of it.
- **Solo-first design lock-in** — Stories 1-5 don't assume multiple authors. Some refactoring of message-author plumbing required.

---

## Path B — New `shared-chats` repo

**Repo:** `~/code/shared-chats/` (new — being scaffolded as part of this brief)
**Brand:** TBD — could share `bettergpt.ai` subdomain, or use new (e.g. `clawd.ai`, `agentshare.ai`)
**Approach:** Greenfield TS monorepo with shared-first architecture. Vendor 3 Cortex modules. Postgres from day one. Cloud Run + GCE on existing GCP project.

### Why parallel and not "instead of"
- Solo betterGPT will continue regardless — the prototype is already in active polish.
- Path B is a *clean slate* for the multiplayer-specific architecture. If Path A's multiplayer-bolted-on attempt feels constrained, Path B is the off-ramp.
- The mockup applies to both paths — same UX, different host.

### Stack
| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 16 (matches collablists) | Stable, modern, RSC patterns |
| Backend | Same Next.js or Hono | Single deployable for v1 |
| DB | Postgres on Cloud SQL | Same project as collablists (`boreal-conquest-464203-v2`) |
| ORM | Drizzle (matches collablists) | Type-safe migrations, good DX |
| Auth | Better Auth | Matches collablists; works without lock-in |
| Realtime | Yjs + y-websocket OR server-authoritative event log | TBD — depends on whether we want CRDT semantics for the message timeline |
| Agent engine | Vendor `ClaudeSessionEngine.js` from Cortex | 3-file lift, production-proven |
| Sandbox | GCE managed instance groups | Reuse Cortex's provider pattern, port from `hetzner.ts` to `gce.ts` |
| Deploy | Cloud Run + Cloud SQL | Same model as collablists |

### What gets vendored from Cortex
- `cloudcli/server/claude/ClaudeSessionEngine.js` — the SDK wrapper with checkpoints/abort/streaming
- `cloudcli/server/services/ToolApprovalService.js` — per-tool approval gates
- Provider abstraction pattern from `backend/src/services/providers/`

### What gets reinvented fresh
- Routing layer — not the 3,848-line god file
- Workspace lifecycle — single-writer, durable workflow from day one (avoiding Cortex's "Weak" state machine)
- Database — Postgres native, no SQLite-in-prod risk
- Auth — Better Auth (matches collablists), not Cortex's bespoke email/phone OTP layer
- Share registry — clean, no subdomain magic from Cortex's `shareGateway.ts`

### Risk
- **Two codebases** — duplicated infra cost. Mitigated by: shared GCP project, similar stack to collablists, no overlap in user-facing features.
- **Brand fragmentation** — solving with: `bettergpt.ai/share/...` subdomain pointing to shared-chats deployment, OR distinct brand if positioning differs enough.
- **Three-file lift from Cortex** — but Cortex moves; need to vendor at a stable commit and keep an upstream cherry-pick path.

---

## Decision gates · when we'd shift from "doing both" to "picking one"

We continue both until one of these triggers:

| Trigger | Implication |
|---|---|
| Solo betterGPT demos publicly and gets traction | Double down on Path A · multiplayer is the natural next milestone |
| Path A multiplayer Block 2+ runs into Cortex-debt blockers | Migrate to Path B |
| External funding / customer wants multiplayer-first product separately | Path B accelerates, becomes lead |
| betterGPT brand commitment hardens around solo personal-agent | Path B gets its own brand |
| Path B reveals an architectural insight worth retrofitting | Selectively port back to Path A |

We don't have to choose today.

---

## What's been done as part of filing this plan

1. **Mockup**: `mockups/bettergpt-multiplayer-v5.html` — 8 frames showing the full share-a-local-chat workflow + multiplayer
2. **This planning doc**: `mockups/PLAN-option-A-vs-B.md`
3. **Path B scaffold**: `~/code/shared-chats/` initialized with README, plan, and tech-stack decisions
4. **Path A beads tickets**: Story 6 epic + child tickets filed in `~/code/cortex/.beads/` on the Mac mini

The next coding session can pick up either path. The design has been thought through; the choice of host can defer.

---

## Source references

- **betterGPT user-stories doc** (the Story 6 framing): `cortex` branch `bettergpt/prototype-core` · `docs/plans/2026-05-19-bettergpt-user-stories.md`
- **Yesterday's Gemini UX audit** (target UX direction): `~/.gemini/tmp/cortex-bettergpt-prototype/chats/session-2026-05-21T11-09-cfe350f3.jsonl`
- **Competitive research from this session**: Sauna, Dust, Cursor 3, Claude Cowork, Devin Managed
- **Cortex modules to vendor**: see Path B section above
