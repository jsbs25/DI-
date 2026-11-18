import {
  ActivityHandling,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import type { IncomingMessage } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';
import { getGeminiLiveClient } from './geminiClient.ts';
import {
  AI_COMPANION_TOOLS,
  buildCompanionSystemInstruction,
  formatPageContextForModel,
  type LivePageContextSummary,
} from './aiLiveTools.ts';
import { store } from './store.ts';
import {
  commitMemoriesFromTurn,
  normalizeProfileKey,
  retrieveRelevantMemories,
  upsertMemory,
} from './aiMemory.ts';
import { answerWithLiveKnowledge } from './liveKnowledge.ts';
import { solvePrecisionQuery } from '../src/utils/precisionSolver.ts';

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // ignore closed socket errors
  }
}

interface ClientInitPayload {
  type: 'init' | 'audio' | 'text' | 'context' | 'tool_response' | 'interrupt' | 'ping';
  lang?: string;
  voiceName?: string;
  profileKey?: string;
  pageContext?: LivePageContextSummary;
  data?: string;
  text?: string;
  responses?: Array<{ id?: string; name?: string; response: Record<string, unknown> }>;
}

const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

export function attachAiLiveWs(wss: WebSocketServer) {
  wss.on('connection', (clientWs: WebSocket, req?: IncomingMessage) => {
    let session: Session | null = null;
    let isClosing = false;
    let latestLang = 'zh';
    let latestVoice = 'Zephyr';
    let latestContext: LivePageContextSummary | null = null;
    let connectingPromise: Promise<Session | null> | null = null;
    const pendingToolTimers = new Map<string, ReturnType<typeof setTimeout>>();

    let profileKey = normalizeProfileKey(undefined, undefined);
    try {
      const reqUrl = new URL(req?.url || '/ws/ai-live', 'http://localhost');
      const rawProfile = reqUrl.searchParams.get('profileKey');
      if (rawProfile) {
        profileKey = normalizeProfileKey(rawProfile, undefined);
      }
    } catch {
      // keep default profileKey
    }

    let bufferedUserSpeech = '';
    const recentTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let currentAssistantSpeech = '';

    const flushUserMemory = (overrideText?: string) => {
      const textToCommit = (overrideText ?? bufferedUserSpeech).trim();
      bufferedUserSpeech = '';
      if (!textToCommit) return;
      recentTurns.push({ role: 'user', content: textToCommit });
      if (recentTurns.length > 12) recentTurns.shift();
      try {
        const saved = commitMemoriesFromTurn(store, profileKey, textToCommit, recentTurns);
        if (saved.length > 0) {
          safeSend(clientWs, { type: 'memory_saved', count: saved.length, items: saved });
        }
      } catch {
        // non-fatal memory persistence
      }
    };

    const closeGeminiSession = () => {
      for (const timer of pendingToolTimers.values()) clearTimeout(timer);
      pendingToolTimers.clear();
      if (session) {
        try {
          session.close();
        } catch {
          // ignore
        }
        session = null;
      }
    };

    const connectGeminiLive = async (
      lang: string,
      voiceName: string,
      pageContext: LivePageContextSummary | null
    ): Promise<Session | null> => {
      if (session) return session;
      if (connectingPromise) return connectingPromise;

      const ai = getGeminiLiveClient();
      if (!ai) {
        safeSend(clientWs, {
          type: 'live_unavailable',
          reason: 'missing_gemini_key',
          message: 'GEMINI_API_KEY is not configured; using companion API fallback.',
        });
        return null;
      }

      const resolvedVoice = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Zephyr';
      const recalledMemories = retrieveRelevantMemories(store, profileKey, '', recentTurns, 640);

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
                    flushUserMemory();
                  }
                  currentAssistantSpeech += sc.outputTranscription.text;
                  safeSend(clientWs, {
                    type: 'output_transcript',
                    text: sc.outputTranscription.text,
                  });
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
                        const kind = (['identity', 'preference', 'project', 'fact'].includes(kindRaw)
                          ? kindRaw
                          : 'fact') as 'identity' | 'preference' | 'project' | 'fact';
                        const res = upsertMemory(store, profileKey, {
                          kind,
                          normalizedKey: `${kind}.voice_${Date.now().toString(36)}`,
                          content: queryOrContent,
                          confidence: 0.96,
                          salience: 0.95,
                          source: 'user_explicit',
                        });
                        safeSend(clientWs, { type: 'memory_saved', count: 1, items: [res.item] });
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: { ok: true, saved: true, content: res.item.content },
                        });
                      } else {
                        const memories = retrieveRelevantMemories(
                          store,
                          profileKey,
                          queryOrContent,
                          recentTurns,
                          640
                        );
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: {
                            ok: true,
                            memories: memories.map((m) => ({ kind: m.kind, content: m.content })),
                          },
                        });
                      }
                    } else if (name === 'lookup_live_knowledge') {
                      const q = String(args.query || '').trim();
                      const isZh = latestLang === 'zh';
                      const exact = q ? solvePrecisionQuery(q, isZh) : null;
                      if (exact) {
                        immediateResponses.push({
                          id: call.id,
                          name,
                          response: { ok: true, source: 'precision', answer: exact.answer },
                        });
                      } else if (q) {
                        try {
                          const live = await answerWithLiveKnowledge(q, 'voice-agent', {
                            history: recentTurns,
                            memories: retrieveRelevantMemories(store, profileKey, q, recentTurns, 400),
                          });
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
                      liveSession.sendToolResponse({
                        functionResponses: immediateResponses,
                      });
                    } catch {
                      // ignore
                    }
                  }

                  if (clientCalls.length > 0) {
                    safeSend(clientWs, {
                      type: 'tool_call',
                      calls: clientCalls,
                    });

                    // Safety timeout so Live session never stalls if client disconnects mid-tool
                    for (const c of clientCalls) {
                      const key = c.id || `${c.name}_${Date.now()}`;
                      const timer = setTimeout(() => {
                        pendingToolTimers.delete(key);
                        try {
                          liveSession.sendToolResponse({
                            functionResponses: [
                              {
                                id: c.id,
                                name: c.name,
                                response: { ok: true, status: 'dispatched' },
                              },
                            ],
                          });
                        } catch {
                          // ignore
                        }
                      }, 5500);
                      pendingToolTimers.set(key, timer);
                    }
                  }
                }

                if (sc?.turnComplete) {
                  flushUserMemory();
                  if (currentAssistantSpeech.trim()) {
                    recentTurns.push({ role: 'assistant', content: currentAssistantSpeech.trim() });
                    if (recentTurns.length > 12) recentTurns.shift();
                    currentAssistantSpeech = '';
                  }
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
                session = null;
                if (!isClosing) {
                  safeSend(clientWs, { type: 'closed' });
                }
              },
            },
          });
          session = liveSession;
          return liveSession;
        } catch (err: any) {
          safeSend(clientWs, {
            type: 'live_unavailable',
            reason: 'connect_failed',
            message: err?.message || 'Failed to connect Gemini Live session.',
          });
          return null;
        } finally {
          connectingPromise = null;
        }
      })();

      return connectingPromise;
    };

    clientWs.on('message', async (raw: Buffer | string) => {
      let msg: ClientInitPayload;
      try {
        msg = JSON.parse(raw.toString()) as ClientInitPayload;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        safeSend(clientWs, { type: 'pong', engine: 'gemini-3.8-live' });
        return;
      }

      if (msg.type === 'init') {
        if (msg.lang) latestLang = msg.lang;
        if (msg.voiceName) latestVoice = msg.voiceName;
        if (msg.profileKey) profileKey = normalizeProfileKey(msg.profileKey, undefined);
        if (msg.pageContext) latestContext = msg.pageContext;
        closeGeminiSession();
        await connectGeminiLive(latestLang, latestVoice, latestContext);
        return;
      }

      if (msg.type === 'context') {
        if (msg.pageContext) {
          latestContext = msg.pageContext;
          if (session) {
            try {
              session.sendClientContent({
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
            } catch {
              // ignore context sync errors
            }
          }
        }
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        const activeSession =
          session || (await connectGeminiLive(latestLang, latestVoice, latestContext));
        if (!activeSession) return;
        try {
          activeSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {
          // ignore transient send errors
        }
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
        const cleanText = msg.text.trim();
        flushUserMemory(cleanText);
        const activeSession =
          session || (await connectGeminiLive(latestLang, latestVoice, latestContext));
        if (!activeSession) return;
        const contextPrefix = latestContext
          ? `[Current screen: ${latestContext.currentTab || 'globe'} | ${latestContext.theme || 'light'} | music=${latestContext.music?.isPlaying ? latestContext.music.title : 'idle'}]\n`
          : '';
        try {
          activeSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: `${contextPrefix}${cleanText}` }],
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

      if (msg.type === 'tool_response' && Array.isArray(msg.responses)) {
        for (const r of msg.responses) {
          const key = r.id || r.name || '';
          const timer = pendingToolTimers.get(key);
          if (timer) {
            clearTimeout(timer);
            pendingToolTimers.delete(key);
          }
        }
        if (session) {
          try {
            session.sendToolResponse({
              functionResponses: msg.responses.map((r) => ({
                id: r.id,
                name: r.name,
                response: r.response,
              })),
            });
          } catch {
            // ignore
          }
        }
        return;
      }

      if (msg.type === 'interrupt') {
        currentAssistantSpeech = '';
        safeSend(clientWs, { type: 'interrupted' });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      flushUserMemory();
      closeGeminiSession();
    });

    clientWs.on('error', () => {
      isClosing = true;
      closeGeminiSession();
    });
  });
}
