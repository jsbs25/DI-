export interface NetworkOverviewData {
  modeA: {
    name: string;
    scope: 'one-browser-only';
    engine: 'electron-webcontentsview-session-proxy';
    isolatedPartition: 'persist:one-browser';
    supportsProtocols: Array<'http' | 'https' | 'socks5' | 'pac'>;
    note: string;
  };
  modeB: {
    name: string;
    scope: 'system-wide-vpn';
    engine: 'wireguard';
    configured: boolean;
    nodeCount: number;
    onlineNodeCount: number;
    userActiveDevices: number;
    maxDevicesPerUser: number;
    privateKeysStoredOnServer: false;
    note: string;
    platformSupport: {
      web: { available: false; reason: string };
      electronDesktop: { available: boolean; reason: string };
      ios: { available: boolean; reason: string };
      android: { available: boolean; reason: string };
    };
  };
}

export interface NetworkNodeData {
  id: string;
  name: string;
  region: string;
  countryCode: string;
  endpoint: string;
  listenPort: number;
  publicKey: string;
  subnetCidr: string;
  dnsServers: string[];
  mtu: number;
  allowedIps: string[];
  maintenance: boolean;
  note?: string;
  hasHealthProbe: boolean;
  status: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unprobed';
  latencyMs: number | null;
  dnsResolved?: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface NetworkDeviceData {
  id: string;
  userId: string;
  nodeId: string;
  deviceName: string;
  platform: 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'desktop' | 'other';
  publicKey: string;
  tunnelIpV4: string;
  createdAt: string;
  updatedAt: string;
  lastConfiguredAt?: string;
  revokedAt?: string;
}

export interface WireGuardProfileData {
  deviceId: string;
  nodeId: string;
  nodeName: string;
  nodeRegion: string;
  interfaceAddress: string;
  dnsServers: string[];
  mtu: number;
  serverPublicKey: string;
  serverEndpoint: string;
  allowedIps: string[];
  persistentKeepalive: number;
  privateKeyStoredOnServer: false;
  configTemplate: string;
}

async function networkFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  try {
    const token = localStorage.getItem('earth_one_token');
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err: any = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const networkApi = {
  overview: (): Promise<{ success: true; overview: NetworkOverviewData }> =>
    networkFetch('/api/network/overview'),
  nodes: (refresh = false): Promise<{ success: true; configured: boolean; nodes: NetworkNodeData[] }> =>
    networkFetch(refresh ? '/api/network/nodes?refresh=1' : '/api/network/nodes'),
  probeNode: (nodeId: string): Promise<{ success: true; node: NetworkNodeData }> =>
    networkFetch(`/api/network/nodes/${encodeURIComponent(nodeId)}/probe`, { method: 'POST', body: '{}' }),
  devices: (): Promise<{ success: true; devices: NetworkDeviceData[]; privateKeysStoredOnServer: false }> =>
    networkFetch('/api/network/devices'),
  registerDevice: (payload: {
    nodeId: string;
    deviceName: string;
    platform: NetworkDeviceData['platform'];
    publicKey: string;
  }): Promise<{ success: true; device: NetworkDeviceData; profile: WireGuardProfileData }> =>
    networkFetch('/api/network/devices', { method: 'POST', body: JSON.stringify(payload) }),
  deviceConfig: (deviceId: string): Promise<{ success: true; device: NetworkDeviceData; profile: WireGuardProfileData }> =>
    networkFetch(`/api/network/devices/${encodeURIComponent(deviceId)}/config`),
  revokeDevice: (deviceId: string): Promise<{ success: true; device: NetworkDeviceData }> =>
    networkFetch(`/api/network/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
};
