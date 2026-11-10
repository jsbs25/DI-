import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { store, stripBookContent } from './server/store.ts';
import { toPublicUser } from './server/privacy.ts';
import { aiGateway } from './server/aiGateway.ts';
import { buildConversationPrompt, normalizeConversationHistory } from './server/aiConversation.ts';
import { cacheJupiterSearch, getCachedJupiterSearch, getJupiterEarthContent, mergeAndRankJupiterResults, searchEarthAudio, searchEarthImages, searchEarthIndex, type JupiterResult } from './server/jupiterSearch.ts';
import { buildReadingPrompt, resolveReadingEvidence } from './server/libraryReadingAi.ts';
import { EpubArchiveError, fetchAllowedEpubResponse, isSyntacticallyValidEpubCfi, readBoundedEpubArchive } from './server/libraryEpubSecurity.ts';
import { fetchAndExtract, searchGitHubRepositories, searchGoogleCategory, searchGoogleImages, searchWeb, searchWebProviders, searchZLibraryDiscovery, type JupiterExternalSearchCategory, type SearchResult } from './server/webFetcher.ts';
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
import { searchBilibiliVideos } from './server/bilibiliCrawler.ts';
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

app.use(express.json());

// Initialize Gemini client if API key is provided
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
  }
}

// Resolve only an explicitly valid session. Keep the legacy guest fallback
// separate so identity endpoints never expose another visitor's active user.
function getSessionUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = store.getUserByToken(token);
    if (user) return user;
  }
  return undefined;
}

function getAuthUser(req: express.Request) {
  return getSessionUser(req) || store.currentUser;
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
    if (k) out[k] = decodeURIComponent(v || '');
  });
  return out;
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
    return { ...i, linked: !!linked, linkedLabel: linked?.displayName || linked?.email || linked?.providerUserId };
  });
  res.json({ success: true, integrations });
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
  if (!checkAuthRateLimit(`login:${clientKey}`)) {
    return res.status(429).json({ success: false, error: '登录尝试过于频繁，请稍后再试。' });
  }
  try {
    const { user, token } = store.loginUser(identifier, password);
    res.json({ success: true, user, token });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});


app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  res.json({ success: true, user: user || null });
});

// Google OAuth 2.0 (official) - sign in / bind account
app.get('/api/auth/google/start', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
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
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
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
    const { user, token } = store.createOrLoginOAuthUser({
      provider: 'google',
      providerUserId: String(info.sub),
      email: info.email,
      displayName: info.name || info.email,
      avatar: info.picture
    });
    const payload = Buffer.from(JSON.stringify({ token, user })).toString('base64url');
    // pass via hash so SPA can pick it up without server-rendered template change
    return res.redirect(`${appUrl}/#auth=${payload}`);
  } catch (e) {
    console.error('Google OAuth callback error', e);
    return res.redirect(`${appUrl}/?auth_error=google_failed`);
  }
});

app.get('/api/auth/current', (req, res) => {
  const user = getSessionUser(req);
  res.json({ success: true, user: user || null });
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

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    store.sessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/update-profile', (req, res) => {
  const authUser = getSessionUser(req);
  if (!authUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  try {
    const updated = store.updateProfile(req.body, authUser.id);
    res.json({ success: true, user: updated });
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
  const { query, country } = req.query;
  let list = store.users;
  if (country) {
    list = list.filter(u => u.location.countryCode.toLowerCase() === String(country).toLowerCase());
  }
  if (query) {
    const q = String(query).toLowerCase();
    list = list.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.bio.toLowerCase().includes(q) ||
      u.location.countryName.toLowerCase().includes(q) ||
      u.location.cityName.toLowerCase().includes(q)
    );
  }
  res.json({ success: true, users: list.map(toPublicUser) });
});

app.get('/api/users/:id', (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const userPosts = store.posts.filter(p => p.userId === req.params.id);
  res.json({ success: true, user: toPublicUser(user), posts: userPosts });
});

app.post('/api/users/:id/follow', (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  user.followersCount += 1;
  store.currentUser.followingCount += 1;
  res.json({ success: true, followersCount: user.followersCount });
});

// -------------------------------------------------------------
// 2. 3D DIGITAL GLOBE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/globe/nodes', (req, res) => {
  const nodes = store.getGlobeNodes();
  res.json({ success: true, nodes });
});

app.get('/api/globe/stats', (req, res) => {
  const totalUsers = store.users.length * 1250; // scaled representation
  const totalPosts = store.posts.length * 840;
  const countriesCount = store.countries.length;
  res.json({
    success: true,
    stats: {
      totalUsers,
      onlineNow: Math.round(totalUsers * 0.18),
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
    list = list.filter(p => p.userId !== store.currentUser.id);
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

app.post('/api/conversations/direct', (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId : '';
  if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId is required' });
  const conv = store.getOrCreateDirectConversation(user.id, targetUserId);
  if (!conv) return res.status(404).json({ success: false, error: 'Target user not found' });
  res.json({ success: true, conversation: conv, conversations: store.getConversationsForUser(user.id) });
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const id = req.params.id;
  const user = requireSessionUser(req, res);
  if (!user) return;
  const conv = store.conversations.find(c => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (conv.type === 'direct' && !conv.participantIds.includes(user.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const msgs = store.messages.filter(m => m.conversationId === id);
  res.json({ success: true, messages: msgs });
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, targetLanguage, autoTranslate } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ success: false, error: 'Message cannot be empty' });
  const id = req.params.id;
  const authUser = requireSessionUser(req, res);
  if (!authUser) return;
  const conv = store.conversations.find(c => c.id === id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (conv.type === 'direct' && !conv.participantIds.includes(authUser.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  let translatedContent: string | undefined;
  let translatedTo: string | undefined;

  if (autoTranslate && targetLanguage) {
    try {
      if (aiClient) {
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Translate the following chat message to ${targetLanguage}. Maintain conversational nuance, warmth, and friendly tone. Return ONLY the translated string without commentary:\n"${String(content)}"`
        });
        translatedContent = response.text ? response.text.trim() : undefined;
        translatedTo = targetLanguage;
      } else {
        translatedContent = `[Translated to ${targetLanguage}]: ${String(content)}`;
        translatedTo = targetLanguage;
      }
    } catch (err) {
      console.warn('AI translation fallback:', err);
      translatedContent = String(content);
    }
  }

  const msg = store.sendMessage(id, String(content).trim(), authUser, translatedContent, translatedTo);
  res.json({ success: true, message: msg, conversation: store.conversations.find(c => c.id === id) });
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
  const article: any = {
    id: `art_${Date.now()}`,
    authorId: store.currentUser.id,
    author: {
      displayName: store.currentUser.displayName,
      username: store.currentUser.username,
      avatar: store.currentUser.avatar,
      countryCode: store.currentUser.location.countryCode
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
  res.json({ success: true, videos: store.videos });
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
  res.json({ success: true, models: aiGateway.getModels() });
});

app.get('/api/ai/ollama/roles', (req, res) => {
  res.json({ success: true, ...aiGateway.getOllamaRoleAssignment() });
});

app.post('/api/ai/ollama/roles', (req, res) => {
  const { chatModel, crawlerModel } = req.body;
  const updated = aiGateway.setOllamaRoles(chatModel, crawlerModel);
  res.json({ success: true, ...updated });
});

app.get('/api/ai/stats', (req, res) => {
  const models = aiGateway.getModels();
  const totalCalls = models.reduce((acc, m) => acc + m.totalCalls, 0);
  const totalTokens = models.reduce((acc, m) => acc + m.totalTokens, 0);
  res.json({ success: true, totalCalls, totalTokens, models });
});

app.post('/api/ai/chat', async (req, res) => {
  const { prompt, messages, history, modelId, model, mode = 'general', apiKey, baseUrl, customModel, stream } = req.body;

  // If the user supplied a custom API key, register it as the custom provider
  // and route this request through it.
  if (apiKey) {
    aiGateway.registerCustomProvider(apiKey, baseUrl, customModel);
  }

  const resolvedModelId = apiKey
    ? 'custom'
    : (modelId || model || aiGateway.getChatModelId());
  const userPrompt = prompt || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');
  if (!userPrompt) return res.status(400).json({ success: false, error: 'Prompt or message content is required' });
  const conversationHistory = normalizeConversationHistory(history);
  const contextualPrompt = buildConversationPrompt(userPrompt, conversationHistory);

  const systemInstructions: Record<string, string> = {
    general: 'You are a general-purpose assistant, not a branded persona. Answer the current question directly in the user’s language. For follow-ups, prioritize the latest relevant conversation turns and honor the user’s constraints. Do not introduce unrelated themes or claim abilities you do not have. Keep simple answers concise; expand only when the user asks. Be accurate and say when uncertain.',
    translator: 'You are the Project Earth Polyglot Translator. Translate with native fidelity, preserving emotional nuance and cultural context.',
    writer: 'You are the Project Earth Creator Assistant. Help author eloquent global essays, articles, poetry, and stories.',
    tutor: 'You are the Project Earth International Language Coach. Help the user master natural conversation, idioms, and pronunciation.'
  };

  const systemPrompt = systemInstructions[mode] || systemInstructions.general;
  const shouldStream = stream === true && /^ollama:qwen3(?::|$)/i.test(resolvedModelId);
  if (shouldStream) {
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.flushHeaders();
    try {
      const result = await aiGateway.generateContent(
        resolvedModelId,
        userPrompt,
        systemPrompt,
        token => res.write(`${JSON.stringify({ delta: token })}\n`),
        conversationHistory
      );
      if (result.success) {
        res.write(`${JSON.stringify({ done: true, tokens: result.tokens, model: resolvedModelId })}\n`);
      } else {
        res.write(`${JSON.stringify({ error: result.errorMessage || 'AI 服务当前不可用，请稍后重试。' })}\n`);
      }
    } catch (error) {
      res.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'AI 服务当前不可用，请稍后重试。' })}\n`);
    }
    return res.end();
  }

  const usesStructuredHistory = /^ollama:qwen3(?::|$)/i.test(resolvedModelId);
  const result = await aiGateway.generateContent(
    resolvedModelId,
    usesStructuredHistory ? userPrompt : contextualPrompt,
    systemPrompt,
    undefined,
    conversationHistory
  );

  if (result.success) {
    res.json({
      success: true,
      reply: result.content,
      message: {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString()
      },
      tokens: result.tokens,
      model: resolvedModelId
    });
  } else {
    res.status(result.errorMessage?.includes('429') ? 429 : 503).json({
      success: false,
      error: result.errorMessage || 'AI 服务当前不可用，请检查服务端模型配置或稍后重试。'
    });
  }
});

app.post('/api/ai/translate', async (req, res) => {
  const { text, targetLang = 'English' } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Text required' });

  const prompt = `Translate the following text to ${targetLang}. Return ONLY the direct natural translation:\n"${text}"`;
  const result = await aiGateway.generateContent('', prompt);

  if (result.success) {
    res.json({ success: true, translation: result.content.trim() });
  } else {
    res.json({ success: false, error: result.errorMessage || 'Translation failed' });
  }
});

// -------------------------------------------------------------
// 7b. VENUS PLANET MUSIC UNIVERSE & FIXED AUDIO CRAWLER
// -------------------------------------------------------------
app.get('/api/music/tracks', (req, res) => {
  const { genre } = req.query;
  const tracks = musicStore.getTracks(typeof genre === 'string' ? genre : undefined);
  res.json({ success: true, tracks });
});

async function searchOnlineMusicStreams(query: string): Promise<any[]> {
  if (!query || !query.trim()) return [];
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const start = html.indexOf('ytInitialData = ');
    if (start === -1) return [];
    const jsonStart = start + 'ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end === -1) return [];
    const jsonStr = html.slice(jsonStart, end);
    const data = JSON.parse(jsonStr);
    const sectionList = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const tracks: any[] = [];
    for (const section of sectionList) {
      const items = section.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item.videoRenderer;
        if (!v || !v.videoId) continue;
        const videoId = v.videoId;
        const title = v.title?.runs?.[0]?.text || 'Untitled Track';
        const artist = v.ownerText?.runs?.[0]?.text || 'YouTube Music';
        const durationText = v.lengthText?.simpleText || '3:30';
        let durationSeconds = 210;
        const parts = durationText.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          durationSeconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        tracks.push({
          id: `yt_${videoId}`,
          videoId,
          title,
          artist,
          album: 'Cosmic Music Stream',
          genre: 'Stream',
          durationSeconds,
          durationFormatted: durationText,
          coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: 'YouTube Music',
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          license: 'Standard YouTube License (In-Page Stream)',
          views: v.viewCountText?.simpleText || '0 views',
          bpm: 90
        });
        if (tracks.length >= 20) break;
      }
      if (tracks.length >= 20) break;
    }
    return tracks;
  } catch (err) {
    console.warn('Online music search error:', err);
    return [];
  }
}

app.get('/api/music/search', async (req, res) => {
  const { q, genre } = req.query;
  const queryStr = typeof q === 'string' ? q.trim() : '';
  const genreStr = typeof genre === 'string' ? genre : undefined;

  if (!queryStr) {
    const results = musicStore.searchTracks('', genreStr);
    return res.json({ success: true, query: '', count: results.length, tracks: results });
  }

  try {
    const onlineTracks = await searchOnlineMusicStreams(queryStr);
    const localResults = musicStore.searchTracks(queryStr, genreStr);
    const merged = [...onlineTracks, ...localResults];
    const uniqueTracks = merged.filter((t, idx, self) =>
      idx === self.findIndex(s => s.id === t.id || (s.videoId && s.videoId === t.videoId))
    );
    res.json({
      success: true,
      query: queryStr,
      count: uniqueTracks.length,
      tracks: uniqueTracks
    });
  } catch (err: any) {
    const fallbackResults = musicStore.searchTracks(queryStr, genreStr);
    res.json({
      success: true,
      query: queryStr,
      count: fallbackResults.length,
      tracks: fallbackResults
    });
  }
});

app.get('/api/music/youtube-search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  if (q.length > 200) return res.status(400).json({ success: false, error: 'Search query must be 200 characters or fewer' });
  const limit = Math.max(1, Math.min(24, Number(req.query.limit) || 12));
  try {
    const direct = resolveMusicEmbedUrl(q);
    const tracks = direct ? [direct] : await searchYouTubeMusic(q, limit);
    res.json({ success: true, query: q, tracks, mode: direct ? 'embed-url' : 'search' });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Music search failed' });
  }
});

app.get('/api/bilibili/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 20));
  try {
    const results = await searchBilibiliVideos(q, limit);
    res.json({ success: true, query: q, count: results.length, results, videos: results });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Bilibili search failed' });
  }
});

app.post('/api/music/crawl', async (req, res) => {
  const { sourceDomain, keyword } = req.body;
  try {
    const result = await musicStore.crawlExternalMusic(sourceDomain, keyword);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Music crawl failed' });
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

  let recordLocator: { id?: string; identifier?: string; pageTitle?: string };
  if (source === 'archive') {
    const archiveId = typeof identifier === 'string' ? identifier : typeof externalId === 'string' ? externalId : '';
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
    recordLocator = { pageTitle: title };
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
    if (!record.canImport || ![RightsCategory.PUBLIC_DOMAIN, RightsCategory.OPEN_LICENSE].includes(record.rights)) {
      return res.status(403).json({ success: false, error: 'Local import is blocked because explicit public-domain or open-license rights were not confirmed. Use the official source link instead.' });
    }

    let fullText: { title: string; author: string; chapters: { title: string; content: string }[] };
    const hasText = !!record.textUrl || source === 'archive';
    if (hasText) {
      const textResult = await connector.getFullText(locator);
      if (textResult.status !== 'ok' || !textResult.data) {
        const status = textResult.status === 'unsupported' ? 403 : 502;
        return res.status(status).json({ success: false, error: textResult.reason || 'Provider did not make readable full text available' });
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
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });

  try {
    const extracted = await fetchAndExtract(url);
    res.json({ success: true, ...extracted, hostname: new URL(url).hostname });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Unable to fetch this URL' });
  }
});

// Interactive Web Content Proxy for Browser Viewport
app.get('/api/browser/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('URL query parameter required');
  }

  try {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return res.status(400).send('Invalid URL format');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).send('Only HTTP and HTTPS URLs are supported');
    }

    // Block private/loopback/cloud metadata IP ranges
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname === '169.254.169.254'
    ) {
      return res.status(403).send('Forbidden destination');
    }

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
// 8c. GLOBAL UNIFIED SEARCH (across all modules)
// -------------------------------------------------------------
app.get('/api/search/global', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  const lower = q.toLowerCase();

  const users = store.users
    .filter(u =>
      u.displayName.toLowerCase().includes(lower) ||
      u.username.toLowerCase().includes(lower) ||
      (u.location?.countryName || '').toLowerCase().includes(lower)
    )
    .slice(0, 5);

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
    results: { users: users.map(toPublicUser), posts, books, communities, knowledge, resources: discovery }
  });
});

// -------------------------------------------------------------
// 9. VITE SPA MIDDLEWARE INTEGRATION
// -------------------------------------------------------------
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌍 地球计划 Server listening on http://0.0.0.0:${PORT}`);
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
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
