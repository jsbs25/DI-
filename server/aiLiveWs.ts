/**
 * EARTH ONE — Unified Real-Time AI Live WebSocket Engine (/ws/ai-live)
 * Bridges BOTH:
 *  1) Persistent SQLite Multi-Turn Dialogue & DeepSeek/Ollama Streaming Protocol (`user_turn`, `interrupt`, `ping`)
 *  2) Optional Gemini Live Full-Duplex PCM Audio + Tool Calling Protocol (`init`, `audio`, `text`, `context`, `tool_response`)
 * backed by a single unified SQLite long-term memory & session store.
 */
import {
  ActivityHandling,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import type http from 'node:http';
// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import { aiGateway } from './aiGateway.ts';
import { normalizeConversationHistory } from './aiConversation.ts';
import { aiMemoryStore } from './ai/memoryStore.ts';
import {
  generateContextAwareFallbackReply,
  persistTurnAndExtractMemories,
  prepareDialogueContext,
  stripAiControlTags,
} from './ai/contextOrchestrator.ts';
import { extractMemoryCandidates } from './ai/intentAnalyzer.ts';
import { getGeminiLiveClient } from './geminiClient.ts';
import {
  AI_COMPANION_TOOLS,
  buildCompanionSystemInstruction,
  formatPageContextForModel,
  type LivePageContextSummary,
} from './aiLiveTools.ts';
import { answerWithLiveKnowledge } from './liveKnowledge.ts';
import { solvePrecisionQuery } from '../src/utils/precisionSolver.ts';
import { matchPureSocialBanter } from '../src/utils/oneAgentController.ts';

export interface AiLiveUserIdentity {
  id: string;
  name?: string;
}

interface WsIncomingMessage {
  type:
    | 'user_turn'
    | 'init'
    | 'audio'
    | 'text'
    | 'context'
    | 'tool_response'
    | 'interrupt'
    | 'ping';
  turnId?: string;
  sessionId?: string;
  prompt?: string;
  mode?: string;
  channel?: 'hub' | 'voice' | 'api';
  modelId?: string;
  history?: unknown;
  maxTokens?: number;
  lang?: string;
  voiceName?: string;
  profileKey?: string;
  pageContext?: LivePageContextSummary | string;
  data?: string;
  text?: string;
  responses?: Array<{ id?: string; name?: string; response: Record<string, unknown> }>;
}

const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // ignore closed socket send errors
  }
}

export function attachAiLiveWs(
  wss: WebSocketServer,
  resolveUser?: (req: http.IncomingMessage) => AiLiveUserIdentity | undefined
) {
  wss.on('connection', (clientWs: WebSocket, req?: http.IncomingMessage) => {
    const authUser = req && resolveUser ? resolveUser(req) : undefined;
    let urlProfileKey = '';
    try {
      const reqUrl = new URL(req?.url || '/ws/ai-live', 'http://localhost');
      urlProfileKey = (reqUrl.searchParams.get('profileKey') || '').trim().slice(0, 64);
    } catch {}

    const resolveMemoryUserId = () =>
      authUser?.id || urlProfileKey || 'guest';

    // Shared stateful orchestrator state
    let activeTurnController: AbortController | null = null;
    let activeTurnId: string | null = null;
    let currentSessionId: string | undefined;

    // Gemini Live Audio state (used only when client sends `init` + GEMINI_API_KEY exists)
    let geminiSession: Session | null = null;
    let isClosing = false;
    let latestLang = 'zh';
    let latestVoice = 'Zephyr';
    let latestContext: LivePageContextSummary | string | null = null;
    let connectingPromise: Promise<Session | null> | null = null;
    const pendingToolTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let bufferedUserSpeech = '';
    let currentAssistantSpeech = '';

    safeSend(clientWs, {
      type: 'ready',
      engine: getGeminiLiveClient() ? 'hybrid-live' : 'deepseek',
      streaming: true,
      userId: resolveMemoryUserId(),
    });

    const cancelActiveTurn = (reason = 'interrupted') => {
      if (activeTurnController) {
        try {
          activeTurnController.abort();
        } catch {}
        activeTurnController = null;
      }
      if (activeTurnId) {
        safeSend(clientWs, {
          type: 'interrupted',
          turnId: activeTurnId,
          reason,
        });
        activeTurnId = null;
      }
    };

    const closeGeminiSession = () => {
      for (const timer of pendingToolTimers.values()) clearTimeout(timer);
      pendingToolTimers.clear();
      if (geminiSession) {
        try {
          geminiSession.close();
        } catch {}
        geminiSession = null;
      }
    };

    const flushAudioUserTurnMemory = (userText?: string, assistantText?: string) => {
      const uText = (userText ?? bufferedUserSpeech).trim();
      const aText = (assistantText ?? currentAssistantSpeech).trim();
      bufferedUserSpeech = '';
      if (!uText && !aText) return;
      const uid = resolveMemoryUserId();
      try {
        const sess = aiMemoryStore.getOrCreateSession(uid, currentSessionId, 'voice');
        currentSessionId = sess.id;
        if (uText) {
          const candidates = extractMemoryCandidates(uText, sess);
          const saved: Array<{ action: string; summary: string }> = [];
          for (const c of candidates) {
            const res = aiMemoryStore.upsertMemory(c);
            if (res.memory && res.action !== 'rejected') {
              saved.push({ action: res.action, summary: res.memory.summary });
            }
          }
          if (saved.length > 0) {
            safeSend(clientWs, { type: 'memory_saved', count: saved.length, items: saved });
          }
        }
        if (uText || aText) {
          if (uText) {
            aiMemoryStore.appendMessage({
              sessionId: sess.id,
              userId: uid,
              role: 'user',
              content: uText,
              intent: 'voice_live',
            });
          }
          if (aText) {
            aiMemoryStore.appendMessage({
              sessionId: sess.id,
              userId: uid,
              role: 'assistant',
              content: aText,
              intent: 'voice_live',
              model: 'gemini-3.8-live',
            });
          }
        }
      } catch {
        // non-fatal SQLite persistence guard
      }
    };

    const executeOrchestratedTurn = async (params: {
      prompt: string;
      turnId: string;
      sessionId?: string;
      mode: string;
      channel: 'hub' | 'voice' | 'api';
      modelId: string;
      history?: unknown;
      maxTokens?: number;
      pageContext?: LivePageContextSummary | string | null;
      emitLiveTranscript?: boolean;
    }) => {
      cancelActiveTurn('superseded_by_new_turn');

      const controller = new AbortController();
      activeTurnController = controller;
      activeTurnId = params.turnId;

      const userId = resolveMemoryUserId();
      const pageContextText = params.pageContext
        ? formatPageContextForModel(params.pageContext)
        : undefined;

      const ctx = prepareDialogueContext({
        userId,
        userDisplayName: authUser?.name,
        sessionId: params.sessionId || currentSessionId,
        channel: params.channel,
        prompt: params.prompt,
        mode: params.mode,
        clientHistory: normalizeConversationHistory(params.history),
        requestedMaxTokens: params.maxTokens,
        pageContext: pageContextText,
      });
      currentSessionId = ctx.session.id;

      safeSend(clientWs, {
        type: 'turn_start',
        turnId: params.turnId,
        sessionId: ctx.session.id,
        intent: ctx.intent.kind,
        recalledCount: ctx.recalledMemories.length,
      });

      const finishTurn = (rawReplyText: string, modelLabel: string) => {
        if (controller.signal.aborted || activeTurnId !== params.turnId) return;
        const clean = stripAiControlTags(rawReplyText).reply || rawReplyText.trim();
        const savedMemories = persistTurnAndExtractMemories({
          ctx,
          rawUserInput: params.prompt,
          assistantReply: clean,
          modelLabel,
        });
        activeTurnController = null;
        activeTurnId = null;

        safeSend(clientWs, {
          type: 'done',
          turnId: params.turnId,
          sessionId: ctx.session.id,
          reply: clean,
          model: modelLabel,
          tokens: Math.ceil(clean.length / 2),
          intent: ctx.intent.kind,
          recalledMemories: ctx.recalledMemories.map((m) => ({
            id: m.id,
            category: m.category,
            summary: m.summary,
          })),
          savedMemories,
        });
        if (params.emitLiveTranscript) {
          safeSend(clientWs, { type: 'turn_complete' });
        }
      };

      const emitChunk = (chunk: string) => {
        if (controller.signal.aborted || activeTurnId !== params.turnId) return;
        safeSend(clientWs, { type: 'delta', turnId: params.turnId, delta: chunk });
        if (params.emitLiveTranscript) {
          safeSend(clientWs, { type: 'output_transcript', text: chunk });
        }
      };

      try {
        // 1. Instant deterministic precision solver (<1ms)
        if ((params.mode === 'general' || params.mode === 'voice-agent') && !params.prompt.includes('\n')) {
          const exact = solvePrecisionQuery(ctx.intent.normalizedInput, ctx.intent.isZh);
          if (exact) {
            const clean = stripAiControlTags(exact.answer).reply || exact.answer;
            emitChunk(clean);
            finishTurn(clean, 'one-precision-solver');
            return;
          }
          if (
            params.mode === 'voice-agent' &&
            ctx.intent.kind === 'casual_greeting' &&
            !ctx.session.activeTopic &&
            ctx.mergedHistory.length <= 2
          ) {
            const banter = matchPureSocialBanter(ctx.intent.normalizedInput, ctx.intent.isZh);
            if (banter) {
              const clean = stripAiControlTags(banter).reply || banter;
              emitChunk(clean);
              finishTurn(clean, 'one-instant-companion');
              return;
            }
          }
        }

        // 2. Explicit memory recall / save / forget
        if (ctx.intent.kind === 'memory_management') {
          const memRes = await generateContextAwareFallbackReply(ctx, params.mode);
          emitChunk(memRes.text);
          finishTurn(memRes.text, `one-${memRes.source}`);
          return;
        }

        // 3. Live DeepSeek / Ollama streaming turn
        if (aiGateway.hasLiveEngine()) {
          let streamedReply = '';
          const res = await aiGateway.generateContent(
            params.modelId,
            params.prompt,
            ctx.systemPrompt,
            (token) => {
              if (controller.signal.aborted || activeTurnId !== params.turnId) return;
              const cleanToken = stripAiControlTags(token).reply;
              streamedReply += token;
              if (cleanToken) {
                emitChunk(cleanToken);
              }
            },
            ctx.mergedHistory,
            ctx.resolvedMaxTokens,
            controller.signal
          );
          if (controller.signal.aborted || activeTurnId !== params.turnId) return;
          if (res.success && (streamedReply || res.content)) {
            const finalText = stripAiControlTags(res.content || streamedReply).reply;
            if (!streamedReply && finalText) {
              emitChunk(finalText);
            }
            finishTurn(finalText, params.modelId);
            return;
          }
        }

        // 4. Context-aware non-robotic multi-turn fallback
        const fallback = await generateContextAwareFallbackReply(ctx, params.mode);
        if (controller.signal.aborted || activeTurnId !== params.turnId) return;
        const cleanFb = stripAiControlTags(fallback.text).reply || fallback.text;
        emitChunk(cleanFb);
        finishTurn(cleanFb, `one-${fallback.source}`);
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        try {
          const fallback = await generateContextAwareFallbackReply(ctx, params.mode);
          if (controller.signal.aborted || activeTurnId !== params.turnId) return;
          const cleanFb = stripAiControlTags(fallback.text).reply || fallback.text;
          emitChunk(cleanFb);
          finishTurn(cleanFb, `one-${fallback.source}`);
        } catch {
          safeSend(clientWs, {
            type: 'error',
            turnId: params.turnId,
            error: err instanceof Error ? err.message : 'Live WS turn failed',
          });
        }
      }
    };

    const connectGeminiLive = async (
      lang: string,
      voiceName: string,
      pageContext: LivePageContextSummary | string | null
    ): Promise<Session | null> => {
      if (geminiSession) return geminiSession;
      if (connectingPromise) return connectingPromise;

      const ai = getGeminiLiveClient();
      if (!ai) {
        safeSend(clientWs, {
          type: 'live_unavailable',
          reason: 'missing_gemini_key',
          fallbackAvailable: true,
          message: 'GEMINI_API_KEY is not configured; using companion API + SQLite orchestrator.',
        });
        return null;
      }

      const resolvedVoice = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Zephyr';
      const uid = resolveMemoryUserId();
      const recalledMemories = aiMemoryStore.recallMemories(uid, '', {
        limit: 8,
        includeCorePreferences: true,
        bumpRecallStats: false,
      });

      connectingPromise = (async () => {
        try {
          const liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: resolvedVoice },
                },
              },
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                },
                activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: AI_COMPANION_TOOLS }],
              systemInstruction: buildCompanionSystemInstruction(
                lang,
                pageContext,
                recalledMemories
              ),
            },
            callbacks: {
              onopen: () => {
                if (!isClosing) {
                  safeSend(clientWs, {
                    type: 'ready',
                    engine: 'gemini-3.8-live',
                    voiceName: resolvedVoice,
                    recalledMemoriesCount: recalledMemories.length,
                  });
                }
              },
              onmessage: async (message: LiveServerMessage) => {
                if (isClosing) return;
                const sc = message.serverContent;

                if (sc?.interrupted) {
                  currentAssistantSpeech = '';
                  safeSend(clientWs, { type: 'interrupted' });
                }

                if (sc?.inputTranscription?.text) {
                  bufferedUserSpeech += sc.inputTranscription.text;
                  safeSend(clientWs, {
                    type: 'input_transcript',
                    text: sc.inputTranscription.text,
                  });
                }

                if (sc?.outputTranscription?.text) {
                  if (bufferedUserSpeech.trim()) {
                    flushAudioUserTurnMemory(bufferedUserSpeech, undefined);
                  }
                  const cleanChunk = stripAiControlTags(sc.outputTranscription.text).reply;
                  currentAssistantSpeech += cleanChunk || sc.outputTranscription.text;
                  if (cleanChunk) {
                    safeSend(clientWs, {
                      type: 'output_transcript',
                      text: cleanChunk,
                    });
                  }
                }

                for (const part of sc?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                if (message.toolCall?.functionCalls?.length) {
                  const calls = message.toolCall.functionCalls;
                  const immediateResponses: Array<{
                    id?: string;
                    name?: string;
                    response: Record<string, unknown>;
                  }> = [];
                  const clientCalls: Array<{
                    id?: string;
                    name: string;
                    args: Record<string, unknown>;
                  }> = [];

                  for (const call of calls) {
                    const name = call.name || '';
                    const args = (call.args || {}) as Record<string, unknown>;

                    if (name === 'set_companion_emotion') {
                      safeSend(clientWs, {
                        type: 'emotion',
                        emotion: typeof args.emotion === 'string' ? args.emotion : 'calm',
                        intensity: typeof args.intensity === 'number' ? args.intensity : 0.75,
                        reason: typeof args.reason === 'string' ? args.reason : '',
                      });
                      immediateResponses.push({
                        id: call.id,
                        name,
                        response: { ok: true, applied: true },
                      });
                    } else if (name === 'recall_or_save_memory') {
                      const act = String(args.action || 'recall');
                      const queryOrContent = String(args.queryOrContent || '').trim();
                      if (act === 'save' && queryOrContent) {
                        const kindRaw = String(args.kind || 'fact');
                        const category =
                          kindRaw === 'identity'
                            ? 'fact'
                            : kindRaw === 'preference'
                              ? 'preference'
                              : kindRaw === 'project'
                                ? 'project'
                                : 'fact';
                        const res = aiMemoryStore.upsertMemory({
                          userId: uid,
                          category,
                          canonicalKey: `${category}:voice_${Date.now().toString(36)}`,
                          summary: queryOrContent,
                          keywords: queryOrContent,
                          confidence: 0.96,
                          importance: 9,
                          sourceSessionId: currentSessionId || '',
                          sourceQuote: queryOrContent,
                          replacesConflictingKey: true,
                        });
                        if (res.memory) {
                          safeSend(clientWs, {
                            type: 'memory_saved',
                            count: 1,
                            items: [{ action: res.action, summary: res.memory.summary }],
                          });
                        }
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: { ok: true, saved: true, content: res.memory?.summary || queryOrContent },
                        });
                      } else {
                        const memories = aiMemoryStore.recallMemories(uid, queryOrContent, {
                          limit: 8,
                          includeCorePreferences: true,
                        });
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: {
                            ok: true,
                            memories: memories.map((m) => ({ category: m.category, summary: m.summary })),
                          },
                        });
                      }
                    } else if (name === 'lookup_live_knowledge') {
                      const q = String(args.query || '').trim();
                      const exact = q ? solvePrecisionQuery(q, lang === 'zh') : null;
                      if (exact) {
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: { ok: true, source: 'precision', answer: exact.answer },
                        });
                      } else if (q) {
                        try {
                          const live = await answerWithLiveKnowledge(q, 'voice-agent');
                          immediateResponses.push({
                            id: call.id,
                            name,
                            response: { ok: true, source: live.source, answer: live.text },
                          });
                        } catch {
                          immediateResponses.push({
                            id: call.id,
                            name,
                            response: { ok: false, answer: '' },
                          });
                        }
                      } else {
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: { ok: false, error: 'Empty query' },
                        });
                      }
                    } else if (name) {
                      clientCalls.push({ id: call.id, name, args });
                    }
                  }

                  if (immediateResponses.length > 0) {
                    try {
                      liveSession.sendToolResponse({ functionResponses: immediateResponses });
                    } catch {}
                  }

                  if (clientCalls.length > 0) {
                    safeSend(clientWs, { type: 'tool_call', calls: clientCalls });
                    for (const c of clientCalls) {
                      const key = c.id || `${c.name}_${Date.now()}`;
                      const timer = setTimeout(() => {
                        pendingToolTimers.delete(key);
                        try {
                          liveSession.sendToolResponse({
                            functionResponses: [
                              { id: c.id, name: c.name, response: { ok: true, status: 'dispatched' } },
                            ],
                          });
                        } catch {}
                      }, 5500);
                      pendingToolTimers.set(key, timer);
                    }
                  }
                }

                if (sc?.turnComplete) {
                  flushAudioUserTurnMemory(undefined, currentAssistantSpeech);
                  currentAssistantSpeech = '';
                  safeSend(clientWs, { type: 'turn_complete' });
                }
              },
              onerror: (err: any) => {
                if (!isClosing) {
                  safeSend(clientWs, {
                    type: 'live_error',
                    message: err?.message || 'Gemini Live connection error',
                  });
                }
              },
              onclose: () => {
                geminiSession = null;
                if (!isClosing) {
                  safeSend(clientWs, { type: 'closed' });
                }
              },
            },
          });

          geminiSession = liveSession;
          return liveSession;
        } catch (err: any) {
          safeSend(clientWs, {
            type: 'live_unavailable',
            reason: 'connect_failed',
            fallbackAvailable: true,
            message: err?.message || 'Failed to connect Gemini Live session.',
          });
          return null;
        } finally {
          connectingPromise = null;
        }
      })();

      return connectingPromise;
    };

    clientWs.on('close', () => {
      isClosing = true;
      cancelActiveTurn('socket_closed');
      flushAudioUserTurnMemory();
      closeGeminiSession();
    });

    clientWs.on('error', () => {
      isClosing = true;
      cancelActiveTurn('socket_error');
      closeGeminiSession();
    });

    clientWs.on('message', async (raw: Buffer | string) => {
      let msg: WsIncomingMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsIncomingMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'ping') {
        safeSend(clientWs, {
          type: 'pong',
          engine: geminiSession ? 'gemini-3.8-live' : 'deepseek',
          ts: Date.now(),
        });
        return;
      }

      if (msg.type === 'interrupt') {
        currentAssistantSpeech = '';
        cancelActiveTurn('client_barge_in');
        safeSend(clientWs, { type: 'interrupted', reason: 'client_barge_in' });
        return;
      }

      if (msg.type === 'user_turn') {
        const prompt = typeof msg.prompt === 'string' ? msg.prompt.trim() : '';
        if (!prompt) {
          safeSend(clientWs, {
            type: 'error',
            turnId: msg.turnId || null,
            error: 'Prompt is required.',
          });
          return;
        }
        if (msg.profileKey && !authUser?.id) {
          urlProfileKey = msg.profileKey.trim().slice(0, 64);
        }
        if (msg.pageContext) latestContext = msg.pageContext;
        await executeOrchestratedTurn({
          prompt,
          turnId: typeof msg.turnId === 'string' && msg.turnId ? msg.turnId : `turn_${Date.now()}`,
          sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : undefined,
          mode: typeof msg.mode === 'string' && msg.mode.trim() ? msg.mode.trim() : 'voice-agent',
          channel: msg.channel === 'hub' || msg.channel === 'api' ? msg.channel : 'voice',
          modelId:
            typeof msg.modelId === 'string' && msg.modelId.trim()
              ? msg.modelId.trim()
              : aiGateway.getChatModelId(),
          history: msg.history,
          maxTokens:
            typeof msg.maxTokens === 'number' && msg.maxTokens > 0
              ? Math.min(4096, Math.max(64, Math.floor(msg.maxTokens)))
              : undefined,
          pageContext: msg.pageContext || latestContext,
          emitLiveTranscript: false,
        });
        return;
      }

      if (msg.type === 'init') {
        if (msg.lang) latestLang = msg.lang;
        if (msg.voiceName) latestVoice = msg.voiceName;
        if (msg.profileKey && !authUser?.id) urlProfileKey = msg.profileKey.trim().slice(0, 64);
        if (msg.pageContext) latestContext = msg.pageContext;
        closeGeminiSession();
        await connectGeminiLive(latestLang, latestVoice, latestContext);
        return;
      }

      if (msg.type === 'context') {
        if (msg.pageContext) {
          latestContext = msg.pageContext;
          if (geminiSession) {
            try {
              geminiSession.sendClientContent({
                turns: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `[SILENT SYSTEM TELEMETRY UPDATE — Do NOT reply out loud; just stay aware of the user's current screen]\n${formatPageContextForModel(latestContext)}`,
                      },
                    ],
                  },
                ],
                turnComplete: false,
              });
            } catch {}
          }
        }
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        const activeSession =
          geminiSession || (await connectGeminiLive(latestLang, latestVoice, latestContext));
        if (!activeSession) return;
        try {
          activeSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {}
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
        const cleanText = msg.text.trim();
        if (geminiSession) {
          flushAudioUserTurnMemory(cleanText, undefined);
          const contextSummary = latestContext
            ? formatPageContextForModel(latestContext).split('\n').slice(0, 2).join(' | ')
            : '';
          try {
            geminiSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: contextSummary ? `[Current screen: ${contextSummary}]\n${cleanText}` : cleanText,
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          } catch (err: any) {
            safeSend(clientWs, {
              type: 'live_error',
              message: err?.message || 'Failed to send text to Live session',
            });
          }
          return;
        }

        // Seamless DeepSeek/Orchestrator fallback when Gemini Live audio session is inactive
        await executeOrchestratedTurn({
          prompt: cleanText,
          turnId: `turn_${Date.now()}`,
          mode: 'voice-agent',
          channel: 'voice',
          modelId: aiGateway.getChatModelId(),
          history: msg.history,
          pageContext: latestContext,
          emitLiveTranscript: true,
        });
        return;
      }

      if (msg.type === 'tool_response' && Array.isArray(msg.responses)) {
        for (const r of msg.responses) {
          const key = r.id || r.name || '';
          const timer = pendingToolTimers.get(key);
          if (timer) {
            clearTimeout(timer);
            pendingToolTimers.delete(key);
          }
        }
        if (geminiSession) {
          try {
            geminiSession.sendToolResponse({
              functionResponses: msg.responses.map((r) => ({
                id: r.id,
                name: r.name,
                response: r.response,
              })),
            });
          } catch {}
        }
      }
    });
  });
}
