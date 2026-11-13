import React, { useState } from 'react';
import { Post, User, Language, GlobeCountryStat } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { TrendingTopicsWidget, TrendingTopic } from './TrendingTopicsWidget.tsx';
import { Clock, Compass, DollarSign, Heart, Image, MapPin, MessageCircle, Send, Share2, Sparkles, Tag, TrendingUp, X } from 'lucide-react';

interface GlobalFeedProps {
  posts: Post[];
  countries: GlobeCountryStat[];
  activeCountry: string | null;
  onSelectCountry: (code: string | null) => void;
  currentUser: User | null;
  onLikePost: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onCreatePost: (postData: { content: string; mediaUrl?: string; category: any }) => void;
  onSelectUser: (user: any) => void;
  onFlyToCoordinates?: (lat: number, lng: number) => void;
  lang: Language;
}

export const GlobalFeed: React.FC<GlobalFeedProps> = ({ posts, countries, activeCountry, onSelectCountry, currentUser, onLikePost, onAddComment, onCreatePost, onSelectUser, onFlyToCoordinates, lang }) => {
  const t = translations[lang];
  const isZh = lang === 'zh';
  const [feedType, setFeedType] = useState<'global' | 'trending' | 'latest' | 'following'>('global');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTopic, setActiveTopic] = useState<TrendingTopic | null>(null);
  const [translatedPosts, setTranslatedPosts] = useState<Record<string, { text: string; loading?: boolean }>>({});
  const [tipToast, setTipToast] = useState<string | null>(null);
  const [composerContent, setComposerContent] = useState('');
  const [composerMediaUrl, setComposerMediaUrl] = useState('');
  const [composerCategory, setComposerCategory] = useState<'life' | 'culture' | 'tech' | 'travel' | 'thought'>('life');
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [commentInputPostId, setCommentInputPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  let filteredPosts = [...posts];
  if (activeCountry && activeCountry !== 'ALL') filteredPosts = filteredPosts.filter(p => p.countryCode.toLowerCase() === activeCountry.toLowerCase());
  if (selectedCategory !== 'all') filteredPosts = filteredPosts.filter(p => p.category === selectedCategory);
  if (activeTopic) {
    const rawTag = activeTopic.tag.toLowerCase().replace('#', '');
    filteredPosts = filteredPosts.filter(p => {
      const contentLower = p.content.toLowerCase();
      if (contentLower.includes(rawTag)) return true;
      if (activeTopic.keywords.some(k => contentLower.includes(k.toLowerCase()))) return true;
      if (activeTopic.category === p.category) return true;
      return false;
    });
  }
  if (feedType === 'trending') filteredPosts.sort((a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount));
  else if (feedType === 'latest') filteredPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerContent.trim()) return;
    onCreatePost({ content: composerContent.trim(), mediaUrl: composerMediaUrl.trim() || undefined, category: composerCategory });
    setComposerContent(''); setComposerMediaUrl(''); setShowMediaInput(false);
  };

  const handleTranslatePost = async (postId: string, text: string) => {
    if (translatedPosts[postId]?.text) { setTranslatedPosts(prev => { const copy = { ...prev }; delete copy[postId]; return copy; }); return; }
    setTranslatedPosts(prev => ({ ...prev, [postId]: { text: '', loading: true } }));
    try {
      const res = await fetch('/api/ai/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, targetLang: isZh ? 'Chinese' : 'English' }) });
      const data = await res.json();
      if (data.success && data.translation) setTranslatedPosts(prev => ({ ...prev, [postId]: { text: data.translation, loading: false } }));
      else setTranslatedPosts(prev => ({ ...prev, [postId]: { text: isZh ? '翻译暂不可用，请稍后重试' : 'Translation unavailable, retry later', loading: false } }));
    } catch { setTranslatedPosts(prev => ({ ...prev, [postId]: { text: isZh ? '网络错误，请重试' : 'Network error, please retry', loading: false } })); }
  };

  const handleTip = (authorName: string) => { setTipToast(isZh ? `已向 ${authorName} 发送感谢` : `Appreciation sent to ${authorName}`); setTimeout(() => setTipToast(null), 3000); };
  const handleCommentSubmit = (postId: string) => { if (!commentText.trim()) return; onAddComment(postId, commentText.trim()); setCommentText(''); setCommentInputPostId(null); };
  const categories = [
    { id: 'all', label: t.allCategories }, { id: 'life', label: t.categoryLife }, { id: 'culture', label: t.categoryCulture }, { id: 'tech', label: t.categoryTech }, { id: 'travel', label: t.categoryTravel }, { id: 'thought', label: t.categoryThought }
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {tipToast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] px-4 py-2 text-xs text-white shadow-[var(--shadow-one-md)]">{tipToast}</div>}
      <div className="flex flex-col items-start gap-8 lg:flex-row">
        <div className="w-full min-w-0 flex-1 space-y-6">
          <div className="flex flex-col justify-between gap-4 border-b border-[var(--color-one-border)] pb-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
                <span>{t.feedTab}</span>
                {activeCountry && <span className="rounded-lg border border-[rgba(78,161,255,0.3)] bg-[rgba(78,161,255,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--color-one-accent-soft)]">{countries.find(c => c.code === activeCountry)?.name || activeCountry}</span>}
              </h1>
              <p className="mt-0.5 text-xs text-[var(--color-one-text-muted)]">{t.shareLife}</p>
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.03] p-1">
              {(['global','trending','latest'] as const).map(type => (
                <button key={type} onClick={() => setFeedType(type)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${feedType === type ? 'bg-white/[0.1] text-white' : 'text-[var(--color-one-text-muted)] hover:text-white'}`}>
                  {type === 'global' ? <Compass className="h-3.5 w-3.5" /> : type === 'trending' ? <TrendingUp className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  <span>{type === 'global' ? 'Global' : type === 'trending' ? 'Trending' : 'Latest'}</span>
                </button>
              ))}
            </div>
          </div>

          {activeTopic && (
            <div className="flex items-center justify-between rounded-[22px] border border-[rgba(78,161,255,0.25)] bg-[rgba(78,161,255,0.08)] p-3.5 text-xs shadow-[var(--shadow-one-sm)]">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[rgba(78,161,255,0.3)] bg-[rgba(78,161,255,0.12)] text-[var(--color-one-accent-soft)]"><Tag className="h-3.5 w-3.5" /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold text-white">{activeTopic.tag}</span><span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-[var(--color-one-text-muted)]">{activeTopic.postCount.toLocaleString()} {isZh ? '条' : 'posts'}</span></div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--color-one-text-muted)]">{isZh ? activeTopic.titleZh : activeTopic.title} · {activeTopic.region}</p>
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => setComposerContent(prev => prev.includes(activeTopic.tag) ? prev : `${activeTopic.tag} ${prev}`)} className="rounded-lg border border-[var(--color-one-border)] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-white/[0.06]">{isZh ? '+ 话题标签' : '+ Insert Tag'}</button>
                <button type="button" onClick={() => setActiveTopic(null)} className="rounded-lg p-1.5 text-[var(--color-one-text-muted)] hover:bg-white/[0.06] hover:text-rose-300" title="Clear Topic Filter"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`min-h-10 cursor-pointer whitespace-nowrap rounded-xl border px-3.5 py-1.5 text-xs font-medium transition ${selectedCategory === c.id ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-white' : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white'}`}>{c.label}</button>
            ))}
            {activeCountry && <button onClick={() => onSelectCountry(null)} className="ml-auto min-h-10 px-2 text-xs text-rose-300 underline hover:text-rose-200">Clear Country Filter</button>}
          </div>

          <div className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)] backdrop-blur-sm sm:p-5">
            <form onSubmit={handlePostSubmit} className="space-y-3">
              <div className="flex items-start gap-3">
                {currentUser && <img src={currentUser.avatar} alt={currentUser.displayName} className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-[var(--color-one-border-strong)] object-cover" />}
                <div className="flex-1">
                  <textarea value={composerContent} onChange={e => setComposerContent(e.target.value)} placeholder={activeTopic ? `${t.whatsOnYourMind} (${activeTopic.tag})...` : t.whatsOnYourMind} rows={3} className="w-full resize-none border-0 bg-transparent text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:outline-none" />
                  {showMediaInput && (
                    <div className="mt-2 flex items-center gap-2">
                      <Image className="h-4 w-4 text-[var(--color-one-text-dim)]" />
                      <input type="url" value={composerMediaUrl} onChange={e => setComposerMediaUrl(e.target.value)} placeholder={isZh ? '粘贴图片/媒体 URL...' : 'Paste image/media URL...'} className="flex-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-one-border)] pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setShowMediaInput(!showMediaInput)} className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition ${showMediaInput ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-[var(--color-one-accent-soft)]' : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:text-white'}`} title="Add Media URL"><Image className="h-4 w-4" /></button>
                  <select value={composerCategory} onChange={e => setComposerCategory(e.target.value as any)} className="min-h-9 rounded-lg border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-2.5 py-1.5 text-xs text-white focus:outline-none">
                    <option value="life">{t.categoryLife}</option><option value="culture">{t.categoryCulture}</option><option value="tech">{t.categoryTech}</option><option value="travel">{t.categoryTravel}</option><option value="thought">{t.categoryThought}</option>
                  </select>
                  {currentUser && <div className="flex items-center gap-1 text-xs text-[var(--color-one-text-muted)]"><MapPin className="h-3.5 w-3.5 text-[var(--color-one-accent)]" /><span>{currentUser.location.cityName}, {currentUser.location.countryCode}</span></div>}
                </div>
                <button type="submit" disabled={!composerContent.trim()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-[#071018] transition hover:brightness-110 disabled:opacity-40"><Send className="h-3.5 w-3.5" /><span>{t.publishPost}</span></button>
              </div>
            </form>
          </div>

          <div className="space-y-5">
            {filteredPosts.length === 0 ? (
              <div className="space-y-3 rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] p-8 text-center text-[var(--color-one-text-muted)]">
                <Compass className="mx-auto mb-1 h-10 w-10 text-[var(--color-one-text-dim)]" />
                <p className="text-sm font-medium text-white">{activeTopic ? (isZh ? `暂无包含话题 ${activeTopic.tag} 的动态` : `No posts match topic ${activeTopic.tag}`) : (isZh ? '当前筛选下暂无动态。' : 'No posts match this filter.')}</p>
                <p className="text-xs">{activeTopic ? (isZh ? '成为首个参与该话题的用户。' : 'Be the first to post on this topic.') : (isZh ? '发布第一条内容，分享你的故事。' : 'Be the first to share a story here.')}</p>
                {activeTopic && <button type="button" onClick={() => { setComposerContent(`${activeTopic.tag} `); window.scrollTo({ top: 120, behavior: 'smooth' }); }} className="mt-1 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-[#071018] hover:brightness-110"><Sparkles className="h-3.5 w-3.5" /><span>{isZh ? `发布到 ${activeTopic.tag}` : `Post to ${activeTopic.tag}`}</span></button>}
              </div>
            ) : (
              filteredPosts.map(post => (
                <article key={post.id} className="space-y-3.5 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)]">
                  <div className="flex items-center justify-between gap-3">
                    <div onClick={() => onSelectUser(post.author)} className="group flex min-w-0 cursor-pointer items-center gap-3">
                      <img src={post.author.avatar} alt={post.author.displayName} className="h-10 w-10 rounded-full border border-[var(--color-one-border)] object-cover transition group-hover:border-[rgba(78,161,255,0.4)]" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-white transition group-hover:text-[var(--color-one-accent-soft)]">{post.author.displayName}</span>
                          {post.author.verified && <Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />}
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-one-text-muted)]">{post.countryCode}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-one-text-muted)]">
                          <button type="button" onClick={(e) => { e.stopPropagation(); if (onFlyToCoordinates) { const cMatch = countries.find(c => c.code.toLowerCase() === post.countryCode.toLowerCase()); onFlyToCoordinates(cMatch ? cMatch.lat : 31.23, cMatch ? cMatch.lng : 121.47); } }} className="group/geo inline-flex items-center gap-1 text-left transition hover:text-[var(--color-one-accent-soft)]" title={isZh ? '在地球上定位' : 'Locate on globe'}>
                            <MapPin className="h-3 w-3 text-[var(--color-one-accent)] transition-transform group-hover/geo:scale-110" /><span className="group-hover/geo:underline">{post.cityName}, {post.countryName}</span>
                          </button>
                          <span>·</span><span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--color-one-border)] bg-white/[0.02] px-2 py-0.5 font-mono text-[11px] text-[var(--color-one-text-muted)]">#{post.category}</span>
                  </div>

                  <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-one-text)]">{post.content}</p>

                  {translatedPosts[post.id]?.loading && <div className="flex items-center gap-2 rounded-xl border border-[rgba(78,161,255,0.25)] bg-[rgba(78,161,255,0.08)] p-3 text-xs text-[var(--color-one-accent-soft)]"><Sparkles className="h-3.5 w-3.5 animate-spin" /><span>{isZh ? '正在翻译…' : 'Translating…'}</span></div>}
                  {translatedPosts[post.id]?.text && !translatedPosts[post.id]?.loading && (
                    <div className="space-y-1 rounded-xl border border-[rgba(78,161,255,0.25)] bg-[rgba(78,161,255,0.08)] p-3.5 text-xs text-[var(--color-one-text)]">
                      <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-one-accent-soft)]">
                        <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />{isZh ? 'AI 翻译' : 'AI Translation'}</span>
                        <button type="button" onClick={() => handleTranslatePost(post.id, post.content)} className="text-[var(--color-one-text-muted)] hover:text-white">{isZh ? '收起' : 'Hide'}</button>
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{translatedPosts[post.id].text}</p>
                    </div>
                  )}

                  {post.mediaUrl && <div className="max-h-96 overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.6)]"><img src={post.mediaUrl} alt="Post media" className="max-h-96 h-full w-full object-cover" loading="lazy" /></div>}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-one-border)] pt-2 text-xs text-[var(--color-one-text-muted)]">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <button onClick={() => onLikePost(post.id)} className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 transition ${post.liked ? 'font-medium text-rose-300' : 'hover:text-rose-200'}`}><Heart className={`h-4 w-4 ${post.liked ? 'fill-current' : ''}`} /><span>{post.likesCount}</span></button>
                      <button onClick={() => setCommentInputPostId(commentInputPostId === post.id ? null : post.id)} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 transition hover:text-white"><MessageCircle className="h-4 w-4" /><span>{post.commentsCount}</span></button>
                      <button className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 transition hover:text-white"><Share2 className="h-4 w-4" /><span>{post.sharesCount}</span></button>
                      <button type="button" onClick={() => handleTranslatePost(post.id, post.content)} className={`inline-flex min-h-9 cursor-pointer items-center gap-1 transition ${translatedPosts[post.id]?.text ? 'text-[var(--color-one-accent-soft)]' : 'hover:text-[var(--color-one-accent-soft)]'}`} title={isZh ? 'AI 翻译' : 'AI translate'}><Sparkles className="h-3.5 w-3.5" /><span>{translatedPosts[post.id]?.text ? (isZh ? '原文' : 'Original') : (isZh ? 'AI 翻译' : 'Translate')}</span></button>
                    </div>
                    <button type="button" onClick={() => handleTip(post.author.displayName)} className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 font-medium text-emerald-200 transition hover:bg-emerald-500/15"><DollarSign className="h-3.5 w-3.5" /><span>{t.tip}</span></button>
                  </div>

                  {post.comments && post.comments.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--color-one-border)] pt-2">
                      {post.comments.map(c => (
                        <div key={c.id} className="space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.45)] p-2.5 text-xs">
                          <div className="flex items-center justify-between"><span className="font-semibold text-white">{c.author.displayName}</span><span className="font-mono text-[10px] text-[var(--color-one-text-dim)]">{c.author.countryCode}</span></div>
                          <p className="text-[var(--color-one-text-muted)]">{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {commentInputPostId === post.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder={isZh ? '写下评论...' : 'Write a comment...'} className="flex-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleCommentSubmit(post.id)} />
                      <button onClick={() => handleCommentSubmit(post.id)} className="inline-flex min-h-10 cursor-pointer items-center rounded-xl bg-[var(--color-one-accent)] px-3 py-2 text-xs font-semibold text-[#071018] hover:brightness-110">{isZh ? '回复' : 'Reply'}</button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-6 lg:sticky lg:top-20 lg:w-84 xl:w-96">
          <TrendingTopicsWidget
            onSelectTopic={topic => setActiveTopic(prev => (prev?.id === topic.id ? null : topic))}
            selectedTopicTag={activeTopic?.tag || null}
            onClearTopicFilter={() => setActiveTopic(null)}
            lang={lang}
          />
        </aside>
      </div>
    </div>
  );
};
