/**
 * EARTH ONE - AUTOMATED BOOK HARVESTER (Chinese public-domain classics)
 *
 * Periodically ingests real, full-text Chinese public-domain classics from
 * zh.wikisource.org into the Digital Library. It does NOT create metadata-only
 * "preview" entries — every harvested book carries real chapter content.
 *
 * Only titles in the explicit allow-list below are harvested, and each points
 * at a verified single-page wikisource edition (so full text is actually
 * present rather than a table-of-contents or a redirect page).
 */

import { Book } from '../src/types/index.ts';
import { store } from './store.ts';
import { fetchWikisourceFullText } from './webFetcher.ts';

interface ClassicEntry {
  /** Exact zh.wikisource.org page title that hosts the full text. */
  pageTitle: string;
  /** Friendly display title. */
  title: string;
  category: Book['category'];
}

// Verified Chinese public-domain classics whose full text lives on a single
// wikisource page (not a redirect or a table-of-contents page).
const CHINESE_CLASSICS: ClassicEntry[] = [
  { pageTitle: '孫子兵法', title: '孙子兵法', category: 'philosophy' },
  { pageTitle: '唐詩三百首', title: '唐诗三百首', category: 'literature' },
  { pageTitle: '弟子規', title: '弟子规', category: 'education' },
  { pageTitle: '三字經', title: '三字经', category: 'education' },
  { pageTitle: '千字文', title: '千字文', category: 'education' },
  { pageTitle: '百家姓', title: '百家姓', category: 'education' },
  { pageTitle: '朱子家訓', title: '朱子治家格言', category: 'education' }
];

async function harvestClassic(entry: ClassicEntry): Promise<Book | null> {
  const fullText = await fetchWikisourceFullText(entry.pageTitle);
  if (!fullText) return null;

  // Drop empty/skeleton chapters (TOC pages produce headings with no body).
  const chapters = fullText.chapters
    .map((ch, i) => ({ id: `ch${i + 1}`, title: ch.title, content: ch.content.trim() }))
    .filter(ch => ch.content.length >= 20);

  if (chapters.length === 0) return null;

  const book: Book = {
    id: `wikisource_classic_${entry.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '')}`,
    title: entry.title,
    author: fullText.author || '佚名',
    category: entry.category,
    language: 'zh',
    source: 'Open Access',
    description: `中国公版经典《${entry.title}》全文，源自中文维基文库。`,
    readProgress: 0,
    chapters,
    copyrightStatus: 'public_domain',
    formatType: 'text',
    textAvailability: 'full_text',
    sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(entry.pageTitle)}`
  };

  return book;
}

let cycleIndex = 0;

/**
 * Run one harvest cycle. Picks the next Chinese classic in rotation, fetches
 * its full text, and merges it into the store (de-duplicated by stable id).
 */
export async function runBookHarvest(): Promise<string> {
  const entry = CHINESE_CLASSICS[cycleIndex % CHINESE_CLASSICS.length];
  cycleIndex += 1;

  try {
    const book = await harvestClassic(entry);
    if (!book) {
      return `[BookHarvest] ${entry.title}: no readable full text found`;
    }

    const existing = store.books.find(b => b.id === book.id);
    if (existing) {
      existing.chapters = book.chapters;
      existing.description = book.description;
      existing.textAvailability = 'full_text';
      existing.sourceUrl = book.sourceUrl;
      store.saveToDisk();
      return `[BookHarvest] ${entry.title}: refreshed ${book.chapters.length} chapters`;
    }

    store.addBook(book);
    return `[BookHarvest] ${entry.title}: ingested ${book.chapters.length} chapters`;
  } catch (err: any) {
    return `[BookHarvest] ${entry.title} failed: ${err?.message || err}`;
  }
}
