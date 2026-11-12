import type { Env } from './env';
import { getCorsHeaders, withCors } from './cors';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

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

async function handleIntegrations(_request: Request, _env: Env) {
  // Safe runtime status only; does not claim providers are configured.
  return json({
    success: true,
    channels: [],
    sms: { configured: false, provider: 'unconfigured' },
    mail: { configured: false, provider: 'unconfigured' },
    runtime: 'cloudflare-worker-scaffold',
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    let response: Response;
    try {
      if (pathname === '/health' || pathname === '/api/health') {
        response = await handleHealth(request, env);
      } else if (pathname === '/api/integrations' && request.method === 'GET') {
        response = await handleIntegrations(request, env);
      } else if (pathname.startsWith('/api/') || pathname === '/ws') {
        response = notImplemented(pathname, request.method);
      } else {
        response = json({ success: false, error: 'NOT_FOUND' }, 404);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      response = json({ success: false, error: 'WORKER_ERROR', message }, 500);
    }

    return withCors(response, request, env);
  },
};
