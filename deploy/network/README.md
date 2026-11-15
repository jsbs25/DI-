# ONE Network (Mode B · System-Level WireGuard VPN) Deployment Guide

## 1. Security Model & Strict Key Boundary
- **Server Private Key**: Generated once on the WireGuard VPS (`/etc/wireguard/server_private.key`). Never uploaded to ONE Web/API servers or committed to Git.
- **Client Private Key**: Generated locally inside the user's device (iOS Keychain / Android Keystore / Electron / Official WireGuard app). Never sent to ONE API (`POST /api/network/devices` explicitly rejects any `privateKey` field).
- **ONE Server Control Plane (`server/network/`)**: Stores ONLY node public metadata (`ONE_NETWORK_NODES_JSON`) and client `publicKey` + assigned `10.66.X.Y/32` tunnel IP allocations (`networkPeers` in persistent store).

## 2. Why Enzonic / Render / PaaS Containers Cannot Run WireGuard Server
Standard PaaS web containers (Enzonic, Render Web Service, Cloud Run, Vercel):
- Only route inbound HTTP/HTTPS TCP traffic (`80`/`443`) through a layer-7 reverse proxy.
- Do **not** expose raw kernel UDP port `51820` (`WG_PORT`).
- Do **not** grant `CAP_NET_ADMIN` + `/dev/net/tun` + `iptables` MASQUERADE NAT required for an encrypted L3 VPN gateway.

Therefore, **deploy WireGuard gateway nodes on a dedicated Linux VPS / VM** (e.g., Ubuntu 22.04/24.04 with 1 vCPU / 512MB–1GB RAM per ~50–100 active peers, KVM virtualization).

## 3. Recommended VPS Sizing & Open Ports
| Component | Minimum Spec | Required Open Ports | Notes |
| --- | --- | --- | --- |
| WireGuard Gateway Node | 1 vCPU, 1 GB RAM, 1 Gbps NIC | `51820/udp` (WireGuard) | Allow UDP 51820 in cloud security group + UFW |
| Optional Health Probe | Lightweight Caddy/Nginx static `/health` (`200 OK`) | `443/tcp` (HTTPS) | Enables `healthCheckUrl` latency checks in ONE UI |

## 4. Provisioning Steps (Ubuntu 22.04 / 24.04)
1. Copy `deploy/network/setup-wireguard-node.sh` to your VPS and run:
   ```bash
   sudo bash setup-wireguard-node.sh
   ```
2. Copy the printed `Server PUBLIC key` (`SERVER_PUB`).
3. Add the node's **public** metadata to ONE backend `.env`:
   ```bash
   ONE_NETWORK_NODES_JSON='[
     {
       "id": "sg-01",
       "name": "Singapore Gateway 01",
       "region": "ap-southeast-1",
       "countryCode": "SG",
       "endpoint": "sg-vpn.yourdomain.com",
       "listenPort": 51820,
       "publicKey": "<SERVER_PUB>",
       "subnetCidr": "10.66.0.0/16",
       "dnsServers": ["1.1.1.1", "9.9.9.9"],
       "mtu": 1280,
       "allowedIps": ["0.0.0.0/0", "::/0"],
       "healthCheckUrl": "https://sg-vpn.yourdomain.com/health"
     }
   ]'
   ```
4. Whenever a user registers a device on ONE (`/api/network/devices`), sync the returned `publicKey` + `tunnelIpV4` onto the VPS node (either via your node sync agent polling `/api/network/...` or `wg set wg0 peer <CLIENT_PUBKEY> allowed-ips <TUNNEL_IP>`).

## 5. Compatibility with ONE Communication (LiveKit + coturn)
- Keep `MTU = 1280` (already default in ONE generated profiles) to avoid UDP fragmentation for WebRTC/SRTP voice & video packets over mobile carriers.
- Even when WireGuard VPN is ON, LiveKit SFU + coturn ICE candidates will re-negotiate seamlessly via `PersistentKeepalive = 25` and ICE restart (`Stage 2` hardening).
