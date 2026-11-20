/**
 * Real Core Web Vitals & Runtime Performance Telemetry (LCP, INP, CLS, Memory)
 * Non-intrusive browser PerformanceObserver; exposes live snapshot for System Health panel.
 */
export interface WebVitalsSnapshot {
  lcpMs: number | null;
  inpMs: number | null;
  cls: number;
  ttfbMs: number | null;
  jsHeapUsedMb: number | null;
  jsHeapLimitMb: number | null;
  updatedAt: number;
}

const snapshot: WebVitalsSnapshot = {
  lcpMs: null,
  inpMs: null,
  cls: 0,
  ttfbMs: null,
  jsHeapUsedMb: null,
  jsHeapLimitMb: null,
  updatedAt: Date.now(),
};

let initialized = false;

export function initWebVitalsMonitor(): void {
  if (initialized || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  initialized = true;

  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && Number.isFinite(nav.responseStart)) {
      snapshot.ttfbMs = Math.round(nav.responseStart);
    }
  } catch {}

  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        snapshot.lcpMs = Math.round(last.startTime);
        snapshot.updatedAt = Date.now();
      }
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true } as any);
  } catch {}

  try {
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput && typeof entry.value === 'number') {
          snapshot.cls = Number((snapshot.cls + entry.value).toFixed(4));
          snapshot.updatedAt = Date.now();
        }
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true } as any);
  } catch {}

  try {
    const inpObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        const dur = Number(entry.duration || 0);
        if (dur > 0 && (snapshot.inpMs === null || dur > snapshot.inpMs)) {
          snapshot.inpMs = Math.round(dur);
          snapshot.updatedAt = Date.now();
        }
      }
    });
    inpObs.observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
  } catch {}
}

export function getWebVitalsSnapshot(): WebVitalsSnapshot {
  try {
    const mem = (performance as any).memory;
    if (mem && typeof mem.usedJSHeapSize === 'number') {
      snapshot.jsHeapUsedMb = Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
      snapshot.jsHeapLimitMb = Math.round((mem.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10;
    }
  } catch {}
  return { ...snapshot };
}
