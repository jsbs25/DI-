import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Globe2,
  MessageSquare,
  Music2,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Conversation, GlobeCountryStat, GlobeUserNode, Language, Post, User, VideoItem, CreatorArticle } from '../../types/index.ts';
import { DigitalGlobe } from '../globe/DigitalGlobe.tsx';

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
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
};

const CORE_SPACES = [
  { tab: 'aihub', zh: '智能对话', en: 'Intelligence', descZh: '多模型对话、翻译与辅助思考', descEn: 'Multi-model reasoning & translation', Icon: Sparkles },
  { tab: 'venus', zh: '音乐空间', en: 'Music', descZh: '精选曲库与全网音乐在线播放', descEn: 'Curated audio & streaming discovery', Icon: Music2 },
  { tab: 'library', zh: '世界图书馆', en: 'Library', descZh: '开放古籍、文献检索与深度阅读', descEn: 'Open books, research & reading', Icon: BookOpen },
  { tab: 'browser', zh: '开放浏览器', en: 'Browser', descZh: '聚合全网搜索与知识索引', descEn: 'Search and explore the open web', Icon: Search },
  { tab: 'feed', zh: '全球发现', en: 'Discover', descZh: '世界各地节点动态与见解', descEn: 'Signals and updates worldwide', Icon: Compass },
  { tab: 'chat', zh: '即时消息', en: 'Messages', descZh: '跨语言实时会话与频道连接', descEn: 'Real-time multilingual messaging', Icon: MessageSquare },
] as const;

function formatWhen(value?: string) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const OneHome: React.FC<Props> = ({
  lang,
  currentUser,
  nodes,
  countries,
  posts,
  conversations,
  focusCoordinates,
  onSelectCountry,
  onSelectUser,
  onSelectTab,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const recentPosts = useMemo(() => posts.slice(0, 3), [posts]);
  const recentConversations = useMemo(
    () => [...conversations].sort((a, b) => String(b.lastMessageAt || b.lastMessageTime || '').localeCompare(String(a.lastMessageAt || a.lastMessageTime || ''))).slice(0, 3),
    [conversations]
  );

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      {/* Hero Section: Luminous interactive 3D Earth with bright atmospheric horizon */}
      <section className="relative min-h-[86svh] sm:min-h-[92svh] overflow-hidden border-b border-[var(--color-one-border)]">
        <div className="absolute inset-0">
          <DigitalGlobe
            nodes={nodes}
            countries={countries}
            activeCountry={null}
            currentUserId={currentUser?.id}
            focusCoordinates={focusCoordinates}
            onSelectCountry={onSelectCountry}
            onSelectUser={onSelectUser}
            onSelectTab={onSelectTab}
            lang={lang}
            immersive={immersive}
            onImmersiveChange={onImmersiveChange}
            hideHeroOverlay={true}
          />
          {!immersive && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b1b36]/72 via-[#0e2347]/28 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--color-one-bg)] via-[color-mix(in_srgb,var(--color-one-bg)_45%,transparent)] to-transparent" />
            </>
          )}
        </div>

        <div
          className={`pointer-events-none relative z-10 mx-auto flex min-h-[86svh] sm:min-h-[92svh] max-w-[1360px] flex-col justify-between px-4 pb-10 pt-20 sm:px-8 sm:pb-12 sm:pt-24 md:pl-[7.5rem] md:pr-12 lg:pl-[8.5rem] transition-opacity duration-300 ${
            immersive ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="pointer-events-auto max-w-xl pt-10 sm:pt-16 lg:pt-20">
            <p className="text-xs font-semibold tracking-[0.2em] text-sky-200 uppercase">
              {isZh ? 'ONE · 全球数字空间' : 'ONE · Global Spatial Workspace'}
            </p>

            <h1
              className="mt-4 text-[clamp(2.5rem,5.8vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-white drop-shadow-[0_2px_18px_rgba(7,18,40,0.38)]"
              style={{ textWrap: 'balance' }}
            >
              {isZh ? '一个世界，无限可能。' : 'One world. Infinite possibilities.'}
            </h1>

            <p className="mt-5 max-w-md text-sm leading-7 text-slate-100/90 sm:text-[15px]">
              {isZh
                ? '连接三维宇宙、音乐、智能对话、世界图书馆与全球即时通讯的统一入口。'
                : 'A unified entrance connecting a 3D universe, music, intelligence, open library, and global messaging.'}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onSelectTab('universe')}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-sky-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{isZh ? '进入宇宙空间' : 'Explore Universe'}</span>
                <ArrowRight className="h-4 w-4 text-sky-600" />
              </button>
              {onImmersiveChange && (
                <button
                  onClick={() => onImmersiveChange(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-white/30 bg-white/15 px-5 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/25 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Globe2 className="h-4 w-4 text-sky-200" />
                  <span>{isZh ? '沉浸观察地球' : 'Inspect Earth'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="pointer-events-auto mt-12 flex flex-wrap items-center justify-between gap-4 pt-5 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-full bg-white/85 dark:bg-[#162238]/85 px-4 py-2 backdrop-blur-md shadow-sm border border-slate-200/70 dark:border-white/15">
              <button onClick={() => onSelectTab('aihub')} className="font-medium hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap">{isZh ? '智能对话' : 'Intelligence'}</button>
              <button onClick={() => onSelectTab('venus')} className="font-medium hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap">{isZh ? '音乐空间' : 'Music'}</button>
              <button onClick={() => onSelectTab('library')} className="font-medium hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap">{isZh ? '世界图书馆' : 'Library'}</button>
              <button onClick={() => onSelectTab('browser')} className="font-medium hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap">{isZh ? '开放浏览器' : 'Browser'}</button>
            </div>
            {(nodes.length > 0 || countries.length > 0) && (
              <div className="rounded-full bg-white/85 dark:bg-[#162238]/85 px-3.5 py-1.5 font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300 backdrop-blur-md border border-slate-200/70 dark:border-white/15">
                {nodes.length > 0 ? `${nodes.length} ${isZh ? '在线节点' : 'nodes'}` : ''}
                {nodes.length > 0 && countries.length > 0 ? ' · ' : ''}
                {countries.length > 0 ? `${countries.length} ${isZh ? '国家/地区' : 'regions'}` : ''}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 1: Core Spaces on crisp bright canvas */}
      <section className="mx-auto w-full max-w-[1360px] px-4 py-12 sm:px-8 sm:py-16 md:pl-[7.5rem] md:pr-12 lg:pl-[8.5rem]">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {isZh ? '核心空间' : 'Core Spaces'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {isZh ? '选择常用工作区直接进入，其余模块可通过左侧导航「更多」或 ⌘K 打开。' : 'Jump straight into primary workspaces, or press ⌘K for everything else.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_SPACES.map(({ tab, zh, en, descZh, descEn, Icon }) => (
            <button
              key={tab}
              onClick={() => onSelectTab(tab)}
              className="group flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white dark:bg-[#162238] p-5 text-left shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-sky-300 dark:hover:border-sky-400/50 hover:shadow-[0_8px_24px_rgba(2,132,199,0.09)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{isZh ? zh : en}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">{isZh ? descZh : descEn}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-300" />
            </button>
          ))}
        </div>
      </section>

      {/* Section 2: Recent Activity & Recent Messages */}
      <section className="mx-auto w-full max-w-[1360px] border-t border-slate-200 dark:border-white/10 px-4 py-12 pb-28 sm:px-8 sm:py-14 md:pb-16 md:pl-[7.5rem] md:pr-12 lg:pl-[8.5rem]">
        <div className="grid gap-6 lg:gap-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7 rounded-2xl border border-slate-200/90 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{isZh ? '最新动态' : 'Recent Activity'}</h3>
              <button onClick={() => onSelectTab('feed')} className="text-xs font-medium text-sky-600 dark:text-sky-300 hover:underline">
                {isZh ? '查看全部' : 'View all'}
              </button>
            </div>
            {recentPosts.length === 0 ? (
              <p className="py-6 text-sm text-slate-500 dark:text-slate-400">{isZh ? '暂无动态。' : 'No recent activity yet.'}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {recentPosts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectTab('feed')}
                    className="block w-full py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] px-2 -mx-2 rounded-xl"
                  >
                    <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {p.author?.avatar ? (
                        <img src={p.author.avatar} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full object-cover bg-slate-100 dark:bg-white/10" />
                      ) : null}
                      <span className="font-medium text-slate-900 dark:text-slate-100">{p.author?.displayName || p.author?.username}</span>
                      {(p.author?.cityName || p.author?.countryName) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{[p.author?.cityName, p.author?.countryName].filter(Boolean).join(', ')}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.content}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 lg:col-span-5 rounded-2xl border border-slate-200/90 dark:border-white/12 bg-white dark:bg-[#162238] p-5 sm:p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{isZh ? '最近会话' : 'Recent Messages'}</h3>
              <button onClick={() => onSelectTab('chat')} className="text-xs font-medium text-sky-600 dark:text-sky-300 hover:underline">
                {isZh ? '打开消息' : 'Open chat'}
              </button>
            </div>
            {recentConversations.length === 0 ? (
              <p className="py-6 text-sm text-slate-500 dark:text-slate-400">{isZh ? '暂无会话。' : 'No conversations yet.'}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {recentConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelectTab('chat')}
                    className="block w-full py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] px-2 -mx-2 rounded-xl"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.name || (isZh ? '会话' : 'Conversation')}</span>
                      <span className="shrink-0 text-[11px] font-mono tabular-nums text-slate-400">
                        {formatWhen(c.lastMessageAt || c.lastMessageTime)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">{c.lastMessage || '—'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
