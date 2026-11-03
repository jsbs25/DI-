import React, { useState } from 'react';
import { CreatorArticle, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  PenTool,
  Clock,
  Heart,
  DollarSign,
  Share2,
  BookOpen,
  Sparkles,
  Plus,
  X,
  Send
} from 'lucide-react';

interface CreatorHubProps {
  articles: CreatorArticle[];
  onCreateArticle: (art: any) => void;
  lang: Language;
}

export const CreatorHub: React.FC<CreatorHubProps> = ({
  articles,
  onCreateArticle,
  lang
}) => {
  const t = translations[lang];

  const [selectedArticle, setSelectedArticle] = useState<CreatorArticle | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [tipSuccessId, setTipSuccessId] = useState<string | null>(null);

  // New article form
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [category, setCategory] = useState('Philosophy & Society');

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;
    onCreateArticle({
      title,
      summary,
      content,
      coverUrl,
      category
    });
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

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono mb-1">
            <PenTool className="w-4 h-4" />
            <span>GLOBAL CREATIVE COMMONS</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            {t.creatorTab}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Empowering every global citizen to write essays, share philosophies, and receive appreciation tips.
          </p>
        </div>

        <button
          onClick={() => setIsPublishOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{t.publishArticle}</span>
        </button>
      </div>

      {/* Featured Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {articles.map(art => (
          <article
            key={art.id}
            className="rounded-3xl bg-slate-900/70 border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col group"
          >
            {/* Cover image */}
            <div className="h-48 overflow-hidden relative">
              <img
                src={art.coverUrl}
                alt={art.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-[11px] font-mono text-cyan-300 border border-slate-700">
                {art.category}
              </span>
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <img
                    src={art.author.avatar}
                    alt={art.author.displayName}
                    className="w-5 h-5 rounded-full object-cover border border-cyan-400/50"
                  />
                  <span className="font-medium text-slate-200">{art.author.displayName}</span>
                  <span>·</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{art.readTime}</span>
                  </span>
                </div>

                <h2 className="text-lg font-bold text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-2">
                  {art.title}
                </h2>

                <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                  {art.summary}
                </p>
              </div>

              {/* Bottom interactions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs">
                <div className="flex items-center space-x-3 text-slate-400">
                  <span className="flex items-center space-x-1 text-rose-400">
                    <Heart className="w-4 h-4 fill-rose-400" />
                    <span>{art.clapsCount}</span>
                  </span>
                  <span className="flex items-center space-x-1 text-emerald-400 font-mono">
                    <DollarSign className="w-4 h-4" />
                    <span>${art.tipsTotal} tips</span>
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleTip(art.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-medium cursor-pointer transition-colors"
                  >
                    {tipSuccessId === art.id ? 'Tipped! ✨' : 'Tip $15'}
                  </button>

                  <button
                    onClick={() => setSelectedArticle(art)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
                  >
                    {t.readArticle}
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Article Reader Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-mono">
                {selectedArticle.category}
              </span>
              <button
                onClick={() => setSelectedArticle(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 font-serif leading-tight">
                {selectedArticle.title}
              </h1>

              <div className="flex items-center space-x-3 text-xs text-slate-400">
                <img
                  src={selectedArticle.author.avatar}
                  alt={selectedArticle.author.displayName}
                  className="w-7 h-7 rounded-full object-cover border border-cyan-400"
                />
                <span className="font-semibold text-slate-200">{selectedArticle.author.displayName}</span>
                <span>·</span>
                <span>{selectedArticle.readTime}</span>
                <span>·</span>
                <span>{new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <img
              src={selectedArticle.coverUrl}
              alt={selectedArticle.title}
              className="w-full h-64 object-cover rounded-2xl border border-slate-800"
            />

            <div className="text-sm sm:text-base text-slate-200 leading-relaxed font-sans whitespace-pre-line space-y-4">
              {selectedArticle.content}
            </div>

            <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleTip(selectedArticle.id)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Send Creator Tip ($15)</span>
                </button>
              </div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Article Modal */}
      {isPublishOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <PenTool className="w-4 h-4 text-cyan-400" />
                <span>{t.publishArticle}</span>
              </h2>
              <button
                onClick={() => setIsPublishOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Article Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Harmonizing Global Traditions with Future Space Exploration"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Summary / Lead Paragraph</label>
                <input
                  type="text"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder="Brief synopsis for global readers..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none"
                  >
                    <option value="Philosophy & Society">Philosophy & Society</option>
                    <option value="Architecture & Nature">Architecture & Nature</option>
                    <option value="Science & Cosmos">Science & Cosmos</option>
                    <option value="Global Heritage">Global Heritage</option>
                    <option value="Digital Arts">Digital Arts</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Cover Image URL</label>
                  <input
                    type="url"
                    value={coverUrl}
                    onChange={e => setCoverUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Full Article Text</label>
                <textarea
                  required
                  rows={6}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Write your story, essay, or thoughts here..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500 resize-none text-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPublishOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md cursor-pointer"
                >
                  Publish to World
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
