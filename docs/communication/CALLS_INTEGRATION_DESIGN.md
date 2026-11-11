# Phase 4 - EARTH ONE Audio/Video Integration Design (design-only, no runtime intrusion)

**Status**: design proposal; **no changes** made to existing messaging/auth/notification runtime in this phase.  
**Baseline checked**: `server/` has no `calls` module; `src/components/` has no `call` module; no `src/services/` directory exists. Any future implementation must re-check structure to avoid duplication.

## Goals & boundaries
- EARTH ONE remains authoritative for: user identity/accounts, EARTH ID, friend relationships, group membership/roles, conversation permissions, call invitations/authorization/state/records, notifications, and short-lived media access credentials.
- Media SFU/relay (e.g. LiveKit) provides only media transport/room capabilities. **Clients must never receive LiveKit API secret/keys**; server mints scoped, short-lived tokens only after EARTH ONE permission checks.

## Proposed module placement (future, when implemented)
- `server/calls/` (or equivalent under existing server layout): call domain logic, persistence interfaces, authorization, token minting boundary, signaling/event handlers, auditing.
- `src/components/call/` (or colocated with existing UI patterns): call UI (incoming/outgoing/in-call controls) — additive, feature-flagged.
- `src/services/calls/` or client service modules consistent with existing frontend structure: API/WS client for call flows (to be aligned with actual project conventions at implementation time).

## EARTH ONE-owned responsibilities
1. **AuthN/AuthZ**: resolve session user; verify caller/callee/friendship or group membership; enforce block/privacy policies (reuse existing privacy/block helpers/patterns) before any invite/token issuance.
2. **Call lifecycle**: create invite (1:1/group), deliver invite notification/event, accept/reject/cancel, busy detection, timeout/ring state, end/hangup, participant join/leave tracking, and durable call records (metadata only, privacy-respecting).
3. **Room & token control**: generate EARTH ONE call/room identifiers mapped to media rooms; issue least-privilege, short-TTL join tokens bound to authenticated user and authorized room; revoke/expire with call end.
4. **Records & notifications**: persist call history/state transitions (auditable), emit notifications via existing notification system/policy where appropriate (respect prefs/DND/category semantics).
5. **Data ownership**: all user/account/friend/group/call metadata stored under EARTH ONE control; no dependency on third-party identity/messaging platforms.

## Media layer responsibilities (e.g. LiveKit/Coturn)
- WebRTC media routing/mixing/forwarding (SFU), room media features, network traversal assistance as configured.
- Operational concerns (latency, relay bandwidth, regional deployment) evaluated separately; no paid/cloud assumptions in prototype phase.

## Protocol & data considerations (additive, compat-preserving)
- Extend WS/REST with explicit call events/endpoints (e.g. `call_invite`, `call_accept`, `call_reject`, `call_end`, state sync) authenticated and permission-checked like existing messenger events; do not overload unrelated message semantics except optional additive system references if needed.
- Keep existing `ChatMessage`/conversation contracts intact (see `MESSAGE_SCHEMA_COMPAT.md`); any call-related message artifacts must be backward-safe.
- Rate limiting, audit logging, and abuse controls for invite/token endpoints.

## Security & privacy requirements
- Server-side authorization on every transition and token mint; prevent room/token enumeration.
- Do not leak hidden presence/profile info through call flows; respect blocks and stranger policies.
- Secrets (API keys) only in server env/secret store, never to client or repo.

## Rollout strategy (future)
- Implement behind feature flag/config gate; isolate from existing 1:1/group text/file flows.
- Start with local prototype validation, then staged integration with automated regression extensions and explicit NOT TESTED markers for real-device/cross-network cases.
