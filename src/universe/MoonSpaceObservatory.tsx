import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  X,
  RefreshCw,
  Moon,
  Telescope,
  Camera,
  Eye,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Info
} from 'lucide-react';
import { Language } from '../types/index.ts';

export interface AstroImage {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  author: string;
  source: 'NASA' | 'Wikimedia Commons' | 'Met Museum';
  sourceUrl: string;
  license: string;
  description?: string;
  date?: string;
}

interface MoonSpaceObservatoryProps {
  lang: Language;
  onBack: () => void;
}

const PRESET_CHANNELS = [
  { key: 'moon', zh: '🌙 月球探测与阿波罗档案', en: 'Moon & Apollo Missions', query: 'Moon Apollo Artemis lunar' },
  { key: 'jwst', zh: '🌌 詹姆斯·韦伯与哈勃深空', en: 'JWST & Hubble Deep Field', query: 'James Webb Hubble Deep Field galaxy' },
  { key: 'planets', zh: '🪐 太阳系行星与探测器', en: 'Planetary Reconnaissance', query: 'Jupiter Saturn Mars Europa Cassini' },
  { key: 'sun', zh: '☀️ 太阳黑子与耀斑日冕', en: 'Solar Dynamics & Corona', query: 'Sun solar flare SDO corona prominence' },
  { key: 'nebula', zh: '✨ 恒星托儿所与星云', en: 'Nebulae & Star Clusters', query: 'Carina Nebula Pillars of Creation Orion' },
  { key: 'art', zh: '🎨 人类星空艺术典藏', en: 'Astronomical Fine Art', query: 'astronomy star galaxy celestial' }
];

// 离线/即时兜底天文精选图片（全部来自 NASA 官方公有领域）
const INITIAL_IMAGES: AstroImage[] = [
  {
    id: 'nasa_apollo11_earthrise',
    title: 'Earthrise from Lunar Orbit · 月球轨道地出',
    url: 'https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~medium.jpg',
    author: 'NASA / Apollo 11 Mission Crew',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-as11-40-5903',
    license: 'Public Domain / NASA Open Media',
    description: '阿波罗11号宇航员在月球轨道上拍摄的人类母星地球从月平线缓缓升起的经典历史摄影。',
    date: '1969-07-20'
  },
  {
    id: 'nasa_jwst_carina',
    title: 'Cosmic Cliffs in Carina Nebula · 船底座星云宇宙悬崖',
    url: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001550/GSFC_20171208_Archive_e001550~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001550/GSFC_20171208_Archive_e001550~medium.jpg',
    author: 'NASA, ESA, CSA, STScI (JWST)',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-GSFC_20171208_Archive_e001550',
    license: 'Public Domain / NASA Open Media',
    description: '詹姆斯·韦伯太空望远镜红外波段捕捉到的船底座星云恒星形成区，揭示了被厚厚尘埃遮挡的婴儿恒星。',
    date: '2022-07-12'
  },
  {
    id: 'nasa_juno_jupiter',
    title: 'Jupiter Cloud Belts & Storms · 朱诺号木星湍流风暴',
    url: 'https://images-assets.nasa.gov/image/PIA21972/PIA21972~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/PIA21972/PIA21972~medium.jpg',
    author: 'NASA / JPL-Caltech / SwRI / MSSS',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-PIA21972',
    license: 'Public Domain / NASA Open Media',
    description: 'NASA 朱诺号探测器近距离飞掠木星北半球时拍摄的高分辨率涡旋风暴与氨气云层。',
    date: '2017-10-24'
  },
  {
    id: 'nasa_cassini_saturn',
    title: 'Saturn Rings & Shadow · 卡西尼号土星光环日食暗面',
    url: 'https://images-assets.nasa.gov/image/PIA08329/PIA08329~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/PIA08329/PIA08329~medium.jpg',
    author: 'NASA / JPL / Space Science Institute',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-PIA08329',
    license: 'Public Domain / NASA Open Media',
    description: '卡西尼号飞船在土星背后逆光拍摄的土星全景，光环被太阳从后方照亮，展示了卡西尼环缝与极其微弱的弥散环。',
    date: '2006-09-15'
  },
  {
    id: 'nasa_pillars_creation',
    title: 'Pillars of Creation · 鹰状星云创生之柱',
    url: 'https://images-assets.nasa.gov/image/PIA18226/PIA18226~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/PIA18226/PIA18226~medium.jpg',
    author: 'NASA, ESA, and the Hubble Heritage Team (STScI/AURA)',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-PIA18226',
    license: 'Public Domain / NASA Open Media',
    description: '哈勃太空望远镜在可见光波段拍摄的 M16 鹰状星云三根巨大星际气体柱，内部正孕育着新的恒星系。',
    date: '2015-01-05'
  },
  {
    id: 'nasa_perseverance_mars',
    title: 'Perseverance Rover on Jezero Crater · 毅力号火星杰泽罗陨石坑',
    url: 'https://images-assets.nasa.gov/image/PIA24424/PIA24424~medium.jpg',
    thumbnailUrl: 'https://images-assets.nasa.gov/image/PIA24424/PIA24424~medium.jpg',
    author: 'NASA / JPL-Caltech',
    source: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details-PIA24424',
    license: 'Public Domain / NASA Open Media',
    description: 'NASA 毅力号火星车搭载的 Mastcam-Z 双目相机在火星古三角洲边缘拍摄的高清全景地貌。',
    date: '2021-02-22'
  }
];

export const MoonSpaceObservatory: React.FC<MoonSpaceObservatoryProps> = ({ lang, onBack }) => {
  const isZh = lang === 'zh';

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'nasa' | 'wikimedia' | 'met'>('all');
  const [activeChannel, setActiveChannel] = useState<string>('moon');
  const [images, setImages] = useState<AstroImage[]>(INITIAL_IMAGES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const touchStartX = useRef<number | null>(null);

  const fetchImages = useCallback(
    async (q: string, src = sourceFilter) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/images/search?q=${encodeURIComponent(q)}&limit=24&source=${src}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.images) && data.images.length > 0) {
          setImages(data.images);
        } else {
          setImages([]);
          setError(
            isZh
              ? '未检索到该关键词的开放天体影像，请尝试其他天体或英文名称（如 Mars / Orion）。'
              : 'No images found for this query. Try another body or keyword (e.g. Mars, Orion).'
          );
        }
      } catch {
        setImages((prev) => (prev.length ? prev : INITIAL_IMAGES));
        setError(
          isZh
            ? '影像接口连接超时，已保留本地精选影像。'
            : 'Image search timed out. Local curated imagery remains available.'
        );
      } finally {
        setLoading(false);
      }
    },
    [sourceFilter, isZh]
  );

  const handleSelectChannel = (ch: (typeof PRESET_CHANNELS)[number]) => {
    setActiveChannel(ch.key);
    setQuery('');
    fetchImages(ch.query, sourceFilter);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setActiveChannel('');
    fetchImages(query, sourceFilter);
  };

  const lightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const showPrev = useCallback(() => {
    setLightboxIndex((idx) => (idx === null ? idx : (idx - 1 + images.length) % images.length));
  }, [images.length]);
  const showNext = useCallback(() => {
    setLightboxIndex((idx) => (idx === null ? idx : (idx + 1) % images.length));
  }, [images.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPrev();
      if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxIndex, showPrev, showNext]);

  const onLightboxTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onLightboxTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    const end = e.changedTouches[0]?.clientX ?? null;
    touchStartX.current = null;
    if (start == null || end == null) return;
    const dx = end - start;
    if (Math.abs(dx) > 48) {
      if (dx > 0) showPrev();
      else showNext();
    }
  };

  const sourceFilters = useMemo(
    () => [
      { id: 'all' as const, label: isZh ? '全部聚合' : 'All sources' },
      { id: 'nasa' as const, label: 'NASA' },
      { id: 'wikimedia' as const, label: 'Wikimedia Commons' },
      { id: 'met' as const, label: isZh ? 'Met 公版' : 'Met Museum' }
    ],
    [isZh]
  );

  return (
    <div
      className="min-h-screen text-[color:var(--color-one-text)]"
      style={{
        background:
          'radial-gradient(1200px 700px at 50% -10%, rgba(127,212,255,0.08), transparent 55%), radial-gradient(900px 500px at 80% 20%, rgba(183,189,200,0.06), transparent 50%), linear-gradient(180deg, #030508 0%, #05070b 40%, #030508 100%)'
      }}
    >
      {/* subtle starfield / depth */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[20%] left-1/2 h-[70vw] w-[70vw] -translate-x-1/2 rounded-full opacity-[0.12] blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(244,243,238,0.35), transparent 65%)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[-5%] h-[50vw] w-[50vw] rounded-full opacity-[0.08] blur-[140px]"
          style={{ background: 'radial-gradient(circle, rgba(127,212,255,0.5), transparent 60%)' }}
        />
      </div>

      <header className="relative z-10 mx-auto w-full max-w-[1440px] px-4 pb-6 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <button
          onClick={onBack}
          className="one-btn one-btn-sm one-btn-ghost mb-5 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{isZh ? '返回太阳系' : 'Back to Solar System'}</span>
        </button>

        <div className="one-surface-elevated relative overflow-hidden px-5 py-6 sm:px-7 sm:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(244,243,238,0.5), transparent 70%)' }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="one-badge one-badge-neutral inline-flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5" />
                  ONE · OBSERVATORY
                </span>
                <span className="one-badge one-badge-accent inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-one-accent)]" />
                  NASA / Wikimedia / Met · {isZh ? '开放影像直连' : 'Open imagery'}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-4xl lg:text-5xl">
                ONE OBSERVATORY
              </h1>
              <p className="mt-1 text-sm font-medium tracking-[0.18em] text-[color:var(--color-one-text-muted)] sm:text-base">
                Explore the Universe.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--color-one-text-muted)]">
                {isZh
                  ? '月球是人类眺望宇宙的天然观测台。直连 NASA 官方图库、维基共享资源与大都会艺术博物馆公版星图，以影像为主体沉浸探索深空。'
                  : 'A lunar vantage on deep space. Search open imagery from NASA, Wikimedia Commons, and the Met—images first, exploration immersive.'}
              </p>
            </div>

            <div
              className="flex shrink-0 items-center gap-4 rounded-2xl border px-4 py-3.5"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl border"
                style={{ borderColor: 'rgba(127,212,255,0.25)', background: 'rgba(127,212,255,0.1)', color: 'var(--color-one-accent)' }}
              >
                <Camera className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <div className="text-[color:var(--color-one-text-dim)]">{isZh ? '开放影像节点' : 'Open archives'}</div>
                <div className="mt-0.5 font-medium text-[color:var(--color-one-text)]">NASA · Commons · Met</div>
                <div className="mt-0.5 font-mono text-[10px] text-[color:var(--color-one-text-dim)]">
                  Public Domain / Open
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative mt-7 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[color:var(--color-one-text-dim)]">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    isZh
                      ? '搜索天体、探测器、星云或英文名（如 Mars, Orion, JWST）...'
                      : 'Search bodies, missions, nebulae (e.g. Mars, Orion, JWST)...'
                  }
                  className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] py-3 pl-11 pr-10 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] transition focus:border-[rgba(127,212,255,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(127,212,255,0.35)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]"
                    aria-label="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="one-btn one-btn-md one-btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Telescope className="h-4 w-4" />
                {loading ? (isZh ? '检索中...' : 'Searching...') : isZh ? '探索影像' : 'Explore'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
                {isZh ? '来源' : 'Source'}
              </span>
              {sourceFilters.map((s) => {
                const active = sourceFilter === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSourceFilter(s.id);
                      if (query.trim()) fetchImages(query, s.id);
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                    style={
                      active
                        ? {
                            color: 'var(--color-one-accent)',
                            background: 'rgba(127,212,255,0.12)',
                            border: '1px solid rgba(127,212,255,0.26)'
                          }
                        : {
                            color: 'var(--color-one-text-muted)',
                            background: 'rgba(244,243,238,0.03)',
                            border: '1px solid var(--color-one-border)'
                          }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
              <span className="ml-auto hidden text-[11px] text-[color:var(--color-one-text-dim)] sm:inline">
                {isZh ? '高清 · 公有领域 / 开放许可' : 'High-res · Public domain / open'}
              </span>
            </div>
          </form>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-16 sm:px-6 lg:px-10">
        {/* Channels */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_CHANNELS.map((ch) => {
            const active = activeChannel === ch.key;
            return (
              <button
                key={ch.key}
                onClick={() => handleSelectChannel(ch)}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        color: 'var(--color-one-text)',
                        background: 'rgba(244,243,238,0.1)',
                        border: '1px solid rgba(244,243,238,0.22)'
                      }
                    : {
                        color: 'var(--color-one-text-muted)',
                        background: 'rgba(244,243,238,0.03)',
                        border: '1px solid var(--color-one-border)'
                      }
                }
              >
                {isZh ? ch.zh : ch.en}
              </button>
            );
          })}
          <button
            onClick={() => fetchImages(PRESET_CHANNELS[0].query)}
            className="one-btn one-btn-sm one-btn-ghost"
            title={isZh ? '刷新' : 'Refresh'}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isZh ? '刷新' : 'Refresh'}</span>
          </button>
        </div>

        {/* States */}
        {loading && <GallerySkeleton />}

        {!loading && error && (
          <div
            className="one-surface flex items-start gap-3 px-5 py-4"
            style={{ borderColor: 'rgba(227,179,65,0.28)' }}
            role="status"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-one-warning)' }} />
            <div>
              <p className="text-sm text-[color:var(--color-one-text)]">{error}</p>
              <p className="mt-1 text-xs text-[color:var(--color-one-text-dim)]">
                {isZh ? '可切换频道、来源或更换关键词重试。' : 'Switch channel, source, or try another keyword.'}
              </p>
            </div>
          </div>
        )}

        {!loading && !error && images.length === 0 && (
          <div className="one-surface flex flex-col items-center justify-center px-6 py-16 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
            >
              <ImageOff className="h-7 w-7 text-[color:var(--color-one-text-dim)]" />
            </div>
            <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">
              {isZh ? '暂无影像结果' : 'No imagery yet'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-one-text-muted)]">
              {isZh ? '尝试搜索天体英文名或选择上方观测频道。' : 'Try a celestial keyword or pick a channel above.'}
            </p>
          </div>
        )}

        {/* Gallery */}
        {!loading && images.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {images.map((img, index) => (
              <article
                key={img.id}
                onClick={() => openLightbox(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(index);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={img.title}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2"
                style={{
                  borderColor: 'var(--color-one-border)',
                  background: 'rgba(14,19,27,0.55)',
                  focusRingColor: 'rgba(127,212,255,0.6)'
                } as React.CSSProperties}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: '#030508' }}>
                  <img
                    src={img.thumbnailUrl || img.url}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-one)] group-hover:scale-[1.03]"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images-assets.nasa.gov/image/PIA01518/PIA01518~thumb.jpg';
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80" />
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <SourceBadge source={img.source} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm"
                      style={{
                        borderColor: 'rgba(244,243,238,0.3)',
                        background: 'rgba(5,7,11,0.45)',
                        color: 'var(--color-one-text)'
                      }}
                    >
                      <Eye className="h-5 w-5" />
                    </span>
                  </div>
                  {img.date && (
                    <span
                      className="absolute bottom-2.5 right-2.5 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                      style={{ background: 'rgba(5,7,11,0.65)', color: 'var(--color-one-text-muted)' }}
                    >
                      {img.date}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 p-4">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--color-one-text)]" title={img.title}>
                    {img.title}
                  </h3>
                  {img.description && (
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-[color:var(--color-one-text-dim)]">
                      {img.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-[color:var(--color-one-text-dim)]">
                    <span className="truncate">{img.author}</span>
                    <span style={{ color: 'var(--color-one-accent)' }}>{isZh ? '查看' : 'View'}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Immersive Lightbox */}
      {lightboxImage && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(3,5,8,0.96)', backdropFilter: 'blur(8px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.title}
          onTouchStart={onLightboxTouchStart}
          onTouchEnd={onLightboxTouchEnd}
        >
          {/* top bar */}
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <SourceBadge source={lightboxImage.source} />
              <h2 className="truncate text-sm font-medium text-[color:var(--color-one-text)] sm:text-base">
                {lightboxImage.title}
              </h2>
              <span className="hidden shrink-0 font-mono text-[11px] text-[color:var(--color-one-text-dim)] sm:inline">
                {lightboxIndex + 1} / {images.length}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={lightboxImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="one-btn one-btn-sm one-btn-secondary"
                title={isZh ? '下载/查看原图' : 'Open full image'}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isZh ? '原图' : 'Full'}</span>
              </a>
              {lightboxImage.sourceUrl && (
                <a
                  href={lightboxImage.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="one-btn one-btn-sm one-btn-ghost"
                  title={isZh ? '官方来源' : 'Source'}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button type="button" onClick={closeLightbox} className="one-btn one-btn-sm one-btn-ghost" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* image stage */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-3 sm:px-12 sm:py-6">
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrev();
                  }}
                  className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border p-2.5 transition hover:bg-[rgba(244,243,238,0.08)] sm:flex"
                  style={{ borderColor: 'var(--color-one-border)', background: 'rgba(5,7,11,0.5)', color: 'var(--color-one-text)' }}
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showNext();
                  }}
                  className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border p-2.5 transition hover:bg-[rgba(244,243,238,0.08)] sm:flex"
                  style={{ borderColor: 'var(--color-one-border)', background: 'rgba(5,7,11,0.5)', color: 'var(--color-one-text)' }}
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-h-full w-auto max-w-full select-none rounded-lg object-contain"
              style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
              draggable={false}
            />
          </div>

          {/* info footer */}
          <div
            className="border-t px-4 py-4 sm:px-6"
            style={{
              borderColor: 'var(--color-one-border)',
              background: 'rgba(14,19,27,0.7)',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
            }}
          >
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-one-text-muted)]">
                  <span>
                    {isZh ? '作者/来源' : 'Author'}: <span className="text-[color:var(--color-one-text)]">{lightboxImage.author}</span>
                  </span>
                  {lightboxImage.date && (
                    <span>
                      {isZh ? '日期' : 'Date'}: <span className="text-[color:var(--color-one-text)]">{lightboxImage.date}</span>
                    </span>
                  )}
                  <span className="sm:hidden font-mono text-[color:var(--color-one-text-dim)]">
                    {lightboxIndex + 1} / {images.length}
                  </span>
                </div>
                {lightboxImage.description && (
                  <p className="mt-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-[color:var(--color-one-text-dim)]">
                    {lightboxImage.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span
                  className="rounded-md border px-2 py-1 text-[10px]"
                  style={{ borderColor: 'var(--color-one-border)', color: 'var(--color-one-success)', background: 'rgba(76,195,138,0.08)' }}
                >
                  {lightboxImage.license}
                </span>
                {images.length > 1 && (
                  <div className="flex items-center gap-2 sm:hidden">
                    <button type="button" onClick={showPrev} className="one-btn one-btn-sm one-btn-secondary" aria-label="Previous">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={showNext} className="one-btn one-btn-sm one-btn-secondary" aria-label="Next">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="hidden text-[10px] text-[color:var(--color-one-text-dim)] sm:block">
                  {isZh ? '← → 切换 · Esc 关闭 · 左右滑动' : '← → navigate · Esc close · swipe'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function SourceBadge({ source }: { source: AstroImage['source'] }) {
  const tones: Record<AstroImage['source'], { color: string; bg: string; border: string }> = {
    NASA: { color: 'var(--color-one-accent)', bg: 'rgba(127,212,255,0.14)', border: 'rgba(127,212,255,0.28)' },
    'Wikimedia Commons': { color: 'var(--color-one-text)', bg: 'rgba(244,243,238,0.12)', border: 'rgba(244,243,238,0.22)' },
    'Met Museum': { color: 'var(--color-one-gold)', bg: 'rgba(215,182,118,0.14)', border: 'rgba(215,182,118,0.28)' }
  };
  const t = tones[source] || tones.NASA;
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm"
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
    >
      {source}
    </span>
  );
}

function GallerySkeleton() {
  const blocks = Array.from({ length: 8 });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {blocks.map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.45)' }}
        >
          <div className="aspect-[4/3] w-full animate-pulse" style={{ background: 'rgba(244,243,238,0.06)' }} />
          <div className="space-y-2 p-4">
            <div className="h-3.5 w-4/5 animate-pulse rounded" style={{ background: 'rgba(244,243,238,0.08)' }} />
            <div className="h-3 w-2/3 animate-pulse rounded" style={{ background: 'rgba(244,243,238,0.05)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
