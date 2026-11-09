import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  Sparkles,
  ExternalLink,
  Download,
  X,
  Maximize2,
  RefreshCw,
  Moon,
  Telescope,
  Camera,
  Layers,
  Compass,
  Eye,
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
  const [lightboxImage, setLightboxImage] = useState<AstroImage | null>(null);

  const fetchImages = useCallback(async (q: string, src = sourceFilter) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/search?q=${encodeURIComponent(q)}&limit=24&source=${src}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.images) && data.images.length > 0) {
        setImages(data.images);
      } else {
        setError(isZh ? '未检索到该关键词的开放天体照片，请尝试其他天体或英文名称（如 Mars / Orion）。' : 'No images found for this query.');
      }
    } catch {
      setError(isZh ? '图像开放接口连接超时，已保留本地精选图像。' : 'Image search timeout.');
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, isZh]);

  // 切换频道
  const handleSelectChannel = (ch: typeof PRESET_CHANNELS[number]) => {
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

  return (
    <div className="min-h-screen bg-[#030611] text-slate-100 selection:bg-sky-500/30 selection:text-sky-200">
      {/* Lunar Moon & Deep Space Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-[15%] left-[20%] w-[55vw] h-[55vw] rounded-full bg-slate-400/10 blur-[150px]" />
        <div className="absolute top-[40%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-sky-500/10 blur-[160px]" />
        <div className="absolute bottom-0 left-[10%] w-[50vw] h-[30vw] rounded-full bg-indigo-600/10 blur-[140px]" />
      </div>

      {/* Header Banner */}
      <header className="relative z-10 border-b border-slate-800/80 bg-gradient-to-b from-[#070b1a] to-[#030611] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <button
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isZh ? '返回太阳系' : 'Back to Solar System'}</span>
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-300 font-mono">
                  <Moon className="h-3.5 w-3.5 text-slate-200" />
                  <span>EARTH ONE · MOON OBSERVATORY</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-300">
                  <Telescope className="h-3.5 w-3.5 text-indigo-400" />
                  <span>NASA & 维基共享资源开放图像</span>
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                {isZh ? '🌙 月球 · 宇宙深空天文图库' : '🌙 Moon Space Observatory'}
              </h1>
              <p className="mt-2 text-xs sm:text-sm font-semibold tracking-[0.2em] text-sky-400/90 uppercase">
                ASTRONOMICAL IMAGERY & DEEP SPACE EXPLORATION
              </p>
              <p className="mt-3 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-300">
                {isZh
                  ? '月球是人类眺望宇宙的天然深空天文台。实时直连 NASA 官方宇宙图库、维基共享资源 (Wikimedia Commons) 亿级开放档案与大都会艺术博物馆公版星图，全网高保真天文真彩照片即搜即看。'
                  : 'The natural deep space observatory for humanity. Directly querying NASA open archives, Wikimedia Commons, and public-domain celestial collections.'}
              </p>
            </div>

            {/* Observatory Live Stats Indicator */}
            <div className="flex items-center gap-4 bg-slate-900/70 border border-slate-800 p-4 rounded-2xl shrink-0 backdrop-blur-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-sky-900/40">
                <Camera className="w-6 h-6 animate-pulse" />
              </div>
              <div className="text-xs">
                <div className="text-slate-400">开放影像资源节点</div>
                <div className="text-white font-bold text-sm font-mono mt-0.5">100,000,000+ 公版典藏</div>
                <div className="text-emerald-400 text-[10px] mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>NASA / Wikimedia API 直连中</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Observatory Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 space-y-6">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 shadow-xl focus-within:border-sky-500 transition-all">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isZh ? '搜索天体名、黑洞、火星全景、木星大红斑、詹姆斯·韦伯深空或星云...' : 'Search celestial bodies, black holes, Mars rover, JWST deep field...'}
              className="flex-1 bg-transparent text-sm sm:text-base text-slate-100 outline-none placeholder:text-slate-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-sky-900/40 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (isZh ? '检索中...' : 'Searching...') : isZh ? '探索图像' : 'Search'}
            </button>
          </div>

          {/* Source Filter Tags */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 font-medium">数据源:</span>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('all');
                  if (query.trim()) fetchImages(query, 'all');
                }}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  sourceFilter === 'all'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                ✨ 全部聚合来源
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('nasa');
                  if (query.trim()) fetchImages(query, 'nasa');
                }}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  sourceFilter === 'nasa'
                    ? 'bg-blue-500/20 text-blue-200 border border-blue-400/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                🚀 NASA 官方深空图像库
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('wikimedia');
                  if (query.trim()) fetchImages(query, 'wikimedia');
                }}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  sourceFilter === 'wikimedia'
                    ? 'bg-purple-500/20 text-purple-200 border border-purple-400/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                🌐 维基共享资源 (Wikimedia)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('met');
                  if (query.trim()) fetchImages(query, 'met');
                }}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  sourceFilter === 'met'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                🎨 大都会博物馆公版藏品
              </button>
            </div>

            <div className="text-slate-500 font-mono text-[11px]">
              高清无水印 · 公有领域 (Public Domain / CC0)
            </div>
          </div>
        </form>

        {/* Preset Category Channels */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_CHANNELS.map(ch => (
            <button
              key={ch.key}
              onClick={() => handleSelectChannel(ch)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeChannel === ch.key
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50 shadow-md shadow-sky-950'
                  : 'border border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white hover:border-slate-600'
              }`}
            >
              {isZh ? ch.zh : ch.en}
            </button>
          ))}
          <button
            onClick={() => fetchImages(PRESET_CHANNELS[0].query)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            title="刷新图库"
          >
            <RefreshCw className="h-3 w-3" />
            <span>刷新</span>
          </button>
        </div>

        {/* Loading & Error States */}
        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
            <div className="inline-block animate-spin mb-3">🌙</div>
            <div>{isZh ? '正在从 NASA 与维基共享媒体库抓取高清天体图像...' : 'Fetching high-resolution cosmic imagery...'}</div>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-amber-300">
            {error}
          </div>
        )}

        {/* Image Grid */}
        {!loading && images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {images.map(img => (
              <article
                key={img.id}
                onClick={() => setLightboxImage(img)}
                className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-sky-500/60 hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
              >
                <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                  <img
                    src={img.thumbnailUrl}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).src = 'https://images-assets.nasa.gov/image/PIA01518/PIA01518~thumb.jpg';
                    }}
                  />
                  {/* Source Badge */}
                  <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold shadow-md ${
                    img.source === 'NASA'
                      ? 'bg-blue-600 text-white'
                      : img.source === 'Wikimedia Commons'
                      ? 'bg-purple-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}>
                    {img.source}
                  </span>

                  {/* Hover Inspect Icon */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg transform group-hover:scale-105 transition-transform">
                      <Eye className="h-5 w-5" />
                    </span>
                  </div>

                  {img.date && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">
                      {img.date}
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col justify-between flex-1">
                  <div>
                    <h3 className="line-clamp-2 text-xs sm:text-sm font-bold text-white group-hover:text-sky-300 transition-colors" title={img.title}>
                      {img.title}
                    </h3>
                    {img.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
                        {img.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[160px]">{img.author}</span>
                    <span className="text-sky-400 font-medium">{isZh ? '查看原图' : 'View'}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Fullscreen High-Res Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl animate-in fade-in">
          <div className="relative w-full max-w-5xl flex flex-col max-h-[92vh] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  lightboxImage.source === 'NASA' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
                }`}>
                  {lightboxImage.source}
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white truncate">{lightboxImage.title}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightboxImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition-colors cursor-pointer"
                  title="下载或查看高清大图"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">下载大图</span>
                </a>
                {lightboxImage.sourceUrl && (
                  <a
                    href={lightboxImage.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">官方来源</span>
                  </a>
                )}
                <button
                  onClick={() => setLightboxImage(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                  title="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto bg-black flex items-center justify-center p-2 sm:p-4 min-h-[300px]">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>

            {/* Modal Info Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/80 text-xs text-slate-300 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-slate-400">
                  <span>拍摄/制作: <strong className="text-white">{lightboxImage.author}</strong></span>
                  {lightboxImage.date && <span>日期: <strong className="text-slate-200">{lightboxImage.date}</strong></span>}
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-emerald-400 border border-slate-700">
                  {lightboxImage.license}
                </span>
              </div>
              {lightboxImage.description && (
                <p className="text-slate-400 text-xs leading-relaxed max-h-20 overflow-y-auto">
                  {lightboxImage.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
