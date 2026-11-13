import React, { useState } from 'react';
import { MonitorDown, X, Share, PlusSquare, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';
import type { Language } from '../../types/index.ts';

interface PWAInstallButtonProps {
  lang?: Language;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang = 'zh', compact = true }) => {
  const { isInstallable, isInstalled, isIOS, isMac, isMacSafari, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const L = (zh: string, en: string, ar?: string) => (lang === 'ar' ? (ar || en) : lang === 'en' ? en : zh);

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) return;
      return;
    }
    setShowGuide(true);
  };

  const buttonLabel = isInstallable
    ? L('安装桌面版', 'Install App', 'تثبيت التطبيق')
    : isIOS
      ? L('添加到主屏幕', 'Add to Home', 'إضافة للشاشة')
      : isMac || isMacSafari
        ? L('Mac 桌面版', 'Mac App', 'تطبيق Mac')
        : L('桌面版安装', 'Desktop App', 'تطبيق سطح المكتب');

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={buttonLabel}
        className={
          compact
            ? 'inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#D8B778]/35 bg-[#0B0F17]/80 px-2.5 text-[11px] font-medium text-[#F2F5FA] shadow-sm transition-colors hover:border-[#D8B778]/65 hover:bg-[#131926]'
            : 'inline-flex items-center gap-2 rounded-xl border border-[#D8B778]/40 bg-[#0B0F17]/90 px-3.5 py-2 text-xs font-medium text-[#F2F5FA] shadow-md transition-colors hover:border-[#D8B778]/70 hover:bg-[#131926]'
        }
      >
        <MonitorDown className="h-3.5 w-3.5 text-[#D8B778]" />
        <span className={compact ? 'hidden md:inline' : ''}>{buttonLabel}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0F17] p-6 text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/apple-touch-icon.png"
                  alt="EARTH ONE App Icon"
                  className="h-12 w-12 rounded-[13px] border border-white/15 shadow-lg"
                />
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {isIOS
                      ? L('安装 EARTH ONE 到 iPhone / iPad', 'Install EARTH ONE on iPhone / iPad')
                      : L('安装 EARTH ONE Apple 桌面版', 'Install EARTH ONE Mac Desktop App')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {L('独立窗口运行 · 程序坞原生图标 · 离线支持', 'Standalone window · Native Dock icon · Offline ready')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-300">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6BFF]" />
                    <span>
                      {L(
                        '1. 点击 Safari 底部或顶部的「共享」按钮。',
                        '1. Tap the Share button in the Safari toolbar.'
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B778]" />
                    <span>
                      {L(
                        '2. 向下滚动并选择「添加到主屏幕」，即可作为独立 App 启动。',
                        '2. Scroll down and tap "Add to Home Screen" to launch as a standalone app.'
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B778]" />
                    <span>
                      {isMacSafari
                        ? L(
                            'Safari (macOS Sonoma 及以上)：点击顶部菜单栏「文件」→「添加到程序坞…」(或点击地址栏右侧「共享」→「添加到程序坞」)。',
                            'Safari (macOS Sonoma+): Click "File" → "Add to Dock…" in the top menu bar (or Share → Add to Dock).'
                          )
                        : L(
                            'Safari (Mac)：在菜单栏点击「文件」→「添加到程序坞…」即可直接生成原生 Mac 桌面应用并固定到 Dock。',
                            'Safari on Mac: Click File → Add to Dock… in the macOS menu bar to create a native Mac Dock app.'
                          )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6BFF]" />
                    <span>
                      {L(
                        'Chrome / Edge (Mac)：点击浏览器地址栏右侧的「安装」图标，或在菜单中选择「安装 EARTH ONE…」。',
                        'Chrome / Edge on Mac: Click the Install icon in the address bar, or open menu → "Install EARTH ONE…".'
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-white py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              {L('知道了', 'Got it')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
