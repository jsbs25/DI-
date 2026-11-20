import type { LucideIcon } from 'lucide-react';
import {
  Home,
  BookOpen,
  GraduationCap,
  MessageSquare,
  Music2,
} from 'lucide-react';

export type DockItem = { id: string; tab: string; icon: LucideIcon; labelZh: string; labelEn: string; group?: string };

// Unified streamlined navigation: Home + four core portals only
export const DOCK_ITEMS: DockItem[] = [
  { id: 'home', tab: 'globe', icon: Home, labelZh: '首页', labelEn: 'Home', group: 'core' },
  { id: 'library', tab: 'library', icon: BookOpen, labelZh: '图书馆', labelEn: 'Library', group: 'core' },
  { id: 'learning', tab: 'arabic-learning', icon: GraduationCap, labelZh: '语言学习中心', labelEn: 'Language Center', group: 'core' },
  { id: 'messages', tab: 'chat', icon: MessageSquare, labelZh: '通讯中心', labelEn: 'Communications', group: 'core' },
  { id: 'music', tab: 'venus', icon: Music2, labelZh: '音乐中心', labelEn: 'Music Center', group: 'core' },
];

export const MORE_ITEMS: DockItem[] = [];
