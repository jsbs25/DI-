import React, { useMemo, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { DOCK_ITEMS, MORE_ITEMS } from '../globe/globeNav.ts';
import type { Language } from '../../types/index.ts';
import { Drawer } from 'vaul';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';

type Props = {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
  hidden?: boolean;
  hideMobileDock?: boolean;
  hideDesktopDock?: boolean;
};

export const AppDock: React.FC<Props> = ({ currentTab, onSelectTab, lang, hidden, hideMobileDock, hideDesktopDock }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const items = DOCK_ITEMS;
  const label = (it: { labelZh: string; labelEn: string }) => (lang === 'zh' ? it.labelZh : it.labelEn);

  const moreList = useMemo(() => MORE_ITEMS, []);

  return (
    <div className={hidden ? 'hidden' : 'block'}>
      {/* Desktop Left Paradise Spatial Dock */}
      <nav
        aria-label={lang === 'zh' ? '主空间导航' : 'Primary spatial dock'}
        className={`pointer-events-auto fixed left-3 top-1/2 z-50 hidden max-h-[calc(100dvh-6rem)] -translate-y-1/2 flex-col gap-1 overflow-y-auto rounded-2xl border border-[#244e41]/14 dark:border-[#d6b77f]/16 bg-[#faf7f0]/88 dark:bg-[#111b26]/86 p-1.5 backdrop-blur-2xl saturate-150 shadow-[0_14px_38px_rgba(24,42,33,0.14)] dark:shadow-[0_20px_50px_rgba(4,9,16,0.58)] [scrollbar-width:none] ${hideDesktopDock ? 'hidden' : 'md:flex'}`}
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
                  ? 'border-[#247864]/35 dark:border-[#d6b77f]/45 bg-[#247864]/12 dark:bg-[#d6b77f]/14 text-[#1d3b31] dark:text-[#f5f1e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]'
                  : 'border-transparent bg-transparent text-[#55665e] dark:text-[#96a4ae] hover:-translate-y-0.5 hover:border-[#244e41]/14 dark:hover:border-[#d6b77f]/22 hover:bg-[#244e41]/[0.05] dark:hover:bg-white/[0.06] hover:text-[#1f2e27] dark:hover:text-[#f5f1e8]'
              }`}
            >
              {active && (
                <span
                  className="absolute left-0.5 top-2.5 bottom-2.5 w-[2px] rounded-full bg-[#247864] dark:bg-[#d6b77f]"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-105" />
              <span className="pointer-events-none absolute left-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-[#244e41]/14 dark:border-[#d6b77f]/18 bg-[#faf7f0]/96 dark:bg-[#111b26]/96 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#1f2e27] dark:text-[#f5f1e8] opacity-0 -translate-x-1 shadow-lg transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
                {label(it)}
              </span>
            </button>
          );
        })}

        <div className="mx-2 my-0.5 h-px bg-[#244e41]/12 dark:bg-white/10" />

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          title={lang === 'zh' ? '更多模块' : 'More Spaces'}
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-[#55665e] dark:text-[#96a4ae] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#244e41]/14 dark:hover:border-[#d6b77f]/22 hover:bg-[#244e41]/[0.05] dark:hover:bg-white/[0.06] hover:text-[#1f2e27] dark:hover:text-[#f5f1e8] cursor-pointer"
        >
          <MoreHorizontal className="h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-105" />
          <span className="pointer-events-none absolute left-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-[#244e41]/14 dark:border-[#d6b77f]/18 bg-[#faf7f0]/96 dark:bg-[#111b26]/96 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#1f2e27] dark:text-[#f5f1e8] opacity-0 -translate-x-1 shadow-lg transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
            {lang === 'zh' ? '更多' : 'More'}
          </span>
        </button>
      </nav>

      {/* Mobile Bottom Spatial Dock */}
      <nav
        aria-label={lang === 'zh' ? '移动端主导航' : 'Mobile spatial dock'}
        className={`pointer-events-auto fixed inset-x-0 bottom-0 z-50 ${hideMobileDock ? 'hidden' : 'md:hidden'}`}
      >
        <div className="mx-auto flex max-w-xl items-center justify-around border-t border-[#244e41]/12 dark:border-[#d6b77f]/15 bg-[#faf7f0]/90 dark:bg-[#111b26]/88 px-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl saturate-150 shadow-sm">
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
                    ? 'text-[#247864] dark:text-[#d6b77f]'
                    : 'text-[#5a6c63] dark:text-[#96a4ae] active:text-[#1f2e27] dark:active:text-[#f5f1e8]'
                }`}
              >
                <span
                  className={`rounded-lg p-1 transition-colors ${
                    active ? 'bg-[#247864]/12 dark:bg-[#d6b77f]/16' : ''
                  }`}
                >
                  <Icon className="h-[20px] w-[20px]" />
                </span>
                <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">{label(it)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-[46px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[#5a6c63] dark:text-[#96a4ae] active:text-[#1f2e27] dark:active:text-[#f5f1e8]"
          >
            <span className="rounded-lg p-1">
              <MoreHorizontal className="h-[20px] w-[20px]" />
            </span>
            <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none">{lang === 'zh' ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>

      {/* Spatial Module Matrix Drawer */}
      <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[70] bg-[#0e1920]/45 dark:bg-black/65 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[71] mt-24 flex max-h-[82vh] flex-col rounded-t-[26px] border-t border-[#244e41]/16 dark:border-[#d6b77f]/18 bg-[#faf7f0]/98 dark:bg-[#111b26]/98 outline-none backdrop-blur-xl shadow-[0_-16px_48px_rgba(12,24,18,0.28)]">
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#244e41]/20 dark:bg-[#d6b77f]/25" />
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="dark:hidden">
                  <ParadiseBrandEmblem variant="medallion" size={28} surface="light" />
                </span>
                <span className="hidden dark:inline-flex">
                  <ParadiseBrandEmblem variant="medallion" size={28} surface="dark" />
                </span>
                <div>
                  <Drawer.Title className="text-sm font-semibold tracking-wide text-[#1d2e26] dark:text-[#f5f1e8]">
                    {lang === 'zh' ? '全部空间模块' : 'Spatial Modules'}
                  </Drawer.Title>
                  <p className="text-[10px] tracking-[0.16em] uppercase text-[#5c7166] dark:text-[#98a8b0]">
                    EARTH ONE · PARADISE WORLD
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-xl p-2 text-[#5c7166] dark:text-[#98a8b0] hover:bg-[#244e41]/8 dark:hover:bg-white/6 hover:text-[#1d2e26] dark:hover:text-[#f5f1e8] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:grid-cols-4">
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
                    className={`flex min-h-[78px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200 cursor-pointer ${
                      active
                        ? 'border-[#247864]/45 dark:border-[#d6b77f]/55 bg-[#247864]/10 dark:bg-[#d6b77f]/14 text-[#193026] dark:text-[#f5f1e8]'
                        : 'border-[#244e41]/12 dark:border-white/[0.09] bg-[#f3eee4]/75 dark:bg-white/[0.03] text-[#354940] dark:text-[#c4ced6] hover:bg-[#ebe4d6] dark:hover:bg-white/[0.07] hover:border-[#247864]/28 dark:hover:border-[#d6b77f]/32'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-[#247864] dark:text-[#d6b77f]' : 'text-[#4f675c] dark:text-[#9fb0b8]'}`} />
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

