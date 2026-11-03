# EARTH ONE - UNIVERSE ENGINE ARCHITECTURE

> **"ONE EARTH. ONE UNIVERSE. ONE HUMANITY."**
> 从一颗地球，走向整个宇宙。

---

## 1. Architectural Philosophy & Purpose

The **EARTH ONE Universe Engine** expands the spatial scope of the platform from a terrestrial digital twin to a continuous, multi-scale cosmic visualization system. 

The architecture is founded on three core spatial layers:
1. **The Human Layer (0 - 100 km)**: Citizen beacons, city nodes, social feeds, instant translated conversations, cultural events.
2. **The Planetary Layer (100 - 100,000 km)**: Photorealistic photogrammetry-grade planetary bodies (NASA Blue Marble/Black Marble-inspired Earth with specular oceans, day/night city lights, Rayleigh scattering atmosphere, and cloud spheres).
3. **The Interplanetary System (0.1 - 40 AU)**: The Solar System with Keplerian elliptical orbits, axial inclinations, real astronomical telemetry, dynamic time warping, and smooth continuous camera transitions between deep space and human spaces.

---

## 2. Decoupled Modular Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   EARTH ONE UNIVERSE ENGINE CORE                       │
│                                                                        │
│   ┌─────────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│   │   Celestial Body    │  │ Planet Texture  │  │   Ephemeris &    │   │
│   │      Registry       │  │ Synthesis Engine│  │ Orbital Dynamics │   │
│   │ (celestialBodies.ts)│  │ (procedural.ts) │  │  (Kepler Loops)  │   │
│   └──────────┬──────────┘  └────────┬────────┘  └────────┬─────────┘   │
│              │                      │                    │             │
│              ▼                      ▼                    ▼             │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │               Universal Three.js Scene Director                │   │
│   │    - ACESFilmicToneMapping & PBR Surface Reflections           │   │
│   │    - Central Sun Point & Directional Solar Rays                │   │
│   │    - Day/Night Terminator Blending & Rayleigh Atmospheric Haze │   │
│   │    - Multi-scale LOD (Cosmic Orbit vs Planetary Proximity)     │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                   │
│         ┌──────────────────────────┴─────────────────────────┐         │
│         ▼                                                    ▼         │
│ ┌───────────────────────────────┐            ┌───────────────────────┐ │
│ │  EARTH WORLD SOCIAL SUBSYSTEM │            │  CELESTIAL EXPLORER   │ │
│ │  - Public Citizen 3D Beacons  │            │  - 8 Planets + Moon   │ │
│ │  - Lat/Lng Coordinate Mesh    │            │  - Saturn Ring System │ │
│ │  - Intercontinental Data Arcs │            │  - Heliocentric Orbits│ │
│ │  - Direct Message & Profiles  │            │  - Planetary Telemetry│ │
│ └───────────────────────────────┘            └───────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Visual Exploration Scale vs Scientific Precision

A known challenge in astrophysics visualization is the vast disparity between planetary radii and interplanetary distances:
- If Earth is radius $1$, the Sun has radius $109$, and Neptune orbits at over $47,000$ Earth radii away.
- In pure $1:1$ scale, all planets become invisible sub-pixel specks when viewing the solar system.

To solve this rigorously without deceptive claims, the Universe Engine provides two coordinated modes:
- **Visual Exploration Scale**: Proportional logarithmic scaling with authentic relative ordering, orbital inclinations, and texture fidelity so users can navigate and inspect every planet intuitively.
- **Scientific Telemetry System**: Displays 100% authentic physical metrics (exact radius in km, mass in kg, orbital eccentricity, semi-major axis in AU, surface gravity, escape velocity, and atmospheric composition).

---

## 4. Continuity with EARTH ONE Social Infrastructure

When a user selects Earth:
- The camera executes an exponential damping descent from interplanetary space into high orbit.
- The cloud layer, atmospheric Rayleigh scatter, and continental terrain smoothly reveal.
- The verified citizen light beacons and active country hubs emerge without page reloads or state tearing.
- The user can click a light beacon in Amman, Beijing, or San Francisco and transition immediately into personal dialogue.
