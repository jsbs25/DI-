export type NetworkDevicePlatform =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'desktop'
  | 'other';

export interface WireGuardNodeConfig {
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
  healthCheckUrl?: string;
  note?: string;
}

export type NetworkNodeProbeStatus =
  | 'online'
  | 'degraded'
  | 'offline'
  | 'maintenance'
  | 'unprobed';

export interface NetworkNodePublicStatus {
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
  status: NetworkNodeProbeStatus;
  latencyMs: number | null;
  dnsResolved?: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface NetworkDeviceRecord {
  id: string;
  userId: string;
  nodeId: string;
  deviceName: string;
  platform: NetworkDevicePlatform;
  publicKey: string;
  tunnelIpV4: string;
  createdAt: string;
  updatedAt: string;
  lastConfiguredAt?: string;
  revokedAt?: string;
}

export interface WireGuardClientProfile {
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

export interface NetworkOverview {
  modeA: {
    name: string;
    scope: 'one-browser-only';
    engine: 'electron-webcontentsview-session-proxy';
    isolatedPartition: 'persist:one-browser';
    supportsProtocols: Array<'http' | 'https' | 'socks5'>;
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
