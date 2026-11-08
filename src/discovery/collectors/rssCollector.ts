import Parser from 'rss-parser';
import { BaseCollector } from './baseCollector.js';
import { ResourceRecord } from '../types/index.js';
import crypto from 'crypto';

export class RssCollector extends BaseCollector {
  private parser: Parser;

  constructor(config: any) {
    super(config);
    this.parser = new Parser();
  }

  async collect(): Promise<ResourceRecord[]> {
    try {
      const feed = await this.parser.parseURL(this.config.url);
      const records: ResourceRecord[] = feed.items.map(item => {
        let domain = '';
        try {
          if (item.link) {
            domain = new URL(item.link).hostname;
          }
        } catch { }

        return {
          id: crypto.randomUUID(),
          name: item.title || 'Untitled',
          url: item.link || '',
          domain: domain,
          description: item.contentSnippet || item.content || undefined,
          resource_type: 'article',
          planet: this.config.planet,
          category: this.config.category,
          tags: this.config.tags,
          source: this.config.sourceName,
          status: 'active',
          quality_score: 50, // Base score
          created_at: Date.now(),
          updated_at: Date.now(),
          last_checked_at: Date.now()
        };
      });

      // Filter out invalid URLs
      return records.filter(r => r.url && r.url.startsWith('http'));
    } catch (error) {
      console.error(`[RssCollector] Failed to collect from ${this.config.url}:`, error);
      return [];
    }
  }
}
