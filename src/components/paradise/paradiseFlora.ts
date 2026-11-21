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
    // Keep all 5 enlarged courtyard buildings & bridgehead clear of trees
    if (Math.hypot(x - 7.0, z + 5.8) < 6.4) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.centerX, z - BRIDGE_CONFIG.centerZ) < 5.6) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ) < 4.2) return false;
    if (Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ) < 4.2) return false;
    if (Math.hypot(x + 7.0, z + 0.4) < 6.0) return false;
    if (Math.hypot(x - 5.4, z - 6.0) < 6.0) return false;
    if (Math.hypot(x + 0.2, z + 9.0) < 6.6) return false;
    if (Math.hypot(x + 2.2, z - 8.4) < 4.4) return false;
    // Keep the entire foreground & central amphitheater sightline completely open
    // so ALL 5 buildings are 100% unobstructed on first load (trees richly frame left, right & rear hills!)
    if (z > -10.8 && z < 26.0 && Math.abs(x) < 11.4) return false;
    if (z > 8.5 && Math.abs(x) < 15.0) return false;
    return true;
  };

  // Dedicated framing Sakura trees on outer right/rear/waterside slopes (never obstructing the 5 houses!)
  const riversideHeroSakura: Array<[number, number, number]> = [
    [13.4, -5.2, 1.16],
    [13.8, -11.4, 1.18],
    [6.4, -13.6, 1.14],
    [12.8, 1.4, 1.16],
    [13.6, 6.8, 1.14],
  ];

  const heroSakuraCoords: Array<[number, number, number]> = [
    ...riversideHeroSakura,
    [16.8, -3.2, 1.18],
    [17.6, -9.8, 1.2],
    [16.2, 4.6, 1.16],
    [15.8, 11.2, 1.14],
    [18.4, 15.2, 1.16],
    [-4.8, -15.4, 1.14],
    [2.2, -15.8, 1.14],
    [16.2, 17.8, 1.12],
    [19.4, 1.5, 1.18],
  ];

  const heroGinkgoCoords: Array<[number, number, number]> = [
    [-13.2, -3.6, 1.18],
    [-13.4, -10.8, 1.16],
    [-13.6, 2.8, 1.2],
    [-14.2, 8.2, 1.16],
    [-17.2, 12.6, 1.18],
    [-18.8, 5.8, 1.22],
    [-18.4, -5.8, 1.18],
    [-15.4, -16.8, 1.16],
    [-16.4, 17.6, 1.14],
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
    if (Math.hypot(x - 7.0, z + 5.8) < 4.5) continue;
    if (Math.hypot(x - BRIDGE_CONFIG.centerX, z - BRIDGE_CONFIG.centerZ) < 4.6) continue;
    if (Math.hypot(x - BRIDGE_CONFIG.bankAX, z - BRIDGE_CONFIG.bankAZ) < 3.0) continue;
    if (Math.hypot(x - BRIDGE_CONFIG.bankBX, z - BRIDGE_CONFIG.bankBZ) < 3.0) continue;
    if (Math.hypot(x + 7.0, z + 0.4) < 4.3) continue;
    if (Math.hypot(x - 5.4, z - 6.0) < 4.3) continue;
    if (Math.hypot(x + 0.2, z + 9.0) < 4.8) continue;
    if (Math.hypot(x + 2.2, z - 8.4) < 3.0) continue;

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
  // 3. Organic Wildflower Drifts & Sculpted 3D Cupped Meadow Blossoms
  //    (Replaces spiky grass blades with lush, natural floral clusters)
  // =========================================================================
  const gColor = new THREE.Color();
  const flowerSpots: THREE.Vector3[] = [];

  // Rich botanical flower-sea drift centers carpeting the entire courtyard, slopes & building edges ("花重满")
  const driftCenters: Array<{ x: number; z: number; r: number; palette: number[] }> = [
    { x: -7.2, z: 4.8, r: 5.8, palette: [0xf7b2c8, 0xfef4dc, 0xf5cddc, 0xffffff] },
    { x: -4.2, z: 10.6, r: 6.2, palette: [0xfce28d, 0xfef8e6, 0xf8b6cc, 0xffffff] },
    { x: 0.4, z: 12.8, r: 6.4, palette: [0xf8b8cd, 0xfef4d8, 0xcab8f5, 0x9bc8f4] },
    { x: 5.6, z: 11.4, r: 6.0, palette: [0xc6b6f5, 0x99c6f4, 0xffffff, 0xf8c2d4] },
    { x: 9.8, z: 6.4, r: 5.8, palette: [0xf8b9ce, 0xfee59b, 0xffffff, 0xe2ccf8] },
    { x: -11.4, z: 0.6, r: 5.8, palette: [0xfbe090, 0xf7bccd, 0xfef8e8, 0xffffff] },
    { x: -9.6, z: 9.2, r: 6.0, palette: [0xf9b8cd, 0xd1bef6, 0xfef5de, 0x9fcaf4] },
    { x: -3.2, z: 5.2, r: 5.2, palette: [0xf9c0d2, 0xfee8a4, 0xffffff, 0xcbbaf5] },
    { x: 2.8, z: 5.0, r: 4.8, palette: [0x9fcbf4, 0xf8bfd0, 0xfef5df, 0xd4c0f6] },
    { x: 10.2, z: -1.4, r: 5.6, palette: [0xd0bdf6, 0xa2cbf4, 0xffffff, 0xf8bfd2] },
    { x: 11.4, z: -6.8, r: 5.8, palette: [0xf9bcd0, 0xfef5df, 0xfce198, 0xffffff] },
    { x: 4.2, z: -9.8, r: 5.6, palette: [0xb0d2f6, 0xd4c2f7, 0xffffff, 0xf9c5d5] },
    { x: -5.4, z: -8.6, r: 5.6, palette: [0xf8bfd2, 0xfee7a0, 0xfef8e8, 0xcbb9f5] },
    { x: -0.4, z: 16.4, r: 6.5, palette: [0xf8b8cd, 0xfef5dd, 0xfcd580, 0xc7b5f4] },
    { x: 6.8, z: 15.8, r: 6.2, palette: [0x9ec9f5, 0xf9bdd0, 0xfef5e0, 0xd6c2f6] },
  ];

  // 3a. Soft Painterly Multi-Petal Wildflower Drifts (ultra-dense, overflowing floral meadow)
  const flowerGeo = trackGeo(createCrossWildflowerGeo());
  const flowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.wildflowerTex,
      alphaTest: 0.32,
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(flowerMat, {
    freq: 1.95,
    amp: 0.16,
    heightFactor: 1.4,
    pointerReactive: true,
    nightBloomGlow: true,
    cacheKey: 'paradise-flower-wind-v3',
  });

  const targetFlowerCount = Math.round(quality.flowerCount * 1.85);
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, targetFlowerCount);
  const defaultFlowerPalette = [0xf7b4ca, 0xfef4d8, 0xc8b4f5, 0xfcd67c, 0xffffff, 0x99c8f4];
  let fPlaced = 0;
  let fAttempts = 0;
  while (fPlaced < targetFlowerCount && fAttempts < targetFlowerCount * 7) {
    fAttempts++;
    let x: number;
    let z: number;
    let palette = defaultFlowerPalette;

    // 78% grow in lush courtyard & foreground floral drifts; 22% blanket the surrounding meadow
    if (rand() < 0.78) {
      const drift = driftCenters[Math.floor(rand() * driftCenters.length)];
      const ang = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.72) * drift.r;
      x = drift.x + Math.cos(ang) * dist;
      z = drift.z + Math.sin(ang) * dist;
      palette = drift.palette;
    } else {
      x = (rand() - 0.5) * 44;
      z = (rand() - 0.5) * 40 + 2.0;
    }

    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.18 || sample.height > 4.8 || sample.pathWeight > 0.36) continue;
    if (Math.hypot(x + 7.0, z + 0.4) < 3.45) continue;
    if (Math.hypot(x - 5.4, z - 6.0) < 3.55) continue;
    if (Math.hypot(x + 0.2, z + 9.0) < 4.1) continue;
    if (Math.hypot(x + 2.2, z - 8.4) < 2.25) continue;
    if (Math.hypot(x - 7.0, z + 5.8) < 3.85) continue;

    dummy.position.set(x, sample.height - 0.025, z);
    dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
    const sc = 0.92 + rand() * 0.98;
    dummy.scale.set(sc * (0.92 + rand() * 0.24), sc * (0.88 + rand() * 0.28), sc * (0.92 + rand() * 0.24));
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(fPlaced, dummy.matrix);

    gColor.setHex(palette[Math.floor(rand() * palette.length)]);
    flowerMesh.setColorAt(fPlaced, gColor);
    if (flowerSpots.length < 72) {
      flowerSpots.push(new THREE.Vector3(x, sample.height + 0.44, z));
    }
    fPlaced++;
  }
  flowerMesh.count = fPlaced;
  flowerMesh.instanceMatrix.needsUpdate = true;
  if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
  flowerMesh.computeBoundingSphere();
  group.add(flowerMesh);

  // 3b. Sculpted 3D Cupped Multi-Petal Blossom Clusters (hero foreground florals)
  const buildSculptedMeadowBloomGeo = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    const addPart = (g: THREE.BufferGeometry, tintHex: number) => {
      const nonIdx = g.index ? g.toNonIndexed() : g;
      const count = nonIdx.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const col = new THREE.Color(tintHex);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
      nonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!nonIdx.attributes.uv) {
        nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      parts.push(nonIdx);
    };

    // Soft rounded botanical foliage cushion at base
    const leafOffsets: Array<[number, number, number, number]> = [
      [0.0, 0.04, 0.0, 0.15],
      [0.11, 0.035, 0.06, 0.12],
      [-0.1, 0.035, 0.07, 0.12],
      [0.03, 0.035, -0.11, 0.12],
    ];
    for (const [lx, ly, lz, lr] of leafOffsets) {
      const leaf = new THREE.SphereGeometry(lr, 7, 5);
      leaf.scale(1.25, 0.45, 1.1);
      leaf.translate(lx, ly, lz);
      addPart(leaf, 0x487642);
    }

    // 3 sculpted cupped blooms per cluster at varied heights & tilts
    const heads: Array<{ x: number; y: number; z: number; scale: number; tiltX: number; tiltZ: number }> = [
      { x: 0.0, y: 0.25, z: 0.0, scale: 1.05, tiltX: 0.06, tiltZ: -0.04 },
      { x: 0.12, y: 0.19, z: 0.07, scale: 0.84, tiltX: 0.18, tiltZ: -0.22 },
      { x: -0.11, y: 0.17, z: -0.06, scale: 0.78, tiltX: -0.16, tiltZ: 0.2 },
    ];

    for (const h of heads) {
      // Slender botanical stem
      const stem = new THREE.CylinderGeometry(0.008, 0.013, h.y, 4);
      stem.translate(h.x * 0.7, h.y * 0.5, h.z * 0.7);
      addPart(stem, 0x4f7c44);

      // 5 softly cupped 3D petals (tinted white so instanceColor controls blossom hue!)
      const petalCount = 5;
      for (let p = 0; p < petalCount; p++) {
        const a = (p / petalCount) * Math.PI * 2;
        const petal = new THREE.SphereGeometry(0.058 * h.scale, 6, 5);
        petal.scale(0.85, 0.28, 1.48);
        petal.rotateX(-0.34);
        petal.translate(0, 0.012 * h.scale, 0.055 * h.scale);
        petal.rotateY(a);
        petal.rotateX(h.tiltX);
        petal.rotateZ(h.tiltZ);
        petal.translate(h.x, h.y, h.z);
        addPart(petal, 0xffffff);
      }

      // Warm golden stamen center
      const stamen = new THREE.SphereGeometry(0.028 * h.scale, 6, 5);
      stamen.scale(1, 0.65, 1);
      stamen.translate(h.x, h.y + 0.018 * h.scale, h.z);
      addPart(stamen, 0xf7cf52);
    }

    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return new THREE.SphereGeometry(0.12, 6, 5);
    merged.computeVertexNormals();
    return merged;
  };

  const bloomClusterGeo = trackGeo(buildSculptedMeadowBloomGeo());
  const bloomClusterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.52,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(bloomClusterMat, {
    freq: 1.8,
    amp: 0.14,
    heightFactor: 1.5,
    pointerReactive: true,
    nightBloomGlow: true,
    cacheKey: 'paradise-bloom-cluster-wind-v1',
  });

  const bloomClusterCount = Math.max(280, Math.min(680, Math.round(quality.flowerCount * 0.52)));
  const bloomClusterMesh = new THREE.InstancedMesh(bloomClusterGeo, bloomClusterMat, bloomClusterCount);
  bloomClusterMesh.receiveShadow = quality.enableShadows;
  let bcPlaced = 0;
  let bcAttempts = 0;
  while (bcPlaced < bloomClusterCount && bcAttempts < bloomClusterCount * 8) {
    bcAttempts++;
    const drift = driftCenters[Math.floor(rand() * driftCenters.length)];
    const ang = rand() * Math.PI * 2;
    const dist = Math.pow(rand(), 0.68) * (drift.r * 1.08);
    const x = drift.x + Math.cos(ang) * dist;
    const z = drift.z + Math.sin(ang) * dist;
    const sample = sampleTerrainBiome(x, z);
    if (sample.height < 0.2 || sample.height > 4.4 || sample.pathWeight > 0.34) continue;
    if (Math.hypot(x + 7.0, z + 0.4) < 3.5) continue;
    if (Math.hypot(x - 5.4, z - 6.0) < 3.6) continue;
    if (Math.hypot(x + 0.2, z + 9.0) < 4.15) continue;
    if (Math.hypot(x + 2.2, z - 8.4) < 2.3) continue;
    if (Math.hypot(x - 7.0, z + 5.8) < 3.9) continue;

    dummy.position.set(x, sample.height - 0.02, z);
    dummy.rotation.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1);
    const sc = 1.05 + rand() * 0.8;
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    bloomClusterMesh.setMatrixAt(bcPlaced, dummy.matrix);

    gColor.setHex(drift.palette[Math.floor(rand() * drift.palette.length)]);
    bloomClusterMesh.setColorAt(bcPlaced, gColor);
    bcPlaced++;
  }
  bloomClusterMesh.count = bcPlaced;
  bloomClusterMesh.instanceMatrix.needsUpdate = true;
  if (bloomClusterMesh.instanceColor) bloomClusterMesh.instanceColor.needsUpdate = true;
  bloomClusterMesh.computeBoundingSphere();
  group.add(bloomClusterMesh);

  // 3c. Curated Architectural Hydrangea & Garden Rose Floral Mounds framing buildings & footpaths
  const buildHydrangeaMoundGeo = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    const addPart = (g: THREE.BufferGeometry, hex: number) => {
      const nonIdx = g.index ? g.toNonIndexed() : g;
      const cnt = nonIdx.attributes.position.count;
      const cols = new Float32Array(cnt * 3);
      const col = new THREE.Color(hex);
      for (let i = 0; i < cnt; i++) {
        cols[i * 3] = col.r;
        cols[i * 3 + 1] = col.g;
        cols[i * 3 + 2] = col.b;
      }
      nonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      if (!nonIdx.attributes.uv) {
        nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
      }
      parts.push(nonIdx);
    };

    // Sculpted layered garden leaf base cushion (deep & mid botanical greens)
    const bushLobes: Array<[number, number, number, number, number]> = [
      [0.0, 0.17, 0.0, 0.42, 0x355f32],
      [0.24, 0.14, 0.16, 0.3, 0x3f6f39],
      [-0.23, 0.15, 0.14, 0.31, 0x3b6936],
      [0.18, 0.14, -0.22, 0.29, 0x325a30],
      [-0.2, 0.14, -0.18, 0.3, 0x45763e],
    ];
    for (const [bx, by, bz, br, hex] of bushLobes) {
      const lobe = new THREE.IcosahedronGeometry(br, 1);
      lobe.scale(1.12, 0.72, 1.08);
      lobe.translate(bx, by, bz);
      addPart(lobe, hex);
    }

    // 7 plump domed blossom pom-poms (white vertex color -> tinted cleanly by instanceColor!)
    const pomCoords: Array<[number, number, number, number]> = [
      [0.0, 0.44, 0.02, 0.155],
      [0.22, 0.36, 0.14, 0.135],
      [-0.22, 0.37, 0.12, 0.135],
      [0.14, 0.35, -0.18, 0.13],
      [-0.17, 0.34, -0.17, 0.125],
      [0.34, 0.27, -0.02, 0.115],
      [-0.33, 0.28, -0.04, 0.115],
    ];
    for (const [px, py, pz, pr] of pomCoords) {
      const pom = new THREE.IcosahedronGeometry(pr, 1);
      pom.scale(1.08, 0.86, 1.08);
      pom.translate(px, py, pz);
      addPart(pom, 0xffffff);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) return new THREE.IcosahedronGeometry(0.35, 1);
    merged.computeVertexNormals();
    return merged;
  };

  const hydrangeaGeo = trackGeo(buildHydrangeaMoundGeo());
  const hydrangeaMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(hydrangeaMat, {
    freq: 1.45,
    amp: 0.06,
    heightFactor: 0.9,
    pointerReactive: true,
    nightBloomGlow: true,
    cacheKey: 'paradise-hydrangea-wind-v1',
  });

  // Richly landscaped floral border beds & lush flower-sea mounds filling the entire visible courtyard ("花重满")
  const curatedFlowerbedSpots: Array<[number, number, number, number]> = [
    // Flanking Telephone Booth cobblestone alcove (-2.2, 8.4)
    [-4.3, 7.6, 0.96, 0xf6b2c8],
    [-4.4, 9.6, 1.02, 0x9ec6f5],
    [-2.4, 10.6, 0.95, 0xfdf2d6],
    [-0.4, 10.2, 0.92, 0xd4bdf5],
    [-0.2, 6.8, 0.88, 0xf7b8cd],
    [-4.0, 11.4, 1.06, 0xfee39a],
    // Framing Library Cottage terrace (-7.0, -0.4)
    [-4.4, 2.4, 1.04, 0xf8bad0],
    [-6.6, 3.2, 1.06, 0xfee5a2],
    [-9.8, 2.4, 1.12, 0xc8b4f2],
    [-10.4, -0.4, 1.08, 0xfdf5e2],
    [-9.6, -3.4, 1.06, 0xf7b6cc],
    [-5.2, -3.6, 0.96, 0x9ecaf5],
    [-8.6, 4.6, 1.14, 0xf8c0d4],
    [-6.2, 5.4, 1.04, 0xd2bff6],
    // Framing Language Center Hall terrace (5.4, 6.0)
    [2.6, 7.6, 1.02, 0xf7b9ce],
    [3.4, 3.6, 0.98, 0x9ac8f4],
    [8.2, 8.2, 1.14, 0xfee49e],
    [8.8, 5.2, 1.12, 0xd4c0f6],
    [7.8, 2.8, 1.04, 0xf8bdd2],
    [5.4, 9.4, 1.08, 0xfdf4dd],
    [3.6, 9.8, 1.02, 0xf8b6cc],
    [8.6, 10.4, 1.16, 0x9fcaf5],
    // Framing Music Hall waterside pavilion (7.0, -5.8)
    [4.4, -4.6, 0.96, 0xf8bad0],
    [9.8, -3.4, 1.08, 0xfdf4de],
    [10.6, -6.2, 1.14, 0xa2c8f5],
    [9.6, -9.2, 1.12, 0xf7bfd2],
    [4.8, -9.2, 1.02, 0xfee49c],
    [10.8, -1.0, 1.1, 0xcbb8f4],
    [10.4, 1.8, 1.12, 0xf8b8ce],
    // Framing AI Center north lakeside terrace (-0.2, -9.0)
    [-3.6, -7.8, 1.04, 0x9ccbf6],
    [3.2, -8.2, 1.06, 0xcab8f5],
    [-3.8, -11.4, 1.1, 0xf8c0d2],
    [3.4, -11.6, 1.1, 0xfef5df],
    [-1.2, -12.6, 1.08, 0xf8bad0],
    [1.6, -12.8, 1.08, 0xa2cbf5],
    // Overflowing foreground flower-sea framing the camera entry view (z: 10..17)
    [-8.8, 12.2, 1.18, 0xf8b8cd],
    [-7.2, 13.8, 1.14, 0xa4c9f5],
    [-5.6, 12.6, 1.08, 0xfee5a0],
    [-4.8, 14.8, 1.16, 0xcab6f5],
    [-3.0, 13.4, 1.06, 0xfef5e0],
    [-1.6, 15.2, 1.14, 0xf7b6cc],
    [-0.2, 12.6, 1.02, 0x9ecaf5],
    [0.2, 15.8, 1.14, 0xfee296],
    [2.8, 14.8, 1.12, 0xf8bad0],
    [3.4, 12.2, 1.04, 0xd2bff6],
    [4.8, 13.8, 1.14, 0xa2ccf5],
    [6.4, 12.6, 1.12, 0xfee59e],
    [7.6, 14.6, 1.18, 0xf8bad2],
    [9.4, 12.4, 1.16, 0xc9b7f4],
    [10.6, 8.8, 1.14, 0xfef5df],
    [-10.6, 7.6, 1.18, 0xf8bdd2],
    [-9.8, 10.2, 1.15, 0xfee398],
    [-7.6, 8.4, 1.08, 0xa0c9f5],
    [-6.0, 6.8, 1.02, 0xf8b8cd],
    [-5.6, 10.8, 1.08, 0xcfbef6],
    [-8.0, 15.4, 1.2, 0xf8bad0],
    [-3.4, 16.4, 1.18, 0xa2cbf5],
    [1.2, 17.0, 1.16, 0xf8bad2],
    [5.2, 16.2, 1.18, 0xfee49c],
    [8.8, 16.0, 1.2, 0xd0bcf6],
    // Central courtyard shoreline flower ribbons (between buildings and water)
    [-2.4, 4.4, 0.96, 0xf8b8ce],
    [-0.6, 4.2, 0.94, 0xfee5a2],
    [1.6, 4.0, 0.94, 0xa2cbf5],
    [3.8, 3.0, 0.92, 0xf8bad0],
    [-5.8, 3.6, 0.98, 0xcab8f5],
    [-7.4, 5.8, 1.04, 0xfef4de],
    [9.4, 4.2, 1.08, 0xf8bad0],
    [9.6, 0.4, 1.06, 0xfee398],
    [-10.6, 4.6, 1.12, 0xa4caf5],
    [-11.2, -2.4, 1.14, 0xf8bcd0],
    [11.4, -3.6, 1.14, 0xf7b8cd],
    [11.6, 6.8, 1.16, 0xd2bff6],
    [-3.4, 11.8, 1.06, 0xf8bad0],
    [-1.2, 11.4, 1.02, 0xfee49c],
    [2.6, 10.6, 1.04, 0xa0c9f5],
    [6.6, 10.8, 1.1, 0xf8b8ce],
    [-6.6, 11.4, 1.12, 0xfdf5e2],
    [-9.2, 14.0, 1.16, 0xcab6f5],
    [10.2, 14.2, 1.18, 0xf8bad2],
    [0.0, 13.8, 1.06, 0xd0bdf6],
  ];

  const hydrangeaMesh = new THREE.InstancedMesh(hydrangeaGeo, hydrangeaMat, curatedFlowerbedSpots.length);
  hydrangeaMesh.castShadow = quality.enableShadows;
  hydrangeaMesh.receiveShadow = quality.enableShadows;
  let hPlaced = 0;
  for (const [hx, hz, hScale, hHex] of curatedFlowerbedSpots) {
    const sample = sampleTerrainBiome(hx, hz);
    if (sample.height < 0.2 || sample.pathWeight > 0.48) continue;
    dummy.position.set(hx, sample.height - 0.04, hz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(hScale * 1.08, hScale * 0.92, hScale * 1.08);
    dummy.updateMatrix();
    hydrangeaMesh.setMatrixAt(hPlaced, dummy.matrix);
    gColor.setHex(hHex);
    hydrangeaMesh.setColorAt(hPlaced, gColor);
    hPlaced++;
  }
  hydrangeaMesh.count = hPlaced;
  hydrangeaMesh.instanceMatrix.needsUpdate = true;
  if (hydrangeaMesh.instanceColor) hydrangeaMesh.instanceColor.needsUpdate = true;
  hydrangeaMesh.computeBoundingSphere();
  group.add(hydrangeaMesh);

  // =========================================================================
  // 5. Delicate Shoreline Reeds, Sculpted Multi-Petal Water Lotus & Floating Leaves
  // =========================================================================
  const reedGeo = trackGeo(new THREE.CylinderGeometry(0.009, 0.018, 1.08, 5));
  reedGeo.translate(0, 0.54, 0);
  const reedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5b7c46,
      roughness: 0.7,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(reedMat, {
    freq: 1.5,
    amp: 0.22,
    heightFactor: 0.8,
    pointerReactive: true,
    cacheKey: 'paradise-reed-wind-v3',
  });

  const targetReedCount = Math.round(quality.reedCount * 0.68);
  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, targetReedCount);
  let rPlaced = 0;
  let rAttempts = 0;
  while (rPlaced < targetReedCount && rAttempts < targetReedCount * 10) {
    rAttempts++;
    const x = -18 + rand() * 44;
    const z = -22 + rand() * 34;
    const h = terrainHeightAt(x, z);
    if (h < -0.22 || h > 0.28) continue;
    if (gardenPathFactor(x, z) > 0.36) continue;

    dummy.position.set(x, h - 0.06, z);
    dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
    const sc = 0.72 + rand() * 0.56;
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
