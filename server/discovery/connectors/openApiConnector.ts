/**
 * EARTH ONE - Public Open API Connector
 * Connects to verified, 100% free, sustainable open data sources without commercial API keys:
 * - Open Library & Internet Archive (Books / Neptune)
 * - TVmaze (Cinema & TV metadata / Saturn)
 * - arXiv (Research papers / Uranus)
 * - NASA Open Data (Astronomy / Moon)
 */
import { discoveryDb } from '../database/db.ts';
import { PlanetId, ResourceType } from '../types.ts';

const TIMEOUT_MS = 8_000;

/**
 * 1. TVmaze API: Search cinema and television metadata (No key needed)
 */
export async function searchTVmazeCinema(query: string, limit = 10): Promise<number> {
  const q = query.trim();
  if (!q) return 0;

  try {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EarthOne-DiscoveryBot/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return 0;

    const data: any[] = await res.json();
    let saved = 0;

    for (const item of (Array.isArray(data) ? data.slice(0, limit) : [])) {
      const show = item.show;
      if (!show || !show.name) continue;

      const title = show.name;
      const showUrl = show.url || `https://www.tvmaze.com/shows/${show.id}`;
      const summary = (show.summary || '').replace(/<[^>]+>/g, '').trim().slice(0, 350);
      const rating = show.rating?.average ? `评分: ${show.rating.average}` : '';
      const genres = Array.isArray(show.genres) ? show.genres : [];
      const image = show.image?.medium || show.image?.original;
      const year = show.premiered ? show.premiered.slice(0, 4) : undefined;

      discoveryDb.insertOrUpdateResource({
        url: showUrl,
        name: `${title}${year ? ` (${year})` : ''}`,
        description: summary || `${title} · 影视剧集资料与播放信息`,
        resourceType: 'video' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'cinema',
        tags: ['影视', '电视剧', ...genres, rating].filter(Boolean),
        language: show.language ? show.language.toLowerCase().slice(0, 2) : 'en',
        icon: image,
        source: 'api:tvmaze',
        copyrightStatus: 'official',
        accessType: 'open',
        qualityScore: 90,
        extraMeta: {
          tvmazeId: show.id,
          rating: show.rating?.average,
          premiered: show.premiered,
          genres
        }
      });
      saved++;
    }
    return saved;
  } catch (err: any) {
    console.warn('[TVmaze] Search error:', err.message);
    return 0;
  }
}

/**
 * 2. Open Library API: Search books metadata and open borrowing links (No key needed)
 */
export async function searchOpenLibraryBooks(query: string, limit = 10): Promise<number> {
  const q = query.trim();
  if (!q) return 0;

  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=key,title,author_name,first_publish_year,language,cover_i,ia`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EarthOne-DiscoveryBot/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return 0;

    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.docs) ? data.docs : [];
    let saved = 0;

    for (const d of docs) {
      const title = String(d.title || '');
      const key = typeof d.key === 'string' ? d.key : '';
      if (!title || !key) continue;

      const author = Array.isArray(d.author_name) ? d.author_name[0] : '佚名作者';
      const year = d.first_publish_year ? String(d.first_publish_year) : '';
      const cover = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined;
      const iaId = Array.isArray(d.ia) && d.ia[0] ? String(d.ia[0]) : '';
      const bookUrl = `https://openlibrary.org${key}`;

      discoveryDb.insertOrUpdateResource({
        url: bookUrl,
        name: title,
        description: `作者: ${author} ${year ? `· 出版年份: ${year}` : ''} · Open Library 开放典藏世界图书馆`,
        resourceType: 'book' as ResourceType,
        primaryPlanet: 'neptune' as PlanetId,
        category: 'digital_library',
        tags: ['图书', '世界图书馆', author, year].filter(Boolean),
        language: Array.isArray(d.language) && d.language[0] ? String(d.language[0]) : 'zh',
        icon: cover,
        source: 'api:openlibrary',
        copyrightStatus: 'public_domain',
        accessType: 'open',
        qualityScore: 92,
        extraMeta: {
          author,
          year,
          iaId,
          embedUrl: iaId ? `https://archive.org/embed/${encodeURIComponent(iaId)}` : undefined
        }
      });
      saved++;
    }
    return saved;
  } catch (err: any) {
    console.warn('[OpenLibrary] Search error:', err.message);
    return 0;
  }
}

/**
 * 3. arXiv API: Search open science and technology research papers (No key needed)
 */
export async function searchArxivPapers(query: string, limit = 8): Promise<number> {
  const q = query.trim();
  if (!q) return 0;

  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${limit}&sortBy=relevance`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EarthOne-DiscoveryBot/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return 0;

    const xml = await res.text();
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match: RegExpExecArray | null;
    let saved = 0;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i);
      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/i);

      const title = (titleMatch ? titleMatch[1] : '').replace(/\s+/g, ' ').trim();
      const summary = (summaryMatch ? summaryMatch[1] : '').replace(/\s+/g, ' ').trim().slice(0, 350);
      const paperUrl = idMatch ? idMatch[1].trim() : '';

      if (title && paperUrl) {
        discoveryDb.insertOrUpdateResource({
          url: paperUrl,
          name: title,
          description: summary,
          resourceType: 'research' as ResourceType,
          primaryPlanet: 'uranus' as PlanetId,
          planets: ['uranus', 'neptune'],
          category: 'academic_paper',
          tags: ['arXiv', '学术论文', '预印本', '开源科研'],
          language: 'en',
          source: 'api:arxiv',
          copyrightStatus: 'open_access',
          accessType: 'open',
          qualityScore: 96
        });
        saved++;
      }
    }
    return saved;
  } catch (err: any) {
    console.warn('[arXiv] Search error:', err.message);
    return 0;
  }
}
