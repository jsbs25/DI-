# Open-Source Research (ongoing, implementation-focused)

Date: 2026-11-13 | Baseline: `c40752b` redesign branch

> Research is used to inform ONE's own Quiet Futurism design/architecture. License compatibility and file-level terms are checked before any reuse; no GPL/AGPL-incompatible code copied. Prefer borrowing interaction patterns, layout structure, and engineering approaches.

## A. Design systems & components
1. **shadcn/ui** (MIT) — composable copy-owned components on Radix/Tailwind; patterns for forms, dialogs, command, theming tokens. Fit: high for React+TS+Vite; adopt patterns/primitives, not wholesale dependency lock-in.
2. **Radix UI Primitives** (MIT) — accessible unstyled primitives (dialog, popover, tabs, slider) suitable for player/queue/modals.
3. **Magic UI** (MIT) — motion-enhanced marketing blocks; borrow restraint only, avoid decorative overload.
4. **Aceternity UI** (MIT, check per-component) — animated components; reference micro-interactions sparingly.
5. **React Bits** (MIT) — creative UI snippets; selective inspiration for hero/ambient effects with performance care.
6. **Motion Primitives** (MIT) — animation recipes aligned with Motion library.
7. **Animate UI** (MIT) — animated component patterns; evaluate bundle/perf.
8. **Mantine** (MIT) — full component library/hooks; reference responsive patterns, avoid heavy migration mid-redesign.
9. **Lucide** (ISC) — consistent icon system already in project; standardize usage/strokes.
10. **Tailwind CSS v4** (MIT) — token/theme layer via `@theme`; already used, extend with ONE tokens.

## B. Animation & interaction
11. **Motion (framer-motion/motion)** (MIT) — declarative transitions/layout animations; use subtly, honor `prefers-reduced-motion`.
12. **GSAP** (Standard “no charge” license w/ constraints; commercial/club terms apply for some cases) — powerful timelines; avoid adding unless necessary due to licensing complexity.
13. **Lenis** (MIT) — smooth scrolling; risk with nested scroll/players/mobile, evaluate carefully.
14. **AutoAnimate** (MIT) — simple list/layout transitions; lightweight.
15. **Lottie** (MIT) — vector animations; optional for branded moments with perf budget.

## C. 3D earth & spatial visuals
16. **Three.js** (MIT) — core 3D engine; already used by existing globe, preserve engine.
17. **React Three Fiber** (MIT) — React renderer for Three; reference patterns but avoid risky rewrite of working globe.
18. **Drei** (MIT) — helpers for R3F; reference only unless migrating.
19. **react-globe.gl** (MIT) — globe visualizations; compare layering/perf ideas.
20. **three-globe** (MIT) — globe data layers; useful concepts for markers/arcs.
21. **iTowns** (MIT/Cecill-B dual? verify files) — geospatial 3D; heavy, not directly fit for current SPA.
22. **living-planet** (check license) — artistic earth visuals; inspiration only.
23. **globestudio** (check license/activity) — globe tooling concepts.

## D. Music & media products
24. **Feishin** (GPL-3.0) — Subsonic/Navidrome client UX (library/now playing/queue); **reference UX flows only, no code reuse**.
25. **Navidrome** (GPL-3.0) — server/library model; concepts for metadata/library organization only.
26. **Ampcast** (license to verify per repo) — web player UX patterns.
27. **Finamp** (MPL-2.0) — mobile music UX, queue/now-playing patterns.
28. **Stretto** (check license) — lightweight player UI ideas.
29. **Supersonic** (GPL-3.0) — desktop music client UX; reference only.
30. **Vidstack** (MIT) — modern media player primitives; potential for video/audio UI patterns.

## E. Browser & desktop
31. **Electron** (MIT) — desktop shell option for true browsing via WebContentsView.
32. **electron-example-browserview** (MIT examples) — reference architecture for tabs/webviews.
33. **WebContentsView docs/examples** (Electron, MIT) — preferred modern embedding vs BrowserView.

## Implementation notes
- Prioritize: token/primitives consistency, music Now Playing + queue clarity, responsive shell, honest web-browser constraints.
- No blind installs; verify actual dependency licenses/notices before integration.
- Preserve existing React 19 + Vite 8 + Tailwind v4 + Three/music core architecture.
