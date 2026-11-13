# P8 — ONE LIBRARY sub-surfaces technical review

## Scope
Quiet Futurism presentation pass for visible library sub-surfaces left after Phase F:
- `src/components/library/AdminLibrary.tsx`
- `src/components/library/EpubReader.tsx`

Out of scope / no behavior change:
- `src/components/library/DigitalLibrary.tsx` (Phase F complete)
- `src/components/library/bookEmbedUrl.ts` (URL/embed helpers, no UI)
- `src/components/library/searchFilters.ts` (filter logic, no UI)
- All `/api/library/*` endpoints, auth, storage, import/proxy/rights behavior

## Components and behavior to preserve
### AdminLibrary
- Lists books from `GET /api/library/books`, client-side search by title/author.
- Edit modal updates metadata via `PUT /api/library/books/:id` with existing fields (`title/author/category/language/year/publisher/isbn/description/coverImage/copyrightStatus/source`).
- Delete flow confirms then calls `DELETE /api/library/books/:id`.
- Existing category/copyright/source option values and Chinese admin labels/messages remain intact.

### EpubReader
- EPUB loading via dynamic `epubjs` import and backend proxy `/api/library/epub-proxy?bookId=...`.
- Source/rights guards: only supported verified reusable providers/rights may load through proxy; otherwise shows error with safe official-source link when available.
- Reading state: TOC, pagination, font sizing, progress tracking, relocated CFI persistence callback (throttled), fullscreen toggle, RTL direction handling.
- Accessibility/focus: dialog semantics, escape/tab trapping, focus restore, close flushes progress.
- Notice that EPUB AI paragraph explanation is unavailable for unverified chapter/CFI mapping remains visible.

## Safe refactors applied
- Align surfaces, borders, typography, spacing, controls, modal/toolbar chrome, and focus states to Quiet Futurism tokens used in redesign (`var(--one-*)`/neutral translucent surfaces, restrained cyan/emerald accents, rounded radii, improved contrast/touch targets).
- Preserve all props, handlers, network calls, data contracts, option values, guards, and text meaning.

## Not added
- No new admin permissions/auth, no new library APIs, no fake rights/import states, no AI features for EPUB, no final ONE logo changes.
