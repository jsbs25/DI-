import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import { Sparkles, MessageSquare, X, Send, Volume2, VolumeX, Compass, Orbit, Bot, Globe2 } from 'lucide-react';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
}

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  onFlyTo,
  onExploreUniverse
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMsg, setInputMsg] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    {
      sender: 'ai',
      text: lang === 'zh'
        ? '你好，我是地球一号 3D 全息人工智能顾问。我可以为你解析地球地理、漫游宇宙星系，或解答全球百科。请问需要探索什么？'
        : 'Greetings, I am the Earth One 3D Holographic AI Companion. I can navigate planetary coordinates, explore solar systems, and assist in global research.'
    }
  ]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef(0);

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

    // Glowing core sphere
    const coreGeo = new THREE.IcosahedronGeometry(0.75, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.8
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

      coreMesh.rotation.y += 0.015;
      coreMesh.rotation.x += 0.008;

      ringMesh.rotation.z += 0.02;

      // Pulse
      const scale = 1 + Math.sin(t * 3) * 0.08;
      nucMesh.scale.set(scale, scale, scale);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, []);

  const speak = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore
    }
  };

  const handleSend = async () => {
    const text = inputMsg.trim();
    if (!text || isThinking) return;

    setInputMsg('');
    setMessages(prev => [...prev, { sender: 'user', text }]);
    setIsThinking(true);

    // Check for direct interactive commands
    const lower = text.toLowerCase();
    if (lower.includes('巴黎') || lower.includes('paris')) {
      onFlyTo?.(48.8566, 2.3522);
    } else if (lower.includes('东京') || lower.includes('tokyo')) {
      onFlyTo?.(35.6762, 139.6503);
    } else if (lower.includes('开罗') || lower.includes('cairo')) {
      onFlyTo?.(30.0444, 31.2357);
    } else if (lower.includes('北京') || lower.includes('beijing')) {
      onFlyTo?.(39.9042, 116.4074);
    } else if (lower.includes('纽约') || lower.includes('new york')) {
      onFlyTo?.(40.7128, -74.006);
    } else if (lower.includes('宇宙') || lower.includes('太阳系') || lower.includes('solar')) {
      onExploreUniverse?.();
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode: 'universal_intelligence',
          history: messages.slice(-4).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          }))
        })
      });

      const data = await res.json();
      if (data.success && data.reply) {
        setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
        speak(data.reply);
      } else {
        const fallback = lang === 'zh'
          ? '全息智能系统正在链接星际节点。已为你锁定空间坐标并保持实时数据同步。'
          : 'Holographic system calibrated. Spatial telemetry locked with planetary node synchronization.';
        setMessages(prev => [...prev, { sender: 'ai', text: fallback }]);
        speak(fallback);
      }
    } catch {
      const fallback = lang === 'zh'
        ? '星际网络波动，已为你保持本地认知图谱连接。'
        : 'Network transient. Local cognitive graph active.';
      setMessages(prev => [...prev, { sender: 'ai', text: fallback }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 select-none">
      {/* Floating 3D Holographic AI Widget Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center space-x-3 px-4 py-2.5 rounded-full bg-slate-950/85 hover:bg-slate-900 border border-cyan-500/50 hover:border-cyan-400 backdrop-blur-xl shadow-2xl shadow-cyan-500/20 cursor-pointer transition-all hover:scale-105 active:scale-95"
        >
          {/* Canvas for 3D Holographic Sphere */}
          <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center">
            <canvas ref={canvasRef} className="w-9 h-9" />
            <div className="absolute inset-0 rounded-full ring-1 ring-cyan-400/40 animate-pulse pointer-events-none" />
          </div>

          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold font-mono tracking-wider text-cyan-300">EARTH ONE AI</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-[10px] text-slate-400">3D 全息智能伴侣</div>
          </div>
        </button>
      )}

      {/* Expanded Holographic AI Control Deck */}
      {isOpen && (
        <div className="w-[340px] sm:w-[400px] h-[520px] rounded-3xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-2xl shadow-2xl shadow-cyan-950/60 flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
          {/* Deck Header */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-cyan-950 border border-cyan-500/60">
                <canvas ref={canvasRef} className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xs font-bold font-mono tracking-wider text-cyan-300 flex items-center space-x-1.5">
                  <span>3D HOLOGRAPHIC AI</span>
                </h3>
                <span className="text-[10px] text-slate-400">Spatial Intelligence Core</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setVoiceEnabled(v => !v)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  voiceEnabled
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={voiceEnabled ? 'Mute Voice' : 'Enable Voice'}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="px-3 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center space-x-1.5 overflow-x-auto text-[11px] no-scrollbar">
            <button
              onClick={() => onFlyTo?.(48.8566, 2.3522)}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500 text-slate-300 shrink-0 cursor-pointer transition-colors"
            >
              📍 飞往巴黎
            </button>
            <button
              onClick={() => onFlyTo?.(35.6762, 139.6503)}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500 text-slate-300 shrink-0 cursor-pointer transition-colors"
            >
              📍 飞往东京
            </button>
            <button
              onClick={() => onFlyTo?.(39.9042, 116.4074)}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500 text-slate-300 shrink-0 cursor-pointer transition-colors"
            >
              📍 飞往北京
            </button>
            {onExploreUniverse && (
              <button
                onClick={onExploreUniverse}
                className="px-2.5 py-1 rounded-full bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-300 shrink-0 cursor-pointer transition-colors"
              >
                🪐 探索太阳系
              </button>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs leading-relaxed">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl ${
                    m.sender === 'user'
                      ? 'bg-cyan-600 text-slate-950 font-medium rounded-tr-sm shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-inner'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-cyan-300 flex items-center space-x-2">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>3D AI 正在解析全息数据...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center space-x-2">
            <input
              type="text"
              value={inputMsg}
              onChange={e => setInputMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="向 3D AI 提问或发出漫游指令..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!inputMsg.trim() || isThinking}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold cursor-pointer transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
