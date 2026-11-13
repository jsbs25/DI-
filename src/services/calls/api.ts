// EARTH ONE call signaling client (business layer). Uses same-origin session cookie auth.
// (No localStorage/Bearer tokens; caller must ensure credentials are included by global fetch or pass-through.)
export async function apiCall(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any || {}) };
  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err: any = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status; err.body = body; throw err;
  }
  return body;
}

export const callApi = {
  list: () => apiCall('/api/calls'),
  get: (id: string) => apiCall(`/api/calls/${id}`),
  invite: (payload: any) => apiCall('/api/calls/invite', { method: 'POST', body: JSON.stringify(payload) }),
  accept: (id: string) => apiCall(`/api/calls/${id}/accept`, { method: 'POST', body: '{}' }),
  reject: (id: string) => apiCall(`/api/calls/${id}/reject`, { method: 'POST', body: '{}' }),
  cancel: (id: string) => apiCall(`/api/calls/${id}/cancel`, { method: 'POST', body: '{}' }),
  end: (id: string, reason?: string) => apiCall(`/api/calls/${id}/end`, { method: 'POST', body: JSON.stringify({ reason }) }),
  leave: (id: string) => apiCall(`/api/calls/${id}/leave`, { method: 'POST', body: '{}' }),
  token: (id: string) => apiCall(`/api/calls/${id}/token`, { method: 'POST', body: '{}' }),
  state: (id: string, payload: any) => apiCall(`/api/calls/${id}/state`, { method: 'POST', body: JSON.stringify(payload) }),
};
