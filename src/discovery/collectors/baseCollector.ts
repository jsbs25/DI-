import { ResourceRecord } from '../types/index.js';

export interface CollectorConfig {
  id: string;
  sourceName: string;
  url: string;
  type: 'rss' | 'api' | 'web' | 'directory';
  planet: string;
  category?: string;
  tags?: string[];
  frequency: number; // in milliseconds
  active: boolean;
}

export abstract class BaseCollector {
  protected config: CollectorConfig;

  constructor(config: CollectorConfig) {
    this.config = config;
  }

  // To be implemented by specific collectors
  abstract collect(): Promise<ResourceRecord[]>;
}
