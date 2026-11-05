import type { Language } from '../../types/index.ts';

export type JupiterSearchEngine = 'auto' | 'bing' | 'duckduckgo' | 'wikipedia' | 'github';
export type JupiterSearchCategory = 'all' | 'images' | 'videos' | 'news' | 'pdf' | 'audio' | 'books' | 'academic';

export interface JupiterSearchRoute {
  query: string;
  engine: JupiterSearchEngine;
  lang: Language;
  category: JupiterSearchCategory;
  page: number;
}

const ENGINES: JupiterSearchEngine[] = ['auto', 'bing', 'duckduckgo', 'wikipedia', 'github'];
const CATEGORIES: JupiterSearchCategory[] = ['all', 'images', 'videos', 'news', 'pdf', 'audio', 'books', 'academic'];
const LANGUAGES: Language[] = ['en', 'zh', 'ar', 'es', 'fr', 'ru'];
const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';

export function buildJupiterSearchRoute(
  query: string,
  engine: JupiterSearchEngine,
  lang: Language,
  category: JupiterSearchCategory = 'all',
  page = 1
): string {
  const params = new URLSearchParams({ q: query.trim(), engine, lang });
  if (category !== 'all') params.set('type', category);
  if (Number.isSafeInteger(page) && page > 1) params.set('page', String(page));
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
    const category = url.searchParams.get('type');
    const requestedPage = Number(url.searchParams.get('page'));
    return {
      query,
      engine: ENGINES.includes(engine as JupiterSearchEngine) ? engine as JupiterSearchEngine : 'auto',
      lang: LANGUAGES.includes(lang as Language) ? lang as Language : 'en',
      category: CATEGORIES.includes(category as JupiterSearchCategory) ? category as JupiterSearchCategory : 'all',
      page: Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100 ? requestedPage : 1
    };
  } catch {
    return null;
  }
}
