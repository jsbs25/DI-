import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { store, stripBookContent } from './server/store.ts';
import { toPublicUser } from './server/privacy.ts';
import { aiGateway } from './server/aiGateway.ts';
import { buildConversationPrompt, normalizeConversationHistory } from './server/aiConversation.ts';
import { cacheJupiterSearch, getCachedJupiterSearch, getJupiterEarthContent, mergeAndRankJupiterResults, searchEarthAudio, searchEarthImages, searchEarthIndex, type JupiterResult } from './server/jupiterSearch.ts';
import { buildReadingPrompt, resolveReadingEvidence } from './server/libraryReadingAi.ts';
import { EpubArchiveError, fetchAllowedEpubResponse, isSyntacticallyValidEpubCfi, readBoundedEpubArchive } from './server/libraryEpubSecurity.ts';
import { fetchAndExtract, searchGitHubRepositories, searchGoogleCategory, searchGoogleImages, searchWeb, searchWebProviders, type JupiterExternalSearchCategory, type SearchResult } from './server/webFetcher.ts';
import { getLibraryConnector, isLibraryConnectorEnabled, libraryConnectors, RightsCategory, searchLibrary, type LibrarySource } from './server/integrations/libraries/index.ts';
import { runBookHarvest } from './server/bookHarvester.ts';
import {
  searchKnowledge,
  getAllKnowledgeNodes,
  getKnowledgeNode,
  getRelatedNodes,
  getKnowledgeNodeByCountry
} from './server/knowledgeGraph.ts';
import { musicStore } from './server/musicStore.ts';

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
  res.json({ success: true, conversations: store.conversations });
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const msgs = store.messages.filter(m => m.conversationId === req.params.id);
  res.json({ success: true, messages: msgs });
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, targetLanguage, autoTranslate } = req.body;
  if (!content) return res.status(400).json({ success: false, error: 'Message cannot be empty' });

  let translatedContent: string | undefined;
  let translatedTo: string | undefined;

  if (autoTranslate && targetLanguage) {
    try {
      if (aiClient) {
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Translate the following chat message to ${targetLanguage}. Maintain conversational nuance, warmth, and friendly tone. Return ONLY the translated string without commentary:\n"${content}"`
        });
        translatedContent = response.text ? response.text.trim() : undefined;
        translatedTo = targetLanguage;
      } else {
        translatedContent = `[Translated to ${targetLanguage}]: ${content}`;
        translatedTo = targetLanguage;
      }
    } catch (err) {
      console.warn('AI translation fallback:', err);
      translatedContent = content;
    }
  }

  const authUser = getAuthUser(req);
  const msg = store.sendMessage(req.params.id, content, authUser, translatedContent, translatedTo);
  res.json({ success: true, message: msg });
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

app.get('/api/music/search', (req, res) => {
  const { q, genre } = req.query;
  const queryStr = typeof q === 'string' ? q : '';
  const genreStr = typeof genre === 'string' ? genre : undefined;
  const results = musicStore.searchTracks(queryStr, genreStr);
  res.json({ success: true, query: queryStr, count: results.length, tracks: results });
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
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'url required' });
  }
  // Restrict transport to known library hosts; item-level rights are a separate check.
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }
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
// Admin library management
// -------------------------------------------------------------
app.put('/api/library/books/:id', (req, res) => {
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
  const removed = store.deleteBook(req.params.id);
  res.json({ success: removed });
});

// -------------------------------------------------------------
// Personal bookshelf
// -------------------------------------------------------------
app.get('/api/library/shelf', (req, res) => {
  const user = getAuthUser(req);
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
  const user = getAuthUser(req);
  const { bookId, status } = req.body;
  if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });
  const item = store.addToBookShelf(user.id, bookId, status || 'want_to_read');
  res.json({ success: true, item });
});

app.delete('/api/library/shelf/:bookId', (req, res) => {
  const user = getAuthUser(req);
  const removed = store.removeFromBookShelf(user.id, req.params.bookId);
  res.json({ success: removed });
});

app.post('/api/library/shelf/:bookId/progress', (req, res) => {
  const user = getAuthUser(req);
  const { progress } = req.body;
  const item = store.updateBookShelfProgress(user.id, req.params.bookId, Number(progress) || 0);
  res.json({ success: !!item, item });
});

app.post('/api/library/shelf/:bookId/reading-state', (req, res) => {
  const user = getAuthUser(req);
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
  const { chapterId, selectedText, note, aiExplanation } = req.body;
  if (!selectedText) return res.status(400).json({ success: false, error: 'Selected text required' });
  const ann = store.addAnnotation(req.params.id, chapterId, selectedText, note || '', aiExplanation);
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

app.get('/api/jupiter/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 300) {
    return res.status(400).json({ success: false, error: 'Search query must contain 1–300 characters.' });
  }
  const lang = req.query.lang === 'zh' || req.query.lang === 'ar' || req.query.lang === 'es' ||
    req.query.lang === 'fr' || req.query.lang === 'ru' ? req.query.lang : 'en';
  const engine = req.query.engine === 'bing' || req.query.engine === 'duckduckgo' ||
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
    } else {
      const verticalSearch = await searchGoogleCategory(q, category as JupiterExternalSearchCategory, 20, lang);
      if (!verticalSearch.configured) {
        return res.status(503).json({
          success: false,
          error: `${category} 搜索尚未配置。请在服务端设置 SERPER_API_KEY；不会用普通网页结果冒充该分类结果。`
        });
      }
      const indexedResults = searchEarthIndex(q, store, 50);
      internalResults = category === 'videos'
        ? indexedResults.filter(result => result.kind === 'video').slice(0, 10)
        : category === 'books'
          ? indexedResults.filter(result => result.kind === 'book').slice(0, 10)
          : category === 'audio'
            ? searchEarthAudio(q, store, 10)
            : [];
      externalResults = verticalSearch.results;
    }
    const enrichedExternal = externalResults.map((result, index) => {
      let domain = '';
      try { domain = new URL(result.sourceUrl || result.url).hostname.replace(/^www\./, ''); } catch { /* Invalid provider links are removed below. */ }
      return {
        ...result,
        id: `web:${domain}:${index}:${result.url}`,
        source: result.source === 'github' ? 'github' as const : 'web' as const,
        kind: 'web' as const,
        domain
      };
    }).filter(result => Boolean(result.domain));
    const results = mergeAndRankJupiterResults(q, [...internalResults, ...enrichedExternal], 20);
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

  res.json({
    success: true,
    query: q,
    results: { users: users.map(toPublicUser), posts, books, communities, knowledge }
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
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
