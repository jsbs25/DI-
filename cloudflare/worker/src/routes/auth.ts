import type { Env } from '../env';
import { json, readJsonBody } from '../lib/json';
import { clientIp } from '../lib/http';
import { qFirst } from '../lib/db';
import * as store from '../d1/store';

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response | null> {
  const db = env.DB;
  const method = request.method;

  if (path === '/api/integrations' && method === 'GET') {
    return json({ success: true, channels: [], sms: { configured: false, provider: 'unconfigured' }, mail: { configured: false, provider: 'unconfigured' }, runtime: 'cloudflare-worker-d1' });
  }

  if (!db) return json({ success: false, error: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is required for this endpoint in worker runtime.' }, 503);

  try {
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await readJsonBody<any>(request) || {};
      const { user, token } = await store.registerUser(db, body);
      return json({ success: true, user, token, message: 'Welcome to Earth One! Please complete your citizen profile.' });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody<any>(request) || {};
      const { user, token } = await store.loginUser(db, body);
      await store.addAudit(db, { userId: user?.id, event: 'login_success', detail: String(body.identifier || ''), ip: clientIp(request) });
      return json({ success: true, user, token });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = request.headers.get('authorization')?.startsWith('Bearer ') ? request.headers.get('authorization')!.slice(7).trim() : null;
      if (token) await store.deleteSession(db, token);
      return json({ success: true, message: 'Logged out successfully.' });
    }

    if ((path === '/api/auth/me' || path === '/api/auth/current') && method === 'GET') {
      const user = await store.getSessionUser(db, request);
      return json({ success: true, user: user ? await store.selfUserForRow(db, user) : null });
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
        return json({ success: false, error: 'Developer quick login is disabled. It is only available in trusted local development environments with DEV_LOGIN_ENABLED.' }, 403);
      }
      const user = await qFirst<any>(db, `SELECT * FROM users WHERE username='li_wei' AND id='user_cn_1' LIMIT 1`) || await qFirst<any>(db, `SELECT * FROM users WHERE username='li_wei' LIMIT 1`);
      if (!user) return json({ success: false, error: 'Demo account not found.' }, 404);
      const token = await store.createSession(db, user.id);
      await store.addAudit(db, { userId: user.id, event: 'dev_login_success', detail: 'li_wei', ip: clientIp(request) });
      return json({ success: true, user: await store.selfUserForRow(db, user), token, dev: true });
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

    // OAuth/OTP/password reset/bind flows depend on external providers/secrets; keep explicit blocked/501-compatible behavior
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
      // dev-only in Express; safe minimal response in worker
      return json({ success: false, error: 'Not found' }, 404);
    }

  } catch (e: any) {
    const msg = e?.message || 'Request failed';
    const lower = String(msg).toLowerCase();
    const status = lower.includes('unauthorized') ? 401
      : lower.includes('already exists') || lower.includes('taken') ? 400
      : lower.includes('invalid') || lower.includes('required') || lower.includes('not found') && path.includes('register') ? 400
      : lower.includes('not found') ? 404
      : lower.includes('suspended') || lower.includes('not available') ? 403
      : 400;
    if (path === '/api/auth/login' && (lower.includes('invalid') || lower.includes('suspended') || lower.includes('not available'))) {
      await store.addAudit(db, { event: 'login_failed', detail: String((await readJsonBody<any>(request).catch(()=>({})))?.identifier || ''), ip: clientIp(request) }).catch(()=>{});
      return json({ success: false, error: msg }, lower.includes('invalid') ? 401 : 403);
    }
    return json({ success: false, error: msg }, status);
  }
  return null;
}
