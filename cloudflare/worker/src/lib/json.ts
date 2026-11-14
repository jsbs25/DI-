export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(extraHeaders || {}) },
  });
}

export async function readJsonBody<T = any>(request: Request): Promise<T | null> {
  try {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
