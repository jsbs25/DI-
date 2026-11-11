# Privacy Enforcement Audit (Phase 6)

Date: 2026-11-11  
Baseline: `main @ d3dbb6f4dfb0770acb6196b043dd9930b65c2f90` (== `origin/main` at start)  
Scope: server-enforced privacy/masking for public user surfaces and WebSocket delivery; no feature expansion, no schema/data migration, no notification behavior changes.

## 1. Modified Files (this delivery)

| File | Purpose | Key changes |
|---|---|---|
| `server/privacy.ts` | Public user projection | `toPublicUser` now privacy-aware: normalizes privacy settings, masks location `lat/lng` unless `location.isPublic`, hides `isOnline`/`lastActiveAt` per `showOnlineStatus`/`showLastActive`, omits contact/internal fields (email, phone, linkedIdentities, friendIds, blockedUserIds, verification/internal flags). |
| `server.ts` | HTTP/API + profile broadcast | Added `canViewProfileByPolicy`/`canSearchByField` enforcement; `/api/users` and `/api/users/:id` now viewer-aware, enforce account status/profile visibility/search-field policy, return masked views, and respond 404 for non-visible/restricted targets (reduces existence leakage). `/api/search/global` users filtered/masked server-side (policy + field/searchability + location-label match only when profile visible). `broadcastProfileUpdated` now emits per-recipient masked payloads (`self` gets full self view; others get `getPublicProfileView(viewer,target)` result). |
| `server/messengerWs.ts` | WS conversation event delivery | `wsBroadcastConversationEvent` re-checks membership/access at delivery time (`canAccessConversation` on latest conversation) and sends per-user masked conversation payload (`store.getConversationsForUser(uid)`) to prevent leaking full/global conversation state to users who lost access. |
| `server/store.ts` | Reviewed (no behavioral change in this delivery) | Inspected `getPublicEarthProfile` and existing privacy helpers; left unchanged to avoid unrelated behavior changes. |
| `server/discovery/database/db.ts` | Test isolation support (infra) | Discovery DB path can be overridden via `EARTH_ONE_DISCOVERY_DB_FILE` (defaults to existing `server_data/discovery.db`), enabling isolated test DBs without touching production DB. |
| `scripts/test_public_users_api.ts` | Test isolation | Runs server with isolated `EARTH_ONE_DISCOVERY_DB_FILE` (temp dir) + isolated data file; resolves prior `SQLITE_BUSY/database is locked` caused by shared real `discovery.db`. |
| `scripts/test_api.ts`, `scripts/test_calls_regression.ts`, `scripts/test_communication_regression.ts` | Test isolation / lint | Added isolated discovery DB env for spawned servers; added `// @ts-ignore` for runtime `ws` import and explicit event parameter typing where needed so `tsc --noEmit` passes without changing runtime behavior. |
| `scripts/tests-security/test_privacy_enforcement.ts` | New privacy regression | Isolated end-to-end privacy checks (profiles, search, WS access re-check, per-recipient broadcast masking, compatibility). |

## 2. Privacy Capabilities (verified by automation)

- **Public profile masking**: non-owner viewers receive no email/phone/linked identities/internal fields; private location coordinates masked (`lat/lng` 0) while labels/consent preserved as applicable; online/last-active hidden when privacy flags disable them. (PASS)
- **Profile visibility**: `everyone` visible to non-friends; `friends` returns 404 to non-friend/anonymous; `self` returns 404 to others; owner can read own profile via `/api/auth/me`. (PASS)
- **Search enforcement**: server-side filtering in `/api/users` and `/api/search/global`; field-level searchability respected (e.g. display-name search blocked when disabled); friends-only/self-only users not discoverable by non-authorized viewers (no existence leak via 200/404 pattern in tested cases). (PASS)
- **WebSocket delivery**: legitimate participants receive events; removed group member does not receive subsequent conversation events (membership/access re-checked at delivery; per-user masked conversation payload). (PASS)
- **Per-recipient profile broadcast**: `profile_updated` delivered to authorized recipient with masked presence/fields per privacy (observed masked event to friend recipient). (PASS)
- **Compatibility smoke**: self profile/auth works, friends list responds, nonexistent user returns 404. (PASS)

## 3. SQLite Lock (`test_public_users_api.ts`) — Resolution

- **Cause**: test spawned `server.ts` which imports `server/discovery/database/db.ts` singleton opening real `server_data/discovery.db` in WAL mode; concurrent/lingering access produced `ERR_SQLITE_ERROR: database is locked` at init (unrelated to `server_data.json`).
- **Fix**: added env-configurable discovery DB path (`EARTH_ONE_DISCOVERY_DB_FILE`, default unchanged) and pointed public-users/comm/calls/api regression scripts to temp-dir DB files. No deletion/modification of real `discovery.db*`; temp DBs cleaned with test temp dirs. (PASS)

## 4. Test Results

| Check | Status | Evidence |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | PASS | Exited 0 after test-script typing fixes (`// @ts-ignore` for `ws` runtime import; typed callbacks); no app/runtime logic changes. |
| `npm run build` (`vite build`) | PASS | Built successfully (chunk-size warning only, pre-existing). |
| `scripts/test_api.ts` | PASS | `HTTP API regression: 85 passed, 0 failed.` |
| `scripts/test_public_users_api.ts` | PASS | `Public users API regression: 24 passed, 0 failed` (isolated synthetic storage+DB). |
| `scripts/tests-security/test_privacy_enforcement.ts` | PASS | `34 PASS / 0 FAIL / 0 BLOCKED / 0 NOT TESTED` (isolated). |
| `scripts/test_communication_regression.ts` | PASS | 17 PASS, 0 FAIL, 1 NOT TESTED, 0 BLOCKED (real GUI/E2E NOT TESTED). |
| `scripts/test_calls_regression.ts` | PASS | 11 PASS, 0 FAIL, 2 NOT TESTED, 2 BLOCKED (real media/LiveKit NOT TESTED/BLOCKED as before). |
| Real Electron/GUI/multi-device E2E | NOT TESTED | Not executed in this CLI session. |
| Real OAuth (Google/WeChat) | NOT TESTED | No real credentials/callbacks exercised. |
| LiveKit media tests | BLOCKED | No `docker`/`livekit-server`, prototype not validated, no real media clients. |

## 5. Data/Environment Safety

- `server_data.json` SHA256 unchanged: `66cd7ad3be2705f7575637d41d6a0c9c6d1383897e0788cdaff100bccf4f6168`. (PASS)
- `server_data/uploads/` unchanged/empty; real `discovery.db*` not modified or deleted. (PASS)
- No `.env`/secrets/personal data/build artifacts committed. (verified at commit time)

## 6. Residual Risks / Follow-ups (not in scope)

- `/api/messenger/profile/me` observed to return 404 in isolated privacy-suite probing while `/api/auth/me` succeeds for same session in that specific flow; compatibility retained via `/api/auth/me` (recorded). Requires targeted investigation (possible route/session edge case) — no blind fix applied to avoid behavior change.
- Broader endpoint audit for any other legacy routes returning unmasked `toPublicUser` without viewer context; this pass focused on specified surfaces plus WS/broadcast.
- Full multi-device physical/GUI, real OAuth, and LiveKit media remain NOT TESTED/BLOCKED as documented.

## 7. Conclusion

Specified privacy enforcement hardening and test-isolation fixes are implemented and verified by automated regressions in isolated environments. No real user data modified. No claims of GUI/E2E, real OAuth, or LiveKit media success.
