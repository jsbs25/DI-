export interface SaturnVideo {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  thumbnailUrl?: string;
  date?: string;
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseSaturnVideoResults(payload: unknown): SaturnVideo[] {
  if (!payload || typeof payload !== 'object' || !('results' in payload) || !Array.isArray(payload.results)) return [];
  const seen = new Set<string>();

  return payload.results.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim().slice(0, 300) : '';
    const url = record.url;
    if (!title || !isSafeHttpUrl(url) || seen.has(url)) return [];
    seen.add(url);

    let thumbnailUrl: string | undefined;
    if (isSafeHttpUrl(record.thumbnailUrl)) thumbnailUrl = record.thumbnailUrl;

    return [{
      title,
      url,
      domain: typeof record.domain === 'string' ? record.domain.slice(0, 253) : new URL(url).hostname,
      snippet: typeof record.snippet === 'string' ? record.snippet.trim().slice(0, 1000) : '',
      thumbnailUrl,
      date: typeof record.date === 'string' ? record.date.slice(0, 100) : undefined
    }];
  }).slice(0, 20);
}
