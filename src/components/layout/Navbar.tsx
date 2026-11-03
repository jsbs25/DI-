import React, { useState } from 'react';
import { User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Globe,
  Home,
  Compass,
  Sparkles,
  Info,
  ChevronDown,
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
  Search
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
  onToggleLocationPrivacy
}) => {
  const t = translations[lang] || translations.zh;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [ecosystemMenuOpen, setEcosystemMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'zh', label: '中文 (CN)', flag: '🇨🇳' },
    { code: 'en', label: 'English (US)', flag: '🇺🇸' },
    { code: 'ar', label: 'العربية (RTL)', flag: '🇯🇴' },
    { code: 'es', label: 'Español (ES)', flag: '🇪🇸' },
    { code: 'fr', label: 'Français (FR)', flag: '🇫🇷' },
    { code: 'ru', label: 'Русский (RU)', flag: '🇷🇺' }
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#02050f]/80 backdrop-blur-xl border-b border-slate-800/60 transition-all select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 1. Left Brand: Glowing Earth Sphere + EARTH ONE + Motto */}
          <div
            onClick={() => onSelectTab('globe')}
            className="flex items-center space-x-3 cursor-pointer group shrink-0"
          >
            <div className="relative w-9 h-9 rounded-full overflow-hidden border border-cyan-400/50 shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform">
              <img
                src="/assets/aistudio/88edd78a66e82722354887034fb38db6_26f71533.jpg"
                alt="EARTH ONE"
                className="w-full h-full object-cover scale-150"
              />
              <div className="absolute inset-0 bg-blue-500/20 mix-blend-overlay" />
            </div>
            <div>
              <span className="block font-bold text-base sm:text-lg tracking-wider text-white font-sans">
                EARTH ONE
              </span>
              <span className="block text-[11px] text-slate-400 font-sans tracking-tight">
                Explore · Connect · Build
              </span>
            </div>
          </div>

          {/* 2. Center Navigation Capsule (Identical to User Reference Design) */}
          <nav className="hidden md:flex items-center p-1 rounded-full bg-slate-900/70 border border-slate-700/60 shadow-xl backdrop-blur-md">
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
              <Info className="w-3.5 h-3.5" />
              <span>{t.communityTab}</span>
            </button>

            {/* Ecosystem Apps Dropdown */}
            <div className="relative">
              <button
                onClick={() => setEcosystemMenuOpen(!ecosystemMenuOpen)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-all"
              >
                <span>Apps</span>
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
                    <span>Global Messenger</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('aihub');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span>EARTH ONE AI HUB</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('library');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Digital Library</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('browser');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Search className="w-3.5 h-3.5 text-blue-400" />
                    <span>Web Browser</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('creator');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Creator Articles</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('video');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Film className="w-3.5 h-3.5 text-red-400" />
                    <span>World Video Center</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('game');
                      setEcosystemMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/70"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Global Game Center</span>
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* 3. Right Cluster: Theme Toggle + Language Dropdown + User Profile */}
          <div className="flex items-center space-x-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full border border-slate-700/60 bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md cursor-pointer transition-colors"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-cyan-300" />}
            </button>

            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 hover:bg-slate-800 text-xs font-semibold text-slate-200 backdrop-blur-md cursor-pointer transition-all"
              >
                <span>{languages.find(l => l.code === lang)?.label || 'Language'}</span>
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
                      <span>Edit Globe Beacon</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-red-400 hover:bg-red-950/40 flex items-center space-x-2 mt-1 border-t border-slate-800/80 pt-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
