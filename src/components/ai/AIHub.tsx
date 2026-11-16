import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';
import {
  readVoiceListeningMode,
  readVoiceSpeechSettings,
  subscribeVoiceListeningMode,
  writeVoiceListeningMode,
  writeVoiceSpeechSettings,
  type VoiceListeningMode,
} from '../../utils/voiceModeSettings.ts';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  User as UserIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface AIHubProps {
  lang: Language;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
  tokens?: number;
}

interface AIModelItem {
  id: string;
  name: string;
  provider?: string;
  status: string;
  isDefault: boolean;
  apiKeyMasked: string;
  isFree?: boolean;
}

export const AIHub: React.FC<AIHubProps> = ({ lang }) => {
  const isZh = lang === 'zh';

  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite');
  const [availableModels, setAvailableModels] = useState<AIModelItem[]>([]);
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Synchronized voice companion mode & speech settings
  const [voiceMode, setVoiceMode] = useState<VoiceListeningMode>(() => readVoiceListeningMode());
  const [speechRate, setSpeechRate] = useState<number>(() => readVoiceSpeechSettings().rate);
  const [enterToSend, setEnterToSend] = useState<boolean>(() => {
    try {
      return localStorage.getItem('earth-one-chat-enter-send') !== '0';
    } catch {
      return true;
    }
  });

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('https://api.deepseek.com/v1');
  const [customModel, setCustomModel] = useState('deepseek-chat');

  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isComposingRef = useRef(false);

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
      model: 'Gemini 3.1 Flash Lite',
      timestamp: isZh ? '刚刚' : 'Now',
      content: isZh
        ? '你好，我是 ONE 智能中枢。\n\n当前默认主引擎为 Google Gemini（3.1 Flash Lite 极速实时 + 4 Hydrogen 深度推理），并支持在右上角设置中切换 DeepSeek API 或本地 Ollama 模型。\n\n支持中文输入法无缝拼写与实时语音控制。请问有什么可以帮你？'
        : 'Welcome to ONE Intelligence.\n\nPowered primarily by Google Gemini (3.1 Flash Lite for low-latency responses & 4 Hydrogen for reasoning), with optional DeepSeek API or local Ollama switching in Settings.\n\nHow can I help today?'
    }];
  });

  useEffect(() => {
    saveAIConversationHistory('earth-one-ai-hub:v1', messages);
  }, [messages]);

  useEffect(() => {
    return subscribeVoiceListeningMode((mode) => {
      setVoiceMode(mode);
    });
  }, []);

  useEffect(() => {
    fetch('/api/ai/models')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.models)) {
          setAvailableModels(d.models);
          const activeDefault =
            d.models.find((m: AIModelItem) => m.isDefault && m.status === 'active') ||
            d.models.find((m: AIModelItem) => m.status === 'active') ||
            d.models[0];
          if (activeDefault) setSelectedModel(activeDefault.id);
        }
      })
      .catch(() => {});

    fetch('http://127.0.0.1:11434/api/tags')
      .then(r => r.json())
      .then(data => {
        if (data?.models && Array.isArray(data.models) && data.models.length > 0) {
          const localList: AIModelItem[] = data.models.map((m: any) => ({
            id: `ollama:${m.name}`,
            name: `${isZh ? '本地 Ollama' : 'Local Ollama'} · ${m.name}`,
            provider: 'Custom',
            status: 'active',
            isDefault: false,
            apiKeyMasked: '127.0.0.1:11434',
            isFree: true
          }));
          if (localList.length > 0) {
            setAvailableModels(prev => {
              const ids = new Set(prev.map(p => p.id));
              const newOnes = localList.filter(l => !ids.has(l.id));
              return [...prev, ...newOnes];
            });
          }
        }
      })
      .catch(() => {});
  }, [isZh]);

  // Smoothly auto-resize textarea without disturbing IME cursor
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 44), 144);
    el.style.height = `${nextHeight}px`;
  }, [promptInput]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const activeModelMeta = useMemo(
    () => availableModels.find(m => m.id === selectedModel),
    [availableModels, selectedModel]
  );

  const activeEngineBadge = useMemo(() => {
    if (selectedModel === 'custom' || customApiKey.trim()) {
      return `${customModel || 'Custom API'}`;
    }
    if (selectedModel.startsWith('gemini')) {
      return selectedModel === 'gemini-4-hydrogen' ? 'Gemini 4 Hydrogen' : 'Gemini 3.1 Flash Lite';
    }
    if (selectedModel.startsWith('deepseek')) {
      return selectedModel === 'deepseek-v3' ? 'DeepSeek-V3' : 'DeepSeek-R1';
    }
    if (selectedModel.startsWith('ollama:')) {
      return `Ollama · ${selectedModel.slice(7)}`;
    }
    return activeModelMeta?.name || selectedModel;
  }, [activeModelMeta?.name, customApiKey, customModel, selectedModel]);

  const handleVoiceModeSelect = (nextMode: VoiceListeningMode) => {
    setVoiceMode(nextMode);
    writeVoiceListeningMode(nextMode);
  };

  const handleSpeechRateChange = (nextRate: number) => {
    const clamped = Math.min(1.5, Math.max(0.75, Number(nextRate.toFixed(2))));
    setSpeechRate(clamped);
    const current = readVoiceSpeechSettings();
    writeVoiceSpeechSettings({ ...current, rate: clamped });
  };

  const toggleEnterToSend = () => {
    const next = !enterToSend;
    setEnterToSend(next);
    try {
      localStorage.setItem('earth-one-chat-enter-send', next ? '1' : '0');
    } catch {}
  };

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
        if (transcript) {
          setPromptInput(prev => (prev ? `${prev} ${transcript}` : transcript));
          inputRef.current?.focus();
        }
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
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!clean) return;
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = speechRate;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  const handleCopy = (id: string, text: string) => {
    try {
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      navigator.clipboard.writeText(clean);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStreamingMessageId(null);
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText ?? promptInput).trim();
    if (!textToSend || isLoading) return;
    if (!overrideText) {
      setPromptInput('');
      if (inputRef.current) {
        inputRef.current.style.height = '44px';
      }
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { id: `user_${Date.now()}`, role: 'user', content: textToSend, timestamp: nowTime };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let activeStreamId: string | null = null;

    try {
      const shouldStream = !customApiKey.trim();
      const payload: Record<string, unknown> = {
        prompt: textToSend,
        modelId: selectedModel,
        mode: 'general',
        history: messages.slice(-8).map(message => ({ role: message.role, content: message.content })),
        ...(shouldStream ? { stream: true } : {})
      };
      if (selectedModel === 'custom' || customApiKey.trim()) {
        payload.apiKey = customApiKey.trim();
        payload.baseUrl = customBaseUrl.trim();
        payload.customModel = customModel.trim();
      }
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (shouldStream) {
        activeStreamId = `ai_${Date.now()}`;
        setMessages(prev => [
          ...prev,
          {
            id: activeStreamId!,
            role: 'assistant',
            content: '',
            model: activeEngineBadge,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        let replyContent = '';
        const streamResult = await readAIStream(res, delta => {
          setStreamingMessageId(activeStreamId);
          replyContent += delta;
          setMessages(prev =>
            prev.map(message =>
              message.id === activeStreamId ? { ...message, content: message.content + delta } : message
            )
          );
        });
        setMessages(prev =>
          prev.map(message =>
            message.id === activeStreamId
              ? { ...message, model: streamResult.model || activeEngineBadge, tokens: streamResult.tokens }
              : message
          )
        );
        if (voiceOutput && replyContent.trim()) speakText(replyContent);
        return;
      }
      const data = await res.json();
      const replyContent =
        data.success && data.reply
          ? data.reply
          : (data.error || (isZh ? '没有收到有效回复，请重试。' : 'No valid reply received. Please try again.'));
      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        model: data.model || activeEngineBadge,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tokens: data.tokens
      };
      setMessages(prev => [...prev, aiMsg]);
      if (voiceOutput) speakText(replyContent);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      if (selectedModel.startsWith('ollama:')) {
        try {
          const rawModel = selectedModel.slice(7);
          const localRes = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: rawModel, messages: [{ role: 'user', content: textToSend }], stream: false })
          });
          if (localRes.ok) {
            const lData = await localRes.json();
            const localReply = lData?.message?.content || lData?.response || '';
            if (localReply) {
              setMessages(prev => [
                ...prev,
                {
                  id: `ai_${Date.now()}`,
                  role: 'assistant',
                  content: localReply,
                  model: `${isZh ? '本地 Ollama' : 'Local Ollama'} (${rawModel})`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
              ]);
              if (voiceOutput) speakText(localReply);
              return;
            }
          }
        } catch {}
      }
      const errorContent =
        error instanceof Error
          ? error.message
          : (isZh ? '请求失败，请检查网络或模型配置后重试。' : 'Request failed. Please check connection or model configuration.');
      if (activeStreamId) {
        setMessages(prev =>
          prev.map(message =>
            message.id === activeStreamId ? { ...message, content: message.content || errorContent } : message
          )
        );
      } else {
        setMessages(prev => [
          ...prev,
          { id: `ai_err_${Date.now()}`, role: 'assistant', content: errorContent, model: activeEngineBadge, timestamp: nowTime }
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleClearChat = () => {
    setMessages([{
      id: `msg_init_${Date.now()}`,
      role: 'assistant',
      model: activeEngineBadge,
      timestamp: isZh ? '刚刚' : 'Now',
      content: isZh ? '对话已开启新会话，请随时输入。' : 'New conversation started. Ask anything.'
    }]);
    inputRef.current?.focus();
  };

  const starterChips = isZh ? [
    '帮我快速总结当前世界热点与思路',
    '把这个复杂任务拆解成可执行步骤',
    '用 TypeScript 写一个高并发限流工具',
    '润色一段专业简洁的商务邮件',
    '把这段中文自然地道地翻译成英文',
  ] : [
    'Break this task into actionable steps',
    'Write a TypeScript rate limiter utility',
    'Polish a concise executive email',
    'Explain a complex concept simply',
    'Translate naturally into Chinese',
  ];

  const parseThoughtAndAnswer = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      const thought = thinkMatch[1].trim();
      const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      return { thought, answer };
    }
    return { thought: null, answer: content };
  };

  const ollamaConnected = availableModels.some(m => m.id.startsWith('ollama:'));

  return (
    <div className="flex h-[calc(100dvh-5.2rem)] md:h-[calc(100dvh-4.5rem)] flex-col overflow-hidden bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col px-2.5 py-2 sm:px-5 sm:py-4">
        {/* Compact Responsive Header */}
        <header className="one-surface-subtle mb-2.5 flex shrink-0 flex-col gap-2.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 dark:border-sky-400/25 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
                  {isZh ? 'ONE 智能工作台' : 'ONE Intelligence'}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {activeEngineBadge}
                </span>
                {ollamaConnected && (
                  <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 dark:border-white/15 px-2 py-0.5 text-[11px] text-[var(--color-one-text-muted)]">
                    Ollama
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-[var(--color-one-text-muted)]">
                {isZh
                  ? '实时流式对话 · 完整兼容中文输入法与悬浮语音联动'
                  : 'Low-latency streaming chat with full IME & voice mode sync'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-0 flex-1 sm:w-auto sm:min-w-[210px] sm:flex-none">
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-2.5 pr-8 text-xs font-medium text-slate-900 dark:text-white outline-none transition focus:border-sky-500"
                aria-label={isZh ? '选择 AI 模型' : 'Select AI model'}
              >
                {availableModels.length === 0 ? (
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                ) : (
                  availableModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.status === 'active' ? '● ' : '○ '}
                      {m.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            </div>

            <button
              type="button"
              onClick={() => setVoiceOutput(!voiceOutput)}
              className={`one-btn h-9 min-w-[36px] px-2.5 text-xs ${voiceOutput ? 'one-btn-primary' : 'one-btn-secondary'}`}
              title={isZh ? '回复语音朗读开关' : 'Auto-read responses'}
            >
              {voiceOutput ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              className={`one-btn h-9 px-2.5 text-xs ${showConfigDrawer ? 'one-btn-primary' : 'one-btn-secondary'}`}
              title={isZh ? 'AI 与语音设置' : 'AI & Voice settings'}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">{isZh ? '设置' : 'Settings'}</span>
            </button>
            <button
              type="button"
              onClick={handleClearChat}
              className="one-btn one-btn-secondary h-9 min-w-[36px] px-2.5 text-xs"
              title={isZh ? '新对话' : 'New chat'}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* AI Settings Drawer (Voice Mode + Speech Rate + API Config) */}
        {showConfigDrawer && (
          <div className="one-surface-subtle mb-2.5 shrink-0 space-y-4 p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">
                <Cpu className="h-4 w-4 text-[var(--color-one-accent)]" />
                <span>{isZh ? 'AI 引擎与语音交互设置' : 'AI Engine & Voice Settings'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigDrawer(false)}
                className="rounded-lg px-2 py-1 text-xs text-[var(--color-one-text-muted)] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
              >
                {isZh ? '完成' : 'Done'}
              </button>
            </div>

            {/* User-controllable Voice Mode Toggle (Synced with HolographicAICompanion) */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-[var(--color-one-surface-soft)]/70 p-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-slate-800 dark:text-slate-100">
                  {isZh ? '悬浮语音助手触发模式（One.）' : 'Floating Voice Assistant Mode'}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--color-one-text-muted)]">
                  {voiceMode === 'always-listening'
                    ? isZh
                      ? '始终监听：点击开启后持续收音，可随时开口实时打断 AI。'
                      : 'Always-listening: Hands-free continuous VAD with instant barge-in.'
                    : isZh
                    ? '点按说话：每次点击说一轮，AI 回答完毕自动暂停收音。'
                    : 'Click-to-speak: Captures one utterance per tap and stops listening after reply.'}
                </p>
                <div className="mt-2 inline-flex rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] p-1">
                  <button
                    type="button"
                    onClick={() => handleVoiceModeSelect('always-listening')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                      voiceMode === 'always-listening'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Radio className="h-3.5 w-3.5" />
                    <span>{isZh ? '始终监听 (声控 VAD)' : 'Always-listening'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceModeSelect('click-to-speak')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                      voiceMode === 'click-to-speak'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Mic className="h-3.5 w-3.5" />
                    <span>{isZh ? '点按说话' : 'Click-to-speak'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-100">
                    <span>{isZh ? '语音播报语速' : 'Voice Reply Speed'}</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">{speechRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.45"
                    step="0.05"
                    value={speechRate}
                    onChange={e => handleSpeechRateChange(parseFloat(e.target.value))}
                    className="mt-2 w-full accent-sky-600"
                  />
                </div>

                <label className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <span>{isZh ? '按 Enter 直接发送（Shift+Enter 换行，已兼容中文输入法）' : 'Press Enter to send (IME-safe)'}</span>
                  <input
                    type="checkbox"
                    checked={enterToSend}
                    onChange={toggleEnterToSend}
                    className="h-4 w-4 accent-sky-600 rounded"
                  />
                </label>
              </div>
            </div>

            {/* Optional Custom / DeepSeek / Local Ollama Override */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--color-one-text-dim)]">Custom Base URL</span>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  placeholder="https://api.deepseek.com/v1"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--color-one-text-dim)]">{isZh ? '自定义模型名' : 'Model name'}</span>
                <input
                  type="text"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  placeholder="deepseek-chat / deepseek-reasoner"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--color-one-text-dim)]">{isZh ? '自定义 API Key（可选）' : 'Custom API Key (Optional)'}</span>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  placeholder={isZh ? '默认直连内置 Gemini；填此项切换自定义接口' : 'Optional override key'}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-one-text-muted)]">
              <span>
                {isZh
                  ? '说明：服务端当前主引擎为 Google Gemini（3.1 Flash Lite / 4 Hydrogen）；如需使用 DeepSeek，可填写 DeepSeek Key 或使用本地 Ollama。'
                  : 'Default server backend runs Google Gemini; enter a DeepSeek key or select local Ollama to switch.'}
              </span>
              {customApiKey.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModel('custom');
                    setShowConfigDrawer(false);
                  }}
                  className="one-btn one-btn-primary one-btn-sm"
                >
                  {isZh ? '启用自定义接口' : 'Use Custom API'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Chat Thread Container */}
        <div className="one-surface-subtle flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map(msg => {
                const isUser = msg.role === 'user';
                const { thought, answer } = parseThoughtAndAnswer(msg.content);
                const isThoughtOpen = expandedThoughts[msg.id] ?? false;
                return (
                  <div key={msg.id} className={`flex gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div
                      className={`mt-0.5 flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl border ${
                        isUser
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]'
                      }`}
                    >
                      {isUser ? <UserIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    </div>
                    <div className={`min-w-0 max-w-[86%] ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`mb-1 flex items-center gap-1.5 px-1 text-[11px] text-[var(--color-one-text-dim)] ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span>{isUser ? (isZh ? '你' : 'You') : (msg.model || activeEngineBadge)}</span>
                        <span>·</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:px-4 sm:py-3 ${
                          isUser
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {!isUser && thought && (
                          <div className="mb-2.5 overflow-hidden rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-black/20">
                            <button
                              type="button"
                              onClick={() => setExpandedThoughts(prev => ({ ...prev, [msg.id]: !isThoughtOpen }))}
                              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--color-one-text-muted)] hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                                {isZh ? '思考过程' : 'Reasoning'}
                              </span>
                              {isThoughtOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            {isThoughtOpen && (
                              <div className="max-h-52 overflow-y-auto border-t border-slate-200 dark:border-white/10 p-2.5 font-mono text-xs leading-5 text-[var(--color-one-text-muted)] whitespace-pre-wrap">
                                {thought}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">
                          {answer || (streamingMessageId === msg.id ? (isZh ? '思考中…' : 'Thinking…') : '')}
                        </div>
                        {!isUser && answer && (
                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/80 dark:border-white/10 pt-2 text-[11px] text-[var(--color-one-text-dim)]">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleCopy(msg.id, msg.content)}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-[var(--color-one-success)]" />
                                    <span className="text-[var(--color-one-success)]">{isZh ? '已复制' : 'Copied'}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>{isZh ? '复制' : 'Copy'}</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => speakText(msg.content)}
                                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                                <span>{isZh ? '朗读' : 'Read'}</span>
                              </button>
                            </div>
                            {msg.tokens ? <span className="font-mono text-[10px]">{msg.tokens} tokens</span> : <span />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && !streamingMessageId && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 dark:border-sky-400/30 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]">
                    <Bot className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] px-4 py-2.5 text-sm text-[var(--color-one-text-muted)]">
                    {isZh ? '正在极速响应…' : 'Generating…'}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* IME-Safe Bottom Input Bar */}
          <div className="shrink-0 border-t border-slate-200 dark:border-white/10 bg-[var(--color-one-surface-soft)]/80 px-3 py-2.5 sm:px-5 sm:py-3">
            <div className="mx-auto max-w-3xl space-y-2">
              {messages.length <= 2 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {starterChips.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleSend(chip)}
                      className="shrink-0 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.05] px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 transition hover:border-sky-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] p-1.5 pl-3 focus-within:border-sky-500 shadow-2xs transition-colors">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={promptInput}
                  enterKeyHint="send"
                  autoComplete="off"
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => {
                    // Never hijack Enter while Chinese/Japanese/Korean IME candidate bar is active!
                    const imeActive =
                      isComposingRef.current ||
                      e.nativeEvent.isComposing ||
                      (e as unknown as { keyCode?: number }).keyCode === 229;
                    if (imeActive) return;

                    if (e.key === 'Enter') {
                      if (enterToSend && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      } else if (!enterToSend && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }
                  }}
                  placeholder={
                    enterToSend
                      ? isZh
                        ? '输入内容…（中文输入法 Enter 选词，完成后 Enter 发送 / Shift+Enter 换行）'
                        : 'Message ONE… (Enter to send, Shift+Enter for newline)'
                      : isZh
                      ? '输入内容…（Enter 换行，Ctrl/Cmd + Enter 发送）'
                      : 'Message ONE… (Ctrl/Cmd + Enter to send)'
                  }
                  className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] sm:text-sm leading-6 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
                <div className="flex shrink-0 items-center gap-1 pb-1 pr-0.5">
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={`rounded-xl p-2 transition cursor-pointer ${
                      isListening
                        ? 'bg-sky-50 dark:bg-sky-500/20 text-[var(--color-one-accent)]'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={isZh ? '语音听写输入' : 'Dictate input'}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStopGenerating}
                      className="one-btn h-9 px-3 rounded-xl bg-rose-500 text-white text-xs font-medium hover:bg-rose-600 transition cursor-pointer"
                      title={isZh ? '停止生成' : 'Stop'}
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span className="hidden sm:inline">{isZh ? '停止' : 'Stop'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!promptInput.trim()}
                      className="one-btn one-btn-primary h-9 px-3.5 rounded-xl text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{isZh ? '发送' : 'Send'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
