import { performance } from 'node:perf_hooks';

let monitorStarted = false;
let latestEventLoopLagMs = 0;
let peakEventLoopLagMs = 0;

/**
 * Starts a low-overhead event loop lag monitor (unref'd so it never blocks shutdown).
 */
export function startEventLoopMonitor(): void {
  if (monitorStarted) return;
  monitorStarted = true;
  const intervalMs = 2000;
  let expected = performance.now() + intervalMs;

  const timer = setInterval(() => {
    const now = performance.now();
    const lag = Math.max(0, now - expected);
    latestEventLoopLagMs = Math.round(lag * 10) / 10;
    if (latestEventLoopLagMs > peakEventLoopLagMs) {
      peakEventLoopLagMs = latestEventLoopLagMs;
    }
    expected = now + intervalMs;
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export interface SystemHealthOptions {
  wsMetrics: {
    onlineUsers?: number;
    activeUsers?: number;
    activeSockets: number;
    dedupCacheSize?: number;
    recentDedupCount?: number;
  };
  storeCounts: {
    users: number;
    conversations: number;
    books: number;
    posts: number;
  };
  security: {
    mailConfigured: boolean;
    mailProvider: string;
    googleOAuthConfigured: boolean;
  };
  ai: {
    liveEngineOnline: boolean;
  };
}

export function getSystemHealthSnapshot(opts: SystemHealthOptions) {
  const mem = process.memoryUsage();
  const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10;

  const status = latestEventLoopLagMs > 250 ? 'degraded' : 'healthy';

  return {
    status,
    uptimeSec: Math.round(process.uptime()),
    nodeVersion: process.version,
    memory: {
      rssMb,
      heapUsedMb,
      heapTotalMb,
    },
    eventLoop: {
      lagMs: latestEventLoopLagMs,
      peakLagMs: peakEventLoopLagMs,
    },
    ws: {
      activeUsers: opts.wsMetrics.activeUsers ?? opts.wsMetrics.onlineUsers ?? 0,
      activeSockets: opts.wsMetrics.activeSockets ?? 0,
      recentDedupCount: opts.wsMetrics.recentDedupCount ?? opts.wsMetrics.dedupCacheSize ?? 0,
    },
    store: opts.storeCounts,
    security: {
      emailDomainVerification: true,
      disposableDomainBlocking: true,
      rateLimiting: true,
      httpSecurityHeaders: true,
      gzipCompression: true,
      mailConfigured: opts.security.mailConfigured,
      mailProvider: opts.security.mailProvider,
      googleOAuthConfigured: opts.security.googleOAuthConfigured,
    },
    ai: {
      liveEngineOnline: opts.ai.liveEngineOnline,
      unifiedCoreReady: true,
    },
    timestamp: new Date().toISOString(),
  };
}
