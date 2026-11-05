import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import {
  Sparkles,
  X,
  Send,
  Volume2,
  VolumeX,
  RotateCcw,
  Copy,
  Check,
  Mic,
  MicOff,
  Search,
  Maximize2,
  Minimize2,
  ExternalLink,
  Cpu,
  Radio,
  Sliders,
  MessageSquare,
  Activity,
  Globe2,
  Play,
  Square
} from 'lucide-react';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  showLauncher?: boolean;
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
  onFlyTo,
  onExploreUniverse,
  onOpenAIHub,
  showLauncher = true
}) => {
  const isZh = lang === 'zh';
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'manage'>('chat');
  const [inputMsg, setInputMsg] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true); // Default true so user voice response works
  const [isListening, setIsListening] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  // Model parameters (Management Console)
  const [temperature, setTemperature] = useState(0.7);
  const [modelName, setModelName] = useState('DeepSeek-R1 (开源深度推理)');

  const initialGreeting = isZh
    ? '你好！我是地球计划 3D 人工智能中枢。系统已直连 DeepSeek-R1 免费开源深度推理模型与全球知识库，已为您就绪语音交互与管理控制台模式。你可以随时向我提问、探讨科学、编写代码或开启语音对话。'
    : 'Greetings! I am the Project Earth 3D AI Intelligence Console. Direct open connection with DeepSeek-R1 reasoning engine and global planetary knowledge base. Ready for voice and mission dialogue.';

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
  }, [isOpen, messages, activeTab]);

  // Notice auto-dismiss
  useEffect(() => {
    if (systemNotice) {
      const timer = setTimeout(() => setSystemNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [systemNotice]);

  // 3D Holographic AI Sphere
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = 56;
    canvas.width = size;
    canvas.height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 2.4;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const coreGeo = new THREE.IcosahedronGeometry(0.75, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    const nucGeo = new THREE.SphereGeometry(0.38, 16, 16);
    const nucMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    let t = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.025;
      coreMesh.rotation.y += 0.02;
      coreMesh.rotation.x += 0.01;
      const s = 1 + Math.sin(t * 3) * 0.1;
      nucMesh.scale.set(s, s, s);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, []);

  // Speech Synthesis (TTS) - robust with active state
  const speak = useCallback((text: string, msgId?: string) => {
    if (!('speechSynthesis' in window)) {
      setSystemNotice(isZh ? '您的浏览器不支持语音朗读' : 'Speech synthesis not supported in this browser');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      if (speakingMsgId && speakingMsgId === msgId) {
        setSpeakingMsgId(null);
        return;
      }

      // Strip think tags and code blocks for cleaner speech
      const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[\s\S]*?```/g, isZh ? '此处有一段代码' : 'code snippet').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 500));
      utterance.lang = isZh ? 'zh-CN' : 'en-US';
      utterance.rate = 1.05;

      if (msgId) setSpeakingMsgId(msgId);

      utterance.onend = () => setSpeakingMsgId(null);
      utterance.onerror = () => setSpeakingMsgId(null);

      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingMsgId(null);
    }
  }, [isZh, speakingMsgId]);

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  };

  // Robust Speech Recognition
  const toggleSpeechRecognition = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSystemNotice(isZh ? '当前浏览器环境未开放麦克风语音识别，请直接键入问题。' : 'Microphone speech recognition not available; please type your message.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = isZh ? 'zh-CN' : 'en-US';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsListening(true);
        setSystemNotice(isZh ? '🎙️ 正在聆听您的声音，请讲话...' : '🎙️ Listening to your voice...');
      };

      rec.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((result: any) => result[0].transcript)
          .join('');
        if (transcript) {
          setInputMsg(transcript);
        }
      };

      rec.onerror = (e: any) => {
        setIsListening(false);
        const errType = e.error;
        if (errType === 'not-allowed') {
          setSystemNotice(isZh ? '麦克风权限未开启，请在浏览器地址栏允许麦克风访问' : 'Microphone permission denied. Please allow microphone access.');
        } else if (errType !== 'no-speech') {
          setSystemNotice(isZh ? `语音识别提示: ${errType}` : `Speech recognition error: ${errType}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      setIsListening(false);
      setSystemNotice(isZh ? '启动麦克风失败，请直接打字输入。' : 'Failed to start microphone. Please type directly.');
    }
  };

  const handleCopyText = (msgId: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, copied: true } : m));
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, copied: false } : m));
      }, 2000);
    } catch {}
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
          modelId: 'deepseek-r1-open',
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
        : (data.error || (isZh ? '地球计划 AI 思考完成。随时为你解答更多问题。' : 'Project Earth intelligence active. Ready for your next query.'));

      const newMsgId = `ai_${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          id: newMsgId,
          sender: 'ai',
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      if (voiceEnabled || activeTab === 'voice') {
        speak(replyText, newMsgId);
      }
    } catch {
      const fallback = isZh
        ? '星际网络节点通讯稍有延迟，已为你恢复就绪状态。请再试一次。'
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
    stopSpeaking();
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

  const quickStarters = isZh ? [
    '💡 地球计划的愿景与开放生态',
    '🔬 简述深空探测与引力透镜',
    '💻 写一段 Python 实时轨道开普勒方程求解',
    '🌍 探讨太空俯瞰的总观效应'
  ] : [
    '💡 Vision and open roadmap of Project Earth',
    '🔬 Explain gravitational lensing & black holes',
    '💻 Python Kepler orbit solver code',
    '🌍 Overview effect from planetary orbit'
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40 select-none">
      {/* Floating 3D Holographic AI Widget Capsule */}
      {!isOpen && showLauncher && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center space-x-3 px-4 py-2.5 rounded-full bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/50 hover:border-cyan-400 backdrop-blur-2xl shadow-2xl shadow-cyan-500/20 cursor-pointer transition-all hover:scale-105 active:scale-95"
          title="打开地球计划 3D 智能管理中枢"
        >
          <div className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-cyan-950/80 border border-cyan-400/40">
            <canvas ref={canvasRef} className="w-8 h-8" />
            <div className="absolute inset-0 rounded-full ring-1 ring-cyan-400/50 animate-pulse pointer-events-none" />
          </div>

          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold font-mono tracking-wider text-cyan-300">
                {isZh ? '地球计划 AI 控制中枢' : 'PROJECT EARTH AI'}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-[10px] text-slate-400 font-medium">DeepSeek-R1 · 语音已就绪</div>
          </div>
        </button>
      )}

      {/* Expanded Direct Conversation & Management Console */}
      {isOpen && (
        <div
          className={`rounded-3xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-2xl shadow-2xl shadow-cyan-950/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 transition-all duration-200 ${
            isExpanded
              ? 'fixed inset-4 sm:inset-10 z-50 w-auto h-auto max-w-5xl mx-auto'
              : 'w-[92vw] sm:w-[440px] h-[600px] max-h-[86vh]'
          }`}
        >
          {/* Mission Control Top Bar */}
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-cyan-300">
                    {isZh ? 'AI 智能管理控制台' : 'AI MISSION CONSOLE'}
                  </h3>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] text-emerald-300 font-mono flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ONLINE
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">MODEL: DeepSeek-R1 · LATENCY: 86ms</p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Fullscreen AI Hub */}
              {onOpenAIHub && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenAIHub();
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer transition-colors"
                  title="打开全屏 AI 智能工作台"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Expand / Minimize */}
              <button
                onClick={() => setIsExpanded(v => !v)}
                className="hidden sm:inline-flex p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title={isExpanded ? '缩小窗口' : '全屏展开'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              {/* Close */}
              <button
                onClick={() => {
                  stopSpeaking();
                  setIsOpen(false);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
                title="关闭"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Management Sub-Tabs (Clean & Organized) */}
          <div className="px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span>{isZh ? '直接对话' : 'Dialogue'}</span>
              </button>

              <button
                onClick={() => setActiveTab('voice')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'voice'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>{isZh ? '实时语音模式' : 'Voice Mode'}</span>
              </button>

              <button
                onClick={() => setActiveTab('manage')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'manage'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>{isZh ? '中枢管理' : 'Config'}</span>
              </button>
            </div>

            <button
              onClick={clearChat}
              className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
              title="清空对话历史"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* In-app Toast / Status Notice */}
          {systemNotice && (
            <div className="px-4 py-2 bg-cyan-950/90 border-b border-cyan-500/40 text-cyan-200 text-xs flex items-center justify-between animate-in fade-in">
              <span>{systemNotice}</span>
              <button onClick={() => setSystemNotice(null)} className="text-cyan-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Tab 1: Direct Dialogue View */}
          {activeTab === 'chat' && (
            <>
              {/* Quick Prompt Pills */}
              <div className="px-3 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center space-x-1.5 overflow-x-auto text-[11px] scrollbar-none">
                {quickStarters.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(starter.replace(/^[^\s]+\s/, ''))}
                    className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/60 text-slate-300 shrink-0 cursor-pointer transition-all text-[11px]"
                  >
                    {starter}
                  </button>
                ))}
              </div>

              {/* Message Stream */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs leading-relaxed">
                {messages.map(m => {
                  const isUser = m.sender === 'user';
                  const isCurrentSpeaking = speakingMsgId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                    >
                      <div className="flex items-center space-x-1.5 mb-1 px-1">
                        <span className="text-[10px] font-mono text-slate-500">
                          {isUser ? 'YOU' : (isZh ? '地球计划 AI' : 'Project Earth AI')}
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

                        {!isUser && (
                          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-slate-500 font-mono">DeepSeek-R1</span>
                            <div className="flex items-center space-x-3">
                              {/* Dedicated Speak Button */}
                              <button
                                type="button"
                                onClick={() => isCurrentSpeaking ? stopSpeaking() : speak(m.text, m.id)}
                                className={`flex items-center space-x-1 cursor-pointer transition-colors ${
                                  isCurrentSpeaking ? 'text-amber-400 animate-pulse' : 'hover:text-cyan-400 text-slate-400'
                                }`}
                                title={isCurrentSpeaking ? '停止朗读' : '朗读回答'}
                              >
                                {isCurrentSpeaking ? <Square className="w-3 h-3 fill-amber-400" /> : <Volume2 className="w-3 h-3" />}
                                <span>{isCurrentSpeaking ? (isZh ? '停止' : 'Stop') : (isZh ? '朗读' : 'Play')}</span>
                              </button>

                              {/* Copy Button */}
                              <button
                                type="button"
                                onClick={() => handleCopyText(m.id, m.text)}
                                className="hover:text-cyan-400 cursor-pointer transition-colors flex items-center space-x-1 text-slate-400"
                                title="复制内容"
                              >
                                {m.copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{m.copied ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}</span>
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
                      <span>{isZh ? '地球计划 AI 正在深度思考...' : 'Project Earth AI is reasoning...'}</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-slate-300 rounded-tl-sm flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span>调用开源推理引擎生成深度解析...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input Command Dock */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMsg}
                    onChange={e => setInputMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder={isZh ? "直接输入问题、科学探索或代码需求..." : "Type question or mission query..."}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors shadow-inner"
                  />

                  {/* Microphone Speech Recognition Button */}
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

                  {/* Send Button */}
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputMsg.trim() || isThinking}
                    className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Tab 2: Dedicated Real-Time Voice Mode */}
          {activeTab === 'voice' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-between text-center overflow-y-auto">
              <div className="space-y-2 pt-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-mono">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  <span>VOICE REASONING LINK</span>
                </div>
                <h3 className="text-base font-bold text-white">
                  {isZh ? '地球计划 实时双向语音空间' : 'Project Earth Real-Time Voice'}
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {isZh
                    ? '点击下方麦克风开启语音对话，AI 思考完成后将自动以自然语音为您朗读。'
                    : 'Tap microphone to speak. Responses will be spoken back seamlessly.'}
                </p>
              </div>

              {/* Pulsing Visualizer Core */}
              <div className="my-8 flex flex-col items-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={`w-28 h-28 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isListening
                        ? 'bg-rose-600 text-white shadow-2xl shadow-rose-500/50 scale-110 animate-pulse'
                        : 'bg-gradient-to-tr from-cyan-600 to-purple-600 text-white shadow-2xl shadow-cyan-500/30 hover:scale-105'
                    }`}
                  >
                    {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                  </button>
                  {isListening && (
                    <div className="absolute -inset-4 rounded-full border-2 border-rose-400/60 animate-ping pointer-events-none" />
                  )}
                </div>

                <div className="mt-6 flex items-center gap-1 h-8">
                  {[40, 70, 90, 50, 80, 100, 60, 85, 45, 95, 75, 55].map((h, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${
                        isListening
                          ? 'bg-rose-400 animate-pulse'
                          : speakingMsgId
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-slate-700'
                      }`}
                      style={{ height: isListening || speakingMsgId ? `${h}%` : '20%' }}
                    />
                  ))}
                </div>

                <div className="mt-3 text-xs font-mono text-slate-400">
                  {isListening
                    ? (isZh ? '正在聆听您的输入...' : 'Listening...')
                    : speakingMsgId
                    ? (isZh ? 'AI 正在语音朗读中...' : 'Speaking...')
                    : (isZh ? '点击中心光圈开始语音对话' : 'Tap to start voice')}
                </div>
              </div>

              <div className="w-full flex items-center justify-center gap-3 pb-2">
                <button
                  type="button"
                  onClick={() => speak(messages[messages.length - 1]?.text || initialGreeting)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isZh ? '朗读上一条回复' : 'Replay Last Reply'}</span>
                </button>
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{isZh ? '静音停止' : 'Mute/Stop'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Management Console & System Configuration */}
          {activeTab === 'manage' && (
            <div className="flex-1 p-5 space-y-4 overflow-y-auto text-xs text-slate-300">
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{isZh ? '核心模型网关' : 'Model Gateway'}</span>
                  <span className="text-[10px] font-mono text-cyan-400">STATUS: HEALTHY</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">主力推理引擎</div>
                    <div className="font-semibold text-slate-200 mt-0.5">DeepSeek-R1 (开源)</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">知识联网检索</div>
                    <div className="font-semibold text-emerald-400 mt-0.5">ENABLED (ACTIVE)</div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white">{isZh ? '自动语音朗读 (TTS)' : 'Auto TTS'}</div>
                    <div className="text-[10px] text-slate-500">收到 AI 回答时自动触发高保真语音朗读</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      voiceEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      voiceEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                  <div>
                    <div className="font-bold text-white">{isZh ? '全球知识联网搜索' : 'Web Search Grounding'}</div>
                    <div className="text-[10px] text-slate-500">实时检索全球最新科学与时事动态</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseSearch(!useSearch)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      useSearch ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      useSearch ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Action Jump to Full AI Hub */}
              {onOpenAIHub && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenAIHub();
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{isZh ? '进入全屏地球计划人工智能工作台' : 'Open Fullscreen AI Studio'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
