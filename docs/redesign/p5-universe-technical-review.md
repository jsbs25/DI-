# P5 ONE UNIVERSE — Technical Review

**Date:** 2026-11-13  
**Branch:** `redesign/complete-visual-overhaul` (HEAD at start: `92a747ad8f49601a5d794f7399328e8e07cf8bcb`)  
**Scope:** `src/universe/UniverseEngine.tsx`, `src/universe/SolarSystemDirectory.tsx`, `src/universe/PlanetTelemetryDrawer.tsx`, direct 3D/data deps `proceduralPlanets.ts`, `celestialBodies.ts`, `planetEcosystems.ts`. Route: `App.tsx` tab `universe` → `UniverseEngine` with `onSwitchToEarthWorld` / `onEnterEcosystem` (`handleEnterPlanet` via `getPlanetEcosystem`).

## Engine & rendering structure
- **UniverseEngine:** React functional component; single Three.js `Scene`, `PerspectiveCamera (45°)`, `WebGLRenderer` (`antialias`, `ACESFilmicToneMapping`, capped DPR). Starfield `BufferGeometry` points, Sun sphere + corona + `PointLight` + `AmbientLight`, 8 planets (Mercury–Neptune) on `Group` pivots with `EllipseCurve` orbit lines, Earth clouds + Moon child, Saturn `RingGeometry` with radial UV mapping and Cassini-division procedural texture. Raycaster pointer pick focuses bodies; mouse drag/wheel camera control; RAF loop with dt, orbital/self-rotation, cloud/moon motion, smooth camera lerp.
- **SolarSystemDirectory:** standalone 3D planet showcase (own renderer/camera/scene, drag-to-rotate active body, ambient/directional/rim lights, star dust, per-body textures/rings/clouds). **Not currently imported by App** (export only); redesigned for structure/cleanup as associated component.
- **PlanetTelemetryDrawer:** UI panel consuming `CelestialBody` and `getPlanetEcosystem`; no WebGL.
- **proceduralPlanets.ts:** in-memory Canvas → `THREE.CanvasTexture` generation with module-level cache (avoids per-render regeneration). Earth day/cloud, Saturn rings, Jupiter/Mars/Sun/generic bodies.
- **celestialBodies.ts / planetEcosystems.ts:** real NASA-derived physical constants/missions/atmosphere/ring metadata and ecosystem↔tab mapping (`tab`, titles, availability, button classes). Data source is static in-repo; no backend/API dependency for telemetry.

## Shaders / materials / textures
- No custom GLSL shaders; `MeshBasicMaterial` (Sun), `MeshStandardMaterial` (planets/clouds/rings) with procedural texture maps. Ring textures use radial UVs; clouds additive/transparent where applicable.
- Textures are procedural canvases cached globally; materials reference cached maps.

## Camera & controls
- UniverseEngine: initial overview pose, focus transition to selected body/world position with offset by display radius, drag orbit (spherical delta around target) and wheel zoom (clamped), overview/reset, orbit toggle, pause and sim speed (1/5/25x).
- SolarSystemDirectory: fixed camera, drag rotates active mesh/cloud.

## Animation loop & lifecycle
- UniverseEngine: `requestAnimationFrame` loop; cleanup cancels RAF, removes window resize/pointer/mouse/wheel listeners, removes canvas DOM node, disposes renderer. **Pre-P5 issue:** effect depended on pause/speed causing full scene recreation and did not dispose geometries/materials/starfield/orbit resources (GPU leak risk on unmount/recreate). **P5 change:** decouple simulation state to refs to avoid scene rebuild on control toggles; dispose scene geometries/materials/lines/points on teardown while preserving module-cached textures; keep renderer disposal and listener removal complete.
- SolarSystemDirectory: RAF loop; cleanup cancels RAF, removes resize listener, disposes renderer/geometry. **P5 change:** expand disposal to all created geometries/materials (planet/cloud/rings/stars) and DOM/canvas handling to prevent leaks across planet switches/unmount.

## Device/perf considerations
- DPR capped (`min(devicePixelRatio, 2)`), bounded star count/segment counts, no postprocessing. WebGL constructor guarded with fallback UI. Drag/wheel/RAF are main-thread; no ResizeObserver (window resize used). Mobile HUD/controls/drawer must respect safe areas and avoid occluding interaction.
- Texture load failures: procedural generation (no external texture URLs) eliminates network 404 risk for core bodies/rings.

## Routing & space mapping
- `UniverseEngineProps`: `onSwitchToEarthWorld`, `onEnterEcosystem`, optional `initialPlanetId`. Ecosystem entry delegated to `getPlanetEcosystem` (preserved). Planet names exist in data but functional navigation must be labeled by space purpose/ecosystem, not planet-name-only.

## Risk controls for P5
- Preserve real 3D engine, procedural textures, orbits/rings/clouds/moon, raycast focus, controls, simulation, WebGL fallback, data/mapping/API contracts. No fake telemetry or non-existent entries. No backend/auth/user/infra changes.
- Verify lint/build and static review of lifecycle; **browser WebGL runtime/manual device validation cannot be automated in this environment** (no Playwright/Chromium available) — must be reported as unresolved pending real-browser verification.
