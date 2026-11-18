import React, { useState } from 'react';
import {
  MonitorDown,
  Smartphone,
  X,
  Share,
  PlusSquare,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  MoreVertical,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';
import type { Language } from '../../types/index.ts';

interface PWAInstallButtonProps {
  lang?: Language;
  compact?: boolean;
  variant?: 'button' | 'menu-item';
  onActionDone?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang = 'zh',
  compact = true,
  variant = 'button',
  onActionDone,
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isIOSSafari,
    isAndroid,
    isMobile,
    isMac,
    isMacSafari,
    isInIframe,
    isInAppBrowser,
    install,
  } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const L = (zh: string, en: string, ar?: string) => (lang === 'ar' ? (ar || en) : lang === 'en' ? en : zh);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) {
        onActionDone?.();
        return;
      }
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard?.writeText(currentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {}
  };

  const buttonLabel = isInstallable
    ? L('添加到主屏幕', 'Install App', 'تثبيت التطبيق')
    : isIOS || isAndroid || isMobile
      ? L('添加到主屏幕', 'Add to Home', 'إضافة للشاشة')
      : isMac || isMacSafari
        ? L('安装应用', 'Mac App', 'تطبيق Mac')
        : L('安装应用', 'Install App', 'تثبيت التطبيق');

  const IconComp = isIOS || isAndroid || isMobile ? Smartphone : MonitorDown;

  return (
    <>
      {variant === 'menu-item' ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
        >
          <IconComp className="h-4 w-4 text-[#247864] dark:text-[#C4A876]" />
          <span>{buttonLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title={buttonLabel}
          className={
            compact
              ? 'inline-flex h-8 sm:h-9 items-center gap-1 rounded-xl border border-[#247864]/35 dark:border-[#D8B778]/35 bg-white/90 dark:bg-[#0B0F17]/80 px-2 sm:px-2.5 text-[11px] font-medium text-slate-900 dark:text-[#F2F5FA] shadow-sm transition-colors hover:border-[#247864]/70 dark:hover:border-[#D8B778]/65 hover:bg-slate-50 dark:hover:bg-[#131926] shrink-0'
              : 'inline-flex items-center gap-2 rounded-xl border border-[#D8B778]/40 bg-[#0B0F17]/90 px-3.5 py-2 text-xs font-medium text-[#F2F5FA] shadow-md transition-colors hover:border-[#D8B778]/70 hover:bg-[#131926]'
          }
        >
          <IconComp className="h-3.5 w-3.5 text-[#247864] dark:text-[#D8B778] shrink-0" />
          <span className={compact ? 'hidden sm:inline whitespace-nowrap' : 'whitespace-nowrap'}>{buttonLabel}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0F17] p-5 sm:p-6 text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/apple-touch-icon.png"
                  alt="ONE App Icon"
                  className="h-12 w-12 rounded-[13px] border border-white/15 shadow-lg shrink-0"
                />
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {isIOS || isAndroid || isMobile
                      ? L('添加 ONE 到手机主屏幕', 'Add ONE to Home Screen')
                      : L('安装 ONE 独立应用', 'Install ONE App')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {L('独立全屏启动 · 聊天信息直达 · 无浏览器地址栏', 'Standalone launch · Direct chat · Full-screen')}
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

            {isInIframe && (
              <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-100 space-y-2.5">
                <p className="font-semibold text-amber-200">
                  {L(
                    '当前处于预览窗口内，手机无法直接从嵌套窗口添加到桌面：',
                    'Browser security prevents installing from inside a preview frame:'
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{L('在新窗口打开后再安装', 'Open standalone tab to install')}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
                  >
                    {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedUrl ? L('已复制链接', 'Copied') : L('复制网址', 'Copy URL')}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-300">
              {isInAppBrowser ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B778]" />
                    <span>
                      {L(
                        '1. 微信 / QQ 内置浏览器不支持添加到主屏幕：请点击右上角「···」菜单，选择「在默认浏览器中打开」（iPhone 用 Safari，安卓用 Chrome / 系统浏览器）。',
                        '1. In-app browsers block Home Screen install. Tap the top-right menu and choose Open in Safari / Chrome.'
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6BFF]" />
                    <span>
                      {L(
                        '2. 在系统浏览器打开后，点击本按钮或浏览器菜单中的「添加到主屏幕」即可。',
                        '2. Once opened in your system browser, tap Add to Home Screen.'
                      )}
                    </span>
                  </div>
                </>
              ) : isIOS ? (
                <>
                  {!isIOSSafari && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-sky-500/10 p-2.5 text-sky-200 border border-sky-400/20">
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                      <span>
                        {L(
                          '提示：iPhone / iPad 若非 Safari 浏览器可能隐藏「添加到主屏幕」，建议复制链接在 Safari 中打开后添加（iOS 16.4+ 的 Chrome/Edge 也支持共享菜单添加）。',
                          'Tip: For the best standalone install on iPhone/iPad, open this link in Safari (or use Share → Add to Home Screen on iOS 16.4+).'
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6BFF]" />
                    <span>
                      {L(
                        '1. 点击 Safari 底部（或顶部）工具栏的「共享 ⬆」按钮。',
                        '1. Tap the Share button in Safari toolbar.'
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B778]" />
                    <span>
                      {L(
                        '2. 在弹出面板中向下滑动，点击「添加到主屏幕」，再点右上角「添加」即可像原生 App 一样独立全屏启动。',
                        '2. Scroll down, tap "Add to Home Screen", then tap "Add" to launch in full-screen standalone mode.'
                      )}
                    </span>
                  </div>
                </>
              ) : isAndroid || isMobile ? (
                <>
                  {isInstallable && (
                    <button
                      type="button"
                      onClick={() => void handleClick()}
                      className="w-full rounded-xl bg-[#247864] py-2.5 text-xs font-semibold text-white hover:bg-[#1f6756]"
                    >
                      {L('立即一键添加到主屏幕', 'Install Now')}
                    </button>
                  )}
                  <div className="flex items-start gap-2.5">
                    <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-[#2D6BFF]" />
                    <span>
                      {L(
                        '1. 打开浏览器菜单：点击 Chrome / Edge 右上角「⋮」按钮（或华为/小米/系统浏览器底部「≡」菜单）。',
                        '1. Tap the browser menu button (⋮ in Chrome/Edge or ≡ in system browser).'
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B778]" />
                    <span>
                      {L(
                        '2. 选择「安装应用」或「添加到主屏幕」→ 确认添加（如手机拦截桌面快捷方式，请在系统设置中允许该浏览器“创建桌面快捷方式”权限）。',
                        '2. Select "Install app" or "Add to Home screen" and confirm.'
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
                        'Chrome / Edge：点击浏览器地址栏右侧的「安装」图标，或在菜单中选择「安装 ONE…」。',
                        'Chrome / Edge: Click the Install icon in the address bar, or open menu → "Install ONE…".'
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {!isInIframe && (
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"
                >
                  {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedUrl ? L('已复制', 'Copied') : L('复制链接', 'Copy Link')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex-1 rounded-xl bg-white py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                {L('知道了', 'Got it')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
