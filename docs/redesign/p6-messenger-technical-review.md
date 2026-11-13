# P6 ONE MESSENGER — Technical Review

**Date:** 2026-11-14  
**Worktree:** `/tmp/duyi-one-redesign` (`redesign/complete-visual-overhaul`, `54af87b`)  
**Scope:** `src/components/chat/GlobalMessenger.tsx`, `server/messengerWs.ts`, `server/store.ts`, `server.ts` (messenger/conversation/notification/call routes + WS attach), `src/apiBase.ts`, `src/types/index.ts`, `src/services/calls/{api,media}.ts`, `server/calls/*`, `src/App.tsx` wiring.

## 1) Existing functions / features (must preserve)

### Client (`GlobalMessenger.tsx`)
- **Entry/props (from App):** `conversations`, `activeConversationId`, `onSelectConversation`, `currentUser`, `lang`, `integrations`, `onRefreshConversations`, `onUserUpdate`, `directOpenSeq` (opens chats/mobile pane on direct-open). Messenger renders in chat tab container in `App.tsx`.
- **Auth/session:** token from `localStorage earth_one_token` and cookie-aware requests (`credentials: 'include'`), auth header injection, unauth state view.
- **Conversations:** load/filter/sort by recency/unread, select, mobile list↔chat toggle, direct/group/global channel display, unread badges, presence/online, last message preview, recent contacts.
- **Messages:** paginated fetch (`GET /api/conversations/:id/messages?limit&before`), `hasMore` load-earlier, merge/dedupe/sort, optimistic sending with `clientMsgId`, HTTP fallback after WS ack timeout, retry failed, recall/delete-for-me/clear-my-view, reply-to, translated/original toggle, read marking, per-conversation sync/cursor.
- **Realtime (WebSocket `/ws` via `wsUrl`):** connect with token/deviceId, hello/ping-pong, reconnect with backoff, fallback polling/sync when disconnected, online/offline handling. Events handled: `presence`, `typing`, `read`, `message`, `send_ack`, `recall`, `conversation_updated`, `friend_request(_updated)`, `notification`, `notification_sync`, `notification_prefs_sync`, `call_invite/accept/state/leave/reject/cancel/end/signal`.
- **Typing/read receipts:** send typing (throttled), display typing users, mark read on open/receive, respect server/read-receipt/privacy semantics.
- **Attachments/media/files:** queue/validate local files (size/MIME/ext guards), upload stream (`POST /api/messenger/upload/stream` with progress), send message with attachments, retry upload/send, image/file rendering, preview/lightbox (image/pdf/txt), authenticated download (`/api/messenger/files/:id`), attachment name/size display.
- **Friends/requests/users/privacy/profile:** search/suggested users, send/respond friend requests, open direct, friends list, block/unblock/blocked list, recent conversations, profile view/self edit (displayName/username/bio), avatar upload/reset/delete, privacy settings load/save (visibility/searchability/friend/message/online/last-active/read receipts), username/id/display-name search constraints surfaced by server.
- **Groups:** create group, group detail panel, rename/avatar, invite/remove members, admin toggle, owner transfer, leave, clear conversation for self.
- **Notifications:** list/pagination/unread count, mark read/all-read/delete, open notification routing (call invite/conversation/friend/group/profile/security), desktop/Electron bridge alerts + sound/DND preferences load/save/test, in-app notice.
- **Message search:** keyword/sender/conversation filters against `/api/messenger/messages/search`.
- **Integrations/connect:** Google/WeChat connect entry points and integrations panel state/props.
- **Calls (signaling + media, critical):** invite/accept/reject/cancel/end/leave, active/incoming state, call media session lifecycle (`createCallMediaSession`, LiveKit/WebRTC abstraction in `services/calls/media.ts`), token/signal polling fallback, mic/camera/screen-share toggles, camera switch, playback unlock, reconnect/replace/cleanup on terminal states/unmount, minimized/full call UI, elapsed timer, device/state sync to server, call invites via WS/notifications.
- **i18n/RTL hints:** `lang` used for many labels (en/zh/ar paths in several strings/modals), `dir` set in privacy/profile contexts.

### Server / contracts
- **HTTP APIs (server.ts):** messenger upload/stream/files, privacy get/put, user search/friends/requests/block/unblock/blocked/recent/sync/profile/avatar, notifications/preferences/read, conversations list/direct/group/detail/messages/send/read/rename/admins/members/transfer-owner/leave/recall/delete/clear/search, global message search; calls APIs under `/api/calls/*` (invite/accept/reject/cancel/end/leave/token/state/signal/signals/list/get) via `server/calls/*`.
- **WebSocket (`server/messengerWs.ts`):** upgrade/auth at `/ws`, presence broadcast (privacy-masked to viewers), typing/read/send (ack + fanout), notification fanout, call_signal relay, conversation event broadcast helpers, per-user device sets, reconnect-safe delivery model.
- **Store (`server/store.ts`):** source of truth for users/conversations/messages/notifications/privacy/friends/blocks/calls; permission/privacy checks (`canAccessConversation`, `canSendDirectMessageBetween`, `getMaskedPresenceForViewer`, `shouldSendReadReceipt`, `getNotificationPrefs`), unread/read state, message lifecycle (send/recall/delete/clear), notification creation/counting, sync cursors/timestamps.
- **Types (`src/types/index.ts`):** `Conversation`, `ChatMessage`, `ChatAttachment`, statuses, integrations/users; UI must remain compatible.

## 2) Real APIs / data structures in active use
- Conversations/messages: `/api/conversations*`, `/api/messenger/messages/search`, `/api/messenger/sync` with `{since,sinceId,limit}` cursor semantics, `hasMore/nextBefore/cursor/serverTime` patterns.
- Social/privacy/profile: `/api/messenger/{privacy,users/search,friends,friend-requests,block,unblock,blocked,recent,profile/*,username/check,avatar/*}`.
- Notifications: `/api/notifications*` including preferences and unread count.
- Files: `/api/messenger/upload`, `/api/messenger/upload/stream`, `/api/messenger/files/:id` (+ authenticated download).
- Calls: `/api/calls*` and call media session/token/signal flows via `callApi` + `services/calls/media.ts`.
- WS: `wsUrl('/ws')` (derived from `getApiBase`/window host), JSON event types listed above.

## 3) Current issues (UI/structure, observed before P6 redesign)
- Dense 2587-line monolith mixing all domains and large inline JSX makes hierarchy/layout hard to scan and mobile spacing inconsistent (overflow risk in side panels/modals, crowded headers/action rows, legacy slate/cyan utility palette vs Quiet Futurism tokens).
- Desktop layout keeps list+thread but lacks ONE-level calm zoning (conversation rail, message stage, contextual details) and consistent surface/typography rhythm.
- Mobile relies on show/hide toggles but touch targets, safe-area/keyboard/input bar, and modal/sheet behavior need deliberate refinement; several controls use small text/hit areas.
- Visual style inconsistent with redesign system (hardcoded slate/blue/cyan blocks, ad-hoc borders/shadows) and does not use established ONE design tokens/primitives.
- Non-fatal but notable: mixed-language hardcoded copy, modal-heavy secondary flows, and high information density in friends/requests/search/privacy/notif/settings panels.

## 4) Non-breakable contracts / behavior (must not change)
- No backend, DB, Worker, schema, env, auth, DNS, route, or API contract changes.
- Preserve all `/api/*` paths, request/response usage, WS endpoint/events/payload handling, auth token/cookie behavior, sync/pagination semantics, and `apiBase/wsUrl` resolution.
- Preserve send/receive/load/pagination/history, contacts/conversations/groups, unread/read/typing/presence, notifications/preferences, attachments/upload/download/preview, calls (invite/accept/reject/cancel/end/leave/media/signaling/state), permissions/privacy enforcement expectations, and data isolation behavior driven by server/store.
- Keep `GlobalMessenger` props and App integration unchanged; do not introduce fake/mock data or fake capabilities (no new backend-less features).
- Keep existing in-scope bug behavior only changed where necessary and safe; do not alter business logic for visuals.

## 5) Safe refactor scope (P6)
- **Allowed:** UI/layout/visual hierarchy/styling/spacing/motion/feedback in `GlobalMessenger.tsx` (and only directly required local presentation helpers/constants/CSS class usage) using Quiet Futurism tokens/primitives and existing design language; responsive restructuring (desktop 3-zone feel via existing single component, mobile pane/sheet behavior), accessibility/touch-target/safe-area/overflow fixes, clearer empty/loading/error states, non-destructive component extraction inside same file where helpful.
- **Allowed:** Small defensive UI-only guards that do not affect contracts (e.g. class/layout conditions) and keeping all handlers/state/effects/flows intact.
- **Not allowed:** changing store/server/routes, WS protocol, call/media service contracts, attachment/auth logic, data models, or adding dependencies/frameworks/backend features.

## 6) Capabilities that do not exist and must NOT be faked
- No server-side E2EE/secret-chat claims, no guaranteed message delivery/read proofs beyond real signals, no voice-note/transcription/live-translation engines beyond existing behavior, no edit/history-rewrite features beyond implemented recall/delete flows, no cross-device guarantees beyond provided sync/WS, no new call media infrastructure, and no fabricated online/activity states outside server-provided/masked data.
