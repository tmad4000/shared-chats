# Sprint 2 Summary

Date: 2026-05-25
Version: v0.0.4
Live URL: https://shared-chats-wiic7h46da-uc.a.run.app

## What Landed

- Added an in-app Anthropic `share_chat` tool. When the user asks Claude to share the current chat, Claude now calls the tool and replies with the generated join URL.
- Extracted share-link creation into `src/lib/share.ts` so the UI route, in-app agent tool, and MCP tool all use the same owner-checking share logic.
- Added `/.well-known/mcp/server-card.json` with server metadata, tool discovery, auth requirements, and an OpenAPI hint.
- Added per-user API keys with hashed storage in `api_keys`, cookie-auth management at `/api/api-keys`, and transaction-scoped RLS policies.
- Added a stateless MCP Streamable HTTP JSON-RPC endpoint at `/api/mcp` using `@modelcontextprotocol/sdk`.
- Exposed MCP tools: `list_chats`, `get_chat`, `share_chat`, and v0 `send_message`.
- Bumped visible/app version to v0.0.4.

## Verification

- `npm run build` passes locally.
- Applied the `api_keys` migration to Cloud SQL and reapplied RLS policies.
- Deployed Cloud Run revision `shared-chats-00006-4v5`.
- `curl https://shared-chats-wiic7h46da-uc.a.run.app/api/health` returns version `0.0.4`.
- `curl https://shared-chats-wiic7h46da-uc.a.run.app/.well-known/mcp/server-card.json` returns a valid JSON object whose tools include `share_chat`.
- Live in-app smoke test: owner created a chat, sent "Share this chat with sarah@example.com.", Claude returned a `/c/<token>` URL, and a second user signed in and joined through that URL.
- Live MCP smoke test: minted a cookie-auth API key, then called `/api/mcp` with a bearer token to initialize, list tools, and call `share_chat`.

## Caveats

- MCP curl calls through the SDK transport require `Accept: application/json, text/event-stream`; plain curl without that header receives HTTP 406.
- `send_message` currently appends a user message only. It does not invoke the in-app Claude reply loop yet.
- `recipients` and `mode` are accepted and returned by share tools, but recipient email invites are still Sprint 4 territory.
