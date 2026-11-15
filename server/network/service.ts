import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import type {
  NetworkDevicePlatform,
  NetworkDeviceRecord,
  NetworkNodePublicStatus,
  NetworkOverview,
  WireGuardClientProfile,
  WireGuardNodeConfig,
} from './types.ts';

const MAX_ACTIVE_DEVICES_PER_USER = 10;
const PROBE_CACHE_TTL_MS = 20_000;
const VALID_PLATFORMS = new Set<NetworkDevicePlatform>([
  'ios',
  'android',
  'macos',
  'windows',
  'linux',
  'desktop',
  'other',
]);

interface CachedProbeResult {
  status: NetworkNodePublicStatus['status'];
  latencyMs: number | null;
  dnsResolved?: boolean;
  lastCheckedAt: string;
  error?: string;
  expiresAt: number;
}

const probeCache = new Map<string, CachedProbeResult>();

export function ensureNetworkPeersArray(store: any): NetworkDeviceRecord[] {
  if (!Array.isArray(store.networkPeers)) {
    store.networkPeers = [];
  }
  return store.networkPeers as NetworkDeviceRecord[];
}

export function isValidWireGuardPublicKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length !== 44) return false;
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length !== 32) return false;
    if (buf.toString('base64') !== trimmed) return false;
    // Reject all-zero dummy key
    if (buf.every((b) => b === 0)) return false;
    return true;
  } catch {
    return false;
  }
}

function isValidIpv4Cidr(cidr: string): boolean {
  const m = cidr.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return false;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const prefix = Number(m[5]);
  return octets.every((o) => o >= 0 && o <= 255) && prefix >= 8 && prefix <= 30;
}

function parseIpv4SubnetBase(subnetCidr: string): [number, number] {
  const clean = isValidIpv4Cidr(subnetCidr) ? subnetCidr.trim() : '10.66.0.0/16';
  const [ip] = clean.split('/');
  const parts = ip.split('.').map((n) => Number(n));
  return [parts[0] ?? 10, parts[1] ?? 66];
}

function sanitizeStringArray(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback;
  const cleaned = val
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0 && !/[\r\n]/.test(x));
  return cleaned.length > 0 ? cleaned : fallback;
}

export function loadNetworkNodes(): WireGuardNodeConfig[] {
  const raw = (process.env.ONE_NETWORK_NODES_JSON || '').trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const nodes: WireGuardNodeConfig[] = [];
  const seenIds = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id.trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 80) : '';
    const region = typeof obj.region === 'string' ? obj.region.trim().slice(0, 60) : 'Global';
    const countryCode = typeof obj.countryCode === 'string' ? obj.countryCode.trim().toUpperCase().slice(0, 4) : 'GL';
    const endpoint = typeof obj.endpoint === 'string' ? obj.endpoint.trim().replace(/[\r\n\s]/g, '') : '';
    const listenPort = Number.isInteger(Number(obj.listenPort)) ? Number(obj.listenPort) : 51820;
    const publicKey = typeof obj.publicKey === 'string' ? obj.publicKey.trim() : '';

    if (!id || seenIds.has(id)) continue;
    if (!name || !endpoint || listenPort < 1 || listenPort > 65535) continue;
    if (!isValidWireGuardPublicKey(publicKey)) continue;

    // Never carry private keys even if accidentally placed in env JSON
    const subnetCidr =
      typeof obj.subnetCidr === 'string' && isValidIpv4Cidr(obj.subnetCidr)
        ? obj.subnetCidr.trim()
        : '10.66.0.0/16';
    const dnsServers = sanitizeStringArray(obj.dnsServers, ['1.1.1.1', '9.9.9.9']);
    const allowedIps = sanitizeStringArray(obj.allowedIps, ['0.0.0.0/0', '::/0']);
    const mtuNum = Number(obj.mtu);
    const mtu = Number.isFinite(mtuNum) && mtuNum >= 1200 && mtuNum <= 1500 ? Math.floor(mtuNum) : 1280;
    const maintenance = Boolean(obj.maintenance);
    const healthCheckUrl =
      typeof obj.healthCheckUrl === 'string' && /^https?:\/\//i.test(obj.healthCheckUrl.trim())
        ? obj.healthCheckUrl.trim()
        : undefined;
    const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, 200) : undefined;

    seenIds.add(id);
    nodes.push({
      id,
      name,
      region,
      countryCode,
      endpoint,
      listenPort,
      publicKey,
      subnetCidr,
      dnsServers,
      mtu,
      allowedIps,
      maintenance,
      healthCheckUrl,
      note,
    });
  }

  return nodes;
}

export function findNetworkNodeById(nodeId: string): WireGuardNodeConfig | null {
  return loadNetworkNodes().find((n) => n.id === nodeId) || null;
}

function isPrivateOrBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (family === 6) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fe80:') || norm.startsWith('fc') || norm.startsWith('fd')) return true;
    if (norm.startsWith('::ffff:')) {
      return isPrivateOrBlockedIp(norm.slice(7));
    }
    return false;
  }
  return true;
}

async function validateProbeTargetUrl(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid healthCheckUrl' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Unsupported protocol for health probe' };
  }
  const allowLocal = process.env.ONE_NETWORK_ALLOW_LOCAL_PROBE === 'true';
  if (allowLocal) {
    return { ok: true, url };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'Blocked internal probe hostname' };
  }
  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      return { ok: false, error: 'Blocked private probe IP' };
    }
    return { ok: true, url };
  }
  try {
    const resolved = await dns.lookup(host, { all: true });
    if (!resolved.length || resolved.some((r) => isPrivateOrBlockedIp(r.address))) {
      return { ok: false, error: 'Probe hostname resolved to private IP' };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'Probe hostname DNS resolution failed' };
  }
}

export async function probeNetworkNode(
  node: WireGuardNodeConfig,
  opts?: { forceRefresh?: boolean }
): Promise<NetworkNodePublicStatus> {
  const base: Omit<NetworkNodePublicStatus, 'status' | 'latencyMs'> = {
    id: node.id,
    name: node.name,
    region: node.region,
    countryCode: node.countryCode,
    endpoint: node.endpoint,
    listenPort: node.listenPort,
    publicKey: node.publicKey,
    subnetCidr: node.subnetCidr,
    dnsServers: node.dnsServers,
    mtu: node.mtu,
    allowedIps: node.allowedIps,
    maintenance: node.maintenance,
    note: node.note,
    hasHealthProbe: Boolean(node.healthCheckUrl),
  };

  if (node.maintenance) {
    return {
      ...base,
      status: 'maintenance',
      latencyMs: null,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const now = Date.now();
  const cached = probeCache.get(node.id);
  if (!opts?.forceRefresh && cached && cached.expiresAt > now) {
    return {
      ...base,
      status: cached.status,
      latencyMs: cached.latencyMs,
      dnsResolved: cached.dnsResolved,
      lastCheckedAt: cached.lastCheckedAt,
      error: cached.error,
    };
  }

  const checkedAt = new Date().toISOString();

  if (!node.healthCheckUrl) {
    let dnsResolved = Boolean(net.isIP(node.endpoint));
    let dnsError: string | undefined;
    const t0 = Date.now();
    if (!dnsResolved) {
      try {
        await dns.lookup(node.endpoint);
        dnsResolved = true;
      } catch (err: any) {
        dnsResolved = false;
        dnsError = err?.message || 'DNS resolution failed';
      }
    }
    const latencyMs = dnsResolved ? Math.max(1, Date.now() - t0) : null;
    const result: CachedProbeResult = {
      status: dnsResolved ? 'unprobed' : 'offline',
      latencyMs,
      dnsResolved,
      lastCheckedAt: checkedAt,
      error: dnsError,
      expiresAt: now + PROBE_CACHE_TTL_MS,
    };
    probeCache.set(node.id, result);
    return { ...base, ...result };
  }

  const check = await validateProbeTargetUrl(node.healthCheckUrl);
  if (!check.ok) {
    const result: CachedProbeResult = {
      status: 'offline',
      latencyMs: null,
      lastCheckedAt: checkedAt,
      error: check.error,
      expiresAt: now + PROBE_CACHE_TTL_MS,
    };
    probeCache.set(node.id, result);
    return { ...base, ...result };
  }

  const t0 = Date.now();
  try {
    const resp = await fetch(check.url.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    const latencyMs = Math.max(1, Date.now() - t0);
    const okStatus: NetworkNodePublicStatus['status'] =
      resp.ok ? (latencyMs > 1200 ? 'degraded' : 'online') : 'degraded';
    const result: CachedProbeResult = {
      status: okStatus,
      latencyMs,
      dnsResolved: true,
      lastCheckedAt: checkedAt,
      error: resp.ok ? undefined : `Health endpoint returned HTTP ${resp.status}`,
      expiresAt: now + PROBE_CACHE_TTL_MS,
    };
    probeCache.set(node.id, result);
    return { ...base, ...result };
  } catch (err: any) {
    const result: CachedProbeResult = {
      status: 'offline',
      latencyMs: null,
      dnsResolved: false,
      lastCheckedAt: checkedAt,
      error: err?.name === 'TimeoutError' ? 'Health probe timeout' : (err?.message || 'Health probe failed'),
      expiresAt: now + PROBE_CACHE_TTL_MS,
    };
    probeCache.set(node.id, result);
    return { ...base, ...result };
  }
}

export async function listNetworkNodesWithStatus(opts?: { forceRefresh?: boolean }): Promise<NetworkNodePublicStatus[]> {
  const nodes = loadNetworkNodes();
  return Promise.all(nodes.map((node) => probeNetworkNode(node, opts)));
}

export function listDevicesForUser(store: any, userId: string): NetworkDeviceRecord[] {
  const peers = ensureNetworkPeersArray(store);
  return peers
    .filter((p) => p.userId === userId && !p.revokedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function allocateTunnelIpv4(store: any, node: WireGuardNodeConfig): string {
  const peers = ensureNetworkPeersArray(store);
  const used = new Set<string>(
    peers
      .filter((p) => p.nodeId === node.id && !p.revokedAt)
      .map((p) => p.tunnelIpV4.split('/')[0])
  );
  const [oct1, oct2] = parseIpv4SubnetBase(node.subnetCidr);

  // Reserve x.y.0.1 for WireGuard server wg0 gateway; skip .0 and .255 host IDs.
  for (let hi = 0; hi <= 254; hi++) {
    for (let lo = hi === 0 ? 2 : 1; lo <= 254; lo++) {
      const candidate = `${oct1}.${oct2}.${hi}.${lo}`;
      if (!used.has(candidate)) {
        return `${candidate}/32`;
      }
    }
  }
  throw new Error('No available tunnel IPv4 addresses on this node');
}

export function buildWireGuardClientProfile(
  node: WireGuardNodeConfig,
  device: NetworkDeviceRecord
): WireGuardClientProfile {
  const configLines = [
    '# ONE Network WireGuard Client Profile',
    '# Private keys NEVER leave your device. Replace <YOUR_LOCAL_PRIVATE_KEY> locally.',
    '[Interface]',
    'PrivateKey = <YOUR_LOCAL_PRIVATE_KEY>',
    `Address = ${device.tunnelIpV4}`,
    `DNS = ${node.dnsServers.join(', ')}`,
    `MTU = ${node.mtu}`,
    '',
    '[Peer]',
    `PublicKey = ${node.publicKey}`,
    `Endpoint = ${node.endpoint}:${node.listenPort}`,
    `AllowedIPs = ${node.allowedIps.join(', ')}`,
    'PersistentKeepalive = 25',
  ];

  return {
    deviceId: device.id,
    nodeId: node.id,
    nodeName: node.name,
    nodeRegion: node.region,
    interfaceAddress: device.tunnelIpV4,
    dnsServers: node.dnsServers,
    mtu: node.mtu,
    serverPublicKey: node.publicKey,
    serverEndpoint: `${node.endpoint}:${node.listenPort}`,
    allowedIps: node.allowedIps,
    persistentKeepalive: 25,
    privateKeyStoredOnServer: false,
    configTemplate: configLines.join('\n'),
  };
}

export function registerNetworkDevice(
  store: any,
  userId: string,
  input: Record<string, unknown>
):
  | { ok: true; device: NetworkDeviceRecord; profile: WireGuardClientProfile }
  | { ok: false; status: number; error: string } {
  if ('privateKey' in input || 'private_key' in input) {
    return {
      ok: false,
      status: 400,
      error: 'Private keys must never be sent to or stored on the ONE server. Generate your WireGuard keypair locally and submit only the publicKey.',
    };
  }

  const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
  const deviceName = typeof input.deviceName === 'string' ? input.deviceName.trim().slice(0, 60) : '';
  const platformRaw = typeof input.platform === 'string' ? input.platform.trim().toLowerCase() : 'other';
  const platform: NetworkDevicePlatform = VALID_PLATFORMS.has(platformRaw as NetworkDevicePlatform)
    ? (platformRaw as NetworkDevicePlatform)
    : 'other';
  const publicKey = typeof input.publicKey === 'string' ? input.publicKey.trim() : '';

  if (!nodeId) {
    return { ok: false, status: 400, error: 'nodeId is required' };
  }
  const node = findNetworkNodeById(nodeId);
  if (!node) {
    return { ok: false, status: 404, error: 'WireGuard node not found' };
  }
  if (node.maintenance) {
    return { ok: false, status: 409, error: 'Selected node is currently in maintenance' };
  }
  if (!deviceName || deviceName.length < 2) {
    return { ok: false, status: 400, error: 'deviceName (2-60 chars) is required' };
  }
  if (!isValidWireGuardPublicKey(publicKey)) {
    return { ok: false, status: 400, error: 'Invalid WireGuard Curve25519 publicKey (expected non-zero 32-byte base64 key)' };
  }

  const peers = ensureNetworkPeersArray(store);
  const userActive = peers.filter((p) => p.userId === userId && !p.revokedAt);
  if (userActive.length >= MAX_ACTIVE_DEVICES_PER_USER) {
    return {
      ok: false,
      status: 409,
      error: `Device limit reached (${MAX_ACTIVE_DEVICES_PER_USER} active devices max). Revoke an unused device first.`,
    };
  }

  const duplicate = peers.find((p) => p.nodeId === node.id && p.publicKey === publicKey && !p.revokedAt);
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: 'This WireGuard publicKey is already registered as an active peer on the selected node',
    };
  }

  const tunnelIpV4 = allocateTunnelIpv4(store, node);
  const nowIso = new Date().toISOString();
  const device: NetworkDeviceRecord = {
    id: `wgdev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    userId,
    nodeId: node.id,
    deviceName,
    platform,
    publicKey,
    tunnelIpV4,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastConfiguredAt: nowIso,
  };

  peers.push(device);
  if (peers.length > 5000) {
    // Keep all active peers plus recent revoked audit records
    const active = peers.filter((p) => !p.revokedAt);
    const revokedRecent = peers.filter((p) => Boolean(p.revokedAt)).slice(-500);
    store.networkPeers = [...revokedRecent, ...active];
  }

  const profile = buildWireGuardClientProfile(node, device);
  return { ok: true, device, profile };
}

export function getNetworkDeviceConfigForUser(
  store: any,
  userId: string,
  deviceId: string
):
  | { ok: true; device: NetworkDeviceRecord; profile: WireGuardClientProfile }
  | { ok: false; status: number; error: string } {
  const peers = ensureNetworkPeersArray(store);
  const device = peers.find((p) => p.id === deviceId);
  if (!device || device.revokedAt) {
    return { ok: false, status: 404, error: 'Device peer not found' };
  }
  if (device.userId !== userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  const node = findNetworkNodeById(device.nodeId);
  if (!node) {
    return { ok: false, status: 404, error: 'Associated WireGuard node is no longer configured' };
  }
  device.lastConfiguredAt = new Date().toISOString();
  const profile = buildWireGuardClientProfile(node, device);
  return { ok: true, device, profile };
}

export function revokeNetworkDeviceForUser(
  store: any,
  userId: string,
  deviceId: string
): { ok: true; device: NetworkDeviceRecord } | { ok: false; status: number; error: string } {
  const peers = ensureNetworkPeersArray(store);
  const device = peers.find((p) => p.id === deviceId);
  if (!device) {
    return { ok: false, status: 404, error: 'Device peer not found' };
  }
  if (device.userId !== userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!device.revokedAt) {
    const nowIso = new Date().toISOString();
    device.revokedAt = nowIso;
    device.updatedAt = nowIso;
  }
  return { ok: true, device };
}

export async function getNetworkOverview(store: any, userId: string): Promise<NetworkOverview> {
  const nodes = await listNetworkNodesWithStatus();
  const userDevices = listDevicesForUser(store, userId);
  const configured = nodes.length > 0;
  const onlineNodeCount = nodes.filter((n) => n.status === 'online' || n.status === 'unprobed').length;

  return {
    modeA: {
      name: 'ONE 内置浏览器代理',
      scope: 'one-browser-only',
      engine: 'electron-webcontentsview-session-proxy',
      isolatedPartition: 'persist:one-browser',
      supportsProtocols: ['http', 'https', 'socks5'],
      note: '仅作用于 ONE Electron 桌面端内置浏览器标签页（persist:one-browser 会话），不接管 ONE 通信中心，不修改宿主机全局系统代理。',
    },
    modeB: {
      name: 'ONE 系统级 VPN（WireGuard）',
      scope: 'system-wide-vpn',
      engine: 'wireguard',
      configured,
      nodeCount: nodes.length,
      onlineNodeCount,
      userActiveDevices: userDevices.length,
      maxDevicesPerUser: MAX_ACTIVE_DEVICES_PER_USER,
      privateKeysStoredOnServer: false,
      note: configured
        ? '服务器仅保存设备公钥与内网隧道 IP 分配；私钥全程在客户端本地生成与保管。需配合原生 App 或官方 WireGuard 客户端激活系统级 TUN 隧道。'
        : '尚未配置 ONE_NETWORK_NODES_JSON，可先在本地管理模式 A 浏览器代理，或按 deploy/network/README.md 部署独立 WireGuard 节点后接入。',
      platformSupport: {
        web: {
          available: false,
          reason: '浏览器沙盒无法创建操作系统 TUN/UTUN 网卡；网页端仅可管理节点与导出 WireGuard 配置。',
        },
        electronDesktop: {
          available: true,
          reason: '可结合原生系统级守护进程或导出配置至 WireGuard Desktop；同时独立提供模式 A 内置浏览器代理。',
        },
        ios: {
          available: true,
          reason: '需使用含 NEPacketTunnelProvider 与 WireGuardKit（NetworkExtension 权限）的 iOS 原生构建包激活全局 VPN。',
        },
        android: {
          available: true,
          reason: '需使用含 Android VpnService 与 wireguard-android GoBackend 的 Android 原生 APK 激活全局 VPN。',
        },
      },
    },
  };
}
