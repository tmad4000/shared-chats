# shared-chats

Multiplayer Claude sessions with permission-gated context inheritance.

**Scaffolded:** 2026-05-22 — this is Path B from the [betterGPT multiplayer plan](https://jacobcole.ai/notestream-mockups/PLAN-option-A-vs-B.md).
**Status:** Scaffold only · architectural decisions documented · no code yet.

## What this is

A standalone repo for the "Shared Chats" product idea: any local Claude Code session can be promoted to a shared cloud workspace where teammates can join, see the conversation, prompt the same agent, and access a permission-gated slice of your personal context.

**Visual reference:** [bettergpt-multiplayer-v5 mockup](https://jacobcole.ai/notestream-mockups/bettergpt-multiplayer-v5.html)
**Sibling effort:** betterGPT (`IdeaFlowCo/cortex` branch `bettergpt/prototype-core`) is building the same product as a feature inside the existing prototype. This repo exists as a parallel hedge.

## Why this exists alongside betterGPT

Both paths are being pursued (see `docs/plan-A-vs-B.md`). Short version:

- **Path A** (betterGPT) ships fastest, reuses 30+ commits of momentum, inherits some Cortex tech debt.
- **Path B** (this repo) is a fresh-architecture alternative. Multiplayer-first design. Cleaner foundation if Path A's solo-first frame proves limiting.

The design (the v5 mockup) applies to both. The choice of which container ships first can defer.

## Tech stack (planned)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router) | Matches `collablists` — shared patterns |
| Backend | Same Next.js (or Hono if API split needed) | Single deployable for v1 |
| DB | Postgres on Cloud SQL | Same GCP project (`boreal-conquest-464203-v2`) as collablists + listhub |
| ORM | Drizzle | Type-safe migrations, no Prisma god-file risk |
| Auth | Better Auth | Matches collablists |
| Realtime | Yjs + y-websocket (TBD vs server-authoritative event log) | CRDT semantics or simpler log — decide in Block 2 |
| Agent engine | Vendor `ClaudeSessionEngine.js` from Cortex | Production-proven SDK wrapper with checkpoints/abort/streaming |
| Sandbox | GCE managed instance groups | Reuse Cortex's provider pattern, port from Hetzner |
| Deploy | Cloud Run + Cloud SQL | Same pattern as collablists |

## Modules to vendor from Cortex

When code work starts, lift these (don't fork the whole repo):

- `cloudcli/server/claude/ClaudeSessionEngine.js` — the core Claude SDK wrapper
- `cloudcli/server/claude-sdk.js` — public facade
- `cloudcli/server/services/ToolApprovalService.js` — per-tool approval gates
- Provider abstraction pattern from `backend/src/services/providers/baseVpsProvider.ts`

Do NOT vendor:
- `cloudcli/server/index.js` (3,848-line god file)
- Linq/SMS surface
- Voice/realtime sideband
- Fly.io provider (stale)

## Decision gates

This repo stays as scaffold-only until one of these triggers:

1. Path A (betterGPT in Cortex) hits a multiplayer blocker
2. A customer / design partner specifically wants the multiplayer product separately
3. Solo betterGPT lands its demo and we want to fork multiplayer for cleaner architecture
4. An architectural insight emerges worth a fresh start

## Roadmap (when activated)

See `docs/blocks.md` (TBD when work begins). Sequencing mirrors Path A:

- **Block 1:** Schema (Workspace, Member, ContextResource, Message) + auth wiring
- **Block 2:** Local → shared promotion API + minimum UI
- **Block 3:** Multiplayer prompting + presence
- **Block 4:** Per-resource ACL + revoke flow
- **Block 5:** Polish + mobile

Each block is ~1-2 agent-sessions.

## Open questions

- Brand: `bettergpt.ai/share/...` subdomain, or distinct brand?
- Pricing: solo betterGPT pricing vs team Shared Chats pricing?
- App Store: does this go to App Store as a separate product, or unified with betterGPT?
- Auth: SSO with betterGPT account, or independent?

These can defer until the product loop is proven.

## Reference paths

- Cortex source repo: `~/code/cortex/` (M3) + `~/code/cortex/` (Mac mini, has `bettergpt/prototype-core` branch)
- Cortex modules to vendor: see above
- Mockup: `https://jacobcole.ai/notestream-mockups/bettergpt-multiplayer-v5.html`
- Planning doc: `https://jacobcole.ai/notestream-mockups/PLAN-option-A-vs-B.md`
- betterGPT user-stories: `cortex/docs/plans/2026-05-19-bettergpt-user-stories.md` on `bettergpt/prototype-core` branch
