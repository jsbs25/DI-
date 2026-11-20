import React, { useEffect, useRef, useState } from 'react';
import type { User, Language, KnowledgeNode, Book, Community, Post } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Search, User as UserIcon, MapPin, ShieldCheck, Eye, EyeOff, LogOut, X, ChevronDown, Sparkles, Compass, BookOpen, Users2, Network, Sun, Moon, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, GraduationCap, MessageCircle, Music2 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';
import { useAgentUiState } from '../../agent/uiStateManager.ts';

interface NavbarProps {
  currentTab: string;
  immersive?: boolean;
  onSelectTab: (tab: string) => void;
  lang: Language;
  onSelectLang: (lang: Language) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
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
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  );
}
function ResultRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0"><span className="block text-xs text-slate-800 dark:text-slate-100 truncate">{title}</span>{subtitle && <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</span>}</span>
    </button>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab, immersive = false, onSelectTab, lang, onSelectLang, theme = 'light', onToggleTheme, currentUser, onOpenProfile, onOpenAuth, onOpenSecurity, onLogout, onOpenOnboarding, onToggleLocationPrivacy,
  searchQuery, onSearchChange, onOpenBook, onOpenKnowledge, onReplayIntro, onOpenCommand
}) => {
  const isGardenHome = currentTab === 'globe';
  const agentSnap = useAgentUiState();
  const isGardenDay = agentSnap.gardenDaylight > 0.44;
  const t = translations[lang] || translations.zh;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState<{ users: User[]; posts: Post[]; books: Book[]; communities: Community[]; knowledge: KnowledgeNode[]; resources?: Array<{id:string;name:string;description:string;url:string;domain:string;primaryPlanet:string}> } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [batteryState, setBatteryState] = useState<{ level: number; charging: boolean } | null>(null);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery !== 'function') return;

    let active = true;
    let batteryObj: Awaited<ReturnType<NonNullable<typeof nav.getBattery>>> | null = null;
    const syncBattery = () => {
      if (!active || !batteryObj) return;
      setBatteryState({
        level: Math.max(0, Math.min(100, Math.round(batteryObj.level * 100))),
        charging: Boolean(batteryObj.charging),
      });
    };

    nav.getBattery()
      .then((bat) => {
        if (!active) return;
        batteryObj = bat;
        syncBattery();
        bat.addEventListener('levelchange', syncBattery);
        bat.addEventListener('chargingchange', syncBattery);
      })
      .catch(() => {});

    return () => {
      active = false;
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', syncBattery);
        batteryObj.removeEventListener('chargingchange', syncBattery);
      }
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (langMenuRef.current && !langMenuRef.current.contains(target)) {
        setLangMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserDropdownOpen(false);
      }
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        setGlobalSearchOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        setUserDropdownOpen(false);
        setGlobalSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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

  if (isGardenHome && immersive) {
    return null;
  }

  const gardenSurfacePill = isGardenDay
    ? 'border-white/60 bg-[#faf6ee]/74 text-[#1f2e27] hover:bg-[#faf6ee]/92 shadow-[0_6px_18px_rgba(24,36,28,0.10)]'
    : 'border-white/16 bg-[#131d29]/64 text-[#f5f1e8] hover:bg-[#131d29]/86 shadow-[0_8px_22px_rgba(4,8,14,0.32)]';

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-[55] ${
        isGardenHome
          ? 'px-3.5 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2 sm:px-5'
          : 'px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]'
      }`}
    >
      <div
        className={
          isGardenHome
            ? 'pointer-events-auto mx-auto flex min-h-10 w-full max-w-[1380px] items-center justify-between gap-3'
            : 'pointer-events-auto mx-auto flex min-h-12 w-full max-w-[1280px] items-center justify-between gap-2 rounded-2xl border border-[#23362c]/12 dark:border-white/[0.14] bg-[#faf7f0]/88 dark:bg-[#111b26]/86 backdrop-blur-2xl saturate-150 px-2.5 py-1 sm:px-3.5 shadow-[0_8px_28px_rgba(24,36,28,0.10)] dark:shadow-[0_14px_38px_rgba(0,0,0,0.45)]'
        }
      >
        {/* Left: Minimal Brand Return Home */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className={`flex items-center gap-2 transition-all cursor-pointer ${
              isGardenHome
                ? `h-9 rounded-full border pl-1 pr-3 ${gardenSurfacePill}`
                : 'min-h-[40px] rounded-xl px-1.5 hover:bg-[#23362c]/[0.05] dark:hover:bg-white/[0.08]'
            }`}
          >
            <ParadiseBrandEmblem
              surface={isGardenHome ? (isGardenDay ? 'garden-day' : 'garden-night') : (theme === 'dark' ? 'dark' : 'light')}
              variant="medallion"
              size={isGardenHome ? 28 : 30}
            />
            <span
              className={`hidden whitespace-nowrap text-[11px] font-semibold tracking-[0.2em] lg:inline ${
                isGardenHome
                  ? isGardenDay
                    ? 'text-[#1c2c24]'
                    : 'text-[#f7f4ec]'
                  : 'text-[#1c2c24] dark:text-[#F7F5F0]'
              }`}
            >
              EARTH ONE
            </span>
          </button>
        </div>

        {/* Center: Clean 4-Portal Navigation (图书馆 · 语言学习中心 · 通讯 · 音乐) */}
        <nav
          aria-label={lang === 'zh' ? '主导航' : 'Primary Navigation'}
          className={`flex min-w-0 items-center justify-center gap-0.5 sm:gap-1 rounded-full border p-1 transition-colors ${
            isGardenHome
              ? isGardenDay
                ? 'border-white/60 bg-[#faf6ee]/78 text-[#1f2e27] shadow-[0_6px_18px_rgba(24,36,28,0.10)]'
                : 'border-white/15 bg-[#131d29]/68 text-[#f4f0e8] shadow-[0_8px_22px_rgba(4,8,14,0.32)]'
              : 'border-[#23362c]/10 dark:border-white/[0.1] bg-[#f4efe4]/75 dark:bg-white/[0.04]'
          }`}
        >
          {[
            { id: 'library', icon: BookOpen, labelZh: '图书馆', labelEn: 'Library', labelAr: 'المكتبة' },
            { id: 'arabic-learning', icon: GraduationCap, labelZh: '语言学习中心', shortZh: '语言学习', labelEn: 'Language', labelAr: 'اللغات' },
            { id: 'chat', icon: MessageCircle, labelZh: '通讯', labelEn: 'Comm', labelAr: 'التواصل' },
            { id: 'venus', icon: Music2, labelZh: '音乐', labelEn: 'Music', labelAr: 'الموسيقى' },
          ].map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            const fullLabel = lang === 'ar' ? item.labelAr : lang === 'en' ? item.labelEn : item.labelZh;
            const compactLabel = lang === 'zh' && item.shortZh ? item.shortZh : fullLabel;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`inline-flex h-7 sm:h-8 items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 text-[11px] sm:text-[12px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? isGardenHome
                      ? isGardenDay
                        ? 'bg-[#21332b] text-[#faf7f0] shadow-xs'
                        : 'bg-[#ebe2cf] text-[#141e28] shadow-xs'
                      : 'bg-[#1f332a] text-[#faf7f0] dark:bg-[#ece4d3] dark:text-[#141d28] shadow-xs'
                    : isGardenHome
                    ? isGardenDay
                      ? 'text-[#283c33] hover:bg-black/[0.06]'
                      : 'text-[#e8e2d5]/90 hover:bg-white/[0.10]'
                    : 'text-[#31453b] dark:text-[#d8d3c8] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" />
                <span className="hidden md:inline">{fullLabel}</span>
                <span className="md:hidden">{compactLabel}</span>
              </button>
            );
          })}
        </nav>

        {/* Optional compact search dropdown container kept hidden on Home for purity */}
        {!isGardenHome && (
        <div ref={searchWrapRef} className="relative hidden xl:flex min-w-0 w-[180px] items-center">
          <div className="flex h-8 min-w-0 flex-1 items-center rounded-full border border-[#23362c]/12 dark:border-white/[0.12] bg-white/75 dark:bg-white/[0.06] px-2.5 transition-colors focus-within:border-[#247864]/60 dark:focus-within:border-[#C4A876]/55">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#52685d] dark:text-[#98A1AE]" />
            <input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              onFocus={() => searchQuery.trim() && setGlobalSearchOpen(true)}
              placeholder={t.globalSearch || (lang === 'zh' ? '搜索…' : 'Search…')}
              className="ml-1.5 min-w-0 flex-1 bg-transparent text-xs text-[#1c2b24] dark:text-slate-100 placeholder:text-[#5c7166] dark:placeholder:text-[#8E98A6] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={closeGlobalSearch}
                aria-label="Clear search"
                className="rounded p-0.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {globalSearchOpen && (
            <div className="fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] sm:absolute sm:inset-x-auto sm:left-0 sm:right-0 sm:top-[calc(100%+8px)] z-50 max-h-[60dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 dark:border-white/[0.14] bg-white/95 dark:bg-[#0B0D14]/95 py-2 shadow-2xl backdrop-blur-2xl">
              {globalSearching && <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{lang === 'zh' ? '搜索中…' : 'Searching…'}</div>}
              {!globalSearching && globalResults && totalResultCount === 0 && <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{t.noResults || 'No results'}</div>}
              {!globalSearching && globalResults && totalResultCount > 0 && (
                <>
                  {globalResults.resources && globalResults.resources.length > 0 && (
                    <Group label={lang === 'zh' ? '全网发现' : 'Discovered'}>
                      {globalResults.resources.map(r => (<ResultRow key={r.id} icon={<Sparkles className="h-3.5 w-3.5 text-[#C4A876]" />} title={r.name} subtitle={r.domain} onClick={() => { window.open(r.url, '_blank', 'noopener,noreferrer'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.knowledge.length > 0 && (
                    <Group label={t.knowledgeTab || 'Knowledge'}>
                      {globalResults.knowledge.map(n => (<ResultRow key={n.id} icon={<Network className="h-3.5 w-3.5 text-amber-600 dark:text-[#C4A876]" />} title={n.title} subtitle={n.titleEn} onClick={() => { onOpenKnowledge?.(n.id); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.books.length > 0 && (
                    <Group label={t.digitalLibrary || 'Library'}>
                      {globalResults.books.map(b => (<ResultRow key={b.id} icon={<BookOpen className="h-3.5 w-3.5 text-amber-600 dark:text-[#C4A876]" />} title={b.title} subtitle={b.author} onClick={() => { onOpenBook?.(b.id); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.communities.length > 0 && (
                    <Group label={t.communityTab || 'Community'}>
                      {globalResults.communities.map(c => (<ResultRow key={c.id} icon={<Users2 className="h-3.5 w-3.5 text-[#2E8B74]" />} title={c.name} subtitle={c.description} onClick={() => { onSelectTab('community'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                  {globalResults.posts.length > 0 && (
                    <Group label={t.feedTab || 'Feed'}>
                      {globalResults.posts.map(p => (<ResultRow key={p.id} icon={<Compass className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />} title={p.content.slice(0, 60)} subtitle={p.author?.displayName} onClick={() => { onSelectTab('feed'); closeGlobalSearch(); }} />))}
                    </Group>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* Right: Utilities & Floating Profile Avatar */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {!isGardenHome && batteryState && (
            <div
              title={
                batteryState.charging
                  ? (lang === 'zh' ? `设备正在充电 · ${batteryState.level}%` : `Charging · ${batteryState.level}%`)
                  : (lang === 'zh' ? `设备电量 · ${batteryState.level}%` : `Battery · ${batteryState.level}%`)
              }
              aria-label={batteryState.charging ? `Charging ${batteryState.level}%` : `Battery ${batteryState.level}%`}
              className={`hidden sm:inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-medium tabular-nums transition-colors ${
                batteryState.charging
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : batteryState.level <= 20
                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-slate-900/10 dark:border-white/[0.1] bg-slate-900/[0.03] dark:bg-white/[0.04] text-slate-600 dark:text-slate-300'
              }`}
            >
              {batteryState.charging ? (
                <BatteryCharging className="h-3.5 w-3.5 shrink-0" />
              ) : batteryState.level <= 20 ? (
                <BatteryLow className="h-3.5 w-3.5 shrink-0" />
              ) : batteryState.level <= 65 ? (
                <BatteryMedium className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <BatteryFull className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{batteryState.level}%</span>
            </div>
          )}
          {!isGardenHome && <PWAInstallButton lang={lang} compact={true} />}
          {!isGardenHome && onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? (lang === 'zh' ? '切换明亮模式' : 'Switch to Light mode') : (lang === 'zh' ? '切换深空模式' : 'Switch to Dark mode')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 dark:text-[#C4A876] transition-colors hover:bg-slate-900/[0.06] dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C4A876]" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>
          )}
          <div ref={langMenuRef} className="relative">
            <button
              type="button"
              aria-expanded={langMenuOpen}
              aria-haspopup="menu"
              onClick={() => { setLangMenuOpen(v => !v); setUserDropdownOpen(false); }}
              className={
                isGardenHome
                  ? `flex h-9 items-center gap-0.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${gardenSurfacePill}`
                  : 'flex h-10 items-center gap-0.5 rounded-xl px-2 text-[11px] font-medium text-[#465b50] dark:text-[#B9C1CD] transition-colors hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.08] hover:text-[#1c2b24] dark:hover:text-white cursor-pointer'
              }
            >
              <span className="uppercase">{lang}</span>
              <ChevronDown className={`h-3 w-3 ${isGardenHome ? (isGardenDay ? 'text-[#395044]' : 'text-white/75') : 'text-slate-400'}`} />
            </button>
            {langMenuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-40 rounded-2xl border border-[#23362c]/12 dark:border-white/[0.14] bg-[#faf7f0]/96 dark:bg-[#111b26]/96 py-1.5 shadow-2xl">
                {languages.map(l => (
                  <button key={l.code} type="button" onClick={() => { onSelectLang(l.code); setLangMenuOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${lang === l.code ? 'text-[#247864] dark:text-[#d6b77f] font-semibold' : 'text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]'}`}><span>{l.flag}</span><span>{l.label}</span></button>
                ))}
              </div>
            )}
          </div>

          {currentUser ? (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={userDropdownOpen}
                aria-haspopup="menu"
                onClick={() => { setUserDropdownOpen(v => !v); setLangMenuOpen(false); }}
                className={
                  isGardenHome
                    ? `flex h-9 w-9 items-center justify-center rounded-full border p-0.5 transition cursor-pointer ${gardenSurfacePill}`
                    : 'flex h-10 items-center gap-2 rounded-full border border-[#23362c]/12 dark:border-white/[0.14] bg-[#23362c]/[0.04] dark:bg-white/[0.07] p-1 sm:pr-2.5 transition hover:border-[#247864]/50 dark:hover:border-[#C4A876]/60 cursor-pointer'
                }
                title={currentUser.displayName}
              >
                <span className={`relative shrink-0 ${isGardenHome ? 'h-8 w-8' : 'h-7 w-7'}`}>
                  <img src={currentUser.avatar} alt={currentUser.displayName} className="h-full w-full rounded-full object-cover" />
                </span>
                {!isGardenHome && (
                  <>
                    <span className="hidden sm:inline max-w-[92px] truncate text-xs font-medium text-[#1c2b24] dark:text-[#F7F5F0]">
                      {currentUser.displayName}
                    </span>
                    <ChevronDown className="hidden md:inline h-3 w-3 text-slate-400" />
                  </>
                )}
              </button>
              {userDropdownOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[#23362c]/12 dark:border-white/[0.14] bg-[#faf7f0]/96 dark:bg-[#111b26]/96 py-2 text-xs shadow-2xl">
                  <div className="mb-1 flex items-center gap-2.5 border-b border-[#23362c]/10 dark:border-white/[0.1] px-3.5 py-2.5">
                    <img src={currentUser.avatar} alt={currentUser.displayName} className="h-9 w-9 rounded-full object-cover shrink-0" />
                    <div className="min-w-0">
                      <span className="block font-semibold text-[#1c2b24] dark:text-white truncate">{currentUser.displayName}</span>
                      <span className="block text-[11px] text-[#556b5f] dark:text-[#b7b0a2] truncate">@{currentUser.username}</span>
                    </div>
                  </div>
                  <PWAInstallButton lang={lang} variant="menu-item" onActionDone={() => setUserDropdownOpen(false)} />
                  {isGardenHome && onToggleTheme && (
                    <button type="button" onClick={() => { onToggleTheme(); setUserDropdownOpen(false); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]">
                      {theme === 'dark' ? <Sun className="h-4 w-4 text-[#d6b77f]" /> : <Moon className="h-4 w-4 text-[#247864]" />}
                      <span>{theme === 'dark' ? (lang === 'zh' ? '切换明亮模式' : 'Light mode') : (lang === 'zh' ? '切换深色模式' : 'Dark mode')}</span>
                    </button>
                  )}
                  <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenProfile(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]"><UserIcon className="h-4 w-4" /><span>{t.myProfile || 'Profile'}</span></button>
                  <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenOnboarding(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]"><MapPin className="h-4 w-4" /><span>{t.editGlobeBeacon || 'Beacon'}</span></button>
                  <button type="button" onClick={() => { setUserDropdownOpen(false); onToggleLocationPrivacy(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]">{currentUser.location?.isPublic ? <Eye className="h-4 w-4 text-[#247864] dark:text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />}<span>{currentUser.location?.isPublic ? t.locationPublic : t.locationPrivate}</span></button>
                  {onReplayIntro && <button type="button" onClick={() => { setUserDropdownOpen(false); onReplayIntro(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]"><Sparkles className="h-4 w-4" /><span>{lang === 'zh' ? '重播开场仪式' : 'Replay intro'}</span></button>}
                  <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenSecurity?.(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]"><ShieldCheck className="h-4 w-4" /><span>{lang === 'zh' ? '账户与安全' : 'Account & Security'}</span></button>
                  <button type="button" onClick={() => { setUserDropdownOpen(false); onLogout(); }} className="mt-1 flex w-full items-center gap-2.5 border-t border-[#23362c]/10 dark:border-white/[0.1] px-3.5 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]"><LogOut className="h-4 w-4" /><span>{t.logOut || 'Log out'}</span></button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className={
                isGardenHome
                  ? `h-9 whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition-colors cursor-pointer ${gardenSurfacePill}`
                  : 'h-9 whitespace-nowrap rounded-full bg-[#244e41] dark:bg-[#e5d9be] px-3.5 text-xs font-semibold text-[#faf7f0] dark:text-[#152028] transition-colors hover:bg-[#1c3e33] dark:hover:bg-[#f2e8d2] cursor-pointer'
              }
            >
              {t.signIn || 'Sign in'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
