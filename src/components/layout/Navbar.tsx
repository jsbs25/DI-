import React, { useEffect, useState } from 'react';
import { User, Language, KnowledgeNode, Book, Community, Post } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Globe,
  Home,
  Compass,
  Sparkles,
  ChevronDown,
  Menu,
  Sun,
  Moon,
  MessageSquare,
  PenTool,
  Film,
  Gamepad2,
  Cpu,
  Users2,
  Orbit,
  User as UserIcon,
  MapPin,
  ShieldCheck,
  Eye,
  EyeOff,
  LogOut,
  Layers,
  BookOpen,
  Search,
  Network,
  X
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
  onSelectLang: (lang: Language) => void;
  currentUser: User | null;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenOnboarding: () => void;
  onToggleLocationPrivacy: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenBook?: (bookId: string) => void;
  onOpenKnowledge?: (nodeId: string) => void;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-800/70 transition-colors cursor-pointer"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-200 truncate">{title}</span>
        {subtitle && <span className="block text-[11px] text-slate-500 truncate">{subtitle}</span>}
      </span>
    </button>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  lang,
  onSelectLang,
  currentUser,
  onOpenProfile,
  onOpenAuth,
  onLogout,
  onOpenOnboarding,
  onToggleLocationPrivacy,
  searchQuery,
  onSearchChange,
  onOpenBook,
  onOpenKnowledge
}) => {
  const t = translations[lang] || translations.zh;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [ecosystemMenuOpen, setEcosystemMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Global unified search across all modules
  const [globalResults, setGlobalResults] = useState<{
    users: User[];
    posts: Post[];
    books: Book[];
    communities: Community[];
    knowledge: KnowledgeNode[];
  } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearching, setGlobalSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setGlobalResults(null);
      setGlobalSearchOpen(false);
      return;
    }
    setGlobalSearchOpen(true);
    setGlobalSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) setGlobalResults(data.results);
      } catch {
        setGlobalResults(null);
      } finally {
        setGlobalSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const totalResultCount = globalResults
    ? globalResults.users.length + globalResults.posts.length + globalResults.books.length + globalResults.communities.length + globalResults.knowledge.length
    : 0;

  const closeGlobalSearch = () => {
    setGlobalSearchOpen(false);
    onSearchChange('');
  };

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'zh', label: '中文 (CN)', flag: '🇨🇳' },
    { code: 'en', label: 'English (US)', flag: '🇺🇸' },
    { code: 'ar', label: 'العربية (RTL)', flag: '🇯🇴' },
    { code: 'es', label: 'Español (ES)', flag: '🇪🇸' },
    { code: 'fr', label: 'Français (FR)', flag: '🇫🇷' },
    { code: 'ru', label: 'Русский (RU)', flag: '🇷🇺' }
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#02050f]/95 backdrop-blur-xl border-b border-slate-800/60 transition-all select-none relative">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 1. Left Brand: Glowing Earth Sphere + EARTH ONE + Motto */}
          <div
            onClick={() => onSelectTab('globe')}
              className="flex items-center space-x-2 sm:space-x-3 cursor-pointer group shrink-0"
          >
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-cyan-400/50 shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform">
              <img
                src="/assets/aistudio/88edd78a66e82722354887034fb38db6_26f71533.jpg"
                alt="EARTH ONE"
                className="w-full h-full object-cover scale-150"
              />
              <div className="absolute inset-0 bg-blue-500/20 mix-blend-overlay" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-base sm:text-lg tracking-wider text-white font-sans">
                EARTH ONE
              </span>
              <span className="hidden sm:block text-[11px] text-slate-400 font-sans tracking-tight">
                {t.brandTagline}
              </span>
            </div>
          </div>

          {/* 1.5 Global Unified Search */}
          <div className="hidden md:block relative flex-1 max-w-sm">
            <div className="flex items-center bg-slate-900/70 border border-slate-700/60 rounded-full px-3.5 py-1.5 focus-within:border-amber-500/60 transition-colors">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => searchQuery.trim() && setGlobalSearchOpen(true)}
                placeholder={t.globalSearch}
                className="flex-1 bg-transparent outline-none text-xs text-slate-100 placeholder:text-slate-500 ml-2"
              />
              {searchQuery && (
                <button onClick={closeGlobalSearch} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {globalSearchOpen && (
              <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-slate-950/98 border border-slate-800 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in max-h-[70vh] overflow-y-auto">
                {globalSearching && (
                  <div className="px-4 py-3 text-xs text-slate-500">正在全局搜索...</div>
                )}
                {!globalSearching && globalResults && totalResultCount === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-500">{t.noResults}</div>
                )}
                {!globalSearching && globalResults && totalResultCount > 0 && (
                  <>
                    {globalResults.knowledge.length > 0 && (
                      <Group label={t.knowledgeTab}>
                        {globalResults.knowledge.map(n => (
                          <ResultRow
                            key={n.id}
                            icon={<Network className="w-3.5 h-3.5 text-amber-400" />}
                            title={n.title}
                            subtitle={n.titleEn}
                            onClick={() => { onOpenKnowledge?.(n.id); closeGlobalSearch(); }}
                          />
                        ))}
                      </Group>
                    )}
                    {globalResults.books.length > 0 && (
                      <Group label={t.digitalLibrary}>
                        {globalResults.books.map(b => (
                          <ResultRow
                            key={b.id}
                            icon={<BookOpen className="w-3.5 h-3.5 text-amber-400" />}
                            title={b.title}
                            subtitle={b.author}
                            onClick={() => { onOpenBook?.(b.id); closeGlobalSearch(); }}
                          />
                        ))}
                      </Group>
                    )}
                    {globalResults.users.length > 0 && (
                      <Group label={t.globalMessenger}>
                        {globalResults.users.map(u => (
                          <ResultRow
                            key={u.id}
                            icon={<UserIcon className="w-3.5 h-3.5 text-cyan-400" />}
                            title={u.displayName}
                            subtitle={u.location?.countryName}
                            onClick={() => { onSelectTab('feed'); closeGlobalSearch(); }}
                          />
                        ))}
                      </Group>
                    )}
                    {globalResults.communities.length > 0 && (
                      <Group label={t.communityTab}>
                        {globalResults.communities.map(c => (
                          <ResultRow
                            key={c.id}
                            icon={<Users2 className="w-3.5 h-3.5 text-emerald-400" />}
                            title={c.name}
                            subtitle={c.description}
                            onClick={() => { onSelectTab('community'); closeGlobalSearch(); }}
                          />
                        ))}
                      </Group>
                    )}
                    {globalResults.posts.length > 0 && (
                      <Group label={t.feedTab}>
                        {globalResults.posts.map(p => (
                          <ResultRow
                            key={p.id}
                            icon={<Compass className="w-3.5 h-3.5 text-blue-400" />}
                            title={p.content.slice(0, 60)}
                            subtitle={p.author?.displayName}
                            onClick={() => { onSelectTab('feed'); closeGlobalSearch(); }}
                          />
                        ))}
                      </Group>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. Center Navigation Capsule (Identical to User Reference Design) */}
          <nav aria-label="Primary navigation" className={`${currentTab === 'globe' ? 'hidden' : 'hidden md:flex'} items-center p-1 rounded-full bg-slate-900/70 border border-slate-700/60 shadow-xl backdrop-blur-md`}>
            {/* Home */}
            <button
              onClick={() => onSelectTab('globe')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'globe'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/35 border border-blue-400/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>{t.globeTab}</span>
            </button>

            {/* Explore (Feed / Social) */}
            <button
              onClick={() => onSelectTab('feed')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'feed'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/35 border border-blue-400/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{t.feedTab}</span>
            </button>

            {/* Discover (Universe Engine & Planets) */}
            <button
              onClick={() => onSelectTab('universe')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'universe'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/35 border border-blue-400/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" />
              <span>{t.universeTab}</span>
            </button>

            {/* About (Global Community) */}
            <button
              onClick={() => onSelectTab('community')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'community'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/35 border border-blue-400/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>{t.communityTab}</span>
            </button>

            {/* Ecosystem Apps Dropdown */}
            <div className="relative">
              <button
                onClick={() => setEcosystemMenuOpen(!ecosystemMenuOpen)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-all"
              >
                <span>{t.apps}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {ecosystemMenuOpen && (
                <div
                  onMouseLeave={() => setEcosystemMenuOpen(false)}
                  className="absolute left-1/2 -translate-x-1/2 mt-2 w-52 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in"
                >
                  <button
                    onClick={() => {
                      onSelectTab('chat');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t.globalMessenger}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('aihub');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span>{t.aiHubTab}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('library');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.digitalLibrary}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('knowledge');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Network className="w-3.5 h-3.5 text-amber-300" />
                    <span>{t.knowledgeTab}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('browser');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Search className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t.webBrowser}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('creator');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.creatorArticles}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('video');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Film className="w-3.5 h-3.5 text-red-400" />
                    <span>{t.worldVideoCenter}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('game');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-yellow-400" />
                    <span>{t.globalGameCenter}</span>
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* 3. Right Cluster: Theme Toggle + Language Dropdown + User Profile */}
          <div className="flex items-center space-x-1 sm:space-x-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="hidden sm:block p-2 rounded-full border border-slate-700/60 bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md cursor-pointer transition-colors"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-cyan-300" />}
            </button>

            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center space-x-1 px-2 sm:px-3.5 py-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 hover:bg-slate-800 text-xs font-semibold text-slate-200 backdrop-blur-md cursor-pointer transition-all"
                aria-label="Select language"
              >
                <span className="sm:hidden">{lang.toUpperCase()}</span>
                <span className="hidden sm:inline">{languages.find(l => l.code === lang)?.label || 'Language'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {langMenuOpen && (
                <div
                  onMouseLeave={() => setLangMenuOpen(false)}
                className="absolute right-0 mt-2 w-44 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in"
                >
                  {languages.map(l => (
                    <button
                      key={l.code}
                      onClick={() => {
                        onSelectLang(l.code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-left cursor-pointer transition-colors ${
                        lang === l.code
                          ? 'bg-blue-600/20 text-cyan-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                      }`}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Location Privacy Indicator */}
            {currentUser && (
              <button
                onClick={onToggleLocationPrivacy}
                title={currentUser.location.isPublic ? t.locationPublic : t.locationPrivate}
                className={`p-1.5 rounded-full border text-xs cursor-pointer transition-all ${
                  currentUser.location.isPublic
                    ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-400'
                    : 'bg-amber-950/60 border-amber-600/60 text-amber-400'
                }`}
              >
                {currentUser.location.isPublic ? (
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>
            )}

            {/* Profile Avatar or Sign In */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center space-x-2 p-1 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 cursor-pointer transition-all"
                >
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.displayName}
                    className="w-7 h-7 rounded-full object-cover border border-cyan-400 shadow"
                  />
                </button>

                {userDropdownOpen && (
                  <div
                    onMouseLeave={() => setUserDropdownOpen(false)}
                    className="absolute right-0 mt-2 w-52 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl py-2 z-50 text-xs animate-in fade-in"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-800/80 mb-1">
                      <span className="block font-bold text-white truncate">{currentUser.displayName}</span>
                      <span className="block text-[11px] text-slate-400 font-mono">@{currentUser.username}</span>
                    </div>

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenProfile();
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/70 flex items-center space-x-2"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t.myProfile}</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenOnboarding();
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/70 flex items-center space-x-2"
                    >
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t.editGlobeBeacon}</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-red-400 hover:bg-red-950/40 flex items-center space-x-2 mt-1 border-t border-slate-800/80 pt-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t.logOut}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-2.5 sm:px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/30 transition-all cursor-pointer whitespace-nowrap"
              >
                {t.signIn}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(open => !open)}
              className="md:hidden p-2 rounded-full border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:bg-slate-800 transition-colors"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="md:hidden -mx-1 flex items-center gap-1 overflow-x-auto border-t border-slate-800/60 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'globe', label: t.globeTab, icon: <Home className="w-3.5 h-3.5" /> },
            { id: 'feed', label: t.feedTab, icon: <Compass className="w-3.5 h-3.5" /> },
            { id: 'universe', label: t.universeTab, icon: <Orbit className="w-3.5 h-3.5" /> },
            { id: 'community', label: t.communityTab, icon: <Users2 className="w-3.5 h-3.5" /> }
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onSelectTab(item.id); setMobileMenuOpen(false); }}
              aria-current={currentTab === item.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors ${currentTab === item.id ? 'bg-blue-600 text-white' : item.id === 'community' ? 'text-emerald-200 hover:bg-emerald-950/50' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(open => !open)}
            className="flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-semibold text-slate-400 hover:bg-slate-800"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="w-3.5 h-3.5" /><span>{t.apps}</span>
          </button>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full max-h-[calc(100dvh-7rem)] overflow-y-auto border-b border-slate-800 bg-slate-950/98 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t.apps}</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'chat', label: t.globalMessenger, icon: <MessageSquare className="w-4 h-4 text-cyan-400" /> },
              { id: 'aihub', label: t.aiHubTab, icon: <Cpu className="w-4 h-4 text-purple-400" /> },
              { id: 'library', label: t.digitalLibrary, icon: <BookOpen className="w-4 h-4 text-amber-400" /> },
              { id: 'knowledge', label: t.knowledgeTab, icon: <Network className="w-4 h-4 text-amber-300" /> },
              { id: 'browser', label: t.webBrowser, icon: <Search className="w-4 h-4 text-blue-400" /> },
              { id: 'creator', label: t.creatorArticles, icon: <PenTool className="w-4 h-4 text-emerald-400" /> },
              { id: 'video', label: t.worldVideoCenter, icon: <Film className="w-4 h-4 text-red-400" /> },
              { id: 'game', label: t.globalGameCenter, icon: <Gamepad2 className="w-4 h-4 text-yellow-400" /> }
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelectTab(item.id); setMobileMenuOpen(false); }}
                className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${currentTab === item.id ? 'border-blue-500/60 bg-blue-950/60 text-white' : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'}`}
              >
                {item.icon}<span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
