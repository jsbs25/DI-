import React from 'react';
import {
  Home,
  Orbit,
  Sparkles,
  BookOpen,
  GraduationCap,
  Compass,
  MessageSquare,
  Search,
  SearchCheck,
  Radar,
  Network,
  PenTool,
  Film,
  Gamepad2,
  Users2,
  PanelLeftClose,
  PanelLeftOpen,
  Globe2,
  Music2,
  Moon
} from 'lucide-react';
import { Language } from '../../types/index.ts';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
  onSelectLang?: (lang: Language) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface NavItem {
  tab: string;
  icon: React.ComponentType<{ className?: string }>;
  label: { zh: string; en: string };
}

// Only real, implemented modules are listed. Modules that are not built yet
// (Academy / News / Developer / Personal Space) are intentionally omitted so
// the navigation never points at a non-existent page.
const NAV_ITEMS: NavItem[] = [
  { tab: 'globe', icon: Home, label: { zh: '首页 · 数字地球', en: 'HOME · GLOBE' } },
  { tab: 'universe', icon: Orbit, label: { zh: '探索 · 3D宇宙', en: 'EXPLORE · UNIVERSE' } },
  { tab: 'browser', icon: Search, label: { zh: '智能浏览器', en: 'BROWSER' } },
  { tab: 'saturn', icon: Film, label: { zh: '影视中心', en: 'CINEMA' } },
  { tab: 'venus', icon: Music2, label: { zh: '音乐馆', en: 'MUSIC' } },
  { tab: 'library', icon: BookOpen, label: { zh: '世界图书馆', en: 'LIBRARY' } },
  { tab: 'moon', icon: Moon, label: { zh: '天文观测', en: 'OBSERVATORY' } },
  { tab: 'aihub', icon: Sparkles, label: { zh: '人工智能中枢', en: 'AI HUB' } },
  { tab: 'creator', icon: PenTool, label: { zh: '创作者中心', en: 'CREATOR' } },
  { tab: 'crawler', icon: Radar, label: { zh: '采集网络中枢', en: 'CRAWLER HUB' } },
  { tab: 'arabic-learning', icon: GraduationCap, label: { zh: '阿语沉浸学习', en: 'ARABIC LEARNING' } },
  { tab: 'knowledge', icon: Network, label: { zh: '全域知识图谱', en: 'KNOWLEDGE' } },
  { tab: 'feed', icon: Compass, label: { zh: '全球社群动态', en: 'COMMUNITY FEED' } },
  { tab: 'chat', icon: MessageSquare, label: { zh: '全球即时通信', en: 'MESSENGER' } },
  { tab: 'community', icon: Users2, label: { zh: '数字聚落社区', en: 'COMMUNITIES' } }
];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, lang, collapsed, onToggleCollapsed }) => {
  const label = (item: NavItem) => (lang === 'zh' ? item.label.zh : item.label.en);

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 h-screen sticky top-0 border-r border-slate-800/70 bg-[#02050f]/90 backdrop-blur-xl transition-all duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[232px]'
      }`}
    >
      {/* Brand */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-slate-800/70 shrink-0`}>
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <Globe2 className="w-5 h-5 text-cyan-400" />
            <span className="font-bold tracking-wider text-white text-sm">{lang === 'zh' ? '地球计划' : 'PROJECT EARTH'}</span>
          </div>
        )}
        {collapsed && <Globe2 className="w-5 h-5 text-cyan-400" />}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? '展开导航' : '收起导航'}
          className="text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = currentTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => onSelectTab(item.tab)}
              title={collapsed ? label(item) : undefined}
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-start space-x-3'} px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-slate-800/80 text-white border border-slate-600/60'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
              }`}
            >
              <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
              {!collapsed && <span className="truncate">{label(item)}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer hint */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-800/70 text-[10px] text-slate-600">
          ONE UNIVERSE · ONE WORLD
        </div>
      )}
    </aside>
  );
};
