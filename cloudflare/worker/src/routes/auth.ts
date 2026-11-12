import type { Env } from '../env';
import { json, readJsonBody } from '../lib/json';
import { clientIp, getSessionToken, sessionCookie, clearSessionCookie } from '../lib/http';
import { qFirst } from '../lib/db';
import { isOriginAllowed } from '../cors';
import * as store from '../d1/store';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(request: Request, identifier: string): { ok: boolean; retryAfterSec?: number } {
  const ip = clientIp(request);
  const key = `${ip}|${String(identifier || '').trim().toLowerCase().slice(0, 120)}`;
  const now = Date.now();
  const cur = loginAttempts.get(key);
  if (!cur || now > cur.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { ok: true };
  }
  if (cur.count >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }
  cur.count += 1;
  return { ok: true };
}

function clearLoginRateLimit(request: Request, identifier: string) {
  const ip = clientIp(request);
  loginAttempts.delete(`${ip}|${String(identifier || '').trim().toLowerCase().slice(0, 120)}`);
}

function originForRequest(request: Request): string | null {
  return request.headers.get('Origin');
}

function isTrustedOrigin(request: Request, env: Env): boolean {
  return isOriginAllowed(request, env);
}

function requireTrustedOrigin(request: Request, env: Env): Response | null {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const origin = originForRequest(request);
  if (!origin) return null; // same-origin/non-browser
  if (!isTrustedOrigin(request, env)) {
    return json({ success: false, error: 'Forbidden origin.' }, 403);
  }
  return null;
}

function authResponse(user: any, request: Request, token: string, body: Record<string, any> = {}) {
  return json({ success: true, user, ...body }, 200, { 'Set-Cookie': sessionCookie(token, request) });
}

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response | null> {
  const db = env.DB;
  const method = request.method;

  if (path === '/api/integrations' && method === 'GET') {
    return json({ success: true, channels: [], sms: { configured: false, provider: 'unconfigured' }, mail: { configured: false, provider: 'unconfigured' }, runtime: 'cloudflare-worker-d1' });
  }

  if (!db) return json({ success: false, error: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is required for this endpoint in worker runtime.' }, 503);

  const originErr = requireTrustedOrigin(request, env);
  if (originErr) return originErr;

  try {
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await readJsonBody<any>(request) || {};
      const { user, token } = await store.registerUser(db, body);
      await store.addAudit(db, { userId: user?.id, event: 'register_success', detail: String(body.email || ''), ip: clientIp(request) });
      return authResponse(user, request, token, { message: 'Welcome to Earth One! Please complete your citizen profile.' });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody<any>(request) || {};
      const rl = checkLoginRateLimit(request, String(body.identifier || ''));
      if (!rl.ok) {
        return json({ success: false, error: 'Too many login attempts. Please try again later.' }, 429, { 'Retry-After': String(rl.retryAfterSec || 60) });
      }
      const { user, token } = await store.loginUser(db, body);
      clearLoginRateLimit(request, String(body.identifier || ''));
      await store.addAudit(db, { userId: user?.id, event: 'login_success', detail: String(body.identifier || ''), ip: clientIp(request) });
      return authResponse(user, request, token);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = getSessionToken(request);
      if (token) await store.deleteSession(db, token);
      return json({ success: true, message: 'Logged out successfully.' }, 200, { 'Set-Cookie': clearSessionCookie(request) });
    }

    if ((path === '/api/auth/me' || path === '/api/auth/current') && method === 'GET') {
      const user = await store.getSessionUser(db, request);
      if (!user) return json({ success: true, user: null });
      return json({ success: true, user: await store.selfUserForRow(db, user) });
    }

    if (path === '/api/account/me' && method === 'GET') {
      const r = await store.requireSessionUser(db, request);
      if ('error' in r) return r.error;
      const me = await store.selfUserForRow(db, r.user);
      return json({ success: true, account: me, user: me });
    }

    if (path === '/api/auth/status' && method === 'GET') {
      const st = await store.getAuthRuntimeStatus(env);
      return json({ success: true, ...st });
    }

    if (path === '/api/auth/dev-login' && method === 'POST') {
      const devEnabled = String(env?.DEV_LOGIN_ENABLED || '').toLowerCase() === 'true';
      if (!devEnabled) {
        await store.addAudit(db, { event: 'dev_login_blocked', detail: `ip=${clientIp(request)}`, ip: clientIp(request) });
        return json({ success: false, error: 'Developer quick login is disabled.' }, 403);
      }
      const user = await qFirst<any>(db, `SELECT * FROM users WHERE username='li_wei' AND id='user_cn_1' LIMIT 1`) || await qFirst<any>(db, `SELECT * FROM users WHERE username='li_wei' LIMIT 1`);
      if (!user) return json({ success: false, error: 'Demo account not found.' }, 404);
      const token = await store.createSession(db, user.id);
      await store.addAudit(db, { userId: user.id, event: 'dev_login_success', detail: 'li_wei', ip: clientIp(request) });
      return authResponse(await store.selfUserForRow(db, user), request, token, { dev: true });
    }

    if (path === '/api/auth/onboarding' && method === 'POST') {
      const r = await store.requireSessionUser(db, request);
      if ('error' in r) return r.error;
      const body = await readJsonBody<any>(request) || {};
      const updated = await store.completeOnboarding(db, r.user.id, body);
      return json({ success: true, user: updated });
    }

    if (path === '/api/auth/update-profile' && method === 'POST') {
      const r = await store.requireSessionUser(db, request);
      if ('error' in r) return r.error;
      const body = await readJsonBody<any>(request) || {};
      const updated = await store.updateProfile(db, r.user.id, body);
      return json({ success: true, user: updated });
    }

    if (path === '/api/auth/toggle-location' && method === 'POST') {
      const r = await store.requireSessionUser(db, request);
      if ('error' in r) return r.error;
      const updated = await store.toggleLocation(db, r.user.id);
      return json({ success: true, user: updated });
    }

    const blockedAuthPrefixes = ['/api/auth/phone/', '/api/auth/wechat', '/api/auth/google', '/api/auth/email/', '/api/auth/password/', '/api/auth/bind/', '/api/auth/unlink', '/api/auth/security'];
    if (method !== 'OPTIONS' && blockedAuthPrefixes.some(p => path === p || path.startsWith(p))) {
      if (path === '/api/auth/security' && method === 'GET') {
        const r = await store.requireSessionUser(db, request);
        if ('error' in r) return r.error;
        const u = await store.selfUserForRow(db, r.user);
        return json({ success: true, user: { id: u.id, email: u.email, phone: u.phone, emailVerified: u.emailVerified, phoneVerified: u.phoneVerified, linkedIdentities: u.linkedIdentities || [] }, sms: { configured: false }, mail: { configured: false } });
      }
      return json({ success: false, blocked: true, error: 'NOT_IMPLEMENTED_IN_WORKER', message: 'This auth flow is not yet migrated/configured in Cloudflare worker runtime (requires provider secrets and compatibility logic).', path, method }, 501);
    }

    if (path === '/api/dev/status' && method === 'GET') {
      return json({ success: false, error: 'Not found' }, 404);
    }

  } catch (e: any) {
    const msg = e?.message || 'Request failed';
    const lower = String(msg).toLowerCase();
    const status = lower.includes('unauthorized') ? 401
      : lower.includes('already exists') || lower.includes('taken') ? 400
      : lower.includes('invalid') || lower.includes('required') ? 400
      : lower.includes('not found') ? 404
      : lower.includes('suspended') || lower.includes('not available') ? 403
      : 400;
    if (path === '/api/auth/login' && (lower.includes('invalid') || lower.includes('suspended') || lower.includes('not available'))) {
      await store.addAudit(db, { event: 'login_failed', detail: 'auth_failed', ip: clientIp(request) }).catch(()=>{});
      return json({ success: false, error: msg }, lower.includes('invalid') ? 401 : 403);
    }
    return json({ success: false, error: msg }, status);
  }
  return null;
}
