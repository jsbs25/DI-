# PLANET RENDERING SYSTEM SPECIFICATION

## 1. Earth Photorealistic Multi-Layer Rendering

### Layer 1: Terrestrial Surface (Albedo + Roughness + Night Lights)
- **Daylight Hemisphere**: Modeled after NASA Blue Marble satellite scans. High-fidelity oceanic bathymetry, continental shelf transitions, lush vegetation biomes, Sahara/Arabian/Gobi desert belts, Andean and Himalayan cordilleras, and polar ice sheets.
- **Water Specular Mask**: Oceans possess high specular reflectivity and low roughness (`0.15`), producing sun glints. Landmasses have matte roughness (`0.75 - 0.9`).
- **Night-Side Hemisphere**: Modeled after NASA Black Marble night imagery. Urban constellations glow with realistic amber-cyan radiance along coastlines, rivers, and transportation arteries.
- **Terminator Blending**: Sun directional vector determines day/night illumination across spherical vertices.

### Layer 2: Cloud Atmosphere Sphere ($R \times 1.018$)
- Procedural cyclonic vortices and tropical convergence zones.
- Additive blending with independent axial rotation rate ($\omega_{\text{cloud}} = 1.15 \times \omega_{\text{surface}}$).
- Casts soft ambient occlusion onto the ground layer.

### Layer 3: Rayleigh Scattering Limb Glow ($R \times 1.055$)
- Custom GLSL Fresnel rim shader:
  $$\text{Intensity} = \left(0.65 - \vec{v}_{\text{normal}} \cdot \vec{v}_{\text{view}}\right)^{2.8} \times 1.6$$
- Produces the signature iridescent blue atmospheric rim visible from orbit.

---

## 2. Gas Giant & Ring System Specifications (Saturn & Jupiter)

### Saturn Ring System
- Modeled directly on **Cassini-Huygens mission telemetry** (referenced in `/public/assets/aistudio/image_4845819a.png`):
  - Inner Ring C: Faint, semi-translucent ($1.23 - 1.53 \times R_{\text{Saturn}}$)
  - Dense Ring B: Highest opacity and optical depth ($1.53 - 1.95 \times R_{\text{Saturn}}$)
  - **Cassini Division**: Distinct gap ($1.95 - 2.02 \times R_{\text{Saturn}}$) with minimal particles
  - Outer Ring A: Medium opacity with fine concentric density waves ($2.02 - 2.27 \times R_{\text{Saturn}}$)
- Ring geometry: Flat `RingGeometry` tilted at Saturn's axial inclination of $26.73^\circ$.
- Dual-side alpha mapping with procedural particle density gradients.

### Jupiter Convective Belts
- Counter-rotating zonal jet streams (dark brown belts vs light ammonia-ice zones).
- Great Red Spot anticyclonic vortex rendered at $22^\circ$ South latitude.

---

## 3. Solar Corona & Stellar Source

- **Sun Surface**: High temperature emissive mesh with convective granular turbulence.
- **Solar Flare & Corona**: Additive radial glow layers and directional omni-spectral lighting casting authentic shadows throughout the planetary system.
