/**
 * EARTH ONE - Discovery Scheduler & Link Health Inspector
 * Runs gentle, background maintenance tasks:
 * 1. Periodic RSS feeds sync
 * 2. Asynchronous link health validation (HTTP HEAD status checks)
 * 3. Bounded concurrency and rate limiting tailored for MacBook Air M2
 */
import { discoveryDb } from '../database/db.ts';
import { harvestRssFeed } from '../connectors/rssConnector.ts';
import { ResourceItem } from '../types.ts';

let isRunningHealthCheck = false;
let isRunningRssSync = false;

/**
 * Validate a single URL via HTTP HEAD request
 */
async function checkUrlHealth(url: string, timeoutMs = 5_000): Promise<{ isAlive: boolean; statusCode: number }> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'EarthOne-HealthBot/1.0 (+https://earthone.world/health)',
        'Accept': '*/*'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });

    // 2xx and 3xx are definitely alive, 403/401 often mean anti-bot but site is alive
    const alive = res.status < 400 || res.status === 401 || res.status === 403;
    return { isAlive: alive, statusCode: res.status };
  } catch {
    return { isAlive: false, statusCode: 0 };
  }
}

/**
 * Inspect a batch of resources and mark invalid/dead links
 */
export async function runLinkHealthCheck(batchSize = 10): Promise<{ checked: number; deadFound: number }> {
  if (isRunningHealthCheck) {
    return { checked: 0, deadFound: 0 };
  }

  isRunningHealthCheck = true;
  let checked = 0;
  let deadFound = 0;

  try {
    // Select items that haven't been checked recently (older than 24h)
    const { items } = discoveryDb.searchResources({ limit: batchSize });

    for (const item of items) {
      const { isAlive, statusCode } = await checkUrlHealth(item.url);
      checked++;

      if (!isAlive && statusCode === 404) {
        discoveryDb.updateResourceStatus(item.id, 'dead', statusCode);
        deadFound++;
      } else {
        discoveryDb.updateResourceStatus(item.id, 'active', statusCode || 200);
      }

      // Gentle pause to protect network & CPU
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (err: any) {
    console.warn('[HealthScheduler] Check error:', err.message);
  } finally {
    isRunningHealthCheck = false;
  }

  return { checked, deadFound };
}

/**
 * Poll all active RSS crawl sources
 */
export async function runRssSync(): Promise<{ sourcesProcessed: number; itemsCollected: number }> {
  if (isRunningRssSync) {
    return { sourcesProcessed: 0, itemsCollected: 0 };
  }

  isRunningRssSync = true;
  let sourcesProcessed = 0;
  let itemsCollected = 0;

  try {
    const sources = discoveryDb.getAllSources().filter(s => s.enabled && s.sourceType === 'rss');

    for (const src of sources) {
      const res = await harvestRssFeed(src.url, {
        targetPlanet: src.targetPlanet,
        defaultCategory: src.defaultCategory,
        sourceName: src.name,
        maxItems: 15
      });

      sourcesProcessed++;
      itemsCollected += res.added;

      // Rate limit between sources
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  } catch (err: any) {
    console.warn('[RssScheduler] Sync error:', err.message);
  } finally {
    isRunningRssSync = false;
  }

  return { sourcesProcessed, itemsCollected };
}

/**
 * Initialize background daemon timers
 */
export function startDiscoveryScheduler() {
  // Sync RSS every 2 hours
  const rssTimer = setInterval(() => {
    void runRssSync();
  }, 2 * 60 * 60 * 1000);
  rssTimer.unref?.();

  // Validate link health every 4 hours
  const healthTimer = setInterval(() => {
    void runLinkHealthCheck(20);
  }, 4 * 60 * 60 * 1000);
  healthTimer.unref?.();
}
