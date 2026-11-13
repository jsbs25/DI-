# ONE Redesign — Remaining Modules Audit

**Date:** 2026-11-13  
**Branch:** `redesign/complete-visual-overhaul` (worktree `/tmp/duyi-one-redesign`)  
**Baseline:** `origin/main@c40752b`, production unchanged.  
**Scope:** presentation-layer/UX redesign only; preserve all real functionality, data, APIs, auth/permissions, storage semantics, and business behavior. No Phase G (ONE BROWSER/WebBrowser) work, no merge, no deploy, no prod/infra/DNS/DB/secret changes.

## Completed in prior phases (for reference)
- **A/B/C/D shell:** `index.html`, `src/index.css`, `src/design/tokens.ts`, `src/components/ui/*`, `src/components/home/OneHome.tsx`, `src/components/globe/globeNav.ts`, `src/components/layout/{Navbar,AppDock,CommandPalette}.tsx`, `src/App.tsx`, `src/components/music/GlobalMiniPlayer.tsx`
- **D MUSIC:** `src/universe/VenusMusicSpace.tsx` (core `src/music/*`, APIs preserved)
- **E INTELLIGENCE:** `src/components/ai/AIHub.tsx`
- **F LIBRARY:** `src/components/library/DigitalLibrary.tsx`
- **SEARCH:** `src/components/search/MercurySearch.tsx`
- **Modules:** `src/components/community/CommunityList.tsx`, `src/components/video/VideoCenter.tsx`, `src/components/knowledge/KnowledgeUniverse.tsx`, `src/components/social/{GlobalFeed,TrendingTopicsWidget}.tsx`, `src/components/creator/CreatorHub.tsx`, `src/components/games/GameCenter.tsx`, `src/components/crawler/CrawlerDashboard.tsx` (shell/cards/tabs aligned)

## Remaining real modules / surfaces

### 1. ArabicLearningHub (学习) — **Priority 1 (start now)**
- **Actual function:** Arabic alphabet learning with local spaced-repetition progress, daily review queue/practice session, letter forms/examples/pronunciation (Web Speech Synthesis when available), and Islamic digital library discovery/browser (search/filter by category/source, live crawler trigger, book cards/read/open) integrated with existing learning/library data.
- **Core components & entry:** `src/components/learning/ArabicLearningHub.tsx`; helpers/data `src/components/learning/arabicLearning.ts`, `src/components/learning/islamicLibraryData.ts`. Entry: App tab `arabic-learning` (`src/App.tsx`), dock/nav via `globeNav`/App surfaces; can open main Digital Library via prop callback.
- **API/data dependencies:** `localStorage` key `earth_one_arabic_learning_v1` (study state/progress); `GET /api/learning/arabic/islamic-libraries?limit=30`; `POST /api/learning/arabic/islamic-libraries/crawl` `{ query, category? }`; external/source URLs opened in-browser; browser `speechSynthesis` (optional, graceful fallback).
- **Existing interaction:** Tabs (Islamic library vs letters/practice), search, category/source filters, crawl action with feedback, book grid/cards and reader/open actions, alphabet grid/detail, practice flow (queue, reveal, rating again/hard/good/easy), streak/due/today/mastered stats, local-only progress persistence, voice playback where supported.
- **Desktop/mobile issues:** dense filter/control rows and cards tuned for old palette; long bilingual labels/wrapping; touch target and spacing consistency vs new shell; sticky/header offsets relative to new dock/mini-player; RTL-aware content mixed with LTR UI.
- **Redesign priority:** **P1** — user-listed core learning module, self-contained, medium-large (≈960 LOC), high value; can be redesigned without backend changes.

### 2. MoonSpaceObservatory (月球/观测空间) — Priority 2
- **Actual function:** Moon/astronomy observatory image exploration: preset channels (Moon/Apollo, JWST/Hubble, planets, Sun, nebulae, art), search, source filters (NASA/Wikimedia Commons/Met), remote image fetch, gallery grid, lightbox/detail with metadata/source/download, seeded public-domain fallback imagery.
- **Core components & entry:** `src/universe/MoonSpaceObservatory.tsx`. Entry: App tab `moon` (`src/App.tsx`, universe/space navigation).
- **API/data dependencies:** `GET /api/images/search?q=&limit=24&source=`; image assets/URLs from NASA/Commons/Met responses; static fallback image list in component.
- **Existing interaction:** back-to-universe, channel presets, query search, source toggles, refresh, loading/error states, open/close lightbox, external/source/download links.
- **Desktop/mobile issues:** heavy legacy slate/sky styling, fixed ambient layers, form/button density on small screens, lightbox sizing/scroll and safe areas.
- **Redesign priority:** **P2** — prominent “观测空间” experience, moderate complexity (≈512 LOC), network-backed but read-only.

### 3. SaturnSpace (土星/影视空间, universe module) — Priority 3
- **Actual function:** Saturn video discovery/play space aggregating YouTube/Bilibili search and playback (embed/player flows), channel/preset discovery, daily/watchlist-style local persistence, platform filters, cinema/player UI.
- **Core components & entry:** `src/universe/SaturnSpace.tsx`. Entry: App tab `saturn` (`src/App.tsx`).
- **API/data dependencies:** `/api/bilibili/search` and YouTube search/proxy endpoints used by component (and/or client fallbacks as implemented), YouTube/Bilibili embed URLs/thumbnails, `localStorage` keys for watchlist/daily state (e.g. `earth-one.saturn.*`), optional media/embed behavior.
- **Existing interaction:** back navigation, query search, platform/channel filters, results grid/cards, play/expand/cinema/embed, bookmark/watchlist, loading/error/empty states.
- **Desktop/mobile issues:** complex legacy layout/classes, player/embed responsiveness, overlay controls and safe areas, long text truncation.
- **Redesign priority:** **P3** — large surface (≈955 LOC) with real third-party media/embed behavior; requires careful non-regression.

### 4. MoonAcademy & VenusCreativeStudio (universe wrappers) — Priority 4
- **Actual function:** Thin space wrappers providing themed headers/entry context around existing real modules — MoonAcademy embeds `DigitalLibrary`; VenusCreativeStudio embeds `CreatorHub` (articles/create flow) with honest capability copy.
- **Core components & entry:** `src/universe/MoonAcademy.tsx`, `src/universe/VenusCreativeStudio.tsx`. Entries: universe ecosystem/planet flows (`planetEcosystems.ts`, `UniverseEngine`/directory as wired).
- **API/data dependencies:** delegated to wrapped modules (`/api/library/*`, creator/articles APIs via props/children behavior).
- **Existing interaction:** back-to-system, intro/header, embedded module interaction unchanged.
- **Desktop/mobile issues:** legacy hardcoded dark/gradient headers not aligned to Quiet Futurism tokens.
- **Redesign priority:** **P4** — small (≈46/50 LOC), low risk, quick consistency wins.

### 5. UniverseEngine, SolarSystemDirectory, PlanetTelemetryDrawer (宇宙空间) — Priority 5
- **Actual function:** 3D solar-system/universe exploration (Three.js scene/camera/orbits/planets, focus/telemetry, directory/showcase, ecosystem entry points) and scientific/mission telemetry drawer; integrates with planet/celestial data and procedural textures.
- **Core components & entry:** `src/universe/UniverseEngine.tsx`, `src/universe/SolarSystemDirectory.tsx`, `src/universe/PlanetTelemetryDrawer.tsx`; data/util `celestialBodies.ts`, `planetEcosystems.ts`, `proceduralPlanets.ts`. Entry: App tab `universe`.
- **API/data dependencies:** primarily local data/procedural assets and Three.js/WebGL; callbacks into app navigation/ecosystem tabs; no backend mutation implied.
- **Existing interaction:** 3D interaction/focus/selection, drawer open/close, ecosystem/enter actions, orbit/speed/view controls as implemented, responsive canvas.
- **Desktop/mobile issues:** overlay/HUD controls readability, canvas sizing/touch, drawer width/safe areas, heavy old styling on non-canvas UI.
- **Redesign priority:** **P5** — high-visibility “宇宙空间” but canvas/3D behavior must remain intact; focus UI chrome/HUD/drawer.

### 6. GlobalMessenger (聊天) — Priority 6
- **Actual function:** Full messaging client: conversations (DM/group/channels), realtime WS sync/reconnect, message history/load-more/search, attachments/uploads/media, replies/edit/delete/read states as supported, friends/requests/block/privacy/settings, notifications, calls/signaling/media integration, translation/integrations surfaces, profile/conv management.
- **Core components & entry:** `src/components/chat/GlobalMessenger.tsx` (+ call services/media helpers under `src/services/calls/*`, types). Entry: App tab `chat` (viewport workspace).
- **API/data dependencies:** extensive `/api/conversations*`, `/api/messages*`, `/api/friends*`/social, `/api/users*`, uploads, `/api/calls*`/signaling, notifications/privacy/integrations endpoints as used; WebSocket at `wsUrl(...)`; auth token/session via fetch wrapper; local UI state and refs for sync/cursors/uploads/calls.
- **Existing interaction:** tabbed sidebar/panels, conversation list/select, composer/send, file/image upload, realtime updates, typing/presence cues, search, group/friend/privacy flows, call UI states, mobile chat/list toggling.
- **Desktop/mobile issues:** very large legacy UI (≈2587 LOC), many nested panels/modals, keyboard/viewport height, attachment/lightbox/call overlays, safe areas and dock/player overlap in workspace layout.
- **Redesign priority:** **P6** — critical real-time module with highest regression risk; redesign after smaller modules, in careful incremental passes per sub-surface/commit.

### 7. Auth, profile, intro, brand, companion, banner, legacy sidebar (consistency pass) — Priority 7
- **Actual function:** login/register/OAuth flows (`LoginPage`, `AuthModal`, `OnboardingModal`, `AccountSecurityModal`), profile viewing/edit (`UserProfileModal`), cinematic intro, brand identity system page, holographic AI companion overlay, luxury/commercial banner, legacy sidebar.
- **Core components & entry:** `src/components/auth/*`, `src/components/profile/UserProfileModal.tsx`, `src/components/intro/CinematicIntro.tsx`, `src/components/brand/BrandIdentitySystem.tsx`, `src/components/ai/HolographicAICompanion.tsx`, `src/components/commercial/LuxuryAdBanner.tsx`, `src/components/layout/Sidebar.tsx`.
- **API/data dependencies:** `/api/auth/*`, OAuth callbacks, profile/user update endpoints, local token/session handling; brand/intro mostly presentational/local; companion may call AI surfaces.
- **Existing interaction:** forms/validation, modals, onboarding steps, intro playback/skip, brand page navigation, companion open/interact.
- **Desktop/mobile issues:** mixed old palettes/glass styles; modal sizing/keyboard/safe areas; very large files (`HolographicAICompanion` ≈1006 LOC, `BrandIdentitySystem` ≈1109 LOC) require targeted restyle without behavior change.
- **Redesign priority:** **P7** — important for end-to-end consistency; handle after core spaces, with extra care around auth flows and brand page content/intent.

### 8. Library sub-surfaces (supporting, if time/scope within remaining modules) — Priority 8
- **Actual function:** admin/library management, EPUB/PDF/web reader internals, embed helpers used by DigitalLibrary.
- **Core components & entry:** `src/components/library/{AdminLibrary,EpubReader,bookEmbedUrl.ts,searchFilters.ts}` and related viewers as needed.
- **Notes:** Phase F redesigned primary `DigitalLibrary`; sub-surfaces may retain legacy styling but must keep behavior. Audit flags for targeted alignment if they present visible inconsistency.

### Deferred (not in this phase)
- **Phase G — ONE BROWSER:** `src/components/browser/*`, `WebBrowser.tsx` and Jupiter/browser surfaces explicitly deferred per execution rules.

## Execution notes
- Redesign from real feature structure first (IA/layout/interaction/states), then visual polish; reuse Quiet Futurism tokens/primitives and honest empty/loading/error states.
- Preserve APIs, storage keys/contracts, auth/permissions, and user data paths; no fake data/capabilities; no unfinalized ONE 3D symbol/logo assets.
- Per module: lint + build + relevant tests, desktop/mobile check, diff review, independent commit, immediate push.
