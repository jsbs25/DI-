# EARTH ONE Communication Architecture (from real code)

> Baseline: `main@8dfcae67` (2026-11-11). Source of truth: `server.ts`, `server/store.ts`, `server/messengerWs.ts`, `server/notificationPolicy.ts`, `server/privacyPolicy.ts`, `src/types/index.ts`.

## 1. Account & identity

- **Internal ID**: `user.id` (e.g. `user_<ts>_<rand>`, seeded IDs). Used for all authorization, storage, foreign keys, sessions, conversations, messages, and device ownership.
- **Public EARTH ID**: `user.earthId` (permanent, allocated once, never reused). Assigned on registration/OAuth create paths and backfilled idempotently in-memory by store normalization; persisted mapping in `earthIdMap`/`nextEarthSequence` when store saves. Exposed in self/profile/search views (e.g. `/api/account/me`, `/api/messenger/users/search`, profile views). Search supports earthId and respects discoverability/privacy gates (`store.searchUsers`, `canSearchByField` + profile visibility).
- **Account status**: `accountStatus` (`active`/`suspended`/`restricted`/`deleted`, default active for legacy). Suspended/deleted blocked from login/session resolution in sensitive paths (`getUserByToken`, login checks).
- **Auth/session**: `POST /api/auth/register`, `POST /api/auth/login` (email/username + password, scrypt with legacy SHA-256 upgrade-on-login, lockout/rate-limit/audit), `POST /api/auth/logout`. Session token (random) stored in `store.sessions` (token → userId) and persisted in data file; `Authorization: Bearer <token>` or explicit token resolution; `requireSessionUser` returns 401 when absent/invalid. Additional gated flows: phone OTP, WeChat/Google OAuth start/callback (config-gated), dev quick-login (strict local dev gates), email bind/change/verify, password reset/change.
- **Current runtime gates (env-dependent)**: Google/WeChat shown `config_required` when credentials/APP_URL not configured; SMS blocked without `SMS_PROVIDER`; dev quick-login only when `NODE_ENV=development` + `DEV_LOGIN_ENABLED` + trusted local request.

## 2. REST API (messenger/identity-relevant, implemented)

Auth required via `requireSessionUser` unless noted:
- Auth/account: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/current`, `/api/auth/status`, `/api/account/me`, `/api/auth/dev-login` (gated), profile/onboarding/update/toggle-location, phone/email/wechat/google flows (config/state gated).
- Integrations/notifications: `/api/integrations`, `/api/notifications` (list, cursor `before`/`limit`), `/api/notifications/unread-count`, `/api/notifications/:id/read`, `/api/notifications/read-all`, `DELETE /api/notifications/:id`, `GET/PUT /api/notifications/preferences`.
- Privacy/social: `GET/PUT /api/messenger/privacy`, `/api/messenger/users/search?q=`, `/api/messenger/friends`, `/api/messenger/friend-requests` (GET list, POST send, POST `/:id/respond`), `DELETE /api/messenger/friends/:id`, `/api/messenger/block`, `/api/messenger/unblock`, `/api/messenger/blocked`, `/api/messenger/recent`, `/api/messenger/profile/:id`, `/api/messenger/profile/me`, `/api/messenger/username/check`, `/api/messenger/profile/update`, avatar upload/delete/serve.
- Conversations/messages: `GET /api/conversations`, `POST /api/conversations/direct`, `POST /api/conversations/group`, `POST /api/conversations/:id/members`, `POST /api/conversations/:id/transfer-owner`, `POST /api/conversations/:id/leave`, `GET /api/conversations/:id`, `GET /api/conversations/:id/messages` (`before`,`limit`), `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/read`, `POST /api/conversations/:id/messages/:messageId/recall`, `POST /api/conversations/:id/messages/:messageId/delete`, `POST /api/conversations/:id/clear`, `GET /api/conversations/:id/search`, `GET /api/messenger/messages/search`, `POST /api/conversations/:id/rename`, `POST /api/conversations/:id/admins`.
- Sync/uploads: `GET /api/messenger/sync` (`since`/`sinceTs`/`sinceId`/`limit` → messages+conversations, `hasMore`, `cursor`, `serverTime`), `POST /api/messenger/upload` (base64 JSON), `POST /api/messenger/upload/stream` (headers `x-file-name`,`x-mime-type`,`x-conversation-id`), `GET /api/messenger/files/:id` (auth + participant/owner permission).

## 3. WebSocket realtime

- **Path**: `/ws` on same HTTP server (`WebSocketServer({ server: httpServer, path: '/ws' })`).
- **Auth**: token from query `?token=` or `Authorization: Bearer`; resolved via `store.getUserByToken`. Invalid/missing → `{type:'error',error:'unauthorized'}` and close `4401`. Optional `deviceId` query (generated if absent).
- **Client registry**: multiple sockets per user (`clientsByUser: userId -> Set<{ws,userId,deviceId}>`). Presence broadcast to self and related users with privacy masking (`getMaskedPresenceForViewer`).
- **Server → client events (observed)**: `hello {userId,deviceId,serverTime}`, `pong`, `error`, `presence {userId,online,lastActiveAt[,deviceCount]}`, `typing {conversationId,userId,on}`, `read {conversationId,userId,readAt[,selfOnly]}`, `send_ack {clientMsgId,ok,message?,error?,fromDeviceId?}`, `message {conversationId,message,clientMsgId?}`, `notification {notification,unreadCount,alert{desktop,sound,dndActive,categoryEnabled}}`, `notification_sync`, `notification_prefs_sync`, `privacy_sync`, `friend_request`, `friend_request_updated`, `conversation_created/updated/cleared`, `message_recalled`, `blocklist_sync`.
- **Client → server events**: `ping`, `typing {conversationId,on}`, `read {conversationId}`, `send {conversationId,content,clientMsgId?,attachments?,replyToId?}`.
- **Send flow**: validates access/permissions (direct block/privacy checks), persists via `store.sendMessage` with idempotent `clientMsgId` lookup, emits notifications (policy-filtered), broadcasts `send_ack` to all sender devices and `message` to other participants.

## 4. Friends, groups, permissions

- **Friends/requests**: request/send/respond/accept-reject/delete (`/api/messenger/friend-requests*`, `/api/messenger/friends/:id`), mutual auto-accept on reverse pending handled in store, block removes friendship/cancels pending, notifications emitted for request/accepted events (policy-aware).
- **Block/privacy**: `blockUser`/`unblockUser` + `blockedBy`; privacy settings normalized (`profileVisibility`, search fields, `friendRequestPolicy`, `showOnlineStatus`, `showLastActive`, `strangerMessagePolicy`, `readReceipts`). Server enforces: `canSendDirectMessageBetween`, `canSendFriendRequestFrom`, `canViewProfileByPolicy`, `canSearchByField`, `getMaskedPresenceForViewer`, `shouldSendReadReceipt`. Search/profile/list views mask hidden presence/profile/location fields; WS presence and read receipts respect privacy/masking; blocked users cannot message and are filtered from discovery/notifications as applicable.
- **Groups**: `type:'group'` conversations with `participantIds`, `adminIds`, `ownerId`. Create/members add-remove/rename/admins/transfer-owner/leave; admin/owner checks enforced in store; group events produce notifications/broadcasts.

## 5. Persistence & files

- **Store**: JSON file `DATA_FILE` (`EARTH_ONE_DATA_FILE` env, default `server_data.json`) loaded/saved atomically (`saveToDisk` tmp+rename). Holds users, accounts, sessions, conversations, messages, friendRequests, blockedBy, notifications/notificationPrefs, privacySettings, earthId state, uploads metadata references in messages, etc. Mutations serialized via `store.mutate` (WriteMutex) where async gaps exist.
- **Attachments**: stored under `server_data/uploads/<owner>/` with per-file meta JSON; upload validated (type/size, allowed attachments), permissioned download (`/api/messenger/files/:id`) requires session and conversation access/owner; path-safe resolution and safe headers. Avatars stored under `server_data/uploads/avatars/<userId>/`.
- **Books/content side stores**: `server_data/books/` and `discovery.db*` also present in repo data dir (out of messenger core scope but co-located).

## 6. Notifications

- **Model**: per-user notifications persisted in store with unread/read state, paging (`before/limit`), unread count, mark-read/read-all/delete. Types include `message_new`, `friend_request`, `friend_accepted`, group events, etc.
- **Policy**: `server/notificationPolicy.ts` normalizes prefs, maps type→category, evaluates DND (local time aware helpers) and decides persist/push/desktop/sound. Server persists history; realtime push/alerts filtered by category/DND/prefs. Preference updates broadcast (`notification_prefs_sync`).

## 7. Security properties (verified in code/regression)

- Unauthenticated access to protected messenger/library endpoints rejected (401). WS rejects invalid tokens (error/4401). Conversation access enforced (`canAccessConversation`). HTTP message send binds `senderId` to session (ignores forged body senderId). Upload/download require auth and participant/owner permission. Block/privacy gates applied to messaging, requests, search/profile/presence/read receipts.

## 8. Known gaps / not present (do not assume)

- No WebRTC signaling/call rooms/SFU/TURN integration, no E2EE, no object storage/signed URLs.
- Message schema lacks dedicated persistent `receiverId/groupId` fields and explicit `deliveredAt/readAt` timestamps as separate columns (status/arrays used: `deliveredTo[]`, `readBy[]`, `status`).
- Real multi-browser GUI/E2E and cross-network media not executed in this phase (CLI regression only).
