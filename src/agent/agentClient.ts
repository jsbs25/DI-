import type { Language } from '../types/index.ts';
import type { WeatherKind, TimePreset } from '../components/paradise/paradiseEnvironment.ts';
import { uiStateManager, type AgentTaskView } from './uiStateManager.ts';
import {
  analyzeDialogueEmotion,
  buildExpressivePhrases,
  extractEmotionTag,
  type VoiceEmotion,
} from '../utils/emotionEngine.ts';

export interface LearningAgentAction {
  seq: number;
  language?: 'ar' | 'en';
  tab?: 'alphabet' | 'practice' | 'english' | 'islamic_library' | 'duolingo_platform';
}

export interface AgentClientHandlers {
  onNavigateTab?: (tab: string) => void;
  onOpenBookById?: (bookId: string) => void;
  onOpenBookAction?: (opts: { query: string }) => void;
  onOpenLanguageLesson?: (action: LearningAgentAction) => void;
  onBrowserSearchAction?: (query: string) => void;
  onGlobalSearchAction?: (query: string) => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean; control?: string }) => void;
  onWatchDocumentaryAction?: (opts: { query: string; platform?: 'all' | 'bilibili' | 'youtube'; randomPick?: boolean }) => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onSetLang?: (lang: Language) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onOpenCommDrawer?: (conversationId?: string) => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
  onOpenAuth?: () => void;
  onOpenCommandPalette?: () => void;
  onReplayIntro?: () => void;
}

let registeredHandlers: AgentClientHandlers = {};
let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

export function registerAgentClientHandlers(handlers: AgentClientHandlers) {
  registeredHandlers = handlers;
}

export function dispatchAgentClientActions(actions: Array<Record<string, unknown>>) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  for (const act of actions) {
    const type = String(act?.type || '');
    switch (type) {
      case 'navigate_tab':
        if (typeof act.tab === 'string') registeredHandlers.onNavigateTab?.(act.tab);
        break;
      case 'open_book_by_id':
        if (typeof act.bookId === 'string') registeredHandlers.onOpenBookById?.(act.bookId);
        else if (typeof act.query === 'string') registeredHandlers.onOpenBookAction?.({ query: act.query });
        break;
      case 'open_book':
        registeredHandlers.onOpenBookAction?.({ query: typeof act.query === 'string' ? act.query : '' });
        break;
      case 'open_language_lesson':
        registeredHandlers.onOpenLanguageLesson?.({
          seq: Date.now(),
          language: act.language === 'en' ? 'en' : 'ar',
          tab: (typeof act.tab === 'string' ? act.tab : 'alphabet') as LearningAgentAction['tab'],
        });
        break;
      case 'browser_search':
        if (typeof act.query === 'string') registeredHandlers.onBrowserSearchAction?.(act.query);
        break;
      case 'play_music':
        registeredHandlers.onPlayMusicAction?.({
          query: typeof act.query === 'string' ? act.query : undefined,
          crawl: Boolean(act.crawl),
          control: typeof act.control === 'string' ? act.control : undefined,
        });
        break;
      case 'watch_documentary':
        registeredHandlers.onWatchDocumentaryAction?.({
          query: typeof act.query === 'string' ? act.query : '宇宙 纪录片',
          platform: act.platform === 'bilibili' || act.platform === 'youtube' ? act.platform : 'all',
          randomPick: true,
        });
        break;
      case 'set_theme':
        if (act.theme === 'dark' || act.theme === 'light') registeredHandlers.onSetTheme?.(act.theme);
        break;
      case 'set_language':
        if (typeof act.lang === 'string') registeredHandlers.onSetLang?.(act.lang as Language);
        break;
      case 'fly_to':
        if (typeof act.lat === 'number' && typeof act.lng === 'number') registeredHandlers.onFlyTo?.(act.lat, act.lng);
        break;
      case 'open_comm_drawer':
      case 'open_messages':
        registeredHandlers.onOpenCommDrawer?.(typeof act.conversationId === 'string' ? act.conversationId : undefined);
        break;
      case 'quick_call':
        registeredHandlers.onQuickCall?.(act.kind === 'video' ? 'video' : 'audio', {
          conversationId: typeof act.conversationId === 'string' ? act.conversationId : undefined,
          targetUserId: typeof act.targetUserId === 'string' ? act.targetUserId : undefined,
        });
        break;
      case 'open_auth':
        registeredHandlers.onOpenAuth?.();
        break;
      case 'environment_control':
        uiStateManager.issueEnvironmentCommand({
          weatherPreset: typeof act.weatherPreset === 'string' ? (act.weatherPreset as WeatherKind) : undefined,
          timePreset: typeof act.timePreset === 'string' ? (act.timePreset as TimePreset) : undefined,
          realtimeSync: typeof act.realtimeSync === 'boolean' ? act.realtimeSync : undefined,
        });
        break;
      default:
        break;
    }
  }
}

let spiritAudioSeq = 0;
let activeSpiritAudio: HTMLAudioElement | null = null;
let activeSpiritObjectUrl: string | null = null;

export function stopSpiritSpeech() {
  spiritAudioSeq += 1;
  if (activeSpiritAudio) {
    try {
      activeSpiritAudio.pause();
      activeSpiritAudio.src = '';
    } catch {
      // ignore
    }
    activeSpiritAudio = null;
  }
  if (activeSpiritObjectUrl) {
    try {
      URL.revokeObjectURL(activeSpiritObjectUrl);
    } catch {
      // ignore
    }
    activeSpiritObjectUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function mapEmotionForTtsApi(e: VoiceEmotion): string {
  if (e === 'cheerful') return 'happy';
  if (e === 'affectionate') return 'affectionate';
  return e;
}

function normalizeVoiceEmotion(raw?: string | null): VoiceEmotion | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === 'happy') return 'cheerful';
  if (s === 'concerned') return 'empathetic';
  if (
    s === 'cheerful' ||
    s === 'affectionate' ||
    s === 'empathetic' ||
    s === 'playful' ||
    s === 'excited' ||
    s === 'curious' ||
    s === 'calm'
  ) {
    return s;
  }
  return null;
}

export async function speakSpiritReply(
  text: string,
  lang: Language,
  opts?: { emotion?: string | null; userPrompt?: string; voiceName?: string }
) {
  if (typeof window === 'undefined') return;
  const extracted = extractEmotionTag(text);
  const clean = extracted.text.replace(/[*_`#>]/g, '').trim();
  if (!clean) return;

  stopSpiritSpeech();
  const mySeq = spiritAudioSeq;

  const explicitEmo = normalizeVoiceEmotion(opts?.emotion) || extracted.emotion;
  const analysis = analyzeDialogueEmotion(opts?.userPrompt || '', clean, explicitEmo);
  uiStateManager.setEmotion(analysis.emotion);

  const selectedVoice = opts?.voiceName || uiStateManager.getSnapshot().voiceName || 'Zephyr';

  const playAudioAndWait = (audio: HTMLAudioElement, objectUrl?: string): Promise<boolean> =>
    new Promise((resolve) => {
      if (mySeq !== spiritAudioSeq) {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
        }
        resolve(false);
        return;
      }
      activeSpiritAudio = audio;
      activeSpiritObjectUrl = objectUrl || null;
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (activeSpiritAudio === audio) activeSpiritAudio = null;
        if (objectUrl && activeSpiritObjectUrl === objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
          activeSpiritObjectUrl = null;
        }
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().catch(() => done(false));
    });

  // 1. Primary expressive Gemini human TTS (POST /api/ai/tts)
  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean.slice(0, 560),
        emotion: mapEmotionForTtsApi(analysis.emotion),
        voiceName: selectedVoice,
      }),
    });
    if (mySeq !== spiritAudioSeq) return;
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.success && data.audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        const played = await playAudioAndWait(audio);
        if (played) return;
      }
    }
  } catch {
    // fall through to expressive multi-phrase server TTS
  }

  if (mySeq !== spiritAudioSeq) return;

  // 2. Expressive multi-phrase server TTS (GET /api/ai/tts) with emotion-matched pacing & pitch
  const ttsLang = lang === 'en' ? 'en' : 'zh';
  const phrases = buildExpressivePhrases(clean, analysis, 'audio');
  const phraseList =
    phrases.length > 0
      ? phrases
      : [
          {
            text: clean.slice(0, 220),
            emotion: analysis.emotion,
            pitch: analysis.basePitch,
            rate: analysis.baseRate,
            baiduSpd: analysis.baiduSpd,
            audioPlaybackRate: analysis.audioPlaybackRate,
            pauseAfterMs: 25,
          },
        ];

  for (let i = 0; i < phraseList.length; i++) {
    if (mySeq !== spiritAudioSeq) return;
    const p = phraseList[i];
    let phrasePlayed = false;

    try {
      const getRes = await fetch(
        `/api/ai/tts?text=${encodeURIComponent(p.text)}&lang=${ttsLang}&spd=${p.baiduSpd}`
      );
      if (mySeq !== spiritAudioSeq) return;
      if (getRes.ok) {
        const blob = await getRes.blob();
        if (blob.size > 200) {
          const objectUrl = URL.createObjectURL(blob);
          const audio = new Audio(objectUrl);
          audio.playbackRate = p.audioPlaybackRate;
          phrasePlayed = await playAudioAndWait(audio, objectUrl);
        }
      }
    } catch {
      phrasePlayed = false;
    }

    if (mySeq !== spiritAudioSeq) return;

    // 3. Last-resort local SpeechSynthesis fallback (tuned to emotion rate & pitch)
    if (!phrasePlayed && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-SA' : 'zh-CN';
          u.rate = p.rate;
          u.pitch = p.pitch;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        } catch {
          resolve();
        }
      });
    }

    if (mySeq !== spiritAudioSeq) return;
    if (i < phraseList.length - 1 && p.pauseAfterMs > 0) {
      await new Promise((r) => setTimeout(r, p.pauseAfterMs));
    }
  }
}

export async function submitSpiritCommand(
  prompt: string,
  opts: { lang: Language; attachments?: Array<{ type: 'image_url'; imageUrl: string }>; speakReply?: boolean }
): Promise<AgentTaskView> {
  const cleanPrompt = prompt.trim();
  const snap = uiStateManager.getSnapshot();
  const prevTask = snap.activeTask;

  stopSpiritSpeech();

  uiStateManager.setSpiritState('woken_approaching');
  uiStateManager.setPavilionHudOpen(true);
  uiStateManager.setPendingConfirmation(null);
  if (cleanPrompt) {
    uiStateManager.appendChatMessage('user', cleanPrompt);
  }

  const runningView: AgentTaskView = {
    sessionId: prevTask?.sessionId,
    prompt: cleanPrompt,
    module: 'assistant',
    status: 'running',
    steps: [
      {
        id: 'client_send',
        label: opts.lang === 'zh' ? `${snap.aiName} 正在思考与调度...` : `${snap.aiName} is thinking...`,
        status: 'running',
      },
    ],
  };
  uiStateManager.setTask(runningView);

  try {
    const res = await fetch('/api/one-ai/agent/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: cleanPrompt,
        lang: opts.lang,
        aiName: snap.aiName,
        history: conversationHistory.slice(-12),
        attachments: opts.attachments,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok && !data?.reply) {
      const errMsg = data?.reply || data?.error || '请求未成功完成，请稍后重试。';
      uiStateManager.appendChatMessage('assistant', errMsg);
      const failView: AgentTaskView = {
        sessionId: data?.sessionId,
        prompt: cleanPrompt,
        module: data?.module || 'assistant',
        status: 'failed',
        error: data?.error || `HTTP ${res.status}`,
        reply: errMsg,
        steps: Array.isArray(data?.steps) ? data.steps : runningView.steps,
      };
      uiStateManager.setTask(failView);
      uiStateManager.setSpiritState('presenting_result');
      return failView;
    }

    const rawReplyText = String(data.reply || '').trim();
    const parsedReply = extractEmotionTag(rawReplyText);
    const replyText = parsedReply.text || rawReplyText;
    const replyEmotion = normalizeVoiceEmotion(data?.emotion) || parsedReply.emotion;
    const analyzed = analyzeDialogueEmotion(cleanPrompt, replyText, replyEmotion);
    uiStateManager.setEmotion(analyzed.emotion);

    if (cleanPrompt && replyText) {
      conversationHistory = [
        ...conversationHistory.slice(-16),
        { role: 'user', content: cleanPrompt },
        { role: 'assistant', content: replyText },
      ];
    }
    if (replyText) {
      uiStateManager.appendChatMessage('assistant', replyText);
      if (opts.speakReply || uiStateManager.getSnapshot().voiceReplyEnabled) {
        void speakSpiritReply(replyText, opts.lang, {
          emotion: analyzed.emotion,
          userPrompt: cleanPrompt,
        });
      }
    }

    if (data.needsConfirmation) {
      uiStateManager.setPendingConfirmation(data.needsConfirmation);
      uiStateManager.setSpiritState('working_in_pavilion');
      const gateView: AgentTaskView = {
        sessionId: data.sessionId,
        prompt: cleanPrompt,
        module: data.module || 'communication',
        status: 'awaiting_confirmation',
        reply: replyText,
        steps: Array.isArray(data.steps) ? data.steps : [],
        clientActions: [],
      };
      uiStateManager.setTask(gateView);
      return gateView;
    }

    const doneView: AgentTaskView = {
      sessionId: data.sessionId,
      prompt: cleanPrompt,
      module: data.module || 'assistant',
      status: 'completed',
      reply: replyText,
      steps: Array.isArray(data.steps) ? data.steps : [],
      clientActions: Array.isArray(data.clientActions) ? data.clientActions : [],
      resultData: data.resultData || undefined,
    };

    uiStateManager.setTask(doneView);
    uiStateManager.setPausedTask(null);
    uiStateManager.setSpiritState('presenting_result');

    if (Array.isArray(data.clientActions) && data.clientActions.length > 0) {
      dispatchAgentClientActions(data.clientActions);
    }

    return doneView;
  } catch (err: any) {
    const errText = opts.lang === 'zh' ? '网络连接异常，未能送达 AI 中枢。' : 'Network error reaching ONE AI.';
    uiStateManager.appendChatMessage('assistant', errText);
    const errView: AgentTaskView = {
      prompt: cleanPrompt,
      module: 'assistant',
      status: 'failed',
      error: err?.message || 'Network error',
      reply: errText,
      steps: [],
    };
    uiStateManager.setTask(errView);
    uiStateManager.setSpiritState('idle_explore');
    return errView;
  }
}

export async function respondToAgentConfirmation(
  confirmToken: string,
  decision: 'confirm' | 'cancel',
  editedMessage?: string
) {
  const res = await fetch('/api/one-ai/agent/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmToken, decision, editedMessage }),
  });
  const data = await res.json().catch(() => ({}));
  uiStateManager.setPendingConfirmation(null);

  const prev = uiStateManager.getSnapshot().activeTask;
  const nextTask: AgentTaskView = {
    sessionId: data.sessionId || prev?.sessionId,
    prompt: prev?.prompt || '',
    module: prev?.module || 'communication',
    status: res.ok ? 'completed' : 'failed',
    reply: data.reply || data.error || (res.ok ? '已处理。' : '确认操作失败。'),
    error: res.ok ? undefined : data.error,
    steps: prev?.steps || [],
    clientActions: Array.isArray(data.clientActions) ? data.clientActions : [],
  };
  uiStateManager.setTask(nextTask);
  uiStateManager.setSpiritState('presenting_result');

  if (res.ok && Array.isArray(data.clientActions) && data.clientActions.length > 0) {
    dispatchAgentClientActions(data.clientActions);
  }
  return { ok: res.ok, data };
}

export async function pauseActiveSpiritTask() {
  const snap = uiStateManager.getSnapshot();
  if (!snap.activeTask?.sessionId) return;
  try {
    await fetch('/api/one-ai/agent/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: snap.activeTask.sessionId }),
    });
  } catch {
    // non-fatal
  }
}

export async function resumePausedSpiritTask(lang: Language) {
  const snap = uiStateManager.getSnapshot();
  const paused = snap.pausedTask;
  uiStateManager.setSpiritState('woken_approaching');
  uiStateManager.setPavilionHudOpen(true);

  if (paused?.sessionId) {
    try {
      const res = await fetch('/api/one-ai/agent/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: paused.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.session) {
        const s = data.session;
        const restored: AgentTaskView = {
          sessionId: s.sessionId,
          prompt: paused.prompt || s.intentSummary,
          module: s.module || 'assistant',
          status: 'completed',
          reply:
            paused.reply ||
            (lang === 'zh' ? `已为你恢复刚才的任务：「${s.intentSummary}」。` : `Resumed: "${s.intentSummary}".`),
          steps: Array.isArray(s.steps) ? s.steps : paused.steps,
          clientActions: Array.isArray(s.result?.clientActions) ? s.result.clientActions : paused.clientActions,
          resultData: s.result || paused.resultData,
        };
        uiStateManager.setTask(restored);
        uiStateManager.setPausedTask(null);
        uiStateManager.setSpiritState('presenting_result');
        if (restored.clientActions?.length) {
          dispatchAgentClientActions(restored.clientActions);
        }
        return restored;
      }
    } catch {
      // fall through
    }
  }

  return submitSpiritCommand(lang === 'zh' ? '继续刚才的任务' : 'resume', { lang });
}
