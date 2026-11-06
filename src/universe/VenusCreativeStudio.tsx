import React from 'react';
import { ArrowLeft, Palette } from 'lucide-react';
import { CreatorArticle, Language } from '../types/index.ts';
import { CreatorHub } from '../components/creator/CreatorHub.tsx';

type CreatorArticleDraft = Pick<CreatorArticle, 'title' | 'summary' | 'content' | 'coverUrl' | 'category'>;

interface VenusCreativeStudioProps {
  articles: CreatorArticle[];
  lang: Language;
  onCreateArticle: (article: CreatorArticleDraft) => void;
  onBack: () => void;
}

export const VenusCreativeStudio: React.FC<VenusCreativeStudioProps> = ({
  articles,
  lang,
  onCreateArticle,
  onBack
}) => (
  <div className="min-h-full bg-[#030712]">
    <header className="border-b border-white/[0.08] bg-[radial-gradient(ellipse_at_top_right,rgba(244,114,182,0.12),transparent_55%)] px-4 pb-8 pt-24 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === 'zh' ? '返回太阳系' : 'Back to Solar System'}
        </button>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-200/20 bg-rose-200/[0.08] text-rose-100">
            <Palette className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-rose-200/70">EARTH ONE · VENUS</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">{lang === 'zh' ? '创作工坊' : 'Creative Studio'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {lang === 'zh'
                ? '这里连接 EARTH 现有的创作者文章发布与阅读服务。当前没有独立音乐库或授权播放源，因此不会展示虚构的音乐内容。'
                : 'This space connects to EARTH’s existing creator publishing and reading service. No standalone music catalog or licensed playback source is currently available, so no music content is fabricated.'}
            </p>
          </div>
        </div>
      </div>
    </header>
    <CreatorHub articles={articles} onCreateArticle={onCreateArticle} lang={lang} />
  </div>
);
