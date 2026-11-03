import React, { useState } from 'react';
import { Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Cpu,
  Sparkles,
  Languages,
  BookOpen,
  GraduationCap,
  Send,
  Zap,
  Shield,
  Layers,
  RotateCcw,
  CheckCircle2,
  Copy
} from 'lucide-react';

interface AIHubProps {
  lang: Language;
}

export const AIHub: React.FC<AIHubProps> = ({ lang }) => {
  const t = translations[lang];

  const [activeMode, setActiveMode] = useState<'general' | 'translator' | 'writer' | 'tutor'>('general');
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash' | 'gemini-4-argon'>('gemini-3.8-flash');
  const [useSearchGrounding, setUseSearchGrounding] = useState(true);
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{
    role: 'user' | 'ai';
    text: string;
    model?: string;
    groundingChunks?: Array<{ web?: { uri: string; title: string } }>;
  }>>([
    {
      role: 'ai',
      text: t.aiAssistantGreeting,
      model: 'gemini-3.8-flash'
    }
  ]);

  const modes = [
    { id: 'general', label: 'Global Assistant (全球智慧)', icon: Sparkles, desc: 'Omniscient knowledge on geography, civilizations, and science.' },
    { id: 'translator', label: 'Polyglot Translator (跨文化翻译)', icon: Languages, desc: 'High-fidelity translations preserving regional idioms and warmth.' },
    { id: 'writer', label: 'Creator Co-Author (创作者助手)', icon: BookOpen, desc: 'Draft articles, polish essays, and write bilingual poetry.' },
    { id: 'tutor', label: 'Language Coach (语言导师)', icon: GraduationCap, desc: 'Interactive conversation practice in 6 world languages.' }
  ];

  const quickPrompts: Record<string, string[]> = {
    general: [
      'What are the latest renewable energy breakthroughs across deserts in 2026?',
      'Explain the Overview Effect experienced by astronauts looking at Earth.',
      'How does international cultural exchange promote global peace?'
    ],
    translator: [
      'Translate: "A journey of a thousand miles begins with a single step" into Arabic and French.',
      'How do you politely express gratitude in Jordanian Arabic?',
      'Translate this Spanish architectural phrase into Chinese and English.'
    ],
    writer: [
      'Outline an article about how digital earth twins transform education.',
      'Write an inspiring opening paragraph on "One Earth. One Humanity."',
      'Polish a travel journal about desert nights under the stars in Wadi Rum.'
    ],
    tutor: [
      'Teach me 5 essential conversational phrases in Mandarin Chinese.',
      'How do I introduce myself warmly in Russian with phonetic tips?',
      'Let us practice a restaurant ordering dialogue in Spanish.'
    ]
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || promptInput;
    if (!textToSend.trim() || isLoading) return;

    const userEntry = { role: 'user' as const, text: textToSend.trim() };
    setChatLog(prev => [...prev, userEntry]);
    if (!customPrompt) setPromptInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend.trim(),
          model: selectedModel,
          mode: activeMode,
          useSearchGrounding
        })
      });
      const data = await res.json();
      if (data.success && data.reply) {
        setChatLog(prev => [
          ...prev,
          {
            role: 'ai',
            text: data.reply,
            model: data.model || selectedModel,
            groundingChunks: data.groundingChunks || []
          }
        ]);
      } else {
        setChatLog(prev => [
          ...prev,
          { role: 'ai', text: data.error || 'AI gateway is currently synchronizing with global nodes.' }
        ]);
      }
    } catch (err) {
      setChatLog(prev => [
        ...prev,
        { role: 'ai', text: 'Connection to Earth One AI gateway interrupted. Please try again.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            <Zap className="w-3.5 h-3.5" />
            <span>UNIFIED AI GATEWAY · GOOGLE GEMINI POWERED</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            {t.aiHubTab}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
            A planetary AI intelligence hub uniting multimodal language translation, cross-border research, creative writing, and polyglot learning.
          </p>
        </div>
      </div>

      {/* Modes & Model Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {modes.map(m => {
          const Icon = m.icon;
          const isActive = activeMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id as any)}
              className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                isActive
                  ? 'bg-slate-900 border-cyan-500/50 shadow-lg ring-1 ring-cyan-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span className={`font-semibold text-xs ${isActive ? 'text-cyan-300' : 'text-slate-200'}`}>
                  {m.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Model Selection Bar */}
      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300 font-medium">Model:</span>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (High Speed · Multimodal)</option>
              <option value="gemini-4-argon">Gemini 4 Argon (Advanced STEM & Complex Reasoning)</option>
            </select>
          </div>

          {/* Google Search Grounding Toggle */}
          <button
            type="button"
            onClick={() => setUseSearchGrounding(!useSearchGrounding)}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
              useSearchGrounding
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Google Search Grounding: {useSearchGrounding ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
          <span>Server-Side Proxy: Protected</span>
          <span>·</span>
          <span>Zero Client Leak</span>
        </div>
      </div>

      {/* Chat & Interaction Stream */}
      <div className="rounded-3xl bg-slate-900/70 border border-slate-800 overflow-hidden shadow-2xl flex flex-col h-[460px]">
        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {chatLog.map((entry, idx) => (
            <div
              key={idx}
              className={`flex items-start space-x-3 ${entry.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                  entry.role === 'user'
                    ? 'bg-cyan-600 text-slate-950'
                    : 'bg-slate-800 border border-cyan-500/30 text-cyan-400'
                }`}
              >
                {entry.role === 'user' ? 'ME' : <Cpu className="w-4 h-4" />}
              </div>

              <div
                className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-xl whitespace-pre-line shadow-md ${
                  entry.role === 'user'
                    ? 'bg-cyan-500 text-slate-950 font-medium rounded-tr-none'
                    : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-none'
                }`}
              >
                {entry.text}

                {/* Grounding web sources */}
                {entry.groundingChunks && entry.groundingChunks.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Search Grounding Sources:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.groundingChunks.map((chunk, cIdx) => (
                        chunk.web ? (
                          <a
                            key={cIdx}
                            href={chunk.web.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300 truncate max-w-xs block border border-slate-700"
                          >
                            🔗 {chunk.web.title || chunk.web.uri}
                          </a>
                        ) : null
                      ))}
                    </div>
                  </div>
                )}

                {entry.model && (
                  <div className="mt-2 text-[10px] text-slate-500 font-mono flex items-center justify-between border-t border-slate-800/80 pt-1">
                    <span>Engine: {entry.model}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(entry.text)}
                      className="hover:text-slate-300 cursor-pointer flex items-center space-x-1"
                      title="Copy response"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center space-x-2 text-xs text-cyan-400 animate-pulse pl-12">
              <Sparkles className="w-4 h-4" />
              <span>EARTH ONE AI is formulating response across global knowledge nodes...</span>
            </div>
          )}
        </div>

        {/* Quick prompt suggestions */}
        <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/40 flex items-center space-x-2 overflow-x-auto scrollbar-none">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono shrink-0">
            Ideas:
          </span>
          {quickPrompts[activeMode]?.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSend(p)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 whitespace-nowrap cursor-pointer transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Composer */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            value={promptInput}
            onChange={e => setPromptInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything or request translation, article summary, language tips..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!promptInput.trim() || isLoading}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Consult AI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
