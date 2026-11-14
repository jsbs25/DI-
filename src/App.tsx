import React, { useState, useEffect } from 'react';
import type { User, Post, GlobeUserNode, GlobeCountryStat, Conversation, CreatorArticle, VideoItem, Community, Language } from './types/index.ts';
import { translations } from './i18n/translations.ts';
import { Navbar } from './components/layout/Navbar.tsx';
import { AppDock } from './components/layout/AppDock.tsx';
import { CommandPalette } from './components/layout/CommandPalette.tsx';
import { DigitalGlobe } from './components/globe/DigitalGlobe.tsx';
import { OneHome } from './components/home/OneHome.tsx';
import { GlobalFeed } from './components/social/GlobalFeed.tsx';
import { GlobalMessenger } from './components/chat/GlobalMessenger.tsx';
import { AIHub } from './components/ai/AIHub.tsx';
import { CreatorHub } from './components/creator/CreatorHub.tsx';
import { VideoCenter } from './components/video/VideoCenter.tsx';
import { GameCenter } from './components/games/GameCenter.tsx';
import { CommunityList } from './components/community/CommunityList.tsx';
import { UserProfileModal } from './components/profile/UserProfileModal.tsx';
import { LuxuryAdBanner } from './components/commercial/LuxuryAdBanner.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { OnboardingModal } from './components/auth/OnboardingModal.tsx';
import { AccountSecurityModal } from './components/auth/AccountSecurityModal.tsx';
import { DigitalLibrary } from './components/library/DigitalLibrary.tsx';
import { ArabicLearningHub } from './components/learning/ArabicLearningHub.tsx';
import { WebBrowser } from './components/browser/WebBrowser.tsx';
import { CrawlerDashboard } from './components/crawler/CrawlerDashboard.tsx';
import { KnowledgeUniverse } from './components/knowledge/KnowledgeUniverse.tsx';
import { UniverseEngine } from './universe/UniverseEngine.tsx';
import { SaturnSpace } from './universe/SaturnSpace.tsx';
import { VenusMusicSpace } from './universe/VenusMusicSpace.tsx';
import { MercurySearch } from './components/search/MercurySearch.tsx';
import { getPlanetEcosystem } from './universe/planetEcosystems.ts';
import { HolographicAICompanion } from './components/ai/HolographicAICompanion.tsx';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { MoonSpaceObservatory } from './universe/MoonSpaceObservatory.tsx';
import { MoonAcademy } from './universe/MoonAcademy.tsx';
import { CinematicIntro } from './components/intro/CinematicIntro.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { OfflineIndicator } from './components/layout/OfflineIndicator.tsx';
import { BrandIdentitySystem } from './components/brand/BrandIdentitySystem.tsx';
import { PlayerProvider, usePlayerContext } from './music/PlayerContext.tsx';

function MusicRouteGuard({ currentTab }: { currentTab: string }) {
  const { stopPlayback } = usePlayerContext();
  const prevTabRef = React.useRef(currentTab);
  useEffect(() => {
    if (prevTabRef.current === 'venus' && currentTab !== 'venus') {
      stopPlayback();
    }
    prevTabRef.current = currentTab;
  }, [currentTab, stopPlayback]);
  return null;
}

export default function App() {
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('nointro') === '1') return false;
      return !localStorage.getItem('earth-one-intro-seen');
    } catch { return false; }
  });
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
    const alias: Record<string, string> = { search: 'mercury', ai: 'aihub', games: 'game', studio: 'creator', academy: 'academy', learning: 'arabic-learning', arabic: 'arabic-learning', messages: 'chat', discover: 'feed', home: 'globe' };
    return alias[raw] || raw || 'globe';
  };
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const mod = new URLSearchParams(window.location.search).get('module');
    if (mod) return normalizeModule(mod);
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
  const [activeConversationId, setActiveConversationId] = useState<string>('conv_global');
  const [focusCoordinates, setFocusCoordinates] = useState<{ lat: number; lng: number; timestamp?: number } | null>(null);
  const [welcomeToast, setWelcomeToast] = useState<string | null>(null);
  const [libraryFocusBookId, setLibraryFocusBookId] = useState<string | null>(null);
  const [knowledgeFocusNodeId, setKnowledgeFocusNodeId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [directOpenSeq, setDirectOpenSeq] = useState(0);

  useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; }, [lang]);

  const isViewportWorkspace = ['universe', 'chat', 'browser'].includes(currentTab);
  const isSpaceExperience = isViewportWorkspace || ['globe', 'saturn', 'venus', 'mercury', 'moon', 'academy', 'library', 'knowledge', 'settings', 'profile', 'call'].includes(currentTab);
  useEffect(() => { if (currentTab !== 'globe') setImmersive(false); }, [currentTab]);

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
  const handleAuthSuccess = (user: User, token: string, isNewRegistration: boolean) => { try { if (token) localStorage.setItem('earth_one_token', token); } catch {} setCurrentUser(user); void refreshConversations(); void refreshIntegrations(); try { const url = new URL(window.location.href); if (url.searchParams.get('module') === 'brand') { url.searchParams.delete('module'); window.history.replaceState({}, '', url.pathname + url.search); setCurrentTab('globe'); } } catch {} if (isNewRegistration || user.hasCompletedOnboarding === false) setIsOnboardingModalOpen(true); else { setWelcomeToast(`Welcome back, ${user.displayName}!`); setTimeout(() => setWelcomeToast(null), 4000); if (user.location?.isPublic) { setCurrentTab('globe'); setFocusCoordinates({ lat: user.location.lat, lng: user.location.lng, timestamp: Date.now() }); } } };
  const handleOnboardingComplete = async (updatedUser: User) => { setCurrentUser(updatedUser); setIsOnboardingModalOpen(false); const nodesRes = await fetch('/api/globe/nodes'); const nodesData = await nodesRes.json(); if (nodesData.success) setNodes(nodesData.nodes); setWelcomeToast(`Beacon active in ${updatedUser.location?.cityName || ''}`); setTimeout(() => setWelcomeToast(null), 5000); setCurrentTab('globe'); setFocusCoordinates({ lat: updatedUser.location.lat, lng: updatedUser.location.lng, timestamp: Date.now() }); };
  const handleLogout = async () => { try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {} try { localStorage.removeItem('earth_one_token'); } catch {} setCurrentUser(null); setConversations([]); setIntegrations([]); setActiveConversationId('conv_global'); setWelcomeToast('Logged out.'); setTimeout(() => setWelcomeToast(null), 3000); };
  const handleSelectGlobeUser = (node: GlobeUserNode) => { const fullUser: User = { id: node.userId, username: node.userId, displayName: node.displayName, avatar: node.avatar, bio: node.latestThought || '', location: { countryCode: node.countryCode, countryName: node.countryName, cityName: node.cityName, lat: node.lat, lng: node.lng, isPublic: true }, interests: [], followersCount: 0, followingCount: 0, tipsReceived: 0, isOnline: node.isOnline, verified: true, joinedAt: '' } as any; setProfileModalUser(fullUser); };
  const handleOpenDirectChat = async (targetUser: User) => { const existing = conversations.find(c => c.type === 'direct' && c.participantIds?.includes(targetUser.id)); if (existing) { setActiveConversationId(existing.id); setDirectOpenSeq(s => s + 1); setCurrentTab('chat'); return; } try { const res = await fetch('/api/conversations/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: targetUser.id }) }); const data = await res.json().catch(() => ({})); if (data.success) { if (Array.isArray(data.conversations)) setConversations(data.conversations); else await refreshConversations(); if (data.conversation?.id) setActiveConversationId(data.conversation.id); setDirectOpenSeq(s => s + 1); setCurrentTab('chat'); return; } } catch {} setDirectOpenSeq(s => s + 1); setCurrentTab('chat'); };
  const handleEnterPlanet = (planetId: string) => { const eco = getPlanetEcosystem(planetId); if (!eco || !eco.available) return; setCurrentTab(eco.tab); setBrowserInitialQuery(null); };

  if (!currentUser) {
    if (currentTab === 'brand') {
      return (
        <>
          <OfflineIndicator lang={lang} />
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
      </>
    );
  }

  return (
    <PlayerProvider>
    <div className="min-h-screen w-full max-w-full bg-[var(--color-one-bg)] text-[var(--color-one-text)] font-sans overflow-x-clip transition-colors">
      {showIntro && <CinematicIntro onComplete={() => { setShowIntro(false); try { localStorage.setItem('earth-one-intro-seen', '1'); } catch {} }} onAuthSuccess={handleAuthSuccess} currentUser={currentUser} />}
      {welcomeToast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl eo-glass text-sky-700 dark:text-cyan-100 text-xs flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-500 dark:text-cyan-400" /><span>{welcomeToast}</span></div>}

      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => { setCurrentTab(tab); if (tab !== 'browser') setBrowserInitialQuery(null); }}
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
        onOpenBook={bookId => { setLibraryFocusBookId(bookId); setCurrentTab('library'); }}
        onOpenKnowledge={nodeId => { setKnowledgeFocusNodeId(nodeId); setCurrentTab('knowledge'); }}
        onReplayIntro={() => setShowIntro(true)}
        onOpenCommand={() => setCommandOpen(true)}
      />

      <AppDock currentTab={currentTab} lang={lang} hidden={currentTab === 'globe' && immersive} onSelectTab={(tab) => { setCurrentTab(tab); if (tab !== 'browser') setBrowserInitialQuery(null); }} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} lang={lang} onSelectTab={(tab) => { setCurrentTab(tab); }} onSearch={(q) => { setSearchQuery(q); }} />

      <main className={`relative w-full max-w-full overflow-x-clip ${isViewportWorkspace ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}>
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
            onSelectCountry={code => { setActiveCountry(code); if (code) setCurrentTab('feed'); }}
            onSelectUser={handleSelectGlobeUser}
            onSelectTab={(tab) => { setCurrentTab(tab); if (tab !== 'browser') setBrowserInitialQuery(null); }}
            onOpenBook={bookId => { setLibraryFocusBookId(bookId); setCurrentTab('library'); }}
            immersive={immersive}
            onImmersiveChange={setImmersive}
          />
        )}

        {currentTab === 'universe' && <div className="h-full w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] bg-[#101c33] text-slate-100"><UniverseEngine onSwitchToEarthWorld={() => setCurrentTab('globe')} onEnterEcosystem={handleEnterPlanet} /></div>}
        {currentTab === 'saturn' && <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><SaturnSpace lang={lang} onBack={() => setCurrentTab('universe')} /></div>}
        {currentTab === 'venus' && <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8"><VenusMusicSpace lang={lang} onBack={() => setCurrentTab('globe')} /></div>}
        {currentTab === 'mercury' && <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><MercurySearch lang={lang} onBack={() => setCurrentTab('universe')} onOpenBook={bookId => { setLibraryFocusBookId(bookId); setCurrentTab('library'); }} onOpenKnowledge={nodeId => { setKnowledgeFocusNodeId(nodeId); setCurrentTab('knowledge'); }} onSelectTab={setCurrentTab} /></div>}
        {currentTab === 'feed' && <div className="w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8"><GlobalFeed posts={posts} countries={countries} activeCountry={activeCountry} onSelectCountry={setActiveCountry} currentUser={currentUser} onLikePost={handleLikePost} onAddComment={handleAddComment} onCreatePost={handleCreatePost} onSelectUser={u => setProfileModalUser(u)} onFlyToCoordinates={(lat,lng) => { setFocusCoordinates({ lat, lng, timestamp: Date.now() }); setCurrentTab('globe'); }} lang={lang} /></div>}
        <div className={currentTab === 'chat' ? 'contents' : 'hidden'} aria-hidden={currentTab !== 'chat'}><div className="h-full w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(4.65rem+env(safe-area-inset-bottom))] md:pb-0 flex flex-col min-h-0"><GlobalMessenger conversations={conversations} activeConversationId={activeConversationId} onSelectConversation={setActiveConversationId} currentUser={currentUser} lang={lang} integrations={integrations} onRefreshConversations={refreshConversations} onUserUpdate={(u) => { setCurrentUser(u); void refreshIntegrations(); }} directOpenSeq={directOpenSeq} /></div></div>
        {currentTab === 'aihub' && <div className="w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8"><AIHub lang={lang} /></div>}
        <div className={currentTab === 'library' ? 'contents' : 'hidden'} aria-hidden={currentTab !== 'library'}><div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 flex flex-col bg-[#121e36] text-slate-100"><DigitalLibrary lang={lang} currentUser={currentUser} focusBookId={libraryFocusBookId} /></div></div>
        {currentTab === 'moon' && <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><MoonSpaceObservatory lang={lang} onBack={() => setCurrentTab('universe')} /></div>}
        {currentTab === 'arabic-learning' && <div className="w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100 min-h-screen"><ArabicLearningHub lang={lang} onOpenLibrary={() => setCurrentTab('library')} /></div>}
        {currentTab === 'knowledge' && <div className="min-h-screen w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><KnowledgeUniverse lang={lang} focusNodeId={knowledgeFocusNodeId} onOpenLibrary={() => setCurrentTab('library')} onOpenBook={bookId => { setLibraryFocusBookId(bookId); setCurrentTab('library'); }} /></div>}
        <div className={currentTab === 'browser' ? 'contents h-full' : 'hidden'} aria-hidden={currentTab !== 'browser'}><div className="h-full w-full max-w-full pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(4.65rem+env(safe-area-inset-bottom))] md:pb-0 flex flex-col min-h-0 bg-[#121e36] text-slate-100"><WebBrowser lang={lang} initialQuery={browserInitialQuery ?? undefined} onBackToUniverse={() => setCurrentTab('universe')} onBackToGlobe={() => setCurrentTab('globe')} /></div></div>
        {currentTab === 'crawler' && <div className="pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100 min-h-screen"><CrawlerDashboard lang={lang} /></div>}
        {currentTab === 'creator' && <div className="pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8"><CreatorHub articles={articles} onCreateArticle={handleCreateArticle} lang={lang} /></div>}
        {currentTab === 'video' && <div className="pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8"><VideoCenter videos={videos} lang={lang} /></div>}
        {currentTab === 'game' && <div className="pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100 min-h-screen"><GameCenter currentUser={currentUser} lang={lang} /></div>}
        {currentTab === 'community' && <div className="pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8"><CommunityList communities={communities} onToggleJoin={handleToggleJoinCommunity} lang={lang} /></div>}
        {currentTab === 'academy' && <div className="min-h-screen pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><MoonAcademy lang={lang} currentUser={currentUser} onBack={() => setCurrentTab('universe')} /></div>}
        {currentTab === 'settings' && (
          <div className="min-h-screen pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[28px] border border-slate-200 dark:border-white/15 bg-white dark:bg-[#162238] backdrop-blur-xl p-6 sm:p-8 space-y-4 shadow-lg">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{lang==='zh'?'设置与安全':'Settings & Security'}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{lang==='zh'?'ONE 当前未提供独立的全局设置页面。账户、安全、隐私与绑定等真实能力已在「账户与安全」中提供。':'ONE does not currently provide a standalone global settings page. Real account, security, privacy, and linking controls are available in Account & Security.'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setIsSecurityModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold">Account &amp; Security</button>
                <button onClick={() => { if (currentUser) setProfileModalUser(currentUser); }} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.12]">{lang==='zh'?'个人资料':'Profile'}</button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{lang==='zh'?'状态：独立设置模块未实现；已开放能力均为真实功能。':'Status: standalone settings module not implemented; exposed controls are real.'}</p>
            </div>
          </div>
        )}
        {currentTab === 'profile' && (
          <div className="min-h-screen pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[28px] border border-slate-200 dark:border-white/15 bg-white dark:bg-[#162238] backdrop-blur-xl p-6 sm:p-8 space-y-4 shadow-lg">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{lang==='zh'?'个人主页':'Profile'}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{lang==='zh'?'你的个人资料与地球信标通过真实资料面板管理（非独立路由页）。':'Your profile and globe beacon are managed via the real profile panel (no standalone route page).'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { if (currentUser) setProfileModalUser(currentUser); }} className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold">{lang==='zh'?'打开个人资料':'Open profile'}</button>
                <button onClick={() => setIsOnboardingModalOpen(true)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.12]">{lang==='zh'?'编辑地球信标':'Edit beacon'}</button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{lang==='zh'?'状态：独立 profile 页面未实现；以上入口为真实功能。':'Status: standalone profile page not implemented; entries above are real.'}</p>
            </div>
          </div>
        )}
        {currentTab === 'call' && (
          <div className="min-h-screen pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 flex items-center justify-center px-4">
            <div className="max-w-lg w-full rounded-[28px] border border-slate-200 dark:border-white/15 bg-white dark:bg-[#162238] backdrop-blur-xl p-6 sm:p-8 space-y-4 shadow-lg">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{lang==='zh'?'通话':'Calls'}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{lang==='zh'?'当前没有独立的通话模块页面。通话能力（如可用）集成在消息/会话体验中，并依赖真实设备权限与连接状态；本路由不提供伪造通话界面。':'There is no standalone call module page. Call capabilities, where available, are integrated into messaging/conversations and depend on real device permissions and connectivity; this route does not provide a fabricated call UI.'}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCurrentTab('chat')} className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold">{lang==='zh'?'打开消息':'Open messages'}</button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{lang==='zh'?'状态：独立 call 模块未实现；多端/设备通话需真实环境验证。':'Status: standalone call module not implemented; multi-device calling requires real-environment verification.'}</p>
            </div>
          </div>
        )}
        {currentTab === 'brand' && <div className="min-h-screen pt-[58px] md:pt-16 md:pl-[5.5rem] pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-8 bg-[#121e36] text-slate-100"><BrandIdentitySystem lang={lang} onBackToGlobe={() => setCurrentTab('globe')} /></div>}
      </main>

      {!isSpaceExperience && <div className="md:pl-[5.5rem] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0"><LuxuryAdBanner lang={lang} /></div>}

      {profileModalUser && <UserProfileModal user={profileModalUser} currentUser={currentUser} onClose={() => setProfileModalUser(null)} onFollow={id => { fetch(`/api/users/${id}/follow`, { method: 'POST' }).catch(() => {}); }} onDirectMessage={handleOpenDirectChat} onUpdateProfile={handleUpdateProfile} lang={lang} />}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} lang={lang} />
      {currentUser && <AccountSecurityModal isOpen={isSecurityModalOpen} onClose={() => setIsSecurityModalOpen(false)} currentUser={currentUser} onUserUpdate={(u) => { setCurrentUser(u); void refreshIntegrations(); }} />}
      {currentUser && <OnboardingModal isOpen={isOnboardingModalOpen} user={currentUser} onComplete={handleOnboardingComplete} lang={lang} />}

      <HolographicAICompanion lang={lang} showLauncher={currentTab !== 'globe' || (showGlobeTools && !immersive)} onFlyTo={(lat, lng) => { setFocusCoordinates({ lat, lng, timestamp: Date.now() }); setCurrentTab('globe'); }} onExploreUniverse={() => setCurrentTab('universe')} onOpenAIHub={() => setCurrentTab('aihub')} onNavigateTab={tab => setCurrentTab(tab)} currentTab={currentTab} />

      {!isSpaceExperience && (
        <footer className="w-full border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#101a2e]/80 py-5 px-4 text-xs text-slate-500 dark:text-slate-400 md:pl-24">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2"><img src="/earth-one-icon.png" alt="ONE" className="w-5 h-5 rounded-md object-cover ring-1 ring-slate-900/10 dark:ring-white/15" /><span className="font-semibold text-slate-800 dark:text-slate-100 tracking-wide">ONE</span></div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400"><span>{t.motto}</span><span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /><span>{t.locationPrivate}</span></span></div>
          </div>
        </footer>
      )}
      <MusicRouteGuard currentTab={currentTab} />
      <OfflineIndicator lang={lang} />
    </div>
    </PlayerProvider>
  );
}
