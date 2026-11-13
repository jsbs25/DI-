import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Film,
  GraduationCap,
  MessageSquare,
  Music2,
  PenTool,
  Search,
  Sparkles,
  Users2,
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
};

const spaces = [
  { tab: 'venus', zh: 'ONE MUSIC', en: 'ONE MUSIC', descZh: '播放、发现与沉浸聆听', descEn: 'Play, discover, and listen', Icon: Music2 },
  { tab: 'aihub', zh: 'ONE INTELLIGENCE', en: 'ONE INTELLIGENCE', descZh: '对话、思考与创作辅助', descEn: 'Conversation and intelligent work', Icon: Sparkles },
  { tab: 'library', zh: 'ONE LIBRARY', en: 'ONE LIBRARY', descZh: '阅读、检索与知识沉淀', descEn: 'Read, search, and learn', Icon: BookOpen },
  { tab: 'browser', zh: 'ONE BROWSER', en: 'ONE BROWSER', descZh: '探索开放网络与信息', descEn: 'Explore the open web', Icon: Search },
  { tab: 'video', zh: 'ONE VIDEO', en: 'ONE VIDEO', descZh: '观看与媒体体验', descEn: 'Watch and explore media', Icon: Film },
  { tab: 'community', zh: 'ONE COMMUNITY', en: 'ONE COMMUNITY', descZh: '连接人与公共空间', descEn: 'People and shared spaces', Icon: Users2 },
  { tab: 'creator', zh: 'ONE STUDIO', en: 'ONE STUDIO', descZh: '创作与表达', descEn: 'Create and publish', Icon: PenTool },
  { tab: 'arabic-learning', zh: 'ONE LEARNING', en: 'ONE LEARNING', descZh: '学习与成长路径', descEn: 'Learning and growth', Icon: GraduationCap },
  { tab: 'feed', zh: 'ONE DISCOVER', en: 'ONE DISCOVER', descZh: '动态、内容与发现', descEn: 'Activity and discovery', Icon: Compass },
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
  videos,
  articles,
  conversations,
  focusCoordinates,
  onSelectCountry,
  onSelectUser,
  onSelectTab,
}) => {
  const isZh = lang === 'zh';
  const recentPosts = useMemo(() => posts.slice(0, 4), [posts]);
  const recentConversations = useMemo(
    () => [...conversations].sort((a, b) => String(b.lastMessageAt || b.lastMessageTime || '').localeCompare(String(a.lastMessageAt || a.lastMessageTime || ''))).slice(0, 4),
    [conversations]
  );
  const recentVideos = useMemo(() => videos.slice(0, 3), [videos]);
  const recentArticles = useMemo(() => articles.slice(0, 3), [articles]);

  return (
    <div className="min-h-[100dvh] bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <section className="relative min-h-[100svh] overflow-hidden border-b border-[var(--color-one-border)]">
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
            immersive={false}
            showGlobeTools={false}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#05070B] via-[#05070B]/72 to-[#05070B]/25" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070B] via-transparent to-[#05070B]/35" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1440px] flex-col justify-between px-5 pb-10 pt-24 sm:px-8 md:pl-[7.5rem] md:pr-10 lg:px-16 lg:pl-[8.5rem]">
          <div className="max-w-3xl pt-8 sm:pt-12 lg:pt-20">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--color-one-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-one-accent)]" />
              {isZh ? '统一数字世界入口' : 'Unified digital world'}
            </div>
            <h1 className="text-[clamp(3.2rem,10vw,7.5rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-white">
              ONE<span className="text-[var(--color-one-accent)]">.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[clamp(1.2rem,2.4vw,2rem)] font-light leading-tight tracking-[-0.02em] text-[var(--color-one-text)]">
              One world. Infinite possibilities.
            </p>
            <p className="mt-3 max-w-xl text-base text-[var(--color-one-text-muted)] sm:text-lg">
              一个世界，无限可能。
            </p>
            <p className="mt-8 max-w-2xl text-sm leading-7 text-[var(--color-one-text-muted)] sm:text-[15px]">
              {isZh
                ? '在同一个入口中探索音乐、智能、图书馆、浏览、创作与连接。ONE 将真实功能组织为连续的空间体验，而不是割裂的模块堆叠。'
                : 'Explore music, intelligence, library, browsing, creation, and connection from one entrance. ONE organizes real capabilities into a continuous spatial experience.'}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button onClick={() => onSelectTab('venus')} className="one-btn one-btn-primary one-btn-md">
                <Music2 className="h-4 w-4" />
                <span>{isZh ? '进入 ONE MUSIC' : 'Open ONE MUSIC'}</span>
              </button>
              <button onClick={() => onSelectTab('universe')} className="one-btn one-btn-secondary one-btn-md">
                <Compass className="h-4 w-4" />
                <span>{isZh ? '浏览 Spaces' : 'Browse Spaces'}</span>
              </button>
              <button onClick={() => onSelectTab('feed')} className="one-btn one-btn-ghost one-btn-md">
                <span>{isZh ? '查看发现' : 'View Discover'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="one-surface-subtle p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">{isZh ? '空间' : 'Spaces'}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{spaces.length}</div>
            </div>
            <div className="one-surface-subtle p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">{isZh ? '全球节点' : 'Live nodes'}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{nodes.length}</div>
            </div>
            <div className="one-surface-subtle p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">{isZh ? '动态' : 'Posts'}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{posts.length}</div>
            </div>
            <div className="one-surface-subtle p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">{isZh ? '会话' : 'Chats'}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{conversations.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 md:pl-[7.5rem] md:pr-10 lg:px-16 lg:pl-[8.5rem]">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-one-text-dim)]">ONE Spaces</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{isZh ? '功能空间' : 'Spaces'}</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-one-text-muted)]">{isZh ? '按真实能力组织的统一入口。' : 'Unified entry points mapped to real capabilities.'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map(({ tab, zh, en, descZh, descEn, Icon }) => (
            <button
              key={tab + zh}
              onClick={() => onSelectTab(tab)}
              className="group one-surface-subtle flex items-start gap-4 p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[var(--color-one-accent)]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-[0.04em] text-white">{isZh ? zh : en}</span>
                <span className="mt-1 block text-sm text-[var(--color-one-text-muted)]">{isZh ? descZh : descEn}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 text-[var(--color-one-text-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-24 sm:px-8 md:pl-[7.5rem] md:pr-10 lg:grid-cols-3 lg:px-16 lg:pl-[8.5rem]">
        <div className="one-surface-subtle p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">{isZh ? '最近动态' : 'Recent activity'}</h3>
            <button onClick={() => onSelectTab('feed')} className="text-sm text-[var(--color-one-text-muted)] hover:text-white">{isZh ? '打开发现' : 'Open Discover'}</button>
          </div>
          {recentPosts.length === 0 ? (
            <p className="text-sm text-[var(--color-one-text-muted)]">{isZh ? '暂无可显示的动态。' : 'No posts to show yet.'}</p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((p) => (
                <button key={p.id} onClick={() => onSelectTab('feed')} className="block w-full rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-left hover:bg-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <img src={p.author?.avatar || ''} alt="" className="h-8 w-8 rounded-full object-cover bg-white/5" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{p.author?.displayName || p.author?.username}</div>
                      <div className="text-xs text-[var(--color-one-text-dim)]">{[p.author?.cityName, p.author?.countryName].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-one-text-muted)]">{p.content}</p>
                </button>
              ))}
            </div>
          )}

          {(recentVideos.length > 0 || recentArticles.length > 0) && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {recentVideos.slice(0, 2).map((v) => (
                <button key={v.id} onClick={() => onSelectTab('video')} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-left hover:bg-white/[0.04]">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">ONE VIDEO</div>
                  <div className="mt-2 line-clamp-2 text-sm font-medium text-white">{v.title}</div>
                  <div className="mt-1 text-xs text-[var(--color-one-text-muted)]">{v.creator?.displayName}</div>
                </button>
              ))}
              {recentArticles.slice(0, 2).map((a) => (
                <button key={a.id} onClick={() => onSelectTab('creator')} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-left hover:bg-white/[0.04]">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">ONE STUDIO</div>
                  <div className="mt-2 line-clamp-2 text-sm font-medium text-white">{a.title}</div>
                  <div className="mt-1 text-xs text-[var(--color-one-text-muted)]">{a.author?.displayName}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="one-surface-subtle p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{isZh ? '最近会话' : 'Recent messages'}</h3>
              <button onClick={() => onSelectTab('chat')} className="text-sm text-[var(--color-one-text-muted)] hover:text-white"><MessageSquare className="h-4 w-4" /></button>
            </div>
            {recentConversations.length === 0 ? (
              <p className="text-sm text-[var(--color-one-text-muted)]">{isZh ? '暂无会话。' : 'No conversations yet.'}</p>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((c) => (
                  <button key={c.id} onClick={() => onSelectTab('chat')} className="block w-full rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left hover:bg-white/[0.04]">
                    <div className="truncate text-sm font-medium text-white">{c.name || (isZh ? '会话' : 'Conversation')}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-[var(--color-one-text-muted)]">{c.lastMessage || '—'}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-one-text-dim)]">{formatWhen(c.lastMessageAt || c.lastMessageTime)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="one-surface-subtle p-6">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">{isZh ? '快捷入口' : 'Quick access'}</div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button onClick={() => onSelectTab('aihub')} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2.5 text-left text-sm text-[var(--color-one-text-muted)] hover:bg-white/[0.04] hover:text-white"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--color-one-accent)]" />ONE INTELLIGENCE</span><ArrowRight className="h-4 w-4" /></button>
              <button onClick={() => onSelectTab('library')} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2.5 text-left text-sm text-[var(--color-one-text-muted)] hover:bg-white/[0.04] hover:text-white"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-[var(--color-one-accent)]" />ONE LIBRARY</span><ArrowRight className="h-4 w-4" /></button>
              <button onClick={() => onSelectTab('browser')} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2.5 text-left text-sm text-[var(--color-one-text-muted)] hover:bg-white/[0.04] hover:text-white"><span className="flex items-center gap-2"><Search className="h-4 w-4 text-[var(--color-one-accent)]" />ONE BROWSER</span><ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="one-surface-subtle p-6">
            <div className="text-sm font-medium text-white">{isZh ? '当前身份' : 'Identity'}</div>
            <div className="mt-2 text-sm text-[var(--color-one-text-muted)]">
              {currentUser ? (
                <span>{currentUser.displayName} <span className="text-[var(--color-one-text-dim)]">@{currentUser.username}</span></span>
              ) : (
                <span>{isZh ? '未登录' : 'Not signed in'}</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
