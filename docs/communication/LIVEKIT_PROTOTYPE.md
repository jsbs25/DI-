# Phase 3 - Local LiveKit Prototype (validation record)

**Date**: 2026-11-11  
**Baseline**: `main@329a8b10664db3f6e816ef70e3f547dab193e627` (code/runtime unchanged for prototype)

## Constraints applied
- No server purchase, no paid services, no LiveKit Cloud paid features.
- No real user data touched; no changes to existing formal messaging business or user identity system.
- LiveKit API secrets must never be exposed to clients (design constraint for any future integration).
- No fabricated results.

## Environment check
- OS/arch: macOS arm64 (`uname -m` = arm64), Node v26.13.0.
- `docker`: **not installed** (`command not found`).
- `livekit-server` binary: **not found** in PATH.
- `brew`: available (potential local install path exists but not executed automatically to avoid unreviewed system changes/network installs in this run).

## Validation status

| Check | Status | Evidence / note |
|---|---|---|
| Local LiveKit service can start | **BLOCKED** | No `docker` and no `livekit-server` binary present; no local runtime started. Can be unblocked by installing official `livekit-server` (or running container) in a local dev environment without paid cloud services. |
| Two independent clients join same room | **BLOCKED** | Depends on running local LiveKit service + two client instances. |
| Bidirectional audio call | **BLOCKED** | Depends on running service and two real media-capable clients/devices; not executable in this headless CLI environment. |
| Bidirectional video call | **BLOCKED** | Same as audio. |
| Toggle camera/mic off and on | **BLOCKED** | Requires real client UI/media devices. |
| Leave room | **BLOCKED** | Requires running room/client session. |
| Network disconnect recovery | **BLOCKED** | Requires controlled network disruption against a running session. |
| Room end and resource release | **BLOCKED** | Requires running service/client session to observe teardown. |

## Suggested local (free, no-cloud) prototype steps (for operator with environment access)
1. Install/run LiveKit server locally in dev mode (official binary or Docker image) per upstream docs; use dev keys/config only on localhost, never commit secrets.
2. Use two isolated browser clients (or official sample clients) joining the same room with server-minted tokens; keep EARTH ONE identity/auth separate (tokens issued only after EARTH ONE permission checks in future integration).
3. Verify join/leave, A/V publish-subscribe, mute/unmute, reconnect behavior, and server/client resource cleanup. Record pass/fail with logs/screenshots captured locally.
4. Do **not** treat localhost/LAN results as cross-border (CN↔JO) performance proof.

## SDK/license/compat notes (to verify before integration)
- Inspect official LiveKit server, client SDKs, and server SDKs for pinned version compatibility, maintenance status, and licenses (core commonly Apache-2.0 upstream—verify exact tags). Record chosen versions in `THIRD_PARTY_COMPONENTS.md` when adopted.
