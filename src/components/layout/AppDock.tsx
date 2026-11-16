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
  const label = (it: { labelZh: string; labelEn: string }) => (lang === 'zh' ? it.labelZh : it.labelEn);

  const moreList = useMemo(() => MORE_ITEMS, []);

  return (
    <div className={hidden ? 'hidden' : 'block'}>
      {/* Desktop Left Spatial Titanium Dock */}
      <nav
        aria-label={lang === 'zh' ? '主空间导航' : 'Primary spatial dock'}
        className="pointer-events-auto fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl border border-slate-900/10 dark:border-white/[0.14] bg-white/80 dark:bg-[#0B0D14]/76 p-1.5 backdrop-blur-2xl saturate-150 shadow-[0_14px_38px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.55)] md:flex"
      >
        {items.map((it) => {
          const Icon = it.icon as any;
          const active = currentTab === it.tab;
          return (
            <button
              key={it.tab}
              type="button"
              onClick={() => onSelectTab(it.tab)}
              title={label(it)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer ${
                active
                  ? 'border-[#C4A876]/55 bg-slate-900/[0.07] dark:bg-white/[0.12] text-slate-950 dark:text-[#F7F5F0] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]'
                  : 'border-transparent bg-transparent text-slate-500 dark:text-[#98A1AE] hover:-translate-y-0.5 hover:border-slate-900/10 dark:hover:border-white/[0.14] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F7F5F0]'
              }`}
            >
              {active && (
                <span
                  className="absolute left-0.5 top-2.5 bottom-2.5 w-[2px] rounded-full bg-[#247864] dark:bg-[#C4A876]"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-105" />
              <span className="pointer-events-none absolute left-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-slate-900/10 dark:border-white/[0.14] bg-white/95 dark:bg-[#0B0D14]/96 px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 dark:text-[#F7F5F0] opacity-0 -translate-x-1 shadow-lg transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
                {label(it)}
              </span>
            </button>
          );
        })}

        <div className="mx-2 my-0.5 h-px bg-slate-900/10 dark:bg-white/12" />

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          title={lang === 'zh' ? '更多模块' : 'More Spaces'}
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-slate-500 dark:text-[#98A1AE] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-900/10 dark:hover:border-white/[0.14] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#F7F5F0] cursor-pointer"
        >
          <MoreHorizontal className="h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-105" />
          <span className="pointer-events-none absolute left-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-slate-900/10 dark:border-white/[0.14] bg-white/95 dark:bg-[#0B0D14]/96 px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 dark:text-[#F7F5F0] opacity-0 -translate-x-1 shadow-lg transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
            {lang === 'zh' ? '更多' : 'More'}
          </span>
        </button>
      </nav>

      {/* Mobile Bottom Spatial Dock */}
      <nav
        aria-label={lang === 'zh' ? '移动端主导航' : 'Mobile spatial dock'}
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 md:hidden"
      >
        <div className="mx-auto flex max-w-xl items-center justify-around border-t border-slate-200/80 dark:border-white/[0.12] bg-white/85 dark:bg-[#0B0D14]/82 px-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl saturate-150 shadow-sm">
          {items.slice(0, 5).map((it) => {
            const Icon = it.icon as any;
            const active = currentTab === it.tab;
            return (
              <button
                key={it.tab}
                type="button"
                onClick={() => onSelectTab(it.tab)}
                title={label(it)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[46px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
                  active
                    ? 'text-[#247864] dark:text-[#C4A876]'
                    : 'text-slate-500 dark:text-[#98A1AE] active:text-slate-900 dark:active:text-white'
                }`}
              >
                <span
                  className={`rounded-lg p-1 transition-colors ${
                    active ? 'bg-[#247864]/10 dark:bg-[#C4A876]/15' : ''
                  }`}
                >
                  <Icon className="h-[20px] w-[20px]" />
                </span>
                <span className="text-[10px] font-medium leading-none">{label(it)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-[46px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-slate-500 dark:text-[#98A1AE] active:text-slate-900 dark:active:text-white"
          >
            <span className="rounded-lg p-1">
              <MoreHorizontal className="h-[20px] w-[20px]" />
            </span>
            <span className="text-[10px] font-medium leading-none">{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>

      {/* Spatial Module Matrix Drawer */}
      <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[70] bg-slate-950/45 dark:bg-black/65 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[71] mt-24 flex max-h-[82vh] flex-col rounded-t-[24px] border-t border-slate-200 dark:border-white/[0.14] bg-white/98 dark:bg-[#090B10]/98 outline-none backdrop-blur-xl">
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="flex items-center justify-between px-5 py-3">
              <Drawer.Title className="text-sm font-semibold tracking-wide text-slate-900 dark:text-[#F7F5F0]">
                {lang === 'zh' ? '全部空间模块' : 'Spatial Modules'}
              </Drawer.Title>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-xl p-2 text-slate-500 dark:text-[#98A1AE] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:grid-cols-4">
              {moreList.map((it) => {
                const Icon = it.icon as any;
                const active = currentTab === it.tab;
                return (
                  <button
                    key={it.tab}
                    type="button"
                    onClick={() => {
                      onSelectTab(it.tab);
                      setMoreOpen(false);
                    }}
                    className={`flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-all duration-200 cursor-pointer ${
                      active
                        ? 'border-[#247864]/45 dark:border-[#C4A876]/55 bg-[#247864]/8 dark:bg-[#C4A876]/12 text-slate-950 dark:text-[#F7F5F0]'
                        : 'border-slate-200 dark:border-white/[0.09] bg-slate-50/70 dark:bg-white/[0.03] text-slate-700 dark:text-[#B9C1CD] hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.18]'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-[#247864] dark:text-[#C4A876]' : ''}`} />
                    <span className="text-[11px] font-medium leading-tight">{label(it as any)}</span>
                  </button>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
};
