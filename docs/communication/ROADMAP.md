# EARTH ONE Communication Roadmap (code-aligned)

Grounded in current implementation (`main@8dfcae67`) and stated product goals. Items marked done reflect verified code/tests, not assumptions.

## Current state (verified)

- **EARTH ONE ACCOUNT/SECURITY (foundation)**: session auth, register/login/logout, gated dev/phone/OAuth flows, server-enforced permissions, EARTH ID assignment/search exposure, privacy/block controls, upload access checks. (CLI regression PASS on isolated data; real GUI/E2E NOT TESTED.)
- **EARTH ONE FRIENDS**: requests/accept/reject/delete, block/unblock, friend lists, policy/privacy enforcement.
- **EARTH ONE MESSENGER**: 1:1/group conversations, HTTP send/read, WS `/ws` realtime (auth, multi-device, send_ack, clientMsgId dedup, typing/read/presence), recall/delete-for-self/search/clear, offline sync cursor pagination.
- **EARTH ONE FILES (messenger scope)**: authenticated/permissioned upload (JSON/stream) and download.
- **EARTH ONE NOTIFICATIONS**: persisted notifications, unread/count, read/read-all/delete, preferences + DND/policy, realtime sync events.

## Gaps to close (incremental, low-risk first)

1. **Reliability/compat hardening**: expand automated coverage (multi-client race cases, reconnect/resync edge cases, pagination/idempotency invariants), document client-visible event contracts, and fix only evidenced defects with isolated commits.
2. **Schema evolution (additive)**: introduce explicit delivery/read timestamps and/or richer message typing only via backward-compatible extensions; keep `senderId` server-authoritative and `clientMsgId` dedup intact.
3. **Media signaling domain (EARTH ONE REALTIME/MEDIA, design-first)**: add dedicated server-owned call models/APIs (`server/calls/` or equivalent, per existing structure) for invite/accept/reject/busy/end/records and short-lived media tokens; keep media SFU (e.g. LiveKit) as transport only.
4. **Local prototype → gated integration**: validate LiveKit locally (no cloud/paid/real data), confirm SDK/license/compat, then integrate behind feature flags without altering existing messaging flows.
5. **Cross-border readiness**: evaluate WebRTC/STUN/TURN (Coturn) paths and cost/risk for CN↔JO; require real-network measurements and explicit approval before deploying relay infrastructure.
6. **Scale/operations (future, approval-gated)**: storage/DB migration, object storage/signed URLs, observability, and HA — only with approved plans to avoid data loss/regressions.

## Non-goals / constraints

- No dependency on WeChat/QQ/WhatsApp/Google/Telegram for core EARTH ONE account↔account messaging/calls.
- No weakening of security/privacy, no secrets in frontend, no unapproved paid services or irreversible migrations.
