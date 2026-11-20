import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  Cloud,
  CloudRain,
  Compass,
  Film,
  Gamepad2,
  Globe2,
  GraduationCap,
  Maximize2,
  MessageCircle,
  Mic,
  Moon,
  Music2,
  Orbit,
  Phone,
  Radio,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Users,
} from 'lucide-react';
import type {
  Conversation,
  CreatorArticle,
  GlobeCountryStat,
  GlobeUserNode,
  Language,
  Post,
  User,
  VideoItem,
} from '../../types/index.ts';
import { ParadiseWorld3D } from '../paradise/ParadiseWorld3D.tsx';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import type { TimePreset, WeatherKind } from '../paradise/paradiseEnvironment.ts';
import { containsArabic } from '../../utils/arabicTextNormalize.ts';

type Props = {
  lang: Language;
  currentUser: User | null;
  nodes: GlobeUserNode[];
  countries: GlobeCountryStat[];
  posts: Post[];
  videos: VideoItem[];
  articles: CreatorArticle[];
  conversations: Conversation[];
  focusCoordinates: { lat: number; lng: number; timestamp?: number } | null;
  onSelectCountry: (countryCode: string | null) => void;
  onSelectUser: (user: GlobeUserNode) => void;
  onSelectTab: (tab: string) => void;
  onOpenBook?: (bookId: string) => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
  onOpenConversation?: (conversationId: string) => void;
  onOpenCallCenter?: () => void;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
};

export const OneHome: React.FC<Props> = ({
  lang,
  currentUser,
  nodes,
  countries,
  posts,
  articles,
  conversations,
  onSelectCountry,
  onSelectUser,
  onSelectTab,
  onQuickCall,
  onOpenConversation,
  onOpenCallCenter,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const isAr = lang === 'ar';
  const L = (zh: string, en: string, ar?: string) => (isAr ? ar || en : isZh ? zh : en);

  const agentSnap = useAgentUiState();
  const [activeTimePreset, setActiveTimePreset] = useState<TimePreset | null>(null);
  const [activeWeatherPreset, setActiveWeatherPreset] = useState<WeatherKind | null>(null);

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return L('夜深安静', 'Quiet night', 'ليلة هادئة');
    if (hour < 11) return L('早安', 'Good morning', 'صباح الخير');
    if (hour < 14) return L('午安', 'Good afternoon', 'مساء الخير');
    if (hour < 18) return L('下午好', 'Good afternoon', 'طاب مساؤك');
    return L('晚上好', 'Good evening', 'مساء النور');
  }, [lang]);

  const timePresets: Array<{
    id: TimePreset;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dawn', label: L('黎明', 'Dawn', 'الفجر'), icon: Sunrise },
    { id: 'day', label: L('白昼', 'Day', 'النهار'), icon: Sun },
    { id: 'dusk', label: L('黄昏', 'Dusk', 'الغسق'), icon: Sunset },
    { id: 'night', label: L('夜晚', 'Night', 'الليل'), icon: Moon },
  ];

  const weatherPresets: Array<{
    id: WeatherKind;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'clear', label: L('晴朗', 'Clear', 'صحو'), icon: Sun },
    { id: 'overcast', label: L('阴天', 'Overcast', 'غائم'), icon: Cloud },
    { id: 'light-rain', label: L('细雨', 'Rain', 'مطر'), icon: CloudRain },
    { id: 'rainbow', label: L('彩虹', 'Rainbow', 'قوس قزح'), icon: Sparkles },
  ];

  const coreSpaces = [
    {
      id: 'library',
      title: L('数字图书馆', 'Digital Library', 'المكتبة الرقمية'),
      subtitle: L(
        '世界典籍、Noor 阿拉伯语文献与沉浸式双语阅读器',
        'Global classics, Noor Arabic manuscripts & immersive reader',
        'الكتب الكلاسيكية ومخطوطات النور والقارئ التفاعلي'
      ),
      actionLabel: L('进入阅读', 'Open Library', 'افتح المكتبة'),
      icon: BookOpen,
      iconBg:
        'bg-gradient-to-br from-[#247864]/18 to-[#247864]/5 text-[#247864] dark:from-[#52b798]/24 dark:to-[#52b798]/8 dark:text-[#6fd3b3]',
      glow: 'hover:border-[#247864]/35 dark:hover:border-[#52b798]/40',
    },
    {
      id: 'arabic-learning',
      title: L('语言学习中心', 'Language Studio', 'استوديو اللغات'),
      subtitle: L(
        '阿拉伯语字母笔顺、真人语音跟读与多语口语实景训练',
        'Arabic script studio, pronunciation practice & AI roleplay',
        'إتقان الحروف العربية والتدريب الصوتي والمحادثة'
      ),
      actionLabel: L('开始练习', 'Practice', 'ابدأ التدريب'),
      icon: GraduationCap,
      iconBg:
        'bg-gradient-to-br from-[#9e7a3a]/20 to-[#9e7a3a]/6 text-[#9e7a3a] dark:from-[#d6b77f]/25 dark:to-[#d6b77f]/8 dark:text-[#e3c894]',
      glow: 'hover:border-[#9e7a3a]/35 dark:hover:border-[#d6b77f]/40',
    },
    {
      id: 'aihub',
      title: L('ONE AI 智能中枢', 'ONE AI Hub', 'مركز الذكاء'),
      subtitle: L(
        '多模型协同推理、全双工语音对话与全域指令调度',
        'Multi-model reasoning, live voice & workspace orchestration',
        'تفكير متعدد النماذج ومحادثة صوتية مباشرة'
      ),
      actionLabel: L('打开对话', 'Open AI', 'افتح الذكاء'),
      icon: Bot,
      iconBg:
        'bg-gradient-to-br from-sky-500/18 to-indigo-500/6 text-sky-700 dark:from-sky-400/22 dark:to-indigo-400/8 dark:text-sky-300',
      glow: 'hover:border-sky-500/35 dark:hover:border-sky-400/40',
    },
    {
      id: 'venus',
      title: L('音乐与影音空间', 'Music & Cinema', 'الموسيقى والسينما'),
      subtitle: L(
        '全球无损旋律播放列表、跨页悬浮播放与纪录片影院',
        'Curated acoustic playlists, persistent playback & cinema',
        'قوائم موسيقية مختارة وسينما وثائقية عالمية'
      ),
      actionLabel: L('聆听音乐', 'Listen', 'استمع الآن'),
      icon: Music2,
      iconBg:
        'bg-gradient-to-br from-rose-500/16 to-amber-500/6 text-rose-700 dark:from-rose-400/20 dark:to-amber-400/8 dark:text-rose-300',
      glow: 'hover:border-rose-500/35 dark:hover:border-rose-400/40',
    },
  ];

  const secondarySpaces = [
    { id: 'chat', label: L('即时通讯', 'Messages', 'الرسائل'), icon: MessageCircle },
    { id: 'feed', label: L('发现广场', 'Global Feed', 'الساحة العالمية'), icon: Globe2 },
    { id: 'knowledge', label: L('知识宇宙', 'Knowledge', 'كون المعرفة'), icon: Sparkles },
    { id: 'creator', label: L('创作专栏', 'Creator Hub', 'منصة المبدعين'), icon: Radio },
    { id: 'browser', label: L('JUPITER 浏览', 'Browser', 'المتصفح'), icon: Compass },
    { id: 'saturn', label: L('土星影院', 'Cinema', 'السينما'), icon: Film },
    { id: 'moon', label: L('月球观测', 'Observatory', 'المرصد'), icon: Orbit },
    { id: 'game', label: L('星际对弈', 'Games', 'الألعاب'), icon: Gamepad2 },
  ];

  const recentConversations = conversations.slice(0, 2);
  const featuredPosts = posts.slice(0, 3);
  const featuredArticles = articles.slice(0, 3);
  const activeNodes = nodes.slice(0, 4);
  const topCountries = countries.slice(0, 5);

  const glassCardClass =
    'rounded-[24px] border border-[#23362c]/10 dark:border-white/[0.11] bg-[linear-gradient(155deg,rgba(255,255,255,0.88),rgba(247,244,236,0.72))] dark:bg-[linear-gradient(155deg,rgba(24,34,47,0.86),rgba(16,24,34,0.76))] backdrop-blur-2xl shadow-[0_8px_28px_rgba(24,36,28,0.06)] dark:shadow-[0_14px_38px_rgba(0,0,0,0.32)]';

  const handleSelectTime = (preset: TimePreset) => {
    setActiveTimePreset(preset);
    uiStateManager.issueEnvironmentCommand({ timePreset: preset, realtimeSync: false });
  };

  const handleSelectWeather = (w: WeatherKind) => {
    setActiveWeatherPreset(w);
    uiStateManager.issueEnvironmentCommand({ weatherPreset: w, realtimeSync: false });
  };

  const handleRealtimeSync = () => {
    setActiveTimePreset(null);
    setActiveWeatherPreset(null);
    uiStateManager.issueEnvironmentCommand({ realtimeSync: true });
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`relative min-h-[100dvh] w-full bg-[var(--color-one-bg)] text-[var(--color-one-text)] ${
        isAr ? 'font-arabic-ui' : ''
      }`}
    >
      {/* Subtle atmospheric gradient canvas behind glass dashboard */}
      {!immersive && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_78%_55%_at_18%_0%,rgba(36,120,100,0.09),transparent_62%),radial-gradient(ellipse_62%_48%_at_86%_12%,rgba(158,122,58,0.08),transparent_60%)] dark:bg-[radial-gradient(ellipse_78%_55%_at_18%_0%,rgba(82,183,152,0.11),transparent_62%),radial-gradient(ellipse_62%_48%_at_86%_12%,rgba(214,183,127,0.08),transparent_60%)]"
        />
      )}

      <div
        className={
          immersive
            ? 'relative z-10'
            : 'relative z-10 mx-auto w-full max-w-[1380px] px-3.5 sm:px-6 pt-[calc(4.4rem+env(safe-area-inset-top))] pb-[calc(6.25rem+env(safe-area-inset-bottom))]'
        }
      >
        {/* Top Hero Split: Interactive 3D Paradise Card + Glass Companion & Atmosphere Cards */}
        <section className={immersive ? '' : 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch'}>
          {/* Left 8 Columns: Living 3D Paradise Garden Card (seamless transition to Fullscreen 3D) */}
          <div
            className={
              immersive
                ? 'fixed inset-0 z-[58] h-[100dvh] w-full overflow-hidden bg-[#0e1928]'
                : 'lg:col-span-8 relative h-[420px] sm:h-[490px] lg:h-[550px] w-full overflow-hidden rounded-[28px] border border-[#23362c]/12 dark:border-white/[0.14] bg-[#0e1928] shadow-[0_18px_52px_rgba(20,34,27,0.14)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.48)]'
            }
          >
            <ParadiseWorld3D
              lang={lang}
              embedded={!immersive}
              immersive={immersive}
              onImmersiveChange={onImmersiveChange}
            />
          </div>

          {/* Right 4 Columns: Personal Sanctuary & Atmosphere + Live World Pulse */}
          {!immersive && (
            <div className="lg:col-span-4 flex flex-col gap-5">
              {/* Card 1: Personal Welcome & Real-Time Atmosphere Controls */}
              <div className={`${glassCardClass} p-5 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--color-one-text-muted)]">
                        {greetingText}
                        {currentUser?.location?.cityName || agentSnap.liveWeather?.locationName
                          ? ` · ${agentSnap.liveWeather?.locationName || currentUser?.location?.cityName}`
                          : ''}
                      </p>
                      <h1 className="mt-1 text-xl sm:text-[22px] font-semibold tracking-tight text-[var(--color-one-text)] truncate text-balance">
                        {currentUser?.displayName || L('EARTH ONE 旅人', 'EARTH ONE Explorer', 'مستكشف EARTH ONE')}
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={handleRealtimeSync}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                        agentSnap.realtimeSync
                          ? 'border-[#247864]/30 bg-[#247864]/12 text-[#1e6453] dark:border-[#52b798]/35 dark:bg-[#52b798]/18 dark:text-[#7ee0c0]'
                          : 'border-[var(--color-one-border)] bg-white/50 dark:bg-white/[0.04] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                      }`}
                    >
                      <Radio className="h-3 w-3" />
                      <span>{L('实况同步', 'Live Sync', 'مزامنة حية')}</span>
                    </button>
                  </div>

                  {/* Time of Day Segmented Control */}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--color-one-text-muted)]">
                      <span>{L('花园光影时段', 'Sanctuary Daylight', 'إضاءة الحديقة')}</span>
                      <span className="tabular-nums opacity-80">
                        {agentSnap.liveWeather && !agentSnap.liveWeather.unavailable
                          ? `${Math.round(agentSnap.liveWeather.temperatureC)}°C`
                          : L('实时渲染', 'Real-time 3D', 'عرض ثلاثي الأبعاد')}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/75 dark:bg-black/20 p-1">
                      {timePresets.map((tp) => {
                        const Icon = tp.icon;
                        const selected = !agentSnap.realtimeSync && activeTimePreset === tp.id;
                        return (
                          <button
                            key={tp.id}
                            type="button"
                            onClick={() => handleSelectTime(tp.id)}
                            className={`flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                              selected
                                ? 'bg-[var(--color-one-surface)] text-[var(--color-one-text)] shadow-sm dark:bg-white/15'
                                : 'text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span>{tp.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Weather Segmented Control */}
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11px] font-medium text-[var(--color-one-text-muted)]">
                      {L('气候氛围', 'Atmosphere', 'الطقس والأجواء')}
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/75 dark:bg-black/20 p-1">
                      {weatherPresets.map((wp) => {
                        const Icon = wp.icon;
                        const selected = !agentSnap.realtimeSync && activeWeatherPreset === wp.id;
                        return (
                          <button
                            key={wp.id}
                            type="button"
                            onClick={() => handleSelectWeather(wp.id)}
                            className={`flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                              selected
                                ? 'bg-[var(--color-one-surface)] text-[var(--color-one-text)] shadow-sm dark:bg-white/15'
                                : 'text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span>{wp.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 pt-3 border-t border-[var(--color-one-border)]">
                  <button
                    type="button"
                    onClick={() => onImmersiveChange?.(true)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-3 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.98] cursor-pointer whitespace-nowrap"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>{L('全屏 3D 漫游', 'Immersive 3D', 'عرض كامل')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('one-open-live-companion'))}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-white/75 dark:bg-white/[0.06] px-3 text-xs font-semibold text-[var(--color-one-text)] transition hover:bg-white dark:hover:bg-white/[0.12] active:scale-[0.98] cursor-pointer whitespace-nowrap"
                  >
                    <Mic className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                    <span>{L('唤醒 ONE AI', 'Talk to ONE', 'تحدث مع ONE')}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Live World & Communications Pulse */}
              <div className={`${glassCardClass} p-5 flex-1 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-[var(--color-one-text)]">
                      {L('世界连线与即时通讯', 'World Pulse & Comms', 'نبض العالم والتواصل')}
                    </h2>
                    <button
                      type="button"
                      onClick={() => onSelectTab('chat')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-one-accent)] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <span>{L('通讯中心', 'Open Comms', 'الرسائل')}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Clean Tabular Stats Strip */}
                  <div className="mt-3 grid grid-cols-3 divide-x divide-[var(--color-one-border)] rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/70 dark:bg-black/20 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => onSelectTab('feed')}
                      className="px-2 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="text-base font-semibold tabular-nums text-[var(--color-one-text)]">
                        {nodes.length}
                      </div>
                      <div className="text-[11px] text-[var(--color-one-text-muted)] truncate">
                        {L('在线节点', 'Citizens', 'متصلون')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTab('feed')}
                      className="px-2 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="text-base font-semibold tabular-nums text-[var(--color-one-text)]">
                        {countries.length}
                      </div>
                      <div className="text-[11px] text-[var(--color-one-text-muted)] truncate">
                        {L('国家地区', 'Regions', 'مناطق')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTab('chat')}
                      className="px-2 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="text-base font-semibold tabular-nums text-[var(--color-one-text)]">
                        {conversations.length}
                      </div>
                      <div className="text-[11px] text-[var(--color-one-text-muted)] truncate">
                        {L('活跃会话', 'Threads', 'محادثات')}
                      </div>
                    </button>
                  </div>

                  {/* Recent Conversations */}
                  <div className="mt-3 space-y-2">
                    {recentConversations.length > 0 ? (
                      recentConversations.map((conv) => (
                        <div
                          key={conv.id}
                          className="flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onOpenConversation ? onOpenConversation(conv.id) : onSelectTab('chat')
                            }
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-start cursor-pointer"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-one-accent-soft)] text-[var(--color-one-accent)] text-xs font-semibold overflow-hidden">
                              {conv.avatar ? (
                                <img
                                  src={conv.avatar}
                                  alt={conv.name}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                conv.name.slice(0, 1).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-[var(--color-one-text)]">
                                {conv.name}
                              </div>
                              <div className="truncate text-[11px] text-[var(--color-one-text-muted)]">
                                {conv.lastMessage || L('点击进入会话', 'Open conversation', 'افتح المحادثة')}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickCall
                                ? onQuickCall('audio', { conversationId: conv.id })
                                : onOpenCallCenter?.()
                            }
                            title={L('发起语音通话', 'Start audio call', 'مكالمة صوتية')}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-one-border)] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-accent)] hover:text-[var(--color-one-accent)] transition-colors cursor-pointer"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--color-one-border-strong)] px-3 py-2.5">
                        <span className="text-xs text-[var(--color-one-text-muted)]">
                          {L('暂无最近会话，开启全球连线', 'No active threads yet', 'لا توجد محادثات بعد')}
                        </span>
                        <button
                          type="button"
                          onClick={() => (onOpenCallCenter ? onOpenCallCenter() : onSelectTab('chat'))}
                          className="text-xs font-medium text-[var(--color-one-accent)] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          {L('立即前往', 'Connect', 'تواصل')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Dashboard Body Below Hero Split */}
        {!immersive && (
          <>
            {/* Section 2: Curated Core Spaces Bento Grid */}
            <section className="mt-7">
              <div className="mb-3.5 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--color-one-text)]">
                    {L('核心数字空间', 'Core Workspaces', 'المساحات الأساسية')}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--color-one-text-muted)]">
                    {L(
                      '从古典文献阅读、语言训练到智能对话与全球影音的一站式入口',
                      'Read world classics, practice languages, orchestrate AI, and stream acoustic spaces',
                      'اقرأ الكتب الكلاسيكية وتدرّب على اللغات وتواصل مع الذكاء الاصطناعي'
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {coreSpaces.map((space) => {
                  const Icon = space.icon;
                  return (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => onSelectTab(space.id)}
                      className={`group ${glassCardClass} ${space.glow} flex flex-col justify-between p-5 text-start transition-all duration-200 hover:-translate-y-0.5 cursor-pointer`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${space.iconBg}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-[var(--color-one-text-dim)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-one-accent)]" />
                        </div>
                        <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-[var(--color-one-text)]">
                          {space.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-one-text-muted)] line-clamp-2">
                          {space.subtitle}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[var(--color-one-border)] flex items-center justify-between text-xs font-medium text-[var(--color-one-accent)]">
                        <span>{space.actionLabel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Compact Secondary Exploration Dock */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                {secondarySpaces.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-2xl border border-[#23362c]/10 dark:border-white/[0.1] bg-white/65 dark:bg-[#18222f]/65 px-3.5 py-2.5 text-xs font-medium text-[var(--color-one-text)] backdrop-blur-xl transition-all hover:border-[var(--color-one-accent)]/40 hover:bg-white dark:hover:bg-[#1f2c3d] hover:-translate-y-0.5 cursor-pointer"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[var(--color-one-accent)]" />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Balanced 2-Column Global Voices & Citizen Beacons */}
            <section className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {/* Left Card: Global Feed & Creator Stories */}
              <div className={`${glassCardClass} p-5 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-one-border)]">
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-[var(--color-one-accent)]" />
                      <h2 className="text-sm font-semibold tracking-tight text-[var(--color-one-text)]">
                        {L('发现广场与创作精选', 'Global Feed & Stories', 'الساحة العالمية والمقالات')}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTab('feed')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-one-accent)] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <span>{L('查看全部', 'View All', 'عرض الكل')}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {featuredPosts.length > 0 ? (
                    <div className="divide-y divide-[var(--color-one-border)]">
                      {featuredPosts.map((post) => {
                        const postAr = containsArabic(post.content);
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => onSelectTab('feed')}
                            className="w-full py-3.5 text-start transition-opacity hover:opacity-85 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 text-xs text-[var(--color-one-text-muted)]">
                              <img
                                src={post.author.avatar}
                                alt={post.author.displayName}
                                referrerPolicy="no-referrer"
                                className="h-5 w-5 rounded-full object-cover shrink-0"
                              />
                              <span className="font-medium text-[var(--color-one-text)] truncate">
                                {post.author.displayName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{post.cityName || post.countryName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="uppercase text-[11px]">{post.category}</span>
                            </div>
                            <p
                              dir={postAr ? 'rtl' : 'auto'}
                              lang={postAr ? 'ar' : undefined}
                              className={`mt-1.5 text-[13px] leading-relaxed text-[var(--color-one-text)]/90 line-clamp-2 ${
                                postAr ? 'font-arabic-ui' : ''
                              }`}
                            >
                              {post.content}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : featuredArticles.length > 0 ? (
                    <div className="divide-y divide-[var(--color-one-border)]">
                      {featuredArticles.map((art) => (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => onSelectTab('creator')}
                          className="w-full py-3.5 text-start transition-opacity hover:opacity-85 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-xs text-[var(--color-one-text-muted)]">
                            <span className="font-medium text-[var(--color-one-text)]">
                              {art.author.displayName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{art.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{art.readTime}</span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--color-one-text)] truncate">
                            {art.title}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--color-one-text-muted)] line-clamp-1">
                            {art.summary}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs text-[var(--color-one-text-muted)]">
                        {L('发现广场暂无最新动态，欢迎分享你的第一条记录。', 'No global posts yet. Share the first story.', 'لا توجد منشورات بعد.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelectTab('feed')}
                        className="mt-3 inline-flex h-9 items-center rounded-xl bg-[var(--color-one-accent)] px-4 text-xs font-medium text-white hover:brightness-110 cursor-pointer"
                      >
                        {L('前往发现广场', 'Go to Global Feed', 'الذهاب إلى الساحة')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Card: Active Global Citizens & Regions */}
              <div className={`${glassCardClass} p-5 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-one-border)]">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-[var(--color-one-accent)]" />
                      <h2 className="text-sm font-semibold tracking-tight text-[var(--color-one-text)]">
                        {L('全球公民与城市节点', 'Active Citizens & Regions', 'المواطنون النشطون والمناطق')}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTab('community')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-one-accent)] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <span>{L('全球社区', 'Communities', 'المجتمعات')}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {activeNodes.length > 0 ? (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeNodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => onSelectUser(node)}
                          className="flex items-center gap-3 rounded-xl bg-black/[0.025] dark:bg-white/[0.04] p-2.5 text-start transition-colors hover:bg-black/[0.055] dark:hover:bg-white/[0.08] cursor-pointer"
                        >
                          <img
                            src={node.avatar}
                            alt={node.displayName}
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 shrink-0 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-[var(--color-one-text)]">
                              {node.displayName}
                            </div>
                            <div className="truncate text-[11px] text-[var(--color-one-text-muted)]">
                              {node.cityName ? `${node.cityName} · ` : ''}
                              {node.countryName}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-[var(--color-one-text-muted)]">
                      {L('正在同步全球公民信标…', 'Syncing global citizen beacons…', 'جارٍ مزامنة مواقع المواطنين...')}
                    </div>
                  )}
                </div>

                {topCountries.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-one-border)] flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--color-one-text-dim)] me-1">
                      {L('按地区探索', 'Filter region', 'استكشف حسب المنطقة')}:
                    </span>
                    {topCountries.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => onSelectCountry(c.code)}
                        className="rounded-lg border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/80 dark:bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)] hover:border-[var(--color-one-accent)]/45 hover:text-[var(--color-one-text)] transition-colors cursor-pointer"
                      >
                        {c.nativeName || c.name} · <span className="tabular-nums">{c.userCount}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
