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
  { tab: 'globe', zh: '首页', en: 'Home', icon: Home },
  { tab: 'feed', zh: '发现', en: 'Discover', icon: Compass },
  { tab: 'universe', zh: '空间', en: 'Spaces', icon: Orbit },
  { tab: 'venus', zh: 'ONE MUSIC', en: 'ONE MUSIC', icon: Music2 },
  { tab: 'aihub', zh: 'ONE INTELLIGENCE', en: 'ONE INTELLIGENCE', icon: Sparkles },
  { tab: 'library', zh: 'ONE LIBRARY', en: 'ONE LIBRARY', icon: BookOpen },
  { tab: 'browser', zh: 'ONE BROWSER', en: 'ONE BROWSER', icon: Search },
  { tab: 'chat', zh: '消息', en: 'Messages', icon: MessageSquare },
  { tab: 'video', zh: 'ONE VIDEO', en: 'ONE VIDEO', icon: Film },
  { tab: 'community', zh: 'ONE COMMUNITY', en: 'ONE COMMUNITY', icon: Users2 },
  { tab: 'creator', zh: 'ONE STUDIO', en: 'ONE STUDIO', icon: PenTool },
  { tab: 'arabic-learning', zh: 'ONE LEARNING', en: 'ONE LEARNING', icon: GraduationCap },
  { tab: 'knowledge', zh: 'ONE KNOWLEDGE', en: 'ONE KNOWLEDGE', icon: Network },
  { tab: 'moon', zh: 'ONE OBSERVATORY', en: 'ONE OBSERVATORY', icon: Moon },
  { tab: 'saturn', zh: 'ONE CINEMA', en: 'ONE CINEMA', icon: Film },
  { tab: 'mercury', zh: 'ONE SEARCH', en: 'ONE SEARCH', icon: Globe2 },
  { tab: 'game', zh: 'ONE GAMES', en: 'ONE GAMES', icon: Gamepad2 },
  { tab: 'crawler', zh: 'ONE CRAWLER', en: 'ONE CRAWLER', icon: Radar },
  { tab: 'brand', zh: '品牌', en: 'Brand', icon: Palette },
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
      <div className="absolute inset-0 bg-slate-900/35 dark:bg-black/55 backdrop-blur-md" onClick={() => onOpenChange(false)} />
      <Command className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.14] bg-white/96 dark:bg-[#162238]/96 shadow-2xl backdrop-blur-2xl" shouldFilter>
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-white/[0.08] px-4 py-3.5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Command.Input
            autoFocus
            value={value}
            onValueChange={setValue}
            placeholder={lang === 'zh' ? '搜索功能、页面或关键词…' : 'Search modules or type a query…'}
            className="flex-1 bg-transparent text-[14px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">ESC</kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {lang === 'zh' ? '无匹配结果，Enter 可全局搜索' : 'No matches — Enter to search globally'}
          </Command.Empty>
          {value.trim() && (
            <Command.Group heading={lang === 'zh' ? '搜索' : 'Search'} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400">
              <Command.Item
                value={`search ${value}`}
                onSelect={() => { onSearch(value.trim()); onSelectTab('feed'); onOpenChange(false); }}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 dark:text-slate-200 aria-selected:bg-sky-50 dark:aria-selected:bg-white/[0.08] transition-colors"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300"><Globe2 className="w-4 h-4" /></span>
                <span className="truncate">{lang === 'zh' ? `搜索 “${value.trim()}”` : `Search "${value.trim()}"`}</span>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Group heading={lang === 'zh' ? '模块' : 'Modules'} className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400">
            {filtered.map(item => {
              const Icon = item.icon;
              const label = lang === 'zh' ? item.zh : item.en;
              return (
                <Command.Item
                  key={item.tab}
                  value={`${label} ${item.tab} ${item.en} ${item.zh}`}
                  onSelect={() => { onSelectTab(item.tab); onOpenChange(false); }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-800 dark:text-slate-200 aria-selected:bg-sky-50 dark:aria-selected:bg-white/[0.08] transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300"><Icon className="w-4 h-4" /></span>
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
