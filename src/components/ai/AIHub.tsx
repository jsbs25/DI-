import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';
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
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
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
      model: '本地 AI 助手',
      timestamp: '刚刚',
      content: lang === 'zh'
        ? `你好，我是**本地 AI 助手**。

当前使用的模型显示在上方选择器中。回复会优先围绕你的问题，并参考当前对话。

你可以直接提问，也可以明确要求解释、写作或编程。`
        : `Hello, I'm your **local AI assistant**.

The model in use is shown in the selector above. I’ll focus on your question and use the current conversation as context.

Ask anything, or explicitly request an explanation, writing, or code.`
    }];
  });

  useEffect(() => {
    saveAIConversationHistory('earth-one-ai-hub:v1', messages);
  }, [messages]);

  // Load models on mount
  useEffect(() => {
    fetch('/api/ai/models')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.models)) {
          setAvailableModels(d.models);
          const activeDefault = d.models.find((m: any) => m.isDefault) ||
            d.models.find((m: any) => m.id.startsWith('ollama:')) ||
            d.models[0];
          if (activeDefault) {
            setSelectedModel(activeDefault.id);
          }
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
      alert(lang === 'zh' ? '当前浏览器不支持语音输入，请使用键盘输入。' : 'Voice input not supported in this browser.');
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
    let activeStreamId: string | null = null;

    try {
      const shouldStream = /^ollama:qwen3(?::|$)/i.test(selectedModel) && !customApiKey.trim();
      const payload: any = {
        prompt: textToSend,
        modelId: selectedModel,
        mode: 'general',
        history: messages.slice(-8).map(message => ({
          role: message.role,
          content: message.content
        })),
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
        setMessages(prev => [...prev, {
          id: activeStreamId!,
          role: 'assistant',
          content: '',
          model: selectedModel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        let replyContent = '';
        const streamResult = await readAIStream(res, delta => {
          setStreamingMessageId(activeStreamId);
          replyContent += delta;
          setMessages(prev => prev.map(message =>
            message.id === activeStreamId ? { ...message, content: message.content + delta } : message
          ));
        });
        setMessages(prev => prev.map(message =>
          message.id === activeStreamId
            ? { ...message, model: streamResult.model || selectedModel, tokens: streamResult.tokens }
            : message
        ));
        if (voiceOutput) speakText(replyContent);
        return;
      }

      const data = await res.json();
      const replyContent = data.success && data.reply
        ? data.reply
        : (data.error || '没有收到有效回复，请重试。');

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
    } catch (error) {
      const errorContent = error instanceof Error ? error.message : '与地球计划智能节点的网络连接受阻，请检查网络后重试。';
      if (activeStreamId) {
        setMessages(prev => prev.map(message =>
          message.id === activeStreamId ? { ...message, content: errorContent } : message
        ));
      } else {
        setMessages(prev => [...prev, {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          content: errorContent,
          model: selectedModel,
          timestamp: nowTime
        }]);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
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
          model: lang === 'zh' ? '本地 AI 助手' : 'Local AI Assistant',
          timestamp: '刚刚',
          content: lang === 'zh' ? '对话已重置。你想聊些什么？' : 'Chat reset. What would you like to talk about?'
        }
      ]);
    }
  };

  // Quick starter chips
  const starterChips = lang === 'zh' ? [
    '🔎 用简单例子解释什么是机器学习',
    '🗓️ 帮我把一项复杂任务拆成可执行步骤',
    '💻 写一个带输入校验的 TypeScript 函数',
    '✍️ 写一段温暖简短的母亲主题文章',
    '🌐 把“海内存知己，天涯若比邻”自然地翻译成英文'
  ] : [
    '🔎 Explain machine learning with a simple example',
    '🗓️ Break a complex task into actionable steps',
    '💻 Write a TypeScript function with input validation',
    '✍️ Write a short, warm piece about mothers',
    '🌐 Translate “A bosom friend afar brings a distant land near” naturally'
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
                  {lang === 'zh' ? '本地 AI 助手' : 'Local AI Assistant'}
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
                  <span>{isUser ? '您' : (msg.model || (lang === 'zh' ? '本地 AI 助手' : 'Local AI Assistant'))}</span>
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
        {isLoading && !streamingMessageId && (
          <div className="flex items-start gap-3.5 animate-in fade-in">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center bg-cyan-950 border border-cyan-500/40 text-cyan-400">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-3xl rounded-tl-none bg-[#0b1329] border border-cyan-500/30 text-cyan-300 text-xs flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span>{lang === 'zh' ? '正在生成回复…' : 'Generating a reply…'}</span>
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
