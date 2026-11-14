import React, { useMemo, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { DOCK_ITEMS, MORE_ITEMS } from '../globe/globeNav.ts';
import type { Language } from '../../types/index.ts';
import { Drawer } from 'vaul';

type Props = {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
  hidden?: boolean;
};

export const AppDock: React.FC<Props> = ({ currentTab, onSelectTab, lang, hidden }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const items = DOCK_ITEMS;
  const label = (it: { labelZh: string; labelEn: string }) => (lang === 'zh' ? it.labelZh : lang === 'ar' ? it.labelEn : it.labelEn);

  const moreList = useMemo(() => MORE_ITEMS, []);
  if (hidden) return null;

  return (
    <>
      {/* Desktop left dock */}
      <div className="pointer-events-auto fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-0.5 rounded-[22px] eo-glass p-1.5 md:flex">
        {items.map(it => {
          const Icon = it.icon as any;
          const active = currentTab === it.tab;
          return (
            <button
              key={it.tab}
              onClick={() => onSelectTab(it.tab)}
              title={label(it)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 ring-1 ring-sky-200 dark:ring-sky-400/35' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white'}`}
            >
              <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-[1.03]" />
              <span className="pointer-events-none absolute left-[calc(100%+10px)] whitespace-nowrap rounded-lg eo-glass-strong px-2.5 py-1 text-[11px] font-medium text-slate-900 dark:text-slate-100 opacity-0 translate-x-[-4px] shadow-md transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
                {label(it)}
              </span>
            </button>
          );
        })}
        <div className="mx-2 my-1 h-px bg-slate-900/10 dark:bg-white/15" />
        <button
          onClick={() => setMoreOpen(true)}
          title={lang === 'zh' ? '更多' : 'More'}
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 transition-all duration-200 hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white"
        >
          <MoreHorizontal className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-[1.03]" />
          <span className="pointer-events-none absolute left-[calc(100%+10px)] whitespace-nowrap rounded-lg eo-glass-strong px-2.5 py-1 text-[11px] font-medium text-slate-900 dark:text-slate-100 opacity-0 translate-x-[-4px] shadow-md transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
            {lang === 'zh' ? '更多' : 'More'}
          </span>
        </button>
      </div>

      {/* Mobile bottom dock */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-around border-t border-slate-200 dark:border-white/15 bg-white/92 dark:bg-[#142036]/92 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl shadow-sm">
          {items.slice(0, 5).map(it => {
            const Icon = it.icon as any;
            const active = currentTab === it.tab;
            return (
              <button key={it.tab} onClick={() => onSelectTab(it.tab)} aria-current={active ? 'page' : undefined} className={`flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${active ? 'text-sky-600 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400 active:text-slate-900 dark:active:text-white'}`}>
                <span className={`rounded-lg p-1 transition-colors ${active ? 'bg-sky-50 dark:bg-sky-500/20' : ''}`}><Icon className="h-[20px] w-[20px]" /></span>
                <span className="text-[10px] font-medium leading-none">{label(it)}</span>
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className="flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-slate-500 dark:text-slate-400 active:text-slate-900 dark:active:text-white">
            <span className="rounded-lg p-1"><MoreHorizontal className="h-[20px] w-[20px]" /></span>
            <span className="text-[10px] font-medium leading-none">{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </div>

      <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[70] bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[71] mt-24 flex max-h-[82vh] flex-col rounded-t-[28px] border-t border-slate-200 dark:border-white/15 bg-white/98 dark:bg-[#162238]/98 outline-none backdrop-blur-xl">
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/25" />
            <div className="flex items-center justify-between px-5 py-3">
              <Drawer.Title className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">{lang === 'zh' ? '更多模块' : 'More'}</Drawer.Title>
              <button onClick={() => setMoreOpen(false)} className="rounded-xl p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:grid-cols-4">
              {moreList.map(it => {
                const Icon = it.icon as any;
                const active = currentTab === it.tab;
                return (
                  <button key={it.tab} onClick={() => { onSelectTab(it.tab); setMoreOpen(false); }} className={`flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200 ${active ? 'border-sky-300 dark:border-sky-400/45 bg-sky-50 dark:bg-sky-500/20 text-sky-900 dark:text-white' : 'border-slate-200 dark:border-white/[0.1] bg-slate-50/70 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.18]'}`}>
                    <Icon className={`h-5 w-5 ${active ? 'text-sky-600 dark:text-sky-300' : ''}`} />
                    <span className="text-[11px] font-medium leading-tight">{label(it as any)}</span>
                  </button>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
};
