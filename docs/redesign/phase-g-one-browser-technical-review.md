# Phase G — ONE BROWSER technical review (read-only audit)

**Status:** technical audit only (no business code modified).  
**Workspace:** `/tmp/duyi-one-redesign`  
**Branch:** `redesign/complete-visual-overhaul` (rechecked)  
**HEAD:** `9ad1236 feat(library): align sub-surfaces with ONE redesign` (rechecked)  
**Remote:** `origin https://github.com/jsbs25/DI-.git`, local branch ahead of `origin/main` by 26; `origin/redesign/complete-visual-overhaul` at `9ad1236` per recheck status context.  
**Working tree at audit time:** only pre-existing `?? node_modules` (untracked symlink); no product source changes made for this audit.  
**Out of scope enforced:** no production Worker/DB/secret/infra changes, no merge, no deploy, no force-push/reset/clean, no edits to `/Users/mafucheng/Desktop/EARTH_ONE/earthone`.

## 1. Current architecture

### 1.1 Frontend (browser UI)
- **Entry/orchestrator:** `src/components/browser/WebBrowser.tsx` (~3567 LOC). Single large component owns tabs, per-tab history stacks, omnibox/navigation, search state/results pagination, content/viewer routing, reader/crawler/live modes, bookmarks/history/local data, downloads/session/permissions/privacy UI, AI companion/crawler extract/translate/save flows, saved-articles drawer, shortcut modal, and Electron bridge integration (`window.earthOneBrowser`).
- **Chrome/layout:** `src/components/browser/BrowserFrame.tsx` (tab strip, drag reorder, new/restore/close callbacks, universe/globe return actions) + `GoogleGIcon`.
- **Privacy UI:** `src/components/browser/BrowserPrivacyPanel.tsx` (category/time-range selection, confirmation/result rendering; delegates actual clearing to injected `onClear`).
- **JUPITER internal routing/helpers:** `src/components/browser/jupiterSearchRoute.ts` (`/jupiter/search` query/engine/lang/type/page build/parse), `pdfDocumentUrl.ts`, `imageDocumentUrl.ts`, `audioDocumentUrl.ts`, `videoDocumentUrl.ts` (`/jupiter/{document,image,audio,video}/...` safe-URL encode/decode, extension/embed capability checks: YouTube/Vimeo/TikTok/Instagram/Dailymotion/Bilibili/Twitch/direct media).
- **Content viewers (lazy-loaded in WebBrowser):** `PdfDocumentViewer.tsx` (pdfjs-dist, worker URL, page/zoom/text search, source link), `ImageDocumentViewer.tsx`, `AudioDocumentViewer.tsx`, `VideoDocumentViewer.tsx`.
- **Types/contract for desktop bridge:** `src/types/electron-browser.d.ts` declares global `window.earthOneBrowser?: EarthOneBrowserApi` and `window.earthOneDesktop` (local data, privacy clear, session restore/snapshot, permissions, downloads/print, tab/window/nav/zoom/find events/state, focus hooks). This is a **renderer-side contract**, not Electron implementation in this repo snapshot.

### 1.2 Backend / search & fetch services (Express, `server.ts`)
- **Search/content aggregation:** `server/jupiterSearch.ts` — normalizes/ranks/merges EARTH index + external results, caches search (`60s`, 100 entries), EARTH content lookup across `store.articles/videos/books/posts` (filters demo IDs), image/audio post-media search.
- **Web ingestion/search providers:** `server/webFetcher.ts` (~1386 LOC) — bounded `fetchText` (UA/timeout/redirect), lightweight HTML parsing/extraction/link/image/heading/robots helpers, `fetchAndExtract`, `fetchRawHtml`, provider search: Serper/Google (`SERPER_API_KEY`), Bing, DuckDuckGo, Wikipedia opensearch/extracts, Google images/category (Serper), GitHub repo search, crawler (`crawlWebsite`, same-host, robots-aware), Z-Library/open-book discovery fallback, book full-text fetchers (Gutenberg/Wikisource/Arabic Wikisource/Internet Archive helpers present).
- **Routes (relevant):** `GET /api/jupiter/search`, `GET /api/jupiter/content/:kind/:id`, `POST /api/browser/fetch-preview`, `GET /api/browser/proxy?url=`, `GET /api/browser/search`, `GET/POST /api/browser/bookmarks`, `GET/POST/DELETE /api/browser/saved-articles`, `POST /api/crawler/ai-extract`, `GET/POST /api/crawler/tasks`, `POST /api/crawler/tasks/:id/run`, `GET /api/crawler/pages`, `POST /api/crawler/pages/:id/approve`, plus discovery/library/image endpoints also consumed elsewhere. **No `/api/browser/raw-html` route found in `server.ts`** (client calls it; see §3/§7).

### 1.3 Desktop/Electron boundary (as evidenced)
- `src/types/electron-browser.d.ts` defines an extensive IPC-shaped API (tabs, bounds, restore, downloads, permissions, privacy/session/local-data, zoom/find/print, state/focus events). A repo-wide search found **no `ipcMain`/`ipcRenderer`/`BrowserWindow`/`WebContentsView`/preload implementation files** outside docs/locks/types in this snapshot; Electron main/preload likely lives outside `/tmp/duyi-one-redesign` or in a separate desktop package not present here. Therefore native browser behavior must be treated as **contract-dependent, not verifiable from this audit alone**.

## 2. Real functionality (implemented in this codebase)

| Area | Evidence-backed reality |
|---|---|
| Tabs & local nav stack | `WebBrowser.tsx`: tab create/close/reorder, per-tab `history`/`historyIndex`, back/forward with local stack fallback and `earthOneBrowser.goBack/goForward` when available. |
| Address/omnibox semantics | `handleNavigate`: empty/home -> `jupiter://home`; JUPITER routes parsed; bare host/port/URL detection; non-URL -> JUPITER search; only `http(s)` accepted for external URLs; scheme rejection for others. |
| JUPITER search | `/api/jupiter/search` (`server.ts`): query/lang/engine/type validation, cache, EARTH index search/media helpers, external providers by category/engine (Serper-dependent categories return 503 when unconfigured), merge/rank; client renders categories, pagination, GitHub/workspace-candidate bookmark flow, result open routing. |
| JUPITER content routes | `/jupiter/search`, `/jupiter/{read|watch|document|image|audio|video|...}` parsing/routing in client helpers; `/api/jupiter/content/:kind/:id` serves EARTH article/video/book/post from store (not arbitrary web). |
| Web/page access modes | **(a)** Electron/Chromium mode when `window.earthOneBrowser` exists and tab not reader-only: navigate/select/close/reorder via bridge, viewport bounds sync, connection/TLS state from bridge, zoom/find/print/downloads/permissions/session/privacy via bridge. **(b)** Server-extracted reader/preview fallback: `/api/browser/fetch-preview` -> `fetchAndExtract`; `/api/browser/proxy` injects `<base>`, strips frame-busting meta/headers, blocks localhost/private/link-local/169.254.169.254, streams non-HTML; client also uses `srcDoc` path via `loadPreviewHtml` calling `/api/browser/raw-html` (route absent). **(c)** External open in new window for some non-engine cases. |
| Reader / crawler probe / webpage modes | Toolbar mode switch in `WebBrowser.tsx`: Live Web, Reader, Crawler probe (structured headings/links/images/content view, AI/crawler actions). |
| Document/media viewers | PDF (pdfjs, in-app canvas render + text search), image/audio/video viewers; direct PDF/image/audio/playable/embed video URLs routed to JUPITER viewers; YouTube/Vimeo/embed/social handling in `videoDocumentUrl.ts`/`toEmbedUrl`. |
| Bookmarks & history (local) | Client localStorage keys `earth-one.browser.bookmarks.v1`, `earth-one.browser.history.v1` with limits/validation; optional desktop `getLocalData/saveLocalData` source-of-truth when bridge available; server bookmark endpoints also exist. |
| Saved articles/archive | `GET/POST/DELETE /api/browser/saved-articles` (`server.ts` + store), client drawer/save flow (desktop Chromium mode intentionally avoids server-side body extraction in some AI/save paths per UI copy/logic). |
| Crawler/AI integration | `/api/crawler/*` task/page/approve/run and `/api/crawler/ai-extract`; AI chat/translate/Ollama role status calls from browser UI. |
| Search engine/language/category controls | UI selectors + `jupiterSearchRoute` params; provider fallback logic in `webFetcher.searchWeb/searchWebProviders`. |

## 3. Frontend ↔ backend data flow

### 3.1 Search
1. User/query or `/jupiter/search?...` deep link -> `runJupiterSearch` (`WebBrowser.tsx`) updates tab URL/title/history, sets searching state.
2. `GET /api/jupiter/search?q=&engine=&lang=&type=` (`server.ts`).
3. Server builds EARTH results (`searchEarthIndex/Images/Audio` on `store`) + external provider results (`searchWeb*`, `searchGoogle*`, `searchGitHubRepositories`, `searchZLibraryDiscovery`, `searchYouTubeVideos` for videos path) -> enrich/domain filter -> `mergeAndRankJupiterResults` -> cache/return.
4. Client stores `searchResults`, paginates client-side in slices for UI, opens results via `openJupiterResult`/`handleNavigate`.

### 3.2 EARTH/JUPITER content
1. Tab URL matches internal content route (`getJupiterContentRoute`) -> client fetches `GET /api/jupiter/content/:kind/:id` for article/video/book/post.
2. Server `getJupiterEarthContent(kind,id,store)` returns store-backed content or 404 for unavailable/public-index/demo-filtered items.
3. Document/image/audio/external-video routes are resolved client-side to viewer + source URL (no content fetch required except media/PDF loading by viewer/browser).

### 3.3 Page preview / extraction (web mode, non-Electron or reader/crawler support)
1. `POST /api/browser/fetch-preview {url}` -> `fetchAndExtract` in `webFetcher.ts` (server-side fetch+parse, bounded timeout, metadata/text/headings/links/images/latency).
2. `GET /api/browser/proxy?url=` -> server fetches target, SSRF-style destination blocking for localhost/private ranges/metadata IP, base-href injection, strips CSP/XFO meta, returns modified HTML or error page.
3. `loadPreviewHtml` in client requests `GET /api/browser/raw-html?url=...` and injects `<base>` client-side; **server route not present** -> this path is currently broken/incomplete in audited server.

### 3.4 Save/archive and crawler
- Save: `POST /api/browser/save-article` with URL/title/author/content/summary/tags -> store.
- Crawler: task CRUD/run -> store execution/crawl helpers; approve pages; AI extract via `POST /api/crawler/ai-extract` -> `aiGateway.runCrawlerExtraction`.

### 3.5 Desktop bridge flow (when `window.earthOneBrowser` exists)
- Renderer -> preload/main contract: navigate/select/close/reorder tabs, set bounds/active, back/forward/reload/zoom/find/print, downloads, permissions resolve/revoke, session/local-data/privacy operations.
- Main/preload -> renderer events: state updates (URL/title/loading/nav/canGo/zoom/connection/cert error), new/closed tab, restore availability, downloads, permissions, focus address/find, find results.
- **Actual transport/implementation not in repo**; flow above is inferred from `electron-browser.d.ts` and WebBrowser usage patterns.

## 4. API contracts (browser-relevant)

| Endpoint | Method | Request | Response/notes | Evidence |
|---|---|---|---|---|
| `/api/jupiter/search` | GET | `q` (1–300), `lang` in en/zh/ar/es/fr/ru (default en), `engine` auto/google/bing/duckduckgo/wikipedia/github, `type` all/images/videos/news/pdf/audio/books/academic | `{success, query, results, cached?, sources}`; 400 invalid input/type, 503 for Serper-required image/category types when unconfigured | `server.ts`, `server/jupiterSearch.ts`, `server/webFetcher.ts` |
| `/api/jupiter/content/:kind/:id` | GET | kind article/video/book/post | `{success, content}` or 400/404 | `server.ts`, `server/jupiterSearch.ts` |
| `/api/browser/fetch-preview` | POST | `{url}` | extracted page payload + hostname, 502 on failure | `server.ts`, `fetchAndExtract` |
| `/api/browser/proxy` | GET | `url` query | proxied HTML/non-HTML stream or error HTML; blocks localhost/private/169.254.169.254; strips XFO/CSP meta | `server.ts` |
| `/api/browser/search` | GET | `q`, optional `engine`, `lang` | `{success, query, results, engine, lang}` via `searchWeb` | `server.ts` |
| `/api/browser/bookmarks` | GET/POST | POST `{title,url,category}` | bookmark list/create | `server.ts` |
| `/api/browser/saved-articles` | GET/POST/DELETE | POST body article payload; DELETE `/:id` | saved article CRUD | `server.ts` |
| `/api/browser/raw-html` | GET (expected by client) | `url` | **not implemented in audited server**; client expects raw HTML text | `WebBrowser.tsx:loadPreviewHtml`, no `server.ts` route |
| `/api/crawler/ai-extract` | POST | `{title,content,url}` | extraction result/model info | `server.ts`, `aiGateway` |
| `/api/crawler/tasks*`, `/api/crawler/pages*` | GET/POST | task/page params | task/page lifecycle | `server.ts`, store/crawler |

**Client-only internal route schema:** `/jupiter/search` and `/jupiter/{document,image,audio,video|read/...}` handled by route helpers and WebBrowser state; browser URL/history replacement used for deep-link/state continuity.

## 5. Electron communication mechanism (declared contract)

From `src/types/electron-browser.d.ts` (`EarthOneBrowserApi` on `window.earthOneBrowser`):
- **Queries/state:** `getLocalData/saveLocalData`, `getSessionState/setSessionEnabled/restoreSession`, `getPermissionState/resolvePermissionRequest/revoke*`, `getDownloads/cancel/remove/clear/getDownloadStorageStatus/showDownloadInFolder`, `getCanRestoreClosedTab`.
- **Commands:** `setActive`, `setBounds`, `selectTab`, `closeTab`, `navigate`, `goBack/goForward/reload`, `changeZoom`, `findInPage/stopFindInPage`, `printToPdf`, `reorderTabs`, `restoreLastClosedTab`, `clearBrowsingData`.
- **Event subscriptions (unsubscribe functions):** `onState`, `onDownloads`, `onPermissions`, `onFocusAddressBar`, `onFocusFind`, `onFindResult`, `onNewTab`, `onTabClosed`, `onRestoreAvailability`.
- **`EarthOneBrowserState` fields:** URL/title/loading/navigated/canGoBack/canGoForward/zoomPercent/`connectionStatus` (`unknown|unencrypted|encrypted|certificate-error`), `certificateErrorCode`, tab identity/active flag.
- **Desktop notifications:** separate `window.earthOneDesktop` API declared.

**Audit limitation:** no main/preload IPC channel names, partition/session policy, WebContentsView lifecycle, or certificate/download permission enforcement code is present in this repo; contract alone cannot prove native isolation, CSP, or policy correctness.

## 6. Security boundaries

### 6.1 Implemented/declared safeguards
- **URL validation:** client/server checks for `http/https`, hostname presence, no credentials in URL in multiple paths; JUPITER media/document helpers enforce safe remote URLs/extensions; non-http schemes rejected in navigation.
- **Server proxy/preview protections:** `/api/browser/proxy` blocks `localhost`, `127.0.0.1`, `10.*`, `192.168.*`, `172.16.*` (partial RFC1918 coverage), `169.254.169.254`; strips frame-buster/CSP/XFO meta in proxied HTML and removes response XFO/CSP headers for embedded preview use case.
- **Preview extraction:** server-side fetch/extract avoids direct browser-to-target CORS dependency for text extraction.
- **Desktop permission model (contract/UI):** explicit prompt/allow-deny-revoke for notifications/geolocation in session memory, pending queue handling in UI; other capabilities marked unsupported in UI text.
- **Privacy controls:** selectable clearing of history/bookmarks/download records/session restore/permissions/site data via bridge `clearBrowsingData` with confirmation and result reporting.

### 6.2 Known/likely gaps and boundary risks
- **SSRF/private-network coverage incomplete:** proxy blocks some ranges but not full loopback/link-local/IPv6/local ranges (e.g. `127/8` beyond `.1`, `::1`, `fc00::/7`, full `172.16-31`, DNS rebinding, redirects to internal targets not revalidated here). `fetch-preview`/`fetchRawHtml`/search/fetch helpers do not show equivalent destination hardening.
- **`/api/browser/proxy` weakens page protections:** removes CSP/XFO/meta constraints and serves third-party HTML in app context (srcDoc/iframe flows) — XSS/clickjacking/content-injection risk depends on sandbox/embedding; requires strict review.
- **Missing `/api/browser/raw-html`:** client requests it; absent route can cause 404/failures and fallback confusion (operational/safety-of-expectation issue).
- **External API keys/config:** Serper key usage server-side; unconfigured states surfaced as 503 in some categories but overall search behavior varies by provider availability.
- **Electron verification gap:** cannot confirm process isolation, navigation/download/permission handlers, WebContentsView partitioning, or certificate error enforcement from this repo.

## 7. Current experience issues (from static audit)

- **Monolithic implementation:** `WebBrowser.tsx` (~3.6k LOC) mixes product shell, routing, data fetching, persistence, desktop integration, AI/crawler, and multiple surfaces — high regression/refactor risk.
- **Mode/model ambiguity:** "网页/阅读/爬虫探针", JUPITER search/content routes, server preview/proxy, and optional native Chromium coexist; users may confuse extracted preview, proxied HTML, saved content, and true navigable web.
- **Broken/incomplete path:** client `loadPreviewHtml` -> `/api/browser/raw-html` but server lacks route.
- **Provider-dependent capability:** image/video/news/pdf/audio/books/academic verticals and some engines depend on Serper and external providers; 503/unavailable states must remain explicit (not fake results).
- **CSP/frame/embed limitations:** many sites block iframe/proxy embedding; YouTube/Vimeo/social embeds only where IDs/hosts match; direct media gated by extension/URL rules.
- **Desktop parity uncertainty:** rich UI states for downloads/session/permissions/zoom/find/print only meaningful when bridge implements contract; web preview mode has reduced/alternate behavior.
- **State duplication/persistence complexity:** local bookmarks/history + server bookmarks/saved articles + desktop local-data/session snapshots + tab history stacks can diverge.
- **Lint/build is not runtime proof:** per project rules, 3D/messages/calls/attachments/auth/PWA (and by extension browser runtime/Electron flows) require real-environment validation before release.

## 8. Existing functionality dependencies

- **Store/data:** `store` (articles/videos/books/posts/crawler tasks/pages/saved articles/browser bookmarks/ads etc.) used by JUPITER index/content, crawler, archive APIs.
- **Search/fetch libs/services:** `server/webFetcher.ts`, `server/jupiterSearch.ts`, `server/youtubeSearch.ts` (video aggregation), `aiGateway` (AI extract/chat/translate paths), Ollama role endpoints.
- **Client deps:** React 19, `lucide-react`, `pdfjs-dist` (+ worker), lazy viewers, route/url helpers, `src/types/index.ts` Language/types, app navigation callbacks to universe/globe.
- **Desktop contract:** `window.earthOneBrowser`, `window.earthOneDesktop` (must preserve type/behavior expectations for Electron shell if present).
- **PWA/build:** Vite build includes browser assets; no PWA runtime validation in this audit.
- **Cross-module expectations:** JUPITER book/content routes may interop with library/universe concepts; do not break `/api/jupiter/*`, `/api/browser/*`, saved-article/library ingestion contracts.

## 9. Safe refactor scope (proposed, for later phases only)

**Safe (presentation/structure, contract-preserving):**
- Visual redesign of browser chrome, home/search/results, tabs/omnibox controls, reader/crawler layouts, settings/privacy/download/session/permission panels, loading/empty/error states, responsive/mobile ergonomics — **without changing** request/response shapes, route schemas, storage keys, event names, or security decisions.
- Component decomposition of `WebBrowser.tsx` into focused UI/state modules/hooks while preserving behavior and public callbacks/props.
- Accessibility/keyboard/focus/reduced-motion/RTL/i18n-safe presentation improvements.
- Clarifying copy that distinguishes real browser, server preview/extract, embed, and unavailable capabilities (honest UX) without removing features.

**Caution / likely needs dedicated subphase + tests:**
- Navigation/routing logic, search parameter handling, cache keys, viewer source resolution, proxy/preview extraction flow, local/desktop persistence sync, Electron event/state wiring, download/permission/privacy action semantics.
- Any fix to missing `/api/browser/raw-html` or proxy behavior must preserve security boundaries and existing consumers.

**Out of safe scope without explicit approval/change control:** production Worker/DB/secrets/DNS, removing search sources/fetching, faking search/results/native browsing, breaking PDF/file viewers or Electron capabilities.

## 10. Risks and test plan

### 10.1 Key risks
- **High regression risk:** huge stateful `WebBrowser.tsx` + coupled desktop/web modes.
- **Security risk:** proxy/preview surfaces and URL handling; SSRF/hardening and CSP/XFO stripping need careful treatment.
- **Contract risk:** breaking `earthOneBrowser` event/state/command behavior or `/api/jupiter/*|/api/browser/*` payloads can silently disable desktop or integrations.
- **Capability honesty risk:** UI must not present iframe/preview as native full browsing.
- **Operational risk:** provider/key dependence (Serper/GitHub/Wikipedia/Bing/DDG/YouTube) causes partial availability; missing `raw-html` route is a concrete correctness gap.

### 10.2 Test plan (for implementation subphases)
- **Automated (per subphase):** `npm run lint` (tsc), `npm run build`, existing relevant tests if present; targeted unit tests for route helpers (`jupiterSearchRoute`, media/document URL helpers), search/result merge/rank, navigation URL classification (where feasible without behavior change).
- **API/contract checks:** `/api/jupiter/search` (all categories/engines/lang, cache, 503 cases when unconfigured), `/api/jupiter/content/:kind/:id` 400/404/success, `/api/browser/fetch-preview` success/failure, `/api/browser/proxy` allowed/blocked destinations and header/base behavior, saved-articles/bookmarks/crawler endpoints unchanged.
- **Web preview/manual:** home/new tab, search->open result, back/forward/refresh, reader/crawler modes, PDF/image/audio/video/embed routing, bookmarks/history/privacy/download UI states (as available), error/empty/loading states, mobile layout/safe areas, RTL/i18n strings where applicable.
- **Desktop Electron (required when shell available):** real `window.earthOneBrowser` navigation, WebContentsView/bounds, connection status/cert errors, zoom/find/print, downloads, permissions prompts/grants/revoke, session restore, privacy clear + reload behavior, tab reorder/restore/close/new-tab events. **Cannot be fully validated in this web-only worktree audit.**
- **Real-environment pre-release (project rule):** 3D earth, messaging/calls/attachments, auth, PWA, and actual browser runtime flows must be tested in real environments before production.

## 11. Suggested refactor order (post-audit, pending approval)

1. **Audit follow-ups (correctness/honesty only, minimal):** confirm and fix missing `/api/browser/raw-html` contract mismatch if intended; document/guard preview-vs-native capability boundaries in UI copy (no fake native browsing).  
2. **Shell/chrome decomposition:** extract frame/toolbar/tab strip/omnibox/status primitives from `WebBrowser.tsx` with zero contract changes.  
3. **Search & results surface:** redesign home, category/search states, result cards, pagination, and honest source/availability messaging.  
4. **Content/viewer surfaces:** reader, JUPITER content, PDF/image/audio/video viewers, loading/error/blocked states.  
5. **Data & settings surfaces:** bookmarks/history, saved articles, downloads, session restore, permissions, privacy panel (desktop-aware).  
6. **Crawler/AI companion panel:** visual/IA cleanup preserving existing extraction/chat/translate/save behavior and API calls.  
7. **Electron-specific polish/hardening review:** only against real desktop shell/preload implementation; validate bounds/events/security in native runtime.

Each subphase must follow the required scope/test/lint/build/diff/commit/push/remote verification discipline and preserve existing APIs/contracts and real capabilities.

---
*This document records observed implementation and contracts as of `9ad1236` in `/tmp/duyi-one-redesign`; Electron main/preload behavior outside this snapshot remains unverified.*
