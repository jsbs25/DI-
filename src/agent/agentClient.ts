import type { Language } from '../types/index.ts';
import type { WeatherKind, TimePreset } from '../components/paradise/paradiseEnvironment.ts';
import { uiStateManager, type AgentTaskView } from './uiStateManager.ts';

export interface LearningAgentAction {
  seq: number;
  language?: 'ar' | 'en';
  tab?: 'alphabet' | 'practice' | 'english' | 'islamic_library' | 'duolingo_platform';
}

export interface AgentClientHandlers {
  onNavigateTab?: (tab: string) => void;
  onOpenBookById?: (bookId: string) => void;
  onOpenBookAction?: (opts: { query: string }) => void;
  onOpenLanguageLesson?: (action: LearningAgentAction) => void;
  onBrowserSearchAction?: (query: string) => void;
  onGlobalSearchAction?: (query: string) => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean; control?: string }) => void;
  onWatchDocumentaryAction?: (opts: { query: string; platform?: 'all' | 'bilibili' | 'youtube'; randomPick?: boolean }) => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onSetLang?: (lang: Language) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onOpenCommDrawer?: (conversationId?: string) => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
  onOpenAuth?: () => void;
  onOpenCommandPalette?: () => void;
  onReplayIntro?: () => void;
}

let registeredHandlers: AgentClientHandlers = {};
let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

export function registerAgentClientHandlers(handlers: AgentClientHandlers) {
  registeredHandlers = handlers;
}

export function dispatchAgentClientActions(actions: Array<Record<string, unknown>>) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  for (const act of actions) {
    const type = String(act?.type || '');
    switch (type) {
      case 'navigate_tab':
        if (typeof act.tab === 'string') registeredHandlers.onNavigateTab?.(act.tab);
        break;
      case 'open_book_by_id':
        if (typeof act.bookId === 'string') registeredHandlers.onOpenBookById?.(act.bookId);
        else if (typeof act.query === 'string') registeredHandlers.onOpenBookAction?.({ query: act.query });
        break;
      case 'open_book':
        registeredHandlers.onOpenBookAction?.({ query: typeof act.query === 'string' ? act.query : '' });
        break;
      case 'open_language_lesson':
        registeredHandlers.onOpenLanguageLesson?.({
          seq: Date.now(),
          language: act.language === 'en' ? 'en' : 'ar',
          tab: (typeof act.tab === 'string' ? act.tab : 'alphabet') as LearningAgentAction['tab'],
        });
        break;
      case 'browser_search':
        if (typeof act.query === 'string') registeredHandlers.onBrowserSearchAction?.(act.query);
        break;
      case 'play_music':
        registeredHandlers.onPlayMusicAction?.({
          query: typeof act.query === 'string' ? act.query : undefined,
          crawl: Boolean(act.crawl),
          control: typeof act.control === 'string' ? act.control : undefined,
        });
        break;
      case 'watch_documentary':
        registeredHandlers.onWatchDocumentaryAction?.({
          query: typeof act.query === 'string' ? act.query : '宇宙 纪录片',
          platform: act.platform === 'bilibili' || act.platform === 'youtube' ? act.platform : 'all',
          randomPick: true,
        });
        break;
      case 'set_theme':
        if (act.theme === 'dark' || act.theme === 'light') registeredHandlers.onSetTheme?.(act.theme);
        break;
      case 'set_language':
        if (typeof act.lang === 'string') registeredHandlers.onSetLang?.(act.lang as Language);
        break;
      case 'fly_to':
        if (typeof act.lat === 'number' && typeof act.lng === 'number') registeredHandlers.onFlyTo?.(act.lat, act.lng);
        break;
      case 'open_comm_drawer':
      case 'open_messages':
        registeredHandlers.onOpenCommDrawer?.(typeof act.conversationId === 'string' ? act.conversationId : undefined);
        break;
      case 'quick_call':
        registeredHandlers.onQuickCall?.(act.kind === 'video' ? 'video' : 'audio', {
          conversationId: typeof act.conversationId === 'string' ? act.conversationId : undefined,
          targetUserId: typeof act.targetUserId === 'string' ? act.targetUserId : undefined,
        });
        break;
      case 'open_auth':
        registeredHandlers.onOpenAuth?.();
        break;
      case 'environment_control':
        uiStateManager.issueEnvironmentCommand({
          weatherPreset: typeof act.weatherPreset === 'string' ? (act.weatherPreset as WeatherKind) : undefined,
          timePreset: typeof act.timePreset === 'string' ? (act.timePreset as TimePreset) : undefined,
          realtimeSync: typeof act.realtimeSync === 'boolean' ? act.realtimeSync : undefined,
        });
        break;
      default:
        break;
    }
  }
}

export async function submitSpiritCommand(
  prompt: string,
  opts: { lang: Language; attachments?: Array<{ type: 'image_url'; imageUrl: string }> }
): Promise<AgentTaskView> {
  const cleanPrompt = prompt.trim();
  const prevTask = uiStateManager.getSnapshot().activeTask;

  uiStateManager.setSpiritState('woken_approaching');
  uiStateManager.setPavilionHudOpen(true);
  uiStateManager.setPendingConfirmation(null);

  const runningView: AgentTaskView = {
    sessionId: prevTask?.sessionId,
    prompt: cleanPrompt,
    module: 'assistant',
    status: 'running',
    steps: [
      {
        id: 'client_send',
        label: opts.lang === 'zh' ? '正在前往湖畔凉亭调度 ONE AI...' : 'Spirit heading to Pavilion & routing ONE AI...',
        status: 'running',
      },
    ],
  };
  uiStateManager.setTask(runningView);

  try {
    const res = await fetch('/api/one-ai/agent/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: cleanPrompt,
        lang: opts.lang,
        history: conversationHistory.slice(-10),
        attachments: opts.attachments,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok && !data?.reply) {
      const failView: AgentTaskView = {
        sessionId: data?.sessionId,
        prompt: cleanPrompt,
        module: data?.module || 'assistant',
        status: 'failed',
        error: data?.error || `HTTP ${res.status}`,
        reply: data?.reply || data?.error || '请求未成功完成，请稍后重试。',
        steps: Array.isArray(data?.steps) ? data.steps : runningView.steps,
      };
      uiStateManager.setTask(failView);
      uiStateManager.setSpiritState('presenting_result');
      return failView;
    }

    const replyText = String(data.reply || '').trim();
    if (cleanPrompt && replyText) {
      conversationHistory = [
        ...conversationHistory.slice(-16),
        { role: 'user', content: cleanPrompt },
        { role: 'assistant', content: replyText },
      ];
    }

    if (data.needsConfirmation) {
      uiStateManager.setPendingConfirmation(data.needsConfirmation);
      uiStateManager.setSpiritState('working_in_pavilion');
      const gateView: AgentTaskView = {
        sessionId: data.sessionId,
        prompt: cleanPrompt,
        module: data.module || 'communication',
        status: 'awaiting_confirmation',
        reply: replyText,
        steps: Array.isArray(data.steps) ? data.steps : [],
        clientActions: [],
      };
      uiStateManager.setTask(gateView);
      return gateView;
    }

    const doneView: AgentTaskView = {
      sessionId: data.sessionId,
      prompt: cleanPrompt,
      module: data.module || 'assistant',
      status: 'completed',
      reply: replyText,
      steps: Array.isArray(data.steps) ? data.steps : [],
      clientActions: Array.isArray(data.clientActions) ? data.clientActions : [],
      resultData: data.resultData || undefined,
    };

    uiStateManager.setTask(doneView);
    uiStateManager.setPausedTask(null);
    uiStateManager.setSpiritState('presenting_result');

    if (Array.isArray(data.clientActions) && data.clientActions.length > 0) {
      dispatchAgentClientActions(data.clientActions);
    }

    return doneView;
  } catch (err: any) {
    const errView: AgentTaskView = {
      prompt: cleanPrompt,
      module: 'assistant',
      status: 'failed',
      error: err?.message || 'Network error',
      reply: opts.lang === 'zh' ? '网络连接异常，未能送达 AI 中枢。' : 'Network error reaching ONE AI.',
      steps: [],
    };
    uiStateManager.setTask(errView);
    uiStateManager.setSpiritState('idle_explore');
    return errView;
  }
}

export async function respondToAgentConfirmation(
  confirmToken: string,
  decision: 'confirm' | 'cancel',
  editedMessage?: string
) {
  const res = await fetch('/api/one-ai/agent/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmToken, decision, editedMessage }),
  });
  const data = await res.json().catch(() => ({}));
  uiStateManager.setPendingConfirmation(null);

  const prev = uiStateManager.getSnapshot().activeTask;
  const nextTask: AgentTaskView = {
    sessionId: data.sessionId || prev?.sessionId,
    prompt: prev?.prompt || '',
    module: prev?.module || 'communication',
    status: res.ok ? 'completed' : 'failed',
    reply: data.reply || data.error || (res.ok ? '已处理。' : '确认操作失败。'),
    error: res.ok ? undefined : data.error,
    steps: prev?.steps || [],
    clientActions: Array.isArray(data.clientActions) ? data.clientActions : [],
  };
  uiStateManager.setTask(nextTask);
  uiStateManager.setSpiritState('presenting_result');

  if (res.ok && Array.isArray(data.clientActions) && data.clientActions.length > 0) {
    dispatchAgentClientActions(data.clientActions);
  }
  return { ok: res.ok, data };
}

export async function pauseActiveSpiritTask() {
  const snap = uiStateManager.getSnapshot();
  if (!snap.activeTask?.sessionId) return;
  try {
    await fetch('/api/one-ai/agent/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: snap.activeTask.sessionId }),
    });
  } catch {
    // non-fatal
  }
}

export async function resumePausedSpiritTask(lang: Language) {
  const snap = uiStateManager.getSnapshot();
  const paused = snap.pausedTask;
  uiStateManager.setSpiritState('woken_approaching');
  uiStateManager.setPavilionHudOpen(true);

  if (paused?.sessionId) {
    try {
      const res = await fetch('/api/one-ai/agent/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: paused.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.session) {
        const s = data.session;
        const restored: AgentTaskView = {
          sessionId: s.sessionId,
          prompt: paused.prompt || s.intentSummary,
          module: s.module || 'assistant',
          status: 'completed',
          reply:
            paused.reply ||
            (lang === 'zh' ? `已为你恢复刚才的任务：「${s.intentSummary}」。` : `Resumed: "${s.intentSummary}".`),
          steps: Array.isArray(s.steps) ? s.steps : paused.steps,
          clientActions: Array.isArray(s.result?.clientActions) ? s.result.clientActions : paused.clientActions,
          resultData: s.result || paused.resultData,
        };
        uiStateManager.setTask(restored);
        uiStateManager.setPausedTask(null);
        uiStateManager.setSpiritState('presenting_result');
        if (restored.clientActions?.length) {
          dispatchAgentClientActions(restored.clientActions);
        }
        return restored;
      }
    } catch {
      // fall through
    }
  }

  return submitSpiritCommand(lang === 'zh' ? '继续刚才的任务' : 'resume', { lang });
}
