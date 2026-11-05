import React from 'react';
import {
  Home,
  Orbit,
  Sparkles,
  BookOpen,
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
  Globe2
} from 'lucide-react';
import { Language } from '../../types/index.ts';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
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
  { tab: 'globe', icon: Home, label: { zh: '首页', en: 'HOME' } },
  { tab: 'universe', icon: Orbit, label: { zh: '探索', en: 'EXPLORE' } },
  { tab: 'mercury', icon: SearchCheck, label: { zh: '搜索', en: 'SEARCH' } },
  { tab: 'aihub', icon: Sparkles, label: { zh: '人工智能', en: 'INTELLIGENCE' } },
  { tab: 'library', icon: BookOpen, label: { zh: '图书馆', en: 'LIBRARY' } },
  { tab: 'feed', icon: Compass, label: { zh: '社区', en: 'COMMUNITY' } },
  { tab: 'chat', icon: MessageSquare, label: { zh: '消息', en: 'MESSAGES' } },
  { tab: 'browser', icon: Search, label: { zh: 'JUPITER 木星搜索', en: 'JUPITER SEARCH' } },
  { tab: 'crawler', icon: Radar, label: { zh: '采集中心', en: 'CRAWLER' } },
  { tab: 'knowledge', icon: Network, label: { zh: '知识', en: 'KNOWLEDGE' } },
  { tab: 'creator', icon: PenTool, label: { zh: '创作', en: 'CREATOR' } },
  { tab: 'video', icon: Film, label: { zh: '视频', en: 'VIDEO' } },
  { tab: 'game', icon: Gamepad2, label: { zh: '游戏', en: 'GAMES' } },
  { tab: 'community', icon: Users2, label: { zh: '社区列表', en: 'COMMUNITIES' } }
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
