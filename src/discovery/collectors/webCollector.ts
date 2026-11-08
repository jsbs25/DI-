import * as cheerio from 'cheerio';
import { BaseCollector, CollectorConfig } from './baseCollector.js';
import { ResourceRecord } from '../types/index.js';
import crypto from 'crypto';

export class WebCollector extends BaseCollector {

  constructor(config: CollectorConfig) {
    super(config);
  }

  async collect(): Promise<ResourceRecord[]> {
    try {
      const response = await fetch(this.config.url, {
        headers: {
          'User-Agent': 'EARTH-ONE-DISCOVERY-BOT/1.0'
        }
      });
      if (!response.ok) {
         return [];
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const title = $('title').text() || $('meta[property="og:title"]').attr('content') || 'Untitled';
      const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

      let domain = '';
      try {
         domain = new URL(this.config.url).hostname;
      } catch { }

      const record: ResourceRecord = {
          id: crypto.randomUUID(),
          name: title.trim(),
          url: this.config.url,
          domain: domain,
          description: description.trim(),
          resource_type: 'website',
          planet: this.config.planet,
          category: this.config.category,
          tags: this.config.tags,
          source: this.config.sourceName,
          status: 'active',
          quality_score: 50,
          created_at: Date.now(),
          updated_at: Date.now(),
          last_checked_at: Date.now()
      };

      return [record];
    } catch (error) {
      console.error(`[WebCollector] Failed to collect from ${this.config.url}:`, error);
      return [];
    }
  }
}
