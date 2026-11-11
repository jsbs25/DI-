import type { CallRecord } from './types.ts';

export function ensureCallsArray(store: any): CallRecord[] {
  if (!Array.isArray(store.calls)) store.calls = [];
  return store.calls as CallRecord[];
}

export function addCall(store: any, call: CallRecord) {
  const calls = ensureCallsArray(store);
  calls.push(call);
  // keep bounded history
  if (calls.length > 2000) store.calls = calls.slice(-1500);
  return call;
}

export function getCallById(store: any, id: string): CallRecord | null {
  const calls = ensureCallsArray(store);
  return calls.find(c => c.id === id) || null;
}

export function listCallsForUser(store: any, userId: string, limit = 50): CallRecord[] {
  const calls = ensureCallsArray(store);
  return calls
    .filter(c => (c.participantIds || []).includes(userId))
    .sort((a,b)=> new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(200, limit)));
}
