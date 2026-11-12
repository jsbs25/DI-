import type { Env } from './env';

function parseAllowed(env: Env): string[] {
  return (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true; // non-browser / same-origin
  const allowed = parseAllowed(env);
  return allowed.includes(origin);
}

export function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowed(env);
  const allowOrigin = origin && allowed.includes(origin) ? origin : '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-File-Name, X-Mime-Type, X-Conversation-Id, X-Earth-One-CSRF',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const cors = getCorsHeaders(request, env);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
