# EARTH ONE Communication - Execution Progress

## 2026-11-11T00:09Z - Baseline check
- **Branch/HEAD**: `main` @ `e38849047d8917f560b5814b0c942261eea031b8` (== `origin/main`, fetched). Working tree clean. No new remote commits.
- **Runtime/data**: Node v26.13.0, npm 11.20. No node/tsx/vite/electron processes running. `server_data.json` present (SHA256 `66cd7ad3be2705f7575637d41d6a0c9c6d1383897e0788cdaff100bccf4f6168`, preserved/unmodified). `server_data/uploads/` empty; `server_data/books/`, `discovery.db*` present. Docker/livekit-server not installed; `brew` available (arm64 macOS).

## Phase 1 (prior) - Communication regression tests (completed)
- **Completed**: audited real REST/WS protocol from code (`server.ts`, `server/store.ts`, `server/messengerWs.ts`, `server/notificationPolicy.ts`, `server/privacyPolicy.ts`, `src/types/index.ts`) and added automated regression using isolated temp `EARTH_ONE_DATA_FILE` (no real user data touched).
- **Modified/added files**: `scripts/test_communication_regression.ts`, `docs/communication/EXECUTION_PROGRESS.md`.
- **Tests**: **PASS 17 / FAIL 0 / NOT TESTED 1 / BLOCKED 0** (CLI, isolated).
  - PASS: server boot; register/login/bad-login-rejected/logout; EARTH ID assigned & searchable; friends request/accept, block/unblock, privacy get/set; 1:1 direct create + HTTP send/read/list; group create/member-manage/group send; recall, delete-for-self, search, read/delivered (HTTP); offline sync cursor/pagination; notifications list/unread/preferences/read-all; file upload, authorized download, unauth/non-participant denied; security (unauthorized conversation read rejected, forged senderId ignored/session-bound); WS auth rejects invalid token; WS `/ws` connect+multi-device same user; WS send_ack + realtime delivery to peer + sender other-device sync; clientMsgId dedup; WS typing/read dispatched (basic); blocked user cannot send direct message.
  - NOT TESTED: real two-browser GUI/E2E communication flow.
  - BLOCKED: none. No code defects found requiring fixes in covered flows.
- **Commit**: `8dfcae67e68f4f878e5b49be8e2fd88dac5bb457` (`test(comm): add phase 1 communication regression suite`), pushed. HEAD==origin/main.

## Phase 2 (prior docs) - Communication architecture docs (completed)
- **Completed**: code-derived docs for account/identity (internal `userId` vs public `earthId`), REST API, WS `/ws` protocol/events, friends/group/permission/privacy model, persistence/file storage, notifications, delivery/read/offline sync, future A/V insertion points, third-party/license/cost notes, and gaps (no runtime logic changes).
- **Files**: `docs/communication/ARCHITECTURE.md`, `MESSAGE_SCHEMA_COMPAT.md`, `THIRD_PARTY_COMPONENTS.md`, `ROADMAP.md`.
- **Commit**: `329a8b10664db3f6e816ef70e3f547dab193e627` pushed.

## Phase 3 (prior) - Local LiveKit prototype validation (BLOCKED by environment)
- **Findings**: `docker` not installed, `livekit-server` binary not found (macOS arm64). No LiveKit Cloud/paid services used; no real user data touched; no formal messaging/identity changes.
- **Results**: local LiveKit start — **BLOCKED**; two clients same room — **BLOCKED**; bidirectional audio/video — **BLOCKED**; mute/unmute camera+mic — **BLOCKED**; leave room — **BLOCKED**; disconnect recovery — **BLOCKED**; room end/resource release — **BLOCKED**.
- **Files**: `docs/communication/LIVEKIT_PROTOTYPE.md`. **LiveKit prototype not validated ⇒ no formal LiveKit media integration performed.**

## Phase 4 (prior) - A/V integration design (completed, design-only)
- **Files**: `docs/communication/CALLS_INTEGRATION_DESIGN.md`. EARTH ONE authoritative for identity/permissions/invites/records/tokens; media transport-only; clients never receive API secrets.

## Phase 5 (prior) - Cross-border network research (completed, research-only)
- **Files**: `docs/communication/CROSS_BORDER_NETWORK_RESEARCH.md`. WebRTC/STUN/TURN/Coturn/LiveKit comparison; CN↔JO considerations/cost plan. Real CN↔JO tests **NOT TESTED / BLOCKED**. No servers/domains/paid resources purchased.

## 2026-11-11 - Second-stage kickoff: re-check (completed)
- **Branch/HEAD**: `main` @ `98558f5fc58a5853164834402929c9782c5f1cbd` == `origin/main` (fetched, no new remote commits), clean worktree before changes. `server_data.json` SHA256 unchanged (`66cd7ad3…`). No runtime processes; docker/livekit-server still absent.
- **Prior records read**: EXECUTION_PROGRESS, LIVEKIT_PROTOTYPE, CALLS_INTEGRATION_DESIGN, CROSS_BORDER_NETWORK_RESEARCH. No completed work repeated.
- **Existing comm regression re-run (isolated, 2 consecutive passes after one transient discovery-db lock during parallel boot)**: **PASS 17 / FAIL 0 / NOT TESTED 1 / BLOCKED 0** — no serious existing communication defects found; no fixes required.

## 2026-11-11 - Independent call business module + signaling (completed, additive; backend-owned)
- **Goal**: EARTH ONE-owned call domain logic and signaling, compatible with existing `userId/earthId`, friends, groups, conversations, messages, notifications, and WS `/ws` (no changes to legacy message event semantics).
- **Added files**: `server/calls/types.ts`, `server/calls/service.ts`, `server/calls/store.ts`, `server/calls/index.ts`, `scripts/test_calls_regression.ts`, `src/services/calls/api.ts`.
- **Modified files (additive/backward-compatible)**: `server/store.ts` (persist/load `calls: []` with defaults), `server.ts` (call routes/helpers, WS delivery `call_*`, notification emission), `src/types/index.ts` (`call_invite`, `call_missed` notification types).
- **Capabilities implemented (business/signaling layer, EARTH ONE-owned)**:
  - 1:1 and group call records/state (`ringing/connecting/active/reconnecting/ended/rejected/missed/busy/failed/canceled`), invite/accept/reject/cancel/end/leave flows, busy detection (caller and direct target), participant tracking and call history listing.
  - Server-side authZ on every action: session-bound identity, conversation/group membership checks, friend/block/stranger/privacy enforcement via existing store policies (e.g. `canSendDirectMessageBetween`, `canAccessConversation`, `isBlockedEither`), non-participant access rejected.
  - Call invites delivered via EARTH ONE notification system and WS `call_*` events to participants (e.g. `call_invite/accept/reject/cancel/end/leave/state`); old message/notification WS events remain compatible.
  - Device/state management recorded server-side: mic/camera/screen-sharing flags and status transitions (`connecting/active/reconnecting`) per participant.
  - **Media/token boundary (security)**: `POST /api/calls/:id/token` and invite/accept responses issue short-lived media join info **only** after EARTH ONE auth+membership checks. If `LIVEKIT_API_KEY/SECRET/URL` not configured or SDK unavailable, server returns `ok:false, blocked:true, reason=MEDIA_NOT_CONFIGURED|MEDIA_SDK_UNAVAILABLE` (no token, **no API secret ever exposed to client**, no fake success). Optional `livekit-server-sdk` path is server-side only and gated by env.
- **Not implemented/fused into runtime in this step**: LiveKit media server integration/room management against a running LiveKit instance (prototype BLOCKED), and full in-app call UI/controls in `GlobalMessenger` (see UI status below).
- **Tests** (`scripts/test_calls_regression.ts`, isolated temp data, `EARTH_ONE_SKIP_BOOK_HARVEST=true`): **PASS 11 / FAIL 0 / NOT TESTED 2 / BLOCKED 2**.
  - PASS: server boot; setup/friendship; direct call unauthorized/blocked cases rejected (stranger-restricted + blocked); direct invite creates record + WS delivery + media token gated (no secrets/fake); busy handling and direct accept (permissioned); call state transitions (active/reconnecting) and device flags recorded; short-lived media token endpoint enforces auth+membership and blocks without config; call end and event delivery; direct reject flow; non-participant/unauthorized call access rejected; group/multi-party call signaling, records, and leave/end (business layer).
  - NOT TESTED: mic/camera toggle, camera switch, screen share in a real media session (server records state flags; actual media track/device control requires real client+media runtime). Network interruption/reconnect recovery in a real media session (server supports reconnecting/active transitions; real media/network recovery requires LiveKit/client runtime).
  - BLOCKED: real two-account bidirectional audio/video media (WebRTC/LiveKit) — no local LiveKit/docker runtime and no real browser/media clients in this headless environment; prototype not validated. Call end resource release in LiveKit/media layer — no LiveKit runtime to verify room/media teardown.
- **Compatibility check**: existing communication regression re-run after implementation — **PASS 17 / FAIL 0 / NOT TESTED 1 / BLOCKED 0** (legacy `/ws` message events/flows unaffected).
- **Commit**: `a8daa3ee2e80dfacb9b9a65904efdcefe1c03553` (`feat(calls): add EARTH ONE call domain, signaling APIs, and gated media token boundary`), pushed to `origin/main`. **HEAD == origin/main == `a8daa3e`**.

## LiveKit media integration (Phase 2 requirement) — NOT STARTED / GATED
- **Status**: **BLOCKED (prototype prerequisite not met)**. Local LiveKit prototype not validated (no `docker`, no `livekit-server`). Per instructions: no formal integration without validated prototype; no LiveKit Cloud paid features; no server purchase; no real credentials; clients must never receive API secrets. Backend token boundary and optional server-side SDK hook are in place but remain blocked until env/config/validated prototype exists.

## Call UI (Phase 2 requirement) — PARTIAL / NOT COMPLETE
- **Status**: client signaling/service API scaffold added (`src/services/calls/api.ts`), but **full call UI (ringing/incoming/connecting/in-call/reconnecting/ended states, controls for 1:1 & group, responsive/desktop-first, integrated into existing messenger without breaking navigation/chat) is NOT fully implemented** in this run. Marked **NOT TESTED** for end-user call UX/controls until implemented and exercised in real clients. No unrelated pages added; existing UI unchanged except additive type/service files.

## Network & cost (Phase 2 requirement)
- Local prototype validation: **BLOCKED** (no runtime). WebRTC/STUN/TURN/Coturn/LiveKit/CN↔JO research documented (prior); no public deployment, no VPS, no paid services, no billable API calls.

## Overall status (current)
- **Completed (safe, verified)**: prior Phases 1/2/4/5 docs & regression baseline; re-check + no serious comm defects; EARTH ONE call domain/state/permissions/signaling/notifications/WS events (additive), gated media-token boundary, call regression harness (11 PASS) and legacy comm regression intact (17 PASS). All committed/pushed.
- **Blocked**: LiveKit runtime/prototype, real 2-account bidirectional A/V, LiveKit room/media resource-release verification, real cross-border CN↔JO tests, any paid/credentialed deployment.
- **Not tested**: real two-browser GUI/E2E messenger flow; real-media mic/camera toggle/camera switch/screen share; real-media network interruption/recovery; complete call UI/UX.
- **Unresolved failures**: none in automated regressions (legacy comm and call business/signaling).

## Requires human approval / external action
- Provide/install local LiveKit server (free dev, no cloud) and/or Docker to validate prototype and enable real-media tests/integration; supply/confirm stable LiveKit + client/server SDK versions and licenses for chosen tags.
- Any real credentials/third-party secrets, LiveKit Cloud paid features, server/domain purchase, VPS/Coturn deployment, or billable API usage.
- Real CN↔Jordan connectivity testing, TURN/SFU placement/cost decisions.
- Real user data modification, irreversible migrations, or large architecture rewrites.

## Next concrete safe tasks
1. Implement additive call UI in messenger (incoming/ringing/in-call states + controls) behind feature flag, reusing existing design, with isolated commits and legacy chat regression after each change.
2. Once local LiveKit runtime is available (approved/free): validate prototype, configure dev env (secrets server-only), exercise real 1:1/group A/V, device controls, reconnect, and teardown; record PASS/FAIL/BLOCKED with evidence.
3. Extend regression for multi-device call signaling edge cases and missed/busy/timeout handling as needed.
4. Verify/pin LiveKit & Coturn component versions/licenses in `THIRD_PARTY_COMPONENTS.md` before any integration commit.

## 2026-11-11 - Phase 6 Privacy Security Verification & Delivery (this run)
- **Git baseline (protected)**: `main @ d3dbb6f4dfb0770acb6196b043dd9930b65c2f90 == origin/main` at start; working tree had 4 pre-existing uncommitted privacy edits (`server.ts`, `server/messengerWs.ts`, `server/privacy.ts`; `server/store.ts` inspected only). No reset/clean/force operations. `server_data.json` SHA256 preserved `66cd7ad3be2705f7575637d41d6a0c9c6d1383897e0788cdaff100bccf4f6168`.
- **Privacy enforcement (kept + verified)**: `server/privacy.ts` privacy-aware `toPublicUser` (mask coords/presence/last-active per privacy; omit contact/internal fields). `server.ts` server-side visibility/search enforcement for `/api/users`, `/api/users/:id`, `/api/search/global` (viewer-aware masked views, 404 for non-visible/restricted), per-recipient masked `broadcastProfileUpdated`. `server/messengerWs.ts` per-user access re-check + masked conversation payload at WS delivery.
- **SQLite lock fix (isolated tests)**: added `EARTH_ONE_DISCOVERY_DB_FILE` override in `server/discovery/database/db.ts` (default unchanged) and routed isolated test servers to temp discovery DBs (`scripts/test_public_users_api.ts`, `test_api.ts`, `test_calls_regression.ts`, `test_communication_regression.ts`). Real `discovery.db*` untouched.
- **Lint**: `npm run lint` (tsc) **PASS** after minimal test-script typing fixes (`// @ts-ignore` runtime `ws`, typed callbacks) with no runtime behavior change.
- **Build**: `npm run build` **PASS**.
- **Tests (isolated)**: `scripts/test_api.ts` **PASS 85/0**; `scripts/test_public_users_api.ts` **PASS 24/0** (lock resolved); `scripts/tests-security/test_privacy_enforcement.ts` **PASS 34/0/0/0** (profiles everyone/friends/self, non-friend/friend/owner/anon, masked coords/presence/last-active, no contact/internal leak, username/displayName/EARTH ID/searchability rules, global search no-leak discoverability, WS participant delivery, WS post-removal non-delivery, per-recipient profile broadcast masking, compat 404/nonexistent). `scripts/test_communication_regression.ts` **PASS 17/0/1 NT/0 BLK**. `scripts/test_calls_regression.ts` **PASS 11/0/2 NT/2 BLK** (real LiveKit/media still BLOCKED/NOT TESTED).
- **NOT TESTED**: real Electron/GUI/multi-device E2E, real OAuth flows. **BLOCKED**: LiveKit media/bidirectional A/V/resource-release and cross-border tests (no runtime/credentials).
- **Audit doc**: `docs/security/PRIVACY_ENFORCEMENT_AUDIT.md`.
- **Commit/push**: recorded below after push (HEAD must equal origin/main).
