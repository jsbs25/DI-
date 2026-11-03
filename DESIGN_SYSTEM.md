# EARTH ONE DESIGN SYSTEM & UI/UX SPECIFICATIONS

## 1. Aesthetic Ethos: Deep Cosmos Elegance

Inspired by Apple's minimalist hardware-software harmony, macOS window transparency, and high-precision orbital cartography, EARTH ONE rejects garish neon clutter in favor of celestial restraint:

### Color Palette
- **Cosmic Abyss**: `#030712` (Primary background, deep space black)
- **Nebula Slate**: `#0f172a` (Surface cards, header, and modular containers)
- **Starlight Cyan**: `#06b6d4` / `#38bdf8` (Primary interactive accents, active beacons, glowing arcs)
- **Orbital Emerald**: `#10b981` (Online status, voluntary tipping, verified credentials)
- **Solar Amber**: `#f59e0b` (Praise, trophies, and cultural distinctions)
- **Border Gradients**: `rgba(51, 65, 85, 0.7)` with translucent glassmorphic blur

### Typography
- **Headings & Brand**: `Cinzel`, Serif, tracking-wide uppercase
- **Body & Controls**: `Plus Jakarta Sans`, sans-serif, high legibility
- **Arabic Script**: `Tajawal`, native typography with bidirectional RTL rendering
- **Telemetry & Metrics**: Monospace (`font-mono`) for coordinates, timestamps, and node counts

### Zero Viewport Occlusion HUD Discipline
As mandated by modern 3D UI guidelines:
- Center 3D viewport remains 100% unobstructed.
- All controls are grouped into a sleek, collapsible bottom dock (`bottom: 20px; left: 50%; -translate-x-1/2`).
- No floating cards on mid-left or mid-right flanks that obscure the Earth.
- Zen mode toggle allows clean full-screen exploration.
