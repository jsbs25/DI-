/**
 * Open Image Crawler & Aggregator
 * Provides public domain and openly licensed image search across:
 * 1. NASA Image and Video Library (Official, public domain, deep space & planetary)
 * 2. Wikimedia Commons (Over 100M+ CC / Public Domain photographs & archives)
 * 3. The Metropolitan Museum of Art (Open Access CC0 historical artworks)
 * No API keys required.
 */

export interface OpenImageItem {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  author: string;
  source: 'NASA' | 'Wikimedia Commons' | 'Met Museum';
  sourceUrl: string;
  license: string;
  description?: string;
  date?: string;
}

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EarthOne/1.0 (build@earthone.world)' }
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 1. NASA Image & Video Library (Official free public-domain astronomy & space imagery)
 */
export async function searchNasaImages(query: string, limit = 10): Promise<OpenImageItem[]> {
  try {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.collection?.items?.slice(0, limit) || [];
    const results: OpenImageItem[] = [];

    for (const it of items) {
      const meta = it.data?.[0];
      const link = it.links?.[0];
      if (!meta || !link?.href) continue;
      const thumb = link.href;
      // High-res direct image URL fallback
      const full = thumb.replace('~thumb.jpg', '~medium.jpg').replace('~thumb.png', '~medium.png');

      results.push({
        id: `nasa_${meta.nasa_id || Math.random().toString(36).slice(2, 8)}`,
        title: meta.title || 'NASA Space Photograph',
        url: full || thumb,
        thumbnailUrl: thumb,
        author: meta.photographer || meta.center || 'NASA',
        source: 'NASA',
        sourceUrl: `https://images.nasa.gov/details-${encodeURIComponent(meta.nasa_id || '')}`,
        license: 'Public Domain / NASA Open Media',
        description: typeof meta.description === 'string' ? meta.description.slice(0, 300) : undefined,
        date: meta.date_created ? String(meta.date_created).slice(0, 10) : undefined
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 2. Wikimedia Commons (World-wide Creative Commons & Public Domain media repository)
 */
export async function searchWikimediaImages(query: string, limit = 10): Promise<OpenImageItem[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    const results: OpenImageItem[] = [];

    for (const page of pages as any[]) {
      const info = page.imageinfo?.[0];
      if (!info || !info.url) continue;
      const ext = info.extmetadata || {};
      const rawTitle = (page.title || '').replace(/^File:/i, '');
      const license = ext.LicenseShortName?.value || 'CC-BY-SA / Public Domain';
      const artist = ext.Artist?.value ? String(ext.Artist.value).replace(/<[^>]*>/g, '').trim() : 'Wikimedia Contributor';
      const date = ext.DateTimeOriginal?.value || ext.DateTime?.value;

      results.push({
        id: `wiki_${page.pageid || Math.random().toString(36).slice(2, 8)}`,
        title: rawTitle,
        url: info.url,
        thumbnailUrl: info.thumburl || info.url,
        author: artist || 'Wikimedia Commons',
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(rawTitle)}`,
        license,
        description: ext.ImageDescription?.value ? String(ext.ImageDescription.value).replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
        date: date ? String(date).slice(0, 10) : undefined
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 3. The Metropolitan Museum of Art (400,000+ Public Domain Artworks & Artifacts)
 */
export async function searchMetMuseumImages(query: string, limit = 6): Promise<OpenImageItem[]> {
  try {
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`;
    const searchRes = await fetchWithTimeout(searchUrl, 5000);
    if (!searchRes.ok) return [];
    const data = await searchRes.json();
    const objectIDs: number[] = (data.objectIDs || []).slice(0, limit);
    if (!objectIDs.length) return [];

    const results: OpenImageItem[] = [];
    const objectPromises = objectIDs.map(id =>
      fetchWithTimeout(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, 4000)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const objects = await Promise.all(objectPromises);
    for (const obj of objects) {
      if (!obj || !obj.primaryImageSmall) continue;
      results.push({
        id: `met_${obj.objectID}`,
        title: obj.title || 'Untitled Artwork',
        url: obj.primaryImage || obj.primaryImageSmall,
        thumbnailUrl: obj.primaryImageSmall,
        author: obj.artistDisplayName || 'Unknown Artist',
        source: 'Met Museum',
        sourceUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
        license: 'CC0 1.0 Universal (Public Domain)',
        description: `${obj.medium || ''} ${obj.dimensions || ''}`.trim(),
        date: obj.objectDate || undefined
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Unified Multi-source Open Image Crawler
 */
export async function searchOpenImages(
  query: string,
  limit = 16,
  source: 'all' | 'nasa' | 'wikimedia' | 'met' = 'all'
): Promise<{ images: OpenImageItem[]; sources: Array<{ name: string; count: number; ok: boolean }> }> {
  const q = query.trim();
  if (!q) return { images: [], sources: [] };

  if (source === 'nasa') {
    const list = await searchNasaImages(q, limit);
    return { images: list, sources: [{ name: 'NASA', count: list.length, ok: true }] };
  }
  if (source === 'wikimedia') {
    const list = await searchWikimediaImages(q, limit);
    return { images: list, sources: [{ name: 'Wikimedia Commons', count: list.length, ok: true }] };
  }
  if (source === 'met') {
    const list = await searchMetMuseumImages(q, limit);
    return { images: list, sources: [{ name: 'Met Museum', count: list.length, ok: true }] };
  }

  // 并发多源聚合
  const [nasaRes, wikiRes, metRes] = await Promise.allSettled([
    searchNasaImages(q, Math.ceil(limit / 2)),
    searchWikimediaImages(q, Math.ceil(limit / 2)),
    searchMetMuseumImages(q, Math.min(6, Math.ceil(limit / 3)))
  ]);

  const nasaList = nasaRes.status === 'fulfilled' ? nasaRes.value : [];
  const wikiList = wikiRes.status === 'fulfilled' ? wikiRes.value : [];
  const metList = metRes.status === 'fulfilled' ? metRes.value : [];

  const merged: OpenImageItem[] = [];
  const max = Math.max(nasaList.length, wikiList.length, metList.length);
  for (let i = 0; i < max; i++) {
    if (nasaList[i]) merged.push(nasaList[i]);
    if (wikiList[i]) merged.push(wikiList[i]);
    if (metList[i]) merged.push(metList[i]);
  }

  return {
    images: merged.slice(0, limit),
    sources: [
      { name: 'NASA Image Library', count: nasaList.length, ok: nasaRes.status === 'fulfilled' },
      { name: 'Wikimedia Commons', count: wikiList.length, ok: wikiRes.status === 'fulfilled' },
      { name: 'The Met Museum Open Access', count: metList.length, ok: metRes.status === 'fulfilled' }
    ]
  };
}
