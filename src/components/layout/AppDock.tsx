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
      <div className="pointer-events-auto fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-0.5 rounded-[22px] eo-glass p-1.5 md:flex shadow-lg shadow-black/20">
        {items.map(it => {
          const Icon = it.icon as any;
          const active = currentTab === it.tab;
          return (
            <button
              key={it.tab}
              onClick={() => onSelectTab(it.tab)}
              title={label(it)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${active ? 'bg-[rgba(78,161,255,0.16)] text-white ring-1 ring-[rgba(78,161,255,0.22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}
            >
              <Icon className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-[1.03] ${active ? 'text-[var(--color-accent-soft)]' : ''}`} />
              <span className="pointer-events-none absolute left-[calc(100%+10px)] whitespace-nowrap rounded-lg eo-glass-strong px-2.5 py-1 text-[11px] font-medium text-slate-100 opacity-0 translate-x-[-4px] shadow-xl transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
                {label(it)}
              </span>
            </button>
          );
        })}
        <div className="mx-2 my-1 h-px bg-white/10" />
        <button
          onClick={() => setMoreOpen(true)}
          title={lang === 'zh' ? '更多' : 'More'}
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-slate-100"
        >
          <MoreHorizontal className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-[1.03]" />
          <span className="pointer-events-none absolute left-[calc(100%+10px)] whitespace-nowrap rounded-lg eo-glass-strong px-2.5 py-1 text-[11px] font-medium text-slate-100 opacity-0 translate-x-[-4px] shadow-xl transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
            {lang === 'zh' ? '更多' : 'More'}
          </span>
        </button>
      </div>

      {/* Mobile bottom dock */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-around border-t border-white/10 bg-[rgba(4,7,16,0.82)] px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl">
          {items.slice(0, 5).map(it => {
            const Icon = it.icon as any;
            const active = currentTab === it.tab;
            return (
              <button key={it.tab} onClick={() => onSelectTab(it.tab)} aria-current={active ? 'page' : undefined} className={`flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${active ? 'text-[var(--color-accent-soft)]' : 'text-slate-400 active:text-slate-200'}`}>
                <span className={`rounded-lg p-1 transition-colors ${active ? 'bg-[rgba(78,161,255,0.14)]' : ''}`}><Icon className="h-[20px] w-[20px]" /></span>
                <span className="text-[10px] font-medium leading-none">{label(it)}</span>
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className="flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-slate-400 active:text-slate-200">
            <span className="rounded-lg p-1"><MoreHorizontal className="h-[20px] w-[20px]" /></span>
            <span className="text-[10px] font-medium leading-none">{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </div>

      <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[71] mt-24 flex max-h-[82vh] flex-col rounded-t-[28px] border-t border-white/10 bg-[#060a16]/98 outline-none backdrop-blur-xl">
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between px-5 py-3">
              <Drawer.Title className="text-sm font-semibold tracking-wide text-white">{lang === 'zh' ? '更多模块' : 'More'}</Drawer.Title>
              <button onClick={() => setMoreOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:grid-cols-4">
              {moreList.map(it => {
                const Icon = it.icon as any;
                const active = currentTab === it.tab;
                return (
                  <button key={it.tab} onClick={() => { onSelectTab(it.tab); setMoreOpen(false); }} className={`flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200 ${active ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.12)] text-white' : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05] hover:border-white/[0.12]'}`}>
                    <Icon className={`h-5 w-5 ${active ? 'text-[var(--color-accent-soft)]' : ''}`} />
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
