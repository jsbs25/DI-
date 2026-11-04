# EARTH ONE CHANGELOG

## [Unreleased] - 2026-11-04

### Fixed
- Moved the Universe telemetry drawer below the desktop celestial selector (`md:top-32`) while preserving the compact small-screen position and all existing controls; visual remeasurement refined the initial offset to leave a real gap.
- Added original EARTH ONE SVG and multi-size ICO favicon assets and explicit HTML icon links to resolve the missing `/favicon.ico` resource.
- Reflowed the globe overview into three metric columns with a separate responsive waveform row, wrapping labels and logical-direction dividers; existing values, translations and controls are preserved. Browser visual remeasurement remains pending.
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
- Navigation modules now load on demand behind an accessible loading state. The entry chunk decreased from about 1,160.76 KB (gzip 306.07 KB) to 316.71 KB (gzip 97.92 KB); the shared Three.js chunk remains about 551.65 KB and still triggers the build warning.
- No authentication, authorization, administrator-permission, or private-message access-control policy was changed.

### Verification
- `npm run lint`, `npm run build`, `npm run test:api` (67 assertions), and `npx tsx scripts/test_earth_one.ts` (44 assertions) passed; the production CSS contains the responsive desktop drawer offset.
- The overview reflow passes `npm run test:globe` (24 assertions), TypeScript and production build; generated CSS includes the metric grid, logical border and word-wrapping rules. These checks do not prove visual geometry or RTL interaction.
- A bounded desktop production-build smoke check passed for globe → feed → library detail → universe → Earth telemetry → globe, using isolated temporary API data and no external AI/crawling.
- Desktop remeasurement at 1274×649 confirmed a 9px gap (selector bottom 119px, drawer top 128px), Earth selection with the drawer open, and return to the globe with no console errors on that path. Favicon preview requests returned 200 with expected MIME types.
- A 390×844 iframe showed the narrow globe layout, but a language-button input-preparation timeout left its effect unconfirmed; same-tab reconnect succeeded without replay. Mobile interactions, RTL, other modules and real first-load resource measurements remain unverified.

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
