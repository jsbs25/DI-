// Export the main interfaces of the Discovery Engine
export { initDiscoveryDatabase, getDB } from './database/index.js';
export { initScheduler } from './scheduler/index.js';
export { searchResources, addOrUpdateResource } from './services/resourceManager.js';
export { performUnifiedSearch } from './search/unifiedSearch.js';
export { WebCollector } from './collectors/webCollector.js';
export { ApiCollector } from './collectors/apiCollector.js';
export { RssCollector } from './collectors/rssCollector.js';
export * from './types/index.js';
