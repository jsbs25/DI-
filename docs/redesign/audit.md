# ONE Complete Redesign — Baseline Audit

**Baseline:** `c40752b` (`origin/main`, `redesign/complete-visual-overhaul`)
**Date:** 2026-11-13
**Scope:** Visual/experience redesign only. Preserve features, data, APIs, auth, DB/schema, Worker/D1/bindings/routes, 3D globe engine, music player core, i18n, PWA/SW behavior.

## 1. Product & Stack
- **Brand/app:** EARTH ONE / ONE (React 19 + Vite 8 + TypeScript + Tailwind CSS v4 `@tailwindcss/vite`, `lucide-react`, `motion`, `three`, `cmdk`, `vaul`, `epubjs`, `pdfjs-dist`, PWA via `vite-plugin-pwa`).
- **Runtime:** SPA frontend in `src/`; dev/start server `tsx server.ts` (Express + `ws` + local JSON store + discovery DB). Production: Cloudflare Worker `earthone-api` serving assets+API (D1, Assets SPA). Parity between Express and Worker must be preserved; redesign must not assume backend changes.
- **Scripts:** `dev/start` = `tsx server.ts`, `build` = `vite build`, `lint` = `tsc --noEmit`.

## 2. Navigation & Route/Tab Structure (`src/App.tsx`, `src/components/globe/globeNav.ts`)
Single-page tab state (`currentTab`) with history/deep-link hints (`?module=`, `/jupiter/search`). Main tabs/views:
- **Core/space:** `globe` (DigitalGlobe home), `universe` (UniverseEngine), `saturn` (SaturnSpace/cinema), `venus` (ONE MUSIC/VenusMusicSpace), `mercury` (MercurySearch), `moon` (MoonSpaceObservatory), `browser` (WebBrowser/Jupiter), `chat` (GlobalMessenger), `library` (DigitalLibrary), `aihub` (AIHub), `feed` (GlobalFeed), `creator` (CreatorHub), `video` (VideoCenter), `game` (GameCenter), `community` (CommunityList), `arabic-learning` (ArabicLearningHub), `knowledge` (KnowledgeUniverse), `crawler` (CrawlerDashboard), `brand` (BrandIdentitySystem).
- **Auth gating:** unauthenticated users see `LoginPage` (or Brand module); authenticated users enter full app shell (Navbar + AppDock + CommandPalette + optional HolographicAICompanion + modals).
- **Layout:** viewport-workspace tabs (`globe|universe|chat|browser`) use `h-[100dvh]`; others scroll with top/dock offsets. Venus/chat/library/browser kept mounted/hidden in some cases to preserve state.

## 3. Existing Visual Foundation
- **Global tokens/theme:** `src/index.css` defines `@theme` colors (`--color-space-bg`, HUD glass vars, accent, text/status) and base/components (`.eo-glass`, `.eo-glass-strong`, dark scrollbars, Jupiter-specific styles, reduced-motion media override).
- **Fonts:** Google fonts loaded in `index.html` (Cinzel, Plus Jakarta Sans, Tajawal, JetBrains Mono); dark default (`<html class="dark">`, body `#030712`).
- **Shell components:** `Navbar.tsx` (search/lang/user/PWA/command), `AppDock.tsx` (desktop left dock + mobile bottom dock, Vaul drawer for “More”), `CommandPalette.tsx`, `Sidebar.tsx` (legacy/alternate), `OfflineIndicator`, `PWAInstallButton`.
- **Current style:** dark glassmorphism HUD, cyan/blue accents, dense tabbed modules; inconsistent spacing/radius/typography patterns across legacy components (many hardcoded Tailwind colors/classes).

## 4. Feature Modules (must remain functional)
- **Auth/profile/security:** `LoginPage`, `AuthModal`, `OnboardingModal`, `AccountSecurityModal`, `UserProfileModal`; session/token handling in `src/main.tsx` fetch wrapper + `/api/auth/*`.
- **Globe/universe:** `DigitalGlobe` (Three.js/procedural earth/clouds/shaders, beacons/ISS/earthquakes telemetry, orbit/nav, immersive), `UniverseEngine`, planet ecosystem mapping (`planetEcosystems.ts`), `SaturnSpace`, `MoonSpaceObservatory`, cinematic intro.
- **ONE MUSIC (critical):** core in `src/music/{PlayerContext.tsx,useMusicPlayer.ts,playerReducer.ts,persistence.ts,playback/audioEngine.ts,playback/embedAdapter.ts,types in src/types/music.ts}`; UI `VenusMusicSpace.tsx`; server `server/musicStore.ts`, `/api/music/*`, YouTube/Bilibili/crawl search flows. **Do not recreate audio instances or break cross-view continuity.**
- **AI:** `AIHub`, `HolographicAICompanion`, streaming/session history utils, `/api/ai/*`.
- **Library/learning/knowledge:** `DigitalLibrary`, `EpubReader`, `AdminLibrary`, book/PDF/image/audio/video viewers, Arabic learning, Knowledge Universe; `/api/library/*`, reading AI/epub security utilities.
- **Browser/search:** `WebBrowser` (Jupiter routes, reader/crawler/search/PDF/image/audio/video document modes, bookmarks/history/privacy), Mercury search, `/api/jupiter/*`, web fetch/search/crawl integrations. Web constraints (iframe/CSP/XFO) must be represented honestly.
- **Social/communication/content:** Feed, Messenger/chat+WS, conversations/calls/signals, Creator, Video center, Community, Game center, commercial/banner components.
- **Crawler/discovery/integrations:** Crawler dashboard, discovery engine/connectors/scheduler, channel/mail/sms/OTP/privacy subsystems on server.

## 5. Data/API/Auth Constraints
- Frontend calls `/api/*` (same-origin or `VITE_API_BASE` via `src/apiBase.ts`); `main.tsx` patches fetch for API base/credentials/Authorization token.
- Server exposes large REST surface in `server.ts` (auth, users, globe, posts, conversations/messenger/files/calls, music, library, AI, Jupiter/search/crawl, knowledge, discovery, etc.). Worker production entry/config live outside redesign code paths in repo snapshot; do not alter DB schema, bindings, DNS, secrets.
- i18n in `src/i18n/translations.ts` (`en/zh/ar/es/fr/ru`); RTL support considerations exist.

## 6. Redesign Risks / Implementation Notes
- High coupling in `App.tsx` (state orchestration, many lazy/heavy modules) — prefer incremental shell + per-module refactors with compatibility wrappers.
- Hardcoded colors/layouts across many feature components; global token migration must avoid breaking contrast/usability.
- Preserve persisted keys/behaviors where relied upon (music player storage, browser local keys, auth token storage) unless safely versioned.
- PWA/SW (`vite-plugin-pwa`, `registerSW({ immediate: true })`) and cache behavior can mask UI changes; verify update flow.
- Mobile requires dedicated layouts (360–430 widths, safe areas, bottom dock/player overlap, keyboard/scroll).

## 7. Planned Delivery Order (iterative, test/commit/push per phase)
A. Design tokens + base primitives/shell foundation
B. New ONE home experience
C. Global navigation/layout refactor
D. ONE MUSIC visual refactor (reuse core)
E. ONE INTELLIGENCE
F. ONE LIBRARY
G. ONE BROWSER
H. Remaining modules (video/community/feed/creator/learning/knowledge/crawler/game/profile/universe-adjacent surfaces as applicable)
I. Mobile full-pass optimization
J. A11y/perf/regression + real browser checks
K. Merge/push/deploy/verify production with backup+rollback readiness
