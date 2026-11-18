import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function getGlobalPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).__oneDeferredInstallPrompt as BeforeInstallPromptEvent | undefined) || null;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => getGlobalPrompt());
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS, setIsIOS] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMacSafari, setIsMacSafari] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };
    checkStandalone();

    const mql = window.matchMedia('(display-mode: standalone)');
    const onMqlChange = () => checkStandalone();
    mql.addEventListener?.('change', onMqlChange);

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);
    const isMacDesktop = /macintosh|mac os x/.test(ua) && !isIOSDevice;
    const isSafariBrowser = /safari/.test(ua) && !/chrome|crios|chromium|edg|edgios|opr|firefox|fxios|micromessenger|qq\//.test(ua);
    const isInApp = /micromessenger|qq\/|weibo|dingtalk|aliapp|bytedance/.test(ua);

    setIsIOS(isIOSDevice);
    setIsIOSSafari(isIOSDevice && isSafariBrowser);
    setIsAndroid(isAndroidDevice);
    setIsMobile(isIOSDevice || isAndroidDevice || window.innerWidth < 768);
    setIsMac(isMacDesktop);
    setIsMacSafari(isMacDesktop && isSafariBrowser);
    setIsInAppBrowser(isInApp);

    const existing = getGlobalPrompt();
    if (existing) setDeferredPrompt(existing);

    const handlePromptReady = () => {
      setDeferredPrompt(getGlobalPrompt());
    };
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__oneDeferredInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      (window as any).__oneDeferredInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('one-pwa-prompt-ready', handlePromptReady);
    window.addEventListener('one-pwa-installed', handleAppInstalled);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mql.removeEventListener?.('change', onMqlChange);
      window.removeEventListener('one-pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('one-pwa-installed', handleAppInstalled);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const promptEvt = deferredPrompt || getGlobalPrompt();
    if (!promptEvt) return false;
    try {
      await promptEvt.prompt();
      const { outcome } = await promptEvt.userChoice;
      if (outcome === 'accepted') {
        (window as any).__oneDeferredInstallPrompt = null;
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch {}
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
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
  };
}
