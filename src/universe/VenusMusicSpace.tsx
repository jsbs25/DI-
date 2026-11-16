import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Disc3,
  ExternalLink,
  ListMusic,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Language } from '../types/index.ts';
import type { MediaRegionMode, ResolvedRegion } from '../types/media.ts';
import type { MusicTrack } from '../types/music.ts';
import { useMusicPlayer } from '../music/useMusicPlayer.ts';
import {
  formatPlaybackTypeBadge,
  getConnectivitySnapshot,
  getEffectiveMediaRegion,
  getMediaRegionMode,
  probeClientMediaConnectivity,
  setMediaRegionMode,
  subscribeMediaScheduler,
} from '../services/media/scheduler.ts';
import type { VenusAgentAction } from '../utils/oneAgentController.ts';

interface VenusMusicSpaceProps {
  lang: Language;
  onBack: () => void;
  quickAction?: VenusAgentAction | null;
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
    artist: 'Claude Debussy',
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
  const resolvedPlayable =
    t?.playable === 'audio'
      ? 'audio'
      : t?.playable === 'embed' || t?.playable === 'youtube-embed'
        ? 'embed'
        : hasAudio
          ? 'audio'
          : hasEmbed
            ? 'embed'
            : undefined;
  return {
    ...t,
    coverUrl,
    playable: resolvedPlayable,
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

export const VenusMusicSpace: React.FC<VenusMusicSpaceProps> = ({ lang, onBack, quickAction }) => {
  const isZh = lang === 'zh';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngine, setSearchEngine] = useState<'all' | 'bilibili' | 'youtube'>('all');
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

  const [regionMode, setRegionModeState] = useState<MediaRegionMode>(() => getMediaRegionMode());
  const [effectiveRegion, setEffectiveRegion] = useState<ResolvedRegion>(() => getEffectiveMediaRegion());
  const [conn, setConn] = useState(() => getConnectivitySnapshot());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const handledQuickSeqRef = useRef<number>(0);
  const crawlOverrideRef = useRef<boolean>(false);

  const showNotice = (msg: string, ms = 3200) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, ms);
  };

  useEffect(() => {
    mountedRef.current = true;
    void probeClientMediaConnectivity();
    const unsub = subscribeMediaScheduler(() => {
      if (!mountedRef.current) return;
      setRegionModeState(getMediaRegionMode());
      setEffectiveRegion(getEffectiveMediaRegion());
      setConn(getConnectivitySnapshot());
    });
    return () => {
      mountedRef.current = false;
      unsub();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      loadAbortRef.current?.abort();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const loadTracks = async (genre = 'all', query = '', regionOverride?: ResolvedRegion) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    const activeRegion = regionOverride || effectiveRegion;
    if (mountedRef.current) setLoading(true);
    try {
      const endpoint = query.trim()
        ? `/api/media/search?mediaType=music&q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}&region=${activeRegion}`
        : `/api/music/tracks?genre=${encodeURIComponent(genre)}&region=${activeRegion}`;
      const res = await fetch(endpoint, { signal: controller.signal });
      const data = await res.json();
      if (!mountedRef.current || controller.signal.aborted) return;
      if (data.success && Array.isArray(data.tracks)) {
        const normalized = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => Boolean(t.audioUrl || t.embedUrl));
        setTracks(normalized);
      } else {
        setTracks([]);
      }
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return;
      setTracks(OFFLINE_FALLBACK_TRACKS);
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
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
      const res = await fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=16&region=${effectiveRegion}`);
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
          showNotice(isZh ? `已加载 ${mapped.length} 首曲目` : `Loaded ${mapped.length} tracks`, 2400);
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
          license: 'Bilibili',
          crawledAt: new Date().toISOString(),
          bpm: 92,
          description: bv.description || '',
        }));
        setTracks(mapped);
        if (autoPlayFirst) {
          player.playTrack(mapped[0], mapped, 0);
          setShowEmbedStage(true);
        }
        showNotice(isZh ? `已加载 ${mapped.length} 条 B站音乐` : `Loaded ${mapped.length} Bilibili tracks`, 2400);
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

  const executeUnifiedSearch = async () => {
    const q = searchQuery.trim();
    if (searchEngine === 'bilibili') {
      await searchBilibiliMusic(q || '轻音乐 纯音乐', false);
      return;
    }
    if (searchEngine === 'youtube') {
      await searchYouTubeMusic(q || 'lofi chill beats', false);
      return;
    }
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
      const res = await fetch(
        `/api/media/search?mediaType=music&q=${encodeURIComponent(q)}&genre=${encodeURIComponent(
          selectedGenre === 'bilibili_live' || selectedGenre === 'youtube_music' ? 'all' : selectedGenre
        )}&region=${effectiveRegion}&limit=20`
      );
      const data = await res.json();
      if (!mountedRef.current) return;

      if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
        const mapped = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => Boolean(t.audioUrl || t.embedUrl));
        setTracks(mapped);
        showNotice(isZh ? `已匹配 ${mapped.length} 首曲目` : `Found ${mapped.length} tracks`, 2600);
      } else {
        await loadTracks('all', q);
      }
    } catch {
      showNotice(isZh ? '多源检索失败，已显示本地曲库。' : 'Search failed.');
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  };

  // Run quickAction BEFORE loadTracks so crawlOverrideRef blocks initial catalog race cleanly
  useEffect(() => {
    if (!quickAction || quickAction.seq === handledQuickSeqRef.current) return;
    handledQuickSeqRef.current = quickAction.seq;
    crawlOverrideRef.current = true;
    loadAbortRef.current?.abort();

    const runAutoCrawlAndPlay = async () => {
      const kw = (quickAction.query || '').trim();
      setLoading(true);
      setSearching(true);
      if (kw) setSearchQuery(kw);
      showNotice(
        isZh
          ? kw
            ? `One. 正在自动检索「${kw}」并准备播放…`
            : 'One. 正在自动抓取歌曲并播放…'
          : 'One. is finding and playing a track for you…',
        4500
      );

      try {
        const [crawlRes, catalogRes] = await Promise.allSettled([
          fetch('/api/music/crawl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: kw || 'ambient space piano', query: kw || 'ambient space piano' }),
          }).then((r) => r.json()),
          fetch(
            kw
              ? `/api/media/search?mediaType=music&q=${encodeURIComponent(kw)}&region=${effectiveRegion}&limit=20`
              : `/api/music/tracks?genre=all&region=${effectiveRegion}`
          ).then((r) => r.json()),
        ]);

        const crawledRaw =
          crawlRes.status === 'fulfilled' && Array.isArray(crawlRes.value?.newTracks)
            ? crawlRes.value.newTracks
            : [];
        const catalogRaw =
          catalogRes.status === 'fulfilled' && Array.isArray(catalogRes.value?.tracks)
            ? catalogRes.value.tracks
            : [];

        const mergedRaw = [...catalogRaw, ...crawledRaw];
        const seen = new Set<string>();
        let combined: MusicTrack[] = mergedRaw
          .map(normalizeServerTrack)
          .filter((t) => {
            if (!t?.id || seen.has(t.id)) return false;
            seen.add(t.id);
            return Boolean(t.audioUrl || t.embedUrl);
          });

        if (combined.length === 0) {
          combined = OFFLINE_FALLBACK_TRACKS;
        }

        if (!mountedRef.current) return;
        setTracks(combined);

        const audioPreferred = combined.filter((t) => Boolean(t.audioUrl));
        const pool = audioPreferred.length > 0 ? audioPreferred : combined;
        const pickFromPool = kw
          ? pool[0]
          : pool[Math.floor(Math.random() * Math.min(pool.length, 6))];
        const chosenIdx = Math.max(
          0,
          combined.findIndex((t) => t.id === pickFromPool.id)
        );
        const chosen = combined[chosenIdx] || combined[0];

        setShowEmbedStage(true);
        player.unlockAudio();
        player.playTrack(chosen, combined, chosenIdx);
        void player.resumeAudioContext();
        showNotice(
          isZh
            ? `One. 正在播放：${chosen.title} · ${chosen.artist}`
            : `One. playing: ${chosen.title} · ${chosen.artist}`,
          4500
        );
      } catch {
        if (!mountedRef.current) return;
        setTracks(OFFLINE_FALLBACK_TRACKS);
        const fallback = OFFLINE_FALLBACK_TRACKS[0];
        player.unlockAudio();
        player.playTrack(fallback, OFFLINE_FALLBACK_TRACKS, 0);
        void player.resumeAudioContext();
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setSearching(false);
          crawlOverrideRef.current = false;
        }
      }
    };

    void runAutoCrawlAndPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAction]);

  useEffect(() => {
    if (crawlOverrideRef.current) return;
    const q = searchQuery.trim();
    if (selectedGenre === 'bilibili_live') {
      void searchBilibiliMusic(q || '轻音乐 纯音乐', false);
    } else if (selectedGenre === 'youtube_music') {
      void searchYouTubeMusic(q || 'lofi chill beats', false);
    } else {
      void loadTracks(selectedGenre, q, effectiveRegion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre, effectiveRegion]);

  // Smooth slim audio spectrum visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bars = 32;
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
      const bpmFactor = Math.max(0.7, Math.min(1.6, (currentTrack?.bpm || 90) / 90));

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
          ratio = 0.08 + 0.03 * Math.sin(i * 0.5);
        }

        const h = Math.max(2, ratio * canvas.height * 0.85);
        const x = i * (w + gap);
        const y = canvas.height - h;

        ctx.fillStyle = isPlaying
          ? isDark
            ? 'rgba(56, 189, 248, 0.72)'
            : 'rgba(2, 132, 199, 0.72)'
          : isDark
            ? 'rgba(148, 163, 184, 0.25)'
            : 'rgba(148, 163, 184, 0.32)';
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

    player.unlockAudio();
    await player.resumeAudioContext();
    player.togglePlay();
  };

  const handleSelectTrack = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    setShowEmbedStage(true);
    player.unlockAudio();
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
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-4 sm:px-6 md:px-8">
        {/* Clean 3-Zone Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-white/10">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={handleCloseMusic}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{isZh ? '退出' : 'Exit'}</span>
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              ONE Music
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Segmented View Toggle */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 dark:bg-white/6">
              <button
                type="button"
                onClick={() => setView('discover')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                  view === 'discover'
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/14 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {isZh ? '曲库' : 'Library'}
              </button>
              <button
                type="button"
                onClick={() => setView('queue')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap tabular-nums ${
                  view === 'queue'
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/14 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <ListMusic className="h-3.5 w-3.5" />
                <span>{isZh ? `队列 ${queue.length}` : `Queue ${queue.length}`}</span>
              </button>
            </div>

            {/* Clean Single-Row Region Mode Switch */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] dark:border-white/12 dark:bg-white/5">
              {(
                [
                  { id: 'auto', zh: '自动', en: 'Auto' },
                  { id: 'cn', zh: 'CN', en: 'CN' },
                  { id: 'overseas', zh: '全球', en: 'Global' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMediaRegionMode(m.id);
                    setRegionModeState(m.id);
                    setEffectiveRegion(m.id === 'auto' ? conn.recommendedRegion : m.id);
                  }}
                  data-testid={`music-region-${m.id}`}
                  className={`rounded-md px-2.5 py-1 font-medium transition whitespace-nowrap ${
                    regionMode === m.id
                      ? 'bg-sky-600 text-white dark:bg-sky-500'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {isZh ? m.zh : m.en}
                </button>
              ))}
            </div>
          </div>
        </header>

        {notice && (
          <div className="mb-5 flex items-center justify-between gap-2 rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-2.5 text-xs text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100">
            <span className="truncate">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Balanced 2-Column Editorial Listening Room */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
          {/* Left Sticky Calm Player Deck */}
          <section className="w-full min-w-0 lg:sticky lg:top-20 rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-white/12 dark:bg-[#162238] sm:p-6">
            {/* Media Stage */}
            <div className="relative w-full overflow-hidden rounded-xl border border-slate-200/70 bg-slate-100 dark:border-white/10 dark:bg-slate-900">
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
                <div className="mx-auto aspect-square w-full max-w-[240px] lg:max-w-none overflow-hidden">
                  {currentTrack?.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      onError={handleCoverError}
                      className={`h-full w-full object-cover transition duration-700 ${
                        isPlaying ? 'scale-[1.02]' : 'scale-100'
                      }`}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <Disc3 className={`h-11 w-11 ${isPlaying ? 'animate-spin' : ''}`} />
                      <span className="text-xs font-medium tracking-wider">ONE MUSIC</span>
                    </div>
                  )}
                </div>
              )}

              {isEmbed && rawEmbedSrc && (
                <button
                  type="button"
                  onClick={() => setShowEmbedStage((s) => !s)}
                  className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition hover:bg-slate-900"
                >
                  {showEmbedStage ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  <span>{showEmbedStage ? (isZh ? '切回封面' : 'Cover') : (isZh ? '观看视频' : 'Video')}</span>
                </button>
              )}
            </div>

            {/* Unboxed Clean Track Metadata */}
            <div className="mt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                    {currentTrack?.title || (isZh ? '选择一首歌曲' : 'Select a track')}
                  </h2>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    <span>{currentTrack?.artist || (isZh ? '从右侧曲库点击播放' : 'Pick from the library')}</span>
                    {(currentTrack?.playback.sourceLabel || currentTrack?.source) && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{currentTrack.playback.sourceLabel || currentTrack.source}</span>
                      </>
                    )}
                    {currentTrack?.playback.playbackType && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{formatPlaybackTypeBadge(currentTrack.playback.playbackType, isZh).label}</span>
                      </>
                    )}
                  </p>
                </div>
                {currentTrack?.sourceUrl && (
                  <a
                    href={currentTrack.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 shrink-0"
                    title={isZh ? '访问原页面' : 'Open source'}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>

              {/* Understated Source Switch Line (only shown if alternatives exist) */}
              {currentTrack && currentTrack.sources.filter((s) => s.kind !== 'none').length > 1 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400" data-testid="music-source-switcher">
                  <span>{isZh ? '音源:' : 'Source:'}</span>
                  {currentTrack.sources
                    .filter((s) => s.kind !== 'none')
                    .map((src, idx) => {
                      const activeSrc = p.activeSourceId === src.id || (!p.activeSourceId && idx === 0);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => player.switchSource(src.id)}
                          data-testid={`music-source-btn-${src.provider || src.id}`}
                          className={`transition ${
                            activeSrc
                              ? 'font-semibold text-sky-600 dark:text-sky-400 underline underline-offset-4'
                              : 'hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {src.label}
                        </button>
                      );
                    })}
                  <button
                    type="button"
                    onClick={() => {
                      const ok = player.tryFallbackSource(isZh ? '手动切换备用音源' : 'Manual fallback');
                      if (!ok) {
                        showNotice(isZh ? '已无其他备用源，请点击右上角外链打开原平台。' : 'No more backup sources.');
                      }
                    }}
                    data-testid="music-fallback-btn"
                    className="ml-auto inline-flex items-center gap-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{isZh ? '备用' : 'Backup'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Minimal Spectrum */}
            <div className="mt-4 w-full overflow-hidden">
              <canvas ref={canvasRef} width={360} height={28} className="block h-7 w-full max-w-full" />
            </div>

            {/* Scrubber */}
            <div className="mt-2 flex items-center gap-2.5 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
              <span>{formatSeconds(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (currentTrack?.playback?.kind === 'audio') player.seek(t);
                }}
                disabled={!(currentTrack?.playback?.kind === 'audio')}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white/15 dark:accent-sky-400"
              />
              <span>{formatSeconds(duration || currentTrack?.durationSeconds || 0)}</span>
            </div>

            {/* Clean Transport Controls + Inline Volume */}
            <div className="mt-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => player.toggleMute()}
                  title={isMuted ? (isZh ? '取消静音' : 'Unmute') : (isZh ? '静音' : 'Mute')}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                  className="hidden sm:block h-1 w-16 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 dark:bg-white/15 dark:accent-sky-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => player.toggleShuffle()}
                  title={isZh ? '随机播放' : 'Shuffle'}
                  className={`rounded-lg p-2 transition ${
                    isShuffle
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Shuffle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => player.playPrevious()}
                  title={isZh ? '上一首' : 'Previous'}
                  className="rounded-lg p-2 text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  <SkipBack className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  title={isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-white transition hover:bg-sky-500 dark:bg-white dark:text-slate-900"
                >
                  {isPlaying ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={() => player.playNext()}
                  title={isZh ? '下一首' : 'Next'}
                  className="rounded-lg p-2 text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  <SkipForward className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => player.setRepeatMode(isLoop ? 'off' : 'one')}
                  title={isZh ? '单曲循环' : 'Repeat One'}
                  className={`rounded-lg p-2 transition ${
                    isLoop
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              </div>
            </div>

            {p.fallbackNotice && (
              <div
                data-testid="music-fallback-notice"
                className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/12 dark:text-amber-200"
              >
                <span>{p.fallbackNotice}</span>
                <button type="button" onClick={() => player.clearFallbackNotice()} className="shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {p.error && (
              <div
                data-testid="music-error-banner"
                className="mt-4 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/12 dark:text-red-200"
              >
                <div>{p.error.message}</div>
                {currentTrack?.sourceUrl && (
                  <a
                    href={currentTrack.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-medium underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {isZh ? '前往原平台收听' : 'Open on Original Platform'}
                  </a>
                )}
              </div>
            )}
          </section>

          {/* Right Clean Library / Queue */}
          <section className="w-full min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 dark:border-white/12 dark:bg-[#162238] sm:p-6">
            {view === 'discover' ? (
              <>
                {/* Unified Single-Row Search Bar */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void executeUnifiedSearch();
                      }}
                      placeholder={
                        isZh
                          ? '搜索歌名、歌手，或粘贴 B站 BV / YouTube 链接…'
                          : 'Search tracks, artists, or paste Bilibili/YouTube URL…'
                      }
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-8 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:bg-white dark:border-white/12 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400"
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

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label={isZh ? '检索源' : 'Source'}
                      value={searchEngine}
                      onChange={(e) => setSearchEngine(e.target.value as 'all' | 'bilibili' | 'youtube')}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none dark:border-white/12 dark:bg-white/6 dark:text-slate-200"
                    >
                      <option value="all">{isZh ? '全网曲库' : 'All Sources'}</option>
                      <option value="bilibili">B站</option>
                      <option value="youtube">YouTube</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void executeUnifiedSearch()}
                      disabled={searching}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-45 dark:bg-white dark:text-slate-900 whitespace-nowrap"
                    >
                      {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      <span>{isZh ? '搜索' : 'Search'}</span>
                    </button>
                  </div>
                </div>

                {/* Single-Row Clean Tab Genre Strip */}
                <div className="mt-4 flex w-full max-w-full items-center gap-1 overflow-x-auto border-b border-slate-200/80 pb-2 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {GENRE_FILTERS.map((g) => {
                    const active = selectedGenre === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGenre(g.id)}
                        className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'bg-slate-900 text-white dark:bg-sky-500/20 dark:text-sky-300'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white'
                        }`}
                      >
                        {isZh ? g.zh : g.en}
                      </button>
                    );
                  })}
                </div>

                {/* Clean Hairline-Divided Tracklist (No Pill Clutter) */}
                <div className="mt-2 max-h-[58vh] lg:max-h-[62vh] overflow-y-auto divide-y divide-slate-100 dark:divide-white/8 pr-1">
                  {loading || searching ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                      <span>{isZh ? '正在载入曲目…' : 'Loading tracks…'}</span>
                    </div>
                  ) : tracks.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '暂无匹配曲目，请尝试更换关键词。' : 'No tracks found.'}
                    </div>
                  ) : (
                    tracks.map((track, idx) => {
                      const isCurrent = currentTrack?.id === track.id;
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => handleSelectTrack(idx)}
                          className={`group flex w-full items-center gap-3.5 px-2 py-3 text-left transition ${
                            isCurrent
                              ? 'bg-sky-50/75 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.04]'
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
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-medium ${
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

                          <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                            <span className="hidden sm:inline">{track.source || (track.embedUrl ? 'Embed' : 'Audio')}</span>
                            <span className="w-11 text-right">
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                    {isZh ? `播放队列 (${queue.length})` : `Play Queue (${queue.length})`}
                  </h3>
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => player.clearQueue()}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isZh ? '清空队列' : 'Clear'}</span>
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-[62vh] divide-y divide-slate-100 overflow-y-auto dark:divide-white/8 pr-1">
                  {queue.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '播放队列为空，去曲库选一首歌吧。' : 'Queue is empty.'}
                    </div>
                  ) : (
                    queue.map((item, i) => {
                      const t = item.track;
                      const active = p.currentIndex === i;
                      return (
                        <button
                          key={item.queueId}
                          type="button"
                          onClick={() => player.playTrack(t, queue.map((q) => q.track), i)}
                          className={`flex w-full items-center gap-3.5 px-2 py-3 text-left transition ${
                            active
                              ? 'bg-sky-50/75 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.04]'
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
                              className={`truncate text-sm font-medium ${
                                active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {t.title}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{t.artist}</div>
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
