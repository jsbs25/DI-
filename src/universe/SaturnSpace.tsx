import React from 'react';
import { ArrowLeft, Film, ExternalLink, Sparkles } from 'lucide-react';
import { Language } from '../types/index.ts';
import { translations } from '../i18n/translations.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
}

// Public-domain NASA / space films (YouTube embeds are reliable and NASA
// content is in the public domain). Add or replace IDs freely.
const SATURN_FILMS = [
  { id: 'xrGAQCq9BMU', title: "NASA at Saturn: Cassini's Grand Finale", source: 'NASA Jet Propulsion Laboratory' },
  { id: 'vl6jn-DdafM', title: 'We Are Going — Artemis', source: 'NASA' }
];

export const SaturnSpace: React.FC<SaturnSpaceProps> = ({ lang, onBack }) => {
  const t = translations[lang] || translations.zh;

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_50%_120%,rgba(245,190,110,0.18),transparent_60%),#02050f] px-4 py-10 sm:px-8">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{lang === 'zh' ? '返回宇宙引擎' : 'Back to Universe'}</span>
        </button>

        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{lang === 'zh' ? '土星生态空间' : 'SATURN ECOLOGY'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {lang === 'zh' ? '土星观影站' : 'Saturn Cinema'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            {lang === 'zh'
              ? '在土星生态空间里，观看 NASA 与深空探索的公版影像，感受卡西尼号穿越土星环的壮丽旅程。'
              : 'Watch public-domain NASA and deep-space footage from within the Saturn ecology, including Cassini’s journey through the rings.'}
          </p>
        </div>
      </header>

      {/* Cinema grid */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Film className="h-4 w-4 text-amber-400" />
          <span>{lang === 'zh' ? '土星 · 深空影像馆' : 'Saturn · Deep Space Cinema'}</span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {SATURN_FILMS.map(film => (
            <article key={film.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-2xl">
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${film.id}`}
                  title={film.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="p-4">
                <h3 className="text-sm font-bold text-white">{film.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{film.source}</p>
              </div>
            </article>
          ))}
        </div>

        <a
          href="https://www.youtube.com/@NASA"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>{lang === 'zh' ? '在 NASA 官方频道观看更多' : 'Watch more on the NASA channel'}</span>
        </a>
      </main>
    </div>
  );
};
