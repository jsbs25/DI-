/**
 * EARTH ONE - AUTOMATED BOOK HARVESTER
 * Periodically fetches classic, high-quality public-domain books from the
 * Open Library API and ingests them into the Digital Library store.
 *
 * Runs entirely in the backend on a timer — there is intentionally no
 * frontend "crawler" entry point. The library grows itself.
 */

import { Book } from '../src/types/index.ts';
import { store } from './store.ts';

const USER_AGENT = 'EARTH-ONE-BookHarvester/1.0 (contact: earthone@example.com)';

// Rotating subject list — each cycle picks a different category to keep the
// library diverse across literature, philosophy, science, and history.
const SUBJECTS: { subject: string; category: Book['category']; language: string }[] = [
  { subject: 'love', category: 'literature', language: 'en' },
  { subject: 'science', category: 'science', language: 'en' },
  { subject: 'philosophy', category: 'philosophy', language: 'en' },
  { subject: 'history', category: 'history', language: 'en' },
  { subject: 'geography', category: 'geography', language: 'en' },
  { subject: 'economics', category: 'economics', language: 'en' }
];

interface OpenLibraryWork {
  key: string;
  title: string;
  authors?: { name: string }[];
  first_publish_year?: number;
  cover_id?: number;
  description?: string | { value: string };
  subject?: string[];
}

function flattenDescription(desc: string | { value: string } | undefined): string {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (desc && typeof desc.value === 'string') return desc.value;
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function coverUrl(coverId: number | undefined): string | undefined {
  if (!coverId) return undefined;
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a batch of books for one subject. Returns fully-formed Book objects
 * with a short metadata preview as the first chapter (the harvester doesn't
 * download full texts — it archives metadata + a preview, keeping storage light).
 */
async function harvestSubject(subject: string, category: Book['category'], language: string): Promise<Book[]> {
  const data = await fetchJson(
    `https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=6`
  );

  const works: OpenLibraryWork[] = data?.works || [];
  const books: Book[] = [];

  for (const w of works) {
    if (!w.title) continue;
    const author = w.authors?.[0]?.name || 'Unknown Author';
    const description = stripHtml(flattenDescription(w.description)) ||
      `A notable work in ${subject}, curated automatically by the EARTH ONE Digital Library harvester.`;

    books.push({
      id: `harvest_${w.key.replace(/[^a-zA-Z0-9]/g, '_')}`,
      title: w.title,
      author,
      category,
      language,
      year: w.first_publish_year ? String(w.first_publish_year) : undefined,
      source: 'Open Library',
      coverImage: coverUrl(w.cover_id),
      description: description.slice(0, 280),
      readProgress: 0,
      textAvailability: 'metadata_only',
      chapters: [
        {
          id: 'ch1',
          title: 'Preview',
          content: `${w.title} by ${author}.\n\n${description.slice(0, 1200)}\n\n[Automated archive entry — full text available via Open Library.]`
        }
      ]
    });
  }

  return books;
}

let cycleIndex = 0;

/**
 * Run one harvest cycle. Picks the next subject in rotation, fetches books,
 * and merges them into the store (de-duplicated by id).
 *
 * Returns a short log string for server-side logging.
 */
export async function runBookHarvest(): Promise<string> {
  const slot = SUBJECTS[cycleIndex % SUBJECTS.length];
  cycleIndex += 1;

  try {
    const books = await harvestSubject(slot.subject, slot.category, slot.language);
    if (books.length === 0) {
      return `[BookHarvest] No books returned for "${slot.subject}"`;
    }

    // De-duplicate against existing library
    const existingIds = new Set(store.books.map(b => b.id));
    const fresh = books.filter(b => !existingIds.has(b.id));

    if (fresh.length > 0) {
      store.books.unshift(...fresh);
      store.saveToDisk();
    }

    return `[BookHarvest] ${slot.subject}: fetched ${books.length}, added ${fresh.length} new books`;
  } catch (err: any) {
    return `[BookHarvest] "${slot.subject}" failed: ${err?.message || err}`;
  }
}
