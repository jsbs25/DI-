import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  Music2,
  PhoneOff,
  Play,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import {
  respondToAgentConfirmation,
  resumePausedSpiritTask,
  speakSpiritReply,
  stopSpiritSpeech,
  submitSpiritCommand,
} from '../../agent/agentClient.ts';
import { stopSpiritLiveVoice, toggleSpiritLiveVoice } from '../../agent/spiritLiveVoice.ts';
import { triggerImageDownload } from '../paradise/SpiritSpeechBubble.tsx';

interface SpiritCommandBarProps {
  lang: Language;
  onOpenFullAi?: () => void;
}

export const SpiritCommandBar: React.FC<SpiritCommandBarProps> = ({ lang, onOpenFullAi }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const isDay = snap.gardenDaylight > 0.44;
  const bubble = snap.spiritBubble;

  const [input, setInput] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      setNotice(isZh ? '图片请控制在 4MB 以内' : 'Image must be under 4MB');
      setTimeout(() => setNotice(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleQuickAction = (action: string) => {
    if (action === 'open_library') {
      uiStateManager.hideSpiritBubble();
      window.dispatchEvent(new CustomEvent('one-spirit-quick-action', { detail: { action: 'open_library' } }));
    } else if (action === 'play_music') {
      window.dispatchEvent(new CustomEvent('one-music-play-inline', { detail: { query: '轻音乐 钢琴' } }));
    } else if (action === 'next_music') {
      window.dispatchEvent(new Event('one-music-next-inline'));
    } else if (action === 'stop_music') {
      window.dispatchEvent(new Event('one-music-force-stop'));
      uiStateManager.hideSpiritBubble();
    }
  };

  if (snap.commDrawerOpen) {
    return null;
  }

  // Unified surface styles — Apple VisionOS / macOS frosted glass calibrated to Day vs Night sanctuary
  const glassBarCls = isDay
    ? 'border-white/75 bg-[#faf7f1]/84 text-[#18261f] shadow-[0_12px_34px_rgba(18,30,24,0.16)] backdrop-blur-2xl ring-1 ring-inset ring-white/55'
    : 'border-white/16 bg-[#0f1722]/78 text-[#f4f0e8] shadow-[0_16px_42px_rgba(2,6,12,0.48)] backdrop-blur-2xl ring-1 ring-inset ring-white/[0.06]';

  const glassSheetCls = isDay
    ? 'border-white/75 bg-[#fbf8f2]/90 text-[#192620] shadow-[0_18px_46px_rgba(18,30,24,0.18)] backdrop-blur-2xl ring-1 ring-inset ring-white/60'
    : 'border-white/16 bg-[#101824]/86 text-[#f4f0e8] shadow-[0_20px_50px_rgba(2,6,12,0.54)] backdrop-blur-2xl ring-1 ring-inset ring-white/[0.06]';

  const iconBtnCls = isDay
    ? 'text-[#31443b]/85 hover:bg-black/[0.07] hover:text-[#14201a]'
    : 'text-[#e5dfd3]/80 hover:bg-white/[0.11] hover:text-white';

  const primaryBtnCls = isDay
    ? 'bg-[#1d3027] text-[#faf7f0] hover:bg-[#13221b]'
    : 'bg-[#ede4d2] text-[#121c26] hover:bg-white';

  const secondaryBtnCls = isDay
    ? 'border border-black/12 bg-white/75 text-[#22332b] hover:bg-white'
    : 'border border-white/14 bg-white/[0.08] text-[#f2eee6] hover:bg-white/[0.15]';

  const liveActiveCls = isDay
    ? 'bg-[#1f6a52] text-[#faf7f0] hover:bg-[#185642]'
    : 'bg-[#2a7d61] text-[#f7f4ec] hover:bg-[#226850]';

  const dividerCls = isDay ? 'border-black/[0.08]' : 'border-white/[0.10]';

  const hasResponseContent = Boolean(
    snap.liveVoiceActive ||
      snap.voiceListening ||
      snap.pendingConfirmation ||
      (bubble &&
        bubble.visible &&
        !bubble.isAmbientHint &&
        (bubble.isLoading ||
          bubble.text ||
          bubble.generatedImage ||
          (bubble.rescueCards && bubble.rescueCards.length > 0)))
  );

  const showAmbientWhisper = Boolean(
    !hasResponseContent &&
      !snap.musicPlaying &&
      bubble?.visible &&
      bubble.isAmbientHint &&
      bubble.text
  );

  const placeholderText = snap.liveVoiceActive
    ? snap.liveVoicePhase === 'connecting'
      ? isZh ? '正在连接语音对话…' : 'Connecting voice…'
      : snap.liveVoicePhase === 'speaking'
        ? isZh ? 'ONE AI 正在回应，随时可打断…' : 'Speaking — interrupt anytime…'
        : isZh ? '正在聆听，请直接开口说话…' : 'Listening…'
    : isZh
      ? '问 ONE AI — 查书、听歌、翻译或探索世界…'
      : 'Ask ONE AI to read, play music, or explore…';

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-[calc(5.05rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 w-[min(92vw,456px)] flex flex-col items-center gap-2"
      data-testid="spirit-command-bar"
    >
      {/* 1. Unified Frosted-Glass AI Response / Voice / Confirmation Sheet */}
      {hasResponseContent && (
        <div
          className={`pointer-events-auto w-full max-h-[44vh] overflow-y-auto rounded-[22px] border px-4 py-3 transition-all ${glassSheetCls}`}
          data-testid="spirit-unified-sheet"
        >
          {/* Minimal Sheet Header */}
          <div className={`flex items-center justify-between gap-2 pb-2 mb-2 border-b ${dividerCls}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase opacity-80">
                {snap.aiName || 'ONE AI'}
              </span>
              {snap.liveVoiceActive && (
                <span className="text-[11px] opacity-65 truncate">
                  · {snap.liveVoicePhase === 'speaking' ? (isZh ? '回应中' : 'Speaking') : isZh ? '实时语音' : 'Live Voice'}
                </span>
              )}
              {bubble?.isLoading && !snap.liveVoiceActive && (
                <span className="inline-flex items-center gap-1 text-[11px] opacity-65">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{isZh ? '思考中' : 'Thinking'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {snap.liveVoiceActive && (
                <button
                  type="button"
                  onClick={() => stopSpiritLiveVoice()}
                  className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium cursor-pointer transition-colors ${primaryBtnCls}`}
                >
                  <PhoneOff className="h-3 w-3" />
                  <span>{isZh ? '结束' : 'End'}</span>
                </button>
              )}
              {bubble?.text && !bubble.isLoading && !snap.liveVoiceActive && (
                <button
                  type="button"
                  onClick={() => {
                    if (bubble.speaking) {
                      stopSpiritSpeech();
                    } else {
                      void speakSpiritReply(bubble.text, bubble.speakLang || lang);
                    }
                  }}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer transition-colors ${iconBtnCls}`}
                  title={bubble.speaking ? (isZh ? '停止朗读' : 'Stop voice') : isZh ? '朗读回复' : 'Read aloud'}
                >
                  {bubble.speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              )}
              {onOpenFullAi && (
                <button
                  type="button"
                  onClick={onOpenFullAi}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer transition-colors ${iconBtnCls}`}
                  title={isZh ? '在完整 ONE AI 中继续' : 'Continue in ONE AI'}
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (snap.liveVoiceActive) stopSpiritLiveVoice();
                  stopSpiritSpeech();
                  uiStateManager.hideSpiritBubble();
                }}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer transition-colors ${iconBtnCls}`}
                title={isZh ? '收起' : 'Dismiss'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Live Voice User Transcript */}
          {(snap.voiceListening || (snap.liveVoiceActive && snap.lastSpokenTranscript)) && (
            <div className={`mb-2 text-[12px] leading-relaxed opacity-70`}>
              {snap.lastSpokenTranscript
                ? `“${snap.lastSpokenTranscript}”`
                : isZh
                  ? '请直接开口说话…'
                  : 'Speak naturally…'}
            </div>
          )}

          {/* Main AI Response Prose */}
          {bubble?.text && (
            <p className="text-[13.5px] leading-[1.65] whitespace-pre-wrap break-words">
              {bubble.text}
            </p>
          )}

          {bubble?.translationZh && (
            <p className={`mt-2 pt-2 border-t text-[12px] leading-relaxed opacity-75 ${dividerCls}`}>
              {bubble.translationZh}
            </p>
          )}

          {/* Generated Image Preview */}
          {bubble?.generatedImage && (
            <div className={`mt-2.5 overflow-hidden rounded-xl border ${dividerCls}`}>
              <img
                src={bubble.generatedImage.imageUrl}
                alt={bubble.generatedImage.captionZh}
                onClick={() => uiStateManager.setImageLightbox(bubble.generatedImage || null)}
                className="max-h-44 w-full object-cover cursor-zoom-in"
              />
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                <span className="truncate opacity-75">{bubble.generatedImage.captionZh}</span>
                <button
                  type="button"
                  onClick={() => bubble.generatedImage && triggerImageDownload(bubble.generatedImage)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-medium cursor-pointer ${secondaryBtnCls}`}
                >
                  <Download className="h-3 w-3" />
                  <span>{isZh ? '保存' : 'Save'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions attached to reply */}
          {bubble?.quickActions && bubble.quickActions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {bubble.quickActions.map((qa, idx) => (
                <button
                  key={`${qa.action}_${idx}`}
                  type="button"
                  onClick={() => handleQuickAction(qa.action)}
                  className={`inline-flex h-7 items-center rounded-full px-3 text-[11px] font-medium transition-colors cursor-pointer ${
                    idx === 0 ? primaryBtnCls : secondaryBtnCls
                  }`}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Pending Agent Action Confirmation */}
          {snap.pendingConfirmation && (
            <div className={`mt-2.5 pt-2.5 border-t flex items-center justify-between gap-2 ${dividerCls}`}>
              <span className="text-[12px] font-medium truncate">{snap.pendingConfirmation.summary}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void respondToAgentConfirmation(snap.pendingConfirmation!.confirmToken, 'cancel')}
                  className={`inline-flex h-7 items-center rounded-full px-3 text-[11px] font-medium cursor-pointer ${secondaryBtnCls}`}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => void respondToAgentConfirmation(snap.pendingConfirmation!.confirmToken, 'confirm')}
                  className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[11px] font-medium cursor-pointer ${primaryBtnCls}`}
                >
                  <Check className="h-3 w-3" />
                  <span>{isZh ? '确认' : 'Confirm'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Sleek Inline Music Strip when playing music right in the Garden */}
      {snap.musicPlaying && (
        <div
          className={`pointer-events-auto flex w-full items-center justify-between gap-2 rounded-full border px-3.5 py-1.5 text-[12px] transition-all ${glassBarCls}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Music2 className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate font-medium">
              {snap.musicTrackTitle || (isZh ? '正在花园中轻声播放音乐' : 'Playing sanctuary music')}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleQuickAction('next_music')}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer transition-colors ${iconBtnCls}`}
              title={isZh ? '下一首' : 'Next track'}
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction('stop_music')}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer transition-colors ${iconBtnCls}`}
              title={isZh ? '停止播放' : 'Stop music'}
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Ultra-Quiet Single-Line Ambient Suggestion (only when idle) */}
      {showAmbientWhisper && bubble && (
        <div
          className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1 text-[11.5px] transition-all ${glassBarCls}`}
        >
          <span className="truncate opacity-85">{bubble.text}</span>
          {bubble.quickActions && bubble.quickActions[0] && (
            <button
              type="button"
              onClick={() => handleQuickAction(bubble.quickActions![0].action)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium cursor-pointer transition-colors ${primaryBtnCls}`}
            >
              {bubble.quickActions[0].label}
            </button>
          )}
          <button
            type="button"
            onClick={() => uiStateManager.hideSpiritBubble()}
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full cursor-pointer opacity-60 hover:opacity-100 ${iconBtnCls}`}
            aria-label="Dismiss suggestion"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 4. Optional Paused Task / Notice / Image Attachment Pill */}
      {snap.pausedTask && (
        <button
          type="button"
          onClick={() => void resumePausedSpiritTask(lang)}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer ${glassBarCls}`}
        >
          <Play className="h-3 w-3" />
          <span className="truncate max-w-[260px]">
            {isZh ? `继续：${snap.pausedTask.prompt}` : `Resume: ${snap.pausedTask.prompt}`}
          </span>
        </button>
      )}

      {notice && (
        <div className={`pointer-events-auto rounded-full border px-3 py-1 text-[11px] ${glassBarCls}`}>
          {notice}
        </div>
      )}

      {imageDataUrl && (
        <div className={`pointer-events-auto flex items-center gap-2 rounded-full border pl-1.5 pr-2.5 py-1 ${glassBarCls}`}>
          <img src={imageDataUrl} alt="Attachment" className="h-6 w-6 rounded-full object-cover" />
          <span className="text-[11px] opacity-85">{isZh ? '已附图片' : 'Image attached'}</span>
          <button
            type="button"
            onClick={() => setImageDataUrl(null)}
            className={`rounded-full p-0.5 cursor-pointer ${iconBtnCls}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 5. Flagship Frosted-Glass ONE AI Input Capsule */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className={`pointer-events-auto flex h-[46px] w-full items-center gap-1 rounded-full border pl-4 pr-1.5 transition-all ${glassBarCls}`}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholderText}
          className={`h-full min-w-0 flex-1 bg-transparent text-[13.5px] focus:outline-none ${
            isDay
              ? 'text-[#16231d] placeholder:text-[#42554b]/75'
              : 'text-[#f7f4ec] placeholder:text-[#dfd9cc]/60'
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
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${iconBtnCls}`}
          title={isZh ? '附带图片' : 'Attach image'}
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleRealTimeVoice}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            snap.liveVoiceActive ? liveActiveCls : iconBtnCls
          }`}
          title={snap.liveVoiceActive ? (isZh ? '结束语音' : 'End voice') : isZh ? '实时语音对话' : 'Voice chat'}
          data-testid="spirit-live-voice-btn"
        >
          {snap.liveVoiceActive ? <PhoneOff className="h-3.5 w-3.5" /> : <AudioLines className="h-4 w-4" />}
        </button>

        {onOpenFullAi && (
          <button
            type="button"
            onClick={onOpenFullAi}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${iconBtnCls}`}
            title={isZh ? '进入纯净 ONE AI 空间' : 'Open full ONE AI'}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="submit"
          disabled={submitting || (!input.trim() && !imageDataUrl)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-30 transition-colors cursor-pointer ${primaryBtnCls}`}
          title={isZh ? '发送' : 'Send'}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
};

export default SpiritCommandBar;
