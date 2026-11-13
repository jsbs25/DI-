# P7 ONE IDENTITY & EXPERIENCE — Technical Review

**Date:** 2026-11-14  
**Worktree:** `/tmp/duyi-one-redesign` (`redesign/complete-visual-overhaul`, pre-change HEAD `11e34eb feat(messenger): redesign ONE communication experience`)  
**Scope:** global shell/routing (`src/App.tsx`, `index.html`), layout (`Navbar`, `AppDock`, `CommandPalette`, `Sidebar`, `OfflineIndicator`, `PWAInstallButton`), auth/identity (`AuthModal`, `LoginPage`, `AccountSecurityModal`, `OnboardingModal`), profile (`UserProfileModal`), intro (`CinematicIntro`), brand surfaces (`BrandIdentitySystem`, `brandLogos.tsx`), companion (`HolographicAICompanion`), banner (`LuxuryAdBanner`), globe nav (`globeNav.ts`), and cross-module consistency with P1–P6.

## 1) Current components and real functionality

- **App shell/routing (`App.tsx`)**: client-side tab state (`globe/home, universe, feed, chat, aihub, library, browser, moon, saturn, venus, mercury, academy/learning, knowledge, crawler, creator, video, game, community, brand` etc.), auth bootstrap (`/api/auth/me`, token in `localStorage earth_one_token`), OAuth/error hash handling, data fetches for globe/posts/conversations/integrations/articles/videos/communities, handlers for like/comment/post/article/join/toggle-location/update-profile/auth/onboarding/logout/direct-chat/planet-entry, conditional login gate vs authenticated app, intro/command/profile/auth/security/onboarding modals, `Navbar`/`AppDock`/`GlobalMiniPlayer`/`OfflineIndicator`/`LuxuryAdBanner` placement, `HolographicAICompanion` launcher/navigation hooks, footer.
- **Navigation**: `Navbar` (brand/home trigger, global search + results, command shortcut, language, PWA install, replay intro, location privacy toggle, user menu/auth/security/onboarding/profile/logout), `AppDock` (desktop left dock + mobile bottom dock + More drawer via `globeNav.ts`), `CommandPalette` (⌘K module/search navigation), `Sidebar` exists with real nav items but is not mounted in `App.tsx` (potential legacy/duplicate navigation surface). `globeNav.ts` defines primary/more module entries and labels.
- **Auth/identity**: `LoginPage` (email/username+password login, register with username/email/password validation, `/api/auth/login|register`, calls `onAuthSuccess`; PWA/brand entry), `AuthModal` (login/register/phone/forgot/reset flows, Google/WeChat start links, `/api/auth/*`, `/api/integrations` capability gating, SMS/mail config-aware messaging), `AccountSecurityModal` (`/api/auth/security`, bind/verify/unbind email/phone/OAuth, change email/password, unlink guards, audit-aware messaging), `OnboardingModal` (multi-step identity/avatar/location beacon/privacy/bio/interests, `/api/auth/onboarding`).
- **Profile**: `UserProfileModal` (view/edit own display name/city/bio/location visibility, follow/direct-message actions, metrics/interests, real user data from props/API callbacks).
- **Intro**: `CinematicIntro` (Three.js/WebGL cinematic flight, audio synth, skip/enter controls, `showIntro` state in App with `?nointro=1` support; completion callback only — no auth flow implemented inside despite optional prop).
- **Brand**: `BrandIdentitySystem` + `brandLogos.tsx` provide existing brand exploration/assets/exports and established concepts/tokens; `index.html` already uses ONE title/meta/theme and favicon/manifest assets. Some legacy `EARTH ONE` naming remains in UI copy/assets/alt text.
- **Companion**: `HolographicAICompanion` (launcher/panel chat, streaming Ollama path, `/api/ai/chat` + `/api/ai/models`, voice TTS/STT via browser APIs with fallbacks, local Ollama fallback attempt, tab navigation intents, search grounding toggle, model controls/history/local persistence, 3D/visual presentation).
- **Banner/global hints**: `LuxuryAdBanner` fetches `/api/ads`, click tracking `/api/ads/:id/click`, sponsored content UI (hidden in space experiences in App). `OfflineIndicator` shows connectivity state.

## 2) Existing APIs, auth, and state dependencies (must preserve)

- Auth/session: `GET /api/auth/me`, `POST /api/auth/login|register|logout|onboarding|update-profile|toggle-location`, security/bind/verify/unlink/change endpoints, OAuth start redirects, token storage key `earth_one_token`, cookie/credential flows, `hasCompletedOnboarding` gating.
- App data: `/api/globe/nodes|countries`, `/api/posts*`, `/api/conversations*`, `/api/integrations`, `/api/articles`, `/api/videos`, `/api/communities*`, `/api/search/global`, `/api/ads*`, `/api/users/:id/follow`.
- Messenger/calls/media and all P1–P6 module contracts remain untouched (no API/WS/schema changes in P7).
- Client state dependencies: `currentTab`, `showIntro`/`nointro`, `focusCoordinates`, `activeConversationId`, `directOpenSeq`, library/knowledge focus IDs, language/RTL `dir`, onboarding/security/profile modal states, public/private location behavior.

## 3) Global inconsistencies / conflicts observed

- Mixed brand naming: `ONE` vs `EARTH ONE`/`PROJECT EARTH`/`Earth One` in App footer, Login/Auth/Onboarding/Profile copy, Sidebar labels, meta/image alt/assets (`/earth-one-*`), intro/document labels, and some component titles.
- Visual inconsistency vs Quiet Futurism system: legacy slate/cyan-heavy surfaces and ad-hoc gradients/shadows in auth/profile/intro/banner/companion/layout compared with tokens/primitives used in redesigned modules.
- Navigation density/duplication risk: `Sidebar` component duplicates module navigation but is unused; `AppDock` + `Navbar` + `CommandPalette` + companion navigation intents overlap conceptually and must remain clear without removing real capabilities.
- Responsive/a11y gaps: varying touch target sizes, modal/sheet safe-area behavior, focus/keyboard affordances, dense controls, inconsistent empty/loading/error/auth-expired messaging, and intro/companion motion not consistently reduced for `prefers-reduced-motion`.
- i18n/RTL: partial language handling exists, but copy is mixed zh/en/ar and some layouts/alignments are not explicitly RTL-robust across all P7 surfaces.

## 4) Behavior that must be preserved

- Real authentication, onboarding, profile/security, session bootstrap, token persistence, and permission/location privacy flows.
- All existing routes/modules, P1–P6 completed functionality, and real data loading/mutations.
- Intro first-entry behavior/state semantics (`showIntro`, replay, `nointro`), companion real capabilities (AI chat/voice/navigation hooks where supported), ad fetch/click behavior, and navigation access to real modules.
- No backend/Worker/DB/schema/env/DNS/route/API contract changes; no fake users/login/profile/data/capabilities.

## 5) Safe refactor scope (P7)

- Presentation-layer and verified frontend-adaptation changes in scoped files: `index.html`, `App.tsx`, `components/layout/{Navbar,AppDock,CommandPalette,Sidebar,OfflineIndicator,PWAInstallButton}.tsx`, `components/auth/{LoginPage,AuthModal,OnboardingModal,AccountSecurityModal}.tsx`, `components/profile/UserProfileModal.tsx`, `components/intro/CinematicIntro.tsx`, `components/ai/HolographicAICompanion.tsx`, `components/commercial/LuxuryAdBanner.tsx`, `components/globe/globeNav.ts`, plus this review doc.
- Unify ONE naming/copy where safe, align to Quiet Futurism tokens/surfaces/typography/spacing/motion states, improve responsive/mobile/keyboard/focus/RTL handling, clarify unauth/logged-in/expired-permission states in UI copy, and keep existing brand assets (no new final core logo/sculpture).
- Track all shared-component usages before edits; avoid API/logic rewrites and avoid regressions in P1–P6.

## 6) Capabilities that do not exist and must NOT be faked

- No final ONE core logo/sculpture generation presented as finalized brand mark beyond existing established assets/text/tokens.
- No fake SSO/verification/email/SMS delivery success when services/config are unavailable; keep config-gated/real responses.
- No fake AI/media/voice/network capabilities, no invented profile/auth states, no mock ads/data, and no backend-less security guarantees.
- No deletion/overwrite of user data, auth state, or production configuration.
