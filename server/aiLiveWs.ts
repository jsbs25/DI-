import type http from 'node:http';
// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import { executeAiTurn } from './aiTurnOrchestrator.ts';
import { listMemories, normalizeProfileKey } from './aiMemory.ts';
import { store } from './store.ts';
import { aiGateway } from './aiGateway.ts';
import { extractInlineAgentDirective, parseInstantAgentAction } from '../src/utils/oneAgentController.ts';
import { analyzeTurnContext } from './aiIntent.ts';

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // ignore closed socket send errors
  }
}

function getSessionUserIdFromReq(req?: http.IncomingMessage): string | undefined {
  if (!req) return undefined;
  const cookieHeader = String(req.headers.cookie || '');
  const match = cookieHeader.match(/(?:^|;\s*)earth_one_session=([^;]+)/);
  if (match) {
    try {
      const token = decodeURIComponent(match[1]);
      const user = store.getUserByToken(token);
      if (user) return user.id;
    } catch {}
  }
  return store.currentUser?.id;
}

export function attachAiLiveWs(wss: WebSocketServer) {
  wss.on('connection', (clientWs: WebSocket, req?: http.IncomingMessage) => {
    const reqUrl = req?.url || '/ws/ai-live';
    let initialProfileKey = 'default';
    try {
      const parsed = new URL(reqUrl, 'http://localhost');
      initialProfileKey = parsed.searchParams.get('profileKey') || 'default';
    } catch {}

    const userId = getSessionUserIdFromReq(req);
    let sessionProfileKey = normalizeProfileKey(initialProfileKey, userId);

    let activeTurnId: string | null = null;
    let activeController: AbortController | null = null;

    const abortActiveTurn = (reason: 'barge_in' | 'superseded' | 'disconnect' = 'barge_in') => {
      if (activeController) {
        try {
          activeController.abort();
        } catch {}
        activeController = null;
      }
      if (activeTurnId && reason !== 'disconnect') {
        safeSend(clientWs, { type: 'turn:cancelled', turnId: activeTurnId, reason });
      }
      activeTurnId = null;
    };

    const memories = listMemories(store, sessionProfileKey, false);
    const geminiKey = Boolean((process.env.GEMINI_API_KEY || '').trim());
    safeSend(clientWs, {
      type: 'session:ready',
      engine: geminiKey ? 'gemini-live-bridge' : 'deepseek',
      liveModel: geminiKey ? 'gemini-3.8-live' : undefined,
      liveConfig: geminiKey ? { startSensitivity: 'START_SENSITIVITY_HIGH', activityHandling: 'START_OF_ACTIVITY_INTERRUPTS' } : undefined,
      hasLiveEngine: aiGateway.hasLiveEngine() || geminiKey,
      profileKey: sessionProfileKey,
      memoryCount: memories.length,
    });

    clientWs.on('message', (raw: Buffer | string) => {
      let msg: any = null;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ping') {
        safeSend(clientWs, {
          type: 'pong',
          engine: 'deepseek',
          hasLiveEngine: aiGateway.hasLiveEngine(),
          ts: Date.now(),
        });
        return;
      }

      if (msg.type === 'session:init') {
        if (typeof msg.profileKey === 'string') {
          sessionProfileKey = normalizeProfileKey(msg.profileKey, userId);
        }
        const activeMem = listMemories(store, sessionProfileKey, false);
        safeSend(clientWs, {
          type: 'session:ready',
          engine: 'deepseek',
          hasLiveEngine: aiGateway.hasLiveEngine(),
          profileKey: sessionProfileKey,
          memoryCount: activeMem.length,
        });
        return;
      }

      if (msg.type === 'turn:cancel') {
        abortActiveTurn('barge_in');
        return;
      }

      if (msg.type === 'turn:input') {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        const turnId =
          typeof msg.turnId === 'string' && msg.turnId.trim()
            ? msg.turnId.trim()
            : `ws_turn_${Date.now()}`;
        const history = Array.isArray(msg.history) ? msg.history : [];
        const mode = typeof msg.mode === 'string' ? msg.mode : 'voice-agent';
        const modelId = typeof msg.modelId === 'string' ? msg.modelId : undefined;
        const maxTokens = typeof msg.maxTokens === 'number' ? msg.maxTokens : undefined;
        const pageContext = typeof msg.pageContext === 'string' ? msg.pageContext : undefined;
        if (typeof msg.profileKey === 'string') {
          sessionProfileKey = normalizeProfileKey(msg.profileKey, userId);
        }

        if (!text) {
          safeSend(clientWs, { type: 'turn:error', turnId, error: 'Empty input' });
          return;
        }

        abortActiveTurn('superseded');
        const controller = new AbortController();
        activeTurnId = turnId;
        activeController = controller;

        void (async () => {
          try {
            const isZh = /[\u4e00-\u9fff]/.test(text) || !/[a-zA-Z]{3,}/.test(text);
            const preAnalysis = analyzeTurnContext(text, history, []);
            const instantAction =
              !preAnalysis.isHypotheticalOrDiscussion
                ? parseInstantAgentAction(text, isZh, history)
                : null;

            if (instantAction && instantAction.type !== 'none') {
              safeSend(clientWs, { type: 'turn:action', turnId, action: instantAction });
              safeSend(clientWs, {
                type: 'turn:done',
                turnId,
                reply: instantAction.reply,
                model: 'one-instant-agent',
                intent: 'task_command',
                savedMemories: [],
              });
              if (activeTurnId === turnId) {
                activeTurnId = null;
                activeController = null;
              }
              return;
            }

            const result = await executeAiTurn({
              prompt: text,
              history,
              modelId,
              mode,
              profileKey: sessionProfileKey,
              userId,
              maxTokens,
              pageContext,
              signal: controller.signal,
              onDelta: (delta) => {
                if (controller.signal.aborted || activeTurnId !== turnId) return;
                safeSend(clientWs, { type: 'turn:delta', turnId, delta });
              },
            });

            if (controller.signal.aborted || activeTurnId !== turnId) return;

            const parsedDirective = extractInlineAgentDirective(result.reply);
            const directiveEmotion = (parsedDirective as any).emotion || (result as any).emotion || null;
            if (parsedDirective.action && parsedDirective.action.type !== 'none') {
              safeSend(clientWs, { type: 'turn:action', turnId, action: parsedDirective.action, emotion: directiveEmotion });
            }
            if (directiveEmotion) {
              safeSend(clientWs, { type: 'turn:emotion', turnId, emotion: directiveEmotion });
            }
            if (result.savedMemories.length > 0) {
              safeSend(clientWs, {
                type: 'turn:memory',
                turnId,
                saved: result.savedMemories,
              });
            }

            safeSend(clientWs, {
              type: 'turn:done',
              turnId,
              reply: parsedDirective.spokenText || result.reply,
              rawReply: result.reply,
              model: result.model,
              tokens: result.tokens,
              intent: result.intent,
              emotion: directiveEmotion,
              savedMemories: result.savedMemories,
              memoryWindow: result.memoryWindow,
            });
          } catch (err: any) {
            if (err?.name === 'AbortError' || controller.signal.aborted) {
              return;
            }
            safeSend(clientWs, {
              type: 'turn:error',
              turnId,
              error: err instanceof Error ? err.message : 'Turn processing error',
            });
          } finally {
            if (activeTurnId === turnId) {
              activeTurnId = null;
              activeController = null;
            }
          }
        })();
      }
    });

    clientWs.on('close', () => {
      abortActiveTurn('disconnect');
    });
  });
}
