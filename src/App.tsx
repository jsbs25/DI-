import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import type { User, Post, GlobeUserNode, GlobeCountryStat, Conversation, CreatorArticle, VideoItem, Community, Language } from './types/index.ts';
import { translations } from './i18n/translations.ts';
import { Navbar } from './components/layout/Navbar.tsx';
import { CommandPalette } from './components/layout/CommandPalette.tsx';
import { OneHome } from './components/home/OneHome.tsx';
import { GlobalMessenger, type MessengerQuickAction } from './components/chat/GlobalMessenger.tsx';
import { FloatingCommWidget } from './components/chat/FloatingCommWidget.tsx';
import { UserProfileModal } from './components/profile/UserProfileModal.tsx';
import { LuxuryAdBanner } from './components/commercial/LuxuryAdBanner.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { OnboardingModal } from './components/auth/OnboardingModal.tsx';
import { AccountSecurityModal } from './components/auth/AccountSecurityModal.tsx';
import { HolographicAICompanion } from './components/ai/HolographicAICompanion.tsx';
import { ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import { CinematicIntro } from './components/intro/CinematicIntro.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { OfflineIndicator } from './components/layout/OfflineIndicator.tsx';
import { ParadiseBrandEmblem } from './components/brand/ParadiseBrandEmblem.tsx';
import { PlayerProvider } from './music/PlayerContext.tsx';
import type { LibraryAgentAction, SaturnAgentAction, VenusAgentAction } from './utils/oneAgentController.ts';
import { uiStateManager, useAgentUiState } from './agent/uiStateManager.ts';
import { initWebVitalsMonitor } from './utils/webVitalsMonitor.ts';
import {
  registerAgentClientHandlers,
  pauseActiveSpiritTask,
  type LearningAgentAction,
} from './agent/agentClient.ts';

// Lazy-loaded workspaces for optimal LCP / INP / mobile bundle performance
const AIHub = lazy(() => import('./components/ai/AIHub.tsx').then(m => ({ default: m.AIHub })));
const DigitalLibrary = lazy(() => import('./components/library/DigitalLibrary.tsx').then(m => ({ default: m.DigitalLibrary })));
const ArabicLearningHub = lazy(() => import('./components/learning/ArabicLearningHub.tsx').then(m => ({ default: m.ArabicLearningHub })));
const VenusMusicSpace = lazy(() => import('./universe/VenusMusicSpace.tsx').then(m => ({ default: m.VenusMusicSpace })));
const WebBrowser = lazy(() => import('./components/browser/WebBrowser.tsx').then(m => ({ default: m.WebBrowser })));
const SaturnSpace = lazy(() => import('./universe/SaturnSpace.tsx').then(m => ({ default: m.SaturnSpace })));
const MercurySearch = lazy(() => import('./components/search/MercurySearch.tsx').then(m => ({ default: m.MercurySearch })));
const MoonSpaceObservatory = lazy(() => import('./universe/MoonSpaceObservatory.tsx').then(m => ({ default: m.MoonSpaceObservatory })));
const MoonAcademy = lazy(() => import('./universe/MoonAcademy.tsx').then(m => ({ default: m.MoonAcademy })));
const KnowledgeUniverse = lazy(() => import('./components/knowledge/KnowledgeUniverse.tsx').then(m => ({ default: m.KnowledgeUniverse })));
const GlobalFeed = lazy(() => import('./components/social/GlobalFeed.tsx').then(m => ({ default: m.GlobalFeed })));
const CreatorHub = lazy(() => import('./components/creator/CreatorHub.tsx').then(m => ({ default: m.CreatorHub })));
const VideoCenter = lazy(() => import('./components/video/VideoCenter.tsx').then(m => ({ default: m.VideoCenter })));
const GameCenter = lazy(() => import('./components/games/GameCenter.tsx').then(m => ({ default: m.GameCenter })));
const CommunityList = lazy(() => import('./components/community/CommunityList.tsx').then(m => ({ default: m.CommunityList })));
const CrawlerDashboard = lazy(() => import('./components/crawler/CrawlerDashboard.tsx').then(m => ({ default: m.CrawlerDashboard })));
const OneNetworkCenter = lazy(() => import('./components/network/OneNetworkCenter.tsx').then(m => ({ default: m.OneNetworkCenter })));
const BrandIdentitySystem = lazy(() => import('./components/brand/BrandIdentitySystem.tsx').then(m => ({ default: m.BrandIdentitySystem })));

const WorkspaceFallback: React.FC = () => (
  <div className="flex min-h-[60dvh] w-full items-center justify-center bg-[var(--color-one-bg)] text-[var(--color-one-text-muted)]">
    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-one-accent)]" />
  </div>
);

export default function App() {
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('nointro') === '1') return false;
      if (params.get('intro') === '1') return true;
      return !localStorage.getItem('earth-one-intro-seen');
    } catch { return false; }
  });
  const [introGestureUnlocked, setIntroGestureUnlocked] = useState(false);
  const [lang, setLang] = useState<Language>('zh');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('earth-one-theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch { return 'light'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try { localStorage.setItem('earth-one-theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const t = translations[lang] || translations.zh;
  const normalizeModule = (m: string | null | undefined): string => {
    const raw = (m || '').trim().toLowerCase();
    const alias: Record<string, string> = { search: 'library', ai: 'aihub', aihub: 'aihub', games: 'globe', studio: 'globe', academy: 'arabic-learning', learning: 'arabic-learning', arabic: 'arabic-learning', messages: 'chat', comm: 'chat', music: 'venus', discover: 'globe', universe: 'globe', spaces: 'globe', home: 'globe', vpn: 'network', proxy: 'network' };
    return alias[raw] || raw || 'globe';
  };
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const mod = params.get('module');
    if (mod) return normalizeModule(mod);
    if (params.get('conv')) return 'chat';
    if (window.location.pathname.startsWith('/jupiter/')) return 'browser';
    return 'globe';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [browserInitialQuery, setBrowserInitialQuery] = useState<string | null>(() =>
    window.location.pathname === '/jupiter/search' ? new URLSearchParams(window.location.search).get('q') : null
  );
  const [showGlobeTools, setShowGlobeTools] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [nodes, setNodes] = useState<GlobeUserNode[]>([]);
  const [countries, setCountries] = useState<GlobeCountryStat[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [articles, setArticles] = useState<CreatorArticle[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [profileModalUser, setProfileModalUser] = useState<User | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get('conv') || 'conv_global';
    } catch {
      return 'conv_global';
    }
  });
  const [focusCoordinates, setFocusCoordinates] = useState<{ lat: number; lng: number; timestamp?: number } | null>(null);
  const [welcomeToast, setWelcomeToast] = useState<string | null>(null);
  const [libraryFocusBookId, setLibraryFocusBookId] = useState<string | null>(null);
  const [libraryFocusSeq, setLibraryFocusSeq] = useState<number>(0);
  const [libraryFocusAutoRead, setLibraryFocusAutoRead] = useState<boolean>(false);
  const [knowledgeFocusNodeId, setKnowledgeFocusNodeId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [directOpenSeq, setDirectOpenSeq] = useState<number>(() => {
    try {
      return new URLSearchParams(window.location.search).get('conv') ? 1 : 0;
    } catch {
      return 0;
    }
  });
  const [messengerQuickAction, setMessengerQuickAction] = useState<MessengerQuickAction | null>(null);
  const [browserOpenProxySeq, setBrowserOpenProxySeq] = useState(0);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const [venusQuickAction, setVenusQuickAction] = useState<VenusAgentAction | null>(null);
  const [saturnQuickAction, setSaturnQuickAction] = useState<SaturnAgentAction | null>(null);
  const [libraryQuickAction, setLibraryQuickAction] = useState<LibraryAgentAction | null>(null);
  const [learningQuickAction, setLearningQuickAction] = useState<LearningAgentAction | null>(null);
  const [browserQuickSearch, setBrowserQuickSearch] = useState<{ seq: number; query: string } | null>(null);
  const agentSnap = useAgentUiState();

  const tabHistoryRef = useRef<string[]>([currentTab]);
  const currentTabRef = useRef<string>(currentTab);
  useEffect(() => { currentTabRef.current = currentTab; }, [currentTab]);
  const mobileChatOpenRef = useRef<boolean>(mobileChatOpen);
  useEffect(() => { mobileChatOpenRef.current = mobileChatOpen; }, [mobileChatOpen]);

  const navigateToTab = useCallback((nextTab: string) => {
    const normalized = normalizeModule(nextTab);
    if (normalized !== 'browser') setBrowserInitialQuery(null);
    if (normalized !== 'globe' && uiStateManager.getSnapshot().commDrawerOpen) {
      uiStateManager.setCommDrawerOpen(false);
    }
    setCurrentTab((prev) => {
      if (prev === normalized) return prev;
      tabHistoryRef.current = [...tabHistoryRef.current.slice(-20), normalized];
      try {
        window.history.pushState(
          { oneTab: normalized, oneHistoryIdx: tabHistoryRef.current.length - 1 },
          '',
          window.location.pathname + window.location.search
        );
      } catch {}
      return normalized;
    });
  }, []);

  const goBack = useCallback(() => {
    if (currentTabRef.current === 'chat' && mobileChatOpenRef.current) {
      window.dispatchEvent(new Event('one-messenger-close-chat'));
      return;
    }
    if (tabHistoryRef.current.length > 1) {
      const nextHistory = tabHistoryRef.current.slice(0, -1);
      const target = nextHistory[nextHistory.length - 1] || 'globe';
      tabHistoryRef.current = nextHistory;
      setCurrentTab(target);
      return;
    }
    tabHistoryRef.current = ['globe'];
    setCurrentTab('globe');
  }, []);

  const handleMobileChatChange = useCallback((open: boolean) => {
    setMobileChatOpen(open);
    if (open) {
      try {
        if (!window.history.state?.oneMobileChat) {
          window.history.pushState(
            { oneTab: currentTabRef.current, oneMobileChat: true },
            '',
            window.location.pathname + window.location.search
          );
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (currentTabRef.current === 'chat' && mobileChatOpenRef.current) {
        window.dispatchEvent(new Event('one-messenger-close-chat'));
        return;
      }
      if (tabHistoryRef.current.length > 1) {
        const nextHistory = tabHistoryRef.current.slice(0, -1);
        const target = nextHistory[nextHistory.length - 1] || 'globe';
        tabHistoryRef.current = nextHistory;
        setCurrentTab(target);
      } else if (currentTabRef.current !== 'globe') {
        tabHistoryRef.current = ['globe'];
        setCurrentTab('globe');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const updateViewport = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--one-vvh', `${Math.round(h)}px`);
      const narrow = window.innerWidth < 1024;
      setIsNarrowViewport(window.innerWidth < 768);
      const kbOpen = narrow && vv ? (window.innerHeight - vv.height > 140) : false;
      setIsMobileKeyboardOpen(kbOpen);
    };
    updateViewport();
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const isViewportWorkspace = ['chat', 'browser'].includes(currentTab);
  // Independent communication domain active when chat/communications UI is in focus
  const commsActive = currentTab === 'chat';
  const isSpaceExperience = isViewportWorkspace || ['globe', 'aihub', 'saturn', 'venus', 'mercury', 'moon', 'academy', 'library', 'arabic-learning', 'knowledge', 'network', 'settings', 'profile', 'call'].includes(currentTab);
  useEffect(() => { if (currentTab !== 'globe') setImmersive(false); }, [currentTab]);
  useEffect(() => { initWebVitalsMonitor(); }, []);

  useEffect(() => {
    if (currentTab === 'settings') setIsSecurityModalOpen(true);
    if (currentTab === 'profile' && currentUser) setProfileModalUser(currentUser);
  }, [currentTab, currentUser]);


  const refreshConversations = async () => { try { const res = await fetch('/api/conversations'); const data = await res.json(); if (data.success) setConversations(data.conversations || []); } catch {} };
  const refreshIntegrations = async () => { try { const res = await fetch('/api/integrations'); const data = await res.json(); if (data.success) setIntegrations(data.integrations || []); } catch {} };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authErr = params.get('auth_error');
    if (authErr) {
      const map: Record<string,string> = { wechat_unbound: '该微信账号尚未绑定 ONE 账户，请先使用已有账户登录后绑定。', wechat_state: '微信登录验证失败，请重试。', wechat_config: '微信登录尚未配置。', wechat_token: '微信授权失败。', wechat_profile: '未获取到微信身份信息。', wechat_failed: '微信登录失败。', google_unbound: '该 Google 账号尚未绑定 ONE 账户。', google_state: 'Google 登录验证失败。', google_config: 'Google 登录尚未配置。', google_token: 'Google 授权失败。', google_profile: '未获取到 Google 资料。', google_failed: 'Google 登录失败。' };
      setWelcomeToast(map[authErr] || `Login failed: ${authErr}`);
      setTimeout(() => setWelcomeToast(null), 6000);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if ((window.location.hash || '').startsWith('#auth=')) {
      try {
        const raw = window.location.hash.slice('#auth='.length);
        const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (json?.token) localStorage.setItem('earth_one_token', String(json.token));
        if (json?.user) setCurrentUser(json.user);
      } catch {}
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
    fetch('/api/auth/me').then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok && d?.success && d?.user) { setCurrentUser(d.user); if (d.user.hasCompletedOnboarding === false) setIsOnboardingModalOpen(true); } else { setCurrentUser(null); try { localStorage.removeItem('earth_one_token'); } catch {} } }).catch(() => {});
    fetch('/api/globe/nodes').then(r => r.json()).then(d => { if (d.success) setNodes(d.nodes); }).catch(() => {});
    fetch('/api/globe/countries').then(r => r.json()).then(d => { if (d.success) setCountries(d.countries); }).catch(() => {});
    fetch('/api/posts').then(r => r.json()).then(d => { if (d.success) setPosts(d.posts); }).catch(() => {});
    fetch('/api/conversations').then(r => r.json()).then(d => { if (d.success) setConversations(d.conversations || []); }).catch(() => {});
    fetch('/api/integrations').then(r => r.json()).then(d => { if (d.success) setIntegrations(d.integrations || []); }).catch(() => {});
    fetch('/api/articles').then(r => r.json()).then(d => { if (d.success) setArticles(d.articles); }).catch(() => {});
    fetch('/api/videos').then(r => r.json()).then(d => { if (d.success) setVideos(d.videos); }).catch(() => {});
    fetch('/api/communities').then(r => r.json()).then(d => { if (d.success) setCommunities(d.communities); }).catch(() => {});
  }, []);

  const handleLikePost = async (postId: string) => { try { const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' }); const data = await res.json(); if (data.success) setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: data.liked, likesCount: data.likesCount } : p)); } catch {} };
  const handleAddComment = async (postId: string, content: string) => { try { const res = await fetch(`/api/posts/${postId}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }); const data = await res.json(); if (data.success && data.post) setPosts(prev => prev.map(p => p.id === postId ? data.post : p)); } catch {} };
  const handleCreatePost = async (postData: { content: string; mediaUrl?: string; category: any }) => { try { const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postData) }); const data = await res.json(); if (data.success && data.post) setPosts(prev => [data.post, ...prev]); } catch {} };
  const handleCreateArticle = async (artData: any) => { try { const res = await fetch('/api/articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(artData) }); const data = await res.json(); if (data.success && data.article) setArticles(prev => [data.article, ...prev]); } catch {} };
  const handleToggleJoinCommunity = async (commId: string) => { try { const res = await fetch(`/api/communities/${commId}/join`, { method: 'POST' }); const data = await res.json(); if (data.success) setCommunities(prev => prev.map(c => c.id === commId ? { ...c, isJoined: data.isJoined, membersCount: data.membersCount } : c)); } catch {} };
  const handleToggleLocationPrivacy = async () => { try { const res = await fetch('/api/auth/toggle-location', { method: 'POST' }); const data = await res.json(); if (data.success && data.user) { setCurrentUser(data.user); const nodesRes = await fetch('/api/globe/nodes'); const nodesData = await nodesRes.json(); if (nodesData.success) setNodes(nodesData.nodes); } } catch {} };
  const handleUpdateProfile = async (userData: Partial<User>) => { try { const res = await fetch('/api/auth/update-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData) }); const data = await res.json(); if (data.success && data.user) setCurrentUser(data.user); } catch {} };
  const handleAuthSuccess = (user: User, token: string, isNewRegistration: boolean) => { try { if (token) localStorage.setItem('earth_one_token', token); } catch {} setIntroGestureUnlocked(true); setCurrentUser(user); void refreshConversations(); void refreshIntegrations(); let hasExplicitModule = false; try { const url = new URL(window.location.href); const m = url.searchParams.get('module'); if (m === 'brand') { url.searchParams.delete('module'); window.history.replaceState({}, '', url.pathname + url.search); navigateToTab('globe'); } else if (m || url.searchParams.get('conv')) { hasExplicitModule = true; } } catch {} if (isNewRegistration || user.hasCompletedOnboarding === false) setIsOnboardingModalOpen(true); else { setWelcomeToast(`Welcome back, ${user.displayName}!`); setTimeout(() => setWelcomeToast(null), 4000); if (!hasExplicitModule && user.location?.isPublic) { navigateToTab('globe'); setFocusCoordinates({ lat: user.location.lat, lng: user.location.lng, timestamp: Date.now() }); } } };
  const handleOnboardingComplete = async (updatedUser: User) => { setCurrentUser(updatedUser); setIsOnboardingModalOpen(false); const nodesRes = await fetch('/api/globe/nodes'); const nodesData = await nodesRes.json(); if (nodesData.success) setNodes(nodesData.nodes); setWelcomeToast(`Beacon active in ${updatedUser.location?.cityName || ''}`); setTimeout(() => setWelcomeToast(null), 5000); navigateToTab('globe'); setFocusCoordinates({ lat: updatedUser.location.lat, lng: updatedUser.location.lng, timestamp: Date.now() }); };
  const handleLogout = async () => { window.dispatchEvent(new Event('one-music-force-stop')); try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {} try { localStorage.removeItem('earth_one_token'); } catch {} setCurrentUser(null); setConversations([]); setIntegrations([]); setActiveConversationId('conv_global'); setWelcomeToast('Logged out.'); setTimeout(() => setWelcomeToast(null), 3000); };
  const handleSelectGlobeUser = (node: GlobeUserNode) => { const fullUser: User = { id: node.userId, username: node.userId, displayName: node.displayName, avatar: node.avatar, bio: node.latestThought || '', location: { countryCode: node.countryCode, countryName: node.countryName, cityName: node.cityName, lat: node.lat, lng: node.lng, isPublic: true }, interests: [], followersCount: 0, followingCount: 0, tipsReceived: 0, isOnline: node.isOnline, verified: true, joinedAt: '' } as any; setProfileModalUser(fullUser); };
  const handleOpenDirectChat = async (targetUser: User) => { const existing = conversations.find(c => c.type === 'direct' && c.participantIds?.includes(targetUser.id)); if (existing) { setActiveConversationId(existing.id); setDirectOpenSeq(s => s + 1); navigateToTab('chat'); return; } try { const res = await fetch('/api/conversations/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: targetUser.id }) }); const data = await res.json().catch(() => ({})); if (data.success) { if (Array.isArray(data.conversations)) setConversations(data.conversations); else await refreshConversations(); if (data.conversation?.id) setActiveConversationId(data.conversation.id); setDirectOpenSeq(s => s + 1); navigateToTab('chat'); return; } } catch {} setDirectOpenSeq(s => s + 1); navigateToTab('chat'); };
  const handleQuickCall = (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => {
    if (target.conversationId) setActiveConversationId(target.conversationId);
    setMessengerQuickAction({ seq: Date.now(), kind, targetUserId: target.targetUserId, conversationId: target.conversationId });
    if (currentTabRef.current === 'globe') {
      uiStateManager.setCommDrawerOpen(true);
    } else {
      navigateToTab('chat');
    }
  };
  const handleOpenConversationFromHome = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setMessengerQuickAction({ seq: Date.now(), kind: 'open_chat', conversationId });
    if (currentTabRef.current === 'globe') {
      uiStateManager.setCommDrawerOpen(true);
    } else {
      navigateToTab('chat');
    }
  };
  const handleOpenCallCenterFromHome = () => {
    setMessengerQuickAction({ seq: Date.now(), kind: 'open_calls' });
    navigateToTab('chat');
  };

  // Register unified ONE AI Agent frontend handlers & pause SQLite session on Communication Drawer open
  useEffect(() => {
    registerAgentClientHandlers({
      onNavigateTab: navigateToTab,
      onOpenBookById: (bookId, opts) => {
        setLibraryFocusBookId(bookId);
        setLibraryFocusAutoRead(opts?.autoRead !== false);
        setLibraryFocusSeq((s) => s + 1);
        navigateToTab('library');
      },
      onOpenBookAction: (opts) => {
        setLibraryQuickAction({
          seq: Date.now(),
          query: opts.query,
          autoOpen: true,
        });
        navigateToTab('library');
      },
      onOpenLanguageLesson: (action) => {
        setLearningQuickAction(action);
        navigateToTab('arabic-learning');
      },
      onBrowserSearchAction: (query) => {
        setBrowserQuickSearch({ seq: Date.now(), query });
        navigateToTab('browser');
      },
      onGlobalSearchAction: (query) => {
        setSearchQuery(query);
        navigateToTab('mercury');
      },
      onPlayMusicAction: (opts) => {
        if (opts.control === 'stop' || opts.control === 'pause') {
          window.dispatchEvent(new Event('one-music-force-stop'));
          return;
        }
        window.dispatchEvent(
          new CustomEvent('one-music-play-inline', {
            detail: { query: opts.query || '轻音乐 钢琴' },
          })
        );
      },
      onWatchDocumentaryAction: (opts) => {
        setSaturnQuickAction({
          seq: Date.now(),
          query: opts.query,
          platform: opts.platform,
          autoPlayRandom: opts.randomPick ?? true,
        });
        navigateToTab('saturn');
      },
      onSetTheme: setTheme,
      onSetLang: setLang,
      onFlyTo: (lat, lng) => {
        setFocusCoordinates({ lat, lng, timestamp: Date.now() });
        navigateToTab('globe');
      },
      onOpenCommDrawer: (convId) => {
        if (convId) {
          setActiveConversationId(convId);
          setMessengerQuickAction({ seq: Date.now(), kind: 'open_chat', conversationId: convId });
        }
        if (currentTabRef.current !== 'chat') {
          uiStateManager.setCommDrawerOpen(true);
        } else {
          navigateToTab('chat');
        }
      },
      onQuickCall: handleQuickCall,
      onOpenAuth: () => setIsAuthModalOpen(true),
      onOpenCommandPalette: () => setCommandOpen(true),
      onReplayIntro: () => {
        setIntroGestureUnlocked(true);
        setShowIntro(true);
      },
    });
  }, [navigateToTab]);

  useEffect(() => {
    if (agentSnap.commDrawerOpen) {
      void pauseActiveSpiritTask();
    }
  }, [agentSnap.commDrawerOpen]);

  // Handle interactive quick action buttons inside the Butterfly's ambient speech bubble
  useEffect(() => {
    const onSpiritQuickAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: string; query?: string }>).detail || {};
      if (detail.action === 'open_library') {
        navigateToTab('library');
      } else if (detail.action === 'play_music') {
        window.dispatchEvent(new CustomEvent('one-music-play-inline', { detail: { query: detail.query || '轻音乐 钢琴' } }));
      } else if (detail.action === 'next_music') {
        window.dispatchEvent(new CustomEvent('one-music-next-inline'));
      }
    };
    window.addEventListener('one-spirit-quick-action', onSpiritQuickAction);
    return () => window.removeEventListener('one-spirit-quick-action', onSpiritQuickAction);
  }, [navigateToTab]);

  const isMobileSubpage = currentTab !== 'globe';
  const mobileSubpageTitleMap: Record<string, string> = lang === 'ar'
    ? {
        feed: 'اكتشف',
        chat: 'الرسائل',
        venus: 'الموسيقى',
        saturn: 'زحل',
        mercury: 'البحث',
        moon: 'القمر',
        academy: 'الأكاديمية',
        'arabic-learning': 'تعلم العربية',
        library: 'المكتبة',
        knowledge: 'المعرفة',
        universe: 'الكون',
        aihub: 'الذكاء',
        browser: 'المتصفح',
        network: 'الشبكة',
        crawler: 'الزاحف',
        creator: 'المبدعون',
        video: 'الفيديو',
        game: 'الألعاب',
        community: 'المجتمعات',
        settings: 'الإعدادات',
        profile: 'الملف الشخصي',
        call: 'المكالمات',
        brand: 'الهوية',
      }
    : lang === 'en'
      ? {
          feed: 'Discover',
          chat: 'Messages',
          venus: 'Music',
          saturn: 'Saturn',
          mercury: 'Search',
          moon: 'Moon',
          academy: 'Academy',
          'arabic-learning': 'Learning',
          library: 'Library',
          knowledge: 'Knowledge',
          universe: 'Universe',
          aihub: 'AI Hub',
          browser: 'Browser',
          network: 'Network',
          crawler: 'Crawler',
          creator: 'Creator',
          video: 'Videos',
          game: 'Games',
          community: 'Communities',
          settings: 'Settings',
          profile: 'Profile',
          call: 'Calls',
          brand: 'Brand',
        }
      : {
          feed: '发现广场',
          chat: '信息与聊天',
          venus: '音乐空间',
          saturn: '土星空间',
          mercury: '全站搜索',
          moon: '月球观测站',
          academy: '月球学院',
          'arabic-learning': '语言学习',
          library: '数字图书馆',
          knowledge: '知识宇宙',
          universe: '太阳系宇宙',
          aihub: 'AI 中心',
          browser: '内置浏览器',
          network: '网络中心',
          crawler: '数据爬虫',
          creator: '创作者',
          video: '视频中心',
          game: '星际游戏',
          community: '全球社区',
          settings: '设置与安全',
          profile: '个人主页',
          call: '通话',
          brand: '品牌系统',
        };
  const mobileSubpageTitle = mobileSubpageTitleMap[currentTab] || currentTab;

  if (!currentUser) {
    if (currentTab === 'brand') {
      return (
        <>
          <OfflineIndicator lang={lang} />
          <Suspense fallback={<WorkspaceFallback />}>
            <BrandIdentitySystem
              lang={lang}
              onBackToGlobe={() => {
                setCurrentTab('globe');
                try {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('module');
                  window.history.replaceState({}, '', url.pathname + url.search);
                } catch {}
              }}
            />
          </Suspense>
        </>
      );
    }
    return (
      <>
        <OfflineIndicator lang={lang} />
        {welcomeToast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl eo-glass text-sky-700 dark:text-cyan-200 text-xs flex items-center gap-2"><Sparkles className="w-4 h-4" /><span>{welcomeToast}</span></div>}
        <LoginPage
          lang={lang}
          theme={theme}
          onToggleTheme={toggleTheme}
          onAuthSuccess={handleAuthSuccess}
          onOpenBrand={() => {
            setCurrentTab('brand');
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('module', 'brand');
              window.history.replaceState({}, '', url.pathname + url.search);
            } catch {}
          }}
        />
        <HolographicAICompanion
          lang={lang}
          theme={theme}
          isAuthenticated={false}
          currentTab={currentTab}
          placement="corner"
          onSetTheme={setTheme}
          onSetLang={setLang}
          onNavigateTab={(tab) => {
            if (tab === 'brand') {
              setCurrentTab('brand');
              try {
                const url = new URL(window.location.href);
                url.searchParams.set('module', 'brand');
                window.history.replaceState({}, '', url.pathname + url.search);
              } catch {}
            } else {
              setIsAuthModalOpen(true);
            }
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      </>
    );
  }

  return (
    <PlayerProvider>
    <div className="min-h-[100dvh] w-full max-w-full bg-[var(--color-one-bg)] text-[var(--color-one-text)] font-sans overflow-x-clip transition-colors">
      {showIntro && (
        <CinematicIntro
          lang={lang}
          gestureUnlocked={introGestureUnlocked}
          onComplete={() => {
            setShowIntro(false);
            try { localStorage.setItem('earth-one-intro-seen', '1'); } catch {}
          }}
          onAuthSuccess={handleAuthSuccess}
          currentUser={currentUser}
        />
      )}
      {welcomeToast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl border border-[#244e41]/18 dark:border-[#d6b77f]/24 bg-[#faf7f0]/92 dark:bg-[#121c27]/92 text-[#1d2e26] dark:text-[#f5f1e8] shadow-lg text-xs flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#247864] dark:text-[#d6b77f]" /><span>{welcomeToast}</span></div>}

      <Navbar
        currentTab={currentTab}
        immersive={immersive}
        hideBottomNav={isMobileKeyboardOpen || (isNarrowViewport && currentTab === 'chat' && mobileChatOpen)}
        onSelectTab={navigateToTab}
        lang={lang}
        onSelectLang={setLang}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentUser={currentUser}
        onOpenProfile={() => currentUser && setProfileModalUser(currentUser)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onLogout={handleLogout}
        onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
        onToggleLocationPrivacy={handleToggleLocationPrivacy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenBook={bookId => { setLibraryFocusBookId(bookId); navigateToTab('library'); }}
        onOpenKnowledge={nodeId => { setKnowledgeFocusNodeId(nodeId); navigateToTab('knowledge'); }}
        onReplayIntro={() => { setIntroGestureUnlocked(true); setShowIntro(true); }}
        onOpenCommand={() => setCommandOpen(true)}
      />

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} lang={lang} onSelectTab={navigateToTab} onSearch={(q) => { setSearchQuery(q); }} />

      <main
        style={isViewportWorkspace ? { height: 'var(--one-vvh, 100dvh)' } : undefined}
        className={`relative w-full max-w-full overflow-x-clip ${isViewportWorkspace ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}
      >
        <Suspense fallback={<WorkspaceFallback />}>
        {currentTab === 'globe' && (
          <OneHome
            lang={lang}
            currentUser={currentUser}
            nodes={nodes}
            countries={countries}
            posts={posts}
            videos={videos}
            articles={articles}
            conversations={conversations}
            focusCoordinates={focusCoordinates}
            onSelectCountry={code => { setActiveCountry(code); if (code) navigateToTab('feed'); }}
            onSelectUser={handleSelectGlobeUser}
            onSelectTab={navigateToTab}
            onOpenBook={bookId => { setLibraryFocusBookId(bookId); navigateToTab('library'); }}
            onQuickCall={handleQuickCall}
            onOpenConversation={handleOpenConversationFromHome}
            onOpenCallCenter={handleOpenCallCenterFromHome}
            immersive={immersive}
            onImmersiveChange={setImmersive}
            commsActive={commsActive}
          />
        )}

        {currentTab === 'saturn' && <div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><SaturnSpace lang={lang} onBack={goBack} quickAction={saturnQuickAction} /></div>}
        {currentTab === 'venus' && <div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><VenusMusicSpace lang={lang} onBack={goBack} quickAction={venusQuickAction} /></div>}
        {currentTab === 'mercury' && <div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><MercurySearch lang={lang} onBack={goBack} onOpenBook={bookId => { setLibraryFocusBookId(bookId); navigateToTab('library'); }} onOpenKnowledge={nodeId => { setKnowledgeFocusNodeId(nodeId); navigateToTab('knowledge'); }} onSelectTab={navigateToTab} /></div>}
        {currentTab === 'feed' && <div className="w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><GlobalFeed posts={posts} countries={countries} activeCountry={activeCountry} onSelectCountry={setActiveCountry} currentUser={currentUser} onLikePost={handleLikePost} onAddComment={handleAddComment} onCreatePost={handleCreatePost} onSelectUser={u => setProfileModalUser(u)} onFlyToCoordinates={(lat,lng) => { setFocusCoordinates({ lat, lng, timestamp: Date.now() }); navigateToTab('globe'); }} lang={lang} /></div>}
        {currentTab !== 'chat' && agentSnap.commDrawerOpen && (
          <div
            className="fixed inset-0 z-[77] bg-slate-950/28 backdrop-blur-[2px]"
            onClick={() => uiStateManager.setCommDrawerOpen(false)}
            aria-hidden="true"
          />
        )}
        <GlobalMessenger
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          currentUser={currentUser}
          lang={lang}
          integrations={integrations}
          onRefreshConversations={refreshConversations}
          onUserUpdate={(u) => { setCurrentUser(u); void refreshIntegrations(); }}
          directOpenSeq={directOpenSeq}
          isVisible={currentTab === 'chat' || agentSnap.commDrawerOpen}
          drawerMode={currentTab !== 'chat' && agentSnap.commDrawerOpen}
          workspaceClassName={
            currentTab !== 'chat' && agentSnap.commDrawerOpen
              ? 'fixed inset-y-0 right-0 z-[78] w-full max-w-[420px] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)] shadow-2xl border-l border-[var(--color-one-border)] bg-[var(--color-one-bg)] flex flex-col min-h-0'
              : `h-full w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] ${isNarrowViewport && mobileChatOpen ? 'pb-[env(safe-area-inset-bottom)]' : 'pb-[calc(4.65rem+env(safe-area-inset-bottom))]'} flex flex-col min-h-0`
          }
          quickAction={messengerQuickAction}
          onBackToHome={() => {
            if (currentTab !== 'chat' && agentSnap.commDrawerOpen) {
              uiStateManager.setCommDrawerOpen(false);
            } else {
              goBack();
            }
          }}
          onMobileChatChange={handleMobileChatChange}
        />
        {currentTab === 'aihub' && <div className="w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(4.85rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><AIHub lang={lang} /></div>}
        <div className={currentTab === 'library' ? 'block' : 'hidden'} aria-hidden={currentTab !== 'library'}><div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] flex flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><DigitalLibrary lang={lang} currentUser={currentUser} focusBookId={libraryFocusBookId} focusBookSeq={libraryFocusSeq} focusBookAutoRead={libraryFocusAutoRead} quickAction={libraryQuickAction} /></div></div>
        {currentTab === 'moon' && <div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><MoonSpaceObservatory lang={lang} onBack={goBack} /></div>}
        {currentTab === 'arabic-learning' && (
          <div className="w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)] min-h-[100dvh]">
            <ArabicLearningHub
              lang={lang}
              onOpenLibrary={() => navigateToTab('library')}
              quickAction={learningQuickAction}
            />
          </div>
        )}
        {currentTab === 'knowledge' && <div className="min-h-[100dvh] w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><KnowledgeUniverse lang={lang} focusNodeId={knowledgeFocusNodeId} onOpenLibrary={() => navigateToTab('library')} onOpenBook={bookId => { setLibraryFocusBookId(bookId); navigateToTab('library'); }} /></div>}
        <div className={currentTab === 'browser' ? 'block h-full' : 'hidden'} aria-hidden={currentTab !== 'browser'}><div className="h-full w-full max-w-full pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(4.65rem+env(safe-area-inset-bottom))] flex flex-col min-h-0 bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><WebBrowser lang={lang} initialQuery={browserInitialQuery ?? undefined} quickSearchRequest={browserQuickSearch} openProxySeq={browserOpenProxySeq} onBackToUniverse={() => navigateToTab('globe')} onBackToGlobe={() => navigateToTab('globe')} /></div></div>
        {currentTab === 'network' && (
          <OneNetworkCenter
            lang={lang}
            onOpenBrowserProxy={() => {
              setBrowserOpenProxySeq((s) => s + 1);
              navigateToTab('browser');
            }}
            onOpenCalls={() => navigateToTab('chat')}
          />
        )}
        {currentTab === 'crawler' && <div className="pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)] min-h-[100dvh]"><CrawlerDashboard lang={lang} /></div>}
        {currentTab === 'creator' && <div className="pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><CreatorHub articles={articles} onCreateArticle={handleCreateArticle} lang={lang} /></div>}
        {currentTab === 'video' && <div className="pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><VideoCenter videos={videos} lang={lang} /></div>}
        {currentTab === 'game' && <div className="pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)] min-h-[100dvh]"><GameCenter currentUser={currentUser} lang={lang} /></div>}
        {currentTab === 'community' && <div className="pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><CommunityList communities={communities} onToggleJoin={handleToggleJoinCommunity} lang={lang} /></div>}
        {currentTab === 'academy' && <div className="min-h-[100dvh] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><MoonAcademy lang={lang} currentUser={currentUser} onBack={goBack} /></div>}
        {currentTab === 'settings' && (
          <div className="min-h-[100dvh] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-6 sm:p-8 space-y-4 shadow-sm">
              <h1 className="text-xl font-semibold text-[var(--color-one-text)]">{lang==='zh'?'设置与安全':'Settings & Security'}</h1>
              <p className="text-sm text-[var(--color-one-text-muted)] leading-relaxed">{lang==='zh'?'账户、安全、隐私与绑定等设置已在「账户与安全」中统一管理。':'Account, security, privacy, and linking controls are managed in Account & Security.'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setIsSecurityModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-[var(--color-one-accent)] text-white text-sm font-medium cursor-pointer">Account &amp; Security</button>
                <button onClick={() => { if (currentUser) setProfileModalUser(currentUser); }} className="px-4 py-2.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface-soft)] text-[var(--color-one-text)] text-sm font-medium cursor-pointer">{lang==='zh'?'个人资料':'Profile'}</button>
              </div>
            </div>
          </div>
        )}
        {currentTab === 'profile' && (
          <div className="min-h-[100dvh] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-6 sm:p-8 space-y-4 shadow-sm">
              <h1 className="text-xl font-semibold text-[var(--color-one-text)]">{lang==='zh'?'个人主页':'Profile'}</h1>
              <p className="text-sm text-[var(--color-one-text-muted)] leading-relaxed">{lang==='zh'?'你的个人资料与地球信标通过资料面板管理。':'Manage your profile and globe beacon from your profile sheet.'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { if (currentUser) setProfileModalUser(currentUser); }} className="px-4 py-2.5 rounded-xl bg-[var(--color-one-accent)] text-white text-sm font-medium cursor-pointer">{lang==='zh'?'打开个人资料':'Open profile'}</button>
                <button onClick={() => setIsOnboardingModalOpen(true)} className="px-4 py-2.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface-soft)] text-[var(--color-one-text)] text-sm font-medium cursor-pointer">{lang==='zh'?'编辑地球信标':'Edit beacon'}</button>
              </div>
            </div>
          </div>
        )}
        {currentTab === 'call' && (
          <div className="min-h-[100dvh] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-6 sm:p-8 space-y-4 shadow-sm">
              <h1 className="text-xl font-semibold text-[var(--color-one-text)]">{lang==='zh'?'通话':'Calls'}</h1>
              <p className="text-sm text-[var(--color-one-text-muted)] leading-relaxed">{lang==='zh'?'你可以在通讯中心或右下角悬浮通信入口发起高清语音与视频通话，通话过程中不退出当前阅读或浏览页面。':'Start HD voice or video calls from Communications or the floating communication dock without leaving your current page.'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigateToTab('chat')} className="px-4 py-2.5 rounded-xl bg-[var(--color-one-accent)] text-white text-sm font-medium cursor-pointer">{lang==='zh'?'打开通讯中心':'Open Communications'}</button>
              </div>
            </div>
          </div>
        )}
        {currentTab === 'brand' && <div className="min-h-[100dvh] pt-[calc(3.35rem+env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] bg-[var(--color-one-bg)] text-[var(--color-one-text)]"><BrandIdentitySystem lang={lang} onBackToGlobe={goBack} /></div>}
        </Suspense>
      </main>

      {!isSpaceExperience && <div className="pb-[env(safe-area-inset-bottom)] md:pb-0"><LuxuryAdBanner lang={lang} /></div>}

      {profileModalUser && <UserProfileModal user={profileModalUser} currentUser={currentUser} onClose={() => setProfileModalUser(null)} onFollow={id => { fetch(`/api/users/${id}/follow`, { method: 'POST' }).catch(() => {}); }} onDirectMessage={handleOpenDirectChat} onUpdateProfile={handleUpdateProfile} lang={lang} />}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} lang={lang} />
      {currentUser && <AccountSecurityModal isOpen={isSecurityModalOpen} onClose={() => setIsSecurityModalOpen(false)} currentUser={currentUser} onUserUpdate={(u) => { setCurrentUser(u); void refreshIntegrations(); }} />}
      {currentUser && <OnboardingModal isOpen={isOnboardingModalOpen} user={currentUser} onComplete={handleOnboardingComplete} lang={lang} />}

      <HolographicAICompanion
        lang={lang}
        theme={theme}
        isAuthenticated={true}
        userName={currentUser.displayName || currentUser.username}
        userCity={currentUser.location?.cityName}
        showLauncher={currentTab !== 'aihub' && !immersive && !(isNarrowViewport && currentTab === 'chat' && mobileChatOpen)}
        placement="corner"
        onFlyTo={(lat, lng) => {
          setFocusCoordinates({ lat, lng, timestamp: Date.now() });
          navigateToTab('globe');
        }}
        onExploreUniverse={() => navigateToTab('library')}
        onOpenAIHub={() => navigateToTab('aihub')}
        onNavigateTab={navigateToTab}
        onPlayMusicAction={(opts) => {
          window.dispatchEvent(
            new CustomEvent('one-music-play-inline', {
              detail: { query: opts.query || '轻音乐 钢琴' },
            })
          );
        }}
        onOpenBookAction={(opts) => {
          setLibraryQuickAction({
            seq: Date.now(),
            query: opts.query,
            autoOpen: true,
          });
          navigateToTab('library');
        }}
        onWatchDocumentaryAction={(opts) => {
          setSaturnQuickAction({
            seq: Date.now(),
            query: opts.query,
            platform: opts.platform,
            autoPlayRandom: opts.randomPick ?? true,
          });
          navigateToTab('saturn');
        }}
        onBrowserSearchAction={(query) => {
          setBrowserQuickSearch({ seq: Date.now(), query });
          navigateToTab('browser');
        }}
        onGlobalSearchAction={(query) => {
          setSearchQuery(query);
          navigateToTab('mercury');
        }}
        onSetTheme={setTheme}
        onSetLang={setLang}
        onSetImmersive={setImmersive}
        onOpenCommandPalette={() => setCommandOpen(true)}
        onReplayIntro={() => { setIntroGestureUnlocked(true); setShowIntro(true); }}
        onCreatePost={handleCreatePost}
        onCreateArticle={handleCreateArticle}
        onFilterCountry={setActiveCountry}
        onToggleJoinCommunity={handleToggleJoinCommunity}
        onOpenBook={(bookId) => {
          setLibraryFocusBookId(bookId);
          navigateToTab('library');
        }}
        onOpenKnowledge={(nodeId) => {
          setKnowledgeFocusNodeId(nodeId);
          navigateToTab('knowledge');
        }}
        onOpenProfile={() => currentUser && setProfileModalUser(currentUser)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onToggleLocationPrivacy={handleToggleLocationPrivacy}
        onOpenMessages={(cid) => handleOpenConversationFromHome(cid || 'conv_global')}
        onOpenCalls={handleOpenCallCenterFromHome}
        onQuickCall={handleQuickCall}
        currentTab={currentTab}
      />

      {!isSpaceExperience && (
        <footer className="w-full border-t border-[#244e41]/12 dark:border-[#d6b77f]/14 bg-[#faf7f0]/88 dark:bg-[#111b26]/88 py-5 px-4 text-xs text-[#5d7066] dark:text-[#96a6ae]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ParadiseBrandEmblem variant="medallion" size={24} surface={theme === 'dark' ? 'dark' : 'light'} />
              <span className="font-semibold text-[#1d2e26] dark:text-[#f5f1e8] tracking-[0.14em]">EARTH ONE</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#5d7066] dark:text-[#96a6ae]"><span>{t.motto}</span><span className="flex items-center gap-1 text-[#247864] dark:text-[#d6b77f]"><ShieldCheck className="w-3.5 h-3.5" /><span>{t.locationPrivate}</span></span></div>
          </div>
        </footer>
      )}
      <FloatingCommWidget
        lang={lang}
        currentUser={currentUser}
        conversations={conversations}
        hidden={currentTab === 'globe' || currentTab === 'chat' || agentSnap.commDrawerOpen}
        onOpenDrawerChat={(convId) => {
          if (convId) {
            setActiveConversationId(convId);
            setMessengerQuickAction({ seq: Date.now(), kind: 'open_chat', conversationId: convId });
          }
          uiStateManager.setCommDrawerOpen(true);
        }}
        onOpenFullCenter={() => {
          uiStateManager.setCommDrawerOpen(false);
          navigateToTab('chat');
        }}
        onStartVoiceCall={(target) => {
          if (target.conversationId) setActiveConversationId(target.conversationId);
          setMessengerQuickAction({
            seq: Date.now(),
            kind: 'audio',
            targetUserId: target.targetUserId,
            conversationId: target.conversationId,
            startMinimized: true,
          });
        }}
      />

      <OfflineIndicator lang={lang} />
    </div>
    </PlayerProvider>
  );
}
