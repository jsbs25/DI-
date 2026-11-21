import type { Request, Response } from 'express';
import type { User } from '../../src/types/index.ts';
import type { UserTier } from './types.ts';
import { oneAiDb } from './db.ts';

export interface QuotaCheckResult {
  allowed: boolean;
  userTier: UserTier;
  subjectKey: string;
  requestsToday: number;
  dailyRequestLimit: number;
  tokensToday: number;
  dailyTokenLimit: number;
  reason?: string;
}

const DEFAULT_ADMIN_EMAILS = new Set(
  [
    'mfc521mfc@gmail.com',
    ...String(process.env.ONE_AI_ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ]
);

const DEFAULT_ADMIN_USER_IDS = new Set(
  String(process.env.ONE_AI_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

export function isOneAiAdmin(user: User | undefined | null): boolean {
  if (!user) return false;
  if ((user as any).role === 'admin') return true;
  if (user.email && DEFAULT_ADMIN_EMAILS.has(user.email.toLowerCase())) return true;
  if (DEFAULT_ADMIN_USER_IDS.has(user.id)) return true;
  // Local dev owner account when explicitly running non-production dev mode
  if (process.env.NODE_ENV !== 'production' && user.id === 'user_cn_1') return true;
  return false;
}

export function resolveUserTier(user: User | undefined | null): UserTier {
  if (!user) return 'guest';
  if (isOneAiAdmin(user)) return 'admin';
  if ((user as any).aiTier === 'pro') return 'pro';
  return 'free';
}

const TIER_LIMITS: Record<UserTier, { dailyRequests: number; dailyTokens: number; rpm: number; allowPaid: boolean }> = {
  guest: { dailyRequests: 25, dailyTokens: 45_000, rpm: 8, allowPaid: false },
  free: { dailyRequests: 150, dailyTokens: 350_000, rpm: 24, allowPaid: true },
  pro: { dailyRequests: 1000, dailyTokens: 2_500_000, rpm: 60, allowPaid: true },
  admin: { dailyRequests: 100_000, dailyTokens: 100_000_000, rpm: 300, allowPaid: true },
};

export function getTierPolicy(tier: UserTier) {
  return TIER_LIMITS[tier];
}

// Sliding 60s RPM window + Active concurrent stream lock per user/IP
const rpmWindow = new Map<string, number[]>();
const activeStreams = new Map<string, number>();

export function acquireStreamLock(subjectKey: string, tier: UserTier): { ok: boolean; release: () => void } {
  const maxConcurrent = tier === 'admin' ? 8 : tier === 'pro' ? 3 : 1;
  const current = activeStreams.get(subjectKey) || 0;
  if (current >= maxConcurrent) {
    return { ok: false, release: () => {} };
  }
  activeStreams.set(subjectKey, current + 1);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      const cur = activeStreams.get(subjectKey) || 0;
      if (cur <= 1) activeStreams.delete(subjectKey);
      else activeStreams.set(subjectKey, cur - 1);
    },
  };
}

export function checkUserQuota(user: User | undefined | null, clientIp: string): QuotaCheckResult {
  const userTier = resolveUserTier(user);
  const subjectKey = user ? `user:${user.id}` : `guest:${clientIp || 'unknown'}`;
  const limits = TIER_LIMITS[userTier];

  // Check 60s RPM burst
  const now = Date.now();
  const timestamps = (rpmWindow.get(subjectKey) || []).filter((ts) => now - ts < 60_000);
  if (timestamps.length >= limits.rpm) {
    rpmWindow.set(subjectKey, timestamps);
    return {
      allowed: false,
      userTier,
      subjectKey,
      requestsToday: 0,
      dailyRequestLimit: limits.dailyRequests,
      tokensToday: 0,
      dailyTokenLimit: limits.dailyTokens,
      reason: '请求过于频繁，请稍等几秒再试。',
    };
  }
  timestamps.push(now);
  rpmWindow.set(subjectKey, timestamps);

  const usage = oneAiDb.getUserDailyUsageCount(subjectKey);
  if (usage.requestsToday >= limits.dailyRequests || usage.tokensToday >= limits.dailyTokens) {
    return {
      allowed: false,
      userTier,
      subjectKey,
      requestsToday: usage.requestsToday,
      dailyRequestLimit: limits.dailyRequests,
      tokensToday: usage.tokensToday,
      dailyTokenLimit: limits.dailyTokens,
      reason:
        userTier === 'guest'
          ? '今日访客体验额度已达上限，登录后可获得更高每日配额。'
          : '今日免费智能调度额度已达上限，将于 UTC 00:00 自动重置。',
    };
  }

  return {
    allowed: true,
    userTier,
    subjectKey,
    requestsToday: usage.requestsToday,
    dailyRequestLimit: limits.dailyRequests,
    tokensToday: usage.tokensToday,
    dailyTokenLimit: limits.dailyTokens,
  };
}

// 5-minute idempotency response cache to avoid duplicate upstream billing
interface CachedIdemEntry {
  expiresAt: number;
  inFlight: boolean;
  result?: { reply: string; tokens: number; intent: string; emotion?: string };
}
const idempotencyStore = new Map<string, CachedIdemEntry>();

export function checkIdempotency(subjectKey: string, key?: string | null): CachedIdemEntry | null {
  if (!key) return null;
  const fullKey = `${subjectKey}:${key}`;
  const now = Date.now();
  // Opportunistic prune
  if (idempotencyStore.size > 500) {
    for (const [k, v] of idempotencyStore) {
      if (v.expiresAt <= now) idempotencyStore.delete(k);
    }
  }
  const existing = idempotencyStore.get(fullKey);
  if (existing && existing.expiresAt > now) {
    return existing;
  }
  return null;
}

export function markIdempotencyStarted(subjectKey: string, key?: string | null) {
  if (!key) return;
  idempotencyStore.set(`${subjectKey}:${key}`, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    inFlight: true,
  });
}

export function markIdempotencyFinished(
  subjectKey: string,
  key: string | null | undefined,
  result?: { reply: string; tokens: number; intent: string; emotion?: string }
) {
  if (!key) return;
  if (!result) {
    idempotencyStore.delete(`${subjectKey}:${key}`);
    return;
  }
  idempotencyStore.set(`${subjectKey}:${key}`, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    inFlight: false,
    result,
  });
}

export function requireAdminMiddleware(
  resolveSessionUser: (req: Request) => User | undefined,
  req: Request,
  res: Response
): User | null {
  const user = resolveSessionUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: '需要管理员登录后才可访问 ONE AI 控制台。' });
    return null;
  }
  if (!isOneAiAdmin(user)) {
    res.status(403).json({ success: false, error: '权限不足：仅管理员账号允许修改或查看后台模型调度配置。' });
    return null;
  }
  return user;
}
