import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { store } from './server/store.ts';

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

// Helper to extract session token from header
function getAuthUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = store.getUserByToken(token);
    if (user) return user;
  }
  return store.currentUser;
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
  try {
    const { user, token } = store.loginUser(identifier, password);
    res.json({ success: true, user, token });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  res.json({ success: true, user });
});

app.get('/api/auth/current', (req, res) => {
  const user = getAuthUser(req);
  res.json({ success: true, user });
});

app.post('/api/auth/onboarding', (req, res) => {
  const user = getAuthUser(req);
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
  try {
    const authUser = getAuthUser(req);
    const updated = store.updateProfile(req.body, authUser?.id);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/toggle-location', (req, res) => {
  const user = getAuthUser(req);
  user.location.isPublic = !user.location.isPublic;
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
  res.json({ success: true, users: list });
});

app.get('/api/users/:id', (req, res) => {
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const userPosts = store.posts.filter(p => p.userId === req.params.id);
  res.json({ success: true, user, posts: userPosts });
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
// 7. EARTH ONE AI HUB API GATEWAY
// -------------------------------------------------------------
app.post('/api/ai/chat', async (req, res) => {
  const { prompt, model = 'gemini-3.8-flash', mode = 'general', useSearchGrounding = false } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

  const systemInstructions: Record<string, string> = {
    general: 'You are EARTH ONE AI, the next-generation global intelligence system for humanity. Your philosophy is: ONE EARTH. ONE WORLD. ONE HUMANITY. Answer warmly, knowledgeably, and with global cross-cultural perspective.',
    translator: 'You are the Earth One Polyglot Translator. Translate with native fidelity, preserving emotional nuance and cultural context.',
    writer: 'You are the Earth One Creator Assistant. Help author eloquent global essays, articles, poetry, and stories.',
    tutor: 'You are the Earth One International Language Coach. Help the user master natural conversation, idioms, and pronunciation.'
  };

  const systemPrompt = systemInstructions[mode] || systemInstructions.general;

  if (aiClient) {
    try {
      const config: any = {
        systemInstruction: systemPrompt
      };
      if (useSearchGrounding) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await aiClient.models.generateContent({
        model: model === 'gemini-2.5-pro' || model === 'gemini-4-argon' ? 'gemini-3.8-flash' : 'gemini-3.8-flash',
        contents: prompt,
        config
      });

      const text = response.text || 'No response generated.';
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

      return res.json({
        success: true,
        reply: text,
        model: 'gemini-3.8-flash',
        groundingChunks: groundingChunks || []
      });
    } catch (err: any) {
      console.warn('AI API call error, applying intelligent fallback:', err);
    }
  }

  // Graceful fallback when API key is missing or quota reached
  const fallbackReplies: Record<string, string> = {
    general: `EARTH ONE Core AI: Connecting hearts and minds across our shared planet. You asked: "${prompt}". Humanity thrives when knowledge, empathy, and cultural respect unite.`,
    translator: `Earth Polyglot: Ready to bridge any language barrier for your journey.`,
    writer: `Earth Creator: Your story can touch people on every continent. Focus on universal human emotions: hope, perseverance, and wonder.`,
    tutor: `Earth Language Coach: Practice makes fluency! Every greeting is a bridge to a new culture.`
  };

  res.json({
    success: true,
    reply: fallbackReplies[mode] || fallbackReplies.general,
    model: 'earth-one-resilient-core',
    groundingChunks: []
  });
});

app.post('/api/ai/translate', async (req, res) => {
  const { text, targetLang = 'English' } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Text required' });

  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Translate the following text to ${targetLang}. Return ONLY the direct natural translation:\n"${text}"`
      });
      return res.json({ success: true, translation: response.text ? response.text.trim() : text });
    } catch (err) {
      console.warn('AI translation call error:', err);
    }
  }

  res.json({ success: true, translation: `[${targetLang}]: ${text}` });
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
// 9. VITE SPA MIDDLEWARE INTEGRATION
// -------------------------------------------------------------
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌍 EARTH ONE Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
