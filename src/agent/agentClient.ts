import type { Language } from '../types/index.ts';
import type { WeatherKind, TimePreset } from '../components/paradise/paradiseEnvironment.ts';
import { uiStateManager, type AgentTaskView } from './uiStateManager.ts';
import {
  analyzeDialogueEmotion,
  buildExpressivePhrases,
  extractEmotionTag,
  type VoiceEmotion,
} from '../utils/emotionEngine.ts';
import {
  playNormalizedArrayBuffer,
  playNormalizedBase64Audio,
  stopSteadyVoice,
  unlockSteadyVoiceAudio,
} from '../utils/steadyVoicePlayer.ts';

export interface LearningAgentAction {
  seq: number;
  language?: 'ar' | 'en';
  tab?: 'alphabet' | 'practice' | 'english' | 'islamic_library' | 'duolingo_platform';
}

export interface AgentClientHandlers {
  onNavigateTab?: (tab: string) => void;
  onOpenBookById?: (bookId: string, opts?: { autoRead?: boolean }) => void;
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
        if (typeof act.bookId === 'string') {
          registeredHandlers.onOpenBookById?.(act.bookId, { autoRead: act.autoRead !== false });
        } else if (typeof act.query === 'string') {
          registeredHandlers.onOpenBookAction?.({ query: act.query });
        }
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
      case 'open_language_studio': {
        const targetLang = (typeof act.targetLang === 'string' ? act.targetLang : 'en') as
          | 'en'
          | 'ar'
          | 'ja'
          | 'fr'
          | 'es'
          | 'ko';
        const mode = act.mode === 'quiz' ? 'quiz' : 'roleplay';
        uiStateManager.openLanguageStudio({
          targetLang,
          mode,
          scenarioId: typeof act.scenarioId === 'string' ? act.scenarioId : undefined,
          initialRoleplay: act.initialRoleplay,
          initialQuiz: act.initialQuiz,
        });
        break;
      }
      case 'show_rescue_cards':
        if (Array.isArray(act.expressions)) {
          uiStateManager.setSpiritBubble({
            visible: true,
            isLoading: false,
            badge: '口语急救卡 · 直接照着说',
            text: typeof act.coachReplyZh === 'string' ? act.coachReplyZh : '直接选一句点击即可朗读或发送：',
            rescueCards: act.expressions as any,
            rescueExpanded: true,
          });
        }
        break;
      case 'show_generated_image':
        if (act.image && typeof act.image === 'object') {
          const img = act.image as any;
          uiStateManager.setSpiritBubble({
            visible: true,
            isLoading: false,
            badge: 'ONE 画室',
            text: img.captionZh || '已为你生成画面',
            generatedImage: img,
            rescueCards: undefined,
            rescueExpanded: false,
          });
        }
        break;
      default:
        break;
    }
  }
}

let spiritAudioSeq = 0;

export function stopSpiritSpeech() {
  spiritAudioSeq += 1;
  stopSteadyVoice();
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

function mapSpeechLocale(langCode?: string): string {
  switch ((langCode || '').toLowerCase()) {
    case 'en':
      return 'en-US';
    case 'ar':
      return 'ar-SA';
    case 'ja':
      return 'ja-JP';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'ko':
      return 'ko-KR';
    default:
      return 'zh-CN';
  }
}

export async function speakSpiritReply(
  text: string,
  lang: Language | string,
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
  if (uiStateManager.getSnapshot().spiritBubble?.visible) {
    uiStateManager.setSpiritBubble({ speaking: true });
  }

  const clearSpeakingIfCurrent = () => {
    if (mySeq === spiritAudioSeq && uiStateManager.getSnapshot().spiritBubble) {
      uiStateManager.setSpiritBubble({ speaking: false });
    }
  };

  const selectedVoice = opts?.voiceName || uiStateManager.getSnapshot().voiceName || 'Zephyr';
  unlockSteadyVoiceAudio();

  // 1. Primary natural human voice via Gemini TTS (POST /api/ai/tts — server + client loudness-locked)
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
        const played = await playNormalizedBase64Audio(
          data.audioBase64,
          data.mimeType || 'audio/wav',
          () => mySeq === spiritAudioSeq
        );
        if (played) {
          clearSpeakingIfCurrent();
          return;
        }
      }
    }
  } catch {
    // fall through to secondary normalized server TTS only if Gemini TTS is unavailable
  }

  if (mySeq !== spiritAudioSeq) return;

  // 2. Fallback server TTS (GET /api/ai/tts) routed through the same steady loudness bus (fixed 1.0x pace)
  const ttsLang = lang === 'en' ? 'en' : lang === 'zh' ? 'zh' : 'en';
  const phrases = buildExpressivePhrases(clean, analysis, 'audio');
  const phraseList =
    phrases.length > 0
      ? phrases
      : [
          {
            text: clean.slice(0, 220),
            emotion: analysis.emotion,
            pitch: 1.0,
            rate: 1.0,
            baiduSpd: 5,
            audioPlaybackRate: 1.0,
            pauseAfterMs: 30,
          },
        ];

  for (let i = 0; i < phraseList.length; i++) {
    if (mySeq !== spiritAudioSeq) return;
    const p = phraseList[i];
    let phrasePlayed = false;

    try {
      const getRes = await fetch(
        `/api/ai/tts?text=${encodeURIComponent(p.text)}&lang=${ttsLang}&spd=5`
      );
      if (mySeq !== spiritAudioSeq) return;
      if (getRes.ok) {
        const ab = await getRes.arrayBuffer();
        if (ab.byteLength > 200) {
          phrasePlayed = await playNormalizedArrayBuffer(
            ab,
            'audio/mpeg',
            () => mySeq === spiritAudioSeq
          );
        }
      }
    } catch {
      phrasePlayed = false;
    }

    if (mySeq !== spiritAudioSeq) return;

    // 3. Last-resort local SpeechSynthesis fallback (steady volume/rate/pitch, never erratic)
    if (!phrasePlayed && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = mapSpeechLocale(lang);
          u.volume = 0.85;
          u.rate = 1.0;
          u.pitch = 1.0;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        } catch {
          resolve();
        }
      });
    }

    if (mySeq !== spiritAudioSeq) return;
    if (i < phraseList.length - 1) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  clearSpeakingIfCurrent();
}

export async function submitSpiritCommand(
  prompt: string,
  opts: { lang: Language; attachments?: Array<{ type: 'image_url'; imageUrl: string }>; speakReply?: boolean }
): Promise<AgentTaskView> {
  const cleanPrompt = prompt.trim();
  const snap = uiStateManager.getSnapshot();
  const prevTask = snap.activeTask;

  stopSpiritSpeech();
  unlockSteadyVoiceAudio();

  const isImageIntent = /(?:生成|画|创作|配图|插画|image|draw|paint)/i.test(cleanPrompt);
  const isRescueIntent = /(?:不知道(?:该)?怎么(?:讲|说)|不会说|帮我说|怎么用.*(?:说|讲)|help me say)/i.test(cleanPrompt);

  uiStateManager.setSpiritState('woken_approaching');
  uiStateManager.setPavilionHudOpen(false);
  uiStateManager.setPendingConfirmation(null);
  if (cleanPrompt) {
    uiStateManager.appendChatMessage('user', cleanPrompt);
  }

  uiStateManager.setSpiritBubble({
    visible: true,
    isLoading: true,
    loadingLabel: isImageIntent
      ? opts.lang === 'zh'
        ? '正在为你极速绘制画面...'
        : 'Generating your artwork...'
      : isRescueIntent
        ? opts.lang === 'zh'
          ? '马上为你准备可直接开口说的表达...'
          : 'Preparing instant spoken rescue...'
        : opts.lang === 'zh'
          ? `${snap.aiName} 正在思考...`
          : `${snap.aiName} is thinking...`,
    text: '',
    translationZh: undefined,
    phonetic: undefined,
    generatedImage: null,
    rescueCards: undefined,
    rescueExpanded: false,
  });

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
        activeRoleplayContext: snap.activeRoleplayContext,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok && !data?.reply) {
      const errMsg = data?.reply || data?.error || '请求未成功完成，请稍后重试。';
      uiStateManager.appendChatMessage('assistant', errMsg);
      uiStateManager.setSpiritBubble({
        visible: true,
        isLoading: false,
        text: errMsg,
      });
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

    const speakTargetLang = typeof data.speakLang === 'string' ? data.speakLang : opts.lang;
    if (replyText || data.generatedImage) {
      uiStateManager.appendChatMessage('assistant', replyText, {
        translationZh: typeof data.translationZh === 'string' ? data.translationZh : undefined,
        phonetic: typeof data.phonetic === 'string' ? data.phonetic : undefined,
        speakLang: speakTargetLang,
        rescueCards: Array.isArray(data.rescueCards) ? data.rescueCards : undefined,
        generatedImage: data.generatedImage || null,
      });

      uiStateManager.setSpiritBubble({
        visible: true,
        isLoading: false,
        badge:
          typeof data.languageBadge === 'string'
            ? data.languageBadge
            : data.generatedImage?.providerLabelZh
              ? data.generatedImage.providerLabelZh
              : Array.isArray(data.rescueCards) && data.rescueCards.length > 0
                ? '口语救急提示'
                : undefined,
        text: replyText,
        translationZh: typeof data.translationZh === 'string' ? data.translationZh : undefined,
        phonetic: typeof data.phonetic === 'string' ? data.phonetic : undefined,
        speakLang: speakTargetLang,
        rescueCards: Array.isArray(data.rescueCards) ? data.rescueCards : undefined,
        rescueExpanded: Boolean(data.module === 'language-studio' && isRescueIntent),
        generatedImage: data.generatedImage || null,
      });

      if (replyText && (opts.speakReply || uiStateManager.getSnapshot().voiceReplyEnabled)) {
        const audioLine = typeof data.targetText === 'string' && data.targetText.trim() && data.speakLang
          ? data.targetText.trim()
          : replyText;
        void speakSpiritReply(audioLine, speakTargetLang, {
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
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      text: errText,
    });
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

export async function requestInstantSpokenRescue(userIntentZh?: string) {
  const snap = uiStateManager.getSnapshot();
  const ctx = snap.activeRoleplayContext;
  const targetLang = ctx?.targetLang || 'en';
  uiStateManager.setSpiritBubble({
    visible: true,
    isLoading: true,
    loadingLabel: '马上为你准备地道开口示范...',
  });
  try {
    const res = await fetch('/api/learning/language/rescue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLang,
        situation: ctx?.scenarioTitle || '日常真实口语对话',
        lastNpcLine: ctx?.lastNpcLine || snap.spiritBubble?.text || '',
        userIntentZh: userIntentZh || '我不知道该怎么讲，请立刻给我可以直接开口说的回答',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.rescue) {
      throw new Error(data?.error || '口语救急提示获取失败');
    }
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      badge: '口语急救卡 · 点一下即可跟读',
      text: ctx?.lastNpcLine || data.rescue.coachReplyZh,
      translationZh: ctx?.lastNpcTranslationZh || data.rescue.coachReplyZh,
      speakLang: targetLang,
      rescueCards: data.rescue.expressions,
      rescueExpanded: true,
    });
    return data.rescue;
  } catch (err: any) {
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      text: err?.message || '口语提示暂时不可用，请重试。',
    });
    return null;
  }
}

export async function generateFreePoolImage(
  prompt: string,
  opts?: {
    mode?: 'standalone' | 'dialogue_scene';
    dialogueContext?: string;
    aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4';
    style?: string;
  }
) {
  uiStateManager.setSpiritBubble({
    visible: true,
    isLoading: true,
    loadingLabel: '正在为你极速绘制画面...',
  });
  const res = await fetch('/api/ai/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      mode: opts?.mode || 'standalone',
      dialogueContext: opts?.dialogueContext,
      aspectRatio: opts?.aspectRatio || '4:3',
      style: opts?.style,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.image) {
    const errMsg = data?.error || '画室当前繁忙，请稍后再试。';
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      text: errMsg,
    });
    throw new Error(errMsg);
  }
  uiStateManager.appendChatMessage('assistant', `已生成画面：「${data.image.captionZh}」`, {
    generatedImage: data.image,
  });
  uiStateManager.setSpiritBubble({
    visible: true,
    isLoading: false,
    badge: 'ONE 画室',
    text: data.image.captionZh,
    generatedImage: data.image,
    rescueExpanded: false,
  });
  return data.image;
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
  uiStateManager.setPavilionHudOpen(false);

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
