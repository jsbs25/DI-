/**
 * EARTH ONE - 3-Layer Unified Search Engine
 * Layer 1: Local SQLite FTS5 high-speed indexed search
 * Layer 2: Real-time external open connector discovery (TVmaze, Open Library, arXiv, Bilibili, YouTube)
 * Layer 3: Local AI (Qwen/Ollama) intent understanding and comparison synthesis
 */
import { discoveryDb } from '../database/db.ts';
import { SearchQuery, SearchResponse, ResourceItem } from '../types.ts';
import { parseNaturalLanguageIntent, summarizeSearchResultsWithAi } from '../classifiers/planetClassifier.ts';
import { searchTVmazeCinema, searchOpenLibraryBooks, searchArxivPapers } from '../connectors/openApiConnector.ts';
import { harvestBilibiliVideos, harvestYouTubeVideos, harvestYouTubeMusic } from '../connectors/bilibiliYoutubeConnector.ts';

export async function executeUnifiedSearch(params: SearchQuery): Promise<SearchResponse> {
  const originalQuery = (params.q || '').trim();
  let effectiveQuery = originalQuery;
  let targetPlanet = params.planet;
  let aiIntentResult = undefined;

  // 1. Layer 3: AI Intent Understanding (if enabled or prompt is long natural sentence)
  if (params.useAiIntent || (originalQuery.length > 10 && !params.planet)) {
    try {
      const intent = await parseNaturalLanguageIntent(originalQuery);
      aiIntentResult = intent;
      if (!targetPlanet) {
        targetPlanet = intent.targetPlanet;
      }
      if (intent.suggestedKeywords.length > 0) {
        effectiveQuery = intent.suggestedKeywords.join(' ');
      }
    } catch {
      // Fallback gracefully to raw query
    }
  }

  // 2. Layer 1: Local SQLite FTS5 Search
  const localResult = discoveryDb.searchResources({
    ...params,
    q: effectiveQuery,
    planet: targetPlanet
  });

  let items = localResult.items;
  let layer: SearchResponse['searchLayer'] = 'local_fts';

  // 3. Layer 2: External Open Discovery Fallback
  // If local results are sparse (< 4) or includeExternal is explicitly true, query live connectors
  const needsExternal = (items.length < 4 || params.includeExternal) && effectiveQuery.length > 0;

  if (needsExternal) {
    layer = items.length > 0 ? 'hybrid' : 'external_open';

    try {
      const externalTasks: Promise<any>[] = [];

      // Route to relevant external open connectors based on target planet
      if (!targetPlanet || targetPlanet === 'saturn') {
        externalTasks.push(searchTVmazeCinema(effectiveQuery, 4));
        externalTasks.push(harvestBilibiliVideos(effectiveQuery, 4));
        externalTasks.push(harvestYouTubeVideos(effectiveQuery, 4));
      }
      if (!targetPlanet || targetPlanet === 'neptune') {
        externalTasks.push(searchOpenLibraryBooks(effectiveQuery, 4));
      }
      if (!targetPlanet || targetPlanet === 'uranus') {
        externalTasks.push(searchArxivPapers(effectiveQuery, 4));
      }
      if (!targetPlanet || targetPlanet === 'venus') {
        externalTasks.push(harvestYouTubeMusic(effectiveQuery, 4));
      }

      // Execute external harvesting in parallel with 3.5s timeout barrier
      if (externalTasks.length > 0) {
        await Promise.race([
          Promise.allSettled(externalTasks),
          new Promise(resolve => setTimeout(resolve, 3_500))
        ]);

        // Re-query local DB which now contains the freshly harvested and deduplicated items
        const refreshed = discoveryDb.searchResources({
          ...params,
          q: effectiveQuery,
          planet: targetPlanet
        });
        if (refreshed.items.length > 0) {
          items = refreshed.items;
        }
      }
    } catch (err: any) {
      console.warn('[UnifiedSearchEngine] External discovery notice:', err.message);
    }
  }

  // 4. Layer 3 (Post): AI Comparative Summary
  let aiSummary = undefined;
  if (params.useAiIntent && items.length > 0) {
    try {
      aiSummary = await summarizeSearchResultsWithAi(originalQuery, items);
    } catch {
      // Summary is optional
    }
  }

  return {
    success: true,
    query: originalQuery,
    total: items.length,
    page: params.page || 1,
    limit: params.limit || 20,
    items,
    searchLayer: layer,
    aiIntent: aiIntentResult,
    aiSummary
  };
}
