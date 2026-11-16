#!/usr/bin/env bash
set -euo pipefail

# ONE Network Mode B — Standalone Ubuntu 22.04/24.04 WireGuard Node Bootstrap
# Run as root on a dedicated VPS (NOT inside Enzonic/Render container).

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo bash setup-wireguard-node.sh)"
  exit 1
fi

WG_IFACE="${WG_IFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.66.0.1/16}"
WAN_IFACE="${WAN_IFACE:-$(ip route show default | awk '/default/ {print $5; exit}')}"

if [[ -z "${WAN_IFACE}" ]]; then
  echo "Could not auto-detect WAN interface; set WAN_IFACE=eth0 explicitly."
  exit 1
fi

apt-get update
apt-get install -y wireguard wireguard-tools iptables ufw curl jq

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

if [[ ! -f /etc/wireguard/server_private.key ]]; then
  umask 077
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi

SERVER_PRIV=$(cat /etc/wireguard/server_private.key)
SERVER_PUB=$(cat /etc/wireguard/server_public.key)

if [[ ! -f "/etc/wireguard/${WG_IFACE}.conf" ]]; then
  cat > "/etc/wireguard/${WG_IFACE}.conf" <<EOF
[Interface]
Address = ${WG_SUBNET}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
SaveConfig = false

PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -s 10.66.0.0/16 -o ${WAN_IFACE} -j MASQUERADE
PostUp = iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.66.0.0/16 -o ${WAN_IFACE} -j MASQUERADE
PostDown = iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
EOF
  chmod 600 "/etc/wireguard/${WG_IFACE}.conf"
fi

cat > /etc/sysctl.d/99-one-wireguard.conf <<EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
sysctl --system

ufw allow "${WG_PORT}/udp" || true
ufw allow 22/tcp || true

systemctl enable "wg-quick@${WG_IFACE}"
systemctl restart "wg-quick@${WG_IFACE}"

echo "============================================================"
echo "ONE WireGuard node '${WG_IFACE}' is UP on UDP/${WG_PORT} (WAN: ${WAN_IFACE})"
echo "Server PUBLIC key (safe to put into ONE_NETWORK_NODES_JSON):"
echo "  ${SERVER_PUB}"
echo "NEVER copy /etc/wireguard/server_private.key into ONE .env or Git!"
echo "============================================================"
