# Phase 5 - Cross-border Network Research (CN ↔ Jordan focus, design/research only)

**Date**: 2026-11-11  
**Scope**: technical comparison and validation/cost considerations. **No servers or paid resources purchased/deployed.** No real cross-border measurements executed from this environment.

## 1. Connectivity options compared

| Option | What it does | Strengths | Limitations / risks |
|---|---|---|---|
| **WebRTC direct (P2P)** | Browsers/peers exchange media directly after signaling | Lowest added latency/cost when it works; no relay bandwidth bill | Often fails across symmetric NATs, restrictive firewalls, or carrier policies; quality/path not guaranteed cross-border. |
| **STUN** (Session Traversal Utilities for NAT) | Discovers public-facing transport address/port mapping to attempt direct paths | Lightweight; helps establish P2P candidates | **STUN is not TURN**: it does not relay media. If direct path fails, STUN alone cannot carry the call. |
| **TURN** (Traversal Using Relays around NAT) | Relays media through a server when direct/P2P fails | Highest connectivity success across hard NAT/firewall cases | **Bandwidth/egress cost can be large** (all media flows through relay). Requires reliable, well-placed infrastructure and ops; capacity planning needed. |
| **LiveKit (SFU) media server relay** | Clients publish to SFU which forwards streams to subscribers (topology depends on deployment) | Scales better than full-mesh; centralized control/observability; integrates room features | Still requires reachable server(s) and sufficient bandwidth/CPU; cross-region placement affects latency; self-hosting has infra/ops cost. |

## 2. Practical implications for CN ↔ Jordan
- Cross-border paths may traverse long distances, variable routing, ISP/firewall policies, and intermittent packet loss/jitter; success and quality are empirical, not inferable from localhost/LAN.
- A robust design typically attempts **direct/STUN-discovered paths first**, then **falls back to TURN/SFU relay** when necessary (policy/product-dependent). TURN/SFU regional placement (and possibly multiple regions) is a key determinant of latency and reliability.
- **Local LAN or same-machine tests MUST NOT be treated as cross-border public-network results.**

## 3. Coturn (TURN/STUN server) notes
- Upstream: https://github.com/coturn/coturn — license/maintenance to be verified against chosen release before adoption (commonly permissive BSD-style upstream; confirm).
- Operational considerations: credential/auth hardening, TLS, port reachability, rate/abuse controls, monitoring, and bandwidth provisioning. TURN relay can dominate cost for audio/video at scale.

## 4. Cost & measurement plan (before any deployment/purchase)
- **Do not purchase servers/domains or deploy paid resources without explicit approval.**
- Measure (when approved/available): round-trip time, jitter, packet loss, connection success rate, and relay bitrate for 1:1 and small-group calls between representative CN and Jordan endpoints under multiple networks/times.
- Compare topologies: direct vs TURN-relayed vs SFU-relayed (single-region vs strategically placed regions) with bandwidth/egress cost estimates per concurrent call-hour.
- Define SLO targets (setup time, MOS/quality proxies, reconnect success) and fallback behavior; document findings and blockers.

## 5. Current status
- **Real CN↔Jordan connectivity tests**: **NOT TESTED / BLOCKED** in this environment (no deployed relay/media infra, no paired cross-border endpoints, no approval for spend). Results here are technical analysis only.
