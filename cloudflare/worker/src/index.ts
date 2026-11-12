import type { Env } from './env';
import { getCorsHeaders, withCors } from './cors';
import { json } from './lib/json';
import { handleAuth } from './routes/auth';
import { handleUsers } from './routes/users';
import { handlePrivacy } from './routes/privacy';

function notImplemented(path: string, method: string) {
  return json(
    {
      success: false,
      error: 'NOT_IMPLEMENTED_IN_CLOUDFLARE_WORKER',
      message:
        'This endpoint is not yet migrated to the Cloudflare Worker runtime. Existing Express behavior remains the source of truth until migrated and tested.',
      path,
      method,
    },
    501,
  );
}

async function handleHealth(_request: Request, env: Env) {
  const bindings = {
    db: Boolean(env.DB),
    bucket: Boolean(env.BUCKET),
    messengerRoom: Boolean(env.MESSENGER_ROOM),
    userPresence: Boolean(env.USER_PRESENCE),
  };
  return json({
    success: true,
    service: 'earthone-worker',
    status: 'ok',
    environment: env.ENVIRONMENT || 'unknown',
    bindings,
    now: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    let response: Response | null = null;
    try {
      if (pathname === '/health' || pathname === '/api/health') {
        response = await handleHealth(request, env);
      } else {
        // Route modules (return Response if handled, null to fall through)
        response = await handleAuth(request, env, pathname);
        if (!response) response = await handleUsers(request, env, pathname);
        if (!response) response = await handlePrivacy(request, env, pathname);
      }

      if (!response) {
        if (pathname.startsWith('/api/') || pathname === '/ws') {
          response = notImplemented(pathname, request.method);
        } else {
          response = json({ success: false, error: 'NOT_FOUND' }, 404);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      response = json({ success: false, error: 'WORKER_ERROR', message }, 500);
    }

    return withCors(response, request, env);
  },
};
