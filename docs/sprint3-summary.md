# Sprint 3 Summary

Date: 2026-05-25
Version: v0.0.5
Live URL: https://shared-chats-wiic7h46da-uc.a.run.app

## What Landed

- Added `context_resources` with per-chat context attachments for pasted text and small inline files.
- Added server-side 100KB per-resource limits with app validation and database check constraints.
- Added RLS for context resources:
  - uploaders can see their own resources,
  - chat members can see `shared` resources,
  - uploaders or chat owners can update/delete resources.
- Added REST routes:
  - `GET /api/chats/:id/context`
  - `POST /api/chats/:id/context`
  - `PATCH /api/chats/:id/context/:resourceId`
  - `DELETE /api/chats/:id/context/:resourceId`
- Added the chat header Context panel with visible context count, context list, permission badges, edit/delete controls, paste form, file picker, and drag/drop small-file ingestion.
- Injected visible chat context into Claude's system prompt with `<context name="..." added_by="...">` blocks.
- Added a 50KB total prompt injection cap with per-resource truncation notes.
- Added MCP tools `attach_context`, `list_context`, and `remove_context`.
- Bumped visible/app version to v0.0.5.

## Verification

- `npm run build` passes locally.
- Applied the `context_resources` migration to Cloud SQL and reapplied RLS policies.
- Deployed Cloud Run revision `shared-chats-00008-vqd`.
- `curl https://shared-chats-wiic7h46da-uc.a.run.app/api/health` returns version `0.0.5`.
- `/.well-known/mcp/server-card.json` returns version `0.0.5` and includes the new context tools.
- Live REST/RLS smoke test:
  - owner attached one shared and one private context resource,
  - owner saw both,
  - joined member saw only the shared resource,
  - member could not delete the shared resource,
  - owner could delete the private resource.
- Live MCP smoke test:
  - minted a cookie-auth API key,
  - called `attach_context`,
  - confirmed `list_context` returned the attached resource,
  - removed it with `remove_context`.
- Live Claude context smoke test:
  - attached a unique marker as chat context,
  - asked Claude for the attached-context marker,
  - Claude replied with the marker from the injected context.

## Caveats

- Files are stored inline in Postgres for v0.0.5; Cloud Storage/S3 remains Sprint 4+ territory.
- The file UI reads client-side text via browser file APIs. Binary file parsing is intentionally not supported yet.
- Chat owners can update/delete private context by id through RLS, but the list UI only displays resources visible under the SELECT policy, so private resources uploaded by another user are not surfaced in the owner UI.
