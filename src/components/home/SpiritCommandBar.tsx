import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  ImagePlus,
  Mic,
  MicOff,
  Play,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import { resumePausedSpiritTask, submitSpiritCommand } from '../../agent/agentClient.ts';

interface SpiritCommandBarProps {
  lang: Language;
}

export const SpiritCommandBar: React.FC<SpiritCommandBarProps> = ({ lang }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const isDay = snap.gardenDaylight > 0.44;

  const [input, setInput] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(snap.aiName);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setNameDraft(snap.aiName);
  }, [snap.aiName]);

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch {}
    };
  }, []);

  const commitAiName = () => {
    const clean = nameDraft.trim();
    if (clean) {
      uiStateManager.setAiName(clean);
    } else {
      setNameDraft(snap.aiName);
    }
    setEditingName(false);
  };

  const handleSend = async (overridePrompt?: string, speakReply = false) => {
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
        speakReply,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Real-time voice chat dictation + spoken reply
  const toggleMicDictation = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceNote(isZh ? '当前浏览器不支持语音识别，请直接打字聊天' : 'Speech recognition unsupported; please type');
      setTimeout(() => setVoiceNote(null), 3000);
      return;
    }

    if (snap.voiceListening) {
      try { recognitionRef.current?.stop(); } catch {}
      uiStateManager.setVoiceStatus({ voiceListening: false });
      return;
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
      setVoiceNote(isZh ? '未检测到清晰语音，请再试一次' : 'Voice not captured clearly');
      setTimeout(() => setVoiceNote(null), 2600);
    };
    rec.onend = () => {
      uiStateManager.setVoiceStatus({ voiceListening: false });
      const safeName = snap.aiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cleaned = finalTranscript
        .replace(new RegExp(`^(?:${safeName}|ONE|hey\\s+one|你好)[,，。!！\\s]*`, 'i'), '')
        .trim();
      if (cleaned) {
        setInput('');
        void handleSend(cleaned, true);
      }
    };

    try {
      rec.start();
    } catch {
      uiStateManager.setVoiceStatus({ voiceListening: false });
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

  if (snap.commDrawerOpen) {
    return null;
  }

  // Garden-matched mist tokens (warm ivory mist by day, serene twilight slate at night — zero harsh black/red/green/blue)
  const shellCls = isDay
    ? 'border-white/55 bg-[#f7f3eb]/72 text-[#223029] shadow-[0_10px_30px_rgba(24,36,28,0.14)]'
    : 'border-white/14 bg-[#141d29]/62 text-[#f2eee6] shadow-[0_12px_34px_rgba(4,8,14,0.36)]';

  const pillBtnCls = isDay
    ? 'text-[#33443b]/85 hover:bg-black/[0.06] hover:text-[#18241e]'
    : 'text-[#e5dfd3]/85 hover:bg-white/[0.1] hover:text-white';

  const sendBtnCls = isDay
    ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
    : 'bg-[#e8e1d2] text-[#17202b] hover:bg-white';

  return (
    <div
      className="pointer-events-none fixed bottom-[max(0.9rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 w-[min(88vw,430px)] flex flex-col items-center gap-1.5"
      data-testid="spirit-command-bar"
    >
      {snap.pausedTask && (
        <button
          type="button"
          onClick={() => void resumePausedSpiritTask(lang)}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer ${shellCls}`}
        >
          <Play className="h-3 w-3" />
          <span className="truncate max-w-[240px]">
            {isZh ? `继续：${snap.pausedTask.prompt}` : `Resume: ${snap.pausedTask.prompt}`}
          </span>
        </button>
      )}

      {voiceNote && (
        <div className={`pointer-events-auto rounded-full border px-3 py-1 text-[11px] ${shellCls}`}>
          {voiceNote}
        </div>
      )}

      {imageDataUrl && (
        <div className={`pointer-events-auto flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 ${shellCls}`}>
          <img src={imageDataUrl} alt="Attachment" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-[11px] opacity-85">{isZh ? '已附图片' : 'Attached'}</span>
          <button
            type="button"
            onClick={() => setImageDataUrl(null)}
            className={`rounded-full p-1 cursor-pointer ${pillBtnCls}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Compact Garden-Blended AI Bar (No backdrop-blur over WebGL, no quick-chip clutter) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className={`pointer-events-auto flex w-full items-center gap-1 rounded-full border p-1 transition-colors ${shellCls}`}
      >
        {/* Editable Custom AI Name Badge */}
        {editingName ? (
          <div className="flex items-center gap-0.5 pl-1.5">
            <input
              type="text"
              value={nameDraft}
              maxLength={20}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitAiName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAiName();
                } else if (e.key === 'Escape') {
                  setNameDraft(snap.aiName);
                  setEditingName(false);
                }
              }}
              className={`h-7 w-20 rounded-full border px-2 text-xs font-medium outline-none ${
                isDay
                  ? 'border-black/20 bg-white/80 text-[#1d2924]'
                  : 'border-white/20 bg-black/25 text-white'
              }`}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commitAiName}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full cursor-pointer ${pillBtnCls}`}
              title={isZh ? '确认名称' : 'Save AI name'}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className={`inline-flex h-8 max-w-[92px] shrink-0 items-center rounded-full px-2.5 text-xs font-semibold tracking-tight transition-colors cursor-pointer ${
              isDay ? 'bg-black/[0.06] text-[#1f2e27] hover:bg-black/[0.11]' : 'bg-white/[0.1] text-[#f4f0e8] hover:bg-white/[0.16]'
            }`}
            title={isZh ? '点击自定义 AI 名称' : 'Click to rename AI'}
          >
            <span className="truncate">{snap.aiName}</span>
          </button>
        )}

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
                ? '正在聆听...'
                : 'Listening...'
              : isZh
              ? `与 ${snap.aiName} 实时对话...`
              : `Chat live with ${snap.aiName}...`
          }
          className={`h-8 min-w-0 flex-1 bg-transparent px-2 text-xs sm:text-[13px] focus:outline-none ${
            isDay ? 'text-[#1c2922] placeholder:text-[#44564c]/70' : 'text-[#f6f3ec] placeholder:text-[#d9d4c7]/60'
          }`}
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
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${pillBtnCls}`}
          title={isZh ? '附带图片' : 'Attach image'}
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={toggleMicDictation}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            snap.voiceListening ? sendBtnCls : pillBtnCls
          }`}
          title={isZh ? '语音对话' : 'Voice chat'}
        >
          {snap.voiceListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('one-open-live-companion'))}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${pillBtnCls}`}
          title={isZh ? '实时连续语音对话' : 'Real-Time Live Voice'}
        >
          <AudioLines className="h-3.5 w-3.5" />
        </button>

        <button
          type="submit"
          disabled={submitting || (!input.trim() && !imageDataUrl)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-35 transition-colors cursor-pointer ${sendBtnCls}`}
          title={isZh ? '发送' : 'Send'}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};

export default SpiritCommandBar;
