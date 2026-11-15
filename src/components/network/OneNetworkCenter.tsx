import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Download,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  PhoneCall,
  Plus,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  networkApi,
  type NetworkDeviceData,
  type NetworkNodeData,
  type NetworkOverviewData,
  type WireGuardProfileData,
} from '../../services/network/api.ts';

interface OneNetworkCenterProps {
  lang: Language;
  onOpenBrowserProxy: () => void;
  onOpenCalls: () => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

async function tryGenerateLocalX25519KeyPair(): Promise<{ publicKey: string; privateKey: string } | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const pair = (await window.crypto.subtle.generateKey(
      { name: 'X25519' } as any,
      true,
      ['deriveBits']
    )) as CryptoKeyPair;
    const rawPub = new Uint8Array(await window.crypto.subtle.exportKey('raw', pair.publicKey));
    const pkcs8Priv = new Uint8Array(await window.crypto.subtle.exportKey('pkcs8', pair.privateKey));
    if (rawPub.length !== 32 || pkcs8Priv.length < 32) return null;
    // RFC 8410 PKCS#8 wraps the raw 32-byte X25519 scalar at the tail
    const rawPriv = pkcs8Priv.slice(pkcs8Priv.length - 32);
    return {
      publicKey: bytesToBase64(rawPub),
      privateKey: bytesToBase64(rawPriv),
    };
  } catch {
    return null;
  }
}

export const OneNetworkCenter: React.FC<OneNetworkCenterProps> = ({
  lang,
  onOpenBrowserProxy,
  onOpenCalls,
}) => {
  const zh = lang === 'zh';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<NetworkOverviewData | null>(null);
  const [nodes, setNodes] = useState<NetworkNodeData[]>([]);
  const [devices, setDevices] = useState<NetworkDeviceData[]>([]);
  const [browserProxyStatus, setBrowserProxyStatus] = useState<EarthOneBrowserProxyStatus | null>(null);

  // Registration form state
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [platform, setPlatform] = useState<NetworkDeviceData['platform']>('ios');
  const [publicKey, setPublicKey] = useState('');
  // Held strictly in browser RAM for optional local .conf download — NEVER transmitted to server
  const [ephemeralLocalPrivKeys, setEphemeralLocalPrivKeys] = useState<Record<string, string>>({});
  const [registerPending, setRegisterPending] = useState(false);
  const [probingNodeId, setProbingNodeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Viewed WireGuard profile
  const [activeProfile, setActiveProfile] = useState<WireGuardProfileData | null>(null);
  const [activeProfilePublicKey, setActiveProfilePublicKey] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const loadAll = useCallback(async (forceNodeRefresh = false) => {
    setError(null);
    try {
      const [ovRes, nodesRes, devRes] = await Promise.all([
        networkApi.overview(),
        networkApi.nodes(forceNodeRefresh),
        networkApi.devices(),
      ]);
      setOverview(ovRes.overview);
      setNodes(nodesRes.nodes || []);
      setDevices(devRes.devices || []);
      setSelectedNodeId((prev) => {
        if (prev && (nodesRes.nodes || []).some((n) => n.id === prev)) return prev;
        return nodesRes.nodes?.[0]?.id || '';
      });
    } catch (e: any) {
      setError(e?.message || (zh ? '加载网络中心数据失败' : 'Failed to load ONE Network data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [zh]);

  useEffect(() => {
    void loadAll(false);
    if (window.earthOneBrowser?.getProxyStatus) {
      window.earthOneBrowser
        .getProxyStatus()
        .then((st) => setBrowserProxyStatus(st))
        .catch(() => {});
    }
  }, [loadAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadAll(true);
  };

  const handleProbeNode = async (nodeId: string) => {
    setProbingNodeId(nodeId);
    setError(null);
    try {
      const res = await networkApi.probeNode(nodeId);
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? res.node : n)));
    } catch (e: any) {
      setError(e?.message || (zh ? '节点探测失败' : 'Node probe failed'));
    } finally {
      setProbingNodeId(null);
    }
  };

  const handleGenerateLocalKeypair = async () => {
    setError(null);
    const kp = await tryGenerateLocalX25519KeyPair();
    if (!kp) {
      setError(
        zh
          ? '当前浏览器不支持 WebCrypto X25519；请在客户端 App 或终端运行 wg genkey | tee priv | wg pubkey，并粘贴公钥。'
          : 'This browser does not support WebCrypto X25519; generate a keypair in your WireGuard app and paste only the public key.'
      );
      return;
    }
    setPublicKey(kp.publicKey);
    setEphemeralLocalPrivKeys((prev) => ({ ...prev, [kp.publicKey]: kp.privateKey }));
    setNotice(
      zh
        ? '已在本地内存生成 Curve25519 密钥对：公钥已填入表单，私钥仅留在本机用于导出配置，绝不会发送至服务器。'
        : 'Generated Curve25519 keypair locally. Only the public key will be sent to ONE servers.'
    );
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!selectedNodeId) {
      setError(zh ? '请先配置并选择一个 WireGuard 节点。' : 'Select a WireGuard node first.');
      return;
    }
    setRegisterPending(true);
    try {
      const cleanPub = publicKey.trim();
      const res = await networkApi.registerDevice({
        nodeId: selectedNodeId,
        deviceName: deviceName.trim(),
        platform,
        publicKey: cleanPub,
      });
      setDevices((prev) => [res.device, ...prev]);
      setActiveProfile(res.profile);
      setActiveProfilePublicKey(res.device.publicKey);
      setDeviceName('');
      setPublicKey('');
      setNotice(
        zh
          ? `设备「${res.device.deviceName}」已注册，已分配内网地址 ${res.device.tunnelIpV4}。`
          : `Device "${res.device.deviceName}" registered with tunnel IP ${res.device.tunnelIpV4}.`
      );
      void loadAll(false);
    } catch (err: any) {
      setError(err?.message || (zh ? '设备注册失败' : 'Failed to register device'));
    } finally {
      setRegisterPending(false);
    }
  };

  const handleOpenDeviceConfig = async (dev: NetworkDeviceData) => {
    setError(null);
    try {
      const res = await networkApi.deviceConfig(dev.id);
      setActiveProfile(res.profile);
      setActiveProfilePublicKey(dev.publicKey);
      setCopiedConfig(false);
    } catch (err: any) {
      setError(err?.message || (zh ? '获取设备配置失败' : 'Failed to fetch device config'));
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setRevokingId(deviceId);
    setError(null);
    try {
      await networkApi.revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      if (activeProfile?.deviceId === deviceId) {
        setActiveProfile(null);
        setActiveProfilePublicKey(null);
      }
      setNotice(zh ? '已吊销设备公钥并释放内网隧道 IP。' : 'Device revoked and tunnel IP released.');
    } catch (err: any) {
      setError(err?.message || (zh ? '吊销设备失败' : 'Failed to revoke device'));
    } finally {
      setRevokingId(null);
    }
  };

  const resolvedConfigText = (() => {
    if (!activeProfile) return '';
    const localPriv = activeProfilePublicKey ? ephemeralLocalPrivKeys[activeProfilePublicKey] : undefined;
    if (!localPriv) return activeProfile.configTemplate;
    return activeProfile.configTemplate.replace('<YOUR_LOCAL_PRIVATE_KEY>', localPriv);
  })();

  const handleCopyConfig = async () => {
    if (!resolvedConfigText) return;
    try {
      await navigator.clipboard.writeText(resolvedConfigText);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {}
  };

  const handleDownloadConfig = () => {
    if (!resolvedConfigText || !activeProfile) return;
    const blob = new Blob([resolvedConfigText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `one-${activeProfile.nodeId}.conf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const nodeStatusBadge = (status: NetworkNodeData['status']) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'degraded':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'offline':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
      case 'maintenance':
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/30';
      default:
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    }
  };

  const nodeStatusLabel = (status: NetworkNodeData['status']) => {
    if (!zh) return status.toUpperCase();
    switch (status) {
      case 'online':
        return '在线';
      case 'degraded':
        return '高延迟/降级';
      case 'offline':
        return '离线';
      case 'maintenance':
        return '维护中';
      default:
        return '待握手验证';
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-10 px-4 sm:px-6 overflow-x-hidden">
      <div className="mx-auto max-w-6xl space-y-6 py-4">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-300">
                <Shield className="w-4 h-4" />
                <span>ONE NETWORK CENTER</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {zh ? 'ONE 网络中心 · 双模式网络架构' : 'ONE Network Center'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
                {zh
                  ? '严格隔离模式 A（仅限 ONE 内置浏览器标签页的会话代理）与模式 B（系统级 WireGuard 加密 VPN）。两者互不混用，私钥永不离机。'
                  : 'Strictly separates Mode A (Electron built-in browser session proxy) from Mode B (system-wide WireGuard VPN). Private keys never leave your device.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{zh ? '刷新状态' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenCalls}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-500" />
                <span>{zh ? '通信中心' : 'ONE Calls'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              {notice}
            </div>
          )}
        </div>

        {/* Mode A vs Mode B Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Mode A Card */}
          <section className="rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {zh ? '模式 A：ONE 内置浏览器代理' : 'Mode A: Built-in Browser Proxy'}
                    </h2>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      partition: persist:one-browser
                    </div>
                  </div>
                </div>
                <span className="rounded-lg border border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-200">
                  {browserProxyStatus?.active
                    ? `${zh ? '代理运行中' : 'Active'} · ${browserProxyStatus.mode.toUpperCase()}`
                    : window.earthOneBrowser?.getProxyStatus
                      ? (zh ? '桌面直连' : 'Direct')
                      : (zh ? '网页环境' : 'Web Sandbox')}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {overview?.modeA.note ||
                  (zh
                    ? '仅作用于 ONE Electron 桌面端内置浏览器标签页，使用独立会话代理，不修改系统代理、不干扰 ONE 实时音视频通话。'
                    : 'Scoped strictly to ONE Electron WebContentsView browser tabs; never alters host OS settings or ONE calls.')}
              </p>

              <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-3.5 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{zh ? '支持协议' : 'Protocols'}</span>
                  <span className="font-mono text-slate-800 dark:text-slate-100">HTTP · HTTPS · SOCKS5 (Remote DNS)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{zh ? '当前状态' : 'Runtime'}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {window.earthOneBrowser?.getProxyStatus
                      ? browserProxyStatus?.active
                        ? `${browserProxyStatus.host}:${browserProxyStatus.port}`
                        : zh ? '已连接桌面内核（直连）' : 'Electron Desktop (Direct)'
                      : zh ? '网页浏览器不支持会级代理接管' : 'Web browser cannot enforce session proxy'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenBrowserProxy}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>{zh ? '打开内置浏览器代理配置' : 'Open Browser Proxy Settings'}</span>
            </button>
          </section>

          {/* Mode B Card */}
          <section className="rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {zh ? '模式 B：ONE 系统级 VPN（WireGuard）' : 'Mode B: System WireGuard VPN'}
                    </h2>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {zh ? '零私钥托管 · RFC Curve25519' : 'Zero server private-key custody'}
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                    overview?.modeB.configured
                      ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                      : 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-200'
                  }`}
                >
                  {loading
                    ? (zh ? '检测中...' : 'Checking...')
                    : overview?.modeB.configured
                      ? `${overview.modeB.nodeCount} ${zh ? '个节点已接入' : 'Nodes'}`
                      : (zh ? '尚未配置节点' : 'Unconfigured')}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {overview?.modeB.note ||
                  (zh
                    ? '通过 WireGuard 内核/User-space TUN 实现设备全局加密隧道。服务器仅登记公钥并分配 10.66.x.x 内网 IP。'
                    : 'Full device WireGuard tunnel. Only device public keys are registered.')}
              </p>

              {/* Honest Platform Capability Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-2.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-amber-500" />
                    <span>{zh ? 'Web 网页端' : 'Web Browser'}</span>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400 leading-snug">
                    {overview?.modeB.platformSupport.web.reason ||
                      (zh ? '浏览器禁止创建 TUN 网卡，仅管理公钥与导出配置。' : 'Manages peers & exports config.')}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-2.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{zh ? 'iOS / Android / Desktop' : 'Native iOS / Android'}</span>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400 leading-snug">
                    {zh
                      ? '配合 NEPacketTunnelProvider / Android VpnService 或 WireGuard 客户端启动全机隧道。'
                      : 'Activates system L3 VPN via WireGuardKit / GoBackend.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-white/10 pt-3">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-500" />
                <span>{zh ? '服务器不保存任何私钥' : 'PrivateKey never stored on server'}</span>
              </span>
              <span className="font-mono">
                {devices.length}/{overview?.modeB.maxDevicesPerUser ?? 10} {zh ? '设备' : 'devices'}
              </span>
            </div>
          </section>
        </div>

        {/* WireGuard Nodes List */}
        <section className="rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-500" />
                <span>{zh ? 'WireGuard VPN 节点列表' : 'WireGuard VPN Nodes'}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {zh
                  ? '由 ONE_NETWORK_NODES_JSON 环境变量注入公开节点信息；点击探测可执行健康检查。'
                  : 'Public node registry loaded from ONE_NETWORK_NODES_JSON.'}
              </p>
            </div>
          </div>

          {!loading && nodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50/70 dark:bg-white/[0.02] p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {zh ? '当前未接入任何 WireGuard 网关节点' : 'No WireGuard nodes configured'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                {zh
                  ? '系统不会伪造虚拟 VPN 节点。请参考仓库内 deploy/network/README.md 在独立 Ubuntu VPS 上执行 setup-wireguard-node.sh 后，将公开节点元数据写入 ONE_NETWORK_NODES_JSON。'
                  : 'ONE does not fabricate dummy VPN servers. Follow deploy/network/README.md to provision a real Ubuntu WireGuard VPS and set ONE_NETWORK_NODES_JSON.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    selectedNodeId === node.id
                      ? 'border-sky-400 dark:border-sky-400/60 bg-sky-50/50 dark:bg-sky-500/10'
                      : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-200/80 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                          {node.countryCode}
                        </span>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {node.name}
                        </h3>
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {node.endpoint}:{node.listenPort} · {node.region} · MTU {node.mtu}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${nodeStatusBadge(node.status)}`}>
                      {nodeStatusLabel(node.status)}
                      {typeof node.latencyMs === 'number' ? ` · ${node.latencyMs}ms` : ''}
                    </span>
                  </div>

                  {node.error && (
                    <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-300 truncate" title={node.error}>
                      {node.error}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200/70 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        selectedNodeId === node.id
                          ? 'bg-sky-600 text-white'
                          : 'bg-white dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/15'
                      }`}
                    >
                      {selectedNodeId === node.id ? (zh ? '已选为注册目标' : 'Selected') : (zh ? '选择该节点' : 'Select')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProbeNode(node.id)}
                      disabled={probingNodeId === node.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50"
                    >
                      <Activity className={`w-3.5 h-3.5 ${probingNodeId === node.id ? 'animate-pulse text-sky-500' : ''}`} />
                      <span>{probingNodeId === node.id ? (zh ? '探测中...' : 'Probing...') : (zh ? '探测节点' : 'Probe')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Device Registration + Registered Peers Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Register Form */}
          <form
            onSubmit={handleRegisterDevice}
            className="lg:col-span-2 rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 space-y-4 shadow-sm"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-500" />
                <span>{zh ? '登记 VPN 设备公钥' : 'Register WireGuard Device'}</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {zh
                  ? '仅提交客户端 Curve25519 公钥。服务端禁止并拒收任何私钥字段。'
                  : 'Submit only your Curve25519 public key. Private keys are strictly rejected by the API.'}
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{zh ? '目标节点' : 'Node'}</span>
                <select
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f192d] px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-sky-500"
                >
                  {nodes.length === 0 ? (
                    <option value="">{zh ? '暂无可用节点' : 'No nodes available'}</option>
                  ) : (
                    nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.region})
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{zh ? '设备名称' : 'Device Name'}</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder={zh ? '例如：我的 iPhone 16 / MacBook Pro' : 'e.g. My iPhone 16'}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f192d] px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{zh ? '设备平台' : 'Platform'}</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as NetworkDeviceData['platform'])}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f192d] px-3 py-2 text-slate-900 dark:text-white outline-none focus:border-sky-500"
                >
                  <option value="ios">iOS (WireGuardKit)</option>
                  <option value="android">Android (VpnService)</option>
                  <option value="macos">macOS</option>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="desktop">ONE Desktop</option>
                </select>
              </label>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {zh ? 'WireGuard 公钥 (Base64)' : 'Public Key (Base64)'}
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateLocalKeypair}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300 hover:underline"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>{zh ? '本地生成密钥对' : 'Generate Local Keypair'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="44-char Curve25519 Base64 PublicKey="
                  className="w-full rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0f192d] px-3 py-2 font-mono text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={registerPending || nodes.length === 0}
              className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              {registerPending
                ? (zh ? '正在分配隧道 IP...' : 'Allocating tunnel IP...')
                : (zh ? '注册设备并生成 WireGuard 配置' : 'Register Peer & Generate Config')}
            </button>
          </form>

          {/* Registered Devices Table */}
          <div className="lg:col-span-3 rounded-3xl border border-slate-200 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {zh ? '已登记 VPN 设备' : 'Registered Devices'}
              </h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {devices.length} {zh ? '台活跃' : 'active'}
              </span>
            </div>

            {devices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/15 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {zh
                  ? '暂无已登记的 WireGuard 设备。可在左侧登记你的手机或电脑公钥。'
                  : 'No registered WireGuard devices yet.'}
              </div>
            ) : (
              <div className="space-y-3">
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {dev.deviceName}
                        </span>
                        <span className="rounded bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-700 dark:text-slate-200">
                          {dev.platform}
                        </span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                          {dev.tunnelIpV4}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        node: {dev.nodeId} · pub: {dev.publicKey.slice(0, 14)}...{dev.publicKey.slice(-6)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenDeviceConfig(dev)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/15"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{zh ? '导出配置' : 'Config'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(dev.id)}
                        disabled={revokingId === dev.id}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{zh ? '吊销' : 'Revoke'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Config Preview Panel */}
        {activeProfile && (
          <section className="rounded-3xl border border-sky-300 dark:border-sky-500/40 bg-slate-900 text-slate-100 p-5 sm:p-6 space-y-3 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {zh ? `WireGuard 配置文件 · ${activeProfile.nodeName}` : `WireGuard Profile · ${activeProfile.nodeName}`}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {activeProfilePublicKey && ephemeralLocalPrivKeys[activeProfilePublicKey]
                    ? (zh
                        ? '当前会话内存包含你刚在本地生成的私钥，已自动填入下方下载模板（服务器未保存该私钥）。'
                        : 'Session-local private key substituted locally for download (never sent to server).')
                    : (zh
                        ? '服务器不持有私钥；导入 WireGuard 客户端时请将 <YOUR_LOCAL_PRIVATE_KEY> 替换为本机私钥。'
                        : 'Replace <YOUR_LOCAL_PRIVATE_KEY> locally with your device private key.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyConfig}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedConfig ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadConfig}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{zh ? '下载 .conf' : 'Download .conf'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfile(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-white/10"
                  aria-label="Close config"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs font-mono text-emerald-300 leading-relaxed">
              {resolvedConfigText}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
};
