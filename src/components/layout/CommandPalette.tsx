import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Search, Home, MessageSquare, BookOpen, GraduationCap, Music2 } from 'lucide-react';
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
  { tab: 'globe', zh: 'EARTH ONE · 首页', en: 'EARTH ONE · Home', icon: Home },
  { tab: 'library', zh: '图书馆', en: 'Library', icon: BookOpen },
  { tab: 'arabic-learning', zh: '语言学习中心', en: 'Language Learning Center', icon: GraduationCap },
  { tab: 'chat', zh: '通讯中心', en: 'Communications Center', icon: MessageSquare },
  { tab: 'venus', zh: '音乐中心', en: 'Music Center', icon: Music2 },
];

export const CommandPalette: React.FC<Props> = ({ open, onOpenChange, onSelectTab, lang }) => {
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
      <Command className="relative w-full max-w-[540px] overflow-hidden rounded-[26px] border border-[#244e41]/18 dark:border-[#d6b77f]/22 bg-[#faf7f0]/96 dark:bg-[#111b26]/96 shadow-[0_24px_70px_rgba(14,28,22,0.34)] backdrop-blur-2xl" shouldFilter>
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
            placeholder={lang === 'zh' ? '快速切换图书馆、语言学习中心、通讯中心或音乐中心…' : 'Jump to Library, Language Center, Communications, or Music…'}
            className="flex-1 bg-transparent text-[14px] text-[#1c2c24] dark:text-[#f5f1e8] placeholder:text-[#7a8c82] dark:placeholder:text-[#7c8f99] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-[#244e41]/14 dark:border-white/15 bg-[#efe9dc] dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#52675c] dark:text-[#98a8b0]">ESC</kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2.5">
          <Command.Empty className="px-3 py-8 text-center text-sm text-[#5d7066] dark:text-[#90a1aa]">
            {lang === 'zh' ? '无匹配入口' : 'No matching destination'}
          </Command.Empty>
          <Command.Group heading={lang === 'zh' ? '核心入口' : 'Core Portals'} className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[#647a6e] dark:[&_[cmdk-group-heading]]:text-[#8b9da6]">
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
