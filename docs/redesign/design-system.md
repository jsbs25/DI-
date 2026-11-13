# ONE Design System (Phase A foundation)

## Direction: Quiet Futurism
- Apple-like restraint and clarity
- Architectural proportion and spacing
- Cosmic depth (subtle, never noisy)
- Digital precision
- Eastern restraint / intentional whitespace

## Tokens (implemented in `src/index.css` @theme + CSS vars)
- Base: Deep Space `--one-bg`, Graphite `--one-surface`, Moonlight `--one-text`, Silver `--one-text-muted`
- Accent: Ice Blue `--one-accent` (interactive), Warm Gold `--one-gold` (rare emphasis)
- Borders/radii/shadows/motion/elevation/layout scales defined for incremental adoption
- Motion respects `prefers-reduced-motion`

## Typography
- Primary UI: Plus Jakarta Sans (Latin) with CJK/system fallbacks
- Arabic: Tajawal
- Mono/technical: JetBrains Mono
- Display/brand moments: restrained use, prioritize readability

## Component primitives (incremental)
- `src/components/ui/*` provides base Button/Surface/Badge/Input patterns for new/updated surfaces; legacy modules may adopt gradually without breaking existing behavior.

## Rules
- No cheap gradients/glass overload/cards-as-filler
- Preserve all existing functionality, APIs, data, auth, 3D/music/browser cores
- Real data only; honest empty/loading/error states
- Mobile-first responsive verification required per phase
