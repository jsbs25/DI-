import type { Language } from '../../types/index.ts';

export type JupiterSearchEngine = 'auto' | 'bing' | 'duckduckgo' | 'wikipedia' | 'github';

export interface JupiterSearchRoute {
  query: string;
  engine: JupiterSearchEngine;
  lang: Language;
}

const ENGINES: JupiterSearchEngine[] = ['auto', 'bing', 'duckduckgo', 'wikipedia', 'github'];
const LANGUAGES: Language[] = ['en', 'zh', 'ar', 'es', 'fr', 'ru'];
const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';

export function buildJupiterSearchRoute(query: string, engine: JupiterSearchEngine, lang: Language): string {
  const params = new URLSearchParams({ q: query.trim(), engine, lang });
  return `/jupiter/search?${params}`;
}

export function parseJupiterSearchRoute(value: string): JupiterSearchRoute | null {
  try {
    const url = new URL(value, JUPITER_ORIGIN);
    if (url.pathname !== '/jupiter/search') return null;
    const query = url.searchParams.get('q')?.trim() || '';
    if (!query) return null;
    const engine = url.searchParams.get('engine');
    const lang = url.searchParams.get('lang');
    return {
      query,
      engine: ENGINES.includes(engine as JupiterSearchEngine) ? engine as JupiterSearchEngine : 'auto',
      lang: LANGUAGES.includes(lang as Language) ? lang as Language : 'en'
    };
  } catch {
    return null;
  }
}
