import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  ListMusic,
  Loader2,
  Maximize2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
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
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'bilibili_live', zh: 'B站音乐', en: 'Bilibili' },
  { id: 'youtube_music', zh: 'YouTube', en: 'YouTube' },
  { id: 'Ambient Space', zh: '氛围', en: 'Ambient' },
  { id: 'Neo-Classical', zh: '新古典', en: 'Neo-Classical' },
  { id: 'Electronic', zh: '电子', en: 'Electronic' },
  { id: 'Lofi Chill', zh: 'Lofi', en: 'Lofi' },
  { id: 'Cyberpunk', zh: '赛博', en: 'Cyberpunk' },
  { id: 'Acoustic', zh: '原声', en: 'Acoustic' },
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
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 210;
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
  const [showEmbedPlayer, setShowEmbedPlayer] = useState(true);

  const [crawlerSource, setCrawlerSource] = useState('bilibili.com');
  const [crawlerKeyword, setCrawlerKeyword] = useState('ambient music');
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState<string | null>(null);
  const [ytSearching, setYtSearching] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  const showNotice = (msg: string, ms = 4500) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setCrawlNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setCrawlNotice(null);
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
        ? `/api/music/search?q=${encodeURIComponent(query)}&genre=${genre}`
        : `/api/music/tracks?genre=${genre}`;
      const res = await fetch(endpoint, { signal: controller.signal });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.tracks)) {
        setTracks(
          data.tracks.map((t: any) => ({
            ...t,
            playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio',
          }))
        );
      }
    } catch {
      if (!mountedRef.current) return;
      setTracks([
        {
          id: 'offline_1',
          title: 'Venusian Deep Waves',
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
          description: 'Offline fallback ambient track.',
          playable: 'audio',
        } as MusicTrack,
      ]);
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
    }
  };

  const searchYouTubeMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) {
      showNotice(isZh ? '请输入关键词后再检索。' : 'Enter a keyword to search.');
      return;
    }
    setYtSearching(true);
    showNotice(isZh ? `正在检索 YouTube：${q}` : `Searching YouTube: ${q}`);
    try {
      const res = await fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=12`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks.map((t: any) => ({
          ...t,
          playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio',
        }));
        if (mapped.length) {
          setTracks(mapped);
          player.playTrack(mapped[0], mapped, 0);
          setShowEmbedPlayer(true);
          showNotice(isZh ? `YouTube：${mapped.length} 条结果` : `YouTube: ${mapped.length} results`, 4000);
        } else {
          showNotice(isZh ? 'YouTube 未返回可播放结果。' : 'No playable YouTube results.', 4500);
        }
      } else {
        showNotice(isZh ? `YouTube 检索失败：${data?.error || '服务不可用'}` : `YouTube search failed: ${data?.error || 'unavailable'}`);
      }
    } catch (e: any) {
      showNotice(isZh ? `YouTube 异常：${e?.message || '网络错误'}` : `YouTube error: ${e?.message || 'network error'}`);
    } finally {
      if (mountedRef.current) setYtSearching(false);
    }
  };

  const searchBilibiliMusic = async (queryOverride?: string) => {
    const rawQ = (queryOverride ?? searchQuery).trim();
    if (!rawQ) {
      showNotice(isZh ? '请输入关键词后再检索。' : 'Enter a keyword to search.');
      return;
    }
    const q = rawQ.includes('音乐') || rawQ.toLowerCase().includes('music') ? rawQ : `${rawQ} 音乐`;
    setYtSearching(true);
    showNotice(isZh ? `正在检索 B站：${q}` : `Searching Bilibili: ${q}`);
    try {
      const res = await fetch(`/api/bilibili/search?q=${encodeURIComponent(q)}&limit=14`);
      const data = await res.json();
      const videos = Array.isArray(data.videos) ? data.videos : Array.isArray(data.results) ? data.results : [];
      if (data.success && videos.length > 0) {
        const mapped: MusicTrack[] = videos.map((bv: any) => ({
          id: `bili_${bv.bvid}`,
          title: bv.title || 'Bilibili Track',
          artist: bv.author || 'Bilibili',
          album: 'Bilibili',
          genre: 'B站音乐',
          durationSeconds: parseMinutesDuration(bv.duration),
          coverUrl: bv.pic || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          embedUrl: bv.embedUrl || `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1`,
          playable: 'embed',
          source: 'Bilibili',
          sourceUrl: bv.arcurl || bv.sourceUrl || `https://www.bilibili.com/video/${bv.bvid}`,
          license: 'Bilibili embed',
          crawledAt: new Date().toISOString(),
          bpm: 86,
          description: bv.description || '',
        }));
        setTracks(mapped);
        player.playTrack(mapped[0], mapped, 0);
        setShowEmbedPlayer(true);
        showNotice(isZh ? `B站：${mapped.length} 条结果` : `Bilibili: ${mapped.length} results`, 4000);
      } else {
        showNotice(isZh ? `B站未返回结果：${data?.error || '请更换关键词'}` : `No Bilibili results: ${data?.error || 'try another keyword'}`);
      }
    } catch (e: any) {
      showNotice(isZh ? `B站异常：${e?.message || '网络错误'}` : `Bilibili error: ${e?.message || 'network error'}`);
    } finally {
      if (mountedRef.current) setYtSearching(false);
    }
  };

  const searchDualMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setYtSearching(true);
    showNotice(isZh ? `并发检索 B站与 YouTube：${q}` : `Searching Bilibili & YouTube: ${q}`);
    try {
      const [biliRes, ytRes] = await Promise.allSettled([
        fetch(`/api/bilibili/search?q=${encodeURIComponent(q + ' 音乐')}&limit=10`).then(r => r.json()),
        fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=10`).then(r => r.json()),
      ]);

      const merged: MusicTrack[] = [];
      let biliCount = 0;
      let ytCount = 0;
      const errs: string[] = [];

      if (biliRes.status === 'fulfilled' && biliRes.value.success && Array.isArray(biliRes.value.videos)) {
        for (const bv of biliRes.value.videos) {
          merged.push({
            id: `bili_${bv.bvid}`,
            title: bv.title || 'Bilibili Track',
            artist: bv.author || 'Bilibili',
            album: 'Bilibili',
            genre: 'B站音乐',
            durationSeconds: parseMinutesDuration(bv.duration),
            coverUrl: bv.pic || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
            embedUrl: bv.embedUrl || `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1`,
            playable: 'embed',
            source: 'Bilibili',
            sourceUrl: bv.arcurl || `https://www.bilibili.com/video/${bv.bvid}`,
            license: 'Bilibili embed',
            crawledAt: new Date().toISOString(),
            bpm: 88,
            description: bv.description,
          } as MusicTrack);
        }
        biliCount = merged.filter(m => m.source === 'Bilibili').length;
      } else {
        errs.push(isZh ? 'B站无结果' : 'Bilibili empty');
      }

      if (ytRes.status === 'fulfilled' && ytRes.value.success && Array.isArray(ytRes.value.tracks)) {
        for (const t of ytRes.value.tracks) {
          merged.push({
            ...t,
            playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio',
          });
        }
        ytCount = merged.filter(m => m.source !== 'Bilibili').length;
      } else {
        errs.push(isZh ? 'YouTube无结果' : 'YouTube empty');
      }

      if (merged.length > 0) {
        setTracks(merged);
        player.playTrack(merged[0], merged, 0);
        setShowEmbedPlayer(true);
        const failMsg = errs.length ? ` · ${errs.join(' / ')}` : '';
        showNotice(isZh ? `合并结果 ${merged.length}（B站 ${biliCount} / YouTube ${ytCount}）${failMsg}` : `Merged ${merged.length} (Bilibili ${biliCount} / YouTube ${ytCount})${failMsg}`, 6000);
      } else {
        showNotice(isZh ? `未返回结果：${errs.join(' / ')}` : `No results: ${errs.join(' / ')}`);
      }
    } catch {
      showNotice(isZh ? '并发检索失败。' : 'Dual search failed.');
    } finally {
      if (mountedRef.current) setYtSearching(false);
    }
  };

  useEffect(() => {
    if (selectedGenre === 'bilibili_live') {
      void searchBilibiliMusic('ambient music');
    } else if (selectedGenre === 'youtube_music') {
      void searchYouTubeMusic('ambient music');
    } else {
      void loadTracks(selectedGenre, searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre]);

  const activeTrack = currentTrack || (tracks[0] ? player.state.queue[player.state.currentIndex]?.track : null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const analyser = player.getAudioAnalyser();
      const bars = 28;
      const w = (canvas.width / bars) - 2;
      if (analyser && isPlaying && currentTrack?.playback.kind === 'audio') {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        for (let i = 0; i < bars; i++) {
          const v = arr[i] || 0;
          const h = (v / 255) * canvas.height * 0.9;
          const x = i * (w + 2);
          const y = canvas.height - h;
          const g = ctx.createLinearGradient(0, y, 0, canvas.height);
          g.addColorStop(0, '#7fd4ff');
          g.addColorStop(1, 'rgba(127,212,255,0.12)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, [3, 3, 0, 0]);
          ctx.fill();
        }
      } else {
        const t = Date.now() * 0.003;
        for (let i = 0; i < bars; i++) {
          const h = 6 + 10 * Math.sin(t + i * 0.4);
          const x = i * (w + 2);
          const y = canvas.height - h;
          ctx.fillStyle = isPlaying ? 'rgba(127,212,255,0.45)' : 'rgba(183,189,200,0.25)';
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, [2, 2, 0, 0]);
          ctx.fill();
        }
      }
    };
    render();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, currentTrack, player]);

  const togglePlay = async () => {
    const track = currentTrack || (tracks[0] as any);
    if (track && (track.playback?.kind === 'embed' || track.embedUrl || track.playable === 'embed')) {
      setShowEmbedPlayer(true);
      if (!currentTrack && tracks[0]) player.playTrack(tracks[0], tracks, 0);
      showNotice(isZh ? '嵌入来源请使用官方播放器控件。' : 'Use the embedded player controls.', 2500);
      return;
    }
    if (!currentTrack && tracks.length > 0) {
      player.playTrack(tracks[0], tracks, 0);
      await player.resumeAudioContext();
      return;
    }
    await player.resumeAudioContext();
    player.togglePlay();
  };

  const handleSelectTrack = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    setShowEmbedPlayer(true);
    player.playTrack(track, tracks, index);
    if (!(track.playable === 'embed' || track.embedUrl)) void player.resumeAudioContext();
  };

  const handleTriggerCrawl = async () => {
    if (crawlerSource === 'bilibili.com') {
      setIsCrawling(true);
      try { await searchBilibiliMusic(crawlerKeyword); } finally { if (mountedRef.current) setIsCrawling(false); }
      return;
    }
    if (crawlerSource === 'youtube.com/music') {
      setIsCrawling(true);
      try { await searchYouTubeMusic(crawlerKeyword); } finally { if (mountedRef.current) setIsCrawling(false); }
      return;
    }
    setIsCrawling(true);
    showNotice(isZh ? `正在抓取开放音频：${crawlerKeyword}` : `Harvesting open audio: ${crawlerKeyword}`);
    try {
      const res = await fetch('/api/music/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDomain: crawlerSource, keyword: crawlerKeyword }),
      });
      const data = await res.json();
      const saved = data.savedCount ?? data.crawledCount ?? 0;
      const errs = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
      if (data.success && saved > 0) {
        showNotice(isZh ? `已保存 ${saved} 条` : `Saved ${saved} tracks`);
        void loadTracks(selectedGenre, searchQuery);
      } else {
        showNotice(isZh ? `未保存：${errs[0] || data.error || data.message || '无结果'}` : `Saved 0: ${errs[0] || data.error || data.message || 'no results'}`);
      }
    } catch (e: any) {
      showNotice(isZh ? `抓取失败：${e?.message || '网络错误'}` : `Crawl failed: ${e?.message || 'network error'}`);
    } finally {
      if (mountedRef.current) setIsCrawling(false);
    }
  };

  const isEmbed = currentTrack?.playback?.kind === 'embed' || !!currentTrack?.playback?.embedUrl || !!(currentTrack as any)?.embedUrl;
  const embedSrc = (currentTrack as any)?.playback?.embedUrl || (currentTrack as any)?.embedUrl;

  const queue = p.queue;
  const headerTitle = isZh ? 'ONE MUSIC' : 'ONE MUSIC';

  return (
    <div className="min-h-[100dvh] bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <div className="mx-auto max-w-[1440px] px-4 pb-36 pt-4 sm:px-6 md:pl-[7rem] md:pr-8 md:pt-6 lg:px-10 lg:pl-[8rem]">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button onClick={onBack} className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--color-one-text-muted)] hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              <span>{isZh ? '返回 Spaces' : 'Back to Spaces'}</span>
            </button>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[var(--color-one-accent)]"><Music2 className="h-5 w-5" /></span>
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{headerTitle}</h1>
                <p className="text-sm text-[var(--color-one-text-muted)]">{isZh ? '发现、检索与连续播放 — 真实来源与可用状态清晰呈现。' : 'Discover, search, and play continuously — with real sources and clear availability.'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('discover')} className={`one-btn ${view === 'discover' ? 'one-btn-primary' : 'one-btn-secondary'} one-btn-sm`}><Radio className="h-3.5 w-3.5" />{isZh ? '发现' : 'Discover'}</button>
            <button onClick={() => setView('queue')} className={`one-btn ${view === 'queue' ? 'one-btn-primary' : 'one-btn-secondary'} one-btn-sm`}><ListMusic className="h-3.5 w-3.5" />{isZh ? '队列' : 'Queue'}</button>
          </div>
        </header>

        {crawlNotice && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[var(--color-one-text)]">
            <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--color-one-accent)]" />{crawlNotice}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="one-surface-subtle p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="relative h-44 w-44 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] sm:h-56 sm:w-56">
                {currentTrack?.coverUrl ? (
                  <img src={currentTrack.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--color-one-text-dim)]"><Music2 className="h-10 w-10" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-one-text-dim)]">{isZh ? '正在播放' : 'Now Playing'}</div>
                <h2 className="mt-2 line-clamp-2 text-2xl font-semibold tracking-[-0.02em] text-white">{currentTrack?.title || (isZh ? '选择一首音乐开始播放' : 'Select a track to begin')}</h2>
                <p className="mt-1 truncate text-sm text-[var(--color-one-text-muted)]">{currentTrack?.artist || '—'}{currentTrack?.album ? ` · ${currentTrack.album}` : ''}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-one-text-dim)]">
                  {currentTrack?.source && <span className="one-badge one-badge-neutral">{currentTrack.source}</span>}
                  {currentTrack && <span className="one-badge one-badge-accent">{currentTrack.playback.kind === 'embed' ? (isZh ? '嵌入播放' : 'Embed') : currentTrack.playback.kind === 'audio' ? (isZh ? '音频直链' : 'Audio') : (isZh ? '不可用' : 'Unavailable')}</span>}
                  {currentTrack?.license && <span className="truncate">{currentTrack.license}</span>}
                </div>

                <div className="mt-5">
                  <canvas ref={canvasRef} width={520} height={56} className="h-12 w-full rounded-xl border border-white/8 bg-black/20" />
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button onClick={() => player.playPrevious()} className="rounded-xl p-2.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white"><SkipBack className="h-4 w-4" /></button>
                  <button onClick={() => void togglePlay()} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0a0d12] hover:bg-[#f4f3ee]">
                    {isPlaying && !isEmbed ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  </button>
                  <button onClick={() => player.playNext()} className="rounded-xl p-2.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white"><SkipForward className="h-4 w-4" /></button>
                  <button onClick={() => player.setRepeatMode(isLoop ? 'off' : 'one')} className={`rounded-xl p-2.5 ${isLoop ? 'bg-white/5 text-[var(--color-one-accent)]' : 'text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white'}`}><Repeat className="h-4 w-4" /></button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => player.toggleMute()} className="rounded-xl p-2 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white">{isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
                    <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => player.setVolume(parseFloat(e.target.value))} className="h-1 w-24 cursor-pointer appearance-none rounded-lg bg-white/15 accent-[var(--color-one-accent)]" />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[11px] tabular-nums text-[var(--color-one-text-dim)]">
                  <span>{formatSeconds(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={Math.min(currentTime, duration || 100)}
                    onChange={e => { const t = parseFloat(e.target.value); if (currentTrack?.playback?.kind === 'audio') player.seek(t); }}
                    disabled={!(currentTrack?.playback?.kind === 'audio')}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-white/15 accent-[var(--color-one-accent)] disabled:opacity-40"
                  />
                  <span>{formatSeconds(duration || currentTrack?.durationSeconds || 0)}</span>
                </div>

                {p.error && <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{p.error.message}</div>}
              </div>
            </div>

            {isEmbed && embedSrc && showEmbedPlayer && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-[var(--color-one-text-muted)]">{isZh ? '官方嵌入播放器（播放控制由来源提供）' : 'Official embedded player (controls provided by source)'}</div>
                  <div className="flex items-center gap-1">
                    {currentTrack?.sourceUrl && <a href={currentTrack.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /></a>}
                    <button onClick={() => setShowEmbedPlayer(false)} className="rounded-lg p-1.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <iframe title={currentTrack?.title || 'embed'} src={embedSrc} className="aspect-video w-full rounded-xl border-0 bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            )}
            {isEmbed && embedSrc && !showEmbedPlayer && (
              <button onClick={() => setShowEmbedPlayer(true)} className="mt-4 one-btn one-btn-secondary one-btn-sm"><Maximize2 className="h-3.5 w-3.5" />{isZh ? '显示嵌入画面' : 'Show embed'}</button>
            )}
          </section>

          <section className="one-surface-subtle p-5 sm:p-6">
            {view === 'discover' ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">{isZh ? '发现与检索' : 'Discover & Search'}</h3>
                  <span className="text-xs text-[var(--color-one-text-dim)]">{isZh ? `${tracks.length} 条` : `${tracks.length} tracks`}</span>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void searchDualMusic(); }} placeholder={isZh ? '搜索音乐、艺术家或粘贴链接…' : 'Search music, artists, or paste a link…'} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-3 text-sm text-white placeholder:text-[var(--color-one-text-dim)] outline-none focus:border-white/20" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void searchDualMusic()} disabled={ytSearching || !searchQuery.trim()} className="one-btn one-btn-primary one-btn-sm disabled:opacity-40">{ytSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{isZh ? '多源' : 'Multi'}</button>
                    <button onClick={() => void searchBilibiliMusic()} disabled={ytSearching || !searchQuery.trim()} className="one-btn one-btn-secondary one-btn-sm disabled:opacity-40"><Tv className="h-3.5 w-3.5" />B站</button>
                    <button onClick={() => void searchYouTubeMusic()} disabled={ytSearching || !searchQuery.trim()} className="one-btn one-btn-secondary one-btn-sm disabled:opacity-40"><Youtube className="h-3.5 w-3.5" />YT</button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {GENRE_FILTERS.map(g => (
                    <button key={g.id} onClick={() => setSelectedGenre(g.id)} className={`rounded-full border px-3 py-1.5 text-xs transition ${selectedGenre === g.id ? 'border-[rgba(127,212,255,0.35)] bg-[rgba(127,212,255,0.12)] text-white' : 'border-white/10 bg-transparent text-[var(--color-one-text-muted)] hover:border-white/20 hover:text-white'}`}>
                      {isZh ? g.zh : g.en}
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-white">{isZh ? '开放来源收录 / 抓取' : 'Open-source harvest'}</span>
                    <select value={crawlerSource} onChange={e => setCrawlerSource(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0a0f17] px-2 text-xs text-white outline-none">
                      <option value="bilibili.com">bilibili.com</option>
                      <option value="youtube.com/music">youtube.com/music</option>
                      <option value="freemusicarchive.org">freemusicarchive.org</option>
                      <option value="jamendo.com">jamendo.com</option>
                      <option value="archive.org/details/audio">archive.org (audio)</option>
                    </select>
                    <input value={crawlerKeyword} onChange={e => setCrawlerKeyword(e.target.value)} className="h-9 min-w-[120px] flex-1 rounded-lg border border-white/10 bg-[#0a0f17] px-2 text-xs text-white outline-none" placeholder={isZh ? '关键词' : 'Keyword'} />
                    <button onClick={() => void handleTriggerCrawl()} disabled={isCrawling || ytSearching} className="one-btn one-btn-secondary one-btn-sm disabled:opacity-40">{isCrawling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}{isZh ? '执行' : 'Run'}</button>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--color-one-text-dim)]">{isZh ? '按来源能力执行检索或持久化收录；不可用/受限来源会返回明确状态，不伪造结果。' : 'Runs search or persistent harvest per source capability; unavailable/restricted sources return explicit status without fabricated results.'}</p>
                </div>

                <div className="mt-5 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                  {loading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-[var(--color-one-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" />{isZh ? '加载中…' : 'Loading…'}</div>
                  ) : tracks.length === 0 ? (
                    <div className="py-8 text-sm text-[var(--color-one-text-muted)]">{isZh ? '暂无结果。尝试搜索或切换来源。' : 'No results. Try searching or changing sources.'}</div>
                  ) : tracks.map((track, idx) => {
                    const isCurrent = currentTrack?.id === track.id;
                    return (
                      <button key={track.id} onClick={() => handleSelectTrack(idx)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${isCurrent ? 'border-[rgba(127,212,255,0.28)] bg-[rgba(127,212,255,0.08)]' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                          {track.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">{track.title}</div>
                          <div className="truncate text-xs text-[var(--color-one-text-muted)]">{track.artist}{track.source ? ` · ${track.source}` : ''}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] tabular-nums text-[var(--color-one-text-dim)]">{formatSeconds(track.durationSeconds || 0)}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-one-text-dim)]">{track.embedUrl || track.playable === 'embed' ? 'embed' : track.audioUrl ? 'audio' : 'n/a'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{isZh ? '播放队列' : 'Queue'}</h3>
                  <span className="text-xs text-[var(--color-one-text-dim)]">{queue.length}</span>
                </div>
                <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                  {queue.length === 0 ? (
                    <div className="py-8 text-sm text-[var(--color-one-text-muted)]">{isZh ? '队列为空。' : 'Queue is empty.'}</div>
                  ) : queue.map((item, i) => {
                    const t = item.track;
                    const active = p.currentIndex === i;
                    return (
                      <button key={item.queueId} onClick={() => player.playTrack(t, queue.map(q => q.track), i)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${active ? 'border-[rgba(127,212,255,0.28)] bg-[rgba(127,212,255,0.08)]' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/5">{t.coverUrl ? <img src={t.coverUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">{t.title}</div>
                          <div className="truncate text-xs text-[var(--color-one-text-muted)]">{t.artist}</div>
                        </div>
                        <div className="text-[10px] uppercase text-[var(--color-one-text-dim)]">{t.playback.kind}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
