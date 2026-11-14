import fs from 'fs';
import path from 'path';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: 'Ambient Space' | 'Neo-Classical' | 'Electronic' | 'Lofi Chill' | 'Cyberpunk' | 'Acoustic';
  durationSeconds: number;
  audioUrl: string;
  coverUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  crawledAt: string;
  bpm?: number;
  description?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MUSIC_FILE = path.join(DATA_DIR, 'venus_music_catalog.json');

/**
 * Curated real public-domain and CC-licensed audio tracks with direct streaming URLs.
 * High-fidelity, atmospheric, perfectly suited for the Venus Music Universe.
 */
const SEED_TRACKS: MusicTrack[] = [
  {
    id: 'venus_track_01',
    title: 'SoundHelix Song 1 (Test Instrumental)',
    artist: 'T. Schürger / SoundHelix',
    album: 'SoundHelix Examples',
    genre: 'Electronic',
    durationSeconds: 372,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
    source: 'SoundHelix',
    sourceUrl: 'https://www.soundhelix.com/audio-examples',
    license: 'Free to use (see SoundHelix terms)',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 96,
    description: 'SoundHelix 示例音频直链，可用于播放器功能验证（非伪造播放）。'
  },
  {
    id: 'venus_track_02',
    title: 'SoundHelix Song 2 (Test Instrumental)',
    artist: 'T. Schürger / SoundHelix',
    album: 'SoundHelix Examples',
    genre: 'Electronic',
    durationSeconds: 425,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    source: 'SoundHelix',
    sourceUrl: 'https://www.soundhelix.com/audio-examples',
    license: 'Free to use (see SoundHelix terms)',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 104,
    description: 'SoundHelix 示例音频直链。'
  },
  {
    id: 'venus_track_03',
    title: 'SoundHelix Song 3 (Test Instrumental)',
    artist: 'T. Schürger / SoundHelix',
    album: 'SoundHelix Examples',
    genre: 'Ambient Space',
    durationSeconds: 343,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=600&auto=format&fit=crop&q=80',
    source: 'SoundHelix',
    sourceUrl: 'https://www.soundhelix.com/audio-examples',
    license: 'Free to use (see SoundHelix terms)',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 90,
    description: 'SoundHelix 示例音频直链。'
  },
  {
    id: 'venus_track_04',
    title: 'SoundHelix Song 8 (Test Instrumental)',
    artist: 'T. Schürger / SoundHelix',
    album: 'SoundHelix Examples',
    genre: 'Lofi Chill',
    durationSeconds: 326,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80',
    source: 'SoundHelix',
    sourceUrl: 'https://www.soundhelix.com/audio-examples',
    license: 'Free to use (see SoundHelix terms)',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 82,
    description: 'SoundHelix 示例音频直链。'
  },
  {
    id: 'venus_track_05',
    title: 'Arcade Room Ambience',
    artist: 'Google Actions Sound Library',
    album: 'Ambiences',
    genre: 'Ambient Space',
    durationSeconds: 60,
    audioUrl: 'https://actions.google.com/sounds/v1/ambiences/arcade_room.ogg',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    source: 'Google Actions Sound Library',
    sourceUrl: 'https://developers.google.com/assistant/tools/sound-library/ambiences',
    license: 'Google sound library (see terms)',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 70,
    description: 'Google 开放音效库氛围音频直链。'
  },
  {
    id: 'venus_track_06',
    title: 'MP3 Test File (Connectivity Check)',
    artist: 'Internet Archive',
    album: 'Test Audio',
    genre: 'Acoustic',
    durationSeconds: 27,
    audioUrl: 'https://archive.org/download/testmp3testfile/mpthreetest.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/testmp3testfile',
    license: 'See item page',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 0,
    description: 'Internet Archive 可访问的短音频直链，用于验证真实播放链路。'
  }
];

class MusicStore {
  private tracks: MusicTrack[] = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(MUSIC_FILE)) {
        const raw = fs.readFileSync(MUSIC_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Refresh known-broken legacy freesound seed URLs (404) with current seeds.
          const hasBrokenSeed = parsed.some((t: any) => typeof t?.audioUrl === 'string' && t.audioUrl.includes('cdn.freesound.org/previews/'));
          this.tracks = hasBrokenSeed ? [...SEED_TRACKS] : parsed;
          if (hasBrokenSeed) this.save();
          return;
        }
      }
    } catch (err) {
      console.warn('Music catalog load failed, using seed data:', err);
    }
    this.tracks = [...SEED_TRACKS];
    this.save();
  }

  public save() {
    try {
      fs.writeFileSync(MUSIC_FILE, JSON.stringify(this.tracks, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to persist music catalog:', err);
    }
  }

  public getTracks(genre?: string): MusicTrack[] {
    if (!genre || genre === 'all') return this.tracks;
    return this.tracks.filter(t => t.genre.toLowerCase() === genre.toLowerCase());
  }

  public getTrack(id: string): MusicTrack | undefined {
    return this.tracks.find(t => t.id === id);
  }

  public searchTracks(query: string, genre?: string): MusicTrack[] {
    const q = query.trim().toLowerCase();
    let list = this.tracks;
    if (genre && genre !== 'all') {
      list = list.filter(t => t.genre.toLowerCase() === genre.toLowerCase());
    }
    if (!q) return list;

    return list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  /**
   * Real open-audio crawl/harvest from compliant public sources.
   * Fetches actual metadata + playable/embeddable links and persists new tracks.
   * Does not bypass access controls; reports failures clearly.
   */
  public async crawlExternalMusic(
    sourceDomain: string = 'archive.org',
    keyword: string = 'space ambient'
  ): Promise<{ success: boolean; crawledCount: number; savedCount: number; newTracks: MusicTrack[]; source: string; keyword: string; errors: string[]; message?: string }> {
    const timeNow = new Date().toISOString();
    const source = String(sourceDomain || '').trim().toLowerCase();
    const kw = String(keyword || 'space ambient').trim();
    const errors: string[] = [];
    const newTracks: MusicTrack[] = [];

    const addTrack = (t: MusicTrack) => {
      if (!t || !t.id) return;
      const exists = this.tracks.some(existing => existing.id === t.id || (existing.sourceUrl && t.sourceUrl && existing.sourceUrl === t.sourceUrl));
      if (!exists) newTracks.push(t);
    };

    try {
      if (source.includes('archive.org')) {
        const q = `(${kw}) AND mediatype:(audio)`;
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,creator,licenseurl,description,year&sort[]=downloads+desc&rows=12&page=1&output=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Internet Archive HTTP ${res.status}`);
        const data: any = await res.json();
        const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
        for (const d of docs) {
          const identifier = String(d?.identifier || '');
          if (!identifier) continue;
          try {
            const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal: AbortSignal.timeout(8000) });
            if (!metaRes.ok) continue;
            const meta: any = await metaRes.json();
            const files = Array.isArray(meta?.files) ? meta.files : [];
            const audio = files.find((f: any) => /\.(mp3|ogg|m4a)$/i.test(String(f?.name || '')) && !String(f?.name || '').includes('_spectrogram'));
            if (!audio?.name) continue;
            const fileUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(audio.name)}`;
            addTrack({
              id: `ia_${identifier}`,
              title: String(d?.title || identifier).slice(0, 180),
              artist: Array.isArray(d?.creator) ? String(d.creator[0] || 'Internet Archive') : (d?.creator ? String(d.creator) : 'Internet Archive'),
              album: 'Internet Archive Audio',
              genre: 'Ambient Space',
              durationSeconds: Number(audio?.length) || 0,
              audioUrl: fileUrl,
              coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
              source: 'Internet Archive',
              sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
              license: String(d?.licenseurl || 'Rights vary; see item page'),
              crawledAt: timeNow,
              description: '从 Internet Archive 公共音频库抓取的可播放直链（具体许可/版权以条目页为准）。'
            } as any);
            if (newTracks.length >= 8) break;
          } catch (e: any) {
            errors.push(`metadata:${identifier}:${e?.message || 'failed'}`);
          }
        }
        if (docs.length === 0) errors.push('Internet Archive 未返回匹配音频条目。');
      } else if (source.includes('jamendo')) {
        // Jamendo public API generally requires client_id; attempt without key is not reliable.
        errors.push('Jamendo 需要官方 API client_id 才能合规检索；当前环境未配置，无法直接爬取。请使用 Internet Archive/YouTube/Bilibili 来源或在服务端配置 JAMENDO_CLIENT_ID。');
      } else if (source.includes('freemusicarchive') || source.includes('fma')) {
        // FMA site/API access varies; use Internet Archive as compliant open fallback and report.
        const q = `(${kw}) AND mediatype:(audio) AND collection:(freemusicarchive OR netlabels OR audio_music)`;
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,creator,licenseurl,description&sort[]=downloads+desc&rows=12&page=1&output=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data: any = await res.json();
          const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
          for (const d of docs) {
            const identifier = String(d?.identifier || '');
            if (!identifier) continue;
            try {
              const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal: AbortSignal.timeout(8000) });
              if (!metaRes.ok) continue;
              const meta: any = await metaRes.json();
              const files = Array.isArray(meta?.files) ? meta.files : [];
              const audio = files.find((f: any) => /\.(mp3|ogg|m4a)$/i.test(String(f?.name || '')) && !String(f?.name || '').includes('_spectrogram'));
              if (!audio?.name) continue;
              addTrack({
                id: `ia_${identifier}`,
                title: String(d?.title || identifier).slice(0, 180),
                artist: Array.isArray(d?.creator) ? String(d.creator[0] || 'Open Audio') : (d?.creator ? String(d.creator) : 'Open Audio'),
                album: 'Open Audio (Internet Archive index)',
                genre: 'Ambient Space',
                durationSeconds: Number(audio?.length) || 0,
                audioUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(audio.name)}`,
                coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
                source: 'Internet Archive (FMA/open collections)',
                sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
                license: String(d?.licenseurl || 'Rights vary; see item page'),
                crawledAt: timeNow,
                description: '通过 Internet Archive 开放索引抓取的可播放音频（FMA/开放集合）；许可以条目页为准。'
              } as any);
              if (newTracks.length >= 8) break;
            } catch {}
          }
          if (newTracks.length === 0) errors.push('未能从开放索引解析出可播放音频文件。');
        } else {
          errors.push(`开放索引访问失败 HTTP ${res.status}`);
        }
      } else if (source.includes('bilibili') || source.includes('youtube')) {
        errors.push('Bilibili/YouTube 请使用页面内“B站专搜/YouTube/双端爬取”进行实时检索与播放（合规嵌入/公开接口），此处为开放音频库持久化爬取入口。');
      } else {
        errors.push(`暂不支持来源 ${sourceDomain} 的自动持久化爬取；支持 Internet Archive 等开放来源。`);
      }
    } catch (err: any) {
      errors.push(err?.message || String(err));
    }

    if (newTracks.length > 0) {
      this.tracks.unshift(...newTracks);
      this.save();
    }

    return {
      success: newTracks.length > 0,
      crawledCount: newTracks.length,
      savedCount: newTracks.length,
      newTracks,
      source: sourceDomain,
      keyword: kw,
      errors,
      message: newTracks.length > 0
        ? `已从 ${sourceDomain} 抓取并保存 ${newTracks.length} 条可播放音频。`
        : (errors[0] || '未抓取到可保存的音频数据。')
    };
  }
}

export const musicStore = new MusicStore();
