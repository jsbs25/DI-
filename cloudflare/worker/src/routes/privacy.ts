import type { Env } from '../env';
import { json, readJsonBody } from '../lib/json';
import * as store from '../d1/store';

export async function handlePrivacy(request: Request, env: Env, path: string): Promise<Response | null> {
  const db = env.DB;
  if (!db) return json({ success: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const method = request.method;
  try {
    if (path === '/api/messenger/privacy' && method === 'GET') {
      const r = await store.requireSessionUser(db, request); if ('error' in r) return r.error;
      const settings = await store.getPrivacySettingsRow(db, r.user.id);
      return json({ success: true, settings, privacy: settings });
    }
    if (path === '/api/messenger/privacy' && method === 'PUT') {
      const r = await store.requireSessionUser(db, request); if ('error' in r) return r.error;
      const body = await readJsonBody<any>(request) || {};
      const settings = await store.setPrivacySettingsRow(db, r.user.id, body?.settings || body || {});
      return json({ success: true, settings, privacy: settings });
    }
  } catch (e:any) {
    return json({ success: false, error: e?.message || 'Request failed' }, 400);
  }
  return null;
}
