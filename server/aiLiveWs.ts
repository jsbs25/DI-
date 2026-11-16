// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';
import { Modality, ThinkingLevel, type LiveServerMessage } from '@google/genai';
import {
  createGeminiClient,
  GEMINI_FAST_MODEL,
  GEMINI_LIVE_MODEL,
  GEMINI_TEXT_MODEL,
  GEMINI_TTS_MODEL,
} from './geminiClient.ts';
import { buildLiveCompanionInstruction, ONE_SITE_TOOLS } from './siteTools.ts';

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // ignore closed socket send errors
  }
}

interface ClientContext {
  currentTab?: string;
  theme?: string;
  lang?: 'zh' | 'en';
  userName?: string;
  playingTrack?: string | null;
  isPlaying?: boolean;
  immersive?: boolean;
}

// Process-level fast capability cache so unsupported 404 endpoints never add repeated RTT overhead
let cachedLiveUnsupported = false;
let cachedTtsUnsupported = false;
let liveProbeStarted = false;

async function preprobeLiveCapabilityOnce() {
  if (liveProbeStarted) return;
  liveProbeStarted = true;
  const ai = createGeminiClient();
  if (!ai) return;
  try {
    const probeSession = await Promise.race([
      ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: () => {},
          onerror: (err: any) => {
            if (/404|NOT_FOUND|unsupported|not found/i.test(String(err?.message || err || ''))) {
              cachedLiveUnsupported = true;
            }
          },
          onclose: () => {},
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (probeSession) {
      try {
        (probeSession as any)?.close?.();
      } catch {}
    }
  } catch (err: any) {
    if (/404|NOT_FOUND|unsupported|not found/i.test(String(err?.message || err || ''))) {
      cachedLiveUnsupported = true;
    }
  }
}

function cleanSpokenReply(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeToolAction(name: string, args: Record<string, unknown>, isZh: boolean): string {
  switch (name) {
    case 'navigate_tab':
      return isZh ? '好的，已切换页面。' : `Opened ${String(args.tab || 'page')}.`;
    case 'fly_to_location':
      return isZh ? `好的，正在飞往${String(args.placeName || '目的地')}。` : `Flying to ${String(args.placeName || 'destination')}.`;
    case 'control_music':
      if (args.control === 'stop' || args.control === 'pause') {
        return isZh ? '好的，已暂停音乐。' : 'Music paused.';
      }
      if (args.control === 'next') return isZh ? '好的，下一首。' : 'Next track.';
      if (args.control === 'prev') return isZh ? '好的，上一首。' : 'Previous track.';
      return isZh ? '好的，正在播放音乐。' : 'Playing music.';
    case 'watch_cinema':
      return isZh ? `好的，正在打开影院。` : `Opening cinema.`;
    case 'browser_action':
      return isZh ? `好的，正在浏览器打开。` : `Opening in browser.`;
    case 'search_global_index':
      return isZh ? `好的，正在全网搜索。` : `Searching global index.`;
    case 'open_game':
      return isZh ? '好的，已启动游戏。' : 'Launching game.';
    case 'open_messenger_or_call':
      return isZh ? '好的，已打开通话中心。' : 'Opening Messenger & Calls.';
    case 'publish_global_post':
      return isZh ? '好的，已发布到全球广场。' : 'Published to Global Feed.';
    case 'set_site_preferences':
      return isZh ? '好的，已更新设置。' : 'Preferences updated.';
    default:
      return isZh ? '好的，已完成。' : 'Done.';
  }
}

export function attachAiLiveWs(wss: WebSocketServer) {
  void preprobeLiveCapabilityOnce();
  wss.on('connection', async (clientWs: WebSocket, req?: { url?: string }) => {
    const ai = createGeminiClient();
    if (!ai) {
      safeSend(clientWs, {
        type: 'error',
        reason: 'missing_api_key',
        message: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    let initialLang: 'zh' | 'en' = 'zh';
    let initialTab = 'globe';
    let shouldGreet = true;
    try {
      const url = new URL(req?.url || '/ws/ai-live', 'http://localhost');
      if (url.searchParams.get('lang') === 'en') initialLang = 'en';
      if (url.searchParams.get('tab')) initialTab = url.searchParams.get('tab') || 'globe';
      if (url.searchParams.get('greet') === '0') shouldGreet = false;
    } catch {}

    let latestContext: ClientContext = {
      currentTab: initialTab,
      lang: initialLang,
    };

    let closed = false;
    let mode: 'connecting' | 'live' | 'duplex' = 'connecting';
    let session: any = null;
    let liveReady = false;
    const pendingAudioQueue: string[] = [];

    // Duplex streaming state & cancellation epoch (incremented immediately on barge_in)
    let turnEpoch = 0;
    const duplexHistory: Array<{ role: 'user' | 'model'; text: string }> = [];

    const closeAll = () => {
      if (closed) return;
      closed = true;
      turnEpoch += 1;
      try {
        session?.close?.();
      } catch {}
      session = null;
    };

    clientWs.on('close', closeAll);
    clientWs.on('error', closeAll);

    const speakSentence = async (text: string, myEpoch: number, isFinal = true, latencyMs?: number) => {
      if (closed || myEpoch !== turnEpoch) return;
      const clean = cleanSpokenReply(text);
      if (!clean) {
        if (isFinal) safeSend(clientWs, { type: 'turn_complete' });
        return;
      }

      safeSend(clientWs, {
        type: 'output_transcript',
        text: clean,
        ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
      });

      if (cachedTtsUnsupported) {
        safeSend(clientWs, {
          type: 'fallback_tts',
          text: clean,
          final: isFinal,
          ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
        });
        return;
      }

      let emittedChunks = 0;
      try {
        const ttsStream = await ai.models.generateContentStream({
          model: GEMINI_TTS_MODEL,
          contents: [
            {
              role: 'user',
              parts: [{ text: clean }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

        for await (const chunk of ttsStream) {
          if (closed || myEpoch !== turnEpoch) return;
          const b64 = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (b64) {
            emittedChunks += 1;
            safeSend(clientWs, {
              type: 'audio',
              data: b64,
              ...(emittedChunks === 1 && typeof latencyMs === 'number' ? { latencyMs } : {}),
            });
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (/404|NOT_FOUND|unsupported|not found/i.test(msg)) {
          cachedTtsUnsupported = true;
        }
      }

      if (closed || myEpoch !== turnEpoch) return;
      if (emittedChunks === 0) {
        safeSend(clientWs, {
          type: 'fallback_tts',
          text: clean,
          final: isFinal,
          ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
        });
      } else if (isFinal) {
        safeSend(clientWs, { type: 'turn_complete' });
      }
    };

    const runDuplexTurn = async (userPayload: { wavBase64?: string; text?: string }) => {
      if (closed) return;
      turnEpoch += 1;
      const myEpoch = turnEpoch;
      const turnStartedAt = performance.now();
      let firstResponseLatencyMs: number | null = null;
      const markLatency = (): number => {
        if (firstResponseLatencyMs === null) {
          firstResponseLatencyMs = Math.max(1, Math.round(performance.now() - turnStartedAt));
        }
        return firstResponseLatencyMs;
      };

      const activeLang = latestContext.lang === 'en' ? 'en' : initialLang;
      const isZh = activeLang === 'zh';

      const systemInstruction = [
        buildLiveCompanionInstruction(activeLang, latestContext as Record<string, unknown>),
        '语音约束:回复严格不超过1句话(<=22字/15词),禁Markdown,听不清则简短说"没听清，请再说一次"。有操作请求立即调用工具。',
      ].join('\n');

      const historyContents = duplexHistory.slice(-4).map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      }));

      const userParts: Array<Record<string, unknown>> = userPayload.wavBase64
        ? [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: userPayload.wavBase64,
              },
            },
            {
              text: isZh ? '听语音并简短口语回应或调用工具。' : 'Listen and reply briefly or call tools.',
            },
          ]
        : [{ text: userPayload.text || '' }];

      const contents = [...historyContents, { role: 'user', parts: userParts }];

      // Try fastest model first (gemini-3.1-flash-lite with zero thinking delay!)
      const candidateModels = [GEMINI_FAST_MODEL, GEMINI_TEXT_MODEL];
      let fullRawText = '';
      const allCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
      let askedContext = false;
      let streamedFirstSentence = false;
      let pendingBuffer = '';
      let startsMediaPlayback = false;
      let succeeded = false;

      for (const modelName of candidateModels) {
        if (closed || myEpoch !== turnEpoch) return;
        try {
          const streamResp = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              temperature: 0.25,
              maxOutputTokens: 84,
              tools: [{ functionDeclarations: ONE_SITE_TOOLS }],
              ...(modelName === GEMINI_TEXT_MODEL
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          });

          for await (const chunk of streamResp) {
            if (closed || myEpoch !== turnEpoch) return;

            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
              const batchForward: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
              for (const call of chunk.functionCalls) {
                const name = call.name || '';
                if (!name) continue;
                if (name === 'get_current_site_context') {
                  askedContext = true;
                } else {
                  const item = {
                    id: call.id,
                    name,
                    args: (call.args || {}) as Record<string, unknown>,
                  };
                  allCalls.push(item);
                  batchForward.push(item);
                  if (
                    (name === 'control_music' &&
                      (item.args.control === 'play_query' || item.args.control === 'resume')) ||
                    name === 'watch_cinema'
                  ) {
                    startsMediaPlayback = true;
                  }
                }
              }
              // Execute site actions immediately on the first chunk without waiting for full text!
              if (batchForward.length > 0) {
                safeSend(clientWs, { type: 'tool_call', calls: batchForward, latencyMs: markLatency() });
              }
            }

            const delta = chunk.text || '';
            if (delta) {
              if (firstResponseLatencyMs === null) {
                safeSend(clientWs, { type: 'latency_metric', firstTokenMs: markLatency(), model: modelName });
              }
              fullRawText += delta;
              pendingBuffer += delta;
              // Stream first natural clause/sentence immediately for ultra-low time-to-first-word!
              if (!startsMediaPlayback) {
                const match = pendingBuffer.match(/^([\s\S]{5,}?[，,；;。！？.!?])\s*/);
                if (match) {
                  const sentence = match[1].trim();
                  pendingBuffer = pendingBuffer.slice(match[0].length);
                  streamedFirstSentence = true;
                  void speakSentence(sentence, myEpoch, false, markLatency());
                }
              }
            }
          }
          succeeded = true;
          break;
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (!/503|429|UNAVAILABLE|overloaded|high demand/i.test(msg)) {
            break;
          }
        }
      }

      if (closed || myEpoch !== turnEpoch) return;

      if (!succeeded) {
        await speakSentence(
          isZh ? '网络波动，请再说一次。' : 'Connection blip, please repeat.',
          myEpoch,
          true,
          markLatency()
        );
        return;
      }

      // If model only requested live context without speaking yet, resolve immediately
      if (askedContext && !cleanSpokenReply(fullRawText) && allCalls.length === 0) {
        try {
          const followUp = await ai.models.generateContent({
            model: GEMINI_FAST_MODEL,
            contents: [
              ...contents,
              {
                role: 'user',
                parts: [
                  {
                    text: `当前网站状态：${JSON.stringify(latestContext)}。用一句不超过20字的简短口语回答用户。`,
                  },
                ],
              },
            ],
            config: { systemInstruction, temperature: 0.35, maxOutputTokens: 100 },
          });
          if (closed || myEpoch !== turnEpoch) return;
          fullRawText = followUp.text || '';
          pendingBuffer = fullRawText;
        } catch {}
      }

      const fullClean = cleanSpokenReply(fullRawText);
      const remainderClean = cleanSpokenReply(pendingBuffer);

      let finalDisplayText = fullClean;
      if (!finalDisplayText && allCalls.length > 0) {
        const first = allCalls[0];
        finalDisplayText = summarizeToolAction(first.name, first.args, isZh);
      } else if (!finalDisplayText) {
        finalDisplayText = isZh ? '我在，请说。' : "I'm listening.";
      }

      duplexHistory.push({
        role: 'user',
        text: userPayload.text || (isZh ? '[语音指令]' : '[Voice]'),
      });
      duplexHistory.push({ role: 'model', text: finalDisplayText });
      if (duplexHistory.length > 8) {
        duplexHistory.splice(0, duplexHistory.length - 8);
      }

      const finalLatencyMs = markLatency();
      if (startsMediaPlayback) {
        safeSend(clientWs, { type: 'output_transcript', text: finalDisplayText, latencyMs: finalLatencyMs });
        safeSend(clientWs, { type: 'turn_complete', latencyMs: finalLatencyMs });
        return;
      }

      if (streamedFirstSentence) {
        if (remainderClean) {
          await speakSentence(remainderClean, myEpoch, true, finalLatencyMs);
        } else {
          safeSend(clientWs, { type: 'turn_complete', latencyMs: finalLatencyMs });
        }
      } else {
        await speakSentence(finalDisplayText, myEpoch, true, finalLatencyMs);
      }
    };

    const startServerDuplexMode = async () => {
      if (closed || mode === 'duplex') return;
      mode = 'duplex';
      try {
        session?.close?.();
      } catch {}
      session = null;

      safeSend(clientWs, {
        type: 'ready',
        model: GEMINI_FAST_MODEL,
        mode: 'duplex',
      });

      if (shouldGreet) {
        turnEpoch += 1;
        const myEpoch = turnEpoch;
        const greeting = initialLang === 'zh' ? '我在，请说。' : "I'm listening.";
        void speakSentence(greeting, myEpoch, true);
      }
    };

    clientWs.on('message', (raw: Buffer | string) => {
      if (closed) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
          context?: ClientContext;
          responses?: Array<{ id?: string; name?: string; response?: Record<string, unknown> }>;
        };

        if (msg.type === 'ping') {
          safeSend(clientWs, { type: 'pong', engine: mode === 'live' ? GEMINI_LIVE_MODEL : GEMINI_FAST_MODEL });
          return;
        }

        if (msg.type === 'context' && msg.context) {
          latestContext = { ...latestContext, ...msg.context };
          return;
        }

        if (msg.type === 'barge_in') {
          // Immediately abort any active Gemini generation or TTS streaming turn
          turnEpoch += 1;
          safeSend(clientWs, { type: 'interrupted' });
          return;
        }

        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          if (mode === 'live') {
            if (!session || !liveReady) {
              if (pendingAudioQueue.length < 30) pendingAudioQueue.push(msg.data);
              return;
            }
            session.sendRealtimeInput({
              audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
            });
          }
          return;
        }

        if (msg.type === 'audio_turn' && typeof msg.data === 'string' && msg.data.length > 0) {
          void runDuplexTurn({ wavBase64: msg.data });
          return;
        }

        if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          if (mode === 'live' && session && liveReady) {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: msg.text.trim() }] }],
              turnComplete: true,
            });
          } else {
            void runDuplexTurn({ text: msg.text.trim() });
          }
          return;
        }

        if (msg.type === 'tool_response' && Array.isArray(msg.responses) && mode === 'live' && session) {
          session.sendToolResponse({
            functionResponses: msg.responses.map((r) => ({
              id: r.id,
              name: r.name,
              response: r.response || { ok: true },
            })),
          });
          return;
        }
      } catch {
        // ignore malformed frames
      }
    });

    if (cachedLiveUnsupported) {
      void startServerDuplexMode();
      return;
    }

    try {
      session = await ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Zephyr',
              },
            },
          },
          tools: [{ functionDeclarations: ONE_SITE_TOOLS }],
          systemInstruction: buildLiveCompanionInstruction(initialLang, latestContext as Record<string, unknown>),
        },
        callbacks: {
          onopen: () => {
            if (closed) return;
            liveReady = true;
            mode = 'live';
            safeSend(clientWs, { type: 'ready', model: GEMINI_LIVE_MODEL, mode: 'live' });
            while (pendingAudioQueue.length > 0 && session) {
              const chunk = pendingAudioQueue.shift();
              if (chunk) {
                try {
                  session.sendRealtimeInput({
                    audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' },
                  });
                } catch {}
              }
            }
            if (shouldGreet && session) {
              try {
                session.sendClientContent({
                  turns: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text:
                            initialLang === 'zh'
                              ? '用户刚刚点开了你，立刻用四个字“我在，请说”跟用户打招呼。'
                              : 'User just opened you. Say "I am listening." right away.',
                        },
                      ],
                    },
                  ],
                  turnComplete: true,
                });
              } catch {}
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
            const content = message.serverContent;

            if (content?.interrupted) {
              safeSend(clientWs, { type: 'interrupted' });
            }

            if (content?.inputTranscription?.text) {
              safeSend(clientWs, {
                type: 'input_transcript',
                text: content.inputTranscription.text,
              });
            }

            if (content?.outputTranscription?.text) {
              safeSend(clientWs, {
                type: 'output_transcript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSend(clientWs, {
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            if (content?.turnComplete) {
              safeSend(clientWs, { type: 'turn_complete' });
            }

            const calls = message.toolCall?.functionCalls;
            if (calls && calls.length > 0) {
              const forwardToClient: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
              const immediateServerResponses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];

              for (const call of calls) {
                const name = call.name || '';
                if (name === 'get_current_site_context') {
                  immediateServerResponses.push({
                    id: call.id,
                    name,
                    response: {
                      success: true,
                      context: latestContext,
                    },
                  });
                } else {
                  forwardToClient.push({
                    id: call.id,
                    name,
                    args: (call.args || {}) as Record<string, unknown>,
                  });
                }
              }

              if (immediateServerResponses.length > 0 && session) {
                session.sendToolResponse({ functionResponses: immediateServerResponses });
              }

              if (forwardToClient.length > 0) {
                safeSend(clientWs, {
                  type: 'tool_call',
                  calls: forwardToClient,
                });
              }
            }
          },
          onerror: (err: any) => {
            if (closed) return;
            const msg = String(err?.message || err || '');
            if (/404|NOT_FOUND|unsupported/i.test(msg)) {
              cachedLiveUnsupported = true;
            }
            void startServerDuplexMode();
          },
          onclose: () => {
            if (closed) return;
            if (!liveReady) {
              cachedLiveUnsupported = true;
              void startServerDuplexMode();
            } else {
              safeSend(clientWs, { type: 'closed' });
              closed = true;
            }
          },
        },
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/404|NOT_FOUND|unsupported/i.test(msg)) {
        cachedLiveUnsupported = true;
      }
      if (!closed) {
        void startServerDuplexMode();
      }
    }
  });
}
