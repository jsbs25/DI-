import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Language } from '../../types/index.ts';
import { readAIStream, type AIRecalledMemorySummary } from '../../utils/aiStream.ts';
import { getAiProfileKey } from '../../utils/aiProfile.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';
import { analyzeDialogueEmotion, buildExpressivePhrases } from '../../utils/emotionEngine.ts';
import { OneAiAdminConsole } from './OneAiAdminConsole.tsx';
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  ImagePlus,
  Lock,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  User as UserIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface AIHubProps {
  lang: Language;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  model?: string;
  timestamp: string;
  tokens?: number;
  recalledMemories?: AIRecalledMemorySummary[];
  savedCount?: number;
}

interface MemoryItem {
  id: string;
  category: 'goal' | 'project' | 'habit' | 'preference' | 'decision' | 'fact' | 'relationship';
  summary: string;
  importance: number;
  timesRecalled: number;
  updatedAt: number;
}

const SESSION_STORAGE_KEY = 'earth-one-ai-hub-session:v1';

const CATEGORY_LABELS: Record<MemoryItem['category'], { zh: string; en: string }> = {
  goal: { zh: '目标', en: 'Goal' },
  project: { zh: '项目', en: 'Project' },
  habit: { zh: '习惯', en: 'Habit' },
  preference: { zh: '偏好', en: 'Pref' },
  decision: { zh: '决策', en: 'Decision' },
  fact: { zh: '背景', en: 'Fact' },
  relationship: { zh: '关系', en: 'Relation' },
};

function createLocalSessionId(): string {
  return `hub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const stripAiTags = (t: string) =>
  String(t || '')
    .replace(/\[\[(?:EMO|EMOTION):[^\]]*\]\]\s*/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]\s*/gi, '');

export const AIHub: React.FC<AIHubProps> = ({ lang }) => {
  const isZh = lang === 'zh';

  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    const fresh = createLocalSessionId();
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, fresh);
    } catch {}
    return fresh;
  });

  const [promptInput, setPromptInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [strictPrivacyMode, setStrictPrivacyMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{
    tier: string;
    hasLiveEngine: boolean;
    requestsToday: number;
    dailyRequestLimit: number;
  } | null>(null);

  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryItem['category']>('preference');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');

  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadAIConversationHistory('earth-one-ai-hub:v1', (value): value is Message =>
      !!value && typeof value === 'object' &&
      typeof (value as Message).id === 'string' &&
      ((value as Message).role === 'user' || (value as Message).role === 'assistant') &&
      typeof (value as Message).content === 'string' &&
      typeof (value as Message).timestamp === 'string'
    );
    if (saved.length) return saved;
    return [{
      id: 'msg_welcome',
      role: 'assistant',
      model: 'ONE AI',
      timestamp: isZh ? '刚刚' : 'Now',
      content: isZh
        ? '你好，我是 EARTH ONE 智能伙伴。你可以直接和我连续探讨问题、打磨方案，或者让我记住你的项目背景与个人偏好，我会沿着你的语境一直聊下去。'
        : 'Hi, I am your EARTH ONE partner. Share your ideas, ongoing projects, or preferences—we can keep going continuously across sessions.'
    }];
  });

  useEffect(() => {
    saveAIConversationHistory('earth-one-ai-hub:v1', messages);
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch {}
  }, [sessionId]);

  const fetchMemories = useCallback(async () => {
    setMemoryLoading(true);
    try {
      const profileKey = getAiProfileKey();
      const res = await fetch(`/api/ai/memories?profileKey=${encodeURIComponent(profileKey)}`);
      const d = await res.json().catch(() => null);
      if (d?.success && Array.isArray(d.memories)) {
        setMemories(d.memories);
      }
    } catch {
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories]);

  useEffect(() => {
    if (showMemoryDrawer) {
      void fetchMemories();
    }
  }, [showMemoryDrawer, fetchMemories]);

  // Hydrate messages from server session if local state only has the default welcome message
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/messages?profileKey=${encodeURIComponent(getAiProfileKey())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success && Array.isArray(d.messages) && d.messages.length > 0) {
          setMessages((prev) => {
            if (prev.length > 1) return prev;
            return d.messages.map((m: any) => ({
              id: m.id,
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              model: m.model || 'ONE INTELLIGENCE',
              timestamp: m.createdAt
                ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : isZh ? '历史' : 'History',
            }));
          });
        }
      })
      .catch(() => {});
  }, [isZh, sessionId]);

  const refreshQuotaStatus = useCallback(() => {
    fetch('/api/one-ai/quota')
      .then(r => r.json())
      .then(d => {
        if (d?.success) {
          setIsAdmin(Boolean(d.isAdmin));
          setQuotaInfo({
            tier: String(d.tier || 'free'),
            hasLiveEngine: Boolean(d.hasLiveEngine),
            requestsToday: Number(d.requestsToday || 0),
            dailyRequestLimit: Number(d.dailyRequestLimit || 20),
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshQuotaStatus();
  }, [refreshQuotaStatus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      const rec = new SpeechRec();
      rec.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setIsListening(true);
      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) setPromptInput(prev => (prev ? `${prev} ${transcript}` : transcript));
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const hubTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const hubTtsAbortRef = useRef<AbortController | null>(null);

  const speakText = (text: string) => {
    hubTtsAbortRef.current?.abort();
    hubTtsAbortRef.current = new AbortController();
    const signal = hubTtsAbortRef.current.signal;

    try {
      hubTtsAudioRef.current?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {}

    const clean = stripAiTags(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!clean) return;

    const analysis = analyzeDialogueEmotion('', clean);
    const phrases = buildExpressivePhrases(clean.slice(0, 320), analysis, 'audio');
    if (phrases.length === 0) return;

    const playBrowserFallback = () => {
      if (!('speechSynthesis' in window) || signal.aborted) return;
      const speechPhrases = buildExpressivePhrases(clean.slice(0, 320), analysis, 'speech');
      let idx = 0;
      const nextUtt = () => {
        if (signal.aborted || idx >= speechPhrases.length) return;
        const p = speechPhrases[idx++];
        const utt = new SpeechSynthesisUtterance(p.text);
        utt.lang = isZh ? 'zh-CN' : 'en-US';
        utt.pitch = p.pitch;
        utt.rate = p.rate;
        utt.onend = () => setTimeout(nextUtt, p.pauseAfterMs);
        window.speechSynthesis.speak(utt);
      };
      nextUtt();
    };

    void (async () => {
      if (!hubTtsAudioRef.current) {
        hubTtsAudioRef.current = new Audio();
      }
      const el = hubTtsAudioRef.current;
      for (const p of phrases) {
        if (signal.aborted) return;
        try {
          const r = await fetch(
            `/api/ai/tts?text=${encodeURIComponent(p.text)}&lang=${isZh ? 'zh' : 'en'}&spd=${p.baiduSpd}&emotion=${p.emotion}`,
            { signal }
          );
          if (!r.ok) {
            playBrowserFallback();
            return;
          }
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve, reject) => {
            el.src = url;
            (el as any).preservesPitch = true;
            (el as any).webkitPreservesPitch = true;
            el.playbackRate = p.audioPlaybackRate;
            el.onended = () => {
              URL.revokeObjectURL(url);
              setTimeout(resolve, p.pauseAfterMs);
            };
            el.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error('audio err'));
            };
            el.play().catch(reject);
          });
        } catch {
          if (!signal.aborted) playBrowserFallback();
          return;
        }
      }
    })();
  };

  const handleCopy = (id: string, text: string) => {
    try {
      const clean = stripAiTags(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      navigator.clipboard.writeText(clean);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleAbort = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setIsLoading(false);
    setStreamingMessageId(null);
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, Math.max(0, 4 - attachedImages.length));
    for (const file of picked) {
      if (!file.type.startsWith('image/') || file.size > 4_000_000) continue;
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        setAttachedImages(prev => (prev.length < 4 ? [...prev, dataUrl] : prev));
      }
    }
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || promptInput).trim();
    const imagesToSend = overrideText ? [] : attachedImages;
    if ((!textToSend && imagesToSend.length === 0) || isLoading) return;
    if (!overrideText) {
      setPromptInput('');
      setAttachedImages([]);
    }
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend || (isZh ? '[已发送图片]' : '[Image attached]'),
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      timestamp: nowTime,
    };
    const priorMessages = messages.filter((m) => m.id !== 'msg_welcome' && !m.id.startsWith('msg_init_'));
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    let activeStreamId: string | null = null;
    const abortCtrl = new AbortController();
    requestAbortRef.current = abortCtrl;
    const idempotencyKey = `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const payload: any = {
        prompt: textToSend || (isZh ? '请分析这张图片的内容。' : 'Please analyze this image.'),
        sessionId,
        channel: 'hub',
        profileKey: getAiProfileKey(),
        modelId: 'one-ai',
        mode: 'general',
        privacyMode: strictPrivacyMode ? 'strict_zdr' : 'standard',
        idempotencyKey,
        pageContext: { currentTab: 'aihub', lang },
        history: priorMessages.slice(-16).map(message => ({ role: message.role, content: message.content })),
        attachments: imagesToSend.map(img => ({ type: 'image_url', imageUrl: img })),
        stream: true,
      };
      const res = await fetch('/api/one-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortCtrl.signal,
      });
      activeStreamId = `ai_${Date.now()}`;
      setMessages(prev => [...prev, { id: activeStreamId!, role: 'assistant', content: '', model: 'ONE AI', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      let replyContent = '';
      const streamResult = await readAIStream(res, delta => {
        setStreamingMessageId(activeStreamId);
        replyContent += delta;
        const display = stripAiTags(replyContent).replace(/\[\[(?:EMO|EMOTION)(?::[a-z_-]*)?\]?\]?$/i, '').trimStart();
        setMessages(prev => prev.map(message => message.id === activeStreamId ? { ...message, content: display } : message));
      });
      replyContent = stripAiTags(replyContent).trim();
      if (streamResult.sessionId && streamResult.sessionId !== sessionId) {
        setSessionId(streamResult.sessionId);
      }
      setMessages(prev => prev.map(message => message.id === activeStreamId
        ? {
            ...message,
            content: replyContent,
            model: 'ONE AI',
            tokens: streamResult.tokens,
            recalledMemories: streamResult.recalledMemories,
            savedCount: streamResult.savedMemories?.length || 0,
          }
        : message
      ));
      if (streamResult.savedMemories && streamResult.savedMemories.length > 0) {
        void fetchMemories();
      }
      refreshQuotaStatus();
      if (voiceOutput && replyContent) speakText(replyContent);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      const errorContent = error instanceof Error ? error.message : (isZh ? '请求失败，请稍后重试。' : 'Request failed. Please try again.');
      if (activeStreamId) {
        setMessages(prev => prev.map(message => message.id === activeStreamId ? { ...message, content: errorContent } : message));
      } else {
        setMessages(prev => [...prev, { id: `ai_err_${Date.now()}`, role: 'assistant', content: errorContent, model: 'ONE AI', timestamp: nowTime }]);
      }
    } finally {
      requestAbortRef.current = null;
      setIsLoading(false);
      setStreamingMessageId(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClearChat = () => {
    const nextId = createLocalSessionId();
    setSessionId(nextId);
    setMessages([{
      id: `msg_init_${Date.now()}`,
      role: 'assistant',
      model: 'ONE AI',
      timestamp: isZh ? '刚刚' : 'Now',
      content: isZh
        ? '新对话已开启，之前的长期记忆依然保留着。接下来聊什么？'
        : 'Started a fresh thread while keeping your long-term memories intact. What is next?'
    }]);
  };

  const handleAddMemory = async () => {
    const clean = newMemoryText.trim();
    if (!clean) return;
    try {
      const res = await fetch('/api/ai/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: clean, category: newMemoryCategory, importance: 8, profileKey: getAiProfileKey() }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setNewMemoryText('');
        void fetchMemories();
      }
    } catch {}
  };

  const handleSaveMemoryEdit = async (id: string) => {
    const clean = editingMemoryText.trim();
    if (!clean) return;
    try {
      const res = await fetch(`/api/ai/memories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: clean, profileKey: getAiProfileKey() }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setEditingMemoryId(null);
        setEditingMemoryText('');
        void fetchMemories();
      }
    } catch {}
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/memories/${encodeURIComponent(id)}?profileKey=${encodeURIComponent(getAiProfileKey())}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch {}
  };

  const starterChips = isZh ? [
    '我想做一个 AI',
    '记住我的核心开发习惯和项目方向',
    '你还记得我之前说过什么吗？',
    '用 TypeScript 写一个带校验的函数',
  ] : [
    'I want to build an AI assistant',
    'Remember my core project preferences',
    'What do you remember about my work?',
    'Write a validated TypeScript helper',
  ];

  const parseThoughtAndAnswer = (content: string) => {
    const cleaned = stripAiTags(content);
    const thinkMatch = cleaned.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      const thought = thinkMatch[1].trim();
      const answer = cleaned.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      return { thought, answer };
    }
    return { thought: null, answer: cleaned };
  };

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] md:min-h-[calc(100dvh-4.5rem)] flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-3 py-3 sm:px-6 md:py-6">
        <header className="one-surface-subtle mb-4 flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/15 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]"><Sparkles className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-2xl">ONE AI</h1>
                <p className="text-sm text-[var(--color-one-text-muted)]">{isZh ? 'EARTH ONE 全球人工智能聚合与智能调度中枢，自动为你匹配最合适的引擎。' : 'EARTH ONE Global AI Orchestrator — automatically selects the optimal engine for every task.'}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-one-text-dim)] tabular-nums">
              <span className="font-medium text-[var(--color-one-accent)]">ONE AI Global Router</span>
              <span aria-hidden="true">·</span>
              <span>{quotaInfo?.hasLiveEngine ? (isZh ? '全球智能调度在线' : 'Global Router Online') : (isZh ? '本地知识与记忆在线' : 'Context & Memory Active')}</span>
              {quotaInfo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{isZh ? `今日额度 ${quotaInfo.requestsToday}/${quotaInfo.dailyRequestLimit}` : `Quota ${quotaInfo.requestsToday}/${quotaInfo.dailyRequestLimit}`}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{isZh ? `${memories.length} 条长期记忆` : `${memories.length} memories`}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMemoryDrawer(!showMemoryDrawer)}
              className={`one-btn min-h-[44px] px-3 ${showMemoryDrawer ? 'one-btn-primary' : 'one-btn-secondary'}`}
              title={isZh ? '长期记忆管理' : 'Long-term memory'}
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-medium">{isZh ? `记忆 (${memories.length})` : `Memory (${memories.length})`}</span>
            </button>

            <button
              type="button"
              onClick={() => setStrictPrivacyMode(v => !v)}
              className={`one-btn min-h-[44px] px-3 text-xs ${strictPrivacyMode ? 'one-btn-primary' : 'one-btn-secondary'}`}
              title={isZh ? '隐私路由模式：启用后仅调度零数据留存（ZDR）节点' : 'Strict ZDR privacy routing'}
            >
              {strictPrivacyMode ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="hidden sm:inline">{strictPrivacyMode ? (isZh ? '隐私无痕 (ZDR)' : 'Strict ZDR') : (isZh ? '智能路由' : 'Auto Route')}</span>
            </button>

            <button type="button" onClick={() => setVoiceOutput(!voiceOutput)} className={`one-btn min-h-[44px] min-w-[44px] px-3 ${voiceOutput ? 'one-btn-primary' : 'one-btn-secondary'}`} title={isZh ? '语音朗读' : 'Voice output'}>
              {voiceOutput ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminConsole(true)}
                className="one-btn one-btn-secondary min-h-[44px] px-3 text-xs"
                title={isZh ? 'ONE AI 后台调度与供应商管理控制台' : 'ONE AI Admin Console'}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden md:inline">{isZh ? '调度后台' : 'Admin'}</span>
              </button>
            )}

            <button type="button" onClick={handleClearChat} className="one-btn one-btn-secondary min-h-[44px] min-w-[44px] px-3" title={isZh ? '开启新话题' : 'New conversation'}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {showMemoryDrawer && (
          <div className="one-surface-subtle mb-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                <Brain className="h-4 w-4 text-[var(--color-one-accent)]" />
                <span>{isZh ? '长期记忆管理（跨会话持续生效，自动过滤闲聊噪音）' : 'Long-Term Memory (Cross-Session Persistent)'}</span>
              </div>
              <button onClick={() => setShowMemoryDrawer(false)} className="text-xs text-[var(--color-one-text-muted)] hover:text-slate-900 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={newMemoryCategory}
                onChange={(e) => setNewMemoryCategory(e.target.value as MemoryItem['category'])}
                className="h-10 rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 text-xs text-slate-900 dark:text-white outline-none"
              >
                {(Object.keys(CATEGORY_LABELS) as MemoryItem['category'][]).map((cat) => (
                  <option key={cat} value={cat}>
                    {isZh ? CATEGORY_LABELS[cat].zh : CATEGORY_LABELS[cat].en}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddMemory();
                  }
                }}
                placeholder={isZh ? '手动添加一条重要背景、项目决策或沟通偏好…' : 'Add a durable project goal, decision, or preference…'}
                className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500"
              />
              <button type="button" onClick={() => void handleAddMemory()} className="one-btn one-btn-primary h-10 px-3 text-xs shrink-0">
                <Plus className="h-4 w-4" />
                <span>{isZh ? '记住这条' : 'Save'}</span>
              </button>
            </div>

            {memoryLoading ? (
              <p className="text-xs text-[var(--color-one-text-muted)]">{isZh ? '正在读取记忆…' : 'Loading memories…'}</p>
            ) : memories.length === 0 ? (
              <p className="text-xs text-[var(--color-one-text-muted)]">{isZh ? '暂无已保存的长期记忆。在对话中提到你的项目、偏好或明确说“记住…”时，系统会自动沉淀在这里。' : 'No persistent memories yet. Mention goals, preferences, or say "remember..." in chat.'}</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {memories.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--color-one-text-dim)]">
                        <span className="font-semibold text-[var(--color-one-accent)]">
                          {isZh ? CATEGORY_LABELS[m.category]?.zh || m.category : CATEGORY_LABELS[m.category]?.en || m.category}
                        </span>
                        <span>·</span>
                        <span>{isZh ? `权重 ${m.importance}/10` : `Importance ${m.importance}/10`}</span>
                        {m.timesRecalled > 0 && (
                          <>
                            <span>·</span>
                            <span>{isZh ? `已调用 ${m.timesRecalled} 次` : `Recalled ${m.timesRecalled}x`}</span>
                          </>
                        )}
                      </div>
                      {editingMemoryId === m.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingMemoryText}
                            onChange={(e) => setEditingMemoryText(e.target.value)}
                            className="h-8 flex-1 rounded-lg border border-sky-400 bg-white dark:bg-slate-900 px-2 text-xs text-slate-900 dark:text-white outline-none"
                          />
                          <button type="button" onClick={() => void handleSaveMemoryEdit(m.id)} className="rounded-lg bg-sky-600 px-2.5 py-1 text-white">
                            {isZh ? '保存' : 'Save'}
                          </button>
                          <button type="button" onClick={() => setEditingMemoryId(null)} className="text-[var(--color-one-text-muted)]">
                            {isZh ? '取消' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <p className="text-slate-800 dark:text-slate-200 break-words leading-relaxed">{m.summary}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMemoryId(m.id);
                          setEditingMemoryText(m.summary);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                        title={isZh ? '编辑记忆' : 'Edit'}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMemory(m.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/15"
                        title={isZh ? '删除记忆' : 'Delete'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="one-surface-subtle flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map(msg => {
                const isUser = msg.role === 'user';
                const { thought, answer } = parseThoughtAndAnswer(msg.content);
                const isThoughtOpen = expandedThoughts[msg.id] ?? false;
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${isUser ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]'}`}>
                      {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`min-w-0 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-[var(--color-one-text-dim)] ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span>{isUser ? (isZh ? '你' : 'You') : (msg.model || 'ONE INTELLIGENCE')}</span>
                        <span>·</span>
                        <span>{msg.timestamp}</span>
                        {!isUser && msg.recalledMemories && msg.recalledMemories.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-[var(--color-one-accent)]">
                              {isZh ? `已关联 ${msg.recalledMemories.length} 条记忆` : `${msg.recalledMemories.length} memories used`}
                            </span>
                          </>
                        )}
                      </div>
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-7 ${isUser ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-slate-100'}`}>
                        {!isUser && thought && (
                          <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-black/20">
                            <button type="button" onClick={() => setExpandedThoughts(prev => ({ ...prev, [msg.id]: !isThoughtOpen }))} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-[var(--color-one-text-muted)] hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                              <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />{isZh ? '思考过程' : 'Reasoning'}</span>
                              {isThoughtOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            {isThoughtOpen && <div className="max-h-56 overflow-y-auto border-t border-slate-200 dark:border-white/10 p-3 font-mono text-xs leading-6 text-[var(--color-one-text-muted)] whitespace-pre-wrap">{thought}</div>}
                          </div>
                        )}
                        {Array.isArray(msg.images) && msg.images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {msg.images.map((src, i) => (
                              <img key={i} src={src} alt="attachment" className="max-h-40 rounded-lg border border-white/15 object-cover" />
                            ))}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{answer}</div>
                        {!isUser && (
                          <div className="mt-3 flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-2.5 text-[11px] text-[var(--color-one-text-dim)]">
                            <div className="flex items-center gap-3">
                              <button type="button" onClick={() => handleCopy(msg.id, msg.content)} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                                {copiedId === msg.id ? <><Check className="h-3.5 w-3.5 text-[var(--color-one-success)]" /><span className="text-[var(--color-one-success)]">{isZh ? '已复制' : 'Copied'}</span></> : <><Copy className="h-3.5 w-3.5" /><span>{isZh ? '复制' : 'Copy'}</span></>}
                              </button>
                              <button type="button" onClick={() => speakText(msg.content)} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                                <Volume2 className="h-3.5 w-3.5" /><span>{isZh ? '朗读' : 'Read'}</span>
                              </button>
                            </div>
                            {msg.tokens ? <span className="font-mono">{msg.tokens} tokens</span> : <span />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && !streamingMessageId && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]"><Bot className="h-4 w-4 animate-pulse" /></div>
                  <div className="rounded-2xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-[var(--color-one-text-muted)]">{isZh ? '正在结合语境理解…' : 'Thinking with context…'}</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 bg-[var(--color-one-surface-soft)]/70 p-3 sm:p-4">
            <div className="mx-auto max-w-3xl space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {starterChips.map((chip, idx) => (
                  <button key={idx} type="button" onClick={() => void handleSend(chip)} className="shrink-0 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.05] px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 transition hover:border-sky-400 hover:text-slate-900 dark:hover:text-white">
                    {chip}
                  </button>
                ))}
              </div>

              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachedImages.map((src, idx) => (
                    <div key={idx} className="relative">
                      <img src={src} alt="upload" className="h-14 w-14 rounded-xl border border-slate-200 dark:border-white/15 object-cover" />
                      <button
                        type="button"
                        onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px]"
                        aria-label="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] p-2 focus-within:border-sky-500 shadow-sm">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    void handleImageFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-0.5 rounded-xl p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                  title={isZh ? '上传图片（自动调度视觉模型）' : 'Attach image'}
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={isZh ? '向 ONE AI 提问…（自动调度最合适模型，支持多模态与“记住…”长期记忆）' : 'Ask ONE AI anything… (auto-routes to the best model, supports images & memory)'}
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
                <div className="flex items-center gap-1 pb-0.5 pr-0.5">
                  <button type="button" onClick={toggleSpeechRecognition} className={`rounded-xl p-2.5 transition ${isListening ? 'bg-sky-50 dark:bg-sky-500/20 text-[var(--color-one-accent)]' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`} title={isZh ? '语音输入' : 'Voice input'}>
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  {isLoading ? (
                    <button type="button" onClick={handleAbort} className="one-btn one-btn-secondary one-btn-sm text-rose-500" title={isZh ? '停止生成' : 'Stop'}>
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span className="hidden sm:inline">{isZh ? '停止' : 'Stop'}</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => void handleSend()} disabled={!promptInput.trim() && attachedImages.length === 0} className="one-btn one-btn-primary one-btn-sm disabled:cursor-not-allowed disabled:opacity-40">
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">{isZh ? '发送' : 'Send'}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-one-text-dim)]">{isZh ? '会话状态与高价值长期记忆自动持久化于本地知识库；可在右上角“记忆”面板随时查看或修改。' : 'Multi-turn state and verified long-term memories persist automatically; inspect or edit anytime in the Memory panel.'}</p>
            </div>
          </div>
        </div>
      </div>
      {showAdminConsole && <OneAiAdminConsole isZh={isZh} onClose={() => { setShowAdminConsole(false); refreshQuotaStatus(); }} />}
    </div>
  );
};
