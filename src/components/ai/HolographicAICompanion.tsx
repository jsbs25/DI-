import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import {
  Sparkles,
  X,
  Send,
  Volume2,
  VolumeX,
  Bot,
  RotateCcw,
  Copy,
  Check,
  Mic,
  MicOff,
  Search,
  MessageSquare,
  Lightbulb,
  Zap,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';

interface HolographicAICompanionProps {
  lang: Language;
  showLauncher?: boolean;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
}

interface MessageItem {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  copied?: boolean;
}

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  showLauncher = true,
  onFlyTo,
  onExploreUniverse,
  onOpenAIHub
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMsg, setInputMsg] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [useSearch, setUseSearch] = useState(true);

  const initialGreeting = lang === 'zh'
    ? '你好！我是地球计划 3D 人工智能伙伴。本系统已接入 DeepSeek-R1 免费开源深度推理模型，你无需复杂指令，在这里直接向我提问即可：探讨哲学科学、编写代码、跨语言翻译或创意写作，我都随时与你对话。今天想聊些什么？'
    : 'Greetings! I am the Project Earth 3D AI companion. Connected to DeepSeek-R1 open reasoning engine. You can chat directly with me on science, philosophy, code, world cultures, or research. What would you like to explore today?';

  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'msg_welcome',
      sender: 'ai',
      text: initialGreeting,
      time: 'Just now'
    }
  ]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 150);
    }
  }, [isOpen, messages]);

  // 3D Holographic AI Sphere Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = 64;
    canvas.width = size;
    canvas.height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 2.4;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Outer wireframe glowing core
    const coreGeo = new THREE.IcosahedronGeometry(0.75, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Inner pulsating nucleus
    const nucGeo = new THREE.SphereGeometry(0.38, 16, 16);
    const nucMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    // Orbiting particle ring
    const ringGeo = new THREE.BufferGeometry();
    const count = 48;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      pos[i * 3] = Math.cos(angle) * 1.1;
      pos[i * 3 + 1] = Math.sin(angle) * 1.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ringMat = new THREE.PointsMaterial({ color: 0xa855f7, size: 0.08 });
    const ringMesh = new THREE.Points(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    scene.add(ringMesh);

    let t = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.02;

      const speedMultiplier = isThinkingRef.current ? 2.5 : 1.0;
      coreMesh.rotation.y += 0.015 * speedMultiplier;
      coreMesh.rotation.x += 0.008 * speedMultiplier;
      ringMesh.rotation.z += 0.02 * speedMultiplier;

      const scale = 1 + Math.sin(t * 3 * speedMultiplier) * (isThinkingRef.current ? 0.15 : 0.08);
      nucMesh.scale.set(scale, scale, scale);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, []);

  const isThinkingRef = useRef(isThinking);
  isThinkingRef.current = isThinking;

  // Speech Synthesis (TTS)
  const speak = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // fallback
    }
  };

  // Web Speech Recognition (Mic to Text)
  const toggleSpeechRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert(lang === 'zh' ? '当前浏览器不支持语音识别功能，请直接打字输入。' : 'Voice recognition is not supported in this browser.');
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
          setInputMsg(prev => prev ? `${prev} ${transcript}` : transcript);
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

  const handleCopyText = (msgId: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, copied: true } : m));
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, copied: false } : m));
      }, 2000);
    } catch {
      // ignore
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    const text = (overridePrompt || inputMsg).trim();
    if (!text || isThinking) return;

    if (!overridePrompt) setInputMsg('');
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [
      ...prev,
      { id: `user_${Date.now()}`, sender: 'user', text, time: nowTime }
    ]);
    setIsThinking(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          modelId: '',
          mode: 'general',
          useSearchGrounding: useSearch,
          history: messages.slice(-6).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          }))
        })
      });

      const data = await res.json();
      const replyText = data.success && data.reply
        ? data.reply
        : (data.error || (lang === 'zh'
          ? '地球计划 AI 思考完成。随时为你解答更多问题。'
          : 'Project Earth intelligence active. Ready for your next query.'));

      setMessages(prev => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      speak(replyText);
    } catch {
      const fallback = lang === 'zh'
        ? '星际网络节点通讯稍有延迟，已为你恢复对话就绪状态。请再试一次。'
        : 'Network transient. System ready for retry.';
      setMessages(prev => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: fallback,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsThinking(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        sender: 'ai',
        text: initialGreeting,
        time: 'Just now'
      }
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const quickStarters = lang === 'zh' ? [
    '💡 聊聊地球计划的愿景与开放生态',
    '✍️ 帮我构想一篇双语科技哲学随笔',
    '🔬 简述量子纠缠与空间虫洞的物理本质',
    '🌍 探讨从太空凝视地球的总观效应'
  ] : [
    '💡 Vision and open roadmap of Project Earth',
    '✍️ Draft an inspiring essay on planetary unity',
    '🔬 Explain quantum entanglement & spacetime',
    '🌍 How does cross-cultural dialogue build peace?'
  ];

  return (
    <div id="globe-ai-launcher" className="fixed bottom-6 right-6 z-40 select-none">
      {/* Floating 3D Holographic AI Widget Bubble */}
      {!isOpen && showLauncher && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={lang === 'zh' ? '打开地球计划 AI 对话' : 'Open Project Earth AI chat'}
          className="group relative flex items-center space-x-3 px-4 py-3 rounded-full bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/60 hover:border-cyan-400 backdrop-blur-2xl shadow-2xl shadow-cyan-500/25 cursor-pointer transition-all hover:scale-105 active:scale-95"
          title="点击直接与地球计划 AI 对话"
        >
          {/* Canvas for 3D Holographic Sphere */}
          <div className="relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-cyan-950/80 border border-cyan-400/40">
            <canvas ref={canvasRef} className="w-10 h-10" />
            <div className="absolute inset-0 rounded-full ring-1 ring-cyan-400/50 animate-pulse pointer-events-none" />
          </div>

          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold font-mono tracking-wider text-cyan-300">
                {lang === 'zh' ? '地球计划 AI' : 'PROJECT EARTH AI'}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-[11px] text-slate-300 font-medium">点击直接对话 →</div>
          </div>
        </button>
      )}

      {/* Expanded Direct Conversation Terminal */}
      {isOpen && (
        <div
          className={`rounded-3xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-2xl shadow-2xl shadow-cyan-950/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 transition-all duration-200 ${
            isExpanded
              ? 'fixed inset-4 sm:inset-12 z-50 w-auto h-auto max-w-5xl mx-auto'
              : 'w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-cyan-950 border border-cyan-500/60 shrink-0">
                <canvas ref={headerCanvasRef} className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-cyan-300">
                    {lang === 'zh' ? '地球计划 3D 智能助理' : 'Project Earth 3D AI'}
                  </h3>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/40 text-[9px] text-cyan-300 font-mono">
                    DeepSeek-R1
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">开源直连 · 深度思考 · 全球知识</p>
              </div>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-1.5">
              {/* Go to full AI Hub */}
              {onOpenAIHub && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenAIHub();
                  }}
                  className="p-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 cursor-pointer transition-colors"
                  title="打开全屏 AI 智能对话工作台"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Search Grounding Toggle */}
              <button
                onClick={() => setUseSearch(v => !v)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer text-xs flex items-center space-x-1 ${
                  useSearch
                    ? 'bg-cyan-950 border-cyan-500/60 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                title={useSearch ? '联网搜索已开启' : '联网搜索已关闭'}
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              {/* TTS Voice Toggle */}
              <button
                onClick={() => setVoiceEnabled(v => !v)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  voiceEnabled
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={voiceEnabled ? '关闭语音朗读' : '开启语音朗读'}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Clear chat */}
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                title="新建对话 / 清空聊天"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Expand / Minimize Window */}
              <button
                onClick={() => setIsExpanded(v => !v)}
                className="hidden sm:inline-flex p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                title={isExpanded ? '缩小窗口' : '全屏展开'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                title="关闭"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Conversation Starters */}
          <div className="px-3 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center space-x-1.5 overflow-x-auto text-[11px] no-scrollbar">
            {quickStarters.map((starter, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(starter.replace(/^[^\s]+\s/, ''))}
                className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/60 text-slate-300 shrink-0 cursor-pointer transition-all hover:scale-[1.02] text-[11px]"
              >
                {starter}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs leading-relaxed">
            {messages.map(m => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                >
                  <div className="flex items-center space-x-1.5 mb-1 px-1">
                    <span className="text-[10px] font-mono text-slate-500">
                      {isUser ? 'YOU' : (lang === 'zh' ? '地球计划 AI' : 'Project Earth AI')}
                    </span>
                    <span className="text-[9px] text-slate-600">· {m.time}</span>
                  </div>

                  <div
                    className={`relative max-w-[88%] p-3.5 rounded-2xl ${
                      isUser
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-slate-950 font-medium rounded-tr-sm shadow-md'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-inner'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                    {/* Copy and speech action for AI messages */}
                    {!isUser && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="text-slate-500 font-mono">DeepSeek-R1 / Qwen 2.5</span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => speak(m.text)}
                            className="hover:text-cyan-400 cursor-pointer transition-colors"
                            title="朗读回答"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleCopyText(m.id, m.text)}
                            className="hover:text-cyan-400 cursor-pointer transition-colors flex items-center space-x-0.5"
                            title="复制内容"
                          >
                            {m.copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{m.copied ? '已复制' : '复制'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex flex-col items-start">
                <div className="text-[10px] font-mono text-cyan-400 mb-1 px-1 flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 animate-spin" />
                  <span>{lang === 'zh' ? '地球计划 AI 正在深度思考...' : 'Project Earth AI is thinking...'}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-slate-300 rounded-tl-sm flex items-center space-x-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>正在调取知识网关生成深度回答...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Direct Input Deck */}
          <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="直接输入你想聊的话题、问题或创意..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors shadow-inner"
              />

              {/* Voice recognition mic */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
                title={isListening ? '点击停止录音' : '按住/点击语音说话'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputMsg.trim() || isThinking}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer transition-all shadow-md flex items-center space-x-1"
              >
                <span>发送</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>支持中/英/阿/西/法/俄多语言自由对话</span>
              <span>回车键发送 · 按 Esc 或右上角最小化</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
