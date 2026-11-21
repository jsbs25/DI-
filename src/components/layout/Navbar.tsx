import React, { useEffect, useRef, useState } from 'react';
import type { User, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  ArrowLeft,
  User as UserIcon,
  MapPin,
  ShieldCheck,
  Eye,
  EyeOff,
  LogOut,
  ChevronDown,
  Sparkles,
  Sun,
  Moon,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
} from 'lucide-react';
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

const SUBPAGE_TITLES: Record<string, { zh: string; en: string; ar: string }> = {
  library: { zh: '图书馆', en: 'Library', ar: 'المكتبة' },
  'arabic-learning': { zh: '语言中心', en: 'Language Center', ar: 'مركز اللغات' },
  aihub: { zh: 'ONE AI', en: 'ONE AI', ar: 'الذكاء' },
  chat: { zh: '通讯中心', en: 'Messages', ar: 'التواصل' },
  venus: { zh: '音乐中心', en: 'Music', ar: 'الموسيقى' },
  knowledge: { zh: '知识星图', en: 'Knowledge', ar: 'المعرفة' },
  browser: { zh: '浏览器', en: 'Browser', ar: 'المتصفح' },
  feed: { zh: '全球动态', en: 'Feed', ar: 'الأخبار' },
  saturn: { zh: '影音空间', en: 'Cinema', ar: 'السينما' },
  mercury: { zh: '全网探索', en: 'Explore', ar: 'استكشاف' },
  moon: { zh: '天文观星', en: 'Observatory', ar: 'المرصد' },
  academy: { zh: '学院', en: 'Academy', ar: 'الأكاديمية' },
  network: { zh: '网络中心', en: 'Network', ar: 'الشبكة' },
  brand: { zh: '品牌理念', en: 'Brand', ar: 'الهوية' },
  settings: { zh: '设置与安全', en: 'Settings', ar: 'الإعدادات' },
  profile: { zh: '个人主页', en: 'Profile', ar: 'الملف' },
  call: { zh: '实时通话', en: 'Calls', ar: 'المكالمات' },
};

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  immersive = false,
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
  const [batteryState, setBatteryState] = useState<{ level: number; charging: boolean } | null>(null);

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
    if (typeof nav?.getBattery !== 'function') return;

    let cancelled = false;
    let batteryObj: {
      level: number;
      charging: boolean;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    } | null = null;

    const updateBattery = () => {
      if (!batteryObj || cancelled) return;
      setBatteryState({
        level: Math.round(batteryObj.level * 100),
        charging: Boolean(batteryObj.charging),
      });
    };

    nav
      .getBattery()
      .then((bat) => {
        if (cancelled) return;
        batteryObj = bat;
        updateBattery();
        bat.addEventListener('levelchange', updateBattery);
        bat.addEventListener('chargingchange', updateBattery);
      })
      .catch(() => {
        // Ignore if blocked by browser policy
      });

    return () => {
      cancelled = true;
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', updateBattery);
        batteryObj.removeEventListener('chargingchange', updateBattery);
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
      ? 'border-[#1d2d25]/14 bg-[#f3eee4]/92 text-[#1b2b23] hover:bg-[#f8f4ec] shadow-[0_6px_18px_rgba(16,28,22,0.14)]'
      : 'border-white/12 bg-[#0f1722]/88 text-[#f5f1e8] hover:bg-[#162231]/94 shadow-[0_8px_22px_rgba(2,6,12,0.38)]'
    : 'border-[#23362c]/12 dark:border-white/[0.14] bg-[#fcfaf5]/95 dark:bg-[#101924]/94 text-[#1b2b23] dark:text-[#f5f1e8] hover:bg-white dark:hover:bg-[#182534] shadow-[0_6px_18px_rgba(20,34,27,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]';

  return (
    <>
      {/* Minimal Top Floating Corners: Brand Home Return (Left) + Theme/Lang/Profile (Right) */}
      <header
        className={`fixed inset-x-0 top-0 z-[55] px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.65rem,env(safe-area-inset-top))] ${
          isGardenHome
            ? 'pointer-events-none'
            : 'pointer-events-auto border-b border-[#23362c]/10 dark:border-white/[0.1] bg-[#faf7f0]/92 dark:bg-[#0d141e]/92 backdrop-blur-md pb-2 sm:pb-2.5'
        }`}
      >
        <div className="mx-auto grid h-8 sm:h-9 w-full max-w-[1380px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2.5">
          {/* Column 1 (Left): Brand Medallion on Garden Home; Single Return-Home Control inside Sub-Modules */}
          <div className="pointer-events-auto flex min-w-0 items-center justify-self-start">
            {isGardenHome ? (
              <button
                type="button"
                onClick={() => onSelectTab('globe')}
                title={lang === 'zh' ? 'EARTH ONE 主页' : 'EARTH ONE Home'}
                className={`flex h-8 w-8 sm:h-9 sm:w-9 lg:w-auto items-center justify-center lg:justify-start gap-1.5 rounded-full border p-0.5 lg:pl-0.5 lg:pr-2.5 transition-all active:scale-[0.97] cursor-pointer shrink-0 ${surfaceChip}`}
              >
                <ParadiseBrandEmblem
                  surface={isGardenDay ? 'garden-day' : 'garden-night'}
                  variant="medallion"
                  size={20}
                />
                <span className="hidden lg:inline whitespace-nowrap text-[10px] font-semibold tracking-[0.16em]">
                  EARTH ONE
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectTab('globe')}
                title={lang === 'zh' ? '返回主界面' : 'Return Home'}
                className={`flex h-8 sm:h-9 items-center gap-1.5 rounded-full border pl-2 pr-2.5 sm:pl-2.5 sm:pr-3 text-[11.5px] sm:text-xs font-medium transition-all active:scale-[0.97] cursor-pointer shrink-0 ${surfaceChip}`}
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  {lang === 'ar' ? 'الرئيسية' : lang === 'en' ? 'Home' : '返回主页'}
                </span>
              </button>
            )}
          </div>

          {/* Column 2 (Center): Reserved for Garden Live Clock on Home; Centered Active Workspace Title in Sub-Modules (Zero Sub-Module Navigation Links) */}
          <div className="flex min-w-0 items-center justify-center justify-self-center">
            {!isGardenHome && SUBPAGE_TITLES[currentTab] && (
              <h1 className="truncate max-w-[8.5rem] sm:max-w-[16rem] md:max-w-[22rem] text-center text-[13px] sm:text-[14px] font-semibold tracking-tight text-[#1b2b23] dark:text-[#f5f1e8]">
                {lang === 'ar'
                  ? SUBPAGE_TITLES[currentTab].ar
                  : lang === 'en'
                    ? SUBPAGE_TITLES[currentTab].en
                    : SUBPAGE_TITLES[currentTab].zh}
              </h1>
            )}
          </div>

          {/* Column 3 (Right): Minimal Utilities & Profile Avatar */}
          <div className="pointer-events-auto flex shrink-0 items-center justify-self-end gap-1 sm:gap-1.5">
            {batteryState && (
              <div
                title={
                  batteryState.charging
                    ? lang === 'zh'
                      ? `正在充电 · ${batteryState.level}%`
                      : `Charging · ${batteryState.level}%`
                    : lang === 'zh'
                      ? `设备电量 ${batteryState.level}%`
                      : `Battery ${batteryState.level}%`
                }
                aria-label={`Battery ${batteryState.level}%${batteryState.charging ? ' charging' : ''}`}
                className={`${isGardenHome ? 'hidden lg:flex' : 'hidden sm:flex'} h-9 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium tabular-nums transition-all ${surfaceChip}`}
              >
                {batteryState.charging ? (
                  <BatteryCharging className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                ) : batteryState.level >= 70 ? (
                  <BatteryFull className="h-4 w-4 text-[#247864] dark:text-[#d6b77f]" />
                ) : batteryState.level >= 25 ? (
                  <BatteryMedium className="h-4 w-4 opacity-80" />
                ) : (
                  <BatteryLow className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                )}
                <span className="hidden md:inline">{batteryState.level}%</span>
              </div>
            )}

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                title={theme === 'dark' ? (lang === 'zh' ? '切换明亮模式' : 'Switch to Light mode') : (lang === 'zh' ? '切换深色模式' : 'Switch to Dark mode')}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className={`${isGardenHome ? 'hidden md:flex' : 'flex'} h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border transition-all active:scale-[0.96] cursor-pointer ${surfaceChip}`}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-[#d6b77f]" /> : <Moon className="h-4 w-4 text-[#247864]" />}
              </button>
            )}

            <div ref={langMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={langMenuOpen}
                aria-haspopup="menu"
                onClick={() => { setLangMenuOpen(v => !v); setUserDropdownOpen(false); }}
                className={`flex h-8 sm:h-9 items-center gap-0.5 rounded-full border px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-medium transition-all active:scale-[0.97] cursor-pointer ${surfaceChip}`}
              >
                <span className="uppercase">{lang}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
              {langMenuOpen && (
                <div role="menu" className="absolute right-0 z-[60] mt-2 w-40 rounded-2xl border border-[#23362c]/14 dark:border-white/[0.14] bg-[#f8f5ee] dark:bg-[#111b26] py-1.5 shadow-2xl">
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
                  className={`flex h-8 sm:h-9 items-center gap-2 rounded-full border p-0.5 ${isGardenHome ? 'lg:pr-2.5' : 'sm:pr-2.5'} transition-all active:scale-[0.97] cursor-pointer ${surfaceChip}`}
                  title={currentUser.displayName}
                >
                  <span className="relative h-6 w-6 sm:h-7 sm:w-7 shrink-0">
                    <img src={currentUser.avatar} alt={currentUser.displayName} className="h-full w-full rounded-full object-cover" />
                  </span>
                  <span className={`${isGardenHome ? 'hidden lg:inline' : 'hidden md:inline'} max-w-[84px] truncate text-xs font-medium`}>
                    {currentUser.displayName}
                  </span>
                  <ChevronDown className={`${isGardenHome ? 'hidden lg:inline' : 'hidden md:inline'} h-3 w-3 opacity-65`} />
                </button>
                {userDropdownOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[#23362c]/14 dark:border-white/[0.14] bg-[#f8f5ee] dark:bg-[#111b26] py-2 text-xs shadow-2xl">
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
                      <span>{lang === 'zh' ? '编辑个人坐标' : lang === 'ar' ? 'تعديل الموقع' : 'Edit Location'}</span>
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
                className="h-8 sm:h-9 whitespace-nowrap rounded-full bg-[#244e41] dark:bg-[#e5d9be] px-3 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-[#faf7f0] dark:text-[#152028] transition-colors hover:bg-[#1c3e33] dark:hover:bg-[#f2e8d2] cursor-pointer"
              >
                {t.signIn || 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </header>

    </>
  );
};
