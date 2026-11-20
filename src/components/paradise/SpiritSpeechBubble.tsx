import React from 'react';
import {
  BookOpen,
  Check,
  Download,
  HelpCircle,
  Loader2,
  Maximize2,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  uiStateManager,
  useAgentUiState,
  type GeneratedImagePayload,
  type SpokenRescueCard,
} from '../../agent/uiStateManager.ts';
import {
  requestInstantSpokenRescue,
  respondToAgentConfirmation,
  speakSpiritReply,
  stopSpiritSpeech,
  submitSpiritCommand,
} from '../../agent/agentClient.ts';
import { stopSpiritLiveVoice } from '../../agent/spiritLiveVoice.ts';

interface SpiritSpeechBubbleProps {
  lang: Language;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function triggerImageDownload(img: GeneratedImagePayload) {
  try {
    const a = document.createElement('a');
    a.href = img.imageUrl;
    const ext = img.mimeType.includes('svg') ? 'svg' : img.mimeType.includes('png') ? 'png' : 'jpg';
    const safeSlug = (img.captionZh || 'earth_one_art').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '').slice(0, 24) || 'earth_one_art';
    a.download = `${safeSlug}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // ignore
  }
}

export const SpiritSpeechBubble: React.FC<SpiritSpeechBubbleProps> = ({ lang, containerRef }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const isDay = snap.gardenDaylight > 0.44;
  const bubble = snap.spiritBubble;

  if (snap.commDrawerOpen) return null;

  const isVisible = Boolean(
    snap.liveVoiceActive ||
      snap.voiceListening ||
      snap.pendingConfirmation ||
      (bubble &&
        bubble.visible &&
        (bubble.isLoading ||
          bubble.text ||
          bubble.generatedImage ||
          (bubble.rescueCards && bubble.rescueCards.length > 0)))
  );

  const surfaceCls = isDay
    ? 'border-[#d8cfbe] bg-[#faf7f0]/95 text-[#1e2c25] shadow-[0_14px_38px_rgba(24,36,28,0.18)]'
    : 'border-white/18 bg-[#121b28]/94 text-[#f4f0e8] shadow-[0_16px_42px_rgba(3,7,14,0.52)]';

  const subCardCls = isDay
    ? 'border-black/8 bg-white/85 text-[#1e2c25]'
    : 'border-white/12 bg-[#1a2636]/90 text-[#f2eee6]';

  const btnGhostCls = isDay
    ? 'text-[#31433a] hover:bg-black/[0.07]'
    : 'text-[#e5dfd3] hover:bg-white/[0.11]';

  const accentBtnCls = isDay
    ? 'bg-[#24382f] text-[#f7f4ec] hover:bg-[#192821]'
    : 'bg-[#e9e1d0] text-[#141e2b] hover:bg-white';

  const handleUseRescueCard = (card: SpokenRescueCard) => {
    if (snap.activeRoleplayContext) {
      window.dispatchEvent(
        new CustomEvent('one-language-use-phrase', {
          detail: { text: card.targetText, translationZh: card.translationZh },
        })
      );
    } else {
      void submitSpiritCommand(card.targetText, { lang, speakReply: true });
    }
  };

  const handleRescueClick = () => {
    if (bubble?.rescueCards && bubble.rescueCards.length > 0) {
      uiStateManager.setSpiritBubble({ rescueExpanded: !bubble.rescueExpanded });
    } else {
      void requestInstantSpokenRescue();
    }
  };

  const hasLanguageContext = Boolean(
    snap.activeRoleplayContext ||
      snap.languageStudioOpen ||
      bubble?.translationZh ||
      (bubble?.rescueCards && bubble.rescueCards.length > 0)
  );

  const liveBadgeText = snap.liveVoiceActive
    ? snap.liveVoicePhase === 'connecting'
      ? isZh
        ? '正在连接实时语音'
        : 'Connecting Live'
      : snap.liveVoicePhase === 'speaking'
      ? isZh
        ? '实时回答中'
        : 'Speaking Live'
      : snap.liveVoicePhase === 'thinking'
      ? isZh
        ? '实时思考中'
        : 'Thinking'
      : isZh
      ? '实时对话中 · 请开口'
      : 'Live · Speak Now'
    : snap.voiceListening
    ? isZh
      ? '正在聆听你说话'
      : 'Listening'
    : bubble?.badge || null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: 'translate3d(-9999px, -9999px, 0)',
        willChange: 'transform',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      className="z-30 transition-opacity duration-200"
      data-testid="spirit-overhead-bubble"
    >
      <div className="relative -translate-x-1/2 -translate-y-full pb-2">
        {bubble?.isAmbientHint && !snap.liveVoiceActive && !snap.voiceListening && !snap.pendingConfirmation ? (
          <div
            className={`w-[min(72vw,216px)] rounded-xl border px-2.5 py-1.5 transition-colors ${surfaceCls}`}
          >
            <div className="flex items-start justify-between gap-1.5">
              <p className="text-[11px] leading-[1.45] opacity-90">{bubble.text}</p>
              <button
                type="button"
                onClick={() => uiStateManager.hideSpiritBubble()}
                className={`-mr-0.5 -mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded cursor-pointer opacity-60 hover:opacity-100 ${btnGhostCls}`}
                title={isZh ? '关闭提示' : 'Dismiss'}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            {bubble.quickActions && bubble.quickActions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {bubble.quickActions.map((qa, idx) => (
                  <button
                    key={`${qa.action}_${idx}`}
                    type="button"
                    onClick={() => {
                      if (qa.action === 'open_library') {
                        uiStateManager.hideSpiritBubble();
                        window.dispatchEvent(new CustomEvent('one-spirit-quick-action', { detail: { action: 'open_library' } }));
                      } else if (qa.action === 'play_music') {
                        window.dispatchEvent(new CustomEvent('one-music-play-inline', { detail: { query: '轻音乐 钢琴' } }));
                      } else if (qa.action === 'next_music') {
                        window.dispatchEvent(new Event('one-music-next-inline'));
                      } else if (qa.action === 'stop_music') {
                        window.dispatchEvent(new Event('one-music-force-stop'));
                        uiStateManager.hideSpiritBubble();
                      }
                    }}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                      idx === 0
                        ? accentBtnCls
                        : isDay
                        ? 'border border-black/10 bg-white/70 text-[#22322b] hover:bg-white'
                        : 'border border-white/14 bg-white/[0.08] text-[#f2eee6] hover:bg-white/[0.15]'
                    }`}
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div
          className={`w-[min(80vw,280px)] max-h-[46vh] overflow-y-auto rounded-2xl border p-2.5 transition-colors ${surfaceCls}`}
        >
          {/* Compact Header Row */}
          <div className={`flex items-center justify-between gap-1.5 pb-1 mb-1 border-b ${isDay ? 'border-black/8' : 'border-white/10'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <img
                src="/assets/spirit/one-butterfly-avatar.jpg"
                alt={snap.aiName}
                referrerPolicy="no-referrer"
                className="h-4.5 w-4.5 shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/20"
              />
              <span className="text-[11px] font-semibold tracking-tight truncate">{snap.aiName}</span>
              {liveBadgeText && (
                <span
                  className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${
                    snap.liveVoiceActive || snap.voiceListening
                      ? isDay
                        ? 'bg-[#dfeee6] text-[#1c4b39]'
                        : 'bg-emerald-500/20 text-emerald-200'
                      : isDay
                      ? 'bg-black/[0.06] text-[#2b3f35]'
                      : 'bg-white/[0.1] text-[#e8e2d5]'
                  }`}
                >
                  {liveBadgeText}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {snap.liveVoiceActive && (
                <button
                  type="button"
                  onClick={() => stopSpiritLiveVoice()}
                  className={`inline-flex h-6 items-center gap-1 rounded-lg px-1.5 text-[10px] font-medium cursor-pointer transition-colors ${
                    isDay
                      ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
                      : 'bg-white/14 text-[#f5f1e8] hover:bg-white/22'
                  }`}
                  title={isZh ? '结束实时语音' : 'End live voice'}
                >
                  <PhoneOff className="h-3 w-3" />
                  <span>{isZh ? '挂断' : 'End'}</span>
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
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-lg cursor-pointer transition-colors ${btnGhostCls}`}
                  title={bubble.speaking ? (isZh ? '停止朗读' : 'Stop audio') : isZh ? '再听一遍' : 'Replay voice'}
                >
                  {bubble.speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (snap.liveVoiceActive) stopSpiritLiveVoice();
                  uiStateManager.hideSpiritBubble();
                }}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-lg cursor-pointer transition-colors ${btnGhostCls}`}
                title={isZh ? '关闭气泡' : 'Close bubble'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Live Voice Caption while user is speaking */}
          {(snap.voiceListening || (snap.liveVoiceActive && snap.lastSpokenTranscript)) && (
            <div className={`mb-2 rounded-xl border px-2.5 py-1.5 text-xs ${subCardCls}`}>
              <div className="text-[10px] opacity-65 mb-0.5">{isZh ? '你刚才说：' : 'You said:'}</div>
              <div className="font-medium">
                {snap.lastSpokenTranscript || (isZh ? '请直接开口说话，我在听...' : 'Speak now, I am listening...')}
              </div>
            </div>
          )}

          {/* Pending Tool Confirmation (handled inline so no second panel ever opens) */}
          {snap.pendingConfirmation && (
            <div className={`mb-2 rounded-xl border p-2.5 text-xs ${subCardCls}`}>
              <div className="font-semibold mb-1">
                {snap.pendingConfirmation.targetName || (isZh ? '操作确认' : 'Confirm Action')}
              </div>
              <div className="text-[11px] opacity-80 leading-relaxed">{snap.pendingConfirmation.summary}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void respondToAgentConfirmation(snap.pendingConfirmation!.confirmToken, 'confirm')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer ${accentBtnCls}`}
                >
                  <Check className="h-3 w-3" />
                  <span>{isZh ? '确认执行' : 'Confirm'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void respondToAgentConfirmation(snap.pendingConfirmation!.confirmToken, 'cancel')}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] cursor-pointer ${
                    isDay ? 'border-black/12 text-[#2b3b33] hover:bg-black/[0.05]' : 'border-white/15 text-[#e8e2d5] hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{isZh ? '取消' : 'Cancel'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {bubble?.isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 opacity-80" />
              <span className="opacity-85">{bubble.loadingLabel || (isZh ? '正在回应...' : 'Responding...')}</span>
            </div>
          ) : (
            <>
              {/* Main Spoken Dialogue Text */}
              {bubble?.text && (
                <div className="text-[11.5px] leading-[1.55] font-normal whitespace-pre-wrap break-words">
                  {bubble.text}
                </div>
              )}

              {/* Subtle 1-Tap Ambient & Inline Music Quick Actions */}
              {bubble?.quickActions && bubble.quickActions.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {bubble.quickActions.map((qa, idx) => (
                    <button
                      key={`${qa.action}_${idx}`}
                      type="button"
                      onClick={() => {
                        if (qa.action === 'open_library') {
                          uiStateManager.hideSpiritBubble();
                          window.dispatchEvent(new CustomEvent('one-spirit-quick-action', { detail: { action: 'open_library' } }));
                        } else if (qa.action === 'play_music') {
                          window.dispatchEvent(new CustomEvent('one-music-play-inline', { detail: { query: '轻音乐 钢琴' } }));
                        } else if (qa.action === 'next_music') {
                          window.dispatchEvent(new Event('one-music-next-inline'));
                        } else if (qa.action === 'stop_music') {
                          window.dispatchEvent(new Event('one-music-force-stop'));
                          uiStateManager.hideSpiritBubble();
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                        idx === 0
                          ? accentBtnCls
                          : isDay
                          ? 'border border-black/12 bg-white/75 text-[#22322b] hover:bg-white'
                          : 'border border-white/15 bg-white/[0.08] text-[#f2eee6] hover:bg-white/[0.15]'
                      }`}
                    >
                      <span>{qa.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Bilingual Chinese Subtitle & Phonetic Guide */}
              {bubble?.translationZh && bubble.translationZh !== bubble.text && (
                <div className={`mt-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] leading-relaxed ${subCardCls}`}>
                  <div className="opacity-90">{bubble.translationZh}</div>
                  {bubble.phonetic && (
                    <div className="mt-0.5 font-mono text-[10px] opacity-65">{bubble.phonetic}</div>
                  )}
                </div>
              )}

              {/* Inline Generated Image */}
              {bubble?.generatedImage && (
                <div className={`mt-2 overflow-hidden rounded-xl border ${isDay ? 'border-black/10 bg-white' : 'border-white/14 bg-black/30'}`}>
                  <button
                    type="button"
                    onClick={() => uiStateManager.setImageLightbox(bubble.generatedImage || null)}
                    className="block w-full cursor-pointer overflow-hidden text-left"
                  >
                    <img
                      src={bubble.generatedImage.imageUrl}
                      alt={bubble.generatedImage.captionZh || 'AI Generated'}
                      className="max-h-48 w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                    />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[10px]">
                    <span className="truncate opacity-75">
                      {bubble.generatedImage.providerLabelZh || (isZh ? 'ONE 画室' : 'ONE Studio')}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => uiStateManager.setImageLightbox(bubble.generatedImage || null)}
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer ${btnGhostCls}`}
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>{isZh ? '大图' : 'Zoom'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => bubble.generatedImage && triggerImageDownload(bubble.generatedImage)}
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer ${btnGhostCls}`}
                      >
                        <Download className="h-3 w-3" />
                        <span>{isZh ? '保存' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Instant "我不知道怎么讲" Rescue Action Strip */}
              {hasLanguageContext && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRescueClick}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${accentBtnCls}`}
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>
                      {bubble?.rescueExpanded
                        ? isZh
                          ? '收起口语急救句'
                          : 'Hide Hints'
                        : isZh
                          ? '我不知道怎么讲 · 帮我说'
                          : 'Help Me Say It'}
                    </span>
                  </button>
                  {!snap.languageStudioOpen && (
                    <button
                      type="button"
                      onClick={() => uiStateManager.openLanguageStudio()}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                        isDay ? 'border-black/12 bg-white/70 text-[#22322b] hover:bg-white' : 'border-white/15 bg-white/[0.07] text-[#f2eee6] hover:bg-white/[0.14]'
                      }`}
                    >
                      <BookOpen className="h-3 w-3" />
                      <span>{isZh ? '展开语言教室' : 'Open Studio'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Expanded Instant Spoken Rescue Cards */}
              {bubble?.rescueExpanded && bubble.rescueCards && bubble.rescueCards.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-medium opacity-75">
                    <Sparkles className="h-3 w-3" />
                    <span>{isZh ? '挑一句直接开口说（点小喇叭先听示范）：' : 'Pick a phrase to hear or speak:'}</span>
                  </div>
                  {bubble.rescueCards.map((card, idx) => (
                    <div key={idx} className={`rounded-xl border p-2 text-xs ${subCardCls}`}>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          isDay ? 'bg-[#e6efe9] text-[#1f4234]' : 'bg-white/12 text-[#f0e6d2]'
                        }`}>
                          {card.labelZh}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void speakSpiritReply(card.targetText, bubble.speakLang || 'en')}
                            className={`inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[10px] cursor-pointer ${btnGhostCls}`}
                            title={isZh ? '听示范发音' : 'Hear pronunciation'}
                          >
                            <Volume2 className="h-3 w-3" />
                            <span>{isZh ? '听' : 'Hear'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUseRescueCard(card)}
                            className={`inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-medium cursor-pointer ${accentBtnCls}`}
                          >
                            <Send className="h-2.5 w-2.5" />
                            <span>{isZh ? '用这句说' : 'Use'}</span>
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 font-medium leading-snug">{card.targetText}</div>
                      <div className="mt-0.5 text-[11px] opacity-75">{card.translationZh}</div>
                      {card.phonetic && (
                        <div className="mt-0.5 font-mono text-[10px] opacity-60">{card.phonetic}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Speech Bubble Pointer Tail pointing cleanly to the 3D Spirit's head */}
        <div
          className={`mx-auto -mt-[1px] h-2 w-2 rotate-45 border-b border-r ${
            isDay ? 'border-[#d8cfbe] bg-[#faf7f0]' : 'border-white/18 bg-[#121b28]'
          }`}
        />
      </div>
    </div>
  );
};

export default SpiritSpeechBubble;
