import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  uiStateManager,
  useAgentUiState,
  type GeneratedImagePayload,
  type SpokenRescueCard,
} from '../../agent/uiStateManager.ts';
import {
  generateFreePoolImage,
  speakSpiritReply,
  stopSpiritSpeech,
} from '../../agent/agentClient.ts';
import { triggerImageDownload } from '../paradise/SpiritSpeechBubble.tsx';

type StudyLang = 'en' | 'ar' | 'ja' | 'fr' | 'es' | 'ko';
type StudyLevel = 'beginner' | 'intermediate' | 'advanced';
type StudioTab = 'roleplay' | 'quiz' | 'image_pool';

interface RoleplayMission {
  id: string;
  labelZh: string;
  labelEn: string;
  completed: boolean;
}

interface RoleplayMessage {
  id: string;
  role: 'npc' | 'user';
  text: string;
  translationZh?: string;
  phonetic?: string;
  feedback?: {
    score: number;
    praiseZh: string;
    betterWay: string;
    betterWayZh: string;
    pronunciationTipZh: string;
  };
}

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'fill_blank' | 'listen_choose' | 'speak_aloud';
  prompt: string;
  promptZh: string;
  contextZh: string;
  targetAudioText: string;
  phonetic: string;
  options: string[];
  correctAnswer: string;
  explanationZh: string;
  spokenTipZh: string;
}

interface FreeImagePoolNode {
  id: string;
  labelZh: string;
  configured: boolean;
  quotaNote: string;
  status: 'ready' | 'cooldown' | 'unconfigured';
  cooldownRemainingSec: number;
  successCount: number;
}

const LANGUAGES: Array<{ code: StudyLang; labelZh: string; native: string; speechLocale: string }> = [
  { code: 'en', labelZh: '英语', native: 'English', speechLocale: 'en-US' },
  { code: 'ar', labelZh: '阿拉伯语', native: 'العربية', speechLocale: 'ar-SA' },
  { code: 'ja', labelZh: '日语', native: '日本語', speechLocale: 'ja-JP' },
  { code: 'fr', labelZh: '法语', native: 'Français', speechLocale: 'fr-FR' },
  { code: 'es', labelZh: '西班牙语', native: 'Español', speechLocale: 'es-ES' },
  { code: 'ko', labelZh: '韩语', native: '한국어', speechLocale: 'ko-KR' },
];

const SCENARIOS = [
  { id: 'cafe', titleZh: '精品咖啡馆', subZh: '点单 / 偏好' },
  { id: 'airport', titleZh: '机场与海关', subZh: '值机 / 入境' },
  { id: 'hotel', titleZh: '海景酒店', subZh: '入住 / 礼宾' },
  { id: 'restaurant', titleZh: '纽约餐厅', subZh: '点菜 / 买单' },
  { id: 'interview', titleZh: '外企面试', subZh: '介绍 / 项目' },
  { id: 'shopping', titleZh: '问路购物', subZh: '试穿 / 路线' },
  { id: 'clinic', titleZh: '海外药房', subZh: '症状 / 购药' },
  { id: 'friends', titleZh: '派对交友', subZh: '寒暄 / 兴趣' },
];

const QUIZ_TOPICS = [
  '日常高频口语与实景应答',
  '出国旅游（机场/酒店/问路）',
  '咖啡馆与餐厅点单口语',
  '外企职场与全英文面试',
  '地道母语连读与社交表达',
];

function computeSpokenSimilarity(spoken: string, target: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\u0600-\u06ff\u3040-\u30ff\uac00-\ud7af\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const a = norm(spoken);
  const b = norm(target);
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let hit = 0;
  for (const w of b) {
    if (setA.has(w)) hit += 1;
  }
  return Math.min(100, Math.round((hit / b.length) * 100));
}

interface LiveLanguageStudioProps {
  lang: Language;
  variant?: 'garden-drawer' | 'embedded';
  initialTargetLang?: StudyLang;
  initialMode?: StudioTab;
}

export const LiveLanguageStudio: React.FC<LiveLanguageStudioProps> = ({
  lang,
  variant = 'garden-drawer',
  initialTargetLang = 'en',
  initialMode = 'roleplay',
}) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const isDay = variant === 'embedded' ? true : snap.gardenDaylight > 0.44;

  const [activeTab, setActiveTab] = useState<StudioTab>(initialMode);
  const [targetLang, setTargetLang] = useState<StudyLang>(initialTargetLang);
  const [level, setLevel] = useState<StudyLevel>('intermediate');

  // Roleplay state
  const [scenarioId, setScenarioId] = useState<string>('cafe');
  const [customScenario, setCustomScenario] = useState('');
  const [roleplayTitle, setRoleplayTitle] = useState('');
  const [npcRole, setNpcRole] = useState('');
  const [roleplayMessages, setRoleplayMessages] = useState<RoleplayMessage[]>([]);
  const [missions, setMissions] = useState<RoleplayMission[]>([]);
  const [rescueCards, setRescueCards] = useState<SpokenRescueCard[]>([]);
  const [showRescueBox, setShowRescueBox] = useState(false);
  const [rescueIntentInput, setRescueIntentInput] = useState('');
  const [roleplayInput, setRoleplayInput] = useState('');
  const [roleplayLoading, setRoleplayLoading] = useState(false);
  const [rescueLoading, setRescueLoading] = useState(false);
  const [roleplayError, setRoleplayError] = useState<string | null>(null);
  const [listeningField, setListeningField] = useState<'none' | 'roleplay' | 'quiz_speak'>('none');

  // Quiz state
  const [quizTopic, setQuizTopic] = useState(QUIZ_TOPICS[0]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [spokenAttempt, setSpokenAttempt] = useState('');
  const [spokenScore, setSpokenScore] = useState<number | null>(null);
  const [quizXp, setQuizXp] = useState(0);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Free-Quota Image Pool Studio state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspect, setImageAspect] = useState<'4:3' | '1:1' | '16:9' | '3:4'>('4:3');
  const [imageStyle, setImageStyle] = useState('电影感自然光');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [generatedGallery, setGeneratedGallery] = useState<GeneratedImagePayload[]>([]);
  const [poolNodes, setPoolNodes] = useState<FreeImagePoolNode[]>([]);

  const roleplayScrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const langMeta = useMemo(
    () => LANGUAGES.find((l) => l.code === targetLang) || LANGUAGES[0],
    [targetLang]
  );

  // Sync external launch config (when user says "我要学语言 / 英语实景对话 / 给我出题" to Spirit!)
  useEffect(() => {
    if (variant !== 'garden-drawer') return;
    const cfg = snap.languageStudioConfig;
    if (!cfg) return;
    setTargetLang(cfg.targetLang);
    setActiveTab(cfg.mode);
    if (cfg.scenarioId) setScenarioId(cfg.scenarioId);

    if (cfg.initialRoleplay) {
      const rp = cfg.initialRoleplay;
      setRoleplayTitle(rp.scenarioTitle || '实景口语对话');
      setNpcRole(rp.npcRole || 'Native Partner');
      setMissions(Array.isArray(rp.missions) ? rp.missions : []);
      setRescueCards(Array.isArray(rp.rescueSuggestions) ? rp.rescueSuggestions : []);
      setRoleplayMessages([
        {
          id: `npc_init_${Date.now()}`,
          role: 'npc',
          text: rp.npcLine,
          translationZh: rp.npcTranslationZh,
          phonetic: rp.npcPhonetic,
        },
      ]);
      uiStateManager.setActiveRoleplayContext({
        targetLang: cfg.targetLang,
        scenarioId: rp.scenarioId || cfg.scenarioId || 'cafe',
        scenarioTitle: rp.scenarioTitle || '实景口语对话',
        npcRole: rp.npcRole || 'Native Partner',
        lastNpcLine: rp.npcLine,
        lastNpcTranslationZh: rp.npcTranslationZh,
      });
    } else if (cfg.initialQuiz && Array.isArray(cfg.initialQuiz.questions)) {
      setQuizQuestions(cfg.initialQuiz.questions);
      setQuizTopic(cfg.initialQuiz.topicTitleZh || QUIZ_TOPICS[0]);
      setQuizIndex(0);
      setSelectedOption(null);
      setSpokenAttempt('');
      setSpokenScore(null);
      setQuizFinished(false);
    }
  }, [snap.languageStudioConfig?.seq, variant]);

  // Listen to one-tap "用这句说" from the 3D Spirit's overhead bubble!
  useEffect(() => {
    const onUsePhrase = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail?.text && roleplayMessages.length > 0) {
        void handleSendRoleplayTurn(String(detail.text));
      }
    };
    window.addEventListener('one-language-use-phrase', onUsePhrase);
    return () => window.removeEventListener('one-language-use-phrase', onUsePhrase);
  });

  useEffect(() => {
    if (roleplayScrollRef.current) {
      roleplayScrollRef.current.scrollTop = roleplayScrollRef.current.scrollHeight;
    }
  }, [roleplayMessages.length, roleplayLoading, showRescueBox]);

  useEffect(() => {
    if (activeTab === 'image_pool') {
      fetch('/api/ai/image-pool/status')
        .then((r) => r.json())
        .then((d) => {
          if (d?.success && Array.isArray(d.nodes)) setPoolNodes(d.nodes);
        })
        .catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  if (variant === 'garden-drawer' && (!snap.languageStudioOpen || snap.commDrawerOpen)) {
    return null;
  }

  const syncBubbleFromNpc = (
    line: string,
    translationZh: string,
    phonetic: string,
    title: string,
    rescues: SpokenRescueCard[],
    langCode: StudyLang
  ) => {
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: false,
      badge: `实景口语 · ${title}`,
      text: line,
      translationZh,
      phonetic,
      speakLang: langCode,
      rescueCards: rescues,
      rescueExpanded: false,
      generatedImage: null,
    });
    if (uiStateManager.getSnapshot().voiceReplyEnabled) {
      void speakSpiritReply(line, langCode);
    }
  };

  const handleStartRoleplay = async (overrideScenarioId?: string, overrideLang?: StudyLang) => {
    const useScenario = overrideScenarioId ?? scenarioId;
    const useLang = overrideLang ?? targetLang;
    setRoleplayLoading(true);
    setRoleplayError(null);
    setShowRescueBox(false);
    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: true,
      loadingLabel: '正在布置真实口语场景...',
    });

    try {
      const res = await fetch('/api/learning/language/roleplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLang: useLang,
          scenarioId: customScenario.trim() ? undefined : useScenario,
          customScenario: customScenario.trim() || undefined,
          level,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.session) {
        throw new Error(data?.error || '启动实景对话失败');
      }
      const s = data.session;
      setRoleplayTitle(s.scenarioTitle);
      setNpcRole(s.npcRole);
      setMissions(s.missions || []);
      setRescueCards(s.rescueSuggestions || []);
      setRoleplayMessages([
        {
          id: `npc_${Date.now()}`,
          role: 'npc',
          text: s.npcLine,
          translationZh: s.npcTranslationZh,
          phonetic: s.npcPhonetic,
        },
      ]);
      uiStateManager.setActiveRoleplayContext({
        targetLang: useLang,
        scenarioId: s.scenarioId,
        scenarioTitle: s.scenarioTitle,
        npcRole: s.npcRole,
        lastNpcLine: s.npcLine,
        lastNpcTranslationZh: s.npcTranslationZh,
      });
      syncBubbleFromNpc(s.npcLine, s.npcTranslationZh, s.npcPhonetic, s.scenarioTitle, s.rescueSuggestions || [], useLang);
    } catch (err: any) {
      setRoleplayError(err?.message || '网络异常，请重试');
      uiStateManager.setSpiritBubble({ visible: true, isLoading: false, text: err?.message || '启动场景失败' });
    } finally {
      setRoleplayLoading(false);
    }
  };

  const handleSendRoleplayTurn = async (overrideText?: string) => {
    const text = (overrideText ?? roleplayInput).trim();
    if (!text || roleplayLoading) return;
    if (!overrideText) setRoleplayInput('');

    // Auto-detect if user typed/spoke "我不知道该怎么讲" inside roleplay!
    if (/(?:不知道(?:该)?怎么(?:讲|说|回答)|不会说|帮我说|给我提示|help me say|i don't know how to say)/i.test(text)) {
      void handleRequestCustomRescue(text);
      return;
    }

    const userMsgId = `u_${Date.now()}`;
    const nextHistory = [...roleplayMessages, { id: userMsgId, role: 'user' as const, text }];
    setRoleplayMessages(nextHistory);
    setRoleplayLoading(true);
    setRoleplayError(null);
    setShowRescueBox(false);

    uiStateManager.setSpiritBubble({
      visible: true,
      isLoading: true,
      loadingLabel: `${snap.aiName} 正在听你讲并回复...`,
    });

    try {
      const res = await fetch('/api/learning/language/roleplay/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLang,
          scenarioId,
          scenarioTitle: roleplayTitle || '实景口语对话',
          npcRole: npcRole || 'Native Speaker',
          level,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          userMessage: text,
          missions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.turn) {
        throw new Error(data?.error || '对话回应失败');
      }
      const t = data.turn;
      setMissions(t.missions || missions);
      setRescueCards(t.rescueSuggestions || []);
      setRoleplayMessages((prev) => [
        ...prev.map((m) => (m.id === userMsgId && t.userFeedback ? { ...m, feedback: t.userFeedback } : m)),
        {
          id: `npc_${Date.now()}`,
          role: 'npc',
          text: t.npcLine,
          translationZh: t.npcTranslationZh,
          phonetic: t.npcPhonetic,
        },
      ]);
      uiStateManager.setActiveRoleplayContext({
        targetLang,
        scenarioId,
        scenarioTitle: roleplayTitle || t.scenarioTitle,
        npcRole: npcRole || t.npcRole,
        lastNpcLine: t.npcLine,
        lastNpcTranslationZh: t.npcTranslationZh,
      });
      syncBubbleFromNpc(
        t.npcLine,
        t.npcTranslationZh,
        t.npcPhonetic,
        roleplayTitle || t.scenarioTitle,
        t.rescueSuggestions || [],
        targetLang
      );
    } catch (err: any) {
      setRoleplayError(err?.message || '回复失败，请重试');
      uiStateManager.setSpiritBubble({ visible: true, isLoading: false, text: err?.message || '回复失败' });
    } finally {
      setRoleplayLoading(false);
    }
  };

  const handleRequestCustomRescue = async (customIntent?: string) => {
    const intent = (customIntent ?? rescueIntentInput).trim();
    setShowRescueBox(true);
    // If no custom Chinese intent and we already have precomputed rescue cards, show instantly!
    if (!intent && rescueCards.length > 0) {
      uiStateManager.setSpiritBubble({
        visible: true,
        rescueCards,
        rescueExpanded: true,
      });
      return;
    }

    setRescueLoading(true);
    try {
      const lastNpc = [...roleplayMessages].reverse().find((m) => m.role === 'npc');
      const res = await fetch('/api/learning/language/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLang,
          level,
          situation: roleplayTitle || '实景口语对话',
          lastNpcLine: lastNpc?.text || '',
          userIntentZh: intent || '我不知道该怎么讲，请立刻给我 3 句可以直接开口说的表达',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.rescue?.expressions) {
        setRescueCards(data.rescue.expressions);
        setRescueIntentInput('');
        uiStateManager.setSpiritBubble({
          visible: true,
          isLoading: false,
          badge: '口语急救卡 · 直接照着说',
          text: lastNpc?.text || data.rescue.coachReplyZh,
          translationZh: lastNpc?.translationZh || data.rescue.coachReplyZh,
          speakLang: targetLang,
          rescueCards: data.rescue.expressions,
          rescueExpanded: true,
        });
      }
    } finally {
      setRescueLoading(false);
    }
  };

  const handleIllustrateCurrentScene = async () => {
    const lastNpc = [...roleplayMessages].reverse().find((m) => m.role === 'npc');
    const summary = roleplayMessages
      .slice(-4)
      .map((m) => `${m.role === 'npc' ? npcRole || 'Partner' : 'Me'}: ${m.text}`)
      .join('\n');
    const promptText = `实景口语场景插画：${roleplayTitle || '伦敦咖啡馆'}，${lastNpc?.translationZh || '两人正在自然微笑交谈'}`;
    setImageLoading(true);
    setImageError(null);
    try {
      const img = await generateFreePoolImage(promptText, {
        mode: 'dialogue_scene',
        dialogueContext: summary,
        aspectRatio: '4:3',
        style: '温暖电影感插画',
      });
      setGeneratedGallery((prev) => [img, ...prev].slice(0, 12));
    } catch (err: any) {
      setImageError(err?.message || '配图生成失败');
    } finally {
      setImageLoading(false);
    }
  };

  const handleGenerateQuizPack = async (overrideTopic?: string) => {
    const topicToUse = (overrideTopic ?? quizTopic).trim() || QUIZ_TOPICS[0];
    setQuizTopic(topicToUse);
    setQuizLoading(true);
    setQuizError(null);
    setQuizFinished(false);
    setSelectedOption(null);
    setSpokenAttempt('');
    setSpokenScore(null);

    try {
      const res = await fetch('/api/learning/language/quiz-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLang,
          level,
          topic: topicToUse,
          count: 6,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !Array.isArray(data.questions)) {
        throw new Error(data?.error || '出题失败，请重试');
      }
      setQuizQuestions(data.questions);
      setQuizIndex(0);
      setQuizCorrectCount(0);
      const q0 = data.questions[0];
      if (q0) {
        uiStateManager.setSpiritBubble({
          visible: true,
          isLoading: false,
          badge: `闯关刷题 · 第 1/${data.questions.length} 题`,
          text: q0.type === 'listen_choose' ? '请先听我读一遍，然后选出最贴切的答案！' : q0.prompt,
          translationZh: q0.promptZh,
          phonetic: q0.phonetic,
          speakLang: targetLang,
          rescueCards: undefined,
          generatedImage: null,
        });
        if (q0.targetAudioText && uiStateManager.getSnapshot().voiceReplyEnabled) {
          void speakSpiritReply(q0.targetAudioText, targetLang);
        }
      }
    } catch (err: any) {
      setQuizError(err?.message || '生成题目失败');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleGenerateStudioImage = async (mode: 'standalone' | 'dialogue_scene' = 'standalone') => {
    const promptText =
      mode === 'dialogue_scene' && !imagePrompt.trim()
        ? `把当前对话场景画成精美插画：${roleplayTitle || snap.chatMessages.slice(-2).map((m) => m.content).join(' ')}`
        : imagePrompt.trim();
    if (!promptText || imageLoading) return;
    setImageLoading(true);
    setImageError(null);
    try {
      const dialogueCtx =
        mode === 'dialogue_scene'
          ? (roleplayMessages.length > 0
              ? roleplayMessages.slice(-4).map((m) => `${m.role}: ${m.text}`).join('\n')
              : snap.chatMessages.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n'))
          : undefined;
      const img = await generateFreePoolImage(promptText, {
        mode,
        dialogueContext: dialogueCtx,
        aspectRatio: imageAspect,
        style: imageStyle,
      });
      setGeneratedGallery((prev) => [img, ...prev].slice(0, 12));
      fetch('/api/ai/image-pool/status')
        .then((r) => r.json())
        .then((d) => {
          if (d?.success && Array.isArray(d.nodes)) setPoolNodes(d.nodes);
        })
        .catch(() => {});
    } catch (err: any) {
      setImageError(err?.message || '图像生成失败');
    } finally {
      setImageLoading(false);
    }
  };

  const toggleSpeechCapture = (target: 'roleplay' | 'quiz_speak') => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setRoleplayError('当前浏览器不支持麦克风识别，可直接打字练习。');
      return;
    }
    if (listeningField !== 'none') {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setListeningField('none');
      return;
    }
    stopSpiritSpeech();
    const rec = new SpeechRec();
    recognitionRef.current = rec;
    rec.lang = langMeta.speechLocale;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalStr = '';
    rec.onstart = () => setListeningField(target);
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalStr += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      const combined = (finalStr || interim).trim();
      if (target === 'roleplay') setRoleplayInput(combined);
      else setSpokenAttempt(combined);
    };
    rec.onerror = () => setListeningField('none');
    rec.onend = () => {
      setListeningField('none');
      const cleaned = finalStr.trim();
      if (!cleaned) return;
      if (target === 'roleplay') {
        void handleSendRoleplayTurn(cleaned);
      } else {
        const curQ = quizQuestions[quizIndex];
        if (curQ) {
          const score = computeSpokenSimilarity(cleaned, curQ.correctAnswer || curQ.targetAudioText);
          setSpokenAttempt(cleaned);
          setSpokenScore(score);
          if (score >= 60) {
            setQuizXp((x) => x + 20);
            setQuizCorrectCount((c) => c + 1);
          }
        }
      }
    };
    try {
      rec.start();
    } catch {
      setListeningField('none');
    }
  };

  const currentQuestion = quizQuestions[quizIndex] || null;
  const isAnswered = Boolean(selectedOption !== null || spokenScore !== null);

  const handleSelectQuizOption = (opt: string) => {
    if (!currentQuestion || isAnswered) return;
    setSelectedOption(opt);
    const ok = opt.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
    if (ok) {
      setQuizXp((x) => x + 15);
      setQuizCorrectCount((c) => c + 1);
    }
  };

  const handleNextQuestion = () => {
    if (quizIndex + 1 >= quizQuestions.length) {
      setQuizFinished(true);
      uiStateManager.setSpiritBubble({
        visible: true,
        badge: '本组闯关完成',
        text: `太棒了！本组答对 ${quizCorrectCount}/${quizQuestions.length} 题，累计 +${quizXp} XP！要不要趁热来一段实景口语对话？`,
        translationZh: undefined,
      });
      return;
    }
    const nextIdx = quizIndex + 1;
    setQuizIndex(nextIdx);
    setSelectedOption(null);
    setSpokenAttempt('');
    setSpokenScore(null);
    const nextQ = quizQuestions[nextIdx];
    if (nextQ) {
      uiStateManager.setSpiritBubble({
        visible: true,
        badge: `闯关刷题 · 第 ${nextIdx + 1}/${quizQuestions.length} 题`,
        text: nextQ.type === 'listen_choose' ? '仔细听我朗读，选出最准确的意思！' : nextQ.prompt,
        translationZh: nextQ.promptZh,
        phonetic: nextQ.phonetic,
        speakLang: targetLang,
      });
      if (nextQ.targetAudioText && uiStateManager.getSnapshot().voiceReplyEnabled) {
        void speakSpiritReply(nextQ.targetAudioText, targetLang);
      }
    }
  };

  const shellCls =
    variant === 'embedded'
      ? 'w-full rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
      : isDay
        ? 'border-[#d7cebd] bg-[#faf7f0]/95 text-[#1e2c25] shadow-[0_18px_48px_rgba(20,34,26,0.22)]'
        : 'border-white/15 bg-[#121b28]/94 text-[#f4f0e8] shadow-[0_20px_54px_rgba(2,6,14,0.58)]';

  const cardCls =
    variant === 'embedded'
      ? 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/60'
      : isDay
        ? 'border-black/10 bg-white/85'
        : 'border-white/12 bg-white/[0.06]';

  const pillCls =
    variant === 'embedded'
      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
      : isDay
        ? 'bg-black/[0.06] text-[#24362d] hover:bg-black/[0.12]'
        : 'bg-white/[0.08] text-[#ece6da] hover:bg-white/[0.15]';

  const activePillCls =
    variant === 'embedded'
      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
      : isDay
        ? 'bg-[#24382f] text-[#f7f4ec]'
        : 'bg-[#e9e1d0] text-[#141e2b]';

  const wrapperClass =
    variant === 'garden-drawer'
      ? `pointer-events-auto fixed right-3 top-[calc(3.85rem+env(safe-area-inset-top))] bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex w-[min(94vw,430px)] flex-col overflow-hidden rounded-2xl border ${shellCls}`
      : `flex flex-col overflow-hidden ${shellCls}`;

  return (
    <section className={wrapperClass} data-testid="live-language-studio">
      {/* Top Studio Header */}
      <div className={`flex items-center justify-between gap-2 border-b px-3.5 py-2.5 ${isDay ? 'border-black/10' : 'border-white/12'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/assets/spirit/one-butterfly-avatar.jpg"
            alt={snap.aiName}
            referrerPolicy="no-referrer"
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/20"
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">
              {isZh ? 'AI 实景口语 · 智能出题 · ONE 画室' : 'Live Language & ONE Art Studio'}
            </h3>
          </div>
        </div>
        {variant === 'garden-drawer' && (
          <button
            type="button"
            onClick={() => uiStateManager.closeLanguageStudio()}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer ${pillCls}`}
            title={isZh ? '收起教室' : 'Close Studio'}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className={`grid grid-cols-3 gap-1 border-b p-2 ${isDay ? 'border-black/8' : 'border-white/10'}`}>
        <button
          type="button"
          onClick={() => setActiveTab('roleplay')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'roleplay' ? activePillCls : pillCls
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{isZh ? '实景口语' : 'Roleplay'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('quiz')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'quiz' ? activePillCls : pillCls
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>{isZh ? '智能出题' : 'Quiz Deck'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('image_pool')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'image_pool' ? activePillCls : pillCls
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span>{isZh ? 'AI 绘图' : 'Art Studio'}</span>
        </button>
      </div>

      {/* Language & Difficulty Bar (shown for Roleplay & Quiz) */}
      {activeTab !== 'image_pool' && (
        <div className={`flex flex-wrap items-center justify-between gap-1.5 border-b px-3 py-2 ${isDay ? 'border-black/8' : 'border-white/10'}`}>
          <div className="flex flex-wrap items-center gap-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setTargetLang(l.code)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                  targetLang === l.code ? activePillCls : pillCls
                }`}
              >
                {l.labelZh}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'beginner', zh: '入门' },
                { id: 'intermediate', zh: '进阶' },
                { id: 'advanced', zh: '母语' },
              ] as const
            ).map((lv) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => setLevel(lv.id)}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-pointer ${
                  level === lv.id ? activePillCls : pillCls
                }`}
              >
                {lv.zh}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TAB 1: REAL-WORLD SPOKEN ROLEPLAY ==================== */}
      {activeTab === 'roleplay' && (
        <div className="flex flex-1 min-h-0 flex-col">
          {/* Scenario Picker Strip */}
          <div className={`border-b px-3 py-2 ${isDay ? 'border-black/8' : 'border-white/10'}`}>
            <div className="grid grid-cols-4 gap-1">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setScenarioId(sc.id);
                    setCustomScenario('');
                    void handleStartRoleplay(sc.id);
                  }}
                  className={`rounded-lg px-1.5 py-1.5 text-left transition-colors cursor-pointer ${
                    scenarioId === sc.id && !customScenario ? activePillCls : pillCls
                  }`}
                >
                  <div className="text-[11px] font-semibold truncate">{sc.titleZh}</div>
                  <div className="text-[9px] opacity-70 truncate">{sc.subZh}</div>
                </button>
              ))}
            </div>

            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={customScenario}
                onChange={(e) => setCustomScenario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customScenario.trim()) void handleStartRoleplay();
                }}
                placeholder={isZh ? '或输入自定义场景（如：伦敦租房砍价）...' : 'Custom scene...'}
                className={`h-7 flex-1 rounded-lg border px-2 text-xs outline-none ${cardCls}`}
              />
              <button
                type="button"
                disabled={roleplayLoading}
                onClick={() => void handleStartRoleplay()}
                className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium cursor-pointer ${activePillCls}`}
              >
                {roleplayLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span>{roleplayMessages.length > 0 ? '换场景' : '开始对话'}</span>
              </button>
            </div>
          </div>

          {/* Active Missions Bar */}
          {missions.length > 0 && (
            <div className={`flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5 text-[10px] ${isDay ? 'border-black/8' : 'border-white/10'}`}>
              {missions.map((m) => (
                <span
                  key={m.id}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                    m.completed
                      ? 'bg-emerald-600/18 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'opacity-70'
                  }`}
                >
                  {m.completed ? <CheckCircle2 className="h-3 w-3" /> : <Check className="h-2.5 w-2.5 opacity-40" />}
                  <span>{m.labelZh}</span>
                </span>
              ))}
            </div>
          )}

          {/* Dialogue Transcript */}
          <div ref={roleplayScrollRef} className="flex-1 min-h-[200px] overflow-y-auto p-3 space-y-2.5">
            {roleplayMessages.length === 0 ? (
              <div className={`rounded-xl border p-4 text-center text-xs space-y-2 ${cardCls}`}>
                <p className="font-semibold text-sm">
                  {langMeta.labelZh}（{langMeta.native}）实景口语对话
                </p>
                <p className="opacity-75 leading-relaxed">
                  点上方任意真实场景，{snap.aiName} 会在 3D 花园头顶实时弹出字幕并开口与你对话。卡壳时随时点「我不知道怎么讲」，立刻给你 3 个地道回答！
                </p>
                <button
                  type="button"
                  onClick={() => void handleStartRoleplay('cafe')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer ${activePillCls}`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>立即进入「伦敦精品咖啡馆」开口练</span>
                </button>
              </div>
            ) : (
              roleplayMessages.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'pl-6' : 'pr-3'}>
                  <div
                    className={`rounded-xl border p-2.5 text-xs ${
                      m.role === 'user'
                        ? isDay
                          ? 'border-[#24382f]/15 bg-[#24382f]/10'
                          : 'border-white/15 bg-white/12'
                        : cardCls
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium leading-relaxed">{m.text}</div>
                      {m.role === 'npc' && (
                        <button
                          type="button"
                          onClick={() => void speakSpiritReply(m.text, targetLang)}
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md cursor-pointer ${pillCls}`}
                          title="朗读这句"
                        >
                          <Volume2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {m.translationZh && (
                      <div className="mt-1 text-[11px] opacity-75">{m.translationZh}</div>
                    )}
                    {m.phonetic && (
                      <div className="mt-0.5 font-mono text-[10px] opacity-55">{m.phonetic}</div>
                    )}
                  </div>

                  {/* Gentle Coaching Feedback on User's Spoken Turn */}
                  {m.feedback && (
                    <div className={`mt-1 rounded-lg border px-2.5 py-1.5 text-[11px] ${cardCls}`}>
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span>口语点评 · {m.feedback.score} 分</span>
                        <span className="opacity-75 font-normal truncate">{m.feedback.praiseZh}</span>
                      </div>
                      {m.feedback.betterWay && (
                        <div className="mt-1 flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <span className="opacity-65">更地道说法：</span>
                            <span className="font-medium">{m.feedback.betterWay}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void speakSpiritReply(m.feedback!.betterWay, targetLang)}
                            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer ${pillCls}`}
                          >
                            <Volume2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {m.feedback.pronunciationTipZh && (
                        <div className="mt-0.5 text-[10px] opacity-70">发音小贴士：{m.feedback.pronunciationTipZh}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {roleplayLoading && (
              <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${cardCls}`}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{snap.aiName} 正在自然回应...</span>
              </div>
            )}

            {roleplayError && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                {roleplayError}
              </div>
            )}

            {/* Instant "我不知道怎么讲" Rescue Drawer Inside Roleplay */}
            {showRescueBox && (
              <div className={`rounded-xl border p-2.5 space-y-2 ${cardCls}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">🆘 口语急救：直接照着说或输入你想表达的中文</span>
                  <button
                    type="button"
                    onClick={() => setShowRescueBox(false)}
                    className="opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={rescueIntentInput}
                    onChange={(e) => setRescueIntentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRequestCustomRescue();
                    }}
                    placeholder="例：我想说「要一杯少冰燕麦拿铁」..."
                    className={`h-7 flex-1 rounded-lg border px-2 text-xs outline-none ${cardCls}`}
                  />
                  <button
                    type="button"
                    disabled={rescueLoading}
                    onClick={() => void handleRequestCustomRescue()}
                    className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium cursor-pointer ${activePillCls}`}
                  >
                    {rescueLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    <span>帮我翻译成口语</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {rescueCards.map((c, idx) => (
                    <div key={idx} className={`rounded-lg border p-2 text-xs ${cardCls}`}>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-semibold opacity-80">{c.labelZh}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void speakSpiritReply(c.targetText, targetLang)}
                            className={`inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] cursor-pointer ${pillCls}`}
                          >
                            <Volume2 className="h-3 w-3" />
                            <span>听</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSendRoleplayTurn(c.targetText)}
                            className={`inline-flex h-6 items-center gap-0.5 rounded px-2 text-[10px] font-medium cursor-pointer ${activePillCls}`}
                          >
                            <Send className="h-2.5 w-2.5" />
                            <span>用这句回答</span>
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 font-medium">{c.targetText}</div>
                      <div className="text-[11px] opacity-75">{c.translationZh}</div>
                      {c.phonetic && <div className="font-mono text-[10px] opacity-55">{c.phonetic}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls: Instant Rescue + Scene Illustration + Mic + Text Input */}
          <div className={`border-t p-2.5 space-y-2 ${isDay ? 'border-black/10' : 'border-white/12'}`}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleRequestCustomRescue()}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${activePillCls}`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>我不知道怎么讲 · 马上帮我说</span>
              </button>
              <button
                type="button"
                disabled={imageLoading || roleplayMessages.length === 0}
                onClick={() => void handleIllustrateCurrentScene()}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium cursor-pointer disabled:opacity-40 ${pillCls}`}
                title="把当前实景对话立刻画成配图"
              >
                {imageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                <span>对话配图</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendRoleplayTurn();
              }}
              className="flex items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => toggleSpeechCapture('roleplay')}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full cursor-pointer transition-colors ${
                  listeningField === 'roleplay' ? 'bg-rose-600 text-white' : activePillCls
                }`}
                title={`按住/点击开口说${langMeta.labelZh}`}
              >
                {listeningField === 'roleplay' ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <input
                type="text"
                value={roleplayInput}
                onChange={(e) => setRoleplayInput(e.target.value)}
                placeholder={
                  listeningField === 'roleplay'
                    ? `正在识别你的${langMeta.labelZh}口语...`
                    : `开口说或输入${langMeta.labelZh}（不会讲直接打「我不知道怎么讲」）...`
                }
                className={`h-8 flex-1 min-w-0 rounded-full border px-3 text-xs outline-none ${cardCls}`}
              />
              <button
                type="submit"
                disabled={!roleplayInput.trim() || roleplayLoading}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full cursor-pointer disabled:opacity-40 ${activePillCls}`}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: MULTI-QUESTION INTERACTIVE QUIZ DECK ==================== */}
      {activeTab === 'quiz' && (
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3 space-y-3">
          {/* Topic Selector & Generate Button */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {QUIZ_TOPICS.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => void handleGenerateQuizPack(tp)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium cursor-pointer ${
                    quizTopic === tp ? activePillCls : pillCls
                  }`}
                >
                  {tp}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 opacity-80">
                <Award className="h-3.5 w-3.5" />
                <span>XP: {quizXp}</span>
                {quizQuestions.length > 0 && (
                  <span>
                    · 进度 {Math.min(quizIndex + 1, quizQuestions.length)}/{quizQuestions.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={quizLoading}
                onClick={() => void handleGenerateQuizPack()}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${activePillCls}`}
              >
                {quizLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span>{quizQuestions.length > 0 ? '再出一组新题' : '立即生成 6 道互动题'}</span>
              </button>
            </div>
          </div>

          {quizError && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              {quizError}
            </div>
          )}

          {quizLoading ? (
            <div className={`flex flex-col items-center justify-center rounded-xl border p-8 text-xs gap-2 ${cardCls}`}>
              <Loader2 className="h-5 w-5 animate-spin opacity-80" />
              <span>正在为你定制 {langMeta.labelZh} 互动题库（含情景选择、填空、听力与跟读）...</span>
            </div>
          ) : quizQuestions.length === 0 ? (
            <div className={`rounded-xl border p-5 text-center text-xs space-y-2.5 ${cardCls}`}>
              <p className="font-semibold text-sm">{langMeta.labelZh} 多题型实战题库</p>
              <p className="opacity-75 leading-relaxed">
                每次实时生成 6 道实用题目，涵盖情景选择、口语填空、真人发音听力与开口跟读评分。
              </p>
              <button
                type="button"
                onClick={() => void handleGenerateQuizPack()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer ${activePillCls}`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>开始出题练习</span>
              </button>
            </div>
          ) : quizFinished ? (
            <div className={`rounded-xl border p-5 text-center space-y-3 ${cardCls}`}>
              <Award className="mx-auto h-8 w-8 opacity-85" />
              <div className="text-base font-bold">本组闯关完成！</div>
              <div className="text-xs opacity-80">
                答对 {quizCorrectCount} / {quizQuestions.length} 题 · 累计获得 {quizXp} XP
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateQuizPack()}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer ${activePillCls}`}
                >
                  再来一组新题
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('roleplay');
                    if (roleplayMessages.length === 0) void handleStartRoleplay('cafe');
                  }}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer ${pillCls}`}
                >
                  去练实景口语
                </button>
              </div>
            </div>
          ) : currentQuestion ? (
            <div className={`rounded-xl border p-3.5 space-y-3 ${cardCls}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${activePillCls}`}>
                  {currentQuestion.type === 'multiple_choice'
                    ? '情景选择'
                    : currentQuestion.type === 'fill_blank'
                      ? '口语填空'
                      : currentQuestion.type === 'listen_choose'
                        ? '听力辨意'
                        : '开口跟读挑战'}
                </span>
                {currentQuestion.targetAudioText && (
                  <button
                    type="button"
                    onClick={() => void speakSpiritReply(currentQuestion.targetAudioText, targetLang)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium cursor-pointer ${pillCls}`}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>听示范发音</span>
                  </button>
                )}
              </div>

              {currentQuestion.contextZh && (
                <div className="text-[11px] opacity-70">场景：{currentQuestion.contextZh}</div>
              )}

              <div className="text-sm font-semibold leading-relaxed">
                {currentQuestion.type === 'listen_choose'
                  ? '点击上方「听示范发音」，选出最符合语境的含义或回应：'
                  : currentQuestion.prompt}
              </div>
              {currentQuestion.promptZh && (
                <div className="text-xs opacity-75">{currentQuestion.promptZh}</div>
              )}
              {currentQuestion.phonetic && (
                <div className="font-mono text-[11px] opacity-60">{currentQuestion.phonetic}</div>
              )}

              {/* Speak-Aloud Challenge UI */}
              {currentQuestion.type === 'speak_aloud' ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSpeechCapture('quiz_speak')}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold cursor-pointer ${
                        listeningField === 'quiz_speak' ? 'bg-rose-600 text-white' : activePillCls
                      }`}
                    >
                      {listeningField === 'quiz_speak' ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      <span>{listeningField === 'quiz_speak' ? '正在录音识别中...点击结束' : '点击开口跟读评分'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpokenAttempt(currentQuestion.correctAnswer);
                        setSpokenScore(90);
                      }}
                      className={`rounded-xl px-3 py-2.5 text-xs font-medium cursor-pointer ${pillCls}`}
                    >
                      已跟读
                    </button>
                  </div>
                  {spokenAttempt && (
                    <div className="rounded-lg border border-black/10 p-2 text-xs">
                      <div>识别到：{spokenAttempt}</div>
                      {spokenScore !== null && (
                        <div className="mt-1 font-semibold">
                          匹配度：{spokenScore}% {spokenScore >= 75 ? '· 发音非常棒！' : '· 很不错，可以再听一遍示范跟读'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const isPicked = selectedOption === opt;
                    const isRight = opt.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
                    let optCls = pillCls;
                    if (isAnswered) {
                      if (isRight) optCls = 'bg-emerald-600 text-white';
                      else if (isPicked) optCls = 'bg-rose-600 text-white';
                    }
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isAnswered}
                        onClick={() => handleSelectQuizOption(opt)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium cursor-pointer transition-colors ${optCls}`}
                      >
                        <span>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </span>
                        {isAnswered && isRight && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Explanation & Next */}
              {isAnswered && (
                <div className="space-y-2 border-t border-black/10 pt-2.5 text-xs">
                  <div>
                    <span className="font-semibold">解析：</span>
                    <span className="opacity-85">{currentQuestion.explanationZh}</span>
                  </div>
                  {currentQuestion.spokenTipZh && (
                    <div className="text-[11px] opacity-75">口语秘诀：{currentQuestion.spokenTipZh}</div>
                  )}
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className={`w-full rounded-xl py-2 text-xs font-semibold cursor-pointer ${activePillCls}`}
                  >
                    {quizIndex + 1 >= quizQuestions.length ? '查看本组成绩' : '下一题'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ==================== TAB 3: FREE-QUOTA RECOMPOSED IMAGE & DIALOGUE ART STUDIO ==================== */}
      {activeTab === 'image_pool' && (
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3 space-y-3">
          <div className={`rounded-xl border p-3 space-y-2.5 ${cardCls}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Layers className="h-3.5 w-3.5" />
                <span>ONE 极速视觉画室</span>
              </div>
              <span className="text-[10px] opacity-65">多通道并行加速</span>
            </div>

            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={2}
              placeholder="描述你想生成的画面，例如：雨后的京都庭院里，一只橘猫趴在木廊下看锦鲤..."
              className={`w-full rounded-xl border p-2 text-xs outline-none resize-none ${cardCls}`}
            />

            <div className="flex flex-wrap items-center gap-1">
              {(['4:3', '1:1', '16:9', '3:4'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setImageAspect(r)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-medium cursor-pointer ${
                    imageAspect === r ? activePillCls : pillCls
                  }`}
                >
                  {r}
                </button>
              ))}
              {['电影感自然光', '吉卜力水彩插画', '写实摄影', '东方水墨丹青'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setImageStyle(st)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-medium cursor-pointer ${
                    imageStyle === st ? activePillCls : pillCls
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={imageLoading || !imagePrompt.trim()}
                onClick={() => void handleGenerateStudioImage('standalone')}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold cursor-pointer disabled:opacity-40 ${activePillCls}`}
              >
                {imageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>立即生成图片</span>
              </button>
              <button
                type="button"
                disabled={imageLoading}
                onClick={() => void handleGenerateStudioImage('dialogue_scene')}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium cursor-pointer disabled:opacity-40 ${pillCls}`}
                title="结合刚才的聊天/实景对话生成对话场景配图"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>对话配图</span>
              </button>
            </div>

            {imageError && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                {imageError}
              </div>
            )}
          </div>

          {/* Generated Artworks Gallery */}
          {generatedGallery.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold opacity-80">本次已生成画面（同时展示在精灵头顶）</div>
              <div className="grid grid-cols-1 gap-2.5">
                {generatedGallery.map((img, i) => (
                  <div key={i} className={`overflow-hidden rounded-xl border ${cardCls}`}>
                    <button
                      type="button"
                      onClick={() => uiStateManager.setImageLightbox(img)}
                      className="block w-full cursor-pointer overflow-hidden"
                    >
                      <img src={img.imageUrl} alt={img.captionZh} className="max-h-56 w-full object-cover" />
                    </button>
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px]">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{img.captionZh}</div>
                        <div className="text-[10px] opacity-65 truncate">
                          {img.providerLabelZh} · {img.promptDirectorLabelZh}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => uiStateManager.setImageLightbox(img)}
                          className={`rounded-lg p-1.5 cursor-pointer ${pillCls}`}
                          title="放大预览"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerImageDownload(img)}
                          className={`rounded-lg p-1.5 cursor-pointer ${pillCls}`}
                          title="下载保存"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default LiveLanguageStudio;
