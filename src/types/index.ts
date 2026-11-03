export type Language = 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru';

export interface UserLocation {
  countryCode: string; // ISO 2-letter e.g. 'CN', 'US', 'JO', 'SA', 'FR', 'ES', 'RU'
  countryName: string;
  cityName: string;
  lat: number;
  lng: number;
  isPublic: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar: string;
  banner?: string;
  bio: string;
  location: UserLocation;
  interests: string[];
  followersCount: number;
  followingCount: number;
  tipsReceived: number;
  isOnline: boolean;
  verified: boolean;
  joinedAt: string;
  hasCompletedOnboarding?: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatar: string;
    countryCode: string;
  };
  content: string;
  createdAt: string;
  likesCount: number;
  liked: boolean;
}

export interface Post {
  id: string;
  userId: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatar: string;
    countryCode: string;
    countryName: string;
    cityName: string;
    verified: boolean;
  };
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  countryCode: string;
  countryName: string;
  cityName: string;
  category: 'life' | 'travel' | 'study' | 'thought' | 'tech' | 'culture';
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  liked?: boolean;
  saved?: boolean;
  createdAt: string;
  comments: PostComment[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderCountry: string;
  content: string;
  originalLanguage?: string;
  translatedContent?: string;
  translatedTo?: string;
  createdAt: string;
  mediaUrl?: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'country_room' | 'global_channel';
  name: string;
  countryCode?: string;
  participantIds: string[];
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: string;
  isOnline?: boolean;
  otherUser?: User;
}

export interface CreatorArticle {
  id: string;
  authorId: string;
  author: {
    displayName: string;
    username: string;
    avatar: string;
    countryCode: string;
  };
  title: string;
  summary: string;
  content: string;
  coverUrl: string;
  category: string;
  readTime: string;
  clapsCount: number;
  clapped?: boolean;
  tipsTotal: number;
  createdAt: string;
}

export interface VideoItem {
  id: string;
  creatorId: string;
  creator: {
    displayName: string;
    username: string;
    avatar: string;
    countryCode: string;
  };
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: string;
  viewsCount: number;
  likesCount: number;
  liked?: boolean;
  category: string;
  countryName: string;
  createdAt: string;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  membersCount: number;
  icon: string;
  banner: string;
  isJoined?: boolean;
  leaderName: string;
}

export interface GameRoom {
  id: string;
  gameSlug: 'chess' | 'gomoku' | 'trivia';
  title: string;
  host: {
    id: string;
    displayName: string;
    countryCode: string;
    avatar: string;
  };
  guest?: {
    id: string;
    displayName: string;
    countryCode: string;
    avatar: string;
  };
  status: 'waiting' | 'in_progress' | 'finished';
  currentTurn: 'white' | 'black' | 'player1' | 'player2';
  boardState: any;
  winner?: string;
  lastMoveTime?: string;
}

export interface Advertisement {
  id: string;
  brand: string;
  tagline: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string;
  category: 'global' | 'culture' | 'tech' | 'education';
  impressions: number;
  clicks: number;
}

export interface GlobeUserNode {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  countryCode: string;
  countryName: string;
  cityName: string;
  lat: number;
  lng: number;
  isOnline: boolean;
  latestThought?: string;
}

export interface GlobeCountryStat {
  code: string;
  name: string;
  nativeName: string;
  lat: number;
  lng: number;
  userCount: number;
  onlineCount: number;
  postsCount: number;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: 'literature' | 'history' | 'philosophy' | 'science' | 'geography' | 'languages' | 'education' | 'religion' | 'islamic_studies' | 'computer_science' | 'ai' | 'economics' | 'social_sciences';
  language: string;
  year?: string;
  source: 'Project Gutenberg' | 'Internet Archive' | 'Open Library' | 'Open Access';
  coverImage?: string;
  description: string;
  readProgress: number;
  chapters: Chapter[];
}

export interface BookAnnotation {
  id: string;
  bookId: string;
  chapterId: string;
  selectedText: string;
  note: string;
  aiExplanation?: string;
  createdAt: string;
}

export interface CrawlerTask {
  id: string;
  name: string;
  targetDomain: string;
  startUrl: string;
  maxPages: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastRunAt?: string;
  pagesCrawled: number;
  respectsRobotsTxt: boolean;
}

export interface CrawledPage {
  id: string;
  taskId: string;
  url: string;
  title: string;
  author: string;
  cleanContent: string;
  crawledAt: string;
  status: 'pending_review' | 'approved' | 'rejected';
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  createdAt: string;
}

export interface SavedArticle {
  id: string;
  url: string;
  title: string;
  author: string;
  content: string;
  aiSummary: string;
  savedAt: string;
  tags: string[];
  userId: string;
}
