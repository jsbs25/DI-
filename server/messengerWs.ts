// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { store } from './store.ts';
import { decideNotification } from './notificationPolicy.ts';

type Client = { ws: WebSocket; userId: string; deviceId: string };

const clientsByUser = new Map<string, Set<Client>>();
const typingTimers = new Map<string, NodeJS.Timeout>(); // key conv:user -> timeout

function safeSend(ws: WebSocket, data: any) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }
}

function broadcastToUsers(userIds: string[], data: any, exceptDevice?: string) {
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
  // notify friends and conversation participants
  const friendIds = store.getFriendIds(userId);
  const convIds = store.getConversationsForUser(userId).filter(c => c.type === 'direct' || c.type === 'group').flatMap(c => c.participantIds || []);
  broadcastToUsers([...friendIds, ...convIds, userId], { type: 'presence', userId, online, deviceCount: set?.size || 0, lastActiveAt: (user as any)?.lastActiveAt });
}

export function getTokenFromReq(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const t = url.searchParams.get('token');
    if (t) return t;
  } catch {}
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
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
    safeSend(ws, { type: 'hello', userId: user.id, deviceId, serverTime: new Date().toISOString() });
    broadcastPresence(user.id);

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

      if (type === 'read') {
        const convId = String(msg.conversationId || '');
        const conv = store.conversations.find(c => c.id === convId);
        if (!conv || !store.canAccessConversation(user.id, conv)) return;
        await store.mutate(async () => { store.markConversationRead(convId, user.id); });
        broadcastToUsers(conv.participantIds||[], { type: 'read', conversationId: convId, userId: user.id, readAt: new Date().toISOString() });
        return;
      }

      if (type === 'send') {
        const convId = String(msg.conversationId || '');
        const content = typeof msg.content === 'string' ? msg.content : '';
        const clientMsgId = typeof msg.clientMsgId === 'string' ? msg.clientMsgId : undefined;
        const conv = store.conversations.find(c => c.id === convId);
        if (!conv || !store.canAccessConversation(user.id, conv)) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'forbidden' }); return; }
        // block check for direct
        if (conv.type === 'direct') {
          const otherId = conv.participantIds.find(id => id !== user.id);
          if (otherId && ((store.blockedBy[user.id]||[]).includes(otherId) || (store.blockedBy[otherId]||[]).includes(user.id))) {
            safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'blocked' }); return;
          }
        }
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : undefined;
        if (!content.trim() && !(attachments && attachments.length)) { safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: 'empty' }); return; }
        try {
          let saved: any;
          await store.mutate(async () => {
            saved = store.sendMessage(convId, content.trim(), user, undefined, undefined, { attachments, replyToId: msg.replyToId, clientMsgId });
            const preview = (content.trim() || (attachments?.length ? '[attachment]' : '')).slice(0, 80);
            for (const uid of (conv.participantIds || [])) {
              if (uid === user.id) continue;
              const prefs = store.getNotificationPrefs(uid);
              const decision = decideNotification(prefs, 'message_new');
              const n = store.createNotification({ userId: uid, type: 'message_new', title: conv.name || user.displayName, body: `${user.displayName}: ${preview}`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: convId, data: { messageId: saved.id } });
              if (n && decision.pushRealtime) broadcastToUsers([uid], { type: 'notification', notification: n, unreadCount: store.getUnreadNotificationCount(uid), alert: { desktop: decision.alertDesktop, sound: decision.alertSound, dndActive: decision.dndActive, categoryEnabled: decision.categoryEnabled } });
            }
            store.persist();
          });
          // ack to sender device and sync to sender's other devices
          broadcastToUsers([user.id], { type: 'send_ack', clientMsgId, ok: true, message: saved, fromDeviceId: deviceId });
          broadcastToUsers((conv.participantIds||[]).filter(id => id !== user.id), { type: 'message', conversationId: convId, message: saved });
        } catch (e: any) {
          safeSend(ws, { type: 'send_ack', clientMsgId, ok: false, error: e?.message || 'failed' });
        }
        return;
      }
    });

    ws.on('close', () => {
      const set = clientsByUser.get(user.id);
      if (set) { set.delete(client); if (set.size === 0) clientsByUser.delete(user.id); }
      broadcastPresence(user.id);
    });
    ws.on('error', () => {});
  });
}

export function wsBroadcastConversationEvent(conversationId: string, event: any) {
  const conv = store.conversations.find(c => c.id === conversationId);
  if (!conv) return;
  broadcastToUsers(conv.participantIds || [], event);
}

export function wsBroadcastToUser(userId: string, event: any) {
  broadcastToUsers([userId], event);
}
