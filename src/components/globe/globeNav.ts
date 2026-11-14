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

// Primary navigation: streamlined core spaces
export const DOCK_ITEMS: DockItem[] = [
  { id: 'home', tab: 'globe', icon: Home, labelZh: '首页', labelEn: 'Home', group: 'core' },
  { id: 'discover', tab: 'feed', icon: Compass, labelZh: '发现', labelEn: 'Discover', group: 'core' },
  { id: 'spaces', tab: 'universe', icon: LayoutGrid, labelZh: '宇宙', labelEn: 'Universe', group: 'core' },
  { id: 'music', tab: 'venus', icon: Music2, labelZh: '音乐', labelEn: 'Music', group: 'core' },
  { id: 'intelligence', tab: 'aihub', icon: Sparkles, labelZh: '智能', labelEn: 'AI', group: 'core' },
  { id: 'messages', tab: 'chat', icon: MessageSquare, labelZh: '消息', labelEn: 'Messages', group: 'core' },
];

export const MORE_ITEMS: DockItem[] = [
  { id: 'library', tab: 'library', icon: BookOpen, labelZh: '图书馆', labelEn: 'Library', group: 'more' },
  { id: 'browser', tab: 'browser', icon: Search, labelZh: '浏览器', labelEn: 'Browser', group: 'more' },
  { id: 'knowledge', tab: 'knowledge', icon: Network, labelZh: '知识图谱', labelEn: 'Knowledge', group: 'more' },
  { id: 'learning', tab: 'arabic-learning', icon: GraduationCap, labelZh: '语言学习', labelEn: 'Learning', group: 'more' },
  { id: 'creator', tab: 'creator', icon: PenTool, labelZh: '创作中心', labelEn: 'Studio', group: 'more' },
  { id: 'video', tab: 'video', icon: Film, labelZh: '影视视频', labelEn: 'Video', group: 'more' },
  { id: 'community', tab: 'community', icon: Users2, labelZh: '社区', labelEn: 'Community', group: 'more' },
  { id: 'games', tab: 'game', icon: Gamepad2, labelZh: '游戏', labelEn: 'Games', group: 'more' },
  { id: 'observatory', tab: 'moon', icon: Moon, labelZh: '天文台', labelEn: 'Observatory', group: 'more' },
  { id: 'cinema', tab: 'saturn', icon: Orbit, labelZh: '星环影院', labelEn: 'Cinema', group: 'more' },
  { id: 'search', tab: 'mercury', icon: Globe2, labelZh: '全网索引', labelEn: 'Search', group: 'more' },
  { id: 'crawler', tab: 'crawler', icon: Radar, labelZh: '发现引擎', labelEn: 'Crawler', group: 'more' },
  { id: 'brand', tab: 'brand', icon: Palette, labelZh: '品牌系统', labelEn: 'Brand', group: 'more' },
];
