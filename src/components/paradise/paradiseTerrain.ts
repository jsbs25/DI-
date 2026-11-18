import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';

// Deterministic smooth noise helpers for natural valley topography
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2(x: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * (noise2(x * freq, z * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.48;
  }
  return v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Winding stream & river path:
 * Starts at waterfall plunge pool (-19, -20) -> meanders toward lake center (5, -2) -> exits (+38, +14)
 */
export function streamDistanceAndFlow(x: number, z: number): { dist: number; width: number; isPlungePool: boolean } {
  // Primary stream segment parameterized along t in [0, 1] from (-20, -21) -> (4, -2)
  const ax = -20;
  const az = -21;
  const bx = 5;
  const bz = -2;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const proj = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  // Subtle natural meander perpendicular to flow
  const meander = Math.sin(proj * Math.PI * 2.2) * 2.1;
  const cx = ax + dx * proj - dz * (meander / Math.sqrt(len2));
  const cz = az + dz * proj + dx * (meander / Math.sqrt(len2));
  const distStream = Math.hypot(x - cx, z - cz);

  // Plunge pool right below waterfall cliff at (-19.5, -20.5)
  const distPool = Math.hypot(x - (-19.5), z - (-20.5));
  const isPlungePool = distPool < 4.5;

  // Outlet creek flowing softly from lake east edge (14, -1) -> (54, 15)
  const ox = 13;
  const oz = -1;
  const ex = 56;
  const ez = 15;
  const odx = ex - ox;
  const odz = ez - oz;
  const olen2 = odx * odx + odz * odz;
  const oproj = Math.max(0, Math.min(1, ((x - ox) * odx + (z - oz) * odz) / olen2));
  const oMeander = Math.sin(oproj * Math.PI * 2.5) * 2.4;
  const ocx = ox + odx * oproj - odz * (oMeander / Math.sqrt(olen2));
  const ocz = oz + odz * oproj + odx * (oMeander / Math.sqrt(olen2));
  const distOutlet = Math.hypot(x - ocx, z - ocz);

  const width = distPool < 5.0 ? 4.2 : 2.35;
  return {
    dist: Math.min(distStream, distPool * 0.72, distOutlet),
    width,
    isPlungePool,
  };
}

/**
 * Lake signed distance (negative inside lake)
 * Elliptical organic basin around (5.5, -1.8)
 */
export function lakeSignedDist(x: number, z: number): number {
  const lx = (x - 5.5) / 10.8;
  const lz = (z + 1.8) / 7.2;
  const wobble = Math.sin(x * 0.28 + z * 0.21) * 0.11 + Math.cos(x * 0.17 - z * 0.31) * 0.08;
  return (Math.hypot(lx, lz) - 1.0 + wobble) * 8.2;
}

/**
 * Curved natural garden footpath from foreground meadow (1.5, 19) -> stream bridge (-6.8, -8.5) -> pavilion (12.8, -6.2)
 */
export function gardenPathFactor(x: number, z: number): number {
  // Segment 1: foreground meadow (0.5, 19) -> bridge south approach (-6.8, -5.2)
  const p0x = 0.5;
  const p0z = 19.0;
  const p1x = -7.8;
  const p1z = -4.0;
  const dx1 = p1x - p0x;
  const dz1 = p1z - p0z;
  const t1 = Math.max(0, Math.min(1, ((x - p0x) * dx1 + (z - p0z) * dz1) / (dx1 * dx1 + dz1 * dz1)));
  const sway1 = Math.sin(t1 * Math.PI) * 3.1;
  const d1 = Math.hypot(x - (p0x + dx1 * t1 + sway1), z - (p0z + dz1 * t1));

  // Segment 2: north side of bridge (-5.4, -12.6) -> pavilion terrace (12.8, -7.8)
  const p2x = -5.4;
  const p2z = -12.6;
  const p3x = 12.6;
  const p3z = -7.8;
  const dx2 = p3x - p2x;
  const dz2 = p3z - p2z;
  const t2 = Math.max(0, Math.min(1, ((x - p2x) * dx2 + (z - p2z) * dz2) / (dx2 * dx2 + dz2 * dz2)));
  const sway2 = Math.sin(t2 * Math.PI) * -1.4;
  const d2 = Math.hypot(x - (p2x + dx2 * t2), z - (p2z + dz2 * t2 + sway2));

  const d = Math.min(d1, d2);
  return 1 - smoothstep(0.65, 1.85, d);
}

export interface TerrainBiomeSample {
  height: number;
  waterDepth: number; // > 0 means below water y=0
  pathWeight: number;
  shoreWeight: number;
  rockWeight: number;
  meadowWeight: number;
}

export function sampleTerrainBiome(x: number, z: number): TerrainBiomeSample {
  const r = Math.hypot(x, z);

  // Base gentle garden rolling relief
  let h =
    0.58 +
    fbm2(x * 0.032 + 3.1, z * 0.032 - 1.7) * 1.15 +
    Math.sin(x * 0.075) * Math.cos(z * 0.065) * 0.35;

  // Gentle foreground flower terrace rise
  const fgMound = Math.exp(-Math.pow((x + 8.5) / 8.5, 2) - Math.pow((z - 11.5) / 7.5, 2)) * 1.45;
  const fgRightMound = Math.exp(-Math.pow((x - 13.5) / 9.5, 2) - Math.pow((z - 12.5) / 8.5, 2)) * 1.7;
  h += fgMound + fgRightMound;

  // Carve lake basin (water surface at y = 0.0)
  const lakeD = lakeSignedDist(x, z);
  const lakeCarve = 1 - smoothstep(-2.4, 2.6, lakeD);
  if (lakeCarve > 0) {
    const basinBottom = -1.35 + fbm2(x * 0.14, z * 0.14) * 0.18;
    h = THREE.MathUtils.lerp(h, basinBottom, lakeCarve);
  }

  // Flatten pavilion terrace cleanly around (12.8, -7.8) at y ~ 0.92 above lake shore
  const pavDist = Math.hypot(x - 12.8, z + 7.8);
  const pavFlat = 1 - smoothstep(2.6, 5.8, pavDist);
  h = THREE.MathUtils.lerp(h, 0.92, pavFlat);

  // Carve winding stream & plunge pool
  const stream = streamDistanceAndFlow(x, z);
  const streamCarve = 1 - smoothstep(stream.width * 0.48, stream.width * 1.48, stream.dist);
  if (streamCarve > 0) {
    const streamBottom = stream.isPlungePool ? -1.45 : -0.78;
    h = THREE.MathUtils.lerp(h, streamBottom, streamCarve);
  }

  // Waterfall granite cliff escarpment behind plunge pool (-22.5, -24.5)
  const cliffDx = (x + 23.0) / 8.5;
  const cliffDz = (z + 25.5) / 6.5;
  const cliffBlob = Math.exp(-(cliffDx * cliffDx + cliffDz * cliffDz));
  const cliffStep = cliffBlob * 11.5 * smoothstep(-20.0, -24.5, z);
  h += cliffStep;

  // Surrounding distant forest & valley hills (natural horizon enclosure, never cut off)
  const valleyRim = smoothstep(32, 86, r);
  if (valleyRim > 0) {
    const ridgeNoise = Math.abs(fbm2(x * 0.024 + 9.4, z * 0.024 + 4.2));
    // Keep front-right vista gentler so camera never gets trapped behind wall
    const frontWindow = 1 - 0.55 * smoothstep(10, 45, z);
    const mountainH = (6.5 + ridgeNoise * 16.5) * valleyRim * frontWindow;
    h += mountainH;
  }

  // Smooth garden footpath leveling
  const pathWeight = h > 0.12 ? gardenPathFactor(x, z) * (1 - lakeCarve) * (1 - streamCarve) : 0;
  if (pathWeight > 0) {
    h = THREE.MathUtils.lerp(h, Math.max(0.28, h * 0.94), pathWeight * 0.65);
  }

  const waterDepth = Math.max(0, -h);
  const shoreWeight = (1 - smoothstep(0.0, 1.45, Math.abs(h))) * smoothstep(-0.35, 0.25, h);
  const rockWeight = Math.min(1, smoothstep(4.2, 8.8, h) + cliffBlob * 0.9);
  const meadowWeight = Math.max(0, 1 - rockWeight - pathWeight - shoreWeight * 0.8) * smoothstep(0.08, 0.35, h);

  return {
    height: h,
    waterDepth,
    pathWeight,
    shoreWeight,
    rockWeight,
    meadowWeight,
  };
}

export function terrainHeightAt(x: number, z: number): number {
  return sampleTerrainBiome(x, z).height;
}

export interface ParadiseTerrainHandle {
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  waterfallMesh: THREE.Mesh;
  waterUniforms: Record<string, THREE.IUniform>;
  waterfallUniforms: Record<string, THREE.IUniform>;
  terrainUniforms: { uWetness: { value: number } };
  triggerWaterRipple: (worldX: number, worldZ: number, nowSec: number, strength?: number) => void;
  dispose: () => void;
}

export function createParadiseTerrain(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseTerrainHandle {
  const group = new THREE.Group();
  const segs = quality.terrainSegments;
  const terrainGeo = new THREE.PlaneGeometry(184, 184, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const cDeepBed = new THREE.Color(0x28363a);
  const cShoreSand = new THREE.Color(0x7c745c);
  const cMeadow = new THREE.Color(0x3a6133);
  const cMeadowRich = new THREE.Color(0x2c522c);
  const cPathStone = new THREE.Color(0x8c877a);
  const cCliffRock = new THREE.Color(0x52575e);
  const cFarMountain = new THREE.Color(0x2d4838);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const sample = sampleTerrainBiome(x, z);
    posAttr.setY(i, sample.height);

    const n = noise2(x * 0.18 + 7.2, z * 0.18 - 3.4);
    tmpColor.copy(cMeadow).lerp(cMeadowRich, n);

    if (sample.height < 0.04) {
      tmpColor.lerp(cDeepBed, smoothstep(0.04, -0.8, sample.height));
    }
    if (sample.shoreWeight > 0) {
      tmpColor.lerp(cShoreSand, sample.shoreWeight * 0.82);
    }
    if (sample.pathWeight > 0) {
      tmpColor.lerp(cPathStone, sample.pathWeight * 0.88);
    }
    if (sample.rockWeight > 0) {
      tmpColor.lerp(cCliffRock, sample.rockWeight * 0.88);
    }
    const rDist = Math.hypot(x, z);
    if (rDist > 38) {
      tmpColor.lerp(cFarMountain, smoothstep(38, 80, rDist) * 0.55);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainUniforms = {
    uWetness: { value: 0.0 },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.terrainDetail,
    roughness: 0.9,
    metalness: 0.03,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.fragmentShader =
      `uniform float uWetness;\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          // Wet soil and stone naturally darken and become subtly richer after rain
          diffuseColor.rgb *= mix(1.0, 0.68, uWetness * 0.82);
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.24, uWetness * 0.78);
          `
        );
  };
  terrainMat.customProgramCacheKey = () => 'paradise-terrain-wet-v1';

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = quality.enableShadows;
  terrainMesh.castShadow = false;
  group.add(terrainMesh);

  // -------------------------------------------------------------------------
  // Lake & Stream Water Surface (custom ShaderMaterial with Fresnel sky reflection,
  // flowing current, animated raindrops & interactive pointer ripples)
  // -------------------------------------------------------------------------
  const wSegs = quality.waterSegments;
  const waterGeo = new THREE.PlaneGeometry(118, 96, wSegs, wSegs);
  waterGeo.rotateX(-Math.PI / 2);

  const rippleCenters = [
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
  ];

  const waterUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, -0.7, 0.5).normalize() },
    uSkyHorizon: { value: new THREE.Color(0xbce0f7) },
    uSkyZenith: { value: new THREE.Color(0x3a7bc8) },
    uSunColor: { value: new THREE.Color(0xfff5de) },
    uFogColor: { value: new THREE.Color(0xbce0f7) },
    uFogDensity: { value: 0.0042 },
    uDayFactor: { value: 1.0 },
    uNightFactor: { value: 0.0 },
    uWindStrength: { value: 0.22 },
    uRainIntensity: { value: 0.0 },
    uRippleCenters: { value: rippleCenters },
  };

  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWindStrength;
      varying vec3 vWorldPos;
      varying float vWaveH;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float amp = 0.018 + uWindStrength * 0.032;
        float w = sin(wp.x * 0.72 + uTime * 1.45) * cos(wp.z * 0.65 - uTime * 1.1) * amp
                + sin(wp.x * 1.6 - wp.z * 1.3 + uTime * 2.1) * (amp * 0.45);
        wp.y += w;
        vWaveH = w;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyZenith;
      uniform vec3 uSunColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uDayFactor;
      uniform float uNightFactor;
      uniform float uWindStrength;
      uniform float uRainIntensity;
      uniform vec4 uRippleCenters[4];

      varying vec3 vWorldPos;
      varying float vWaveH;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.12);
        return fract(p.x * p.y);
      }

      float rainRingPattern(vec2 uv, float t, float rainAmt) {
        if (rainAmt < 0.02) return 0.0;
        vec2 grid = uv * 2.1;
        vec2 id = floor(grid);
        vec2 f = fract(grid) - 0.5;
        float acc = 0.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 cell = id + vec2(float(i), float(j));
            float h = hash21(cell);
            if (h < (1.0 - rainAmt * 0.85)) continue;
            vec2 offset = (vec2(h, fract(h * 19.7)) - 0.5) * 0.65;
            float age = fract(t * (1.25 + fract(h * 7.3) * 0.6) + h * 11.0);
            float d = length((vec2(float(i), float(j)) + offset) - f);
            float radius = age * 0.52;
            float ring = smoothstep(0.045, 0.0, abs(d - radius)) * (1.0 - age);
            acc += ring;
          }
        }
        return clamp(acc * rainAmt, 0.0, 1.0);
      }

      void main() {
        vec2 p = vWorldPos.xz;
        float flowT = uTime * (0.65 + uWindStrength * 0.55);

        // Multi-directional micro-ripples for normal perturbation
        float nx = cos(p.x * 1.45 + flowT) * 0.065 + cos(p.x * 3.1 - p.y * 2.2 - flowT * 1.6) * 0.04;
        float nz = sin(p.y * 1.35 - flowT * 0.9) * 0.065 + sin(p.y * 2.9 + p.x * 1.8 + flowT * 1.4) * 0.04;

        // Interactive user touch/click concentric ripples
        float interactiveRing = 0.0;
        for (int k = 0; k < 4; k++) {
          vec4 rip = uRippleCenters[k];
          float age = uTime - rip.z;
          if (age > 0.0 && age < 4.5 && rip.w > 0.01) {
            float d = length(p - rip.xy);
            float radius = age * 3.8;
            float env = exp(-age * 0.95) * exp(-abs(d - radius) * 1.65) * rip.w;
            float wave = sin((d - radius) * 7.5);
            vec2 dir = (d > 0.001) ? (p - rip.xy) / d : vec2(0.0);
            nx += dir.x * wave * env * 0.35;
            nz += dir.y * wave * env * 0.35;
            interactiveRing += max(0.0, wave) * env * 0.45;
          }
        }

        // Raindrop impact rings
        float rainRings = rainRingPattern(p, uTime, uRainIntensity);
        nx += rainRings * 0.14 * sin(p.x * 12.0 + uTime * 8.0);
        nz += rainRings * 0.14 * cos(p.y * 12.0 + uTime * 8.0);

        vec3 N = normalize(vec3(nx * (1.0 + uWindStrength * 0.5), 1.0, nz * (1.0 + uWindStrength * 0.5)));
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 R = reflect(-V, N);

        float fresnel = pow(1.0 - max(dot(V, N), 0.0), 3.6);
        fresnel = clamp(0.16 + fresnel * 0.84, 0.0, 1.0);

        // Sky reflection tint
        float skyH = clamp(R.y, 0.0, 1.0);
        vec3 reflColor = mix(uSkyHorizon, uSkyZenith, pow(skyH, 0.65));

        // Deep clear garden water refraction body
        vec3 deepWater = mix(vec3(0.03, 0.08, 0.13), vec3(0.07, 0.25, 0.28), uDayFactor);
        vec3 baseWater = mix(deepWater, reflColor, fresnel * 0.86);

        // Crisp Sun specular path across ripples
        vec3 Lsun = normalize(uSunDir);
        if (Lsun.y > -0.02) {
          vec3 Hsun = normalize(Lsun + V);
          float specSun = pow(max(dot(N, Hsun), 0.0), 180.0) * smoothstep(-0.02, 0.14, Lsun.y);
          baseWater += uSunColor * specSun * 1.45 * (1.0 - uRainIntensity * 0.72);
        }

        // Shimmering Moon specular path at night
        vec3 Lmoon = normalize(uMoonDir);
        if (Lmoon.y > -0.02 && uNightFactor > 0.05) {
          vec3 Hmoon = normalize(Lmoon + V);
          float specMoon = pow(max(dot(N, Hmoon), 0.0), 140.0) * smoothstep(-0.02, 0.16, Lmoon.y);
          baseWater += vec3(0.76, 0.87, 1.0) * specMoon * uNightFactor * 1.15 * (1.0 - uRainIntensity * 0.65);
        }

        // Delicate foam highlights from rain & interactive ripples
        baseWater += vec3(0.85, 0.92, 0.98) * (rainRings * 0.22 + interactiveRing * 0.28);

        // Match scene FogExp2 seamlessly
        float distCam = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
        baseWater = mix(baseWater, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = mix(0.76, 0.94, fresnel);
        gl_FragColor = vec4(baseWater, alpha);
      }
    `,
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(10, 0.0, -3);
  waterMesh.renderOrder = 2;
  group.add(waterMesh);

  // -------------------------------------------------------------------------
  // Waterfall Cascade Sheet (curving down from cliff escarpment to plunge pool)
  // -------------------------------------------------------------------------
  const wfGeo = new THREE.CylinderGeometry(2.1, 2.75, 11.4, 24, 16, true, -0.52, 1.04);
  const wfPos = wfGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wfPos.count; i++) {
    const vy = wfPos.getY(i);
    // Curve waterfall forward gracefully toward the plunge pool as it descends
    const fallT = 1 - (vy + 5.7) / 11.4; // 0 top .. 1 bottom
    wfPos.setZ(i, wfPos.getZ(i) + Math.pow(fallT, 1.35) * 2.3);
  }
  wfGeo.computeVertexNormals();

  const waterfallUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uDayFactor: { value: 1.0 },
    uSkyHorizon: { value: new THREE.Color(0xbce0f7) },
    uRainIntensity: { value: 0.0 },
    uFogColor: { value: new THREE.Color(0xbce0f7) },
    uFogDensity: { value: 0.0042 },
  };

  const wfMat = new THREE.ShaderMaterial({
    uniforms: waterfallUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDayFactor;
      uniform vec3 uSkyHorizon;
      uniform float uRainIntensity;
      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        float speed = 1.65 + uRainIntensity * 0.75;
        vec2 uv1 = vec2(vUv.x * 6.5, vUv.y * 3.5 + uTime * speed);
        vec2 uv2 = vec2(vUv.x * 13.0 + 0.5, vUv.y * 6.0 + uTime * speed * 1.45);
        float streak1 = noise(uv1);
        float streak2 = noise(uv2);
        float foam = smoothstep(0.42, 0.85, streak1 * 0.65 + streak2 * 0.35);

        // Extra spray foam near top crest & bottom plunge pool
        float bottomSpray = smoothstep(0.28, 0.0, vUv.y);
        float topCrest = smoothstep(0.84, 1.0, vUv.y);
        float edgeFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);

        vec3 waterBase = mix(vec3(0.14, 0.22, 0.32), mix(vec3(0.46, 0.68, 0.78), uSkyHorizon, 0.35), uDayFactor);
        vec3 foamColor = mix(vec3(0.45, 0.54, 0.68), vec3(0.95, 0.98, 1.0), uDayFactor);
        vec3 col = mix(waterBase, foamColor, clamp(foam * 0.82 + bottomSpray * 0.6 + topCrest * 0.45, 0.0, 1.0));

        float distCam = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = (0.48 + foam * 0.38 + bottomSpray * 0.2) * edgeFade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
      }
    `,
  });

  const waterfallMesh = new THREE.Mesh(wfGeo, wfMat);
  waterfallMesh.position.set(-20.4, 4.9, -22.5);
  waterfallMesh.rotation.y = 0.64;
  waterfallMesh.renderOrder = 3;
  group.add(waterfallMesh);

  let rippleSlot = 0;
  const triggerWaterRipple = (worldX: number, worldZ: number, nowSec: number, strength = 1.0) => {
    rippleCenters[rippleSlot].set(worldX, worldZ, nowSec, strength);
    rippleSlot = (rippleSlot + 1) % rippleCenters.length;
  };

  return {
    group,
    terrainMesh,
    waterMesh,
    waterfallMesh,
    waterUniforms,
    waterfallUniforms,
    terrainUniforms,
    triggerWaterRipple,
    dispose: () => {
      terrainGeo.dispose();
      terrainMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      wfGeo.dispose();
      wfMat.dispose();
    },
  };
}
