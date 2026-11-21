import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';

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

function ridgedFbm2(x: number, z: number): number {
  let v = 0;
  let amp = 0.52;
  let freq = 1;
  let weight = 1;
  for (let i = 0; i < 4; i++) {
    let signal = 1.0 - Math.abs(noise2(x * freq, z * freq) * 2 - 1);
    signal = signal * signal * weight;
    weight = Math.max(0.15, Math.min(1.0, signal * 1.6));
    v += signal * amp;
    freq *= 2.12;
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
 * Starts at waterfall plunge pool (-19.5, -20.5) -> meanders toward lake center (5, -2) -> exits east
 */
const STREAM_AX = -20;
const STREAM_AZ = -21;
const STREAM_BX = 5;
const STREAM_BZ = -2;
const STREAM_DX = STREAM_BX - STREAM_AX;
const STREAM_DZ = STREAM_BZ - STREAM_AZ;
const STREAM_LEN2 = STREAM_DX * STREAM_DX + STREAM_DZ * STREAM_DZ;
const STREAM_LEN = Math.sqrt(STREAM_LEN2);

/**
 * Evaluates the exact stream centerline point at normalized progress p in [0, 1]
 */
export function streamCenterAt(proj: number): { x: number; z: number } {
  const p = Math.max(0, Math.min(1, proj));
  const meander = Math.sin(p * Math.PI * 2.2) * 2.1;
  return {
    x: STREAM_AX + STREAM_DX * p - STREAM_DZ * (meander / STREAM_LEN),
    z: STREAM_AZ + STREAM_DZ * p + STREAM_DX * (meander / STREAM_LEN),
  };
}

/**
 * Exact bank-to-bank bridge geometry computed strictly perpendicular to the stream centerline,
 * anchoring both left & right abutments solidly into dry opposite riverbanks.
 */
const BRIDGE_PROJ = 0.56;
const BRIDGE_CENTER = streamCenterAt(BRIDGE_PROJ);
const BRIDGE_P_PREV = streamCenterAt(BRIDGE_PROJ - 0.004);
const BRIDGE_P_NEXT = streamCenterAt(BRIDGE_PROJ + 0.004);
const BRIDGE_TANGENT_LEN = Math.hypot(BRIDGE_P_NEXT.x - BRIDGE_P_PREV.x, BRIDGE_P_NEXT.z - BRIDGE_P_PREV.z) || 1;
const BRIDGE_TX = (BRIDGE_P_NEXT.x - BRIDGE_P_PREV.x) / BRIDGE_TANGENT_LEN;
const BRIDGE_TZ = (BRIDGE_P_NEXT.z - BRIDGE_P_PREV.z) / BRIDGE_TANGENT_LEN;
// Perpendicular axis pointing from foreground/SW bank (-span/2) across stream to pavilion/NE bank (+span/2)
const BRIDGE_AXIS_X = BRIDGE_TZ;
const BRIDGE_AXIS_Z = -BRIDGE_TX;
const BRIDGE_SPAN = 9.4;
const BRIDGE_BANK_DIST = 4.95;

export const BRIDGE_CONFIG = {
  centerX: BRIDGE_CENTER.x,
  centerZ: BRIDGE_CENTER.z,
  deckBaseY: 0.44,
  span: BRIDGE_SPAN,
  archRise: 1.02,
  axisX: BRIDGE_AXIS_X,
  axisZ: BRIDGE_AXIS_Z,
  // Maps local +Z axis to (axisX, 0, axisZ)
  rotY: Math.atan2(BRIDGE_AXIS_X, BRIDGE_AXIS_Z),
  // Left/SW foreground bank landing (connects from meadow path)
  bankAX: BRIDGE_CENTER.x - BRIDGE_AXIS_X * BRIDGE_BANK_DIST,
  bankAZ: BRIDGE_CENTER.z - BRIDGE_AXIS_Z * BRIDGE_BANK_DIST,
  // Right/NE pavilion bank landing (connects toward lakeside pavilion)
  bankBX: BRIDGE_CENTER.x + BRIDGE_AXIS_X * BRIDGE_BANK_DIST,
  bankBZ: BRIDGE_CENTER.z + BRIDGE_AXIS_Z * BRIDGE_BANK_DIST,
};

/**
 * Winding stream & river path:
 * Starts at waterfall plunge pool (-19.5, -20.5) -> meanders toward lake center (5, -2) -> exits east
 */
export function streamDistanceAndFlow(x: number, z: number): { dist: number; width: number; isPlungePool: boolean } {
  const proj = Math.max(0, Math.min(1, ((x - STREAM_AX) * STREAM_DX + (z - STREAM_AZ) * STREAM_DZ) / STREAM_LEN2));
  const meander = Math.sin(proj * Math.PI * 2.2) * 2.1;
  const cx = STREAM_AX + STREAM_DX * proj - STREAM_DZ * (meander / STREAM_LEN);
  const cz = STREAM_AZ + STREAM_DZ * proj + STREAM_DX * (meander / STREAM_LEN);
  const distStream = Math.hypot(x - cx, z - cz);

  const distPool = Math.hypot(x - -19.5, z - -20.5);
  const isPlungePool = distPool < 4.7;

  const ox = 8.8;
  const oz = -1.2;
  const ex = 62;
  const ez = 16;
  const odx = ex - ox;
  const odz = ez - oz;
  const olen2 = odx * odx + odz * odz;
  const oproj = Math.max(0, Math.min(1, ((x - ox) * odx + (z - oz) * odz) / olen2));
  const oMeander = Math.sin(oproj * Math.PI * 2.5) * 2.4;
  const ocx = ox + odx * oproj - odz * (oMeander / Math.sqrt(olen2));
  const ocz = oz + odz * oproj + odx * (oMeander / Math.sqrt(olen2));
  const distOutlet = Math.hypot(x - ocx, z - ocz);

  const width = distPool < 5.0 ? 4.35 : 2.35;
  return {
    dist: Math.min(distStream, distPool * 0.72, distOutlet),
    width,
    isPlungePool,
  };
}

/**
 * Returns real downstream surface water velocity (m/s) at (x, z) so fallen sakura petals
 * glide naturally along the stream under the bridge and gently circulate across the lake.
 */
export function streamVelocityAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
  const proj = Math.max(0, Math.min(1, ((x - STREAM_AX) * STREAM_DX + (z - STREAM_AZ) * STREAM_DZ) / STREAM_LEN2));
  const c0 = streamCenterAt(Math.max(0, proj - 0.01));
  const c1 = streamCenterAt(Math.min(1, proj + 0.01));
  const tx = c1.x - c0.x;
  const tz = c1.z - c0.z;
  const tLen = Math.hypot(tx, tz) || 1;
  const cur = streamCenterAt(proj);
  const dStream = Math.hypot(x - cur.x, z - cur.z);

  if (dStream < 4.2 && proj < 0.96) {
    // Pull gently toward channel center while gliding downstream
    const speed = 0.62 + (1 - Math.min(1, dStream / 4.2)) * 0.34;
    const pullX = (cur.x - x) * 0.14;
    const pullZ = (cur.z - z) * 0.14;
    return out.set((tx / tLen) * speed + pullX, (tz / tLen) * speed + pullZ);
  }

  // Inside the lake: slow poetic clockwise eddy + gentle drift toward eastern outlet
  const lx = x - 1.2;
  const lz = z + 1.6;
  const lr = Math.hypot(lx, lz) || 1;
  if (lr < 11.5) {
    const swirlX = (-lz / lr) * 0.16 + 0.14;
    const swirlZ = (lx / lr) * 0.12 + 0.04;
    return out.set(swirlX, swirlZ);
  }

  // Eastern outlet stream
  return out.set(0.45, 0.16);
}

/**
 * Lake signed distance (negative inside lake)
 * Tranquil, open central mirror-lake giving generous breathing room between all 5 buildings
 */
export function lakeSignedDist(x: number, z: number): number {
  const lx = (x - 1.2) / 7.6;
  const lz = (z + 1.6) / 5.2;
  const wobble = Math.sin(x * 0.28 + z * 0.21) * 0.09 + Math.cos(x * 0.17 - z * 0.31) * 0.07;
  return (Math.hypot(lx, lz) - 1.0 + wobble) * 7.2;
}

/**
 * Curved natural garden stone footpath: foreground meadow -> SW shore -> bridgehead -> north walk -> lakeside pavilion
 * Spacious routing with dedicated spurs to all 5 buildings (Phone Booth sits 4.4m cleanly off the main path!)
 */
export function gardenPathFactor(x: number, z: number): number {
  const segDist = (ax: number, az: number, bx: number, bz: number) => {
    const sdx = bx - ax;
    const sdz = bz - az;
    const st = Math.max(0, Math.min(1, ((x - ax) * sdx + (z - az) * sdz) / (sdx * sdx + sdz * sdz || 1)));
    return Math.hypot(x - (ax + sdx * st), z - (az + sdz * st));
  };

  // Segment 1: Foreground entry (0.4, 18.5) -> open courtyard fork (0.4, 9.6) -> SW shore (-6.2, 5.0) -> SW bridge landing
  const dEntry = segDist(0.4, 18.5, 0.4, 9.6);
  const dWestCurve = segDist(0.4, 9.6, -6.2, 5.0);
  const dToBridge = segDist(-6.2, 5.0, BRIDGE_CONFIG.bankAX, BRIDGE_CONFIG.bankAZ);

  // Segment 2: NE bridge landing -> north waterfront AI Center (0.0, -10.8) -> Music Hall (9.8, -6.2)
  const dNorthWalk = segDist(BRIDGE_CONFIG.bankBX, BRIDGE_CONFIG.bankBZ, 0.0, -8.8);
  const dToMusic = segDist(0.0, -8.8, 8.6, -6.2);

  // Landing aprons right at both ends of the bridge
  const dBankA = Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ) * 0.85;
  const dBankB = Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ) * 0.85;

  // Dedicated stone spur trails branching cleanly off the main footpath to each building's terrace
  const dSpurLib = segDist(-6.2, 5.0, -8.6, 2.2) + 0.22;
  const dSpurBooth = segDist(0.4, 9.8, -2.8, 9.8) + 0.28;
  const dBoothAlcove = Math.hypot(x + 4.2, z - 9.8) * 0.88;
  const dSpurLang = segDist(0.4, 9.2, 6.8, 7.2) + 0.22;

  const d = Math.min(dEntry, dWestCurve, dToBridge, dNorthWalk, dToMusic, dBankA, dBankB, dSpurLib, dSpurBooth, dBoothAlcove, dSpurLang);
  return 1 - smoothstep(0.62, 1.78, d);
}

export interface TerrainBiomeSample {
  height: number;
  waterDepth: number;
  pathWeight: number;
  shoreWeight: number;
  rockWeight: number;
  meadowWeight: number;
}

export function sampleTerrainBiome(x: number, z: number): TerrainBiomeSample {
  const r = Math.hypot(x, z);

  let h =
    0.58 +
    fbm2(x * 0.032 + 3.1, z * 0.032 - 1.7) * 1.2 +
    Math.sin(x * 0.075) * Math.cos(z * 0.065) * 0.32;

  const fgLeftMound = Math.exp(-Math.pow((x + 9.2) / 9.2, 2) - Math.pow((z - 11.2) / 8.0, 2)) * 1.65;
  const fgRightMound = Math.exp(-Math.pow((x - 14.0) / 9.8, 2) - Math.pow((z - 12.2) / 8.5, 2)) * 1.85;
  h += fgLeftMound + fgRightMound;

  const lakeD = lakeSignedDist(x, z);
  const lakeCarve = 1 - smoothstep(-2.4, 2.7, lakeD);
  if (lakeCarve > 0) {
    const basinBottom = -1.45 + fbm2(x * 0.14, z * 0.14) * 0.2;
    h = THREE.MathUtils.lerp(h, basinBottom, lakeCarve);
  }

  // Spacious dry elevated terrace pads with 10-16m breathing room between all 5 buildings:
  // Music Hall (9.8, -6.2), Library (-9.8, 1.6), Language Center (8.2, 6.8),
  // AI Center (0.0, -10.8), and Roadside Phone Booth Alcove (-4.2, 9.8)
  const pavDist = Math.hypot(x - 9.8, z + 6.2);
  const pavFlat = 1 - smoothstep(3.1, 6.1, pavDist);
  h = THREE.MathUtils.lerp(h, 1.06, pavFlat);

  const restDist = Math.hypot(x + 9.8, z - 1.6);
  const restFlat = 1 - smoothstep(2.7, 5.2, restDist);
  h = THREE.MathUtils.lerp(h, 1.36, restFlat);

  const langDist = Math.hypot(x - 8.2, z - 6.8);
  const langFlat = 1 - smoothstep(2.8, 5.3, langDist);
  h = THREE.MathUtils.lerp(h, 1.24, langFlat);

  const aiDist = Math.hypot(x - 0.0, z + 10.8);
  const aiFlat = 1 - smoothstep(3.2, 6.0, aiDist);
  h = THREE.MathUtils.lerp(h, 1.26, aiFlat);

  const boothDist = Math.hypot(x + 4.2, z - 9.8);
  const boothFlat = 1 - smoothstep(1.8, 3.6, boothDist);
  h = THREE.MathUtils.lerp(h, 0.96, boothFlat);

  const stream = streamDistanceAndFlow(x, z);
  const streamCarve = 1 - smoothstep(stream.width * 0.48, stream.width * 1.46, stream.dist);
  if (streamCarve > 0) {
    const streamBottom = stream.isPlungePool ? -1.55 : -0.84;
    h = THREE.MathUtils.lerp(h, streamBottom, streamCarve);
  }

  // Sculpt solid natural dry-earth bridgehead embankments on BOTH left & right riverbanks
  // so the arched bridge connects shore-to-shore with zero gap or floating abutments
  const dryBankMask = smoothstep(stream.width * 1.02, stream.width * 1.44, stream.dist) * (1 - lakeCarve * 0.9);
  if (dryBankMask > 0.001) {
    const dHeadA = Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ);
    const dHeadB = Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ);
    const headFlat = Math.max(1 - smoothstep(1.9, 4.6, dHeadA), 1 - smoothstep(1.9, 4.6, dHeadB));
    if (headFlat > 0.001) {
      h = THREE.MathUtils.lerp(h, BRIDGE_CONFIG.deckBaseY + 0.02, headFlat * dryBankMask * 0.92);
    }
  }

  const cliffDx = (x + 23.0) / 9.2;
  const cliffDz = (z + 25.8) / 7.2;
  const cliffBlob = Math.exp(-(cliffDx * cliffDx + cliffDz * cliffDz));
  const cliffCrag = ridgedFbm2(x * 0.08 + 2.3, z * 0.08 - 1.9);
  const cliffStep = cliffBlob * (10.5 + cliffCrag * 4.8) * smoothstep(-19.5, -24.5, z);
  h += cliffStep;

  const midFoothillRim = smoothstep(28, 62, r);
  const farPeakRim = smoothstep(52, 114, r);
  if (midFoothillRim > 0) {
    const ridge1 = ridgedFbm2(x * 0.02 + 8.7, z * 0.02 + 3.4);
    const ridge2 = ridgedFbm2(x * 0.045 - 4.1, z * 0.045 + 11.2);
    const frontVistaOpen = 1 - 0.62 * smoothstep(8, 44, z) * (1 - smoothstep(14, 34, Math.abs(x)));
    const hillLift = (4.8 + ridge1 * 12.5) * midFoothillRim * frontVistaOpen;
    const alpinePeaks = (10.0 + ridge1 * 24.0 + ridge2 * 9.5) * farPeakRim * frontVistaOpen;
    h += hillLift + alpinePeaks;
  }

  const pathWeight = h > 0.14 ? gardenPathFactor(x, z) * (1 - lakeCarve) * (1 - streamCarve) : 0;
  if (pathWeight > 0) {
    h = THREE.MathUtils.lerp(h, Math.max(0.3, h * 0.94), pathWeight * 0.65);
  }

  const waterDepth = Math.max(0, -h);
  const shoreWeight = (1 - smoothstep(0.0, 1.4, Math.abs(h))) * smoothstep(-0.35, 0.25, h);
  const rockWeight = Math.min(1, smoothstep(5.5, 12.0, h) + cliffBlob * 0.92);
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
  waterMesh: Water;
  waterfallMesh: THREE.Mesh;
  waterUniforms: Record<string, THREE.IUniform>;
  waterfallUniforms: Record<string, THREE.IUniform>;
  terrainUniforms: {
    uWetness: { value: number };
    uTime: { value: number };
  };
  triggerWaterRipple: (worldX: number, worldZ: number, nowSec: number, strength?: number) => void;
  dispose: () => void;
}

export function createParadiseTerrain(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseTerrainHandle {
  const group = new THREE.Group();
  const segs = quality.terrainSegments;
  const terrainGeo = new THREE.PlaneGeometry(240, 240, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const cDeepBed = new THREE.Color(0x1f2d32);
  const cShoreSand = new THREE.Color(0x887f68);
  const cMeadow = new THREE.Color(0x4e7540);
  const cMeadowRich = new THREE.Color(0x345b32);
  const cMeadowSun = new THREE.Color(0x618748);
  const cPathStone = new THREE.Color(0x9a9386);
  const cCliffRock = new THREE.Color(0x555b62);
  const cFarMountain = new THREE.Color(0x2a4638);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const sample = sampleTerrainBiome(x, z);
    posAttr.setY(i, sample.height);

    const n = noise2(x * 0.14 + 7.2, z * 0.14 - 3.4);
    const n2 = noise2(x * 0.06 - 2.8, z * 0.06 + 5.1);
    tmpColor.copy(cMeadow).lerp(cMeadowRich, n * 0.85).lerp(cMeadowSun, smoothstep(0.54, 0.86, n2) * 0.48);

    if (sample.height < 0.05) {
      tmpColor.lerp(cDeepBed, smoothstep(0.05, -0.85, sample.height));
    }
    if (sample.shoreWeight > 0) {
      tmpColor.lerp(cShoreSand, sample.shoreWeight * 0.78);
    }
    if (sample.pathWeight > 0) {
      tmpColor.lerp(cPathStone, sample.pathWeight * 0.9);
    }
    if (sample.rockWeight > 0) {
      tmpColor.lerp(cCliffRock, sample.rockWeight * 0.88);
    }
    const rDist = Math.hypot(x, z);
    if (rDist > 42) {
      tmpColor.lerp(cFarMountain, smoothstep(42, 108, rDist) * 0.65);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainUniforms = {
    uWetness: { value: 0.0 },
    uTime: { value: 0.0 },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.terrainDetail,
    normalMap: textures.terrainNormalMap,
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughnessMap: textures.terrainRoughnessMap,
    roughness: 0.92,
    metalness: 0.02,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.uniforms.uTime = terrainUniforms.uTime;

    shader.vertexShader =
      `varying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader =
      `uniform float uWetness;\nuniform float uTime;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\n` +
      `
      float tHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 31.42);
        return fract(p.x * p.y);
      }
      float tNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x),
          mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float tFbm(vec2 p) {
        float a = 0.0;
        a += 0.50 * tNoise(p);
        a += 0.25 * tNoise(p * 2.07 + 4.3);
        a += 0.14 * tNoise(p * 4.21 - 2.1);
        a += 0.08 * tNoise(p * 8.43 + 1.7);
        return a;
      }
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          vec2 wp = vTerrainWorldPos.xz;
          float wy = vTerrainWorldPos.y;
          float upDot = clamp(vTerrainWorldNormal.y, 0.0, 1.0);

          float detailMacro = tFbm(wp * 0.19);
          float detailMicro = tFbm(wp * 1.45);

          float steepMask = 1.0 - smoothstep(0.64, 0.87, upDot);
          float strata = sin(wy * 2.8 + tNoise(wp * 0.35) * 4.5) * 0.5 + 0.5;
          vec3 graniteCol = mix(vec3(0.24, 0.26, 0.29), vec3(0.45, 0.44, 0.41), detailMicro * 0.65 + strata * 0.35);
          float rockMoss = smoothstep(0.58, 0.82, detailMacro) * (1.0 - steepMask * 0.45);
          graniteCol = mix(graniteCol, vec3(0.18, 0.31, 0.17), rockMoss * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, graniteCol, clamp(steepMask * 0.92, 0.0, 1.0));

          float summitMask = smoothstep(14.5, 25.0, wy) * smoothstep(0.45, 0.85, detailMacro);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.47, 0.50), summitMask * 0.32);

          float ginkgoZone = (1.0 - smoothstep(-14.0, -2.0, wp.x)) * (1.0 - smoothstep(14.0, 22.0, abs(wp.y))) * smoothstep(0.18, 0.6, wy) * smoothstep(0.75, 0.92, upDot);
          float ginkgoPatch = smoothstep(0.42, 0.72, tFbm(wp * 0.28 + 11.4)) * smoothstep(0.32, 0.78, detailMicro);
          vec3 goldLeafCol = mix(vec3(0.68, 0.45, 0.08), vec3(0.88, 0.68, 0.14), detailMicro);
          diffuseColor.rgb = mix(diffuseColor.rgb, goldLeafCol, ginkgoZone * ginkgoPatch * 0.72);

          float sakuraZone = smoothstep(-10.0, 18.0, wp.x) * smoothstep(0.18, 0.65, wy) * smoothstep(0.76, 0.94, upDot);
          float sakuraPatch = smoothstep(0.46, 0.76, tFbm(wp * 0.32 - 6.7)) * smoothstep(0.36, 0.82, detailMicro);
          vec3 petalCarpetCol = mix(vec3(0.82, 0.59, 0.67), vec3(0.96, 0.82, 0.88), detailMicro);
          diffuseColor.rgb = mix(diffuseColor.rgb, petalCarpetCol, sakuraZone * sakuraPatch * 0.48);

          // Organic sunlit meadow clover variation & subtle cobblestone joint articulation on stone paths
          float isStonePath = smoothstep(0.06, 0.22, diffuseColor.r - diffuseColor.g * 0.92) * smoothstep(0.24, 0.55, wy) * smoothstep(0.84, 0.96, upDot);
          vec2 cobbleUv = wp * 1.65;
          vec2 cobbleCell = fract(cobbleUv + vec2(floor(cobbleUv.y) * 0.45, 0.0));
          float mortar = smoothstep(0.05, 0.14, min(min(cobbleCell.x, 1.0 - cobbleCell.x), min(cobbleCell.y, 1.0 - cobbleCell.y)));
          float stoneVar = mix(0.88, 1.12, tHash(floor(cobbleUv)));
          vec3 flagstoneCol = mix(vec3(0.29, 0.36, 0.25), diffuseColor.rgb * stoneVar, mortar);
          diffuseColor.rgb = mix(diffuseColor.rgb, flagstoneCol, isStonePath * 0.68);

          // Rich sunlit turf macro variation so open lawn reads like a living botanical estate
          float meadowPatch = tFbm(wp * 0.11 - vec2(4.2, 7.1));
          diffuseColor.rgb *= mix(0.90, 1.12, detailMicro * 0.55 + meadowPatch * 0.45);

          float shorelineWet = 1.0 - smoothstep(-0.08, 0.34, wy);
          float totalWet = clamp(max(uWetness * 0.85, shorelineWet * 0.9), 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.58, totalWet * 0.78);
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          float sWet = 1.0 - smoothstep(-0.08, 0.34, vTerrainWorldPos.y);
          float wAmt = clamp(max(uWetness * 0.8, sWet * 0.85), 0.0, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.22, wAmt * 0.78);
          `
        );
  };
  terrainMat.customProgramCacheKey = () => 'paradise-terrain-pbr-v4';

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = quality.enableShadows;
  terrainMesh.castShadow = false;
  group.add(terrainMesh);

  // -------------------------------------------------------------------------
  // Baked Water Depth Field (for shallow turquoise edge clarity & shore foam)
  // -------------------------------------------------------------------------
  const depthRes = 128;
  const waterWidth = 132;
  const waterHeight = 108;
  const waterCenterX = 10;
  const waterCenterZ = -3;
  const depthBytes = new Uint8Array(depthRes * depthRes * 4);
  for (let iy = 0; iy < depthRes; iy++) {
    const wz = waterCenterZ + ((iy / (depthRes - 1)) - 0.5) * waterHeight;
    for (let ix = 0; ix < depthRes; ix++) {
      const wx = waterCenterX + ((ix / (depthRes - 1)) - 0.5) * waterWidth;
      const h = terrainHeightAt(wx, wz);
      // Normalized depth: 0 at shoreline or above, 1 at >= 1.6m deep
      const depthNorm = Math.max(0, Math.min(1, -h / 1.6));
      const byteVal = Math.round(depthNorm * 255);
      const idx = (iy * depthRes + ix) * 4;
      depthBytes[idx] = byteVal;
      depthBytes[idx + 1] = byteVal;
      depthBytes[idx + 2] = byteVal;
      depthBytes[idx + 3] = 255;
    }
  }
  const waterDepthTex = new THREE.DataTexture(depthBytes, depthRes, depthRes, THREE.RGBAFormat);
  waterDepthTex.wrapS = THREE.ClampToEdgeWrapping;
  waterDepthTex.wrapT = THREE.ClampToEdgeWrapping;
  waterDepthTex.magFilter = THREE.LinearFilter;
  waterDepthTex.minFilter = THREE.LinearFilter;
  waterDepthTex.needsUpdate = true;

  // -------------------------------------------------------------------------
  // Real Planar-Reflective Water (Three.js Water.js adapted from jbouny/ocean)
  // -------------------------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(waterWidth, waterHeight, 1, 1);
  const waterMesh = new Water(waterGeo, {
    textureWidth: quality.waterTextureSize,
    textureHeight: quality.waterTextureSize,
    waterNormals: textures.waterNormals,
    sunDirection: new THREE.Vector3(0.4, 0.7, -0.5).normalize(),
    sunColor: 0xfff5de,
    waterColor: 0x0b363c,
    distortionScale: 2.35,
    fog: true,
    clipBias: 0.008,
  });
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(waterCenterX, 0.0, waterCenterZ);
  waterMesh.renderOrder = 2;

  const rippleCenters = [
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
    new THREE.Vector4(0, 0, -99, 0),
  ];

  const waterMat = waterMesh.material as THREE.ShaderMaterial;
  waterMat.uniforms.size.value = 3.2;
  waterMat.uniforms.uDayFactor = { value: 1.0 };
  waterMat.uniforms.uNightFactor = { value: 0.0 };
  waterMat.uniforms.uMoonDir = { value: new THREE.Vector3(-0.4, -0.7, 0.5).normalize() };
  waterMat.uniforms.uWindStrength = { value: 0.22 };
  waterMat.uniforms.uRainIntensity = { value: 0.0 };
  waterMat.uniforms.uRippleCenters = { value: rippleCenters };
  waterMat.uniforms.uDepthMap = { value: waterDepthTex };

  waterMat.fragmentShader =
    `
    uniform float uDayFactor;
    uniform float uNightFactor;
    uniform vec3 uMoonDir;
    uniform float uWindStrength;
    uniform float uRainIntensity;
    uniform vec4 uRippleCenters[4];
    uniform sampler2D uDepthMap;

    float wHash21(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.12);
      return fract(p.x * p.y);
    }

    float wRainRings(vec2 uv, float t, float rainAmt) {
      if (rainAmt < 0.02) return 0.0;
      vec2 grid = uv * 2.2;
      vec2 id = floor(grid);
      vec2 f = fract(grid) - 0.5;
      float acc = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 cell = id + vec2(float(i), float(j));
          float h = wHash21(cell);
          if (h < (1.0 - rainAmt * 0.85)) continue;
          vec2 offset = (vec2(h, fract(h * 19.7)) - 0.5) * 0.65;
          float age = fract(t * (1.25 + fract(h * 7.3) * 0.6) + h * 11.0);
          float d = length((vec2(float(i), float(j)) + offset) - f);
          float radius = age * 0.52;
          acc += (1.0 - smoothstep(0.0, 0.045, abs(d - radius))) * (1.0 - age);
        }
      }
      return clamp(acc * rainAmt, 0.0, 1.0);
    }
    ` +
    waterMat.fragmentShader
      .replace(
        'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
        /* glsl */ `
        vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.45 + uWindStrength * 0.75, 1.0, 1.45 + uWindStrength * 0.75 ) );
        float wRippleFoam = 0.0;
        for (int k = 0; k < 4; k++) {
          vec4 rip = uRippleCenters[k];
          float age = time - rip.z;
          if (age > 0.0 && age < 4.5 && rip.w > 0.01) {
            float d = length(worldPosition.xz - rip.xy);
            float radius = age * 3.8;
            float env = exp(-age * 0.95) * exp(-abs(d - radius) * 1.65) * rip.w;
            float wave = sin((d - radius) * 7.5);
            vec2 dir = (d > 0.001) ? (worldPosition.xz - rip.xy) / d : vec2(0.0);
            surfaceNormal.x += dir.x * wave * env * 0.42;
            surfaceNormal.z += dir.y * wave * env * 0.42;
            wRippleFoam += max(0.0, wave) * env * 0.45;
          }
        }
        float wRain = wRainRings(worldPosition.xz, time, uRainIntensity);
        surfaceNormal.x += wRain * 0.18 * sin(worldPosition.x * 12.0 + time * 8.0);
        surfaceNormal.z += wRain * 0.18 * cos(worldPosition.z * 12.0 + time * 8.0);
        surfaceNormal = normalize(surfaceNormal);
        `
      )
      .replace(
        'vec3 outgoingLight = albedo;',
        /* glsl */ `
        // Sample baked basin depth for shallow emerald-jade tint + subtle shoreline foam lap
        vec2 dUv = vec2(
          (worldPosition.x - 10.0) / 132.0 + 0.5,
          (worldPosition.z + 3.0) / 108.0 + 0.5
        );
        float waterDepth = texture2D(uDepthMap, clamp(dUv, 0.0, 1.0)).r;
        float shallowFactor = 1.0 - smoothstep(0.04, 0.36, waterDepth);
        vec3 shallowColor = mix(vec3(0.04, 0.10, 0.14), vec3(0.16, 0.36, 0.34), uDayFactor);
        albedo = mix(albedo, shallowColor, shallowFactor * 0.38);

        // Gentle lapping shoreline wave foam + plunge pool turbulence foam
        float shoreWave = sin(waterDepth * 34.0 - time * 2.2) * 0.5 + 0.5;
        float shoreFoam = (1.0 - smoothstep(0.005, 0.08, waterDepth)) * smoothstep(0.45, 0.85, shoreWave);
        float plungeDist = length(worldPosition.xz - vec2(-19.5, -20.5));
        float plungeFoam = (1.0 - smoothstep(1.2, 4.4, plungeDist)) * (0.45 + 0.55 * sin(plungeDist * 4.5 - time * 3.8));
        albedo = mix(albedo, mix(vec3(0.32, 0.42, 0.54), vec3(0.92, 0.96, 0.98), uDayFactor), clamp(shoreFoam * 0.28 + plungeFoam * 0.42, 0.0, 0.65));

        albedo *= mix(0.44, 1.0, smoothstep(0.0, 0.7, uDayFactor));
        if (uMoonDir.y > -0.02 && uNightFactor > 0.05) {
          vec3 moonRefl = normalize(reflect(-normalize(uMoonDir), surfaceNormal));
          float moonSpec = pow(max(dot(eyeDirection, moonRefl), 0.0), 120.0) * smoothstep(-0.02, 0.16, uMoonDir.y);
          albedo += vec3(0.75, 0.86, 1.0) * moonSpec * uNightFactor * 1.15 * (1.0 - uRainIntensity * 0.65);
        }
        albedo += vec3(0.85, 0.92, 0.98) * (wRain * 0.24 + wRippleFoam * 0.32);
        vec3 outgoingLight = albedo;
        `
      );
  waterMat.needsUpdate = true;

  group.add(waterMesh);

  // -------------------------------------------------------------------------
  // Realistic Multi-Stage Geological Waterfall, Wet Cliff Ledges & Plunge Mist
  // -------------------------------------------------------------------------
  const waterfallGeos: THREE.BufferGeometry[] = [];
  const waterfallMats: THREE.Material[] = [];

  const wfAnchor = new THREE.Group();
  wfAnchor.position.set(-20.4, 5.0, -22.5);
  wfAnchor.rotation.y = 0.64;

  // Wet dark slate cliff ledges behind the cascade so water physically tumbles over rock shelves
  const wetRockMat = new THREE.MeshStandardMaterial({
    color: 0x3b4248,
    map: textures.rockColorMap,
    normalMap: textures.rockNormalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    aoMap: textures.plasterAoMap,
    aoMapIntensity: 0.75,
    roughness: 0.24,
    metalness: 0.08,
  });
  waterfallMats.push(wetRockMat);

  const ledgeDefs: Array<[number, number, number, number, number, number]> = [
    [0.0, 5.1, 1.6, 2.35, 1.15, 1.35],   // upper spillway rim
    [0.15, 0.25, 2.55, 2.15, 1.05, 1.4], // mid-fall split boulder ledge
    [-1.45, -1.6, 2.3, 1.35, 1.9, 1.2],  // left wet crag cheek
    [1.55, -1.4, 2.25, 1.4, 1.85, 1.25], // right wet crag cheek
    [0.0, -3.6, 3.35, 2.4, 1.1, 1.5],    // lower plunge splash shelf
  ];
  for (let i = 0; i < ledgeDefs.length; i++) {
    const [lx, ly, lz, sx, sy, sz] = ledgeDefs[i];
    const rGeo = new THREE.IcosahedronGeometry(1, 2);
    const rp = rGeo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < rp.count; v++) {
      const vx = rp.getX(v);
      const vy = rp.getY(v);
      const vz = rp.getZ(v);
      const jag = 1 + 0.14 * Math.sin(vx * 3.8 + i) + 0.1 * Math.cos(vy * 4.5 - vz * 2.9);
      rp.setXYZ(v, vx * sx * jag, vy * sy * jag, vz * sz * jag);
    }
    rGeo.computeVertexNormals();
    if (rGeo.attributes.uv) rGeo.setAttribute('uv2', rGeo.attributes.uv);
    waterfallGeos.push(rGeo);
    const rMesh = new THREE.Mesh(rGeo, wetRockMat);
    rMesh.position.set(lx, ly, lz);
    rMesh.castShadow = quality.enableShadows;
    rMesh.receiveShadow = quality.enableShadows;
    wfAnchor.add(rMesh);
  }

  // Contoured dual-tier waterfall chute geometry
  const wfGeo = new THREE.CylinderGeometry(2.15, 3.05, 11.8, 32, 28, true, -0.56, 1.12);
  const wfPos = wfGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wfPos.count; i++) {
    const vx = wfPos.getX(i);
    const vy = wfPos.getY(i);
    const vz = wfPos.getZ(i);
    const fallT = Math.max(0, Math.min(1, 1 - (vy + 5.9) / 11.8));
    // Parabolic spillway projection + mid-shelf bounce + spreading fan at plunge base
    const topLip = Math.pow(fallT, 0.65) * 0.9;
    const midBounce = Math.exp(-Math.pow((fallT - 0.48) / 0.16, 2)) * 0.56;
    const lowerPour = Math.pow(fallT, 1.38) * 2.35;
    const ribbonRipple = Math.sin(vx * 2.8 + fallT * 5.0) * 0.08 * fallT;
    wfPos.setXYZ(i, vx * (1 + fallT * 0.18), vy, vz + topLip + midBounce + lowerPour + ribbonRipple);
  }
  wfGeo.computeVertexNormals();
  waterfallGeos.push(wfGeo);

  // Outer translucent spray veil slightly proud of core cascade
  const wfVeilGeo = wfGeo.clone();
  const vPos = wfVeilGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < vPos.count; i++) {
    const vy = vPos.getY(i);
    const fallT = Math.max(0, Math.min(1, 1 - (vy + 5.9) / 11.8));
    vPos.setZ(i, vPos.getZ(i) + 0.16 + fallT * 0.34);
  }
  wfVeilGeo.computeVertexNormals();
  waterfallGeos.push(wfVeilGeo);

  const waterfallUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uDayFactor: { value: 1.0 },
    uSkyHorizon: { value: new THREE.Color(0xbce0f7) },
    uRainIntensity: { value: 0.0 },
    uFogColor: { value: new THREE.Color(0xbce0f7) },
    uFogDensity: { value: 0.0042 },
  };

  const buildWaterfallShaderMat = (isVeil: boolean) =>
    new THREE.ShaderMaterial({
      uniforms: waterfallUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
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
        varying vec3 vWorldNormal;

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

        float fbmWater(vec2 p) {
          float s = 0.0;
          s += 0.52 * noise(p);
          s += 0.28 * noise(p * 2.13 + vec2(3.1, 1.7));
          s += 0.14 * noise(p * 4.41 - vec2(1.4, 5.2));
          return s;
        }

        void main() {
          float speed = 1.95 + uRainIntensity * 0.85;
          float accelUvY = vUv.y + (1.0 - vUv.y) * 0.35;
          float warp = (noise(vec2(vUv.x * 7.0, vUv.y * 5.0 + uTime * 0.7)) - 0.5) * 0.24;

          float mainRibbons = fbmWater(vec2(vUv.x * 11.5 + warp, accelUvY * 3.8 + uTime * speed));
          float fineMist = fbmWater(vec2(vUv.x * 23.0 - warp * 1.4, accelUvY * 7.2 + uTime * speed * 1.42));
          float droplets = noise(vec2(vUv.x * 38.0, vUv.y * 16.0 + uTime * speed * 1.9));

          // Water splits slightly into twin braided chutes around central cliff crag
          float twinChute = 0.78 + 0.22 * cos((vUv.x - 0.5) * 14.0 + warp * 4.0);
          float foamRaw = (mainRibbons * 0.58 + fineMist * 0.32 + droplets * 0.12) * twinChute;
          float foam = smoothstep(${isVeil ? '0.46, 0.88' : '0.32, 0.78'}, foamRaw);

          float midLedgeSplash = exp(-pow((vUv.y - 0.52) / 0.095, 2.0)) * (0.55 + fineMist * 0.45);
          float bottomSpray = (1.0 - smoothstep(0.0, 0.34, vUv.y)) * (0.65 + fineMist * 0.35);
          float topCrest = smoothstep(0.84, 1.0, vUv.y);
          float edgeFade = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));

          // Cool clear stream-aqua core behind aerated whitewater foam + sun sheen
          vec3 deepWater = mix(vec3(0.08, 0.15, 0.24), mix(vec3(0.26, 0.48, 0.54), uSkyHorizon, 0.32), uDayFactor);
          vec3 foamColor = mix(vec3(0.46, 0.56, 0.70), vec3(0.95, 0.98, 1.0), uDayFactor);
          float aeration = clamp(foam * 0.92 + bottomSpray * 0.72 + topCrest * 0.46 + midLedgeSplash * 0.68, 0.0, 1.0);
          vec3 col = mix(deepWater, foamColor, aeration);

          // Subtle directional glint on sunlit water ridges
          float fresnel = pow(1.0 - abs(dot(normalize(cameraPosition - vWorldPos), normalize(vWorldNormal))), 2.2);
          col += vec3(0.85, 0.93, 1.0) * fresnel * 0.16 * uDayFactor;

          float distCam = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          float baseAlpha = ${isVeil ? '0.18 + foam * 0.34 + bottomSpray * 0.22' : '0.52 + foam * 0.42 + bottomSpray * 0.24'};
          float alpha = baseAlpha * edgeFade;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, ${isVeil ? '0.62' : '0.95'}));
        }
      `,
    });

  const wfMat = buildWaterfallShaderMat(false);
  const wfVeilMat = buildWaterfallShaderMat(true);
  waterfallMats.push(wfMat, wfVeilMat);

  const waterfallMesh = new THREE.Mesh(wfGeo, wfMat);
  waterfallMesh.renderOrder = 3;
  wfAnchor.add(waterfallMesh);

  const wfVeilMesh = new THREE.Mesh(wfVeilGeo, wfVeilMat);
  wfVeilMesh.renderOrder = 4;
  wfAnchor.add(wfVeilMesh);
  group.add(wfAnchor);

  // Churning Plunge-Pool Boil Ring & Rising Spray Mist Plumes at (-19.5, 0.05, -20.5)
  const boilGeo = new THREE.RingGeometry(0.45, 4.4, 36, 4);
  boilGeo.rotateX(-Math.PI / 2);
  waterfallGeos.push(boilGeo);

  const boilMat = new THREE.ShaderMaterial({
    uniforms: waterfallUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vLocalPos;
      void main() {
        vLocalPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDayFactor;
      varying vec2 vLocalPos;
      void main() {
        float r = length(vLocalPos);
        float a = atan(vLocalPos.y, vLocalPos.x);
        float wave1 = sin(r * 5.2 - uTime * 4.4 + sin(a * 5.0) * 0.9) * 0.5 + 0.5;
        float wave2 = cos(r * 9.5 - uTime * 6.8 - a * 3.0) * 0.5 + 0.5;
        float froth = smoothstep(0.38, 0.88, wave1 * 0.65 + wave2 * 0.35);
        float radialMask = smoothstep(0.5, 1.35, r) * (1.0 - smoothstep(2.4, 4.35, r));
        vec3 col = mix(vec3(0.44, 0.54, 0.66), vec3(0.95, 0.98, 1.0), uDayFactor);
        float alpha = froth * radialMask * 0.68;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  waterfallMats.push(boilMat);

  const boilMesh = new THREE.Mesh(boilGeo, boilMat);
  boilMesh.position.set(-19.5, 0.05, -20.5);
  boilMesh.renderOrder = 3;
  group.add(boilMesh);

  // Soft rising & billowing spray mist clouds above plunge pool (100% GPU-driven via uTime)
  const mistCount = 12;
  const mistGeo = new THREE.BufferGeometry();
  const mistPos = new Float32Array(mistCount * 3);
  const mistSeeds = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const ang = (i / mistCount) * Math.PI * 2;
    const rad = 0.6 + (i % 3) * 1.15;
    mistPos[i * 3] = -19.5 + Math.cos(ang) * rad;
    mistPos[i * 3 + 1] = 0.35 + (i % 4) * 0.42;
    mistPos[i * 3 + 2] = -20.5 + Math.sin(ang) * rad;
    mistSeeds[i * 3] = i * 1.37;
    mistSeeds[i * 3 + 1] = 0.75 + (i % 3) * 0.25;
    mistSeeds[i * 3 + 2] = 0.85 + (i % 4) * 0.22;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 3));
  waterfallGeos.push(mistGeo);

  const sprayMistMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: waterfallUniforms.uTime,
      uDayFactor: waterfallUniforms.uDayFactor,
      uRainIntensity: waterfallUniforms.uRainIntensity,
      uMap: { value: textures.mistPuff },
      uPixelRatio: { value: quality.pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vLifeAlpha;
      void main() {
        float life = fract(uTime * 0.24 * aSeed.y + aSeed.x);
        vec3 pos = position;
        pos.y += life * 2.4;
        pos.x += sin(life * 4.2 + aSeed.x) * 0.75;
        pos.z += cos(life * 3.8 + aSeed.x) * 0.75;
        vLifeAlpha = sin(life * 3.14159265) * 0.44;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp((195.0 * aSeed.z * (0.75 + life * 0.65) * uPixelRatio) / max(1.0, -mv.z), 8.0, 140.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uDayFactor;
      uniform float uRainIntensity;
      varying float vLifeAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        vec3 col = mix(vec3(0.45, 0.56, 0.70), vec3(0.94, 0.98, 1.0), uDayFactor);
        float alpha = tex.a * vLifeAlpha * (1.0 + uRainIntensity * 0.35);
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  waterfallMats.push(sprayMistMat);

  const sprayMistPoints = new THREE.Points(mistGeo, sprayMistMat);
  sprayMistPoints.frustumCulled = false;
  sprayMistPoints.renderOrder = 5;
  group.add(sprayMistPoints);

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
    waterUniforms: waterMat.uniforms,
    waterfallUniforms,
    terrainUniforms,
    triggerWaterRipple,
    dispose: () => {
      terrainGeo.dispose();
      terrainMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      waterDepthTex.dispose();
      const rt = (waterMesh as unknown as { material?: THREE.ShaderMaterial })?.material?.uniforms?.mirrorSampler?.value;
      if (rt && typeof rt.dispose === 'function') rt.dispose();
      waterfallGeos.forEach((g) => g.dispose());
      waterfallMats.forEach((m) => m.dispose());
    },
  };
}
