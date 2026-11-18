// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { store } from './store.ts';
import { aiGateway } from './aiGateway.ts';
import { decideNotification } from './notificationPolicy.ts';
import { getCallById } from './calls/index.ts';
import { getActiveCallForUser, isActiveCallStatus, markReconnecting, touchCallHeartbeat } from './calls/service.ts';
import { listCallSignalsForUser, pushCallSignal } from './calls/signals.ts';

type Client = {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  activeConversationId?: string | null;
  isAlive: boolean;
  connectedAt: number;
};

const clientsByUser = new Map<string, Set<Client>>();
const typingTimers = new Map<string, NodeJS.Timeout>(); // key conv:user -> timeout

function formatAttachmentPreview(attachments?: any[]): string {
  if (!attachments || !attachments.length) return '';
  const first = attachments[0];
  const mime = String(first?.mimeType || '').toLowerCase();
  if (first?.type === 'audio' || mime.startsWith('audio/')) return '[语音消息]';
  if (first?.type === 'image' || mime.startsWith('image/')) return '[图片]';
  return `[文件] ${first?.name || ''}`.trim();
}

export function isUserViewingConversation(userId: string, conversationId?: string | null): boolean {
  if (!userId || !conversationId) return false;
  const set = clientsByUser.get(userId);
  if (!set) return false;
  for (const c of set) {
    if (c.ws.readyState === 1 && c.activeConversationId === conversationId) {
      return true;
    }
  }
  return false;
}

function safeSend(ws: WebSocket, data: any) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }
}

export function broadcastToUsers(userIds: string[], data: any, exceptDevice?: string) {
  for (const uid of new Set(userIds)) {
    const set = clientsByUser.get(uid);
    if (!set) continue;
    for (const c of set) {
      if (exceptDevice && c.deviceId === exceptDevice) continue;
      if (c.ws.readyState !== 1) continue;
      safeSend(c.ws, data);
    }
  }
}

function clearTypingForUser(userId: string) {
  const suffix = `:${userId}`;
  for (const [key, timer] of typingTimers.entries()) {
    if (!key.endsWith(suffix)) continue;
    clearTimeout(timer);
    typingTimers.delete(key);
    const convId = key.slice(0, key.length - suffix.length);
    const conv = store.conversations.find(c => c.id === convId);
    if (conv) {
      broadcastToUsers(
        (conv.participantIds || []).filter(id => id !== userId),
        { type: 'typing', conversationId: convId, userId, on: false }
      );
    }
  }
}

function notifyActiveCallOnDisconnect(userId: string) {
  const remaining = clientsByUser.get(userId);
  if (remaining && remaining.size > 0) return;
  try {
    const activeCall = getActiveCallForUser(store.calls || [], userId);
    if (!activeCall || activeCall.status === 'ringing') return;
    if (activeCall.status === 'active' || activeCall.status === 'connecting') {
      markReconnecting(activeCall);
    }
    const recipients = (activeCall.participantIds || []).filter((id: string) => id !== userId);
    broadcastToUsers(recipients, {
      type: 'call_state',
      callId: activeCall.id,
      userId,
      peerDisconnected: true,
      call: activeCall,
      at: new Date().toISOString(),
    });
  } catch {}
}

function broadcastPresence(userId: string) {
  const set = clientsByUser.get(userId);
  const online = !!(set && set.size > 0);
  const user = store.users.find(u => u.id === userId);
  if (user) {
    (user as any).isOnline = online;
    (user as any).lastActiveAt = new Date().toISOString();
  }
  // notify self with true state
  broadcastToUsers([userId], { type: 'presence', userId, online, lastActiveAt: (user as any)?.lastActiveAt, deviceCount: set?.size || 0 });
  // notify related users with privacy-masked state
  const friendIds = store.getFriendIds(userId);
  const convIds = store.getConversationsForUser(userId).filter(c => c.type === 'direct' || c.type === 'group').flatMap(c => c.participantIds || []);
  const recipients = Array.from(new Set([...friendIds, ...convIds])).filter(id => id && id !== userId);
  for (const rid of recipients) {
    const masked = (store as any).getMaskedPresenceForViewer ? (store as any).getMaskedPresenceForViewer(rid, userId) : { isOnline: online, lastActiveAt: (user as any)?.lastActiveAt };
    broadcastToUsers([rid], { type: 'presence', userId, online: !!masked.isOnline, lastActiveAt: masked.lastActiveAt });
  }
}

export function getTokenFromReq(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const t = url.searchParams.get('token');
    if (t) return t;
  } catch {}
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookieHeader = String(req.headers['cookie'] || '');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      if (k === 'earth_one_session') {
        try {
          const val = decodeURIComponent(part.slice(idx + 1).trim());
          if (val) return val;
        } catch {}
      }
    }
  }
  return null;
}

export function attachMessengerWs(wss: WebSocketServer) {
  // Protocol-level WebSocket heartbeat to keep proxies/NATs alive & sweep half-open sockets
  const heartbeatInterval = setInterval(() => {
    for (const [uid, set] of clientsByUser.entries()) {
      for (const client of Array.from(set)) {
        if (!client.isAlive || client.ws.readyState > 1) {
          try { (client.ws as any).terminate?.(); } catch { try { client.ws.close(); } catch {} }
          set.delete(client);
          if (set.size === 0) {
            clientsByUser.delete(uid);
            clearTypingForUser(uid);
            broadcastPresence(uid);
            notifyActiveCallOnDisconnect(uid);
          }
          continue;
        }
        client.isAlive = false;
        try { (client.ws as any).ping?.(); } catch {}
      }
    }
  }, 20_000);
  heartbeatInterval.unref?.();
  wss.on?.('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = getTokenFromReq(req);
    const user = token ? store.getUserByToken(token) : null;
    if (!user) {
      safeSend(ws, { type: 'error', error: 'unauthorized' });
      try { ws.close(4401, 'unauthorized'); } catch {}
      return;
    }
    let deviceId = '';
    try { const u = new URL(req.url || '/', 'http://localhost'); deviceId = u.searchParams.get('deviceId') || `dev_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; } catch { deviceId = `dev_${Date.now()}`; }
    const client: Client = { ws, userId: user.id, deviceId, isAlive: true, connectedAt: Date.now() };
    if (!clientsByUser.has(user.id)) clientsByUser.set(user.id, new Set());
    clientsByUser.get(user.id)!.add(client);

    (ws as any).on?.('pong', () => {
      client.isAlive = true;
    });

    // update server-side last active on connect
    try { (user as any).lastActiveAt = new Date().toISOString(); } catch {}
    safeSend(ws, { type: 'hello', userId: user.id, deviceId, serverTime: new Date().toISOString() });
    broadcastPresence(user.id);

    // Immediately re-sync active call state if user just reconnected mid-call
    try {
      const activeCall = getActiveCallForUser(store.calls || [], user.id);
      if (activeCall) {
        safeSend(ws, { type: 'call_sync', call: activeCall, serverTime: new Date().toISOString() });
        const recipients = (activeCall.participantIds || []).filter((id: string) => id !== user.id);
        broadcastToUsers(recipients, {
          type: 'call_peer_online',
          callId: activeCall.id,
          userId: user.id,
          at: new Date().toISOString(),
        });
      }
    } catch {}

    try { store.saveToDisk(); } catch {}

    ws.on('message', async (raw: any) => {
      client.isAlive = true;
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const type = msg?.type;
      if (type === 'ping') { safeSend(ws, { type: 'pong', t: Date.now() }); return; }

      if (type === 'typing') {
        const convId = String(msg.conversationId || '');
        const conv = store.conversations.find(c => c.id === convId);
        if (!conv || !store.canAccessConversation(user.id, conv)) return;
        const on = !!msg.on;
        const key = `${convId}:${user.id}`;
        const prev = typingTimers.get(key); if (prev) clearTimeout(prev);
        if (on) typingTimers.set(key, setTimeout(() => { typingTimers.delete(key); broadcastToUsers((conv.participantIds||[]).filter(id => id !== user.id), { type: 'typing', conversationId: convId, userId: user.id, on: false }); }, 4000));
        else typingTimers.delete(key);
        broadcastToUsers((conv.participantIds||[]).filter(id => id !== user.id), { type: 'typing', conversationId: convId, userId: user.id, on });
        return;
      }

      if (type === 'active_conversation') {
        const convId = typeof msg.conversationId === 'string' && msg.conversationId ? msg.conversationId : null;
        client.activeConversationId = convId;
        if (convId) {
          const conv = store.conversations.find(c => c.id === convId);
          if (conv && store.canAccessConversation(user.id, conv)) {
            const allowReceipt = store.shouldSendReadReceipt(user.id);
            let markedNotifs = 0;
            await store.mutate(async () => {
              const r = store.markConversationRead(convId, user.id, { allowReadReceipt: allowReceipt });
              markedNotifs = r?.markedNotifs || 0;
            });
            if (markedNotifs > 0) {
              broadcastToUsers([user.id], { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(user.id), conversationId: convId });
            }
          }
        }
        return;
      }

      if (type === 'read') {
        const convId = String(msg.conversationId || '');
        const conv = store.conversations.find(c => c.id === convId);
        if (!conv || !store.canAccessConversation(user.id, conv)) return;
        const allowReceipt = store.shouldSendReadReceipt(user.id);
        let markedNotifs = 0;
        await store.mutate(async () => {
          const r = store.markConversationRead(convId, user.id, { allowReadReceipt: allowReceipt });
          markedNotifs = r?.markedNotifs || 0;
        });
        if (markedNotifs > 0) {
          broadcastToUsers([user.id], { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(user.id), conversationId: convId });
        }
        if (allowReceipt) {
          broadcastToUsers(conv.participantIds||[], { type: 'read', conversationId: convId, userId: user.id, readAt: new Date().toISOString() });
        } else {
          broadcastToUsers([user.id], { type: 'read', conversationId: convId, userId: user.id, readAt: new Date().toISOString(), selfOnly: true });
        }
        return;
      }

      if (type === 'send') {
        const convId = String(msg.conversationId || '');
        const content = typeof msg.content === 'string' ? msg.content : '';
        const clientMsgId = typeof msg.clientMsgId === 'string' ? msg.clientMsgId : undefined;
        const conv = store.conversations.find(c => c.id === convId);
        if (!conv || !store.canAccessConversation(user.id, conv)) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'forbidden' }); return; }
        if (conv.type === 'direct') {
          const otherId = conv.participantIds.find(id => id !== user.id);
          if (otherId) {
            const perm = store.canSendDirectMessageBetween(user.id, otherId);
            if (!perm.ok) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: perm.error || 'not_allowed' }); return; }
          }
        }
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : undefined;
        const trimmed = content.trim();
        if (!trimmed && !(attachments && attachments.length)) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'empty' }); return; }

        let translatedContent: string | undefined;
        let translatedTo: string | undefined;
        if (msg.autoTranslate && typeof msg.targetLanguage === 'string' && msg.targetLanguage && trimmed) {
          try {
            const dsRes = await aiGateway.generateContent(
              aiGateway.getChatModelId(),
              `Translate the following chat message to ${msg.targetLanguage}. Maintain conversational nuance, warmth, and friendly tone. Return ONLY the translated string without commentary:\n"${trimmed}"`
            );
            if (dsRes.success && dsRes.content?.trim()) {
              translatedContent = dsRes.content.trim();
              translatedTo = msg.targetLanguage;
            }
          } catch {}
        }

        try {
          let saved: any;
          let senderMarkedNotifs = 0;
          await store.mutate(async () => {
            saved = store.sendMessage(convId, trimmed, user, translatedContent, translatedTo, { attachments, replyToId: msg.replyToId, clientMsgId });
            senderMarkedNotifs = store.markConversationNotificationsRead(user.id, convId);
            const preview = (trimmed || formatAttachmentPreview(attachments)).slice(0, 80);
            for (const uid of (conv.participantIds || [])) {
              if (uid === user.id) continue;
              if (store.isBlockedEither(uid, user.id)) continue;
              if (isUserViewingConversation(uid, convId)) continue;
              const prefs = store.getNotificationPrefs(uid);
              const decision = decideNotification(prefs, 'message_new');
              const n = store.createNotification({ userId: uid, type: 'message_new', title: conv.name || user.displayName, body: `${user.displayName}: ${preview}`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: convId, data: { messageId: saved.id } });
              if (n && decision.pushRealtime) broadcastToUsers([uid], { type: 'notification', notification: n, unreadCount: store.getUnreadNotificationCount(uid), alert: { desktop: decision.alertDesktop, sound: decision.alertSound, dndActive: decision.dndActive, categoryEnabled: decision.categoryEnabled } });
            }
            store.persist();
          });
          if (senderMarkedNotifs > 0) {
            broadcastToUsers([user.id], { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(user.id), conversationId: convId });
          }
          broadcastToUsers([user.id], { type: 'send_ack', clientMsgId, ok: true, message: saved, fromDeviceId: deviceId });
          broadcastToUsers((conv.participantIds||[]).filter(id => id !== user.id), { type: 'message', conversationId: convId, message: saved, clientMsgId });
        } catch (e: any) {
          safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: e?.message || 'failed' });
        }
        return;
      }

      if (type === 'call_signal') {
        const callId = String(msg.callId || '');
        const toUserId = typeof msg.toUserId === 'string' && msg.toUserId ? msg.toUserId : undefined;
        const signal = msg.signal;
        const signalId = typeof msg.signalId === 'string' && msg.signalId ? msg.signalId : undefined;
        if (!callId || !signal || typeof signal !== 'object') return;
        const call = getCallById(store, callId);
        if (!call || !isActiveCallStatus(call.status)) return;
        if (!(call.participantIds || []).includes(user.id)) return;
        if (toUserId && !(call.participantIds || []).includes(toUserId)) return;
        const { entry, deduplicated } = pushCallSignal(callId, user.id, toUserId, signal, signalId);
        safeSend(ws, { type: 'call_signal_ack', callId, signalId, seq: entry.seq, ok: true });
        if (!deduplicated) {
          const recipients = toUserId
            ? [toUserId]
            : (call.participantIds || []).filter((id: string) => id !== user.id);
          broadcastToUsers(recipients, {
            type: 'call_signal',
            callId,
            fromUserId: user.id,
            toUserId: entry.toUserId,
            signal: entry.signal,
            signalId: entry.signalId,
            seq: entry.seq,
            at: entry.at,
          });
        }
        return;
      }

      if (type === 'call_resume') {
        const callId = String(msg.callId || '');
        const afterSeq = Math.max(0, Number(msg.afterSeq) || 0);
        const call = callId ? getCallById(store, callId) : getActiveCallForUser(store.calls || [], user.id);
        if (!call || !(call.participantIds || []).includes(user.id)) return;
        touchCallHeartbeat(call, user.id);
        const { signals, lastSeq } = listCallSignalsForUser(call.id, user.id, afterSeq);
        safeSend(ws, {
          type: 'call_sync',
          call,
          signals,
          lastSeq,
          serverTime: new Date().toISOString(),
        });
        if (isActiveCallStatus(call.status)) {
          const recipients = (call.participantIds || []).filter((id: string) => id !== user.id);
          broadcastToUsers(recipients, {
            type: 'call_peer_online',
            callId: call.id,
            userId: user.id,
            at: new Date().toISOString(),
          });
        }
        return;
      }

      if (type === 'call_heartbeat') {
        const callId = String(msg.callId || '');
        if (!callId) return;
        const call = getCallById(store, callId);
        if (!call || !isActiveCallStatus(call.status) || !(call.participantIds || []).includes(user.id)) return;
        touchCallHeartbeat(call, user.id);
        safeSend(ws, { type: 'call_heartbeat_ack', callId, t: Date.now() });
        return;
      }

      if (type === 'react') {
        const convId = String(msg.conversationId || '');
        const messageId = String(msg.messageId || '');
        const emoji = String(msg.emoji || '');
        if (!convId || !messageId || !emoji) return;
        try {
          let updated: any;
          await store.mutate(async () => {
            updated = store.toggleMessageReaction(user.id, convId, messageId, emoji);
          });
          const conv = store.conversations.find(c => c.id === convId);
          if (conv && updated) {
            broadcastToUsers(conv.participantIds || [], {
              type: 'message_reaction',
              conversationId: convId,
              messageId: updated.id,
              reactions: updated.reactions || {},
              userId: user.id,
              emoji,
            });
          }
        } catch {}
        return;
      }

      if (type === 'call_audio') {
        const callId = String(msg.callId || '');
        const pcm = typeof msg.pcm === 'string' ? msg.pcm : '';
        const sampleRate = Math.max(8000, Math.min(48000, Number(msg.sampleRate) || 16000));
        if (!callId || !pcm || pcm.length > 32768) return;
        const call = getCallById(store, callId);
        if (!call || !isActiveCallStatus(call.status)) return;
        if (!(call.participantIds || []).includes(user.id)) return;
        touchCallHeartbeat(call, user.id);
        const recipients = (call.participantIds || []).filter((id: string) => id !== user.id);
        broadcastToUsers(recipients, {
          type: 'call_audio',
          callId,
          fromUserId: user.id,
          pcm,
          sampleRate,
          seq: typeof msg.seq === 'number' ? msg.seq : undefined,
        });
        return;
      }
    });

    ws.on('close', () => {
      const set = clientsByUser.get(user.id);
      if (set) { set.delete(client); if (set.size === 0) clientsByUser.delete(user.id); }
      if (!clientsByUser.has(user.id)) {
        clearTypingForUser(user.id);
        notifyActiveCallOnDisconnect(user.id);
      }
      broadcastPresence(user.id);
      try { store.saveToDisk(); } catch {}
    });
    ws.on('error', () => {});
  });
}

export function wsBroadcastConversationEvent(conversationId: string, event: any) {
  const conv = store.conversations.find(c => c.id === conversationId);
  if (!conv) return;
  const baseIds: string[] = (conv.participantIds || []);
  for (const uid of baseIds) {
    try {
      const latest = store.conversations.find(c => c.id === conversationId);
      if (!latest || !store.canAccessConversation(uid, latest)) continue;
      let payload = event;
      if (event && event.conversation) {
        const maskedList = store.getConversationsForUser(uid);
        const masked = maskedList.find(c => c.id === conversationId) || event.conversation;
        payload = { ...event, conversation: masked };
      }
      broadcastToUsers([uid], payload);
    } catch {}
  }
}

export function wsBroadcastToUser(userId: string, event: any) {
  broadcastToUsers([userId], event);
}
