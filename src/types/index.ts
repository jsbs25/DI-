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
