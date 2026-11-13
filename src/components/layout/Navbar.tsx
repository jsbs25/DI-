import React, { useEffect, useState } from 'react';
import type { User, Language, KnowledgeNode, Book, Community, Post } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Search, Command as CommandIcon, User as UserIcon, MapPin, ShieldCheck, Eye, EyeOff, LogOut, X, ChevronDown, Sparkles, Compass, BookOpen, Users2, Network } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
  onSelectLang: (lang: Language) => void;
  currentUser: User | null;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenSecurity?: () => void;
  onLogout: () => void;
  onOpenOnboarding: () => void;
  onToggleLocationPrivacy: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenBook?: (bookId: string) => void;
  onOpenKnowledge?: (nodeId: string) => void;
  onReplayIntro?: () => void;
  onOpenCommand?: () => void;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      {children}
    </div>
  );
}
function ResultRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-white/5 transition-colors">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0"><span className="block text-xs text-slate-200 truncate">{title}</span>{subtitle && <span className="block text-[11px] text-slate-500 truncate">{subtitle}</span>}</span>
    </button>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  onSelectTab, lang, onSelectLang, currentUser, onOpenProfile, onOpenAuth, onOpenSecurity, onLogout, onOpenOnboarding, onToggleLocationPrivacy,
  searchQuery, onSearchChange, onOpenBook, onOpenKnowledge, onReplayIntro, onOpenCommand
}) => {
  const t = translations[lang] || translations.zh;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState<{ users: User[]; posts: Post[]; books: Book[]; communities: Community[]; knowledge: KnowledgeNode[]; resources?: Array<{id:string;name:string;description:string;url:string;domain:string;primaryPlanet:string}> } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearching, setGlobalSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setGlobalResults(null); setGlobalSearchOpen(false); return; }
    setGlobalSearchOpen(true); setGlobalSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) setGlobalResults(data.results);
      } catch { setGlobalResults(null); } finally { setGlobalSearching(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const totalResultCount = globalResults ? globalResults.users.length + globalResults.posts.length + globalResults.books.length + globalResults.communities.length + globalResults.knowledge.length + (globalResults.resources?.length || 0) : 0;
  const closeGlobalSearch = () => { setGlobalSearchOpen(false); onSearchChange(''); };

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'zh', label: '中文', flag: '🇨🇳' }, { code: 'en', label: 'English', flag: '🇺🇸' }, { code: 'ar', label: 'العربية', flag: '🇯🇴' }, { code: 'es', label: 'Español', flag: '🇪🇸' }, { code: 'fr', label: 'Français', flag: '🇫🇷' }, { code: 'ru', label: 'Русский', flag: '🇷🇺' }
  ];

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-2.5 sm:px-4 sm:pt-3">
      <div className="pointer-events-auto mx-auto flex h-11 max-w-[1200px] items-center justify-between gap-2 rounded-2xl eo-glass px-2 sm:px-2.5 shadow-[0_8px_32px_-16px_rgba(0,0,0,0.5)]">
        <div className="flex min-w-0 items-center gap-1.5">
          <button onClick={() => onSelectTab('globe')} className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/[0.05]">
            <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/15">
              <img src="/assets/earth/earth_day_2048.jpg" alt="EARTH ONE" className="h-full w-full object-cover" />
            </div>
            <span className="hidden whitespace-nowrap text-[13px] font-semibold tracking-wide text-white/95 sm:inline">EARTH ONE</span>
          </button>
        </div>

        <div className="relative flex min-w-0 max-w-[420px] flex-1 items-center gap-1.5">
          <div className="flex h-8 min-w-0 flex-1 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 transition-colors focus-within:border-[rgba(78,161,255,0.35)] focus-within:bg-white/[0.04]">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <input value={searchQuery} onChange={e => onSearchChange(e.target.value)} onFocus={() => searchQuery.trim() && setGlobalSearchOpen(true)} placeholder={t.globalSearch || (lang === 'zh' ? '搜索…' : 'Search…')} className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
            {searchQuery && <button onClick={closeGlobalSearch} className="rounded p-0.5 text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <button onClick={onOpenCommand} title={lang === 'zh' ? '命令中心 (⌘K)' : 'Command (⌘K)'} className="hidden h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200 sm:inline-flex">
            <CommandIcon className="h-3.5 w-3.5" /><span>⌘K</span>
          </button>

          {globalSearchOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[rgba(7,10,18,0.96)] py-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl">
              {globalSearching && <div className="px-4 py-3 text-xs text-slate-500">{lang === 'zh' ? '搜索中…' : 'Searching…'}</div>}
              {!globalSearching && globalResults && totalResultCount === 0 && <div className="px-4 py-3 text-xs text-slate-500">{t.noResults || 'No results'}</div>}
              {!globalSearching && globalResults && totalResultCount > 0 && (
                <>
                  {globalResults.resources && globalResults.resources.length > 0 && (
                    <Group label={lang === 'zh' ? '全网发现' : 'Discovered'}>
                      {globalResults.resources.map(r => (<ResultRow key={r.id} icon={<Sparkles className="h-3.5 w-3.5 text-cyan-400" />} title={r.name} subtitle={r.domain} onClick={() => { window.open(r.url, '_blank', 'noopener,noreferrer'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.knowledge.length > 0 && (
                    <Group label={t.knowledgeTab || 'Knowledge'}>
                      {globalResults.knowledge.map(n => (<ResultRow key={n.id} icon={<Network className="h-3.5 w-3.5 text-amber-400" />} title={n.title} subtitle={n.titleEn} onClick={() => { onOpenKnowledge?.(n.id); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.books.length > 0 && (
                    <Group label={t.digitalLibrary || 'Library'}>
                      {globalResults.books.map(b => (<ResultRow key={b.id} icon={<BookOpen className="h-3.5 w-3.5 text-amber-400" />} title={b.title} subtitle={b.author} onClick={() => { onOpenBook?.(b.id); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.communities.length > 0 && (
                    <Group label={t.communityTab || 'Community'}>
                      {globalResults.communities.map(c => (<ResultRow key={c.id} icon={<Users2 className="h-3.5 w-3.5 text-emerald-400" />} title={c.name} subtitle={c.description} onClick={() => { onSelectTab('community'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.posts.length > 0 && (
                    <Group label={t.feedTab || 'Feed'}>
                      {globalResults.posts.map(p => (<ResultRow key={p.id} icon={<Compass className="h-3.5 w-3.5 text-blue-400" />} title={p.content.slice(0, 60)} subtitle={p.author?.displayName} onClick={() => { onSelectTab('feed'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {onReplayIntro && <button onClick={onReplayIntro} title={lang === 'zh' ? '入场动画' : 'Intro'} className="hidden h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200 sm:inline-flex"><Sparkles className="h-4 w-4" /></button>}
          <div className="relative">
            <button onClick={() => setLangMenuOpen(!langMenuOpen)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"><span className="uppercase">{lang}</span><ChevronDown className="h-3 w-3 text-slate-500" /></button>
            {langMenuOpen && (
              <div onMouseLeave={() => setLangMenuOpen(false)} className="absolute right-0 mt-2 w-40 rounded-2xl border border-white/[0.08] bg-[rgba(7,10,18,0.96)] py-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                {languages.map(l => (
                  <button key={l.code} onClick={() => { onSelectLang(l.code); setLangMenuOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${lang === l.code ? 'text-[var(--color-accent-soft)]' : 'text-slate-300 hover:bg-white/[0.05]'}`}><span>{l.flag}</span><span>{l.label}</span></button>
                ))}
              </div>
            )}
          </div>

          {currentUser ? (
            <>
              <button onClick={onToggleLocationPrivacy} title={currentUser.location?.isPublic ? t.locationPublic : t.locationPrivate} className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.05] ${currentUser.location?.isPublic ? 'text-emerald-400' : 'text-amber-400'}`}>
                {currentUser.location?.isPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <div className="relative">
                <button onClick={() => setUserDropdownOpen(!userDropdownOpen)} className="rounded-full p-0.5 ring-1 ring-white/10 transition hover:ring-white/20">
                  <img src={currentUser.avatar} alt={currentUser.displayName} className="h-7 w-7 rounded-full object-cover" />
                </button>
                {userDropdownOpen && (
                  <div onMouseLeave={() => setUserDropdownOpen(false)} className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/[0.08] bg-[rgba(7,10,18,0.96)] py-2 text-xs shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                    <div className="mb-1 border-b border-white/[0.08] px-3.5 py-2"><span className="block font-semibold text-white truncate">{currentUser.displayName}</span><span className="block text-[11px] text-slate-400">@{currentUser.username}</span></div>
                    <button onClick={() => { setUserDropdownOpen(false); onOpenProfile(); }} className="flex w-full items-center gap-2 px-3.5 py-1.5 text-slate-300 hover:bg-white/[0.05]"><UserIcon className="h-3.5 w-3.5" /><span>{t.myProfile || 'Profile'}</span></button>
                    <button onClick={() => { setUserDropdownOpen(false); onOpenOnboarding(); }} className="flex w-full items-center gap-2 px-3.5 py-1.5 text-slate-300 hover:bg-white/[0.05]"><MapPin className="h-3.5 w-3.5" /><span>{t.editGlobeBeacon || 'Beacon'}</span></button>
                    <button onClick={() => { setUserDropdownOpen(false); onOpenSecurity?.(); }} className="flex w-full items-center gap-2 px-3.5 py-1.5 text-slate-300 hover:bg-white/[0.05]"><ShieldCheck className="h-3.5 w-3.5" /><span>Account & Security</span></button>
                    <button onClick={() => { setUserDropdownOpen(false); onLogout(); }} className="mt-1 flex w-full items-center gap-2 border-t border-white/[0.08] px-3.5 py-2 text-red-400 hover:bg-white/[0.05]"><LogOut className="h-3.5 w-3.5" /><span>{t.logOut || 'Log out'}</span></button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={onOpenAuth} className="h-8 whitespace-nowrap rounded-xl bg-[rgba(78,161,255,0.18)] px-3 text-xs font-semibold text-white ring-1 ring-[rgba(78,161,255,0.3)] transition-colors hover:bg-[rgba(78,161,255,0.26)]">{t.signIn || 'Sign in'}</button>
          )}
        </div>
      </div>
    </header>
  );
};
