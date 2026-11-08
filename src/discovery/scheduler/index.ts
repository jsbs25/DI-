import { addOrUpdateResource } from '../services/resourceManager.js';
import { RssCollector } from '../collectors/rssCollector.js';
import { BaseCollector } from '../collectors/baseCollector.js';

const activeCollectors: BaseCollector[] = [];

// Sample configuration to bootstrap the system
const initialConfigs = [
  {
    id: 'tech-news-rss-1',
    sourceName: 'Hacker News RSS',
    url: 'https://news.ycombinator.com/rss',
    type: 'rss' as const,
    planet: 'mercury', // News
    category: 'tech',
    tags: ['news', 'programming', 'startup'],
    frequency: 3600000, // 1 hour
    active: true
  }
];

export function initScheduler() {
  console.log('[Discovery] Initializing scheduler...');

  // Register collectors
  for (const config of initialConfigs) {
    if (!config.active) continue;

    if (config.type === 'rss') {
      activeCollectors.push(new RssCollector(config));
    }
    // ... handling API, Web, etc.
  }

  // Run once immediately, then set interval (in a real app, use cron or advanced job queue)
  runAllCollectors();
}

async function runAllCollectors() {
  for (const collector of activeCollectors) {
    console.log(`[Discovery] Running collector: ${(collector as any).config.sourceName}`);
    try {
      const records = await collector.collect();
      let added = 0;
      let updated = 0;

      for (const record of records) {
        const isNew = addOrUpdateResource(record);
        if (isNew) added++;
        else updated++;
      }
      console.log(`[Discovery] Collector ${(collector as any).config.sourceName} finished. Added: ${added}, Updated: ${updated}`);
    } catch (e) {
      console.error(`[Discovery] Collector error:`, e);
    }
  }
}
