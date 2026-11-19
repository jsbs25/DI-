import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ImagePlus,
  Mic,
  MicOff,
  Play,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import { resumePausedSpiritTask, submitSpiritCommand } from '../../agent/agentClient.ts';

interface SpiritCommandBarProps {
  lang: Language;
  onOpenSpaces?: () => void;
}

const WAKE_WORD_REGEX = /(小小|xiao\s*xiao|hey\s+one|你好\s*one)/i;

export const SpiritCommandBar: React.FC<SpiritCommandBarProps> = ({ lang, onOpenSpaces }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();

  const [input, setInput] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const wakeRecRef = useRef<any>(null);
  const wakeEnabledRef = useRef<boolean>(false);

  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRec));
    return () => {
      try { recognitionRef.current?.stop(); } catch {}
      try { wakeRecRef.current?.stop(); } catch {}
    };
  }, []);

  const handleSend = async (overridePrompt?: string) => {
    const text = (overridePrompt ?? input).trim();
    if ((!text && !imageDataUrl) || submitting) return;
    setSubmitting(true);
    const attached = imageDataUrl ? [{ type: 'image_url' as const, imageUrl: imageDataUrl }] : undefined;
    if (!overridePrompt) {
      setInput('');
      setImageDataUrl(null);
    }
    try {
      await submitSpiritCommand(text || (isZh ? '请分析这张图片' : 'Analyze this image'), {
        lang,
        attachments: attached,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Single-turn voice command dictation
  const toggleMicDictation = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceNote(isZh ? '当前浏览器不支持语音识别，请直接输入指令' : 'Speech recognition unsupported here; type instead');
      setTimeout(() => setVoiceNote(null), 3500);
      return;
    }

    if (snap.voiceListening) {
      try { recognitionRef.current?.stop(); } catch {}
      uiStateManager.setVoiceStatus({ voiceListening: false });
      return;
    }

    // Pause wake listener temporarily to avoid mic contention
    if (wakeRecRef.current) {
      try { wakeRecRef.current.stop(); } catch {}
    }

    uiStateManager.setSpiritState('woken_approaching');
    uiStateManager.setPavilionHudOpen(true);

    const rec = new SpeechRec();
    recognitionRef.current = rec;
    rec.lang = lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-SA' : 'zh-CN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalTranscript = '';
    rec.onstart = () => {
      uiStateManager.setVoiceStatus({ voiceListening: true });
    };
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript;
        else interim += res[0].transcript;
      }
      const combined = (finalTranscript || interim).trim();
      setInput(combined);
      uiStateManager.setVoiceStatus({ lastSpokenTranscript: combined });
    };
    rec.onerror = () => {
      uiStateManager.setVoiceStatus({ voiceListening: false });
      setVoiceNote(isZh ? '未检测到清晰语音，可直接输入指令' : 'Could not capture voice cleanly');
      setTimeout(() => setVoiceNote(null), 3000);
    };
    rec.onend = () => {
      uiStateManager.setVoiceStatus({ voiceListening: false });
      const cleaned = finalTranscript.replace(WAKE_WORD_REGEX, '').trim();
      if (cleaned) {
        setInput('');
        void handleSend(cleaned);
      }
      if (wakeEnabledRef.current) {
        startWakeListener();
      }
    };

    try {
      rec.start();
    } catch {
      uiStateManager.setVoiceStatus({ voiceListening: false });
    }
  };

  // Continuous lightweight wake word listener ("小小")
  const startWakeListener = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec || !wakeEnabledRef.current) return;

    try {
      const wakeRec = new SpeechRec();
      wakeRecRef.current = wakeRec;
      wakeRec.lang = lang === 'en' ? 'en-US' : 'zh-CN';
      wakeRec.continuous = true;
      wakeRec.interimResults = true;

      wakeRec.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = String(event.results[i][0]?.transcript || '').trim();
          if (WAKE_WORD_REGEX.test(transcript)) {
            uiStateManager.setSpiritState('woken_approaching');
            uiStateManager.setPavilionHudOpen(true);

            const afterWake = transcript.replace(/^.*?(小小|xiao\s*xiao|hey\s+one|你好\s*one)[,，。!！\s]*/i, '').trim();
            if (event.results[i].isFinal && afterWake.length >= 2) {
              void handleSend(afterWake);
            } else if (!snap.voiceListening) {
              setVoiceNote(isZh ? '小小已唤醒，请说出需求...' : 'Spirit awake — speak now');
              setTimeout(() => setVoiceNote(null), 2600);
            }
          }
        }
      };

      wakeRec.onend = () => {
        if (wakeEnabledRef.current && !uiStateManager.getSnapshot().voiceListening) {
          setTimeout(() => {
            if (wakeEnabledRef.current) startWakeListener();
          }, 450);
        }
      };

      wakeRec.onerror = () => {
        // Silent recovery or stop if permission denied
      };

      wakeRec.start();
      uiStateManager.setVoiceStatus({ wakeListening: true });
    } catch {
      uiStateManager.setVoiceStatus({ wakeListening: false });
    }
  };

  const toggleWakeMode = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceNote(isZh ? '当前浏览器暂不支持语音唤醒，请点击话筒或输入' : 'Voice wake unavailable in this browser');
      setTimeout(() => setVoiceNote(null), 3500);
      return;
    }
    if (wakeEnabledRef.current) {
      wakeEnabledRef.current = false;
      try { wakeRecRef.current?.stop(); } catch {}
      uiStateManager.setVoiceStatus({ wakeListening: false });
    } else {
      wakeEnabledRef.current = true;
      startWakeListener();
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setVoiceNote(isZh ? '图片请控制在 4MB 以内' : 'Image must be under 4MB');
      setTimeout(() => setVoiceNote(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Avoid covering the communication drawer if open on mobile
  if (snap.commDrawerOpen) {
    return null;
  }

  const quickChips = isZh
    ? [
        { label: '找阿语书', prompt: '小小，帮我找一本适合现在阅读的阿拉伯语书籍' },
        { label: '今日阿语课', prompt: '小小，我想学习今天的阿拉伯语' },
        { label: '查实时天气', prompt: '现在外面天气怎么样' },
        { label: '研究太空望远镜', prompt: '帮我查一下韦伯太空望远镜最新科学进展' },
      ]
    : [
        { label: 'Arabic Book', prompt: 'Find an Arabic book suitable for reading now' },
        { label: 'Arabic Lesson', prompt: 'Start today Arabic lesson' },
        { label: 'Live Weather', prompt: 'Check real-time weather right now' },
        { label: 'Space Research', prompt: 'Search latest James Webb Space Telescope updates' },
      ];

  return (
    <div
      className="pointer-events-none fixed bottom-[max(0.95rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 w-[min(94vw,600px)] flex flex-col items-center gap-2"
      data-testid="spirit-command-bar"
    >
      {/* Resume paused task pill when returning from communication */}
      {snap.pausedTask && (
        <button
          type="button"
          onClick={() => void resumePausedSpiritTask(lang)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-[#0c1420]/92 px-3 py-1.5 text-xs font-medium text-emerald-200 shadow-lg hover:bg-[#111e2e] cursor-pointer"
        >
          <Play className="h-3.5 w-3.5 text-emerald-400" />
          <span className="truncate max-w-[260px]">
            {isZh ? `继续刚才的任务：${snap.pausedTask.prompt}` : `Resume: ${snap.pausedTask.prompt}`}
          </span>
        </button>
      )}

      {voiceNote && (
        <div className="pointer-events-auto rounded-lg border border-amber-300/30 bg-[#0c1420]/94 px-3 py-1 text-[11px] text-amber-200 shadow-lg">
          {voiceNote}
        </div>
      )}

      {/* Quick Intent Suggestions + Image Preview */}
      {imageDataUrl ? (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/15 bg-[#0c1420]/92 px-2.5 py-1.5 shadow-lg">
          <img src={imageDataUrl} alt="Attachment" className="h-9 w-9 rounded-lg object-cover border border-white/15" />
          <span className="text-[11px] text-slate-200">{isZh ? '已附带图片供 ONE AI 分析' : 'Image attached'}</span>
          <button
            type="button"
            onClick={() => setImageDataUrl(null)}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
          {quickChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => void handleSend(chip.prompt)}
              className="rounded-lg border border-white/12 bg-[#0c1420]/84 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-[#162234] hover:text-white transition-colors cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
          {onOpenSpaces && (
            <button
              type="button"
              onClick={onOpenSpaces}
              className="rounded-lg border border-amber-300/25 bg-[#0c1420]/84 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-[#162234] transition-colors cursor-pointer"
            >
              {isZh ? '进入星系' : 'Spaces'}
            </button>
          )}
        </div>
      )}

      {/* Main Translucent Spirit Bar (No backdrop-blur over WebGL) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="pointer-events-auto flex w-full items-center gap-1.5 rounded-2xl border border-white/16 bg-[#0c1420]/92 p-1.5 shadow-2xl"
      >
        {/* Wake-word ("小小") button */}
        <button
          type="button"
          onClick={toggleWakeMode}
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${
            snap.wakeListening
              ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
              : 'bg-white/8 text-slate-200 hover:bg-white/15'
          }`}
          title={
            speechSupported
              ? isZh
                ? '开启语音唤醒（说出“小小”即可召唤）'
                : 'Toggle "Xiao Xiao" voice wake'
              : isZh
              ? '当前浏览器不支持持续语音唤醒'
              : 'Continuous wake unsupported'
          }
        >
          <Sparkles className={`h-3.5 w-3.5 ${snap.wakeListening ? 'text-emerald-300' : 'text-amber-300'}`} />
          <span className="hidden sm:inline">{snap.wakeListening ? (isZh ? '待唤醒:小小' : 'Wake On') : isZh ? '呼唤小小' : 'Spirit'}</span>
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            if (snap.spiritState === 'idle_explore' || snap.spiritState === 'sleeping_in_house') {
              uiStateManager.setSpiritState('woken_approaching');
            }
          }}
          placeholder={
            snap.voiceListening
              ? isZh
                ? '正在聆听您的需求...'
                : 'Listening...'
              : isZh
              ? '对小小说话或输入任何需求（找书、学阿语、查资料、改天气）...'
              : 'Tell Spirit anything (books, Arabic, research, weather)...'
          }
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImagePick}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
          title={isZh ? '上传图片提问' : 'Attach image'}
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleMicDictation}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer ${
            snap.voiceListening
              ? 'bg-rose-500 text-white'
              : 'bg-white/8 text-slate-200 hover:bg-white/15 hover:text-white'
          }`}
          title={isZh ? '语音输入指令' : 'Voice command'}
        >
          {snap.voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('one-open-live-companion'))}
          className="hidden sm:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8 text-sky-300 hover:bg-white/15 hover:text-sky-200 transition-colors cursor-pointer"
          title={isZh ? '全息实时语音助手' : 'Live Voice Companion'}
        >
          <AudioLines className="h-4 w-4" />
        </button>

        <button
          type="submit"
          disabled={submitting || (!input.trim() && !imageDataUrl)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#F7F5F0] px-3.5 text-xs font-semibold text-[#0c1420] hover:bg-[#EAE5DC] disabled:opacity-45 transition-colors cursor-pointer shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">{submitting ? (isZh ? '调度中' : 'Busy') : isZh ? '指令' : 'Go'}</span>
        </button>
      </form>
    </div>
  );
};

export default SpiritCommandBar;
