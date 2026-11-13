import React, { useEffect, useState } from 'react';
import type { Language } from '../../types/index.ts';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC<{ lang?: Language }> = ({ lang = 'zh' }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[110] flex items-center gap-2 rounded-xl border border-amber-400/30 bg-[#0B0F17]/95 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span>{lang === 'zh' ? '离线模式 — 正在使用本地缓存数据' : 'Offline Mode — Using cached data'}</span>
    </div>
  );
};
