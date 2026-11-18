// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { store } from './store.ts';
import { decideNotification } from './notificationPolicy.ts';
import { getCallById } from './calls/index.ts';
import { isActiveCallStatus } from './calls/service.ts';
import { pushCallSignal } from './calls/signals.ts';

type Client = { ws: WebSocket; userId: string; deviceId: string; activeConversationId?: string | null };

const clientsByUser = new Map<string, Set<Client>>();
const typingTimers = new Map<string, NodeJS.Timeout>(); // key conv:user -> timeout

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
      safeSend(c.ws, data);
    }
  }
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
    const client: Client = { ws, userId: user.id, deviceId };
    if (!clientsByUser.has(user.id)) clientsByUser.set(user.id, new Set());
    clientsByUser.get(user.id)!.add(client);
    // update server-side last active on connect
    try { (user as any).lastActiveAt = new Date().toISOString(); } catch {}
    safeSend(ws, { type: 'hello', userId: user.id, deviceId, serverTime: new Date().toISOString() });
    broadcastPresence(user.id);
    try { store.saveToDisk(); } catch {}

    ws.on('message', async (raw: any) => {
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
        if (on) typingTimers.set(key, setTimeout(() => { typingTimers.delete(key); broadcastToUsers(conv.participantIds||[], { type: 'typing', conversationId: convId, userId: user.id, on: false }); }, 4000));
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
          // keep own devices in sync without exposing read receipt to others
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
        // block/privacy check for direct
        if (conv.type === 'direct') {
          const otherId = conv.participantIds.find(id => id !== user.id);
          if (otherId) {
            const perm = store.canSendDirectMessageBetween(user.id, otherId);
            if (!perm.ok) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: perm.error || 'not_allowed' }); return; }
          }
        }
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : undefined;
        if (!content.trim() && !(attachments && attachments.length)) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'empty' }); return; }
        try {
          let saved: any;
          let senderMarkedNotifs = 0;
          await store.mutate(async () => {
            saved = store.sendMessage(convId, content.trim(), user, undefined, undefined, { attachments, replyToId: msg.replyToId, clientMsgId });
            senderMarkedNotifs = store.markConversationNotificationsRead(user.id, convId);
            const preview = (content.trim() || (attachments?.length ? '[attachment]' : '')).slice(0, 80);
            for (const uid of (conv.participantIds || [])) {
              if (uid === user.id) continue;
              if (store.isBlockedEither(uid, user.id)) continue; // blocked: no notification from this actor
              if (isUserViewingConversation(uid, convId)) continue; // already open/chatting in this conversation
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
          // ack to sender device and sync to sender's other devices
          broadcastToUsers([user.id], { type: 'send_ack', clientMsgId, ok: true, message: saved, fromDeviceId: deviceId });
          broadcastToUsers((conv.participantIds||[]).filter(id => id !== user.id), { type: 'message', conversationId: convId, message: saved });
        } catch (e: any) {
          safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: e?.message || 'failed' });
        }
        return;
      }

      if (type === 'call_signal') {
        const callId = String(msg.callId || '');
        const toUserId = typeof msg.toUserId === 'string' && msg.toUserId ? msg.toUserId : undefined;
        const signal = msg.signal;
        if (!callId || !signal || typeof signal !== 'object') return;
        const call = getCallById(store, callId);
        if (!call || !isActiveCallStatus(call.status)) return;
        if (!(call.participantIds || []).includes(user.id)) return;
        if (toUserId && !(call.participantIds || []).includes(toUserId)) return;
        const entry = pushCallSignal(callId, user.id, toUserId, signal);
        const recipients = toUserId
          ? [toUserId]
          : (call.participantIds || []).filter((id: string) => id !== user.id);
        broadcastToUsers(recipients, {
          type: 'call_signal',
          callId,
          fromUserId: user.id,
          toUserId: entry.toUserId,
          signal: entry.signal,
          seq: entry.seq,
          at: entry.at,
        });
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
        if (!callId || !pcm || pcm.length > 16384) return;
        const call = getCallById(store, callId);
        if (!call || !isActiveCallStatus(call.status)) return;
        if (!(call.participantIds || []).includes(user.id)) return;
        const recipients = (call.participantIds || []).filter((id: string) => id !== user.id);
        broadcastToUsers(recipients, {
          type: 'call_audio',
          callId,
          fromUserId: user.id,
          pcm,
          sampleRate,
        });
        return;
      }
    });

    ws.on('close', () => {
      const set = clientsByUser.get(user.id);
      if (set) { set.delete(client); if (set.size === 0) clientsByUser.delete(user.id); }
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
  // Re-check membership at delivery time (permissions may change while sockets stay open)
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
