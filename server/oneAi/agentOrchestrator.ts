import express from 'express';
import { randomBytes } from 'node:crypto';
import type { User } from '../../src/types/index.ts';
import type { AiTaskType, UnifiedContentPart, UnifiedMessage } from './types.ts';
import { oneAiDb } from './db.ts';
import { oneAiRouter } from './router.ts';
import { checkUserQuota } from './quotaAndSecurity.ts';
import { solvePrecisionQuery } from '../../src/utils/precisionSolver.ts';
import { parseInstantAgentAction } from '../../src/utils/oneAgentController.ts';
import { isConversationalFramingNotCommand } from '../ai/intentAnalyzer.ts';
import {
  persistTurnAndExtractMemories,
  prepareDialogueContext,
  stripAiControlTags,
} from '../ai/contextOrchestrator.ts';
import { normalizeConversationHistory } from '../aiConversation.ts';

export interface AgentStepRecord {
  id: string;
  label: string;
  status: 'completed' | 'running' | 'paused' | 'awaiting_confirmation' | 'failed';
  detail?: string;
  timestamp: string;
}

export interface AgentClientAction {
  type: string;
  [key: string]: unknown;
}

export interface AgentPendingConfirmationView {
  confirmToken: string;
  sessionId: string;
  actionType: 'send_message' | 'start_audio_call' | 'start_video_call';
  targetId: string;
  targetName: string;
  summary: string;
  preview: Record<string, unknown>;
}

export interface OneAiAgentDeps {
  getSessionUser: (req: express.Request) => User | undefined;
  store: any;
  crawlOpenBooks: (q: string, limit?: number) => Promise<any>;
  searchWebProviders: (q: string, limit?: number) => Promise<any[]>;
  fetchAndExtract: (url: string) => Promise<{ title?: string; content?: string; textContent?: string; url?: string }>;
  wsBroadcastConversationEvent: (conversationId: string, event: any) => void;
  wsBroadcastToUser: (userId: string, event: any) => void;
  isUserViewingConversation: (userId: string, conversationId: string) => boolean;
  emitNotification: (userId: string, notif: any) => void;
}

function makeSessionId(): string {
  return `ags_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function makeConfirmToken(): string {
  return `agcfm_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stripWakePrefix(text: string): string {
  return text
    .replace(/^(?:你好[，,\s]*)?小小(?:同学|精灵|老师)?[，,：:\s]*/i, '')
    .trim();
}

function extractBookSearchQuery(prompt: string): string {
  const cleaned = prompt
    .replace(
      /(?:帮我|请|麻烦|我想|我要|找一本|找几本|找本|找一下|搜索|推荐|适合我现在阅读的|适合我读的|适合初学者的|适合入门的|适合|现在|一本|几本|关于|书籍|图书|电子书|阅读|看书|的|book|books|library|recommend|for beginners)/gi,
      ' '
    )
    .replace(/[，。！？,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/阿拉伯|arabic/i.test(prompt) && (!cleaned || /^阿拉伯语?$/i.test(cleaned))) {
    return 'arabic';
  }
  return cleaned || (/阿拉伯|arabic/i.test(prompt) ? 'arabic' : 'literature');
}

function expandBilingualBookTokens(query: string): string[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(tokens);
  if (/阿拉伯|arabic/i.test(query)) {
    expanded.add('arabic');
    expanded.add('阿拉伯');
  }
  if (/英语|英文|english/i.test(query)) {
    expanded.add('english');
    expanded.add('英语');
  }
  if (/历史|history/i.test(query)) {
    expanded.add('history');
    expanded.add('历史');
  }
  if (/科学|science/i.test(query)) {
    expanded.add('science');
    expanded.add('科学');
  }
  if (/哲学|philosophy/i.test(query)) {
    expanded.add('philosophy');
    expanded.add('哲学');
  }
  return Array.from(expanded);
}

function extractFriendAndMessage(prompt: string): {
  kind: 'send_message' | 'start_audio_call' | 'start_video_call';
  targetHint: string;
  messageDraft: string;
} {
  const isVideo = /视频通话|打视频|video\s*call/i.test(prompt);
  const isAudio = /打电话|语音通话|拨打|call/i.test(prompt);
  const kind: 'send_message' | 'start_audio_call' | 'start_video_call' = isVideo
    ? 'start_video_call'
    : isAudio
      ? 'start_audio_call'
      : 'send_message';

  let targetHint = '';
  let messageDraft = '';

  const callMatch = prompt.match(/(?:给|向|对)\s*([^\s，,。：:说发打]+)\s*(?:打(?:个)?(?:电话|语音|视频)|拨打|发(?:个|一条|条)?(?:测试)?(?:消息|私信|问候|语音|信息)|说|tell|call|message)/i);
  if (callMatch && callMatch[1]) {
    targetHint = callMatch[1].replace(/朋友|好友|同学/, '').trim() || callMatch[1].trim();
  }
  const msgMatch = prompt.match(/(?:说|内容是|发送|发消息|问候|tell\s+[^\s]+\s+|say)\s*[:：]?\s*(.+)$/i)
    || prompt.match(/[:：]\s*(.+)$/);
  if (msgMatch && msgMatch[1] && kind === 'send_message') {
    messageDraft = msgMatch[1].replace(/^[“"'「]|[”"'」]$/g, '').trim();
  }
  return { kind, targetHint, messageDraft };
}

function resolveUserConversationTarget(store: any, userId: string, hint: string): {
  conversationId: string;
  targetUserId?: string;
  displayName: string;
  type: 'direct' | 'group';
} | null {
  const convs: any[] = store.getConversationsForUser(userId) || [];
  const lowerHint = hint.trim().toLowerCase();

  if (lowerHint) {
    // 1. Direct message match by participant displayName or username
    for (const c of convs) {
      if (c.type !== 'direct') continue;
      const otherId = (c.participantIds || []).find((pid: string) => pid !== userId);
      const otherUser = otherId ? store.users.find((u: any) => u.id === otherId) : null;
      const candidateNames = [c.name, otherUser?.displayName, otherUser?.username]
        .filter(Boolean)
        .map((s: string) => s.toLowerCase());
      if (candidateNames.some((n) => n.includes(lowerHint) || lowerHint.includes(n))) {
        return {
          conversationId: c.id,
          targetUserId: otherId,
          displayName: otherUser?.displayName || c.name || hint,
          type: 'direct',
        };
      }
    }

    // 2. Group / Global channel conversation match
    if (/全局|公共|大厅|广场|地球村|global|public/i.test(lowerHint)) {
      const globalConv = convs.find((c) => c.type === 'global_channel') || convs.find((c) => c.type === 'country_room');
      if (globalConv) {
        return {
          conversationId: globalConv.id,
          displayName: String(globalConv.name || '地球村全局频道'),
          type: 'group',
        };
      }
    }
    for (const c of convs) {
      if (c.name && String(c.name).toLowerCase().includes(lowerHint)) {
        return {
          conversationId: c.id,
          displayName: String(c.name),
          type: c.type === 'direct' ? 'direct' : 'group',
        };
      }
    }

    // 3. Direct user directory match (must pass DM permission check if used)
    const matchedUser = (store.users || []).find(
      (u: any) =>
        u.id !== userId &&
        store.getAccountStatus(u) !== 'deleted' &&
        ((u.displayName && u.displayName.toLowerCase().includes(lowerHint)) ||
          (u.username && u.username.toLowerCase().includes(lowerHint)))
    );
    if (matchedUser) {
      const perm = store.canSendDirectMessageBetween(userId, matchedUser.id);
      if (perm.ok) {
        const direct = store.getOrCreateDirectConversation(userId, matchedUser.id);
        if (direct) {
          return {
            conversationId: direct.id,
            targetUserId: matchedUser.id,
            displayName: matchedUser.displayName || matchedUser.username,
            type: 'direct',
          };
        }
      }
    }
  }

  // Fallback to most recent direct conversation if user didn't specify a name
  const firstDirect = convs.find((c) => c.type === 'direct');
  if (firstDirect) {
    const otherId = (firstDirect.participantIds || []).find((pid: string) => pid !== userId);
    const otherUser = otherId ? store.users.find((u: any) => u.id === otherId) : null;
    return {
      conversationId: firstDirect.id,
      targetUserId: otherId,
      displayName: otherUser?.displayName || firstDirect.name || '联系人',
      type: 'direct',
    };
  }

  return null;
}

export function createOneAiAgentRouter(deps: OneAiAgentDeps) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    const user = deps.getSessionUser(req);
    const subjectId = user?.id || 'guest';
    const activeOrPaused = oneAiDb.getLatestPausedOrActiveAgentSession(subjectId);
    const recent = oneAiDb.listRecentAgentSessions(subjectId, 8);
    res.json({
      success: true,
      authenticated: Boolean(user),
      activeOrPaused,
      recent,
    });
  });

  router.post('/pause', (req, res) => {
    const user = deps.getSessionUser(req);
    const subjectId = user?.id || 'guest';
    const requestedId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const session = requestedId
      ? oneAiDb.getAgentSession(requestedId)
      : oneAiDb.getLatestPausedOrActiveAgentSession(subjectId);

    if (!session || session.userId !== subjectId) {
      return res.json({ success: true, paused: null });
    }
    if (session.status === 'running' || session.status === 'awaiting_confirmation') {
      const nextSteps: AgentStepRecord[] = [
        ...(Array.isArray(session.steps) ? session.steps : []),
        {
          id: `step_pause_${Date.now()}`,
          label: '已暂停任务现场',
          status: 'paused',
          detail: '等待你处理完通信后随时恢复继续',
          timestamp: nowIso(),
        },
      ];
      oneAiDb.upsertAgentSession({
        sessionId: session.sessionId,
        userId: subjectId,
        status: 'paused',
        intentSummary: session.intentSummary,
        module: session.module,
        steps: nextSteps,
        payload: session.payload,
        result: session.result,
      });
    }
    res.json({ success: true, paused: oneAiDb.getAgentSession(session.sessionId) });
  });

  router.post('/resume', (req, res) => {
    const user = deps.getSessionUser(req);
    const subjectId = user?.id || 'guest';
    const requestedId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const session = requestedId
      ? oneAiDb.getAgentSession(requestedId)
      : oneAiDb.getLatestPausedOrActiveAgentSession(subjectId);

    if (!session || session.userId !== subjectId) {
      return res.status(404).json({ success: false, error: '当前没有可恢复的任务。' });
    }

    const nextSteps: AgentStepRecord[] = [
      ...(Array.isArray(session.steps) ? session.steps : []),
      {
        id: `step_resume_${Date.now()}`,
        label: '已恢复刚才的任务',
        status: 'completed',
        detail: session.intentSummary,
        timestamp: nowIso(),
      },
    ];
    oneAiDb.upsertAgentSession({
      sessionId: session.sessionId,
      userId: subjectId,
      status: session.result ? 'completed' : 'running',
      intentSummary: session.intentSummary,
      module: session.module,
      steps: nextSteps,
      payload: session.payload,
      result: session.result,
    });
    res.json({ success: true, session: oneAiDb.getAgentSession(session.sessionId) });
  });

  router.post('/confirm', async (req, res) => {
    const user = deps.getSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: '请先登录后再确认发送消息或发起通话。' });
    }
    const confirmToken = typeof req.body?.confirmToken === 'string' ? req.body.confirmToken.trim() : '';
    const decision = req.body?.decision === 'cancel' ? 'cancel' : 'confirm';
    const editedMessage = typeof req.body?.editedMessage === 'string' ? req.body.editedMessage.trim() : '';

    if (!confirmToken) {
      return res.status(400).json({ success: false, error: 'confirmToken is required' });
    }
    const pending = oneAiDb.getPendingConfirmation(confirmToken);
    if (!pending || pending.userId !== user.id) {
      return res.status(404).json({ success: false, error: '确认请求不存在或无权限。' });
    }
    if (pending.status !== 'pending') {
      return res.status(409).json({ success: false, error: '该确认请求已处理。' });
    }
    if (Date.now() > new Date(pending.expiresAt).getTime()) {
      oneAiDb.resolvePendingConfirmation(confirmToken, 'expired');
      return res.status(410).json({ success: false, error: '确认请求已过期，请重新发起指令。' });
    }

    const session = oneAiDb.getAgentSession(pending.sessionId);

    if (decision === 'cancel') {
      oneAiDb.resolvePendingConfirmation(confirmToken, 'cancelled');
      if (session) {
        const steps = [
          ...(Array.isArray(session.steps) ? session.steps : []),
          { id: `step_cancel_${Date.now()}`, label: '已按你的决定取消操作', status: 'completed', timestamp: nowIso() },
        ];
        oneAiDb.upsertAgentSession({
          sessionId: session.sessionId,
          userId: user.id,
          status: 'completed',
          intentSummary: session.intentSummary,
          module: session.module,
          steps,
          payload: session.payload,
          result: { cancelled: true },
        });
      }
      return res.json({
        success: true,
        cancelled: true,
        reply: '好的，已经为你取消操作，未向外发送任何内容。',
        clientActions: [],
      });
    }

    // Confirmed external action
    if (pending.actionType === 'send_message') {
      const convId = pending.targetId;
      const conv = deps.store.conversations.find((c: any) => c.id === convId);
      if (!conv || !deps.store.canAccessConversation(user.id, conv)) {
        return res.status(403).json({ success: false, error: '没有访问该会话的权限。' });
      }
      if (conv.type === 'direct') {
        const otherId = (conv.participantIds || []).find((pid: string) => pid !== user.id);
        if (otherId) {
          const perm = deps.store.canSendDirectMessageBetween(user.id, otherId);
          if (!perm.ok) {
            return res.status(403).json({ success: false, error: perm.error || '当前无法向该联系人发送消息。' });
          }
        }
      }

      const contentText = editedMessage || String(pending.preview?.messageText || '').trim();
      if (!contentText) {
        return res.status(400).json({ success: false, error: '消息内容不能为空。' });
      }

      let msg: any;
      await deps.store.mutate(async () => {
        msg = deps.store.sendMessage(convId, contentText, user);
        const convNow = deps.store.conversations.find((c: any) => c.id === convId);
        for (const uid of convNow?.participantIds || []) {
          if (uid === user.id || deps.store.isBlockedEither(uid, user.id)) continue;
          if (deps.isUserViewingConversation(uid, convId)) continue;
          deps.emitNotification(uid, {
            type: 'message_new',
            title: convNow?.name || user.displayName,
            body: `${user.displayName}: ${contentText.slice(0, 80)}`,
            actorId: user.id,
            actorName: user.displayName,
            actorAvatar: user.avatar,
            conversationId: convId,
            data: { messageId: msg.id },
          });
        }
        deps.store.persist();
      });
      deps.wsBroadcastConversationEvent(convId, { type: 'message', conversationId: convId, message: msg });
      oneAiDb.resolvePendingConfirmation(confirmToken, 'confirmed');

      if (session) {
        const steps = [
          ...(Array.isArray(session.steps) ? session.steps : []),
          { id: `step_sent_${Date.now()}`, label: `已发送消息给 ${pending.preview?.targetName || '联系人'}`, status: 'completed', timestamp: nowIso() },
        ];
        oneAiDb.upsertAgentSession({
          sessionId: session.sessionId,
          userId: user.id,
          status: 'completed',
          intentSummary: session.intentSummary,
          module: session.module,
          steps,
          payload: session.payload,
          result: { sentMessageId: msg.id, conversationId: convId },
        });
      }

      return res.json({
        success: true,
        reply: `已确认并为你发出消息给 ${pending.preview?.targetName || '联系人'}。`,
        clientActions: [{ type: 'open_messages', conversationId: convId }],
        sessionId: session?.sessionId,
      });
    }

    if (pending.actionType === 'start_audio_call' || pending.actionType === 'start_video_call') {
      oneAiDb.resolvePendingConfirmation(confirmToken, 'confirmed');
      const kind = pending.actionType === 'start_video_call' ? 'video' : 'audio';
      const convId = pending.targetId;
      const targetUserId = typeof pending.preview?.targetUserId === 'string' ? pending.preview.targetUserId : undefined;
      if (session) {
        const steps = [
          ...(Array.isArray(session.steps) ? session.steps : []),
          { id: `step_call_${Date.now()}`, label: `已确认发起${kind === 'video' ? '视频' : '语音'}通话`, status: 'completed', timestamp: nowIso() },
        ];
        oneAiDb.upsertAgentSession({
          sessionId: session.sessionId,
          userId: user.id,
          status: 'completed',
          intentSummary: session.intentSummary,
          module: session.module,
          steps,
          payload: session.payload,
          result: { kind, conversationId: convId, targetUserId },
        });
      }
      return res.json({
        success: true,
        reply: `正在为你打开通信并连接 ${pending.preview?.targetName || '联系人'} 的${kind === 'video' ? '视频' : '语音'}通话。`,
        clientActions: [{ type: 'quick_call', kind, conversationId: convId, targetUserId }],
        sessionId: session?.sessionId,
      });
    }

    return res.status(400).json({ success: false, error: 'Unsupported confirmation action' });
  });

  router.post('/turn', async (req, res) => {
    const rawPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const lang = req.body?.lang === 'en' ? 'en' : req.body?.lang === 'ar' ? 'ar' : 'zh';
    const isZh = lang === 'zh';
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!rawPrompt && attachments.length === 0) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const authUser = deps.getSessionUser(req);
    const subjectId = authUser?.id || 'guest';
    const quota = checkUserQuota(authUser, req.ip || 'unknown');
    if (!quota.allowed) {
      return res.status(429).json({ success: false, error: quota.reason || '配额已达上限，请稍后再试。' });
    }

    const cleanPrompt = stripWakePrefix(rawPrompt) || rawPrompt;
    const histArray = normalizeConversationHistory(req.body?.history);
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : makeSessionId();

    const steps: AgentStepRecord[] = [
      {
        id: 'step_understand',
        label: isZh ? 'AI 精灵正在理解需求' : 'Understanding request',
        status: 'completed',
        detail: cleanPrompt.slice(0, 72),
        timestamp: nowIso(),
      },
    ];

    const clientActions: AgentClientAction[] = [];

    // ------------------------------------------------------------------
    // 1. Resume paused task shortcut
    // ------------------------------------------------------------------
    if (/^(?:继续刚才|恢复刚才|继续任务|回到刚才|resume|continue task)/i.test(cleanPrompt)) {
      const paused = oneAiDb.getLatestPausedOrActiveAgentSession(subjectId);
      if (!paused) {
        return res.json({
          success: true,
          sessionId,
          module: 'home',
          model: 'ONE AI',
          reply: isZh ? '当前没有未完成的暂停任务，有什么新需要可以随时告诉我。' : 'No paused task found. Tell me what you would like to do next!',
          steps,
          clientActions: [],
        });
      }
      steps.push({
        id: 'step_resume',
        label: isZh ? '已恢复上一次暂停的任务现场' : 'Resumed previous task',
        status: 'completed',
        detail: paused.intentSummary,
        timestamp: nowIso(),
      });
      if (Array.isArray(paused.result?.clientActions)) {
        clientActions.push(...paused.result.clientActions);
      }
      oneAiDb.upsertAgentSession({
        sessionId: paused.sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: paused.intentSummary,
        module: paused.module,
        steps,
        payload: paused.payload,
        result: paused.result,
      });
      return res.json({
        success: true,
        sessionId: paused.sessionId,
        module: paused.module,
        model: 'ONE AI',
        reply: isZh
          ? `已为你恢复刚才的任务：「${paused.intentSummary}」。`
          : `Resumed your previous task: "${paused.intentSummary}".`,
        steps,
        clientActions,
        resultData: paused.result,
      });
    }

    const isHypothetical = isConversationalFramingNotCommand(cleanPrompt, histArray);

    // ------------------------------------------------------------------
    // 2. Precision calculation fast-path (skip if user explicitly requests web search)
    // ------------------------------------------------------------------
    const hasWebSearchCue = /(?:查一下|搜一下|网上查|全网搜索|研究一下|帮我调研|打开网页|打开浏览器|search\s+web|research\s+)/i.test(cleanPrompt);
    if (!cleanPrompt.includes('\n') && !hasWebSearchCue) {
      const exact = solvePrecisionQuery(cleanPrompt, isZh);
      if (exact) {
        steps.push({ id: 'step_calc', label: isZh ? '完成精确计算' : 'Precision answer ready', status: 'completed', timestamp: nowIso() });
        oneAiDb.upsertAgentSession({
          sessionId,
          userId: subjectId,
          status: 'completed',
          intentSummary: cleanPrompt.slice(0, 80),
          module: 'assistant',
          steps,
          result: { answer: exact.answer },
        });
        return res.json({
          success: true,
          sessionId,
          module: 'assistant',
          model: 'ONE AI',
          reply: exact.answer,
          steps,
          clientActions: [],
        });
      }
    }

    // ------------------------------------------------------------------
    // 3. Communication / Call / Send Message (ALWAYS PAUSES WITH CONFIRMATION GATE)
    // ------------------------------------------------------------------
    if (
      !isHypothetical &&
      /(?:打电话|语音通话|视频通话|打视频|发消息|发私信|发微信|联系一下|给.{1,16}(?:打|发|说)|call\s+\w+|message\s+\w+)/i.test(cleanPrompt)
    ) {
      if (!authUser) {
        steps.push({ id: 'step_auth_needed', label: isZh ? '需要登录账号' : 'Sign-in required', status: 'failed', timestamp: nowIso() });
        return res.json({
          success: true,
          sessionId,
          module: 'communication',
          model: 'ONE AI',
          reply: isZh ? '发消息或通话需要先登录你的 EARTH ONE 账号。' : 'Please sign in before messaging or calling contacts.',
          steps,
          clientActions: [{ type: 'open_auth' }],
        });
      }

      const parsedComm = extractFriendAndMessage(cleanPrompt);
      const target = resolveUserConversationTarget(deps.store, authUser.id, parsedComm.targetHint);

      if (!target) {
        steps.push({ id: 'step_comm_open', label: isZh ? '打开左侧通信列表选择好友' : 'Open communication drawer', status: 'completed', timestamp: nowIso() });
        return res.json({
          success: true,
          sessionId,
          module: 'communication',
          model: 'ONE AI',
          reply: isZh
            ? '暂时还没找到匹配的直连好友会话，我先为你打开左侧「通信」面板挑选联系人。'
            : 'I could not find a matching contact yet—opening the Communication drawer so you can choose.',
          steps,
          clientActions: [{ type: 'open_comm_drawer' }],
        });
      }

      const confirmToken = makeConfirmToken();
      const actionLabel =
        parsedComm.kind === 'start_video_call'
          ? `向 ${target.displayName} 发起视频通话`
          : parsedComm.kind === 'start_audio_call'
            ? `给 ${target.displayName} 拨打语音电话`
            : `发送消息给 ${target.displayName}`;

      const defaultDraft = parsedComm.messageDraft || (parsedComm.kind === 'send_message' ? '你好，在吗？' : '');
      const preview = {
        targetName: target.displayName,
        targetUserId: target.targetUserId,
        conversationId: target.conversationId,
        messageText: defaultDraft,
      };

      steps.push({
        id: 'step_gate',
        label: isZh ? '等待你的明确确认（安全护栏）' : 'Awaiting your explicit confirmation',
        status: 'awaiting_confirmation',
        detail: actionLabel,
        timestamp: nowIso(),
      });

      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'awaiting_confirmation',
        intentSummary: actionLabel,
        module: 'communication',
        steps,
        payload: { target, kind: parsedComm.kind, messageDraft: defaultDraft },
      });

      oneAiDb.createPendingConfirmation({
        confirmToken,
        sessionId,
        userId: authUser.id,
        actionType: parsedComm.kind,
        targetId: target.conversationId,
        summary: actionLabel,
        preview,
      });

      const needsConfirmation: AgentPendingConfirmationView = {
        confirmToken,
        sessionId,
        actionType: parsedComm.kind,
        targetId: target.conversationId,
        targetName: target.displayName,
        summary: actionLabel,
        preview,
      };

      return res.json({
        success: true,
        sessionId,
        module: 'communication',
        model: 'ONE AI',
        reply: isZh
          ? `已找到联系人「${target.displayName}」。为确保安全，请确认是否执行：${actionLabel}。`
          : `Found "${target.displayName}". Please confirm before I proceed: ${actionLabel}.`,
        steps,
        needsConfirmation,
        clientActions: [],
      });
    }

    // ------------------------------------------------------------------
    // 4. Library Book Recommendation & Auto-Open
    // ------------------------------------------------------------------
    if (
      !isHypothetical &&
      /(?:找一本|找本|推荐一?本?.*书|看书|读书|图书馆|arabic\s+book|find.*book|recommend.*book)/i.test(cleanPrompt)
    ) {
      const q = extractBookSearchQuery(cleanPrompt);
      const searchTokens = expandBilingualBookTokens(`${cleanPrompt} ${q}`);
      const localMatches = (deps.store.books || [])
        .filter((b: any) => {
          const blob = `${b.title} ${b.author} ${b.description || ''} ${b.language || ''} ${b.category || ''}`.toLowerCase();
          return searchTokens.some((tok) => tok && blob.includes(tok));
        })
        .slice(0, 4)
        .map((b: any) => ({
          source: 'earth_library',
          id: b.id,
          title: b.title,
          author: b.author,
          language: b.language,
          category: b.category,
          description: String(b.description || '').slice(0, 140),
        }));

      let openMatches: any[] = [];
      try {
        const crawled = await deps.crawlOpenBooks(q, 6);
        const rawItems = Array.isArray(crawled?.results)
          ? crawled.results
          : Array.isArray(crawled?.books)
            ? crawled.books
            : [];
        openMatches = rawItems.slice(0, 5).map((b: any) => ({
          source: b.sourceName || b.source || 'open_library',
          title: b.title,
          author: b.author,
          language: b.language,
          year: b.year,
          url: b.sourceUrl || b.providerFullTextUrl || b.textUrl,
        }));
      } catch {
        // non-fatal; continue with local library matches
      }

      steps.push({
        id: 'step_library_search',
        label: isZh ? '已完成馆藏与全球开放图书检索' : 'Searched internal & open libraries',
        status: 'completed',
        detail: `${localMatches.length} 馆藏 · ${openMatches.length} 开放书籍`,
        timestamp: nowIso(),
      });

      const candidatesSummary = JSON.stringify({ localMatches, openMatches }).slice(0, 2600);
      let aiSummary = '';
      if (localMatches.length > 0 || openMatches.length > 0) {
        const aiTurn = await oneAiRouter.executeUnifiedTurn({
          requestId: `ag_book_${Date.now()}`,
          userId: authUser?.id || null,
          subjectKey: quota.subjectKey,
          userTier: quota.userTier,
          prompt: `用户需求：「${cleanPrompt}」。\n检索到的真实书籍候选：${candidatesSummary}\n请基于以上真实书籍结果（严禁编造不存在的书名），用亲切简洁的中文（2~4句）分析哪本最适合并推荐给用户。`,
          messages: [
            { role: 'system', content: '你是 EARTH ONE 的 AI 精灵小小，负责依据真实检索结果推荐书籍并打开阅读器。' },
            { role: 'user', content: `用户需求：「${cleanPrompt}」\n真实结果：${candidatesSummary}` },
          ],
          mode: 'agent-book',
          maxTokens: 480,
          stream: false,
        });
        if (aiTurn.success && aiTurn.content.trim()) {
          aiSummary = stripAiControlTags(aiTurn.content).reply || aiTurn.content.trim();
        }
      }

      const topBook = localMatches[0];
      const topOpen = openMatches[0];
      const fallbackReply =
        localMatches.length > 0
          ? `为你从数字图书馆找到《${topBook.title}》（${topBook.author}），已为你打开图书馆阅读环境。`
          : openMatches.length > 0
            ? `从全球开放图书馆检索到《${topOpen.title}》（${topOpen.author}），已为你打开数字图书馆继续浏览。`
            : `暂未检索到匹配“${q}”的书籍，我已为你打开数字图书馆，你可以换个关键词继续挑选。`;

      clientActions.push(
        topBook?.id
          ? { type: 'open_book_by_id', bookId: topBook.id, query: q }
          : { type: 'open_book', query: q }
      );

      steps.push({
        id: 'step_library_open',
        label: isZh ? '正在为你呈现阅读界面' : 'Opening Digital Library',
        status: 'completed',
        timestamp: nowIso(),
      });

      const resultData = { query: q, localMatches, openMatches, clientActions };
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'library',
        steps,
        payload: { query: q },
        result: resultData,
      });

      return res.json({
        success: true,
        sessionId,
        module: 'library',
        model: 'ONE AI',
        reply: aiSummary || fallbackReply,
        steps,
        clientActions,
        resultData,
      });
    }

    // ------------------------------------------------------------------
    // 5. Arabic / English Language Learning Engine
    // ------------------------------------------------------------------
    if (
      !isHypothetical &&
      /(?:学(?:习)?.*阿拉伯语|阿拉伯语(?:课|字母|练习|学习)|学英语|英语(?:课|口语|引擎)|多邻国|arabic\s*(?:lesson|study|learn)|learn\s*(?:arabic|english))/i.test(
        cleanPrompt
      )
    ) {
      const isEnglish = /英语|english/i.test(cleanPrompt) && !/阿拉伯语|arabic/i.test(cleanPrompt);
      const targetTab = isEnglish
        ? 'english'
        : /字母|发音|alphabet/i.test(cleanPrompt)
          ? 'alphabet'
          : /练习|quiz|test|测试/i.test(cleanPrompt)
            ? 'practice'
            : 'alphabet';

      steps.push({
        id: 'step_lesson_prepare',
        label: isZh ? (isEnglish ? '准备今日英语学习课程' : '准备今日阿拉伯语课程') : 'Preparing language lesson',
        status: 'completed',
        timestamp: nowIso(),
      });

      let lessonReply = '';
      const aiTurn = await oneAiRouter.executeUnifiedTurn({
        requestId: `ag_lang_${Date.now()}`,
        userId: authUser?.id || null,
        subjectKey: quota.subjectKey,
        userTier: quota.userTier,
        prompt: cleanPrompt,
        messages: [
          {
            role: 'system',
            content: '你是 EARTH ONE 语言导师小精灵小小。请用简练友好的中文为学习者给出今日3分钟热身重点（含1个核心词/句和发音提示），并告知已进入学习空间。',
          },
          { role: 'user', content: cleanPrompt },
        ],
        mode: 'language-tutor',
        maxTokens: 480,
        stream: false,
      });
      if (aiTurn.success && aiTurn.content.trim()) {
        lessonReply = stripAiControlTags(aiTurn.content).reply || aiTurn.content.trim();
      } else {
        lessonReply = isEnglish
          ? '已为你进入今日英语学习空间！建议先跟读 5 分钟高频句型，再完成一组词义挑战。'
          : '已为你打开阿拉伯语学习环境！今天先从「أ / ب / ت」字母发音与日常问候「السلام عليكم」(As-salāmu ʿalaykum) 开始吧。';
      }

      clientActions.push({
        type: 'open_language_lesson',
        language: isEnglish ? 'en' : 'ar',
        tab: targetTab,
      });

      const resultData = { language: isEnglish ? 'en' : 'ar', tab: targetTab, clientActions };
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'arabic-learning',
        steps,
        result: resultData,
      });

      return res.json({
        success: true,
        sessionId,
        module: 'arabic-learning',
        model: 'ONE AI',
        reply: lessonReply,
        steps,
        clientActions,
        resultData,
      });
    }

    // ------------------------------------------------------------------
    // 6. Multi-step Web Search -> Fetch -> Extract -> Synthesize
    // ------------------------------------------------------------------
    if (
      !isHypothetical &&
      /(?:查一下|搜一下|网上查|全网搜索|研究一下|帮我调研|打开网页|打开浏览器|search\s+web|research\s+)/i.test(cleanPrompt)
    ) {
      const q = cleanPrompt
        .replace(/(?:帮我|请|在浏览器里|上网|网上|全网|查一下|搜一下|搜索|研究一下|帮我调研|打开网页|打开浏览器|search\s+web|research)/gi, ' ')
        .trim() || cleanPrompt;

      let searchHits: any[] = [];
      try {
        searchHits = (await deps.searchWebProviders(q, 5)) || [];
      } catch {
        searchHits = [];
      }

      steps.push({
        id: 'step_web_search',
        label: isZh ? '已完成多源网页检索' : 'Completed web search',
        status: 'completed',
        detail: `${searchHits.length} 条结果`,
        timestamp: nowIso(),
      });

      let extractedLead: { title?: string; url?: string; snippet?: string } | null = null;
      if (searchHits[0]?.url) {
        try {
          const doc = await deps.fetchAndExtract(searchHits[0].url);
          const bodyText = String(doc?.textContent || doc?.content || '').replace(/\s+/g, ' ').trim();
          extractedLead = {
            title: doc?.title || searchHits[0].title,
            url: searchHits[0].url,
            snippet: bodyText.slice(0, 1200),
          };
          steps.push({
            id: 'step_web_extract',
            label: isZh ? '已抓取并提炼网页正文' : 'Extracted primary page content',
            status: 'completed',
            detail: extractedLead.title || extractedLead.url,
            timestamp: nowIso(),
          });
        } catch {
          // keep search snippets
        }
      }

      const evidencePayload = JSON.stringify({
        query: q,
        results: searchHits.slice(0, 4).map((r: any) => ({ title: r.title, url: r.url, snippet: r.snippet })),
        extractedLead,
      }).slice(0, 2800);

      let synthesis = '';
      const aiTurn = await oneAiRouter.executeUnifiedTurn({
        requestId: `ag_web_${Date.now()}`,
        userId: authUser?.id || null,
        subjectKey: quota.subjectKey,
        userTier: quota.userTier,
        prompt: cleanPrompt,
        messages: [
          { role: 'system', content: '你是 EARTH ONE 研究助手小精灵小小。严格根据给出的真实检索摘要总结要点并附上真实来源标题或链接，绝不编造链接。' },
          { role: 'user', content: `用户问题：${cleanPrompt}\n真实检索信息：${evidencePayload}` },
        ],
        mode: 'research',
        maxTokens: 600,
        stream: false,
      });
      if (aiTurn.success && aiTurn.content.trim()) {
        synthesis = stripAiControlTags(aiTurn.content).reply || aiTurn.content.trim();
      } else if (searchHits.length > 0) {
        synthesis = `已为你检索「${q}」，最相关的结果是：${searchHits
          .slice(0, 3)
          .map((h: any, idx: number) => `${idx + 1}. ${h.title} (${h.url})`)
          .join('；')}。已同步在空间浏览器为你打开。`;
      } else {
        synthesis = `已为你打开空间浏览器搜索「${q}」。`;
      }

      clientActions.push({ type: 'browser_search', query: q });
      const resultData = { query: q, searchHits: searchHits.slice(0, 5), extractedLead, clientActions };
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'browser',
        steps,
        result: resultData,
      });

      return res.json({
        success: true,
        sessionId,
        module: 'browser',
        model: 'ONE AI',
        reply: synthesis,
        steps,
        clientActions,
        resultData,
      });
    }

    // ------------------------------------------------------------------
    // 7. 3D Paradise Environment Control (Weather / Time / Presets)
    // ------------------------------------------------------------------
    if (
      !isHypothetical &&
      /(?:切换.*?(?:白天|黑夜|夜晚|黄昏|黎明|雨天|晴天|下雪|大风|微风|彩虹|实时天气|实时时间)|(?:变成|调成|进入)(?:夜晚|黄昏|黎明|白天|雨天|暴雨|晴天|彩虹))/i.test(
        cleanPrompt
      )
    ) {
      let weatherPreset: string | undefined;
      let timePreset: string | undefined;
      let realtimeSync: boolean | undefined;

      if (/实时/.test(cleanPrompt)) realtimeSync = true;
      if (/暴雨|雷暴/.test(cleanPrompt)) weatherPreset = 'thunderstorm';
      else if (/大雨/.test(cleanPrompt)) weatherPreset = 'heavy-rain';
      else if (/下雨|雨天|小雨/.test(cleanPrompt)) weatherPreset = 'light-rain';
      else if (/彩虹/.test(cleanPrompt)) weatherPreset = 'rainbow';
      else if (/晨雾|大雾/.test(cleanPrompt)) weatherPreset = 'morning-fog';
      else if (/薄雾|轻雾/.test(cleanPrompt)) weatherPreset = 'light-mist';
      else if (/大风|狂风/.test(cleanPrompt)) weatherPreset = 'gale';
      else if (/微风/.test(cleanPrompt)) weatherPreset = 'breeze';
      else if (/阴天/.test(cleanPrompt)) weatherPreset = 'overcast';
      else if (/晴天/.test(cleanPrompt)) weatherPreset = 'clear';

      if (/黎明|日出/.test(cleanPrompt)) timePreset = 'dawn';
      else if (/白天|中午/.test(cleanPrompt)) timePreset = 'day';
      else if (/黄昏|日落|暮色/.test(cleanPrompt)) timePreset = 'dusk';
      else if (/傍晚/.test(cleanPrompt)) timePreset = 'evening';
      else if (/夜晚|黑夜|晚上|夜景/.test(cleanPrompt)) timePreset = 'night';

      clientActions.push({
        type: 'environment_control',
        weatherPreset,
        timePreset,
        realtimeSync,
      });

      steps.push({
        id: 'step_env',
        label: isZh ? '正在平滑过渡 3D 天堂花园环境' : 'Updating 3D garden atmosphere',
        status: 'completed',
        timestamp: nowIso(),
      });

      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'garden',
        steps,
        result: { clientActions },
      });

      return res.json({
        success: true,
        sessionId,
        module: 'garden',
        model: 'ONE AI',
        reply: isZh ? '好的，已经在花园为你平滑切换了天光与气候，好好欣赏吧。' : 'Smoothly transitioning the garden sky and weather for you.',
        steps,
        clientActions,
      });
    }

    // ------------------------------------------------------------------
    // 8. Instant Navigation / Music / Cinema / Theme / Globe Actions
    // ------------------------------------------------------------------
    const instant = isHypothetical ? null : parseInstantAgentAction(cleanPrompt, isZh, histArray);
    if (instant && instant.type !== 'none') {
      clientActions.push(instant as AgentClientAction);
      steps.push({
        id: 'step_action',
        label: isZh ? '已触发展开对应空间功能' : 'Executed workspace action',
        status: 'completed',
        detail: instant.type,
        timestamp: nowIso(),
      });
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: instant.type,
        steps,
        result: { clientActions },
      });
      return res.json({
        success: true,
        sessionId,
        module: instant.type,
        model: 'ONE AI',
        reply: (instant as any).reply || (isZh ? '好的，已经为你安排妥当。' : 'All set for you.'),
        steps,
        clientActions,
      });
    }

    // ------------------------------------------------------------------
    // 9. General AI Reasoning / Writing / Q&A / Multimodal via ONE AI Router
    // ------------------------------------------------------------------
    const memoryOwnerId = authUser?.id || 'guest';
    const ctx = prepareDialogueContext({
      userId: memoryOwnerId,
      userDisplayName: authUser?.displayName || authUser?.username,
      sessionId,
      channel: 'voice',
      prompt: cleanPrompt,
      mode: 'general',
      clientHistory: histArray,
    });

    const unifiedMessages: UnifiedMessage[] = [
      {
        role: 'system',
        content: `${ctx.systemPrompt}\n当前你在 EARTH ONE 3D 湖畔凉亭为使用者服务。你是 AI 精灵「小小」，请以温暖自然、清晰务实的语言直接回答；不向普通用户暴露任何底层模型厂商或技术标识。`,
      },
    ];
    for (const h of ctx.mergedHistory) {
      if (h.content) unifiedMessages.push({ role: h.role, content: h.content });
    }
    if (attachments.length > 0) {
      const parts: UnifiedContentPart[] = [{ type: 'text', text: cleanPrompt || '请分析附件内容' }];
      for (const att of attachments.slice(0, 3)) {
        if (att?.imageUrl && typeof att.imageUrl === 'string') {
          parts.push({ type: 'image_url', imageUrl: att.imageUrl });
        }
      }
      unifiedMessages.push({ role: 'user', content: parts });
    } else {
      unifiedMessages.push({ role: 'user', content: cleanPrompt });
    }

    const routed = await oneAiRouter.executeUnifiedTurn({
      requestId: `ag_gen_${Date.now()}`,
      userId: authUser?.id || null,
      subjectKey: quota.subjectKey,
      userTier: quota.userTier,
      prompt: cleanPrompt,
      messages: unifiedMessages,
      mode: 'general',
      hasPrivateMemoryContext: ctx.recalledMemories.length > 0,
      maxTokens: 768,
      stream: false,
    });

    if (routed.success && routed.content.trim()) {
      const replyText = stripAiControlTags(routed.content).reply || routed.content.trim();
      persistTurnAndExtractMemories({
        ctx,
        rawUserInput: cleanPrompt,
        assistantReply: replyText,
        modelLabel: 'ONE AI',
      });
      steps.push({
        id: 'step_ai_answer',
        label: isZh ? 'ONE AI 已完成思考与解答' : 'ONE AI completed response',
        status: 'completed',
        timestamp: nowIso(),
      });
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'assistant',
        steps,
        result: { reply: replyText },
      });
      return res.json({
        success: true,
        sessionId,
        module: 'assistant',
        model: 'ONE AI',
        reply: replyText,
        steps,
        clientActions: [],
      });
    }

    steps.push({
      id: 'step_ai_unavailable',
      label: isZh ? '外部模型暂不可达' : 'Upstream AI unavailable',
      status: 'failed',
      detail: routed.errorMessage,
      timestamp: nowIso(),
    });
    oneAiDb.upsertAgentSession({
      sessionId,
      userId: subjectId,
      status: 'failed',
      intentSummary: cleanPrompt.slice(0, 80),
      module: 'assistant',
      steps,
      errorMessage: routed.errorMessage,
    });

    return res.status(503).json({
      success: false,
      sessionId,
      module: 'assistant',
      model: 'ONE AI',
      error: routed.errorMessage || '当前暂无可用模型节点，请稍后重试或在管理后台配置 Provider。',
      reply: isZh
        ? '抱歉，当前外部 AI 模型网络暂不可达或额度受限。本地计算与站内功能仍可正常使用，请稍后再试。'
        : 'Sorry, upstream AI models are temporarily unreachable. Local tools and navigation remain available.',
      steps,
      clientActions: [],
    });
  });

  return router;
}
