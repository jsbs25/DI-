# Privacy Enforcement Audit

Date: 2026-11-11  
Baseline verified at audit start: `main @ 360466c6bb02c57daa02290c51f880dce676ba04 == origin/main`, clean worktree.
Scope: full-chain privacy/account-control audit of user-data HTTP/WS/notification/event outlets and evidenced minimal fixes. No product/feature expansion, no schema/data migration, no notification behavior redesign, no LiveKit/media work.

## 1. Verified Baseline & Safety

- Git: `main`, `HEAD==origin/main` at start (`360466c`), clean status before changes.
- Real data preserved: `server_data.json` SHA256 `66cd7ad3be2705f7575637d41d6a0c9c6d1383897e0788cdaff100bccf4f6168` (unchanged). Real `server_data/discovery.db*` and `server_data/uploads/` not modified by tests/fixes (tests use isolated temp data + `EARTH_ONE_DISCOVERY_DB_FILE`).
- Prior docs/code reviewed: `docs/security/PRIVACY_ENFORCEMENT_AUDIT.md`, `docs/communication/EXECUTION_PROGRESS.md`, `server/privacy.ts`, `server/privacyPolicy.ts`, `server/store.ts`, `server.ts`, `server/messengerWs.ts`.

## 2. Audited Outlets (code-derived)

**HTTP user/profile/search surfaces**
- Auth/self: `/api/auth/register|login|me|current|status|dev-login|onboarding|update-profile|toggle-location|logout`, `/api/account/me`, security/bind flows (self-scoped) — return session/self/account views as designed.
- Public/profile/search: `GET /api/users`, `GET /api/users/:id`, `GET /api/search/global` — server-enforced visibility/search-field/account-status filtering with masked views and 404 for non-visible/restricted/deleted targets.
- Messenger profile/search/social: `GET /api/messenger/profile/me`, `GET /api/messenger/profile/:id`, `GET /api/messenger/username/check`, `POST /api/messenger/profile/update|avatar`, `DELETE /api/messenger/profile/avatar`, `GET /api/messenger/users/search`, `GET /api/messenger/friends`, `GET /api/messenger/friend-requests`, `GET /api/messenger/blocked`, `GET /api/messenger/recent|sync` — session-scoped; user payloads derived via privacy/masked views/helpers (see fixes).
- Conversations/messages: `/api/conversations`, `/api/conversations/:id`, direct/group create/member/rename/admin/transfer/leave/clear, message list/send/read/recall/delete/search, `/api/messenger/messages/search` — access/membership checks (`requireSessionUser`, `canAccessConversation`, policy checks); conversation list/detail masked for viewer.
- Files: `/api/messenger/upload|upload/stream`, `/api/messenger/files/:id` — owner+participant access checks, path-safe resolution.
- Notifications/calls: `/api/notifications*`, `/api/calls*` — per-user/session scoped, membership/authZ enforced.
- Other content APIs (posts/articles/videos/communities/games/library/knowledge/discovery/ads/music/AI proxy routes etc.) audited for direct internal-user-object returns: no `store.users`/raw internal user serialization found in responses; content records may include stored author snapshots (existing model) — not treated as profile-privacy projection bypass without additional evidence.

**WebSocket `/ws`**
- Auth: token validated on connect (`store.getUserByToken`); invalid rejected.
- Events: `hello/ping/pong`, `typing`, `read`, `send/send_ack/message`, `presence`, `notification*`, `profile_updated/profile_sync`, `privacy_sync`, `blocklist_sync`, conversation events (`call_*` additive). Delivery uses per-user access re-checks and masked payloads where applicable (`broadcastPresence` via `getMaskedPresenceForViewer`, `wsBroadcastConversationEvent` re-checks `canAccessConversation` and sends per-user conversation view, profile broadcast per-recipient masked).

**Notifications**
- Created server-side (`store.createNotification` / `emitNotification` flows) with actor/title/body/data fields; delivery respects prefs/DND decisions and per-user targeting. No raw internal user object serialization path identified.

## 3. Privacy/Projection Primitives (current)

- `server/privacyPolicy.ts`: `normalizePrivacySettings`, `canViewProfileByPolicy`, `canSearchByField` (profile visibility everyone/friends/self; searchable flags; presence/last-active/read-receipts/stranger/friend-request policies).
- `server/privacy.ts`: `toPublicUser(user,{privacy})` — omits email/phone/linkedIdentities/friendIds/blockedUserIds/verification-internal fields; masks private location coords; hides `isOnline/lastActiveAt` per privacy.
- `server/store.ts`: `getSelfProfileView` (owner/self), `getPublicProfileView` (viewer-aware, restricted shell or masked view), `getMaskedPresenceForViewer`, `getProfileUpdateRecipients`, `getConversationsForUser` returns viewer-masked direct `otherUser` (minimal safe shape), `searchUsers` enforces account status/discoverability/visibility/blocked/searchable fields; legacy `getPublicProfile` delegated to enforced view to prevent misuse.
- `server/messengerWs.ts`: per-recipient presence masking, conversation delivery access re-check + per-user masked conversation payload.
- `server.ts`: `/api/users`, `/api/users/:id`, `/api/search/global`, messenger profile/search/friends/requests/conv-members wired to viewer-aware masked views; per-recipient `broadcastProfileUpdated`.

## 4. Findings & Fixes (this audit run)

| ID | Finding (evidence) | Risk | Fix (minimal) |
|---|---|---|---|
| F1 | `GET /api/messenger/profile/me` registered after `GET /api/messenger/profile/:id` (`server.ts`), so `/me` matched param route (`:id='me'`) → 404, while `/api/auth/me` succeeded. Client depends on `/api/messenger/profile/me` (`src/components/chat/GlobalMessenger.tsx`). | Real API mismatch/breakage for messenger profile flows. | Reordered routes: registered `/api/messenger/profile/me` and `/api/messenger/username/check` before `/:id`; added null-guard 404 on self view. **Root cause fixed** (no behavior faking). |
| F2 | `store.getConversationsForUser` built direct `otherUser` by spreading full `other` user and only masking presence, leaking contact/internal fields (email/phone/linkedIdentities/friendIds/block lists etc.) into conversation list/recent/sync/detail/WS masked conv payloads. | Unauthorized profile-field exposure to conversation participants/viewers. | Added `getConversationOtherUserView(viewer,other)` returning minimal safe viewer-aware shape via `getPublicProfileView`/masked presence (no contact/internal fields); `getConversationsForUser` now uses it. |
| F3 | Messenger endpoints built ad-hoc user snippets: `/api/messenger/users/search` returned raw-ish mapped fields; `/api/messenger/friends` and `/api/messenger/friend-requests` included presence/location/user info not consistently routed through enforced profile view; `/api/conversations/:id` members exposed hand-built fields. | Inconsistent masking / potential field/presence leakage. | Rewired to viewer-aware `getPublicProfileView`/masked-presence minimal safe fields; filtered restricted/deleted/unviewable entries where appropriate. |
| F4 | Legacy `store.getPublicProfile(viewerId,userId)` (unused in current call sites) returned raw location/presence. | Future accidental unmasked exposure. | Delegated to `getPublicProfileView` (privacy-enforced) for defense-in-depth. |

No evidence-supported fix applied for posts/articles/videos author snapshots, call participant display snapshots, or other non-profile-projection content fields in this pass (risk/compat reviewed; out of proven bypass scope).

## 5. `/api/messenger/profile/me` Investigation (required)

- **Symptom**: prior report — `/api/messenger/profile/me` 404 while `/api/auth/me` 200 in same isolated session.
- **Root cause**: Express route ordering/shadowing. `GET /api/messenger/profile/:id` was defined before `GET /api/messenger/profile/me`; request path `/api/messenger/profile/me` matched `:id` with `id="me"`, handler called `store.getPublicProfileView(viewer,"me")` → null → 404. Auth/session middleware (`requireSessionUser`) was consistent; no account-state/privacy deny involved.
- **Evidence**: route positions in `server.ts` before fix (`:id` earlier than `/me`), `GlobalMessenger.tsx` uses `/api/messenger/profile/me`.
- **Resolution**: fixed route order (real business/client-used endpoint) + null guard. Automated compatibility check now reports `{"messenger":200,"auth":200}` in privacy suite. No response-shape change, no fake 200.

## 6. Account State & Permission Notes (code-evidenced)

- States: `active | suspended | restricted | deleted` (`store.getAccountStatus`, default legacy active).
- Login/session: `loginUser` rejects suspended/deleted; `canLoginAccount` allows active; `getUserByToken` returns null for suspended/deleted → authenticated HTTP (`requireSessionUser`/`getSessionUser`) and WS connect (`attachMessengerWs`) reject invalid/non-usable sessions. Restricted may login per existing policy; broader feature limits are policy-dependent elsewhere (not altered).
- Search/profile: deleted excluded from discovery paths; `searchUsers`/profile routes enforce visibility, blocked, searchable fields, and 404 for non-visible/restricted.
- Established WS: send/read/typing and conversation delivery re-check `canAccessConversation`/policies per action/delivery; presence/profile/conversation payloads masked per recipient. Long-lived sockets are not force-terminated on in-memory state transitions in this pass (token revalidation occurs on connect); treated as residual operational hardening item, not newly introduced.

## 7. Automated Verification (isolated temp data+DB)

| Check | Status | Evidence |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | PASS | exit 0 |
| `npm run build` | PASS | Vite build succeeded (pre-existing chunk warning only) |
| `scripts/test_api.ts` | PASS | `HTTP API regression: 85 passed, 0 failed` |
| `scripts/test_public_users_api.ts` | PASS | `Public users API regression: 24 passed, 0 failed` (isolated DB) |
| `scripts/tests-security/test_privacy_enforcement.ts` | PASS | `34 PASS / 0 FAIL / 0 BLOCKED / 0 NOT TESTED` — profiles everyone/friends/self (non-friend/friend/owner/anon), coord/presence/last-active masking, no contact/internal leak, search/displayName/username/EARTH-ID discoverability & global-search non-leak, WS legit delivery, post-removal access re-check (no delivery to removed member), per-recipient profile broadcast masking, compat (`/messenger/profile/me` 200, friends list, 404 nonexistent) |
| `scripts/test_communication_regression.ts` | PASS | 17 PASS / 0 FAIL / 1 NOT TESTED / 0 BLOCKED (real two-browser GUI/E2E NOT TESTED) |
| `scripts/test_calls_regression.ts` | PASS | 11 PASS / 0 FAIL / 2 NOT TESTED / 2 BLOCKED (real media/device controls/network recovery NOT TESTED; LiveKit A/V & media teardown BLOCKED — no runtime) |

## 8. Coverage Gaps / Not Fully Automated in This Pass

- Account states `suspended/restricted/deleted` end-to-end across every outlet and old-token/old-WS invalidation after state transition: **NOT TESTED** comprehensively (partially constrained by lack of public admin/state-mutation API in isolated run; core token/session gates evidenced in code).
- Blocked-user profile/search visibility in every UI-adjacent endpoint variant, multi-device concurrent physical clients, post-unfriend/post-block live WS eviction semantics: **PARTIALLY TESTED** (group-removal WS re-check PASS; broader scenarios NOT TESTED).
- Real Electron/GUI/multi-device E2E: **NOT TESTED**.
- Real Google/WeChat OAuth: **NOT TESTED**.
- LiveKit media/A-V/cross-border: **BLOCKED/NOT TESTED** (environment/credentials/runtime).

## 9. Residual Risks

- Long-lived authenticated WS connections may persist until reconnect even if account becomes suspended/deleted mid-session (connect-time token validation + per-action access checks mitigate but do not force-close sockets).
- Author/user snapshots embedded in legacy content records (posts/articles/comments/videos/calls display fields) are not dynamically privacy-projected; no new exposure introduced, but global retroactive masking is a larger compatibility change.
- Any future endpoint returning raw `User` objects must continue to route through `getPublicProfileView`/`getSelfProfileView`/`toPublicUser`.

## 10. Data/Artifact Safety

- `server_data.json` SHA256 unchanged: `66cd7ad3be2705f7575637d41d6a0c9c6d1383897e0788cdaff100bccf4f6168`.
- No `.env`, secrets, tokens, personal data, build artifacts, real DB, or uploads modified/committed.
