import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Disc3,
  ExternalLink,
  ListMusic,
  Loader2,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from 'lucide-react';
import { Language } from '../types/index.ts';
import type { MusicTrack } from '../types/music.ts';
import { useMusicPlayer } from '../music/useMusicPlayer.ts';

interface VenusMusicSpaceProps {
  lang: Language;
  onBack: () => void;
}

const GENRE_FILTERS = [
  { id: 'all', zh: '全部曲库', en: 'All' },
  { id: 'Neo-Classical', zh: '新古典', en: 'Neo-Classical' },
  { id: 'Ambient Space', zh: '氛围声景', en: 'Ambient' },
  { id: 'Lofi Chill', zh: 'Lo-Fi', en: 'Lo-Fi' },
  { id: 'Electronic', zh: '电子脉冲', en: 'Electronic' },
  { id: 'Cyberpunk', zh: '合成浪潮', en: 'Synthwave' },
  { id: 'Acoustic', zh: '原声吉他', en: 'Acoustic' },
  { id: 'bilibili_live', zh: 'B站音乐', en: 'Bilibili' },
  { id: 'youtube_music', zh: 'YouTube', en: 'YouTube' },
];

const DEFAULT_COVER = '/assets/music/ambient-space.jpg';

const OFFLINE_FALLBACK_TRACKS: MusicTrack[] = [
  {
    id: 'venus_track_01',
    title: 'Clair de Lune',
    artist: 'Claude Debussy (Public Domain)',
    album: 'Suite Bergamasque',
    genre: 'Neo-Classical',
    durationSeconds: 374,
    audioUrl: 'https://archive.org/download/ClairDeLunedebussy/2009-03-30-clairdelune.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/ClairDeLunedebussy',
    license: 'Public Domain',
    crawledAt: new Date().toISOString(),
    bpm: 68,
    description: '德彪西经典钢琴名曲《月光》。',
    playable: 'audio',
  },
  {
    id: 'venus_track_03',
    title: 'What Did I Miss',
    artist: 'Lee Rosevere',
    album: 'Promise',
    genre: 'Ambient Space',
    durationSeconds: 124,
    audioUrl:
      'https://archive.org/download/lee-rosevere-promise/Lee%20Rosevere%20-%20Promise%20-%2001%20-%20What%20did%20i%20miss.mp3',
    coverUrl: '/assets/music/ambient-space.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/lee-rosevere-promise',
    license: 'CC BY 4.0',
    crawledAt: new Date().toISOString(),
    bpm: 76,
    description: 'Lee Rosevere 温柔开阔的空间氛围声景。',
    playable: 'audio',
  },
];

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseMinutesDuration(str?: string): number {
  if (!str) return 210;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 210;
}

function normalizeServerTrack(t: any): MusicTrack {
  const hasEmbed = Boolean(t?.embedUrl || t?.playable === 'embed' || t?.playable === 'youtube-embed');
  const hasAudio = Boolean(t?.audioUrl);
  const coverUrl =
    typeof t?.coverUrl === 'string' && t.coverUrl.trim() && !t.coverUrl.includes('images.unsplash.com')
      ? t.coverUrl
      : DEFAULT_COVER;
  return {
    ...t,
    coverUrl,
    playable: hasEmbed ? 'embed' : hasAudio ? 'audio' : undefined,
  };
}

function isUrlOrBvidQuery(q: string): boolean {
  const s = q.trim();
  return /^https?:\/\//i.test(s) || /^BV[0-9A-Za-z]{8,14}$/i.test(s);
}

function handleCoverError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = '1';
  img.src = DEFAULT_COVER;
}

export const VenusMusicSpace: React.FC<VenusMusicSpaceProps> = ({ lang, onBack }) => {
  const isZh = lang === 'zh';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [view, setView] = useState<'discover' | 'queue'>('discover');

  const player = useMusicPlayer();
  const { state: p, currentTrack } = player;
  const isPlaying = p.isPlaying;
  const currentTime = p.positionSec;
  const duration = p.durationSec || currentTrack?.durationSeconds || 0;
  const volume = p.volume;
  const isMuted = p.muted;
  const isLoop = p.mode.repeat === 'one';
  const isShuffle = p.mode.shuffle;

  const [showEmbedStage, setShowEmbedStage] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  const showNotice = (msg: string, ms = 3200) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, ms);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      loadAbortRef.current?.abort();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const loadTracks = async (genre = 'all', query = '') => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    if (mountedRef.current) setLoading(true);
    try {
      const endpoint = query.trim()
        ? `/api/music/search?q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}`
        : `/api/music/tracks?genre=${encodeURIComponent(genre)}`;
      const res = await fetch(endpoint, { signal: controller.signal });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.tracks)) {
        const normalized = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => Boolean(t.audioUrl || t.embedUrl));
        setTracks(normalized);
      } else {
        setTracks([]);
      }
    } catch {
      if (!mountedRef.current) return;
      setTracks(OFFLINE_FALLBACK_TRACKS);
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
    }
  };

  const searchYouTubeMusic = async (queryOverride?: string, autoPlayFirst = false) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) {
      showNotice(isZh ? '请输入关键词或链接后再检索。' : 'Enter a keyword or URL first.');
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=16`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => Boolean(t.audioUrl || t.embedUrl));
        setTracks(mapped);
        if (mapped.length > 0) {
          if (autoPlayFirst || data.mode === 'embed-url') {
            player.playTrack(mapped[0], mapped, 0);
            setShowEmbedStage(true);
          }
          showNotice(isZh ? `已加载 ${mapped.length} 首曲目` : `Loaded ${mapped.length} tracks`, 2600);
        } else {
          showNotice(isZh ? '未找到可播放的结果，请更换关键词。' : 'No playable tracks found.');
        }
      } else {
        showNotice(isZh ? `检索失败：${data?.error || '服务暂不可用'}` : `Search failed: ${data?.error || 'unavailable'}`);
      }
    } catch {
      showNotice(isZh ? '网络异常，请稍后重试。' : 'Network error, please try again.');
    } finally {
      if (mountedRef.current) {
        setSearching(false);
        setLoading(false);
      }
    }
  };

  const searchBilibiliMusic = async (queryOverride?: string, autoPlayFirst = false) => {
    const rawQ = (queryOverride ?? searchQuery).trim();
    if (!rawQ) {
      showNotice(isZh ? '请输入关键词或 B站 BV 链接。' : 'Enter a keyword or Bilibili BV URL.');
      return;
    }
    if (isUrlOrBvidQuery(rawQ)) {
      await searchYouTubeMusic(rawQ, true);
      return;
    }
    const q = rawQ.includes('音乐') || rawQ.toLowerCase().includes('music') ? rawQ : `${rawQ} 音乐`;
    setSearching(true);
    try {
      const res = await fetch(`/api/bilibili/search?q=${encodeURIComponent(q)}&limit=16`);
      const data = await res.json();
      if (!mountedRef.current) return;
      const videos = Array.isArray(data.videos) ? data.videos : Array.isArray(data.results) ? data.results : [];
      if (data.success && videos.length > 0) {
        const mapped: MusicTrack[] = videos.map((bv: any) => ({
          id: `bili_${bv.bvid}`,
          title: bv.title || 'Bilibili Track',
          artist: bv.author || 'Bilibili',
          album: 'Bilibili',
          genre: 'B站音乐',
          durationSeconds: parseMinutesDuration(bv.duration),
          coverUrl: bv.pic || '/assets/music/electronic-pulse.jpg',
          embedUrl: `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1&danmaku=0`,
          playable: 'embed',
          source: 'Bilibili',
          sourceUrl: bv.arcurl || bv.sourceUrl || `https://www.bilibili.com/video/${bv.bvid}`,
          license: 'Bilibili official embed',
          crawledAt: new Date().toISOString(),
          bpm: 92,
          description: bv.description || '',
        }));
        setTracks(mapped);
        if (autoPlayFirst) {
          player.playTrack(mapped[0], mapped, 0);
          setShowEmbedStage(true);
        }
        showNotice(isZh ? `已加载 ${mapped.length} 条 B站音乐` : `Loaded ${mapped.length} Bilibili tracks`, 2600);
      } else {
        showNotice(isZh ? 'B站暂无匹配结果，请换个关键词试试。' : 'No Bilibili results found.');
      }
    } catch {
      showNotice(isZh ? 'B站检索出现网络异常。' : 'Bilibili search network error.');
    } finally {
      if (mountedRef.current) {
        setSearching(false);
        setLoading(false);
      }
    }
  };

  const searchDualMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) {
      void loadTracks(selectedGenre === 'bilibili_live' || selectedGenre === 'youtube_music' ? 'all' : selectedGenre, '');
      return;
    }

    if (isUrlOrBvidQuery(q)) {
      await searchYouTubeMusic(q, true);
      return;
    }

    setSearching(true);
    try {
      const [biliRes, ytRes] = await Promise.allSettled([
        fetch(`/api/bilibili/search?q=${encodeURIComponent(q + ' 音乐')}&limit=8`).then(r => r.json()),
        fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=10`).then(r => r.json()),
      ]);

      const merged: MusicTrack[] = [];
      let biliCount = 0;
      let ytCount = 0;

      if (ytRes.status === 'fulfilled' && ytRes.value.success && Array.isArray(ytRes.value.tracks)) {
        for (const t of ytRes.value.tracks) {
          const norm = normalizeServerTrack(t);
          if (norm.audioUrl || norm.embedUrl) merged.push(norm);
        }
        ytCount = merged.length;
      }

      if (biliRes.status === 'fulfilled' && biliRes.value.success && Array.isArray(biliRes.value.videos)) {
        for (const bv of biliRes.value.videos) {
          merged.push({
            id: `bili_${bv.bvid}`,
            title: bv.title || 'Bilibili Track',
            artist: bv.author || 'Bilibili',
            album: 'Bilibili',
            genre: 'B站音乐',
            durationSeconds: parseMinutesDuration(bv.duration),
            coverUrl: bv.pic || '/assets/music/electronic-pulse.jpg',
            embedUrl: `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1&danmaku=0`,
            playable: 'embed',
            source: 'Bilibili',
            sourceUrl: bv.arcurl || `https://www.bilibili.com/video/${bv.bvid}`,
            license: 'Bilibili official embed',
            crawledAt: new Date().toISOString(),
            bpm: 90,
            description: bv.description,
          });
        }
        biliCount = merged.length - ytCount;
      }

      if (merged.length > 0) {
        setTracks(merged);
        showNotice(
          isZh ? `找到 ${merged.length} 首（在线 ${ytCount} · B站 ${biliCount}）` : `Found ${merged.length} tracks`,
          3000
        );
      } else {
        await loadTracks('all', q);
      }
    } catch {
      showNotice(isZh ? '多源检索失败，已显示本地曲库。' : 'Search failed.');
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  };

  useEffect(() => {
    const q = searchQuery.trim();
    if (selectedGenre === 'bilibili_live') {
      void searchBilibiliMusic(q || '轻音乐 纯音乐', false);
    } else if (selectedGenre === 'youtube_music') {
      void searchYouTubeMusic(q || 'lofi chill beats', false);
    } else {
      void loadTracks(selectedGenre, q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre]);

  // Smooth slim audio spectrum visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bars = 36;
      const gap = 3;
      const w = (canvas.width - gap * (bars - 1)) / bars;
      const isDark = document.documentElement.classList.contains('dark');
      const analyser = player.getAudioAnalyser();

      let fftValues: Uint8Array<ArrayBuffer> | null = null;
      let hasFftSignal = false;
      if (analyser && isPlaying && currentTrack?.playback.kind === 'audio') {
        fftValues = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        analyser.getByteFrequencyData(fftValues);
        for (let k = 0; k < fftValues.length; k++) {
          if (fftValues[k] > 2) {
            hasFftSignal = true;
            break;
          }
        }
      }

      const now = Date.now() * 0.0044;
      const bpmFactor = Math.max(0.7, Math.min(1.6, ((currentTrack?.bpm || 90) / 90)));

      for (let i = 0; i < bars; i++) {
        let ratio: number;
        if (hasFftSignal && fftValues) {
          ratio = (fftValues[i] || 0) / 255;
        } else if (isPlaying) {
          const wave1 = Math.sin(now * bpmFactor + i * 0.42);
          const wave2 = Math.cos(now * 1.45 * bpmFactor - i * 0.27);
          const env = 0.62 + 0.38 * Math.sin((i / bars) * Math.PI);
          ratio = Math.max(0.14, Math.min(0.92, (0.46 + 0.24 * wave1 + 0.16 * wave2) * env));
        } else {
          ratio = 0.1 + 0.04 * Math.sin(i * 0.5);
        }

        const h = Math.max(3, ratio * canvas.height * 0.88);
        const x = i * (w + gap);
        const y = canvas.height - h;

        const g = ctx.createLinearGradient(0, y, 0, canvas.height);
        if (isPlaying) {
          g.addColorStop(0, isDark ? '#38bdf8' : '#0284c7');
          g.addColorStop(1, isDark ? 'rgba(56,189,248,0.16)' : 'rgba(2,132,199,0.14)');
        } else {
          g.addColorStop(0, isDark ? 'rgba(148,163,184,0.34)' : 'rgba(148,163,184,0.42)');
          g.addColorStop(1, isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.1)');
        }

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [2, 2, 0, 0]);
        ctx.fill();
      }
    };

    render();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, currentTrack, player]);

  const isEmbed =
    currentTrack?.playback?.kind === 'embed' ||
    Boolean(currentTrack?.playback?.embedUrl) ||
    Boolean((currentTrack as any)?.embedUrl);
  const rawEmbedSrc = (currentTrack as any)?.playback?.embedUrl || (currentTrack as any)?.embedUrl;
  const isYouTubeEmbed = Boolean(rawEmbedSrc && /youtube(-nocookie)?\.com\/embed\//i.test(rawEmbedSrc));

  const sendYouTubeCommand = (func: 'playVideo' | 'pauseVideo') => {
    const win = embedIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    } catch {}
  };

  const togglePlay = async () => {
    if (!currentTrack && tracks.length > 0) {
      handleSelectTrack(0);
      return;
    }
    if (!currentTrack) return;

    if (isEmbed) {
      setShowEmbedStage(true);
      if (isYouTubeEmbed) {
        sendYouTubeCommand(isPlaying ? 'pauseVideo' : 'playVideo');
      }
      player.togglePlay();
      return;
    }

    await player.resumeAudioContext();
    player.togglePlay();
  };

  const handleSelectTrack = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    setShowEmbedStage(true);
    player.playTrack(track, tracks, index);
    if (!(track.playable === 'embed' || track.embedUrl)) {
      void player.resumeAudioContext();
    }
  };

  const handleCloseMusic = () => {
    player.stopPlayback();
    onBack();
  };

  const queue = p.queue;

  return (
    <div className="w-full max-w-full bg-[var(--color-one-bg)] text-[var(--color-one-text)] transition-colors">
      <div className="mx-auto w-full max-w-[1320px] px-3 pb-6 pt-3 sm:px-6 md:px-8 md:pt-5">
        {/* Studio Header */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2.5 sm:mb-5 sm:gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloseMusic}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-2xs transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{isZh ? '关闭并返回' : 'Exit Music'}</span>
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                <Music2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <h1 className="text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-white sm:text-xl">
                  ONE MUSIC
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-slate-200/90 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => setView('discover')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                view === 'discover'
                  ? 'bg-sky-600 text-white shadow-2xs dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              {isZh ? '曲库精选' : 'Discover'}
            </button>
            <button
              onClick={() => setView('queue')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                view === 'queue'
                  ? 'bg-sky-600 text-white shadow-2xs dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <ListMusic className="h-3.5 w-3.5" />
              {isZh ? `队列 (${queue.length})` : `Queue (${queue.length})`}
            </button>
          </div>
        </header>

        {notice && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/90 px-3.5 py-2 text-xs text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-sky-600 dark:text-sky-300 p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Balanced 2-Column Studio Grid */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,400px)_minmax(0,1fr)]">
          {/* Left Sticky Now-Playing Deck */}
          <section className="w-full min-w-0 lg:sticky lg:top-20 rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-sm dark:border-white/12 dark:bg-[#162238]/95 sm:p-5 lg:p-6">
            {/* Unified Media Stage: smoothly shows EITHER 16:9 video embed OR crisp cover art (never duplicate stacked boxes) */}
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-md dark:border-white/10 dark:bg-slate-900">
              {isEmbed && rawEmbedSrc && showEmbedStage ? (
                <div className="aspect-video w-full bg-slate-950">
                  <iframe
                    ref={embedIframeRef}
                    key={currentTrack?.id || rawEmbedSrc}
                    title={currentTrack?.title || 'embed'}
                    src={rawEmbedSrc}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <div className="mx-auto aspect-square w-full max-w-[220px] sm:max-w-[280px] lg:max-w-none overflow-hidden">
                  {currentTrack?.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      onError={handleCoverError}
                      className={`h-full w-full object-cover transition duration-700 ${
                        isPlaying ? 'scale-[1.03]' : 'scale-100'
                      }`}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <Disc3 className={`h-12 w-12 ${isPlaying ? 'animate-spin' : ''}`} />
                      <span className="text-xs font-medium tracking-wider">ONE MUSIC</span>
                    </div>
                  )}
                </div>
              )}

              {isEmbed && rawEmbedSrc && (
                <button
                  onClick={() => setShowEmbedStage((s) => !s)}
                  className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition hover:bg-slate-900"
                >
                  {showEmbedStage ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  <span>{showEmbedStage ? (isZh ? '切回封面' : 'Cover') : (isZh ? '观看视频' : 'Video')}</span>
                </button>
              )}
            </div>

            {/* Track Metadata */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isPlaying ? 'animate-pulse bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 truncate">
                    {currentTrack?.source || (isZh ? '准备就绪' : 'Ready')}
                    {currentTrack?.genre ? ` · ${currentTrack.genre}` : ''}
                  </span>
                </div>
                {currentTrack?.sourceUrl && (
                  <a
                    href={currentTrack.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 shrink-0"
                    title={isZh ? '访问原页面' : 'Source'}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              <h2 className="mt-1.5 line-clamp-1 text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                {currentTrack?.title || (isZh ? '选择一首歌曲开始聆听' : 'Choose a track')}
              </h2>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {currentTrack?.artist || (isZh ? '从右侧曲库点击播放或全网搜歌' : 'Click any track from the list')}
                {currentTrack?.album ? ` · ${currentTrack.album}` : ''}
              </p>
            </div>

            {/* Slim Frameless Spectrum */}
            <div className="mt-3.5 w-full overflow-hidden">
              <canvas ref={canvasRef} width={360} height={34} className="block h-8 w-full max-w-full" />
            </div>

            {/* Progress Bar */}
            <div className="mt-2 flex items-center gap-2.5 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
              <span>{formatSeconds(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={Math.min(currentTime, duration || 100)}
                onChange={e => {
                  const t = parseFloat(e.target.value);
                  if (currentTrack?.playback?.kind === 'audio') player.seek(t);
                }}
                disabled={!(currentTrack?.playback?.kind === 'audio')}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white/15 dark:accent-sky-400"
              />
              <span>{formatSeconds(duration || currentTrack?.durationSeconds || 0)}</span>
            </div>

            {/* Centered Transport Controls */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => player.toggleShuffle()}
                title={isZh ? '随机播放' : 'Shuffle'}
                className={`rounded-full p-2 transition ${
                  isShuffle
                    ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8'
                }`}
              >
                <Shuffle className="h-4 w-4" />
              </button>

              <button
                onClick={() => player.playPrevious()}
                title={isZh ? '上一首' : 'Previous'}
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8"
              >
                <SkipBack className="h-4.5 w-4.5" />
              </button>

              <button
                onClick={() => void togglePlay()}
                title={isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-white shadow-md shadow-sky-600/25 transition hover:scale-105 hover:bg-sky-500 dark:bg-white dark:text-slate-900"
              >
                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
              </button>

              <button
                onClick={() => player.playNext()}
                title={isZh ? '下一首' : 'Next'}
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8"
              >
                <SkipForward className="h-4.5 w-4.5" />
              </button>

              <button
                onClick={() => player.setRepeatMode(isLoop ? 'off' : 'one')}
                title={isZh ? '单曲循环' : 'Repeat One'}
                className={`rounded-full p-2 transition ${
                  isLoop
                    ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8'
                }`}
              >
                <Repeat className="h-4 w-4" />
              </button>
            </div>

            {/* Volume Row */}
            <div className="mt-4 flex items-center justify-center gap-2 border-t border-slate-100 pt-3.5 dark:border-white/8">
              <button
                onClick={() => player.toggleMute()}
                title={isMuted ? (isZh ? '取消静音' : 'Unmute') : (isZh ? '静音' : 'Mute')}
                className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={e => player.setVolume(parseFloat(e.target.value))}
                className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 dark:bg-white/15 dark:accent-sky-400"
              />
            </div>

            {p.error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200">
                {p.error.message}
              </div>
            )}
          </section>

          {/* Right Airy Library & Tracklist */}
          <section className="w-full min-w-0 rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-sm dark:border-white/12 dark:bg-[#162238]/95 sm:p-5 lg:p-6">
            {view === 'discover' ? (
              <>
                {/* Search Bar + Quick Source Buttons */}
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void searchDualMusic();
                      }}
                      placeholder={
                        isZh
                          ? '搜索歌名、歌手，或粘贴 B站 BV / YouTube 链接…'
                          : 'Search songs, artists, or paste a Bilibili/YouTube link…'
                      }
                      className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/90 pl-10 pr-8 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:bg-white dark:border-white/12 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          void loadTracks(
                            selectedGenre === 'bilibili_live' || selectedGenre === 'youtube_music' ? 'all' : selectedGenre,
                            ''
                          );
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <button
                      onClick={() => void searchDualMusic()}
                      disabled={searching}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-sky-600 px-3.5 sm:px-4 text-xs font-semibold text-white shadow-2xs transition hover:bg-sky-500 disabled:opacity-45 dark:bg-white dark:text-slate-900"
                    >
                      {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      {isZh ? '搜全网' : 'Search'}
                    </button>
                    <button
                      onClick={() => void searchBilibiliMusic(undefined, false)}
                      disabled={searching || !searchQuery.trim()}
                      className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/12 dark:bg-white/5 dark:text-slate-200"
                    >
                      <Tv className="h-3.5 w-3.5 text-pink-500" />
                      B站
                    </button>
                    <button
                      onClick={() => void searchYouTubeMusic(undefined, false)}
                      disabled={searching || !searchQuery.trim()}
                      className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/12 dark:bg-white/5 dark:text-slate-200"
                    >
                      <Youtube className="h-3.5 w-3.5 text-red-500" />
                      YT
                    </button>
                  </div>
                </div>

                {/* Single Horizontal Scrollable Genre Strip */}
                <div className="mt-4 flex w-full max-w-full items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {GENRE_FILTERS.map(g => {
                    const active = selectedGenre === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGenre(g.id)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'bg-slate-900 text-white shadow-2xs dark:bg-sky-500 dark:text-white'
                            : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:bg-white/6 dark:text-slate-300 dark:hover:bg-white/12 dark:hover:text-white'
                        }`}
                      >
                        {isZh ? g.zh : g.en}
                      </button>
                    );
                  })}
                </div>

                {/* Hairline-Divided Airy Tracklist */}
                <div className="mt-4 max-h-[55vh] lg:max-h-[62vh] overflow-y-auto divide-y divide-slate-100 dark:divide-white/8 pr-1">
                  {loading || searching ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                      {isZh ? '正在载入音乐曲库…' : 'Loading music catalog…'}
                    </div>
                  ) : tracks.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '暂无匹配曲目，试试切换分类或全网搜歌。' : 'No tracks found.'}
                    </div>
                  ) : (
                    tracks.map((track, idx) => {
                      const isCurrent = currentTrack?.id === track.id;
                      const isTrackEmbed = Boolean(track.embedUrl || track.playable === 'embed');
                      return (
                        <button
                          key={track.id}
                          onClick={() => handleSelectTrack(idx)}
                          className={`group flex w-full items-center gap-3.5 rounded-xl px-2.5 py-2.5 text-left transition ${
                            isCurrent
                              ? 'bg-sky-50/90 dark:bg-sky-500/12'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                            {isCurrent ? (
                              isPlaying ? (
                                <Pause className="mx-auto h-3.5 w-3.5 text-sky-600 dark:text-sky-400 fill-current" />
                              ) : (
                                <Play className="mx-auto h-3.5 w-3.5 text-sky-600 dark:text-sky-400 fill-current" />
                              )
                            ) : (
                              String(idx + 1).padStart(2, '0')
                            )}
                          </span>

                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                            <img
                              src={track.coverUrl || DEFAULT_COVER}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={handleCoverError}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/35 text-white opacity-0 transition group-hover:opacity-100">
                              <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-semibold ${
                                isCurrent ? 'text-sky-700 dark:text-sky-300' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {track.title}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {track.artist}
                              {track.album ? ` · ${track.album}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`hidden sm:inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                isTrackEmbed
                                  ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              }`}
                            >
                              {isTrackEmbed ? (track.source || (isZh ? '视频' : 'Video')) : 'Hi-Res'}
                            </span>
                            <span className="w-11 text-right text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                              {track.durationSeconds ? formatSeconds(track.durationSeconds) : '--:--'}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/8">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isZh ? '播放队列' : 'Play Queue'} ({queue.length})
                  </h3>
                  {queue.length > 0 && (
                    <button
                      onClick={() => player.clearQueue()}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-red-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      {isZh ? '清空队列' : 'Clear'}
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-[62vh] divide-y divide-slate-100 overflow-y-auto dark:divide-white/8 pr-1">
                  {queue.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '播放队列为空，去曲库精选选一首歌吧。' : 'Queue is empty.'}
                    </div>
                  ) : (
                    queue.map((item, i) => {
                      const t = item.track;
                      const active = p.currentIndex === i;
                      return (
                        <button
                          key={item.queueId}
                          onClick={() => player.playTrack(t, queue.map(q => q.track), i)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                            active
                              ? 'bg-sky-50/90 dark:bg-sky-500/12'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <img
                            src={t.coverUrl || DEFAULT_COVER}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={handleCoverError}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-semibold ${
                                active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {t.title}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {t.artist}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
export default VenusMusicSpace;
