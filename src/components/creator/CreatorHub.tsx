import React, { useState } from 'react';
import { CreatorArticle, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Clock, DollarSign, Heart, PenTool, Plus, X } from 'lucide-react';

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
    setTitle(''); setSummary(''); setContent(''); setIsPublishOpen(false);
  };

  const handleTip = async (articleId: string) => {
    try {
      const res = await fetch(`/api/articles/${articleId}/tip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 15 }) });
      const data = await res.json();
      if (data.success) { setTipSuccessId(articleId); setTimeout(() => setTipSuccessId(null), 3000); }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--color-one-border)] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
            <PenTool className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
            <span>{lang === 'zh' ? 'ONE 创作 · 真实表达' : 'ONE CREATOR · Real Expression'}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{t.creatorTab}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
            {lang === 'zh' ? '撰写文章与长文，分享观点与故事，并获得来自读者的真实支持。' : 'Write articles and essays, share ideas and stories, and receive real support from readers.'}
          </p>
        </div>
        <button onClick={() => setIsPublishOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl bg-[var(--color-one-accent)] px-4 py-2.5 text-xs font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] transition hover:brightness-110 sm:self-auto">
          <Plus className="h-4 w-4" /><span>{t.publishArticle}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {articles.map(art => (
          <article key={art.id} className="group flex flex-col overflow-hidden rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.04]">
            <div className="relative h-48 overflow-hidden bg-[rgba(10,14,22,0.8)]">
              <img src={art.coverUrl} alt={art.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">{art.category}</span>
            </div>
            <div className="flex flex-1 flex-col justify-between space-y-4 p-5 sm:p-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-one-text-muted)]">
                  <img src={art.author.avatar} alt={art.author.displayName} className="h-5 w-5 rounded-full border border-[var(--color-one-border)] object-cover" />
                  <span className="font-medium text-white">{art.author.displayName}</span><span>·</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /><span>{art.readTime}</span></span>
                </div>
                <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">{art.title}</h2>
                <p className="line-clamp-3 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">{art.summary}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-one-border)] pt-4 text-xs">
                <div className="flex items-center gap-3 text-[var(--color-one-text-muted)]">
                  <span className="inline-flex items-center gap-1 text-rose-300"><Heart className="h-4 w-4 fill-current" /><span>{art.clapsCount}</span></span>
                  <span className="inline-flex items-center gap-1 font-mono text-emerald-300"><DollarSign className="h-4 w-4" /><span>${art.tipsTotal}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleTip(art.id)} className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                    {tipSuccessId === art.id ? (lang === 'zh' ? '已支持 ✨' : 'Tipped! ✨') : (lang === 'zh' ? '支持 $15' : 'Tip $15')}
                  </button>
                  <button onClick={() => setSelectedArticle(art)} className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.06]">{t.readArticle}</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {articles.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-16 text-center text-sm text-[var(--color-one-text-muted)]">{lang === 'zh' ? '暂无文章，发布第一篇内容吧。' : 'No articles yet. Publish the first one.'}</div>
      )}

      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md">
          <div className="my-8 w-full max-w-3xl space-y-6 rounded-[28px] border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] p-6 shadow-[var(--shadow-one-lg)] sm:p-8">
            <div className="flex items-center justify-between border-b border-[var(--color-one-border)] pb-4">
              <span className="rounded-full border border-[var(--color-one-border)] bg-white/[0.03] px-3 py-1 font-mono text-xs text-[var(--color-one-text-muted)]">{selectedArticle.category}</span>
              <button onClick={() => setSelectedArticle(null)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{selectedArticle.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-one-text-muted)]">
                <img src={selectedArticle.author.avatar} alt={selectedArticle.author.displayName} className="h-7 w-7 rounded-full border border-[var(--color-one-border)] object-cover" />
                <span className="font-semibold text-white">{selectedArticle.author.displayName}</span><span>·</span><span>{selectedArticle.readTime}</span><span>·</span><span>{new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <img src={selectedArticle.coverUrl} alt={selectedArticle.title} className="h-64 w-full rounded-2xl border border-[var(--color-one-border)] object-cover" />
            <div className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-one-text)] sm:text-base">{selectedArticle.content}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-one-border)] pt-6">
              <button onClick={() => handleTip(selectedArticle.id)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-500/90 px-4 py-2 text-xs font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] transition hover:brightness-110">
                <DollarSign className="h-4 w-4" /><span>{lang === 'zh' ? '支持作者 ($15)' : 'Send Tip ($15)'}</span>
              </button>
              <button onClick={() => setSelectedArticle(null)} className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-4 py-2 text-xs font-medium text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white">{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {isPublishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl space-y-4 rounded-[28px] border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] p-6 shadow-[var(--shadow-one-lg)] sm:p-8">
            <div className="flex items-center justify-between border-b border-[var(--color-one-border)] pb-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><PenTool className="h-4 w-4 text-[var(--color-one-accent)]" /><span>{t.publishArticle}</span></h2>
              <button onClick={() => setIsPublishOpen(false)} className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handlePublish} className="space-y-4 text-xs">
              <div>
                <label className="mb-1 block text-[var(--color-one-text-muted)]">{lang === 'zh' ? '标题' : 'Article Title'}</label>
                <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder={lang === 'zh' ? '输入文章标题...' : 'Enter article title...'} className="w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3.5 py-2.5 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[var(--color-one-text-muted)]">{lang === 'zh' ? '摘要' : 'Summary / Lead'}</label>
                <input type="text" value={summary} onChange={e => setSummary(e.target.value)} placeholder={lang === 'zh' ? '简短摘要...' : 'Brief synopsis...'} className="w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3.5 py-2.5 text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[var(--color-one-text-muted)]">{lang === 'zh' ? '分类' : 'Category'}</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3.5 py-2.5 text-white focus:outline-none">
                    <option value="Philosophy & Society">Philosophy & Society</option><option value="Architecture & Nature">Architecture & Nature</option><option value="Science & Cosmos">Science & Cosmos</option><option value="Global Heritage">Global Heritage</option><option value="Digital Arts">Digital Arts</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[var(--color-one-text-muted)]">{lang === 'zh' ? '封面图 URL' : 'Cover Image URL'}</label>
                  <input type="url" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3.5 py-2.5 text-white placeholder:text-[var(--color-one-text-dim)] focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[var(--color-one-text-muted)]">{lang === 'zh' ? '正文' : 'Full Article Text'}</label>
                <textarea required rows={6} value={content} onChange={e => setContent(e.target.value)} placeholder={lang === 'zh' ? '在这里撰写你的文章...' : 'Write your story or essay here...'} className="w-full resize-none rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3.5 py-2.5 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsPublishOpen(false)} className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-4 py-2 font-medium text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white">{lang === 'zh' ? '取消' : 'Cancel'}</button>
                <button type="submit" className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[var(--color-one-accent)] px-5 py-2 font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] hover:brightness-110">{lang === 'zh' ? '发布' : 'Publish'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
