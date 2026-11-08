import { searchResources } from '../services/resourceManager.js';
import { analyzeSearchIntent, summarizeResults } from './ai_agent.js';
import { ResourceRecord } from '../types/index.js';

export interface UnifiedSearchResponse {
  query: string;
  intent: Awaited<ReturnType<typeof analyzeSearchIntent>>;
  results: ResourceRecord[];
  summary: string;
}

export async function performUnifiedSearch(query: string, limit = 30): Promise<UnifiedSearchResponse> {
  // 1. Analyze Intent
  const intent = await analyzeSearchIntent(query);

  // 2. Local DB Search (First Layer)
  // Use the full query or keywords for FTS5 matching
  const searchString = intent.keywords.join(' ');
  let results = searchResources(searchString, intent.planet, limit);

  // If local results are empty, search fallback without planet restriction
  if (results.length === 0) {
     results = searchResources(searchString, undefined, limit);
  }

  // 3. Fallback to External Web Search (Second Layer) if still not enough results
  if (results.length < limit / 2) {
      // Stub for external search integration (e.g. SearXNG)
      console.log(`[UnifiedSearch] Not enough local results for "${query}". Triggering external meta-search (stub)...`);
      // externalResults = await fetchFromSearXNG(query);
      // addOrUpdateResource(externalResults) -> merge to results
  }

  // 4. Summarize Results (Third Layer)
  const summary = await summarizeResults(query, results);

  return {
    query,
    intent,
    results,
    summary
  };
}
