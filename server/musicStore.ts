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
    title: 'Clair de Lune',
    artist: 'Claude Debussy (Public Domain Performance)',
    album: 'Suite Bergamasque',
    genre: 'Neo-Classical',
    durationSeconds: 374,
    audioUrl: 'https://archive.org/download/ClairDeLunedebussy/2009-03-30-clairdelune.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/ClairDeLunedebussy',
    license: 'Public Domain',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 68,
    description: '德彪西经典钢琴名曲《月光》，清澈空灵的新古典钢琴演奏直链。'
  },
  {
    id: 'venus_track_02',
    title: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    album: 'Trois Gymnopédies',
    genre: 'Neo-Classical',
    durationSeconds: 243,
    audioUrl: 'https://archive.org/download/GymnopedieNo.1/Gymnopedie%20No.1.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/GymnopedieNo.1',
    license: 'Public Domain',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 72,
    description: '埃里克·萨蒂《吉诺佩蒂第1号》，安静澄澈的钢琴独奏。'
  },
  {
    id: 'venus_track_03',
    title: 'What Did I Miss',
    artist: 'Lee Rosevere',
    album: 'Promise',
    genre: 'Ambient Space',
    durationSeconds: 124,
    audioUrl: 'https://archive.org/download/lee-rosevere-promise/Lee%20Rosevere%20-%20Promise%20-%2001%20-%20What%20did%20i%20miss.mp3',
    coverUrl: '/assets/music/ambient-space.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/lee-rosevere-promise',
    license: 'CC BY 4.0',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 76,
    description: 'Lee Rosevere《Promise》专辑开篇，温柔开阔的空间氛围声景。'
  },
  {
    id: 'venus_track_04',
    title: 'Chisato Sumiyoshi',
    artist: 'Mabisyo',
    album: 'Lo-Fi For Reading Manga',
    genre: 'Lofi Chill',
    durationSeconds: 99,
    audioUrl: 'https://archive.org/download/lo-fi-for-reading-manga-wk9vgr/Mabisyo%20-%20Lo-Fi%20For%20Reading%20Manga%20-%2001%20Chisato%20Sumiyoshi.mp3',
    coverUrl: '/assets/music/lofi-horizon.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/lo-fi-for-reading-manga-wk9vgr',
    license: 'CC BY 4.0',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 84,
    description: '适合专注与阅读的柔和 Lo-Fi 节拍与温暖采样。'
  },
  {
    id: 'venus_track_05',
    title: 'We Are One',
    artist: 'John Gabantin',
    album: 'Section 27 Netlabel S27-043',
    genre: 'Electronic',
    durationSeconds: 196,
    audioUrl: 'https://archive.org/download/s27-043WeAreOne-Section27Netlabel/1-01JohnGabantin.mp3',
    coverUrl: '/assets/music/electronic-pulse.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/s27-043WeAreOne-Section27Netlabel',
    license: 'Creative Commons',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 118,
    description: '富有层次感的电子合成器律动与清新旋律编曲。'
  },
  {
    id: 'venus_track_06',
    title: 'Things',
    artist: 'Adam & Alma',
    album: 'Back To The Sea',
    genre: 'Acoustic',
    durationSeconds: 428,
    audioUrl: 'https://archive.org/download/Back_To_The_Sea-8076/Adam__Alma_-_01_-_Things.mp3',
    coverUrl: '/assets/music/lofi-horizon.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/Back_To_The_Sea-8076',
    license: 'CC BY-NC-SA',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 88,
    description: '原声木吉他与细腻氛围融合的海岸系长篇器乐。'
  },
  {
    id: 'venus_track_07',
    title: 'Emotions Leading To Nowhere',
    artist: 'Jared C. Balogh',
    album: 'Drifting Soul',
    genre: 'Cyberpunk',
    durationSeconds: 427,
    audioUrl: 'https://archive.org/download/45rpm053-2012JaredC.Balogh-DriftingSoul/01Jared_C_Balog_-_Emotions_leading_To_Howhere.mp3',
    coverUrl: '/assets/music/electronic-pulse.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/45rpm053-2012JaredC.Balogh-DriftingSoul',
    license: 'Creative Commons',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 110,
    description: '脉冲合成波与深邃脉冲贝斯交织的未来主义电子音景。'
  },
  {
    id: 'venus_track_08',
    title: 'Dummy',
    artist: 'Jahzzar',
    album: 'Grab Bag',
    genre: 'Ambient Space',
    durationSeconds: 234,
    audioUrl: 'https://archive.org/download/Grab_Bag-12446/01_-_Dummy.mp3',
    coverUrl: '/assets/music/ambient-space.jpg',
    source: 'Internet Archive',
    sourceUrl: 'https://archive.org/details/Grab_Bag-12446',
    license: 'CC BY-SA 4.0',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 108,
    description: '独立音乐人 Jahzzar 创作的轻盈现代电子氛围曲目。'
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
          // Refresh legacy test stubs (SoundHelix/Freesound/MP3 Test) with real curated music seeds.
          const hasLegacyTestStub = parsed.some((t: any) => {
            const url = String(t?.audioUrl || '');
            const title = String(t?.title || '');
            return (
              url.includes('cdn.freesound.org/previews/') ||
              url.includes('soundhelix.com') ||
              url.includes('testmp3testfile') ||
              title.includes('Test Instrumental') ||
              title.includes('Connectivity Check')
            );
          });
          this.tracks = hasLegacyTestStub ? [...SEED_TRACKS] : parsed;
          if (hasLegacyTestStub) this.save();
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
