/**
 * spiritLiveVoice.ts
 *
 * One-tap real-time duplex voice conversation controller anchored directly to
 * the 3D Paradise World Spirit's overhead speech bubble (zero extra popups!).
 *
 * 1) Primary: Full-duplex Gemini Live WebSocket (`/ws/ai-live`) + `AudioLiveClient`
 *    (16kHz mic PCM uplink, local VAD instant barge-in, 24kHz compressed steady output)
 * 2) Automatic Seamless Fallback: Hands-free continuous voice loop
 *    (`SpeechRecognition` -> `submitSpiritCommand(..., { speakReply: true })` ->
 *    steady normalized Gemini human voice -> auto-resume listening)
 */

import type { Language } from '../types/index.ts';
import { wsUrl } from '../apiBase.ts';
import { getAiProfileKey } from '../utils/aiProfile.ts';
import { AudioLiveClient } from '../components/ai/audioLiveClient.ts';
import { stopSteadyVoice, unlockSteadyVoiceAudio } from '../utils/steadyVoicePlayer.ts';
import { uiStateManager } from './uiStateManager.ts';
import {
  dispatchAgentClientActions,
  stopSpiritSpeech,
  submitSpiritCommand,
} from './agentClient.ts';
import { parseInstantAgentAction } from '../utils/oneAgentController.ts';

class SpiritLiveVoiceController {
  private active = false;
  private lang: Language = 'zh';
  private ws: WebSocket | null = null;
  private audioClient: AudioLiveClient | null = null;
  private fallbackRec: any = null;
  private fallbackLoopTimer: number | null = null;
  private connectTimeout: number | null = null;
  private usingFallbackLoop = false;
  private fallbackBusy = false;
  private currentAiText = '';
  private currentUserText = '';
  private lastDispatchedUtterance = '';
  private suppressUserUntil = 0;

  public isActive(): boolean {
    return this.active;
  }

  public async toggle(lang: Language): Promise<void> {
    if (this.active) {
      this.stop();
    } else {
      await this.start(lang);
    }
  }

  public async start(lang: Language): Promise<void> {
    this.stop(true);
    this.active = true;
    this.lang = lang;
    this.usingFallbackLoop = false;
    this.fallbackBusy = false;
    this.currentAiText = '';
    this.currentUserText = '';
    this.suppressUserUntil = 0;

    unlockSteadyVoiceAudio();
    stopSpiritSpeech();
    stopSteadyVoice();

    const snap = uiStateManager.getSnapshot();
    const isZh = lang === 'zh';

    // Ensure ONLY the single overhead bubble is visible — NEVER open secondary panels
    uiStateManager.setPavilionHudOpen(false);
    uiStateManager.setSpiritState('woken_approaching');
    uiStateManager.setLiveVoiceStatus({ liveVoiceActive: true, liveVoicePhase: 'connecting' });
    uiStateManager.setVoiceStatus({ voiceListening: false, lastSpokenTranscript: '' });
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      speaking: false,
      badge: isZh ? '实时对话连接中' : 'Connecting Live',
      text: isZh ? '正在建立实时语音连接，请稍候…' : 'Connecting real-time voice…',
      translationZh: undefined,
      phonetic: undefined,
      generatedImage: null,
      rescueExpanded: false,
    });

    const audioClient = new AudioLiveClient();
    this.audioClient = audioClient;

    let liveFailed = false;
    const profileKey = getAiProfileKey();
    const liveWsUrl = `${wsUrl('/ws/ai-live')}?profileKey=${encodeURIComponent(profileKey)}`;

    try {
      const ws = new WebSocket(liveWsUrl);
      this.ws = ws;

      // If Gemini Live doesn't become ready in 4.5s, fall back cleanly to continuous voice loop
      this.connectTimeout = window.setTimeout(() => {
        if (!this.active || this.usingFallbackLoop) return;
        const phase = uiStateManager.getSnapshot().liveVoicePhase;
        if (phase === 'connecting') {
          liveFailed = true;
          this.switchToContinuousFallback();
        }
      }, 4500);

      ws.onopen = async () => {
        if (!this.active || this.ws !== ws) return;
        ws.send(
          JSON.stringify({
            type: 'init',
            lang,
            aiName: snap.aiName || 'ONE',
            sessionId: `spirit_live_${Date.now()}`,
            voiceName: snap.voiceName || 'Kore',
            profileKey,
          })
        );

        try {
          await audioClient.startMic({
            onMicPcmBase64: (b64) => {
              if (ws.readyState === WebSocket.OPEN && !liveFailed && this.active) {
                ws.send(JSON.stringify({ type: 'audio', data: b64 }));
              }
            },
            onLocalBargeIn: () => {
              if (!this.active) return;
              audioClient.flushOutput();
              this.currentAiText = '';
              uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'listening' });
              uiStateManager.setVoiceStatus({ voiceListening: true });
              uiStateManager.setSpiritBubble({
                visible: true,
                speaking: false,
                badge: isZh ? '实时对话中 · 我在听' : 'Live · Listening',
              });
            },
          });
        } catch {
          // Mic permission denied or unavailable
          if (!this.active) return;
          liveFailed = true;
          this.stop(true);
          uiStateManager.setSpiritBubble({
            visible: true,
            isLoading: false,
            badge: isZh ? '需要麦克风权限' : 'Mic Needed',
            text: isZh
              ? '未获取到麦克风权限，请在浏览器允许麦克风后再次点击实时对话，或直接打字聊。'
              : 'Microphone permission was not granted. Allow mic access and tap again, or type below.',
          });
        }
      };

      ws.onmessage = (event) => {
        if (!this.active || this.ws !== ws) return;
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          if (msg.engine === 'deepseek' || msg.streaming) return;
          uiStateManager.setLiveVoiceStatus({ liveVoiceActive: true, liveVoicePhase: 'listening' });
          uiStateManager.setVoiceStatus({ voiceListening: true, lastSpokenTranscript: '' });
          uiStateManager.setSpiritState('working_in_pavilion');
          uiStateManager.setSpiritBubble({
            visible: true,
            isLoading: false,
            speaking: false,
            badge: isZh ? '实时对话中' : 'Live Voice',
            text: isZh ? '我在线啦，直接开口说话就行，随时可以打断我。' : 'I am live — just speak naturally anytime.',
          });
          return;
        }

        if (msg.type === 'live_unavailable' || msg.type === 'error') {
          liveFailed = true;
          this.switchToContinuousFallback();
          return;
        }

        if (msg.type === 'audio' && typeof msg.data === 'string') {
          audioClient.setAssistantOutputting(true);
          audioClient.enqueuePcm24k(msg.data);
          this.suppressUserUntil = Date.now() + 1100;
          if (uiStateManager.getSnapshot().liveVoicePhase !== 'speaking') {
            uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'speaking' });
            uiStateManager.setVoiceStatus({ voiceListening: false });
            uiStateManager.setSpiritBubble({
              visible: true,
              speaking: true,
              badge: isZh ? '实时对话 · 正在回答' : 'Live · Speaking',
            });
          }
          return;
        }

        if (msg.type === 'interrupted') {
          audioClient.flushOutput();
          this.currentAiText = '';
          uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'listening' });
          uiStateManager.setVoiceStatus({ voiceListening: true });
          uiStateManager.setSpiritBubble({
            visible: true,
            speaking: false,
            badge: isZh ? '实时对话 · 我在听' : 'Live · Listening',
          });
          return;
        }

        if (msg.type === 'input_transcript' && typeof msg.text === 'string') {
          const piece = msg.text;
          if (!piece.trim()) return;
          const isSpeaking =
            uiStateManager.getSnapshot().liveVoicePhase === 'speaking' ||
            audioClient.isPlayingOutput();
          if (isSpeaking || Date.now() < this.suppressUserUntil) {
            return;
          }
          this.currentAiText = '';
          this.currentUserText = (this.currentUserText + piece).slice(-140);
          uiStateManager.setVoiceStatus({
            voiceListening: true,
            lastSpokenTranscript: this.currentUserText.trim(),
          });
          return;
        }

        if (msg.type === 'output_transcript' && typeof msg.text === 'string') {
          const cleanPiece = msg.text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/\[\[(?:EMO|EMOTION|ACTION):[^\]]*\]\]/gi, '');
          if (!cleanPiece) return;
          if (this.currentUserText.trim()) {
            void this.maybeExecuteSpokenIntent(this.currentUserText.trim());
          }
          this.currentUserText = '';
          this.currentAiText += cleanPiece;
          uiStateManager.setSpiritBubble({
            visible: true,
            isLoading: false,
            speaking: true,
            badge: isZh ? '实时对话中' : 'Live Voice',
            text: this.currentAiText.trim(),
          });
          return;
        }

        if (msg.type === 'turn_complete') {
          audioClient.setAssistantOutputting(false);
          this.suppressUserUntil = Date.now() + 750;
          if (this.currentUserText.trim()) {
            void this.maybeExecuteSpokenIntent(this.currentUserText.trim());
          }
          const finishedText = this.currentAiText.trim();
          if (finishedText) {
            uiStateManager.appendChatMessage('assistant', finishedText);
          }
          this.currentAiText = '';
          this.currentUserText = '';
          uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'listening' });
          uiStateManager.setVoiceStatus({ voiceListening: true, lastSpokenTranscript: '' });
          uiStateManager.setSpiritBubble({
            visible: true,
            speaking: false,
            badge: isZh ? '实时对话中 · 请说' : 'Live · Listening',
          });
        }
      };

      ws.onerror = () => {
        if (!this.active || this.usingFallbackLoop) return;
        liveFailed = true;
        this.switchToContinuousFallback();
      };

      ws.onclose = () => {
        if (!this.active || this.usingFallbackLoop) return;
        liveFailed = true;
        this.switchToContinuousFallback();
      };
    } catch {
      this.switchToContinuousFallback();
    }
  }

  /**
   * Bridges spoken utterances during Gemini Live duplex voice into real app actions
   * (playing music in Venus Music Space, opening curated books directly in Apple Books Reader,
   * switching views/weather, etc.) so voice requests always act instead of only talking.
   */
  private async maybeExecuteSpokenIntent(rawUtterance: string) {
    const clean = rawUtterance.trim();
    if (clean.length < 2) return;
    if (clean === this.lastDispatchedUtterance) return;
    this.lastDispatchedUtterance = clean;

    const isZh = this.lang === 'zh';

    // 1. Book / Reading / Noor Islamic PDF intent -> ask orchestrator to pick a real book or open Islamic PDF library
    const wantsBook =
      /(?:مكتبة\s*ال?نور|noor[\s-]?book|努尔图书馆|伊斯兰.*(?:书|pdf)|找一?本.*书|推荐一?本?.*书|想看书|要看书|去看书|看一?本书|读一?本书|看书|读书|图书馆|看《[^》]+》|read\s+a\s+book|find.*book)/i.test(
        clean
      );
    if (wantsBook) {
      try {
        const res = await fetch('/api/one-ai/agent/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: clean,
            lang: this.lang,
            aiName: uiStateManager.getSnapshot().aiName || 'ONE',
          }),
        });
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.clientActions) && data.clientActions.length > 0) {
          dispatchAgentClientActions(data.clientActions);
          return;
        }
      } catch {
        // fall through to direct library open
      }
      dispatchAgentClientActions([{ type: 'open_book', query: clean }]);
      return;
    }

    // 2. Music, Cinema, Navigation, Theme, Globe Fly-To via instant action parser
    const instant = parseInstantAgentAction(clean, isZh, []);
    if (instant && instant.type !== 'none') {
      dispatchAgentClientActions([instant as unknown as Record<string, unknown>]);
    }
  }

  private switchToContinuousFallback() {
    if (!this.active || this.usingFallbackLoop) return;
    this.usingFallbackLoop = true;

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    try {
      this.audioClient?.dispose();
    } catch {}
    this.audioClient = null;

    const isZh = this.lang === 'zh';
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      this.stop(true);
      uiStateManager.setSpiritBubble({
        visible: true,
        isLoading: false,
        badge: isZh ? '语音提示' : 'Voice Notice',
        text: isZh
          ? '当前浏览器不支持实时语音识别，请直接打字与我交流。'
          : 'Real-time voice recognition is not supported in this browser; please type below.',
      });
      return;
    }

    uiStateManager.setLiveVoiceStatus({ liveVoiceActive: true, liveVoicePhase: 'listening' });
    uiStateManager.setVoiceStatus({ voiceListening: true, lastSpokenTranscript: '' });
    uiStateManager.setSpiritState('working_in_pavilion');
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      speaking: false,
      badge: isZh ? '实时对话中' : 'Live Voice',
      text: isZh ? '实时语音已就绪，直接开口说话，说完我会自动回应你。' : 'Live voice ready — speak naturally and I will reply.',
    });

    this.runFallbackRecognitionTurn();
  }

  private runFallbackRecognitionTurn() {
    if (!this.active || !this.usingFallbackLoop || this.fallbackBusy) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const isZh = this.lang === 'zh';
    const rec = new SpeechRec();
    this.fallbackRec = rec;
    rec.lang = this.lang === 'en' ? 'en-US' : this.lang === 'ar' ? 'ar-SA' : 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalTranscript = '';

    rec.onstart = () => {
      if (!this.active) return;
      uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'listening' });
      uiStateManager.setVoiceStatus({ voiceListening: true });
    };

    rec.onresult = (event: any) => {
      if (!this.active) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript;
        else interim += res[0].transcript;
      }
      const combined = (finalTranscript || interim).trim();
      if (combined) {
        uiStateManager.setVoiceStatus({ voiceListening: true, lastSpokenTranscript: combined });
      }
    };

    rec.onerror = (ev: any) => {
      if (!this.active) return;
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        this.stop(true);
        uiStateManager.setSpiritBubble({
          visible: true,
          badge: isZh ? '需要麦克风权限' : 'Mic Needed',
          text: isZh ? '请先允许浏览器麦克风权限，再点击实时对话。' : 'Please allow microphone access to use live voice.',
        });
        return;
      }
      // Transient no-speech error: keep listening continuously
      uiStateManager.setVoiceStatus({ voiceListening: false });
      this.scheduleNextFallbackTurn(500);
    };

    rec.onend = async () => {
      this.fallbackRec = null;
      if (!this.active || !this.usingFallbackLoop) return;
      const spoken = finalTranscript.trim();
      uiStateManager.setVoiceStatus({ voiceListening: false });

      if (!spoken) {
        this.scheduleNextFallbackTurn(350);
        return;
      }

      this.fallbackBusy = true;
      uiStateManager.setLiveVoiceStatus({ liveVoicePhase: 'thinking' });
      try {
        await submitSpiritCommand(spoken, { lang: this.lang, speakReply: true });
      } finally {
        this.fallbackBusy = false;
      }

      if (!this.active || !this.usingFallbackLoop) return;
      // Wait smoothly until the spirit finishes speaking before reopening mic
      const waitForSpeechDone = () => {
        if (!this.active || !this.usingFallbackLoop) return;
        const speaking = Boolean(uiStateManager.getSnapshot().spiritBubble?.speaking);
        if (speaking) {
          this.fallbackLoopTimer = window.setTimeout(waitForSpeechDone, 260);
        } else {
          uiStateManager.setVoiceStatus({ lastSpokenTranscript: '' });
          this.scheduleNextFallbackTurn(280);
        }
      };
      this.fallbackLoopTimer = window.setTimeout(waitForSpeechDone, 320);
    };

    try {
      rec.start();
    } catch {
      this.scheduleNextFallbackTurn(600);
    }
  }

  private scheduleNextFallbackTurn(delayMs: number) {
    if (!this.active || !this.usingFallbackLoop) return;
    if (this.fallbackLoopTimer) {
      clearTimeout(this.fallbackLoopTimer);
    }
    this.fallbackLoopTimer = window.setTimeout(() => {
      this.fallbackLoopTimer = null;
      this.runFallbackRecognitionTurn();
    }, delayMs);
  }

  public stop(silent = false) {
    this.active = false;
    this.usingFallbackLoop = false;
    this.fallbackBusy = false;

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.fallbackLoopTimer) {
      clearTimeout(this.fallbackLoopTimer);
      this.fallbackLoopTimer = null;
    }
    if (this.fallbackRec) {
      try {
        this.fallbackRec.onend = null;
        this.fallbackRec.onerror = null;
        this.fallbackRec.stop();
      } catch {}
      this.fallbackRec = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.audioClient) {
      try {
        this.audioClient.dispose();
      } catch {}
      this.audioClient = null;
    }

    stopSpiritSpeech();
    stopSteadyVoice();
    uiStateManager.setLiveVoiceStatus({ liveVoiceActive: false, liveVoicePhase: 'idle' });
    uiStateManager.setVoiceStatus({ voiceListening: false, lastSpokenTranscript: '' });

    if (!silent) {
      const isZh = this.lang === 'zh';
      uiStateManager.setSpiritBubble({
        visible: true,
        speaking: false,
        badge: isZh ? '已结束实时对话' : 'Live Ended',
        text: isZh ? '实时语音对话已结束，随时再按一下就能继续聊。' : 'Live voice ended. Tap anytime to talk again.',
      });
    }
  }
}

export const spiritLiveVoice = new SpiritLiveVoiceController();
export const toggleSpiritLiveVoice = (lang: Language) => spiritLiveVoice.toggle(lang);
export const stopSpiritLiveVoice = (silent = false) => spiritLiveVoice.stop(silent);
