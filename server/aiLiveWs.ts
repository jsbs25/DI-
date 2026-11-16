import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
// @ts-ignore
import type { WebSocket, WebSocketServer } from 'ws';

const LIVE_SYSTEM_INSTRUCTION = `You are One., the real-time voice intelligence and autonomous website controller inside EARTH ONE.
Speak naturally, concisely, and warmly in the user's language (default to fluent Chinese if they speak Chinese, or English if they speak English).
Keep spoken replies crisp and conversational (typically 1-2 short sentences) so real-time voice interaction feels immediate.
You control all modules of EARTH ONE: Music (音乐空间 — auto-crawling & playing songs), Cinema (影院 — searching & playing documentaries), Language Learning Center (语言学习中心 — Duolingo multi-language immersion platform & English Engine), Messages & Calls (信息与通话), Discover (发现), World Library (世界图书馆), 3D Universe (3D宇宙), and Web Browser (空间浏览器). When the user asks to open music, play a song, watch a documentary, or navigate somewhere, confirm briefly in one short sentence because the web app is executing the action automatically.`;

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
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      safeSend(clientWs, {
        type: 'fallback',
        reason: 'no_gemini_key',
        message: 'Gemini Live key not configured on server; using continuous speech fallback.',
      });
      return;
    }

    let closedByClient = false;
    let sessionRef: {
      sendRealtimeInput: (input: {
        audio?: { data: string; mimeType: string };
        text?: string;
      }) => void;
      close?: () => void;
    } | null = null;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const sessionPromise = ai.live
      .connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: LIVE_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            if (closedByClient) return;
            safeSend(clientWs, { type: 'ready', engine: 'gemini-live' });
          },
          onmessage: (message: LiveServerMessage) => {
            if (closedByClient) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              safeSend(clientWs, {
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }

            if (content?.outputTranscription?.text) {
              safeSend(clientWs, {
                type: 'outputTranscript',
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

            if (content?.interrupted) {
              safeSend(clientWs, { type: 'interrupted' });
            }

            if (content?.turnComplete) {
              safeSend(clientWs, { type: 'turnComplete' });
            }
          },
          onerror: (err: unknown) => {
            if (closedByClient) return;
            const msg = err instanceof Error ? err.message : 'Gemini Live session error';
            safeSend(clientWs, {
              type: 'fallback',
              reason: 'live_error',
              message: msg,
            });
          },
          onclose: () => {
            if (closedByClient) return;
            safeSend(clientWs, { type: 'closed' });
          },
        },
      })
      .then((session) => {
        sessionRef = session;
        if (closedByClient) {
          try {
            session.close?.();
          } catch {
            // ignore
          }
          return null;
        }
        return session;
      })
      .catch((err: unknown) => {
        if (!closedByClient) {
          safeSend(clientWs, {
            type: 'fallback',
            reason: 'connect_failed',
            message: err instanceof Error ? err.message : 'Failed to connect Gemini Live',
          });
        }
        return null;
      });

    clientWs.on('message', (raw: Buffer | string) => {
      if (closedByClient) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          audio?: string;
          text?: string;
        };

        if (msg.type === 'ping') {
          safeSend(clientWs, { type: 'pong' });
          return;
        }

        const pcmBase64 = msg.type === 'audio' ? msg.data || msg.audio : msg.audio;
        if (pcmBase64 && typeof pcmBase64 === 'string') {
          void sessionPromise.then((session) => {
            if (!session || closedByClient) return;
            session.sendRealtimeInput({
              audio: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' },
            });
          });
          return;
        }

        if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          const textPrompt = msg.text.trim();
          void sessionPromise.then((session) => {
            if (!session || closedByClient) return;
            session.sendRealtimeInput({ text: textPrompt });
          });
        }
      } catch {
        // ignore malformed frame
      }
    });

    const cleanup = () => {
      if (closedByClient) return;
      closedByClient = true;
      try {
        sessionRef?.close?.();
      } catch {
        // ignore
      }
      void sessionPromise
        .then((session) => {
          try {
            session?.close?.();
          } catch {
            // ignore
          }
        })
        .catch(() => {});
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
