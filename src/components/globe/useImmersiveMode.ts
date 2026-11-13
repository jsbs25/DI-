import { useCallback, useEffect, useRef, useState } from 'react';

export function useImmersiveMode() {
  const [immersive, setImmersive] = useState(false);
  const lastActivity = useRef(Date.now());
  const autoTimer = useRef<number | null>(null);

  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const enter = useCallback(() => setImmersive(true), []);
  const exit = useCallback(() => setImmersive(false), []);
  const toggle = useCallback(() => setImmersive(v => !v), []);

  useEffect(() => {
    const onMove = () => markActivity();
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchstart', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onMove);
    };
  }, [markActivity]);

  return { immersive, enter, exit, toggle, markActivity };
}
