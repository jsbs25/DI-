import type { Env } from '../env';

export const SESSION_COOKIE_NAME = 'earth_one_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionToken(request: Request): string | null {
  const cookies = parseCookies(request.headers.get('Cookie') || request.headers.get('cookie'));
  if (cookies[SESSION_COOKIE_NAME]) return cookies[SESSION_COOKIE_NAME];
  const h = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return true;
  }
}

export function sessionCookie(token: string, request: Request, maxAge = SESSION_MAX_AGE_SEC, env?: Env): string {
  const secure = isSecureRequest(request);
  const reqSameSite = String(env?.COOKIE_SAMESITE || '').trim().toLowerCase();
  // Same-origin Workers deployment: prefer Lax by default on HTTPS; allow explicit override.
  let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';
  if (reqSameSite === 'strict') sameSite = 'Strict';
  else if (reqSameSite === 'none') sameSite = secure ? 'None' : 'Lax';
  else if (reqSameSite === 'lax' || !reqSameSite) sameSite = 'Lax';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
  ];
  const domain = String(env?.COOKIE_DOMAIN || '').trim();
  if (domain) parts.push(`Domain=${domain}`);
  if (secure || sameSite === 'None') parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request: Request, env?: Env): string {
  return sessionCookie('', request, 0, env);
}
