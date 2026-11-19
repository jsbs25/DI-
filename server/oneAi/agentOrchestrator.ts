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
import {
  generateLanguageQuizPack,
  generateSpokenRescue,
  normalizeStudyLang,
  startRoleplaySession,
  type SupportedStudyLang,
} from '../languageCoach.ts';
import { generateAiImage, type ImageAspectRatio } from '../aiImageGenerator.ts';

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

function stripWakePrefix(text: string, customAiName = 'ONE'): string {
  const safeName = customAiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`^(?:你好[，,\\s]*)?(?:${safeName}|ONE|小小)(?:同学|精灵|老师)?[，,：:\\s]*`, 'i'), '')
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
    const customAiName =
      typeof req.body?.aiName === 'string' && req.body.aiName.trim()
        ? req.body.aiName.trim().slice(0, 24)
        : 'ONE';
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

    const cleanPrompt = stripWakePrefix(rawPrompt, customAiName) || rawPrompt;
    const histArray = normalizeConversationHistory(req.body?.history);
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : makeSessionId();

    const steps: AgentStepRecord[] = [
      {
        id: 'step_understand',
        label: isZh ? `${customAiName} 正在理解需求` : `${customAiName} is understanding`,
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
    // 3B. High-Priority Instant Music Playback & Control Fast-Path
    // ------------------------------------------------------------------
    const musicControlStop =
      /停止播放|停止放歌|停止音乐|别放了|别播了|别放歌|关掉音乐|关闭音乐|把音乐停|暂停播放|暂停音乐|stop playing|stop music|pause music/i.test(
        cleanPrompt
      );
    const musicControlNext =
      /下一首|下一曲|换一首|换首歌|换个歌|切歌|next song|next track|skip track/i.test(cleanPrompt);
    const musicControlPrev =
      /上一首|上一曲|previous song|previous track/i.test(cleanPrompt);
    const musicControlResume =
      /继续播放|继续放歌|恢复播放|恢复音乐|resume music|resume playing/i.test(cleanPrompt);
    const wantsMusicPlay =
      /听歌|听首歌|听点歌|想听歌|要听歌|放歌|放首歌|放点歌|放音乐|听音乐|播放音乐|开音乐|来首歌|来点音乐|来一首|放一首|听一首|打开.*音乐|去.*音乐|听钢琴|放钢琴|听轻音乐|放轻音乐|听纯音乐|想听.*(?:歌|曲|音乐)|play\s+(?:a\s+)?(?:song|music|track)|listen\s+to\s+music|open\s+music/i.test(
        cleanPrompt
      );

    if (!isHypothetical && (musicControlStop || musicControlNext || musicControlPrev || musicControlResume || wantsMusicPlay)) {
      const parsedMusic = parseInstantAgentAction(cleanPrompt, isZh, []);
      let musicAction: AgentClientAction;
      let musicReply: string;

      if (parsedMusic && parsedMusic.type === 'play_music') {
        musicAction = parsedMusic as AgentClientAction;
        musicReply = parsedMusic.reply;
      } else if (musicControlStop) {
        musicAction = { type: 'play_music', control: 'stop' };
        musicReply = isZh ? '好的，先为你暂停音乐。' : 'Paused the music for you.';
      } else if (musicControlNext) {
        musicAction = { type: 'play_music', control: 'next' };
        musicReply = isZh ? '收到，马上为你切到下一首！' : 'Skipping to the next track!';
      } else if (musicControlPrev) {
        musicAction = { type: 'play_music', control: 'prev' };
        musicReply = isZh ? '好的，切回上一首歌。' : 'Returning to the previous track.';
      } else if (musicControlResume) {
        musicAction = { type: 'play_music', control: 'resume' };
        musicReply = isZh ? '好呀，继续为你播放音乐！' : 'Resuming your music!';
      } else {
        const extractedMusicQ = cleanPrompt
          .replace(
            /(?:我想|我要|帮我|给我|请|随便|随机|打开|进入|去|放一首|放首|放点|来一首|来首|来点|听一首|听首|听点|听歌|听音乐|放歌|放音乐|播放音乐|音乐空间|音乐|歌曲|首歌|曲子|的|吧|啊|呢|了)/gi,
            ' '
          )
          .replace(/[，。！？、,.!?]/g, ' ')
          .trim();
        const safeQ = extractedMusicQ.length >= 2 ? extractedMusicQ : '';
        musicAction = { type: 'play_music', query: safeQ, crawl: true };
        musicReply = safeQ
          ? isZh
            ? `好呀！这就带你去音乐空间，马上为你播放「${safeQ}」。`
            : `Taking you to Music Space and playing "${safeQ}" now.`
          : isZh
            ? '好呀！这就带你去音乐空间，马上为你放一首好听的歌。'
            : 'Taking you to Music Space and starting a great track for you now!';
      }

      clientActions.push(musicAction);
      steps.push({
        id: 'step_music_play',
        label: isZh ? '已跳转到音乐空间并启动播放' : 'Opening Music Space & starting playback',
        status: 'completed',
        detail: (musicAction as any).query || (musicAction as any).control || 'auto-play',
        timestamp: nowIso(),
      });
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'music',
        steps,
        result: { clientActions },
      });

      return res.json({
        success: true,
        sessionId,
        module: 'music',
        model: 'ONE AI',
        emotion: 'cheerful',
        reply: musicReply,
        steps,
        clientActions,
      });
    }

    // ------------------------------------------------------------------
    // 4. Library Book Recommendation & Auto-Open (Apple Books Reader & Noor Islamic PDF)
    // ------------------------------------------------------------------
    const wantsNoorIslamicPdf =
      !isHypothetical &&
      /(?:مكتبة\s*ال?نور|noor[\s-]?book|努尔图书馆|伊斯兰(?:书籍|书库|电子书|图书|PDF)|下载.*伊斯兰.*(?:书|pdf)|阿语\s*pdf)/i.test(
        cleanPrompt
      );
    if (wantsNoorIslamicPdf) {
      clientActions.push({ type: 'open_book', query: '__noor_library__' });
      steps.push({
        id: 'step_noor_library_open',
        label: isZh ? '已直达 مكتبة النور · 伊斯兰 PDF 书库' : 'Opening Noor Islamic PDF Library',
        status: 'completed',
        timestamp: nowIso(),
      });
      oneAiDb.upsertAgentSession({
        sessionId,
        userId: subjectId,
        status: 'completed',
        intentSummary: cleanPrompt.slice(0, 80),
        module: 'library',
        steps,
        result: { clientActions },
      });
      return res.json({
        success: true,
        sessionId,
        module: 'library',
        model: 'ONE AI',
        emotion: 'cheerful',
        reply: isZh
          ? '已为你打开「مكتبة النور · 伊斯兰 PDF 书库」！这里直连 5,099+ 阿语、中文及英文伊斯兰官方 PDF，点击即可在站内直接翻页阅读或一键下载，也支持把你从 noor-book.com 下载的 PDF 导入书库。'
          : 'Opened the Noor Islamic PDF Library with 5,099+ Arabic, Chinese, and English PDFs ready to read and download directly.',
        steps,
        clientActions,
      });
    }

    if (
      !isHypothetical &&
      /(?:找一?本.*书|推荐一?本?.*书|想看书|要看书|去看书|看一?本书|读一?本书|看书|读书|图书馆|看《[^》]+》|读《[^》]+》|arabic\s+book|find.*book|recommend.*book|read\s+a\s+book|open\s+a\s+book)/i.test(
        cleanPrompt
      )
    ) {
      const q = extractBookSearchQuery(cleanPrompt);
      const isGenericBrowse =
        /^(?:literature|book|books|书|看书|读书|一本书|好书|经典|推荐)$/i.test(q) ||
        /^(?:但是|不过|那|嗯|其实)?(?:我)?(?:想|要|去)?(?:看书|读书|看一?本书|找一?本书让我看|给我找一?本书|推荐一?本书)[吧啊呢呀。！!]?$/i.test(
          cleanPrompt.trim()
        );

      const allBooks = (deps.store.books || []).filter(
        (b: any) => Array.isArray(b.chapters) && b.chapters.some((c: any) => String(c?.content || '').trim().length > 40)
      );

      let scoredLocal: Array<{ book: any; score: number }> = [];
      if (isGenericBrowse) {
        // Rotate across our rich curated classics so every "我想看书" feels fresh & thoughtful
        const preferredOrder = [
          'book_little_prince',
          'book_walden',
          'book_meditations',
          'book_daodejing',
          'book_zhuangzi',
          'book_arabian_nights',
          'book_pride',
          'book_art_of_war',
          'book_republic',
          'book_copernicus',
        ];
        const sortedCurated = [...allBooks].sort((a: any, b: any) => {
          const ia = preferredOrder.indexOf(a.id);
          const ib = preferredOrder.indexOf(b.id);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return (b.chapters?.length || 0) - (a.chapters?.length || 0);
        });
        const pickIdx = sortedCurated.length > 0 ? Math.floor(Date.now() / 15000) % Math.min(6, sortedCurated.length) : 0;
        const rotated = [
          ...sortedCurated.slice(pickIdx),
          ...sortedCurated.slice(0, pickIdx),
        ];
        scoredLocal = rotated.slice(0, 4).map((book, idx) => ({ book, score: 100 - idx }));
      } else {
        const searchTokens = expandBilingualBookTokens(`${cleanPrompt} ${q}`);
        const qLower = q.toLowerCase();
        scoredLocal = allBooks
          .map((b: any) => {
            const title = String(b.title || '').toLowerCase();
            const author = String(b.author || '').toLowerCase();
            const desc = String(b.description || '').toLowerCase();
            const cat = String(b.category || '').toLowerCase();
            const langTag = String(b.language || '').toLowerCase();
            let score = 0;
            if (qLower && title.includes(qLower)) score += 60;
            if (qLower && author.includes(qLower)) score += 45;
            for (const tok of searchTokens) {
              if (!tok || tok.length < 2) continue;
              if (title.includes(tok)) score += 28;
              else if (author.includes(tok)) score += 20;
              else if (cat.includes(tok)) score += 16;
              else if (langTag === tok) score += 14;
              else if (desc.includes(tok)) score += 8;
            }
            if ((b.chapters?.length || 0) >= 3) score += 4;
            return { book: b, score };
          })
          .filter((item: { book: any; score: number }) => item.score >= 12)
          .sort((a: { book: any; score: number }, b: { book: any; score: number }) => b.score - a.score)
          .slice(0, 4);
      }

      const localMatches = scoredLocal.map(({ book: b }) => ({
        source: 'earth_library',
        id: b.id,
        title: b.title,
        author: b.author,
        language: b.language,
        category: b.category,
        chaptersCount: Array.isArray(b.chapters) ? b.chapters.length : 0,
        description: String(b.description || '').slice(0, 140),
      }));

      // Only hit external open-book crawlers if the user asked for a specific title not yet in our local library
      let openMatches: any[] = [];
      if (localMatches.length === 0) {
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
          // non-fatal
        }
      }

      // If still nothing matched a specific query, offer our finest curated classic rather than leaving user empty-handed
      const topBook =
        localMatches[0] ||
        (openMatches.length === 0 && allBooks[0]
          ? {
              source: 'earth_library',
              id: allBooks[0].id,
              title: allBooks[0].title,
              author: allBooks[0].author,
              language: allBooks[0].language,
              category: allBooks[0].category,
              chaptersCount: allBooks[0].chapters?.length || 1,
              description: String(allBooks[0].description || '').slice(0, 140),
            }
          : null);
      const topOpen = openMatches[0];

      steps.push({
        id: 'step_library_search',
        label: isZh ? '已为你挑选馆藏全文经典' : 'Selected curated full-text edition',
        status: 'completed',
        detail: topBook ? `《${topBook.title}》` : `${openMatches.length} 开放书籍`,
        timestamp: nowIso(),
      });

      const replyText = topBook
        ? isZh
          ? `为你挑选了《${topBook.title}》（${topBook.author}），${topBook.description ? `${topBook.description.slice(0, 56)}… ` : ''}这就直接为你翻开沉浸阅读页！`
          : `I picked "${topBook.title}" by ${topBook.author} — opening the reading page for you now.`
        : topOpen
          ? isZh
            ? `已为你检索到《${topOpen.title}》（${topOpen.author}），正在进入图书馆为你打开阅读页。`
            : `Found "${topOpen.title}" by ${topOpen.author} — opening the library reader now.`
          : isZh
            ? `已为你打开数字图书馆，马上挑选一本好书开始阅读吧。`
            : `Opening the Digital Library so you can dive right into a great book.`;

      clientActions.push(
        topBook?.id
          ? { type: 'open_book_by_id', bookId: topBook.id, autoRead: true, query: q }
          : { type: 'open_book', query: q }
      );

      steps.push({
        id: 'step_library_open',
        label: isZh ? '已直接展开沉浸阅读器' : 'Opening full-screen reader',
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
        payload: { query: q, bookId: topBook?.id },
        result: resultData,
      });

      return res.json({
        success: true,
        sessionId,
        module: 'library',
        model: 'ONE AI',
        emotion: 'cheerful',
        reply: replyText,
        steps,
        clientActions,
        resultData,
      });
    }

    // ------------------------------------------------------------------
    // 4B. Instant "我不知道该怎么讲 / 怎么说" Spoken Rescue Coach
    // ------------------------------------------------------------------
    const activeRoleplayCtx =
      req.body?.activeRoleplayContext && typeof req.body.activeRoleplayContext === 'object'
        ? (req.body.activeRoleplayContext as {
            targetLang?: string;
            scenarioTitle?: string;
            npcRole?: string;
            lastNpcLine?: string;
          })
        : null;

    const isRescueAsk =
      /(?:我?不知道(?:该)?怎么(?:讲|说|回答|接话|表达)|不会(?:说|讲)|怎么用(?:英语|英文|日语|法语|西班牙语|韩语|阿拉伯语)(?:说|讲)|(?:英语|英文|口语)怎么(?:说|讲)|帮我说|给我(?:口语)?提示|i\s*don'?t\s*know\s*how\s*to\s*say|how\s+do\s+i\s+say|help\s+me\s+say)/i.test(
        cleanPrompt
      );

    if (!isHypothetical && isRescueAsk) {
      const targetLang: SupportedStudyLang = /阿拉伯|arabic/i.test(cleanPrompt)
        ? 'ar'
        : /日语|日文|japanese/i.test(cleanPrompt)
          ? 'ja'
          : /法语|french/i.test(cleanPrompt)
            ? 'fr'
            : /西语|西班牙|spanish/i.test(cleanPrompt)
              ? 'es'
              : /韩语|korean/i.test(cleanPrompt)
                ? 'ko'
                : activeRoleplayCtx?.targetLang
                  ? normalizeStudyLang(activeRoleplayCtx.targetLang)
                  : 'en';

      steps.push({
        id: 'step_lang_rescue',
        label: isZh ? '正在为你准备地道口语救急句' : 'Preparing spoken rescue phrases',
        status: 'completed',
        timestamp: nowIso(),
      });

      try {
        const rescue = await generateSpokenRescue({
          targetLang,
          situation: activeRoleplayCtx?.scenarioTitle || '日常真实口语交流',
          lastNpcLine: activeRoleplayCtx?.lastNpcLine || '',
          userIntentZh: cleanPrompt,
          level: 'intermediate',
        });

        const top = rescue.expressions[1] || rescue.expressions[0];
        const replyText = top
          ? `${rescue.coachReplyZh}\n推荐直接说：「${top.targetText}」（${top.translationZh}）`
          : rescue.coachReplyZh;

        clientActions.push({
          type: 'show_rescue_cards',
          targetLang,
          coachReplyZh: rescue.coachReplyZh,
          expressions: rescue.expressions,
        });

        const resultData = { targetLang, rescue, clientActions };
        oneAiDb.upsertAgentSession({
          sessionId,
          userId: subjectId,
          status: 'completed',
          intentSummary: cleanPrompt.slice(0, 80),
          module: 'language-studio',
          steps,
          result: resultData,
        });

        return res.json({
          success: true,
          sessionId,
          module: 'language-studio',
          model: 'ONE AI',
          emotion: 'empathetic',
          reply: replyText,
          targetText: top?.targetText || '',
          translationZh: top?.translationZh || '',
          phonetic: top?.phonetic || '',
          rescueCards: rescue.expressions,
          steps,
          clientActions,
          resultData,
        });
      } catch (err: any) {
        return res.status(503).json({
          success: false,
          sessionId,
          module: 'language-studio',
          error: err?.message || '口语提示暂时不可用',
          reply: isZh ? '抱歉，刚才生成口语提示时遇到网络波动，请再说一次或点急救按钮。' : 'Sorry, could not fetch spoken rescue hints right now.',
          steps,
          clientActions: [],
        });
      }
    }

    // ------------------------------------------------------------------
    // 4C. Free-Quota Recomposed AI Image & Dialogue Scene Generation
    // ------------------------------------------------------------------
    const isImageGenRequest =
      /(?:(?:给我|帮我|请|来|再)?(?:生成|画|创作|做|出)(?:一?[张幅个])?.*(?:图|图片|插画|画作|壁纸|配图|照片|头像|风景|漫画)|(?:给我|帮我)画(?:一?[张幅个只条朵座])?|把(?:刚才|这段|当前)?对话(?:变成|画成|生成)(?:一?张)?图|对话配图|(?:generate|create|draw|paint|make)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork))/i.test(
        cleanPrompt
      );

    if (!isHypothetical && isImageGenRequest) {
      const isDialogueScene = /对话|刚才|场景|这段|实景|聊天/i.test(cleanPrompt);
      const aspectRatio: ImageAspectRatio =
        /竖屏|竖图|手机壁纸|海报|3:4|9:16/i.test(cleanPrompt)
          ? '3:4'
          : /宽屏|横屏|壁纸|电影感|16:9/i.test(cleanPrompt)
            ? '16:9'
            : /正方形|头像|1:1/i.test(cleanPrompt)
              ? '1:1'
              : '4:3';

      const dialogueContext = histArray
        .slice(-4)
        .map((m) => `${m.role === 'user' ? 'User' : customAiName}: ${m.content}`)
        .join('\n');

      steps.push({
        id: 'step_one_image_studio',
        label: isZh ? '正在为你绘制画面' : 'Generating artwork',
        status: 'completed',
        timestamp: nowIso(),
      });

      try {
        const image = await generateAiImage({
          prompt: cleanPrompt,
          mode: isDialogueScene ? 'dialogue_scene' : 'standalone',
          dialogueContext: isDialogueScene ? dialogueContext : undefined,
          aspectRatio,
        });

        clientActions.push({
          type: 'show_generated_image',
          image,
        });

        const replyText = isZh
          ? `已经为你画好了：「${image.captionZh}」，点击可放大或保存。`
          : `Here is your artwork: "${image.captionZh}".`;

        const resultData = { image, clientActions };
        oneAiDb.upsertAgentSession({
          sessionId,
          userId: subjectId,
          status: 'completed',
          intentSummary: cleanPrompt.slice(0, 80),
          module: 'image-studio',
          steps,
          result: { captionZh: image.captionZh, engine: image.engine, providerLabelZh: image.providerLabelZh },
        });

        return res.json({
          success: true,
          sessionId,
          module: 'image-studio',
          model: 'ONE AI',
          emotion: 'excited',
          reply: replyText,
          generatedImage: image,
          steps,
          clientActions,
          resultData,
        });
      } catch (err: any) {
        return res.status(503).json({
          success: false,
          sessionId,
          module: 'image-studio',
          error: err?.message || '免费图像生成节点暂时繁忙',
          reply: isZh
            ? '抱歉，当前免费生图节点暂时繁忙，你可以稍等几秒再让我画一次，或者换个更简洁的描述试试。'
            : 'The free image generation pool is busy right now. Please try again in a moment.',
          steps,
          clientActions: [],
        });
      }
    }

    // ------------------------------------------------------------------
    // 5. Full Interactive Language Learning Studio (Quiz + Spoken Roleplay)
    // ------------------------------------------------------------------
    const isLanguageLearnRequest =
      /(?:(?:我想|我要|帮我|带我|一起|开始)?学(?:习)?(?:语言|外语|英语|英文|口语|阿拉伯语|日语|法语|西班牙语|韩语)|练(?:习)?(?:英语|英文|口语|对话)|实景对话|口语(?:对话|练习|实景)|给我出(?:一些|很多|几道)?(?:英语|语言|口语)?题|多邻国|(?:learn|study|practice)\s*(?:language|english|arabic|japanese|french|spanish|korean|speaking|roleplay)|english\s*roleplay)/i.test(
        cleanPrompt
      );

    if (!isHypothetical && isLanguageLearnRequest) {
      const targetLang: SupportedStudyLang = /阿拉伯|arabic/i.test(cleanPrompt)
        ? 'ar'
        : /日语|日文|japanese/i.test(cleanPrompt)
          ? 'ja'
          : /法语|french/i.test(cleanPrompt)
            ? 'fr'
            : /西语|西班牙|spanish/i.test(cleanPrompt)
              ? 'es'
              : /韩语|korean/i.test(cleanPrompt)
                ? 'ko'
                : 'en';

      const wantsQuizFirst =
        /(?:出题|做题|刷题|测验|测试|考我|考考我|练习题|quiz|test)/i.test(cleanPrompt) &&
        !/(?:实景|口语对话|角色扮演|roleplay|场景对话)/i.test(cleanPrompt);

      const scenarioId = /机场|海关|值机|airport/i.test(cleanPrompt)
        ? 'airport'
        : /酒店|入住|hotel/i.test(cleanPrompt)
          ? 'hotel'
          : /餐厅|点菜|点餐|restaurant/i.test(cleanPrompt)
            ? 'restaurant'
            : /面试|求职|interview/i.test(cleanPrompt)
              ? 'interview'
              : /购物|买东西|问路|shopping/i.test(cleanPrompt)
                ? 'shopping'
                : /医院|诊所|看病|药房|clinic/i.test(cleanPrompt)
                  ? 'clinic'
                  : /派对|交友|朋友|party|friends/i.test(cleanPrompt)
                    ? 'friends'
                    : 'cafe';

      steps.push({
        id: 'step_lang_studio',
        label: isZh
          ? wantsQuizFirst
            ? '正在为你生成多题型互动闯关题库'
            : '正在开启实景口语对话与即时救急教练'
          : 'Launching live language studio',
        status: 'completed',
        timestamp: nowIso(),
      });

      try {
        if (wantsQuizFirst) {
          const quizPack = await generateLanguageQuizPack({
            targetLang,
            level: 'intermediate',
            topic: cleanPrompt,
            count: 6,
          });
          const firstQ = quizPack.questions[0];

          clientActions.push({
            type: 'open_language_studio',
            targetLang,
            mode: 'quiz',
            initialQuiz: quizPack,
          });

          const replyText = isZh
            ? `太好了！我已经为你出好了 ${quizPack.questions.length} 道「${quizPack.topicTitleZh}」互动练习（含情景选择、填空、听力和开口跟读），也可以随时一键切到实景口语对话！`
            : `Ready! I created ${quizPack.questions.length} interactive questions on "${quizPack.topicTitleZh}". You can also switch to real-world spoken roleplay anytime!`;

          const resultData = { targetLang, mode: 'quiz', quizPack, clientActions };
          oneAiDb.upsertAgentSession({
            sessionId,
            userId: subjectId,
            status: 'completed',
            intentSummary: cleanPrompt.slice(0, 80),
            module: 'language-studio',
            steps,
            result: { targetLang, mode: 'quiz', count: quizPack.questions.length },
          });

          return res.json({
            success: true,
            sessionId,
            module: 'language-studio',
            model: 'ONE AI',
            emotion: 'cheerful',
            reply: replyText,
            targetText: firstQ?.targetAudioText || '',
            translationZh: firstQ?.promptZh || '',
            phonetic: firstQ?.phonetic || '',
            steps,
            clientActions,
            resultData,
          });
        } else {
          const roleplay = await startRoleplaySession({
            targetLang,
            scenarioId,
            level: 'intermediate',
          });

          clientActions.push({
            type: 'open_language_studio',
            targetLang,
            mode: 'roleplay',
            scenarioId,
            initialRoleplay: roleplay,
          });

          const replyText = `${roleplay.npcLine}`;
          const resultData = { targetLang, mode: 'roleplay', roleplay, clientActions };
          oneAiDb.upsertAgentSession({
            sessionId,
            userId: subjectId,
            status: 'completed',
            intentSummary: cleanPrompt.slice(0, 80),
            module: 'language-studio',
            steps,
            result: { targetLang, mode: 'roleplay', scenarioTitle: roleplay.scenarioTitle },
          });

          return res.json({
            success: true,
            sessionId,
            module: 'language-studio',
            model: 'ONE AI',
            emotion: roleplay.npcMood || 'cheerful',
            reply: replyText,
            targetText: roleplay.npcLine,
            translationZh: roleplay.npcTranslationZh,
            phonetic: roleplay.npcPhonetic,
            rescueCards: roleplay.rescueSuggestions,
            languageBadge: `实景口语 · ${roleplay.scenarioTitle}`,
            speakLang: targetLang,
            steps,
            clientActions,
            resultData,
          });
        }
      } catch (err: any) {
        return res.status(503).json({
          success: false,
          sessionId,
          module: 'language-studio',
          error: err?.message || '语言学习引擎启动失败',
          reply: isZh
            ? '我已为你打开语言学习空间，你可以直接切换英语实景口语或刷题练习。'
            : 'Opening the language studio for you now.',
          steps,
          clientActions: [{ type: 'open_language_studio', targetLang, mode: wantsQuizFirst ? 'quiz' : 'roleplay', scenarioId }],
        });
      }
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
          { role: 'system', content: `你是 EARTH ONE 研究助手「${customAiName}」。严格根据给出的真实检索摘要总结要点并附上真实来源标题或链接，绝不编造链接。不要称呼用户为“小小”。` },
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
        content: `${ctx.systemPrompt}\n当前你在 EARTH ONE 3D 湖畔花园与使用者像真人一样自然实时对话。你的名字是「${customAiName}」（切勿把用户叫作小小）。请在回复最开头附带一个情绪标签 [[EMO:calm]]、[[EMO:cheerful]]、[[EMO:affectionate]]、[[EMO:empathetic]]、[[EMO:playful]]、[[EMO:excited]] 或 [[EMO:curious]]（随后接自然温暖的真人化口语内容）；不向普通用户暴露任何底层模型厂商或技术标识。`,
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
      const parsed = stripAiControlTags(routed.content);
      const replyText = parsed.reply || routed.content.trim();
      const replyEmotion = parsed.emotion || 'calm';
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
        result: { reply: replyText, emotion: replyEmotion },
      });
      return res.json({
        success: true,
        sessionId,
        module: 'assistant',
        model: 'ONE AI',
        reply: replyText,
        emotion: replyEmotion,
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
