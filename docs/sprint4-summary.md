# Sprint 4 Summary

Date: 2026-05-25
Version: v0.0.6
Live URL: https://shared-chats-wiic7h46da-uc.a.run.app

## What Landed

- Added append-only `audit_events` with `/api/me/audit` returning the caller's last 100 events.
- Wired audit events for share create/revoke, chat join, message send, context add/remove, API key create/revoke, budget exceeded, and rate-limit exceeded.
- Added `usage_events` and daily per-user token budget enforcement before Claude calls.
- Logged Anthropic `usage` after every billed `createClaudeMessage` call.
- Added default daily cap of 200,000 tokens per user, configurable with `DAILY_TOKEN_CAP`.
- Added process-local rate limits:
  - messages: 30/min/user
  - shares: 10/min/user
  - joins: 20/min/IP
  - API key mutations: 5/hour/user
- Added Anthropic key rotation prep:
  - `scripts/rotate-anthropic-key.sh`
  - `docs/secrets-rotation.md`
- Updated MCP `send_message` so it appends the user message, invokes Claude, stores the assistant reply, and returns both messages.
- Bumped visible/app/MCP version to v0.0.6.

## Verification

- `npm run build` passes locally.
- Applied `audit_events` and `usage_events` migrations to Cloud SQL and reapplied RLS policies.
- Deployed Cloud Run revisions through Sprint 4, ending with the v0.0.6 release.
- Smoke tests covered:
  - `GET /api/health`
  - creating a share link and reading the matching `share.create` event from `/api/me/audit`
  - sending a live message and confirming a `usage_events` row was recorded
  - triggering API-key rate limiting with five successful creates followed by a 429 and `rate_limit.exceeded` audit event
  - MCP `send_message` returning both the user message and assistant reply

## Caveats

- Rate limiting is in-memory per Cloud Run instance. It is acceptable for v0.0.6 low-traffic demos, but public launch should move this to Redis or another shared store.
- Audit insert uses a SECURITY DEFINER function and `audit_events` has RLS enabled, but `FORCE ROW LEVEL SECURITY` is disabled for that table so the definer function can append. The `/api/me/audit` endpoint still filters by caller and runs under `withUserDb`.
- Better Auth magic-link remains deferred to Sprint 4.5; current email auth is still trust-on-first-use.
- The Anthropic key was not rotated. Rotation tooling is ready, but Jacob still needs to create and provide a new dashboard key.
- Daily budget checks happen before each Claude call, but a single large request can still push a user over the cap after completion. Hard preflight token estimation remains future work.
