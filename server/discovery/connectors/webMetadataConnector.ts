/**
 * EARTH ONE - Public Web Metadata Connector
 * Fetches public web pages, extracts OpenGraph, meta tags, favicons and keywords.
 */
import { discoveryDb } from '../database/db.ts';
import { PlanetId, ResourceType } from '../types.ts';

export interface WebMetadata {
  url: string;
  title: string;
  description: string;
  favicon?: string;
  ogImage?: string;
  keywords: string[];
  language?: string;
  httpStatus: number;
}

function cleanHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Fetch and extract structured metadata from any public website
 */
export async function extractWebMetadata(targetUrl: string, timeoutMs = 8_000): Promise<WebMetadata | null> {
  let url = targetUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let html = '';
  let status = 200;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EarthOne-DiscoveryBot/1.0 (+https://earthone.world/bot; web-indexer)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });

    status = res.status;
    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('xml')) {
      return null;
    }

    html = await res.text();
  } catch (err: any) {
    console.warn(`[WebMetadataConnector] Fetch failed for ${url}:`, err.message);
    return null;
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  const title = cleanHtmlEntities(ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : '')).slice(0, 150);

  const descMatch = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const ogDescMatch = html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  const description = cleanHtmlEntities(ogDescMatch ? ogDescMatch[1] : (descMatch ? descMatch[1] : '')).slice(0, 400);

  const ogImgMatch = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
  let ogImage = ogImgMatch ? ogImgMatch[1].trim() : undefined;
  if (ogImage && !ogImage.startsWith('http')) {
    try {
      ogImage = new URL(ogImage, url).href;
    } catch {
      ogImage = undefined;
    }
  }

  const iconMatch = html.match(/<link\b[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i);
  let favicon = iconMatch ? iconMatch[1].trim() : undefined;
  if (favicon && !favicon.startsWith('http')) {
    try {
      favicon = new URL(favicon, url).href;
    } catch {
      favicon = undefined;
    }
  }

  const kwMatch = html.match(/<meta\b[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
  const rawKeywords = kwMatch ? kwMatch[1] : '';
  const keywords = rawKeywords
    .split(/[,，|]/)
    .map(k => cleanHtmlEntities(k).trim())
    .filter(k => k.length > 1 && k.length < 30)
    .slice(0, 8);

  const langMatch = html.match(/<html\b[^>]*lang=["']([^"']*)["']/i);
  const language = langMatch ? langMatch[1].toLowerCase().slice(0, 5) : 'zh';

  return {
    url,
    title: title || new URL(url).hostname,
    description: description || `全球数字资源 · 访问 ${new URL(url).hostname}`,
    favicon,
    ogImage,
    keywords,
    language,
    httpStatus: status
  };
}

/**
 * Harvest any public URL into the unified discovery database
 */
export async function harvestPublicWebUrl(targetUrl: string, options: {
  planet: PlanetId;
  category?: string;
  resourceType?: ResourceType;
  tags?: string[];
}): Promise<{ success: boolean; resourceId?: string; isNew?: boolean; error?: string }> {
  const meta = await extractWebMetadata(targetUrl);
  if (!meta) {
    return { success: false, error: '无法获取网页元数据或链接超时' };
  }

  const allTags = Array.from(new Set([...(options.tags || []), ...meta.keywords]));

  const result = discoveryDb.insertOrUpdateResource({
    url: meta.url,
    name: meta.title,
    description: meta.description,
    resourceType: options.resourceType || 'website',
    primaryPlanet: options.planet,
    category: options.category || 'general',
    tags: allTags.length > 0 ? allTags : [options.category || 'general'],
    language: meta.language || 'zh',
    icon: meta.favicon || meta.ogImage,
    source: 'web_crawler',
    copyrightStatus: 'fair_use',
    accessType: 'open',
    qualityScore: 75,
    extraMeta: {
      ogImage: meta.ogImage
    }
  });

  return {
    success: true,
    resourceId: result.resource.id,
    isNew: result.isNew
  };
}
