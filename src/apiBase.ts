export function getApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (env) return env.replace(/\/+$/, '');
  return '';
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBase()}${p}`;
}

export function wsUrl(path = '/ws'): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (base) {
    try {
      const u = new URL(base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = p;
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      // fall through
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${p}`;
}
