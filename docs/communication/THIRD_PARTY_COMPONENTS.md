# Third-party Components (communication scope)

Based on repository dependencies and planned media layer. Verify exact licenses/versions in upstream repos and installed packages before production use.

## Runtime dependencies in use (from `package.json`)

| Component | Role in comms | Notes |
|---|---|---|
| `express` | HTTP API server | REST endpoints, auth, messaging, uploads, sync |
| `ws` | WebSocket server | `/ws` realtime (auth, send/ack, typing/read/presence, notifications sync) |
| `dotenv` | Config loading | Env-based feature/config gating (OAuth, SMS, mail, APP_URL, etc.) |
| `vite` / React stack | Client SPA | Messenger UI consumes REST+WS; not a comms transport itself |

Persistence is file-based (JSON store + local uploads/books/db files) with no external DB service configured in repo.

## Planned/evaluated (not integrated into product runtime)

| Component | Intended role | License (upstream, verify) | Cost/ops considerations |
|---|---|---|---|
| LiveKit (`livekit/livekit` server, official client/server SDKs) | Media SFU/rooms for audio-video; EARTH ONE keeps identity/auth/invites/records | Apache-2.0 for core server/SDK repos (must confirm exact tagged versions used) | Self-host infra/bandwidth/ops required for cross-region quality; **no LiveKit Cloud paid usage in this phase**. Local prototype only when environment supports it. |
| Coturn (`coturn/coturn`) | TURN/STUN relay for NAT traversal | Upstream license to verify (commonly BSD-style in project; confirm) | TURN relays media → significant bandwidth/egress cost at scale; STUN != TURN. Required consideration for cross-border (e.g. CN↔JO) but deploy only with explicit approval/budget. |

## Integration boundaries (design constraint)

- EARTH ONE must remain authoritative for: user identity/accounts, EARTH ID, friendships, group permissions, messaging/notifications data, call invitations/authorization/records, and short-lived media access credentials.
- Media components (LiveKit/Coturn) handle transport/relay only; clients must never receive LiveKit API secrets. Any tokens minted server-side after EARTH ONE permission checks.

## Current environment blockers (observed 2026-11-11)

- `docker`: not installed; `livekit-server` binary: not found. Local LiveKit runtime validation therefore environment-dependent (see execution progress).
