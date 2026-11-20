import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Language } from '../../types/index.ts';
import { readAIStream, type AIRecalledMemorySummary } from '../../utils/aiStream.ts';
import { getAiProfileKey } from '../../utils/aiProfile.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';
import { analyzeDialogueEmotion, buildExpressivePhrases } from '../../utils/emotionEngine.ts';
import {
  playNormalizedArrayBuffer,
  playNormalizedBase64Audio,
  stopSteadyVoice,
  unlockSteadyVoiceAudio,
} from '../../utils/steadyVoicePlayer.ts';
import { OneAiAdminConsole } from './OneAiAdminConsole.tsx';
import {
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Edit3,
  ImagePlus,
  Languages,
  Lock,
  Mic,
  MicOff,
  PenLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface AIHubProps {
  lang: Language;
}

type AiCapabilityMode = 'general' | 'deep' | 'code' | 'translate';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  model?: string;
  mode?: AiCapabilityMode;
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

/** Clean structured renderer for assistant prose & fenced code blocks (no heavy deps). */
const FormattedMessageContent: React.FC<{ text: string; isZh: boolean }> = ({ text, isZh }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[15px] leading-[1.78] break-words">
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const firstNl = inner.indexOf('\n');
          const codeLang = firstNl > -1 ? inner.slice(0, firstNl).trim() : '';
          const codeBody = firstNl > -1 ? inner.slice(firstNl + 1) : inner;
          return (
            <div key={idx} className="overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[#141c24] text-[#eef2f6]">
              <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-[11px] text-[#9aa8b8]">
                <span className="font-mono">{codeLang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(codeBody);
                      setCopiedIdx(idx);
                      setTimeout(() => setCopiedIdx(null), 1800);
                    } catch {}
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#cfd8e3] hover:bg-white/10 cursor-pointer"
                >
                  {copiedIdx === idx ? <Check className="h-3 w-3 text-[#52b798]" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedIdx === idx ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制代码' : 'Copy')}</span>
                </button>
              </div>
              <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-6">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }
        const trimmed = part.trim();
        if (!trimmed) return null;
        return (
          <div key={idx} className="whitespace-pre-wrap">
            {part}
          </div>
        );
      })}
    </div>
  );
};

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

  const [capabilityMode, setCapabilityMode] = useState<AiCapabilityMode>('general');
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
  const hubTtsAbortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadAIConversationHistory('earth-one-ai-hub:v1', (value): value is Message =>
      !!value && typeof value === 'object' &&
      typeof (value as Message).id === 'string' &&
      ((value as Message).role === 'user' || (value as Message).role === 'assistant') &&
      typeof (value as Message).content === 'string' &&
      typeof (value as Message).timestamp === 'string'
    );
    return saved.filter((m) => m.id !== 'msg_welcome' && !m.id.startsWith('msg_init_'));
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
    if (showMemoryDrawer) void fetchMemories();
  }, [showMemoryDrawer, fetchMemories]);

  useEffect(() => {
    fetch('/api/one-ai/quota')
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId || messages.length > 0) return;
    fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/messages?profileKey=${encodeURIComponent(getAiProfileKey())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success && Array.isArray(d.messages) && d.messages.length > 0) {
          setMessages(
            d.messages.map((m: any) => ({
              id: m.id,
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              model: m.model || 'ONE AI',
              timestamp: m.createdAt
                ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : isZh ? '历史' : 'History',
            }))
          );
        }
      })
      .catch(() => {});
  }, [isZh, sessionId, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
        if (transcript) setPromptInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const speakText = (text: string) => {
    unlockSteadyVoiceAudio();
    hubTtsAbortRef.current?.abort();
    hubTtsAbortRef.current = new AbortController();
    const signal = hubTtsAbortRef.current.signal;
    try {
      stopSteadyVoice();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {}

    const clean = stripAiTags(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!clean) return;
    const spokenText = clean.slice(0, 360);
    const analysis = analyzeDialogueEmotion('', spokenText);

    const playBrowserFallback = () => {
      if (!('speechSynthesis' in window) || signal.aborted) return;
      const utt = new SpeechSynthesisUtterance(spokenText.slice(0, 240));
      utt.lang = isZh ? 'zh-CN' : 'en-US';
      utt.volume = 0.85;
      window.speechSynthesis.speak(utt);
    };

    void (async () => {
      try {
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: spokenText, lang: isZh ? 'zh' : 'en', voice: 'Kore' }),
          signal,
        });
        if (res.ok && !signal.aborted) {
          const data = await res.json();
          if (data?.audioBase64 && !signal.aborted) {
            const played = await playNormalizedBase64Audio(
              data.audioBase64,
              data.mimeType || 'audio/wav',
              () => !signal.aborted
            );
            if (played) return;
          }
        }
      } catch {
        if (signal.aborted) return;
      }

      const phrases = buildExpressivePhrases(spokenText.slice(0, 260), analysis, 'audio');
      for (const p of phrases) {
        if (signal.aborted) return;
        try {
          const r = await fetch(`/api/ai/tts?text=${encodeURIComponent(p.text)}&lang=${isZh ? 'zh' : 'en'}&spd=5`, { signal });
          if (!r.ok) { playBrowserFallback(); return; }
          const buf = await r.arrayBuffer();
          await playNormalizedArrayBuffer(buf, r.headers.get('content-type') || 'audio/mpeg', () => !signal.aborted);
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
      void navigator.clipboard.writeText(clean);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
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
      if (dataUrl) setAttachedImages((prev) => (prev.length < 4 ? [...prev, dataUrl] : prev));
    }
  };

  const handleSend = async (overrideText?: string, overrideMode?: AiCapabilityMode) => {
    const textToSend = (overrideText ?? promptInput).trim();
    const imagesToSend = overrideText ? [] : attachedImages;
    const activeMode = overrideMode || capabilityMode;
    if ((!textToSend && imagesToSend.length === 0) || isLoading) return;
    if (!overrideText) {
      setPromptInput('');
      setAttachedImages([]);
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend || (isZh ? '[已发送图片]' : '[Image attached]'),
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      mode: activeMode,
      timestamp: nowTime,
    };

    const modePrefixMap: Record<AiCapabilityMode, string> = {
      general: '',
      deep: isZh ? '请先梳理核心问题与前提，再给出结构清晰、有深度的结论与可执行建议：\n' : 'Analyze step-by-step and provide structured, actionable conclusions:\n',
      code: isZh ? '请以资深工程师标准提供准确、可直接运行的方案与代码，并说明关键边界条件：\n' : 'Respond as a senior software engineer with accurate code and edge-case notes:\n',
      translate: isZh ? '请给出自然地道的专业翻译或润色表达，并简明解释关键用词差异：\n' : 'Provide natural, publication-grade translation or refinement with concise word-choice notes:\n',
    };

    const priorMessages = messages.slice(-16);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    let activeStreamId: string | null = null;
    const abortCtrl = new AbortController();
    requestAbortRef.current = abortCtrl;
    const idempotencyKey = `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const payload: any = {
        prompt: `${modePrefixMap[activeMode]}${textToSend || (isZh ? '请分析这张图片的内容。' : 'Please analyze this image.')}`,
        sessionId,
        channel: 'hub',
        profileKey: getAiProfileKey(),
        modelId: 'one-ai',
        mode: activeMode === 'deep' ? 'reasoning' : activeMode,
        privacyMode: strictPrivacyMode ? 'strict_zdr' : 'standard',
        idempotencyKey,
        pageContext: { currentTab: 'aihub', lang, capabilityMode: activeMode },
        history: priorMessages.map((m) => ({ role: m.role, content: m.content })),
        attachments: imagesToSend.map((img) => ({ type: 'image_url', imageUrl: img })),
        stream: true,
      };
      const res = await fetch('/api/one-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortCtrl.signal,
      });
      activeStreamId = `ai_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: activeStreamId!, role: 'assistant', content: '', model: 'ONE AI', mode: activeMode, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ]);
      let replyContent = '';
      const streamResult = await readAIStream(res, (delta) => {
        setStreamingMessageId(activeStreamId);
        replyContent += delta;
        const display = stripAiTags(replyContent).replace(/\[\[(?:EMO|EMOTION)(?::[a-z_-]*)?\]?\]?$/i, '').trimStart();
        setMessages((prev) => prev.map((m) => (m.id === activeStreamId ? { ...m, content: display } : m)));
      });
      replyContent = stripAiTags(replyContent).trim();
      if (streamResult.sessionId && streamResult.sessionId !== sessionId) setSessionId(streamResult.sessionId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeStreamId
            ? {
                ...m,
                content: replyContent,
                model: 'ONE AI',
                tokens: streamResult.tokens,
                recalledMemories: streamResult.recalledMemories,
                savedCount: streamResult.savedMemories?.length || 0,
              }
            : m
        )
      );
      if (streamResult.savedMemories && streamResult.savedMemories.length > 0) void fetchMemories();
      if (voiceOutput && replyContent) speakText(replyContent);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      const errorContent = error instanceof Error ? error.message : (isZh ? '请求失败，请稍后重试。' : 'Request failed. Please try again.');
      if (activeStreamId) {
        setMessages((prev) => prev.map((m) => (m.id === activeStreamId ? { ...m, content: errorContent } : m)));
      } else {
        setMessages((prev) => [...prev, { id: `ai_err_${Date.now()}`, role: 'assistant', content: errorContent, model: 'ONE AI', timestamp: nowTime }]);
      }
    } finally {
      requestAbortRef.current = null;
      setIsLoading(false);
      setStreamingMessageId(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  const handleClearChat = () => {
    setSessionId(createLocalSessionId());
    setMessages([]);
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
      if (data?.success) setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  const parseThoughtAndAnswer = (content: string) => {
    const cleaned = stripAiTags(content);
    const thinkMatch = cleaned.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      return {
        thought: thinkMatch[1].trim(),
        answer: cleaned.replace(/<think>[\s\S]*?<\/think>/, '').trim(),
      };
    }
    return { thought: null, answer: cleaned };
  };

  const modes: Array<{ id: AiCapabilityMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'general', label: isZh ? '对话' : 'Chat', icon: Sparkles },
    { id: 'deep', label: isZh ? '深度思考' : 'Deep', icon: Brain },
    { id: 'code', label: isZh ? '代码架构' : 'Code', icon: Code2 },
    { id: 'translate', label: isZh ? '翻译写作' : 'Write', icon: Languages },
  ];

  const starters: Array<{ title: string; desc: string; prompt: string; mode: AiCapabilityMode; icon: React.ComponentType<{ className?: string }> }> = [
    {
      title: isZh ? '深度分析与决策' : 'Deep Analysis',
      desc: isZh ? '拆解复杂问题、权衡利弊并给出清晰方案' : 'Break down complex trade-offs into clear next steps',
      prompt: isZh ? '帮我系统梳理一个产品从 0 到 1 上线前最关键的 5 项验收清单与风险控制方案。' : 'Outline the 5 most critical launch readiness checks and risk mitigations for a new product.',
      mode: 'deep',
      icon: Brain,
    },
    {
      title: isZh ? '典籍解读与精译' : 'Reading & Translation',
      desc: isZh ? '中英阿多语互译、词源辨析与长难句精讲' : 'Multilingual translation, nuance, and passage commentary',
      prompt: isZh ? '请用通俗清晰的方式对比英语中 resilience、perseverance 与 fortitude 的细微语境差别，并各给一句地道例句。' : 'Contrast the nuances of resilience, perseverance, and fortitude with natural examples.',
      mode: 'translate',
      icon: BookOpen,
    },
    {
      title: isZh ? '工程代码与排错' : 'Engineering & Code',
      desc: isZh ? '编写可靠代码、架构设计与性能诊断' : 'Production code, architecture, and performance review',
      prompt: isZh ? '用 TypeScript 写一个带指数退避重连和心跳检测的 WebSocket 客户端封装。' : 'Write a TypeScript WebSocket client with exponential backoff reconnect and heartbeat.',
      mode: 'code',
      icon: Code2,
    },
    {
      title: isZh ? '方案写作与润色' : 'Writing & Polish',
      desc: isZh ? '将零散想法提炼为克制、专业的正式文本' : 'Turn rough thoughts into crisp, well-structured writing',
      prompt: isZh ? '帮我润色一段简洁、专业、不浮夸的产品升级发布说明框架。' : 'Draft a concise, refined product release announcement template.',
      mode: 'general',
      icon: PenLine,
    },
  ];

  return (
    <div className="flex h-[calc(100dvh-8.4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[500px] flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      {/* Minimal Clean Top Bar */}
      <div className="mx-auto flex w-full max-w-[820px] shrink-0 flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-1 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <div className="inline-flex items-center rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-0.5">
            {modes.map((m) => {
              const Icon = m.icon;
              const active = capabilityMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCapabilityMode(m.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#247864] text-white dark:bg-[#e5d9be] dark:text-[#141d28]'
                      : 'text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowMemoryDrawer((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer ${
              showMemoryDrawer
                ? 'border-[#247864] bg-[#247864]/12 text-[#247864] dark:border-[#d6b77f] dark:bg-[#d6b77f]/15 dark:text-[#d6b77f]'
                : 'border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
            }`}
            title={isZh ? '长期记忆' : 'Long-term memory'}
          >
            <Brain className="h-3.5 w-3.5" />
            <span>{isZh ? `记忆 ${memories.length}` : `Memory ${memories.length}`}</span>
          </button>

          <button
            type="button"
            onClick={() => setStrictPrivacyMode((v) => !v)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              strictPrivacyMode
                ? 'border-[#247864] bg-[#247864]/12 text-[#247864] dark:border-[#52b798] dark:text-[#52b798]'
                : 'border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
            }`}
            title={strictPrivacyMode ? (isZh ? '隐私无痕模式已开启' : 'Strict privacy active') : (isZh ? '切换隐私无痕模式' : 'Toggle privacy mode')}
          >
            {strictPrivacyMode ? <Lock className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setVoiceOutput((v) => !v)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              voiceOutput
                ? 'border-[#247864] bg-[#247864]/12 text-[#247864] dark:border-[#52b798] dark:text-[#52b798]'
                : 'border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
            }`}
            title={isZh ? '自动语音朗读' : 'Auto voice readback'}
          >
            {voiceOutput ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminConsole(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)] cursor-pointer"
              title={isZh ? '调度控制台' : 'Router Admin'}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)] cursor-pointer"
              title={isZh ? '开启新对话' : 'New thread'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Long-Term Memory Panel */}
      {showMemoryDrawer && (
        <div className="mx-auto mb-2.5 w-full max-w-[820px] shrink-0 px-3 sm:px-6">
          <div className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--color-one-text)]">
                {isZh ? '长期记忆库（跨会话持续生效）' : 'Persistent Memory'}
              </span>
              <button type="button" onClick={() => setShowMemoryDrawer(false)} className="text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={newMemoryCategory}
                onChange={(e) => setNewMemoryCategory(e.target.value as MemoryItem['category'])}
                className="h-9 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-2.5 text-xs outline-none"
              >
                {(Object.keys(CATEGORY_LABELS) as MemoryItem['category'][]).map((cat) => (
                  <option key={cat} value={cat}>{isZh ? CATEGORY_LABELS[cat].zh : CATEGORY_LABELS[cat].en}</option>
                ))}
              </select>
              <input
                type="text"
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddMemory(); } }}
                placeholder={isZh ? '添加一条重要背景、偏好或项目目标…' : 'Add a durable preference or goal…'}
                className="h-9 flex-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-3 text-xs outline-none focus:border-[var(--color-one-accent)]"
              />
              <button type="button" onClick={() => void handleAddMemory()} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-[#247864] px-3 text-xs font-medium text-white hover:bg-[#1d6251] cursor-pointer shrink-0">
                <Plus className="h-3.5 w-3.5" />
                <span>{isZh ? '保存' : 'Save'}</span>
              </button>
            </div>
            {memoryLoading ? (
              <p className="text-xs text-[var(--color-one-text-muted)]">{isZh ? '读取中…' : 'Loading…'}</p>
            ) : memories.length === 0 ? (
              <p className="text-xs text-[var(--color-one-text-muted)]">{isZh ? '暂无长期记忆。在对话中直接说“记住…”也会自动沉淀到这里。' : 'No saved memories yet.'}</p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {memories.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/60 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="mr-2 text-[11px] font-medium text-[var(--color-one-accent)]">
                        {isZh ? CATEGORY_LABELS[m.category]?.zh || m.category : CATEGORY_LABELS[m.category]?.en || m.category}
                      </span>
                      {editingMemoryId === m.id ? (
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingMemoryText}
                            onChange={(e) => setEditingMemoryText(e.target.value)}
                            className="h-7 flex-1 rounded-lg border border-[var(--color-one-accent)] bg-[var(--color-one-surface)] px-2 text-xs outline-none"
                          />
                          <button type="button" onClick={() => void handleSaveMemoryEdit(m.id)} className="rounded-lg bg-[#247864] px-2.5 py-1 text-[11px] text-white cursor-pointer">{isZh ? '保存' : 'Save'}</button>
                          <button type="button" onClick={() => setEditingMemoryId(null)} className="text-[11px] text-[var(--color-one-text-muted)] cursor-pointer">{isZh ? '取消' : 'Cancel'}</button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-one-text)] break-words">{m.summary}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => { setEditingMemoryId(m.id); setEditingMemoryText(m.summary); }} className="p-1 text-[var(--color-one-text-dim)] hover:text-[var(--color-one-text)] cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => void handleDeleteMemory(m.id)} className="p-1 text-[var(--color-one-text-dim)] hover:text-rose-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Scrollable Conversation Stage */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[780px] flex-col py-4 sm:py-6">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center py-6 sm:py-12 text-center">
              <h1 className="text-2xl sm:text-[32px] font-semibold tracking-tight text-[var(--color-one-text)] text-balance">
                {isZh ? '有什么我可以帮你？' : 'How can ONE AI help today?'}
              </h1>
              <p className="mt-2 max-w-md text-sm text-[var(--color-one-text-muted)] leading-relaxed">
                {isZh
                  ? '统一智能核心，支持深度思考、多语言翻译、代码工程、识图与跨会话记忆。'
                  : 'Unified intelligence for deep reasoning, translation, code, vision, and persistent memory.'}
              </p>

              <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
                {starters.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        setCapabilityMode(item.mode);
                        void handleSend(item.prompt, item.mode);
                      }}
                      className="group flex items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-4 transition-all hover:border-[var(--color-one-accent)]/50 hover:shadow-xs cursor-pointer"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-one-accent-soft)] text-[var(--color-one-accent)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--color-one-text)] group-hover:text-[var(--color-one-accent)] transition-colors">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--color-one-text-muted)] leading-relaxed">
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-4">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const { thought, answer } = parseThoughtAndAnswer(msg.content);
                const isThoughtOpen = expandedThoughts[msg.id] ?? false;

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-[22px] bg-[#244e41] dark:bg-[#223544] px-4 py-3 text-[15px] leading-relaxed text-[#faf8f3] shadow-xs">
                        {Array.isArray(msg.images) && msg.images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {msg.images.map((src, i) => (
                              <img key={i} src={src} alt="attachment" className="max-h-44 rounded-xl object-cover" />
                            ))}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-one-text-dim)]">
                      <span className="font-semibold text-[var(--color-one-accent)]">ONE AI</span>
                      <span aria-hidden="true">·</span>
                      <span>{msg.timestamp}</span>
                      {msg.recalledMemories && msg.recalledMemories.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{isZh ? `关联 ${msg.recalledMemories.length} 条记忆` : `${msg.recalledMemories.length} memories`}</span>
                        </>
                      )}
                    </div>

                    {thought && (
                      <div className="overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/70">
                        <button
                          type="button"
                          onClick={() => setExpandedThoughts((prev) => ({ ...prev, [msg.id]: !isThoughtOpen }))}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)] cursor-pointer"
                        >
                          <span>{isZh ? '思考过程' : 'Reasoning trace'}</span>
                          {isThoughtOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        {isThoughtOpen && (
                          <div className="max-h-56 overflow-y-auto border-t border-[var(--color-one-border)] px-3.5 py-2.5 font-mono text-xs leading-6 text-[var(--color-one-text-muted)] whitespace-pre-wrap">
                            {thought}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-[var(--color-one-text)]">
                      <FormattedMessageContent text={answer} isZh={isZh} />
                    </div>

                    <div className="flex items-center gap-3 pt-1 text-xs text-[var(--color-one-text-dim)]">
                      <button type="button" onClick={() => handleCopy(msg.id, msg.content)} className="inline-flex items-center gap-1 hover:text-[var(--color-one-text)] cursor-pointer">
                        {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-[var(--color-one-accent)]" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedId === msg.id ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}</span>
                      </button>
                      <button type="button" onClick={() => speakText(msg.content)} className="inline-flex items-center gap-1 hover:text-[var(--color-one-text)] cursor-pointer">
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>{isZh ? '朗读' : 'Speak'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {isLoading && !streamingMessageId && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-one-text-muted)]">
                  <Sparkles className="h-4 w-4 text-[var(--color-one-accent)] animate-pulse" />
                  <span>{isZh ? '正在思考…' : 'Thinking…'}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Clean Compact Composer Bar */}
      <div className="mx-auto w-full max-w-[780px] shrink-0 px-3 pt-2 pb-1 sm:px-6">
        {attachedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedImages.map((src, idx) => (
              <div key={idx} className="relative">
                <img src={src} alt="upload" className="h-12 w-12 rounded-xl border border-[var(--color-one-border)] object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5 rounded-[24px] border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-2.5 py-2 shadow-sm focus-within:border-[var(--color-one-accent)] transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleImageFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)] hover:text-[var(--color-one-text)] cursor-pointer"
            title={isZh ? '上传图片' : 'Attach image'}
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={promptInput}
            onChange={(e) => {
              setPromptInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(140, Math.max(36, el.scrollHeight))}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              capabilityMode === 'code'
                ? isZh ? '描述你需要编写、重构或排查的代码问题…' : 'Describe code to write, refactor, or debug…'
                : capabilityMode === 'translate'
                ? isZh ? '粘贴需要翻译、润色或深度解读的段落…' : 'Paste text to translate, polish, or analyze…'
                : isZh ? '向 ONE AI 提问…' : 'Message ONE AI…'
            }
            className="max-h-[140px] min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] outline-none"
          />

          <button
            type="button"
            onClick={toggleSpeechRecognition}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
              isListening
                ? 'bg-[#247864]/15 text-[#247864] dark:text-[#52b798]'
                : 'text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)] hover:text-[var(--color-one-text)]'
            }`}
            title={isZh ? '语音输入' : 'Voice input'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {isLoading ? (
            <button
              type="button"
              onClick={handleAbort}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 cursor-pointer"
              title={isZh ? '停止生成' : 'Stop'}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!promptInput.trim() && attachedImages.length === 0}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#247864] text-white hover:bg-[#1d6251] dark:bg-[#e5d9be] dark:text-[#141d28] disabled:opacity-30 cursor-pointer transition-colors"
              title={isZh ? '发送' : 'Send'}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showAdminConsole && (
        <OneAiAdminConsole isZh={isZh} onClose={() => setShowAdminConsole(false)} />
      )}
    </div>
  );
};
