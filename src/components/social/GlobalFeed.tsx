import React, { useState } from 'react';
import { Post, User, Language, GlobeCountryStat } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { TrendingTopicsWidget, TrendingTopic } from './TrendingTopicsWidget.tsx';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Send,
  Sparkles,
  MapPin,
  Image,
  TrendingUp,
  Clock,
  Users,
  Compass,
  DollarSign,
  ChevronRight,
  Filter,
  Tag,
  X
} from 'lucide-react';

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
  lang: Language;
}

export const GlobalFeed: React.FC<GlobalFeedProps> = ({
  posts,
  countries,
  activeCountry,
  onSelectCountry,
  currentUser,
  onLikePost,
  onAddComment,
  onCreatePost,
  onSelectUser,
  lang
}) => {
  const t = translations[lang];
  const isZh = lang === 'zh';

  // Feed tabs: global, trending, latest, following
  const [feedType, setFeedType] = useState<'global' | 'trending' | 'latest' | 'following'>('global');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTopic, setActiveTopic] = useState<TrendingTopic | null>(null);

  // Post composer state
  const [composerContent, setComposerContent] = useState('');
  const [composerMediaUrl, setComposerMediaUrl] = useState('');
  const [composerCategory, setComposerCategory] = useState<'life' | 'culture' | 'tech' | 'travel' | 'thought'>('life');
  const [showMediaInput, setShowMediaInput] = useState(false);

  // Active comment box
  const [commentInputPostId, setCommentInputPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  // Filtering
  let filteredPosts = [...posts];

  // Country filter
  if (activeCountry && activeCountry !== 'ALL') {
    filteredPosts = filteredPosts.filter(p => p.countryCode.toLowerCase() === activeCountry.toLowerCase());
  }

  // Category filter
  if (selectedCategory !== 'all') {
    filteredPosts = filteredPosts.filter(p => p.category === selectedCategory);
  }

  // Trending topic filter
  if (activeTopic) {
    const rawTag = activeTopic.tag.toLowerCase().replace('#', '');
    filteredPosts = filteredPosts.filter(p => {
      const contentLower = p.content.toLowerCase();
      // Match exact tag
      if (contentLower.includes(rawTag)) return true;
      // Match any topic keywords
      if (activeTopic.keywords.some(k => contentLower.includes(k.toLowerCase()))) return true;
      // Match category
      if (activeTopic.category === p.category) return true;
      return false;
    });
  }

  // Sort
  if (feedType === 'trending') {
    filteredPosts.sort((a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount));
  } else if (feedType === 'latest') {
    filteredPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerContent.trim()) return;
    onCreatePost({
      content: composerContent.trim(),
      mediaUrl: composerMediaUrl.trim() || undefined,
      category: composerCategory
    });
    setComposerContent('');
    setComposerMediaUrl('');
    setShowMediaInput(false);
  };

  const handleCommentSubmit = (postId: string) => {
    if (!commentText.trim()) return;
    onAddComment(postId, commentText.trim());
    setCommentText('');
    setCommentInputPostId(null);
  };

  const categories = [
    { id: 'all', label: t.allCategories },
    { id: 'life', label: t.categoryLife },
    { id: 'culture', label: t.categoryCulture },
    { id: 'tech', label: t.categoryTech },
    { id: 'travel', label: t.categoryTravel },
    { id: 'thought', label: t.categoryThought }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Two-Column Global Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Main Feed Column */}
        <div className="flex-1 min-w-0 space-y-6 w-full">
          {/* 1. Header with Feed Navigation & Quick Country Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center space-x-2">
                <span>{t.feedTab}</span>
                {activeCountry && (
                  <span className="px-2.5 py-1 text-xs rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {countries.find(c => c.code === activeCountry)?.name || activeCountry}
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">{t.shareLife}</p>
            </div>

            {/* Feed Type Switcher */}
            <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setFeedType('global')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  feedType === 'global' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Global</span>
              </button>
              <button
                onClick={() => setFeedType('trending')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  feedType === 'trending' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Trending</span>
              </button>
              <button
                onClick={() => setFeedType('latest')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  feedType === 'latest' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Latest</span>
              </button>
            </div>
          </div>

          {/* Active Topic Banner */}
          {activeTopic && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/60 to-slate-900/80 border border-cyan-500/30 text-xs shadow-lg backdrop-blur-md">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-cyan-300 text-sm">{activeTopic.tag}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {activeTopic.postCount.toLocaleString()} {isZh ? '条动态' : 'posts'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {isZh ? activeTopic.titleZh : activeTopic.title} · {activeTopic.region}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0 ml-3">
                <button
                  type="button"
                  onClick={() => {
                    setComposerContent(prev => prev.includes(activeTopic.tag) ? prev : `${activeTopic.tag} ${prev}`);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  {isZh ? '+ 话题标签' : '+ Insert Tag'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTopic(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Clear Topic Filter"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 2. Category Filter Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${
                  selectedCategory === c.id
                    ? 'bg-slate-800 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
            {activeCountry && (
              <button
                onClick={() => onSelectCountry(null)}
                className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer underline ml-auto"
              >
                Clear Country Filter
              </button>
            )}
          </div>

          {/* 3. Post Composer (Apple/macOS minimal elegance) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl backdrop-blur-md">
            <form onSubmit={handlePostSubmit} className="space-y-3">
              <div className="flex items-start space-x-3">
                {currentUser && (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-cyan-500/40 shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1">
                  <textarea
                    value={composerContent}
                    onChange={e => setComposerContent(e.target.value)}
                    placeholder={activeTopic ? `${t.whatsOnYourMind} (${activeTopic.tag})...` : t.whatsOnYourMind}
                    rows={3}
                    className="w-full bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none"
                  />
                  {showMediaInput && (
                    <div className="mt-2 flex items-center space-x-2">
                      <Image className="w-4 h-4 text-slate-400" />
                      <input
                        type="url"
                        value={composerMediaUrl}
                        onChange={e => setComposerMediaUrl(e.target.value)}
                        placeholder="Paste image/media URL (e.g. Unsplash or direct link)..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowMediaInput(!showMediaInput)}
                    className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      showMediaInput ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Add Media URL"
                  >
                    <Image className="w-4 h-4" />
                  </button>

                  <select
                    value={composerCategory}
                    onChange={e => setComposerCategory(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="life">{t.categoryLife}</option>
                    <option value="culture">{t.categoryCulture}</option>
                    <option value="tech">{t.categoryTech}</option>
                    <option value="travel">{t.categoryTravel}</option>
                    <option value="thought">{t.categoryThought}</option>
                  </select>

                  {currentUser && (
                    <div className="flex items-center space-x-1 text-xs text-slate-400 font-mono">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{currentUser.location.cityName}, {currentUser.location.countryCode}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!composerContent.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 font-semibold text-xs shadow-md transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.publishPost}</span>
                </button>
              </div>
            </form>
          </div>

          {/* 4. Posts Feed Stream */}
          <div className="space-y-5">
            {filteredPosts.length === 0 ? (
              <div className="text-center py-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 p-6 space-y-3">
                <Compass className="w-10 h-10 mx-auto text-slate-500 mb-2" />
                <p className="text-sm font-medium">
                  {activeTopic
                    ? (isZh ? `暂无包含话题 ${activeTopic.tag} 的动态` : `No dispatches match topic ${activeTopic.tag}`)
                    : 'No posts match this filter.'}
                </p>
                <p className="text-xs text-slate-500">
                  {activeTopic
                    ? (isZh ? '成为首位就该全球议题发声的数字公民！' : 'Be the first planetary citizen to publish under this topic!')
                    : 'Be the first citizen to publish a story here!'}
                </p>
                {activeTopic && (
                  <button
                    type="button"
                    onClick={() => {
                      setComposerContent(`${activeTopic.tag} `);
                      window.scrollTo({ top: 120, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer transition-all shadow-md mt-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isZh ? `立即发布 #${activeTopic.tag}` : `Post to ${activeTopic.tag}`}</span>
                  </button>
                )}
              </div>
            ) : (
              filteredPosts.map(post => (
                <article
                  key={post.id}
                  className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-xl backdrop-blur-sm space-y-3.5 hover:border-slate-700/80 transition-all"
                >
                  {/* Author Header */}
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => onSelectUser(post.author)}
                      className="flex items-center space-x-3 cursor-pointer group"
                    >
                      <img
                        src={post.author.avatar}
                        alt={post.author.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-700 group-hover:border-cyan-400 transition-colors"
                      />
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors">
                            {post.author.displayName}
                          </span>
                          {post.author.verified && (
                            <Sparkles className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                          )}
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-300">
                            {post.countryCode}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                          <span className="flex items-center space-x-0.5">
                            <MapPin className="w-3 h-3 text-cyan-400" />
                            <span>{post.cityName}, {post.countryName}</span>
                          </span>
                          <span>·</span>
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-cyan-400 font-mono">
                      #{post.category}
                    </span>
                  </div>

                  {/* Post Content */}
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {post.content}
                  </p>

                  {/* Media Attachment */}
                  {post.mediaUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 max-h-96">
                      <img
                        src={post.mediaUrl}
                        alt="Post media"
                        className="w-full h-full object-cover max-h-96"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Post Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => onLikePost(post.id)}
                        className={`flex items-center space-x-1.5 cursor-pointer transition-colors ${
                          post.liked ? 'text-rose-400 font-semibold' : 'hover:text-rose-300'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${post.liked ? 'fill-rose-400 text-rose-400' : ''}`} />
                        <span>{post.likesCount}</span>
                      </button>

                      <button
                        onClick={() => setCommentInputPostId(commentInputPostId === post.id ? null : post.id)}
                        className="flex items-center space-x-1.5 hover:text-cyan-300 cursor-pointer transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{post.commentsCount}</span>
                      </button>

                      <button className="flex items-center space-x-1.5 hover:text-slate-200 cursor-pointer transition-colors">
                        <Share2 className="w-4 h-4" />
                        <span>{post.sharesCount}</span>
                      </button>
                    </div>

                    <button
                      onClick={() => alert(`Tip sent to ${post.author.displayName}! (Voluntary appreciation)`)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 cursor-pointer transition-colors font-medium"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>{t.tip}</span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  {post.comments && post.comments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/40">
                      {post.comments.map(c => (
                        <div key={c.id} className="p-2.5 rounded-xl bg-slate-950/60 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{c.author.displayName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{c.author.countryCode}</span>
                          </div>
                          <p className="text-slate-300">{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Comment Input Box */}
                  {commentInputPostId === post.id && (
                    <div className="flex items-center space-x-2 pt-2">
                      <input
                        type="text"
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder="Write a warm comment..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                        onKeyDown={e => e.key === 'Enter' && handleCommentSubmit(post.id)}
                      />
                      <button
                        onClick={() => handleCommentSubmit(post.id)}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar Column: Trending Topics & Telemetry Widget */}
        <aside className="w-full lg:w-84 xl:w-96 shrink-0 lg:sticky lg:top-20 space-y-6">
          <TrendingTopicsWidget
            onSelectTopic={topic => {
              setActiveTopic(prev => (prev?.id === topic.id ? null : topic));
            }}
            selectedTopicTag={activeTopic?.tag || null}
            onClearTopicFilter={() => setActiveTopic(null)}
            lang={lang}
          />
        </aside>
      </div>
    </div>
  );
};
