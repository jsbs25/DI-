import * as THREE from 'three';

/**
 * Procedural seamless multi-frequency underwater caustics texture.
 */
export function createCausticPatternTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const w1 = Math.sin(u * 3 + Math.cos(v * 2.0)) + Math.cos(v * 3.0 - Math.sin(u * 2.0));
        const w2 = Math.sin(u * 5.0 - v * 4.0 + 1.2) + Math.cos(u * 4.0 + v * 5.0);
        const w3 = Math.sin(u * 7.0 + v * 6.0 - 0.7) * 0.45;
        const ridge = Math.pow(Math.max(0, 1 - Math.abs(w1 * 0.42 + w2 * 0.28 + w3 * 0.16) * 0.62), 3.6);
        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, Math.round(ridge * 155));
        d[idx + 1] = Math.min(255, Math.round(ridge * 228));
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
 * Soft realistic water-bubble sprite with thin rim refraction highlight.
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
    const r = size * 0.44;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(170, 232, 250, 0.04)');
    grad.addColorStop(0.68, 'rgba(130, 212, 238, 0.16)');
    grad.addColorStop(0.90, 'rgba(215, 248, 255, 0.68)');
    grad.addColorStop(1.0, 'rgba(215, 248, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const spec = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.34, 0.5, cx - r * 0.34, cy - r * 0.34, r * 0.24);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.34, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Organic pelagic marine snow / suspended detritus mote sprite.
 */
export function createMarineSnowTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, 'rgba(210, 242, 252, 0.86)');
    grad.addColorStop(0.4, 'rgba(128, 198, 224, 0.28)');
    grad.addColorStop(1, 'rgba(128, 198, 224, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Pelagic Beer-Lambert underwater background dome with realistic vertical absorption
 * and overhead solar backscatter gradient.
 */
export function createOceanDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color('#0c5472') },
      uMidColor: { value: new THREE.Color('#032238') },
      uAbyssColor: { value: new THREE.Color('#010b15') },
      uSunDir: { value: new THREE.Vector3(0.28, 0.92, 0.25).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallowColor;
      uniform vec3 uMidColor;
      uniform vec3 uAbyssColor;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = clamp(dir.y, -1.0, 1.0);

        // Spectral Beer-Lambert depth stratification
        float midMix = smoothstep(-0.55, 0.18, y);
        float topMix = smoothstep(0.06, 0.88, y);
        vec3 col = mix(uAbyssColor, uMidColor, midMix);
        col = mix(col, uShallowColor, topMix);

        // Mie forward scattering solar halo in upper ocean column
        float sunCos = max(0.0, dot(dir, normalize(uSunDir)));
        float halo = pow(sunCos, 6.0) * smoothstep(-0.05, 0.55, y);
        col += vec3(0.22, 0.58, 0.72) * halo * 0.55;

        // Subtle distant water column current shimmer
        float ripple = 0.5 + 0.5 * sin(dir.x * 4.5 + uTime * 0.22) * cos(dir.z * 3.8 - uTime * 0.18);
        col += vec3(0.01, 0.05, 0.08) * ripple * smoothstep(-0.2, 0.4, y);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Real animated 3D underwater ceiling surface mesh shader (looking up from beneath the waves):
 * Computes multi-wave Gerstner normals, Snell's Window aperture, and total internal reflection.
 */
export function createOceanSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.26, 0.92, 0.24).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;

      void main() {
        vec3 p = position;
        float w1 = sin(p.x * 0.18 + uTime * 1.15) * cos(p.z * 0.16 - uTime * 0.92) * 0.52;
        float w2 = sin(p.x * 0.42 - p.z * 0.34 + uTime * 1.65) * 0.24;
        float w3 = cos(p.x * 0.78 + p.z * 0.68 - uTime * 2.15) * 0.10;
        p.y += w1 + w2 + w3;

        float dx = 0.18 * cos(p.x * 0.18 + uTime * 1.15) * cos(p.z * 0.16 - uTime * 0.92) * 0.52
                 + 0.42 * cos(p.x * 0.42 - p.z * 0.34 + uTime * 1.65) * 0.24;
        float dz = -0.16 * sin(p.x * 0.18 + uTime * 1.15) * sin(p.z * 0.16 - uTime * 0.92) * 0.52
                 - 0.34 * cos(p.x * 0.42 - p.z * 0.34 + uTime * 1.65) * 0.24;

        vWaveNormal = normalize(vec3(-dx, -1.0, -dz));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;

      void main() {
        vec3 viewToSurf = normalize(vWorldPos - cameraPosition);
        vec3 n = normalize(vWaveNormal);

        // Micro ripple perturbation for crisp shimmering water facets
        float r1 = sin(vWorldPos.x * 1.45 + vWorldPos.z * 0.95 + uTime * 2.1);
        float r2 = cos(vWorldPos.x * 2.1 - vWorldPos.z * 1.75 - uTime * 1.7);
        n = normalize(n + vec3(r1 * 0.14, 0.0, r2 * 0.14));

        // Snell's critical angle ~48.6 deg (cos ~ 0.66) when looking up from underwater
        float cosTheta = abs(dot(-viewToSurf, n));
        float snellAperture = smoothstep(0.42, 0.86, cosTheta);

        // Refracted sun glint inside Snell's window + total internal reflection silver sheen outside
        float sunAlign = pow(max(0.0, dot(reflect(viewToSurf, n), -normalize(uSunDir))), 12.0);
        float causticCrest = pow(max(0.0, 0.5 + 0.5 * (r1 * r2)), 4.0);

        vec3 deepWaterRefl = vec3(0.03, 0.17, 0.27);
        vec3 windowSky = vec3(0.24, 0.68, 0.84) + vec3(0.55, 0.92, 1.0) * (sunAlign * 0.85 + causticCrest * 0.24);
        vec3 col = mix(deepWaterRefl, windowSky, snellAperture);

        // Distance radial fade into underwater fog
        float dist = length(vWorldPos.xz - cameraPosition.xz);
        float alpha = (1.0 - smoothstep(32.0, 92.0, dist)) * (0.48 + 0.42 * snellAperture);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Depth-aware Volumetric Light Scattering Shader (God Rays):
 * Uses Henyey-Greenstein forward scattering + dual-octave animated light shafts
 * + exponential Beer-Lambert depth attenuation to avoid flat polygonal cone look.
 */
export function createVolumetricGodRays(rayCount = 14): {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const materials: THREE.ShaderMaterial[] = [];
  const meshes: THREE.Mesh[] = [];

  const shaftGeo = new THREE.CylinderGeometry(1.1, 6.4, 52, 28, 8, true);
  shaftGeo.translate(0, -26, 0);

  const sunDir = new THREE.Vector3(0.26, 0.92, 0.24).normalize();

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
        uOpacity: { value: 0.048 + (i % 3) * 0.016 },
        uSunDir: { value: sunDir },
        uShallowTint: { value: new THREE.Color('#9af0ff') },
        uDeepTint: { value: new THREE.Color('#13658a') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vec4 mvPos = viewMatrix * wp;
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSeed;
        uniform float uOpacity;
        uniform vec3 uSunDir;
        uniform vec3 uShallowTint;
        uniform vec3 uDeepTint;

        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;

        void main() {
          // Soft Fresnel silhouette falloff so cone walls dissolve imperceptibly
          float fresnel = pow(abs(dot(vNormalView, vViewDir)), 2.25);

          // Water depth from surface ceiling (y = 24) downward
          float depth = clamp((24.0 - vWorldPos.y) / 40.0, 0.0, 1.0);
          float beerLambert = exp(-depth * 2.15);

          // Vertical soft entry/exit fade
          float vertMask = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.84, vUv.y);

          // Dual-octave moving wave streaks passing down from surface waves
          float s1 = 0.5 + 0.5 * sin(vUv.x * 18.8495 + uTime * 0.85 + uSeed * 5.0);
          float s2 = 0.5 + 0.5 * cos(vUv.x * 31.4159 - uTime * 1.15 + vUv.y * 4.5 + uSeed * 2.3);
          float streaks = pow(mix(s1, s2, 0.45), 1.85);

          // Subtle Henyey-Greenstein forward scattering toward overhead sun
          vec3 camToFrag = normalize(vWorldPos - cameraPosition);
          float forwardScatter = 0.65 + 0.55 * pow(max(0.0, dot(camToFrag, -normalize(uSunDir))), 3.0);

          // Depth spectral tint shift: crisp bright aqua near surface -> deep cobalt near seabed
          vec3 tint = mix(uShallowTint, uDeepTint, smoothstep(0.15, 0.92, depth));
          float alpha = fresnel * beerLambert * vertMask * (0.35 + 0.65 * streaks) * forwardScatter * uOpacity;
          gl_FragColor = vec4(tint, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(shaftGeo, mat);
    const angle = (i / rayCount) * Math.PI * 2 + (i % 2) * 0.27;
    const radius = 5 + (i % 4) * 9.0;
    mesh.position.set(Math.cos(angle) * radius, 25, Math.sin(angle) * radius - 14);
    mesh.rotation.z = -0.18 + Math.sin(seed) * 0.05;
    mesh.rotation.x = 0.11 + Math.cos(seed) * 0.04;
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
        m.position.x = baseX + Math.sin(elapsed * 0.22 + seed) * 1.25;
        m.rotation.z = baseRotZ + Math.sin(elapsed * 0.28 + seed) * 0.025;
        materials[i].uniforms.uTime.value = elapsed;
      }
    },
    dispose: () => {
      shaftGeo.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/**
 * Depth-Aware Underwater Light Refraction & Screen-Glass Impact Shatter Post Shader:
 * 1. Simulates dynamic underwater light refraction modulated by vertical water depth (shallow fast shimmer -> deep smooth current swell)
 * 2. Subtle Beer-Lambert deep-water color grading & lens optical dispersion
 * 3. Dramatic 5-stage Voronoi Glass Shatter / Fractures / Shockwave on close marine encounter
 */
export const OceanPostShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1.77 },
    uMotionScale: { value: 1.0 },
    uCameraDepth: { value: 0.45 }, // 0 shallow .. 1 deep
    uImpactCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uImpactTime: { value: -1.0 },
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
    uniform float uCameraDepth;
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
      return vec2(sqrt(d2) - sqrt(d1), hash12(bestCell));
    }

    void main() {
      vec2 uv = vUv;

      // Depth-based dynamic underwater light refraction:
      // Higher water column (vUv.y near top & shallower camera) exhibits brisk surface-wave refraction,
      // while deeper abyssal regions exhibit slower, broad current bending.
      float localDepth = clamp(uCameraDepth + (1.0 - vUv.y) * 0.48, 0.0, 1.0);
      float waveFreq = mix(11.5, 5.2, localDepth);
      float waveSpeed = mix(1.45, 0.72, localDepth);
      float amp = (0.0014 + 0.0008 * (1.0 - localDepth)) * uMotionScale;

      float refrX = sin(uv.y * waveFreq + uv.x * 3.1 + uTime * waveSpeed);
      float refrY = cos(uv.x * (waveFreq * 0.85) - uv.y * 2.4 + uTime * (waveSpeed * 0.82));
      uv.x += refrX * amp;
      uv.y += refrY * amp * 0.75;

      float crackGlow = 0.0;
      float chroma = mix(0.0009, 0.0005, localDepth) * uMotionScale;
      float impactFlash = 0.0;

      if (uImpactTime >= 0.0 && uImpactStrength > 0.001) {
        vec2 delta = vUv - uImpactCenter;
        delta.x *= uAspect;
        float dist = length(delta);
        float angle = atan(delta.y, delta.x);

        float appear = smoothstep(0.0, 0.07, uImpactTime);
        float heal = 1.0 - smoothstep(1.35, 2.85, uImpactTime);
        float env = appear * heal * uImpactStrength;

        // Expanding water pressure shockwave
        float waveR = uImpactTime * 1.5;
        float waveRing = exp(-pow((dist - waveR) * 14.0, 2.0)) * (1.0 - smoothstep(0.15, 0.85, uImpactTime));
        vec2 dirNorm = dist > 0.0001 ? normalize(delta) : vec2(0.0);
        uv -= dirNorm * waveRing * 0.032 * uImpactStrength;

        // Radial + concentric + Voronoi glass shard facets
        float spreadRadius = min(0.86, 0.14 + uImpactTime * 3.9);
        float insideFracture = 1.0 - smoothstep(spreadRadius * 0.65, spreadRadius, dist);

        float spokePhase = angle * 6.5 + sin(dist * 18.0 + uCrackSeed * 5.0) * 0.35;
        float spokeWave = abs(sin(spokePhase * 2.0 + hash12(vec2(floor(angle * 4.0), uCrackSeed)) * 3.14));
        float spokeLine = 1.0 - smoothstep(0.0, 0.062 + 0.042 * max(0.0, 0.35 - dist), spokeWave);

        float ringDist = abs(fract(dist * 7.5 - 0.15) - 0.5);
        float ringLine = (1.0 - smoothstep(0.0, 0.045, ringDist)) * smoothstep(0.03, 0.14, dist) * (1.0 - smoothstep(0.32, 0.65, dist));

        vec2 polarWarp = vec2(log(max(0.035, dist)) * 3.4, angle * 3.2);
        vec2 vor = voronoiCracks(polarWarp * 2.2);
        float shardEdge = 1.0 - smoothstep(0.0, 0.055, vor.x);
        float shardSeed = vor.y;

        float shardStrength = insideFracture * env * smoothstep(0.68, 0.06, dist);
        vec2 shardOffset = (hash22(vec2(shardSeed * 19.3, uCrackSeed)) - 0.5) * 0.038 * shardStrength;
        uv += shardOffset;

        float centerStar = exp(-dist * 16.0) * env;
        crackGlow = clamp((shardEdge * 0.9 + spokeLine * 0.72 + ringLine * 0.65) * shardStrength + centerStar * 0.55, 0.0, 1.0);
        chroma += (0.008 * shardStrength + 0.006 * waveRing) * uImpactStrength;
        impactFlash = exp(-uImpactTime * 9.0) * 0.25 * uImpactStrength * (1.0 - smoothstep(0.0, 0.7, dist));
      }

      vec2 uvR = clamp(uv + vec2(chroma, chroma * 0.32), 0.001, 0.999);
      vec2 uvG = clamp(uv, 0.001, 0.999);
      vec2 uvB = clamp(uv - vec2(chroma, -chroma * 0.32), 0.001, 0.999);

      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, uvG).g;
      float b = texture2D(tDiffuse, uvB).b;
      vec3 col = vec3(r, g, b);

      // Subtle Beer-Lambert underwater optical absorption with vertical depth
      col *= mix(vec3(1.0, 1.02, 1.03), vec3(0.84, 0.96, 1.04), localDepth * 0.45);

      // Frosted cyan glass fracture highlights
      col = mix(col, vec3(0.84, 0.97, 1.0), crackGlow * 0.85);
      col += vec3(0.45, 0.88, 1.0) * impactFlash;

      // Optical lens edge falloff
      float vigDist = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.42, 0.96, vigDist) * 0.24;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
