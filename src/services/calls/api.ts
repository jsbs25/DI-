// EARTH ONE call signaling client (business layer). Media transport (e.g. LiveKit)
// is configured server-side; clients receive only short-lived join tokens when available.
export async function apiCall(path: string, options: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err: any = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status; err.body = body; throw err;
  }
  return body;
}

export const callApi = {
  list: (token: string) => apiCall('/api/calls', {}, token),
  get: (token: string, id: string) => apiCall(`/api/calls/${id}`, {}, token),
  invite: (token: string, payload: any) => apiCall('/api/calls/invite', { method: 'POST', body: JSON.stringify(payload) }, token),
  accept: (token: string, id: string) => apiCall(`/api/calls/${id}/accept`, { method: 'POST', body: '{}' }, token),
  reject: (token: string, id: string) => apiCall(`/api/calls/${id}/reject`, { method: 'POST', body: '{}' }, token),
  cancel: (token: string, id: string) => apiCall(`/api/calls/${id}/cancel`, { method: 'POST', body: '{}' }, token),
  end: (token: string, id: string, reason?: string) => apiCall(`/api/calls/${id}/end`, { method: 'POST', body: JSON.stringify({ reason }) }, token),
  leave: (token: string, id: string) => apiCall(`/api/calls/${id}/leave`, { method: 'POST', body: '{}' }, token),
  token: (token: string, id: string) => apiCall(`/api/calls/${id}/token`, { method: 'POST', body: '{}' }, token),
  state: (token: string, id: string, payload: any) => apiCall(`/api/calls/${id}/state`, { method: 'POST', body: JSON.stringify(payload) }, token),
};
