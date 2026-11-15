export const ONE_BROWSER_SESSION_PARTITION = 'persist:one-browser';

export type BrowserProxyMode = 'direct' | 'http' | 'https' | 'socks5';

export interface BrowserProxyInput {
  mode: BrowserProxyMode;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  bypassHosts?: string[];
  label?: string;
}

export interface BrowserProxyPublicStatus {
  mode: BrowserProxyMode;
  active: boolean;
  label?: string;
  host?: string;
  port?: number;
  hasCredentials: boolean;
  remoteDns: boolean;
  partition: string;
  bypassRules: string;
  isolationNotice: string;
  updatedAt: string;
  error?: string;
}

export interface ValidatedBrowserProxy {
  mode: BrowserProxyMode;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  bypassHosts: string[];
  label?: string;
}

const DEFAULT_BYPASS_HOSTS = ['<local>', 'localhost', '127.0.0.1', '[::1]', '*.local'];

export function sanitizeHostToken(raw: string): string {
  const s = String(raw || '').trim();
  if (!s || s.length > 253) return '';
  if (/[\s,;=/\\<>'"`@?#]/.test(s)) return '';
  if (s.includes('://')) return '';
  return s;
}

export function validateProxyInput(input: BrowserProxyInput): { ok: true; value: ValidatedBrowserProxy } | { ok: false; error: string } {
  const mode = input?.mode;
  if (!['direct', 'http', 'https', 'socks5'].includes(mode)) {
    return { ok: false, error: '不支持的代理协议，请选择 direct / http / https / socks5。' };
  }
  const extraBypass = Array.isArray(input?.bypassHosts)
    ? input.bypassHosts.map(sanitizeHostToken).filter(Boolean)
    : [];

  if (mode === 'direct') {
    return {
      ok: true,
      value: {
        mode: 'direct',
        bypassHosts: extraBypass,
        label: input?.label ? String(input.label).trim().slice(0, 64) : undefined,
      },
    };
  }

  const host = sanitizeHostToken(String(input?.host || ''));
  if (!host) {
    return { ok: false, error: '请输入合法的代理服务器主机名或 IP 地址（不含协议前缀和路径）。' };
  }
  const portNum = Number(input?.port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, error: '代理端口必须为 1–65535 之间的整数。' };
  }

  const username = typeof input?.username === 'string' && input.username.trim() ? input.username.trim() : undefined;
  const password = typeof input?.password === 'string' && input.password.length > 0 ? input.password : undefined;
  const label = typeof input?.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 64) : undefined;

  return {
    ok: true,
    value: {
      mode,
      host,
      port: portNum,
      username,
      password,
      bypassHosts: extraBypass,
      label,
    },
  };
}

export function buildElectronProxyConfig(
  proxy: ValidatedBrowserProxy,
  oneAppOrigin?: string
): { mode: 'direct' | 'fixed_servers'; proxyRules?: string; proxyBypassRules?: string } {
  if (proxy.mode === 'direct' || !proxy.host || !proxy.port) {
    return { mode: 'direct' };
  }

  const bypassSet = new Set<string>(DEFAULT_BYPASS_HOSTS);
  for (const h of proxy.bypassHosts || []) {
    if (h) bypassSet.add(h);
  }
  if (oneAppOrigin) {
    try {
      const u = new URL(oneAppOrigin);
      if (u.hostname) bypassSet.add(u.hostname);
    } catch {}
  }

  // Use socks5h:// for SOCKS5 so DNS resolution occurs inside the remote proxy node rather than leaking locally.
  const proxyRules =
    proxy.mode === 'socks5'
      ? `socks5h://${proxy.host}:${proxy.port}`
      : proxy.mode === 'https'
        ? `https=${proxy.host}:${proxy.port}`
        : `http=${proxy.host}:${proxy.port}`;

  return {
    mode: 'fixed_servers',
    proxyRules,
    proxyBypassRules: Array.from(bypassSet).join(','),
  };
}

export function toPublicProxyStatus(
  proxy: ValidatedBrowserProxy,
  oneAppOrigin?: string,
  error?: string
): BrowserProxyPublicStatus {
  const built = buildElectronProxyConfig(proxy, oneAppOrigin);
  return {
    mode: proxy.mode,
    active: proxy.mode !== 'direct' && !!proxy.host && !!proxy.port,
    label: proxy.label,
    host: proxy.host,
    port: proxy.port,
    hasCredentials: !!(proxy.username || proxy.password),
    remoteDns: proxy.mode === 'socks5',
    partition: ONE_BROWSER_SESSION_PARTITION,
    bypassRules: built.proxyBypassRules || DEFAULT_BYPASS_HOSTS.join(','),
    isolationNotice: '仅作用于 ONE 内置浏览器会话 (persist:one-browser)；不改变系统网络，不影响 ONE 通话、聊天与账号认证通道。',
    updatedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}
