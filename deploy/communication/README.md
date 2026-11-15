# ONE Communication (LiveKit SFU + coturn TURN) Self-Host Guide

## 1. Architecture
```
ONE Web / Desktop / Mobile Client
  ├─ Auth & Call Signaling ──▶ ONE Express Server (/api/calls/*, /ws)
  ├─ SFU Media (WSS + UDP/TCP) ──▶ LiveKit Server (Caddy 443 -> 7880, RTC 7881/tcp, 50000-60000/udp)
  └─ Symmetric NAT Fallback  ──▶ coturn TURN/TURNS (3478/udp+tcp, 5349/tcp)
```

## 2. Why Dedicated VPS Is Required
- Enzonic shared game/container nodes expose a fixed NAT allocation of 6 ports (no root host network, no `50000-60000/udp` range, no automatic public TLS).
- Render terminates HTTPS/WSS on port `443 -> 10000` only and does not expose UDP `50000-60000` or TURN TCP/UDP ports.
- Any low-cost Ubuntu 22.04/24.04 VPS with public IPv4 (2 vCPU / 2–4 GB RAM) can run this entire compose stack.

## 3. Firewall Ports
| Port | Protocol | Purpose |
| :--- | :--- | :--- |
| `80`, `443` | TCP | Caddy automatic TLS & LiveKit WSS signaling |
| `7881` | TCP | LiveKit ICE over TCP fallback |
| `50000–60000` | UDP | LiveKit WebRTC RTP/SRTP streams |
| `3478` | UDP / TCP | coturn STUN / TURN |
| `5349` | TCP | coturn TURNS (TLS-encrypted relay over firewall-friendly TCP) |
| `49152–49999` | UDP | coturn relay allocations |

## 4. Quick Setup on VPS
1. Copy examples and fill real domains & secrets:
   - `cp livekit.yaml.example livekit.yaml`
   - `cp turnserver.conf.example turnserver.conf`
   - Create `Caddyfile`:
     ```caddyfile
     livekit.yourdomain.com {
       reverse_proxy 127.0.0.1:7880
     }
     ```
2. Start stack:
   ```bash
   docker compose -f docker-compose.livekit.yml up -d
   ```
3. Configure ONE Backend `.env`:
   ```env
   LIVEKIT_URL="https://livekit.yourdomain.com"
   LIVEKIT_PUBLIC_URL="wss://livekit.yourdomain.com"
   LIVEKIT_API_KEY="ONE_LIVEKIT_API_KEY"
   LIVEKIT_API_SECRET="REPLACE_WITH_STRONG_RANDOM_SECRET"

   TURN_URLS="turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp,turns:turn.yourdomain.com:5349?transport=tcp"
   TURN_USERNAME="one_turn_user"
   TURN_CREDENTIAL="REPLACE_WITH_STRONG_TURN_PASSWORD"
   ```
4. Verify in ONE Communication Center (`通话` tab -> channel status badge shows `LiveKit SFU` + `TURN/TLS 已就绪`) or `GET /api/calls/capabilities`.
