# Message & Conversation Schema Compatibility (from real code)

Source: `src/types/index.ts`, `server/store.ts`, `server/messengerWs.ts`, HTTP handlers in `server.ts`. This documents current shapes and compatibility constraints for future evolution (including media/call signaling) without breaking existing clients/data.

## 1. Conversation (`Conversation`)

Fields in use: `id`, `type` (`'direct'|'country_room'|'global_channel'|'channel'|'group'`), `name`, `countryCode?`, `participantIds[]`, `adminIds?`, `ownerId?`, `avatar?`, `unreadCount?` (computed/view), `lastMessage?`, `lastMessageTime?`, `lastMessageAt?`, `isOnline?` (view/masked), `otherUser?` (direct view), `pinned?`, `typingUserIds?`, `channel?` (`'earthone'|'google'|'wechat'|'whatsapp'|'telegram'`), `externalRef?`, `createdAt?`, `updatedAt?`, group `members` enriched in detail view.

- **Direct**: canonical `conv_direct_<sorted participant ids>` via `getOrCreateDirectConversation`; exactly two participants; permission/visibility masked per viewer.
- **Group**: server-generated `group_*` id, owner/admin/member management enforced.
- **Public rooms/channels**: `global_channel`/`country_room` accessible per `canAccessConversation` rules (broad access) — treat as shared scopes.

**Compat guidance**: keep `id`, `type`, `participantIds`, `lastMessage/lastMessageAt/updatedAt` semantics stable. Additive fields safe; do not repurpose `type` or remove participant-based auth checks.

## 2. Message (`ChatMessage`)

Fields in use: `id`, `conversationId`, `senderId`, `senderName`, `senderAvatar`, `senderCountry`, `content`, `originalLanguage?`, `translatedContent?`, `translatedTo?`, `createdAt` (ISO), `updatedAt?`, `mediaUrl?`, `attachments?: ChatAttachment[]`, `status?: 'sending'|'sent'|'delivered'|'read'|'failed'`, `deliveredTo?: string[]`, `readBy?: string[]`, `replyToId?`, `editedAt?`, `deletedFor?: string[]`, `recalled?`, `recalledAt?`, `clientMsgId?`, `channel?`.

- **Identity**: `senderId` is authoritative server-side (HTTP uses session user; WS uses authenticated socket user). No persistent `receiverId`/`groupId` columns — recipients derived from conversation `participantIds`.
- **Idempotency/dedup**: `clientMsgId` (client-generated) used by `store.sendMessage` and WS `send` to return existing message/ACK for retries (same sender+conversation+clientMsgId). WS/HTTP both accept it.
- **Delivery/read**: `status` defaults `sent`; `deliveredTo[]` tracked (e.g. on fetch/delivery paths), `readBy[]` and `status='read'` updated when read receipts allowed (`markConversationRead` respects `shouldSendReadReceipt`). No separate `deliveredAt`/`readAt` timestamps persisted per recipient (read event carries `readAt` in realtime; per-message timestamps not stored as fields except `updatedAt` side effects).
- **Recall/delete**: `recalled`/`recalledAt` clears content/attachments/translations (server-side) and updates conversation preview; `deletedFor[]` hides per-user without removing global record. Search/list filters exclude `deletedFor` viewer and recalled content as implemented.
- **Attachments**: `ChatAttachment {id,type:'image'|'file',name,url,size?,mimeType?}`; files served via authenticated, permissioned endpoint.

**Compat guidance**: preserve `id`, `conversationId`, `senderId`, `createdAt`, `clientMsgId`, `deletedFor`, `recalled`, `deliveredTo/readBy/status` behavior. Future extensions (e.g. `messageType`, `callId`, `deliveredAt/readAt` maps, E2EE envelopes) must be additive and backward-readable by existing clients; never trust client-supplied `senderId`.

## 3. Friend requests / notifications / privacy records

- **FriendRequest**: `{id, fromUserId, toUserId, status:'pending'|'accepted'|'rejected'|'cancelled', message?, createdAt, updatedAt}` (stored in `friendRequests`).
- **Notification**: persisted per user with `{id,userId,type,title,body?,read,readAt?,createdAt,actorId?,actorName?,actorAvatar?,conversationId?,requestId?,targetUserId?,data?}`; capped per-user in store; prefs in `notificationPrefs` (`friendRequests,friendAccepted,groupEvents,messages,desktop,sound,dndEnabled,dndStart,dndEnd`).
- **PrivacySettings**: `{profileVisibility, searchableByUsername, searchableById, searchableByDisplayName, friendRequestPolicy, showOnlineStatus, showLastActive, strangerMessagePolicy, readReceipts}` normalized with defaults.

## 4. Sync/cursor contract

`GET /api/messenger/sync` returns messages for user’s accessible conversations (excluding `deletedFor`), ordered by `createdAt` then `id`, filtered by `since/sinceTs/sinceId`, limited; responds `{success,conversations,messages,hasMore,cursor:{since,sinceTs,sinceId}|null,serverTime}`. Clients must advance cursor from server-provided cursor/last item for idempotent catch-up.

## 5. Implications for future audio/video

- Calls should be modeled as separate domain entities (`calls/`, call records, invitations, room membership) referencing EARTH ONE `userId`/conversation/group IDs, not by overloading chat message semantics except optional additive system-message references.
- Any signaling/events must be auth-bound to session identity and permission-checked against friendships/group membership/privacy, consistent with existing WS/HTTP enforcement.
