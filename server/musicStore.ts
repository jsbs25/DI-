import fs from 'fs';
import path from 'path';
import { probeDirectMediaUrl } from './media/probe.ts';

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

const NON_MUSIC_BLOCKLIST = /(greatest_speeches|abdication|sleep\s*sounds|air_conditioner|shortwave|numbers\s*station|podcast|sermon|audiobook)/i;

function isValidPlayableMusicTrack(t: any): boolean {
  if (!t || !t.id || !t.audioUrl) return false;
  const audioUrl = String(t.audioUrl || '').trim();
  if (!/^https?:\/\//i.test(audioUrl) && !audioUrl.startsWith('/')) return false;
  const hay = `${t.id} ${t.title || ''} ${t.album || ''} ${audioUrl}`;
  if (NON_MUSIC_BLOCKLIST.test(hay)) return false;
  if (
    audioUrl.includes('cdn.freesound.org/previews/') ||
    audioUrl.includes('soundhelix.com') ||
    audioUrl.includes('testmp3testfile')
  ) {
    return false;
  }
  return true;
}

/**
 * Curated real public-domain and CC-licensed audio tracks with direct streaming URLs.
 * High-fidelity, atmospheric, perfectly suited for the Venus Music Universe.
 */
const SEED_TRACKS: MusicTrack[] = [
  {
    id: 'venus_track_01',
    title: 'Clair de Lune',
    artist: 'Claude Debussy',
    album: 'Suite Bergamasque',
    genre: 'Neo-Classical',
    durationSeconds: 374,
    audioUrl: 'https://archive.org/download/ClairDeLunedebussy/2009-03-30-clairdelune.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'ONE Music',
    sourceUrl: 'https://archive.org/details/ClairDeLunedebussy',
    license: 'Public Domain',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 68,
    description: '德彪西经典钢琴名曲《月光》，清澈空灵的新古典钢琴演奏。'
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
    source: 'ONE Music',
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
    source: 'ONE Music',
    sourceUrl: 'https://archive.org/details/lee-rosevere-promise',
    license: 'CC BY 4.0',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 76,
    description: 'Lee Rosevere 温柔开阔的空间氛围声景。'
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
    source: 'ONE Music',
    sourceUrl: 'https://archive.org/details/lo-fi-for-reading-manga-wk9vgr',
    license: 'CC BY 4.0',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 84,
    description: '适合专注与阅读的柔和 Lo-Fi 节拍。'
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
    source: 'ONE Music',
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
    source: 'ONE Music',
    sourceUrl: 'https://archive.org/details/Back_To_The_Sea-8076',
    license: 'CC BY-NC-SA',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 88,
    description: '原声木吉他与细腻氛围融合的海岸系器乐。'
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
    source: 'ONE Music',
    sourceUrl: 'https://archive.org/details/45rpm053-2012JaredC.Balogh-DriftingSoul',
    license: 'Creative Commons',
    crawledAt: '2026-11-14T00:00:00Z',
    bpm: 110,
    description: '脉冲合成波与深邃贝斯交织的电子音景。'
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
    source: 'ONE Music',
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
          const valid = parsed.filter(isValidPlayableMusicTrack);
          if (valid.length > 0) {
            this.tracks = valid;
            if (valid.length !== parsed.length) this.save();
            return;
          }
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
    const clean = this.tracks.filter(isValidPlayableMusicTrack);
    if (!genre || genre === 'all') return clean;
    return clean.filter(t => t.genre.toLowerCase() === genre.toLowerCase());
  }

  public getTrack(id: string): MusicTrack | undefined {
    return this.tracks.find(t => t.id === id && isValidPlayableMusicTrack(t));
  }

  public searchTracks(query: string, genre?: string): MusicTrack[] {
    const q = query.trim().toLowerCase();
    let list = this.getTracks(genre);
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
   * Only persists tracks whose direct audio URL actually passes HTTP media verification.
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

    const addVerifiedTrack = async (t: MusicTrack) => {
      if (!isValidPlayableMusicTrack(t)) return;
      const exists = this.tracks.some(existing => existing.id === t.id || (existing.sourceUrl && t.sourceUrl && existing.sourceUrl === t.sourceUrl));
      if (exists) return;
      const probe = await probeDirectMediaUrl(t.audioUrl, 'audio', 4500);
      if (!probe.ok) return;
      newTracks.push(t);
    };

    try {
      if (source.includes('archive.org') || source.includes('freemusicarchive') || source.includes('fma')) {
        const q = source.includes('freemusicarchive') || source.includes('fma')
          ? `(${kw}) AND mediatype:(audio) AND collection:(freemusicarchive OR netlabels OR audio_music)`
          : `(${kw}) AND mediatype:(audio) AND collection:(audio_music OR netlabels OR freemusicarchive)`;
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,creator,licenseurl,description,year&sort[]=downloads+desc&rows=12&page=1&output=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Internet Archive HTTP ${res.status}`);
        const data: any = await res.json();
        const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
        for (const d of docs) {
          const identifier = String(d?.identifier || '');
          if (!identifier) continue;
          try {
            const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal: AbortSignal.timeout(6000) });
            if (!metaRes.ok) continue;
            const meta: any = await metaRes.json();
            const files = Array.isArray(meta?.files) ? meta.files : [];
            const audio = files.find((f: any) => /\.(mp3|ogg|m4a)$/i.test(String(f?.name || '')) && !String(f?.name || '').includes('_spectrogram'));
            if (!audio?.name) continue;
            const fileUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(audio.name)}`;
            await addVerifiedTrack({
              id: `ia_${identifier}`,
              title: String(d?.title || identifier).slice(0, 180),
              artist: Array.isArray(d?.creator) ? String(d.creator[0] || 'Open Music') : (d?.creator ? String(d.creator) : 'Open Music'),
              album: 'Open Music',
              genre: 'Ambient Space',
              durationSeconds: Number(audio?.length) || 0,
              audioUrl: fileUrl,
              coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
              source: 'ONE Music',
              sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
              license: String(d?.licenseurl || 'Creative Commons'),
              crawledAt: timeNow,
              description: '已通过可播放直链校验的开放音乐曲目。'
            } as any);
            if (newTracks.length >= 6) break;
          } catch (e: any) {
            errors.push(`metadata:${identifier}:${e?.message || 'failed'}`);
          }
        }
        if (docs.length === 0) errors.push('未返回匹配音频条目。');
      } else {
        errors.push(`当前来源 ${sourceDomain} 暂不支持直链抓取。`);
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
        ? `已验证并收录 ${newTracks.length} 首可播放曲目。`
        : (errors[0] || '未抓取到可播放曲目。')
    };
  }
}

export const musicStore = new MusicStore();
