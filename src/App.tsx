import React, { useState, useEffect } from 'react';
import {
  User,
  Post,
  GlobeUserNode,
  GlobeCountryStat,
  Conversation,
  CreatorArticle,
  VideoItem,
  Community,
  Language
} from './types/index.ts';
import { translations } from './i18n/translations.ts';
import { Navbar } from './components/layout/Navbar.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { DigitalGlobe } from './components/globe/DigitalGlobe.tsx';
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
import { DigitalLibrary } from './components/library/DigitalLibrary.tsx';
import { WebBrowser } from './components/browser/WebBrowser.tsx';
import { CrawlerDashboard } from './components/crawler/CrawlerDashboard.tsx';
import { KnowledgeUniverse } from './components/knowledge/KnowledgeUniverse.tsx';
import { UniverseEngine } from './universe/UniverseEngine.tsx';
import { HolographicAICompanion } from './components/ai/HolographicAICompanion.tsx';
import { Globe2, ShieldCheck, Sparkles } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('zh');
  const t = translations[lang] || translations.zh;
  const [currentTab, setCurrentTab] = useState<string>('globe');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showGlobeTools, setShowGlobeTools] = useState(true);

  // Core Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GlobeUserNode[]>([]);
  const [countries, setCountries] = useState<GlobeCountryStat[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [articles, setArticles] = useState<CreatorArticle[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);

  // Modals & Navigation triggers
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [profileModalUser, setProfileModalUser] = useState<User | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>('conv_global');
  const [focusCoordinates, setFocusCoordinates] = useState<{ lat: number; lng: number; timestamp?: number } | null>(null);
  const [welcomeToast, setWelcomeToast] = useState<string | null>(null);
  const [libraryFocusBookId, setLibraryFocusBookId] = useState<string | null>(null);
  const [knowledgeFocusNodeId, setKnowledgeFocusNodeId] = useState<string | null>(null);

  // Handle RTL layout adaptation for Arabic
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Initial Data Fetch & Auth Check
  useEffect(() => {
    const storedToken = localStorage.getItem('earth_one_token');
    const headers: Record<string, string> = {};
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
      setSessionToken(storedToken);
    }

    // Authenticated user check
    fetch('/api/auth/me', { headers })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.user) {
          setCurrentUser(d.user);
          // If user hasn't finished onboarding, trigger the setup wizard
          if (d.user.hasCompletedOnboarding === false) {
            setIsOnboardingModalOpen(true);
          }
        }
      })
      .catch(console.error);

    // Globe nodes
    fetch('/api/globe/nodes')
      .then(r => r.json())
      .then(d => { if (d.success) setNodes(d.nodes); })
      .catch(console.error);

    // Countries
    fetch('/api/globe/countries')
      .then(r => r.json())
      .then(d => { if (d.success) setCountries(d.countries); })
      .catch(console.error);

    // Posts
    fetch('/api/posts')
      .then(r => r.json())
      .then(d => { if (d.success) setPosts(d.posts); })
      .catch(console.error);

    // Conversations
    fetch('/api/conversations')
      .then(r => r.json())
      .then(d => { if (d.success) setConversations(d.conversations); })
      .catch(console.error);

    // Articles
    fetch('/api/articles')
      .then(r => r.json())
      .then(d => { if (d.success) setArticles(d.articles); })
      .catch(console.error);

    // Videos
    fetch('/api/videos')
      .then(r => r.json())
      .then(d => { if (d.success) setVideos(d.videos); })
      .catch(console.error);

    // Communities
    fetch('/api/communities')
      .then(r => r.json())
      .then(d => { if (d.success) setCommunities(d.communities); })
      .catch(console.error);
  }, []);

  // Post Actions
  const handleLikePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPosts(prev =>
          prev.map(p =>
            p.id === postId ? { ...p, liked: data.liked, likesCount: data.likesCount } : p
          )
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (postId: string, content: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/posts/${postId}/comment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success && data.post) {
        setPosts(prev => prev.map(p => (p.id === postId ? data.post : p)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePost = async (postData: { content: string; mediaUrl?: string; category: any }) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers,
        body: JSON.stringify(postData)
      });
      const data = await res.json();
      if (data.success && data.post) {
        setPosts(prev => [data.post, ...prev]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateArticle = async (artData: any) => {
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artData)
      });
      const data = await res.json();
      if (data.success && data.article) {
        setArticles(prev => [data.article, ...prev]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleJoinCommunity = async (commId: string) => {
    try {
      const res = await fetch(`/api/communities/${commId}/join`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCommunities(prev =>
          prev.map(c =>
            c.id === commId
              ? { ...c, isJoined: data.isJoined, membersCount: data.membersCount }
              : c
          )
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLocationPrivacy = async () => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch('/api/auth/toggle-location', { method: 'POST', headers });
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentUser(data.user);
        // Refresh globe nodes immediately
        const nodesRes = await fetch('/api/globe/nodes');
        const nodesData = await nodesRes.json();
        if (nodesData.success) setNodes(nodesData.nodes);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (userData: Partial<User>) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers,
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Auth & Onboarding Handlers
  const handleAuthSuccess = (user: User, token: string, isNewRegistration: boolean) => {
    setCurrentUser(user);
    setSessionToken(token);
    localStorage.setItem('earth_one_token', token);

    if (isNewRegistration || user.hasCompletedOnboarding === false) {
      setIsOnboardingModalOpen(true);
    } else {
      setWelcomeToast(`Welcome back, ${user.displayName}!`);
      setTimeout(() => setWelcomeToast(null), 4000);

      if (user.location?.isPublic) {
        setCurrentTab('globe');
        setFocusCoordinates({
          lat: user.location.lat,
          lng: user.location.lng,
          timestamp: Date.now()
        });
      }
    }
  };

  const handleOnboardingComplete = async (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setIsOnboardingModalOpen(false);

    // Refresh nodes so the user's beacon is immediately visible on Earth!
    const nodesRes = await fetch('/api/globe/nodes');
    const nodesData = await nodesRes.json();
    if (nodesData.success) {
      setNodes(nodesData.nodes);
    }

    setWelcomeToast(`Your beacon is active in ${updatedUser.location.cityName}, ${updatedUser.location.countryName}!`);
    setTimeout(() => setWelcomeToast(null), 5000);

    // Transition to 3D Earth and smoothly fly camera to their location
    setCurrentTab('globe');
    setFocusCoordinates({
      lat: updatedUser.location.lat,
      lng: updatedUser.location.lng,
      timestamp: Date.now()
    });
  };

  const handleLogout = async () => {
    try {
      if (sessionToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
      }
    } catch (err) {
      console.warn(err);
    }
    localStorage.removeItem('earth_one_token');
    setSessionToken(null);
    setCurrentUser(null);
    setWelcomeToast('Logged out of Earth One.');
    setTimeout(() => setWelcomeToast(null), 3000);
  };

  const handleSelectGlobeUser = (node: GlobeUserNode) => {
    const fullUser: User = {
      id: node.userId,
      username: node.userId,
      displayName: node.displayName,
      avatar: node.avatar,
      bio: node.latestThought || 'Global citizen exploring Earth One.',
      location: {
        countryCode: node.countryCode,
        countryName: node.countryName,
        cityName: node.cityName,
        lat: node.lat,
        lng: node.lng,
        isPublic: true
      },
      interests: ['Global Peace', 'Culture', 'AI Hub'],
      followersCount: 1420,
      followingCount: 380,
      tipsReceived: 450,
      isOnline: node.isOnline,
      verified: true,
      joinedAt: '2026-01-01'
    };
    setProfileModalUser(fullUser);
  };

  const handleOpenDirectChat = (targetUser: User) => {
    const existing = conversations.find(c => c.participantIds?.includes(targetUser.id));
    if (existing) {
      setActiveConversationId(existing.id);
    } else {
      const newConv: Conversation = {
        id: `conv_${targetUser.id}`,
        type: 'direct',
        name: targetUser.displayName,
        countryCode: targetUser.location.countryCode,
        participantIds: ['current_user', targetUser.id],
        otherUser: targetUser,
        lastMessage: 'Conversation opened',
        lastMessageTime: 'Just now',
        isOnline: targetUser.isOnline
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    }
    setCurrentTab('chat');
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex font-sans">
      {/* Welcome Banner Toast */}
      {welcomeToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-cyan-950/95 border border-cyan-500/60 text-cyan-200 text-xs shadow-2xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold">{welcomeToast}</span>
        </div>
      )}

      {/* Left sidebar navigation (desktop) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        lang={lang}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
      />

      <div className="flex-1 flex flex-col min-w-0">
      {/* 1. Universal Top Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        lang={lang}
        onSelectLang={setLang}
        currentUser={currentUser}
        onOpenProfile={() => currentUser && setProfileModalUser(currentUser)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
        onToggleLocationPrivacy={handleToggleLocationPrivacy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenBook={bookId => {
          setLibraryFocusBookId(bookId);
          setCurrentTab('library');
        }}
        onOpenKnowledge={nodeId => {
          setKnowledgeFocusNodeId(nodeId);
          setCurrentTab('knowledge');
        }}
      />

      {/* 2. Main View Content Switcher */}
      <main className="flex-1 flex flex-col">
        {currentTab === 'globe' && (
          <div className="flex-1 flex flex-col min-h-[calc(100svh-7rem)] md:min-h-[calc(100vh-4rem)]">
            <DigitalGlobe
              nodes={nodes}
              countries={countries}
              showGlobeTools={showGlobeTools}
              onToggleGlobeTools={() => setShowGlobeTools(open => !open)}
              onSelectTab={setCurrentTab}
              activeCountry={activeCountry}
              currentUserId={currentUser?.id}
              focusCoordinates={focusCoordinates}
              onSelectCountry={code => {
                setActiveCountry(code);
                if (code) {
                   setCurrentTab('feed');
                }
              }}
              onSelectUser={handleSelectGlobeUser}
              onExploreUniverse={() => setCurrentTab('universe')}
              onExploreCommunity={() => setCurrentTab('community')}
              lang={lang}
            />
          </div>
        )}

        {currentTab === 'universe' && (
          <div className="flex-1 flex flex-col min-h-[calc(100vh-4rem)]">
            <UniverseEngine onSwitchToEarthWorld={() => setCurrentTab('globe')} />
          </div>
        )}

        {currentTab === 'feed' && (
          <GlobalFeed
            posts={posts}
            countries={countries}
            activeCountry={activeCountry}
            onSelectCountry={setActiveCountry}
            currentUser={currentUser}
            onLikePost={handleLikePost}
            onAddComment={handleAddComment}
            onCreatePost={handleCreatePost}
            onSelectUser={u => setProfileModalUser(u)}
            lang={lang}
          />
        )}

        {currentTab === 'chat' && (
          <GlobalMessenger
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
            currentUser={currentUser}
            lang={lang}
          />
        )}

        {currentTab === 'aihub' && <AIHub lang={lang} />}

        {currentTab === 'library' && <DigitalLibrary lang={lang} currentUser={currentUser} focusBookId={libraryFocusBookId} />}

        {currentTab === 'knowledge' && (
          <KnowledgeUniverse
            lang={lang}
            focusNodeId={knowledgeFocusNodeId}
            onOpenLibrary={() => setCurrentTab('library')}
            onOpenBook={bookId => {
              setLibraryFocusBookId(bookId);
              setCurrentTab('library');
            }}
          />
        )}

        {currentTab === 'browser' && <WebBrowser lang={lang} />}

        {currentTab === 'crawler' && <CrawlerDashboard lang={lang} />}

        {currentTab === 'creator' && (
          <CreatorHub
            articles={articles}
            onCreateArticle={handleCreateArticle}
            lang={lang}
          />
        )}

        {currentTab === 'video' && <VideoCenter videos={videos} lang={lang} />}

        {currentTab === 'game' && <GameCenter currentUser={currentUser} lang={lang} />}

        {currentTab === 'community' && (
          <CommunityList
            communities={communities}
            onToggleJoin={handleToggleJoinCommunity}
            lang={lang}
          />
        )}
      </main>

      {/* 3. Luxury Sponsor Ad Banner (Chapter 10) */}
      <LuxuryAdBanner lang={lang} />

      {/* 4. Citizen Profile Modal */}
      {profileModalUser && (
        <UserProfileModal
          user={profileModalUser}
          currentUser={currentUser}
          onClose={() => setProfileModalUser(null)}
          onFollow={id => {
            fetch(`/api/users/${id}/follow`, { method: 'POST' }).catch(() => {});
          }}
          onDirectMessage={handleOpenDirectChat}
          onUpdateProfile={handleUpdateProfile}
          lang={lang}
        />
      )}

      {/* 5. Secure Auth Modal (Sign In / Registration) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        lang={lang}
      />

      {/* 6. Post-Login Profile Onboarding Wizard */}
      {currentUser && (
        <OnboardingModal
          isOpen={isOnboardingModalOpen}
          user={currentUser}
          onComplete={handleOnboardingComplete}
          lang={lang}
        />
      )}

      {/* 7. 3D Holographic AI Companion */}
      <HolographicAICompanion
        lang={lang}
        showLauncher={currentTab !== 'globe' || showGlobeTools}
        onFlyTo={(lat, lng) => {
          setFocusCoordinates({ lat, lng, timestamp: Date.now() });
          setCurrentTab('globe');
        }}
        onExploreUniverse={() => setCurrentTab('universe')}
        onOpenAIHub={() => setCurrentTab('aihub')}
      />

      {/* 8. Minimalist Earth One Global Footer */}
      <footer className="w-full border-t border-slate-900 bg-slate-950/80 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Globe2 className="w-4 h-4 text-cyan-500" />
            <span className="font-serif font-bold text-slate-300">{lang === 'zh' ? '地球计划' : 'PROJECT EARTH'}</span>
            <span>—</span>
            <span className="text-slate-400">{t.motto}</span>
          </div>
          <div className="flex items-center space-x-4 text-slate-400 text-[11px]">
            <span>{t.motto}</span>
            <span>·</span>
            <span>{t.tagline}</span>
            <span>·</span>
            <span className="flex items-center space-x-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t.locationPrivate}</span>
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
