# Sprint 1 Summary

Date: 2026-05-25
Version: v0.0.3
Live URL: https://shared-chats-wiic7h46da-uc.a.run.app

## What Landed

- Added Postgres RLS for `chats`, `messages`, `share_links`, and `chat_members`, plus `npm run db:rls` for reapplying the policy file.
- Added authenticated DB transaction scoping with `app.current_user_id` and `app.current_share_token` session variables.
- Added share-link management: owners can list active links, copy links, and revoke links.
- Added `DELETE /api/chats/:id/share/:token` and `GET /api/chats/:id/share`.
- Updated `/c/:token` to show an explicit revoked-link state.
- Replaced browser message polling with `GET /api/chats/:id/messages/stream` using Server-Sent Events.
- Kept `GET /api/chats/:id/messages` as a fallback endpoint.
- Bumped visible/app version to v0.0.3.

## Verification

- `npm run build` passes locally.
- Applied RLS to Cloud SQL and verified directly that user A can see their test chat while unrelated user B gets zero rows for the same chat id.
- Deployed Cloud Run revision `shared-chats-00005-lc5`.
- `curl https://shared-chats-wiic7h46da-uc.a.run.app/api/health` returns 200 with version `0.0.3`.
- Live smoke test covered login, chat creation, share-link creation/listing, join through active link, SSE receipt of a new message, revoke, active-list disappearance, and revoked-link page rendering for an unjoined user.

## Caveats

- SSE delivery uses one-second internal DB polling per open stream for v0.0.3; Postgres `LISTEN/NOTIFY` remains a later optimization.
- RLS intentionally keeps `chat_members` child-table SELECT non-recursive. Members and owners can still access chats correctly, but the UI may not always display every member avatar until we add a non-recursive membership listing path.
