import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import {
  BRIDGE_CONFIG,
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
  barkMat?: THREE.Material;
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

/**
 * Generates an organic tapered cylindrical limb mesh along a CatmullRom spline,
 * optionally including natural root-buttress flutes at the trunk base (t < 0.24).
 */
function buildTaperedLimbGeo(
  points: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs: number,
  radialSegs: number,
  rootFlutes = 0,
  uvTileY = 2.0
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const nVec = new THREE.Vector3();
  const vPos = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    // Smooth taper + basal root flare at trunk base
    const baseFlare = rootFlutes > 0 ? Math.pow(Math.max(0, 1 - t / 0.24), 2.1) * 0.55 : 0;
    const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.86)) * (1 + baseFlare);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Organic root buttress lobes near ground level
      const flute =
        rootFlutes > 0
          ? 1 +
            Math.pow(Math.max(0, 1 - t / 0.24), 1.8) *
              0.28 *
              Math.cos(theta * rootFlutes + t * 2.2)
          : 1;

      const r = baseR * flute;
      nVec
        .set(0, 0, 0)
        .addScaledVector(N, cosT)
        .addScaledVector(B, sinT)
        .normalize();

      vPos.copy(pt).addScaledVector(nVec, r);
      positions.push(vPos.x, vPos.y, vPos.z);
      normals.push(nVec.x, nVec.y, nVec.z);
      uvs.push(u, t * uvTileY);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
  geo.setAttribute('uv', uvAttr);
  geo.setAttribute('uv2', uvAttr);
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds a compact 3D cupped 3-plane botanical spray rosette (never a flat square card)
 * with gently arched silhouettes and radial AO vertex shading.
 */
function createCuppedSprayRosette(
  size: number,
  center: THREE.Vector3,
  crownCenter: THREE.Vector3,
  crownRadius: number,
  rand: () => number
): THREE.BufferGeometry {
  const planes: THREE.BufferGeometry[] = [];
  const angles: Array<[number, number, number]> = [
    [(rand() - 0.5) * 0.55, rand() * Math.PI, (rand() - 0.5) * 0.45],
    [0.36 + (rand() - 0.5) * 0.42, Math.PI / 3 + rand() * 0.4, (rand() - 0.5) * 0.42],
    [-0.34 + (rand() - 0.5) * 0.42, (2 * Math.PI) / 3 + rand() * 0.4, (rand() - 0.5) * 0.42],
    [Math.PI * 0.42 + (rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.35],
  ];

  const distFromCore = center.distanceTo(crownCenter);
  const aoFactor = THREE.MathUtils.clamp(0.68 + (distFromCore / Math.max(1.2, crownRadius)) * 0.36, 0.65, 1.04);

  for (const [rx, ry, rz] of angles) {
    const p = new THREE.PlaneGeometry(size, size, 2, 2);
    const pos = p.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const r2 = (px * px + py * py) / (size * size * 0.25);
      // Gentle dome cup so clusters read volumetrically from every camera angle
      pos.setZ(i, (0.14 - r2 * 0.26) * size);
    }
    p.rotateX(rx);
    p.rotateY(ry);
    p.rotateZ(rz);
    p.translate(center.x, center.y, center.z);

    // Bake soft interior-to-exterior botanical occlusion into vertex colors
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const sunLift = THREE.MathUtils.clamp(0.86 + (vy - center.y) * 0.16, 0.72, 1.06);
      const shade = aoFactor * sunLift;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    p.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planes.push(p);
  }

  const merged = mergeGeometries(planes, false);
  planes.forEach((pl) => pl.dispose());
  return merged;
}

/**
 * Generates an authentic multi-level *Prunus serrulata* Sakura tree:
 * flared root buttresses, sinuous mahogany trunk, wide spreading arched boughs,
 * fine dark twigs, and dense volumetric blossom rosettes anchored strictly at twig tips.
 */
function buildSakuraPrototype(seed: number, scale: number): TreePrototypeData {
  const rand = seededRand(seed);
  const branchGeos: THREE.BufferGeometry[] = [];
  const twigTips: Array<{ pos: THREE.Vector3; size: number }> = [];

  // Level 0: Flared gnarly trunk with gentle natural lean
  const trunkH = (2.25 + rand() * 0.45) * scale * 5.2;
  const leanX = (rand() - 0.5) * 0.55;
  const leanZ = (rand() - 0.5) * 0.55;
  const trunkPts = [
    new THREE.Vector3(0, -0.15, 0),
    new THREE.Vector3(leanX * 0.35, trunkH * 0.34, leanZ * 0.35),
    new THREE.Vector3(leanX * 0.75, trunkH * 0.68, leanZ * 0.75),
    new THREE.Vector3(leanX, trunkH, leanZ),
  ];
  const trunkTop = trunkPts[3];
  const trunkR = 0.24 * scale * 5.2;
  branchGeos.push(buildTaperedLimbGeo(trunkPts, trunkR, trunkR * 0.52, 9, 9, 5, 2.5));

  // Level 1: 4-5 wide spreading primary cherry limbs radiating in vase silhouette
  const primaryCount = 5;
  const baseYaw = rand() * Math.PI * 2;
  for (let i = 0; i < primaryCount; i++) {
    const yaw = baseYaw + (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.38;
    const elev = 0.48 + rand() * 0.38; // spreading outward & upward
    const len = (2.15 + rand() * 0.65) * scale * 5.2;
    const attachT = 0.72 + (i % 2) * 0.12 + rand() * 0.14;
    const startPos = new THREE.Vector3().lerpVectors(trunkPts[1], trunkTop, attachT);

    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const pMid = new THREE.Vector3(
      startPos.x + dirX * len * 0.52,
      startPos.y + elev * len * 0.65,
      startPos.z + dirZ * len * 0.52
    );
    const pEnd = new THREE.Vector3(
      startPos.x + dirX * len,
      startPos.y + elev * len * 0.96 - 0.14, // subtle graceful cherry bough arch
      startPos.z + dirZ * len
    );
    const r1 = trunkR * (0.44 - (i % 2) * 0.05);
    branchGeos.push(buildTaperedLimbGeo([startPos, pMid, pEnd], r1, r1 * 0.44, 6, 7, 0, 1.8));

    // Level 2: 3 spreading secondary branches per primary limb
    for (let j = 0; j < 3; j++) {
      const subT = 0.42 + (j / 2) * 0.55;
      const subOrigin = new THREE.Vector3().lerpVectors(pMid, pEnd, subT);
      const subYaw = yaw + (j - 1) * 0.62 + (rand() - 0.5) * 0.25;
      const subLen = (1.25 + rand() * 0.45) * scale * 5.2;
      const subElev = 0.22 + rand() * 0.38;
      const sMid = new THREE.Vector3(
        subOrigin.x + Math.cos(subYaw) * subLen * 0.54,
        subOrigin.y + subElev * subLen * 0.65,
        subOrigin.z + Math.sin(subYaw) * subLen * 0.54
      );
      const sEnd = new THREE.Vector3(
        subOrigin.x + Math.cos(subYaw) * subLen,
        subOrigin.y + subElev * subLen * 0.85 - 0.1,
        subOrigin.z + Math.sin(subYaw) * subLen
      );
      const r2 = r1 * 0.48;
      branchGeos.push(buildTaperedLimbGeo([subOrigin, sMid, sEnd], r2, r2 * 0.36, 5, 5, 0, 1.2));

      // Level 3: Fine terminal twigs & blossom rosette anchors
      for (let k = 0; k < 3; k++) {
        const twigT = 0.45 + (k / 2) * 0.55;
        const twOrigin = new THREE.Vector3().lerpVectors(sMid, sEnd, twigT);
        const twYaw = subYaw + (k - 1) * 0.68 + (rand() - 0.5) * 0.35;
        const twLen = (0.65 + rand() * 0.32) * scale * 5.2;
        const twEnd = new THREE.Vector3(
          twOrigin.x + Math.cos(twYaw) * twLen,
          twOrigin.y + (0.08 + rand() * 0.34) * twLen - 0.08,
          twOrigin.z + Math.sin(twYaw) * twLen
        );
        branchGeos.push(buildTaperedLimbGeo([twOrigin, twEnd], r2 * 0.42, r2 * 0.16, 3, 4, 0, 0.8));
        twigTips.push({ pos: twEnd, size: (1.36 + rand() * 0.44) * scale * 5.2 });
        if (k !== 1) {
          twigTips.push({
            pos: new THREE.Vector3().lerpVectors(twOrigin, twEnd, 0.48),
            size: (1.14 + rand() * 0.32) * scale * 5.2,
          });
        }
      }
    }
  }

  // Crown apex shoot
  const topEnd = new THREE.Vector3(leanX * 1.1, trunkH + 1.65 * scale * 5.2, leanZ * 1.1);
  branchGeos.push(buildTaperedLimbGeo([trunkTop, topEnd], trunkR * 0.36, trunkR * 0.14, 4, 6, 0, 1.2));
  for (let c = 0; c < 4; c++) {
    const a = (c * Math.PI) / 2 + rand() * 0.5;
    twigTips.push({
      pos: new THREE.Vector3(
        topEnd.x + Math.cos(a) * 0.65 * scale * 5.2,
        topEnd.y + (rand() - 0.3) * 0.45 * scale * 5.2,
        topEnd.z + Math.sin(a) * 0.65 * scale * 5.2
      ),
      size: (1.42 + rand() * 0.36) * scale * 5.2,
    });
  }

  const barkGeo = mergeGeometries(branchGeos, false);
  branchGeos.forEach((g) => g.dispose());
  if (barkGeo.attributes.uv) barkGeo.setAttribute('uv2', barkGeo.attributes.uv);

  // Compute crown centroid for spherical normal & AO shading
  const crownCenter = new THREE.Vector3();
  twigTips.forEach((t) => crownCenter.add(t.pos));
  crownCenter.divideScalar(Math.max(1, twigTips.length));
  let maxDist = 1.5;
  for (const t of twigTips) maxDist = Math.max(maxDist, t.pos.distanceTo(crownCenter));

  const leafGeos = twigTips.map((t) => createCuppedSprayRosette(t.size, t.pos, crownCenter, maxDist, rand));
  const leafGeo = mergeGeometries(leafGeos, false);
  leafGeos.forEach((g) => g.dispose());
  sphericalizeCanopyNormals(leafGeo, 0.35);

  const { centerY, radius } = measureCanopyBounds(leafGeo);
  return { barkGeo, leafGeo, canopyCenterY: centerY, canopyRadius: radius };
}

/**
 * Generates an authentic tall pyramidal *Ginkgo biloba* tree:
 * deep root-buttressed straight trunk, ascending limbs in layered tiers,
 * and dense golden fan-shaped leaf rosettes.
 */
function buildGinkgoPrototype(seed: number, scale: number): TreePrototypeData {
  const rand = seededRand(seed);
  const branchGeos: THREE.BufferGeometry[] = [];
  const twigTips: Array<{ pos: THREE.Vector3; size: number }> = [];

  const totalH = (6.3 + rand() * 0.9) * scale * 5.1;
  const swayX = (rand() - 0.5) * 0.32;
  const swayZ = (rand() - 0.5) * 0.32;
  const trunkPts = [
    new THREE.Vector3(0, -0.15, 0),
    new THREE.Vector3(swayX * 0.3, totalH * 0.28, swayZ * 0.3),
    new THREE.Vector3(swayX * 0.85, totalH * 0.62, swayZ * 0.85),
    new THREE.Vector3(swayX * 0.5, totalH * 0.92, swayZ * 0.5),
  ];
  const trunkR = 0.22 * scale * 5.1;
  branchGeos.push(buildTaperedLimbGeo(trunkPts, trunkR, trunkR * 0.16, 11, 9, 5, 3.5));

  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  const tierCount = 4;
  const baseYaw = rand() * Math.PI * 2;

  for (let tier = 0; tier < tierCount; tier++) {
    const tierFrac = 0.34 + (tier / (tierCount - 1)) * 0.56;
    const limbsInTier = tier === 0 ? 4 : tier === 1 ? 4 : tier === 2 ? 4 : 3;
    const tierRadiusScale = 1.08 - tier * 0.21;

    for (let i = 0; i < limbsInTier; i++) {
      const yaw = baseYaw + tier * 0.72 + (i / limbsInTier) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const origin = trunkCurve.getPointAt(Math.min(0.96, tierFrac + (rand() - 0.5) * 0.04));
      const len = (1.85 + rand() * 0.45) * tierRadiusScale * scale * 5.1;
      const elev = 0.58 + tier * 0.12 + rand() * 0.18; // ascending classic ginkgo angles

      const dirX = Math.cos(yaw);
      const dirZ = Math.sin(yaw);
      const pMid = new THREE.Vector3(
        origin.x + dirX * len * 0.52,
        origin.y + elev * len * 0.52,
        origin.z + dirZ * len * 0.52
      );
      const pEnd = new THREE.Vector3(
        origin.x + dirX * len,
        origin.y + elev * len * 0.92,
        origin.z + dirZ * len
      );
      const r1 = trunkR * (0.4 - tier * 0.06);
      branchGeos.push(buildTaperedLimbGeo([origin, pMid, pEnd], r1, r1 * 0.32, 5, 6, 0, 1.5));

      // Secondary spur branches
      for (let j = 0; j < 2; j++) {
        const subOrigin = new THREE.Vector3().lerpVectors(pMid, pEnd, 0.45 + j * 0.45);
        const subYaw = yaw + (j === 0 ? -0.58 : 0.58) + (rand() - 0.5) * 0.25;
        const subLen = (0.85 + rand() * 0.35) * tierRadiusScale * scale * 5.1;
        const subEnd = new THREE.Vector3(
          subOrigin.x + Math.cos(subYaw) * subLen,
          subOrigin.y + (0.42 + rand() * 0.24) * subLen,
          subOrigin.z + Math.sin(subYaw) * subLen
        );
        branchGeos.push(buildTaperedLimbGeo([subOrigin, subEnd], r1 * 0.45, r1 * 0.15, 3, 4, 0, 0.9));
        twigTips.push({ pos: subEnd, size: (1.22 + rand() * 0.36) * scale * 5.1 });
      }
      twigTips.push({ pos: pEnd, size: (1.28 + rand() * 0.35) * scale * 5.1 });
    }
  }

  // Crown spire tip
  const crownPeak = trunkCurve.getPointAt(1.0);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + rand() * 0.4;
    twigTips.push({
      pos: new THREE.Vector3(
        crownPeak.x + Math.cos(a) * 0.35 * scale * 5.1,
        crownPeak.y + (0.25 + rand() * 0.35) * scale * 5.1,
        crownPeak.z + Math.sin(a) * 0.35 * scale * 5.1
      ),
      size: (1.18 + rand() * 0.25) * scale * 5.1,
    });
  }

  const barkGeo = mergeGeometries(branchGeos, false);
  branchGeos.forEach((g) => g.dispose());
  if (barkGeo.attributes.uv) barkGeo.setAttribute('uv2', barkGeo.attributes.uv);

  const crownCenter = new THREE.Vector3();
  twigTips.forEach((t) => crownCenter.add(t.pos));
  crownCenter.divideScalar(Math.max(1, twigTips.length));
  let maxDist = 1.5;
  for (const t of twigTips) maxDist = Math.max(maxDist, t.pos.distanceTo(crownCenter));

  const leafGeos = twigTips.map((t) => createCuppedSprayRosette(t.size, t.pos, crownCenter, maxDist, rand));
  const leafGeo = mergeGeometries(leafGeos, false);
  leafGeos.forEach((g) => g.dispose());
  sphericalizeCanopyNormals(leafGeo, 0.38);

  const { centerY, radius } = measureCanopyBounds(leafGeo);
  return { barkGeo, leafGeo, canopyCenterY: centerY, canopyRadius: radius };
}

function buildPinePrototype(seed: number, scale: number): TreePrototypeData {
  const tree = new Tree();
  tree.loadPreset('Pine Medium');
  tree.options.seed = seed;
  tree.options.leaves.count = 16;
  tree.options.leaves.size = 3.4;
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
 * Builds a crossed 2-card botanical flower clump geometry
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
      verticalBladeAO?: boolean;
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
        `uniform float uTime;\nuniform float uWindStrength;\nuniform vec3 uPointerPos;\nuniform float uPointerStrength;\n${
          cfg.verticalBladeAO ? 'varying float vBladeT;\n' : ''
        }` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          ${cfg.verticalBladeAO ? 'vBladeT = clamp(uv.y, 0.0, 1.0);' : ''}
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
        `uniform float uWetness;\nuniform float uNightFactor;\n${
          cfg.verticalBladeAO ? 'varying float vBladeT;\n' : ''
        }` +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            /* glsl */ `
            #include <color_fragment>
            ${
              cfg.verticalBladeAO
                ? `
            float rootAo = mix(0.46, 1.14, smoothstep(0.0, 0.88, vBladeT));
            diffuseColor.rgb *= vec3(rootAo * mix(0.92, 1.06, vBladeT), rootAo, rootAo * mix(0.95, 0.88, vBladeT));
            `
                : ''
            }
            `
          )
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
  // 1. Authentic Botanical Sakura & Ginkgo Trees + Background Alpine Pines
  // =========================================================================
  const sakuraBarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sakuraBarkMap,
      normalMap: textures.sakuraBarkNormalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      aoMap: textures.barkAoMap,
      aoMapIntensity: 0.72,
      roughnessMap: textures.barkRoughnessMap,
      roughness: 0.86,
      metalness: 0.03,
    })
  );

  const ginkgoBarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ginkgoBarkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      aoMap: textures.barkAoMap,
      aoMapIntensity: 0.95,
      roughnessMap: textures.barkRoughnessMap,
      roughness: 0.96,
      metalness: 0.02,
    })
  );

  const sakuraLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sakuraClusterMap,
      color: 0xffffff,
      vertexColors: true,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 0.58,
      metalness: 0.01,
    })
  );
  applyBotanicalWind(sakuraLeafMat, {
    freq: 1.15,
    amp: 0.09,
    heightFactor: 0.18,
    translucencyColor: '0.16, 0.10, 0.12',
    nightBloomGlow: true,
    cacheKey: 'paradise-botanical-sakura-v4',
  });

  const ginkgoLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ginkgoClusterMap,
      color: 0xffffff,
      vertexColors: true,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(ginkgoLeafMat, {
    freq: 1.02,
    amp: 0.085,
    heightFactor: 0.15,
    translucencyColor: '0.19, 0.14, 0.03',
    cacheKey: 'paradise-botanical-ginkgo-v4',
  });

  const pineLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.pineClusterMap,
      color: 0xffffff,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 0.82,
      metalness: 0.01,
    })
  );
  applyBotanicalWind(pineLeafMat, {
    freq: 0.72,
    amp: 0.06,
    heightFactor: 0.12,
    cacheKey: 'paradise-ez-pine-v3',
  });

  const sakuraProtos = [
    buildSakuraPrototype(1107, 0.195),
    buildSakuraPrototype(2419, 0.185),
    buildSakuraPrototype(3871, 0.21),
    buildSakuraPrototype(4603, 0.19),
  ];
  const ginkgoProtos = [
    buildGinkgoPrototype(5103, 0.195),
    buildGinkgoPrototype(6427, 0.215),
    buildGinkgoPrototype(7789, 0.185),
  ];
  const pineProtos = [
    buildPinePrototype(8821, 0.215),
    buildPinePrototype(9347, 0.23),
  ];

  for (const p of [...sakuraProtos, ...ginkgoProtos, ...pineProtos]) {
    trackGeo(p.barkGeo);
    trackGeo(p.leafGeo);
    if (p.barkMat) trackMat(p.barkMat);
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
    if (lakeSignedDist(x, z) < 1.35) return false;
    const st = streamDistanceAndFlow(x, z);
    if (st.dist < st.width * 1.45) return false;
    if (gardenPathFactor(x, z) > minPathDist) return false;
    // Keep pavilion, bank-to-bank bridge span/abutments, and Spirit Rest Cottage clear
    if (Math.hypot(x - 12.8, z + 7.8) < 5.2) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.centerX, z - BRIDGE_CONFIG.centerZ) < 5.6) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ) < 4.2) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ) < 4.2) return false;
    if (Math.hypot(x + 11.4, z - 5.8) < 4.9) return false;
    // Keep panoramic Overlook camera sightline corridor [-4.5, 23.5] -> [2.5, -1.5] open
    const camX = -4.5;
    const camZ = 23.5;
    const dirX = 7.0;
    const dirZ = -25.0;
    const tProj = ((x - camX) * dirX + (z - camZ) * dirZ) / (dirX * dirX + dirZ * dirZ);
    if (tProj >= -0.15 && tProj <= 1.05) {
      const cx = camX + dirX * tProj;
      const cz = camZ + dirZ * tProj;
      const corridorHalfWidth = 9.2 - tProj * 1.4;
      if (Math.hypot(x - cx, z - cz) < corridorHalfWidth) return false;
    }
    if (z > 14 && Math.abs(x + 2.0) < 11.5) return false;
    return true;
  };

  // Dedicated overhanging riverside/bridge-framing Sakura trees (just outside bridgeheads so blossoms drift directly onto the stream)
  const riversideHeroSakura: Array<[number, number, number]> = [
    [BRIDGE_CONFIG.bankBX + 3.6, BRIDGE_CONFIG.bankBZ - 2.6, 1.12],
    [BRIDGE_CONFIG.bankAX - 3.9, BRIDGE_CONFIG.bankAZ - 3.2, 1.06],
    [10.2, -13.2, 1.12],
    [14.8, -1.2, 1.14],
    [13.6, 4.4, 1.12],
  ];

  const heroSakuraCoords: Array<[number, number, number]> = [
    ...riversideHeroSakura,
    [17.4, -5.2, 1.14],
    [18.2, -10.6, 1.18],
    [15.4, 5.8, 1.15],
    [11.8, 10.6, 1.08],
    [16.8, 12.2, 1.16],
    [-2.4, -13.6, 1.12],
    [3.8, -12.8, 1.08],
    [13.4, 17.8, 1.12],
    [19.2, 1.5, 1.16],
  ];

  const heroGinkgoCoords: Array<[number, number, number]> = [
    [-12.8, -4.8, 1.16],
    [-13.4, -11.2, 1.12],
    [-15.8, 2.6, 1.2],
    [-14.2, 8.6, 1.14],
    [-17.4, 12.8, 1.18],
    [-19.2, 6.4, 1.22],
    [-18.8, -5.8, 1.18],
    [-15.4, -16.8, 1.14],
    [-15.8, 18.2, 1.12],
  ];

  const sakuraBuckets: PlacementItem[][] = sakuraProtos.map(() => []);
  const ginkgoBuckets: PlacementItem[][] = ginkgoProtos.map(() => []);
  const pineBuckets: PlacementItem[][] = pineProtos.map(() => []);

  const sakuraTints = [0xffffff, 0xfff0f4, 0xffe0ea, 0xfbd0df];
  const ginkgoTints = [0xffffff, 0xffe992, 0xffd456, 0xf5be3c];
  const pineTints = [0xffffff, 0xe8f3e4, 0xd8ead6];

  const placedTreeCoords: Array<[number, number]> = [];
  const hasRoomFromNeighbors = (x: number, z: number, minGap = 3.25) =>
    placedTreeCoords.every(([px, pz]) => Math.hypot(x - px, z - pz) >= minGap);

  for (let i = 0; i < heroSakuraCoords.length && i < quality.sakuraTreeCount; i++) {
    const [x, z, sc] = heroSakuraCoords[i];
    if (!isClearTreeSite(x, z)) continue;
    placedTreeCoords.push([x, z]);
    sakuraBuckets[i % sakuraProtos.length].push({
      x,
      y: terrainHeightAt(x, z) - 0.1,
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
    if (!isClearTreeSite(x, z) || !hasRoomFromNeighbors(x, z, 3.45)) continue;
    const h = terrainHeightAt(x, z);
    if (h > 10.5) continue;
    placedTreeCoords.push([x, z]);
    const idx = Math.floor(rand() * sakuraProtos.length);
    sakuraBuckets[idx].push({
      x,
      y: h - 0.1,
      z,
      rotY: rand() * Math.PI * 2,
      scale: 0.86 + rand() * 0.4,
      colorHex: sakuraTints[Math.floor(rand() * sakuraTints.length)],
    });
  }

  for (let i = 0; i < heroGinkgoCoords.length && i < quality.ginkgoTreeCount; i++) {
    const [x, z, sc] = heroGinkgoCoords[i];
    if (!isClearTreeSite(x, z)) continue;
    placedTreeCoords.push([x, z]);
    ginkgoBuckets[i % ginkgoProtos.length].push({
      x,
      y: terrainHeightAt(x, z) - 0.1,
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
    if (!isClearTreeSite(x, z) || !hasRoomFromNeighbors(x, z, 3.5)) continue;
    const h = terrainHeightAt(x, z);
    if (h > 11.5) continue;
    placedTreeCoords.push([x, z]);
    const idx = Math.floor(rand() * ginkgoProtos.length);
    ginkgoBuckets[idx].push({
      x,
      y: h - 0.1,
      z,
      rotY: rand() * Math.PI * 2,
      scale: 0.86 + rand() * 0.44,
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
    sharedBarkMat?: THREE.Material,
    canopyKind?: 'sakura' | 'ginkgo'
  ) => {
    for (let i = 0; i < protos.length; i++) {
      const items = buckets[i];
      if (items.length === 0) continue;
      const proto = protos[i];
      const activeBarkMat = sharedBarkMat || proto.barkMat!;

      const barkMesh = new THREE.InstancedMesh(proto.barkGeo, activeBarkMat, items.length);
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

  emitInstancedTrees(sakuraProtos, sakuraBuckets, sakuraLeafMat, sakuraBarkMat, 'sakura');
  emitInstancedTrees(ginkgoProtos, ginkgoBuckets, ginkgoLeafMat, ginkgoBarkMat, 'ginkgo');
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
    if (Math.hypot(x - BRIDGE_CONFIG.centerX, z - BRIDGE_CONFIG.centerZ) < 4.6) continue;
    if (Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ) < 3.0) continue;
    if (Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ) < 3.0) continue;
    if (Math.hypot(x + 11.4, z - 5.8) < 3.7) continue;

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
    verticalBladeAO: true,
    cacheKey: 'paradise-grass-wind-v3',
  });

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
    if (Math.hypot(x + 11.4, z - 5.8) < 3.25) continue;

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
    if (Math.hypot(x + 11.4, z - 5.8) < 3.35) continue;

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
  // 4. Multi-Petal Botanical Wildflowers
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

  // Subtle scattered floating Sakura Petals & Golden Ginkgo Leaves resting on water surface
  const waterPetalGeo = trackGeo(new THREE.PlaneGeometry(0.15, 0.15));
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
    dummy.scale.setScalar(0.75 + rand() * 0.7);
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
