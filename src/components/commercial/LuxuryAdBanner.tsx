import React, { useState, useEffect } from 'react';
import { Advertisement, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Sparkles, ExternalLink } from 'lucide-react';

interface LuxuryAdBannerProps {
  lang: Language;
}

export const LuxuryAdBanner: React.FC<LuxuryAdBannerProps> = ({ lang }) => {
  const t = translations[lang];
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  useEffect(() => {
    fetch('/api/ads')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.ads) {
          setAds(data.ads);
        }
      })
      .catch(err => console.warn('Ads fetch error:', err));
  }, []);

  if (ads.length === 0) return null;

  const currentAd = ads[currentAdIndex % ads.length];

  const handleClick = () => {
    fetch(`/api/ads/${currentAd.id}/click`, { method: 'POST' }).catch(() => {});
  };

  return (
    <aside className="w-full max-w-5xl mx-auto px-4 py-3">
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-xl backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <img
            src={currentAd.imageUrl}
            alt={currentAd.brand}
            className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-mono px-2 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {t.sponsored}
              </span>
              <span className="text-xs font-bold text-slate-200">{currentAd.brand}</span>
            </div>
            <p className="text-xs text-slate-300 font-medium">{currentAd.tagline}</p>
            <p className="text-[11px] text-slate-400 line-clamp-1">{currentAd.description}</p>
          </div>
        </div>

        <a
          href={currentAd.ctaUrl}
          onClick={handleClick}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
        >
          <span>{currentAd.ctaText}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </aside>
  );
};
