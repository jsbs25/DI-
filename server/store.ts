import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Simple in-process async mutex/queue used to serialize state-mutating
 * operations that include async gaps (e.g. crawling) so their read-modify-write
 * sequences cannot interleave with other writers.
 */
class WriteMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = async () => await fn();
    const resultPromise = this.queue.then(run, run);
    // Keep queue alive even if this task fails.
    this.queue = resultPromise.then(() => undefined, () => undefined);
    return resultPromise;
  }
}
import {
  User,
  Post,
  ChatMessage,
  Conversation,
  CreatorArticle,
  VideoItem,
  Community,
  GameRoom,
  Advertisement,
  GlobeCountryStat,
  GlobeUserNode,
  Book,
  BookAnnotation,
  BookShelfItem,
  BookshelfStatus,
  CrawlerTask,
  CrawledPage,
  BrowserBookmark,
  SavedArticle,
  LinkedIdentity,
  FriendRequest,
  SecurityAuditEvent
} from '../src/types/index.ts';
import { resolveCoordinates } from '../src/utils/geoData.ts';
import { normalizePrivacySettings, DEFAULT_PRIVACY_SETTINGS, canViewProfileByPolicy, canSearchByField } from './privacyPolicy.ts';
import { SEED_BOOKS, SEED_CRAWLER_TASKS, SEED_CRAWLED_PAGES } from './seedKnowledge.ts';
import { crawlWebsite } from './webFetcher.ts';

const DATA_DIR = path.resolve(process.env.EARTH_ONE_DATA_DIR || path.join(process.cwd(), 'server_data'));
const DATA_FILE = path.resolve(process.env.EARTH_ONE_DATA_FILE || path.join(path.dirname(DATA_DIR), 'server_data.json'));
// Full-text book content is stored here (one JSON file per book) instead of
// bloating server_data.json with every chapter's body. This keeps the main
// store small and makes the atomic whole-file rewrite cheap.
const BOOKS_DIR = path.resolve(process.env.EARTH_ONE_BOOKS_DIR || path.join(DATA_DIR, 'books'));
const AVATARS_DIR = path.resolve(process.env.EARTH_ONE_AVATARS_DIR || path.join(DATA_DIR, 'uploads', 'avatars'));

export interface AuthAccount {
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
  token?: string;
}

// Initial seed countries
export const SEED_COUNTRIES: GlobeCountryStat[] = [
  { code: 'CN', name: 'China', nativeName: '中国', lat: 35.8617, lng: 104.1954, userCount: 3840, onlineCount: 620, postsCount: 12400 },
  { code: 'US', name: 'United States', nativeName: 'United States', lat: 37.0902, lng: -95.7129, userCount: 3120, onlineCount: 540, postsCount: 10890 },
  { code: 'JO', name: 'Jordan', nativeName: 'الأردن', lat: 30.5852, lng: 36.2384, userCount: 940, onlineCount: 180, postsCount: 3200 },
  { code: 'SA', name: 'Saudi Arabia', nativeName: 'المملكة العربية السعودية', lat: 23.8859, lng: 45.0792, userCount: 1450, onlineCount: 290, postsCount: 4720 },
  { code: 'FR', name: 'France', nativeName: 'France', lat: 46.2276, lng: 2.2137, userCount: 1820, onlineCount: 310, postsCount: 6100 },
  { code: 'ES', name: 'Spain', nativeName: 'España', lat: 40.4637, lng: -3.7492, userCount: 1540, onlineCount: 260, postsCount: 4950 },
  { code: 'RU', name: 'Russia', nativeName: 'Россия', lat: 61.5240, lng: 105.3188, userCount: 2100, onlineCount: 380, postsCount: 7420 },
  { code: 'JP', name: 'Japan', nativeName: '日本', lat: 36.2048, lng: 138.2529, userCount: 2400, onlineCount: 420, postsCount: 8900 },
  { code: 'BR', name: 'Brazil', nativeName: 'Brasil', lat: -14.2350, lng: -51.9253, userCount: 1780, onlineCount: 330, postsCount: 5600 },
  { code: 'EG', name: 'Egypt', nativeName: 'مصر', lat: 26.8206, lng: 30.8025, userCount: 1120, onlineCount: 210, postsCount: 3890 },
  { code: 'GB', name: 'United Kingdom', nativeName: 'United Kingdom', lat: 55.3781, lng: -3.4360, userCount: 1980, onlineCount: 360, postsCount: 6840 },
  { code: 'DE', name: 'Germany', nativeName: 'Deutschland', lat: 51.1657, lng: 10.4515, userCount: 1890, onlineCount: 340, postsCount: 6410 }
];

// Initial seed users representing diverse cultures across continents
export const SEED_USERS: User[] = [
  {
    id: 'user_cn_1',
    username: 'li_wei',
    displayName: 'Li Wei (李伟)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&auto=format&fit=crop&q=80',
    bio: 'Architect in Beijing. Exploring high-tech timber structures and classical Eastern spatial philosophy.',
    location: { countryCode: 'CN', countryName: 'China', cityName: 'Beijing', lat: 39.9042, lng: 116.4074, isPublic: true },
    interests: ['Architecture', 'Tea Culture', 'AI & Design', 'Chess'],
    followersCount: 1420,
    followingCount: 310,
    tipsReceived: 450,
    isOnline: true,
    verified: true,
    joinedAt: '2026-01-15'
  },
  {
    id: 'user_us_1',
    username: 'sarah_sky',
    displayName: 'Sarah Jenkins',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=80',
    bio: 'Astrophysics PhD researcher at Berkeley. Star gazer, digital nomad, and amateur cellist.',
    location: { countryCode: 'US', countryName: 'United States', cityName: 'San Francisco', lat: 37.7749, lng: -122.4194, isPublic: true },
    interests: ['Astronomy', 'Space Tech', 'Music', 'Deep Learning'],
    followersCount: 2310,
    followingCount: 420,
    tipsReceived: 880,
    isOnline: true,
    verified: true,
    joinedAt: '2026-02-01'
  },
  {
    id: 'user_jo_1',
    username: 'tariq_amman',
    displayName: 'Tariq Al-Hashemi (طارق)',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1579606032834-de00b1a0e10b?w=800&auto=format&fit=crop&q=80',
    bio: 'Heritage storyteller and photographer in Amman. Connecting ancient Petra & modern Levant innovation.',
    location: { countryCode: 'JO', countryName: 'Jordan', cityName: 'Amman', lat: 31.9454, lng: 35.9284, isPublic: true },
    interests: ['Levantine History', 'Photography', 'Arabic Calligraphy', 'Poetry'],
    followersCount: 1890,
    followingCount: 280,
    tipsReceived: 620,
    isOnline: true,
    verified: true,
    joinedAt: '2026-01-20'
  },
  {
    id: 'user_sa_1',
    username: 'noura_riyadh',
    displayName: 'Noura Al-Saud (نورة)',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?w=800&auto=format&fit=crop&q=80',
    bio: 'Clean tech entrepreneur in Riyadh. Working on solar-desalination and green desert agriculture.',
    location: { countryCode: 'SA', countryName: 'Saudi Arabia', cityName: 'Riyadh', lat: 24.7136, lng: 46.6753, isPublic: true },
    interests: ['Renewable Energy', 'Future Cities', 'Equestrian', 'AI Hub'],
    followersCount: 3140,
    followingCount: 560,
    tipsReceived: 1200,
    isOnline: true,
    verified: true,
    joinedAt: '2026-02-10'
  },
  {
    id: 'user_fr_1',
    username: 'julien_paris',
    displayName: 'Julien Moreau',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80',
    bio: 'Philosopher and literary essayist in Paris. Writing about human consciousness in the era of artificial general intelligence.',
    location: { countryCode: 'FR', countryName: 'France', cityName: 'Paris', lat: 48.8566, lng: 2.3522, isPublic: true },
    interests: ['Philosophy', 'Literature', 'Cinema', 'Gomoku'],
    followersCount: 2050,
    followingCount: 390,
    tipsReceived: 740,
    isOnline: false,
    verified: true,
    joinedAt: '2026-01-28'
  },
  {
    id: 'user_es_1',
    username: 'elena_bcn',
    displayName: 'Elena Gómez',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1511527661048-7fe73d85e9a4?w=800&auto=format&fit=crop&q=80',
    bio: 'Visual artist and generative sculptor in Barcelona. Blending Mediterranean light with computational shaders.',
    location: { countryCode: 'ES', countryName: 'Spain', cityName: 'Barcelona', lat: 41.3879, lng: 2.1699, isPublic: true },
    interests: ['Digital Art', 'Three.js', 'Flamenco', 'Culinary'],
    followersCount: 1670,
    followingCount: 340,
    tipsReceived: 590,
    isOnline: true,
    verified: true,
    joinedAt: '2026-02-18'
  },
  {
    id: 'user_ru_1',
    username: 'dmitry_spb',
    displayName: 'Dmitry Volkov (Дмитрий)',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    banner: 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800&auto=format&fit=crop&q=80',
    bio: 'Mathematician and Grandmaster chess coach in Saint Petersburg. Believer in algorithmic clarity and human warmth.',
    location: { countryCode: 'RU', countryName: 'Russia', cityName: 'Saint Petersburg', lat: 59.9343, lng: 30.3351, isPublic: true },
    interests: ['Chess', 'Number Theory', 'Classical Music', 'Winter Sports'],
    followersCount: 2890,
    followingCount: 210,
    tipsReceived: 980,
    isOnline: true,
    verified: true,
    joinedAt: '2026-01-10'
  }
];

// Initial seed posts
export const SEED_POSTS: Post[] = [
  {
    id: 'post_1',
    userId: 'user_cn_1',
    author: {
      id: 'user_cn_1',
      displayName: 'Li Wei (李伟)',
      username: 'li_wei',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      countryCode: 'CN',
      countryName: 'China',
      cityName: 'Beijing',
      verified: true
    },
    content: 'Sunset over the Western Hills of Beijing. Watching how traditional dougong wooden brackets inspire our new bio-climatic canopy. Architecture is frozen music across centuries. ⛩️🌅',
    mediaUrl: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    countryCode: 'CN',
    countryName: 'China',
    cityName: 'Beijing',
    category: 'culture',
    likesCount: 142,
    commentsCount: 24,
    sharesCount: 18,
    liked: false,
    saved: false,
    createdAt: '2026-11-03T08:15:00Z',
    comments: [
      {
        id: 'c_1',
        postId: 'post_1',
        userId: 'user_fr_1',
        author: {
          id: 'user_fr_1',
          displayName: 'Julien Moreau',
          username: 'julien_paris',
          avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
          countryCode: 'FR'
        },
        content: 'Magnificent symmetry! In French classical architecture, we pursue ratio; here you balance harmony between heaven and earth.',
        createdAt: '2026-11-03T08:32:00Z',
        likesCount: 15,
        liked: false
      }
    ]
  },
  {
    id: 'post_2',
    userId: 'user_jo_1',
    author: {
      id: 'user_jo_1',
      displayName: 'Tariq Al-Hashemi (طارق)',
      username: 'tariq_amman',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      countryCode: 'JO',
      countryName: 'Jordan',
      cityName: 'Amman',
      verified: true
    },
    content: 'صباح الخير من عمان! (Good morning from Amman!) Morning coffee flavored with cardamom overlooking the Roman Theatre. A greeting of peace to every soul on Earth One today. ☕✨',
    mediaUrl: 'https://images.unsplash.com/photo-1579606032834-de00b1a0e10b?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    countryCode: 'JO',
    countryName: 'Jordan',
    cityName: 'Amman',
    category: 'life',
    likesCount: 289,
    commentsCount: 39,
    sharesCount: 31,
    liked: true,
    saved: true,
    createdAt: '2026-11-03T07:45:00Z',
    comments: [
      {
        id: 'c_2',
        postId: 'post_2',
        userId: 'user_us_1',
        author: {
          id: 'user_us_1',
          displayName: 'Sarah Jenkins',
          username: 'sarah_sky',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          countryCode: 'US'
        },
        content: 'Warmest greetings from California, Tariq! That golden sandstone glowing in the morning light is breathtaking.',
        createdAt: '2026-11-03T08:00:00Z',
        likesCount: 22,
        liked: false
      }
    ]
  },
  {
    id: 'post_3',
    userId: 'user_sa_1',
    author: {
      id: 'user_sa_1',
      displayName: 'Noura Al-Saud (نورة)',
      username: 'noura_riyadh',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      countryCode: 'SA',
      countryName: 'Saudi Arabia',
      cityName: 'Riyadh',
      verified: true
    },
    content: 'Testing our new agrivoltaic farm near Riyadh. Shading date palms with bifacial photovoltaic panels reduces evaporative water loss by 40% while generating clean megawatt-hours. One earth, one future! ☀️🌿',
    mediaUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    cityName: 'Riyadh',
    category: 'tech',
    likesCount: 412,
    commentsCount: 52,
    sharesCount: 65,
    liked: false,
    saved: false,
    createdAt: '2026-11-03T06:30:00Z',
    comments: []
  },
  {
    id: 'post_4',
    userId: 'user_ru_1',
    author: {
      id: 'user_ru_1',
      displayName: 'Dmitry Volkov (Дмитрий)',
      username: 'dmitry_spb',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
      countryCode: 'RU',
      countryName: 'Russia',
      cityName: 'Saint Petersburg',
      verified: true
    },
    content: 'First snowfall over the Fontanka canal in Saint Petersburg. Setting up the chess board with a hot samovar. Who wants an international match on Earth One Game Center today? ♟️❄️',
    mediaUrl: 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=1200&auto=format&fit=crop&q=80',
    mediaType: 'image',
    countryCode: 'RU',
    countryName: 'Russia',
    cityName: 'Saint Petersburg',
    category: 'life',
    likesCount: 198,
    commentsCount: 34,
    sharesCount: 14,
    liked: false,
    saved: false,
    createdAt: '2026-11-03T05:10:00Z',
    comments: []
  }
];

export const SEED_ARTICLES: CreatorArticle[] = [
  {
    id: 'art_1',
    authorId: 'user_fr_1',
    author: {
      displayName: 'Julien Moreau',
      username: 'julien_paris',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      countryCode: 'FR'
    },
    title: 'The Digital Agora: Reclaiming Human Connection Across Continents',
    summary: 'Why spatial awareness and cultural translation are replacing the algorithmic echo chambers of the first internet era.',
    content: `When we look at the night sky or view our blue planet from orbit, no political borders are visible. The lights of cities shine as interconnected constellations of human warmth, work, and wonder.

The first era of social media flattened human geography into 2D algorithmic engagement traps. In contrast, Earth One reconstructs the digital space around authentic planetary presence: you can feel the physical distance, celebrate cultural specificity, and instantly dissolve language barriers through artificial intelligence.

When an architect in Beijing speaks with a researcher in California and an entrepreneur in Riyadh, true mutual civilizational enrichment occurs. Let us cultivate this shared planet together.`,
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&auto=format&fit=crop&q=80',
    category: 'Philosophy & Society',
    readTime: '6 min read',
    clapsCount: 428,
    clapped: false,
    tipsTotal: 240,
    createdAt: '2026-11-01T14:00:00Z'
  },
  {
    id: 'art_2',
    authorId: 'user_cn_1',
    author: {
      displayName: 'Li Wei (李伟)',
      username: 'li_wei',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      countryCode: 'CN'
    },
    title: 'Modern Timber & Biophilic Architecture for 21st-Century Megacities',
    summary: 'A deep dive into cross-laminated timber, passive airflow, and centuries of Chinese mortise-and-tenon craftsmanship.',
    content: `For thousands of years, ancient master carpenters built pagodas that survived 8.0-magnitude earthquakes without a single metal nail. The secret lies in flexible mortise and tenon joints that dissipate seismic kinetic energy.

Today, combining this ancestral heritage with satellite parametric modeling and engineered timber allows us to build carbon-negative skyscrapers. By returning to biological materials, our cities transform from concrete canyons into breathing vertical forests.`,
    coverUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1000&auto=format&fit=crop&q=80',
    category: 'Architecture & Nature',
    readTime: '8 min read',
    clapsCount: 312,
    clapped: true,
    tipsTotal: 180,
    createdAt: '2026-10-28T10:30:00Z'
  }
];

export const SEED_VIDEOS: VideoItem[] = [
  {
    id: 'vid_1',
    creatorId: 'user_jo_1',
    creator: {
      displayName: 'Tariq Al-Hashemi',
      username: 'tariq_amman',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      countryCode: 'JO'
    },
    title: 'Wadi Rum at Twilight: The Martian Wonder of Jordan',
    description: 'Cinematic journey through the towering sandstone monoliths and Bedouin night fires under millions of stars.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1547234935-80c7145ec969?w=800&auto=format&fit=crop&q=80',
    duration: '03:45',
    viewsCount: 14200,
    likesCount: 1850,
    liked: false,
    category: 'Travel & Nature',
    countryName: 'Jordan',
    createdAt: '2026-10-30T16:00:00Z'
  },
  {
    id: 'vid_2',
    creatorId: 'user_es_1',
    creator: {
      displayName: 'Elena Gómez',
      username: 'elena_bcn',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      countryCode: 'ES'
    },
    title: 'Sculpting Light: Interactive Three.js Geometries in Barcelona',
    description: 'Behind the scenes at my studio exhibition exploring generative mathematics and glass reflection.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    duration: '04:12',
    viewsCount: 9800,
    likesCount: 1120,
    liked: true,
    category: 'Creative Arts',
    countryName: 'Spain',
    createdAt: '2026-11-02T12:00:00Z'
  }
];

export const SEED_COMMUNITIES: Community[] = [
  {
    id: 'comm_1',
    name: 'Global Polyglots & Language Exchange',
    slug: 'language-exchange',
    description: 'Learn Chinese, English, Arabic, Spanish, French, and Russian with native speakers powered by AI translation.',
    category: 'Education & Linguistics',
    membersCount: 4280,
    icon: '🗣️',
    banner: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
    isJoined: true,
    leaderName: 'Li Wei & Julien'
  },
  {
    id: 'comm_2',
    name: 'Earth Architecture & Regenerative Cities',
    slug: 'earth-architecture',
    description: 'Architects, engineers, and urbanists collaborating on climate-positive structures and bio-materials.',
    category: 'Architecture & Design',
    membersCount: 3120,
    icon: '🏛️',
    banner: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80',
    isJoined: false,
    leaderName: 'Li Wei'
  },
  {
    id: 'comm_3',
    name: 'Cosmology, Space & Astrophysics',
    slug: 'astrophysics-space',
    description: 'Discussing planetary science, space telescopes, quantum gravity, and stellar nucleosynthesis.',
    category: 'Science & Cosmos',
    membersCount: 5690,
    icon: '🌌',
    banner: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    isJoined: true,
    leaderName: 'Sarah Jenkins'
  },
  {
    id: 'comm_4',
    name: 'World Intellectual Games (Chess & Gomoku)',
    slug: 'intellectual-games',
    description: 'Daily tactics, classical masters analysis, international friendly tournaments, and strategy guides.',
    category: 'Games & Strategy',
    membersCount: 2940,
    icon: '♟️',
    banner: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=800&auto=format&fit=crop&q=80',
    isJoined: false,
    leaderName: 'Dmitry Volkov'
  }
];

export const SEED_ADS: Advertisement[] = [
  {
    id: 'ad_1',
    brand: 'Orbital Horizon Space Exploration',
    tagline: 'See Earth from 400km above. The Overview Effect changes everything.',
    description: 'Next-generation orbital scientific missions open for global research collaboration and civilian observers.',
    ctaText: 'Explore Mission',
    ctaUrl: '#',
    imageUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop&q=80',
    category: 'global',
    impressions: 12400,
    clicks: 890
  },
  {
    id: 'ad_2',
    brand: 'Silk & Desert Cultural Fellowship',
    tagline: 'Bridging heritage craftsmanship with artificial intelligence.',
    description: 'A global endowment supporting traditional artisans, calligraphers, and digital sculptors worldwide.',
    ctaText: 'Apply for Grant',
    ctaUrl: '#',
    imageUrl: 'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?w=600&auto=format&fit=crop&q=80',
    category: 'culture',
    impressions: 9800,
    clicks: 720
  }
];

// Persistent state holder
/**
 * Return a copy of a book with chapter bodies removed. Used by list/shelf
 * endpoints so they never ship megabytes of full text when only metadata is
 * needed. The reader fetches a single book by id to get full content.
 */
export function stripBookContent(book: Book): Book {
  return {
    ...book,
    chapters: (book.chapters || []).map(c => ({ id: c.id, title: c.title, content: '' }))
  };
}

class DataStore {
  private readonly writeMutex = new WriteMutex();

  /** Serialize an async state mutation (read-modify-write with awaits). */
  async mutate<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.writeMutex.runExclusive(fn);
  }

  users: User[] = [];
  posts: Post[] = [];
  articles: CreatorArticle[] = [];
  videos: VideoItem[] = [];
  communities: Community[] = [];
  conversations: Conversation[] = [];
  messages: ChatMessage[] = [];
  gameRooms: GameRoom[] = [];
  ads: Advertisement[] = [];
  countries: GlobeCountryStat[] = [];
  currentUser!: User;
  accounts: Map<string, AuthAccount> = new Map(); // keyed by email, username, and userId
  sessions: Map<string, string> = new Map(); // token -> userId

  // Digital Library & Ingestion collections
  books: Book[] = [];
  bookAnnotations: BookAnnotation[] = [];
  bookShelf: BookShelfItem[] = [];
  crawlerTasks: CrawlerTask[] = [];
  crawledPages: CrawledPage[] = [];
  browserBookmarks: BrowserBookmark[] = [];
  savedArticles: SavedArticle[] = [];

  // Social / messenger
  friendRequests: FriendRequest[] = [];
  blockedBy: Record<string, string[]> = {}; // userId -> blocked userIds
  securityAudit: SecurityAuditEvent[] = [];
  loginFailures: Record<string, { count: number; lockedUntil?: number; lastAt: number }> = {};

  // Notifications & preferences
  notifications: any[] = [];
  notificationPrefs: Record<string, any> = {};
  privacySettings: Record<string, any> = {};
  calls: any[] = [];

  // EARTH ONE native identity (permanent public ID). Sequence is monotonic and never reused.
  nextEarthSequence: number = 100001;
  /** Historical internal id -> permanent earthId mapping (compatibility). */
  earthIdMap: Record<string, string> = {};

  constructor() {
    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.initSeedData();
      this.saveToDisk();
    }
    // If for any reason books are empty, always seed them
    if (this.books.length === 0) {
      this.books = [...SEED_BOOKS];
      this.saveToDisk();
    }
  }

  // -------------------------------------------------------------------------
  // Book full-text content store (one JSON file per book)
  // -------------------------------------------------------------------------
  private bookContentFile(bookId: string): string {
    return path.join(BOOKS_DIR, `${bookId}.json`);
  }

  private writeBookContent(book: Book): void {
    const chapters = book.chapters || [];
    if (chapters.length === 0) return;
    try {
      fs.mkdirSync(BOOKS_DIR, { recursive: true });
      fs.writeFileSync(this.bookContentFile(book.id), JSON.stringify({ chapters }, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to write book content for ${book.id}:`, err);
    }
  }

  private loadBookContent(book: Book): Book {
    try {
      const p = this.bookContentFile(book.id);
      if (!fs.existsSync(p)) return book;
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data && Array.isArray(data.chapters)) book.chapters = data.chapters;
    } catch {
      // leave the in-memory book as-is on any read error
    }
    return book;
  }

  /**
   * Detect whether a book still carries inline chapter text (old format) so
   * it can be migrated into a content file.
   */
  private hasInlineContent(book: Book): boolean {
    return (book.chapters || []).some(c => (c.content || '').trim().length > 0);
  }

  saveToDisk(): void {
    try {
      this.persist();
    } catch (err) {
      console.error('Failed to save store to disk:', err);
    }
  }

  /**
   * Persist and surface errors to callers. Use for request-path writes where
   * failure must be reported.
   */
  persist(): void {
    const serializableAccounts: Record<string, AuthAccount> = {};
    this.accounts.forEach((acc, key) => {
      serializableAccounts[key] = acc;
    });

    const serializableSessions: Record<string, string> = {};
    this.sessions.forEach((userId, token) => {
      serializableSessions[token] = userId;
    });

    // Ensure any book that still carries inline full text (seed data or a
    // legacy server_data.json) is persisted to its own content file before
    // we strip it from the main store.
    for (const book of this.books) {
      if (this.hasInlineContent(book) && !fs.existsSync(this.bookContentFile(book.id))) {
        this.writeBookContent(book);
      }
    }

    // Serialize books as metadata only — chapter bodies live in per-book files.
    const booksMeta = this.books.map(stripBookContent);

    const payload = {
      users: this.users,
      posts: this.posts,
      articles: this.articles,
      videos: this.videos,
      communities: this.communities,
      conversations: this.conversations,
      messages: this.messages,
      gameRooms: this.gameRooms,
      ads: this.ads,
      countries: this.countries,
      books: booksMeta,
      bookAnnotations: this.bookAnnotations,
      bookShelf: this.bookShelf,
      crawlerTasks: this.crawlerTasks,
      crawledPages: this.crawledPages,
      browserBookmarks: this.browserBookmarks,
      savedArticles: this.savedArticles,
      friendRequests: this.friendRequests,
      blockedBy: this.blockedBy,
      securityAudit: this.securityAudit,
      loginFailures: this.loginFailures,
      notifications: this.notifications,
      notificationPrefs: this.notificationPrefs,
      privacySettings: this.privacySettings,
      calls: (this as any).calls || [],
      nextEarthSequence: this.nextEarthSequence,
      earthIdMap: this.earthIdMap,
      currentUser: this.currentUser,
      accounts: serializableAccounts,
      sessions: serializableSessions,
      lastSavedAt: new Date().toISOString()
    };

    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  }

  loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(DATA_FILE)) return false;
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.users) || data.users.length === 0) return false;

      this.users = data.users;
      this.posts = data.posts || [];
      this.articles = data.articles || [];
      this.videos = data.videos || [];
      this.communities = data.communities || [];
      this.conversations = data.conversations || [];
      this.messages = data.messages || [];
      this.gameRooms = data.gameRooms || [];
      this.ads = data.ads || [];
      this.countries = data.countries || [...SEED_COUNTRIES];
      this.books = data.books && data.books.length > 0 ? data.books : [...SEED_BOOKS];
      this.bookAnnotations = data.bookAnnotations || [];
      this.bookShelf = data.bookShelf || [];

      // Rehydrate full text from per-book content files. Books that still
      // carry inline content (legacy format) are migrated into files so the
      // next save can strip them from the main store.
      let migrated = false;
      this.books = this.books.map(book => {
        if (this.hasInlineContent(book)) {
          this.writeBookContent(book);
          migrated = true;
          return book;
        }
        return this.loadBookContent(book);
      });

      this.crawlerTasks = data.crawlerTasks && data.crawlerTasks.length > 0 ? data.crawlerTasks : [...SEED_CRAWLER_TASKS];
      this.crawledPages = data.crawledPages && data.crawledPages.length > 0 ? data.crawledPages : [...SEED_CRAWLED_PAGES];
      this.browserBookmarks = data.browserBookmarks || [];
      this.savedArticles = data.savedArticles || [];
      this.friendRequests = data.friendRequests || [];
      this.blockedBy = data.blockedBy || {};
      this.securityAudit = data.securityAudit || [];
      this.loginFailures = data.loginFailures || {};
      this.notifications = Array.isArray(data.notifications) ? data.notifications : [];
      this.notificationPrefs = data.notificationPrefs && typeof data.notificationPrefs === 'object' ? data.notificationPrefs : {};
      this.privacySettings = data.privacySettings && typeof data.privacySettings === 'object' ? data.privacySettings : {};
      (this as any).calls = Array.isArray(data.calls) ? data.calls : [];
      this.nextEarthSequence = Number.isFinite(data.nextEarthSequence) ? Math.max(100001, Math.floor(data.nextEarthSequence)) : 100001;
      this.earthIdMap = data.earthIdMap && typeof data.earthIdMap === 'object' ? data.earthIdMap : {};
      this.currentUser = data.currentUser || this.users[0];

      // Persist the now-stripped (metadata-only) main store once after migrating
      // legacy inline content, so server_data.json stops carrying full text.
      if (migrated) this.saveToDisk();

      // In-memory identity normalization for runtime safety (defaults only).
      // Does NOT persist historical earthId assignment to real data here.
      try { this.ensureAccountIdentityDefaults({ persist: false, assignMissingEarthIds: false }); } catch (e) { console.warn('Identity defaults normalization failed:', e); }

      this.accounts.clear();
      if (data.accounts) {
        Object.entries(data.accounts).forEach(([k, v]) => {
          this.accounts.set(k, v as AuthAccount);
        });
      }

      this.sessions.clear();
      if (data.sessions) {
        Object.entries(data.sessions).forEach(([token, userId]) => {
          this.sessions.set(token, userId as string);
        });
      }

      return true;
    } catch (err) {
      console.warn('Failed to load store from disk, falling back to seed:', err);
      return false;
    }
  }

  initSeedData(): void {
    this.users = [...SEED_USERS];
    this.posts = [...SEED_POSTS];
    this.articles = [...SEED_ARTICLES];
    this.videos = [...SEED_VIDEOS];
    this.communities = [...SEED_COMMUNITIES];
    this.ads = [...SEED_ADS];
    this.countries = [...SEED_COUNTRIES];
    this.books = [...SEED_BOOKS];
    this.bookAnnotations = [];
    this.crawlerTasks = [...SEED_CRAWLER_TASKS];
    this.crawledPages = [...SEED_CRAWLED_PAGES];
    this.browserBookmarks = [
      { id: 'bm_1', title: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov', category: 'Science', createdAt: new Date().toISOString() },
      { id: 'bm_2', title: 'Project Gutenberg', url: 'https://www.gutenberg.org', category: 'Library', createdAt: new Date().toISOString() },
      { id: 'bm_3', title: 'arXiv Astrophysics', url: 'https://arxiv.org/archive/astro-ph', category: 'Research', createdAt: new Date().toISOString() },
      { id: 'bm_4', title: 'Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu', category: 'Philosophy', createdAt: new Date().toISOString() }
    ];
    this.savedArticles = [];
    this.friendRequests = [];
    this.blockedBy = {};
    this.securityAudit = [];
    this.loginFailures = {};

    // Seed authentication accounts with default password 'password123'
    const defaultSalt = 'earth_one_salt_2026';
    const defaultHash = crypto.createHash('sha256').update('password123' + defaultSalt).digest('hex');

    this.users.forEach(u => {
      const email = `${u.username}@earthone.world`;
      u.email = email;
      u.hasCompletedOnboarding = true;
      const acc: AuthAccount = {
        userId: u.id,
        email,
        passwordHash: defaultHash,
        salt: defaultSalt
      };
      this.accounts.set(u.id, acc);
      this.accounts.set(email.toLowerCase(), acc);
      this.accounts.set(u.username.toLowerCase(), acc);
    });

    // Default logged in user (can switch or edit)
    this.currentUser = {
      id: 'current_user',
      username: 'cosmic_explorer',
      displayName: 'Global Citizen (世界公民)',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      bio: 'One Earth, One Humanity. Passionate about cross-cultural bridges, languages, and future technology.',
      location: {
        countryCode: 'CN',
        countryName: 'China',
        cityName: 'Shanghai',
        lat: 31.2304,
        lng: 121.4737,
        isPublic: true
      },
      interests: ['Global Peace', 'Languages', 'AI', 'Astronomy', 'Chess'],
      followersCount: 156,
      followingCount: 42,
      tipsReceived: 60,
      isOnline: true,
      verified: true,
      joinedAt: '2026-11-01'
    };

    // Add current user to users list
    this.users.unshift(this.currentUser);

    // Initial public chat rooms & conversations
    this.conversations = [
      {
        id: 'conv_global',
        type: 'global_channel',
        name: 'Earth One Global Lounge (全球交流大厅)',
        participantIds: this.users.map(u => u.id),
        lastMessage: 'Welcome to Earth One! Connect with citizens worldwide.',
        lastMessageTime: 'Just now'
      },
      {
        id: 'conv_direct_tariq',
        type: 'direct',
        name: 'Tariq Al-Hashemi',
        countryCode: 'JO',
        participantIds: ['current_user', 'user_jo_1'],
        otherUser: this.users.find(u => u.id === 'user_jo_1'),
        lastMessage: 'Ahlan wa sahlan! Welcome from Amman.',
        lastMessageTime: '10m ago',
        isOnline: true
      },
      {
        id: 'conv_direct_sarah',
        type: 'direct',
        name: 'Sarah Jenkins',
        countryCode: 'US',
        participantIds: ['current_user', 'user_us_1'],
        otherUser: this.users.find(u => u.id === 'user_us_1'),
        lastMessage: 'Did you see the latest James Webb spectra analysis?',
        lastMessageTime: '1h ago',
        isOnline: true
      },
      {
        id: 'conv_direct_dmitry',
        type: 'direct',
        name: 'Dmitry Volkov',
        countryCode: 'RU',
        participantIds: ['current_user', 'user_ru_1'],
        otherUser: this.users.find(u => u.id === 'user_ru_1'),
        lastMessage: 'Whenever you are ready for a chess game, invite me!',
        lastMessageTime: '2h ago',
        isOnline: true
      }
    ];

    this.messages = [
      {
        id: 'msg_1',
        conversationId: 'conv_global',
        senderId: 'user_cn_1',
        senderName: 'Li Wei (李伟)',
        senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        senderCountry: 'CN',
        content: '大家好！欢迎来到 EARTH ONE。从北京向全世界问好！',
        originalLanguage: 'zh',
        translatedContent: 'Hello everyone! Welcome to EARTH ONE. Greetings to the whole world from Beijing!',
        translatedTo: 'en',
        createdAt: '2026-11-03T08:00:00Z'
      },
      {
        id: 'msg_2',
        conversationId: 'conv_global',
        senderId: 'user_jo_1',
        senderName: 'Tariq Al-Hashemi (طارق)',
        senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        senderCountry: 'JO',
        content: 'أهلاً وسهلاً بالجميع من الأردن! يوم جميل يجمعنا معاً.',
        originalLanguage: 'ar',
        translatedContent: 'Welcome everyone from Jordan! A beautiful day bringing us all together.',
        translatedTo: 'en',
        createdAt: '2026-11-03T08:05:00Z'
      },
      {
        id: 'msg_3',
        conversationId: 'conv_global',
        senderId: 'user_us_1',
        senderName: 'Sarah Jenkins',
        senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        senderCountry: 'US',
        content: 'Spinning the 3D globe and seeing light nodes pulse in real time is mesmerizing! Greetings from San Francisco!',
        originalLanguage: 'en',
        translatedContent: '旋转3D地球并看到光节点实时脉动真是太迷人了！旧金山向大家问好！',
        translatedTo: 'zh',
        createdAt: '2026-11-03T08:12:00Z'
      },
      {
        id: 'msg_4',
        conversationId: 'conv_direct_tariq',
        senderId: 'user_jo_1',
        senderName: 'Tariq Al-Hashemi',
        senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        senderCountry: 'JO',
        content: 'Ahlan wa sahlan! Welcome to Earth One, my friend. Let me know if you want to explore the history of Amman and Petra.',
        originalLanguage: 'en',
        createdAt: '2026-11-03T08:30:00Z'
      }
    ];

    // Initial games
    this.gameRooms = [
      {
        id: 'game_1',
        gameSlug: 'chess',
        title: 'Friendly Grandmaster Blitz',
        host: {
          id: 'user_ru_1',
          displayName: 'Dmitry Volkov',
          countryCode: 'RU',
          avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80'
        },
        status: 'waiting',
        currentTurn: 'white',
        boardState: {}
      },
      {
        id: 'game_2',
        gameSlug: 'gomoku',
        title: 'Eastern Five-in-a-Row Arena',
        host: {
          id: 'user_cn_1',
          displayName: 'Li Wei',
          countryCode: 'CN',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
        },
        status: 'waiting',
        currentTurn: 'black',
        boardState: {}
      }
    ];
  }

  // Get active globe nodes for users with public location
  getGlobeNodes(): GlobeUserNode[] {
    return this.users
      .filter(u => u.location && u.location.isPublic)
      .map(u => ({
        id: `node_${u.id}`,
        userId: u.id,
        displayName: u.displayName,
        avatar: u.avatar,
        countryCode: u.location.countryCode,
        countryName: u.location.countryName,
        cityName: u.location.cityName,
        lat: u.location.lat,
        lng: u.location.lng,
        isOnline: u.isOnline,
        latestThought: u.bio
      }));
  }

  // Add a post
  addPost(data: Partial<Post>, authorUser?: User): Post {
    const author = authorUser || this.currentUser;
    const newPost: Post = {
      id: `post_${Date.now()}`,
      userId: author.id,
      author: {
        id: author.id,
        displayName: author.displayName,
        username: author.username,
        avatar: author.avatar,
        countryCode: author.location.countryCode,
        countryName: author.location.countryName,
        cityName: author.location.cityName,
        verified: author.verified
      },
      content: data.content || '',
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType || 'image',
      countryCode: author.location.countryCode,
      countryName: author.location.countryName,
      cityName: author.location.cityName,
      category: data.category || 'thought',
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      liked: false,
      saved: false,
      createdAt: new Date().toISOString(),
      comments: []
    };
    this.posts.unshift(newPost);
    this.saveToDisk();
    return newPost;
  }

  // Toggle like on a post
  togglePostLike(postId: string): { liked: boolean; likesCount: number } | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    post.liked = !post.liked;
    post.likesCount += post.liked ? 1 : -1;
    this.saveToDisk();
    return { liked: post.liked, likesCount: post.likesCount };
  }

  // Add comment to post
  addComment(postId: string, content: string, authorUser?: User): Post | null {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return null;
    const author = authorUser || this.currentUser;
    const newComment = {
      id: `c_${Date.now()}`,
      postId,
      userId: author.id,
      author: {
        id: author.id,
        displayName: author.displayName,
        username: author.username,
        avatar: author.avatar,
        countryCode: author.location.countryCode
      },
      content,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      liked: false
    };
    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    this.saveToDisk();
    return post;
  }

  // Send message
  sendMessage(
    conversationId: string,
    content: string,
    authorUser?: User,
    translatedContent?: string,
    translatedTo?: string,
    extra?: { attachments?: ChatMessage['attachments']; replyToId?: string; status?: ChatMessage['status']; clientMsgId?: string }
  ): ChatMessage {
    const author = authorUser || this.currentUser;
    const now = new Date().toISOString();

    // Idempotency: same sender+conversation+clientMsgId must not create duplicates
    if (extra?.clientMsgId) {
      const existing = this.messages.find(m => m.conversationId === conversationId && m.senderId === author.id && (m as any).clientMsgId === extra.clientMsgId);
      if (existing) return existing;
    }

    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      conversationId,
      senderId: author.id,
      senderName: author.displayName,
      senderAvatar: author.avatar,
      senderCountry: author.location?.countryCode || 'UN',
      content,
      translatedContent,
      translatedTo,
      createdAt: now,
      status: extra?.status || 'sent',
      deliveredTo: [],
      readBy: [author.id],
      deletedFor: [],
      attachments: extra?.attachments,
      replyToId: extra?.replyToId,
      clientMsgId: extra?.clientMsgId,
    } as any;
    this.messages.push(msg);

    const conv = this.conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.lastMessage = msg.recalled ? 'Message recalled' : (content || (msg.attachments?.length ? '[attachment]' : ''));
      conv.lastMessageTime = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      conv.lastMessageAt = now;
      conv.updatedAt = now;
    }
    this.saveToDisk();
    return msg;
  }

  static DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80';

  validateUsername(raw: string): { ok: true; username: string } | { ok: false; error: string } {
    const username = String(raw || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return { ok: false, error: 'Username must be 3-30 characters: letters, numbers, underscore.' };
    return { ok: true, username };
  }

  isUsernameTaken(username: string, excludeUserId?: string): boolean {
    const u = username.toLowerCase();
    if (this.users.some(x => x.id !== excludeUserId && String(x.username || '').toLowerCase() === u)) return true;
    const acc = this.accounts.get(u);
    if (acc && acc.userId !== excludeUserId) return true;
    return false;
  }

  getAvatarStorageDir(userId: string): string {
    const dir = path.join(AVATARS_DIR, userId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  clearCustomAvatarFiles(userId: string) {
    try {
      const dir = path.join(AVATARS_DIR, userId);
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        if (/^av_[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(f)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
    } catch {}
  }

  // Update current or target user profile (safe fields only). Never trust client for id/permissions.
  updateProfile(data: any, userId?: string): User {
    const targetId = userId || this.currentUser.id;
    const target = this.users.find(u => u.id === targetId);
    if (!target) throw new Error('User not found.');

    if (data && typeof data === 'object') {
      // display name
      if (Object.prototype.hasOwnProperty.call(data, 'displayName')) {
        const dn = String(data.displayName ?? '').trim();
        if (!dn) throw new Error('Display name cannot be empty.');
        if (dn.length > 40) throw new Error('Display name is too long (max 40).');
        target.displayName = dn;
      }
      // bio
      if (Object.prototype.hasOwnProperty.call(data, 'bio')) {
        const bio = String(data.bio ?? '').trim();
        if (bio.length > 300) throw new Error('Bio is too long (max 300).');
        target.bio = bio;
      }
      // username (unique, server-validated)
      if (Object.prototype.hasOwnProperty.call(data, 'username') && data.username !== undefined && data.username !== null) {
        const v = this.validateUsername(String(data.username));
        if (!v.ok) throw new Error(v.error);
        if (v.username !== String(target.username || '').toLowerCase()) {
          if (this.isUsernameTaken(v.username, target.id)) throw new Error('Username is already taken.');
          const oldUsername = String(target.username || '').toLowerCase();
          const acc = this.accounts.get(target.id) || (oldUsername ? this.accounts.get(oldUsername) : undefined);
          if (acc) {
            // remove old username key if it pointed to same account
            if (oldUsername && this.accounts.get(oldUsername)?.userId === target.id) this.accounts.delete(oldUsername);
            this.accounts.set(v.username, acc);
            // keep by userId and email/phone keys intact
            this.accounts.set(target.id, acc);
          }
          target.username = v.username;
        }
      }
      // location merge (existing behavior) but do not allow id/ownership changes
      if (data.location && typeof data.location === 'object') {
        const loc = { ...target.location, ...data.location };
        // never trust arbitrary coords unless resolved
        if (data.location.cityName || data.location.countryCode) {
          const coords = resolveCoordinates(loc.countryCode, loc.cityName);
          loc.lat = coords.lat;
          loc.lng = coords.lng;
        }
        target.location = loc;
      }
      // Explicitly ignore immutable/sensitive fields from client: id, email, phone, linkedIdentities, friendIds, blockedUserIds, verified, joinedAt, followers/following/tips, isOnline/lastActiveAt managed by server, etc.
      if (Object.prototype.hasOwnProperty.call(data, 'avatar') && typeof data.avatar === 'string') {
        // allow server/internal callers to set avatar URL; basic guard
        const av = data.avatar.trim();
        if (av) target.avatar = av;
      }
    }

    this.propagateUserProfile(target.id);
    if (this.currentUser.id === target.id) this.currentUser = target;
    this.saveToDisk();
    return target;
  }

  propagateUserProfile(userId: string) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return;
    // update message sender snapshots
    for (const m of this.messages) {
      if (m.senderId === userId) {
        m.senderName = u.displayName;
        m.senderAvatar = u.avatar;
        (m as any).senderCountry = u.location?.countryCode || (m as any).senderCountry;
      }
    }
    // update direct conversation snapshots
    for (const c of this.conversations) {
      if (c.type === 'direct' && Array.isArray(c.participantIds) && c.participantIds.includes(userId)) {
        // otherUser/name/isOnline are viewer-relative in getConversationsForUser; keep base updated where safe
        if (c.otherUser && c.otherUser.id === userId) {
          c.otherUser = { ...c.otherUser, id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, bio: u.bio, location: u.location, isOnline: (u as any).isOnline, lastActiveAt: (u as any).lastActiveAt, verified: u.verified, joinedAt: u.joinedAt } as any;
          c.name = u.displayName;
          c.isOnline = (u as any).isOnline;
        }
      }
    }
  }


  // -------------------------------------------------------------------------
  // EARTH ONE native identity (permanent public ID) & account status
  // -------------------------------------------------------------------------
  private normalizeEarthId(value: any): string | null {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    if (!/^earth_\d+$/.test(v)) return null;
    return v;
  }

  private earthSequenceFromId(earthId: string): number | null {
    const m = /^earth_(\d+)$/.exec(earthId);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  getAccountStatus(user: any): 'active' | 'suspended' | 'restricted' | 'deleted' {
    const s = user?.accountStatus;
    if (s === 'active' || s === 'suspended' || s === 'restricted' || s === 'deleted') return s;
    return 'active'; // legacy/default safety: do not lock out existing accounts
  }

  isAccountUsable(user: any): boolean {
    return this.getAccountStatus(user) === 'active' || this.getAccountStatus(user) === 'restricted';
  }

  canLoginAccount(user: any): boolean {
    return this.getAccountStatus(user) === 'active';
  }

  private rebuildEarthIdIndex() {
    let maxSeq = 100000;
    const used = new Set<string>();
    for (const u of this.users) {
      const eid = this.normalizeEarthId((u as any).earthId);
      if (eid) {
        (u as any).earthId = eid;
        const seq = this.earthSequenceFromId(eid);
        if (seq != null && seq > maxSeq) maxSeq = seq;
        used.add(eid);
        if (u.id) this.earthIdMap[u.id] = eid;
      }
    }
    // also honor explicit map entries if consistent
    if (this.earthIdMap && typeof this.earthIdMap === 'object') {
      for (const [uid, val] of Object.entries(this.earthIdMap)) {
        const eid = this.normalizeEarthId(val);
        if (!eid || used.has(eid)) continue;
        const u = this.users.find(x => x.id === uid);
        if (u && !(u as any).earthId) {
          (u as any).earthId = eid;
          used.add(eid);
          const seq = this.earthSequenceFromId(eid);
          if (seq != null && seq > maxSeq) maxSeq = seq;
        }
      }
    }
    this.nextEarthSequence = Math.max(this.nextEarthSequence || 100001, maxSeq + 1, 100001);
  }

  /** Deterministic, idempotent assignment for users missing earthId. Never reuses IDs. */
  ensureEarthIdsForAll(opts?: { persist?: boolean; backupPath?: string }) {
    const persist = !!opts?.persist;
    const backupPath = opts?.backupPath;
    const before = JSON.stringify({ map: this.earthIdMap, next: this.nextEarthSequence, ids: this.users.map(u => ({ id: u.id, earthId: (u as any).earthId })) });
    this.rebuildEarthIdIndex();
    const used = new Set<string>(this.users.map(u => this.normalizeEarthId((u as any).earthId)).filter(Boolean) as string[]);
    const missing = this.users.filter(u => !this.normalizeEarthId((u as any).earthId));
    // deterministic: by joinedAt, then createdAt-like in id, then internal id
    missing.sort((a,b) => {
      const ta = new Date((a as any).joinedAt || 0).getTime();
      const tb = new Date((b as any).joinedAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
    let seq = Math.max(this.nextEarthSequence || 100001, 100001);
    const assigned: Array<{ id: string; earthId: string }> = [];
    for (const u of missing) {
      let eid = `earth_${seq++}`;
      while (used.has(eid)) eid = `earth_${seq++}`;
      (u as any).earthId = eid;
      used.add(eid);
      this.earthIdMap[u.id] = eid;
      assigned.push({ id: u.id, earthId: eid });
    }
    this.nextEarthSequence = Math.max(this.nextEarthSequence || 100001, seq);
    // ensure map complete
    for (const u of this.users) {
      const eid = this.normalizeEarthId((u as any).earthId);
      if (eid) this.earthIdMap[u.id] = eid;
    }
    const after = JSON.stringify({ map: this.earthIdMap, next: this.nextEarthSequence, ids: this.users.map(u => ({ id: u.id, earthId: (u as any).earthId })) });
    const changed = before !== after;
    if (changed && persist) {
      // optional backup before mutating real data file
      if (backupPath) {
        try {
          const dir = path.dirname(backupPath);
          fs.mkdirSync(dir, { recursive: true });
          if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, backupPath);
        } catch (e) {
          throw new Error(`Backup failed: ${(e as any)?.message || e}`);
        }
      }
      this.saveToDisk();
    }
    return { changed, assignedCount: assigned.length, assigned, nextEarthSequence: this.nextEarthSequence };
  }

  /** Ensure defaults; earthId assignment can be done in-memory only unless persist requested. */
  ensureAccountIdentityDefaults(opts?: { persist?: boolean; assignMissingEarthIds?: boolean; backupPath?: string }) {
    const persist = !!opts?.persist;
    const assignMissingEarthIds = opts?.assignMissingEarthIds !== false;
    let changed = false;
    for (const u of this.users) {
      const st = this.getAccountStatus(u);
      if ((u as any).accountStatus !== st) { (u as any).accountStatus = st; changed = true; }
    }
    this.rebuildEarthIdIndex();
    let migration: any = { changed: false, assignedCount: 0 };
    if (assignMissingEarthIds) {
      migration = this.ensureEarthIdsForAll({ persist: false });
      if (migration.changed) changed = true;
    }
    // keep currentUser in sync
    if (this.currentUser?.id) {
      const cu = this.users.find(u => u.id === this.currentUser.id);
      if (cu) this.currentUser = { ...this.currentUser, earthId: (cu as any).earthId, accountStatus: this.getAccountStatus(cu) } as any;
    }
    if (changed && persist) this.saveToDisk();
    return { changed, migration };
  }

  allocateEarthId(): string {
    this.rebuildEarthIdIndex();
    const used = new Set<string>(this.users.map(u => this.normalizeEarthId((u as any).earthId)).filter(Boolean) as string[]);
    let seq = Math.max(this.nextEarthSequence || 100001, 100001);
    let eid = `earth_${seq++}`;
    while (used.has(eid)) eid = `earth_${seq++}`;
    this.nextEarthSequence = seq;
    return eid;
  }

  findUserByEarthId(earthId: string): User | null {
    const eid = this.normalizeEarthId(earthId);
    if (!eid) return null;
    return this.users.find(u => this.normalizeEarthId((u as any).earthId) === eid) || null;
  }

  getPublicEarthProfile(userId: string) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return null;
    return { id: u.id, earthId: (u as any).earthId, username: u.username, displayName: u.displayName, avatar: u.avatar, accountStatus: this.getAccountStatus(u), joinedAt: u.joinedAt, verified: !!u.verified };
  }

  getAccountMe(userId: string) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return null;
    const linked = Array.isArray(u.linkedIdentities) ? u.linkedIdentities.map(i => ({
      provider: i.provider,
      linked: !!i.providerUserId,
      displayName: i.displayName,
      // safe summary only; do not expose raw external provider IDs/tokens
      email: i.provider === 'email' ? i.email : undefined,
      phone: i.provider === 'phone' ? i.phone : undefined,
      linkedAt: i.linkedAt,
    })) : [];
    return {
      id: u.id,
      earthId: (u as any).earthId,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      accountStatus: this.getAccountStatus(u),
      createdAt: u.joinedAt,
      joinedAt: u.joinedAt,
      email: u.email,
      phone: (u as any).phone,
      verified: !!u.verified,
      linkedIdentities: linked,
      hasCompletedOnboarding: !!u.hasCompletedOnboarding,
    };
  }

  getSelfProfileView(userId: string) {
    const u = this.users.find(x => x.id === userId);
    if (!u) return null;
    const acc = this.accounts.get(userId);
    const linked = Array.isArray(u.linkedIdentities) ? u.linkedIdentities.map(i => ({
      provider: i.provider,
      linked: !!i.providerUserId,
      displayName: i.displayName,
      email: i.provider === 'email' ? i.email : undefined,
      phone: i.provider === 'phone' ? i.phone : undefined,
      linkedAt: i.linkedAt,
    })) : [];
    return {
      id: u.id,
      earthId: (u as any).earthId,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      banner: u.banner,
      bio: u.bio,
      location: u.location,
      interests: u.interests || [],
      followersCount: u.followersCount,
      followingCount: u.followingCount,
      tipsReceived: u.tipsReceived,
      isOnline: !!(u as any).isOnline,
      lastActiveAt: (u as any).lastActiveAt,
      verified: !!u.verified,
      joinedAt: u.joinedAt,
      createdAt: u.joinedAt,
      accountStatus: this.getAccountStatus(u),
      email: u.email,
      phone: (u as any).phone,
      emailVerified: !!(u as any).emailVerified,
      phoneVerified: !!(u as any).phoneVerified,
      linkedIdentities: linked,
      hasPassword: !!acc,
      bindingStatus: {
        email: { bound: !!u.email, verified: !!(u as any).emailVerified, value: u.email || null },
        phone: { bound: !!(u as any).phone, verified: !!(u as any).phoneVerified, value: (u as any).phone || null },
        google: { bound: linked.some(i => i.provider === 'google') },
        wechat: { bound: linked.some(i => i.provider === 'wechat') },
      }
    };
  }
  getPublicProfileView(viewerId: string, targetId: string) {
    const u = this.users.find(x => x.id === targetId);
    if (!u) return null;
    const isSelf = viewerId === targetId;
    if (isSelf) return this.getSelfProfileView(targetId);
    const isFriend = this.getFriendIds(viewerId).includes(targetId);
    const blockedEither = (this.blockedBy[viewerId]||[]).includes(targetId) || (this.blockedBy[targetId]||[]).includes(viewerId);
    const priv = this.getPrivacySettings(targetId);
    const canView = canViewProfileByPolicy(false, isFriend, blockedEither, priv);
    const pending = this.friendRequests.find(r => r.status==='pending' && ((r.fromUserId===viewerId && r.toUserId===targetId) || (r.fromUserId===targetId && r.toUserId===viewerId))) || null;
    if (!canView) {
      // minimal shell for existing friends/chat contexts handled elsewhere; do not leak hidden profile fields
      return {
        user: {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
          bio: '',
          isOnline: false,
          lastActiveAt: undefined,
          joinedAt: undefined,
          verified: !!u.verified,
        },
        isSelf, isFriend, blocked: blockedEither, pendingRequest: pending, restricted: true,
      } as any;
    }
    const loc = u.location ? {
      countryCode: u.location.countryCode,
      countryName: u.location.countryName,
      cityName: u.location.cityName,
      isPublic: u.location.isPublic,
      lat: u.location.isPublic ? u.location.lat : 0,
      lng: u.location.isPublic ? u.location.lng : 0,
    } : null;
    return {
      user: {
        id: u.id,
        earthId: (u as any).earthId,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        banner: u.banner,
        bio: u.bio,
        location: loc,
        interests: u.interests || [],
        followersCount: u.followersCount,
        followingCount: u.followingCount,
        isOnline: priv.showOnlineStatus ? !!(u as any).isOnline : false,
        lastActiveAt: priv.showLastActive ? (u as any).lastActiveAt : undefined,
        verified: !!u.verified,
        joinedAt: u.joinedAt,
        createdAt: u.joinedAt,
        accountStatus: this.getAccountStatus(u),
      },
      isSelf, isFriend, blocked: blockedEither, pendingRequest: pending, restricted: false,
    } as any;
  }

  getProfileUpdateRecipients(userId: string): string[] {
    const set = new Set<string>([userId]);
    for (const fid of this.getFriendIds(userId)) set.add(fid);
    for (const c of this.conversations) {
      if (Array.isArray(c.participantIds) && c.participantIds.includes(userId)) {
        for (const pid of c.participantIds) set.add(pid);
      }
    }
    return Array.from(set);
  }

  // Password hashing — scrypt (memory-hard), stored as a self-contained
  // `scrypt$salt$hash` string so verification needs no separate salt lookup.
  // Legacy accounts use plain SHA-256 hex and are transparently upgraded on
  // their next successful login.
  hashPassword(password: string, salt: string): string {
    const derived = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  verifyPassword(password: string, acc: AuthAccount): boolean {
    if (acc.passwordHash.startsWith('scrypt$')) {
      const parts = acc.passwordHash.split('$');
      if (parts.length !== 3) return false;
      const derived = crypto.scryptSync(password, parts[1], 64).toString('hex');
      return derived === parts[2];
    }
    // Legacy SHA-256 hash
    const legacy = crypto.createHash('sha256').update(password + acc.salt).digest('hex');
    return legacy === acc.passwordHash;
  }

  // Register new citizen
  registerUser(email: string, password: string, displayName?: string, username?: string): { user: User; token: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (this.accounts.has(cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const cleanUsername = (username || cleanEmail.split('@')[0] || `citizen_${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    if (this.accounts.has(cleanUsername)) {
      throw new Error('This username is already taken. Please choose another.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const token = crypto.randomBytes(32).toString('hex');
    const earthId = this.allocateEarthId();

    const newUser: User = {
      id: userId,
      earthId,
      accountStatus: 'active',
      email: cleanEmail,
      username: cleanUsername,
      displayName: displayName || cleanUsername,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      bio: 'New citizen exploring Earth One.',
      location: {
        countryCode: 'CN',
        countryName: 'China',
        cityName: 'Beijing',
        lat: 39.9042,
        lng: 116.4074,
        isPublic: true
      },
      interests: ['Global Dialogue', 'Astronomy', 'Culture'],
      followersCount: 1,
      followingCount: 1,
      tipsReceived: 0,
      isOnline: true,
      verified: false,
      joinedAt: new Date().toISOString(),
      hasCompletedOnboarding: false // Triggers onboarding flow!
    } as any;

    const acc: AuthAccount = {
      userId,
      email: cleanEmail,
      passwordHash,
      salt,
      token
    };

    this.users.unshift(newUser);
    this.accounts.set(userId, acc);
    this.accounts.set(cleanEmail, acc);
    this.accounts.set(cleanUsername, acc);
    this.sessions.set(token, userId);
    if ((newUser as any).earthId) this.earthIdMap[userId] = (newUser as any).earthId;

    this.currentUser = newUser;
    this.saveToDisk();
    return { user: newUser, token };
  }

  // Login citizen
  loginUser(identifier: string, password: string): { user: User; token: string } {
    const cleanId = identifier.trim().toLowerCase();
    const acc = this.accounts.get(cleanId);
    if (!acc) {
      throw new Error('Invalid email/username or password.');
    }

    if (!this.verifyPassword(password, acc)) {
      throw new Error('Invalid email/username or password.');
    }

    // Transparently upgrade legacy SHA-256 hashes to scrypt on successful login
    if (!acc.passwordHash.startsWith('scrypt$')) {
      acc.passwordHash = this.hashPassword(password, acc.salt);
    }

    const user = this.users.find(u => u.id === acc.userId);
    if (!user) {
      throw new Error('User profile record not found.');
    }
    const status = this.getAccountStatus(user);
    if (status === 'suspended') throw new Error('Account is suspended.');
    if (status === 'deleted') throw new Error('Account is not available.');
    // restricted may login but features limited by server policies elsewhere

    const token = crypto.randomBytes(32).toString('hex');
    acc.token = token;
    this.sessions.set(token, user.id);
    user.isOnline = true;
    this.currentUser = user;
    this.saveToDisk();

    return { user, token };
  }

  // Get user by session token
  getUserByToken(token: string): User | null {
    const userId = this.sessions.get(token);
    if (!userId) return null;
    const u = this.users.find(x => x.id === userId) || null;
    if (!u) return null;
    const st = this.getAccountStatus(u);
    if (st === 'suspended' || st === 'deleted') return null;
    return u;
  }

  // Complete profile onboarding wizard
  completeOnboarding(userId: string, data: {
    username?: string;
    displayName?: string;
    avatar?: string;
    countryCode?: string;
    countryName?: string;
    cityName?: string;
    isPublic?: boolean;
    bio?: string;
    interests?: string[];
  }): User {
    const user = this.users.find(u => u.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (data.username && data.username !== user.username) {
      const cleanUser = data.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const existing = this.accounts.get(cleanUser);
      if (existing && existing.userId !== user.id) {
        throw new Error('Username is already taken.');
      }
      user.username = cleanUser;
      const acc = this.accounts.get(user.id);
      if (acc) {
        this.accounts.set(cleanUser, acc);
      }
    }

    if (data.displayName) user.displayName = data.displayName.trim();
    if (data.avatar) user.avatar = data.avatar;
    if (data.bio) user.bio = data.bio.trim();
    if (data.interests && Array.isArray(data.interests)) user.interests = data.interests;

    // Resolve geographic coordinates
    const countryCode = data.countryCode || user.location.countryCode;
    const countryName = data.countryName || user.location.countryName;
    const cityName = data.cityName || user.location.cityName;
    const isPublic = data.isPublic !== undefined ? data.isPublic : true;
    const coords = resolveCoordinates(countryCode, cityName);

    user.location = {
      countryCode,
      countryName,
      cityName,
      lat: coords.lat,
      lng: coords.lng,
      isPublic
    };

    user.hasCompletedOnboarding = true;

    if (this.currentUser.id === user.id) {
      this.currentUser = user;
    }

    this.saveToDisk();
    return user;
  }


  getOrCreateDirectConversation(currentUserId: string, targetUserId: string): Conversation | null {
    if (!targetUserId || currentUserId === targetUserId) return null;
    const target = this.users.find(u => u.id === targetUserId);
    if (!target) return null;
    let conv = this.conversations.find(c => c.type === 'direct' && c.participantIds.includes(currentUserId) && c.participantIds.includes(targetUserId));
    if (!conv) {
      conv = {
        id: `conv_direct_${[currentUserId, targetUserId].sort().join('_')}`,
        type: 'direct',
        name: target.displayName,
        countryCode: target.location.countryCode,
        participantIds: [currentUserId, targetUserId],
        otherUser: target,
        lastMessage: 'Conversation opened',
        lastMessageTime: new Date().toISOString(),
        isOnline: target.isOnline,
        channel: 'earthone'
      };
      this.conversations.unshift(conv);
      this.saveToDisk();
    } else {
      conv.otherUser = target;
      conv.isOnline = target.isOnline;
      conv.name = target.displayName;
    }
    return conv;
  }

  getUnreadCountForUser(conversationId: string, userId: string): number {
    return this.messages.filter(m =>
      m.conversationId === conversationId &&
      m.senderId !== userId &&
      !m.recalled &&
      !(m.deletedFor || []).includes(userId) &&
      !(m.readBy || []).includes(userId)
    ).length;
  }

  private getConversationOtherUserView(viewerId: string, other: any) {
    if (!other) return undefined;
    const view = this.getPublicProfileView(viewerId, other.id) as any;
    const base = view?.user || {};
    const priv = this.getPrivacySettings(other.id);
    const pres = this.getMaskedPresenceForViewer(viewerId, other.id);
    const loc = base.location || (other.location ? {
      countryCode: other.location.countryCode,
      countryName: other.location.countryName,
      cityName: other.location.cityName,
      isPublic: !!other.location.isPublic,
      lat: other.location.isPublic ? other.location.lat : 0,
      lng: other.location.isPublic ? other.location.lng : 0,
    } : undefined);
    // Minimal safe shape for conversation list/detail consumers (no email/phone/linkedIdentities/friendIds/internal fields)
    return {
      id: base.id || other.id,
      earthId: base.earthId || (other as any).earthId,
      username: base.username || other.username,
      displayName: base.displayName || other.displayName,
      avatar: base.avatar || other.avatar,
      bio: typeof base.bio === 'string' ? base.bio : '',
      location: loc,
      interests: Array.isArray(base.interests) ? base.interests : [],
      followersCount: typeof base.followersCount === 'number' ? base.followersCount : (other.followersCount || 0),
      followingCount: typeof base.followingCount === 'number' ? base.followingCount : (other.followingCount || 0),
      tipsReceived: typeof base.tipsReceived === 'number' ? base.tipsReceived : (other.tipsReceived || 0),
      isOnline: !!pres.isOnline,
      lastActiveAt: pres.lastActiveAt,
      verified: !!(base.verified ?? other.verified),
      joinedAt: base.joinedAt || other.joinedAt,
      accountStatus: base.accountStatus || this.getAccountStatus(other),
    } as any;
  }

  getConversationsForUser(userId: string): Conversation[] {
    return this.conversations
      .filter(c => c.type === 'global_channel' || c.type === 'country_room' || (Array.isArray(c.participantIds) && c.participantIds.includes(userId)))
      .map(c => {
        if (c.type === 'direct') {
          const otherId = c.participantIds.find(id => id !== userId);
          const other = otherId ? this.users.find(u => u.id === otherId) : undefined;
          const unread = this.getUnreadCountForUser(c.id, userId);
          const otherMasked = this.getConversationOtherUserView(userId, other);
          return { ...c, name: otherMasked?.displayName || c.name, avatar: otherMasked?.avatar || c.avatar, otherUser: otherMasked as any, isOnline: !!otherMasked?.isOnline, unreadCount: unread };
        }
        if (c.type === 'group') {
          const unread = this.getUnreadCountForUser(c.id, userId);
          return { ...c, unreadCount: unread };
        }
        return c;
      })
      .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0).getTime() - new Date(a.lastMessageAt || a.updatedAt || 0).getTime());
  }

  linkIdentity(userId: string, identity: LinkedIdentity): User {
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    const list = user.linkedIdentities || [];
    const idx = list.findIndex(i => i.provider === identity.provider);
    if (idx >= 0) list[idx] = identity; else list.push(identity);
    user.linkedIdentities = list;
    this.saveToDisk();
    return user;
  }

  findUserByLinkedIdentity(provider: LinkedIdentity['provider'], providerUserId: string): User | null {
    return this.users.find(u => (u.linkedIdentities || []).some(i => i.provider === provider && i.providerUserId === providerUserId)) || null;
  }

  createOrLoginOAuthUser(params: { provider: any; providerUserId: string; email?: string; displayName?: string; avatar?: string; bindToUserId?: string; allowCreate?: boolean }): { user: User; token: string; linkedExisting?: boolean } {
    const { provider, providerUserId, email, displayName, avatar, bindToUserId, allowCreate } = params;
    if (bindToUserId) {
      const target = this.users.find(u => u.id === bindToUserId);
      if (!target) throw new Error('User not found');
      const st = this.getAccountStatus(target);
      if (st === 'suspended' || st === 'deleted') throw new Error('Account is not available.');
      const owner = this.findUserByLinkedIdentity(provider, providerUserId);
      if (owner && owner.id !== target.id) throw new Error('This external identity is already linked to another account.');
      const identity: any = { provider, providerUserId, displayName, email, avatar, linkedAt: new Date().toISOString() };
      this.upsertLinkedIdentity(target, identity);
      const token = crypto.randomBytes(32).toString('hex');
      this.sessions.set(token, target.id);
      target.isOnline = true; (target as any).lastActiveAt = new Date().toISOString();
      this.currentUser = target; this.saveToDisk();
      return { user: target, token, linkedExisting: true };
    }

    let user: User | null = this.findUserByLinkedIdentity(provider, providerUserId) || null;
    if (!user) {
      // Security: never auto-bind unknown external identity to someone else's account and
      // never auto-create/login unbound external accounts for direct OAuth login.
      if (!allowCreate) {
        throw new Error('UNBOUND_EXTERNAL_IDENTITY');
      }
      // Explicit creation path only (not used for direct public OAuth login callbacks).
      const base = (displayName || email?.split('@')[0] || `${provider}_user`).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || provider;
      let username = base; let n = 1;
      while (this.accounts.has(username) || this.users.some(u => u.username === username)) { username = `${base}_${n++}`; }
      const userId = `user_${provider}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const earthId = this.allocateEarthId();
      const created: User = {
        id: userId,
        earthId,
        accountStatus: 'active',
        username,
        displayName: displayName || username,
        email,
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
        bio: 'Citizen exploring Earth One.',
        location: { countryCode: 'UN', countryName: 'Global', cityName: 'Earth', lat: 0, lng: 0, isPublic: true },
        interests: ['Global Dialogue', 'Culture'],
        followersCount: 1, followingCount: 1, tipsReceived: 0,
        isOnline: true, verified: false, joinedAt: new Date().toISOString(), hasCompletedOnboarding: false,
        linkedIdentities: []
      } as any;
      this.users.unshift(created);
      const salt = crypto.randomBytes(16).toString('hex');
      const acc: AuthAccount = { userId, email: (email || `${username}@earthone.local`).toLowerCase(), passwordHash: this.hashPassword(crypto.randomBytes(24).toString('hex'), salt), salt };
      this.accounts.set(userId, acc);
      this.accounts.set(acc.email, acc);
      this.accounts.set(username, acc);
      this.earthIdMap[userId] = earthId;
      user = created;
    }
    const ensured = user as User;
    const st = this.getAccountStatus(ensured);
    if (st === 'suspended') throw new Error('Account is suspended.');
    if (st === 'deleted') throw new Error('Account is not available.');
    const identity: any = { provider, providerUserId, displayName, email, avatar, linkedAt: new Date().toISOString() };
    this.upsertLinkedIdentity(ensured, identity);
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, ensured.id);
    ensured.isOnline = true; (ensured as any).lastActiveAt = new Date().toISOString();
    this.currentUser = ensured;
    this.saveToDisk();
    return { user: ensured, token };
  }


  // ---------------- Social / Friends / Messaging helpers ----------------
  addAudit(userId: string | undefined, type: string, detail?: string, ip?: string) {
    const ev: SecurityAuditEvent = { id: `aud_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, userId, type, detail, ip, createdAt: new Date().toISOString() };
    this.securityAudit.unshift(ev);
    if (this.securityAudit.length > 500) this.securityAudit.length = 500;
  }

  publicUser(u: User): User {
    // minimal public projection helper (store-level)
    const { linkedIdentities, friendIds, blockedUserIds, email, phone, emailVerified, phoneVerified, ...rest } = u as any;
    return { ...rest, email: undefined, phone: undefined } as User;
  }

  searchUsers(query: string, viewerId?: string, limit = 30): User[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = q.replace(/^@+/, '');
    const digitsOnly = q.replace(/\D/g, '');
    const blocked = viewerId ? (this.blockedBy[viewerId] || []) : [];
    const matches = this.users.filter(u => {
      if (viewerId && u.id === viewerId) return false;
      if (blocked.includes(u.id)) return false;
      const theirs = this.blockedBy[u.id] || [];
      if (viewerId && theirs.includes(viewerId)) return false;
      const st = this.getAccountStatus(u);
      if (st === 'deleted') return false;
      const priv = this.getPrivacySettings(u.id);
      const earthId = String((u as any).earthId || '').toLowerCase();
      const email = String((u as any).email || '').toLowerCase();
      const phone = String((u as any).phone || '').replace(/\D/g, '');
      const byField = canSearchByField(q, { id: u.id, username: u.username, displayName: u.displayName }, priv);
      const byEarthId = !!earthId && !!cleanQ && earthId.includes(cleanQ);
      const byEmail = q.includes('@') && !q.startsWith('@') && !!email && email === q;
      const byPhone = digitsOnly.length >= 6 && !!phone && phone.endsWith(digitsOnly);
      if (!byField && !byEarthId && !byEmail && !byPhone) return false;
      const isFriend = viewerId ? this.getFriendIds(viewerId).includes(u.id) : false;
      if (!canViewProfileByPolicy(false, isFriend, false, priv)) return false;
      return true;
    });
    matches.sort((a, b) => {
      const aReg = !a.id.startsWith('u_') ? 1 : 0;
      const bReg = !b.id.startsWith('u_') ? 1 : 0;
      if (aReg !== bReg) return bReg - aReg;
      return (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
    });
    return matches.slice(0, limit);
  }

  getFriendIds(userId: string): string[] {
    const u = this.users.find(x => x.id === userId);
    return Array.isArray(u?.friendIds) ? u!.friendIds! : [];
  }

  sendFriendRequest(fromUserId: string, toUserId: string, message?: string): FriendRequest {
    const perm = this.canSendFriendRequestFrom(fromUserId, toUserId);
    if (!perm.ok) throw new Error(perm.error || 'Cannot send friend request.');
    const existing = this.friendRequests.find(r => r.fromUserId === fromUserId && r.toUserId === toUserId && r.status === 'pending');
    if (existing) return existing;
    const reverse = this.friendRequests.find(r => r.fromUserId === toUserId && r.toUserId === fromUserId && r.status === 'pending');
    if (reverse) { return this.respondFriendRequest(reverse.id, toUserId, true); }
    const req: FriendRequest = { id: `fr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, fromUserId, toUserId, status: 'pending', message, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.friendRequests.unshift(req);
    this.saveToDisk();
    return req;
  }

  respondFriendRequest(requestId: string, actorUserId: string, accept: boolean): FriendRequest {
    const req = this.friendRequests.find(r => r.id === requestId);
    if (!req) throw new Error('Friend request not found');
    if (req.toUserId !== actorUserId) throw new Error('Forbidden');
    if (req.status !== 'pending') return req;
    req.status = accept ? 'accepted' : 'rejected';
    req.updatedAt = new Date().toISOString();
    if (accept) {
      const a = this.users.find(u => u.id === req.fromUserId);
      const b = this.users.find(u => u.id === req.toUserId);
      if (a) { a.friendIds = Array.from(new Set([...(a.friendIds||[]), req.toUserId])); }
      if (b) { b.friendIds = Array.from(new Set([...(b.friendIds||[]), req.fromUserId])); }
    }
    this.saveToDisk();
    return req;
  }

  removeFriend(userId: string, otherUserId: string) {
    const a = this.users.find(u => u.id === userId);
    const b = this.users.find(u => u.id === otherUserId);
    if (a) a.friendIds = (a.friendIds||[]).filter(id => id !== otherUserId);
    if (b) b.friendIds = (b.friendIds||[]).filter(id => id !== userId);
    this.saveToDisk();
  }

  blockUser(userId: string, otherUserId: string) {
    if (userId === otherUserId) return;
    const list = this.blockedBy[userId] || [];
    if (!list.includes(otherUserId)) list.push(otherUserId);
    this.blockedBy[userId] = list;
    this.removeFriend(userId, otherUserId);
    // cancel pending friend requests between them
    for (const r of this.friendRequests) {
      if (r.status !== 'pending') continue;
      if ((r.fromUserId === userId && r.toUserId === otherUserId) || (r.fromUserId === otherUserId && r.toUserId === userId)) {
        r.status = 'rejected'; r.updatedAt = new Date().toISOString();
      }
    }
    this.saveToDisk();
  }

  unblockUser(userId: string, otherUserId: string) {
    this.blockedBy[userId] = (this.blockedBy[userId]||[]).filter(id => id !== otherUserId);
    this.saveToDisk();
  }

  canAccessConversation(userId: string, conv: Conversation): boolean {
    if (!conv) return false;
    if (conv.type === 'global_channel' || conv.type === 'country_room') return true;
    return Array.isArray(conv.participantIds) && conv.participantIds.includes(userId);
  }

  ensureMessageDefaults(msg: ChatMessage): ChatMessage {
    if (!msg.status) msg.status = 'sent';
    if (!Array.isArray(msg.deliveredTo)) msg.deliveredTo = [];
    if (!Array.isArray(msg.readBy)) msg.readBy = [];
    if (!Array.isArray(msg.deletedFor)) msg.deletedFor = [];
    return msg;
  }



  markConversationRead(conversationId: string, userId: string, opts?: { allowReadReceipt?: boolean }) {
    const now = new Date().toISOString();
    const allowReadReceipt = opts?.allowReadReceipt ?? this.shouldSendReadReceipt(userId);
    let changed = false;
    for (const m of this.messages) {
      if (m.conversationId !== conversationId) continue;
      if (m.senderId === userId) continue;
      if ((m as any).recalled) continue;
      // delivered can be tracked for transport; read receipt visibility controlled separately
      if (!(m.deliveredTo||[]).includes(userId)) { m.deliveredTo = [...(m.deliveredTo||[]), userId]; changed = true; }
      if (allowReadReceipt) {
        if (!(m.readBy||[]).includes(userId)) { m.readBy = [...(m.readBy||[]), userId]; changed = true; }
        if (m.status !== 'read') { m.status = 'read'; changed = true; }
      }
      if (!m.updatedAt) m.updatedAt = now;
    }
    if (changed) this.saveToDisk();
  }

  createGroupConversation(ownerId: string, name: string, memberIds: string[], avatar?: string): Conversation | null {
    const owner = this.users.find(u => u.id === ownerId);
    if (!owner) return null;
    const uniq = Array.from(new Set([ownerId, ...memberIds.filter(id => this.users.some(u=>u.id===id))]));
    if (uniq.length < 2) throw new Error('Group requires at least 2 members.');
    const now = new Date().toISOString();
    const conv: Conversation = { id: `group_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type: 'group', name: name || 'New Group', participantIds: uniq, adminIds: [ownerId], ownerId, avatar, createdAt: now, updatedAt: now, lastMessage: 'Group created', lastMessageAt: now, channel: 'earthone' };
    this.conversations.unshift(conv);
    this.saveToDisk();
    return conv;
  }

  updateGroupMembers(actorId: string, conversationId: string, addIds: string[] = [], removeIds: string[] = []) {
    const conv = this.conversations.find(c => c.id === conversationId && c.type === 'group');
    if (!conv) throw new Error('Group not found');
    const isAdmin = conv.ownerId === actorId || (conv.adminIds||[]).includes(actorId);
    if (!isAdmin) throw new Error('Forbidden');
    const set = new Set(conv.participantIds);
    addIds.forEach(id => { if (this.users.some(u=>u.id===id)) set.add(id); });
    removeIds.forEach(id => { if (id !== conv.ownerId) set.delete(id); });
    conv.participantIds = Array.from(set);
    conv.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return conv;
  }

  leaveGroup(userId: string, conversationId: string) {
    const conv = this.conversations.find(c => c.id === conversationId && c.type === 'group');
    if (!conv) throw new Error('Group not found');
    conv.participantIds = (conv.participantIds||[]).filter(id => id !== userId);
    conv.adminIds = (conv.adminIds||[]).filter(id => id !== userId);
    if (conv.ownerId === userId) {
      conv.ownerId = conv.adminIds?.[0] || conv.participantIds[0];
      if (conv.ownerId && !(conv.adminIds||[]).includes(conv.ownerId)) conv.adminIds = [conv.ownerId, ...(conv.adminIds||[])];
    }
    conv.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return conv;
  }

  recallMessage(userId: string, conversationId: string, messageId: string) {
    const msg = this.messages.find(m => m.id === messageId && m.conversationId === conversationId);
    if (!msg) throw new Error('Message not found');
    if (msg.senderId !== userId) throw new Error('Forbidden');
    msg.recalled = true; msg.recalledAt = new Date().toISOString(); msg.content = ''; msg.translatedContent = undefined; msg.attachments = []; msg.updatedAt = msg.recalledAt;
    const conv = this.conversations.find(c => c.id === conversationId);
    if (conv) { conv.lastMessage = 'Message recalled'; conv.lastMessageAt = msg.recalledAt; }
    this.saveToDisk();
    return msg;
  }

  deleteMessageForUser(userId: string, conversationId: string, messageId: string) {
    const msg = this.messages.find(m => m.id === messageId && m.conversationId === conversationId);
    if (!msg) throw new Error('Message not found');
    msg.deletedFor = Array.from(new Set([...(msg.deletedFor||[]), userId]));
    this.saveToDisk();
    return msg;
  }

  findUserByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return this.users.find(u => (u.email||'').toLowerCase() === e) || null;
  }
  findUserByPhone(phone: string) {
    return this.users.find(u => u.phone === phone) || null;
  }
  upsertLinkedIdentity(user: User, identity: LinkedIdentity) {
    const provider = identity?.provider;
    const providerUserId = identity?.providerUserId != null ? String((identity as any).providerUserId) : '';
    if (provider && providerUserId) {
      const owner = this.findUserByLinkedIdentity(provider as any, providerUserId);
      if (owner && owner.id !== user.id) throw new Error('This external identity is already linked to another account.');
    }
    if (provider === 'phone' && (identity as any)?.phone) {
      const owner = this.findUserByPhone(String((identity as any).phone));
      if (owner && owner.id !== user.id) throw new Error('Phone number is already linked to another account.');
    }
    if (provider === 'email' && (identity as any)?.email) {
      const owner = this.findUserByEmail(String((identity as any).email));
      if (owner && owner.id !== user.id) throw new Error('Email is already linked to another account.');
    }
    const list = Array.isArray(user.linkedIdentities) ? user.linkedIdentities : [];
    const idx = list.findIndex(i => i.provider === identity.provider);
    if (idx >= 0) list[idx] = { ...list[idx], ...identity }; else list.push(identity);
    user.linkedIdentities = list;
  }




  transferGroupOwner(actorId: string, conversationId: string, newOwnerId: string) {
    const conv = this.conversations.find(c => c.id === conversationId && c.type === 'group');
    if (!conv) throw new Error('Group not found');
    if (conv.ownerId !== actorId) throw new Error('Forbidden');
    if (!(conv.participantIds||[]).includes(newOwnerId)) throw new Error('New owner must be a group member');
    conv.ownerId = newOwnerId;
    conv.adminIds = Array.from(new Set([newOwnerId, ...(conv.adminIds||[])]));
    conv.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return conv;
  }

  renameGroup(actorId: string, conversationId: string, name?: string, avatar?: string) {
    const conv = this.conversations.find(c => c.id === conversationId && c.type === 'group');
    if (!conv) throw new Error('Group not found');
    const isAdmin = conv.ownerId === actorId || (conv.adminIds||[]).includes(actorId);
    if (!isAdmin) throw new Error('Forbidden');
    if (typeof name === 'string' && name.trim()) conv.name = name.trim().slice(0, 80);
    if (typeof avatar === 'string') conv.avatar = avatar;
    conv.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return conv;
  }
  setGroupAdmins(actorId: string, conversationId: string, adminIds: string[]) {
    const conv = this.conversations.find(c => c.id === conversationId && c.type === 'group');
    if (!conv) throw new Error('Group not found');
    if (conv.ownerId !== actorId) throw new Error('Forbidden');
    const valid = adminIds.filter(id => (conv.participantIds||[]).includes(id));
    conv.adminIds = Array.from(new Set([conv.ownerId, ...valid]));
    conv.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return conv;
  }
  getPublicProfile(viewerId: string, userId: string) {
    // Legacy helper: delegate to privacy-enforced view to avoid unmasked leaks
    const view = this.getPublicProfileView(viewerId, userId) as any;
    if (!view) return null;
    if (view.isSelf) return view; // caller expecting self/public shape should handle; kept for compat
    if (view.restricted) return null;
    return { user: view.user, isFriend: !!view.isFriend, blocked: !!view.blocked, pendingRequest: view.pendingRequest || null };
  }

  setPasswordForUser(userId: string, newPassword: string) {
    const acc = this.accounts.get(userId);
    if (!acc) throw new Error('Account not found');
    const salt = crypto.randomBytes(16).toString('hex');
    acc.salt = salt;
    acc.passwordHash = this.hashPassword(newPassword, salt);
    this.accounts.set(userId, acc);
    if (acc.email) this.accounts.set(acc.email.toLowerCase(), acc);
    const u = this.users.find(x=>x.id===userId);
    if (u) this.accounts.set(u.username.toLowerCase(), acc);
    this.saveToDisk();
  }

  bindEmail(userId: string, email: string) {
    const u = this.users.find(x=>x.id===userId);
    if (!u) throw new Error('User not found');
    const e = email.trim().toLowerCase();
    const owner = this.findUserByEmail(e);
    if (owner && owner.id !== userId) throw new Error('Email is already linked to another account.');
    u.email = e; (u as any).emailVerified = true;
    this.upsertLinkedIdentity(u, { provider: 'email' as any, providerUserId: e, email: e, linkedAt: new Date().toISOString() } as any);
    const acc = this.accounts.get(userId); if (acc) { acc.email = e; this.accounts.set(e, acc); }
    this.saveToDisk(); return u;
  }

  bindPhone(userId: string, phone: string) {
    const u = this.users.find(x=>x.id===userId);
    if (!u) throw new Error('User not found');
    const owner = this.findUserByPhone(phone);
    if (owner && owner.id !== userId) throw new Error('Phone number is already linked to another account.');
    u.phone = phone; (u as any).phoneVerified = true;
    this.upsertLinkedIdentity(u, { provider: 'phone' as any, providerUserId: phone, phone, linkedAt: new Date().toISOString() } as any);
    this.saveToDisk(); return u;
  }

  unlinkIdentity(userId: string, provider: string) {
    const u = this.users.find(x=>x.id===userId);
    if (!u) throw new Error('User not found');
    const before = (u.linkedIdentities||[]).length;
    u.linkedIdentities = (u.linkedIdentities||[]).filter(i => i.provider !== provider);
    if ((u.linkedIdentities||[]).length === before) throw new Error('Identity not linked');
    if (provider === 'phone') { delete (u as any).phone; (u as any).phoneVerified = false; }
    if (provider === 'email') { /* keep primary email for account recovery */ (u as any).emailVerified = false; }
    this.saveToDisk(); return u;
  }



  isLoginLocked(key: string): { locked: boolean; retryAfterMs?: number } {
    const e = this.loginFailures[key];
    if (!e?.lockedUntil) return { locked: false };
    if (e.lockedUntil <= Date.now()) { delete this.loginFailures[key]; this.saveToDisk(); return { locked: false }; }
    return { locked: true, retryAfterMs: e.lockedUntil - Date.now() };
  }
  recordLoginFailure(key: string, max = 5, windowMs = 15*60*1000, lockMs = 15*60*1000) {
    const now = Date.now();
    const e = this.loginFailures[key];
    if (!e || (now - e.lastAt) > windowMs) this.loginFailures[key] = { count: 1, lastAt: now };
    else { e.count += 1; e.lastAt = now; if (e.count >= max) e.lockedUntil = now + lockMs; }
    this.saveToDisk();
  }
  clearLoginFailures(key: string) { if (this.loginFailures[key]) { delete this.loginFailures[key]; this.saveToDisk(); } }

  // Digital Library Methods
  addBook(book: Book): Book {
    this.writeBookContent(book);
    const existing = this.books.find(b => b.id === book.id);
    if (existing) {
      // Refresh content but keep reading progress
      existing.chapters = book.chapters;
      existing.description = book.description;
      existing.coverImage = book.coverImage || existing.coverImage;
      this.writeBookContent(existing);
      this.saveToDisk();
      return existing;
    }
    this.books.unshift(book);
    this.saveToDisk();
    return book;
  }

  updateBook(bookId: string, updates: Partial<Book>): Book | null {
    const book = this.books.find(b => b.id === bookId);
    if (!book) return null;
    Object.assign(book, updates);
    if (updates.chapters) this.writeBookContent(book);
    this.saveToDisk();
    return book;
  }

  deleteBook(bookId: string): boolean {
    const initial = this.books.length;
    this.books = this.books.filter(b => b.id !== bookId);
    this.bookShelf = this.bookShelf.filter(s => s.bookId !== bookId);
    this.bookAnnotations = this.bookAnnotations.filter(a => a.bookId !== bookId);
    // Remove the extracted content file (best-effort)
    try { fs.unlinkSync(this.bookContentFile(bookId)); } catch { /* ignore */ }
    if (this.books.length !== initial) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  updateReadingProgress(bookId: string, progress: number): Book | null {
    const book = this.books.find(b => b.id === bookId);
    if (!book) return null;
    book.readProgress = Math.min(100, Math.max(0, progress));
    this.saveToDisk();
    return book;
  }

  // ---- Personal Bookshelf Methods ----
  getBookShelf(userId: string): BookShelfItem[] {
    return this.bookShelf.filter(s => s.userId === userId);
  }

  addToBookShelf(userId: string, bookId: string, status: BookshelfStatus = 'want_to_read'): BookShelfItem {
    const existing = this.bookShelf.find(s => s.userId === userId && s.bookId === bookId);
    if (existing) {
      existing.status = status;
      existing.updatedAt = new Date().toISOString();
      this.saveToDisk();
      return existing;
    }
    const item: BookShelfItem = {
      id: `shelf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      bookId,
      status,
      progress: 0,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.bookShelf.push(item);
    this.saveToDisk();
    return item;
  }

  removeFromBookShelf(userId: string, bookId: string): boolean {
    const initial = this.bookShelf.length;
    this.bookShelf = this.bookShelf.filter(s => !(s.userId === userId && s.bookId === bookId));
    if (this.bookShelf.length !== initial) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  updateBookShelfProgress(userId: string, bookId: string, progress: number): BookShelfItem | null {
    const item = this.bookShelf.find(s => s.userId === userId && s.bookId === bookId);
    if (!item) return null;
    item.progress = Math.min(100, Math.max(0, progress));
    item.updatedAt = new Date().toISOString();
    if (progress >= 100 && item.status !== 'finished') {
      item.status = 'finished';
    }
    this.saveToDisk();
    return item;
  }

  updateBookShelfReadingState(userId: string, bookId: string, chapterId: string, progress: number): BookShelfItem | null {
    const item = this.bookShelf.find(s => s.userId === userId && s.bookId === bookId);
    if (!item) return null;
    item.lastReadChapterId = chapterId;
    item.progress = Math.min(100, Math.max(0, progress));
    item.updatedAt = new Date().toISOString();
    if (item.progress >= 100 && item.status !== 'finished') {
      item.status = 'finished';
    } else if (item.progress > 0 && item.status === 'want_to_read') {
      item.status = 'reading';
    }
    this.saveToDisk();
    return item;
  }

  updateBookShelfEpubReadingState(userId: string, bookId: string, cfi: string, progress: number): BookShelfItem | null {
    const item = this.bookShelf.find(s => s.userId === userId && s.bookId === bookId);
    if (!item) return null;
    item.lastReadEpubCfi = cfi;
    item.progress = Math.min(100, Math.max(0, progress));
    item.updatedAt = new Date().toISOString();
    if (item.progress >= 100 && item.status !== 'finished') {
      item.status = 'finished';
    } else if (item.progress > 0 && item.status === 'want_to_read') {
      item.status = 'reading';
    }
    this.saveToDisk();
    return item;
  }

  addAnnotation(bookId: string, chapterId: string, selectedText: string, note: string, aiExplanation?: string, userId?: string): BookAnnotation {
    const ann: BookAnnotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      bookId,
      chapterId,
      selectedText,
      note,
      aiExplanation,
      ...(userId ? { userId } : {}),
      createdAt: new Date().toISOString()
    };
    this.bookAnnotations.push(ann);
    this.saveToDisk();
    return ann;
  }

  addUserAnnotation(
    userId: string,
    bookId: string,
    chapterId: string,
    selectedText: string,
    note: string,
    aiExplanation: string,
    citation: NonNullable<BookAnnotation['citation']>
  ): BookAnnotation {
    const annotation: BookAnnotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      bookId,
      chapterId,
      selectedText,
      note,
      aiExplanation,
      citation,
      createdAt: new Date().toISOString()
    };
    this.bookAnnotations.push(annotation);
    this.saveToDisk();
    return annotation;
  }

  getAnnotations(bookId: string, userId?: string): BookAnnotation[] {
    return this.bookAnnotations.filter(a => a.bookId === bookId && (!a.userId || a.userId === userId));
  }

  // Web Crawler Methods
  createCrawlerTask(name: string, targetDomain: string, startUrl: string, maxPages: number = 25): CrawlerTask {
    const task: CrawlerTask = {
      id: `task_${Date.now()}`,
      name,
      targetDomain,
      startUrl,
      maxPages,
      status: 'idle',
      pagesCrawled: 0,
      respectsRobotsTxt: true
    };
    this.crawlerTasks.unshift(task);
    this.saveToDisk();
    return task;
  }

  async executeCrawl(taskId: string): Promise<{ success: boolean; newPagesCount: number; error?: string }> {
    // Serialize the full async crawl lifecycle to avoid read-modify-write
    // interleaving with other mutations during the awaited network crawl.
    return this.mutate(async () => {
      const task = this.crawlerTasks.find(t => t.id === taskId);
      if (!task) return { success: false, newPagesCount: 0, error: 'Task not found' };

      task.status = 'running';
      task.lastRunAt = new Date().toISOString();
      this.saveToDisk();

      try {
        const results = await crawlWebsite(task.startUrl, task.maxPages, task.respectsRobotsTxt);

        const newPages: CrawledPage[] = results.map((r, i) => ({
          id: `crawled_${Date.now()}_${i}`,
          taskId: task.id,
          url: r.url,
          title: r.title,
          author: r.author,
          cleanContent: r.cleanContent,
          crawledAt: new Date().toISOString(),
          status: 'pending_review' as const
        }));

        if (newPages.length > 0) {
          this.crawledPages.unshift(...newPages);
        }
        task.pagesCrawled += newPages.length;
        task.status = newPages.length > 0 ? 'completed' : 'error';
        this.saveToDisk();

        return {
          success: newPages.length > 0,
          newPagesCount: newPages.length,
          error: newPages.length === 0 ? 'No pages could be extracted from this site (blocked, empty, or unreachable).' : undefined
        };
      } catch (err: any) {
        task.status = 'error';
        try { this.saveToDisk(); } catch { /* best effort on error path */ }
        return { success: false, newPagesCount: 0, error: err.message || 'Crawl failed' };
      }
    });
  }

  approveCrawledPage(pageId: string): CrawledPage | null {
    const page = this.crawledPages.find(p => p.id === pageId);
    if (!page) return null;
    page.status = 'approved';

    // Ingest into Digital Library
    const book: Book = {
      id: `ingested_${page.id}`,
      title: page.title,
      author: page.author,
      category: 'science',
      language: 'en',
      source: 'Open Access',
      coverImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
      description: `Ingested from ${page.url} via EARTH ONE Ingestion Core.`,
      readProgress: 0,
      chapters: [
        {
          id: 'ch1',
          title: 'Full Ingested Text',
          content: page.cleanContent
        }
      ]
    };

    this.books.unshift(book);
    this.saveToDisk();
    return page;
  }

  // Web Browser Methods
  addBookmark(bm: { title: string; url: string; category?: string }): BrowserBookmark {
    const bookmark: BrowserBookmark = {
      id: `bm_${Date.now()}`,
      title: bm.title,
      url: bm.url,
      category: bm.category || 'General',
      createdAt: new Date().toISOString()
    };
    this.browserBookmarks.unshift(bookmark);
    this.saveToDisk();
    return bookmark;
  }

  saveArticleToKnowledge(articleData: Partial<SavedArticle>, userId: string): SavedArticle {
    const saved: SavedArticle = {
      id: `art_${Date.now()}`,
      url: articleData.url || '',
      title: articleData.title || 'Untitled Web Harvest',
      author: articleData.author || 'Web Author',
      content: articleData.content || '',
      aiSummary: articleData.aiSummary || '',
      savedAt: new Date().toISOString(),
      tags: articleData.tags || ['Web Knowledge'],
      userId
    };
    this.savedArticles.unshift(saved);
    this.saveToDisk();
    return saved;
  }

  deleteSavedArticle(id: string): boolean {
    const initial = this.savedArticles.length;
    this.savedArticles = this.savedArticles.filter(a => a.id !== id);
    if (this.savedArticles.length !== initial) {
      this.saveToDisk();
      return true;
    }
    return false;
  }
  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  getDefaultNotificationPrefs() {
    return {
      friendRequests: true,
      friendAccepted: true,
      groupEvents: true,
      messages: true,
      desktop: true,
      sound: false,
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
    };
  }

  getNotificationPrefs(userId: string) {
    const base = this.getDefaultNotificationPrefs();
    const cur = this.notificationPrefs[userId] || {};
    const next: any = { ...base, ...cur };
    if (typeof next.friendAccepted !== 'boolean') next.friendAccepted = typeof cur.friendRequests === 'boolean' ? cur.friendRequests : base.friendAccepted;
    const boolKeys = ['friendRequests','friendAccepted','groupEvents','messages','desktop','sound','dndEnabled'];
    for (const k of boolKeys) if (typeof (next as any)[k] !== 'boolean') (next as any)[k] = (base as any)[k];
    const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
    next.dndStart = typeof next.dndStart === 'string' && timeRe.test(next.dndStart.slice(0,5)) ? next.dndStart.slice(0,5) : base.dndStart;
    next.dndEnd = typeof next.dndEnd === 'string' && timeRe.test(next.dndEnd.slice(0,5)) ? next.dndEnd.slice(0,5) : base.dndEnd;
    return next;
  }

  setNotificationPrefs(userId: string, patch: any) {
    const cur = this.getNotificationPrefs(userId);
    const next = { ...cur };
    const boolKeys = ['friendRequests','friendAccepted','groupEvents','messages','desktop','sound','dndEnabled'];
    for (const k of boolKeys) if (typeof patch?.[k] === 'boolean') next[k] = patch[k];
    const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (typeof patch?.dndStart === 'string' && timeRe.test(patch.dndStart.slice(0,5))) next.dndStart = patch.dndStart.slice(0,5);
    if (typeof patch?.dndEnd === 'string' && timeRe.test(patch.dndEnd.slice(0,5))) next.dndEnd = patch.dndEnd.slice(0,5);
    // Backward compat: if client sends legacy friendRequests only, do not force friendAccepted off/on unexpectedly.
    this.notificationPrefs[userId] = next;
    return next;
  }


  // -------------------------------------------------------------------------
  // Privacy settings (server-authoritative)
  // -------------------------------------------------------------------------
  getDefaultPrivacySettings() {
    return { ...DEFAULT_PRIVACY_SETTINGS };
  }

  getPrivacySettings(userId: string) {
    const cur = this.privacySettings[userId] || {};
    const norm = normalizePrivacySettings(cur);
    this.privacySettings[userId] = norm;
    return norm;
  }

  setPrivacySettings(userId: string, patch: any) {
    const cur = this.getPrivacySettings(userId);
    const next = normalizePrivacySettings({ ...cur, ...(patch && typeof patch === 'object' ? patch : {}) });
    this.privacySettings[userId] = next;
    return next;
  }

  hasMutualGroup(userA: string, userB: string): boolean {
    if (!userA || !userB || userA === userB) return false;
    return this.conversations.some(c => c.type === 'group' && Array.isArray(c.participantIds) && c.participantIds.includes(userA) && c.participantIds.includes(userB));
  }

  canSendDirectMessageBetween(fromUserId: string, toUserId: string) {
    const to = this.users.find(u => u.id === toUserId);
    if (!to) return { ok: false, error: 'User not found' };
    const blockedEither = (this.blockedBy[toUserId]||[]).includes(fromUserId) || (this.blockedBy[fromUserId]||[]).includes(toUserId);
    if (blockedEither) return { ok: false, error: 'Messaging is not allowed due to block settings.' };
    const isFriend = this.getFriendIds(toUserId).includes(fromUserId) || this.getFriendIds(fromUserId).includes(toUserId);
    const hasMutualGroup = this.hasMutualGroup(fromUserId, toUserId);
    const targetPrivacy = this.getPrivacySettings(toUserId);
    if (targetPrivacy.strangerMessagePolicy === 'everyone') return { ok: true };
    if (targetPrivacy.strangerMessagePolicy === 'friends') return isFriend ? { ok: true } : { ok: false, error: 'This user only accepts messages from friends.' };
    return (isFriend || hasMutualGroup) ? { ok: true } : { ok: false, error: 'This user only accepts messages from friends or mutual group members.' };
  }

  canSendFriendRequestFrom(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) return { ok: false, error: 'Cannot add yourself.' };
    const to = this.users.find(u => u.id === toUserId);
    if (!to) return { ok: false, error: 'User not found' };
    const blockedEither = (this.blockedBy[toUserId]||[]).includes(fromUserId) || (this.blockedBy[fromUserId]||[]).includes(toUserId);
    if (blockedEither) return { ok: false, error: 'Cannot send friend request due to block settings.' };
    const isFriend = this.getFriendIds(fromUserId).includes(toUserId);
    if (isFriend) return { ok: false, error: 'Already friends.' };
    const targetPrivacy = this.getPrivacySettings(toUserId);
    if (targetPrivacy.friendRequestPolicy === 'everyone') return { ok: true };
    if (targetPrivacy.friendRequestPolicy === 'mutual_group') {
      return this.hasMutualGroup(fromUserId, toUserId) ? { ok: true } : { ok: false, error: 'This user only accepts friend requests from people in mutual groups.' };
    }
    return { ok: false, error: 'This user does not accept friend requests.' };
  }

  shouldSendReadReceipt(userId: string) {
    return !!this.getPrivacySettings(userId).readReceipts;
  }

  getMaskedPresenceForViewer(viewerId: string | null, targetId: string) {
    const u = this.users.find(x => x.id === targetId);
    if (!u) return { isOnline: false, lastActiveAt: undefined };
    if (viewerId && viewerId === targetId) return { isOnline: !!(u as any).isOnline, lastActiveAt: (u as any).lastActiveAt };
    const priv = this.getPrivacySettings(targetId);
    const isFriend = viewerId ? this.getFriendIds(viewerId).includes(targetId) : false;
    const blockedEither = viewerId ? ((this.blockedBy[viewerId]||[]).includes(targetId) || (this.blockedBy[targetId]||[]).includes(viewerId)) : false;
    if (blockedEither) return { isOnline: false, lastActiveAt: undefined };
    // if viewer cannot view profile as "friends" context still allow presence? but spec says "关闭后，其他用户不能通过 API 或 WebSocket 获得被隐藏的信息"
    return { isOnline: priv.showOnlineStatus ? !!(u as any).isOnline : false, lastActiveAt: priv.showLastActive ? (u as any).lastActiveAt : undefined };
  }

  isBlockedEither(a: string, b: string) {
    return !!((this.blockedBy[a]||[]).includes(b) || (this.blockedBy[b]||[]).includes(a));
  }

  getBlockedUserIds(userId: string) {
    return Array.from(new Set(this.blockedBy[userId] || []));
  }

  clearConversationForUser(userId: string, conversationId: string) {
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv || !this.canAccessConversation(userId, conv)) throw new Error('Forbidden');
    let count = 0;
    for (const m of this.messages) {
      if (m.conversationId !== conversationId) continue;
      if (!(m.deletedFor||[]).includes(userId)) { m.deletedFor = [...(m.deletedFor||[]), userId]; count++; }
    }
    if (count) this.saveToDisk();
    return { cleared: count };
  }


  getUnreadNotificationCount(userId: string) {
    return this.notifications.filter(n => n.userId === userId && !n.read).length;
  }

  getNotificationsForUser(userId: string, opts?: { limit?: number; before?: string }) {
    const limit = Math.max(1, Math.min(100, opts?.limit || 30));
    let list = this.notifications.filter(n => n.userId === userId).sort((a,b)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    if (opts?.before) {
      const t = new Date(opts.before).getTime();
      list = list.filter(n => new Date(n.createdAt||0).getTime() < t);
    }
    const slice = list.slice(0, limit);
    const hasMore = list.length > limit;
    const nextBefore = slice.length ? slice[slice.length - 1].createdAt : null;
    return { notifications: slice, unreadCount: this.getUnreadNotificationCount(userId), hasMore, nextBefore };
  }

  createNotification(input: any) {
    if (!input?.userId || !input?.type) return null;
    const n = {
      id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      userId: String(input.userId),
      type: String(input.type),
      title: String(input.title || '').slice(0, 200),
      body: input.body ? String(input.body).slice(0, 500) : undefined,
      read: false,
      createdAt: new Date().toISOString(),
      actorId: input.actorId,
      actorName: input.actorName,
      actorAvatar: input.actorAvatar,
      conversationId: input.conversationId,
      requestId: input.requestId,
      targetUserId: input.targetUserId,
      data: input.data && typeof input.data === 'object' ? input.data : undefined,
    };
    this.notifications.push(n);
    // cap per user to prevent unbounded growth
    const perUser = this.notifications.filter(x => x.userId === n.userId).sort((a,b)=> new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime());
    if (perUser.length > 500) {
      const drop = new Set(perUser.slice(500).map(x => x.id));
      this.notifications = this.notifications.filter(x => !(x.userId === n.userId && drop.has(x.id)));
    }
    return n;
  }

  markNotificationRead(userId: string, id: string) {
    const n = this.notifications.find(x => x.id === id && x.userId === userId);
    if (!n) return null;
    if (!n.read) { n.read = true; n.readAt = new Date().toISOString(); }
    return n;
  }

  markAllNotificationsRead(userId: string) {
    const now = new Date().toISOString();
    let count = 0;
    for (const n of this.notifications) {
      if (n.userId === userId && !n.read) { n.read = true; n.readAt = now; count++; }
    }
    return count;
  }

  deleteNotification(userId: string, id: string) {
    const before = this.notifications.length;
    this.notifications = this.notifications.filter(x => !(x.id === id && x.userId === userId));
    return this.notifications.length !== before;
  }

}

export const store = new DataStore();
