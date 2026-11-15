import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
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

export const AIHub: React.FC<AIHubProps> = ({ lang }) => {
  const t = translations[lang];
  const isZh = lang === 'zh';

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; status: string; isDefault: boolean; apiKeyMasked: string; isFree?: boolean }>
  >([]);
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('http://localhost:11434/v1');
  const [customModel, setCustomModel] = useState('llama3');

  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
      model: isZh ? 'ONE INTELLIGENCE' : 'ONE INTELLIGENCE',
      timestamp: isZh ? '刚刚' : 'Now',
      content: isZh
        ? '欢迎来到 ONE INTELLIGENCE。\n\n你可以在这里进行对话、分析、写作与编程协作。当前可用模型显示在顶部选择器中；若连接本地 Ollama，可使用本地模型离线对话。\n\n请直接输入你的问题。'
        : 'Welcome to ONE INTELLIGENCE.\n\nUse this space for conversation, analysis, writing, and coding. Available models appear in the selector above; if local Ollama is connected, local models can be used offline.\n\nAsk anything to begin.'
    }];
  });

  useEffect(() => {
    saveAIConversationHistory('earth-one-ai-hub:v1', messages);
  }, [messages]);

  useEffect(() => {
    fetch('/api/ai/models')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.models)) {
          setAvailableModels(d.models);
          const activeDefault = d.models.find((m: any) => m.ollamaRole === 'chat') ||
            d.models.find((m: any) => m.isDefault) ||
            d.models.find((m: any) => m.id.startsWith('ollama:')) ||
            d.models[0];
          if (activeDefault) setSelectedModel(activeDefault.id);
        }
      })
      .catch(() => {});

    fetch('http://127.0.0.1:11434/api/tags')
      .then(r => r.json())
      .then(data => {
        if (data?.models && Array.isArray(data.models) && data.models.length > 0) {
          const localList = data.models.map((m: any, idx: number) => ({
            id: `ollama:${m.name}`,
            name: `${isZh ? '本地' : 'Local'} · ${m.name}`,
            status: 'active',
            isDefault: idx === data.models.length - 1,
            apiKeyMasked: '127.0.0.1:11434',
            isFree: true
          }));
          setAvailableModels(prev => {
            const ids = new Set(prev.map(p => p.id));
            const newOnes = localList.filter((l: any) => !ids.has(l.id));
            return [...newOnes, ...prev];
          });
          const chatOllama = localList[localList.length - 1];
          if (chatOllama) setSelectedModel(chatOllama.id);
        }
      })
      .catch(() => {});
  }, [isZh]);

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

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = 1.02;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  const handleCopy = (id: string, text: string) => {
    try {
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      navigator.clipboard.writeText(clean);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || promptInput).trim();
    if (!textToSend || isLoading) return;
    if (!overrideText) setPromptInput('');
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { id: `user_${Date.now()}`, role: 'user', content: textToSend, timestamp: nowTime };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    let activeStreamId: string | null = null;
    try {
      const shouldStream = /^ollama:qwen3(?::|$)/i.test(selectedModel) && !customApiKey.trim();
      const payload: any = {
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
        body: JSON.stringify(payload)
      });
      if (shouldStream) {
        activeStreamId = `ai_${Date.now()}`;
        setMessages(prev => [...prev, { id: activeStreamId!, role: 'assistant', content: '', model: selectedModel, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        let replyContent = '';
        const streamResult = await readAIStream(res, delta => {
          setStreamingMessageId(activeStreamId);
          replyContent += delta;
          setMessages(prev => prev.map(message => message.id === activeStreamId ? { ...message, content: message.content + delta } : message));
        });
        setMessages(prev => prev.map(message => message.id === activeStreamId ? { ...message, model: streamResult.model || selectedModel, tokens: streamResult.tokens } : message));
        if (voiceOutput) speakText(replyContent);
        return;
      }
      const data = await res.json();
      const replyContent = data.success && data.reply ? data.reply : (data.error || (isZh ? '没有收到有效回复，请重试。' : 'No valid reply received. Please try again.'));
      const aiMsg: Message = { id: `ai_${Date.now()}`, role: 'assistant', content: replyContent, model: data.model || selectedModel, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), tokens: data.tokens };
      setMessages(prev => [...prev, aiMsg]);
      if (voiceOutput) speakText(replyContent);
    } catch (error) {
      try {
        const rawModel = selectedModel.startsWith('ollama:') ? selectedModel.slice(7) : (customModel || 'llama3');
        const localRes = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: rawModel, messages: [{ role: 'user', content: textToSend }], stream: false })
        });
        if (localRes.ok) {
          const lData = await localRes.json();
          const localReply = lData?.message?.content || lData?.response || '';
          if (localReply) {
            setMessages(prev => [...prev, { id: `ai_${Date.now()}`, role: 'assistant', content: localReply, model: `${isZh ? '本地 Ollama' : 'Local Ollama'} (${rawModel})`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            if (voiceOutput) speakText(localReply);
            return;
          }
        }
      } catch {}
      const errorContent = error instanceof Error ? error.message : (isZh ? '请求失败。若使用本地模型，请确认 Ollama 已在本机运行。' : 'Request failed. If using a local model, ensure Ollama is running locally.');
      if (activeStreamId) {
        setMessages(prev => prev.map(message => message.id === activeStreamId ? { ...message, content: errorContent } : message));
      } else {
        setMessages(prev => [...prev, { id: `ai_err_${Date.now()}`, role: 'assistant', content: errorContent, model: selectedModel, timestamp: nowTime }]);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClearChat = () => {
    if (window.confirm(isZh ? '确定清空当前对话记录吗？' : 'Clear this conversation?')) {
      setMessages([{
        id: `msg_init_${Date.now()}`,
        role: 'assistant',
        model: 'ONE INTELLIGENCE',
        timestamp: isZh ? '刚刚' : 'Now',
        content: isZh ? '对话已重置。你想从哪里开始？' : 'Conversation reset. What would you like to explore?'
      }]);
    }
  };

  const starterChips = isZh ? [
    '解释一个复杂概念，并给出简单例子',
    '把这个任务拆解为可执行步骤',
    '用 TypeScript 写一个带校验的函数',
    '润色一段正式邮件',
    '将一段中文自然翻译成英文',
  ] : [
    'Explain a complex concept with a simple example',
    'Break this task into actionable steps',
    'Write a TypeScript function with validation',
    'Polish a formal email',
    'Translate a paragraph naturally',
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
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 py-4 sm:px-6 md:py-6">
        <header className="one-surface-subtle mb-4 flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/15 bg-sky-50 dark:bg-sky-500/15 text-[var(--color-one-accent)]"><Sparkles className="h-5 w-5" /></span>
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-2xl">ONE INTELLIGENCE</h1>
                <p className="text-sm text-[var(--color-one-text-muted)]">{isZh ? '对话、思考与创作协作空间。模型与连接状态以真实可用信息为准。' : 'A space for conversation, thinking, and creation. Models and connectivity reflect real availability.'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`one-badge ${ollamaConnected ? 'one-badge-accent' : 'one-badge-neutral'}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${ollamaConnected ? 'bg-[var(--color-one-accent)]' : 'bg-[var(--color-one-text-dim)]'}`} />
                {ollamaConnected ? (isZh ? '本地 Ollama 已检测' : 'Local Ollama detected') : (isZh ? '本地 Ollama 未检测' : 'Local Ollama not detected')}
              </span>
              <span className="one-badge one-badge-neutral">{isZh ? `消息 ${messages.length}` : `${messages.length} messages`}</span>
              <span className="one-badge one-badge-neutral">{isZh ? '本地会话记录已保存' : 'Conversation history saved locally'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[220px] sm:flex-none">
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 pr-9 text-sm text-slate-900 dark:text-white outline-none transition focus:border-sky-500"
                aria-label={isZh ? '选择模型' : 'Select model'}
              >
                {availableModels.length === 0 ? (
                  <option value="">{isZh ? '未获取到模型列表' : 'No models loaded'}</option>
                ) : (
                  availableModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.isFree ? '• ' : ''}{m.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            </div>

            <button type="button" onClick={() => setVoiceOutput(!voiceOutput)} className={`one-btn one-btn-sm ${voiceOutput ? 'one-btn-primary' : 'one-btn-secondary'}`} title={isZh ? '语音朗读' : 'Voice output'}>
              {voiceOutput ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setShowConfigDrawer(!showConfigDrawer)} className={`one-btn one-btn-sm ${showConfigDrawer ? 'one-btn-primary' : 'one-btn-secondary'}`} title={isZh ? '模型与接口设置' : 'Model settings'}>
              <Settings2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={handleClearChat} className="one-btn one-btn-secondary one-btn-sm" title={isZh ? '清空对话' : 'Clear conversation'}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {showConfigDrawer && (
          <div className="one-surface-subtle mb-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white"><Cpu className="h-4 w-4 text-[var(--color-one-accent)]" />{isZh ? '自定义 OpenAI 兼容接口 / 本地 Ollama' : 'Custom OpenAI-compatible endpoint / Local Ollama'}</div>
              <button onClick={() => setShowConfigDrawer(false)} className="text-xs text-[var(--color-one-text-muted)] hover:text-slate-900 dark:hover:text-white">{isZh ? '收起' : 'Close'}</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-[var(--color-one-text-dim)]">Base URL</span>
                <input type="text" value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500" placeholder="http://localhost:11434/v1" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-[var(--color-one-text-dim)]">{isZh ? '模型名称' : 'Model name'}</span>
                <input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500" placeholder="llama3 / deepseek-r1" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-[var(--color-one-text-dim)]">API Key</span>
                <input type="password" value={customApiKey} onChange={e => setCustomApiKey(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 dark:border-white/15 bg-[var(--color-one-surface-soft)] px-3 text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500" placeholder={isZh ? '本地 Ollama 可留空' : 'Optional for local Ollama'} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-one-text-muted)]">
              <span>{isZh ? '使用本地 Ollama 时请确保服务已运行（默认 127.0.0.1:11434）。' : 'For local Ollama, ensure the service is running (default 127.0.0.1:11434).'}</span>
              <button type="button" onClick={() => { setSelectedModel('custom'); setShowConfigDrawer(false); }} className="one-btn one-btn-primary one-btn-sm">{isZh ? '使用自定义模型' : 'Use custom model'}</button>
            </div>
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
                      <div className={`mb-1 flex items-center gap-2 px-1 text-[11px] text-[var(--color-one-text-dim)] ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span>{isUser ? (isZh ? '你' : 'You') : (msg.model || 'ONE INTELLIGENCE')}</span>
                        <span>·</span>
                        <span>{msg.timestamp}</span>
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
                  <div className="rounded-2xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-[var(--color-one-text-muted)]">{isZh ? '正在生成回复…' : 'Generating response…'}</div>
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

              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] p-2 focus-within:border-sky-500 shadow-sm">
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
                  placeholder={isZh ? '输入消息…（Enter 发送，Shift+Enter 换行）' : 'Message ONE INTELLIGENCE… (Enter to send, Shift+Enter for newline)'}
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
                <div className="flex items-center gap-1 pb-0.5 pr-0.5">
                  <button type="button" onClick={toggleSpeechRecognition} className={`rounded-xl p-2.5 transition ${isListening ? 'bg-sky-50 dark:bg-sky-500/20 text-[var(--color-one-accent)]' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`} title={isZh ? '语音输入' : 'Voice input'}>
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => void handleSend()} disabled={!promptInput.trim() || isLoading} className="one-btn one-btn-primary one-btn-sm disabled:cursor-not-allowed disabled:opacity-40">
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{isZh ? '发送' : 'Send'}</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-one-text-dim)]">{isZh ? '回复基于所选模型与当前会话上下文；能力与可用性取决于已配置的真实服务。' : 'Responses depend on the selected model and current conversation context; capabilities reflect configured, available services.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
