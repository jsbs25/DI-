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
  Music2,
  Radio,
  Sparkles,
  ExternalLink,
  Bot,
  Waves,
  Loader2,
  Tv,
  Youtube,
  X,
  Maximize2
} from 'lucide-react';
import { Language } from '../types/index.ts';
import type { MusicTrack } from '../types/music.ts';
import { useMusicPlayer } from '../music/useMusicPlayer.ts';

interface VenusMusicSpaceProps {
  lang: Language;
  onBack: () => void;
}

const GENRE_FILTERS = [
  { id: 'all', zh: '✨ 全部精选', en: 'All' },
  { id: 'bilibili_live', zh: '📺 B站音乐 & 现场', en: 'Bilibili Music' },
  { id: 'youtube_music', zh: '▶️ YouTube 音乐', en: 'YouTube Music' },
  { id: 'Ambient Space', zh: '🌌 深空氛围', en: 'Ambient Space' },
  { id: 'Neo-Classical', zh: '🎻 新古典主义', en: 'Neo-Classical' },
  { id: 'Electronic', zh: '⚡ 脉冲电子', en: 'Electronic' },
  { id: 'Lofi Chill', zh: '☕ 星际慢摇', en: 'Lofi Chill' },
  { id: 'Cyberpunk', zh: '🤖 赛博朋克', en: 'Cyberpunk' },
  { id: 'Acoustic', zh: '🎸 木质原声', en: 'Acoustic' }
];

function parseMinutesDuration(str?: string): number {
  if (!str) return 210;
  const parts = str.split(':').map(Number);
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

  const player = useMusicPlayer();
  const { state: p, currentTrack } = player;
  const isPlaying = p.isPlaying;
  const currentTime = p.positionSec;
  const duration = p.durationSec || currentTrack?.durationSeconds || 0;
  const volume = p.volume;
  const isMuted = p.muted;
  const isLoop = p.mode.repeat === 'one';
  const [showEmbedPlayer, setShowEmbedPlayer] = useState(true);

  // Crawler state
  const [crawlerSource, setCrawlerSource] = useState('bilibili.com');
  const [crawlerKeyword, setCrawlerKeyword] = useState('宇宙 氛围 音乐');
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState<string | null>(null);
  const [ytSearching, setYtSearching] = useState(false);

  // Visualizer refs (audio engine is global singleton in PlayerProvider)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  const showNotice = (msg: string, ms = 4500) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setCrawlNotice(msg);
    noticeTimerRef.current = setTimeout(() => { if (mountedRef.current) setCrawlNotice(null); }, ms);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      loadAbortRef.current?.abort();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // IMPORTANT: do not pause/close global audio engine here (playback must survive tab/view changes)
    };
  }, []);

  // Fetch initial tracks
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
        setTracks(data.tracks.map((t: any) => ({
          ...t,
          playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio'
        })));
      }
    } catch {
      if (!mountedRef.current) return;
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
      clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
    }
  };

  // 1. YouTube 音乐检索
  const searchYouTubeMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) { showNotice(isZh ? '请输入关键词后再检索。' : 'Please enter a keyword.'); return; }
    setYtSearching(true);
    setCrawlNotice(isZh ? `正在抓取 YouTube 开放音乐：${q}...` : `Crawling YouTube music: ${q}...`);
    try {
      const res = await fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=12`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks.map((t: any) => ({
          ...t,
          playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio'
        }));
        if (mapped.length) {
          setTracks(mapped);
          player.playTrack(mapped[0], mapped, 0);
          setShowEmbedPlayer(true);
          setCrawlNotice(isZh ? `YouTube 抓取完成：获取 ${mapped.length} 条可播放结果。` : `YouTube crawl done: ${mapped.length} playable results.`);
        } else {
          setCrawlNotice(isZh ? 'YouTube 抓取完成：未找到结果（可能受限或无匹配），请更换关键词。' : 'YouTube crawl finished: no results. Try another keyword.');
        }
      } else {
        setCrawlNotice(isZh ? `YouTube 检索失败：${data?.error || '服务暂不可用'}` : `YouTube search failed: ${data?.error || 'unavailable'}`);
      }
    } catch (e: any) {
      setCrawlNotice(isZh ? `YouTube 检索异常：${e?.message || '网络/超时'}` : `YouTube search error: ${e?.message || 'network/timeout'}`);
    } finally {
      if (mountedRef.current) setYtSearching(false);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => { if (mountedRef.current) setCrawlNotice(null); }, 6000);
    }
  };

  // 2. B站 音乐爬虫检索
  const searchBilibiliMusic = async (queryOverride?: string) => {
    const rawQ = (queryOverride ?? searchQuery).trim();
    if (!rawQ) { showNotice(isZh ? '请输入关键词后再检索。' : 'Please enter a keyword.'); return; }
    const q = rawQ.includes('音乐') || rawQ.includes('现场') || rawQ.includes('MV') ? rawQ : `${rawQ} 音乐现场`;
    setYtSearching(true);
    setCrawlNotice(isZh ? `正在爬取 B站 (Bilibili)：${q}...` : `Crawling Bilibili: ${q}...`);
    try {
      const res = await fetch(`/api/bilibili/search?q=${encodeURIComponent(q)}&limit=14`);
      const data = await res.json();
      const videos = Array.isArray(data.videos) ? data.videos : (Array.isArray(data.results) ? data.results : []);
      if (data.success && videos.length > 0) {
        const mapped: MusicTrack[] = videos.map((bv: any) => ({
          id: `bili_${bv.bvid}`,
          title: bv.title || 'Bilibili Music Track',
          artist: bv.author || 'B站UP主',
          album: 'Bilibili 音乐现场',
          genre: 'B站音乐',
          durationSeconds: parseMinutesDuration(bv.duration),
          coverUrl: bv.pic || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          embedUrl: bv.embedUrl || `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1`,
          playable: 'embed',
          source: 'Bilibili',
          sourceUrl: bv.arcurl || bv.sourceUrl || `https://www.bilibili.com/video/${bv.bvid}`,
          license: 'Bilibili 官方嵌入流',
          crawledAt: new Date().toISOString(),
          bpm: 86,
          description: bv.description || '来自哔哩哔哩开放平台的原声音乐与现场音频流。'
        }));
        setTracks(mapped);
        player.playTrack(mapped[0], mapped, 0);
        setShowEmbedPlayer(true);
        setCrawlNotice(isZh ? `B站爬取完成：获取 ${mapped.length} 条可播放结果。` : `Bilibili crawl done: ${mapped.length} results.`);
      } else {
        setCrawlNotice(isZh ? `B站爬取完成：未返回结果（${data?.error || '可能受地域/反爬限制'}），请更换关键词或稍后重试。` : `Bilibili finished: no results (${data?.error || 'restricted/unavailable'}).`);
      }
    } catch (e: any) {
      setCrawlNotice(isZh ? `B站爬虫异常：${e?.message || '网络/超时'}` : `Bilibili crawl error: ${e?.message || 'network/timeout'}`);
    } finally {
      if (mountedRef.current) setYtSearching(false);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => { if (mountedRef.current) setCrawlNotice(null); }, 6000);
    }
  };

  // 3. 双端合并爬取
  const searchDualMusic = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setYtSearching(true);
    setCrawlNotice(isZh ? `正在并发爬取 B站与 YouTube 音乐：${q}...` : `Crawling both Bilibili & YouTube for: ${q}...`);
    try {
      const [biliRes, ytRes] = await Promise.allSettled([
        fetch(`/api/bilibili/search?q=${encodeURIComponent(q + ' 音乐')}&limit=10`).then(r => r.json()),
        fetch(`/api/music/youtube-search?q=${encodeURIComponent(q)}&limit=10`).then(r => r.json())
      ]);

      const merged: MusicTrack[] = [];
      let biliCount = 0;
      let ytCount = 0;
      const errs: string[] = [];

      // Bilibili tracks
      if (biliRes.status === 'fulfilled' && biliRes.value.success && Array.isArray(biliRes.value.videos)) {
        for (const bv of biliRes.value.videos) {
          merged.push({
            id: `bili_${bv.bvid}`,
            title: bv.title || 'Bilibili Music Track',
            artist: bv.author || 'B站UP主',
            album: 'Bilibili 音乐现场',
            genre: 'B站音乐',
            durationSeconds: parseMinutesDuration(bv.duration),
            coverUrl: bv.pic || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
            embedUrl: bv.embedUrl || `https://player.bilibili.com/player.html?bvid=${bv.bvid}&page=1&autoplay=1`,
            playable: 'embed',
            source: 'Bilibili',
            sourceUrl: bv.arcurl || `https://www.bilibili.com/video/${bv.bvid}`,
            license: 'Bilibili 官方嵌入',
            crawledAt: new Date().toISOString(),
            bpm: 88,
            description: bv.description
          });
        }
        biliCount = merged.filter(m => m.source === 'Bilibili').length;
      } else {
        errs.push(isZh ? 'B站未返回结果或请求失败' : 'Bilibili failed or empty');
      }

      // YouTube tracks
      if (ytRes.status === 'fulfilled' && ytRes.value.success && Array.isArray(ytRes.value.tracks)) {
        for (const t of ytRes.value.tracks) {
          merged.push({
            ...t,
            playable: t.playable === 'embed' || t.playable === 'youtube-embed' || t.embedUrl ? 'embed' : 'audio'
          });
        }
        ytCount = merged.filter(m => m.source !== 'Bilibili').length;
      } else {
        errs.push(isZh ? 'YouTube 未返回结果或请求失败' : 'YouTube failed or empty');
      }

      if (merged.length > 0) {
        setTracks(merged);
        player.playTrack(merged[0], merged, 0);
        setShowEmbedPlayer(true);
        const failMsg = errs.length ? `；失败: ${errs.join('；')}` : '';
        setCrawlNotice(isZh ? `双端爬取完成：B站 ${biliCount} 首，YouTube ${ytCount} 首，共 ${merged.length} 首${failMsg}` : `Dual crawl done: Bilibili ${biliCount}, YouTube ${ytCount}, total ${merged.length}${failMsg ? `; ${errs.join('; ')}` : ''}`);
      } else {
        setCrawlNotice(isZh ? `双端均未返回结果：${errs.join('；')}` : `No tracks found: ${errs.join('; ')}`);
      }
    } catch {
      setCrawlNotice(isZh ? '网络并发爬取失败。' : 'Dual crawl failed.');
    } finally {
      if (mountedRef.current) setYtSearching(false);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => { if (mountedRef.current) setCrawlNotice(null); }, 7000);
    }
  };

  useEffect(() => {
    if (selectedGenre === 'bilibili_live') {
      searchBilibiliMusic('宇宙 氛围 音乐');
    } else if (selectedGenre === 'youtube_music') {
      searchYouTubeMusic('space ambient relaxing music');
    } else {
      loadTracks(selectedGenre, searchQuery);
    }
  }, [selectedGenre]);

  const activeTrack = currentTrack || (tracks[0] ? { ...tracks[0], playback: { kind: (tracks[0].playable === 'embed' || tracks[0].embedUrl) ? 'embed' : (tracks[0].audioUrl ? 'audio' : 'none'), audioUrl: tracks[0].audioUrl, embedUrl: tracks[0].embedUrl } } as any : null);

  // Draw spectrum loop (uses global audio engine analyser, no duplicate MediaElementAudioSourceNode)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderSpectrum = () => {
      animFrameRef.current = requestAnimationFrame(renderSpectrum);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const analyser = player.getAudioAnalyser();
      const barCount = 32;
      const barWidth = (canvas.width / barCount) - 2;

      if (analyser && isPlaying && currentTrack?.playback.kind === 'audio') {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i] || 0;
          const barHeight = (val / 255) * canvas.height * 0.9;
          const x = i * (barWidth + 2);
          const y = canvas.height - barHeight;

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
  }, [isPlaying, currentTrack, player]);

  // Handle Play/Pause
  const togglePlay = async () => {
    const track = currentTrack || (tracks[0] as any);
    if (track && (track.playback?.kind === 'embed' || track.embedUrl || track.playable === 'embed')) {
      setShowEmbedPlayer(true);
      if (!currentTrack && tracks[0]) player.playTrack(tracks[0], tracks, 0);
      showNotice(isZh ? '当前为官方嵌入播放器，请在上方嵌入窗口中点击播放/暂停。' : 'Use the embedded player controls.', 2500);
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
    if ((track.playable === 'embed' || track.embedUrl)) {
      // embed handled by iframe UI; engine stops audio automatically
    } else {
      void player.resumeAudioContext();
    }
  };

  const handleNext = () => {
    if (tracks.length === 0 && p.queue.length === 0) return;
    player.playNext();
  };

  const handlePrev = () => {
    if (tracks.length === 0 && p.queue.length === 0) return;
    player.playPrevious();
  };

  // Run Fixed Crawler (persistent harvest for open sources; realtime search for Bili/YouTube)
  const handleTriggerCrawl = async () => {
    if (crawlerSource === 'bilibili.com') {
      setIsCrawling(true);
      setCrawlNotice(isZh ? `正在实时爬取 B站音乐：${crawlerKeyword}...` : `Searching Bilibili: ${crawlerKeyword}...`);
      try {
        await searchBilibiliMusic(crawlerKeyword);
        // searchBilibiliMusic sets its own notice with count; keep it
      } finally {
        if (mountedRef.current) setIsCrawling(false);
      }
      return;
    }
    if (crawlerSource === 'youtube.com/music') {
      setIsCrawling(true);
      setCrawlNotice(isZh ? `正在实时爬取 YouTube 音乐：${crawlerKeyword}...` : `Searching YouTube: ${crawlerKeyword}...`);
      try {
        await searchYouTubeMusic(crawlerKeyword);
      } finally {
        if (mountedRef.current) setIsCrawling(false);
      }
      return;
    }

    setIsCrawling(true);
    setCrawlNotice(isZh ? `正在向 ${crawlerSource} 发起开放音频抓取（关键词：${crawlerKeyword}）...` : `Crawling ${crawlerSource} (${crawlerKeyword})...`);
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
      const saved = data.savedCount ?? data.crawledCount ?? 0;
      const errs = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
      if (data.success && saved > 0) {
        setCrawlNotice(isZh ? `抓取完成：成功获取并保存 ${saved} 首音轨（来源 ${data.source || crawlerSource}）。` : `Crawl done: saved ${saved} tracks from ${data.source || crawlerSource}.`);
        loadTracks(selectedGenre, searchQuery);
      } else {
        const reason = errs[0] || data.error || data.message || (isZh ? '未获取到可保存数据' : 'No data saved');
        setCrawlNotice(isZh ? `抓取结束：成功 0，保存 0。原因：${reason}` : `Crawl finished: saved 0. Reason: ${reason}`);
      }
    } catch (e: any) {
      setCrawlNotice(isZh ? `抓取请求失败：${e?.message || '网络错误'}` : `Crawl request failed: ${e?.message || 'network error'}`);
    } finally {
      if (mountedRef.current) setIsCrawling(false);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => { if (mountedRef.current) setCrawlNotice(null); }, 8000);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#07040d] text-slate-100 flex flex-col font-sans relative overflow-x-clip selection:bg-rose-500/30 selection:text-rose-200 pb-[calc(11.5rem+env(safe-area-inset-bottom))] md:pb-36">
      {/* Venus Golden-Pink Atmospheric Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-[25%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-rose-600/10 blur-[140px]" />
        <div className="absolute top-[35%] -right-[15%] w-[50vw] h-[50vw] rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute bottom-0 left-[20%] w-[60vw] h-[30vw] rounded-full bg-purple-700/10 blur-[160px]" />
      </div>

      {/* Floating Embedded Player (Bilibili / YouTube / SoundCloud) */}
      {(activeTrack?.playback?.kind === 'embed' || activeTrack?.embedUrl || activeTrack?.playable === 'embed') && showEmbedPlayer && (
        <div className="fixed bottom-[calc(176px+env(safe-area-inset-bottom))] md:bottom-[115px] left-4 right-4 z-40 mx-auto max-w-xl rounded-2xl border border-rose-500/40 bg-black/95 p-3 backdrop-blur-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-rose-900/40 text-xs">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                activeTrack.source === 'Bilibili' ? 'bg-sky-500 text-white' : 'bg-red-600 text-white'
              }`}>
                {activeTrack.source}
              </span>
              <span className="font-bold text-white truncate max-w-[280px]">{activeTrack.title}</span>
            </div>
            <button
              onClick={() => setShowEmbedPlayer(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="收起播放器"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <iframe
            title={activeTrack.title}
            src={activeTrack.playback?.embedUrl || activeTrack.embedUrl}
            className="aspect-video w-full rounded-xl border-0 bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>{activeTrack.artist}</span>
            {activeTrack.sourceUrl && (
              <a href={activeTrack.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-rose-300 inline-flex items-center gap-1">
                <span>来源链接</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Native audio playback is handled by the global PlayerProvider singleton engine */}
      {p.error && (
        <div className="fixed bottom-[calc(260px+env(safe-area-inset-bottom))] md:bottom-[170px] left-4 right-4 z-40 mx-auto max-w-xl rounded-xl border border-red-500/40 bg-red-950/80 px-3 py-2 text-xs text-red-100">
          {isZh ? '播放失败：' : 'Playback error: '}{p.error.message}
        </div>
      )}

      {/* 1. Header Navigation Bar */}
      <header className="sticky top-[58px] md:top-16 z-30 border-b border-rose-900/30 bg-[#07040d]/85 backdrop-blur-2xl px-4 sm:px-8 py-3.5 flex items-center justify-between">
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
                  {isZh ? '金星音乐馆 · 开放音频宇宙' : 'Venus Music Universe'}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono">
                  B站 & YouTube 双轨爬虫
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {isZh ? '汇聚 Bilibili 音乐现场、YouTube 开放音源与全球开源公版曲库' : 'Aggregating Bilibili Live, YouTube Music & Open Commons Audio'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Radio status */}
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-200">
            <Radio className="w-3.5 h-3.5 text-rose-400 animate-spin" />
            <span className="font-mono text-[11px]">全网开放音频节点 · 即搜即播</span>
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
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight line-clamp-2">
              {activeTrack ? activeTrack.title : '探索星际原声与全景声音'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">
              {activeTrack?.description || '融合太阳系等离子体射电电波、B站现场音乐与 YouTube 宇宙空间站环境音，完全在您的网页内即点即听。'}
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

        {/* 3. Multi-source Music Crawler Control Center */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-600/40 flex items-center justify-center text-rose-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>全域开放音乐爬虫中枢</span>
                <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 font-mono text-[9px] border border-rose-800/60">
                  REAL-TIME HARVESTER
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                支持 B站 (Bilibili) 音乐现场、YouTube 开放音频、Free Music Archive 及 Jamendo 多源并发爬取。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto justify-end flex-wrap gap-2">
            <select
              value={crawlerSource}
              onChange={e => setCrawlerSource(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-2.5 py-2 outline-none focus:border-rose-500"
            >
              <option value="bilibili.com">哔哩哔哩 (Bilibili 爬虫)</option>
              <option value="youtube.com/music">YouTube 开放流</option>
              <option value="freemusicarchive.org">Free Music Archive</option>
              <option value="jamendo.com">Jamendo Open Commons</option>
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
              disabled={isCrawling || ytSearching}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/40 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCrawling || ytSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isCrawling || ytSearching ? '爬取中...' : '启动爬虫收录'}</span>
            </button>
          </div>
        </div>

        {/* 4. Search & Multi-Engine Trigger */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex w-full sm:max-w-2xl items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void searchDualMusic(); }}
                  placeholder="搜索音乐、歌手、原声带、B站MV或粘贴链接..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all shadow-inner"
                />
              </div>
              <button
                type="button"
                onClick={() => void searchDualMusic()}
                disabled={ytSearching || !searchQuery.trim()}
                className="shrink-0 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-40 shadow-lg shadow-rose-900/30 cursor-pointer"
              >
                {ytSearching ? '爬取中…' : '双端爬取 (B站+油管)'}
              </button>
              <button
                type="button"
                onClick={() => void searchBilibiliMusic()}
                disabled={ytSearching || !searchQuery.trim()}
                className="shrink-0 rounded-2xl border border-sky-600/50 bg-sky-950/40 px-3 py-2.5 text-xs font-semibold text-sky-200 hover:bg-sky-900/50 cursor-pointer"
              >
                <span className="flex items-center gap-1">
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>B站专搜</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void searchYouTubeMusic()}
                disabled={ytSearching || !searchQuery.trim()}
                className="shrink-0 rounded-2xl border border-red-600/50 bg-red-950/40 px-3 py-2.5 text-xs font-semibold text-red-200 hover:bg-red-900/50 cursor-pointer"
              >
                <span className="flex items-center gap-1">
                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                  <span>YouTube</span>
                </span>
              </button>
            </div>

            <div className="text-xs text-slate-400 font-mono self-end sm:self-center">
              {isZh ? `曲库实时索引: ${tracks.length} 首` : `${tracks.length} Tracks Indexed`}
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
            const isCurrent = (currentTrack?.id || (activeTrack as any)?.id) === track.id;
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
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] text-rose-300 font-mono flex items-center gap-1">
                      {track.source === 'Bilibili' && <Tv className="w-2.5 h-2.5 text-sky-400" />}
                      {track.source === 'YouTube' && <Youtube className="w-2.5 h-2.5 text-red-400" />}
                      <span>{track.genre || track.source}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white line-clamp-1 group-hover:text-rose-300 transition-colors" title={track.title}>
                      {track.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{formatSeconds(track.durationSeconds || 0)}</span>
                  <span className="truncate max-w-[120px]">{track.license || track.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* 6. Sticky Bottom Floating Music Player Bar */}
      <footer className="fixed bottom-[calc(62px+env(safe-area-inset-bottom))] md:bottom-0 left-0 md:left-[5.5rem] right-0 z-30 bg-[#0c0516]/95 border-t border-rose-900/40 backdrop-blur-2xl px-4 sm:px-8 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Active Track Info */}
          <div className="flex items-center space-x-3 w-full sm:w-1/3 min-w-0">
            <img
              src={(currentTrack as any)?.coverUrl || (activeTrack as any)?.coverUrl}
              alt={(currentTrack as any)?.title || (activeTrack as any)?.title}
              className="w-12 h-12 rounded-xl object-cover border border-rose-500/40 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-white text-xs truncate">
                {(currentTrack as any)?.title || (activeTrack as any)?.title || '未选择播放曲目'}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {(currentTrack as any)?.artist || (activeTrack as any)?.artist} · {(currentTrack as any)?.album || (activeTrack as any)?.album || (activeTrack as any)?.source}
              </div>
            </div>
          </div>

          {/* Player Main Controls & Scrubber */}
          <div className="flex flex-col items-center w-full sm:w-2/5 space-y-1">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => player.setRepeatMode(isLoop ? 'off' : 'one')}
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
                value={Math.min(currentTime, duration || 100)}
                onChange={e => {
                  const t = parseFloat(e.target.value);
                  if (currentTrack?.playback?.kind === 'audio') player.seek(t);
                }}
                disabled={!(currentTrack?.playback?.kind === 'audio')}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500 disabled:opacity-50"
              />
              <span>{formatSeconds(duration || activeTrack?.durationSeconds || 0)}</span>
            </div>
          </div>

          {/* Volume Control & Direct Source Link */}
          <div className="hidden sm:flex items-center justify-end space-x-3 w-1/3">
            {(currentTrack?.playback?.kind === 'embed' || currentTrack?.playback?.embedUrl) && (
              <button
                onClick={() => setShowEmbedPlayer(!showEmbedPlayer)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  showEmbedPlayer ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title={showEmbedPlayer ? '隐藏嵌入视窗' : '显示嵌入视窗'}
              >
                <Maximize2 className="w-3 h-3" />
                <span>{showEmbedPlayer ? '隐藏画面' : '显示画面'}</span>
              </button>
            )}

            <button
              onClick={() => player.toggleMute()}
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
                player.setVolume(v);
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
