import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Send,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import {
  dispatchAgentClientActions,
  pauseActiveSpiritTask,
  respondToAgentConfirmation,
  resumePausedSpiritTask,
  speakSpiritReply,
  stopSpiritSpeech,
  submitSpiritCommand,
} from '../../agent/agentClient.ts';
import { analyzeDialogueEmotion } from '../../utils/emotionEngine.ts';
import { triggerImageDownload } from './SpiritSpeechBubble.tsx';

const SPIRIT_VOICE_OPTIONS = [
  { id: 'Zephyr', labelZh: 'Zephyr · 清澈灵动', labelEn: 'Zephyr' },
  { id: 'Kore', labelZh: 'Kore · 温暖柔和', labelEn: 'Kore' },
  { id: 'Puck', labelZh: 'Puck · 活力好奇', labelEn: 'Puck' },
  { id: 'Charon', labelZh: 'Charon · 沉稳深邃', labelEn: 'Charon' },
  { id: 'Fenrir', labelZh: 'Fenrir · 果断锐利', labelEn: 'Fenrir' },
] as const;

interface PavilionAiHudProps {
  lang: Language;
}

export const PavilionAiHud: React.FC<PavilionAiHudProps> = ({ lang }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const isDay = snap.gardenDaylight > 0.44;

  const [editedMsg, setEditedMsg] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [sendingQuick, setSendingQuick] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(snap.aiName);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentEmotionMeta = analyzeDialogueEmotion('', '', snap.currentEmotion);

  const pending = snap.pendingConfirmation;
  const task = snap.activeTask;
  const messages = snap.chatMessages;

  useEffect(() => {
    setNameDraft(snap.aiName);
  }, [snap.aiName]);

  useEffect(() => {
    if (pending?.preview && typeof pending.preview.messageText === 'string') {
      setEditedMsg(pending.preview.messageText);
    } else if (pending?.preview && typeof pending.preview.content === 'string') {
      setEditedMsg(pending.preview.content);
    } else {
      setEditedMsg('');
    }
  }, [pending?.confirmToken]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, task?.status, pending?.confirmToken]);

  if (snap.commDrawerOpen || !snap.pavilionHudOpen) {
    return null;
  }

  const commitName = () => {
    const clean = nameDraft.trim();
    if (clean) uiStateManager.setAiName(clean);
    else setNameDraft(snap.aiName);
    setEditingName(false);
  };

  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickInput.trim();
    if (!trimmed || sendingQuick) return;
    setSendingQuick(true);
    setQuickInput('');
    try {
      await submitSpiritCommand(trimmed, { lang });
    } finally {
      setSendingQuick(false);
    }
  };

  const handleConfirm = async (decision: 'confirm' | 'cancel') => {
    if (!pending || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await respondToAgentConfirmation(
        pending.confirmToken,
        decision,
        pending.actionType === 'send_message' ? editedMsg : undefined
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleRest = async () => {
    await pauseActiveSpiritTask();
    uiStateManager.setSpiritState('returning_to_rest');
    uiStateManager.setPavilionHudOpen(false);
  };

  const cardCls = isDay
    ? 'border-white/55 bg-[#f7f3eb]/78 text-[#223029] shadow-[0_12px_34px_rgba(24,36,28,0.14)]'
    : 'border-white/14 bg-[#141d29]/68 text-[#f2eee6] shadow-[0_14px_38px_rgba(4,8,14,0.38)]';

  const subtleBtnCls = isDay
    ? 'text-[#394b42]/80 hover:bg-black/[0.07] hover:text-[#1a2620]'
    : 'text-[#e5dfd3]/80 hover:bg-white/[0.1] hover:text-white';

  const userBubbleCls = isDay
    ? 'bg-[#2a3832]/12 text-[#1d2a23]'
    : 'bg-white/12 text-[#f6f3ec]';

  const aiBubbleCls = isDay
    ? 'bg-white/62 text-[#1e2c25]'
    : 'bg-black/22 text-[#f1ede4]';

  return (
    <div
      className={`pointer-events-auto fixed left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-3.5 top-[calc(6.55rem+env(safe-area-inset-top))] lg:top-[calc(3.85rem+env(safe-area-inset-top))] z-30 w-[min(92vw,328px)] max-h-[calc(100dvh-13.5rem)] overflow-y-auto overscroll-contain rounded-2xl border p-3 transition-colors ${cardCls}`}
      data-testid="pavilion-ai-hud"
    >
      <div className={`flex items-center justify-between gap-1.5 border-b pb-2 ${isDay ? 'border-black/8' : 'border-white/10'}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={nameDraft}
                maxLength={20}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitName();
                  } else if (e.key === 'Escape') {
                    setNameDraft(snap.aiName);
                    setEditingName(false);
                  }
                }}
                className={`h-6 w-24 rounded-lg border px-2 text-xs font-medium outline-none ${
                  isDay ? 'border-black/20 bg-white/80 text-[#1d2924]' : 'border-white/20 bg-black/25 text-white'
                }`}
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commitName} className={`p-1 rounded ${subtleBtnCls}`}>
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight hover:opacity-80 cursor-pointer truncate"
              title={isZh ? '点击修改 AI 名称' : 'Click to rename AI'}
            >
              <span className="truncate">{snap.aiName}</span>
              <Pencil className="h-3 w-3 opacity-55 shrink-0" />
            </button>
          )}
          <span className={`shrink-0 text-[10px] opacity-65`}>
            {isZh ? currentEmotionMeta.labelZh : currentEmotionMeta.labelEn}
          </span>
          {task?.status === 'running' && (
            <Loader2 className="h-3 w-3 animate-spin opacity-65 shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowVoiceMenu((v) => !v)}
            className={`inline-flex h-6 items-center gap-0.5 rounded-lg px-1.5 text-[10px] font-medium transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? '切换真人声线' : 'Choose voice persona'}
          >
            <span>{snap.voiceName}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !snap.voiceReplyEnabled;
              if (!next) stopSpiritSpeech();
              uiStateManager.setVoiceStatus({ voiceReplyEnabled: next });
            }}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={snap.voiceReplyEnabled ? (isZh ? '关闭语音播报' : 'Mute voice reply') : isZh ? '开启语音播报' : 'Enable voice reply'}
          >
            {snap.voiceReplyEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 opacity-60" />}
          </button>
          <button
            type="button"
            onClick={() => uiStateManager.openLanguageStudio({ targetLang: 'en', mode: 'roleplay' })}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? '打开实景口语与刷题教室' : 'Open Language Studio'}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => uiStateManager.openLanguageStudio({ targetLang: 'en', mode: 'image_pool' })}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? '打开 ONE 画室' : 'Open ONE Art Studio'}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('one-open-live-companion'))}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? '实时连续语音对话' : 'Real-Time Live Voice'}
          >
            <AudioLines className="h-3.5 w-3.5" />
          </button>
          {task?.status === 'paused' && (
            <button
              type="button"
              onClick={() => void resumePausedSpiritTask(lang)}
              className={`inline-flex h-6 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium cursor-pointer ${subtleBtnCls}`}
              title={isZh ? '恢复任务' : 'Resume'}
            >
              <Play className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRest()}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? `让 ${snap.aiName} 回木屋休息` : 'Rest in Cottage'}
          >
            <Pause className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              stopSpiritSpeech();
              uiStateManager.setPavilionHudOpen(false);
            }}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors cursor-pointer ${subtleBtnCls}`}
            title={isZh ? '收起' : 'Close'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showVoiceMenu && (
        <div className={`mt-2 grid grid-cols-2 gap-1 rounded-xl border p-1.5 ${isDay ? 'border-black/10 bg-white/55' : 'border-white/10 bg-black/20'}`}>
          {SPIRIT_VOICE_OPTIONS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                uiStateManager.setVoiceName(v.id);
                setShowVoiceMenu(false);
              }}
              className={`rounded-lg px-2 py-1 text-left text-[10px] font-medium transition-colors cursor-pointer truncate ${
                snap.voiceName === v.id
                  ? isDay
                    ? 'bg-[#2a3832] text-[#f7f4ee]'
                    : 'bg-[#e9e2d4] text-[#17202b]'
                  : subtleBtnCls
              }`}
            >
              {isZh ? v.labelZh : v.labelEn}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="mt-2 space-y-2 max-h-[200px] overflow-y-auto pr-0.5">
        {messages.length === 0 ? (
          <div className={`rounded-xl px-2.5 py-2 text-xs leading-relaxed ${aiBubbleCls}`}>
            {isZh
              ? `我是 ${snap.aiName}，点击上方名字可随时改名。有什么想聊的或要我帮忙的事吗？`
              : `I am ${snap.aiName}. Click my name above to rename me anytime — how can I help?`}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user' ? `ml-6 ${userBubbleCls}` : `mr-3 ${aiBubbleCls}`
              }`}
            >
              <div>{m.content}</div>
              {m.translationZh && (
                <div className="mt-1 text-[11px] opacity-75">{m.translationZh}</div>
              )}
              {m.generatedImage && (
                <div className="mt-2 overflow-hidden rounded-lg border border-black/10">
                  <button
                    type="button"
                    onClick={() => uiStateManager.setImageLightbox(m.generatedImage || null)}
                    className="block w-full cursor-pointer"
                  >
                    <img
                      src={m.generatedImage.imageUrl}
                      alt={m.generatedImage.captionZh}
                      className="max-h-40 w-full object-cover"
                    />
                  </button>
                  <div className="flex items-center justify-between gap-1 px-2 py-1 text-[10px]">
                    <span className="truncate opacity-70">{m.generatedImage.providerLabelZh || 'ONE 画室'}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => uiStateManager.setImageLightbox(m.generatedImage || null)}
                        className="p-0.5 opacity-80 hover:opacity-100 cursor-pointer"
                        title="放大"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => m.generatedImage && triggerImageDownload(m.generatedImage)}
                        className="p-0.5 opacity-80 hover:opacity-100 cursor-pointer"
                        title="保存"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {m.rescueCards && m.rescueCards.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {m.rescueCards.map((rc, i) => (
                    <div key={i} className="flex items-center justify-between gap-1 rounded-lg border border-black/10 px-2 py-1 text-[11px]">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{rc.targetText}</div>
                        <div className="text-[10px] opacity-70 truncate">{rc.translationZh}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void speakSpiritReply(rc.targetText, m.speakLang || 'en')}
                        className="p-1 opacity-75 hover:opacity-100 cursor-pointer shrink-0"
                        title="听示范发音"
                      >
                        <Volume2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {task?.status === 'running' && (
          <div className={`mr-3 rounded-xl px-2.5 py-1.5 text-[11px] opacity-75 ${aiBubbleCls}`}>
            {task.steps?.[task.steps.length - 1]?.label || (isZh ? '思考中...' : 'Thinking...')}
          </div>
        )}
      </div>

      {task?.clientActions && task.clientActions.length > 0 && !pending && task.status !== 'running' && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => dispatchAgentClientActions(task.clientActions || [])}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${
              isDay
                ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
                : 'bg-[#e9e2d4] text-[#17202b] hover:bg-white'
            }`}
          >
            <Check className="h-3 w-3" />
            <span>{isZh ? '打开对应界面' : 'Open View'}</span>
          </button>
        </div>
      )}

      {!pending && (
        <form onSubmit={(e) => void handleQuickSend(e)} className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder={isZh ? `和 ${snap.aiName} 实时对话...` : `Chat with ${snap.aiName}...`}
            className={`h-7 flex-1 min-w-0 rounded-full border px-2.5 text-xs focus:outline-none ${
              isDay
                ? 'border-black/12 bg-white/70 text-[#1d2a23] placeholder:text-[#485a50]/65'
                : 'border-white/14 bg-black/22 text-white placeholder:text-[#ded8cb]/55'
            }`}
          />
          <button
            type="submit"
            disabled={!quickInput.trim() || sendingQuick}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-40 ${
              isDay
                ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
                : 'bg-[#e9e2d4] text-[#17202b] hover:bg-white'
            }`}
            title={isZh ? '发送' : 'Send'}
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      )}

      {pending && (
        <div
          className={`mt-2.5 rounded-xl border p-2.5 text-xs ${
            isDay ? 'border-[#8a6d3b]/25 bg-[#f2e8d5]/80' : 'border-[#d6b984]/25 bg-[#241f18]/75'
          }`}
          data-testid="agent-confirmation-gate"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span>{isZh ? '发送前请确认' : 'Confirm Action'}</span>
          </div>
          <p className="mt-1 text-[11px] opacity-85">{pending.summary}</p>

          {pending.actionType === 'send_message' && (
            <textarea
              value={editedMsg}
              onChange={(e) => setEditedMsg(e.target.value)}
              rows={2}
              className={`mt-2 w-full rounded-lg border px-2 py-1 text-xs focus:outline-none ${
                isDay
                  ? 'border-black/15 bg-white/80 text-[#1d2924]'
                  : 'border-white/15 bg-black/25 text-white'
              }`}
              placeholder={isZh ? '可修改发送内容...' : 'Edit message...'}
            />
          )}

          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={confirmBusy}
              onClick={() => void handleConfirm('cancel')}
              className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium cursor-pointer disabled:opacity-50 ${subtleBtnCls}`}
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={confirmBusy}
              onClick={() => void handleConfirm('confirm')}
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium cursor-pointer disabled:opacity-50 ${
                isDay
                  ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
                  : 'bg-[#e9e2d4] text-[#17202b] hover:bg-white'
              }`}
            >
              <Send className="h-3 w-3" />
              <span>{confirmBusy ? (isZh ? '执行中' : 'Busy') : isZh ? '确认' : 'Confirm'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PavilionAiHud;
