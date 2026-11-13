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
      <div className="p-4 sm:p-5 rounded-[24px] bg-[rgba(12,16,23,0.55)] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.25)] backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <img
            src={currentAd.imageUrl}
            alt={currentAd.brand}
            className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-200 border border-cyan-400/20">
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
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-cyan-200 border border-white/10 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
        >
          <span>{currentAd.ctaText}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </aside>
  );
};
