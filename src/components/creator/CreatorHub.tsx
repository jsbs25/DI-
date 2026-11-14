import React, { useState } from 'react';
import { CreatorArticle, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Clock, DollarSign, Heart, PenTool, Plus, X, BookOpen, Feather } from 'lucide-react';

interface CreatorHubProps {
  articles: CreatorArticle[];
  onCreateArticle: (art: any) => void;
  lang: Language;
}

export const CreatorHub: React.FC<CreatorHubProps> = ({ articles, onCreateArticle, lang }) => {
  const t = translations[lang];
  const [selectedArticle, setSelectedArticle] = useState<CreatorArticle | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [tipSuccessId, setTipSuccessId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [category, setCategory] = useState('Philosophy & Society');

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;
    onCreateArticle({ title, summary, content, coverUrl, category });
    setTitle('');
    setSummary('');
    setContent('');
    setIsPublishOpen(false);
  };

  const handleTip = async (articleId: string) => {
    try {
      const res = await fetch(`/api/articles/${articleId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 15 })
      });
      const data = await res.json();
      if (data.success) {
        setTipSuccessId(articleId);
        setTimeout(() => setTipSuccessId(null), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isZh = lang === 'zh';
  const isAr = lang === 'ar';

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-8 text-[color:var(--color-one-text)] sm:px-6 lg:px-10">
      {/* Workspace header */}
      <div className="one-surface-elevated flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="one-badge one-badge-gold inline-flex items-center gap-1.5">
              <PenTool className="h-3.5 w-3.5" />
              <span>{isZh ? '创作工作区' : 'Creative workspace'}</span>
            </span>
            <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{articles.length}</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-2xl">{t.creatorTab}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[color:var(--color-one-text-muted)]">
            {isZh
              ? '撰写并发布文章，阅读真实作品，并为创作者提供支持。所有能力基于现有文章服务。'
              : 'Write and publish articles, read real works, and support creators—powered by the existing article service.'}
          </p>
        </div>
        <button
          onClick={() => setIsPublishOpen(true)}
          className="one-btn one-btn-md one-btn-primary shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>{t.publishArticle}</span>
        </button>
      </div>

      {/* Works grid */}
      {articles.length === 0 ? (
        <div className="one-surface flex flex-col items-center justify-center px-6 py-16 text-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
          >
            <Feather className="h-7 w-7 text-[color:var(--color-one-text-dim)]" />
          </div>
          <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">
            {isZh ? '还没有作品' : 'No works yet'}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-one-text-muted)]">
            {isZh ? '从第一篇文章开始，分享你的想法与故事。' : 'Start with your first article—share an idea or story.'}
          </p>
          <button onClick={() => setIsPublishOpen(true)} className="one-btn one-btn-md one-btn-secondary mt-5">
            <Plus className="h-4 w-4" />
            <span>{t.publishArticle}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((art) => (
            <article
              key={art.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] shadow-[var(--shadow-one-sm)] transition-all hover:-translate-y-0.5"
            >
              <button
                type="button"
                onClick={() => setSelectedArticle(art)}
                className="relative block aspect-[16/10] w-full overflow-hidden text-left"
                style={{ background: 'var(--color-one-surface-soft)' }}
              >
                <img
                  src={art.coverUrl}
                  alt={art.title}
                  className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-one)] group-hover:scale-[1.03]"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                <span
                  className="absolute left-3 top-3 rounded-md px-2 py-0.5 text-[10px] font-medium bg-black/55 border border-white/25 text-white backdrop-blur-sm"
                >
                  {art.category}
                </span>
              </button>

              <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--color-one-text-dim)]">
                    <img src={art.author.avatar} alt={art.author.displayName} className="h-5 w-5 rounded-full border object-cover" style={{ borderColor: 'var(--color-one-border)' }} />
                    <span className="font-medium text-[color:var(--color-one-text)]">{art.author.displayName}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{art.readTime}</span>
                    </span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-[color:var(--color-one-text)] transition-colors group-hover:text-[color:var(--color-one-accent)]">
                    {art.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[color:var(--color-one-text-muted)] sm:text-sm">
                    {art.summary}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5" style={{ borderColor: 'var(--color-one-border)' }}>
                  <div className="flex items-center gap-3 text-xs text-[color:var(--color-one-text-muted)]">
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-one-danger)' }}>
                      <Heart className="h-3.5 w-3.5 fill-current" />
                      <span>{art.clapsCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono" style={{ color: 'var(--color-one-success)' }}>
                      <DollarSign className="h-3.5 w-3.5" />
                      <span>${art.tipsTotal}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTip(art.id)}
                      className="one-btn one-btn-sm one-btn-secondary"
                    >
                      {tipSuccessId === art.id ? (isZh ? '已支持' : 'Tipped!') : (isZh ? '支持 $15' : 'Tip $15')}
                    </button>
                    <button onClick={() => setSelectedArticle(art)} className="one-btn one-btn-sm one-btn-ghost">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{t.readArticle}</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Reader */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-slate-900/65 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="one-surface-elevated my-6 w-full max-w-3xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
              <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{selectedArticle.category}</span>
              <button onClick={() => setSelectedArticle(null)} className="one-btn one-btn-sm one-btn-ghost" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div>
                <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[color:var(--color-one-text)] sm:text-3xl">
                  {selectedArticle.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--color-one-text-muted)]">
                  <img src={selectedArticle.author.avatar} alt={selectedArticle.author.displayName} className="h-6 w-6 rounded-full border object-cover" style={{ borderColor: 'var(--color-one-border)' }} />
                  <span className="font-medium text-[color:var(--color-one-text)]">{selectedArticle.author.displayName}</span>
                  <span>·</span>
                  <span>{selectedArticle.readTime}</span>
                  <span>·</span>
                  <span>{new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <img src={selectedArticle.coverUrl} alt={selectedArticle.title} className="h-56 w-full rounded-xl border object-cover sm:h-72" style={{ borderColor: 'var(--color-one-border)' }} />
              <div className="whitespace-pre-line text-sm leading-7 text-[color:var(--color-one-text-muted)] sm:text-base">
                {selectedArticle.content}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: 'var(--color-one-border)' }}>
                <button onClick={() => handleTip(selectedArticle.id)} className="one-btn one-btn-md one-btn-secondary">
                  <DollarSign className="h-4 w-4" style={{ color: 'var(--color-one-success)' }} />
                  <span>{isZh ? '支持作者 ($15)' : 'Send Tip ($15)'}</span>
                </button>
                <button onClick={() => setSelectedArticle(null)} className="one-btn one-btn-md one-btn-ghost">
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish composer */}
      {isPublishOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="one-surface-elevated w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-[color:var(--color-one-text)]">
                <PenTool className="h-4 w-4" style={{ color: 'var(--color-one-gold)' }} />
                <span>{t.publishArticle}</span>
              </h2>
              <button onClick={() => setIsPublishOpen(false)} className="one-btn one-btn-sm one-btn-ghost" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePublish} className="space-y-4 px-5 py-5 text-sm sm:px-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-one-text-muted)]">
                  {isZh ? '标题' : 'Article Title'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isZh ? '输入文章标题...' : 'Enter article title...'}
                  className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 py-2.5 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] focus:border-[rgba(127,212,255,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(127,212,255,0.35)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-one-text-muted)]">
                  {isZh ? '摘要' : 'Summary / Lead'}
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={isZh ? '简短摘要...' : 'Brief synopsis...'}
                  className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 py-2.5 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] focus:border-[rgba(127,212,255,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(127,212,255,0.35)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-one-text-muted)]">
                    {isZh ? '分类' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 py-2.5 text-sm text-[color:var(--color-one-text)] focus:border-[rgba(127,212,255,0.45)] focus:outline-none"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  >
                    <option value="Philosophy & Society">Philosophy & Society</option>
                    <option value="Architecture & Nature">Architecture & Nature</option>
                    <option value="Science & Cosmos">Science & Cosmos</option>
                    <option value="Global Heritage">Global Heritage</option>
                    <option value="Digital Arts">Digital Arts</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-one-text-muted)]">
                    {isZh ? '封面图 URL' : 'Cover Image URL'}
                  </label>
                  <input
                    type="url"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 py-2.5 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] focus:border-[rgba(127,212,255,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(127,212,255,0.35)]"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-one-text-muted)]">
                  {isZh ? '正文' : 'Full Article Text'}
                </label>
                <textarea
                  required
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={isZh ? '在这里撰写你的文章...' : 'Write your story or essay here...'}
                  className="w-full resize-none rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 py-2.5 text-sm leading-6 text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] focus:border-[rgba(127,212,255,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(127,212,255,0.35)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsPublishOpen(false)} className="one-btn one-btn-md one-btn-ghost">
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button type="submit" className="one-btn one-btn-md one-btn-primary">
                  <PenTool className="h-4 w-4" />
                  <span>{isZh ? '发布' : 'Publish'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
