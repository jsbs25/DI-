import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import {
  dispatchAgentClientActions,
  pauseActiveSpiritTask,
  respondToAgentConfirmation,
  resumePausedSpiritTask,
} from '../../agent/agentClient.ts';

interface PavilionAiHudProps {
  lang: Language;
}

const SPIRIT_STATE_LABELS: Record<string, { zh: string; en: string }> = {
  idle_explore: { zh: '花园漫步中', en: 'Exploring' },
  woken_approaching: { zh: '正前往湖畔凉亭', en: 'Heading to Pavilion' },
  entering_pavilion: { zh: '步入凉亭准备调度', en: 'Entering Pavilion' },
  working_in_pavilion: { zh: '凉亭调度 ONE AI 中', en: 'Orchestrating in Pavilion' },
  presenting_result: { zh: '凉亭为您呈现结果', en: 'Presenting in Pavilion' },
  returning_to_rest: { zh: '正返回木屋休息', en: 'Returning to Cottage' },
  sleeping_in_house: { zh: '木屋静候中', en: 'Resting in Cottage' },
};

export const PavilionAiHud: React.FC<PavilionAiHudProps> = ({ lang }) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const [editedMsg, setEditedMsg] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);

  const pending = snap.pendingConfirmation;
  const task = snap.activeTask;

  useEffect(() => {
    if (pending?.preview && typeof pending.preview.content === 'string') {
      setEditedMsg(pending.preview.content);
    } else {
      setEditedMsg('');
    }
  }, [pending?.confirmToken]);

  // Hide automatically while user is inside Communication drawer
  if (snap.commDrawerOpen || !snap.pavilionHudOpen) {
    return null;
  }

  if (!task && !pending) {
    return null;
  }

  const stateMeta = SPIRIT_STATE_LABELS[snap.spiritState] || SPIRIT_STATE_LABELS.idle_explore;

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

  return (
    <div
      className="pointer-events-auto fixed right-3 top-[calc(7.1rem+env(safe-area-inset-top))] md:top-[calc(4.4rem+env(safe-area-inset-top))] md:right-4 z-30 w-[min(92vw,390px)] rounded-2xl border border-white/15 bg-[#0b1320]/92 p-3.5 text-slate-100 shadow-2xl"
      data-testid="pavilion-ai-hud"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/18 text-emerald-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tracking-tight text-white">
                {isZh ? '湖畔凉亭 · 小小' : 'Pavilion · Spirit'}
              </span>
              <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                {isZh ? stateMeta.zh : stateMeta.en}
              </span>
            </div>
            {task?.prompt && (
              <p className="truncate text-[11px] text-slate-400">{task.prompt}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task?.status === 'paused' && (
            <button
              type="button"
              onClick={() => void resumePausedSpiritTask(lang)}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-500/20 px-2 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30 cursor-pointer"
              title={isZh ? '恢复任务' : 'Resume'}
            >
              <Play className="h-3 w-3" />
              <span>{isZh ? '继续' : 'Resume'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRest()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white cursor-pointer"
            title={isZh ? '让小小回木屋休息' : 'Rest in Cottage'}
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => uiStateManager.setPavilionHudOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white cursor-pointer"
            title={isZh ? '收起面板' : 'Close HUD'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Real Execution Steps */}
      {task?.steps && task.steps.length > 0 && (
        <div className="mt-2.5 space-y-1.5 max-h-32 overflow-y-auto pr-1">
          {task.steps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 text-[11px]">
              {step.status === 'done' ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : step.status === 'failed' ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              ) : (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-300" />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-slate-200">{step.label}</span>
                {step.detail && (
                  <span className="ml-1.5 text-slate-400">— {step.detail}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Structured Reply */}
      {task?.reply && (
        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs leading-relaxed text-slate-100 max-h-44 overflow-y-auto whitespace-pre-wrap">
          {task.reply}
        </div>
      )}

      {/* Quick Action Re-open Button when clientActions exist */}
      {task?.clientActions && task.clientActions.length > 0 && !pending && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => dispatchAgentClientActions(task.clientActions || [])}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#F7F5F0] px-3 text-[11px] font-medium text-[#0c1420] hover:bg-[#EAE5DC] transition-colors cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isZh ? '进入对应界面查看' : 'Open Workspace View'}</span>
          </button>
        </div>
      )}

      {/* Strict Permission Confirmation Gate for Messaging / Calls */}
      {pending && (
        <div
          className="mt-3 rounded-xl border border-amber-300/35 bg-amber-950/35 p-3 text-xs"
          data-testid="agent-confirmation-gate"
        >
          <div className="flex items-center gap-1.5 font-semibold text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
            <span>{isZh ? '需要您的明确确认' : 'Confirmation Required'}</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-100/90">{pending.summary}</p>

          {pending.actionType === 'send_message' && (
            <textarea
              value={editedMsg}
              onChange={(e) => setEditedMsg(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-lg border border-white/15 bg-[#09101a] px-2.5 py-1.5 text-xs text-white focus:border-amber-300/60 focus:outline-none"
              placeholder={isZh ? '可在此修改将要发送的内容...' : 'Edit message before sending...'}
            />
          )}

          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={confirmBusy}
              onClick={() => void handleConfirm('cancel')}
              className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/8 px-3 text-[11px] font-medium text-slate-200 hover:bg-white/14 disabled:opacity-50 cursor-pointer"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={confirmBusy}
              onClick={() => void handleConfirm('confirm')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3 w-3" />
              <span>
                {confirmBusy
                  ? isZh
                    ? '执行中...'
                    : 'Executing...'
                  : isZh
                  ? '确认执行'
                  : 'Confirm'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PavilionAiHud;
