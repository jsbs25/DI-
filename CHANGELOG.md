# EARTH ONE CHANGELOG

## [Unreleased] - 2026-11-04

### Fixed
- Moved the Universe telemetry drawer below the desktop celestial selector (`md:top-32`) while preserving the compact small-screen position and all existing controls; visual remeasurement refined the initial offset to leave a real gap.
- Added original EARTH ONE SVG and multi-size ICO favicon assets and explicit HTML icon links to resolve the missing `/favicon.ico` resource.
- Reflowed the globe overview into three metric columns with a separate responsive waveform row, wrapping labels and logical-direction dividers; existing values, translations and controls are preserved. Isolated Chromium geometry checks now pass at desktop Chinese/Arabic RTL and narrow Chinese viewports.
- Fixed narrow-screen flex minimum-width overflow in the AI HUB model selector/status area and Web Browser toolbar/split pane; retained all existing controls and confined toolbar scrolling to its own area.
- Named the telemetry close icon control for assistive technology, added a non-submit button type and kept the original close callback unchanged.
- Integrity tests now use an isolated temporary JSON store and clean it up on success or failure, preventing test users, posts, and messages from being written into persistent project data.
- The store data path can be overridden with `EARTH_ONE_DATA_FILE`; the existing `server_data.json` default remains unchanged.
- Public user lists, profile responses, and global search now use a field allowlist that excludes email/internal onboarding state and masks coordinates when location sharing is disabled.
- `/api/auth/me` and `/api/auth/current` now return only the account associated with a valid bearer-token session, or `user: null` when no valid session is present.
- Onboarding, profile updates, and location-visibility changes now require a valid session; location-visibility changes are persisted to disk.
- Added `npm run test:api`, an isolated HTTP regression suite for identity/privacy routes. It skips background book harvesting only in the test process.
- Clarified that the current integrity suite validates store/domain behavior and is not an HTTP/browser end-to-end suite.

### Improved
- Expanded isolated HTTP API coverage to 51 assertions across social posts, library search/details/bookshelf progress, browser bookmarks, and crawler task creation. Tests use temporary storage and do not execute external crawls.
- Extended HTTP API coverage to 64 assertions with article/video list contracts and knowledge-graph search, filters, details, and 404 handling; no article content write, external media request, crawl, admin route, or private-message access was exercised.
- Added read-only community, game-room, and advertisement list checks; the isolated HTTP suite now has 67 passing assertions, with no join/create/click writes.
- Added `npm run test:globe`: 24 static-render assertions across all six existing languages protect overview content and markup contracts without browser, WebGL, effects or API calls.
- Added `npm run test:universe`: 9 static-render checks for the close control, celestial labels, focus text, conditional Earth entry and empty selection. Keyboard, screen-reader and camera behavior remain outside this test scope.
- Expanded the isolated HTTP regression from 67 to 78 checks with read-only globe statistics/countries/nodes, AI model/usage metadata, crawler task/page lists, saved-article list, book annotation collection, unknown-book 404 and unknown-public-profile 404 contracts; no model call, crawl or write was triggered by the new checks.
- Added two isolated read-only library catalog contracts for category filtering and an empty result when no category matches; the HTTP regression now has 80 passing assertions.
- Added globe-node privacy regression checks: a user's node appears with numeric coordinates after authenticated location sharing is enabled and disappears when sharing is disabled; no route or access policy changed.
- Added an isolated `feed=latest` ordering assertion to the social-post HTTP tests; a just-created temporary post must appear first.
- Added two isolated globe-country contracts: the Jordan entry retains localized metadata and coordinates, and `/api/globe/stats` reports a country count matching the country catalog.
- Added `npm run test:globe-api`, a focused temporary-server runner that issues GET requests only to the allowlisted globe country catalog/statistics endpoints; seven checks cover catalog shape, unique country codes, valid coordinate ranges, Jordan metadata and cross-endpoint country-count consistency.
- Added `npm run test:ai-api`, a focused temporary-server regression restricted to GET `/api/ai/models` and `/api/ai/stats`; nine checks protect model metadata, disabled credentials, and aggregate usage consistency without invoking model calls or private conversation routes.
- Added `npm run test:i18n`, a local static check across all six supported locales for matching dictionary keys and non-empty translation strings (13 assertions; 104 shared keys). Translation accuracy, RTL geometry and browser behavior remain outside its scope.
- Added `npm run test:knowledge-api`, an isolated GET-only knowledge-graph regression (11 assertions) that resolves all 33 node details, verifies graph-edge and linked-book consistency, and checks alias search, category/country filters, and structured 404s. It uses temporary storage and does not access private conversation paths, external services, production data, or existing services.
- Added `npm run test:library-api`, an isolated GET-only regression (12 assertions) for the local catalog and known/unknown book details, covering unique identifiers, core fields, philosophy filtering, empty category results, local Plato search, chapter structure, and structured 404s. It uses temporary storage and does not call external book search, the bookshelf, or write endpoints.
- Added `npm run test:crawler-api`, an isolated GET-only regression (12 assertions) for crawler task/page list shapes, unique IDs, page-to-task links, valid status/date fields, and the pending-review sample; it never creates tasks, runs crawls, or approves/rejects pages.
- Added `npm run test:creator-api`, an isolated GET-only regression (11 assertions) for article/video catalog response fields, unique IDs and existing seeded entries; it validates media URL fields without fetching media or performing content writes.
- Added `npm run test:catalog-api`, an isolated GET-only regression (16 assertions) for community, game-room and advertisement catalog fields, unique identifiers and existing samples; it never joins communities, changes rooms, records ad clicks, or fetches media.
- Added `npm run test:social-feed-api`, a 19-assertion isolated GET-only regression for public post-feed fields, seeded entries, default/latest/trending order, case-insensitive country and content filters, category and combined filters, and `all`/`ALL` behavior; it only uses temporary JSON and never calls write, identity, conversation, message, or media endpoints.
- Localized the existing Crawler menu label across all six languages and added one static label-presence check per locale; the Arabic RTL browser check opens the same existing desktop dashboard without invoking crawler actions.
- A one-run production Chromium resource-timing capture found 253,077 encoded / 942,755 decoded JavaScript body bytes on the default 3D home, plus 16,324 / 112,399 CSS bytes. The 12 non-initial page chunks loaded only on first navigation; no Three.js deferral was made because it would change the default interactive-globe experience without a product decision.
- Navigation modules now load on demand behind an accessible loading state. The entry chunk decreased from about 1,160.76 KB (gzip 306.07 KB) to 316.71 KB (gzip 97.92 KB); the shared Three.js chunk remains about 551.65 KB and still triggers the build warning.
- No authentication, authorization, administrator-permission, or private-message access-control policy was changed.

### Verification
- `npm run lint`, `npm run build`, `npm run test:api` (67 assertions), and `npx tsx scripts/test_earth_one.ts` (44 assertions) passed; the production CSS contains the responsive desktop drawer offset.
- The isolated `npm run test:social-feed-api` passed (19 assertions) and `npm run lint` passed. The full `test:api`, build, and browser suites were not run in this continuation; the full API suite contains a session-read path still awaiting approval.
- The overview reflow passes `npm run test:globe` (24 assertions), TypeScript and production build; generated CSS includes the metric grid, logical border and word-wrapping rules. These checks do not prove visual geometry or RTL interaction.
- A bounded desktop production-build smoke check passed for globe → feed → library detail → universe → Earth telemetry → globe, using isolated temporary API data and no external AI/crawling.
- Desktop remeasurement at 1274×649 confirmed a 9px gap (selector bottom 119px, drawer top 128px), Earth selection with the drawer open, and return to the globe with no console errors on that path. Favicon preview requests returned 200 with expected MIME types.
- An earlier 390×844 iframe showed the narrow globe layout, but a language-button input-preparation timeout left that specific operation unconfirmed; same-tab reconnect succeeded without replay. The later isolated Chromium test below is a separate session and does not retroactively confirm that click.
- A separate headless Chromium run against a temporary production build confirmed actual language-menu switching to Arabic RTL, three non-overlapping metrics on desktop and narrow Chinese layouts, no horizontal overflow, and globe→universe→globe navigation; the local API stub only served empty GET responses and rejected writes. This does not resolve the earlier iframe operation, verify mobile RTL, or constitute a hardware-GPU/production-data test.
- The isolated browser recorded first-home requests for Three.js (551,943 raw bytes), the entry script (316,969 bytes), and DigitalGlobe (72,209 bytes). Build gzip estimates are approximately 137.29 KB, 97.92 KB, and 18.06 KB respectively. Three.js is still loaded with the default 3D home; further deferral is pending lifecycle review to avoid breaking existing Earth/Universe behavior.
- This continuation used an auto-cleaned temporary API JSON store and an in-memory mock for the visual preview. The separate `server_data.json` write observed at 04:56:30 remains unexplained; its source was not inferred or changed, and existing ports 3000/3001 were left untouched.
- A follow-up isolated production-build Chromium run covered 12 mobile-navigation destinations at 390×844 Arabic RTL, plus AI HUB/Web Browser at 1274×649 Arabic RTL desktop and 390×844 Chinese mobile, and the desktop Crawler dashboard; all 18 viewport/module samples had document/body widths equal to the viewport. It exposed and verified fixes for both layout overflow issues.
- Previous final checks passed: API 78, store/domain 44, globe static render 30, universe static render 9, TypeScript, and the isolated production build. The visual-browser session used a separate temporary JSON store and GET only; 43 external requests were blocked intentionally, causing network-load notices but no page errors. Crawler loaded only task/page lists; no create/run/approve/reject action occurred, and the browser session attempted no non-GET. Existing services and formal data were not touched.
- The previous continuation passed `npm run test:api` (80 assertions, 0 failures) and `npm run lint`; its two library-category checks use the script's temporary JSON store and issue only local GET requests.
- The previous follow-up passed `npm run test:api` (82 assertions, 0 failures) and `npm run lint`; globe-node privacy checks use the same isolated temporary store. The API-test commits and sync-status correction were fast-forward pushed through the already-authorized connector; a fresh fetch confirmed local and remote matched, without force push or account-setting changes.
- The current follow-up passed `npm run test:api` (83 assertions, 0 failures), `npm run lint`, `npm run test:globe` (30), `npm run test:universe` (9), `npx tsx scripts/test_earth_one.ts` (44), and `npm run build`. Build retains the existing 551.65 KB Three.js chunk warning; no Earth/Universe behavior was deferred or removed.
- The next continuation added two globe-country assertions (the API script now contains 85 checks); `npm run lint` and a focused GET-only smoke against an isolated temporary store passed. The full API suite was not rerun because it includes session-read paths still awaiting authorization approval; no restricted endpoint, existing service, or formal data file was accessed.
- Scope correction: the visual app shell and opened modules also fetched seeded/empty conversation, message, shelf, bookmark and saved-article lists from that temporary store. This was not an authorization test; it did not read formal user data or use existing services. Future visual runs must stub those paths before proxying API requests.
- This continuation passed `npm run test:knowledge-api` (11 assertions; 33 node details), `npm run test:globe-api` (7), `npm run test:ai-api` (9), `npm run test:i18n` (13), and `npm run lint`. The new API process used temporary JSON and GET-only endpoint allowlisting; full `test:api` and build were not run. No private conversation route, formal data file, or existing service was accessed. Although the GitHub connector is enabled, this runtime lacks its CLI/credential helper and plain `gh` is unauthenticated, so no push was made.
- This continuation passed `npm run test:library-api` (12 assertions) and `npm run lint`. The new test uses auto-cleaned temporary JSON on a random local port and only GETs the local catalog/detail allowlist; it does not access external book search, bookshelf routes, private conversation paths, formal data, or existing services. The full API suite, build, and browser tests were not run; no GitHub push was made because the authorized CLI/credential helper is unavailable in this runtime.
- This continuation passed `npm run test:crawler-api` (12 assertions) and `npm run lint`. The test uses auto-cleaned temporary JSON and a random local port; it requests only the task/page list GET endpoints and does not perform task creation, crawling, review actions, external requests, or access private conversation paths, production data, or existing services. The full API suite, build, and browser tests were not run.
- This continuation passed `npm run test:creator-api` (11 assertions) and `npm run lint`. The test uses auto-cleaned temporary JSON and a random local port; it only GETs article/video catalogs, validates media URL strings without fetching them, and does not write content or access private conversation paths, production data, or existing services. The full API suite, build, and browser tests were not run.
- This continuation passed `npm run test:catalog-api` (16 assertions) and `npm run lint`. The test uses auto-cleaned temporary JSON and a random local port; it only GETs community, game-room and ad catalogs, without joins, game changes, ad clicks, media fetches, private conversation access, or production data. The full API suite, build, and browser tests were not run.
- The creator/catalog regression changes and project records were committed as `e4403a8` and fast-forward pushed through the authenticated GitHub connector; a post-push fetch confirmed `main` and `origin/main` matched, with no force push or account-setting changes.
- Resource measurements use local `PerformanceResourceTiming` encoded/decoded body sizes in one isolated Chromium run; they are not a repeated network, bandwidth or hardware benchmark and exclude response headers.

## [v1.1.0] - Secure Authentication & Citizen Onboarding Wizard - 2026-11-03

### Added
- **Secure Authentication System**:
  - Full registration (`/api/auth/register`) and login (`/api/auth/login`) with SHA-256 password hashing + dynamic salt.
  - Session verification (`/api/auth/me`) and secure logout (`/api/auth/logout`).
  - Fast 1-click test credentials for preset global citizens (Li Wei, Sarah, Tariq, Noura, Julien, Dmitry).
- **Post-Registration Profile Onboarding Wizard**:
  - 3-step interactive onboarding modal (`OnboardingModal.tsx`):
    - **Step 1 (Identity)**: Setting unique `@username`, display name, and avatar selection from 8 artistic presets or custom URL.
    - **Step 2 (Planetary Location)**: Country selection, city resolution, and toggleable public 3D Earth beacon visibility with real-time latitude/longitude mapping.
    - **Step 3 (Perspective)**: Personal bio and intellectual/cultural interest tags.
  - Automated post-onboarding 3D Earth launch: switches to 3D Globe, highlights user's personal beacon with emerald-gold illumination, and glides the camera smoothly directly to their city!
- **AI Hub Google Search Grounding**:
  - Real-time live web verification with `gemini-3.8-flash` utilizing the `googleSearch` tool and returning citation sources.

## [v1.0.0] - Initial Production Foundation - 2026-11-03

### Added
- **Interactive 3D Digital Globe**:
  - Three.js procedural sphere with continent outlines, coordinate meridians, night-side city constellations.
  - Rayleigh scattering atmospheric rim glow shader and dual-layer rotating cloud mesh.
  - Interactive 3D pins for registered citizens with raycasted tooltips and camera flight.
  - Curved 3D data arcs connecting world metropolises with traveling photon packets.
  - Collapsible bottom control dock with auto-rotation, reset, and quick country exploration.
- **Unified Global Social Network**:
  - Global, Trending, Latest, and Following feeds.
  - Category filters: Real Life, Culture, Tech, Travel, Philosophy.
  - Rich post composer with media previews, country badges, likes, comments, and voluntary tipping.
- **Global Instant Messaging & Real-Time AI Translation**:
  - Real-time 1-on-1 and public channels.
  - AI translation powered by Google Gemini 2.5 with one-click "View Original / 查看原文" toggle.
- **Creator Hub & Planetary Video Stream**:
  - Long-form essays with reading metrics and creator tipping.
  - Streamlined video showcase with view and like counts.
- **Global Game Center**:
  - Interactive 13x13 Gomoku (Five-in-a-Row) game with win verification and AI opponent.
  - Global Trivia Quiz covering world geography and planetary science.
- **EARTH ONE AI HUB**:
  - Multi-model gateway integrating Gemini 2.5 Flash and Pro.
  - 4 specialized operating modes: Global Assistant, Polyglot Translator, Creator Co-Author, Language Coach.
- **Multilingual & RTL Engine**:
  - Full translations for Chinese, English, Arabic (with RTL bidirectional layout), Spanish, French, and Russian.
- **Complete Documentation Suite**:
  - `PROJECT_MASTER_PLAN.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `DESIGN_SYSTEM.md`, `OPEN_SOURCE_AUDIT.md`, `LICENSE_COMPLIANCE.md`, `AI_HUB_ARCHITECTURE.md`, `SECURITY.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md`, `README.md`.
