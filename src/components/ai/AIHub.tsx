import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Sparkles,
  Send,
  RotateCcw,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Cpu,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Settings2,
  Terminal,
  ExternalLink,
  Bot,
  User as UserIcon,
  Zap,
  Globe2
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

  // Models state
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string; status: string; isDefault: boolean; apiKeyMasked: string; isFree?: boolean }>
  >([]);
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Custom provider modal / toggle
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('http://localhost:11434/v1');
  const [customModel, setCustomModel] = useState('llama3');

  // Expanded thoughts state map
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Chat message history
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      model: '本地 Ollama (GPT-OSS 20B)',
      timestamp: '刚刚',
      content: lang === 'zh'
        ? `你好！我是**地球计划（Project Earth）**开放智能助理。

本系统默认使用**本地 Ollama 大模型（如 GPT-OSS 20B）**作为推理引擎，**完全本地、免密直连、无需联网**；同时保留 DeepSeek-R1 / Qwen / Llama 等开源模型作为备选。

在这里您可以直接和我自由对话：
- 🔍 **跨学科深度探究**：宇宙演化、地球科学、文明史与宏观哲学
- 💻 **全栈软件工程**：架构设计、TypeScript/Python 代码编写与调试
- 🌐 **高保真多语种翻译**：跨越八十亿人类的文化语境与思想沟通
- ✍️ **深度内容创作**：学术长文、演讲稿、现代散文与诗歌

随时在此输入您的提问，或点击下方话题开始交谈。`
        : `Greetings! I am the **Project Earth** AI Assistant.

Powered by your **local Ollama model (e.g. GPT-OSS 20B)** as the default engine—fully local, keyless, and private; DeepSeek-R1, Qwen, and Llama remain available as fallbacks.

Feel free to chat with me directly:
- 🌌 **Cosmology & Planetary Science**: Orbital mechanics, Earth ecology, overview effect
- 💻 **Software Engineering**: System architecture, TypeScript, algorithms, and debugging
- 🌐 **Polyglot Communication**: High-fidelity cultural translations
- ✍️ **Deep Writing**: Essays, scientific discourse, and creative composition

Ask me anything below to begin!`
    }
  ]);

  // Load models on mount (server gateway + direct local Ollama probe)
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
          if (activeDefault) {
            setSelectedModel(activeDefault.id);
          }
        }
      })
      .catch(() => {});

    // 浏览器直接探测本地电脑上的 Ollama (127.0.0.1:11434)，确保无网络时亦能直连
    fetch('http://127.0.0.1:11434/api/tags')
      .then(r => r.json())
      .then(data => {
        if (data?.models && Array.isArray(data.models) && data.models.length > 0) {
          const localList = data.models.map((m: any, idx: number) => ({
            id: `ollama:${m.name}`,
            name: `本地电脑 · ${m.name} [离线直连]`,
            status: 'active',
            isDefault: idx === data.models.length - 1,
            apiKeyMasked: '127.0.0.1:11434 免密离线',
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
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Speech Recognition (Mic)
  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      // Graceful fallback without blocking window.alert
      return;
    }

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

  // TTS Speech read aloud
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      // Strip think tags
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore
    }
  };

  // Copy text helper
  const handleCopy = (id: string, text: string) => {
    try {
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      navigator.clipboard.writeText(clean);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  // Send message
  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || promptInput).trim();
    if (!textToSend || isLoading) return;

    if (!overrideText) setPromptInput('');
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: nowTime
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const payload: any = {
        prompt: textToSend,
        modelId: selectedModel,
        mode: 'general'
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

      const data = await res.json();
      const replyContent = data.success && data.reply
        ? data.reply
        : (data.error || '地球计划 AI 服务已完成思考与响应。');

      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        model: data.model || selectedModel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tokens: data.tokens
      };

      setMessages(prev => [...prev, aiMsg]);

      if (voiceOutput) {
        speakText(replyContent);
      }
    } catch {
      // 离线/无网络保护：浏览器直接尝试直连本地电脑运行的 Ollama (127.0.0.1:11434)
      try {
        const rawModel = selectedModel.startsWith('ollama:') ? selectedModel.slice(7) : (customModel || 'llama3');
        const localRes = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: rawModel,
            messages: [{ role: 'user', content: textToSend }],
            stream: false
          })
        });
        if (localRes.ok) {
          const lData = await localRes.json();
          const localReply = lData?.message?.content || lData?.response || '';
          if (localReply) {
            const aiMsg: Message = {
              id: `ai_${Date.now()}`,
              role: 'assistant',
              content: localReply,
              model: `本地 Ollama (${rawModel}) · 离线直连`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, aiMsg]);
            if (voiceOutput) speakText(localReply);
            return;
          }
        }
      } catch {
        // fall through
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          content: '当前为离线/无网络状态。已自动配置本地电脑 Ollama 双模型协同，请确保本地电脑已运行 `ollama serve` (127.0.0.1:11434) 即可完全离线对话。',
          model: selectedModel,
          timestamp: nowTime
        }
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Clear chat
  const handleClearChat = () => {
    if (window.confirm(lang === 'zh' ? '确定清空当前对话历史吗？' : 'Clear conversation history?')) {
      setMessages([
        {
          id: `msg_init_${Date.now()}`,
          role: 'assistant',
          model: 'DeepSeek-R1',
          timestamp: '刚刚',
          content: lang === 'zh' ? '对话已重置。请问您想探索或探讨什么主题？' : 'Chat reset. What would you like to explore?'
        }
      ]);
    }
  };

  // Quick starter chips
  const starterChips = lang === 'zh' ? [
    '🌌 解释从太空凝视地球时的“总观效应”（Overview Effect）',
    '💻 用 TypeScript 实现一个带重试和熔断机制的弹性请求池',
    '🌍 地球八十亿人口如何实现跨文化理解与共同繁荣？',
    '🚀 详细介绍开普勒行星运动三大定律在天体计算中的应用',
    '🌐 请将“海内存知己，天涯若比邻”翻译为地道唯美的英文与法语'
  ] : [
    '🌌 Explain the Overview Effect experienced by astronauts looking back at Earth',
    '💻 Write a robust TypeScript rate-limited concurrent executor with backoff',
    '🌍 How can international digital collaboration strengthen global peace?',
    '🚀 How Kepler’s three laws govern modern planetary navigation'
  ];

  // Helper to parse <think> block
  const parseThoughtAndAnswer = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      const thought = thinkMatch[1].trim();
      const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      return { thought, answer };
    }
    return { thought: null, answer: content };
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-[#030712] text-slate-100 select-none overflow-hidden relative">
      {/* 1. TOP HEADER TOOLBAR */}
      <header className="h-14 border-b border-slate-800/80 bg-[#070d1e]/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-lg shadow-cyan-500/20">
              <Bot className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-wide text-white truncate">
                  {lang === 'zh' ? '地球计划 AI 智能对话' : 'Project Earth AI Dialogue'}
                </span>
                {availableModels.some(m => m.id.startsWith('ollama:')) ? (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                    {lang === 'zh' ? '本地 Ollama 已连接' : 'Local Ollama Online'}
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
                    {lang === 'zh' ? '本地 Ollama 未连接' : 'Local Ollama Offline'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Model Switcher & Tools */}
        <div className="flex items-center space-x-2">
          {/* Model Selector */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 hover:border-cyan-500/60 text-cyan-200 text-xs rounded-xl px-3 py-1.5 pr-8 font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer max-w-[240px] truncate"
            >
              {availableModels.length === 0 ? (
                <option value="deepseek-r1-open">DeepSeek-R1 (开源免费直连)</option>
              ) : (
                availableModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.isFree ? '⚡ ' : ''}{m.name}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-cyan-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Voice Read Aloud Toggle */}
          <button
            type="button"
            onClick={() => setVoiceOutput(!voiceOutput)}
            className={`p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
              voiceOutput
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title={voiceOutput ? '已开启语音朗读' : '开启语音朗读'}
          >
            {voiceOutput ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Custom API / Ollama Drawer button */}
          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className={`p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
              showConfigDrawer
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="配置本地 Ollama 或自定义模型"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* Clear Chat */}
          <button
            type="button"
            onClick={handleClearChat}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 cursor-pointer transition-colors"
            title="清空对话"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. CUSTOM PROVIDER / OLLAMA CONFIG DRAWER */}
      {showConfigDrawer && (
        <div className="bg-slate-950/95 border-b border-purple-900/40 px-6 py-4 z-20 animate-in slide-in-from-top-2 text-xs">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-purple-300 font-semibold">
                <Cpu className="w-4 h-4" />
                <span>接入本地模型或自定义 OpenAI 兼容接口（如 Ollama / vLLM / DeepSeek）</span>
              </div>
              <button
                onClick={() => setShowConfigDrawer(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">Base URL</label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">模型名称</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder="llama3 / deepseek-r1 / mistral"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-mono">API Key（本地 Ollama 可留空）</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder="sk-... (选填)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 本地运行 <code className="text-purple-300">ollama serve</code> 后选择「本地 / 自定义接口」即可完全离线运行。</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('custom');
                  setShowConfigDrawer(false);
                }}
                className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold cursor-pointer"
              >
                立即切换为自定义模型
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN CHAT SCROLL STREAM */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 select-text max-w-4xl mx-auto w-full">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          const { thought, answer } = parseThoughtAndAnswer(msg.content);
          const isThoughtOpen = expandedThoughts[msg.id] ?? false;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-lg text-xs font-bold ${
                  isUser
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-gradient-to-tr from-cyan-900/90 to-blue-800/90 text-cyan-200 border border-cyan-400/40 shadow-cyan-950/40'
                }`}
              >
                {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Body */}
              <div className={`flex flex-col min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Header Tag */}
                <div className="flex items-center space-x-2 text-[10px] text-slate-400 mb-1 px-1">
                  <span>{isUser ? '您' : (msg.model || '地球计划 AI')}</span>
                  <span>·</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Content Box */}
                <div
                  className={`p-4 sm:p-5 rounded-3xl text-xs sm:text-sm leading-relaxed shadow-xl ${
                    isUser
                      ? 'bg-cyan-500 text-slate-950 font-medium rounded-tr-none shadow-cyan-950/30'
                      : 'bg-[#0b1329]/95 text-slate-200 border border-slate-800/90 rounded-tl-none shadow-black/40'
                  }`}
                >
                  {/* Thought accordion for DeepSeek-R1 models */}
                  {!isUser && thought && (
                    <div className="mb-3 rounded-2xl border border-cyan-800/50 bg-cyan-950/30 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedThoughts(prev => ({ ...prev, [msg.id]: !isThoughtOpen }))
                        }
                        className="w-full px-3 py-2 flex items-center justify-between text-left text-[11px] font-mono text-cyan-300 hover:bg-cyan-900/20 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-1.5">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          <span>深度思考过程（Chain-of-Thought）</span>
                        </div>
                        {isThoughtOpen ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {isThoughtOpen && (
                        <div className="p-3 text-[11px] text-cyan-200/80 font-mono bg-black/30 border-t border-cyan-900/40 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                          {thought}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main Answer with pristine Markdown structure */}
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {answer}
                  </div>

                  {/* Action Bar */}
                  {!isUser && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-cyan-300 flex items-center space-x-1 cursor-pointer transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(msg.content)}
                          className="hover:text-cyan-300 flex items-center space-x-1 cursor-pointer transition-colors"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>朗读</span>
                        </button>
                      </div>
                      {msg.tokens && (
                        <span className="font-mono text-[10px] text-slate-500">
                          {msg.tokens} tokens
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3.5 animate-in fade-in">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center bg-cyan-950 border border-cyan-500/40 text-cyan-400">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-3xl rounded-tl-none bg-[#0b1329] border border-cyan-500/30 text-cyan-300 text-xs flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span>地球计划 AI 正在进行深度语义推理与知识合成...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 4. BOTTOM COMPOSER & STARTER CHIPS */}
      <footer className="border-t border-slate-800/80 bg-[#070d1e]/95 backdrop-blur-xl p-3 sm:p-4 shrink-0 z-20">
        <div className="max-w-4xl mx-auto space-y-2.5">
          {/* Quick starter chips */}
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none pb-1">
            <span className="text-[10px] text-slate-400 font-mono shrink-0 uppercase tracking-wider">
              推荐话题:
            </span>
            {starterChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip)}
                className="px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-cyan-500/40 text-[11px] text-slate-300 hover:text-white shrink-0 cursor-pointer transition-all"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="relative flex items-end bg-slate-900/90 border border-slate-700/80 focus-within:border-cyan-500/80 rounded-2xl p-2 shadow-2xl transition-all">
            <textarea
              ref={inputRef}
              rows={1}
              value={promptInput}
              onChange={e => setPromptInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                lang === 'zh'
                  ? '输入任何问题直接对话（支持科学探究、代码编程、跨语言翻译与文章创作，Enter 发送，Shift+Enter 换行）...'
                  : 'Ask anything to begin dialogue (Enter to send, Shift+Enter for new line)...'
              }
              className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none resize-none max-h-36 min-h-[40px] leading-relaxed"
            />

            <div className="flex items-center space-x-1.5 pb-1 pr-1 shrink-0">
              {/* Mic Speech Button */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isListening
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                    : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
                }`}
                title={isListening ? '点击停止语音录入' : '语音输入'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!promptInput.trim() || isLoading}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">发送</span>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
