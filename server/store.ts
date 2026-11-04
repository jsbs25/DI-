import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  SavedArticle
} from '../src/types/index.ts';
import { resolveCoordinates } from '../src/utils/geoData.ts';
import { SEED_BOOKS, SEED_CRAWLER_TASKS, SEED_CRAWLED_PAGES } from './seedKnowledge.ts';
import { crawlWebsite } from './webFetcher.ts';

const DATA_FILE = path.resolve(process.env.EARTH_ONE_DATA_FILE || path.resolve(process.cwd(), 'server_data.json'));
// Full-text book content is stored here (one JSON file per book) instead of
// bloating server_data.json with every chapter's body. This keeps the main
// store small and makes the atomic whole-file rewrite cheap.
const BOOKS_DIR = path.resolve(process.cwd(), 'server_data', 'books');

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

  constructor() {
    if (!this.loadFromDisk()) {
      this.initSeedData();
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
        currentUser: this.currentUser,
        accounts: serializableAccounts,
        sessions: serializableSessions,
        lastSavedAt: new Date().toISOString()
      };

      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.error('Failed to save store to disk:', err);
    }
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
      this.currentUser = data.currentUser || this.users[0];

      // Persist the now-stripped (metadata-only) main store once after migrating
      // legacy inline content, so server_data.json stops carrying full text.
      if (migrated) this.saveToDisk();

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
    translatedTo?: string
  ): ChatMessage {
    const author = authorUser || this.currentUser;
    const msg: ChatMessage = {
      id: `msg_${Date.now()}`,
      conversationId,
      senderId: author.id,
      senderName: author.displayName,
      senderAvatar: author.avatar,
      senderCountry: author.location.countryCode,
      content,
      translatedContent,
      translatedTo,
      createdAt: new Date().toISOString()
    };
    this.messages.push(msg);

    const conv = this.conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.lastMessage = content;
      conv.lastMessageTime = 'Just now';
    }
    this.saveToDisk();
    return msg;
  }

  // Update current or target user profile
  updateProfile(data: Partial<User>, userId?: string): User {
    const targetId = userId || this.currentUser.id;
    let target = this.users.find(u => u.id === targetId);
    if (!target) {
      target = this.currentUser;
    }

    Object.assign(target, data);
    if (data.location) {
      target.location = {
        ...target.location,
        ...data.location
      };
      if (data.location.cityName && data.location.countryCode) {
        const coords = resolveCoordinates(data.location.countryCode, data.location.cityName);
        target.location.lat = coords.lat;
        target.location.lng = coords.lng;
      }
    }

    if (this.currentUser.id === target.id) {
      this.currentUser = target;
    }
    this.saveToDisk();
    return target;
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
    const userId = `user_${Date.now()}`;
    const token = crypto.randomBytes(32).toString('hex');

    const newUser: User = {
      id: userId,
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
    };

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
    return this.users.find(u => u.id === userId) || null;
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

  addAnnotation(bookId: string, chapterId: string, selectedText: string, note: string, aiExplanation?: string): BookAnnotation {
    const ann: BookAnnotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      bookId,
      chapterId,
      selectedText,
      note,
      aiExplanation,
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
      this.saveToDisk();
      return { success: false, newPagesCount: 0, error: err.message || 'Crawl failed' };
    }
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
}

export const store = new DataStore();
