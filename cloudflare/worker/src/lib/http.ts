export function getBearerToken(request: Request): string | null {
  const h = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  // also support ?token= for parity where needed (WS handled separately)
  try {
    const u = new URL(request.url);
    const t = u.searchParams.get('token');
    if (t) return t;
  } catch {}
  return null;
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
