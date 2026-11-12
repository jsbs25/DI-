/**
 * Messenger Durable Object scaffold (NOT wired/migrated).
 *
 * Purpose: provide a Cloudflare-native home for state that is currently in-memory
 * in server/messengerWs.ts (clientsByUser, typing timers, presence fanout) while
 * preserving the existing protocol semantics and server-side authorization rules.
 *
 * Migration notes:
 * - Auth: validate Bearer token/session against D1/KV adapter (same as Express).
 * - State: conversation membership, blocks/privacy, read receipts enforced server-side.
 * - Ordering/idempotency: introduce per-conversation seq + clientMsgId uniqueness in D1.
 * - Delivery: persist message in D1, then fanout to connected sockets in DO; ack sender.
 * - Offline/sync: REST /api/messenger/sync remains source for catch-up (cursor/seq based).
 * - Multi-device: multiple sockets per userId supported.
 * - Do not fabricate delivery/read/presence; only emit from confirmed state transitions.
 */

export interface MessengerEnv {
  DB?: D1Database;
}

type ClientInfo = { userId: string; deviceId: string };

export class MessengerRoom implements DurableObject {
  private clients = new Map<WebSocket, ClientInfo>();
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly state: DurableObjectState, private readonly env: MessengerEnv) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws' || request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      // Real implementation must authenticate token and load user/device before accept.
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'error', error: 'MESSENGER_DO_NOT_MIGRATED', message: 'Durable Object scaffold only.' }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({ success: false, error: 'NOT_IMPLEMENTED' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // TODO: parse protocol {ping,typing,read,send} and enforce same rules as messengerWs.ts
    void ws; void message;
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.clients.delete(ws);
    // TODO: presence update/broadcast
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.clients.delete(ws);
  }
}

export class UserPresence implements DurableObject {
  constructor(private readonly state: DurableObjectState, private readonly env: MessengerEnv) { void state; void env; }
  async fetch(): Promise<Response> {
    return new Response(JSON.stringify({ success: false, error: 'NOT_IMPLEMENTED' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
