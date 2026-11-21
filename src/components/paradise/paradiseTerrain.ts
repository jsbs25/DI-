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
        float plungeDist = length(worldPosition.xz - vec2(-18.0, -19.2));
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
  // Realistic Multi-Tiered Rocky Mountain Waterfall, Mossy Basalt Gorge & Mist
  // -------------------------------------------------------------------------
  const waterfallGeos: THREE.BufferGeometry[] = [];
  const waterfallMats: THREE.Material[] = [];

  const wfAnchor = new THREE.Group();
  wfAnchor.position.set(-20.4, 0.0, -22.5);
  wfAnchor.rotation.y = 0.64;

  // Stratified dark wet basalt & moss-capped cliff rock material (vertex-colored for wet-to-moss gradient)
  const wetBasaltMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: textures.rockColorMap,
    normalMap: textures.rockNormalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    aoMap: textures.plasterAoMap,
    aoMapIntensity: 0.78,
    roughness: 0.34,
    metalness: 0.06,
  });
  waterfallMats.push(wetBasaltMat);

  /**
   * Builds a stratified flat-topped geological basalt cliff ledge with horizontal bedding
   * fractures, darker glistening wet lower stone, and natural alpine moss on top ledges.
   */
  const createStratifiedCliffBlock = (
    sx: number,
    sy: number,
    sz: number,
    seed: number,
    mossAmount = 0.72
  ): THREE.BufferGeometry => {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cDry = new THREE.Color(0x4c545b);
    const cWet = new THREE.Color(0x212930);
    const cMoss = new THREE.Color(0x3a5234);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);

      // Horizontal sedimentary strata terracing + angular fracture crags
      const strataStep = Math.sin(vy * 7.5 + seed * 1.7) * 0.085 + Math.cos(vy * 14.0 - seed) * 0.035;
      const crag =
        1.0 +
        0.16 * Math.sin(vx * 3.4 + seed) * Math.cos(vz * 3.1 - seed) +
        0.09 * Math.sin((vx - vz) * 6.2 + vy * 3.0);

      // Flatten top slightly so rock shelves look like authentic stepped river ledges
      const yFlat = vy > 0.35 ? 0.35 + (vy - 0.35) * 0.48 : vy;
      const xOut = vx * sx * (crag + strataStep);
      const yOut = yFlat * sy * (0.94 + 0.1 * Math.cos(vx * 4.0 + vz * 3.5 + seed));
      const zOut = vz * sz * (crag - strataStep * 0.6);
      pos.setXYZ(i, xOut, yOut, zOut);

      // Vertex shading: dark glistening wet stone toward bottom/front, mossy green on upward faces
      const wetMask = 1.0 - smoothstep(-0.3, 0.55, vy);
      const topMoss = smoothstep(0.32, 0.78, vy) * mossAmount * (0.65 + 0.35 * Math.sin(vx * 4.5 + vz * 4.0 + seed));
      tmpCol.copy(cDry).lerp(cWet, wetMask * 0.85).lerp(cMoss, Math.max(0, Math.min(1, topMoss)));
      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    if (geo.attributes.uv) geo.setAttribute('uv2', geo.attributes.uv);
    waterfallGeos.push(geo);
    return geo;
  };

  // Sculpted natural gorge cliff framing: recessed spillway notch, mid-cliff split ledges, flanking gorge walls & plunge rim boulders
  const gorgeRocks: Array<[number, number, number, number, number, number, number, number]> = [
    // [x, y, z, sx, sy, sz, rotY, mossAmount]
    // Backing dark cliff gorge face cradling the waterfall seamlessly into the mountain
    [0.0, 5.4, -0.6, 5.2, 5.8, 2.5, 0.04, 0.52],
    // Upper left & right canyon shoulders forming a recessed rocky notch at the crest (eliminates floating top edge!)
    [-3.15, 8.8, 0.9, 2.35, 3.1, 2.15, 0.25, 0.88],
    [3.25, 8.5, 0.85, 2.45, 3.0, 2.2, -0.22, 0.85],
    // Upper recessed spillway sill rock where water smoothly rolls over the crest
    [0.0, 8.2, 1.05, 2.4, 1.05, 1.45, 0.0, 0.35],
    // Left & right steep gorge cheek walls enclosing the cascade
    [-3.65, 3.8, 1.85, 2.2, 4.1, 2.1, 0.32, 0.72],
    [3.75, 3.5, 1.75, 2.3, 3.9, 2.05, -0.28, 0.7],
    // Mid-cliff stepped basalt shelf & dividing dark wet boulder splitting water into organic braided streams
    [-0.15, 4.4, 2.05, 2.55, 1.15, 1.65, 0.08, 0.22],
    [1.85, 5.1, 2.15, 1.55, 1.25, 1.45, -0.18, 0.4],
    [-1.75, 2.6, 2.6, 1.55, 1.35, 1.4, 0.22, 0.32],
    // Lower submerged & shoreline plunge-pool boulders
    [0.35, 0.95, 3.15, 1.75, 1.15, 1.5, -0.1, 0.18],
    [-3.2, 0.65, 3.8, 1.95, 1.25, 1.65, 0.42, 0.62],
    [3.35, 0.55, 3.65, 2.05, 1.2, 1.6, -0.36, 0.58],
  ];

  for (let i = 0; i < gorgeRocks.length; i++) {
    const [rx, ry, rz, sx, sy, sz, rotY, moss] = gorgeRocks[i];
    const rGeo = createStratifiedCliffBlock(sx, sy, sz, i * 2.13 + 0.7, moss);
    const rMesh = new THREE.Mesh(rGeo, wetBasaltMat);
    rMesh.position.set(rx, ry, rz);
    rMesh.rotation.y = rotY;
    rMesh.castShadow = quality.enableShadows;
    rMesh.receiveShadow = quality.enableShadows;
    wfAnchor.add(rMesh);
  }

  /**
   * Generates an organic gravity-curved waterfall ribbon geometry from a 3D spine path
   * (crest smoothly curved back over the rock sill, bouncing naturally across mid-cliff ledges,
   * and plunging solidly below y = -0.35 into the plunge pool with zero floating edges).
   */
  const createWaterfallRibbonGeo = (cfg: {
    topX: number;
    botX: number;
    topY: number;
    botY: number;
    topZ: number;
    midLedgeT: number;
    midLedgeOut: number;
    botZ: number;
    topWidth: number;
    botWidth: number;
    bowOut: number;
    segsX?: number;
    segsY?: number;
  }): THREE.BufferGeometry => {
    const segsX = cfg.segsX ?? 24;
    const segsY = cfg.segsY ?? 34;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= segsY; iy++) {
      const fallT = iy / segsY; // 0 = top intake crest, 1 = bottom plunge base
      const v = 1.0 - fallT; // UV.y = 1 at top, 0 at bottom

      // Smooth rounded crest lip over the upper rock sill (first 10% curves horizontally forward into vertical drop)
      const crestCurve = Math.min(1, fallT / 0.11);
      const yCrestDrop = Math.pow(crestCurve, 1.65) * 0.55;
      const yMain = THREE.MathUtils.lerp(cfg.topY, cfg.botY, fallT);
      const y = fallT < 0.11 ? cfg.topY - yCrestDrop : yMain;

      // Gravity parabolic projection + mid-cliff rock-shelf bounce
      const gravityArc = Math.pow(fallT, 1.18) * (cfg.botZ - cfg.topZ);
      const shelfBounce = Math.exp(-Math.pow((fallT - cfg.midLedgeT) / 0.13, 2)) * cfg.midLedgeOut;
      const zCenter = cfg.topZ + gravityArc + shelfBounce;

      // Natural organic widening as stream aerates & spreads into plunge pool
      const halfW = THREE.MathUtils.lerp(cfg.topWidth, cfg.botWidth, Math.pow(fallT, 0.85)) * 0.5;
      const xCenter = THREE.MathUtils.lerp(cfg.topX, cfg.botX, fallT) + Math.sin(fallT * Math.PI * 1.4) * 0.14;

      for (let ix = 0; ix <= segsX; ix++) {
        const u = ix / segsX;
        const nx = (u - 0.5) * 2.0; // -1 .. +1 across stream width
        const x = xCenter + nx * halfW;
        // Convex liquid curtain cross-section + subtle organic longitudinal ridges
        const archCross = (1.0 - nx * nx) * cfg.bowOut * (0.45 + 0.55 * fallT);
        const rippleZ = Math.sin(nx * 5.2 + fallT * 6.0) * 0.06 * fallT;
        positions.push(x, y, zCenter + archCross + rippleZ);
        uvs.push(u, v);
      }
    }

    const row = segsX + 1;
    for (let iy = 0; iy < segsY; iy++) {
      for (let ix = 0; ix < segsX; ix++) {
        const a = iy * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    waterfallGeos.push(geo);
    return geo;
  };

  // 3 Distinct Braided Natural Cascade Streams (Main Central + Left Silver Veil + Right Stepped Flow)
  const mainChuteGeo = createWaterfallRibbonGeo({
    topX: -0.08,
    botX: 0.05,
    topY: 9.05,
    botY: -0.35,
    topZ: 0.85,
    midLedgeT: 0.49,
    midLedgeOut: 0.58,
    botZ: 4.15,
    topWidth: 2.35,
    botWidth: 3.45,
    bowOut: 0.48,
  });

  const leftVeilGeo = createWaterfallRibbonGeo({
    topX: -1.42,
    botX: -1.85,
    topY: 8.65,
    botY: -0.35,
    topZ: 1.05,
    midLedgeT: 0.64,
    midLedgeOut: 0.46,
    botZ: 4.05,
    topWidth: 0.88,
    botWidth: 1.55,
    bowOut: 0.28,
    segsX: 16,
    segsY: 28,
  });

  const rightSteppedGeo = createWaterfallRibbonGeo({
    topX: 1.38,
    botX: 1.82,
    topY: 7.75,
    botY: -0.35,
    topZ: 1.32,
    midLedgeT: 0.44,
    midLedgeOut: 0.52,
    botZ: 4.1,
    topWidth: 1.05,
    botWidth: 1.78,
    bowOut: 0.32,
    segsX: 16,
    segsY: 28,
  });

  // Soft outer spray curtain hovering slightly proud of main cascade for volumetric depth
  const mainSprayVeilGeo = createWaterfallRibbonGeo({
    topX: -0.04,
    botX: 0.08,
    topY: 8.75,
    botY: -0.25,
    topZ: 1.12,
    midLedgeT: 0.49,
    midLedgeOut: 0.72,
    botZ: 4.55,
    topWidth: 2.55,
    botWidth: 4.15,
    bowOut: 0.58,
    segsX: 18,
    segsY: 24,
  });

  const waterfallUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uDayFactor: { value: 1.0 },
    uSkyHorizon: { value: new THREE.Color(0xbce0f7) },
    uRainIntensity: { value: 0.0 },
    uFogColor: { value: new THREE.Color(0xbce0f7) },
    uFogDensity: { value: 0.0042 },
  };

  const buildWaterfallShaderMat = (opts: { isVeil: boolean; flowSeed: number; shelfY: number; speedMult: number }) =>
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

        float fbmStreak(vec2 p) {
          float s = 0.0;
          s += 0.50 * noise(p);
          s += 0.28 * noise(p * vec2(2.15, 1.85) + vec2(4.3, 1.9));
          s += 0.14 * noise(p * vec2(4.4, 3.6) - vec2(2.1, 6.4));
          s += 0.08 * noise(p * vec2(8.8, 6.8) + vec2(1.7, 3.3));
          return s;
        }

        void main() {
          float fallProgress = 1.0 - vUv.y; // 0 at crest, 1 at plunge pool
          float speed = (2.15 + uRainIntensity * 0.75) * ${opts.speedMult.toFixed(2)};
          // True gravitational acceleration stretch along the drop
          float accelV = vUv.y * 0.76 + (1.0 - fallProgress * fallProgress) * 0.24;

          // Subtle lateral curl distortion so water threads braid naturally
          float curl = (noise(vec2(vUv.x * 6.5 + ${opts.flowSeed.toFixed(2)}, accelV * 3.2 + uTime * 0.65)) - 0.5) * (0.14 + fallProgress * 0.18);

          // Anisotropic stretched vertical falling water filaments (6:1 vertical elongation!)
          float coarseThreads = fbmStreak(vec2((vUv.x + curl) * 14.0 + ${opts.flowSeed.toFixed(2)}, accelV * 2.1 + uTime * speed));
          float fineFilaments = fbmStreak(vec2((vUv.x - curl * 0.7) * 28.0 + ${opts.flowSeed.toFixed(2)} * 1.7, accelV * 3.8 + uTime * speed * 1.48));
          float fineSpray = noise(vec2(vUv.x * 52.0, vUv.y * 14.0 + uTime * speed * 2.15));

          // Braided river-chute channels (bright filaments separated by dark clear aqua troughs)
          float braidMask = 0.62 + 0.38 * sin((vUv.x + curl * 0.5) * 18.8 + ${opts.flowSeed.toFixed(2)});
          float filamentRaw = (coarseThreads * 0.48 + fineFilaments * 0.38 + fineSpray * 0.14) * mix(0.84, 1.16, braidMask);

          // Smooth glassy intake near crest -> strongly aerated whitewater toward plunge
          float aeroBoost = smoothstep(0.08, 0.85, fallProgress);
          float whiteFilaments = smoothstep(${opts.isVeil ? '0.50, 0.86' : '0.38, 0.78'}, filamentRaw + aeroBoost * 0.14);

          // Organic splash burst where cascade strikes the mid-cliff basalt shelf
          float ledgeImpact = exp(-pow((vUv.y - ${opts.shelfY.toFixed(2)}) / 0.085, 2.0)) * (0.45 + fineFilaments * 0.55);
          // Churning plunge splash at pool contact
          float plungeSplash = (1.0 - smoothstep(0.0, 0.24, vUv.y)) * (0.55 + fineFilaments * 0.45);
          // Smooth crest feathering tucked into rock lip (zero flat geometric cut at top!)
          float topFade = 1.0 - smoothstep(0.91, 1.0, vUv.y);
          float topCrestRoll = exp(-pow((vUv.y - 0.90) / 0.06, 2.0)) * 0.32;

          // Ragged, organic droplet-feathered left & right silhouettes (never crisp box edges!)
          float edgeNoise = (fineFilaments - 0.5) * 0.18;
          float edgeMask = smoothstep(0.02, 0.22, vUv.x + edgeNoise) * (1.0 - smoothstep(0.78, 0.98, vUv.x - edgeNoise));

          // Physically grounded mountain spring water palette: deep translucent teal-aqua core + crisp white aerated foam
          vec3 clearSpring = mix(
            vec3(0.05, 0.11, 0.17),
            mix(vec3(0.14, 0.33, 0.38), uSkyHorizon * 0.72, 0.28),
            uDayFactor
          );
          vec3 aeratedWhite = mix(vec3(0.42, 0.52, 0.64), vec3(0.95, 0.98, 1.0), uDayFactor);
          float foamMix = clamp(whiteFilaments * 0.88 + ledgeImpact * 0.78 + plungeSplash * 0.82 + topCrestRoll, 0.0, 1.0);
          vec3 col = mix(clearSpring, aeratedWhite, foamMix);

          // Grazing Fresnel sky sheen + subtle sunlit specular droplets on convex water threads
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 nrm = normalize(vWorldNormal);
          float fresnel = pow(1.0 - abs(dot(viewDir, nrm)), 2.5);
          float sparkle = smoothstep(0.74, 0.96, fineSpray * fineFilaments) * uDayFactor * 0.26;
          col += mix(vec3(0.4, 0.55, 0.72), vec3(0.92, 0.97, 1.0), uDayFactor) * (fresnel * 0.22 + sparkle);

          // Seamless atmospheric distance fog integration
          float distCam = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          float density = ${
            opts.isVeil
              ? 'whiteFilaments * 0.36 + ledgeImpact * 0.26 + plungeSplash * 0.30'
              : '0.26 + whiteFilaments * 0.58 + ledgeImpact * 0.36 + plungeSplash * 0.38'
          };
          float alpha = density * edgeMask * topFade;
          if (alpha < 0.018) discard;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, ${opts.isVeil ? '0.46' : '0.92'}));
        }
      `,
    });

  const mainWfMat = buildWaterfallShaderMat({ isVeil: false, flowSeed: 0.4, shelfY: 0.51, speedMult: 1.0 });
  const leftWfMat = buildWaterfallShaderMat({ isVeil: false, flowSeed: 3.1, shelfY: 0.36, speedMult: 1.12 });
  const rightWfMat = buildWaterfallShaderMat({ isVeil: false, flowSeed: 6.7, shelfY: 0.56, speedMult: 0.94 });
  const sprayVeilMat = buildWaterfallShaderMat({ isVeil: true, flowSeed: 1.9, shelfY: 0.51, speedMult: 1.24 });
  waterfallMats.push(mainWfMat, leftWfMat, rightWfMat, sprayVeilMat);

  const waterfallMesh = new THREE.Mesh(mainChuteGeo, mainWfMat);
  waterfallMesh.renderOrder = 3;
  wfAnchor.add(waterfallMesh);

  const leftWfMesh = new THREE.Mesh(leftVeilGeo, leftWfMat);
  leftWfMesh.renderOrder = 3;
  wfAnchor.add(leftWfMesh);

  const rightWfMesh = new THREE.Mesh(rightSteppedGeo, rightWfMat);
  rightWfMesh.renderOrder = 3;
  wfAnchor.add(rightWfMesh);

  const sprayVeilMesh = new THREE.Mesh(mainSprayVeilGeo, sprayVeilMat);
  sprayVeilMesh.renderOrder = 4;
  wfAnchor.add(sprayVeilMesh);

  group.add(wfAnchor);

  // Organic Turbulent Plunge-Pool Whitewater Foam Sheet (replaces synthetic concentric bullseye ring!)
  const plungeDiscGeo = new THREE.CircleGeometry(5.1, 44);
  plungeDiscGeo.rotateX(-Math.PI / 2);
  waterfallGeos.push(plungeDiscGeo);

  const plungeFoamMat = new THREE.ShaderMaterial({
    uniforms: waterfallUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vLocalPos;
      varying vec3 vWorldPos;
      void main() {
        vLocalPos = position.xz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDayFactor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vLocalPos;
      varying vec3 vWorldPos;

      float pHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 31.41);
        return fract(p.x * p.y);
      }

      float pNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x),
          mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float pFbm(vec2 p) {
        float v = 0.0;
        v += 0.52 * pNoise(p);
        v += 0.28 * pNoise(p * 2.18 + vec2(3.7, 1.4));
        v += 0.14 * pNoise(p * 4.45 - vec2(1.9, 4.8));
        return v;
      }

      void main() {
        vec2 p = vLocalPos;
        float r = length(p);
        // Domain-warped radial outward flow drifting naturally downstream (+x, +z)
        vec2 dir = r > 0.001 ? p / r : vec2(0.0, 1.0);
        vec2 advect = p * 0.92 - dir * uTime * 1.15 - vec2(0.45, 0.35) * uTime * 0.45;
        vec2 warp = vec2(
          pFbm(advect * 1.1 + vec2(1.3, 4.7)),
          pFbm(advect * 1.1 - vec2(2.8, 1.9))
        ) - 0.5;

        float lacyFoam = pFbm(advect * 1.85 + warp * 1.75);
        float fineBubbles = pNoise(advect * 5.2 - warp * 2.2);

        // Strongest turbulent boil directly beneath the 3 cascade impact zones, tapering organically outward
        float coreImpact = 1.0 - smoothstep(0.6, 2.75, r);
        float outerLace = (1.0 - smoothstep(1.4, 4.85, r)) * smoothstep(0.44, 0.78, lacyFoam * 0.72 + fineBubbles * 0.28);
        float foamAlpha = clamp(coreImpact * (0.48 + lacyFoam * 0.52) + outerLace * 0.56, 0.0, 0.86);

        vec3 col = mix(vec3(0.42, 0.52, 0.64), vec3(0.94, 0.98, 1.0), uDayFactor);
        float distCam = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        if (foamAlpha < 0.018) discard;
        gl_FragColor = vec4(col, foamAlpha * 0.78);
      }
    `,
  });
  waterfallMats.push(plungeFoamMat);

  const plungeFoamMesh = new THREE.Mesh(plungeDiscGeo, plungeFoamMat);
  plungeFoamMesh.position.set(-18.2, 0.05, -19.2);
  plungeFoamMesh.renderOrder = 3;
  group.add(plungeFoamMesh);

  // Soft Volumetric Rising Mist Clouds billowing gently from plunge pool & mid-cliff splash shelf
  const mistCount = 26;
  const mistGeo = new THREE.BufferGeometry();
  const mistPos = new Float32Array(mistCount * 3);
  const mistSeeds = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const isMidShelf = i >= 18;
    const ang = (i / mistCount) * Math.PI * 2 + i * 0.7;
    const rad = isMidShelf ? 0.4 + (i % 3) * 0.75 : 0.45 + (i % 4) * 0.85;
    if (isMidShelf) {
      // Mid-cliff splash mist right over the mid-ledge impact zone
      mistPos[i * 3] = -19.0 + Math.cos(ang) * rad;
      mistPos[i * 3 + 1] = 4.2 + (i % 3) * 0.45;
      mistPos[i * 3 + 2] = -20.6 + Math.sin(ang) * rad;
    } else {
      // Plunge-pool billowing mist
      mistPos[i * 3] = -18.2 + Math.cos(ang) * rad;
      mistPos[i * 3 + 1] = 0.35 + (i % 4) * 0.35;
      mistPos[i * 3 + 2] = -19.2 + Math.sin(ang) * rad;
    }
    mistSeeds[i * 3] = i * 1.73;
    mistSeeds[i * 3 + 1] = 0.62 + (i % 4) * 0.16;
    mistSeeds[i * 3 + 2] = isMidShelf ? 0.72 + (i % 3) * 0.16 : 0.92 + (i % 4) * 0.22;
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
        float life = fract(uTime * 0.20 * aSeed.y + aSeed.x);
        vec3 pos = position;
        pos.y += life * 2.65;
        pos.x += sin(life * 3.4 + aSeed.x) * 0.95 + life * 0.65;
        pos.z += cos(life * 3.1 + aSeed.x) * 0.85 + life * 0.55;
        vLifeAlpha = sin(life * 3.14159265) * 0.28;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp((210.0 * aSeed.z * (0.72 + life * 0.82) * uPixelRatio) / max(1.0, -mv.z), 10.0, 145.0);
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
        vec3 col = mix(vec3(0.45, 0.56, 0.70), vec3(0.95, 0.98, 1.0), uDayFactor);
        float alpha = tex.a * vLifeAlpha * (1.0 + uRainIntensity * 0.3);
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  waterfallMats.push(sprayMistMat);

  const sprayMistPoints = new THREE.Points(mistGeo, sprayMistMat);
  sprayMistPoints.frustumCulled = false;
  sprayMistPoints.renderOrder = 5;
  group.add(sprayMistPoints);

  // Fine Gravity-Arcing Falling Spray Droplets bouncing off mid-cliff ledges into plunge pool
  const dropCount = 48;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(dropCount * 3);
  const dropSeeds = new Float32Array(dropCount * 3);
  for (let i = 0; i < dropCount; i++) {
    const spread = ((i % 12) / 11 - 0.5) * 3.4;
    const isUpper = i % 2 === 0;
    const localX = spread;
    const localY = isUpper ? 7.8 - (i % 5) * 0.35 : 4.5 - (i % 4) * 0.25;
    const localZ = isUpper ? 2.1 : 3.0;
    // Transform from wfAnchor local space (rotY = 0.64) into world space
    const c = Math.cos(0.64);
    const s = Math.sin(0.64);
    dropPos[i * 3] = -20.4 + localX * c + localZ * s;
    dropPos[i * 3 + 1] = localY;
    dropPos[i * 3 + 2] = -22.5 - localX * s + localZ * c;
    dropSeeds[i * 3] = (i * 0.37) % 1.0;
    dropSeeds[i * 3 + 1] = 0.85 + (i % 5) * 0.14;
    dropSeeds[i * 3 + 2] = 0.65 + (i % 4) * 0.22;
  }
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  dropGeo.setAttribute('aSeed', new THREE.BufferAttribute(dropSeeds, 3));
  waterfallGeos.push(dropGeo);

  const sprayDropMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: waterfallUniforms.uTime,
      uDayFactor: waterfallUniforms.uDayFactor,
      uPixelRatio: { value: quality.pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vDropAlpha;
      void main() {
        float life = fract(uTime * 0.92 * aSeed.y + aSeed.x);
        vec3 pos = position;
        // Parabolic gravity fall curving outward toward plunge pool (+x, +z along waterfall axis)
        pos.x += life * 1.45 * aSeed.z;
        pos.z += life * 1.85 * aSeed.z;
        pos.y -= life * life * 5.2;
        vDropAlpha = sin(life * 3.14159265) * 0.72;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp((24.0 * aSeed.z * uPixelRatio) / max(1.0, -mv.z), 2.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDayFactor;
      varying float vDropAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.12, d);
        vec3 col = mix(vec3(0.52, 0.64, 0.78), vec3(0.96, 0.99, 1.0), uDayFactor);
        gl_FragColor = vec4(col, soft * vDropAlpha);
      }
    `,
  });
  waterfallMats.push(sprayDropMat);

  const sprayDropPoints = new THREE.Points(dropGeo, sprayDropMat);
  sprayDropPoints.frustumCulled = false;
  sprayDropPoints.renderOrder = 5;
  group.add(sprayDropPoints);

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
