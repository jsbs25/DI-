import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Search, Home, Orbit, Sparkles, MessageSquare, BookOpen, Film, Users2, GraduationCap, Globe2, Compass, Network, PenTool, Gamepad2, Radar, Music2, Moon, Palette } from 'lucide-react';
import type { Language } from '../../types/index.ts';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectTab: (tab: string) => void;
  onSearch: (q: string) => void;
  lang: Language;
};

const ITEMS = [
  { tab: 'globe', zh: '数字地球', en: 'Earth', icon: Home },
  { tab: 'universe', zh: '3D宇宙', en: 'Universe', icon: Orbit },
  { tab: 'aihub', zh: 'AI 中枢', en: 'AI Hub', icon: Sparkles },
  { tab: 'chat', zh: '全球即时通信', en: 'Messenger', icon: MessageSquare },
  { tab: 'library', zh: '世界图书馆', en: 'Library', icon: BookOpen },
  { tab: 'browser', zh: '智能浏览器', en: 'Browser', icon: Search },
  { tab: 'video', zh: '视频中心', en: 'Video', icon: Film },
  { tab: 'community', zh: '社区', en: 'Community', icon: Users2 },
  { tab: 'arabic-learning', zh: '阿语学习', en: 'Arabic Learning', icon: GraduationCap },
  { tab: 'feed', zh: '全球动态', en: 'Feed', icon: Compass },
  { tab: 'knowledge', zh: '知识图谱', en: 'Knowledge', icon: Network },
  { tab: 'creator', zh: '创作者', en: 'Creator', icon: PenTool },
  { tab: 'game', zh: '游戏中心', en: 'Games', icon: Gamepad2 },
  { tab: 'crawler', zh: '采集中心', en: 'Crawler', icon: Radar },
  { tab: 'saturn', zh: '影视中心', en: 'Cinema', icon: Film },
  { tab: 'venus', zh: '音乐馆', en: 'Music', icon: Music2 },
  { tab: 'moon', zh: '天文观测', en: 'Observatory', icon: Moon },
  { tab: 'mercury', zh: '全局信息检索', en: 'Discovery Search', icon: Search },
  { tab: 'brand', zh: '独一 ONE 品牌规范', en: 'Brand System', icon: Palette },
];

export const CommandPalette: React.FC<Props> = ({ open, onOpenChange, onSelectTab, onSearch, lang }) => {
  const [value, setValue] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const filtered = useMemo(() => ITEMS, []);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4 sm:px-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={() => onOpenChange(false)} />
      <Command className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(7,10,18,0.92)] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl" shouldFilter>
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <Command.Input
            autoFocus
            value={value}
            onValueChange={setValue}
            placeholder={lang === 'zh' ? '搜索功能、页面或关键词…' : 'Search modules or type a query…'}
            className="flex-1 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-slate-500">ESC</kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-slate-500">
            {lang === 'zh' ? '无匹配结果，Enter 可全局搜索' : 'No matches — Enter to search globally'}
          </Command.Empty>
          {value.trim() && (
            <Command.Group heading={lang === 'zh' ? '搜索' : 'Search'} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-500">
              <Command.Item
                value={`search ${value}`}
                onSelect={() => { onSearch(value.trim()); onSelectTab('feed'); onOpenChange(false); }}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-200 aria-selected:bg-white/[0.07] transition-colors"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(78,161,255,0.12)] text-[var(--color-accent-soft)]"><Globe2 className="w-4 h-4" /></span>
                <span className="truncate">{lang === 'zh' ? `搜索 “${value.trim()}”` : `Search "${value.trim()}"`}</span>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Group heading={lang === 'zh' ? '模块' : 'Modules'} className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-500">
            {filtered.map(item => {
              const Icon = item.icon;
              const label = lang === 'zh' ? item.zh : item.en;
              return (
                <Command.Item
                  key={item.tab}
                  value={`${label} ${item.tab} ${item.en} ${item.zh}`}
                  onSelect={() => { onSelectTab(item.tab); onOpenChange(false); }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-200 aria-selected:bg-white/[0.07] transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-slate-400"><Icon className="w-4 h-4" /></span>
                  <span className="truncate">{label}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
};
