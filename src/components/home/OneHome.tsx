import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Film,
  Globe2,
  GraduationCap,
  MessageSquare,
  Music2,
  PenTool,
  Search,
  Sparkles,
  Users2,
} from 'lucide-react';
import type { Conversation, GlobeCountryStat, GlobeUserNode, Language, Post, User, VideoItem, CreatorArticle } from '../../types/index.ts';

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
  { tab: 'venus', zh: 'ONE MUSIC', en: 'ONE MUSIC', descZh: '播放、搜索与连续收听', descEn: 'Play, search, and listen continuously', Icon: Music2 },
  { tab: 'aihub', zh: 'ONE INTELLIGENCE', en: 'ONE INTELLIGENCE', descZh: '对话与智能创作', descEn: 'Conversation and intelligent creation', Icon: Sparkles },
  { tab: 'library', zh: 'ONE LIBRARY', en: 'ONE LIBRARY', descZh: '阅读与知识检索', descEn: 'Reading and knowledge search', Icon: BookOpen },
  { tab: 'browser', zh: 'ONE BROWSER', en: 'ONE BROWSER', descZh: '探索开放网络', descEn: 'Explore the open web', Icon: Search },
  { tab: 'video', zh: 'ONE VIDEO', en: 'ONE VIDEO', descZh: '观看与媒体内容', descEn: 'Watch and explore media', Icon: Film },
  { tab: 'community', zh: 'ONE COMMUNITY', en: 'ONE COMMUNITY', descZh: '连接人与社区', descEn: 'People and communities', Icon: Users2 },
  { tab: 'creator', zh: 'ONE STUDIO', en: 'ONE STUDIO', descZh: '创作与发布', descEn: 'Create and publish', Icon: PenTool },
  { tab: 'arabic-learning', zh: 'ONE LEARNING', en: 'ONE LEARNING', descZh: '学习与成长', descEn: 'Learning and growth', Icon: GraduationCap },
  { tab: 'feed', zh: 'ONE DISCOVER', en: 'ONE DISCOVER', descZh: '动态与发现', descEn: 'Activity and discovery', Icon: Compass },
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
  onSelectTab,
}) => {
  const isZh = lang === 'zh';
  const recentPosts = useMemo(() => posts.slice(0, 3), [posts]);
  const recentConversations = useMemo(
    () => [...conversations].sort((a, b) => String(b.lastMessageAt || b.lastMessageTime || '').localeCompare(String(a.lastMessageAt || a.lastMessageTime || ''))).slice(0, 3),
    [conversations]
  );
  const recentVideos = useMemo(() => videos.slice(0, 2), [videos]);
  const recentArticles = useMemo(() => articles.slice(0, 2), [articles]);

  return (
    <div className="min-h-[100dvh] bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <section className="relative overflow-hidden border-b border-[var(--color-one-border)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-[-10%] h-[420px] w-[420px] rounded-full bg-[rgba(142,220,255,0.14)] blur-[120px]" />
          <div className="absolute right-[-10%] top-[10%] h-[360px] w-[360px] rounded-full bg-[rgba(224,196,138,0.10)] blur-[120px]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--color-one-bg)] to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1280px] px-5 pb-14 pt-28 sm:px-8 md:pl-[7.5rem] md:pr-10 lg:px-12 lg:pl-[8rem] lg:pt-32">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-[0.14em] text-[var(--color-one-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-one-accent)]" />
              {isZh ? '统一数字世界入口' : 'A unified digital world'}
            </div>
            <h1 className="text-[clamp(2.8rem,8vw,5.6rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-white">
              ONE
            </h1>
            <p className="mt-4 max-w-2xl text-[clamp(1.15rem,2.2vw,1.75rem)] font-medium leading-tight tracking-[-0.02em] text-[var(--color-one-text)]">
              One world. Infinite possibilities.
            </p>
            <p className="mt-2 text-base text-[var(--color-one-text-muted)] sm:text-lg">一个世界，无限可能。</p>
            <p className="mt-6 max-w-2xl text-[15px] leading-7 text-[var(--color-one-text-muted)]">
              {isZh
                ? '从一个清晰入口进入音乐、智能、图书馆、浏览、创作与连接。所有空间基于真实功能组织，界面更简洁、更易读、更顺畅。'
                : 'Enter music, intelligence, library, browsing, creation, and connection from one clear home. Every space maps to real capabilities with a calmer, more readable flow.'}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => onSelectTab('venus')} className="one-btn one-btn-primary one-btn-md">
                <Music2 className="h-4 w-4" />
                <span>{isZh ? '打开 ONE MUSIC' : 'Open ONE MUSIC'}</span>
              </button>
              <button onClick={() => onSelectTab('aihub')} className="one-btn one-btn-secondary one-btn-md">
                <Sparkles className="h-4 w-4" />
                <span>{isZh ? '打开智能空间' : 'Open Intelligence'}</span>
              </button>
              <button onClick={() => onSelectTab('universe')} className="one-btn one-btn-ghost one-btn-md">
                <span>{isZh ? '浏览全部空间' : 'Browse all spaces'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: isZh ? '空间' : 'Spaces', value: spaces.length, icon: Compass },
              { label: isZh ? '在线节点' : 'Live nodes', value: nodes.length, icon: Globe2 },
              { label: isZh ? '动态' : 'Posts', value: posts.length, icon: MessageSquare },
              { label: isZh ? '会话' : 'Chats', value: conversations.length, icon: Users2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="one-surface-subtle flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--color-one-accent)]"><Icon className="h-4 w-4" /></span>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-one-text-dim)]">{label}</div>
                  <div className="mt-0.5 text-xl font-semibold text-white">{value}</div>
                </div>
              </div>
            ))}
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
