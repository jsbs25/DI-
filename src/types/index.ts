export type Language = 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru';

export interface UserLocation {
  countryCode: string; // ISO 2-letter e.g. 'CN', 'US', 'JO', 'SA', 'FR', 'ES', 'RU'
  countryName: string;
  cityName: string;
  lat: number;
  lng: number;
  isPublic: boolean;
}

export type AuthProvider = 'google' | 'wechat' | 'phone' | 'email';

export interface LinkedIdentity {
  provider: AuthProvider;
  providerUserId: string;
  displayName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  linkedAt: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  avatar: string;
  banner?: string;
  bio: string;
  location: UserLocation;
  interests: string[];
  followersCount: number;
  followingCount: number;
  tipsReceived: number;
  isOnline: boolean;
  lastActiveAt?: string;
  verified: boolean;
  joinedAt: string;
  hasCompletedOnboarding?: boolean;
  linkedIdentities?: LinkedIdentity[];
  friendIds?: string[];
  blockedUserIds?: string[];
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

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
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
  updatedAt?: string;
  mediaUrl?: string;
  attachments?: ChatAttachment[];
  status?: ChatMessageStatus;
  deliveredTo?: string[];
  readBy?: string[];
  replyToId?: string;
  editedAt?: string;
  deletedFor?: string[];
  recalled?: boolean;
  recalledAt?: string;
  channel?: 'earthone' | 'google' | 'wechat' | 'whatsapp' | 'telegram';
}

export interface Conversation {
  id: string;
  type: 'direct' | 'country_room' | 'global_channel' | 'channel' | 'group';
  name: string;
  countryCode?: string;
  participantIds: string[];
  adminIds?: string[];
  ownerId?: string;
  avatar?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageAt?: string;
  isOnline?: boolean;
  otherUser?: User;
  pinned?: boolean;
  typingUserIds?: string[];
  channel?: 'earthone' | 'google' | 'wechat' | 'whatsapp' | 'telegram';
  externalRef?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChannelIntegration {
  id: 'google' | 'wechat' | 'whatsapp' | 'telegram' | 'phone' | 'email';
  name: string;
  category: 'identity' | 'messaging';
  status: 'available' | 'config_required' | 'planned';
  official: boolean;
  capabilities: string[];
  limitations: string[];
  setupHint: string;
  linked?: boolean;
  linkedLabel?: string;
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

export type BookCategory =
  | 'literature'
  | 'history'
  | 'philosophy'
  | 'science'
  | 'geography'
  | 'languages'
  | 'education'
  | 'religion'
  | 'islamic_studies'
  | 'computer_science'
  | 'ai'
  | 'economics'
  | 'social_sciences';

export type BookCopyrightStatus = 'public_domain' | 'open_access' | 'licensed' | 'copyrighted';

export interface Book {
  id: string;
  title: string;
  author: string;
  category: BookCategory;
  language: string;
  originalLanguage?: string;
  year?: string;
  publisher?: string;
  isbn?: string;
  source: 'Project Gutenberg' | 'Internet Archive' | 'Open Library' | 'Open Access';
  coverImage?: string;
  description: string;
  readProgress: number;
  chapters: Chapter[];
  copyrightStatus?: BookCopyrightStatus;
  formatType?: 'text' | 'epub' | 'pdf';
  /** External link to a legally accessible resource (read/borrow/download). */
  externalReadUrl?: string;
  /** EPUB download URL (served via backend proxy to avoid CORS). */
  epubUrl?: string;
  /** Comma-separated subject tags. */
  subjects?: string;
  /** Stable provider identifier such as `openlibrary` or `archive`. */
  connectorId?: string;
  /** Provider-native work, edition, or item identifier. */
  externalId?: string;
  /** Canonical source page for attribution and lawful external access. */
  sourceUrl?: string;
  /** Provider-supplied rights/license evidence; never inferred from searchability. */
  licenseUrl?: string;
  rightsClassification?: string;
  rightsNote?: string;
  /** Explicitly distinguishes imported full text from excerpts and metadata-only records. */
  textAvailability?: 'full_text' | 'excerpt' | 'metadata_only' | 'unknown';
}

export type BookshelfStatus = 'reading' | 'finished' | 'want_to_read' | 'favorite';

export interface BookShelfItem {
  id: string;
  userId: string;
  bookId: string;
  status: BookshelfStatus;
  progress: number; // 0-100
  /** Stable chapter identifier used to resume a text book for this user. */
  lastReadChapterId?: string;
  /** EPUB CFI location used to resume an EPUB for this user. */
  lastReadEpubCfi?: string;
  savedAt: string;
  updatedAt: string;
}

export interface BookAnnotation {
  id: string;
  bookId: string;
  /** Set only for user-private AI reading notes; legacy notes remain shared as before. */
  userId?: string;
  chapterId: string;
  selectedText: string;
  note: string;
  aiExplanation?: string;
  citation?: {
    title: string;
    author: string;
    version: string;
    location: string;
    sourceUrl: string;
  };
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
  aiSummary?: string;
  aiModelUsed?: string;
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

export type KnowledgeNodeType =
  | 'civilization'
  | 'historical_period'
  | 'person'
  | 'place'
  | 'language'
  | 'book'
  | 'scientific_concept'
  | 'thought'
  | 'artwork'
  | 'historical_event';

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  /** Primary display title (Chinese by default). */
  title: string;
  /** English/romanized title used for cross-language search matching. */
  titleEn?: string;
  description: string;
  aliases?: string[];
  tags?: string[];
  /** Graph edges to other knowledge nodes. */
  relatedIds: string[];
  /** Optional link to a globe country code (cross-module: EARTH). */
  countryCode?: string;
  /** Optional links to library books by store id (cross-module: LIBRARY). */
  bookIds?: string[];
}


export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  message?: string;
  createdAt: string;
  updatedAt: string;
  fromUser?: User;
  toUser?: User;
}

export interface SecurityAuditEvent {
  id: string;
  userId?: string;
  type: string;
  detail?: string;
  ip?: string;
  createdAt: string;
}
