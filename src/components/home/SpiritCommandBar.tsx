import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  ImagePlus,
  PhoneOff,
  Play,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { useAgentUiState } from '../../agent/uiStateManager.ts';
import { resumePausedSpiritTask, submitSpiritCommand } from '../../agent/agentClient.ts';
import { stopSpiritLiveVoice, toggleSpiritLiveVoice } from '../../agent/spiritLiveVoice.ts';

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSend = async (overridePrompt?: string, speakReply = false) => {
    const text = (overridePrompt ?? input).trim();
    if ((!text && !imageDataUrl) || submitting) return;
    if (snap.liveVoiceActive) {
      stopSpiritLiveVoice();
    }
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

  const handleToggleRealTimeVoice = () => {
    void toggleSpiritLiveVoice(lang);
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

  const shellCls = isDay
    ? 'border-white/65 bg-[#faf7f1]/78 text-[#1f2c26] shadow-[0_8px_24px_rgba(24,36,28,0.10)]'
    : 'border-white/14 bg-[#131b26]/74 text-[#f2eee6] shadow-[0_10px_28px_rgba(4,8,14,0.34)]';

  const iconBtnCls = isDay
    ? 'text-[#394b42]/80 hover:bg-black/[0.06] hover:text-[#16221c]'
    : 'text-[#e5dfd3]/75 hover:bg-white/[0.1] hover:text-white';

  const sendBtnCls = isDay
    ? 'bg-[#21332b] text-[#faf7f0] hover:bg-[#17241e]'
    : 'bg-[#ebe2cf] text-[#141e28] hover:bg-white';

  const liveActiveCls = isDay
    ? 'bg-[#21644e] text-[#faf7f0] hover:bg-[#19503e]'
    : 'bg-[#2a7a5e] text-[#f6f3ec] hover:bg-[#22664e]';

  const placeholderText = snap.liveVoiceActive
    ? snap.liveVoicePhase === 'connecting'
      ? isZh
        ? '正在连接语音…'
        : 'Connecting…'
      : snap.liveVoicePhase === 'speaking'
      ? isZh
        ? '正在回应，随时可说话…'
        : 'Speaking…'
      : isZh
      ? '请直接开口说话…'
      : 'Speak now…'
    : isZh
    ? '说点什么，比如看书、听歌或查问题…'
    : 'Ask anything, read a book, or play music…';

  return (
    <div
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 w-[min(88vw,380px)] flex flex-col items-center gap-1.5"
      data-testid="spirit-command-bar"
    >
      {snap.pausedTask && (
        <button
          type="button"
          onClick={() => void resumePausedSpiritTask(lang)}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer ${shellCls}`}
        >
          <Play className="h-3 w-3" />
          <span className="truncate max-w-[220px]">
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
          <img src={imageDataUrl} alt="Attachment" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-[11px] opacity-85">{isZh ? '已附图片' : 'Attached'}</span>
          <button
            type="button"
            onClick={() => setImageDataUrl(null)}
            className={`rounded-full p-1 cursor-pointer ${iconBtnCls}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className={`pointer-events-auto flex w-full items-center gap-1 rounded-full border py-1 pl-3.5 pr-1 transition-colors ${shellCls}`}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholderText}
          className={`h-7 min-w-0 flex-1 bg-transparent text-xs focus:outline-none ${
            isDay ? 'text-[#1c2922] placeholder:text-[#516359]/75' : 'text-[#f6f3ec] placeholder:text-[#d9d4c7]/55'
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
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${iconBtnCls}`}
          title={isZh ? '附带图片' : 'Attach image'}
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={handleToggleRealTimeVoice}
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            snap.liveVoiceActive ? liveActiveCls : iconBtnCls
          }`}
          title={snap.liveVoiceActive ? (isZh ? '结束语音' : 'End voice') : isZh ? '语音对话' : 'Voice chat'}
          data-testid="spirit-live-voice-btn"
        >
          {snap.liveVoiceActive ? <PhoneOff className="h-3.5 w-3.5" /> : <AudioLines className="h-3.5 w-3.5" />}
        </button>

        <button
          type="submit"
          disabled={submitting || (!input.trim() && !imageDataUrl)}
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-30 transition-colors cursor-pointer ${sendBtnCls}`}
          title={isZh ? '发送' : 'Send'}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
};

export default SpiritCommandBar;

