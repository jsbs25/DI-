import * as THREE from 'three';

/**
 * Procedural seamless water caustic / ripple texture generated on 2D Canvas.
 */
export function createCausticPatternTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#041423';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const w1 = Math.sin(u * 3 + Math.cos(v * 2)) + Math.cos(v * 3 - Math.sin(u * 2));
        const w2 = Math.sin(u * 5 - v * 4 + 1.2) + Math.cos(u * 4 + v * 5);
        const ridge = Math.pow(Math.max(0, 1 - Math.abs(w1 * 0.5 + w2 * 0.25) * 0.55), 3.2);
        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, Math.round(ridge * 165));
        d[idx + 1] = Math.min(255, Math.round(ridge * 235));
        d[idx + 2] = Math.min(255, Math.round(ridge * 255));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial glowing circle sprite texture for underwater bubbles & marine snow.
 */
export function createBubbleSpriteTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;
    const r = size * 0.45;

    // Outer translucent ring
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(185, 240, 255, 0.08)');
    grad.addColorStop(0.62, 'rgba(130, 220, 255, 0.22)');
    grad.addColorStop(0.86, 'rgba(215, 248, 255, 0.72)');
    grad.addColorStop(1.0, 'rgba(215, 248, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular glint top-left
    const spec = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.34, 1, cx - r * 0.34, cy - r * 0.34, r * 0.28);
    spec.addColorStop(0, 'rgba(255,255,255,0.95)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.34, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createMarineSnowTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, 'rgba(220, 248, 255, 0.92)');
    grad.addColorStop(0.45, 'rgba(140, 215, 245, 0.36)');
    grad.addColorStop(1, 'rgba(140, 215, 245, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Beer-Lambert spectral underwater water dome with animated Snell's window & surface wave glow.
 */
export function createOceanDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color('#0c698c') },
      uMidColor: { value: new THREE.Color('#052c4a') },
      uAbyssColor: { value: new THREE.Color('#020e1c') },
      uSunColor: { value: new THREE.Color('#7ee8ff') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallowColor;
      uniform vec3 uMidColor;
      uniform vec3 uAbyssColor;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;

      float waveRipple(vec2 p, float t) {
        float a = sin(p.x * 4.2 + t * 0.85) * cos(p.y * 3.8 - t * 0.65);
        float b = sin(p.x * 8.5 - p.y * 6.3 + t * 1.25) * 0.5;
        return a + b;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = clamp(dir.y, -1.0, 1.0);

        // Vertical Beer-Lambert ocean depth stratification
        float midMix = smoothstep(-0.45, 0.25, y);
        float topMix = smoothstep(0.10, 0.92, y);
        vec3 col = mix(uAbyssColor, uMidColor, midMix);
        col = mix(col, uShallowColor, topMix);

        // Overhead Snell's window shimmer & surface wave refraction
        if (y > 0.05) {
          vec2 surfUv = dir.xz / max(0.22, y + 0.18);
          float rip = waveRipple(surfUv * 0.9, uTime);
          float snell = smoothstep(0.24, 0.95, y + rip * 0.035);
          float causticShimmer = pow(max(0.0, 0.5 + 0.5 * rip), 3.0);
          col += uSunColor * snell * (0.28 + 0.22 * causticShimmer);
        }

        // Subtle midwater directional scatter band
        float scatter = exp(-abs(y - 0.05) * 5.0) * (0.5 + 0.5 * sin(dir.x * 3.0 + uTime * 0.25));
        col += vec3(0.02, 0.12, 0.19) * scatter;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Volumetric sunbeam shafts penetrating from ocean surface into midwater.
 */
export function createGodRaysGroup(rayCount = 14): {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const materials: THREE.ShaderMaterial[] = [];
  const meshes: THREE.Mesh[] = [];

  const coneGeo = new THREE.CylinderGeometry(1.4, 7.2, 54, 24, 1, true);
  coneGeo.translate(0, -27, 0);

  for (let i = 0; i < rayCount; i++) {
    const seed = i * 1.6180339;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uOpacity: { value: 0.075 + (i % 3) * 0.025 },
        uColor: { value: new THREE.Color('#80e8ff') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSeed;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDir;

        void main() {
          // Soft edge fade when looking tangentially so cone edges never look polygonal
          float edge = pow(abs(dot(vNormalView, vViewDir)), 1.75);
          // Vertical Beer-Lambert falloff from surface down toward seafloor
          float vert = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          // Animated surface wave shimmer traveling along beam
          float shimmer = 0.62 + 0.38 * sin(vUv.x * 18.8495 + uTime * 0.9 + uSeed * 4.0)
                        * cos(vUv.y * 5.0 - uTime * 0.45 + uSeed);
          float alpha = edge * vert * shimmer * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(coneGeo, mat);
    const angle = (i / rayCount) * Math.PI * 2 + (i % 2) * 0.23;
    const radius = 6 + (i % 4) * 9.5;
    mesh.position.set(Math.cos(angle) * radius, 26, Math.sin(angle) * radius - 14);
    mesh.rotation.z = -0.14 + Math.sin(seed) * 0.07;
    mesh.rotation.x = 0.08 + Math.cos(seed) * 0.05;
    mesh.userData = { baseX: mesh.position.x, baseRotZ: mesh.rotation.z, seed };
    group.add(mesh);
    materials.push(mat);
    meshes.push(mesh);
  }

  return {
    group,
    update: (elapsed: number) => {
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const { baseX, baseRotZ, seed } = m.userData;
        m.position.x = baseX + Math.sin(elapsed * 0.25 + seed) * 1.4;
        m.rotation.z = baseRotZ + Math.sin(elapsed * 0.32 + seed) * 0.03;
        materials[i].uniforms.uTime.value = elapsed;
      }
    },
    dispose: () => {
      coneGeo.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/**
 * Post-processing shader pass combining:
 * 1. Subtle continuous underwater refraction & lens depth vignette
 * 2. Dramatic 5-stage Glass Shatter / Voronoi Fractures / Shockwave / Chromatic Dispersion
 *    when a marine creature slams into the camera glass!
 */
export const OceanPostShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1.77 },
    uMotionScale: { value: 1.0 },
    uImpactCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uImpactTime: { value: -1.0 }, // < 0 inactive; >= 0 elapsed seconds since impact
    uImpactStrength: { value: 0.0 },
    uCrackSeed: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uMotionScale;
    uniform vec2 uImpactCenter;
    uniform float uImpactTime;
    uniform float uImpactStrength;
    uniform float uCrackSeed;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    // Returns (edgeDistance, cellIdHash) for crisp glass shard Voronoi cracks
    vec2 voronoiCracks(vec2 p) {
      vec2 n = floor(p);
      vec2 f = fract(p);
      float d1 = 8.0;
      float d2 = 8.0;
      vec2 bestCell = vec2(0.0);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(n + g + uCrackSeed * 7.13);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            bestCell = n + g;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      float edgeDist = sqrt(d2) - sqrt(d1);
      return vec2(edgeDist, hash12(bestCell));
    }

    void main() {
      vec2 uv = vUv;

      // Subtle continuous underwater micro-refraction
      float swimWobble = 0.0014 * uMotionScale;
      uv.x += sin(uv.y * 9.0 + uTime * 1.1) * swimWobble;
      uv.y += cos(uv.x * 7.5 + uTime * 0.85) * swimWobble * 0.8;

      float crackGlow = 0.0;
      float chroma = 0.0009 * uMotionScale;
      float impactFlash = 0.0;

      if (uImpactTime >= 0.0 && uImpactStrength > 0.001) {
        vec2 delta = vUv - uImpactCenter;
        delta.x *= uAspect;
        float dist = length(delta);
        float angle = atan(delta.y, delta.x);

        // Overall crack visibility envelope: instant slam -> brief hold -> smooth heal
        float appear = smoothstep(0.0, 0.08, uImpactTime);
        float heal = 1.0 - smoothstep(1.35, 2.85, uImpactTime);
        float env = appear * heal * uImpactStrength;

        // 1. Expanding underwater shockwave ring
        float waveR = uImpactTime * 1.45;
        float waveRing = exp(-pow((dist - waveR) * 14.0, 2.0)) * (1.0 - smoothstep(0.15, 0.85, uImpactTime));
        vec2 dirNorm = dist > 0.0001 ? normalize(delta) : vec2(0.0);
        uv -= dirNorm * waveRing * 0.032 * uImpactStrength;

        // 2. Radial glass fracture spokes + concentric stress rings
        float spreadRadius = min(0.85, 0.12 + uImpactTime * 3.8);
        float insideFracture = 1.0 - smoothstep(spreadRadius * 0.65, spreadRadius, dist);

        // Jagged radial spokes in polar coordinates warped with Voronoi shards
        float spokePhase = angle * 6.5 + sin(dist * 18.0 + uCrackSeed * 5.0) * 0.35;
        float spokeWave = abs(sin(spokePhase * 2.0 + hash12(vec2(floor(angle * 4.0), uCrackSeed)) * 3.14));
        float spokeLine = 1.0 - smoothstep(0.0, 0.065 + 0.045 * max(0.0, 0.35 - dist), spokeWave);

        // Concentric fracture arcs
        float ringDist = abs(fract(dist * 7.5 - 0.15) - 0.5);
        float ringLine = (1.0 - smoothstep(0.0, 0.045, ringDist)) * smoothstep(0.03, 0.14, dist) * (1.0 - smoothstep(0.32, 0.65, dist));

        // 3. Voronoi faceted glass shards & angular UV tilt per shard
        vec2 polarWarp = vec2(log(max(0.035, dist)) * 3.4, angle * 3.2);
        vec2 vor = voronoiCracks(polarWarp * 2.2);
        float shardEdge = 1.0 - smoothstep(0.0, 0.055, vor.x);
        float shardSeed = vor.y;

        // Shattered shard UV offset / tilt refraction inside crack zone
        float shardStrength = insideFracture * env * smoothstep(0.68, 0.06, dist);
        vec2 shardOffset = (hash22(vec2(shardSeed * 19.3, uCrackSeed)) - 0.5) * 0.038 * shardStrength;
        uv += shardOffset;

        // Impact central star-crackle & glass edge highlight
        float centerStar = exp(-dist * 16.0) * env;
        crackGlow = clamp((shardEdge * 0.9 + spokeLine * 0.72 + ringLine * 0.65) * shardStrength + centerStar * 0.55, 0.0, 1.0);
        chroma += (0.008 * shardStrength + 0.006 * waveRing) * uImpactStrength;
        impactFlash = exp(-uImpactTime * 9.0) * 0.28 * uImpactStrength * (1.0 - smoothstep(0.0, 0.7, dist));
      }

      // Clamp UVs safely before sampling
      vec2 uvR = clamp(uv + vec2(chroma, chroma * 0.35), 0.001, 0.999);
      vec2 uvG = clamp(uv, 0.001, 0.999);
      vec2 uvB = clamp(uv - vec2(chroma, -chroma * 0.35), 0.001, 0.999);

      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, uvG).g;
      float b = texture2D(tDiffuse, uvB).b;
      vec3 col = vec3(r, g, b);

      // Specular frosty-cyan glass crack edge illumination
      vec3 crackTint = vec3(0.84, 0.97, 1.0);
      col = mix(col, crackTint, crackGlow * 0.85);
      col += vec3(0.45, 0.88, 1.0) * impactFlash;

      // Subtle deep-sea lens edge vignette
      float vigDist = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.42, 0.95, vigDist);
      col *= 1.0 - vig * 0.24;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
