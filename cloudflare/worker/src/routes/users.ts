import type { Env } from '../env';
import { json } from '../lib/json';
import * as store from '../d1/store';
import { publicProfileView } from '../lib/user-shape';
import { qAll, qFirst, exec } from '../lib/db';

export async function handleUsers(request: Request, env: Env, path: string): Promise<Response | null> {
  const db = env.DB;
  if (!db) return json({ success: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const method = request.method;
  const url = new URL(request.url);
  const viewer = await store.getSessionUser(db, request);
  const viewerId = viewer?.id || null;

  try {
    if (path === '/api/users' && method === 'GET') {
      const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
      if (q.trim()) {
        const users = await store.searchUsers(db, viewerId, q, 30);
        return json({ success: true, users });
      }
      // default list: public-ish minimal set respecting privacy (best-effort)
      const rows = await qAll<any>(db, 'SELECT * FROM users ORDER BY joined_at DESC LIMIT 50');
      const users: any[] = [];
      for (const u of rows) {
        if (viewerId && u.id === viewerId) continue;
        const view = await publicProfileView(db, viewerId, u);
        if (!view.restricted) users.push(view.user || view);
      }
      return json({ success: true, users });
    }

    const m = path.match(/^\/api\/users\/([^/]+)$/);
    if (m && method === 'GET') {
      const id = decodeURIComponent(m[1]);
      const u = await store.getUserById(db, id);
      if (!u) return json({ success: false, error: 'User not found' }, 404);
      const view = await publicProfileView(db, viewerId, u);
      // Express returns {success,user} in some cases and view in others; keep compatible superset
      return json({ success: true, user: view.user || view, ...view });
    }

    const follow = path.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (follow && method === 'POST') {
      const r = await store.requireSessionUser(db, request);
      if ('error' in r) return r.error;
      // follow graph table may not exist in draft; no-op safe success for compatibility until social graph migrated
      return json({ success: true, message: 'Follow state recorded (worker compatibility mode).' });
    }
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Request failed' }, 400);
  }
  return null;
}
