import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Compass,
  LayoutGrid,
  Search,
  Bell,
  User,
  Sparkles,
  BookOpen,
  GraduationCap,
  MessageSquare,
  Film,
  Gamepad2,
  Users2,
  Music2,
  Moon,
  Palette,
  Radar,
  Network,
  PenTool,
  Orbit,
  Globe2,
} from 'lucide-react';

export type DockItem = { id: string; tab: string; icon: LucideIcon; labelZh: string; labelEn: string; group?: string };

// Primary navigation: ONE unified world (no planet-name navigation labels)
export const DOCK_ITEMS: DockItem[] = [
  { id: 'home', tab: 'globe', icon: Home, labelZh: '首页', labelEn: 'Home', group: 'core' },
  { id: 'discover', tab: 'feed', icon: Compass, labelZh: '发现', labelEn: 'Discover', group: 'core' },
  { id: 'spaces', tab: 'universe', icon: LayoutGrid, labelZh: '空间', labelEn: 'Spaces', group: 'core' },
  { id: 'music', tab: 'venus', icon: Music2, labelZh: '音乐', labelEn: 'Music', group: 'core' },
  { id: 'intelligence', tab: 'aihub', icon: Sparkles, labelZh: '智能', labelEn: 'Intelligence', group: 'core' },
  { id: 'library', tab: 'library', icon: BookOpen, labelZh: '图书馆', labelEn: 'Library', group: 'core' },
  { id: 'browser', tab: 'browser', icon: Search, labelZh: '浏览', labelEn: 'Browser', group: 'core' },
  { id: 'messages', tab: 'chat', icon: MessageSquare, labelZh: '消息', labelEn: 'Messages', group: 'core' },
  { id: 'profile', tab: 'community', icon: User, labelZh: '社区', labelEn: 'Community', group: 'core' },
];

export const MORE_ITEMS: DockItem[] = [
  { id: 'video', tab: 'video', icon: Film, labelZh: 'ONE VIDEO', labelEn: 'ONE VIDEO', group: 'more' },
  { id: 'knowledge', tab: 'knowledge', icon: Network, labelZh: 'ONE KNOWLEDGE', labelEn: 'ONE KNOWLEDGE', group: 'more' },
  { id: 'learning', tab: 'arabic-learning', icon: GraduationCap, labelZh: 'ONE LEARNING', labelEn: 'ONE LEARNING', group: 'more' },
  { id: 'creator', tab: 'creator', icon: PenTool, labelZh: 'ONE STUDIO', labelEn: 'ONE STUDIO', group: 'more' },
  { id: 'observatory', tab: 'moon', icon: Moon, labelZh: 'ONE OBSERVATORY', labelEn: 'ONE OBSERVATORY', group: 'more' },
  { id: 'cinema', tab: 'saturn', icon: Film, labelZh: 'ONE CINEMA', labelEn: 'ONE CINEMA', group: 'more' },
  { id: 'search', tab: 'mercury', icon: Globe2, labelZh: 'ONE SEARCH', labelEn: 'ONE SEARCH', group: 'more' },
  { id: 'games', tab: 'game', icon: Gamepad2, labelZh: 'ONE GAMES', labelEn: 'ONE GAMES', group: 'more' },
  { id: 'crawler', tab: 'crawler', icon: Radar, labelZh: 'ONE CRAWLER', labelEn: 'ONE CRAWLER', group: 'more' },
  { id: 'brand', tab: 'brand', icon: Palette, labelZh: '品牌', labelEn: 'Brand', group: 'more' },
  { id: 'universe-legacy', tab: 'universe', icon: Orbit, labelZh: '宇宙视图', labelEn: 'Universe View', group: 'more' },
  { id: 'notifications', tab: 'feed', icon: Bell, labelZh: '动态', labelEn: 'Activity', group: 'more' },
];
