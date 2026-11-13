import type { LucideIcon } from 'lucide-react';
import { Home, Orbit, Sparkles, BookOpen, GraduationCap, Compass, MessageSquare, Search, Radar, Network, PenTool, Film, Gamepad2, Users2, Music2, Moon } from 'lucide-react';

export type DockItem = { id: string; tab: string; icon: LucideIcon; labelZh: string; labelEn: string; group?: string };

export const DOCK_ITEMS: DockItem[] = [
  { id: 'home', tab: 'globe', icon: Home, labelZh: '地球', labelEn: 'Earth', group: 'core' },
  { id: 'universe', tab: 'universe', icon: Orbit, labelZh: '宇宙', labelEn: 'Universe', group: 'core' },
  { id: 'ai', tab: 'aihub', icon: Sparkles, labelZh: 'AI', labelEn: 'AI', group: 'core' },
  { id: 'messenger', tab: 'chat', icon: MessageSquare, labelZh: '通信', labelEn: 'Messenger', group: 'core' },
  { id: 'library', tab: 'library', icon: BookOpen, labelZh: '图书馆', labelEn: 'Library', group: 'core' },
  { id: 'browser', tab: 'browser', icon: Search, labelZh: '浏览器', labelEn: 'Browser', group: 'core' },
  { id: 'video', tab: 'video', icon: Film, labelZh: '视频', labelEn: 'Video', group: 'core' },
  { id: 'community', tab: 'community', icon: Users2, labelZh: '社区', labelEn: 'Community', group: 'core' },
  { id: 'learning', tab: 'arabic-learning', icon: GraduationCap, labelZh: '学习', labelEn: 'Learning', group: 'core' },
];

export const MORE_ITEMS: DockItem[] = [
  { tab: 'feed', icon: Compass, labelZh: '全球动态', labelEn: 'Feed' } as any,
  { tab: 'knowledge', icon: Network, labelZh: '知识图谱', labelEn: 'Knowledge' } as any,
  { tab: 'creator', icon: PenTool, labelZh: '创作者', labelEn: 'Creator' } as any,
  { tab: 'game', icon: Gamepad2, labelZh: '游戏', labelEn: 'Games' } as any,
  { tab: 'crawler', icon: Radar, labelZh: '采集中心', labelEn: 'Crawler' } as any,
  { tab: 'saturn', icon: Film, labelZh: '土星影院', labelEn: 'Saturn' } as any,
  { tab: 'venus', icon: Music2, labelZh: '金星音乐', labelEn: 'Venus' } as any,
  { tab: 'moon', icon: Moon, labelZh: '月球观测', labelEn: 'Moon' } as any,
  { tab: 'mercury', icon: Search, labelZh: '水星搜索', labelEn: 'Mercury' } as any,
].map(i => ({ ...i, id: i.tab, group: 'more' }));
