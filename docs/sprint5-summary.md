# Sprint 5 Summary

Date: 2026-05-25
Version: v0.0.7
Live URL: https://shared-chats-wiic7h46da-uc.a.run.app

## What Landed

- Added Anthropic token streaming with `streamClaudeMessage(...)`.
- Added a process-local chat event hub for SSE broadcasts.
- Extended `/api/chats/:id/messages` to stream `assistant.delta` events while Claude replies, then persist and broadcast the final assistant message.
- Extended `/api/chats/:id/messages/stream` to emit live `assistant.delta`, `assistant.done`, and `assistant.error` events while retaining DB polling for stored message fallback.
- Updated the chat client with a pending assistant row, animated cursor/pulsing avatar state, inline send errors, retry affordance, and rate-limit countdown copy.
- Added mobile-first chat layout:
  - sticky bottom composer,
  - compact header,
  - mobile member count badge,
  - overflow action menu for Context/Links/Share,
  - full-width message reading on phones,
  - 44px tap targets.
- Added friendly empty/loading/error states for chats, context, share links, message sends, budget limits, and rate limits.
- Added top-right toast notifications for transient share/context actions.
- Applied the mobile shell pass to home, login, and join-link pages.
- Added viewport metadata and bumped visible/app/MCP versions to v0.0.7.

## Verification

- `npm run build` passes locally.
- Deployed Cloud Run revision `shared-chats-00016-xp5`.
- `curl https://shared-chats-wiic7h46da-uc.a.run.app/api/health` returns version `0.0.7`.
- `/.well-known/mcp/server-card.json` returns version `0.0.7` and 7 tools.
- Live mobile browser smoke covered login, empty home state, chat creation, mobile header overflow, context empty state, share-link create, share-link revoke, sticky composer, and a live message send.
- Live SSE smoke confirmed token streaming on the deployed service:
  - `assistant.delta` events: 4
  - stored `message` events: 2

## Caveats

- Token deltas are broadcast through a process-local event hub. Stored messages still reach every connected browser through DB polling, but true cross-instance token-delta fanout should move to Postgres `LISTEN/NOTIFY`, Redis pub/sub, or another shared realtime channel before higher-traffic launch.
- Anthropic tool-use responses can stream text before a tool call is resolved. The final stored assistant row remains authoritative.
- Rate limiting is still in-memory per Cloud Run instance from Sprint 4.
