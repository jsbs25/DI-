import express from 'express';
import { createServer as createViteServer } from 'vite';
import http from 'node:http';
// @ts-ignore - ws types may not resolve in this environment
import { WebSocketServer } from 'ws';
// @ts-ignore
import type { WebSocket } from 'ws';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { store, stripBookContent } from './server/store.ts';
import { toPublicUser } from './server/privacy.ts';
import { canViewProfileByPolicy, canSearchByField } from './server/privacyPolicy.ts';
import { aiGateway } from './server/aiGateway.ts';
import { executeAiTurn } from './server/aiTurnOrchestrator.ts';
import { Modality, ThinkingLevel } from '@google/genai';
import { getGeminiClient } from './server/geminiClient.ts';
import {
  AI_COMPANION_TOOLS,
  buildCompanionSystemInstruction,
  type LivePageContextSummary,
} from './server/aiLiveTools.ts';
import {
  commitMemoriesFromTurn,
  deleteMemoryItem,
  listMemories,
  normalizeProfileKey,
  retrieveRelevantMemories,
  updateMemoryItem,
  upsertMemory,
} from './server/aiMemory.ts';
import { analyzeTurnContext, isConversationalFramingNotCommand } from './server/aiIntent.ts';
import { solvePrecisionQuery } from './src/utils/precisionSolver.ts';
import { parseInstantAgentAction } from './src/utils/oneAgentController.ts';
import { cacheJupiterSearch, getCachedJupiterSearch, getJupiterEarthContent, mergeAndRankJupiterResults, searchEarthAudio, searchEarthImages, searchEarthIndex, type JupiterResult } from './server/jupiterSearch.ts';
import { buildReadingPrompt, resolveReadingEvidence } from './server/libraryReadingAi.ts';
import { EpubArchiveError, fetchAllowedEpubResponse, isSyntacticallyValidEpubCfi, readBoundedEpubArchive } from './server/libraryEpubSecurity.ts';
import { fetchAndExtract, fetchRawHtml, searchGitHubRepositories, searchGoogleCategory, searchGoogleImages, searchWeb, searchWebProviders, searchZLibraryDiscovery, type JupiterExternalSearchCategory, type SearchResult } from './server/webFetcher.ts';
import { searchYouTubeVideos } from './server/youtubeSearch.ts';
import { getLibraryConnector, isLibraryConnectorEnabled, libraryConnectors, RightsCategory, searchLibrary, type LibrarySource } from './server/integrations/libraries/index.ts';
import { runBookHarvest } from './server/bookHarvester.ts';
import { crawlOpenBooks } from './server/bookCrawler.ts';
import {
  searchKnowledge,
  getAllKnowledgeNodes,
  getKnowledgeNode,
  getRelatedNodes,
  getKnowledgeNodeByCountry
} from './server/knowledgeGraph.ts';
import { musicStore } from './server/musicStore.ts';
import { resolveMusicEmbedUrl, searchYouTubeMusic } from './server/youtubeMusicSearch.ts';
import { getChannelIntegrations } from './server/channelIntegrations.ts';
import { getSmsProvider, smsStatus } from './server/smsProvider.ts';
import { getMailProvider, mailStatus } from './server/mailProvider.ts';
import { createChallenge, verifyChallenge, canSendTo, normalizePhone, isValidE164 } from './server/otp.ts';
import { attachMessengerWs, wsBroadcastConversationEvent, wsBroadcastToUser, broadcastToUsers, isUserViewingConversation } from './server/messengerWs.ts';
import { attachAiLiveWs } from './server/aiLiveWs.ts';
import { addCall, getCallById, listCallsForUser, ensureCallsArray } from './server/calls/index.ts';
import { createCallRecord, acceptCall as acceptCallRecord, rejectCall as rejectCallRecord, cancelCall as cancelCallRecord, endCall as endCallRecord, leaveCall as leaveCallRecord, getActiveCallForUser, issueMediaToken, markActive, markReconnecting, canIssueMediaToken, isActiveCallStatus, cleanupStaleCalls, cleanupStaleCallsDetailed, getCommunicationCapabilities } from './server/calls/service.ts';
import { pushCallSignal, listCallSignalsForUser, clearCallSignals } from './server/calls/signals.ts';
import {
  findNetworkNodeById,
  getNetworkDeviceConfigForUser,
  getNetworkOverview,
  listDevicesForUser,
  listNetworkNodesWithStatus,
  probeNetworkNode,
  registerNetworkDevice,
  revokeNetworkDeviceForUser,
} from './server/network/service.ts';
import { decideNotification } from './server/notificationPolicy.ts';
import fs from 'node:fs';
import path from 'node:path';
import { searchBilibiliVideos } from './server/bilibiliCrawler.ts';
import { getRegisteredProviders } from './server/media/providers.ts';
import { probeDirectMediaUrl, probeEmbedUrl } from './server/media/probe.ts';
import { CURATED_GLOBAL_CN_MUSIC, enrichMusicTrack, enrichVideoItem, getCombinedEnrichedVideos } from './server/media/catalog.ts';
import { dispatchUnifiedMusicSearch, dispatchUnifiedVideoSearch, resolveRegionFromRequest } from './server/media/scheduler.ts';
import { searchOpenImages } from './server/openImageCrawler.ts';
import { discoveryDb } from './server/discovery/database/db.ts';
import { executeUnifiedSearch } from './server/discovery/search/unifiedSearchEngine.ts';
import { startDiscoveryScheduler, runLinkHealthCheck, runRssSync } from './server/discovery/scheduler/taskScheduler.ts';
import { harvestPublicWebUrl } from './server/discovery/connectors/webMetadataConnector.ts';
import { harvestRssFeed } from './server/discovery/connectors/rssConnector.ts';
import {
  crawlIslamicLibraries,
  getFeaturedIslamicBooks,
  seedIslamicLibraryToDiscovery,
  type IslamicLibraryCategory,
  type IslamicLibrarySource
} from './server/islamicLibraryCrawler.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1' || process.env.EARTH_ONE_SERVE_DIST === 'true') {
  app.set('trust proxy', 1);
}

// Optional CORS for split web deployment (Pages frontend + separate API). Set CORS_ORIGIN to frontend origin(s), comma-separated.
app.use((req, res, next) => {
  const origin = String(process.env.CORS_ORIGIN || '').trim();
  if (origin) {
    const allow = origin === '*' ? '*' : origin.split(',').map(s => s.trim()).filter(Boolean);
    const reqOrigin = String(req.headers.origin || '');
    if (allow === '*' || (reqOrigin && Array.isArray(allow) && allow.includes(reqOrigin))) {
      res.setHeader('Access-Control-Allow-Origin', allow === '*' ? '*' : reqOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    } else if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === '/api/messenger/upload/stream') return next();
  return express.json({ limit: '20mb' })(req, res, next);
});

// All AI generation, translation, and voice intelligence use DeepSeek via aiGateway.

// Resolve only an explicitly valid session. Keep the legacy guest fallback
// separate so identity endpoints never expose another visitor's active user.
function getSessionToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.substring(7).trim();
    if (t) return t;
  }
  const cookies = parseCookies(req);
  if (cookies.earth_one_session) return cookies.earth_one_session;
  return null;
}

function getSessionUser(req: express.Request) {
  const token = getSessionToken(req);
  if (token) {
    const user = store.getUserByToken(token);
    if (user) return user;
  }
  return undefined;
}

function getAuthUser(req: express.Request) {
  return getSessionUser(req) || store.currentUser;
}

function isPlaceholderAppUrl(value: string | undefined | null): boolean {
  const v = String(value || '').trim();
  if (!v) return true;
  return /^(MY_)?APP_URL$/i.test(v) || /^https?:\/\/(example\.com|localhost\/?$)/i.test(v) || v.includes('MY_APP_URL');
}

function resolveAppUrl(req?: express.Request): string {
  const env = (process.env.APP_URL || '').trim();
  if (!isPlaceholderAppUrl(env)) return env.replace(/\/$/, '');
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host');
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

// Simple in-memory sliding-window rate limiter for auth endpoints (brute-force
// mitigation). Keyed by client IP so repeated failed logins are throttled.
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function checkAuthRateLimit(key: string, limit = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (entry.count > limit) return false;
  return true;
}

function parseCookies(req: express.Request): Record<string, string> {
  const raw = req.headers.cookie || '';
  const out: Record<string, string> = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v || ''); } catch { out[k] = v || ''; }
    }
  });
  return out;
}

function isSecureRequest(req: express.Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return !!(req.secure || proto === 'https');
}

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  if (!token) return;
  const secure = isSecureRequest(req);
  const sameSite = secure ? 'None; Secure' : 'Lax';
  res.append('Set-Cookie', `earth_one_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=${sameSite}`);
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  const secure = isSecureRequest(req);
  const sameSite = secure ? 'None; Secure' : 'Lax';
  res.append('Set-Cookie', `earth_one_session=; HttpOnly; Path=/; Max-Age=0; SameSite=${sameSite}`);
}

function isDevLoginEnabledConfig() {
  const v = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isLoopbackIp(raw: string) {
  const ip = String(raw || '').trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function isTrustedLocalRequest(req: express.Request) {
  // Must be direct loopback connection; reject proxied/forwarded requests to avoid remote access.
  const remote = String(req.socket?.remoteAddress || req.ip || '').replace(/^::ffff:/i, '');
  if (!isLoopbackIp(remote)) return false;
  if (String(req.headers['x-forwarded-for'] || '').trim()) return false;
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').trim();
  if (forwardedHost) return false;
  // Strict Host check to mitigate DNS rebinding: only localhost loopback hosts with optional port.
  const hostHeader = String(req.headers.host || '').trim().toLowerCase();
  const m = /^(\[::1\]|localhost|127\.0\.0\.1)(:\d+)?$/i.exec(hostHeader);
  if (!m) return false;
  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const u = new URL(origin);
      const h = u.hostname.toLowerCase();
      if (!(h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]')) return false;
    } catch { return false; }
  }
  return true;
}

function isDevQuickLoginAllowed(req: express.Request) {
  // Fixed dev account only (li_wei), no client-supplied userId. Independent config gate required.
  return process.env.NODE_ENV !== 'production' && isDevLoginEnabledConfig() && isTrustedLocalRequest(req);
}

function getAuthRuntimeStatus() {
  const wechatConfigured = !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const devEnabled = isDevLoginEnabledConfig();
  const appUrlRaw = (process.env.APP_URL || '').trim() || null;
  return {
    env: process.env.NODE_ENV || 'development',
    wechat: {
      configured: wechatConfigured,
      appIdSet: !!process.env.WECHAT_APP_ID,
      appSecretSet: !!process.env.WECHAT_APP_SECRET,
      appUrl: appUrlRaw,
      appUrlIsPlaceholder: isPlaceholderAppUrl(appUrlRaw),
    },
    google: { configured: googleConfigured },
    devQuickLogin: {
      configEnabled: devEnabled,
      availableInDevelopment: devEnabled,
    },
  };
}


const oauthStates = new Map<string, number>(); // state -> expiresAt
function pruneOauthStates() {
  const now = Date.now();
  for (const [k, exp] of oauthStates) if (exp <= now) oauthStates.delete(k);
}
setInterval(pruneOauthStates, 5 * 60 * 1000).unref?.();

function requireSessionUser(req: express.Request, res: express.Response) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return null;
  }
  return user;
}


// -------------------------------------------------------------
// CHANNEL INTEGRATIONS (official only; no personal account takeover)
// -------------------------------------------------------------
app.get('/api/integrations', (req, res) => {
  const user = getSessionUser(req);
  const integrations = getChannelIntegrations(process.env).map(i => {
    const linked = user?.linkedIdentities?.find(li => li.provider === i.id);
    return { ...i, linked: !!linked, linkedLabel: linked?.displayName || linked?.email || linked?.phone || linked?.providerUserId };
  });
  const sms = smsStatus();
  const mail = mailStatus();
  res.json({ success: true, integrations, sms, mail });
});

// -------------------------------------------------------------
// 1. AUTH & USER PROFILE ENDPOINTS
// -------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const { email, password, displayName, username } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkAuthRateLimit(`register:${clientKey}`, 20)) {
    return res.status(429).json({ success: false, error: '注册尝试过于频繁，请稍后再试。' });
  }
  try {
    const { user, token } = store.registerUser(email, password, displayName, username);
    setSessionCookie(req, res, token);
    res.json({ success: true, user, token, message: 'Welcome to Earth One! Please complete your citizen profile.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: 'Please enter your email/username and password.' });
  }
  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  const lockKey = `${clientKey}:${String(identifier||'').trim().toLowerCase()}`;
  const locked = store.isLoginLocked(lockKey);
  if (locked.locked) {
    return res.status(429).json({ success: false, error: 'Too many failed login attempts. Please try again later.', retryAfterMs: locked.retryAfterMs });
  }
  if (!checkAuthRateLimit(`login:${clientKey}`)) {
    return res.status(429).json({ success: false, error: 'Too many login attempts. Please try again later.' });
  }
  try {
    const { user, token } = store.loginUser(identifier, password);
    store.clearLoginFailures(lockKey);
    store.addAudit(user.id, 'login_success', String(identifier||''), req.ip);
    setSessionCookie(req, res, token);
    res.json({ success: true, user, token });
  } catch (err: any) {
    store.recordLoginFailure(lockKey);
    store.addAudit(undefined, 'login_failed', String(identifier||''), req.ip);
    res.status(401).json({ success: false, error: err.message || 'Invalid credentials.' });
  }
});


app.get('/api/account/me', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const me = store.getAccountMe(user.id);
  if (!me) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, account: me, user: me });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  res.json({ success: true, user: user || null });
});

app.get('/api/auth/status', (req, res) => {
  const st = getAuthRuntimeStatus();
  res.json({
    success: true,
    env: st.env,
    devQuickLogin: {
      enabled: false,
      available: false,
      reason: '已移除测试/虚拟账号，请使用真实账号注册或登录。',
      demoUser: null,
    },
    wechat: {
      configured: st.wechat.configured,
      appUrlIsPlaceholder: st.wechat.appUrlIsPlaceholder,
      message: st.wechat.configured ? (st.wechat.appUrlIsPlaceholder ? 'APP_URL 仍为占位值，需配置真实回调地址后才能完成生产可用登录。' : '微信登录已具备配置条件。') : '微信登录尚未配置，请使用邮箱注册或登录。',
    },
    google: { configured: st.google.configured },
  });
});

app.post('/api/auth/dev-login', async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: '已移除所有虚拟与测试账号，请注册或登录真实账号。',
  });
});



// ---------------- Phone OTP auth (provider-pluggable, never faked) ----------------
app.post('/api/auth/phone/send-code', async (req, res) => {
  const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const phone = normalizePhone(phoneRaw);
  if (!isValidE164(phone)) return res.status(400).json({ success: false, error: 'Please provide a valid phone number in international E.164 format (e.g. +14155552671).' });
  const clientKey = `${req.ip || 'ip'}:${phone}`;
  if (!checkAuthRateLimit(`sms:${clientKey}`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ success: false, error: 'Too many code requests. Please try again later.' });
  }
  const gate = canSendTo(phone, 60 * 1000, 1, 5);
  if (!gate.ok) return res.status(429).json({ success: false, error: 'Please wait before requesting another code.', retryAfterMs: gate.retryAfterMs });
  const provider = getSmsProvider();
  if (!provider.isConfigured()) {
    store.addAudit(undefined, 'phone_otp_blocked', `provider_unconfigured target=${phone}`, req.ip);
    return res.status(503).json({ success: false, blocked: true, provider: provider.id, error: 'SMS service is not configured. No verification code was sent. Configure SMS_PROVIDER and provider credentials.' });
  }
  const { challenge, code } = createChallenge('phone_login', phone, { ttlMs: 10 * 60 * 1000, maxAttempts: 5 });
  const text = `Your EARTH ONE verification code is ${code}. It expires in 10 minutes.`;
  const result = await provider.send(phone, text);
  if (!result.success) {
    store.addAudit(undefined, 'phone_otp_send_failed', `target=${phone} err=${result.error||''}`, req.ip);
    return res.status(502).json({ success: false, blocked: !!result.blocked, provider: result.provider, error: result.error || 'Failed to send SMS. No code was issued.' });
  }
  store.addAudit(undefined, 'phone_otp_sent', `target=${phone} provider=${result.provider}`, req.ip);
  res.json({ success: true, challengeId: challenge.id, expiresAt: challenge.expiresAt, provider: result.provider, message: 'Verification code sent.' });
});

app.post('/api/auth/phone/verify', async (req, res) => {
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const phone = normalizePhone(phoneRaw);
  if (!challengeId || !code || !isValidE164(phone)) return res.status(400).json({ success: false, error: 'Phone, challengeId, and code are required.' });
  const clientKey = `${req.ip || 'ip'}:${phone}`;
  if (!checkAuthRateLimit(`sms-verify:${clientKey}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
  }
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge) return res.status(400).json({ success: false, error: v.error || 'Verification failed.' });
  if (v.challenge.purpose !== 'phone_login' || v.challenge.target !== phone) {
    return res.status(400).json({ success: false, error: 'Verification does not match this phone number.' });
  }
  try {
    await store.mutate(async () => {
      let user = store.findUserByPhone(phone);
      if (!user) {
        // create or attach unique phone account
        const base = `user_${phone.replace(/[^0-9]/g,'').slice(-8) || Date.now()}`;
        let username = base; let n=1;
        while ((store as any).accounts?.has?.(username) || store.users.some(u=>u.username===username)) username = `${base}_${n++}`;
        const userId = `user_phone_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        const newUser: any = {
          id: userId, username, displayName: `Citizen ${phone.slice(-4)}`,
          phone, phoneVerified: true,
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
          bio: 'Citizen exploring Earth One.',
          location: { countryCode: 'UN', countryName: 'Global', cityName: 'Earth', lat: 0, lng: 0, isPublic: true },
          interests: ['Global Dialogue'],
          followersCount: 1, followingCount: 1, tipsReceived: 0,
          isOnline: true, verified: false, joinedAt: new Date().toISOString(), hasCompletedOnboarding: false,
          linkedIdentities: []
        };
        store.upsertLinkedIdentity(newUser, { provider: 'phone', providerUserId: phone, phone, linkedAt: new Date().toISOString() });
        store.users.unshift(newUser);
        const salt = (await import('node:crypto')).randomBytes(16).toString('hex');
        const acc = { userId, email: `${username}@earthone.local`, passwordHash: store.hashPassword((await import('node:crypto')).randomBytes(24).toString('hex'), salt), salt };
        (store as any).accounts.set(userId, acc);
        (store as any).accounts.set(acc.email, acc);
        (store as any).accounts.set(username, acc);
        user = newUser;
      } else {
        user.phone = phone; user.phoneVerified = true;
        store.upsertLinkedIdentity(user, { provider: 'phone', providerUserId: phone, phone, linkedAt: new Date().toISOString() });
      }
      const token = (await import('node:crypto')).randomBytes(32).toString('hex');
      (store as any).sessions.set(token, user!.id);
      user!.isOnline = true; user!.lastActiveAt = new Date().toISOString();
      (store as any).currentUser = user;
      store.addAudit(user!.id, 'phone_login_success', `phone=${phone}`, req.ip);
      store.persist();
      setSessionCookie(req, res, token);
      res.json({ success: true, user, token });
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Phone login failed.' });
  }
});

// ---------------- WeChat Open Platform OAuth (official; config-gated) ----------------
const wechatStates = new Map<string, number>();
function pruneWechatStates() { const now=Date.now(); for (const [k,exp] of wechatStates) if (exp<=now) wechatStates.delete(k); }
setInterval(pruneWechatStates, 5*60*1000).unref?.();

app.get('/api/auth/wechat/start', (req, res) => {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  const appUrl = resolveAppUrl(req);
  if (!appId || !appSecret) return res.status(501).json({ success: false, blocked: true, error: '微信登录尚未配置，请使用开发者登录。', message: '微信登录尚未配置，请使用开发者登录。' });
  const redirectUri = encodeURIComponent(`${appUrl}/api/auth/wechat/callback`);
  const state = (randomBytes(24)).toString('hex');
  pruneWechatStates(); wechatStates.set(state, Date.now() + 10*60*1000);
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `earth_wechat_state=${encodeURIComponent(state)}; HttpOnly; Path=/api/auth/wechat; SameSite=Lax; Max-Age=600${isSecure ? '; Secure' : ''}`);
  // Official WeChat Open Platform website QR login endpoint
  res.redirect(`https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`);
});

app.get('/api/auth/wechat/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const appUrl = resolveAppUrl(req);
  const cookies = parseCookies(req);
  const cookieState = cookies.earth_wechat_state || '';
  const exp = wechatStates.get(state);
  const ok = !!state && !!cookieState && state===cookieState && !!exp && exp>Date.now();
  if (state) wechatStates.delete(state);
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `earth_wechat_state=; HttpOnly; Path=/api/auth/wechat; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`);
  if (!ok) return res.redirect(`${appUrl}/?auth_error=wechat_state`);
  if (!code || !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) return res.redirect(`${appUrl}/?auth_error=wechat_config`);
  try {
    const tokenRes = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(process.env.WECHAT_APP_ID)}&secret=${encodeURIComponent(process.env.WECHAT_APP_SECRET)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`);
    const tokenJson: any = await tokenRes.json().catch(()=> ({}));
    if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.openid) return res.redirect(`${appUrl}/?auth_error=wechat_token`);
    let profile: any = {};
    try {
      const infoRes = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(tokenJson.access_token)}&openid=${encodeURIComponent(tokenJson.openid)}`);
      profile = await infoRes.json().catch(()=> ({}));
    } catch {}
    const providerUserId = String(tokenJson.openid || tokenJson.unionid || '');
    if (!providerUserId) return res.redirect(`${appUrl}/?auth_error=wechat_profile`);
    await store.mutate(async () => {
      try {
        const r = store.createOrLoginOAuthUser({ provider: 'wechat' as any, providerUserId, displayName: profile?.nickname, avatar: profile?.headimgurl });
        const payload = Buffer.from(JSON.stringify({ token: r.token, user: r.user })).toString('base64url');
        store.addAudit(r.user.id, 'wechat_login_success', 'openid_login', req.ip);
        store.persist();
        setSessionCookie(req, res, r.token);
        res.redirect(`${appUrl}/#auth=${payload}`);
      } catch (e: any) {
        if (String(e?.message || '') === 'UNBOUND_EXTERNAL_IDENTITY') {
          store.addAudit(undefined, 'wechat_login_unbound', `openid=${providerUserId}`, req.ip);
          store.persist();
          return res.redirect(`${appUrl}/?auth_error=wechat_unbound`);
        }
        throw e;
      }
    });
  } catch (e) {
    console.error('WeChat OAuth callback error', e);
    return res.redirect(`${appUrl}/?auth_error=wechat_failed`);
  }
});


// ---------------- Email verification / password reset / account security ----------------
function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

async function sendMailOrBlock(to: string, subject: string, text: string) {
  const provider = getMailProvider();
  if (!provider.isConfigured()) {
    store.addAudit(undefined, 'mail_blocked', `to=${to} subject=${subject}`, undefined);
    return { ok: false, blocked: true, provider: provider.id, error: 'Mail service is not configured. No email was sent. Configure MAIL_PROVIDER and credentials.' };
  }
  const result = await provider.send(to, subject, text);
  if (!result.success) {
    store.addAudit(undefined, 'mail_failed', `to=${to} err=${result.error||''}`, undefined);
    return { ok: false, blocked: !!result.blocked, provider: result.provider, error: result.error || 'Failed to send email. No email was sent.' };
  }
  return { ok: true, provider: result.provider, messageId: result.messageId };
}

app.post('/api/auth/email/send-verification', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return res.status(400).json({ success: false, error: 'Valid email required.' });
  if (!checkAuthRateLimit(`email-verify:${req.ip||'ip'}:${email}`, 5, 15*60*1000)) return res.status(429).json({ success:false, error:'Too many requests.' });
  const gate = canSendTo(`email:${email}`, 60*1000, 1, 5);
  if (!gate.ok) return res.status(429).json({ success:false, error:'Please wait before requesting another email.', retryAfterMs: gate.retryAfterMs });
  const { challenge, code } = createChallenge('email_verify', email, { ttlMs: 30*60*1000, maxAttempts: 5 });
  const mail = await sendMailOrBlock(email, 'EARTH ONE email verification', `Your EARTH ONE verification code is ${code}. It expires in 30 minutes.`);
  if (!mail.ok) return res.status(503).json({ success:false, blocked:true, error: mail.error, provider: mail.provider });
  store.addAudit(undefined, 'email_verify_sent', `email=${email}`, req.ip);
  res.json({ success:true, challengeId: challenge.id, expiresAt: challenge.expiresAt, message:'Verification email sent.' });
});

app.post('/api/auth/email/verify', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!isValidEmail(email) || !challengeId || !code) return res.status(400).json({ success:false, error:'email, challengeId, code required.' });
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge || v.challenge.purpose !== 'email_verify' || v.challenge.target !== email) return res.status(400).json({ success:false, error: v.error || 'Verification failed.' });
  store.addAudit(undefined, 'email_verified', `email=${email}`, req.ip);
  res.json({ success:true, email, verified:true });
});

app.post('/api/auth/password/forgot', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return res.status(400).json({ success:false, error:'Valid email required.' });
  // always respond generically to avoid account enumeration, but only send if account exists
  const user = store.findUserByEmail(email);
  if (!user) return res.json({ success:true, message:'If an account exists for this email, reset instructions will be sent (if mail is configured).' });
  if (!checkAuthRateLimit(`pwd-forgot:${req.ip||'ip'}:${email}`, 5, 15*60*1000)) return res.status(429).json({ success:false, error:'Too many requests.' });
  const { challenge, code } = createChallenge('password_reset', email, { ttlMs: 30*60*1000, maxAttempts: 5, userId: user.id });
  const mail = await sendMailOrBlock(email, 'EARTH ONE password reset', `Your EARTH ONE password reset code is ${code}. It expires in 30 minutes. If you did not request this, ignore this email.`);
  if (!mail.ok) return res.status(503).json({ success:false, blocked:true, error: mail.error, provider: mail.provider });
  store.addAudit(user.id, 'password_reset_requested', `email=${email}`, req.ip);
  res.json({ success:true, challengeId: challenge.id, expiresAt: challenge.expiresAt, message:'Reset email sent (if configured).' });
});

app.post('/api/auth/password/reset', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!isValidEmail(email) || !challengeId || !code || newPassword.length < 6) return res.status(400).json({ success:false, error:'Valid email, challengeId, code and new password (>=6) required.' });
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge || v.challenge.purpose !== 'password_reset' || v.challenge.target !== email) return res.status(400).json({ success:false, error: v.error || 'Reset failed.' });
  const user = store.findUserByEmail(email);
  if (!user) return res.status(400).json({ success:false, error:'Reset failed.' });
  try {
    await store.mutate(async () => { store.setPasswordForUser(user.id, newPassword); store.addAudit(user.id, 'password_reset_success', undefined, req.ip); });
    // revoke sessions for safety
    const sessions: Map<string, string> = (store as any).sessions;
    for (const [tok, uid] of Array.from(sessions.entries())) { if (uid === user.id) sessions.delete(tok); }
    store.persist();
    res.json({ success:true, message:'Password reset. Please sign in again.' });
  } catch (e:any) {
    res.status(400).json({ success:false, error: e?.message || 'Reset failed.' });
  }
});

// Account security: list linked identities
app.get('/api/auth/security', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  res.json({ success:true, user: { id:user.id, email:user.email, phone:(user as any).phone, emailVerified:(user as any).emailVerified, phoneVerified:(user as any).phoneVerified, linkedIdentities: user.linkedIdentities || [] }, sms: smsStatus(), mail: mailStatus() });
});

app.post('/api/auth/password/change', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword.length < 6) return res.status(400).json({ success:false, error:'New password must be at least 6 characters.' });
  const acc = (store as any).accounts.get(user.id);
  if (!acc || !store.verifyPassword(currentPassword, acc)) { store.addAudit(user.id,'password_change_failed',undefined,req.ip); return res.status(401).json({ success:false, error:'Current password incorrect.' }); }
  await store.mutate(async () => { store.setPasswordForUser(user.id, newPassword); store.addAudit(user.id,'password_changed',undefined,req.ip); });
  res.json({ success:true });
});

app.post('/api/auth/bind/email/request', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return res.status(400).json({ success:false, error:'Valid email required.' });
  const owner = store.findUserByEmail(email);
  if (owner && owner.id !== user.id) return res.status(409).json({ success:false, error:'Email is already linked to another account.' });
  const { challenge, code } = createChallenge('bind_email', email, { ttlMs: 30*60*1000, maxAttempts: 5, userId: user.id });
  const mail = await sendMailOrBlock(email, 'EARTH ONE email binding', `Your EARTH ONE email binding code is ${code}. It expires in 30 minutes.`);
  if (!mail.ok) return res.status(503).json({ success:false, blocked:true, error: mail.error, provider: mail.provider });
  store.addAudit(user.id,'bind_email_requested',`email=${email}`,req.ip);
  res.json({ success:true, challengeId: challenge.id, expiresAt: challenge.expiresAt });
});

app.post('/api/auth/bind/email/confirm', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge || v.challenge.purpose !== 'bind_email' || v.challenge.target !== email || v.challenge.userId !== user.id) return res.status(400).json({ success:false, error: v.error || 'Verification failed.' });
  try {
    let updated: any;
    await store.mutate(async () => { updated = store.bindEmail(user.id, email); store.addAudit(user.id,'email_bound',`email=${email}`,req.ip); });
    res.json({ success:true, user: updated });
  } catch (e:any) { res.status(400).json({ success:false, error: e?.message || 'Bind failed' }); }
});

app.post('/api/auth/bind/phone/request', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const phone = normalizePhone(typeof req.body?.phone === 'string' ? req.body.phone : '');
  if (!isValidE164(phone)) return res.status(400).json({ success:false, error:'Valid E.164 phone required.' });
  const owner = store.findUserByPhone(phone);
  if (owner && owner.id !== user.id) return res.status(409).json({ success:false, error:'Phone number is already linked to another account.' });
  const provider = getSmsProvider();
  if (!provider.isConfigured()) return res.status(503).json({ success:false, blocked:true, error:'SMS service not configured. No code sent.' });
  const { challenge, code } = createChallenge('bind_phone', phone, { ttlMs: 10*60*1000, maxAttempts: 5, userId: user.id });
  const result = await provider.send(phone, `Your EARTH ONE phone binding code is ${code}. It expires in 10 minutes.`);
  if (!result.success) return res.status(502).json({ success:false, blocked: !!result.blocked, error: result.error || 'Failed to send SMS.' });
  store.addAudit(user.id,'bind_phone_requested',`phone=${phone}`,req.ip);
  res.json({ success:true, challengeId: challenge.id, expiresAt: challenge.expiresAt });
});

app.post('/api/auth/bind/phone/confirm', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const phone = normalizePhone(typeof req.body?.phone === 'string' ? req.body.phone : '');
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge || v.challenge.purpose !== 'bind_phone' || v.challenge.target !== phone || v.challenge.userId !== user.id) return res.status(400).json({ success:false, error: v.error || 'Verification failed.' });
  try {
    let updated: any;
    await store.mutate(async () => { updated = store.bindPhone(user.id, phone); store.addAudit(user.id,'phone_bound',`phone=${phone}`,req.ip); });
    res.json({ success:true, user: updated });
  } catch (e:any) { res.status(400).json({ success:false, error: e?.message || 'Bind failed' }); }
});

app.post('/api/auth/unlink', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : '';
  if (!provider) return res.status(400).json({ success:false, error:'provider required' });
  const identities = user.linkedIdentities || [];
  const hasPassword = !!(store as any).accounts.get(user.id);
  // count usable login methods: password-capable email login + verified phone + linked oauths
  const usable = identities.length + (hasPassword ? 1 : 0);
  if (usable <= 1) return res.status(400).json({ success:false, error:'Cannot unlink the last available login method.' });
  // require re-auth via password for safety when available
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  if (hasPassword) {
    const acc = (store as any).accounts.get(user.id);
    if (!currentPassword || !store.verifyPassword(currentPassword, acc)) return res.status(401).json({ success:false, error:'Current password required to unlink.' });
  }
  try {
    let updated: any;
    await store.mutate(async () => { updated = store.unlinkIdentity(user.id, provider); store.addAudit(user.id,'identity_unlinked',`provider=${provider}`,req.ip); });
    res.json({ success:true, user: updated });
  } catch (e:any) { res.status(400).json({ success:false, error: e?.message || 'Unlink failed' }); }
});



// Google OAuth 2.0 (official) - sign in / bind account
app.get('/api/auth/google/start', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = resolveAppUrl(req);
  if (!clientId) return res.status(501).json({ success: false, error: 'Google login not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const state = randomBytes(24).toString('hex');
  pruneOauthStates();
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `earth_oauth_state=${encodeURIComponent(state)}; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=600${isSecure ? '; Secure' : ''}`);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const appUrl = resolveAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const cookies = parseCookies(req);
  const cookieState = cookies.earth_oauth_state || '';
  const stateExp = oauthStates.get(state);
  const stateOk = !!state && !!cookieState && state === cookieState && !!stateExp && stateExp > Date.now();
  if (state) oauthStates.delete(state);
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `earth_oauth_state=; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`);
  if (!stateOk) {
    return res.redirect(`${appUrl}/?auth_error=google_state`);
  }
  if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${appUrl}/?auth_error=google_config`);
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      return res.redirect(`${appUrl}/?auth_error=google_token`);
    }
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const info: any = await infoRes.json();
    if (!infoRes.ok || !info.sub) {
      return res.redirect(`${appUrl}/?auth_error=google_profile`);
    }
    let r;
    try {
      r = await store.mutate(async () => store.createOrLoginOAuthUser({
        provider: 'google',
        providerUserId: String(info.sub),
        email: info.email,
        displayName: info.name || info.email,
        avatar: info.picture
      }));
    } catch (e: any) {
      if (String(e?.message || '') === 'UNBOUND_EXTERNAL_IDENTITY') {
        return res.redirect(`${appUrl}/?auth_error=google_unbound`);
      }
      throw e;
    }
    const payload = Buffer.from(JSON.stringify({ token: r.token, user: r.user })).toString('base64url');
    setSessionCookie(req, res, r.token);
    // pass via hash so SPA can pick it up without server-rendered template change
    return res.redirect(`${appUrl}/#auth=${payload}`);
  } catch (e) {
    console.error('Google OAuth callback error', e);
    return res.redirect(`${appUrl}/?auth_error=google_failed`);
  }
});

app.get('/api/auth/current', (req, res) => {
  const user = getSessionUser(req);
  res.json({ success: true, user: user ? (store.getSelfProfileView(user.id) || user) : null });
});

app.post('/api/auth/onboarding', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  try {
    const updated = store.completeOnboarding(user.id, req.body);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});



app.get('/api/dev/status', async (req, res) => {
  if (process.env.NODE_ENV !== 'development' || !isTrustedLocalRequest(req)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  const { execFile } = await import('node:child_process');
  const exec = (cmd: string, args: string[]) => new Promise<{ok:boolean,out:string}>(resolve => {
    execFile(cmd, args, { cwd: process.cwd(), timeout: 3000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout||'').trim() }));
  });
  const [branch, head, short, status, remote] = await Promise.all([
    exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    exec('git', ['rev-parse', 'HEAD']),
    exec('git', ['log', '-1', '--pretty=%h %s']),
    exec('git', ['status', '--short', '--branch']),
    exec('git', ['rev-parse', 'origin/main']),
  ]);
  const integrations = getChannelIntegrations(process.env);
  const wechat = integrations.find(i => i.id === 'wechat');
  const google = integrations.find(i => i.id === 'google');
  const sms = smsStatus();
  const mail = mailStatus();
  res.json({
    success: true,
    git: {
      branch: branch.ok ? branch.out : null,
      head: head.ok ? head.out : null,
      short: short.ok ? short.out : null,
      originMain: remote.ok ? remote.out : null,
      worktree: status.ok ? status.out : null,
      inSync: head.ok && remote.ok ? head.out === remote.out : null,
    },
    modules: {
      completed: [
        'Global Messenger（好友/私聊/群聊/实时消息）',
        '通知中心与通知设置（服务端过滤、桌面/声音/DND）',
        '个人资料系统（头像上传、资料同步）',
        '隐私与安全控制（服务端强制、搜索/资料/在线状态/已读回执/屏蔽/陌生人策略）',
        '多设备同步与离线补齐（消息/通知/隐私等）',
        '登录入口与开发者快速登录（开发环境）',
      ],
      inProgress: [
        '微信开放平台官方扫码登录（代码与配置检测已实现，待真实凭据与回调配置）',
      ],
      pending: [
        '短信验证码真实投递（需 SMS_PROVIDER 配置）',
        '邮件验证码/重置真实投递（需邮件服务配置）',
        '微信/Google 生产可用 OAuth 配置与真实绑定流程完善',
      ],
    },
    oauth: {
      wechat: { configured: !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET), status: wechat?.status, appUrl: process.env.APP_URL || null, appUrlIsPlaceholder: /MY_APP_URL/i.test(String(process.env.APP_URL || '')) },
      google: { configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), status: google?.status },
    },
    services: {
      sms: { configured: !!sms?.configured, provider: sms?.provider || null },
      mail: { configured: !!mail?.configured, provider: mail?.provider || null },
      server: { running: true, now: new Date().toISOString(), pid: process.pid, nodeEnv: process.env.NODE_ENV || 'development' },
    },
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    try {
      await store.mutate(async () => {
        store.sessions.delete(token);
        store.persist();
      });
    } catch {
      // best-effort: token removal should not block client logout
    }
  }
  clearSessionCookie(req, res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/update-profile', async (req, res) => {
  const authUser = getSessionUser(req);
  if (!authUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // whitelist safe editable fields; do not trust client for id/permissions/verification/online state
    const patch: any = {};
    for (const k of ['displayName','bio','username','avatar','location','interests','banner']) {
      if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
    }
    let updated: any;
    await store.mutate(async () => {
      updated = store.updateProfile(patch, authUser.id);
      store.persist();
    });
    try { broadcastProfileUpdated(authUser.id); } catch {}
    res.json({ success: true, user: store.getSelfProfileView(authUser.id) || updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/toggle-location', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  user.location.isPublic = !user.location.isPublic;
  store.saveToDisk();
  res.json({
    success: true,
    isPublic: user.location.isPublic,
    user
  });
});

app.get('/api/users', (req, res) => {
  const viewer = getSessionUser(req);
  const { query, country } = req.query;
  const q = query ? String(query).toLowerCase().trim() : '';
  let list = store.users.filter(u => {
    // respect account status/search/profile visibility (server-enforced)
    if (store.getAccountStatus(u) === 'deleted') return false;
    if (viewer && u.id === viewer.id) return false;
    const isFriend = viewer ? store.getFriendIds(viewer.id).includes(u.id) : false;
    const blockedEither = viewer ? store.isBlockedEither(viewer.id, u.id) : false;
    const priv = store.getPrivacySettings(u.id);
    if (!canViewProfileByPolicy(false, isFriend, blockedEither, priv)) return false;
    if (country && String(u.location?.countryCode || '').toLowerCase() !== String(country).toLowerCase()) return false;
    if (q) {
      const byField = canSearchByField(q, { id: u.id, username: u.username, displayName: u.displayName }, priv) || String((u as any).earthId || '').toLowerCase().includes(q);
      const labelMatch = String(u.location?.countryName || '').toLowerCase().includes(q) || String(u.location?.cityName || '').toLowerCase().includes(q);
      // location labels are part of public directory context when profile is visible; searchable-field toggles still govern identity fields
      if (!byField && !labelMatch) return false;
    }
    return true;
  });
  const users = list.map(u => {
    const view = viewer ? (store.getPublicProfileView(viewer.id, u.id) as any)?.user : null;
    return view || toPublicUser(u, { privacy: store.getPrivacySettings(u.id) });
  });
  res.json({ success: true, users });
});

app.get('/api/users/:id', (req, res) => {
  const viewer = getSessionUser(req);
  const target = store.users.find(u => u.id === req.params.id);
  if (!target || store.getAccountStatus(target) === 'deleted') {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const view = viewer ? (store.getPublicProfileView(viewer.id, target.id) as any) : null;
  if (viewer && view && view.restricted) {
    // do not leak existence details beyond minimal shell; respond as not found for non-visible profiles
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  if (!viewer) {
    const isVisible = canViewProfileByPolicy(false, false, false, store.getPrivacySettings(target.id));
    if (!isVisible) return res.status(404).json({ success: false, error: 'User not found' });
  }
  const user = view?.user || toPublicUser(target, { privacy: store.getPrivacySettings(target.id) });
  const userPosts = store.posts.filter(p => p.userId === req.params.id);
  res.json({ success: true, user, posts: userPosts });
});

app.post('/api/users/:id/follow', (req, res) => {
  const actor = getAuthUser(req);
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  user.followersCount += 1;
  if (actor) actor.followingCount += 1;
  store.saveToDisk();
  res.json({ success: true, followersCount: user.followersCount });
});

// -------------------------------------------------------------
// 1c. MESSENGER ATTACHMENTS (authenticated, permission-checked)
// -------------------------------------------------------------
const UPLOAD_DIR = path.resolve(process.env.EARTH_ONE_UPLOADS_DIR || path.join(process.env.EARTH_ONE_DATA_DIR ? path.resolve(process.env.EARTH_ONE_DATA_DIR) : path.join(process.cwd(), 'server_data'), 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ATT_ID_RE = /^att_[a-zA-Z0-9_-]{6,80}$/;

const ALLOWED_ATTACHMENT_TYPES = new Map<string, { kind: 'image' | 'file' | 'audio'; exts: string[] }>([
  ['image/png', { kind: 'image', exts: ['.png'] }],
  ['image/jpeg', { kind: 'image', exts: ['.jpg', '.jpeg'] }],
  ['image/gif', { kind: 'image', exts: ['.gif'] }],
  ['image/webp', { kind: 'image', exts: ['.webp'] }],
  ['audio/webm', { kind: 'audio', exts: ['.webm'] }],
  ['audio/ogg', { kind: 'audio', exts: ['.ogg', '.oga'] }],
  ['audio/mp4', { kind: 'audio', exts: ['.m4a', '.mp4'] }],
  ['audio/mpeg', { kind: 'audio', exts: ['.mp3'] }],
  ['audio/wav', { kind: 'audio', exts: ['.wav'] }],
  ['application/pdf', { kind: 'file', exts: ['.pdf'] }],
  ['text/plain', { kind: 'file', exts: ['.txt'] }],
  ['application/zip', { kind: 'file', exts: ['.zip'] }],
  ['application/msword', { kind: 'file', exts: ['.doc'] }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { kind: 'file', exts: ['.docx'] }],
]);
const BLOCKED_EXTS = new Set(['.html', '.htm', '.svg', '.xml', '.js', '.mjs', '.cjs', '.sh', '.bat', '.cmd', '.ps1', '.exe', '.msi', '.apk', '.php', '.jsp', '.asp', '.aspx']);

function safeFileName(name: string) {
  const base = String(name || 'file').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  return (base.slice(0, 120) || 'file');
}

function extOf(name: string) {
  const m = /\.([a-zA-Z0-9]{1,10})$/.exec(String(name || '').trim());
  return m ? `.${m[1].toLowerCase()}` : '';
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.slice(0, 6).toString('ascii') === 'GIF87a') return 'image/gif';
  if (buf.length >= 6 && buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'audio/webm';
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  if (buf.length >= 3 && (buf.slice(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip'; // zip/docx containers share signature
  return null;
}

function resolveAllowedAttachment(name: string, claimedMime: string, buf: Buffer): { ok: true; mimeType: string; kind: 'image' | 'file' | 'audio' } | { ok: false; error: string } {
  const safeName = safeFileName(name);
  const ext = extOf(safeName);
  if (ext && BLOCKED_EXTS.has(ext)) return { ok: false, error: 'File type not allowed' };
  let mime = String(claimedMime || '').toLowerCase().split(';')[0].trim();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (mime === 'video/webm' && ext === '.webm') mime = 'audio/webm';
  const sniff = sniffMime(buf);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && sniff === 'application/zip') {
    // docx is a zip container; allow only with correct extension
  } else if (sniff === 'application/zip' && mime === 'application/zip') {
    // ok
  } else if (sniff && sniff !== 'application/zip') {
    mime = sniff; // trust server-detected type for common binary formats
  }
  if (mime === 'application/zip' && ext === '.docx') mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const rule = ALLOWED_ATTACHMENT_TYPES.get(mime);
  if (!rule) return { ok: false, error: 'File type not allowed' };
  if (rule.exts.length && ext && !rule.exts.includes(ext)) {
    // for sniffed binary types prefer detected mime; otherwise reject mismatch
    if (!sniff) return { ok: false, error: 'File type not allowed' };
  }
  if (mime === 'text/plain') {
    // reject obvious binary/HTML script content masquerading as text
    const head = buf.slice(0, 512).toString('utf8').toLowerCase();
    if (head.includes('<script') || head.includes('<html') || head.includes('javascript:')) return { ok: false, error: 'File type not allowed' };
  }
  return { ok: true, mimeType: mime, kind: rule.kind };
}

function findAttachmentMeta(id: string): { owner: string; metaPath: string; meta: any } | null {
  if (!ATT_ID_RE.test(id)) return null;
  try {
    const owners = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    for (const owner of owners) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(owner)) continue;
      const metaPath = path.join(UPLOAD_DIR, owner, `${id}.json`);
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      return { owner, metaPath, meta };
    }
  } catch {}
  return null;
}

function canReadAttachmentMeta(userId: string, meta: any): boolean {
  const convId = meta?.conversationId;
  if (convId) {
    const conv = store.conversations.find(c => c.id === convId);
    return !!(conv && store.canAccessConversation(userId, conv));
  }
  return meta?.ownerId === userId;
}

function persistAttachment(user: any, name: string, mimeType: string, buf: Buffer, conversationId?: string) {
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const checked = resolveAllowedAttachment(name, mimeType, buf);
  if (!checked.ok) return { ok: false as const, error: checked.error };
  const safeName = safeFileName(name);
  const dir = path.join(UPLOAD_DIR, user.id);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${id}_${safeName}`;
  const filePath = path.join(dir, fileName);
  const metaPath = path.join(dir, `${id}.json`);
  try {
    fs.writeFileSync(filePath, buf);
  } catch (e: any) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    return { ok: false as const, error: e?.message || 'Upload failed' };
  }
  const attachment = {
    id,
    type: checked.kind,
    name: safeName,
    url: `/api/messenger/files/${id}`,
    size: buf.length,
    mimeType: checked.mimeType,
  };
  try {
    fs.writeFileSync(metaPath, JSON.stringify({ ...attachment, ownerId: user.id, path: filePath, conversationId: conversationId || null, createdAt: new Date().toISOString() }, null, 2));
  } catch (e: any) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath); } catch {}
    return { ok: false as const, error: e?.message || 'Upload failed' };
  }
  return { ok: true as const, attachment };
}

app.post('/api/messenger/upload', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { name, mimeType, dataBase64, conversationId } = req.body || {};
  if (typeof name !== 'string' || typeof mimeType !== 'string' || typeof dataBase64 !== 'string') {
    return res.status(400).json({ success: false, error: 'name, mimeType, dataBase64 are required' });
  }
  if (conversationId) {
    const conv = store.conversations.find(c => c.id === conversationId);
    if (!conv || !store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  let buf: Buffer;
  try { buf = Buffer.from(dataBase64, 'base64'); } catch { return res.status(400).json({ success: false, error: 'Invalid file data' }); }
  if (!buf.length || buf.length > MAX_UPLOAD_BYTES) return res.status(400).json({ success: false, error: 'File too large (max 10MB)' });
  const saved = persistAttachment(user, name, mimeType, buf, typeof conversationId === 'string' ? conversationId : undefined);
  if (!saved.ok) return res.status(400).json({ success: false, error: saved.error });
  res.json({ success: true, attachment: saved.attachment });
});

app.post('/api/messenger/upload/stream', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const name = typeof req.headers['x-file-name'] === 'string' ? decodeURIComponent(req.headers['x-file-name']) : '';
  const mimeType = typeof req.headers['x-mime-type'] === 'string' ? decodeURIComponent(req.headers['x-mime-type']) : '';
  const conversationId = typeof req.headers['x-conversation-id'] === 'string' ? decodeURIComponent(req.headers['x-conversation-id']) : '';
  if (!name || !mimeType) return res.status(400).json({ success: false, error: 'x-file-name and x-mime-type headers are required' });
  if (conversationId) {
    const conv = store.conversations.find(c => c.id === conversationId);
    if (!conv || !store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const safeName = safeFileName(name);
  const dir = path.join(UPLOAD_DIR, user.id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}_${safeName}`);
  const metaPath = path.join(dir, `${id}.json`);
  const ws = fs.createWriteStream(filePath);
  let size = 0;
  let aborted = false;
  const cleanup = () => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath); } catch {} };
  req.on('aborted', () => { aborted = true; ws.destroy(); cleanup(); });
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      aborted = true;
      ws.destroy();
      cleanup();
      if (!res.headersSent) res.status(400).json({ success: false, error: 'File too large (max 10MB)' });
      req.destroy();
    }
  });
  ws.on('error', () => {
    if (aborted) return;
    aborted = true;
    cleanup();
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Upload failed' });
  });
  ws.on('finish', () => {
    if (aborted) return;
    try {
      const fd = fs.openSync(filePath, 'r');
      const head = Buffer.alloc(512);
      const n = fs.readSync(fd, head, 0, 512, 0);
      fs.closeSync(fd);
      const checked = resolveAllowedAttachment(safeName, mimeType, head.slice(0, n));
      if (!checked.ok || !size) {
        cleanup();
        return res.status(400).json({ success: false, error: checked.ok ? 'Empty file' : checked.error });
      }
      const attachment = { id, type: checked.kind, name: safeName, url: `/api/messenger/files/${id}`, size, mimeType: checked.mimeType };
      fs.writeFileSync(metaPath, JSON.stringify({ ...attachment, ownerId: user.id, path: filePath, conversationId: conversationId || null, createdAt: new Date().toISOString() }, null, 2));
      return res.json({ success: true, attachment });
    } catch (e: any) {
      cleanup();
      return res.status(500).json({ success: false, error: e?.message || 'Upload failed' });
    }
  });
  req.pipe(ws);
});

app.get('/api/messenger/files/:id', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  if (!ATT_ID_RE.test(id)) return res.status(400).json({ success: false, error: 'Invalid file id' });
  try {
    const found = findAttachmentMeta(id);
    if (!found) return res.status(404).json({ success: false, error: 'File not found' });
    const { meta, owner } = found;
    if (!canReadAttachmentMeta(user.id, meta)) return res.status(403).json({ success: false, error: 'Forbidden' });
    const resolved = path.resolve(String(meta.path || ''));
    const ownerDir = path.resolve(UPLOAD_DIR, owner);
    if (!resolved.startsWith(ownerDir + path.sep)) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ success: false, error: 'File not found' });
    const wantDownload = req.query.download === '1' || req.query.download === 'true';
    const mime = typeof meta.mimeType === 'string' ? meta.mimeType : 'application/octet-stream';
    const inline = !wantDownload && (meta.type === 'image' || meta.type === 'audio' || mime.startsWith('audio/') || mime === 'application/pdf' || mime === 'text/plain');
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    const fname = encodeURIComponent(String(meta.name || 'file'));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${fname}`);
    return fs.createReadStream(resolved).pipe(res);
  } catch {}
  return res.status(404).json({ success: false, error: 'File not found' });
});



app.post('/api/conversations/:id/rename', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
  const avatar = typeof req.body?.avatar === 'string' ? req.body.avatar : undefined;
  try {
    let conv:any; await store.mutate(async () => { conv = store.renameGroup(user.id, req.params.id, name, avatar); store.addAudit(user.id,'group_updated',req.params.id,req.ip); });
    wsBroadcastConversationEvent(req.params.id, { type:'conversation_updated', conversation: conv });
    res.json({ success:true, conversation: conv });
  } catch(e:any){ const m=e?.message||'Failed'; res.status(m==='Forbidden'?403:400).json({ success:false, error:m }); }
});

app.post('/api/conversations/:id/admins', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const adminIds = Array.isArray(req.body?.adminIds) ? req.body.adminIds.filter((x:any)=>typeof x==='string') : [];
  try {
    let conv:any;
    await store.mutate(async () => {
      conv = store.setGroupAdmins(user.id, req.params.id, adminIds);
      store.addAudit(user.id,'group_admins_updated',req.params.id,req.ip);
      if (conv) {
        for (const uid of (conv.participantIds||[])) {
          if (uid === user.id) continue;
          emitNotification(uid, { type: 'group_admin_changed', title: 'Group admin updated', body: `${user.displayName} updated admin roles in "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        store.persist();
      }
    });
    wsBroadcastConversationEvent(req.params.id, { type:'conversation_updated', conversation: conv });
    res.json({ success:true, conversation: conv });
  } catch(e:any){ const m=e?.message||'Failed'; res.status(m==='Forbidden'?403:400).json({ success:false, error:m }); }
});

app.post('/api/auth/email/change/request', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const newEmail = typeof req.body?.newEmail === 'string' ? req.body.newEmail.trim().toLowerCase() : '';
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  if (!isValidEmail(newEmail)) return res.status(400).json({ success:false, error:'Valid new email required.' });
  const acc = (store as any).accounts.get(user.id);
  if (!acc || !store.verifyPassword(currentPassword, acc)) return res.status(401).json({ success:false, error:'Current password required to change email.' });
  const owner = store.findUserByEmail(newEmail);
  if (owner && owner.id !== user.id) return res.status(409).json({ success:false, error:'Email already linked to another account.' });
  const { challenge, code } = createChallenge('bind_email', newEmail, { ttlMs: 30*60*1000, maxAttempts: 5, userId: user.id, meta:{ action:'change_email' } });
  const mail = await sendMailOrBlock(newEmail, 'EARTH ONE email change verification', `Your EARTH ONE email change code is ${code}. It expires in 30 minutes.`);
  if (!mail.ok) return res.status(503).json({ success:false, blocked:true, error: mail.error, provider: mail.provider });
  store.addAudit(user.id,'email_change_requested',`to=${newEmail}`,req.ip);
  res.json({ success:true, challengeId: challenge.id, expiresAt: challenge.expiresAt });
});

app.post('/api/auth/email/change/confirm', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const newEmail = typeof req.body?.newEmail === 'string' ? req.body.newEmail.trim().toLowerCase() : '';
  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const v = verifyChallenge(challengeId, code);
  if (!v.ok || !v.challenge || v.challenge.purpose !== 'bind_email' || v.challenge.target !== newEmail || v.challenge.userId !== user.id) return res.status(400).json({ success:false, error: v.error || 'Verification failed.' });
  try {
    let updated:any; await store.mutate(async () => { updated = store.bindEmail(user.id, newEmail); store.addAudit(user.id,'email_changed',`to=${newEmail}`,req.ip); });
    res.json({ success:true, user: updated });
  } catch (e:any) { res.status(400).json({ success:false, error: e?.message || 'Change failed' }); }
});


function publicCallForUser(call: any, userId: string) {
  if (!call) return null;
  const users = (call.participantIds || []).map((id: string) => {
    const u = store.users.find((x: any) => x.id === id);
    if (!u) return { id, displayName: id, username: id, avatar: '', isOnline: false };
    const pres = typeof (store as any).getMaskedPresenceForViewer === 'function'
      ? (store as any).getMaskedPresenceForViewer(id, userId)
      : { isOnline: !!(u as any).isOnline };
    return {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      avatar: u.avatar,
      isOnline: !!pres?.isOnline,
    };
  });
  const p = call.participants?.[userId] || null;
  const startedMs = call.startedAt ? new Date(call.startedAt).getTime() : 0;
  const endedMs = call.endedAt ? new Date(call.endedAt).getTime() : 0;
  const durationSec = startedMs && endedMs && endedMs > startedMs ? Math.round((endedMs - startedMs) / 1000) : 0;
  const direction = call.initiatorId === userId ? 'outgoing' : 'incoming';
  const unreadMissed =
    call.status === 'missed' &&
    call.initiatorId !== userId &&
    !(Array.isArray(call.missedSeenBy) && call.missedSeenBy.includes(userId));
  return {
    id: call.id,
    roomName: call.roomName,
    scope: call.scope,
    kind: call.kind,
    direction,
    durationSec,
    unreadMissed,
    conversationId: call.conversationId || null,
    initiatorId: call.initiatorId,
    participantIds: call.participantIds || [],
    participants: call.participants || {},
    users,
    status: call.status,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
    startedAt: call.startedAt || null,
    endedAt: call.endedAt || null,
    endedBy: call.endedBy || null,
    endReason: call.endReason || null,
    mediaProvider: call.mediaProvider || 'none',
    capabilities: call.capabilities || {},
    self: p,
  };
}

function emitCallEvent(call: any, event: string, extra?: any) {
  const payloadBase = { type: event, callId: call.id, at: new Date().toISOString(), ...(extra || {}) };
  for (const uid of (call.participantIds || [])) {
    try { wsBroadcastToUser(uid, { ...payloadBase, call: publicCallForUser(call, uid) }); } catch {}
  }
}

function emitCallInviteDelivery(call: any, initiator: any) {
  const title = call.scope === 'group' ? 'Incoming group call' : 'Incoming call';
  const body = call.kind === 'video' ? `${initiator.displayName} invited you to a video call.` : `${initiator.displayName} invited you to an audio call.`;
  for (const uid of (call.participantIds || [])) {
    if (uid === initiator.id) continue;
    try { emitNotification(uid, { type: 'call_invite', title, body, actorId: initiator.id, actorName: initiator.displayName, actorAvatar: initiator.avatar, conversationId: call.conversationId, data: { callId: call.id, kind: call.kind, scope: call.scope, roomName: call.roomName } }); } catch {}
  }
}

function emitMissedCallsEffects(missedCalls: any[]) {
  if (!Array.isArray(missedCalls) || missedCalls.length === 0) return false;
  let dirty = false;
  for (const call of missedCalls) {
    if (!call || call.missedNotifiedAt) continue;
    call.missedNotifiedAt = new Date().toISOString();
    dirty = true;
    clearCallSignals(call.id);
    const initiator = store.users.find((u: any) => u.id === call.initiatorId);
    const title = call.kind === 'video' ? 'Missed video call' : 'Missed audio call';
    const body = `${initiator?.displayName || 'User'} called you.`;
    for (const uid of (call.participantIds || [])) {
      if (uid === call.initiatorId) continue;
      try {
        emitNotification(uid, {
          type: 'call_missed',
          title,
          body,
          actorId: call.initiatorId,
          actorName: initiator?.displayName || call.initiatorId,
          actorAvatar: initiator?.avatar || '',
          conversationId: call.conversationId,
          data: { callId: call.id, kind: call.kind, scope: call.scope },
        });
      } catch {}
    }
    try { emitCallEvent(call, 'call_missed', { reason: call.endReason || 'timeout' }); } catch {}
  }
  return dirty;
}

function runCallSweep() {
  const { changed, newlyMissed } = cleanupStaleCallsDetailed(store.calls || []);
  const notified = emitMissedCallsEffects(newlyMissed);
  if (changed || notified) {
    try { store.persist(); } catch {}
  }
}



// -------------------------------------------------------------
// 1b. MESSENGER: USERS, FRIENDS, BLOCKS (auth required where sensitive)
// -------------------------------------------------------------

function emitNotification(userId: string, input: any, opts?: { dndActive?: boolean; localMinutes?: number | null }) {
  let created: any = null;
  const prefs = store.getNotificationPrefs(userId);
  const decision = decideNotification(prefs, String(input?.type || ''), opts);
  // must be called inside store.mutate or we persist separately; caller controls
  created = store.createNotification({ userId, ...input });
  if (created && decision.pushRealtime) {
    try {
      wsBroadcastToUser(userId, {
        type: 'notification',
        notification: created,
        unreadCount: store.getUnreadNotificationCount(userId),
        alert: { desktop: decision.alertDesktop, sound: decision.alertSound, dndActive: decision.dndActive, categoryEnabled: decision.categoryEnabled },
      });
    } catch {}
  }
  return created ? { notification: created, decision } : null;
}

function emitNotifications(userIds: string[], input: any, opts?: { dndActive?: boolean; localMinutes?: number | null }) {
  const out: any[] = [];
  for (const uid of new Set(userIds.filter(Boolean))) {
    const r = emitNotification(uid, input, opts);
    if (r) out.push(r);
  }
  return out;
}

app.get('/api/notifications', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const data = store.getNotificationsForUser(user.id, { limit, before });
  res.json({ success: true, ...data });
});

app.get('/api/notifications/unread-count', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  res.json({ success: true, unreadCount: store.getUnreadNotificationCount(user.id) });
});

app.post('/api/notifications/:id/read', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  let n: any = null;
  await store.mutate(async () => { n = store.markNotificationRead(user.id, req.params.id); if (n) store.persist(); });
  if (!n) return res.status(404).json({ success: false, error: 'Notification not found' });
  try { wsBroadcastToUser(user.id, { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(user.id), readId: req.params.id, readAt: n.readAt }); } catch {}
  res.json({ success: true, notification: n, unreadCount: store.getUnreadNotificationCount(user.id) });
});

app.post('/api/notifications/read-all', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  let count = 0;
  await store.mutate(async () => { count = store.markAllNotificationsRead(user.id); if (count) store.persist(); });
  try { wsBroadcastToUser(user.id, { type: 'notification_sync', unreadCount: 0, readAll: true }); } catch {}
  res.json({ success: true, marked: count, unreadCount: store.getUnreadNotificationCount(user.id) });
});

app.delete('/api/notifications/:id', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  let ok = false;
  await store.mutate(async () => { ok = store.deleteNotification(user.id, req.params.id); if (ok) store.persist(); });
  if (!ok) return res.status(404).json({ success: false, error: 'Notification not found' });
  try { wsBroadcastToUser(user.id, { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(user.id), deletedId: req.params.id }); } catch {}
  res.json({ success: true, unreadCount: store.getUnreadNotificationCount(user.id) });
});

app.get('/api/notifications/preferences', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  res.json({ success: true, preferences: store.getNotificationPrefs(user.id) });
});

app.put('/api/notifications/preferences', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  let prefs: any;
  await store.mutate(async () => { prefs = store.setNotificationPrefs(user.id, req.body || {}); store.persist(); });
  try { wsBroadcastToUser(user.id, { type: 'notification_prefs_sync', preferences: prefs, updatedAt: new Date().toISOString() }); } catch {}
  res.json({ success: true, preferences: prefs });
});

app.get('/api/messenger/privacy', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const privacy = store.getPrivacySettings(user.id);
  res.json({ success: true, privacy });
});

app.put('/api/messenger/privacy', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  let privacy: any;
  await store.mutate(async () => { privacy = store.setPrivacySettings(user.id, req.body || {}); store.persist(); });
  try { wsBroadcastToUser(user.id, { type: 'privacy_sync', privacy, updatedAt: new Date().toISOString() }); } catch {}
  try { broadcastToUsers([user.id], { type: 'privacy_sync', privacy, updatedAt: new Date().toISOString() }); } catch {}
  res.json({ success: true, privacy });
});

app.get('/api/messenger/users/search', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const wantSuggested = req.query.suggested === '1' && !q.trim();
  let list = store.searchUsers(q, user.id, 60);
  if (wantSuggested) {
    const blocked = (store.blockedBy[user.id] || []);
    list = store.users.filter(u => {
      if (u.id === user.id) return false;
      if (blocked.includes(u.id) || (store.blockedBy[u.id] || []).includes(user.id)) return false;
      if (store.getAccountStatus(u) === 'deleted') return false;
      const priv = store.getPrivacySettings(u.id);
      if (!priv.searchableByUsername && !priv.searchableById && !priv.searchableByDisplayName) return false;
      const isFriend = store.getFriendIds(user.id).includes(u.id);
      return canViewProfileByPolicy(false, isFriend, false, priv);
    });
    // Put real newly registered users & online users first so site members find each other immediately
    list.sort((a, b) => {
      const aReg = !a.id.startsWith('u_') ? 1 : 0;
      const bReg = !b.id.startsWith('u_') ? 1 : 0;
      if (aReg !== bReg) return bReg - aReg;
      return (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
    });
    list = list.slice(0, 60);
  }
  const users = list.map(u => {
    const view = (store.getPublicProfileView(user.id, u.id) as any)?.user;
    const base = view || toPublicUser(u, { privacy: store.getPrivacySettings(u.id) });
    return { ...base, earthId: (u as any).earthId };
  });
  res.json({ success: true, users });
});

app.get('/api/messenger/friends', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const ids = store.getFriendIds(user.id);
  const friends = ids.map(id => {
    const u = store.users.find(x=>x.id===id);
    if (!u || store.getAccountStatus(u) === 'deleted') return null;
    const view = (store.getPublicProfileView(user.id, id) as any);
    if (!view || view.restricted) return null; // blocked/unviewable
    return { ...view.user, earthId: (u as any).earthId };
  }).filter(Boolean);
  res.json({ success: true, friends });
});

app.get('/api/messenger/friend-requests', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const safeMini = (otherId: string) => {
    const u = store.users.find(x => x.id === otherId);
    if (!u || store.getAccountStatus(u) === 'deleted') return null;
    const v = (store.getPublicProfileView(user.id, otherId) as any);
    const base = (v && !v.restricted && v.user) ? v.user : null;
    const pres = (store as any).getMaskedPresenceForViewer ? (store as any).getMaskedPresenceForViewer(user.id, otherId) : { isOnline: false, lastActiveAt: undefined };
    return {
      id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar,
      isOnline: base ? !!base.isOnline : !!pres.isOnline,
      lastActiveAt: base ? base.lastActiveAt : pres.lastActiveAt,
      verified: !!u.verified,
      earthId: (u as any).earthId,
    };
  };
  const incoming = store.friendRequests.filter(r => r.toUserId === user.id && r.status === 'pending').map(r => ({ ...r, fromUser: safeMini(r.fromUserId) }));
  const outgoing = store.friendRequests.filter(r => r.fromUserId === user.id && r.status === 'pending').map(r => ({ ...r, toUser: safeMini(r.toUserId) }));
  res.json({ success: true, incoming, outgoing });
});

app.post('/api/messenger/friend-requests', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const toUserId = typeof req.body?.toUserId === 'string' ? req.body.toUserId : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.slice(0,300) : undefined;
  try {
    let fr: any; let ntf: any = null; let directConv: any = null;
    await store.mutate(async () => {
      fr = store.sendFriendRequest(user.id, toUserId, message);
      if (fr?.status === 'accepted') {
        const fromUser = store.users.find(u => u.id === fr.fromUserId);
        directConv = store.getOrCreateDirectConversation(fr.fromUserId, fr.toUserId);
        ntf = { type: 'accepted_pair', targetId: fr.toUserId, fromUser };
      } else if (fr?.status === 'pending' && fr.toUserId === toUserId) {
        ntf = emitNotification(toUserId, { type: 'friend_request', title: 'New friend request', body: `${user.displayName} sent you a friend request.`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, requestId: fr.id, targetUserId: user.id });
      }
      store.persist();
    });
    if (ntf && ntf.notification && ntf.notification.type === 'friend_request') {
      wsBroadcastToUser(toUserId, { type: 'friend_request', request: { ...fr, fromUser: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar } } });
    } else if (ntf && ntf.type === 'accepted_pair') {
      wsBroadcastToUser(fr.fromUserId, { type: 'friend_request_updated', request: fr });
      wsBroadcastToUser(fr.toUserId, { type: 'friend_request_updated', request: fr });
      if (directConv) {
        wsBroadcastToUser(fr.fromUserId, { type: 'conversation_updated', conversationId: directConv.id });
        wsBroadcastToUser(fr.toUserId, { type: 'conversation_updated', conversationId: directConv.id });
      }
      await store.mutate(async () => {
        emitNotification(fr.fromUserId, { type: 'friend_accepted', title: 'Friend request accepted', body: `${user.displayName} accepted your friend request.`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, requestId: fr.id, targetUserId: user.id });
        emitNotification(fr.toUserId, { type: 'friend_accepted', title: 'You are now friends', body: `You and ${ntf.fromUser?.displayName || 'user'} are now friends.`, actorId: fr.fromUserId, actorName: ntf.fromUser?.displayName, actorAvatar: ntf.fromUser?.avatar, requestId: fr.id, targetUserId: fr.fromUserId });
        store.persist();
      });
    } else {
      wsBroadcastToUser(toUserId, { type: 'friend_request', request: { ...fr, fromUser: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar } } });
    }
    res.json({ success: true, request: fr, conversationId: directConv?.id });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to send friend request' });
  }
});

app.post('/api/messenger/friend-requests/:id/respond', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const accept = !!req.body?.accept;
  try {
    let fr: any; let directConv: any = null;
    await store.mutate(async () => {
      fr = store.respondFriendRequest(req.params.id, user.id, accept);
      if (accept && fr?.status === 'accepted') {
        directConv = store.getOrCreateDirectConversation(fr.fromUserId, fr.toUserId);
        emitNotification(fr.fromUserId, { type: 'friend_accepted', title: 'Friend request accepted', body: `${user.displayName} accepted your friend request.`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, requestId: fr.id, targetUserId: user.id });
        store.persist();
      } else {
        store.persist();
      }
    });
    const otherId = fr.fromUserId === user.id ? fr.toUserId : fr.fromUserId;
    wsBroadcastToUser(otherId, { type: 'friend_request_updated', request: fr });
    wsBroadcastToUser(user.id, { type: 'friend_request_updated', request: fr });
    if (directConv) {
      wsBroadcastToUser(otherId, { type: 'conversation_updated', conversationId: directConv.id });
      wsBroadcastToUser(user.id, { type: 'conversation_updated', conversationId: directConv.id });
    }
    res.json({ success: true, request: fr, conversationId: directConv?.id });
  } catch (e:any) {
    const m = e?.message || 'Failed';
    res.status(m==='Forbidden'?403:m==='Friend request not found'?404:400).json({ success:false, error:m });
  }
});

app.delete('/api/messenger/friends/:id', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const otherId = req.params.id;
  await store.mutate(async () => { store.removeFriend(user.id, otherId); });
  res.json({ success: true });
});

app.post('/api/messenger/block', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  if (!targetUserId) return res.status(400).json({ success: false, error: 'userId required' });
  await store.mutate(async () => { store.blockUser(user.id, targetUserId); store.persist(); });
  try { wsBroadcastToUser(user.id, { type: 'blocklist_sync', blocked: (store.blockedBy[user.id]||[]) }); } catch {}
  res.json({ success: true, blocked: (store.blockedBy[user.id]||[]) });
});

app.post('/api/messenger/unblock', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  await store.mutate(async () => { store.unblockUser(user.id, targetUserId); store.persist(); });
  try { wsBroadcastToUser(user.id, { type: 'blocklist_sync', blocked: (store.blockedBy[user.id]||[]) }); } catch {}
  res.json({ success: true, blocked: (store.blockedBy[user.id]||[]) });
});

app.get('/api/messenger/blocked', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const ids = store.blockedBy[user.id] || [];
  const users = ids.map(id => store.users.find(u=>u.id===id)).filter(Boolean).map((u:any)=>({ id:u.id, username:u.username, displayName:u.displayName, avatar:u.avatar, isOnline:false, lastActiveAt: undefined }));
  res.json({ success: true, blocked: users });
});

app.get('/api/messenger/recent', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const convs = store.getConversationsForUser(user.id).filter(c => c.type === 'direct' || c.type === 'group').slice(0, 30);
  res.json({ success: true, conversations: convs });
});

app.get('/api/messenger/sync', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
  const sinceTs = typeof req.query.sinceTs === 'string' ? new Date(req.query.sinceTs).getTime() : (sinceRaw ? new Date(sinceRaw).getTime() : 0);
  const sinceId = typeof req.query.sinceId === 'string' ? req.query.sinceId : '';
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const convs = store.getConversationsForUser(user.id);
  const convIds = new Set(convs.map(c=>c.id));
  const all = store.messages
    .filter(m => convIds.has(m.conversationId) && !(m.deletedFor||[]).includes(user.id))
    .sort((a,b)=> {
      const ta = new Date(a.createdAt||0).getTime(), tb = new Date(b.createdAt||0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
  const filtered = all.filter(m => {
    const t = new Date(m.createdAt||0).getTime();
    if (t > sinceTs) return true;
    if (t === sinceTs && sinceId) return String(m.id).localeCompare(sinceId) > 0;
    return false;
  });
  const messages = filtered.slice(0, limit);
  const last = messages[messages.length - 1] || null;
  res.json({
    success: true,
    conversations: convs,
    messages,
    hasMore: filtered.length > messages.length,
    cursor: last ? { since: last.createdAt, sinceTs: last.createdAt, sinceId: last.id } : (sinceRaw || sinceTs ? { since: sinceRaw || new Date(sinceTs).toISOString(), sinceTs: sinceRaw || new Date(sinceTs).toISOString(), sinceId } : null),
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/messenger/profile/me', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const view = store.getSelfProfileView(user.id);
  if (!view) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user: view });
});

app.get('/api/messenger/username/check', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const raw = typeof req.query.username === 'string' ? req.query.username : '';
  const v = store.validateUsername(raw);
  if (!v.ok) return res.json({ success: true, valid: false, available: false, error: v.error });
  const taken = store.isUsernameTaken(v.username, user.id);
  res.json({ success: true, valid: true, available: !taken, username: v.username, error: taken ? 'Username is already taken.' : undefined });
});


app.get('/api/messenger/profile/:id', (req, res) => {
  const viewer = requireSessionUser(req, res);
  if (!viewer) return;
  const view = store.getPublicProfileView(viewer.id, req.params.id) as any;
  if (!view) return res.status(404).json({ success: false, error: 'User not found' });
  if (view.isSelf) {
    return res.json({ success: true, user: view.user || view, isSelf: true, isFriend: false, blocked: false, pendingRequest: null });
  }
  return res.json({ success: true, user: view.user, isSelf: false, isFriend: !!view.isFriend, blocked: !!view.blocked, pendingRequest: view.pendingRequest || null, restricted: !!view.restricted });
});


function sanitizeSelfUser(u: any) {
  // ensure sensitive account internals not leaked beyond self view contract
  return store.getSelfProfileView(u.id) || u;
}

function broadcastProfileUpdated(userId: string) {
  const recipients = store.getProfileUpdateRecipients(userId);
  const selfView = store.getSelfProfileView(userId);
  const pubSelf = store.getPublicProfileView(userId, userId) as any;
  const fallbackPublic = pubSelf?.user || { id: selfView?.id, username: selfView?.username, displayName: selfView?.displayName, avatar: selfView?.avatar, bio: selfView?.bio, isOnline: selfView?.isOnline, lastActiveAt: selfView?.lastActiveAt, joinedAt: selfView?.joinedAt, verified: selfView?.verified };
  for (const uid of recipients) {
    if (uid === userId) {
      try { broadcastToUsers([uid], { type: 'profile_updated', userId, user: selfView }); } catch {}
      continue;
    }
    const view = store.getPublicProfileView(uid, userId) as any;
    const payload = view?.user || fallbackPublic;
    // Per-recipient masking (privacy/blocked) enforced by store view
    try { broadcastToUsers([uid], { type: 'profile_updated', userId, user: payload }); } catch {}
  }
  try { wsBroadcastToUser(userId, { type: 'profile_sync', user: selfView }); } catch {}
}

app.post('/api/messenger/profile/update', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  // Only allow safe editable fields
  const patch: any = {};
  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) patch.displayName = body.displayName;
  if (Object.prototype.hasOwnProperty.call(body, 'bio')) patch.bio = body.bio;
  if (Object.prototype.hasOwnProperty.call(body, 'username')) patch.username = body.username;
  try {
    let updated: any;
    await store.mutate(async () => {
      updated = store.updateProfile(patch, user.id);
      store.addAudit(user.id, 'profile_updated', JSON.stringify({ fields: Object.keys(patch) }), req.ip);
      store.persist();
    });
    broadcastProfileUpdated(user.id);
    res.json({ success: true, user: store.getSelfProfileView(user.id), conversations: store.getConversationsForUser(user.id) });
  } catch (e: any) {
    const msg = e?.message || 'Failed to update profile';
    const code = /taken/i.test(msg) ? 409 : 400;
    res.status(code).json({ success: false, error: msg });
  }
});

// Avatar upload (image only, reuse upload security primitives)
app.post('/api/messenger/profile/avatar', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { name, mimeType, dataBase64 } = req.body || {};
  if (typeof name !== 'string' || typeof mimeType !== 'string' || typeof dataBase64 !== 'string') {
    return res.status(400).json({ success: false, error: 'name, mimeType, dataBase64 are required' });
  }
  let buf: Buffer;
  try { buf = Buffer.from(dataBase64, 'base64'); } catch { return res.status(400).json({ success: false, error: 'Invalid file data' }); }
  if (!buf.length || buf.length > 2 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Avatar too large (max 2MB)' });
  const checked = resolveAllowedAttachment(name, mimeType, buf);
  if (!checked.ok || checked.kind !== 'image') return res.status(400).json({ success: false, error: 'Only JPG, PNG, WebP images are allowed.' });
  const allowedAvatarMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedAvatarMimes.has(checked.mimeType)) return res.status(400).json({ success: false, error: 'Only JPG, PNG, WebP images are allowed.' });
  const ext = checked.mimeType === 'image/png' ? '.png' : checked.mimeType === 'image/webp' ? '.webp' : '.jpg';
  const dir = store.getAvatarStorageDir(user.id);
  const fileName = `av_${Date.now()}_${randomBytes(6).toString('hex')}${ext}`;
  const filePath = path.join(dir, fileName);
  try {
    fs.writeFileSync(filePath, buf);
  } catch (e: any) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ success: false, error: 'Failed to save avatar' });
  }
  const avatarUrl = `/api/messenger/avatar/${user.id}/${fileName}`;
  try {
    await store.mutate(async () => {
      // remove previous custom avatar files to avoid orphan accumulation/overwrite issues
      const prevDir = path.join(UPLOAD_DIR, 'avatars', user.id);
      try {
        if (fs.existsSync(prevDir)) {
          for (const f of fs.readdirSync(prevDir)) {
            if (f !== fileName && /^av_[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(f)) {
              try { fs.unlinkSync(path.join(prevDir, f)); } catch {}
            }
          }
        }
      } catch {}
      store.updateProfile({ avatar: avatarUrl }, user.id);
      store.addAudit(user.id, 'avatar_updated', fileName, req.ip);
      store.persist();
    });
    broadcastProfileUpdated(user.id);
    return res.json({ success: true, user: store.getSelfProfileView(user.id), avatar: avatarUrl });
  } catch (e: any) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update avatar' });
  }
});

app.delete('/api/messenger/profile/avatar', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await store.mutate(async () => {
      store.clearCustomAvatarFiles(user.id);
      store.updateProfile({ avatar: (store.constructor as any).DEFAULT_AVATAR || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80' }, user.id);
      store.addAudit(user.id, 'avatar_reset', undefined, req.ip);
      store.persist();
    });
    broadcastProfileUpdated(user.id);
    res.json({ success: true, user: store.getSelfProfileView(user.id) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to reset avatar' });
  }
});

// Serve avatar files (publicly readable for profile display; path-safe)
app.get('/api/messenger/avatar/:userId/:file', (req, res) => {
  const userId = String(req.params.userId || '');
  const file = String(req.params.file || '');
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(userId) || !/^av_[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(file)) {
    return res.status(400).json({ success: false, error: 'Invalid avatar path' });
  }
  const dir = path.resolve(UPLOAD_DIR, 'avatars', userId);
  const resolved = path.resolve(dir, file);
  if (!resolved.startsWith(dir + path.sep)) return res.status(403).json({ success: false, error: 'Forbidden' });
  if (!fs.existsSync(resolved)) return res.status(404).json({ success: false, error: 'Avatar not found' });
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return fs.createReadStream(resolved).pipe(res);
});




// -------------------------------------------------------------
// 1c. CALLS (EARTH ONE-owned signaling/business; media token boundary)
// -------------------------------------------------------------
app.get('/api/calls/capabilities', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const capabilities = await getCommunicationCapabilities();
    res.json({ success: true, capabilities });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to inspect call capabilities' });
  }
});

app.post('/api/calls/mark-missed-seen', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    await store.mutate(async () => {
      let changed = false;
      for (const c of ensureCallsArray(store)) {
        if (
          c.status === 'missed' &&
          c.initiatorId !== user.id &&
          (c.participantIds || []).includes(user.id)
        ) {
          if (!Array.isArray(c.missedSeenBy)) c.missedSeenBy = [];
          if (!c.missedSeenBy.includes(user.id)) {
            c.missedSeenBy.push(user.id);
            changed = true;
          }
        }
      }
      if (changed) store.persist();
    });
    res.json({ success: true, missedUnreadCount: 0 });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to mark missed calls seen' });
  }
});

app.get('/api/calls', (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  runCallSweep();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const filter = String(req.query.filter || 'all');
  const allUserCalls = listCallsForUser(store, user.id, 100);
  const missedUnreadCount = allUserCalls.filter(
    (c: any) =>
      c.status === 'missed' &&
      c.initiatorId !== user.id &&
      !(Array.isArray(c.missedSeenBy) && c.missedSeenBy.includes(user.id))
  ).length;
  const filtered = filter === 'missed'
    ? allUserCalls.filter((c: any) => c.status === 'missed')
    : allUserCalls;
  const calls = filtered.slice(0, limit).map((c: any) => publicCallForUser(c, user.id));
  res.json({ success: true, calls, missedUnreadCount });
});

app.get('/api/calls/:id', (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  runCallSweep();
  const call = getCallById(store, req.params.id);
  if (!call || !(call.participantIds || []).includes(user.id)) return res.status(404).json({ success: false, error: 'Call not found' });
  res.json({ success: true, call: publicCallForUser(call, user.id) });
});

app.post('/api/calls/invite', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const body = req.body || {};
  const input = {
    scope: body.scope,
    kind: body.kind,
    conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
    targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined,
    participantIds: Array.isArray(body.participantIds) ? body.participantIds.filter((x:any)=>typeof x==='string') : undefined,
  };
  try {
    let call: any; let created: any;
    await store.mutate(async () => {
      created = createCallRecord(store, user.id, input as any);
      if (!created.ok) return;
      call = addCall(store, created.call);
      store.addAudit(user.id, 'call_invite', `${call.id}:${call.scope}:${call.kind}`, req.ip);
      store.persist();
    });
    if (!created?.ok) {
      const err = created?.error || 'Failed to create call';
      if (err === 'BUSY') return res.status(409).json({ success: false, error: 'You are already in a call.', code: 'BUSY' });
      if (err === 'TARGET_BUSY') return res.status(409).json({ success: false, error: 'Target user is busy.', code: 'TARGET_BUSY' });
      return res.status(403).json({ success: false, error: err });
    }
    try { emitCallInviteDelivery(call, user); } catch {}
    try { emitCallEvent(call, 'call_invite', { fromUserId: user.id }); } catch {}
    const tok = await issueMediaToken(call, user.id, { store, allowWebRtcFallback: body?.transport !== 'livekit' });
    res.json({ success: true, call: publicCallForUser(call, user.id), media: tok });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to create call' });
  }
});

app.post('/api/calls/:id/accept', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      const r = acceptCallRecord(call, user.id);
      if (!r.ok) { out = { code: r.error === 'Forbidden' ? 403 : 400, body: { success:false, error:r.error } }; return; }
      store.addAudit(user.id, 'call_accept', call.id, req.ip);
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    try { emitCallEvent(call, 'call_accept', { userId: user.id }); } catch {}
    const tok = await issueMediaToken(call, user.id, { store, allowWebRtcFallback: req.body?.transport !== 'livekit' });
    res.json({ success: true, call: publicCallForUser(call, user.id), media: tok });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to accept call' });
  }
});

app.post('/api/calls/:id/reject', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      const r = rejectCallRecord(call, user.id);
      if (!r.ok) { out = { code: r.error === 'Forbidden' ? 403 : 400, body: { success:false, error:r.error } }; return; }
      store.addAudit(user.id, 'call_reject', call.id, req.ip);
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    if (!isActiveCallStatus(call.status)) clearCallSignals(call.id);
    try { emitCallEvent(call, 'call_reject', { userId: user.id }); } catch {}
    res.json({ success: true, call: publicCallForUser(call, user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to reject call' });
  }
});

app.post('/api/calls/:id/cancel', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      const r = cancelCallRecord(call, user.id);
      if (!r.ok) { out = { code: r.error === 'Forbidden' ? 403 : 400, body: { success:false, error:r.error } }; return; }
      store.addAudit(user.id, 'call_cancel', call.id, req.ip);
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    clearCallSignals(call.id);
    try { emitCallEvent(call, 'call_cancel', { userId: user.id }); } catch {}
    res.json({ success: true, call: publicCallForUser(call, user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to cancel call' });
  }
});

app.post('/api/calls/:id/end', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'hangup';
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      const r = endCallRecord(call, user.id, reason);
      if (!r.ok) { out = { code: r.error === 'Forbidden' ? 403 : 400, body: { success:false, error:r.error } }; return; }
      store.addAudit(user.id, 'call_end', `${call.id}:${reason}`, req.ip);
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    clearCallSignals(call.id);
    try { emitCallEvent(call, 'call_end', { userId: user.id, reason }); } catch {}
    res.json({ success: true, call: publicCallForUser(call, user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to end call' });
  }
});

app.post('/api/calls/:id/leave', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      const r = leaveCallRecord(call, user.id);
      if (!r.ok) { out = { code: r.error === 'Forbidden' ? 403 : 400, body: { success:false, error:r.error } }; return; }
      store.addAudit(user.id, 'call_leave', call.id, req.ip);
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    if (!isActiveCallStatus(call.status)) clearCallSignals(call.id);
    try { emitCallEvent(call, 'call_leave', { userId: user.id }); } catch {}
    res.json({ success: true, call: publicCallForUser(call, user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to leave call' });
  }
});

app.post('/api/calls/:id/token', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const call = getCallById(store, req.params.id);
  if (!call || !(call.participantIds || []).includes(user.id)) return res.status(404).json({ success: false, error: 'Call not found' });
  const tok = await issueMediaToken(call, user.id, { store, allowWebRtcFallback: req.body?.transport !== 'livekit' });
  if (!tok.ok) return res.status(tok.blocked ? 503 : 403).json({ success: false, ...tok });
  res.json({ success: true, ...tok });
});

app.post('/api/calls/:id/signal', (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const call = getCallById(store, req.params.id);
  if (!call || !(call.participantIds || []).includes(user.id)) return res.status(404).json({ success: false, error: 'Call not found' });
  if (!isActiveCallStatus(call.status)) return res.status(400).json({ success: false, error: 'Call not active' });
  const toUserId = typeof req.body?.toUserId === 'string' && req.body.toUserId ? req.body.toUserId : undefined;
  const signal = req.body?.signal;
  if (!signal || typeof signal !== 'object') return res.status(400).json({ success: false, error: 'signal object required' });
  if (toUserId && !(call.participantIds || []).includes(toUserId)) return res.status(403).json({ success: false, error: 'Forbidden' });
  const entry = pushCallSignal(call.id, user.id, toUserId, signal);
  const recipients = toUserId ? [toUserId] : (call.participantIds || []).filter((id: string) => id !== user.id);
  for (const rid of recipients) {
    try { wsBroadcastToUser(rid, { type: 'call_signal', ...entry }); } catch {}
  }
  res.json({ success: true, entry });
});

app.get('/api/calls/:id/signals', (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const call = getCallById(store, req.params.id);
  if (!call || !(call.participantIds || []).includes(user.id)) return res.status(404).json({ success: false, error: 'Call not found' });
  const afterSeq = Math.max(0, Number(req.query.afterSeq) || 0);
  const { signals, lastSeq } = listCallSignalsForUser(call.id, user.id, afterSeq);
  res.json({ success: true, signals, lastSeq });
});

app.post('/api/calls/:id/state', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const status = typeof req.body?.status === 'string' ? req.body.status : undefined;
  const micEnabled = typeof req.body?.micEnabled === 'boolean' ? req.body.micEnabled : undefined;
  const cameraEnabled = typeof req.body?.cameraEnabled === 'boolean' ? req.body.cameraEnabled : undefined;
  const screenSharing = typeof req.body?.screenSharing === 'boolean' ? req.body.screenSharing : undefined;
  try {
    let call: any; let out: any;
    await store.mutate(async () => {
      call = getCallById(store, req.params.id);
      if (!call) { out = { code: 404, body: { success:false, error:'Call not found' } }; return; }
      if (!(call.participantIds||[]).includes(user.id)) { out = { code: 403, body: { success:false, error:'Forbidden' } }; return; }
      const p = call.participants[user.id] || { userId: user.id, status: 'joined' };
      if (micEnabled !== undefined) p.micEnabled = micEnabled;
      if (cameraEnabled !== undefined) p.cameraEnabled = cameraEnabled;
      if (screenSharing !== undefined) p.screenSharing = screenSharing;
      if (p.status === 'invited' || p.status === 'ringing') p.status = 'joined';
      call.participants[user.id] = p;
      if (status === 'active') markActive(call);
      else if (status === 'reconnecting') markReconnecting(call);
      else if (status === 'connecting' && call.status === 'ringing') call.status = 'connecting';
      call.updatedAt = new Date().toISOString();
      store.persist();
    });
    if (out) return res.status(out.code).json(out.body);
    try { emitCallEvent(call, 'call_state', { userId: user.id, state: { micEnabled, cameraEnabled, screenSharing, status } }); } catch {}
    res.json({ success: true, call: publicCallForUser(call, user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to update call state' });
  }
});

// -------------------------------------------------------------
// 1d. ONE NETWORK CENTER (Mode B WireGuard Control Plane + Mode A Overview)
// -------------------------------------------------------------
app.get('/api/network/overview', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const overview = await getNetworkOverview(store, user.id);
    res.json({ success: true, overview });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to inspect network overview' });
  }
});

app.get('/api/network/nodes', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const nodes = await listNetworkNodesWithStatus({ forceRefresh });
    res.json({ success: true, configured: nodes.length > 0, nodes });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to load WireGuard nodes' });
  }
});

app.post('/api/network/nodes/:id/probe', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const node = findNetworkNodeById(req.params.id);
  if (!node) return res.status(404).json({ success: false, error: 'WireGuard node not found' });
  try {
    const status = await probeNetworkNode(node, { forceRefresh: true });
    res.json({ success: true, node: status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to probe node' });
  }
});

app.get('/api/network/devices', (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  const devices = listDevicesForUser(store, user.id);
  res.json({ success: true, devices, privateKeysStoredOnServer: false });
});

app.post('/api/network/devices', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const result = await store.mutate(async () => {
      const r = registerNetworkDevice(store, user.id, req.body || {});
      if (r.ok) {
        store.persist();
      }
      return r;
    });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }
    res.status(201).json({ success: true, device: result.device, profile: result.profile });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to register WireGuard device' });
  }
});

app.get('/api/network/devices/:id/config', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const result = await store.mutate(async () => {
      const r = getNetworkDeviceConfigForUser(store, user.id, req.params.id);
      if (r.ok) {
        store.persist();
      }
      return r;
    });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }
    res.json({ success: true, device: result.device, profile: result.profile });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to build device config' });
  }
});

app.delete('/api/network/devices/:id', async (req, res) => {
  const user = requireSessionUser(req, res); if (!user) return;
  try {
    const result = await store.mutate(async () => {
      const r = revokeNetworkDeviceForUser(store, user.id, req.params.id);
      if (r.ok) {
        store.persist();
      }
      return r;
    });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }
    res.json({ success: true, device: result.device });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to revoke device' });
  }
});



// -------------------------------------------------------------
// 2. 3D DIGITAL GLOBE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/globe/nodes', (req, res) => {
  const nodes = store.getGlobeNodes();
  res.json({ success: true, nodes });
});

app.get('/api/globe/stats', (_req, res) => {
  const totalUsers = store.users.length;
  const onlineNow = store.users.filter(u => u.isOnline).length;
  const totalPosts = store.posts.length;
  const countriesCount = store.countries.length;
  res.json({
    success: true,
    stats: {
      totalUsers,
      onlineNow,
      totalPosts,
      countriesCount,
      countries: store.countries
    }
  });
});

app.get('/api/globe/countries', (req, res) => {
  res.json({ success: true, countries: store.countries });
});

// Real-Time Space Telemetry: Live ISS Orbit Tracking (WhereTheISS API with fallback)
app.get('/api/telemetry/iss', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      return res.json({
        success: true,
        source: 'live_telemetry',
        name: 'International Space Station (ISS)',
        noradId: 25544,
        lat: data.latitude,
        lng: data.longitude,
        altitudeKm: Math.round(data.altitude * 10) / 10,
        velocityKmh: Math.round(data.velocity),
        visibility: data.visibility,
        timestamp: data.timestamp
      });
    }
  } catch (err) {
    // Graceful offline fallback orbit projection based on UTC time
  }

  // Real astronomical approximate calculation for ISS orbit (51.6° inclination, 92.6 min period)
  const now = Date.now() / 1000;
  const orbitalPeriod = 92.6 * 60; // seconds
  const angle = ((now % orbitalPeriod) / orbitalPeriod) * Math.PI * 2;
  const lat = Math.sin(angle) * 51.6;
  const lng = (((now / 240) % 360) - 180);

  res.json({
    success: true,
    source: 'orbital_projection',
    name: 'International Space Station (ISS)',
    noradId: 25544,
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
    altitudeKm: 421.5,
    velocityKmh: 27580,
    visibility: 'daylight',
    timestamp: Math.floor(now)
  });
});

// Real-Time Seismic Telemetry: USGS Global Earthquakes (M2.5+ in the past 24 hours)
app.get('/api/telemetry/earthquakes', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      const quakes = (data.features || []).slice(0, 15).map((f: any) => ({
        id: f.id,
        title: f.properties.title,
        mag: f.properties.mag,
        place: f.properties.place,
        time: f.properties.time,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depthKm: Math.round(f.geometry.coordinates[2] * 10) / 10
      }));
      return res.json({ success: true, count: data.features?.length || 0, earthquakes: quakes });
    }
  } catch {
    // fallback
  }

  res.json({
    success: true,
    count: 3,
    earthquakes: [
      { id: 'usgs_1', title: 'M 4.2 - Southern Pacific Ocean', mag: 4.2, place: 'Southern Pacific Ocean', time: Date.now() - 3600000, lat: -18.4, lng: -175.2, depthKm: 35.0 },
      { id: 'usgs_2', title: 'M 3.8 - Honshu, Japan', mag: 3.8, place: 'Near East Coast of Honshu, Japan', time: Date.now() - 7200000, lat: 36.5, lng: 141.2, depthKm: 42.0 },
      { id: 'usgs_3', title: 'M 3.1 - Northern California', mag: 3.1, place: '7km W of Cobb, CA', time: Date.now() - 10800000, lat: 38.8, lng: -122.8, depthKm: 2.1 }
    ]
  });
});

// -------------------------------------------------------------
// 3. GLOBAL SOCIAL NETWORK (POSTS, LIKES, COMMENTS)
// -------------------------------------------------------------
app.get('/api/posts', (req, res) => {
  const { feed = 'global', country, category, search } = req.query;
  let list = [...store.posts];

  if (feed === 'trending') {
    list.sort((a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount));
  } else if (feed === 'latest') {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (feed === 'following') {
    const viewerId = getAuthUser(req)?.id;
    if (viewerId) list = list.filter(p => p.userId !== viewerId);
  }

  if (country && country !== 'ALL') {
    list = list.filter(p => p.countryCode.toLowerCase() === String(country).toLowerCase());
  }

  if (category && category !== 'all') {
    list = list.filter(p => p.category === category);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(p =>
      p.content.toLowerCase().includes(q) ||
      p.author.displayName.toLowerCase().includes(q) ||
      p.cityName.toLowerCase().includes(q) ||
      p.countryName.toLowerCase().includes(q)
    );
  }

  res.json({ success: true, posts: list });
});

app.post('/api/posts', (req, res) => {
  const { content, mediaUrl, mediaType, category } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Content cannot be empty' });
  }
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  const newPost = store.addPost({ content, mediaUrl, mediaType, category }, authUser);
  res.json({ success: true, post: newPost });
});

app.post('/api/posts/:id/like', (req, res) => {
  const result = store.togglePostLike(req.params.id);
  if (!result) return res.status(404).json({ success: false, error: 'Post not found' });
  res.json({ success: true, ...result });
});

app.post('/api/posts/:id/comment', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ success: false, error: 'Comment content is required' });
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  const post = store.addComment(req.params.id, content, authUser);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
  res.json({ success: true, post });
});

// -------------------------------------------------------------
// 4. INSTANT MESSAGING & AI REAL-TIME TRANSLATION
// -------------------------------------------------------------
app.get('/api/conversations', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const conversations = store.getConversationsForUser(user.id);
  res.json({ success: true, conversations });
});

app.post('/api/conversations/direct', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId : '';
  if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId is required' });
  const perm = store.canSendDirectMessageBetween(user.id, targetUserId);
  if (!perm.ok) return res.status(403).json({ success: false, error: perm.error || 'Cannot start conversation with this user.' });
  try {
    let conv: any;
    await store.mutate(async () => { conv = store.getOrCreateDirectConversation(user.id, targetUserId); });
    if (!conv) return res.status(404).json({ success: false, error: 'Target user not found' });
    // return masked view consistent with list
    const convs = store.getConversationsForUser(user.id);
    const masked = convs.find(c => c.id === conv.id) || conv;
    res.json({ success: true, conversation: masked, conversations: convs });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to create conversation' });
  }
});

app.post('/api/conversations/group', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.filter((x:any)=>typeof x==='string') : [];
  const avatar = typeof req.body?.avatar === 'string' ? req.body.avatar : undefined;
  try {
    let conv: any;
    await store.mutate(async () => {
      conv = store.createGroupConversation(user.id, name || 'New Group', memberIds, avatar);
      if (conv) {
        for (const uid of (conv.participantIds || [])) {
          if (uid === user.id) continue;
          emitNotification(uid, { type: 'group_invite', title: 'Group invitation', body: `${user.displayName} added you to group "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        store.persist();
      }
    });
    if (!conv) return res.status(400).json({ success: false, error: 'Failed to create group' });
    wsBroadcastConversationEvent(conv.id, { type: 'conversation_created', conversation: conv });
    res.json({ success: true, conversation: conv, conversations: store.getConversationsForUser(user.id) });
  } catch (e:any) {
    res.status(400).json({ success: false, error: e?.message || 'Failed to create group' });
  }
});

app.post('/api/conversations/:id/members', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  const addIds = Array.isArray(req.body?.addIds) ? req.body.addIds.filter((x:any)=>typeof x==='string') : [];
  const removeIds = Array.isArray(req.body?.removeIds) ? req.body.removeIds.filter((x:any)=>typeof x==='string') : [];
  try {
    let conv: any;
    await store.mutate(async () => {
      const before = store.conversations.find(c => c.id === id);
      const beforeSet = new Set<string>((before?.participantIds || []) as string[]);
      conv = store.updateGroupMembers(user.id, id, addIds, removeIds);
      if (conv) {
        const afterSet = new Set<string>((conv.participantIds || []) as string[]);
        const joined = Array.from(afterSet).filter(x => !beforeSet.has(x));
        const left = Array.from(beforeSet).filter(x => !afterSet.has(x));
        for (const uid of joined) {
          if (uid === user.id) continue;
          emitNotification(uid, { type: 'group_member_joined', title: 'Added to group', body: `${user.displayName} added you to "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        for (const uid of left) {
          if (uid === user.id) continue;
          emitNotification(uid, { type: 'group_member_left', title: 'Removed from group', body: `You were removed from "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        // notify remaining members about joins/leaves (aggregate, excluding direct targets/self)
        for (const uid of Array.from(afterSet)) {
          if (uid === user.id) continue;
          const joinedNames = joined.filter(x => x !== uid).map(x => store.users.find(u => u.id === x)?.displayName || x);
          const leftNames = left.filter(x => x !== uid && x !== user.id).map(x => store.users.find(u => u.id === x)?.displayName || x);
          if (joinedNames.length) emitNotification(uid, { type: 'group_member_joined', title: 'Group members joined', body: `${joinedNames.join(', ')} joined "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
          if (leftNames.length) emitNotification(uid, { type: 'group_member_left', title: 'Group members left', body: `${leftNames.join(', ')} left "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        store.persist();
      }
    });
    wsBroadcastConversationEvent(id, { type: 'conversation_updated', conversation: conv });
    res.json({ success: true, conversation: conv });
  } catch (e:any) {
    const msg = e?.message || 'Failed';
    res.status(msg === 'Forbidden' ? 403 : 400).json({ success: false, error: msg });
  }
});

app.post('/api/conversations/:id/transfer-owner', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  const newOwnerId = typeof req.body?.newOwnerId === 'string' ? req.body.newOwnerId : '';
  try {
    let conv: any;
    await store.mutate(async () => {
      conv = store.transferGroupOwner(user.id, id, newOwnerId);
      store.addAudit(user.id,'group_owner_transferred',`${id}:${newOwnerId}`,req.ip);
      if (conv) {
        const target = store.users.find(u=>u.id===newOwnerId);
        for (const uid of (conv.participantIds||[])) {
          if (uid === user.id) continue;
          emitNotification(uid, { type: 'group_owner_transferred', title: 'Group owner transferred', body: `${user.displayName} transferred ownership of "${conv.name}" to ${target?.displayName || newOwnerId}.`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id, targetUserId: newOwnerId });
        }
        store.persist();
      }
    });
    wsBroadcastConversationEvent(id, { type: 'conversation_updated', conversation: conv });
    res.json({ success: true, conversation: conv });
  } catch (e:any) {
    const msg = e?.message || 'Failed';
    res.status(msg === 'Forbidden' ? 403 : msg === 'Group not found' ? 404 : 400).json({ success: false, error: msg });
  }
});

app.post('/api/conversations/:id/leave', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  try {
    let conv: any;
    const recipients: string[] = [];
    await store.mutate(async () => {
      const before = store.conversations.find(c => c.id === id);
      recipients.push(...((before?.participantIds || []).filter((uid:string)=>uid!==user.id)));
      conv = store.leaveGroup(user.id, id);
      if (conv) {
        for (const uid of recipients) {
          emitNotification(uid, { type: 'group_member_left', title: 'Member left group', body: `${user.displayName} left "${conv.name}".`, actorId: user.id, actorName: user.displayName, actorAvatar: user.avatar, conversationId: conv.id });
        }
        store.persist();
      }
    });
    wsBroadcastConversationEvent(id, { type: 'conversation_updated', conversation: conv, leftUserId: user.id });
    res.json({ success: true, conversation: conv });
  } catch (e:any) {
    const msg = e?.message || 'Failed';
    res.status(msg === 'Group not found' ? 404 : 400).json({ success: false, error: msg });
  }
});

app.get('/api/conversations/:id', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const conv = store.conversations.find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (!store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  const members = (conv.participantIds || []).map(id => {
    const u = store.users.find(x => x.id === id);
    if (!u || store.getAccountStatus(u) === 'deleted') return { id, username: id, displayName: id, avatar: '', isOnline: false };
    const v = (store.getPublicProfileView(user.id, id) as any);
    const base = (v && !v.restricted && v.user) ? v.user : null;
    const pres = (store as any).getMaskedPresenceForViewer ? (store as any).getMaskedPresenceForViewer(user.id, id) : { isOnline: false, lastActiveAt: undefined };
    return {
      id: u.id, earthId: (u as any).earthId, username: u.username, displayName: u.displayName, avatar: u.avatar,
      isOnline: base ? !!base.isOnline : !!pres.isOnline,
      lastActiveAt: base ? base.lastActiveAt : pres.lastActiveAt,
      verified: !!u.verified,
      bio: base ? base.bio : undefined,
    };
  });
  res.json({ success: true, conversation: { ...conv, members } });
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const id = req.params.id;
  const user = requireSessionUser(req, res);
  if (!user) return;
  const conv = store.conversations.find(c => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (!store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const all = store.messages
    .filter(m => m.conversationId === id && !(m.deletedFor||[]).includes(user.id))
    .sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let slice: any[] = [];
  let hasMore = false;
  if (before) {
    const idx = all.findIndex(m => m.id === before);
    const end = idx >= 0 ? idx : all.length;
    const start = Math.max(0, end - limit);
    slice = all.slice(start, end);
    hasMore = start > 0;
  } else {
    const start = Math.max(0, all.length - limit);
    slice = all.slice(start);
    hasMore = start > 0;
  }
  // mark delivered for messages from others (persist best-effort)
  try {
    store.mutate(async () => {
      let changed = false;
      for (const m of slice) {
        if (m.senderId === user.id) continue;
        if (!(m.deliveredTo||[]).includes(user.id)) { m.deliveredTo = [...(m.deliveredTo||[]), user.id]; if (m.status === 'sent') m.status = 'delivered'; changed = true; }
      }
      if (changed) store.persist();
    }).catch(()=>{});
  } catch {}
  res.json({ success: true, messages: slice, hasMore });
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, targetLanguage, autoTranslate, attachments, replyToId, clientMsgId } = req.body || {};
  const id = req.params.id;
  const authUser = requireSessionUser(req, res);
  if (!authUser) return;
  const conv = store.conversations.find(c => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (!store.canAccessConversation(authUser.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  // block/privacy checks for direct
  if (conv.type === 'direct') {
    const otherId = (conv.participantIds||[]).find((pid:string)=>pid!==authUser.id);
    if (otherId) {
      const perm = store.canSendDirectMessageBetween(authUser.id, otherId);
      if (!perm.ok) return res.status(403).json({ success: false, error: perm.error || 'Messaging blocked.' });
    }
  }
  const text = typeof content === 'string' ? content.trim() : '';
  const atts = Array.isArray(attachments) ? attachments : undefined;
  if (!text && !(atts && atts.length)) return res.status(400).json({ success: false, error: 'Message cannot be empty' });

  let translatedContent: string | undefined;
  let translatedTo: string | undefined;
  if (autoTranslate && targetLanguage && text) {
    try {
      const dsRes = await aiGateway.generateContent(
        aiGateway.getChatModelId(),
        `Translate the following chat message to ${targetLanguage}. Maintain conversational nuance, warmth, and friendly tone. Return ONLY the translated string without commentary:\n"${text}"`
      );
      if (dsRes.success && dsRes.content?.trim()) {
        translatedContent = dsRes.content.trim();
        translatedTo = targetLanguage;
      } else {
        translatedContent = `[Translated to ${targetLanguage}]: ${text}`;
        translatedTo = targetLanguage;
      }
    } catch (err) {
      console.warn('DeepSeek translation fallback:', err);
      translatedContent = text;
    }
  }

  try {
    let msg: any;
    let senderMarkedNotifs = 0;
    const cmid = typeof clientMsgId === 'string' && clientMsgId ? clientMsgId : undefined;
    await store.mutate(async () => {
      msg = store.sendMessage(id, text, authUser, translatedContent, translatedTo, { attachments: atts, replyToId: typeof replyToId === 'string' ? replyToId : undefined, clientMsgId: cmid });
      senderMarkedNotifs = store.markConversationNotificationsRead(authUser.id, id);
      const convNow = store.conversations.find(c => c.id === id);
      const preview = (text || (atts?.length ? '[attachment]' : '')).slice(0, 80);
      for (const uid of (convNow?.participantIds || [])) {
        if (uid === authUser.id) continue;
        if (store.isBlockedEither(uid, authUser.id)) continue;
        if (isUserViewingConversation(uid, id)) continue;
        emitNotification(uid, { type: 'message_new', title: convNow?.name || authUser.displayName, body: `${authUser.displayName}: ${preview}`, actorId: authUser.id, actorName: authUser.displayName, actorAvatar: authUser.avatar, conversationId: id, data: { messageId: msg.id } });
      }
      store.persist();
    });
    if (senderMarkedNotifs > 0) {
      try { wsBroadcastToUser(authUser.id, { type: 'notification_sync', unreadCount: store.getUnreadNotificationCount(authUser.id), conversationId: id }); } catch {}
    }
    wsBroadcastConversationEvent(id, { type: 'message', conversationId: id, message: msg, clientMsgId });
    res.json({ success: true, message: msg, conversation: store.conversations.find(c => c.id === id) });
  } catch (e:any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to send message' });
  }
});

app.post('/api/conversations/:id/read', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  const conv = store.conversations.find(c => c.id === id);
  if (!conv || !store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  const allowReceipt = store.shouldSendReadReceipt(user.id);
  let markedNotifs = 0;
  await store.mutate(async () => {
    const r = store.markConversationRead(id, user.id, { allowReadReceipt: allowReceipt });
    markedNotifs = r?.markedNotifs || 0;
  });
  const unreadNotifCount = store.getUnreadNotificationCount(user.id);
  if (markedNotifs > 0) {
    try { wsBroadcastToUser(user.id, { type: 'notification_sync', unreadCount: unreadNotifCount, conversationId: id }); } catch {}
  }
  const readEvt = { type: 'read', conversationId: id, userId: user.id, readAt: new Date().toISOString() };
  if (allowReceipt) {
    wsBroadcastConversationEvent(id, readEvt);
  } else {
    try { wsBroadcastToUser(user.id, { ...readEvt, selfOnly: true }); } catch {}
  }
  res.json({ success: true, readReceiptSent: allowReceipt, unreadNotificationCount: unreadNotifCount, markedNotifs });
});

app.post('/api/conversations/:id/messages/:messageId/recall', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { id, messageId } = req.params as any;
  try {
    let msg: any;
    await store.mutate(async () => { msg = store.recallMessage(user.id, id, messageId); });
    wsBroadcastConversationEvent(id, { type: 'message_recalled', conversationId: id, message: msg });
    res.json({ success: true, message: msg });
  } catch (e:any) {
    const m = e?.message || 'Failed'; res.status(m==='Forbidden'?403:m==='Message not found'?404:400).json({ success:false, error:m });
  }
});

app.post('/api/conversations/:id/messages/:messageId/delete', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { id, messageId } = req.params as any;
  try {
    let msg: any;
    await store.mutate(async () => { msg = store.deleteMessageForUser(user.id, id, messageId); });
    res.json({ success: true, message: msg });
  } catch (e:any) {
    const m = e?.message || 'Failed'; res.status(m==='Message not found'?404:400).json({ success:false, error:m });
  }
});

app.post('/api/conversations/:id/messages/:messageId/react', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { id, messageId } = req.params as any;
  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '';
  try {
    let msg: any;
    await store.mutate(async () => { msg = store.toggleMessageReaction(user.id, id, messageId, emoji); });
    wsBroadcastConversationEvent(id, { type: 'message_reaction', conversationId: id, messageId: msg.id, reactions: msg.reactions || {}, userId: user.id, emoji });
    res.json({ success: true, message: msg, reactions: msg.reactions || {} });
  } catch (e:any) {
    const m = e?.message || 'Failed';
    res.status(m === 'Forbidden' ? 403 : m === 'Message not found' ? 404 : 400).json({ success: false, error: m });
  }
});

app.post('/api/conversations/:id/clear', async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  try {
    let result: any;
    await store.mutate(async () => { result = store.clearConversationForUser(user.id, id); store.persist(); });
    // keep own devices in sync
    try { wsBroadcastToUser(user.id, { type: 'conversation_cleared', conversationId: id, forUserId: user.id, cleared: result?.cleared || 0 }); } catch {}
    res.json({ success: true, conversationId: id, ...result });
  } catch (e:any) {
    const m = e?.message || 'Failed';
    res.status(m==='Forbidden'?403:400).json({ success: false, error: m });
  }
});

app.get('/api/conversations/:id/search', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const id = req.params.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const senderId = typeof req.query.senderId === 'string' ? req.query.senderId.trim() : '';
  const conv = store.conversations.find(c => c.id === id);
  if (!conv || !store.canAccessConversation(user.id, conv)) return res.status(403).json({ success: false, error: 'Forbidden' });
  if (!q && !senderId) return res.json({ success: true, messages: [] });
  const msgs = store.messages
    .filter(m => m.conversationId === id && !(m.deletedFor||[]).includes(user.id) && !m.recalled)
    .filter(m => !q || (m.content || '').toLowerCase().includes(q) || (m.attachments || []).some((a: any) => String(a?.name || '').toLowerCase().includes(q)))
    .filter(m => !senderId || m.senderId === senderId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 80);
  res.json({ success: true, messages: msgs });
});

app.get('/api/messenger/messages/search', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : '';
  const senderId = typeof req.query.senderId === 'string' ? req.query.senderId.trim() : '';
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  if (!q && !senderId && !conversationId) return res.json({ success: true, messages: [] });
  const accessible = store.getConversationsForUser(user.id);
  const convMap = new Map(accessible.map(c => [c.id, c]));
  if (conversationId && !convMap.has(conversationId)) return res.status(403).json({ success: false, error: 'Forbidden' });
  const scopeIds = conversationId ? new Set([conversationId]) : new Set(accessible.map(c => c.id));
  const messages = store.messages
    .filter(m => scopeIds.has(m.conversationId) && !(m.deletedFor || []).includes(user.id) && !m.recalled)
    .filter(m => !senderId || m.senderId === senderId)
    .filter(m => !q || (m.content || '').toLowerCase().includes(q) || (m.attachments || []).some((a: any) => String(a?.name || '').toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, limit)
    .map(m => {
      const c = convMap.get(m.conversationId);
      return { ...m, conversationName: c?.name || '', conversationType: c?.type || '', conversationAvatar: c?.otherUser?.avatar || c?.avatar || '' };
    });
  res.json({ success: true, messages });
});

// -------------------------------------------------------------
// 5. CREATOR HUB & VIDEOS
// -------------------------------------------------------------
app.get('/api/articles', (req, res) => {
  res.json({ success: true, articles: store.articles });
});

app.post('/api/articles', (req, res) => {
  const { title, summary, content, coverUrl, category } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, error: 'Title and content are required' });
  }
  const author = getAuthUser(req);
  if (!author) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  const article: any = {
    id: `art_${Date.now()}`,
    authorId: author.id,
    author: {
      displayName: author.displayName,
      username: author.username,
      avatar: author.avatar,
      countryCode: author.location?.countryCode || 'UN'
    },
    title,
    summary: summary || title,
    content,
    coverUrl: coverUrl || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=80',
    category: category || 'General',
    readTime: `${Math.max(1, Math.round(content.length / 400))} min read`,
    clapsCount: 1,
    clapped: false,
    tipsTotal: 0,
    createdAt: new Date().toISOString()
  };
  store.articles.unshift(article);
  store.saveToDisk();
  res.json({ success: true, article });
});

app.post('/api/articles/:id/tip', (req, res) => {
  const article = store.articles.find(a => a.id === req.params.id);
  if (!article) return res.status(404).json({ success: false, error: 'Article not found' });
  const amount = req.body.amount || 10;
  article.tipsTotal += amount;
  res.json({ success: true, tipsTotal: article.tipsTotal });
});

app.get('/api/videos', (req, res) => {
  const regionCtx = resolveRegionFromRequest(req);
  const videos = getCombinedEnrichedVideos(store.videos, regionCtx.region);
  res.json({ success: true, region: regionCtx.region, mode: regionCtx.mode, videos });
});

// -------------------------------------------------------------
// 6. COMMUNITIES & GAME ROOMS
// -------------------------------------------------------------
app.get('/api/communities', (req, res) => {
  res.json({ success: true, communities: store.communities });
});

app.post('/api/communities/:id/join', (req, res) => {
  const comm = store.communities.find(c => c.id === req.params.id);
  if (!comm) return res.status(404).json({ success: false, error: 'Community not found' });
  comm.isJoined = !comm.isJoined;
  comm.membersCount += comm.isJoined ? 1 : -1;
  res.json({ success: true, isJoined: comm.isJoined, membersCount: comm.membersCount });
});

app.get('/api/games/rooms', (req, res) => {
  res.json({ success: true, rooms: store.gameRooms });
});

// -------------------------------------------------------------
// 7. EARTH ONE UNIFIED AI GATEWAY & MULTI-MODEL DISPATCH
// -------------------------------------------------------------
app.get('/api/ai/models', async (_req, res) => {
  await aiGateway.detectLocalOllama();
  res.json({ success: true, hasLiveEngine: aiGateway.hasLiveEngine(), models: aiGateway.getModels() });
});

app.get('/api/ai/ollama/roles', (req, res) => {
  res.json({ success: true, ...aiGateway.getOllamaRoleAssignment() });
});

app.post('/api/ai/ollama/roles', (req, res) => {
  const { chatModel, crawlerModel } = req.body;
  const updated = aiGateway.setOllamaRoles(chatModel, crawlerModel);
  res.json({ success: true, ...updated });
});

app.post('/api/ai/custom-config', (req, res) => {
  const { apiKey, baseUrl, customModel } = req.body || {};
  aiGateway.registerCustomProvider(String(apiKey || ''), baseUrl ? String(baseUrl) : undefined, customModel ? String(customModel) : undefined);
  res.json({ success: true, hasLiveEngine: aiGateway.hasLiveEngine(), models: aiGateway.getModels() });
});

app.get('/api/ai/stats', (req, res) => {
  const models = aiGateway.getModels();
  const totalCalls = models.reduce((acc, m) => acc + m.totalCalls, 0);
  const totalTokens = models.reduce((acc, m) => acc + m.totalTokens, 0);
  res.json({ success: true, totalCalls, totalTokens, models });
});

app.post('/api/ai/chat', async (req, res) => {
  const {
    prompt,
    messages,
    history,
    modelId,
    model,
    mode = 'general',
    apiKey,
    baseUrl,
    customModel,
    stream,
    maxTokens,
    profileKey,
  } = req.body || {};

  const userPrompt =
    prompt || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');
  if (!userPrompt) return res.status(400).json({ success: false, error: 'Prompt or message content is required' });

  const authUser = getAuthUser(req);
  const shouldStream = stream === true;
  const turnAbort = new AbortController();
  if (shouldStream) {
    req.on('close', () => {
      if (!res.writableEnded) turnAbort.abort();
    });
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.flushHeaders();
  }

  try {
    const result = await executeAiTurn({
      prompt: String(userPrompt),
      history,
      modelId: modelId || model,
      mode,
      profileKey: typeof profileKey === 'string' ? profileKey : undefined,
      userId: authUser?.id,
      apiKey,
      baseUrl,
      customModel,
      maxTokens,
      signal: turnAbort.signal,
      onDelta: shouldStream
        ? (token) => {
            if (!res.writableEnded) {
              res.write(`${JSON.stringify({ delta: token })}\n`);
            }
          }
        : undefined,
    });

    if (shouldStream) {
      if (!res.writableEnded) {
        res.write(
          `${JSON.stringify({
            done: true,
            tokens: result.tokens,
            model: result.model,
            intent: result.intent,
            savedMemories: result.savedMemories,
            recalledMemoriesCount: result.recalledMemoriesCount,
            memoryWindow: result.memoryWindow,
          })}\n`
        );
        return res.end();
      }
      return;
    }

    return res.json({
      success: true,
      reply: result.reply,
      message: {
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toISOString(),
      },
      tokens: result.tokens,
      model: result.model,
      intent: result.intent,
      savedMemories: result.savedMemories,
      recalledMemoriesCount: result.recalledMemoriesCount,
      memoryWindow: result.memoryWindow,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (shouldStream && !res.writableEnded) return res.end();
      return;
    }
    const msg = err instanceof Error ? err.message : 'AI request failed';
    if (shouldStream && !res.writableEnded) {
      res.write(`${JSON.stringify({ error: msg })}\n`);
      return res.end();
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

// Persistent Long-Term AI Memory Governance Endpoints
app.get('/api/ai/memory', (req, res) => {
  const authUser = getAuthUser(req);
  const rawKey = typeof req.query.profileKey === 'string' ? req.query.profileKey : undefined;
  const includeInactive = req.query.includeInactive === 'true';
  const resolvedKey = normalizeProfileKey(rawKey, authUser?.id);
  const memories = listMemories(store, resolvedKey, includeInactive);
  res.json({
    success: true,
    profileKey: resolvedKey,
    totalActive: memories.filter((m) => m.status === 'active').length,
    memories,
  });
});

app.post('/api/ai/memory', (req, res) => {
  const authUser = getAuthUser(req);
  const { content, kind = 'fact', normalizedKey, profileKey, salience } = req.body || {};
  const clean = typeof content === 'string' ? content.trim() : '';
  if (!clean || clean.length < 2) {
    return res.status(400).json({ success: false, error: 'Memory content is required' });
  }
  const resolvedKey = normalizeProfileKey(typeof profileKey === 'string' ? profileKey : undefined, authUser?.id);
  const resUpsert = upsertMemory(store, resolvedKey, {
    kind,
    normalizedKey: typeof normalizedKey === 'string' && normalizedKey.trim() ? normalizedKey.trim() : `${kind}.manual`,
    content: clean,
    confidence: 0.98,
    salience: typeof salience === 'number' ? salience : 0.95,
    source: 'user_explicit',
  });
  return res.json({ success: true, action: resUpsert.action, memory: resUpsert.item });
});

app.patch('/api/ai/memory/:id', (req, res) => {
  const authUser = getAuthUser(req);
  const { content, kind, status, salience, profileKey } = req.body || {};
  const resolvedKey = normalizeProfileKey(typeof profileKey === 'string' ? profileKey : undefined, authUser?.id);
  const updated = updateMemoryItem(store, resolvedKey, req.params.id, { content, kind, status, salience });
  if (!updated) return res.status(404).json({ success: false, error: 'Memory item not found' });
  return res.json({ success: true, memory: updated });
});

app.delete('/api/ai/memory/:id', (req, res) => {
  const authUser = getAuthUser(req);
  const rawKey = typeof req.query.profileKey === 'string' ? req.query.profileKey : undefined;
  const clearAll = req.query.clearAll === 'true';
  const resolvedKey = normalizeProfileKey(rawKey, authUser?.id);
  const removed = deleteMemoryItem(store, resolvedKey, req.params.id, clearAll);
  return res.json({ success: true, removed });
});

app.delete('/api/ai/memory', (req, res) => {
  const authUser = getAuthUser(req);
  const rawKey = typeof req.query.profileKey === 'string' ? req.query.profileKey : undefined;
  const resolvedKey = normalizeProfileKey(rawKey, authUser?.id);
  const removed = deleteMemoryItem(store, resolvedKey, undefined, true);
  return res.json({ success: true, removed });
});

app.post('/api/ai/agent-command', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const lang = req.body?.lang === 'en' ? 'en' : 'zh';
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!text) return res.json({ success: true, action: { type: 'none' } });

  const isZh = lang === 'zh';

  // Fast deterministic intent match with conversational anti-hijack guard
  const instant = parseInstantAgentAction(text, isZh, history);
  if (instant && instant.type !== 'none') {
    return res.json({ success: true, action: instant });
  }

  // If this looks like conversational framing / project brainstorming / informational Q&A, do not fire commands
  if (isConversationalFramingNotCommand(text, history)) {
    return res.json({ success: true, action: { type: 'none' } });
  }

  if (!aiGateway.hasLiveEngine()) {
    return res.json({ success: true, action: { type: 'none' } });
  }

  const systemPrompt = `You are the web-control planner for ONE. Given user speech, return ONLY valid JSON (no markdown) deciding whether the user wants to control the website RIGHT NOW, or {"type":"none"} if it is normal conversation, brainstorming, questions, or hypotheticals.
Allowed actions:
- {"type":"play_music","query":"optional song/mood","crawl":true,"reply":"short confirmation in ${lang}"}
- {"type":"play_music","control":"next"|"prev"|"pause"|"resume","reply":"short confirmation in ${lang}"}
- {"type":"open_book","query":"book title or topic","reply":"short confirmation in ${lang}"}
- {"type":"watch_documentary","query":"search keywords","platform":"all","randomPick":true,"reply":"short confirmation in ${lang}"}
- {"type":"navigate_tab","tab":"globe|feed|chat|venus|arabic-learning|saturn|video|library|browser|universe|aihub|knowledge|moon|mercury|crawler|network|community|creator|game|brand","reply":"short confirmation in ${lang}"}
- {"type":"browser_search","query":"web search keywords","reply":"short confirmation in ${lang}"}
- {"type":"set_theme","theme":"dark"|"light","reply":"short confirmation in ${lang}"}
- {"type":"none"}`;

  try {
    const resolvedModelId = aiGateway.getChatModelId();
    const result = await aiGateway.generateContent(resolvedModelId, text, systemPrompt, undefined, history);
    const raw = (result.content || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (result.success && jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed.type === 'string') {
        return res.json({ success: true, action: parsed });
      }
    }
  } catch {
    // non-fatal
  }
  return res.json({ success: true, action: { type: 'none' } });
});

app.post('/api/ai/translate', async (req, res) => {
  const { text, targetLang = 'English' } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Text required' });

  const prompt = `Translate the following text to ${targetLang}. Return ONLY the direct natural translation:\n"${text}"`;
  const result = await aiGateway.generateContent(aiGateway.getChatModelId(), prompt);

  if (result.success) {
    res.json({ success: true, translation: result.content.trim() });
  } else {
    res.json({ success: false, error: result.errorMessage || 'Translation failed' });
  }
});

function wrapPcm24kAsWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

app.post('/api/ai/companion-turn', async (req, res) => {
  const {
    prompt,
    lang = 'zh',
    pageContext,
    history,
    profileKey: rawProfileKey,
  } = req.body || {};

  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  const authUser = getAuthUser(req);
  const profileKey = normalizeProfileKey(typeof rawProfileKey === 'string' ? rawProfileKey : undefined, authUser?.id);
  const histArray = Array.isArray(history)
    ? history
        .slice(-10)
        .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: String(h.content) }))
    : [];

  const savedMemories = commitMemoriesFromTurn(store, profileKey, cleanPrompt, histArray);
  const recalledMemories = retrieveRelevantMemories(store, profileKey, cleanPrompt, histArray, 560);
  const analysis = analyzeTurnContext(cleanPrompt, histArray, recalledMemories);
  const isZh = lang === 'zh' || analysis.isZh;

  // 1. Exact deterministic precision solver fast-path (<1ms)
  if (!cleanPrompt.includes('\n')) {
    const exact = solvePrecisionQuery(analysis.normalizedPrompt, isZh);
    if (exact) {
      return res.json({
        success: true,
        model: 'one-precision-solver',
        reply: exact.answer,
        emotion: 'focused',
        emotionIntensity: 0.72,
        emotionReason: isZh ? '精确计算' : 'Exact calculation',
        toolCalls: [],
        savedMemories,
      });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Graceful multi-engine fallback if Gemini key is absent
    try {
      const fallback = await executeAiTurn({
        prompt: cleanPrompt,
        history: histArray,
        mode: 'voice-agent',
        profileKey,
        userId: authUser?.id,
      });
      return res.json({
        success: true,
        model: fallback.model,
        reply: fallback.reply,
        emotion:
          analysis.sentiment === 'tired' || analysis.sentiment === 'frustrated'
            ? 'empathetic'
            : analysis.sentiment === 'excited'
              ? 'excited'
              : analysis.sentiment === 'playful'
                ? 'playful'
                : 'calm',
        emotionIntensity: 0.72,
        emotionReason: '',
        toolCalls: [],
        savedMemories,
      });
    } catch {
      return res.status(503).json({ success: false, error: 'AI engine unavailable' });
    }
  }

  try {
    const contents = [
      ...histArray.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: cleanPrompt }] },
    ];

    const callModel = (modelName: string) =>
      Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: buildCompanionSystemInstruction(
              lang,
              (pageContext || null) as LivePageContextSummary | null,
              recalledMemories
            ),
            thinkingConfig: modelName.includes('hydrogen') ? { thinkingLevel: ThinkingLevel.LOW } : undefined,
            tools: [{ functionDeclarations: AI_COMPANION_TOOLS }],
            temperature: analysis.temperatureHint ?? 0.7,
            maxOutputTokens: 512,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${modelName} timeout`)), 7500)
        ),
      ]);

    let activeModel = 'gemini-4-hydrogen';
    let response;
    try {
      response = await callModel('gemini-4-hydrogen');
    } catch {
      try {
        activeModel = 'gemini-2.5-flash';
        response = await callModel('gemini-2.5-flash');
      } catch (e2: any) {
        console.warn('[companion-turn] Gemini fallback triggered:', e2?.message || e2);
        throw e2;
      }
    }

    const rawCalls = response.functionCalls || [];
    let emotion = 'calm';
    let emotionIntensity = 0.7;
    let emotionReason = '';
    const clientToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const serverResolvedFacts: string[] = [];

    for (const c of rawCalls) {
      const name = c.name || '';
      const args = (c.args || {}) as Record<string, unknown>;
      if (name === 'set_companion_emotion') {
        if (typeof args.emotion === 'string') emotion = args.emotion;
        if (typeof args.intensity === 'number') emotionIntensity = args.intensity;
        if (typeof args.reason === 'string') emotionReason = args.reason;
      } else if (name === 'recall_or_save_memory') {
        const act = String(args.action || 'recall');
        const queryOrContent = String(args.queryOrContent || '').trim();
        if (act === 'save' && queryOrContent) {
          upsertMemory(store, profileKey, {
            kind: 'fact',
            normalizedKey: `fact.companion_${Date.now().toString(36)}`,
            content: queryOrContent,
            confidence: 0.96,
            salience: 0.94,
            source: 'user_explicit',
          });
        }
      } else if (name === 'lookup_live_knowledge') {
        const q = String(args.query || '').trim();
        const exact = q ? solvePrecisionQuery(q, isZh) : null;
        if (exact) serverResolvedFacts.push(exact.answer);
      } else if (name) {
        if (analysis.isHypotheticalOrDiscussion && (name === 'navigate_to_space' || name === 'control_music_player' || name === 'watch_cinema_video' || name === 'open_book_action')) {
          continue;
        }
        clientToolCalls.push({ name, args });
      }
    }

    const replyText = (response.text || '').trim() || serverResolvedFacts[0] || '';
    return res.json({
      success: true,
      model: activeModel,
      reply: replyText,
      emotion,
      emotionIntensity,
      emotionReason,
      toolCalls: clientToolCalls,
      savedMemories,
    });
  } catch {
    try {
      const fallbackTools: Array<{ name: string; args: Record<string, unknown> }> = [];
      let fallbackReply = '';

      if (!analysis.isHypotheticalOrDiscussion) {
        const clean = analysis.normalizedPrompt;
        const wantsDark = /(?:深色|暗黑|夜间|暗色|dark\s*mode|night\s*mode)/i.test(clean);
        const wantsLight = /(?:浅色|亮色|白天|日间|light\s*mode|day\s*mode)/i.test(clean);
        if (wantsDark) fallbackTools.push({ name: 'control_appearance', args: { theme: 'dark' } });
        else if (wantsLight) fallbackTools.push({ name: 'control_appearance', args: { theme: 'light' } });

        const instant = parseInstantAgentAction(cleanPrompt, isZh, histArray);
        if (instant && instant.type !== 'none') {
          if (instant.type === 'set_theme' && !fallbackTools.some((t) => t.name === 'control_appearance')) {
            fallbackTools.push({ name: 'control_appearance', args: { theme: instant.theme } });
          } else if (instant.type === 'navigate_tab') {
            fallbackTools.push({ name: 'navigate_to_space', args: { space: instant.tab } });
          } else if (instant.type === 'play_music') {
            fallbackTools.push({
              name: 'control_music_player',
              args: instant.control ? { action: instant.control } : { action: 'play_query', query: instant.query },
            });
          } else if (instant.type === 'watch_documentary') {
            fallbackTools.push({ name: 'watch_cinema_video', args: { query: instant.query } });
          } else if (instant.type === 'open_book') {
            fallbackTools.push({ name: 'open_book_action', args: { query: instant.query, action: 'read' } });
          } else if (instant.type === 'browser_search') {
            fallbackTools.push({ name: 'browser_and_search', args: { mode: 'search', query: instant.query } });
          }
          if (instant.reply) fallbackReply = instant.reply;
        }
      }

      if (fallbackTools.length > 1 && analysis.sentiment === 'tired') {
        fallbackReply = isZh
          ? '辛苦了，先别硬撑。我已经帮你切好深色护眼模式并放上舒缓音乐，靠着休息一会儿吧。'
          : 'You sound tired—take a breather. I switched to dark mode and put on soothing music for you.';
      } else if (fallbackTools.length === 0 || !fallbackReply) {
        const fallback = await executeAiTurn({
          prompt: cleanPrompt,
          history: histArray,
          mode: 'voice-agent',
          profileKey,
          userId: authUser?.id,
        });
        fallbackReply = fallback.reply;
      }

      const fallbackEmotion =
        analysis.sentiment === 'tired' || analysis.sentiment === 'frustrated'
          ? 'empathetic'
          : analysis.sentiment === 'excited'
            ? 'excited'
            : analysis.sentiment === 'playful'
              ? 'playful'
              : 'calm';

      return res.json({
        success: true,
        model: 'one-companion-fallback',
        reply: fallbackReply,
        emotion: fallbackEmotion,
        emotionIntensity: fallbackEmotion === 'empathetic' ? 0.85 : 0.72,
        emotionReason: fallbackEmotion === 'empathetic' ? (isZh ? '温柔共情与照料' : 'Warm care & empathy') : (isZh ? '稳定响应' : 'Attentive response'),
        toolCalls: fallbackTools,
        savedMemories,
      });
    } catch (innerErr: any) {
      return res.status(500).json({
        success: false,
        error: innerErr?.message || 'Companion turn failed',
      });
    }
  }
});

app.post('/api/ai/tts', async (req, res) => {
  const { text, emotion = 'calm', voiceName = 'Zephyr' } = req.body || {};
  const cleanText = typeof text === 'string' ? text.trim().slice(0, 600) : '';
  if (!cleanText) {
    return res.status(400).json({ success: false, error: 'text is required' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ success: false, error: 'GEMINI_API_KEY not configured' });
  }

  const styleHints: Record<string, string> = {
    excited: 'Speak warmly with bright excitement and energetic enthusiasm:',
    happy: 'Speak cheerfully with a warm smile in your voice:',
    curious: 'Speak with bright curiosity and an engaging inquisitive tone:',
    concerned: 'Speak gently with sincere care and attentive concern:',
    empathetic: 'Speak softly, tenderly, and empathetically:',
    playful: 'Speak playfully with light-hearted sparkle:',
    focused: 'Speak crisply, clearly, and confidently:',
    thinking: 'Speak thoughtfully and calmly:',
    calm: 'Speak naturally, warmly, and clearly:',
  };

  const allowedVoices = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);
  const safeVoice = allowedVoices.has(String(voiceName)) ? String(voiceName) : 'Zephyr';
  const promptPrefix = styleHints[String(emotion)] || styleHints.calm;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: `${promptPrefix} ${cleanText}`,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: safeVoice },
          },
        },
      },
    });

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) {
      return res.status(502).json({ success: false, error: 'Empty audio output' });
    }
    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = wrapPcm24kAsWav(pcmBuffer, 24000, 1);
    return res.json({
      success: true,
      mimeType: 'audio/wav',
      audioBase64: wavBuffer.toString('base64'),
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || 'TTS generation failed' });
  }
});

const ttsAudioCache = new Map<string, Buffer>();
app.get('/api/ai/tts', async (req, res) => {
  const rawText = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  const langParam = req.query.lang === 'en' ? 'en' : 'zh';
  const spdNum = Math.max(3, Math.min(6, Number(req.query.spd) || 5));
  if (!rawText) return res.status(400).json({ success: false, error: 'text required' });

  const cleanText = rawText
    .replace(/\[\[EMO:[^\]]+\]\]/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
    .trim()
    .slice(0, 220);
  if (!cleanText) return res.status(400).json({ success: false, error: 'empty text' });

  const cacheKey = `${langParam}:${spdNum}:${cleanText}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(cached);
  }

  const providers = [
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${langParam === 'en' ? 'en' : 'zh-CN'}&client=tw-ob&ttsspeed=1`,
    `https://fanyi.baidu.com/gettts?lan=${langParam}&text=${encodeURIComponent(cleanText)}&spd=${spdNum}&source=web`,
  ];

  for (const url of providers) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3200);
    try {
      const upstream = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          Referer: url.includes('baidu') ? 'https://fanyi.baidu.com/' : 'https://translate.google.com/',
        },
      });
      if (!upstream.ok) continue;
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length < 400) continue;

      if (ttsAudioCache.size >= 220) {
        const oldestKey = ttsAudioCache.keys().next().value;
        if (oldestKey) ttsAudioCache.delete(oldestKey);
      }
      ttsAudioCache.set(cacheKey, buf);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buf);
    } catch {
      // try fallback provider
    } finally {
      clearTimeout(timer);
    }
  }
  return res.status(502).json({ success: false, error: 'TTS upstream unavailable' });
});

// -------------------------------------------------------------
// 7b. VENUS PLANET MUSIC UNIVERSE & FIXED AUDIO CRAWLER
// -------------------------------------------------------------
app.get('/api/media/providers', (req, res) => {
  const regionCtx = resolveRegionFromRequest(req);
  res.json({
    success: true,
    detectedRegion: regionCtx.region,
    mode: regionCtx.mode,
    signal: regionCtx.signal,
    providers: getRegisteredProviders(),
  });
});

app.post('/api/media/probe', async (req, res) => {
  const { url, playbackType, mediaType } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }
  try {
    const isEmbed = playbackType === 'official_embed';
    const kind = mediaType === 'video' ? 'video' : 'audio';
    const outcome = isEmbed
      ? await probeEmbedUrl(url.trim())
      : await probeDirectMediaUrl(url.trim(), kind);
    res.json({ success: true, ...outcome });
  } catch (err: any) {
    res.status(500).json({ success: false, ok: false, error: err?.message || 'Probe failed' });
  }
});

app.get('/api/media/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const mediaType = req.query.mediaType === 'video' ? 'video' : 'music';
  const genre = typeof req.query.genre === 'string' ? req.query.genre : undefined;
  const limit = Math.max(4, Math.min(30, Number(req.query.limit) || 18));
  const regionCtx = resolveRegionFromRequest(req);

  try {
    if (mediaType === 'video') {
      const result = await dispatchUnifiedVideoSearch({
        query: q,
        region: regionCtx.region,
        limit,
        storeVideos: getCombinedEnrichedVideos(store.videos, regionCtx.region),
      });
      return res.json({
        success: true,
        mediaType: 'video',
        region: regionCtx.region,
        mode: regionCtx.mode,
        query: q,
        count: result.videos.length,
        videos: result.videos,
        providersQueried: result.providersQueried,
      });
    }

    const result = await dispatchUnifiedMusicSearch({
      query: q,
      genre,
      region: regionCtx.region,
      limit,
    });
    return res.json({
      success: true,
      mediaType: 'music',
      region: regionCtx.region,
      mode: regionCtx.mode,
      query: q,
      count: result.tracks.length,
      tracks: result.tracks,
      providersQueried: result.providersQueried,
      dispatchMode: result.mode,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Unified media search failed' });
  }
});

app.get('/api/music/tracks', async (req, res) => {
  const { genre } = req.query;
  const regionCtx = resolveRegionFromRequest(req);
  const genreStr = typeof genre === 'string' ? genre : 'all';
  try {
    const result = await dispatchUnifiedMusicSearch({
      query: '',
      genre: genreStr,
      region: regionCtx.region,
      limit: 20,
    });
    res.json({
      success: true,
      region: regionCtx.region,
      tracks: result.tracks,
      providersQueried: result.providersQueried,
      mode: 'youtube-bilibili',
    });
  } catch (err: any) {
    res.json({ success: false, region: regionCtx.region, tracks: [], error: err?.message || 'Crawler failed' });
  }
});

app.get('/api/music/search', async (req, res) => {
  const { q, genre } = req.query;
  const queryStr = typeof q === 'string' ? q.trim() : '';
  const genreStr = typeof genre === 'string' ? genre : undefined;
  const regionCtx = resolveRegionFromRequest(req);

  try {
    const dispatched = await dispatchUnifiedMusicSearch({
      query: queryStr,
      genre: genreStr,
      region: regionCtx.region,
      limit: 20,
    });
    res.json({
      success: true,
      region: regionCtx.region,
      query: queryStr,
      count: dispatched.tracks.length,
      tracks: dispatched.tracks,
      providersQueried: dispatched.providersQueried,
      mode: dispatched.mode,
    });
  } catch {
    const fallbackResults = musicStore
      .searchTracks(queryStr, genreStr)
      .map((t) => enrichMusicTrack(t, regionCtx.region));
    res.json({
      success: true,
      region: regionCtx.region,
      query: queryStr,
      count: fallbackResults.length,
      tracks: fallbackResults,
    });
  }
});

app.get('/api/music/youtube-search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  if (q.length > 200) return res.status(400).json({ success: false, error: 'Search query must be 200 characters or fewer' });
  const limit = Math.max(1, Math.min(24, Number(req.query.limit) || 12));
  const regionCtx = resolveRegionFromRequest(req);
  try {
    const direct = resolveMusicEmbedUrl(q);
    const rawTracks = direct ? [direct] : await searchYouTubeMusic(q, limit);
    const tracks = rawTracks.map((t) => enrichMusicTrack(t, regionCtx.region));
    res.json({ success: true, region: regionCtx.region, query: q, tracks, mode: direct ? 'embed-url' : 'search' });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Music search failed' });
  }
});

app.get('/api/bilibili/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 20));
  const regionCtx = resolveRegionFromRequest(req);
  try {
    const results = await searchBilibiliVideos(q, limit);
    const enriched = results.map((b) =>
      enrichVideoItem(
        {
          ...b,
          embedUrl: `https://player.bilibili.com/player.html?bvid=${b.bvid}&page=1&autoplay=0&danmaku=0`,
          source: 'Bilibili',
        },
        regionCtx.region
      )
    );
    res.json({ success: true, region: regionCtx.region, query: q, count: enriched.length, results: enriched, videos: enriched });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Bilibili search failed' });
  }
});

app.post('/api/music/crawl', async (req, res) => {
  const { keyword, query, genre } = req.body || {};
  const q = String(keyword || query || '热门音乐').trim();
  const regionCtx = resolveRegionFromRequest(req);
  try {
    const result = await dispatchUnifiedMusicSearch({
      query: q,
      genre: typeof genre === 'string' ? genre : 'all',
      region: regionCtx.region,
      limit: 20,
    });
    res.json({
      success: result.tracks.length > 0,
      crawledCount: result.tracks.length,
      savedCount: result.tracks.length,
      newTracks: result.tracks,
      tracks: result.tracks,
      providersQueried: result.providersQueried,
      mode: 'youtube-bilibili',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Music crawl failed',
      errors: [err?.message || 'Music crawl failed'],
      crawledCount: 0,
      savedCount: 0,
      newTracks: [],
      tracks: [],
    });
  }
});

// -------------------------------------------------------------
// 8. DIGITAL LIBRARY (CHAPTER 5)
// -------------------------------------------------------------

// Provider registry is read-only; enable/disable settings are applied from server environment.
app.get('/api/library/connectors', (_req, res) => {
  const sources = libraryConnectors.map(connector => connector.getSourceInformation()).flatMap(result => result.status === 'ok' && result.data ? [result.data] : []);
  res.json({ success: true, sources });
});

// Search enabled sources in parallel; metadata-only records remain externally linked.
app.get('/api/library/search', async (req, res) => {
  const q = req.query.q;
  if (typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Search query required' });
  }
  if (q.trim().length > 200) return res.status(400).json({ success: false, error: 'Search query must be 200 characters or fewer' });
  try {
    const knownSources: LibrarySource[] = ['openlibrary', 'archive', 'gutenberg', 'googlebooks', 'europeana', 'wikisource', 'ar_wikisource', 'openalex', 'crossref', 'arxiv', 'europepmc', 'pmc', 'pubmed', 'shamela'];
    let selectedSources: LibrarySource[] | undefined;
    const sourceParam = req.query.sources ?? req.query.source;
    if (typeof sourceParam === 'string' && sourceParam.trim()) {
      const parsed = sourceParam.split(',').map(value => value.trim()).filter(Boolean);
      if (parsed.some(value => !knownSources.includes(value as LibrarySource))) {
        return res.status(400).json({ success: false, error: 'Unknown library source' });
      }
      selectedSources = parsed as LibrarySource[];
    }
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 8;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, Math.floor(rawLimit))) : 8;
    const result = await searchLibrary(q.trim(), { sources: selectedSources, limit });
    res.json({ success: true, query: q.trim(), results: result.results, sources: result.sources });
  } catch (err: any) {
    console.error('Library connector search failed:', err);
    res.status(502).json({ success: false, error: 'Library search failed; retry later.' });
  }
});

// Import only after server-side provider metadata and reuse rights are revalidated.
app.post('/api/library/ingest', async (req, res) => {
  const { textUrl, pageTitle, epubUrl, source: rawSource, title, author, coverImage, description, language, identifier, externalId } = req.body;
  const knownSources: LibrarySource[] = ['openlibrary', 'archive', 'gutenberg', 'googlebooks', 'europeana', 'wikisource', 'ar_wikisource', 'openalex', 'crossref', 'arxiv', 'europepmc', 'pmc', 'pubmed', 'shamela'];
  if (typeof rawSource !== 'string' || !knownSources.includes(rawSource as LibrarySource)) {
    return res.status(400).json({ success: false, error: 'A supported source is required' });
  }
  const source = rawSource as LibrarySource;
  if (!isLibraryConnectorEnabled(source)) return res.status(503).json({ success: false, error: 'This library source is disabled' });
  if (source === 'shamela') return res.status(403).json({ success: false, error: 'Shamela search is read-only and links to official book pages; full-text import or copying is not enabled.' });
  if (source === 'openlibrary') return res.status(403).json({ success: false, error: 'Open Library provides discovery metadata; open the official record for reading or borrowing options.' });
  if (source === 'googlebooks') return res.status(403).json({ success: false, error: 'Google Books discovery and previews remain on the official service; local full-text import is not supported.' });
  if (source === 'europeana') return res.status(403).json({ success: false, error: 'Europeana search provides cultural-heritage metadata and an official source link; item media and full-text import are not enabled.' });
  if (source === 'openalex' || source === 'crossref' || source === 'arxiv' || source === 'europepmc' || source === 'pmc' || source === 'pubmed') {
    return res.status(403).json({ success: false, error: 'Academic discovery records and provider-hosted full text are not copied into EARTH ONE; use the official source and verify its article-level license.' });
  }

  let recordLocator: { id?: string; identifier?: string; pageTitle?: string; language?: string };
  if (source === 'archive') {
    const archiveId = typeof identifier === 'string' ? identifier : typeof externalId === 'string' ? externalId.replace(/^archive_/, '') : '';
    recordLocator = { id: archiveId, identifier: archiveId };
  } else if (source === 'gutenberg') {
    let gutId = typeof externalId === 'string' ? externalId.replace(/^gutenberg_/, '') : typeof identifier === 'string' ? identifier.replace(/^gutenberg_/, '') : '';
    if (!/^\d{1,8}$/.test(gutId)) {
      const candidate = typeof textUrl === 'string' ? textUrl : typeof epubUrl === 'string' ? epubUrl : '';
      try {
        const url = new URL(candidate);
        if (url.protocol === 'https:' && (url.hostname === 'gutenberg.org' || url.hostname.endsWith('.gutenberg.org'))) {
          gutId = url.pathname.match(/\/(?:ebooks|files|cache\/epub)\/(\d+)(?:\/|$)/)?.[1] || '';
        }
      } catch { /* invalid client URL is ignored; the provider ID remains required */ }
    }
    if (!/^\d{1,8}$/.test(gutId)) return res.status(400).json({ success: false, error: 'A valid Project Gutenberg ebook ID is required' });
    recordLocator = { id: gutId };
  } else {
    const title = typeof pageTitle === 'string' ? pageTitle : '';
    if (!title || title.length > 500) return res.status(400).json({ success: false, error: 'A valid Wikisource page title is required' });
    recordLocator = { pageTitle: title, language: typeof language === 'string' ? language : undefined };
  }

  try {
    const connector = getLibraryConnector(source);
    if (!connector) return res.status(404).json({ success: false, error: 'Library connector not found' });
    const locator = { ...recordLocator, record: undefined };
    const providerRecord = await connector.getBook(locator);
    if (providerRecord.status !== 'ok' || !providerRecord.data) {
      const status = providerRecord.status === 'unsupported' ? 403 : 502;
      return res.status(status).json({ success: false, error: providerRecord.reason || 'Could not verify the provider record' });
    }
    const record = providerRecord.data;
    if (!record.canImport) {
      const fallbackEmbedUrl =
        source === 'archive' && record.identifier
          ? `https://archive.org/embed/${encodeURIComponent(record.identifier)}`
          : undefined;
      if (fallbackEmbedUrl) {
        return res.status(422).json({
          success: false,
          fallbackEmbedUrl,
          error: '该档案仅提供原版扫描页，正在为你直接打开在线扫描阅览器。'
        });
      }
      return res.status(403).json({ success: false, error: 'Local import is blocked because explicit public-domain or open-license rights were not confirmed. Use the official source link instead.' });
    }

    let fullText: { title: string; author: string; chapters: { title: string; content: string }[] };
    const hasText = !!record.textUrl || source === 'archive' || source === 'wikisource' || source === 'ar_wikisource';
    if (hasText) {
      const textResult = await connector.getFullText(locator);
      if (textResult.status !== 'ok' || !textResult.data) {
        const status = textResult.status === 'unsupported' ? 422 : 502;
        const fallbackEmbedUrl =
          source === 'archive' && record.identifier
            ? `https://archive.org/embed/${encodeURIComponent(record.identifier)}`
            : undefined;
        return res.status(status).json({
          success: false,
          fallbackEmbedUrl,
          error: textResult.reason || 'Provider did not make readable full text available'
        });
      }
      fullText = textResult.data;
    } else if (source === 'gutenberg' && record.epubUrl) {
      fullText = { title: record.title, author: record.author, chapters: [] };
    } else {
      return res.status(403).json({ success: false, error: 'This record has no supported readable full-text file; use the official source page.' });
    }

    const stableKey = record.externalId || record.identifier || record.pageTitle || record.id;
    const bookId = `${source}_${createHash('sha256').update(`${source}:${stableKey}`).digest('hex').slice(0, 24)}`;
    const sourceLabel: 'Project Gutenberg' | 'Internet Archive' | 'Open Library' | 'Open Access' = source === 'gutenberg' ? 'Project Gutenberg' : source === 'archive' ? 'Internet Archive' : 'Open Access';
    let category: import('./src/types/index.ts').Book['category'] = 'literature';
    const book: import('./src/types/index.ts').Book = {
      id: bookId,
      title: record.title || fullText.title || title || 'Untitled',
      author: record.author || fullText.author || author || 'Unknown Author',
      category,
      language: record.language !== 'und' ? record.language : language || 'en',
      source: sourceLabel,
      year: record.year,
      publisher: record.publisher,
      isbn: record.isbn?.[0],
      coverImage: record.coverImage || coverImage,
      description: record.description || description || `Readable full text from ${record.sourceName}.`,
      readProgress: 0,
      chapters: fullText.chapters.map((ch, i) => ({
        id: `ch${i + 1}`,
        title: ch.title,
        content: ch.content
      })),
      epubUrl: record.epubUrl || undefined,
      externalReadUrl: record.sourceUrl,
      sourceUrl: record.sourceUrl,
      connectorId: source,
      externalId: record.externalId,
      licenseUrl: record.licenseUrl,
      rightsClassification: record.rights,
      rightsNote: record.rightsNote,
      textAvailability: fullText.chapters.length > 0 ? 'full_text' : 'metadata_only',
      formatType: record.epubUrl && fullText.chapters.length === 0 ? 'epub' : 'text',
      copyrightStatus: record.rights === RightsCategory.PUBLIC_DOMAIN ? 'public_domain' : record.rights === RightsCategory.OPEN_LICENSE ? 'licensed' : 'copyrighted'
    };
    const saved = store.addBook(book);
    res.json({ success: true, book: saved });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Failed to ingest book' });
  }
});

// EPUB proxy: download an EPUB from a legal source and stream it back
// (same-origin) so the browser epub.js reader is not blocked by CORS.
app.get('/api/library/epub-proxy', async (req, res) => {
  const { url, bookId } = req.query;
  if (!bookId || typeof bookId !== 'string') {
    return res.status(400).json({ success: false, code: 'EPUB_BOOK_REQUIRED', error: 'bookId is required' });
  }
  const book = store.books.find(b => b.id === bookId);
  if (!book) {
    return res.status(404).json({ success: false, code: 'EPUB_BOOK_NOT_FOUND', error: 'Book not found' });
  }
  const targetUrl = typeof url === 'string' && url ? url : book.epubUrl;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'url required' });
  }
  // Restrict transport to known library hosts; item-level rights are a separate check.
  let parsedUrl: URL;
  try { parsedUrl = new URL(targetUrl); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    return res.status(403).json({ success: false, error: 'Only credential-free HTTPS EPUB sources are allowed' });
  }
  try {
    const upstream = await fetchAllowedEpubResponse(parsedUrl);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ success: false, error: `Upstream ${upstream.status}` });
    }
    const archive = await readBoundedEpubArchive(upstream.body, upstream.headers.get('content-length'));
    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Length', String(archive.byteLength));
    res.send(archive);
  } catch (err: any) {
    if (err instanceof EpubArchiveError) {
      const status = err.code === 'EPUB_TOO_LARGE' ? 413 :
        err.code === 'EPUB_SOURCE_NOT_ALLOWED' || err.code === 'EPUB_REDIRECT_BLOCKED' ? 403 : 502;
      return res.status(status).json({ success: false, code: err.code, error: err.message });
    }
    res.status(502).json({ success: false, error: err.message || 'EPUB proxy failed' });
  }
});

// -------------------------------------------------------------
// Admin library management (authenticated)
// -------------------------------------------------------------
app.put('/api/library/books/:id', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { title, author, category, language, year, publisher, isbn, description, coverImage, copyrightStatus, source } = req.body;
  const updates: Partial<import('./src/types/index.ts').Book> = {};
  if (title !== undefined) updates.title = title;
  if (author !== undefined) updates.author = author;
  if (category !== undefined) updates.category = category;
  if (language !== undefined) updates.language = language;
  if (year !== undefined) updates.year = year;
  if (publisher !== undefined) updates.publisher = publisher;
  if (isbn !== undefined) updates.isbn = isbn;
  if (description !== undefined) updates.description = description;
  if (coverImage !== undefined) updates.coverImage = coverImage;
  if (copyrightStatus !== undefined) updates.copyrightStatus = copyrightStatus;
  if (source !== undefined) updates.source = source;
  const updated = store.updateBook(req.params.id, updates);
  if (!updated) return res.status(404).json({ success: false, error: 'Book not found' });
  res.json({ success: true, book: updated });
});

app.delete('/api/library/books/:id', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const removed = store.deleteBook(req.params.id);
  res.json({ success: removed });
});

// -------------------------------------------------------------
// Personal bookshelf (authenticated, per-user ownership)
// -------------------------------------------------------------
app.get('/api/library/shelf', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const items = store.getBookShelf(user.id);
  const books = items
    .map(item => {
      const book = store.books.find(b => b.id === item.bookId);
      return book ? { ...item, book: stripBookContent(book) } : null;
    })
    .filter(Boolean);
  res.json({ success: true, items: books });
});

app.post('/api/library/shelf', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { bookId, status } = req.body;
  if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });
  const item = store.addToBookShelf(user.id, bookId, status || 'want_to_read');
  res.json({ success: true, item });
});

app.delete('/api/library/shelf/:bookId', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const removed = store.removeFromBookShelf(user.id, req.params.bookId);
  res.json({ success: removed });
});

app.post('/api/library/shelf/:bookId/progress', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { progress } = req.body;
  const item = store.updateBookShelfProgress(user.id, req.params.bookId, Number(progress) || 0);
  res.json({ success: !!item, item });
});

app.post('/api/library/shelf/:bookId/reading-state', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const book = store.books.find(b => b.id === req.params.bookId);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const { chapterId } = req.body;
  const progress = req.body.progress;
  if (typeof chapterId !== 'string' || !book.chapters.some(chapter => chapter.id === chapterId)) {
    return res.status(400).json({ success: false, error: 'A chapter belonging to this book is required' });
  }
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    return res.status(400).json({ success: false, error: 'A valid reading progress percentage is required' });
  }
  const item = store.updateBookShelfReadingState(user.id, book.id, chapterId, progress);
  if (!item) return res.status(404).json({ success: false, error: 'Book is not on this user’s bookshelf' });
  res.json({ success: true, item });
});

app.post('/api/library/shelf/:bookId/epub-reading-state', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized.' });
  if (req.body.ownerId !== user.id) {
    return res.status(403).json({ success: false, error: 'Reading state account does not match the active session' });
  }
  const book = store.books.find(b => b.id === req.params.bookId);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const { cfi, progress } = req.body;
  if (!isSyntacticallyValidEpubCfi(cfi)) {
    return res.status(400).json({ success: false, error: 'A valid EPUB CFI location is required' });
  }
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 100) {
    return res.status(400).json({ success: false, error: 'A valid reading progress percentage is required' });
  }
  const item = store.updateBookShelfEpubReadingState(user.id, book.id, cfi, progress);
  if (!item) return res.status(404).json({ success: false, error: 'Book is not on this user’s bookshelf' });
  res.json({ success: true, item });
});

app.get('/api/library/books', (req, res) => {
  const { category, search } = req.query;
  let books = store.books;
  if (category && category !== 'all') {
    books = books.filter(b => b.category === category);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  }
  // List endpoints return metadata only; full text is fetched per-book.
  res.json({ success: true, books: books.map(stripBookContent) });
});

app.get('/api/library/books/:id', (req, res) => {
  const book = store.books.find(b => b.id === req.params.id);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const annotations = store.getAnnotations(book.id, getSessionUser(req)?.id);
  res.json({ success: true, book, annotations });
});

// Grounded reading uses only server-stored, source-verified text. Client-supplied
// book metadata is never used to construct the citation or the AI evidence.
app.post('/api/library/books/:id/ai-reading', async (req, res) => {
  const book = store.books.find(item => item.id === req.params.id);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const evidenceResult = resolveReadingEvidence(book, req.body.chapterId, req.body.selectedText);
  if (!evidenceResult.ok) {
    return res.status(evidenceResult.status).json({ success: false, code: evidenceResult.code, error: evidenceResult.error });
  }

  const evidence = evidenceResult.evidence;
  const { prompt, systemInstruction } = buildReadingPrompt(evidence, req.body.replyLanguage);
  const result = await aiGateway.generateContent('', prompt, systemInstruction);
  if (!result.success || !result.content.trim()) {
    return res.status(503).json({
      success: false,
      error: result.errorMessage || '当前没有可用的 AI 模型；正文和引用已核验，但未生成回答。',
      citation: evidence.citation,
      coverage: evidence.coverage,
      notice: evidence.notice
    });
  }

  res.json({
    success: true,
    message: { content: result.content },
    citation: evidence.citation,
    coverage: evidence.coverage,
    notice: evidence.notice
  });
});

// AI reading notes are private to the authenticated account and cite a source
// freshly revalidated from the stored book, not citation fields from the client.
app.post('/api/library/books/:id/knowledge-notes', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Login is required to save a private reading note.' });
  const book = store.books.find(item => item.id === req.params.id);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const evidenceResult = resolveReadingEvidence(book, req.body.chapterId, req.body.selectedText);
  if (!evidenceResult.ok) {
    return res.status(evidenceResult.status).json({ success: false, code: evidenceResult.code, error: evidenceResult.error });
  }
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  const aiExplanation = typeof req.body.aiExplanation === 'string' ? req.body.aiExplanation.trim() : '';
  if (!aiExplanation || aiExplanation.length > 20000 || note.length > 4000) {
    return res.status(400).json({ success: false, error: 'A reading answer (maximum 20,000 characters) and an optional note (maximum 4,000 characters) are required.' });
  }
  const annotation = store.addUserAnnotation(
    user.id,
    book.id,
    evidenceResult.evidence.chapter.id,
    evidenceResult.evidence.selectedPassage,
    note,
    aiExplanation,
    evidenceResult.evidence.citation
  );
  res.json({ success: true, annotation });
});

app.post('/api/library/books/:id/progress', (req, res) => {
  const { progress } = req.body;
  const book = store.updateReadingProgress(req.params.id, progress);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  res.json({ success: true, readProgress: book.readProgress });
});

app.post('/api/library/books/:id/annotations', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { chapterId, selectedText, note, aiExplanation } = req.body;
  if (!selectedText) return res.status(400).json({ success: false, error: 'Selected text required' });
  const ann = store.addAnnotation(req.params.id, chapterId, selectedText, note || '', aiExplanation, user.id);
  res.json({ success: true, annotation: ann });
});

// -------------------------------------------------------------
// 9. WEB CRAWLER & CONTENT INGESTION (CHAPTER 6)
// -------------------------------------------------------------
app.get('/api/crawler/tasks', (req, res) => {
  res.json({ success: true, tasks: store.crawlerTasks });
});

app.post('/api/crawler/tasks', (req, res) => {
  const { name, targetDomain, startUrl, maxPages } = req.body;
  if (!name || !targetDomain || !startUrl) {
    return res.status(400).json({ success: false, error: 'Task name, targetDomain, and startUrl are required.' });
  }
  const task = store.createCrawlerTask(name, targetDomain, startUrl, maxPages);
  res.json({ success: true, task });
});

app.post('/api/crawler/tasks/:id/run', async (req, res) => {
  const result = await store.executeCrawl(req.params.id);
  // Asynchronously trigger Ollama large model extraction on new pending pages
  const newPages = store.crawledPages.filter(p => p.taskId === req.params.id && !p.aiSummary);
  if (newPages.length > 0) {
    (async () => {
      for (const p of newPages.slice(0, 3)) {
        try {
          const ext = await aiGateway.runCrawlerExtraction({ title: p.title, content: p.cleanContent, url: p.url });
          if (ext.success && ext.extraction) {
            p.aiSummary = ext.extraction;
            p.aiModelUsed = ext.modelUsed;
            store.saveToDisk();
          }
        } catch {}
      }
    })();
  }
  res.json(result);
});

app.post('/api/crawler/ai-extract', async (req, res) => {
  const { title, content, url } = req.body;
  if (!content) return res.status(400).json({ success: false, error: 'Page content is required' });
  const result = await aiGateway.runCrawlerExtraction({
    title: title || 'Web Document',
    content,
    url: url || 'local://crawler'
  });
  res.json(result);
});

app.get('/api/crawler/pages', (req, res) => {
  res.json({ success: true, pages: store.crawledPages });
});

app.post('/api/crawler/pages/:id/approve', (req, res) => {
  const approved = store.approveCrawledPage(req.params.id);
  if (!approved) return res.status(404).json({ success: false, error: 'Page not found' });
  res.json({ success: true, page: approved });
});

// -------------------------------------------------------------
// 10. WEB BROWSER WORKSPACE & KNOWLEDGE BRIDGE (CHAPTER 7 & 8)
// -------------------------------------------------------------
app.get('/api/browser/bookmarks', (req, res) => {
  res.json({ success: true, bookmarks: store.browserBookmarks });
});

app.post('/api/browser/bookmarks', (req, res) => {
  const { title, url, category } = req.body;
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and URL required' });
  const bm = store.addBookmark({ title, url, category });
  res.json({ success: true, bookmark: bm });
});

app.get('/api/browser/saved-articles', (req, res) => {
  res.json({ success: true, articles: store.savedArticles });
});

app.post('/api/browser/save-article', (req, res) => {
  const authUser = getAuthUser(req);
  const saved = store.saveArticleToKnowledge(req.body, authUser?.id || 'guest');
  res.json({ success: true, article: saved });
});

app.delete('/api/browser/saved-articles/:id', (req, res) => {
  const deleted = store.deleteSavedArticle(req.params.id);
  res.json({ success: deleted });
});

app.post('/api/browser/fetch-preview', async (req, res) => {
  const { url } = req.body || {};
  const safeUrl = getSafeBrowserFetchUrl(url);
  if (!safeUrl) return res.status(400).json({ success: false, error: 'A safe public HTTP(S) URL is required.' });

  try {
    const extracted = await fetchAndExtract(safeUrl.toString());
    res.json({ success: true, ...extracted, hostname: safeUrl.hostname });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Unable to fetch this URL' });
  }
});

app.get('/api/browser/raw-html', async (req, res) => {
  const targetUrl = req.query.url;
  const safeUrl = getSafeBrowserFetchUrl(typeof targetUrl === 'string' ? targetUrl : '');
  if (!safeUrl) return res.status(400).type('text/plain; charset=utf-8').send('A safe public HTTP(S) URL is required.');

  try {
    const html = await fetchRawHtml(safeUrl.toString());
    const baseHref = `${safeUrl.protocol}//${safeUrl.host}${safeUrl.pathname.substring(0, safeUrl.pathname.lastIndexOf('/') + 1)}`;
    const withBase = /<head([^>]*)>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`)
      : `<base href="${baseHref}">${html}`;
    const cleaned = withBase
      .replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '')
      .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.type('text/html; charset=utf-8').send(cleaned);
  } catch (err: any) {
    res.status(502).type('text/plain; charset=utf-8').send(err?.message || 'Unable to fetch this URL');
  }
});


function isBlockedBrowserFetchHostname(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return isBlockedBrowserFetchHostname(mapped[1]);
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some(n => n < 0 || n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function getSafeBrowserFetchUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isBlockedBrowserFetchHostname(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Interactive Web Content Proxy for Browser Viewport
app.get('/api/browser/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const parsed = getSafeBrowserFetchUrl(typeof targetUrl === 'string' ? targetUrl : '');
  if (!parsed) {
    return res.status(400).send('A safe public HTTP(S) URL is required');
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(12000)
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    
    // Non-HTML assets (images, fonts, stylesheets) are streamed as-is
    if (!contentType.includes('text/html')) {
      res.setHeader('Content-Type', contentType);
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }

    let html = await response.text();

    // Inject base href so relative resources, CSS, scripts, and images load correctly
    const baseHref = `${parsed.protocol}//${parsed.host}${parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1)}`;
    const baseTag = `<base href="${baseHref}">`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = `${baseTag}${html}`;
    }

    // Strip frame busters and restrictive meta tags
    html = html.replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');
    html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(502).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>页面加载提示</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #080d13; color: #cbd5e1; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 520px; text-align: center; }
          h2 { color: #f87171; margin-top: 0; font-size: 20px; }
          p { font-size: 14px; line-height: 1.6; color: #94a3b8; }
          a { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #0284c7; color: white; border-radius: 9999px; text-decoration: none; font-size: 13px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🌐 页面加载状态</h2>
          <p>当前站点可能需要直接在独立标签页中开启访问，或远程目标响应超时（${err?.message || '网络连接超时'}）。</p>
          <a href="${req.query.url}" target="_blank" rel="noopener noreferrer">在新标签页中直接开启 ↗</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Live web search (Bing / DuckDuckGo / Wikipedia)
app.get('/api/browser/search', async (req, res) => {
  const { q, engine, lang } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Search query required' });
  }
  const engineParam = engine === 'bing' || engine === 'duckduckgo' || engine === 'wikipedia' ? engine : 'auto';
  const langParam = lang === 'zh' || lang === 'ar' || lang === 'es' || lang === 'fr' || lang === 'ru' ? lang : 'en';
  try {
    const results = await searchWeb(q, 10, engineParam, langParam);
    res.json({ success: true, query: q, results, engine: engineParam, lang: langParam });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Search failed' });
  }
});

// Saturn-style multi-source open book crawler (metadata + official/open links)
app.get('/api/library/crawl', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  if (q.length > 200) return res.status(400).json({ success: false, error: 'Search query must be 200 characters or fewer' });
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 12;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(24, Math.floor(rawLimit))) : 12;
  try {
    const data = await crawlOpenBooks(q, limit);
    res.json({ success: true, query: q, ...data });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Book crawl failed' });
  }
});

// Multi-source open image crawler (NASA, Wikimedia Commons, Met Museum)
app.get('/api/images/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 16;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(30, Math.floor(rawLimit))) : 16;
  const source = req.query.source === 'nasa' || req.query.source === 'wikimedia' || req.query.source === 'met' ? req.query.source : 'all';
  try {
    const data = await searchOpenImages(q, limit, source);
    res.json({ success: true, query: q, ...data });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Image search failed' });
  }
});

// -------------------------------------------------------------
// UNIFIED DISCOVERY ENGINE ENDPOINTS (Phase 2, 3, 5)
// -------------------------------------------------------------
app.get('/api/discovery/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const planet = typeof req.query.planet === 'string' ? (req.query.planet as any) : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const resourceType = typeof req.query.resourceType === 'string' ? (req.query.resourceType as any) : undefined;
    const accessType = typeof req.query.accessType === 'string' ? (req.query.accessType as any) : undefined;
    const language = typeof req.query.language === 'string' ? req.query.language : undefined;
    const page = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
    const includeExternal = req.query.includeExternal === 'true' || req.query.includeExternal === '1';
    const useAiIntent = req.query.useAiIntent === 'true' || req.query.useAiIntent === '1';

    const result = await executeUnifiedSearch({
      q,
      planet,
      category,
      resourceType,
      accessType,
      language,
      page,
      limit,
      includeExternal,
      useAiIntent
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Search execution failed' });
  }
});

app.get('/api/discovery/stats', (_req, res) => {
  try {
    const planetStats = discoveryDb.getPlanetStats();
    const total = discoveryDb.getTotalResourceCount();
    const sources = discoveryDb.getAllSources();
    res.json({ success: true, total, planetStats, sourcesCount: sources.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/discovery/resources', (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const planet = typeof req.query.planet === 'string' ? (req.query.planet as any) : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const resourceType = typeof req.query.resourceType === 'string' ? (req.query.resourceType as any) : undefined;
    const page = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;

    const result = discoveryDb.searchResources({
      q,
      planet,
      category,
      resourceType,
      page,
      limit
    });
    res.json({ success: true, ...result, page, limit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/discovery/resources/add', (req, res) => {
  const { url, name, description, primaryPlanet, category, tags, resourceType, accessType } = req.body;
  if (!url || !primaryPlanet) {
    return res.status(400).json({ success: false, error: 'url and primaryPlanet are required.' });
  }
  try {
    const result = discoveryDb.insertOrUpdateResource({
      url,
      name: name || new URL(url).hostname,
      description,
      primaryPlanet,
      category,
      tags: Array.isArray(tags) ? tags : [],
      resourceType,
      accessType,
      source: 'user_submission'
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/discovery/crawl-url', async (req, res) => {
  const { url, planet, category, tags } = req.body;
  if (!url || !planet) {
    return res.status(400).json({ success: false, error: 'url and planet are required.' });
  }
  try {
    const result = await harvestPublicWebUrl(url, { planet, category, tags });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/discovery/sources', (_req, res) => {
  try {
    const sources = discoveryDb.getAllSources();
    res.json({ success: true, sources });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/discovery/tasks/run-health', async (_req, res) => {
  try {
    const result = await runLinkHealthCheck(20);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/discovery/tasks/run-rss', async (_req, res) => {
  try {
    const result = await runRssSync();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/jupiter/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 300) {
    return res.status(400).json({ success: false, error: 'Search query must contain 1–300 characters.' });
  }
  const lang = req.query.lang === 'zh' || req.query.lang === 'ar' || req.query.lang === 'es' ||
    req.query.lang === 'fr' || req.query.lang === 'ru' ? req.query.lang : 'en';
  const engine = req.query.engine === 'google' || req.query.engine === 'bing' || req.query.engine === 'duckduckgo' ||
    req.query.engine === 'wikipedia' || req.query.engine === 'github' ? req.query.engine : 'auto';
  const searchCategories = ['all', 'images', 'videos', 'news', 'pdf', 'audio', 'books', 'academic'] as const;
  const requestedCategory = typeof req.query.type === 'string' ? req.query.type : '';
  if (requestedCategory && !(searchCategories as readonly string[]).includes(requestedCategory)) {
    return res.status(400).json({ success: false, error: 'Unsupported JUPITER search type.' });
  }
  const category = (requestedCategory || 'all') as typeof searchCategories[number];
  const cacheKey = `${category}\u0000${lang}\u0000${engine}\u0000${q.toLocaleLowerCase()}`;
  const cached = getCachedJupiterSearch(cacheKey);
  if (cached) return res.json({ success: true, query: q, results: cached, cached: true, sources: [...new Set(cached.map(result => result.source))] });

  try {
    let internalResults: JupiterResult[];
    let externalResults: SearchResult[];
    if (category === 'images') {
      const imageSearch = await searchGoogleImages(q, 20, lang);
      if (!imageSearch.configured) {
        return res.status(503).json({
          success: false,
          error: '图片搜索尚未配置。请在服务端设置 SERPER_API_KEY；不会用普通网页结果冒充图片结果。'
        });
      }
      internalResults = searchEarthImages(q, store, 10);
      externalResults = imageSearch.results;
    } else if (category === 'all') {
      internalResults = searchEarthIndex(q, store, 10);
      externalResults = engine === 'github'
        ? await searchGitHubRepositories(q, 10)
        : engine === 'auto'
          ? await searchWebProviders(q, 10, lang)
          : await searchWeb(q, 10, engine, lang);
    } else if (category === 'news' || category === 'pdf' || category === 'academic') {
      const verticalSearch = await searchGoogleCategory(q, category as JupiterExternalSearchCategory, 20, lang);
      if (!verticalSearch.configured) {
        return res.status(503).json({
          success: false,
          error: `${category} 搜索尚未配置。请在服务端设置 SERPER_API_KEY；不会用普通网页结果冒充该分类结果。`
        });
      }
      internalResults = searchEarthIndex(q, store, 50);
      externalResults = verticalSearch.results;
    } else if (category === 'videos') {
      // Aggregate public video discovery (Saturn-style): YouTube metadata + open web providers.
      // Shows results that can be found; playable sources open in JUPITER when embed/direct playback is allowed.
      const indexedResults = searchEarthIndex(q, store, 50);
      internalResults = indexedResults.filter(result => result.kind === 'video').slice(0, 10);
      const [yt, web] = await Promise.all([
        searchYouTubeVideos(q, 16).catch(() => []),
        searchWebProviders(`${q} 8K 4K video site:youtube.com OR site:vimeo.com OR site:dailymotion.com OR site:bilibili.com OR site:twitch.tv`, 16, lang).catch(() => [])
      ]);
      const seen = new Set<string>();
      externalResults = [...yt, ...web].filter(r => {
        const u = String(r?.url || '');
        if (!u || seen.has(u)) return false;
        seen.add(u);
        return true;
      });
    } else if (category === 'books') {
      const indexedResults = searchEarthIndex(q, store, 50);
      internalResults = indexedResults.filter(result => result.kind === 'book').slice(0, 10);
      // Safe discovery fallback: web search for book-related pages (external links only, no scraping).
      const discovery = await searchZLibraryDiscovery(q, 20, lang);
      externalResults = discovery;
    } else {
      internalResults = searchEarthAudio(q, store, 10);
      externalResults = await searchWebProviders(`${q} audio music`, 20, lang);
    }
    const enrichedExternal = externalResults.map((result, index) => {
      let domain = '';
      try { domain = new URL(result.sourceUrl || result.url).hostname.replace(/^www\./, ''); } catch { /* Invalid provider links are removed below. */ }
      const playable = /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|dailymotion\.com|bilibili\.com|twitch\.tv/i.test(domain) || /\.(?:m4v|mov|mp4|ogv|webm)$/i.test(new URL(result.url).pathname);
      return {
        ...result,
        id: `web:${domain}:${index}:${result.url}`,
        source: result.source === 'github' ? 'github' as const : 'web' as const,
        kind: (category === 'videos' || result.category === 'videos' || playable) ? 'video' as const : 'web' as const,
        category: category !== 'all' ? category : result.category,
        domain
      };
    }).filter(result => Boolean(result.domain));
    let results = mergeAndRankJupiterResults(q, [...internalResults, ...enrichedExternal], 20);
    if (category === 'videos') {
      results = results
        .map(r => ({ ...r, kind: r.source === 'earth' ? r.kind : 'video' as const, category: 'videos' as const }))
        .sort((a, b) => {
          const aPlay = /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|\.(mp4|webm|m4v|mov|ogv)(?:$|\?)/i.test(a.url) ? 1 : 0;
          const bPlay = /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|\.(mp4|webm|m4v|mov|ogv)(?:$|\?)/i.test(b.url) ? 1 : 0;
          return bPlay - aPlay;
        })
        .slice(0, 24);
    }
    cacheJupiterSearch(cacheKey, results);
    res.json({
      success: true,
      query: q,
      results,
      cached: false,
      sources: [...new Set(results.map(result => result.source))]
    });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'JUPITER search failed.' });
  }
});

app.get('/api/jupiter/content/:kind/:id', (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'article' && kind !== 'video' && kind !== 'book' && kind !== 'post') {
    return res.status(400).json({ success: false, error: 'Unsupported EARTH content type.' });
  }
  const content = getJupiterEarthContent(kind, req.params.id, store);
  if (!content) return res.status(404).json({ success: false, error: 'Content is unavailable in the public EARTH index.' });
  return res.json({ success: true, content });
});

// -------------------------------------------------------------
// 8. ADVERTISEMENTS & SPONSORS
// -------------------------------------------------------------
app.get('/api/ads', (req, res) => {
  res.json({ success: true, ads: store.ads });
});

app.post('/api/ads/:id/click', (req, res) => {
  const ad = store.ads.find(a => a.id === req.params.id);
  if (ad) ad.clicks += 1;
  res.json({ success: true });
});

// -------------------------------------------------------------
// 8b. KNOWLEDGE UNIVERSE (knowledge graph)
// -------------------------------------------------------------
app.get('/api/knowledge/search', (req, res) => {
  const { q, category } = req.query;
  let nodes = searchKnowledge(typeof q === 'string' ? q : '', 20);
  if (category && typeof category === 'string' && category !== 'all') {
    nodes = nodes.filter(n => n.type === category);
  }
  res.json({ success: true, query: q || '', nodes });
});

app.get('/api/knowledge/nodes', (req, res) => {
  const { category, country } = req.query;
  let nodes = getAllKnowledgeNodes();
  if (category && typeof category === 'string' && category !== 'all') {
    nodes = nodes.filter(n => n.type === category);
  }
  if (country && typeof country === 'string') {
    nodes = nodes.filter(n => n.countryCode?.toUpperCase() === country.toUpperCase());
  }
  res.json({ success: true, nodes });
});

app.get('/api/knowledge/nodes/:id', (req, res) => {
  const node = getKnowledgeNode(req.params.id);
  if (!node) return res.status(404).json({ success: false, error: 'Knowledge node not found' });

  const related = getRelatedNodes(node.id);
  const relatedBooks = (node.bookIds || [])
    .map(bookId => store.books.find(b => b.id === bookId))
    .filter((b): b is import('./src/types/index.ts').Book => Boolean(b));

  res.json({ success: true, node, related, relatedBooks });
});

// -------------------------------------------------------------
// 8b2. ISLAMIC DIGITAL LIBRARIES & ARABIC MANUSCRIPTS CRAWLER
// -------------------------------------------------------------
app.get('/api/learning/arabic/islamic-libraries', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const category = typeof req.query.category === 'string' ? (req.query.category as IslamicLibraryCategory) : undefined;
  const source = typeof req.query.source === 'string' ? (req.query.source as IslamicLibrarySource) : undefined;
  const limit = req.query.limit ? Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10))) : 24;

  try {
    const data = await crawlIslamicLibraries(q, { category, source, limit });
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/learning/arabic/islamic-libraries/featured', (_req, res) => {
  const books = getFeaturedIslamicBooks();
  res.json({ success: true, books, total: books.length });
});

app.post('/api/learning/arabic/islamic-libraries/crawl', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query : 'grammar';
  const category = typeof req.body?.category === 'string' ? (req.body.category as IslamicLibraryCategory) : undefined;

  try {
    const result = await crawlIslamicLibraries(query, { category, limit: 30 });
    res.json({
      success: true,
      message: `成功抓取各大伊斯兰图书馆，共索引 ${result.count} 部经典典籍与手稿`,
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 8b3. ENGLISH LEARNING ENGINE (Dictionary, Phonetics & Corpus)
// -------------------------------------------------------------
app.get('/api/learning/english/lookup', async (req, res) => {
  const rawWord = typeof req.query.word === 'string' ? req.query.word.trim().toLowerCase() : '';
  const word = rawWord.replace(/[^a-z'-]/g, '');
  if (!word) {
    return res.status(400).json({ success: false, error: 'Valid English word is required' });
  }

  try {
    const [dictRes, relRes] = await Promise.allSettled([
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
        signal: AbortSignal.timeout(4500),
      }),
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=8`, {
        signal: AbortSignal.timeout(4000),
      }),
    ]);

    let phonetic: string | undefined;
    let audioUrl: string | undefined;
    let meanings: Array<{
      partOfSpeech: string;
      definitions: Array<{ definition: string; example?: string }>;
    }> = [];

    if (dictRes.status === 'fulfilled' && dictRes.value.ok) {
      const json = await dictRes.value.json();
      if (Array.isArray(json) && json[0]) {
        const entry = json[0];
        const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
        phonetic =
          entry.phonetic ||
          phonetics.find((p: any) => typeof p?.text === 'string' && p.text)?.text;
        audioUrl = phonetics.find((p: any) => typeof p?.audio === 'string' && p.audio)?.audio;
        if (Array.isArray(entry.meanings)) {
          meanings = entry.meanings.slice(0, 4).map((m: any) => ({
            partOfSpeech: String(m.partOfSpeech || 'term'),
            definitions: Array.isArray(m.definitions)
              ? m.definitions.slice(0, 3).map((d: any) => ({
                  definition: String(d.definition || ''),
                  example: typeof d.example === 'string' ? d.example : undefined,
                }))
              : [],
          }));
        }
      }
    }

    let related: string[] = [];
    if (relRes.status === 'fulfilled' && relRes.value.ok) {
      const relJson = await relRes.value.json();
      if (Array.isArray(relJson)) {
        related = relJson
          .map((item: any) => String(item?.word || ''))
          .filter((w: string) => w && w !== word)
          .slice(0, 8);
      }
    }

    if (meanings.length === 0) {
      return res.json({
        success: true,
        entry: {
          word,
          phonetic: phonetic || undefined,
          audioUrl,
          meanings: [],
          related,
          source: 'fallback',
        },
      });
    }

    return res.json({
      success: true,
      entry: {
        word,
        phonetic,
        audioUrl,
        meanings,
        related,
        source: 'live',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Dictionary lookup failed' });
  }
});

app.get('/api/learning/english/reading', async (req, res) => {
  const topic = typeof req.query.topic === 'string' ? req.query.topic.trim() : 'Astronomy';
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
      {
        headers: { 'User-Agent': 'EarthOneLanguageEngine/1.0' },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      if (data?.extract) {
        return res.json({
          success: true,
          article: {
            title: String(data.title || topic),
            description: String(data.description || 'Encyclopedia Corpus'),
            extract: String(data.extract),
            sourceUrl: data.content_urls?.desktop?.page || undefined,
          },
        });
      }
    }
    return res.json({ success: false, error: 'Article unavailable' });
  } catch {
    return res.json({ success: false, error: 'Reading corpus fetch timeout' });
  }
});

// -------------------------------------------------------------
// 8c. GLOBAL UNIFIED SEARCH (across all modules)
// -------------------------------------------------------------
app.get('/api/search/global', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  const viewer = getSessionUser(req);
  const lower = q.toLowerCase();

  const users = store.users.filter(u => {
    if (store.getAccountStatus(u) === 'deleted') return false;
    if (viewer && u.id === viewer.id) {
      // keep self out of global people results like legacy behavior
    }
    const isFriend = viewer ? store.getFriendIds(viewer.id).includes(u.id) : false;
    const blockedEither = viewer ? store.isBlockedEither(viewer.id, u.id) : false;
    const priv = store.getPrivacySettings(u.id);
    if (!canViewProfileByPolicy(false, isFriend, blockedEither, priv)) return false;
    const byField = canSearchByField(q, { id: u.id, username: u.username, displayName: u.displayName }, priv) || String((u as any).earthId || '').toLowerCase().includes(lower);
    const labelMatch = String(u.location?.countryName || '').toLowerCase().includes(lower) || String(u.location?.cityName || '').toLowerCase().includes(lower);
    if (!byField && !labelMatch) return false;
    return true;
  }).map(u => {
    const view = viewer ? (store.getPublicProfileView(viewer.id, u.id) as any)?.user : null;
    return view || toPublicUser(u, { privacy: store.getPrivacySettings(u.id) });
  }).slice(0, 5);

  const posts = store.posts
    .filter(p => p.content.toLowerCase().includes(lower))
    .slice(0, 5);

  const books = store.books
    .filter(b => b.title.toLowerCase().includes(lower) || b.author.toLowerCase().includes(lower))
    .slice(0, 5);

  const communities = store.communities
    .filter(c => c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower))
    .slice(0, 5);

  const knowledge = searchKnowledge(q, 5);
  const discovery = discoveryDb.searchResources({ q, limit: 6 }).items;

  res.json({
    success: true,
    query: q,
    results: { users, posts, books, communities, knowledge, resources: discovery }
  });
});

// -------------------------------------------------------------
// 9. VITE SPA MIDDLEWARE / PRODUCTION STATIC SERVING
// -------------------------------------------------------------
async function startServer() {
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  attachMessengerWs(wss as any);
  const aiLiveWss = new WebSocketServer({ noServer: true });
  attachAiLiveWs(aiLiveWss as any);

  httpServer.on('upgrade', (request, socket, head) => {
    const reqPath = (request.url || '').split('?')[0];
    if (reqPath === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (reqPath === '/ws/ai-live') {
      aiLiveWss.handleUpgrade(request, socket, head, (ws) => {
        aiLiveWss.emit('connection', ws, request);
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production' || process.env.EARTH_ONE_SERVE_DIST === 'true';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    // SPA fallback for client routes (do not intercept API or websocket upgrade paths)
    app.get(/^(?!\/api|\/ws).*/, (req, res, next) => {
      if (req.method !== 'GET') return next();
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
      return next();
    });
  } else {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🌍 地球计划 Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production/dist' : 'vite-dev'})`);
  });

  if (process.env.EARTH_ONE_SKIP_BOOK_HARVEST !== 'true') {
    // --- Automated Book Harvester (backend-only, no UI entry) ---
    // Runs immediately on boot, then once every hour. Books are merged into
    // the Digital Library store, de-duplicated by id.
    const runHarvest = async () => {
      const log = await runBookHarvest();
      console.log(log);
    };

    runHarvest();
    const harvestInterval = setInterval(runHarvest, 60 * 60 * 1000);
    // Prevent the interval from keeping the process alive in tests/edge cases
    harvestInterval.unref?.();
  }

  // Pre-seed Islamic Digital Library classics into Discovery engine
  seedIslamicLibraryToDiscovery();

  // Start Discovery background maintenance daemon
  startDiscoveryScheduler();

  // Periodic missed-call / stale-ringing cleanup sweep (every 30s)
  const callSweepInterval = setInterval(() => {
    try { runCallSweep(); } catch {}
  }, 30_000);
  callSweepInterval.unref?.();
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
