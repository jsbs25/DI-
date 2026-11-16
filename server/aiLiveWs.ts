// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // ignore closed socket send errors
  }
}

export function attachAiLiveWs(wss: WebSocketServer) {
  wss.on('connection', (clientWs: WebSocket) => {
    // All EARTH ONE AI voice & text capabilities are routed strictly through DeepSeek.
    safeSend(clientWs, {
      type: 'fallback',
      reason: 'deepseek_only',
      engine: 'deepseek',
      message: 'EARTH ONE voice companion routed strictly to DeepSeek.',
    });

    clientWs.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') {
          safeSend(clientWs, { type: 'pong', engine: 'deepseek' });
        }
      } catch {
        // ignore malformed frame
      }
    });
  });
}
