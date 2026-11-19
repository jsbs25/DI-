import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Search, Home, Orbit, Sparkles, MessageSquare, BookOpen, Film, Users2, GraduationCap, Globe2, Compass, Network, PenTool, Gamepad2, Radar, Music2, Moon, Palette, Shield } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectTab: (tab: string) => void;
  onSearch: (q: string) => void;
  lang: Language;
};

const ITEMS = [
  { tab: 'globe', zh: '天堂花园 · 首页', en: 'Paradise World · Home', icon: Home },
  { tab: 'feed', zh: '发现', en: 'Discover', icon: Compass },
  { tab: 'universe', zh: '空间矩阵', en: 'Spaces', icon: Orbit },
  { tab: 'venus', zh: 'ONE MUSIC', en: 'ONE MUSIC', icon: Music2 },
  { tab: 'aihub', zh: 'ONE INTELLIGENCE', en: 'ONE INTELLIGENCE', icon: Sparkles },
  { tab: 'library', zh: 'ONE LIBRARY', en: 'ONE LIBRARY', icon: BookOpen },
  { tab: 'browser', zh: 'ONE BROWSER', en: 'ONE BROWSER', icon: Search },
  { tab: 'network', zh: 'ONE NETWORK · 代理与 VPN', en: 'ONE NETWORK · Proxy & VPN', icon: Shield },
  { tab: 'chat', zh: '消息与通话', en: 'Messages & Calls', icon: MessageSquare },
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
  { tab: 'brand', zh: '品牌标识', en: 'Brand Identity', icon: Palette },
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
      <div className="absolute inset-0 bg-[#0d1920]/42 dark:bg-black/62 backdrop-blur-md" onClick={() => onOpenChange(false)} />
      <Command className="relative w-full max-w-[640px] overflow-hidden rounded-[26px] border border-[#244e41]/18 dark:border-[#d6b77f]/22 bg-[#faf7f0]/96 dark:bg-[#111b26]/96 shadow-[0_24px_70px_rgba(14,28,22,0.34)] backdrop-blur-2xl" shouldFilter>
        <div className="flex items-center gap-3 border-b border-[#244e41]/12 dark:border-white/[0.09] px-4 py-3.5">
          <span className="dark:hidden shrink-0">
            <ParadiseBrandEmblem variant="medallion" size={26} surface="light" />
          </span>
          <span className="hidden dark:inline-flex shrink-0">
            <ParadiseBrandEmblem variant="medallion" size={26} surface="dark" />
          </span>
          <Search className="w-4 h-4 text-[#5e7368] dark:text-[#8ea1aa] shrink-0" />
          <Command.Input
            autoFocus
            value={value}
            onValueChange={setValue}
            placeholder={lang === 'zh' ? '探索天堂花园空间、功能或输入关键词…' : 'Explore Paradise World spaces, modules, or search…'}
            className="flex-1 bg-transparent text-[14px] text-[#1c2c24] dark:text-[#f5f1e8] placeholder:text-[#7a8c82] dark:placeholder:text-[#7c8f99] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-[#244e41]/14 dark:border-white/15 bg-[#efe9dc] dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#52675c] dark:text-[#98a8b0]">ESC</kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2.5">
          <Command.Empty className="px-3 py-8 text-center text-sm text-[#5d7066] dark:text-[#90a1aa]">
            {lang === 'zh' ? '无匹配结果，Enter 可全局搜索' : 'No matches — Enter to search globally'}
          </Command.Empty>
          {value.trim() && (
            <Command.Group heading={lang === 'zh' ? '搜索' : 'Search'} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[#647a6e] dark:[&_[cmdk-group-heading]]:text-[#8b9da6]">
              <Command.Item
                value={`search ${value}`}
                onSelect={() => { onSearch(value.trim()); onSelectTab('feed'); onOpenChange(false); }}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-[#1e3128] dark:text-[#f1ede4] aria-selected:bg-[#247864]/10 dark:aria-selected:bg-[#d6b77f]/14 transition-colors"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#247864]/12 dark:bg-[#d6b77f]/16 text-[#247864] dark:text-[#d6b77f]"><Globe2 className="w-4 h-4" /></span>
                <span className="truncate">{lang === 'zh' ? `搜索 “${value.trim()}”` : `Search "${value.trim()}"`}</span>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Group heading={lang === 'zh' ? '空间入口' : 'Spaces'} className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[#647a6e] dark:[&_[cmdk-group-heading]]:text-[#8b9da6]">
            {filtered.map(item => {
              const Icon = item.icon;
              const label = lang === 'zh' ? item.zh : item.en;
              return (
                <Command.Item
                  key={item.tab}
                  value={`${label} ${item.tab} ${item.en} ${item.zh}`}
                  onSelect={() => { onSelectTab(item.tab); onOpenChange(false); }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-[#1e3128] dark:text-[#f1ede4] aria-selected:bg-[#247864]/10 dark:aria-selected:bg-[#d6b77f]/14 transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#efe9dc] dark:bg-white/[0.06] text-[#456155] dark:text-[#c7b38b]"><Icon className="w-4 h-4" /></span>
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

