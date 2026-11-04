import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { store } from './server/store.ts';
import { aiGateway } from './server/aiGateway.ts';
import { fetchAndExtract, searchWeb, searchBooks, searchWikisource, fetchBookFullText, fetchWikisourceFullText } from './server/webFetcher.ts';
import { runBookHarvest } from './server/bookHarvester.ts';
import {
  searchKnowledge,
  getAllKnowledgeNodes,
  getKnowledgeNode,
  getRelatedNodes,
  getKnowledgeNodeByCountry
} from './server/knowledgeGraph.ts';

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
// 7. EARTH ONE UNIFIED AI GATEWAY & MULTI-MODEL DISPATCH
// -------------------------------------------------------------
app.get('/api/ai/models', (req, res) => {
  res.json({ success: true, models: aiGateway.getModels() });
});

app.get('/api/ai/stats', (req, res) => {
  const models = aiGateway.getModels();
  const totalCalls = models.reduce((acc, m) => acc + m.totalCalls, 0);
  const totalTokens = models.reduce((acc, m) => acc + m.totalTokens, 0);
  res.json({ success: true, totalCalls, totalTokens, models });
});

app.post('/api/ai/chat', async (req, res) => {
  const { prompt, messages, modelId, model, mode = 'general', apiKey, baseUrl, customModel } = req.body;

  // If the user supplied a custom API key, register it as the custom provider
  // and route this request through it.
  if (apiKey) {
    aiGateway.registerCustomProvider(apiKey, baseUrl, customModel);
  }

  const resolvedModelId = apiKey
    ? 'custom'
    : (modelId || model || 'deepseek-v3');
  const userPrompt = prompt || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');
  if (!userPrompt) return res.status(400).json({ success: false, error: 'Prompt or message content is required' });

  const systemInstructions: Record<string, string> = {
    general: 'You are EARTH ONE AI, the next-generation global intelligence system for humanity. Your philosophy is: ONE EARTH. ONE WORLD. ONE HUMANITY. Answer warmly, knowledgeably, and with global cross-cultural perspective.',
    translator: 'You are the Earth One Polyglot Translator. Translate with native fidelity, preserving emotional nuance and cultural context.',
    writer: 'You are the Earth One Creator Assistant. Help author eloquent global essays, articles, poetry, and stories.',
    tutor: 'You are the Earth One International Language Coach. Help the user master natural conversation, idioms, and pronunciation.'
  };

  const systemPrompt = systemInstructions[mode] || systemInstructions.general;
  const result = await aiGateway.generateContent(resolvedModelId, userPrompt, systemPrompt);

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
// 8. DIGITAL LIBRARY (CHAPTER 5)
// -------------------------------------------------------------

// Search public-domain books online (Gutenberg + Chinese Wikisource)
app.get('/api/library/search', async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Search query required' });
  }
  try {
    // Run both sources in parallel
    const [gutenberg, wikisource] = await Promise.all([
      searchBooks(q, 8),
      searchWikisource(q, 6)
    ]);
    const results = [...gutenberg, ...wikisource];
    res.json({ success: true, query: q, results });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Book search failed' });
  }
});

// Download a book's full text and save it to the library
app.post('/api/library/ingest', async (req, res) => {
  const { textUrl, pageTitle, epubUrl, source, title, author, coverImage, description, language } = req.body;

  try {
    let fullText: { title: string; author: string; chapters: { title: string; content: string }[] };
    let bookId: string;
    let sourceLabel: 'Project Gutenberg' | 'Internet Archive' | 'Open Library' | 'Open Access';

    if (source === 'wikisource' && pageTitle) {
      fullText = await fetchWikisourceFullText(pageTitle);
      bookId = `wikisource_${Date.now()}`;
      sourceLabel = 'Open Access';
    } else if (textUrl) {
      fullText = await fetchBookFullText(textUrl);
      bookId = `gutenberg_${Date.now()}`;
      sourceLabel = 'Project Gutenberg';
    } else if (epubUrl) {
      // EPUB-only book (no plain text) — create a minimal placeholder
      fullText = { title: title || 'Untitled', author: author || 'Unknown', chapters: [] };
      bookId = `gutenberg_${Date.now()}`;
      sourceLabel = 'Project Gutenberg';
    } else {
      return res.status(400).json({ success: false, error: 'textUrl, pageTitle, or epubUrl required' });
    }

    const book: import('./src/types/index.ts').Book = {
      id: bookId,
      title: title || fullText.title,
      author: author || fullText.author,
      category: 'literature',
      language: language || 'en',
      source: sourceLabel,
      coverImage,
      description: description || `Full public-domain text of ${fullText.title}.`,
      readProgress: 0,
      chapters: fullText.chapters.map((ch, i) => ({
        id: `ch${i + 1}`,
        title: ch.title,
        content: ch.content
      })),
      epubUrl: epubUrl || undefined,
      formatType: epubUrl ? 'epub' : 'text',
      copyrightStatus: 'public_domain'
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
  // Only allow known legal public-domain hosts
  let host: string;
  try { host = new URL(url).hostname; } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }
  const allowed = ['www.gutenberg.org', 'gutenberg.org', 'archive.org', 'openlibrary.org'];
  if (!allowed.some(h => host === h || host.endsWith('.' + h))) {
    return res.status(403).json({ success: false, error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': 'EARTH-ONE-Library/1.0' } });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ success: false, error: `Upstream ${upstream.status}` });
    }
    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Stream the bytes to the client
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
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
      return book ? { ...item, book } : null;
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
  res.json({ success: true, books });
});

app.get('/api/library/books/:id', (req, res) => {
  const book = store.books.find(b => b.id === req.params.id);
  if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
  const annotations = store.getAnnotations(book.id);
  res.json({ success: true, book, annotations });
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
    results: { users, posts, books, communities, knowledge }
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
    console.log(`🌍 EARTH ONE Server listening on http://0.0.0.0:${PORT}`);
  });

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

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
