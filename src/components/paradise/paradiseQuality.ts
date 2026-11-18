import * as THREE from 'three';

export type QualityTier = 'high' | 'medium' | 'low' | 'software';
export type UserQualityChoice = 'auto' | 'high' | 'medium' | 'low';

export interface ParadiseQualityProfile {
  tier: QualityTier;
  isSoftwareGl: boolean;
  isTouch: boolean;
  reducedMotion: boolean;
  pixelRatio: number;
  antialias: boolean;
  enableShadows: boolean;
  shadowMapSize: number;
  enableBloom: boolean;
  enableGodRays: boolean;
  enableDOF: boolean;
  terrainSegments: number;
  waterTextureSize: number;
  grassCount: number;
  tallGrassCount: number;
  shrubCount: number;
  flowerCount: number;
  reedCount: number;
  lotusCount: number;
  floatingLeafCount: number;
  dewCount: number;
  sakuraTreeCount: number;
  ginkgoTreeCount: number;
  pineTreeCount: number;
  butterflyCount: number;
  birdCount: number;
  fireflyCount: number;
  koiCount: number;
  rainCount: number;
  petalCount: number;
  ginkgoLeafCount: number;
  mistCount: number;
}

export function detectParadiseQuality(
  isSoftwareGl: boolean,
  reducedMotion: boolean,
  containerWidth: number,
  containerHeight: number,
  overrideChoice: UserQualityChoice = 'auto'
): ParadiseQualityProfile {
  const isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

  const minDim = Math.min(containerWidth, containerHeight);
  const maxDim = Math.max(containerWidth, containerHeight);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const mem =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8
      : 8;
  const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const isPhone = isTouch && minDim < 540 && maxDim < 960;
  const isTabletOrFoldable = isTouch && !isPhone;

  let tier: QualityTier = 'high';
  if (isSoftwareGl) {
    tier = 'software';
  } else if (overrideChoice !== 'auto') {
    tier = overrideChoice;
  } else if (isPhone || mem <= 3 || (cores <= 4 && isTouch)) {
    tier = 'low';
  } else if (isTabletOrFoldable || cores <= 6 || mem <= 4) {
    tier = 'medium';
  } else {
    // Desktop / Apple Silicon M2 (8+ cores, 8-16GB RAM) defaults to crisp High cinematic tier
    tier = 'high';
  }

  switch (tier) {
    case 'software':
      // Keep the full lush scene objects intact; turn off expensive GPU multi-pass filters
      return {
        tier,
        isSoftwareGl: true,
        isTouch,
        reducedMotion,
        pixelRatio: 1,
        antialias: false,
        enableShadows: false,
        shadowMapSize: 0,
        enableBloom: false,
        enableGodRays: false,
        enableDOF: false,
        terrainSegments: 112,
        waterTextureSize: 256,
        grassCount: 2400,
        tallGrassCount: 700,
        shrubCount: 44,
        flowerCount: 520,
        reedCount: 190,
        lotusCount: 26,
        floatingLeafCount: 180,
        dewCount: 180,
        sakuraTreeCount: 42,
        ginkgoTreeCount: 38,
        pineTreeCount: 18,
        butterflyCount: 14,
        birdCount: 6,
        fireflyCount: 80,
        koiCount: 7,
        rainCount: 560,
        petalCount: 220,
        ginkgoLeafCount: 190,
        mistCount: 14,
      };

    case 'low':
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.15),
        antialias: true,
        enableShadows: false,
        shadowMapSize: 0,
        enableBloom: false,
        enableGodRays: false,
        enableDOF: false,
        terrainSegments: 108,
        waterTextureSize: 256,
        grassCount: 2400,
        tallGrassCount: 650,
        shrubCount: 42,
        flowerCount: 480,
        reedCount: 180,
        lotusCount: 24,
        floatingLeafCount: 160,
        dewCount: 150,
        sakuraTreeCount: 34,
        ginkgoTreeCount: 30,
        pineTreeCount: 14,
        butterflyCount: 10,
        birdCount: 5,
        fireflyCount: 65,
        koiCount: 6,
        rainCount: 520,
        petalCount: 180,
        ginkgoLeafCount: 160,
        mistCount: 12,
      };

    case 'medium':
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.3),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 1024,
        enableBloom: !reducedMotion,
        enableGodRays: !reducedMotion,
        enableDOF: false,
        terrainSegments: 148,
        waterTextureSize: 512,
        grassCount: 4200,
        tallGrassCount: 1100,
        shrubCount: 64,
        flowerCount: 780,
        reedCount: 280,
        lotusCount: 34,
        floatingLeafCount: 260,
        dewCount: 260,
        sakuraTreeCount: 48,
        ginkgoTreeCount: 44,
        pineTreeCount: 22,
        butterflyCount: 16,
        birdCount: 7,
        fireflyCount: 115,
        koiCount: 8,
        rainCount: 980,
        petalCount: 280,
        ginkgoLeafCount: 250,
        mistCount: 16,
      };

    case 'high':
    default:
      // Calibrated specifically so MacBook Air M2 Retina (2560x1664) stays smooth at 60fps
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.6),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 2048,
        enableBloom: !reducedMotion,
        enableGodRays: !reducedMotion,
        enableDOF: !reducedMotion,
        terrainSegments: 188,
        waterTextureSize: 1024,
        grassCount: 6200,
        tallGrassCount: 1500,
        shrubCount: 86,
        flowerCount: 1100,
        reedCount: 380,
        lotusCount: 44,
        floatingLeafCount: 380,
        dewCount: 380,
        sakuraTreeCount: 62,
        ginkgoTreeCount: 54,
        pineTreeCount: 28,
        butterflyCount: 22,
        birdCount: 9,
        fireflyCount: 170,
        koiCount: 10,
        rainCount: 1550,
        petalCount: 420,
        ginkgoLeafCount: 360,
        mistCount: 20,
      };
  }
}

export interface ProceduralTextureSet {
  terrainDetail: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  slateRoofMap: THREE.CanvasTexture;
  waterNormals: THREE.DataTexture;
  sakuraClusterMap: THREE.CanvasTexture;
  ginkgoClusterMap: THREE.CanvasTexture;
  pineClusterMap: THREE.CanvasTexture;
  shrubClusterMap: THREE.CanvasTexture;
  wildflowerTex: THREE.CanvasTexture;
  sakuraPetalTex: THREE.CanvasTexture;
  ginkgoLeafTex: THREE.CanvasTexture;
  rockColorMap: THREE.CanvasTexture;
  rockNormalMap: THREE.DataTexture;
  softGlow: THREE.CanvasTexture;
  mistPuff: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function makeSeededRand(seedStart: number): () => number {
  let seed = seedStart;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/**
 * Generates a periodic tileable water normal map in linear space
 * for Three.js Water.js planar reflections & animated capillary ripples.
 */
function buildSeamlessWaterNormals(size = 256): THREE.DataTexture {
  const waves = [
    { kx: 2, ky: 1, amp: 0.34, phase: 0.4 },
    { kx: -3, ky: 2, amp: 0.28, phase: 1.7 },
    { kx: 4, ky: -3, amp: 0.2, phase: 2.9 },
    { kx: -5, ky: -4, amp: 0.14, phase: 0.9 },
    { kx: 7, ky: 5, amp: 0.09, phase: 4.1 },
    { kx: -9, ky: 6, amp: 0.06, phase: 2.3 },
    { kx: 11, ky: -8, amp: 0.04, phase: 5.2 },
    { kx: -13, ky: -11, amp: 0.03, phase: 1.1 },
  ];

  const data = new Uint8Array(size * size * 4);
  const twoPi = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = (y / size) * twoPi;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * twoPi;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const arg = w.kx * u + w.ky * v + w.phase;
        const c = Math.cos(arg) * w.amp;
        dx += c * w.kx * 0.14;
        dy += c * w.ky * 0.14;
      }
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round((nx * invLen * 0.5 + 0.5) * 255)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * invLen * 0.5 + 0.5) * 255)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round((nz * invLen * 0.5 + 0.5) * 255)));
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Draws a detailed 5-petal Cherry Blossom flower (with notched petals & stamens)
 */
function drawSakuraFlower(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rot: number,
  tintVariant: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  const outerHex =
    tintVariant < 0.35 ? '#fff3f6' : tintVariant < 0.72 ? '#fcd6e2' : '#f7b5c9';
  const midHex =
    tintVariant < 0.35 ? '#fde2eb' : tintVariant < 0.72 ? '#f8c1d2' : '#f29eb9';
  const centerHex = '#d95b84';

  for (let p = 0; p < 5; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5);

    const grad = ctx.createRadialGradient(0, -radius * 0.1, radius * 0.08, 0, -radius * 0.55, radius);
    grad.addColorStop(0.0, centerHex);
    grad.addColorStop(0.28, midHex);
    grad.addColorStop(0.85, outerHex);
    grad.addColorStop(1.0, '#fff9fb');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-radius * 0.48, -radius * 0.25, -radius * 0.56, -radius * 0.85, -radius * 0.14, -radius * 0.98);
    ctx.lineTo(0, -radius * 0.84);
    ctx.lineTo(radius * 0.14, -radius * 0.98);
    ctx.bezierCurveTo(radius * 0.56, -radius * 0.85, radius * 0.48, -radius * 0.25, 0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(210, 110, 145, 0.22)';
    ctx.lineWidth = Math.max(0.8, radius * 0.03);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#9e3257';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.14, 0, Math.PI * 2);
  ctx.fill();

  for (let s = 0; s < 10; s++) {
    const a = (s * Math.PI * 2) / 10 + 0.15;
    const len = radius * (0.28 + (s % 2) * 0.11);
    const sx = Math.cos(a) * len;
    const sy = Math.sin(a) * len;
    ctx.strokeStyle = 'rgba(240, 185, 195, 0.85)';
    ctx.lineWidth = Math.max(0.7, radius * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = '#f8d268';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.1, radius * 0.055), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws an authentic fan-shaped bilobed Ginkgo biloba leaf with petiole & radiating veins
 */
function drawGinkgoFanLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rot: number,
  tone: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ctx.strokeStyle = '#9b7b24';
  ctx.lineWidth = Math.max(1.2, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.34);
  ctx.lineTo(0, 0);
  ctx.stroke();

  const cBase = tone < 0.3 ? '#d88e12' : tone < 0.68 ? '#e8aa1e' : '#f2c836';
  const cMid = tone < 0.3 ? '#f4bd2a' : tone < 0.68 ? '#ffd347' : '#ffe36e';
  const cEdge = tone < 0.3 ? '#ffd954' : tone < 0.68 ? '#ffea75' : '#fff29c';

  const grad = ctx.createRadialGradient(0, size * 0.05, size * 0.06, 0, -size * 0.45, size * 0.95);
  grad.addColorStop(0, cBase);
  grad.addColorStop(0.58, cMid);
  grad.addColorStop(1, cEdge);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.42, -size * 0.14, -size * 0.88, -size * 0.44, -size * 0.82, -size * 0.72);
  ctx.quadraticCurveTo(-size * 0.48, -size * 0.96, -size * 0.14, -size * 0.86);
  ctx.lineTo(0, -size * 0.56);
  ctx.lineTo(size * 0.14, -size * 0.86);
  ctx.quadraticCurveTo(size * 0.48, -size * 0.96, size * 0.82, -size * 0.72);
  ctx.bezierCurveTo(size * 0.88, -size * 0.44, size * 0.42, -size * 0.14, 0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(176, 114, 14, 0.35)';
  ctx.lineWidth = Math.max(0.8, size * 0.025);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(182, 122, 18, 0.28)';
  ctx.lineWidth = Math.max(0.6, size * 0.018);
  for (let v = -5; v <= 5; v++) {
    if (v === 0) continue;
    const ang = (v / 6) * 1.12;
    const len = size * (0.72 - Math.abs(v) * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.04);
    ctx.lineTo(Math.sin(ang) * len, -Math.cos(ang) * len);
    ctx.stroke();
  }

  ctx.restore();
}

function buildSakuraClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = makeSeededRand(9101);
  ctx.clearRect(0, 0, 512, 512);

  ctx.strokeStyle = '#4e3531';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(256, 488);
  ctx.quadraticCurveTo(246, 330, 260, 170);
  ctx.stroke();
  for (const [bx, by, tx, ty] of [
    [254, 380, 112, 265],
    [254, 340, 398, 232],
    [258, 250, 134, 128],
    [258, 225, 382, 118],
  ]) {
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + tx) * 0.5, by - 28, tx, ty);
    ctx.stroke();
  }

  for (let b = 0; b < 9; b++) {
    const lx = 115 + rand() * 282;
    const ly = 110 + rand() * 270;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate((rand() - 0.5) * 2.4);
    ctx.fillStyle = rand() > 0.5 ? '#6d9b4f' : '#89b45e';
    ctx.beginPath();
    ctx.ellipse(0, -16, 8, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const spots: Array<[number, number, number]> = [
    [256, 256, 62],
    [186, 290, 54],
    [328, 286, 56],
    [206, 198, 56],
    [314, 196, 52],
    [258, 134, 52],
    [130, 238, 48],
    [382, 228, 50],
    [152, 152, 46],
    [364, 146, 46],
    [258, 356, 52],
    [186, 374, 44],
    [332, 368, 46],
    [256, 218, 46],
    [214, 248, 44],
    [298, 244, 44],
    [164, 326, 42],
    [354, 320, 42],
    [110, 184, 38],
    [404, 178, 38],
    [210, 108, 40],
    [310, 104, 40],
    [258, 82, 36],
    [122, 300, 38],
    [392, 294, 38],
    [256, 412, 40],
  ];

  for (const [fx, fy, fr] of spots) {
    drawSakuraFlower(ctx, fx + (rand() - 0.5) * 14, fy + (rand() - 0.5) * 14, fr, rand() * Math.PI * 2, rand());
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildGinkgoClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = makeSeededRand(7331);
  ctx.clearRect(0, 0, 512, 512);

  ctx.strokeStyle = '#68553b';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(256, 492);
  ctx.quadraticCurveTo(262, 340, 250, 175);
  ctx.stroke();
  for (const [bx, by, tx, ty] of [
    [256, 390, 118, 270],
    [256, 350, 396, 246],
    [254, 258, 134, 134],
    [254, 232, 378, 124],
  ]) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + tx) * 0.5, by - 24, tx, ty);
    ctx.stroke();
  }

  const leaves: Array<[number, number, number]> = [
    [256, 398, 72],
    [172, 366, 68],
    [340, 364, 68],
    [122, 290, 64],
    [390, 286, 64],
    [214, 304, 74],
    [300, 302, 74],
    [256, 258, 76],
    [156, 224, 68],
    [356, 220, 68],
    [210, 186, 70],
    [304, 184, 70],
    [256, 146, 68],
    [118, 170, 58],
    [394, 166, 58],
    [172, 126, 58],
    [340, 124, 58],
    [256, 98, 56],
    [206, 412, 54],
    [308, 410, 54],
    [144, 326, 56],
    [372, 324, 56],
    [254, 338, 66],
    [194, 248, 64],
    [320, 246, 64],
    [256, 198, 66],
  ];

  for (const [lx, ly, ls] of leaves) {
    const angleToCenter = Math.atan2(lx - 256, 390 - ly) * 0.55 + (rand() - 0.5) * 0.75;
    drawGinkgoFanLeaf(
      ctx,
      lx + (rand() - 0.5) * 12,
      ly + (rand() - 0.5) * 12,
      ls * (0.9 + rand() * 0.2),
      angleToCenter,
      rand()
    );
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildPineClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = makeSeededRand(5521);
  ctx.clearRect(0, 0, 256, 256);

  ctx.strokeStyle = '#473626';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128, 242);
  ctx.lineTo(128, 64);
  ctx.stroke();

  for (let i = 0; i < 160; i++) {
    const t = rand();
    const cy = 228 - t * 172;
    const cx = 128 + (rand() - 0.5) * (135 * (1 - t * 0.45));
    const ang = (rand() - 0.5) * 2.5;
    const len = 16 + rand() * 20;
    ctx.strokeStyle = rand() > 0.45 ? '#26492d' : rand() > 0.5 ? '#355f39' : '#1b3822';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Flowering garden shrub leaf + blossom cluster texture (Japanese azalea & dwarf camellia foliage)
 */
function buildShrubClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = makeSeededRand(3391);
  ctx.clearRect(0, 0, 256, 256);

  // Overlapping glossy botanical leaves
  for (let i = 0; i < 72; i++) {
    const lx = 44 + rand() * 168;
    const ly = 44 + rand() * 176;
    const ang = rand() * Math.PI * 2;
    const rx = 10 + rand() * 8;
    const ry = 20 + rand() * 11;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang);
    ctx.fillStyle = rand() > 0.5 ? '#2d572c' : rand() > 0.4 ? '#3b6d38' : '#244725';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 175, 105, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.78);
    ctx.lineTo(0, ry * 0.78);
    ctx.stroke();
    ctx.restore();
  }

  // Scattered subtle white & coral shrub blossoms
  for (let b = 0; b < 11; b++) {
    const bx = 56 + rand() * 144;
    const by = 52 + rand() * 144;
    drawSakuraFlower(ctx, bx, by, 14 + rand() * 6, rand() * Math.PI * 2, rand() * 0.4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Natural multi-petal garden wildflower sprite (stem + tiny leaves + layered flower head)
 */
function buildWildflowerTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);

  // Slender green stem
  ctx.strokeStyle = '#3d6931';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 124);
  ctx.quadraticCurveTo(61, 88, 64, 48);
  ctx.stroke();

  // Pair of small basal leaves
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(64, 96);
    ctx.rotate(side * 0.58);
    ctx.fillStyle = '#477838';
    ctx.beginPath();
    ctx.ellipse(0, -14, 5.5, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 6 natural neutral-white petals (tinted per-instance via InstancedMesh.setColorAt)
  ctx.save();
  ctx.translate(64, 44);
  for (let p = 0; p < 6; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 6);
    const grad = ctx.createRadialGradient(0, -6, 2, 0, -20, 26);
    grad.addColorStop(0, '#ffe89c');
    grad.addColorStop(0.28, '#ffffff');
    grad.addColorStop(1, '#f4f4f6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -17, 7.5, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#e5a922';
  ctx.beginPath();
  ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildSingleSakuraPetalTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.translate(64, 108);

  const grad = ctx.createRadialGradient(0, -14, 4, 0, -56, 86);
  grad.addColorStop(0, '#ee8cae');
  grad.addColorStop(0.35, '#fbd0df');
  grad.addColorStop(0.85, '#fff3f7');
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-42, -22, -48, -74, -13, -92);
  ctx.lineTo(0, -76);
  ctx.lineTo(13, -92);
  ctx.bezierCurveTo(48, -74, 42, -22, 0, 0);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildSingleGinkgoLeafTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  drawGinkgoFanLeaf(ctx, 64, 96, 86, 0, 0.55);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildRockTextures(maxAniso: number): {
  rockColorMap: THREE.CanvasTexture;
  rockNormalMap: THREE.DataTexture;
} {
  const size = 256;
  const [rCanvas, rCtx] = makeCanvas(size, size);
  const rand = makeSeededRand(8123);

  const heights = new Float32Array(size * size);
  const imgData = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const strata =
        Math.sin(v * 3 + Math.sin(u * 2) * 0.8) * 0.42 +
        Math.sin(u * 5 - v * 2) * 0.25 +
        Math.cos(u * 11 + v * 7) * 0.14 +
        (rand() - 0.5) * 0.22;
      const h = 0.5 + strata * 0.45;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const base = Math.max(45, Math.min(205, Math.round(92 + strata * 46)));
      imgData.data[idx] = base + 4;
      imgData.data[idx + 1] = base + 3;
      imgData.data[idx + 2] = base;
      imgData.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(imgData, 0, 0);

  const rockColorMap = new THREE.CanvasTexture(rCanvas);
  rockColorMap.wrapS = rockColorMap.wrapT = THREE.RepeatWrapping;
  rockColorMap.repeat.set(2, 2);
  rockColorMap.colorSpace = THREE.SRGBColorSpace;
  rockColorMap.anisotropy = Math.min(4, maxAniso);

  const normData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 2.4;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 2.4;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      normData[idx] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      normData[idx + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      normData[idx + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      normData[idx + 3] = 255;
    }
  }
  const rockNormalMap = new THREE.DataTexture(normData, size, size, THREE.RGBAFormat);
  rockNormalMap.wrapS = rockNormalMap.wrapT = THREE.RepeatWrapping;
  rockNormalMap.repeat.set(2, 2);
  rockNormalMap.colorSpace = THREE.NoColorSpace;
  rockNormalMap.needsUpdate = true;

  return { rockColorMap, rockNormalMap };
}

export function createParadiseTextures(maxAniso: number): ProceduralTextureSet {
  const rand = makeSeededRand(1337);

  // 1. High-resolution terrain micro-detail noise
  const [tCanvas, tCtx] = makeCanvas(256, 256);
  const imgData = tCtx.createImageData(256, 256);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = 216 + Math.floor((rand() - 0.5) * 44);
    imgData.data[i] = v;
    imgData.data[i + 1] = Math.min(255, v + 3);
    imgData.data[i + 2] = Math.max(0, v - 4);
    imgData.data[i + 3] = 255;
  }
  tCtx.putImageData(imgData, 0, 0);
  const terrainDetail = new THREE.CanvasTexture(tCanvas);
  terrainDetail.wrapS = terrainDetail.wrapT = THREE.RepeatWrapping;
  terrainDetail.repeat.set(36, 36);
  terrainDetail.colorSpace = THREE.SRGBColorSpace;
  terrainDetail.anisotropy = Math.min(8, maxAniso);

  // 2. Cedar & rosewood bark grain
  const [bCanvas, bCtx] = makeCanvas(256, 512);
  bCtx.fillStyle = '#5e4434';
  bCtx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 950; i++) {
    const x = rand() * 256;
    const y = rand() * 512;
    const h = 14 + rand() * 52;
    const w = 1 + rand() * 3;
    bCtx.fillStyle = rand() > 0.45 ? 'rgba(34,22,16,0.34)' : 'rgba(138,108,86,0.22)';
    bCtx.fillRect(x, y, w, h);
  }
  const barkMap = new THREE.CanvasTexture(bCanvas);
  barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.repeat.set(2, 3);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.anisotropy = Math.min(4, maxAniso);

  // 3. Traditional curved ceramic roof tile texture
  const [sCanvas, sCtx] = makeCanvas(512, 512);
  sCtx.fillStyle = '#2d343e';
  sCtx.fillRect(0, 0, 512, 512);
  const rows = 14;
  const cols = 16;
  const rowH = 512 / rows;
  const colW = 512 / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * colW;
      const y0 = r * rowH;
      const shade = 40 + Math.floor(rand() * 18);
      const grad = sCtx.createLinearGradient(x0, y0, x0 + colW, y0);
      grad.addColorStop(0.0, `rgb(${shade - 10}, ${shade - 6}, ${shade})`);
      grad.addColorStop(0.35, `rgb(${shade + 22}, ${shade + 27}, ${shade + 35})`);
      grad.addColorStop(0.75, `rgb(${shade + 8}, ${shade + 12}, ${shade + 18})`);
      grad.addColorStop(1.0, `rgb(${shade - 14}, ${shade - 10}, ${shade - 4})`);
      sCtx.fillStyle = grad;
      sCtx.fillRect(x0 + 1, y0 + 1, colW - 2, rowH - 3);
      sCtx.fillStyle = 'rgba(10, 14, 20, 0.55)';
      sCtx.fillRect(x0, y0 + rowH - 3, colW, 3);
    }
  }
  const slateRoofMap = new THREE.CanvasTexture(sCanvas);
  slateRoofMap.wrapS = slateRoofMap.wrapT = THREE.RepeatWrapping;
  slateRoofMap.repeat.set(4, 2);
  slateRoofMap.colorSpace = THREE.SRGBColorSpace;
  slateRoofMap.anisotropy = Math.min(8, maxAniso);

  const waterNormals = buildSeamlessWaterNormals(256);
  const sakuraClusterMap = buildSakuraClusterTexture(maxAniso);
  const ginkgoClusterMap = buildGinkgoClusterTexture(maxAniso);
  const pineClusterMap = buildPineClusterTexture(maxAniso);
  const shrubClusterMap = buildShrubClusterTexture(maxAniso);
  const wildflowerTex = buildWildflowerTexture(maxAniso);
  const sakuraPetalTex = buildSingleSakuraPetalTexture();
  const ginkgoLeafTex = buildSingleGinkgoLeafTexture();
  const { rockColorMap, rockNormalMap } = buildRockTextures(maxAniso);

  const [gCanvas, gCtx] = makeCanvas(64, 64);
  const gGrad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gGrad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  gGrad.addColorStop(0.25, 'rgba(255,248,220,0.85)');
  gGrad.addColorStop(0.6, 'rgba(255,235,170,0.22)');
  gGrad.addColorStop(1.0, 'rgba(255,220,140,0.0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 64, 64);
  const softGlow = new THREE.CanvasTexture(gCanvas);
  softGlow.colorSpace = THREE.SRGBColorSpace;

  const [mCanvas, mCtx] = makeCanvas(128, 128);
  const mGrad = mCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  mGrad.addColorStop(0.0, 'rgba(255,255,255,0.62)');
  mGrad.addColorStop(0.45, 'rgba(248,252,255,0.32)');
  mGrad.addColorStop(1.0, 'rgba(240,248,255,0.0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 128, 128);
  const mistPuff = new THREE.CanvasTexture(mCanvas);
  mistPuff.colorSpace = THREE.SRGBColorSpace;

  return {
    terrainDetail,
    barkMap,
    slateRoofMap,
    waterNormals,
    sakuraClusterMap,
    ginkgoClusterMap,
    pineClusterMap,
    shrubClusterMap,
    wildflowerTex,
    sakuraPetalTex,
    ginkgoLeafTex,
    rockColorMap,
    rockNormalMap,
    softGlow,
    mistPuff,
    dispose: () => {
      terrainDetail.dispose();
      barkMap.dispose();
      slateRoofMap.dispose();
      waterNormals.dispose();
      sakuraClusterMap.dispose();
      ginkgoClusterMap.dispose();
      pineClusterMap.dispose();
      shrubClusterMap.dispose();
      wildflowerTex.dispose();
      sakuraPetalTex.dispose();
      ginkgoLeafTex.dispose();
      rockColorMap.dispose();
      rockNormalMap.dispose();
      softGlow.dispose();
      mistPuff.dispose();
    },
  };
}
