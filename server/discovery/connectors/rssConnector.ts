/**
 * EARTH ONE - RSS / Atom Feed Collector
 * Parses RSS and Atom feeds, extracts structured metadata, and synchronizes to the discovery database.
 */
import { discoveryDb } from '../database/db.ts';
import { PlanetId, ResourceType } from '../types.ts';

export interface RssFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  categories: string[];
}

function cleanXmlText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Native, resilient RSS/Atom XML extractor (zero external npm dependency)
 */
export function parseRssOrAtomXml(xml: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];

  // 1. Try standard RSS <item> tags
  const rssItemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = rssItemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    const titleMatch = itemContent.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = itemContent.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = itemContent.match(/<(?:description|content:encoded|summary)\b[^>]*>([\s\S]*?)<\/(?:description|content:encoded|summary)>/i);
    const dateMatch = itemContent.match(/<(?:pubDate|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i);

    const title = cleanXmlText(titleMatch ? titleMatch[1] : '');
    let link = linkMatch ? linkMatch[1].trim() : '';
    // Strip CDATA or XML tags around link
    link = link.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
    const description = cleanXmlText(descMatch ? descMatch[1] : '').slice(0, 500);
    const pubDate = dateMatch ? cleanXmlText(dateMatch[1]) : undefined;

    const categories: string[] = [];
    const catRegex = /<category\b[^>]*>([\s\S]*?)<\/category>/gi;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(itemContent)) !== null) {
      const c = cleanXmlText(catMatch[1]);
      if (c && !categories.includes(c)) categories.push(c);
    }

    if (title && link && link.startsWith('http')) {
      items.push({ title, link, description, pubDate, categories });
    }
  }

  // 2. Try Atom <entry> tags if no RSS items found
  if (items.length === 0) {
    const atomEntryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(xml)) !== null) {
      const entryContent = match[1];
      const titleMatch = entryContent.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = entryContent.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      const summaryMatch = entryContent.match(/<(?:summary|content)\b[^>]*>([\s\S]*?)<\/(?:summary|content)>/i);
      const updatedMatch = entryContent.match(/<(?:updated|published)\b[^>]*>([\s\S]*?)<\/(?:updated|published)>/i);

      const title = cleanXmlText(titleMatch ? titleMatch[1] : '');
      const link = linkMatch ? linkMatch[1].trim() : '';
      const description = cleanXmlText(summaryMatch ? summaryMatch[1] : '').slice(0, 500);
      const pubDate = updatedMatch ? cleanXmlText(updatedMatch[1]) : undefined;

      if (title && link && link.startsWith('http')) {
        items.push({ title, link, description, pubDate, categories: [] });
      }
    }
  }

  return items;
}

/**
 * Fetch and harvest an RSS/Atom feed into the unified discovery database
 */
export async function harvestRssFeed(feedUrl: string, options: {
  targetPlanet: PlanetId;
  defaultCategory: string;
  sourceName?: string;
  maxItems?: number;
}): Promise<{ totalFound: number; added: number; updated: number }> {
  const { targetPlanet, defaultCategory, sourceName = 'rss_feed', maxItems = 25 } = options;

  let xml = '';
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'EarthOne-DiscoveryBot/1.0 (+https://earthone.world/bot)',
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, application/xml, text/html'
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (!res.ok) {
      throw new Error(`Feed fetch failed: HTTP ${res.status}`);
    }
    xml = await res.text();
  } catch (err: any) {
    console.warn(`[RssConnector] Failed to fetch feed ${feedUrl}:`, err.message);
    return { totalFound: 0, added: 0, updated: 0 };
  }

  const items = parseRssOrAtomXml(xml).slice(0, maxItems);
  let added = 0;
  let updated = 0;

  for (const item of items) {
    try {
      const result = discoveryDb.insertOrUpdateResource({
        url: item.link,
        name: item.title,
        description: item.description,
        resourceType: 'website' as ResourceType,
        primaryPlanet: targetPlanet,
        category: defaultCategory,
        tags: item.categories.length > 0 ? item.categories : [defaultCategory, targetPlanet],
        source: sourceName,
        copyrightStatus: 'fair_use',
        accessType: 'open',
        qualityScore: 78,
        extraMeta: {
          pubDate: item.pubDate,
          feedUrl
        }
      });

      if (result.isNew) {
        added++;
      } else {
        updated++;
      }
    } catch {
      // Skip invalid items gracefully
    }
  }

  return { totalFound: items.length, added, updated };
}
