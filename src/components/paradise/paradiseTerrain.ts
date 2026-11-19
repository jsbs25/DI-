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
export function streamDistanceAndFlow(x: number, z: number): { dist: number; width: number; isPlungePool: boolean } {
  const ax = -20;
  const az = -21;
  const bx = 5;
  const bz = -2;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const proj = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  const meander = Math.sin(proj * Math.PI * 2.2) * 2.1;
  const cx = ax + dx * proj - dz * (meander / Math.sqrt(len2));
  const cz = az + dz * proj + dx * (meander / Math.sqrt(len2));
  const distStream = Math.hypot(x - cx, z - cz);

  const distPool = Math.hypot(x - -19.5, z - -20.5);
  const isPlungePool = distPool < 4.7;

  const ox = 13;
  const oz = -1;
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

  const width = distPool < 5.0 ? 4.35 : 2.45;
  return {
    dist: Math.min(distStream, distPool * 0.72, distOutlet),
    width,
    isPlungePool,
  };
}

/**
 * Lake signed distance (negative inside lake)
 */
export function lakeSignedDist(x: number, z: number): number {
  const lx = (x - 5.5) / 11.2;
  const lz = (z + 1.8) / 7.5;
  const wobble = Math.sin(x * 0.28 + z * 0.21) * 0.11 + Math.cos(x * 0.17 - z * 0.31) * 0.08;
  return (Math.hypot(lx, lz) - 1.0 + wobble) * 8.2;
}

/**
 * Curved natural garden stone footpath: foreground meadow -> arched bridge -> pavilion terrace
 */
export function gardenPathFactor(x: number, z: number): number {
  const p0x = 0.5;
  const p0z = 19.0;
  const p1x = -7.8;
  const p1z = -4.0;
  const dx1 = p1x - p0x;
  const dz1 = p1z - p0z;
  const t1 = Math.max(0, Math.min(1, ((x - p0x) * dx1 + (z - p0z) * dz1) / (dx1 * dx1 + dz1 * dz1)));
  const sway1 = Math.sin(t1 * Math.PI) * 3.1;
  const d1 = Math.hypot(x - (p0x + dx1 * t1 + sway1), z - (p0z + dz1 * t1));

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
  return 1 - smoothstep(0.68, 1.95, d);
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

  const pavDist = Math.hypot(x - 12.8, z + 7.8);
  const pavFlat = 1 - smoothstep(2.8, 6.0, pavDist);
  h = THREE.MathUtils.lerp(h, 0.94, pavFlat);

  const restDist = Math.hypot(x + 11.4, z - 5.8);
  const restFlat = 1 - smoothstep(2.1, 4.4, restDist);
  h = THREE.MathUtils.lerp(h, 1.38, restFlat);

  const stream = streamDistanceAndFlow(x, z);
  const streamCarve = 1 - smoothstep(stream.width * 0.48, stream.width * 1.5, stream.dist);
  if (streamCarve > 0) {
    const streamBottom = stream.isPlungePool ? -1.55 : -0.84;
    h = THREE.MathUtils.lerp(h, streamBottom, streamCarve);
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
  const cShoreSand = new THREE.Color(0x7c745e);
  const cMeadow = new THREE.Color(0x3a6133);
  const cMeadowRich = new THREE.Color(0x284d28);
  const cPathStone = new THREE.Color(0x8c877c);
  const cCliffRock = new THREE.Color(0x555b62);
  const cFarMountain = new THREE.Color(0x294437);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const sample = sampleTerrainBiome(x, z);
    posAttr.setY(i, sample.height);

    const n = noise2(x * 0.16 + 7.2, z * 0.16 - 3.4);
    tmpColor.copy(cMeadow).lerp(cMeadowRich, n);

    if (sample.height < 0.05) {
      tmpColor.lerp(cDeepBed, smoothstep(0.05, -0.85, sample.height));
    }
    if (sample.shoreWeight > 0) {
      tmpColor.lerp(cShoreSand, sample.shoreWeight * 0.8);
    }
    if (sample.pathWeight > 0) {
      tmpColor.lerp(cPathStone, sample.pathWeight * 0.86);
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
    roughness: 0.9,
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
          vec3 petalCarpetCol = mix(vec3(0.78, 0.55, 0.62), vec3(0.95, 0.78, 0.84), detailMicro);
          diffuseColor.rgb = mix(diffuseColor.rgb, petalCarpetCol, sakuraZone * sakuraPatch * 0.56);

          diffuseColor.rgb *= mix(0.86, 1.14, detailMicro);

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
  terrainMat.customProgramCacheKey = () => 'paradise-terrain-pbr-v3';

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
  // Multi-Stage Cascading Waterfall Sheet
  // -------------------------------------------------------------------------
  const wfGeo = new THREE.CylinderGeometry(2.2, 2.95, 11.8, 28, 20, true, -0.54, 1.08);
  const wfPos = wfGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wfPos.count; i++) {
    const vy = wfPos.getY(i);
    const fallT = Math.max(0, Math.min(1, 1 - (vy + 5.9) / 11.8));
    const stepLedge = Math.sin(fallT * Math.PI * 2) * 0.18;
    wfPos.setZ(i, wfPos.getZ(i) + Math.pow(fallT, 1.32) * 2.45 + stepLedge);
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
        float speed = 1.75 + uRainIntensity * 0.8;
        vec2 uv1 = vec2(vUv.x * 8.0, vUv.y * 4.2 + uTime * speed);
        vec2 uv2 = vec2(vUv.x * 16.0 + 0.5, vUv.y * 7.5 + uTime * speed * 1.45);
        float streak1 = noise(uv1);
        float streak2 = noise(uv2);
        float foam = smoothstep(0.38, 0.84, streak1 * 0.62 + streak2 * 0.38);

        float midLedge = exp(-pow((vUv.y - 0.52) / 0.1, 2.0)) * 0.55;
        float bottomSpray = 1.0 - smoothstep(0.0, 0.32, vUv.y);
        float topCrest = smoothstep(0.84, 1.0, vUv.y);
        float edgeFade = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));

        vec3 waterBase = mix(vec3(0.14, 0.22, 0.32), mix(vec3(0.48, 0.68, 0.78), uSkyHorizon, 0.35), uDayFactor);
        vec3 foamColor = mix(vec3(0.45, 0.54, 0.68), vec3(0.96, 0.98, 1.0), uDayFactor);
        vec3 col = mix(waterBase, foamColor, clamp(foam * 0.85 + bottomSpray * 0.65 + topCrest * 0.5 + midLedge, 0.0, 1.0));

        float distCam = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distCam * distCam);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = (0.45 + foam * 0.42 + bottomSpray * 0.22) * edgeFade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.94));
      }
    `,
  });

  const waterfallMesh = new THREE.Mesh(wfGeo, wfMat);
  waterfallMesh.position.set(-20.4, 5.0, -22.5);
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
      wfGeo.dispose();
      wfMat.dispose();
    },
  };
}
