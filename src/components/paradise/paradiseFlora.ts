import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import {
  gardenPathFactor,
  lakeSignedDist,
  sampleTerrainBiome,
  streamDistanceAndFlow,
  terrainHeightAt,
} from './paradiseTerrain.ts';

export interface TreeCanopySource {
  x: number;
  y: number;
  z: number;
  radius: number;
  kind: 'sakura' | 'ginkgo';
}

export interface ParadiseFloraHandle {
  group: THREE.Group;
  uniforms: {
    uTime: { value: number };
    uWindStrength: { value: number };
    uWetness: { value: number };
    uDewAmount: { value: number };
    uNightFactor: { value: number };
    uPointerPos: { value: THREE.Vector3 };
    uPointerStrength: { value: number };
  };
  flowerSpots: THREE.Vector3[];
  treeCanopies: TreeCanopySource[];
  update: (elapsed: number, windStrength: number, dewAmount: number, nightFactor: number) => void;
  dispose: () => void;
}

function seededRand(seedStart: number): () => number {
  let s = seedStart;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function sphericalizeCanopyNormals(geo: THREE.BufferGeometry, upBias = 0.28): void {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  center.y -= (box.max.y - box.min.y) * 0.14;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  let norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!norm) {
    norm = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('normal', norm);
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - center.x, pos.getY(i) - center.y, pos.getZ(i) - center.z);
    if (v.lengthSq() < 1e-6) {
      v.set(0, 1, 0);
    } else {
      v.normalize();
    }
    v.y += upBias;
    v.normalize();
    norm.setXYZ(i, v.x, v.y, v.z);
  }
  norm.needsUpdate = true;
}

interface TreePrototypeData {
  barkGeo: THREE.BufferGeometry;
  leafGeo: THREE.BufferGeometry;
  barkMat: THREE.Material;
  canopyCenterY: number;
  canopyRadius: number;
}

function measureCanopyBounds(leafGeo: THREE.BufferGeometry): { centerY: number; radius: number } {
  leafGeo.computeBoundingSphere();
  leafGeo.computeBoundingBox();
  const bs = leafGeo.boundingSphere;
  const bb = leafGeo.boundingBox;
  const centerY = bb ? (bb.min.y + bb.max.y) * 0.5 : 4.2;
  const radius = bs ? Math.max(1.8, bs.radius * 0.72) : 2.6;
  return { centerY, radius };
}

function buildSakuraPrototype(seed: number, scale: number): TreePrototypeData {
  const tree = new Tree();
  tree.loadPreset('Oak Medium');
  tree.options.seed = seed;
  tree.options.bark.type = 'birch';
  tree.options.bark.tint = 0x62433d;
  tree.options.bark.textureScale = { x: 1, y: 8 };
  tree.options.branch.levels = 3;
  tree.options.branch.length = { 0: 26, 1: 14.5, 2: 11.5, 3: 7.2 };
  tree.options.branch.radius = { 0: 1.45, 1: 0.72, 2: 0.42, 3: 0.22 };
  tree.options.branch.angle = { 1: 52, 2: 48, 3: 38 };
  tree.options.branch.children = { 0: 6, 1: 4, 2: 3 };
  tree.options.branch.gnarliness = { 0: 0.08, 1: 0.16, 2: 0.18, 3: 0.12 };
  tree.options.branch.start = { 1: 0.38, 2: 0.2, 3: 0.15 };
  tree.options.branch.force = { direction: { x: 0, y: 1, z: 0 }, strength: 0.008 };
  tree.options.leaves.count = 14;
  tree.options.leaves.size = 4.45;
  tree.options.leaves.sizeVariance = 0.6;
  tree.options.leaves.start = 0.14;
  tree.options.leaves.billboard = 'double';
  tree.generate();

  const barkGeo = tree.branchesMesh.geometry.clone();
  barkGeo.scale(scale, scale, scale);
  const leafGeo = tree.leavesMesh.geometry.clone();
  leafGeo.scale(scale, scale, scale);
  sphericalizeCanopyNormals(leafGeo, 0.32);
  const { centerY, radius } = measureCanopyBounds(leafGeo);

  const barkMat = tree.branchesMesh.material as THREE.Material;
  tree.leavesMesh.geometry.dispose();
  (tree.leavesMesh.material as THREE.Material).dispose();
  tree.branchesMesh.geometry.dispose();

  return { barkGeo, leafGeo, barkMat, canopyCenterY: centerY, canopyRadius: radius };
}

function buildGinkgoPrototype(seed: number, scale: number): TreePrototypeData {
  const tree = new Tree();
  tree.loadPreset('Ash Medium');
  tree.options.seed = seed;
  tree.options.bark.type = 'oak';
  tree.options.bark.tint = 0x877766;
  tree.options.bark.textureScale = { x: 1, y: 10 };
  tree.options.branch.levels = 3;
  tree.options.branch.length = { 0: 32, 1: 13.5, 2: 10.5, 3: 6.8 };
  tree.options.branch.radius = { 0: 1.32, 1: 0.66, 2: 0.38, 3: 0.2 };
  tree.options.branch.angle = { 1: 42, 2: 44, 3: 32 };
  tree.options.branch.children = { 0: 6, 1: 4, 2: 3 };
  tree.options.branch.gnarliness = { 0: 0.04, 1: 0.1, 2: 0.14, 3: 0.1 };
  tree.options.branch.start = { 1: 0.42, 2: 0.18, 3: 0.15 };
  tree.options.branch.force = { direction: { x: 0, y: 1, z: 0 }, strength: 0.018 };
  tree.options.leaves.count = 15;
  tree.options.leaves.size = 4.15;
  tree.options.leaves.sizeVariance = 0.58;
  tree.options.leaves.start = 0.15;
  tree.options.leaves.billboard = 'double';
  tree.generate();

  const barkGeo = tree.branchesMesh.geometry.clone();
  barkGeo.scale(scale, scale, scale);
  const leafGeo = tree.leavesMesh.geometry.clone();
  leafGeo.scale(scale, scale, scale);
  sphericalizeCanopyNormals(leafGeo, 0.35);
  const { centerY, radius } = measureCanopyBounds(leafGeo);

  const barkMat = tree.branchesMesh.material as THREE.Material;
  tree.leavesMesh.geometry.dispose();
  (tree.leavesMesh.material as THREE.Material).dispose();
  tree.branchesMesh.geometry.dispose();

  return { barkGeo, leafGeo, barkMat, canopyCenterY: centerY, canopyRadius: radius };
}

function buildPinePrototype(seed: number, scale: number): TreePrototypeData {
  const tree = new Tree();
  tree.loadPreset('Pine Medium');
  tree.options.seed = seed;
  tree.options.leaves.count = 16;
  tree.options.leaves.size = 3.6;
  tree.options.leaves.billboard = 'double';
  tree.generate();

  const barkGeo = tree.branchesMesh.geometry.clone();
  barkGeo.scale(scale, scale, scale);
  const leafGeo = tree.leavesMesh.geometry.clone();
  leafGeo.scale(scale, scale, scale);
  sphericalizeCanopyNormals(leafGeo, 0.4);
  const { centerY, radius } = measureCanopyBounds(leafGeo);

  const barkMat = tree.branchesMesh.material as THREE.Material;
  tree.leavesMesh.geometry.dispose();
  (tree.leavesMesh.material as THREE.Material).dispose();
  tree.branchesMesh.geometry.dispose();

  return { barkGeo, leafGeo, barkMat, canopyCenterY: centerY, canopyRadius: radius };
}

/**
 * Builds a multi-card spherical shrub clump geometry for natural garden azaleas & bushes
 */
function createShrubClusterGeo(): THREE.BufferGeometry {
  const cards: THREE.BufferGeometry[] = [];
  const cardOffsets: Array<[number, number, number, number, number, number]> = [
    [0, 0.42, 0, 0, 0, 1.0],
    [0, 0.42, 0, 0, Math.PI / 3, 0.96],
    [0, 0.42, 0, 0, (2 * Math.PI) / 3, 0.94],
    [0.18, 0.34, 0.16, 0.25, 0.4, 0.72],
    [-0.18, 0.34, -0.14, -0.22, -0.5, 0.72],
    [0, 0.56, 0, Math.PI / 2.6, 0.3, 0.75],
  ];
  for (const [ox, oy, oz, rx, ry, sc] of cardOffsets) {
    const p = new THREE.PlaneGeometry(0.92 * sc, 0.84 * sc);
    p.rotateX(rx);
    p.rotateY(ry);
    p.translate(ox, oy, oz);
    cards.push(p);
  }
  const merged = mergeGeometries(cards, false);
  cards.forEach((c) => c.dispose());
  sphericalizeCanopyNormals(merged, 0.42);
  return merged;
}

/**
 * Builds a crossed 2-card botanical flower clump geometry (replaces flat cone blooms!)
 */
function createCrossWildflowerGeo(): THREE.BufferGeometry {
  const p1 = new THREE.PlaneGeometry(0.32, 0.42);
  p1.translate(0, 0.21, 0);
  const p2 = new THREE.PlaneGeometry(0.32, 0.42);
  p2.rotateY(Math.PI / 2);
  p2.translate(0, 0.21, 0);
  const merged = mergeGeometries([p1, p2], false);
  p1.dispose();
  p2.dispose();
  merged.computeVertexNormals();
  return merged;
}

/**
 * Builds an articulated multi-petal 3D lotus flower (outer & inner whorl)
 */
function createSculptedLotusGeo(): THREE.BufferGeometry {
  const petals: THREE.BufferGeometry[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const count = ring === 0 ? 7 : 5;
    const tilt = ring === 0 ? 1.02 : 0.58;
    const sc = ring === 0 ? 1.0 : 0.78;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + ring * 0.35;
      const g = new THREE.SphereGeometry(0.065 * sc, 5, 4);
      g.scale(0.68, 1.65, 0.35);
      g.translate(0, 0.08 * sc, 0);
      g.rotateX(tilt);
      g.rotateY(ang);
      g.translate(Math.sin(ang) * 0.04, 0.03, Math.cos(ang) * 0.04);
      petals.push(g);
    }
  }
  const merged = mergeGeometries(petals, false);
  petals.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

export function createParadiseFlora(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseFloraHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const rand = seededRand(4099);

  const uniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 0.22 },
    uWetness: { value: 0.0 },
    uDewAmount: { value: 0.05 },
    uNightFactor: { value: 0.0 },
    uPointerPos: { value: new THREE.Vector3(0, -20, 0) },
    uPointerStrength: { value: 0.0 },
  };

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const applyBotanicalWind = (
    mat: THREE.MeshStandardMaterial,
    cfg: {
      freq: number;
      amp: number;
      heightFactor: number;
      pointerReactive?: boolean;
      nightBloomGlow?: boolean;
      translucencyColor?: string;
      cacheKey: string;
    }
  ) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindStrength = uniforms.uWindStrength;
      shader.uniforms.uWetness = uniforms.uWetness;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;
      shader.uniforms.uPointerPos = uniforms.uPointerPos;
      shader.uniforms.uPointerStrength = uniforms.uPointerStrength;

      shader.vertexShader =
        `uniform float uTime;\nuniform float uWindStrength;\nuniform vec3 uPointerPos;\nuniform float uPointerStrength;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 instWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float phase = instWorld.x * 0.045 + instWorld.z * 0.032;
            float microPhase = instWorld.x * 0.43 + instWorld.z * 0.37;
          #else
            vec4 instWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float phase = position.x * 0.05 + position.z * 0.04;
            float microPhase = position.x * 0.35 + position.z * 0.35;
          #endif
          float hWeight = clamp(position.y * ${cfg.heightFactor.toFixed(3)}, 0.0, 2.2);
          float hBend = hWeight * hWeight;
          // Traveling spatial wind front + local canopy flutter
          float gustFront = sin(phase - uTime * (0.45 + uWindStrength * 0.65)) * 0.6
                          + cos(phase * 1.4 - uTime * 0.9) * 0.4;
          float gust = gustFront * 0.55
                     + sin(uTime * ${cfg.freq.toFixed(2)} + microPhase) * 0.45
                     + cos(uTime * ${(cfg.freq * 1.73).toFixed(2)} - microPhase * 1.4) * 0.22;
          float windPush = (0.04 + uWindStrength * ${cfg.amp.toFixed(3)}) * hBend;
          transformed.x += (gust + uWindStrength * 0.42) * windPush;
          transformed.z += sin(uTime * ${(cfg.freq * 0.81).toFixed(2)} + microPhase * 1.3) * windPush * 0.65;
          ${
            cfg.pointerReactive
              ? `
          vec2 toPlant = instWorld.xz - uPointerPos.xz;
          float pDist = length(toPlant);
          float pInfluence = (1.0 - smoothstep(0.25, 2.9, pDist)) * uPointerStrength * hWeight;
          if (pInfluence > 0.001 && pDist > 0.001) {
            vec2 pushDir = toPlant / pDist;
            transformed.x += pushDir.x * pInfluence * 0.48;
            transformed.z += pushDir.y * pInfluence * 0.48;
            transformed.y -= pInfluence * 0.14;
          }
          `
              : ''
          }
          `
        );

      shader.fragmentShader =
        `uniform float uWetness;\nuniform float uNightFactor;\n` +
        shader.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            /* glsl */ `
            #include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, 0.18, uWetness * 0.8);
            `
          )
          .replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `
            #include <emissivemap_fragment>
            ${
              cfg.translucencyColor
                ? `totalEmissiveRadiance += diffuseColor.rgb * vec3(${cfg.translucencyColor}) * (1.0 - uNightFactor * 0.84);`
                : ''
            }
            ${
              cfg.nightBloomGlow
                ? `totalEmissiveRadiance += diffuseColor.rgb * uNightFactor * 0.09;`
                : ''
            }
            `
          );
    };
    mat.customProgramCacheKey = () => cfg.cacheKey;
  };

  // =========================================================================
  // 1. Procedural EZ-Tree Sakura (4 seeded trees), Golden Ginkgo (3 trees) & Pines
  // =========================================================================
  const sakuraLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sakuraClusterMap,
      color: 0xffffff,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.01,
    })
  );
  applyBotanicalWind(sakuraLeafMat, {
    freq: 1.18,
    amp: 0.11,
    heightFactor: 0.18,
    translucencyColor: '0.15, 0.10, 0.12',
    nightBloomGlow: true,
    cacheKey: 'paradise-ez-sakura-v2',
  });

  const ginkgoLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ginkgoClusterMap,
      color: 0xffffff,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.54,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(ginkgoLeafMat, {
    freq: 1.05,
    amp: 0.1,
    heightFactor: 0.16,
    translucencyColor: '0.18, 0.14, 0.04',
    cacheKey: 'paradise-ez-ginkgo-v2',
  });

  const pineLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.pineClusterMap,
      color: 0xffffff,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.82,
      metalness: 0.01,
    })
  );
  applyBotanicalWind(pineLeafMat, {
    freq: 0.72,
    amp: 0.07,
    heightFactor: 0.12,
    cacheKey: 'paradise-ez-pine-v2',
  });

  const sakuraProtos = [
    buildSakuraPrototype(1107, 0.185),
    buildSakuraPrototype(2419, 0.175),
    buildSakuraPrototype(3871, 0.195),
    buildSakuraPrototype(4603, 0.18),
  ];
  const ginkgoProtos = [
    buildGinkgoPrototype(5103, 0.195),
    buildGinkgoPrototype(6427, 0.21),
    buildGinkgoPrototype(7789, 0.185),
  ];
  const pineProtos = [
    buildPinePrototype(8821, 0.215),
    buildPinePrototype(9347, 0.23),
  ];

  for (const p of [...sakuraProtos, ...ginkgoProtos, ...pineProtos]) {
    trackGeo(p.barkGeo);
    trackGeo(p.leafGeo);
    trackMat(p.barkMat);
  }

  interface PlacementItem {
    x: number;
    y: number;
    z: number;
    rotY: number;
    scale: number;
    colorHex: number;
  }

  const isClearTreeSite = (x: number, z: number, minPathDist = 0.55): boolean => {
    const h = terrainHeightAt(x, z);
    if (h < 0.24) return false;
    if (lakeSignedDist(x, z) < 1.2) return false;
    const st = streamDistanceAndFlow(x, z);
    if (st.dist < st.width * 1.45) return false;
    if (gardenPathFactor(x, z) > minPathDist) return false;
    if (Math.hypot(x - 12.8, z + 7.8) < 4.7) return false;
    if (Math.hypot(x + 6.4, z + 8.4) < 4.8) return false;
    if (Math.hypot(x + 4.5, z - 23.5) < 4.4) return false;
    return true;
  };

  const heroSakuraCoords: Array<[number, number, number]> = [
    [16.8, -5.2, 1.12],
    [17.4, -10.4, 1.18],
    [9.8, -12.8, 1.08],
    [14.6, 5.4, 1.16],
    [9.2, 7.6, 1.05],
    [2.6, 8.2, 1.1],
    [-2.4, -13.2, 1.14],
    [3.8, -12.4, 1.06],
    [16.2, 11.2, 1.18],
    [11.4, 14.5, 1.1],
    [-2.6, 13.4, 1.04],
    [6.4, 17.6, 1.15],
  ];

  const heroGinkgoCoords: Array<[number, number, number]> = [
    [-11.2, -4.4, 1.16],
    [-12.6, -10.8, 1.12],
    [-14.8, 2.2, 1.22],
    [-9.6, 6.4, 1.1],
    [-13.4, 11.4, 1.18],
    [-17.8, 7.8, 1.24],
    [-18.6, -5.6, 1.2],
    [-15.2, -16.8, 1.14],
    [-8.4, 15.8, 1.08],
    [-16.4, 16.5, 1.18],
  ];

  const sakuraBuckets: PlacementItem[][] = sakuraProtos.map(() => []);
  const ginkgoBuckets: PlacementItem[][] = ginkgoProtos.map(() => []);
  const pineBuckets: PlacementItem[][] = pineProtos.map(() => []);

  const sakuraTints = [0xffffff, 0xffeef3, 0xffd7e3, 0xf8c3d4];
  const ginkgoTints = [0xffffff, 0xffe992, 0xffd456, 0xf5be3c];
  const pineTints = [0xffffff, 0xe8f3e4, 0xd8ead6];

  const placedTreeCoords: Array<[number, number]> = [];
  const hasRoomFromNeighbors = (x: number, z: number, minGap = 3.2) =>
    placedTreeCoords.every(([px, pz]) => Math.hypot(x - px, z - pz) >= minGap);

  for (let i = 0; i < heroSakuraCoords.length && i < quality.sakuraTreeCount; i++) {
    const [x, z, sc] = heroSakuraCoords[i];
    if (!isClearTreeSite(x, z)) continue;
    placedTreeCoords.push([x, z]);
    sakuraBuckets[i % sakuraProtos.length].push({
      x,
      y: terrainHeightAt(x, z) - 0.12,
      z,
      rotY: rand() * Math.PI * 2,
      scale: sc * (0.94 + rand() * 0.14),
      colorHex: sakuraTints[i % sakuraTints.length],
    });
  }

  let tries = 0;
  while (sakuraBuckets.reduce((a, b) => a + b.length, 0) < quality.sakuraTreeCount && tries < 950) {
    tries++;
    const angle = (rand() - 0.35) * Math.PI * 1.45;
    const dist = 10 + rand() * 44;
    const x = Math.cos(angle) * dist + 4.5;
    const z = Math.sin(angle) * dist - 2.0;
    if (x < -12 && rand() > 0.25) continue;
    if (!isClearTreeSite(x, z) || !hasRoomFromNeighbors(x, z, 3.35)) continue;
    const h = terrainHeightAt(x, z);
    if (h > 10.5) continue;
    placedTreeCoords.push([x, z]);
    const idx = Math.floor(rand() * sakuraProtos.length);
    sakuraBuckets[idx].push({
      x,
      y: h - 0.14,
      z,
      rotY: rand() * Math.PI * 2,
      scale: 0.85 + rand() * 0.42,
      colorHex: sakuraTints[Math.floor(rand() * sakuraTints.length)],
    });
  }

  for (let i = 0; i < heroGinkgoCoords.length && i < quality.ginkgoTreeCount; i++) {
    const [x, z, sc] = heroGinkgoCoords[i];
    if (!isClearTreeSite(x, z)) continue;
    placedTreeCoords.push([x, z]);
    ginkgoBuckets[i % ginkgoProtos.length].push({
      x,
      y: terrainHeightAt(x, z) - 0.12,
      z,
      rotY: rand() * Math.PI * 2,
      scale: sc * (0.94 + rand() * 0.15),
      colorHex: ginkgoTints[i % ginkgoTints.length],
    });
  }

  tries = 0;
  while (ginkgoBuckets.reduce((a, b) => a + b.length, 0) < quality.ginkgoTreeCount && tries < 950) {
    tries++;
    const x = -38 + rand() * 58;
    const z = -34 + rand() * 62;
    if (x > 6 && z > -6 && rand() > 0.24) continue;
    if (!isClearTreeSite(x, z) || !hasRoomFromNeighbors(x, z, 3.45)) continue;
    const h = terrainHeightAt(x, z);
    if (h > 11.5) continue;
    placedTreeCoords.push([x, z]);
    const idx = Math.floor(rand() * ginkgoProtos.length);
    ginkgoBuckets[idx].push({
      x,
      y: h - 0.14,
      z,
      rotY: rand() * Math.PI * 2,
      scale: 0.86 + rand() * 0.45,
      colorHex: ginkgoTints[Math.floor(rand() * ginkgoTints.length)],
    });
  }

  tries = 0;
  while (pineBuckets.reduce((a, b) => a + b.length, 0) < quality.pineTreeCount && tries < 700) {
    tries++;
    const ang = rand() * Math.PI * 2;
    const rad = 32 + rand() * 42;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (z > 20 && Math.abs(x) < 16) continue;
    const h = terrainHeightAt(x, z);
    if (h < 1.8 || !hasRoomFromNeighbors(x, z, 4.2)) continue;
    placedTreeCoords.push([x, z]);
    const idx = Math.floor(rand() * pineProtos.length);
    pineBuckets[idx].push({
      x,
      y: h - 0.18,
      z,
      rotY: rand() * Math.PI * 2,
      scale: 0.95 + rand() * 0.55,
      colorHex: pineTints[Math.floor(rand() * pineTints.length)],
    });
  }

  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  const treeCanopies: TreeCanopySource[] = [];

  const emitInstancedTrees = (
    protos: TreePrototypeData[],
    buckets: PlacementItem[][],
    leafMat: THREE.MeshStandardMaterial,
    canopyKind?: 'sakura' | 'ginkgo'
  ) => {
    for (let i = 0; i < protos.length; i++) {
      const items = buckets[i];
      if (items.length === 0) continue;
      const proto = protos[i];

      const barkMesh = new THREE.InstancedMesh(proto.barkGeo, proto.barkMat, items.length);
      barkMesh.castShadow = quality.enableShadows;
      barkMesh.receiveShadow = quality.enableShadows;

      const leafMesh = new THREE.InstancedMesh(proto.leafGeo, leafMat, items.length);
      leafMesh.castShadow = quality.enableShadows;
      leafMesh.receiveShadow = quality.enableShadows;

      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.rotY, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        barkMesh.setMatrixAt(j, dummy.matrix);
        leafMesh.setMatrixAt(j, dummy.matrix);

        cTmp.setHex(it.colorHex);
        leafMesh.setColorAt(j, cTmp);

        if (canopyKind && Math.hypot(it.x, it.z) < 34) {
          treeCanopies.push({
            x: it.x,
            y: it.y + proto.canopyCenterY * it.scale,
            z: it.z,
            radius: proto.canopyRadius * it.scale,
            kind: canopyKind,
          });
        }
      }

      barkMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      barkMesh.computeBoundingSphere();
      leafMesh.computeBoundingSphere();
      group.add(barkMesh, leafMesh);
    }
  };

  emitInstancedTrees(sakuraProtos, sakuraBuckets, sakuraLeafMat, 'sakura');
  emitInstancedTrees(ginkgoProtos, ginkgoBuckets, ginkgoLeafMat, 'ginkgo');
  emitInstancedTrees(pineProtos, pineBuckets, pineLeafMat);

  // =========================================================================
  // 2. Flowering Garden Azalea Shrubs (InstancedMesh around stones, bridge & plinth)
  // =========================================================================
  const shrubGeo = trackGeo(createShrubClusterGeo());
  const shrubMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.shrubClusterMap,
      alphaTest: 0.34,
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(shrubMat, {
    freq: 1.55,
    amp: 0.09,
    heightFactor: 1.2,
    pointerReactive: true,
    cacheKey: 'paradise-shrub-wind-v1',
  });

  const shrubMesh = new THREE.InstancedMesh(shrubGeo, shrubMat, quality.shrubCount);
  shrubMesh.castShadow = quality.enableShadows;
  shrubMesh.receiveShadow = quality.enableShadows;
  const shrubPalette = [0xffffff, 0xeef6ea, 0xf9e8ef, 0xdfeede];
  let sPlaced = 0;
  let sAttempts = 0;
  while (sPlaced < quality.shrubCount && sAttempts < quality.shrubCount * 10) {
    sAttempts++;
    const x = -22 + rand() * 44;
    const z = -22 + rand() * 42;
    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.2 || sample.height > 4.6 || sample.pathWeight > 0.38) continue;
    if (Math.hypot(x - 12.8, z + 7.8) < 3.6) continue;
    if (Math.hypot(x + 6.4, z + 8.4) < 3.4) continue;

    dummy.position.set(x, sample.height - 0.06, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const sc = 0.72 + rand() * 0.68;
    dummy.scale.set(sc * (0.9 + rand() * 0.25), sc * (0.8 + rand() * 0.3), sc * (0.9 + rand() * 0.25));
    dummy.updateMatrix();
    shrubMesh.setMatrixAt(sPlaced, dummy.matrix);
    cTmp.setHex(shrubPalette[Math.floor(rand() * shrubPalette.length)]);
    shrubMesh.setColorAt(sPlaced, cTmp);
    sPlaced++;
  }
  shrubMesh.count = sPlaced;
  shrubMesh.instanceMatrix.needsUpdate = true;
  if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;
  shrubMesh.computeBoundingSphere();
  group.add(shrubMesh);

  // =========================================================================
  // 3. Multi-Height Interactive Wind-Swept Meadow Grass & Tall Sedge Tufts
  // =========================================================================
  const buildCurvedGrassGeo = (w: number, h: number) => {
    const geo = trackGeo(new THREE.PlaneGeometry(w, h, 1, 4));
    geo.translate(0, h * 0.5, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, y / h));
      pos.setX(i, pos.getX(i) * (1 - t * 0.86));
      pos.setZ(i, Math.pow(t, 1.8) * (h * 0.24));
    }
    geo.computeVertexNormals();
    return geo;
  };

  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(grassMat, {
    freq: 2.35,
    amp: 0.24,
    heightFactor: 1.8,
    pointerReactive: true,
    cacheKey: 'paradise-grass-wind-v2',
  });

  // Short-to-mid lush meadow blades
  const bladeGeo = buildCurvedGrassGeo(0.088, 0.56);
  const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, quality.grassCount);
  grassMesh.receiveShadow = quality.enableShadows;
  const gColor = new THREE.Color();
  let gPlaced = 0;
  let attempts = 0;

  while (gPlaced < quality.grassCount && attempts < quality.grassCount * 5) {
    attempts++;
    const x = (rand() - 0.5) * 64;
    const z = (rand() - 0.5) * 58;
    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.16 || sample.height > 7.0 || sample.pathWeight > 0.34) continue;

    dummy.position.set(x, sample.height - 0.03, z);
    dummy.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI * 2, (rand() - 0.5) * 0.16);
    const sc = 0.72 + rand() * 0.92;
    dummy.scale.set(sc * (0.8 + rand() * 0.4), sc, sc);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gPlaced, dummy.matrix);

    if (x < -4 && rand() > 0.56) {
      gColor.setHSL(0.14 + rand() * 0.08, 0.52, 0.32 + rand() * 0.12);
    } else {
      gColor.setHSL(0.24 + (rand() - 0.5) * 0.06, 0.45 + rand() * 0.15, 0.23 + rand() * 0.14);
    }
    grassMesh.setColorAt(gPlaced, gColor);
    gPlaced++;
  }
  grassMesh.count = gPlaced;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);

  // Tall lakeside & bank ornamental grasses
  const tallBladeGeo = buildCurvedGrassGeo(0.095, 1.08);
  const tallGrassMesh = new THREE.InstancedMesh(tallBladeGeo, grassMat, quality.tallGrassCount);
  tallGrassMesh.receiveShadow = quality.enableShadows;
  let tgPlaced = 0;
  let tgAttempts = 0;
  while (tgPlaced < quality.tallGrassCount && tgAttempts < quality.tallGrassCount * 7) {
    tgAttempts++;
    const x = -22 + rand() * 48;
    const z = -22 + rand() * 44;
    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.06 || sample.height > 2.4 || sample.pathWeight > 0.28) continue;

    dummy.position.set(x, sample.height - 0.04, z);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    const sc = 0.78 + rand() * 0.62;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    tallGrassMesh.setMatrixAt(tgPlaced, dummy.matrix);
    gColor.setHSL(0.23 + (rand() - 0.5) * 0.05, 0.44 + rand() * 0.14, 0.26 + rand() * 0.12);
    tallGrassMesh.setColorAt(tgPlaced, gColor);
    tgPlaced++;
  }
  tallGrassMesh.count = tgPlaced;
  tallGrassMesh.instanceMatrix.needsUpdate = true;
  if (tallGrassMesh.instanceColor) tallGrassMesh.instanceColor.needsUpdate = true;
  tallGrassMesh.computeBoundingSphere();
  group.add(tallGrassMesh);

  // =========================================================================
  // 4. Multi-Petal Botanical Wildflowers (Crossed textured cards + Butterfly Anchors)
  // =========================================================================
  const flowerSpots: THREE.Vector3[] = [];
  const flowerGeo = trackGeo(createCrossWildflowerGeo());

  const flowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.wildflowerTex,
      alphaTest: 0.36,
      color: 0xffffff,
      roughness: 0.56,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(flowerMat, {
    freq: 2.2,
    amp: 0.22,
    heightFactor: 1.6,
    pointerReactive: true,
    nightBloomGlow: true,
    cacheKey: 'paradise-flower-wind-v2',
  });

  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, quality.flowerCount);
  const flowerPalette = [0xf8b9cb, 0xfef5dc, 0xcab6f4, 0xfcd77c, 0xffffff, 0x99c6f0];
  let fPlaced = 0;
  let fAttempts = 0;
  while (fPlaced < quality.flowerCount && fAttempts < quality.flowerCount * 6) {
    fAttempts++;
    const x = (rand() - 0.5) * 48;
    const z = (rand() - 0.5) * 44;
    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.22 || sample.height > 4.2 || sample.pathWeight > 0.32) continue;

    dummy.position.set(x, sample.height - 0.03, z);
    dummy.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI * 2, (rand() - 0.5) * 0.16);
    dummy.scale.setScalar(0.8 + rand() * 0.8);
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(fPlaced, dummy.matrix);

    gColor.setHex(flowerPalette[Math.floor(rand() * flowerPalette.length)]);
    flowerMesh.setColorAt(fPlaced, gColor);
    if (flowerSpots.length < 56) {
      flowerSpots.push(new THREE.Vector3(x, sample.height + 0.45, z));
    }
    fPlaced++;
  }
  flowerMesh.count = fPlaced;
  flowerMesh.instanceMatrix.needsUpdate = true;
  if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
  flowerMesh.computeBoundingSphere();
  group.add(flowerMesh);

  // =========================================================================
  // 5. Shoreline Reeds, Sculpted Multi-Petal Water Lotus & Floating Leaves
  // =========================================================================
  const reedGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.028, 1.45, 5));
  reedGeo.translate(0, 0.72, 0);
  const reedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b6e37,
      roughness: 0.72,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(reedMat, {
    freq: 1.55,
    amp: 0.26,
    heightFactor: 0.85,
    pointerReactive: true,
    cacheKey: 'paradise-reed-wind-v2',
  });

  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, quality.reedCount);
  let rPlaced = 0;
  let rAttempts = 0;
  while (rPlaced < quality.reedCount && rAttempts < quality.reedCount * 10) {
    rAttempts++;
    const x = -18 + rand() * 44;
    const z = -22 + rand() * 34;
    const h = terrainHeightAt(x, z);
    if (h < -0.25 || h > 0.36) continue;
    if (gardenPathFactor(x, z) > 0.4) continue;

    dummy.position.set(x, h - 0.06, z);
    dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
    const sc = 0.75 + rand() * 0.65;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    reedMesh.setMatrixAt(rPlaced, dummy.matrix);
    rPlaced++;
  }
  reedMesh.count = rPlaced;
  reedMesh.instanceMatrix.needsUpdate = true;
  reedMesh.computeBoundingSphere();
  group.add(reedMesh);

  // Floating Lily Pads & Sculpted Multi-Petal Lotus Blooms
  const padGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 12, 1, false, 0.15, Math.PI * 1.85));
  const padMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b6e38, roughness: 0.48, metalness: 0.04 }));
  const lotusGeo = trackGeo(createSculptedLotusGeo());
  const lotusMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf9bfd1,
      emissive: 0x451a2a,
      emissiveIntensity: 0.1,
      roughness: 0.46,
    })
  );

  const padMesh = new THREE.InstancedMesh(padGeo, padMat, quality.lotusCount);
  const lotusMesh = new THREE.InstancedMesh(lotusGeo, lotusMat, Math.ceil(quality.lotusCount * 0.55));
  let lPlaced = 0;
  let bPlaced = 0;
  let lAttempts = 0;
  while (lPlaced < quality.lotusCount && lAttempts < 600) {
    lAttempts++;
    const x = 1 + rand() * 11;
    const z = -6 + rand() * 9;
    const h = terrainHeightAt(x, z);
    if (h > -0.25) continue;

    dummy.position.set(x, 0.015, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.75 + rand() * 0.65);
    dummy.updateMatrix();
    padMesh.setMatrixAt(lPlaced, dummy.matrix);
    lPlaced++;

    if (bPlaced < lotusMesh.count && rand() > 0.42) {
      dummy.position.set(x + (rand() - 0.5) * 0.12, 0.04, z + (rand() - 0.5) * 0.12);
      dummy.scale.setScalar(0.85 + rand() * 0.42);
      dummy.updateMatrix();
      lotusMesh.setMatrixAt(bPlaced, dummy.matrix);
      bPlaced++;
    }
  }
  padMesh.count = lPlaced;
  padMesh.instanceMatrix.needsUpdate = true;
  padMesh.computeBoundingSphere();
  lotusMesh.count = bPlaced;
  lotusMesh.instanceMatrix.needsUpdate = true;
  lotusMesh.computeBoundingSphere();
  group.add(padMesh, lotusMesh);

  // Floating fallen Sakura Petals & Golden Ginkgo Leaves resting on water surface
  const waterPetalGeo = trackGeo(new THREE.PlaneGeometry(0.16, 0.16));
  waterPetalGeo.rotateX(-Math.PI / 2);
  const waterPetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sakuraPetalTex,
      alphaTest: 0.35,
      color: 0xffffff,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
  );
  const waterGinkgoMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ginkgoLeafTex,
      alphaTest: 0.35,
      color: 0xffffff,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
  );

  const halfFloat = Math.floor(quality.floatingLeafCount * 0.55);
  const floatPetals = new THREE.InstancedMesh(waterPetalGeo, waterPetalMat, halfFloat);
  const floatGinkgos = new THREE.InstancedMesh(waterPetalGeo, waterGinkgoMat, quality.floatingLeafCount - halfFloat);

  let fp = 0;
  let fg = 0;
  let fTries = 0;
  while ((fp < floatPetals.count || fg < floatGinkgos.count) && fTries < 2000) {
    fTries++;
    const x = -11 + rand() * 27;
    const z = -15 + rand() * 21;
    const h = terrainHeightAt(x, z);
    if (h > -0.14) continue;
    dummy.position.set(x, 0.018, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.75 + rand() * 0.75);
    dummy.updateMatrix();
    if (x < -1 && fg < floatGinkgos.count) {
      floatGinkgos.setMatrixAt(fg++, dummy.matrix);
    } else if (fp < floatPetals.count) {
      floatPetals.setMatrixAt(fp++, dummy.matrix);
    } else if (fg < floatGinkgos.count) {
      floatGinkgos.setMatrixAt(fg++, dummy.matrix);
    }
  }
  floatPetals.count = fp;
  floatGinkgos.count = fg;
  floatPetals.instanceMatrix.needsUpdate = true;
  floatGinkgos.instanceMatrix.needsUpdate = true;
  floatPetals.computeBoundingSphere();
  floatGinkgos.computeBoundingSphere();
  group.add(floatPetals, floatGinkgos);

  // =========================================================================
  // 6. Morning Dew / After-Rain Sparkling Micro-Droplets
  // =========================================================================
  const dewGeo = trackGeo(new THREE.OctahedronGeometry(0.025, 0));
  const dewMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6f7ff,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.05,
    })
  );
  const dewMesh = new THREE.InstancedMesh(dewGeo, dewMat, quality.dewCount);
  let dPlaced = 0;
  let dAttempts = 0;
  while (dPlaced < quality.dewCount && dAttempts < quality.dewCount * 5) {
    dAttempts++;
    const x = (rand() - 0.5) * 30;
    const z = (rand() - 0.5) * 28;
    const h = terrainHeightAt(x, z);
    if (h < 0.22 || h > 3.5) continue;
    dummy.position.set(x, h + 0.34 + rand() * 0.24, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.7 + rand() * 0.7);
    dummy.updateMatrix();
    dewMesh.setMatrixAt(dPlaced, dummy.matrix);
    dPlaced++;
  }
  dewMesh.count = dPlaced;
  dewMesh.instanceMatrix.needsUpdate = true;
  dewMesh.computeBoundingSphere();
  group.add(dewMesh);

  const update = (elapsed: number, windStrength: number, dewAmount: number, nightFactor: number) => {
    uniforms.uTime.value = elapsed;
    uniforms.uWindStrength.value = windStrength;
    uniforms.uDewAmount.value = dewAmount;
    uniforms.uNightFactor.value = nightFactor;
    dewMat.opacity = Math.min(0.88, dewAmount * 0.85);
    dewMesh.visible = dewAmount > 0.03;
  };

  return {
    group,
    uniforms,
    flowerSpots,
    treeCanopies,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
