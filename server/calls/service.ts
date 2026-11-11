import crypto from 'crypto';
import type { CallRecord, CallInviteInput, CallKind, CallParticipantState, CallScope } from './types.ts';

export function nowIso() { return new Date().toISOString(); }
export function makeCallId() { return `call_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
export function makeRoomName(callId: string) { return `earthone_${callId}`; }

export function isActiveCallStatus(status: string) {
  return status === 'ringing' || status === 'connecting' || status === 'active' || status === 'reconnecting';
}

export function getActiveCallForUser(calls: CallRecord[], userId: string): CallRecord | null {
  return calls.find(c => isActiveCallStatus(c.status) && (c.participantIds || []).includes(userId)) || null;
}

export function canUserAccessConversation(store: any, userId: string, conversationId: string) {
  const conv = store.conversations.find((c: any) => c.id === conversationId);
  if (!conv) return { ok: false, error: 'Conversation not found', conv: null };
  if (!store.canAccessConversation(userId, conv)) return { ok: false, error: 'Forbidden', conv: null };
  return { ok: true, conv };
}

export function buildParticipants(participantIds: string[], initiatorId: string): Record<string, CallParticipantState> {
  const out: Record<string, CallParticipantState> = {};
  for (const uid of Array.from(new Set(participantIds))) {
    out[uid] = {
      userId: uid,
      status: uid === initiatorId ? 'joined' : 'ringing',
      joinedAt: uid === initiatorId ? nowIso() : undefined,
      micEnabled: true,
      cameraEnabled: true,
      screenSharing: false,
    };
  }
  return out;
}

export function validateInvite(store: any, actorId: string, input: CallInviteInput): { ok: true; scope: CallScope; kind: CallKind; conversationId?: string; participantIds: string[] } | { ok: false; error: string } {
  const scope = input.scope;
  const kind = input.kind;
  if (scope !== 'direct' && scope !== 'group') return { ok: false, error: 'Invalid call scope' };
  if (kind !== 'audio' && kind !== 'video') return { ok: false, error: 'Invalid call kind' };

  if (scope === 'direct') {
    const targetUserId = typeof input.targetUserId === 'string' ? input.targetUserId : '';
    if (!targetUserId) return { ok: false, error: 'targetUserId is required' };
    if (targetUserId === actorId) return { ok: false, error: 'Cannot call yourself' };
    const target = store.users.find((u: any) => u.id === targetUserId);
    if (!target) return { ok: false, error: 'Target user not found' };
    const perm = store.canSendDirectMessageBetween ? store.canSendDirectMessageBetween(actorId, targetUserId) : { ok: true };
    if (!perm.ok) return { ok: false, error: perm.error || 'Not allowed to call this user' };
    let conversationId = typeof input.conversationId === 'string' ? input.conversationId : '';
    if (conversationId) {
      const acc = canUserAccessConversation(store, actorId, conversationId);
      if (!acc.ok) return { ok: false, error: acc.error || 'Forbidden' };
      if (acc.conv?.type !== 'direct' || !(acc.conv.participantIds || []).includes(targetUserId)) return { ok: false, error: 'Conversation does not match direct call target' };
    }
    return { ok: true, scope, kind, conversationId: conversationId || undefined, participantIds: [actorId, targetUserId] };
  }

  const conversationId = typeof input.conversationId === 'string' ? input.conversationId : '';
  if (!conversationId) return { ok: false, error: 'conversationId is required for group call' };
  const acc = canUserAccessConversation(store, actorId, conversationId);
  if (!acc.ok) return { ok: false, error: acc.error || 'Forbidden' };
  const conv = acc.conv;
  if (conv.type !== 'group') return { ok: false, error: 'Group calls require a group conversation' };
  const members: string[] = Array.isArray(conv.participantIds) ? conv.participantIds : [];
  if (!members.includes(actorId)) return { ok: false, error: 'Forbidden' };
  let requested = Array.isArray(input.participantIds) && input.participantIds.length ? input.participantIds.filter((x: any) => typeof x === 'string') : members;
  requested = Array.from(new Set(requested.filter(id => members.includes(id))));
  if (!requested.includes(actorId)) requested.unshift(actorId);
  if (requested.length < 2) return { ok: false, error: 'Group call requires at least 2 members' };
  const allowed = requested.filter(uid => uid === actorId || !(store.isBlockedEither && store.isBlockedEither(actorId, uid)));
  if (!allowed.includes(actorId) || allowed.length < 2) return { ok: false, error: 'No eligible participants for this call' };
  return { ok: true, scope, kind, conversationId, participantIds: allowed };
}

export function createCallRecord(store: any, actorId: string, input: CallInviteInput): { ok: true; call: CallRecord } | { ok: false; error: string } {
  const v = validateInvite(store, actorId, input);
  if (!v.ok) return v;
  const active = getActiveCallForUser(store.calls || [], actorId);
  if (active) return { ok: false, error: 'BUSY' };
  if (v.scope === 'direct') {
    const targetId = v.participantIds.find(id => id !== actorId)!;
    const targetActive = getActiveCallForUser(store.calls || [], targetId);
    if (targetActive) return { ok: false, error: 'TARGET_BUSY' };
  }
  const id = makeCallId();
  const createdAt = nowIso();
  const call: CallRecord = {
    id,
    roomName: makeRoomName(id),
    scope: v.scope,
    kind: v.kind,
    conversationId: v.conversationId,
    initiatorId: actorId,
    participantIds: v.participantIds,
    participants: buildParticipants(v.participantIds, actorId),
    status: 'ringing',
    createdAt,
    updatedAt: createdAt,
    mediaProvider: 'none',
    capabilities: { audio: true, video: v.kind === 'video', screenShare: true, multiParty: v.scope === 'group', switchCamera: true },
    metadata: {},
  };
  return { ok: true, call };
}

export function acceptCall(call: CallRecord, userId: string): { ok: true; call: CallRecord } | { ok: false; error: string } {
  if (!call.participantIds.includes(userId)) return { ok: false, error: 'Forbidden' };
  if (call.status !== 'ringing') return { ok: false, error: 'Call is not ringing' };
  const p = call.participants[userId] || { userId, status: 'invited' as const };
  call.participants[userId] = { ...p, userId, status: 'joined', joinedAt: nowIso() };
  call.status = 'connecting';
  call.updatedAt = nowIso();
  if (!call.startedAt) call.startedAt = call.updatedAt;
  return { ok: true, call };
}

export function rejectCall(call: CallRecord, userId: string): { ok: true; call: CallRecord } | { ok: false; error: string } {
  if (!call.participantIds.includes(userId)) return { ok: false, error: 'Forbidden' };
  if (call.status !== 'ringing') return { ok: false, error: 'Call is not ringing' };
  const p = call.participants[userId] || { userId, status: 'invited' as const };
  call.participants[userId] = { ...p, userId, status: 'rejected', leftAt: nowIso() };
  if (call.scope === 'direct') {
    call.status = 'rejected';
    call.endedAt = nowIso();
    call.endedBy = userId;
    call.endReason = 'rejected';
  }
  call.updatedAt = nowIso();
  return { ok: true, call };
}

export function cancelCall(call: CallRecord, userId: string): { ok: true; call: CallRecord } | { ok: false; error: string } {
  if (call.initiatorId !== userId) return { ok: false, error: 'Forbidden' };
  if (!(call.status === 'ringing' || call.status === 'connecting' || call.status === 'active' || call.status === 'reconnecting')) return { ok: false, error: 'Call cannot be canceled' };
  call.status = call.startedAt ? 'ended' : 'canceled';
  call.endedAt = nowIso();
  call.endedBy = userId;
  call.endReason = call.startedAt ? 'hangup' : 'canceled';
  call.updatedAt = call.endedAt;
  return { ok: true, call };
}

export function endCall(call: CallRecord, userId: string, reason = 'hangup'): { ok: true; call: CallRecord } | { ok: false; error: string } {
  if (!call.participantIds.includes(userId)) return { ok: false, error: 'Forbidden' };
  if (!(call.status === 'ringing' || call.status === 'connecting' || call.status === 'active' || call.status === 'reconnecting')) return { ok: false, error: 'Call not active' };
  const p = call.participants[userId] || { userId, status: 'joined' as const };
  call.participants[userId] = { ...p, userId, status: 'left', leftAt: nowIso() };
  call.status = 'ended';
  call.endedAt = nowIso();
  call.endedBy = userId;
  call.endReason = reason;
  call.updatedAt = call.endedAt;
  return { ok: true, call };
}

export function leaveCall(call: CallRecord, userId: string): { ok: true; call: CallRecord } | { ok: false; error: string } {
  if (!call.participantIds.includes(userId)) return { ok: false, error: 'Forbidden' };
  const p = call.participants[userId] || { userId, status: 'joined' as const };
  call.participants[userId] = { ...p, userId, status: 'left', leftAt: nowIso() };
  const joined = Object.values(call.participants).filter(x => x.status === 'joined' || x.status === 'ringing');
  if (joined.length === 0 || (call.scope === 'direct' && joined.length < 2)) {
    call.status = 'ended';
    call.endedAt = nowIso();
    call.endedBy = userId;
    call.endReason = 'left';
  }
  call.updatedAt = nowIso();
  return { ok: true, call };
}

export function markActive(call: CallRecord) {
  if (call.status === 'connecting' || call.status === 'reconnecting') {
    call.status = 'active';
    if (!call.startedAt) call.startedAt = nowIso();
    call.updatedAt = nowIso();
  }
}

export function markReconnecting(call: CallRecord) {
  if (call.status === 'active' || call.status === 'connecting') {
    call.status = 'reconnecting';
    call.updatedAt = nowIso();
  }
}

export function canIssueMediaToken(call: CallRecord, userId: string, store?: any): { ok: true } | { ok: false; error: string } {
  if (!call.participantIds.includes(userId)) return { ok: false, error: 'Forbidden' };
  if (!(call.status === 'ringing' || call.status === 'connecting' || call.status === 'active' || call.status === 'reconnecting')) return { ok: false, error: 'Call not joinable' };
  const p = call.participants[userId];
  if (p && (p.status === 'rejected' || p.status === 'left' || p.status === 'missed' || p.status === 'busy')) return { ok: false, error: 'Participant not eligible' };

  // Re-validate EARTH ONE permissions at token time (prevents stale/removed participants from joining media).
  if (store) {
    const user = store.users?.find((u: any) => u.id === userId);
    if (!user) return { ok: false, error: 'Forbidden' };
    const st = typeof store.getAccountStatus === 'function' ? store.getAccountStatus(user) : (user.accountStatus || 'active');
    if (st === 'suspended' || st === 'deleted' || st === 'banned' || st === 'deactivated') return { ok: false, error: 'Forbidden' };

    if (call.scope === 'group' && call.conversationId) {
      const conv = store.conversations?.find((c: any) => c.id === call.conversationId);
      if (!conv) return { ok: false, error: 'Forbidden' };
      if (!(conv.participantIds || []).includes(userId)) return { ok: false, error: 'Forbidden' };
      if (typeof store.canAccessConversation === 'function' && !store.canAccessConversation(userId, conv)) return { ok: false, error: 'Forbidden' };
    } else if (call.scope === 'direct') {
      const otherId = (call.participantIds || []).find((id: string) => id !== userId);
      if (otherId) {
        if (typeof store.isBlockedEither === 'function' && store.isBlockedEither(userId, otherId)) return { ok: false, error: 'Forbidden' };
        if (call.conversationId) {
          const conv = store.conversations?.find((c: any) => c.id === call.conversationId);
          if (conv && typeof store.canAccessConversation === 'function' && !store.canAccessConversation(userId, conv)) return { ok: false, error: 'Forbidden' };
        }
      }
    }
  }

  return { ok: true };
}

export async function issueMediaToken(call: CallRecord, userId: string, opts?: { canPublish?: boolean; canSubscribe?: boolean; store?: any }): Promise<import('./types.ts').CallTokenResponse> {
  const perm = canIssueMediaToken(call, userId, opts?.store);
  if (!perm.ok) return { ok: false, reason: perm.error, provider: 'none' };
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const apiSecret = process.env.LIVEKIT_API_SECRET || '';
  const url = process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || '';
  if (!apiKey || !apiSecret || !url) {
    return { ok: false, blocked: true, reason: 'MEDIA_NOT_CONFIGURED', callId: call.id, roomName: call.roomName, provider: 'none' };
  }
  try {
    // @ts-ignore - optional dependency
    const mod: any = await import('livekit-server-sdk');
    const AccessToken = mod.AccessToken || mod.default?.AccessToken;
    const VideoGrant = mod.VideoGrant; // type-only in some builds
    if (!AccessToken) throw new Error('livekit-server-sdk AccessToken unavailable');
    const at = new AccessToken(apiKey, apiSecret, { identity: String(userId), ttl: '10m' });
    // Grant is bound to this EARTH ONE user identity and this specific call room.
    at.addGrant({ roomJoin: true, room: call.roomName, canPublish: opts?.canPublish ?? true, canSubscribe: opts?.canSubscribe ?? true });
    const token = await at.toJwt();
    return { ok: true, callId: call.id, roomName: call.roomName, token, url, expiresInSec: 600, provider: 'livekit' };
  } catch {
    return { ok: false, blocked: true, reason: 'MEDIA_SDK_UNAVAILABLE', callId: call.id, roomName: call.roomName, provider: 'none' };
  }
}
