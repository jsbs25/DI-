import { BaseCollector, CollectorConfig } from './baseCollector.js';
import { ResourceRecord } from '../types/index.js';
import crypto from 'crypto';

export class ApiCollector extends BaseCollector {
  constructor(config: CollectorConfig) {
    super(config);
  }

  async collect(): Promise<ResourceRecord[]> {
    try {
      const response = await fetch(this.config.url);
      if (!response.ok) return [];

      const data = await response.json();

      // Note: In a real system, you'd have mapping configurations
      // per API source to correctly map the API JSON to ResourceRecord.
      // This is a simplified fallback mapping logic.
      const items = Array.isArray(data) ? data : (data.items || data.results || data.data || []);

      const records: ResourceRecord[] = items.map((item: any) => {
        const title = item.title || item.name || 'Untitled';
        const url = item.url || item.link || item.homepage || '';
        let domain = '';
        try { if (url) domain = new URL(url).hostname; } catch {}

        return {
          id: crypto.randomUUID(),
          name: title,
          url: url,
          domain: domain,
          description: item.description || item.summary || '',
          resource_type: this.config.category === 'books' ? 'book' : 'api_resource',
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
      });

      return records.filter(r => r.url && r.url.startsWith('http'));
    } catch (error) {
      console.error(`[ApiCollector] Failed to collect from ${this.config.url}:`, error);
      return [];
    }
  }
}
