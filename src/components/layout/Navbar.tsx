import React, { useEffect, useRef, useState } from 'react';
import type { User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  User as UserIcon,
  MapPin,
  ShieldCheck,
  Eye,
  EyeOff,
  LogOut,
  ChevronDown,
  Sparkles,
  BookOpen,
  Sun,
  Moon,
  GraduationCap,
  MessageCircle,
  Music2,
  Bot,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';
import { useAgentUiState } from '../../agent/uiStateManager.ts';

interface NavbarProps {
  currentTab: string;
  immersive?: boolean;
  hideBottomNav?: boolean;
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

const BOTTOM_PORTALS = [
  { id: 'library', icon: BookOpen, labelZh: '图书馆', shortZh: '图书馆', labelEn: 'Library', labelAr: 'المكتبة' },
  { id: 'arabic-learning', icon: GraduationCap, labelZh: '语言中心', shortZh: '语言', labelEn: 'Language', labelAr: 'اللغات' },
  { id: 'aihub', icon: Bot, labelZh: 'ONE AI', shortZh: 'AI', labelEn: 'ONE AI', labelAr: 'الذكاء' },
  { id: 'chat', icon: MessageCircle, labelZh: '通讯中心', shortZh: '通讯', labelEn: 'Messages', labelAr: 'التواصل' },
  { id: 'venus', icon: Music2, labelZh: '音乐中心', shortZh: '音乐', labelEn: 'Music', labelAr: 'الموسيقى' },
] as const;

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  immersive = false,
  hideBottomNav = false,
  onSelectTab,
  lang,
  onSelectLang,
  theme = 'light',
  onToggleTheme,
  currentUser,
  onOpenProfile,
  onOpenAuth,
  onOpenSecurity,
  onLogout,
  onOpenOnboarding,
  onToggleLocationPrivacy,
  onReplayIntro,
}) => {
  const isGardenHome = currentTab === 'globe';
  const agentSnap = useAgentUiState();
  const isGardenDay = agentSnap.gardenDaylight > 0.44;
  const t = translations[lang] || translations.zh;
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const langMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'ar', label: 'العربية', flag: '🇯🇴' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  ];

  if (isGardenHome && immersive) {
    return null;
  }

  const surfaceChip = isGardenHome
    ? isGardenDay
      ? 'border-white/75 bg-[#fcfaf5]/84 text-[#1b2b23] hover:bg-[#fcfaf5]/96 shadow-[0_8px_24px_rgba(20,34,27,0.12)] backdrop-blur-2xl ring-1 ring-inset ring-white/55'
      : 'border-white/16 bg-[#101924]/74 text-[#f5f1e8] hover:bg-[#101924]/90 shadow-[0_10px_28px_rgba(2,6,12,0.40)] backdrop-blur-2xl ring-1 ring-inset ring-white/[0.06]'
    : 'border-[#23362c]/12 dark:border-white/[0.14] bg-[#fcfaf5]/92 dark:bg-[#101924]/90 text-[#1b2b23] dark:text-[#f5f1e8] hover:bg-white dark:hover:bg-[#182534] shadow-[0_6px_20px_rgba(20,34,27,0.08)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.38)] backdrop-blur-2xl ring-1 ring-inset ring-white/50 dark:ring-white/[0.05]';

  const dockShell = isGardenHome
    ? isGardenDay
      ? 'border-white/75 bg-[#fcfaf5]/86 text-[#1b2b23] shadow-[0_14px_38px_rgba(20,34,27,0.16),0_2px_8px_rgba(20,34,27,0.06)] backdrop-blur-2xl ring-1 ring-inset ring-white/60'
      : 'border-white/16 bg-[#0f1722]/80 text-[#f5f1e8] shadow-[0_18px_46px_rgba(2,6,12,0.52)] backdrop-blur-2xl ring-1 ring-inset ring-white/[0.07]'
    : 'border-[#23362c]/12 dark:border-white/[0.14] bg-[#fcfaf5]/94 dark:bg-[#0f1722]/92 text-[#1b2b23] dark:text-[#f5f1e8] shadow-[0_14px_36px_rgba(20,34,27,0.12)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.50)] backdrop-blur-2xl ring-1 ring-inset ring-white/60 dark:ring-white/[0.06]';

  return (
    <>
      {/* Minimal Top Floating Corners: Brand Home Return (Left) + Theme/Lang/Profile (Right) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[55] px-3 pt-[max(0.65rem,env(safe-area-inset-top))] sm:px-5">
        <div className="mx-auto flex h-9 w-full max-w-[1380px] items-center justify-between gap-2">
          {/* Top-Left: Compact Brand Home Button */}
          <button
            type="button"
            onClick={() => onSelectTab('globe')}
            title={lang === 'zh' ? '返回 EARTH ONE 首页' : 'Return to EARTH ONE Home'}
            className={`pointer-events-auto flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 transition-all active:scale-[0.97] cursor-pointer shrink-0 ${surfaceChip}`}
          >
            <ParadiseBrandEmblem
              surface={isGardenHome ? (isGardenDay ? 'garden-day' : 'garden-night') : theme === 'dark' ? 'dark' : 'light'}
              variant="medallion"
              size={27}
            />
            <span className="whitespace-nowrap text-[11px] font-semibold tracking-[0.18em]">
              EARTH ONE
            </span>
          </button>

          {/* Top-Right: Minimal Utilities & Profile Avatar */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                title={theme === 'dark' ? (lang === 'zh' ? '切换明亮模式' : 'Switch to Light mode') : (lang === 'zh' ? '切换深色模式' : 'Switch to Dark mode')}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-[0.96] cursor-pointer ${surfaceChip}`}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-[#d6b77f]" /> : <Moon className="h-4 w-4 text-[#247864]" />}
              </button>
            )}

            <div ref={langMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                aria-expanded={langMenuOpen}
                aria-haspopup="menu"
                onClick={() => { setLangMenuOpen(v => !v); setUserDropdownOpen(false); }}
                className={`flex h-9 items-center gap-0.5 rounded-full border px-2.5 text-[11px] font-medium transition-all active:scale-[0.97] cursor-pointer ${surfaceChip}`}
              >
                <span className="uppercase">{lang}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
              {langMenuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-40 rounded-2xl border border-[#23362c]/12 dark:border-white/[0.14] bg-[#fcfaf5]/96 dark:bg-[#111b26]/96 py-1.5 shadow-2xl backdrop-blur-2xl">
                  {languages.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => { onSelectLang(l.code); setLangMenuOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs cursor-pointer ${
                        lang === l.code
                          ? 'text-[#247864] dark:text-[#d6b77f] font-semibold'
                          : 'text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
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
                  className={`flex h-9 items-center gap-2 rounded-full border p-0.5 sm:pr-2.5 transition-all active:scale-[0.97] cursor-pointer ${surfaceChip}`}
                  title={currentUser.displayName}
                >
                  <span className="relative h-7 w-7 shrink-0">
                    <img src={currentUser.avatar} alt={currentUser.displayName} className="h-full w-full rounded-full object-cover" />
                  </span>
                  <span className="hidden md:inline max-w-[84px] truncate text-xs font-medium">
                    {currentUser.displayName}
                  </span>
                  <ChevronDown className="hidden md:inline h-3 w-3 opacity-65" />
                </button>
                {userDropdownOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[#23362c]/12 dark:border-white/[0.14] bg-[#fcfaf5]/96 dark:bg-[#111b26]/96 py-2 text-xs shadow-2xl backdrop-blur-2xl">
                    <div className="mb-1 flex items-center gap-2.5 border-b border-[#23362c]/10 dark:border-white/[0.1] px-3.5 py-2.5">
                      <img src={currentUser.avatar} alt={currentUser.displayName} className="h-9 w-9 rounded-full object-cover shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-semibold text-[#1c2b24] dark:text-white truncate">{currentUser.displayName}</span>
                        <span className="block text-[11px] text-[#556b5f] dark:text-[#b7b0a2] truncate">@{currentUser.username}</span>
                      </div>
                    </div>
                    <PWAInstallButton lang={lang} variant="menu-item" onActionDone={() => setUserDropdownOpen(false)} />
                    {onToggleTheme && (
                      <button type="button" onClick={() => { onToggleTheme(); setUserDropdownOpen(false); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                        {theme === 'dark' ? <Sun className="h-4 w-4 text-[#d6b77f]" /> : <Moon className="h-4 w-4 text-[#247864]" />}
                        <span>{theme === 'dark' ? (lang === 'zh' ? '切换明亮模式' : 'Light mode') : (lang === 'zh' ? '切换深色模式' : 'Dark mode')}</span>
                      </button>
                    )}
                    <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenProfile(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                      <UserIcon className="h-4 w-4" />
                      <span>{t.myProfile || 'Profile'}</span>
                    </button>
                    <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenOnboarding(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                      <MapPin className="h-4 w-4" />
                      <span>{t.editGlobeBeacon || 'Beacon'}</span>
                    </button>
                    <button type="button" onClick={() => { setUserDropdownOpen(false); onToggleLocationPrivacy(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                      {currentUser.location?.isPublic ? <Eye className="h-4 w-4 text-[#247864] dark:text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                      <span>{currentUser.location?.isPublic ? t.locationPublic : t.locationPrivate}</span>
                    </button>
                    {onReplayIntro && (
                      <button type="button" onClick={() => { setUserDropdownOpen(false); onReplayIntro(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                        <Sparkles className="h-4 w-4" />
                        <span>{lang === 'zh' ? '重播开场仪式' : 'Replay intro'}</span>
                      </button>
                    )}
                    <button type="button" onClick={() => { setUserDropdownOpen(false); onOpenSecurity?.(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[#24362d] dark:text-[#ebe5d8] hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                      <ShieldCheck className="h-4 w-4" />
                      <span>{lang === 'zh' ? '账户、安全与系统健康' : 'Account, Security & Health'}</span>
                    </button>
                    <button type="button" onClick={() => { setUserDropdownOpen(false); onLogout(); }} className="mt-1 flex w-full items-center gap-2.5 border-t border-[#23362c]/10 dark:border-white/[0.1] px-3.5 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-[#23362c]/[0.06] dark:hover:bg-white/[0.06] cursor-pointer">
                      <LogOut className="h-4 w-4" />
                      <span>{t.logOut || 'Log out'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="h-9 whitespace-nowrap rounded-full bg-[#244e41] dark:bg-[#e5d9be] px-3.5 text-xs font-semibold text-[#faf7f0] dark:text-[#152028] transition-colors hover:bg-[#1c3e33] dark:hover:bg-[#f2e8d2] cursor-pointer"
              >
                {t.signIn || 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Unified Apple-Grade Symmetrical Floating Glass Bottom Navigation Dock */}
      {!hideBottomNav && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-1">
          <nav
            aria-label={lang === 'zh' ? '底部主导航' : 'Bottom Primary Navigation'}
            className={`pointer-events-auto grid w-full max-w-[420px] grid-cols-5 items-center gap-1 rounded-[24px] border p-1.5 transition-all sm:w-auto sm:min-w-[540px] sm:max-w-[600px] sm:gap-1.5 sm:rounded-full sm:p-1.5 ${dockShell}`}
          >
            {BOTTOM_PORTALS.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              const isCenterAi = item.id === 'aihub';
              const fullLabel = lang === 'ar' ? item.labelAr : lang === 'en' ? item.labelEn : item.labelZh;
              const compactLabel = lang === 'zh' ? item.shortZh : fullLabel;

              const activeTabCls = isGardenHome
                ? isGardenDay
                  ? 'bg-[#1d352c] text-[#faf7f0] shadow-[0_4px_12px_rgba(20,38,30,0.24)]'
                  : 'bg-[#ede3ce] text-[#131d27] shadow-[0_4px_14px_rgba(0,0,0,0.28)]'
                : 'bg-[#1f6250] text-[#faf7f0] dark:bg-[#ede3ce] dark:text-[#131d27] shadow-[0_4px_12px_rgba(20,56,45,0.20)]';

              const inactiveTabCls = isGardenHome
                ? isGardenDay
                  ? isCenterAi
                    ? 'bg-black/[0.045] text-[#1b2e26] hover:bg-black/[0.08]'
                    : 'text-[#2b3f36]/90 hover:bg-black/[0.055] hover:text-[#14221c]'
                  : isCenterAi
                    ? 'bg-white/[0.08] text-[#f6f1e6] hover:bg-white/[0.14]'
                    : 'text-[#e8e2d5]/85 hover:bg-white/[0.09] hover:text-white'
                : isCenterAi
                  ? 'bg-[#1f6250]/[0.08] text-[#1c4b3d] dark:bg-white/[0.09] dark:text-[#efe7d6] hover:bg-[#1f6250]/[0.14] dark:hover:bg-white/[0.15]'
                  : 'text-[#31453b]/90 dark:text-[#d8d3c8]/88 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-[#16241d] dark:hover:text-white';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-[20px] px-1.5 py-1.5 text-[10.5px] font-medium tracking-[0.015em] whitespace-nowrap transition-all duration-200 active:scale-[0.96] cursor-pointer sm:min-h-[40px] sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-1.5 sm:text-[12.5px] ${
                    active ? activeTabCls : inactiveTabCls
                  }`}
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-[1.06] sm:h-[16px] sm:w-[16px]"
                    strokeWidth={active ? 2.15 : 1.75}
                  />
                  <span className="hidden sm:inline">{fullLabel}</span>
                  <span className="sm:hidden leading-none">{compactLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
};
