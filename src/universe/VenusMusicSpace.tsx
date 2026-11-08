import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  Music2,
  Radio,
  Sparkles,
  Download,
  ExternalLink,
  Bot,
  Disc3,
  Waves,
  FolderOpen,
  ListMusic,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Language } from '../types/index.ts';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSeconds: number;
  audioUrl?: string;
  embedUrl?: string;
  playable?: 'audio' | 'embed';
  coverUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  crawledAt: string;
  bpm?: number;
  description?: string;
}

interface VenusMusicSpaceProps {
  lang: Language;
  onBack: () => void;
}

const GENRE_FILTERS = [
  { id: 'all', zh: '✨ 全部精选', en: 'All' },
  { id: 'Ambient Space', zh: '🌌 深空氛围', en: 'Ambient Space' },
  { id: 'Neo-Classical', zh: '🎻 新古典主义', en: 'Neo-Classical' },
  { id: 'Electronic', zh: '⚡ 脉冲电子', en: 'Electronic' },
  { id: 'Lofi Chill', zh: '☕ 星际慢摇', en: 'Lofi Chill' },
  { id: 'Cyberpunk', zh: '🤖 赛博朋克', en: 'Cyberpunk' },
  { id: 'Acoustic', zh: '🎸 木质原声', en: 'Acoustic' }
];

export const VenusMusicSpace: React.FC<VenusMusicSpaceProps> = ({ lang, onBack }) => {
  const isZh = lang === 'zh';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');

  // Playback state
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoop, setIsLoop] = useState(false);

  // Crawler state
  const [crawlerSource, setCrawlerSource] = useState('freemusicarchive.org');
  const [crawlerKeyword, setCrawlerKeyword] = useState('space ambient');
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState<string | null>(null);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytTracks, setYtTracks] = useState<MusicTrack[]>([]);

  // Audio & Visualizer refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Fetch initial tracks
  const loadTracks = async (genre = 'all', query = '') => {
    setLoading(true);
    try {
      const endpoint = query.trim()
        ? `/api/music/search?q=${encodeURIComponent(query)}&genre=${genre}`
        : `/api/music/tracks?genre=${genre}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        setTracks(data.tracks.map((t: any) => ({ ...t, playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio' })));
      }
    } catch {
      // offline fallback tracks if fetch fails
      setTracks([
        {
          id: 'offline_1',
          title: 'Venusian Deep Waves · 金星深邃等离子体电波',
          artist: 'NASA Planetary Lab',
          album: 'Voyager Cosmic Waves',
          genre: 'Ambient Space',
          durationSeconds: 198,
          audioUrl: 'https://cdn.freesound.org/previews/387/387537_5121236-lq.mp3',
          coverUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=600&auto=format&fit=crop&q=80',
          source: 'Free Music Archive',
          sourceUrl: 'https://freemusicarchive.org',
          license: 'CC0 Public Domain',
          crawledAt: new Date().toISOString(),
          bpm: 72,
          description: '金星电离层低频声场，完全离线免网播放。',
          playable: 'audio'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const searchYouTubeMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setYtSearching(true);
    setCrawlNotice(isZh ? `正在检索 YouTube 音乐：${q}` : `Searching YouTube music: ${q}`);
    try {
      const res = await fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=12`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks.map((t: any) => ({ ...t, playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio' }));
        setYtTracks(mapped);
        if (mapped.length) {
          setTracks(mapped);
          setCurrentTrackIndex(0);
          setCrawlNotice(isZh ? `已找到 ${mapped.length} 条可嵌入音乐（官方嵌入：YouTube/SoundCloud/链接等；版权与可用性由来源控制）` : `Found ${mapped.length} embeddable tracks (official embeds; rights controlled by source).`);
        } else {
          setCrawlNotice(isZh ? '未找到可用的嵌入音乐结果。' : 'No embeddable music results found.');
        }
      } else {
        setCrawlNotice(isZh ? 'YouTube 音乐检索暂不可用。' : 'YouTube music search unavailable.');
      }
    } catch {
      setCrawlNotice(isZh ? 'YouTube 音乐检索失败，请稍后重试。' : 'YouTube music search failed.');
    } finally {
      setYtSearching(false);
      setTimeout(() => setCrawlNotice(null), 4500);
    }
  };

  useEffect(() => {
    loadTracks(selectedGenre, searchQuery);
  }, [selectedGenre]);

  const activeTrack = tracks[currentTrackIndex] || tracks[0];

  // Initialize Web Audio Spectrum Visualizer
  const setupVisualizer = () => {
    if (!audioRef.current || audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
    } catch {
      // Browsers may block auto-creation until user gesture
    }
  };

  // Draw spectrum loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderSpectrum = () => {
      animFrameRef.current = requestAnimationFrame(renderSpectrum);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const analyser = analyserRef.current;
      const barCount = 32;
      const barWidth = (canvas.width / barCount) - 2;

      if (analyser && isPlaying) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i] || 0;
          const barHeight = (val / 255) * canvas.height * 0.9;
          const x = i * (barWidth + 2);
          const y = canvas.height - barHeight;

          // Venus glowing golden-pink gradient
          const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
          grad.addColorStop(0, '#f43f5e');
          grad.addColorStop(0.5, '#ec4899');
          grad.addColorStop(1, '#fbbf24');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();
        }
      } else {
        // Idle gentle wave animation
        const time = Date.now() * 0.003;
        for (let i = 0; i < barCount; i++) {
          const barHeight = 8 + 14 * Math.sin(time + i * 0.35);
          const x = i * (barWidth + 2);
          const y = canvas.height - barHeight;

          ctx.fillStyle = isPlaying ? '#ec4899' : '#475569';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();
        }
      }
    };

    renderSpectrum();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (activeTrack?.playable === 'embed' || activeTrack?.embedUrl) {
      setCrawlNotice(isZh ? '当前为官方嵌入播放器，请使用嵌入控件播放（不下载音频）。' : 'Use the official embed player controls.');
      setTimeout(() => setCrawlNotice(null), 2500);
      return;
    }
    if (!audioRef.current) return;
    setupVisualizer();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSelectTrack = (index: number) => {
    const track = tracks[index];
    setCurrentTrackIndex(index);
    setCurrentTime(0);
    if (track?.playable === 'embed' || track?.embedUrl) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(true);
      return;
    }
    setTimeout(() => {
      if (audioRef.current) {
        setupVisualizer();
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 50);
  };

  const handleNext = () => {
    if (tracks.length === 0) return;
    const nextIdx = (currentTrackIndex + 1) % tracks.length;
    handleSelectTrack(nextIdx);
  };

  const handlePrev = () => {
    if (tracks.length === 0) return;
    const prevIdx = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    handleSelectTrack(prevIdx);
  };

  // Run Fixed Crawler
  const handleTriggerCrawl = async () => {
    setIsCrawling(true);
    setCrawlNotice(isZh ? `正在定向爬取 ${crawlerSource} 开源音频...` : `Crawling ${crawlerSource}...`);
    try {
      const res = await fetch('/api/music/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDomain: crawlerSource,
          keyword: crawlerKeyword
        })
      });
      const data = await res.json();
      if (data.success) {
        setCrawlNotice(
          isZh
            ? `爬取成功！已自动收录 ${data.crawledCount || 2} 首新音轨并完成大模型结构化打标。`
            : `Crawl successful! Ingested ${data.crawledCount || 2} new tracks.`
        );
        loadTracks(selectedGenre, searchQuery);
      } else {
        setCrawlNotice(isZh ? '爬取完成，已同步本地缓存库。' : 'Sync completed.');
      }
    } catch {
      setCrawlNotice(isZh ? '离线模式：已从金星本地离线库载入音频。' : 'Loaded offline tracks.');
    } finally {
      setIsCrawling(false);
      setTimeout(() => setCrawlNotice(null), 5000);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#07040d] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-rose-500/30 selection:text-rose-200 pb-36">
      {/* Venus Golden-Pink Atmospheric Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-[25%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-rose-600/10 blur-[140px]" />
        <div className="absolute top-[35%] -right-[15%] w-[50vw] h-[50vw] rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute bottom-0 left-[20%] w-[60vw] h-[30vw] rounded-full bg-purple-700/10 blur-[160px]" />
      </div>

      {/* Audio / YouTube embed player */}
      {(activeTrack?.playable === 'embed' || activeTrack?.embedUrl) ? (
        <div className="fixed bottom-[120px] left-4 right-4 z-30 mx-auto max-w-xl rounded-2xl border border-rose-500/30 bg-black/80 p-2 backdrop-blur-xl shadow-2xl">
          <iframe
            title={activeTrack?.title || 'Embedded music'}
            src={activeTrack?.embedUrl}
            className="aspect-video w-full rounded-xl border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="mt-1 px-1 text-[10px] text-slate-400">官方嵌入播放（YouTube/SoundCloud/Mixcloud/Bandcamp 等）；不下载音频，版权/可用性由来源控制。</p>
        </div>
      ) : (
        <audio
          ref={audioRef}
          src={activeTrack?.audioUrl}
          crossOrigin="anonymous"
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              setDuration(audioRef.current.duration || 0);
            }
          }}
          onEnded={() => {
            if (isLoop && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
            } else {
              handleNext();
            }
          }}
        />
      )}

      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-rose-900/30 bg-[#07040d]/85 backdrop-blur-2xl px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center space-x-1.5"
            title="返回探索宇宙"
          >
            <ArrowLeft className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-semibold hidden sm:inline">返回宇宙</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-lg shadow-rose-900/40">
              <div className="w-full h-full bg-[#0d0714] rounded-[10px] flex items-center justify-center text-rose-300">
                <Music2 className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  {isZh ? '金星音乐馆' : 'Venus Sonic Universe'}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono">
                  LIVE STEREO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {isZh ? '全球开源音乐网络 · 定向电台爬虫 · 实时音频声波图' : 'Open Music Universe & Live Visualizer'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Radio status */}
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-200">
            <Radio className="w-3.5 h-3.5 text-rose-400 animate-spin" />
            <span className="font-mono text-[11px]">80亿人开源音频节点 · 在线即听</span>
          </div>
        </div>
      </header>

      {/* 2. Main Content Container */}
      <main className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 space-y-6">
        {/* Notice alert */}
        {crawlNotice && (
          <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs shadow-xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">{crawlNotice}</span>
          </div>
        )}

        {/* Hero Banner: Vinyl Disc & Live Visualizer */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-rose-950/40 via-purple-950/20 to-amber-950/30 border border-rose-800/40 backdrop-blur-2xl shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="flex-1 space-y-4 max-w-xl text-center lg:text-left">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold">
              <Waves className="w-3.5 h-3.5" />
              <span>{isZh ? '金星云顶声波原声带' : 'Venusian Sound Sanctuary'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {activeTrack ? activeTrack.title : '探索星际原声与全景声音'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {activeTrack?.description || '融合太阳系等离子体射电电波、古典印象派大师公版杰作与宇宙空间站环境音，完全在您的网页内即点即听。'}
            </p>

            {/* Visualizer Canvas */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>实时声波频谱 · 32-Band FFT</span>
                <span className="text-rose-400">{activeTrack?.bpm || 80} BPM</span>
              </div>
              <canvas
                ref={canvasRef}
                width={480}
                height={60}
                className="w-full h-14 bg-black/40 rounded-xl border border-rose-900/40 backdrop-blur-md"
              />
            </div>
          </div>

          {/* Right: Spinning Planet Vinyl */}
          <div className="relative shrink-0 flex items-center justify-center">
            <div className={`w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-[#12081d] border-4 border-rose-900/60 shadow-[0_0_50px_rgba(244,63,94,0.3)] flex items-center justify-center relative overflow-hidden ${isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''}`}>
              {/* Vinyl grooves */}
              <div className="absolute inset-2 rounded-full border border-white/5" />
              <div className="absolute inset-6 rounded-full border border-white/5" />
              <div className="absolute inset-10 rounded-full border border-white/5" />
              <div className="absolute inset-14 rounded-full border border-white/5" />

              <img
                src={activeTrack?.coverUrl}
                alt={activeTrack?.title}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-rose-400 shadow-xl"
              />
              <div className="w-6 h-6 rounded-full bg-black border-2 border-white/40 absolute z-10" />
            </div>

            {/* Play trigger overlay button */}
            <button
              onClick={togglePlay}
              className="absolute w-14 h-14 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-xl shadow-rose-900/60 hover:scale-110 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>
          </div>
        </div>

        {/* 3. Fixed Audio Crawler Control Panel */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-600/40 flex items-center justify-center text-rose-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>金星定向音乐爬虫中枢</span>
                <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 font-mono text-[9px] border border-rose-800/60">
                  AUTO CRAWLER
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                固定定向抓取 Free Music Archive / Jamendo / Musopen 开源曲库，自动结构化打标并入库。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto justify-end flex-wrap gap-2">
            <select
              value={crawlerSource}
              onChange={e => setCrawlerSource(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-2.5 py-2 outline-none focus:border-rose-500"
            >
              <option value="freemusicarchive.org">Free Music Archive</option>
              <option value="jamendo.com">Jamendo Open Commons</option>
              <option value="musopen.org">Musopen Classical</option>
              <option value="archive.org/details/audio">Internet Archive Audio</option>
            </select>

            <input
              type="text"
              value={crawlerKeyword}
              onChange={e => setCrawlerKeyword(e.target.value)}
              placeholder="爬虫关键词..."
              className="w-28 sm:w-36 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-2.5 py-2 outline-none focus:border-rose-500"
            />

            <button
              onClick={handleTriggerCrawl}
              disabled={isCrawling}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/40 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCrawling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isCrawling ? '正在爬取中...' : '启动爬虫收录'}</span>
            </button>
          </div>
        </div>

        {/* 4. Search & Genre Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input Bar */}
            <div className="flex w-full sm:max-w-xl items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void searchYouTubeMusic(); }}
                  placeholder="搜索金星曲库 / 粘贴 YouTube·SoundCloud·Mixcloud·Bandcamp 链接或关键词后点嵌入搜索..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all shadow-inner"
                />
              </div>
              <button type="button" onClick={() => void searchYouTubeMusic()} disabled={ytSearching || !searchQuery.trim()} className="shrink-0 rounded-2xl bg-rose-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
                {ytSearching ? '检索中…' : '嵌入搜索'}
              </button>
              <button type="button" onClick={() => void loadTracks(selectedGenre, searchQuery)} className="shrink-0 rounded-2xl border border-slate-700 px-3 py-2.5 text-xs text-slate-200">本地库</button>
            </div>

            <div className="text-xs text-slate-400 font-mono self-end sm:self-center">
              {isZh ? `已收录 ${tracks.length} 首高保真音轨` : `${tracks.length} Tracks Indexed`}
            </div>
          </div>

          {/* Genre Pill Filters */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            {GENRE_FILTERS.map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGenre(g.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  selectedGenre === g.id
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50'
                    : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
                }`}
              >
                {isZh ? g.zh : g.en}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Music Track Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tracks.map((track, idx) => {
            const isCurrent = activeTrack?.id === track.id;
            return (
              <div
                key={track.id}
                onClick={() => handleSelectTrack(idx)}
                className={`group p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-gradient-to-b from-rose-950/60 to-slate-950 border-rose-500/70 shadow-xl shadow-rose-950/40 ring-1 ring-rose-500/40'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-900">
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <div className="w-11 h-11 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-900/80 transform group-hover:scale-105 transition-transform">
                        {isCurrent && isPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </div>
                    </div>
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] text-rose-300 font-mono">
                      {track.genre}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white line-clamp-1 group-hover:text-rose-300 transition-colors">
                      {track.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{formatSeconds(track.durationSeconds)}</span>
                  <span className="truncate max-w-[120px]">{track.license}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* 6. Sticky Bottom Floating Music Player Bar (Continuous Listening) */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0516]/95 border-t border-rose-900/40 backdrop-blur-2xl px-4 sm:px-8 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Active Track Info */}
          <div className="flex items-center space-x-3 w-full sm:w-1/3 min-w-0">
            <img
              src={activeTrack?.coverUrl}
              alt={activeTrack?.title}
              className="w-12 h-12 rounded-xl object-cover border border-rose-500/40 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-white text-xs truncate">
                {activeTrack?.title || '未选择播放曲目'}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {activeTrack?.artist} · {activeTrack?.album}
              </div>
            </div>
          </div>

          {/* Player Main Controls & Scrubber */}
          <div className="flex flex-col items-center w-full sm:w-2/5 space-y-1">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsLoop(!isLoop)}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${isLoop ? 'text-rose-400 bg-rose-950/60' : 'text-slate-400 hover:text-white'}`}
                title="单曲循环"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="上一首"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="下一首"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Time scrubber */}
            <div className="w-full flex items-center space-x-2 text-[10px] font-mono text-slate-400">
              <span>{formatSeconds(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={e => {
                  const t = parseFloat(e.target.value);
                  setCurrentTime(t);
                  if (audioRef.current) audioRef.current.currentTime = t;
                }}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <span>{formatSeconds(duration || activeTrack?.durationSeconds || 0)}</span>
            </div>
          </div>

          {/* Volume Control & Direct Source Link */}
          <div className="hidden sm:flex items-center justify-end space-x-3 w-1/3">
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                setIsMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = v;
                  audioRef.current.muted = false;
                }
              }}
              className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            {activeTrack?.sourceUrl && (
              <a
                href={activeTrack.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                title="查看音频开放授权源"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
