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

  const isPhone = isTouch && minDim < 560 && maxDim < 980;
  const isTabletOrFoldable = isTouch && !isPhone;

  let tier: QualityTier = 'high';
  if (isSoftwareGl) {
    tier = 'software';
  } else if (overrideChoice !== 'auto') {
    tier = overrideChoice;
  } else if (isPhone || mem <= 3) {
    tier = 'low';
  } else if (isTabletOrFoldable || cores <= 6 || mem <= 4) {
    tier = 'medium';
  } else {
    tier = 'high';
  }

  switch (tier) {
    case 'software':
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
        terrainSegments: 120,
        waterTextureSize: 256,
        grassCount: 2400,
        tallGrassCount: 700,
        shrubCount: 44,
        flowerCount: 520,
        reedCount: 190,
        lotusCount: 26,
        floatingLeafCount: 36,
        dewCount: 160,
        sakuraTreeCount: 40,
        ginkgoTreeCount: 36,
        pineTreeCount: 18,
        butterflyCount: 14,
        birdCount: 6,
        fireflyCount: 80,
        koiCount: 7,
        rainCount: 560,
        // Poetic drifting & river-floating sakura petals / ginkgo leaves
        petalCount: 34,
        ginkgoLeafCount: 12,
        mistCount: 14,
      };

    case 'low':
      // Crisp mobile / phone calibration: Retina-aware DPR + real soft shadows
      // Bloom/god-rays disabled on phones to prevent white glow washout on small screens
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.65),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 1024,
        enableBloom: false,
        enableGodRays: false,
        enableDOF: false,
        terrainSegments: 124,
        waterTextureSize: 512,
        grassCount: 2800,
        tallGrassCount: 750,
        shrubCount: 48,
        flowerCount: 540,
        reedCount: 200,
        lotusCount: 28,
        floatingLeafCount: 36,
        dewCount: 180,
        sakuraTreeCount: 36,
        ginkgoTreeCount: 32,
        pineTreeCount: 16,
        butterflyCount: 12,
        birdCount: 5,
        fireflyCount: 72,
        koiCount: 6,
        rainCount: 620,
        petalCount: 44,
        ginkgoLeafCount: 14,
        mistCount: 12,
      };

    case 'medium':
      // Crisp tablet / iPad calibration: 1.85 DPR + 2048 shadows
      // Bloom/god-rays disabled on tablets to prevent white glow washout on mobile-class screens
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.85),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 2048,
        enableBloom: false,
        enableGodRays: false,
        enableDOF: false,
        terrainSegments: 156,
        waterTextureSize: 512,
        grassCount: 4400,
        tallGrassCount: 1150,
        shrubCount: 68,
        flowerCount: 820,
        reedCount: 290,
        lotusCount: 36,
        floatingLeafCount: 48,
        dewCount: 260,
        sakuraTreeCount: 48,
        ginkgoTreeCount: 44,
        pineTreeCount: 22,
        butterflyCount: 16,
        birdCount: 7,
        fireflyCount: 115,
        koiCount: 8,
        rainCount: 980,
        petalCount: 64,
        ginkgoLeafCount: 20,
        mistCount: 16,
      };

    case 'high':
    default:
      // High-definition desktop Retina calibration (up to 2.0x DPR + 2048 tight shadows)
      // Bloom/god-rays disabled on touch devices (phones/tablets/foldables) to prevent white glow washout
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 2.0),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 2048,
        enableBloom: !reducedMotion && !isTouch,
        enableGodRays: !reducedMotion && !isTouch,
        enableDOF: !reducedMotion,
        terrainSegments: 196,
        waterTextureSize: 1024,
        grassCount: 6400,
        tallGrassCount: 1550,
        shrubCount: 88,
        flowerCount: 1120,
        reedCount: 380,
        lotusCount: 44,
        floatingLeafCount: 56,
        dewCount: 360,
        sakuraTreeCount: 60,
        ginkgoTreeCount: 52,
        pineTreeCount: 26,
        butterflyCount: 20,
        birdCount: 9,
        fireflyCount: 160,
        koiCount: 10,
        rainCount: 1450,
        petalCount: 88,
        ginkgoLeafCount: 26,
        mistCount: 20,
      };
  }
}

export interface ProceduralTextureSet {
  terrainDetail: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  sakuraBarkMap: THREE.CanvasTexture;
  ginkgoBarkMap: THREE.CanvasTexture;
  barkNormalMap: THREE.DataTexture;
  sakuraBarkNormalMap: THREE.DataTexture;
  barkAoMap: THREE.DataTexture;
  barkRoughnessMap: THREE.DataTexture;
  plasterWallMap: THREE.CanvasTexture;
  plasterAoMap: THREE.DataTexture;
  timberPlankMap: THREE.CanvasTexture;
  timberAoMap: THREE.DataTexture;
  timberRoughnessMap: THREE.DataTexture;
  slateRoofMap: THREE.CanvasTexture;
  slateNormalMap: THREE.DataTexture;
  slateAoMap: THREE.DataTexture;
  slateRoughnessMap: THREE.DataTexture;
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

function buildNormalFromHeight(heights: Float32Array, size: number, strength = 2.4): THREE.DataTexture {
  const normData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
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
  const tex = new THREE.DataTexture(normData, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function buildLinearDataMap(
  values: Float32Array,
  size: number,
  repeatX: number,
  repeatY: number,
  maxAniso: number
): THREE.DataTexture {
  const bytes = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values[i] * 255)));
    const idx = i * 4;
    bytes[idx] = v;
    bytes[idx + 1] = v;
    bytes[idx + 2] = v;
    bytes[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(16, maxAniso);
  tex.needsUpdate = true;
  return tex;
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
 * Draws a botanical 5-petal Cherry Blossom flower with notched petals, crimson throat & stamens
 */
function drawSakuraFlower(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rot: number,
  tintVariant: number,
  depthShade = 1.0
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  const outerHex =
    tintVariant < 0.34 ? '#f9eef2' : tintVariant < 0.72 ? '#f6d8e3' : '#efb8ca';
  const midHex =
    tintVariant < 0.34 ? '#f5dce6' : tintVariant < 0.72 ? '#efb9cc' : '#e59bb5';
  const centerHex = '#b8496e';

  ctx.shadowColor = 'rgba(56, 22, 36, 0.16)';
  ctx.shadowBlur = Math.max(2, radius * 0.16);
  ctx.shadowOffsetY = Math.max(1, radius * 0.06);

  for (let p = 0; p < 5; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5 + (p % 2 === 0 ? 0.04 : -0.03));

    const grad = ctx.createRadialGradient(0, -radius * 0.08, radius * 0.04, 0, -radius * 0.56, radius);
    grad.addColorStop(0.0, centerHex);
    grad.addColorStop(0.18, midHex);
    grad.addColorStop(0.76, outerHex);
    grad.addColorStop(1.0, '#fbf4f7');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-radius * 0.46, -radius * 0.24, -radius * 0.54, -radius * 0.84, -radius * 0.13, -radius * 0.98);
    ctx.lineTo(0, -radius * 0.82);
    ctx.lineTo(radius * 0.13, -radius * 0.98);
    ctx.bezierCurveTo(radius * 0.54, -radius * 0.84, radius * 0.46, -radius * 0.24, 0, 0);
    ctx.closePath();
    ctx.fill();

    // Soft natural translucent petal veining without harsh cartoon outlines
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(176, 92, 124, 0.14)';
    ctx.lineWidth = Math.max(0.6, radius * 0.02);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(196, 114, 144, 0.15)';
    ctx.lineWidth = Math.max(0.5, radius * 0.016);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.12);
    ctx.lineTo(-radius * 0.1, -radius * 0.72);
    ctx.moveTo(0, -radius * 0.12);
    ctx.lineTo(0, -radius * 0.68);
    ctx.moveTo(0, -radius * 0.12);
    ctx.lineTo(radius * 0.1, -radius * 0.72);
    ctx.stroke();

    ctx.restore();
  }
  ctx.shadowColor = 'transparent';

  // Soft organic interior depth shading for back-layer blossoms
  if (depthShade < 0.98) {
    ctx.fillStyle = `rgba(64, 28, 44, ${(1 - depthShade) * 0.34})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#7e2444';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  for (let s = 0; s < 10; s++) {
    const a = (s * Math.PI * 2) / 10 + 0.18;
    const len = radius * (0.26 + (s % 2) * 0.11);
    const sx = Math.cos(a) * len;
    const sy = Math.sin(a) * len;
    ctx.strokeStyle = 'rgba(240, 184, 198, 0.78)';
    ctx.lineWidth = Math.max(0.65, radius * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = '#ecc55d';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.0, radius * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws an authentic fan-shaped bilobed Ginkgo biloba leaf with petiole & radiating dichotomous veins
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

  ctx.strokeStyle = '#8d6e1d';
  ctx.lineWidth = Math.max(1.4, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.36);
  ctx.lineTo(0, 0);
  ctx.stroke();

  const cBase = tone < 0.28 ? '#c77c0c' : tone < 0.65 ? '#df9c16' : '#ebbd2a';
  const cMid = tone < 0.28 ? '#edb022' : tone < 0.65 ? '#f9cb3a' : '#ffdf5c';
  const cEdge = tone < 0.28 ? '#ffd347' : tone < 0.65 ? '#ffe76d' : '#fff49a';

  const grad = ctx.createRadialGradient(0, size * 0.05, size * 0.06, 0, -size * 0.45, size * 0.95);
  grad.addColorStop(0, cBase);
  grad.addColorStop(0.56, cMid);
  grad.addColorStop(1, cEdge);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.44, -size * 0.14, -size * 0.9, -size * 0.44, -size * 0.84, -size * 0.72);
  ctx.quadraticCurveTo(-size * 0.48, -size * 0.97, -size * 0.14, -size * 0.86);
  ctx.lineTo(0, -size * 0.56);
  ctx.lineTo(size * 0.14, -size * 0.86);
  ctx.quadraticCurveTo(size * 0.48, -size * 0.97, size * 0.84, -size * 0.72);
  ctx.bezierCurveTo(size * 0.9, -size * 0.44, size * 0.44, -size * 0.14, 0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(155, 96, 10, 0.38)';
  ctx.lineWidth = Math.max(0.9, size * 0.024);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(168, 108, 14, 0.3)';
  ctx.lineWidth = Math.max(0.7, size * 0.018);
  for (let v = -6; v <= 6; v++) {
    if (v === 0) continue;
    const ang = (v / 7) * 1.15;
    const len = size * (0.74 - Math.abs(v) * 0.022);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.04);
    ctx.lineTo(Math.sin(ang) * len, -Math.cos(ang) * len);
    ctx.stroke();
  }

  ctx.restore();
}

function buildSakuraClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const rand = makeSeededRand(9101);
  ctx.clearRect(0, 0, size, size);

  // Authentic branching dark mahogany sakura twigs radiating outward
  ctx.strokeStyle = '#472c28';
  ctx.lineCap = 'round';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(512, 960);
  ctx.quadraticCurveTo(494, 650, 518, 310);
  ctx.stroke();
  for (const [bx, by, tx, ty, w] of [
    [508, 760, 210, 510, 8],
    [508, 680, 804, 460, 8],
    [514, 510, 250, 240, 6.5],
    [514, 460, 770, 230, 6.5],
    [340, 605, 175, 360, 4.5],
    [680, 560, 845, 330, 4.5],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + tx) * 0.5, by - 48, tx, ty);
    ctx.stroke();
  }

  // Young olive-bronze spring cherry leaves tucked realistically behind blossoms
  for (let b = 0; b < 24; b++) {
    const lx = 185 + rand() * 654;
    const ly = 180 + rand() * 620;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate((rand() - 0.5) * 2.8);
    ctx.fillStyle = rand() > 0.5 ? '#557039' : rand() > 0.35 ? '#6d8242' : '#7a5d42';
    ctx.beginPath();
    ctx.ellipse(0, -24, 10, 29, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(42, 54, 28, 0.32)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -46);
    ctx.stroke();
    ctx.restore();
  }

  // Deep shaded back-layer blossom spray (dense photographic multi-depth volume)
  for (let b = 0; b < 30; b++) {
    const a = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 320;
    const bx = 512 + Math.cos(a) * rad;
    const by = 490 + Math.sin(a) * rad * 0.9;
    drawSakuraFlower(ctx, bx, by, 44 + rand() * 22, rand() * Math.PI * 2, rand(), 0.64);
  }

  // Mid-layer natural umbel sprays
  for (let b = 0; b < 26; b++) {
    const a = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 355;
    const bx = 512 + Math.cos(a) * rad;
    const by = 485 + Math.sin(a) * rad * 0.88;
    drawSakuraFlower(ctx, bx, by, 48 + rand() * 24, rand() * Math.PI * 2, rand(), 0.82);
  }

  // Crisp sunlit foreground botanical blossom sprays (delicate natural scale, not giant cartoon flowers)
  const spots: Array<[number, number, number]> = [
    [512, 512, 70],
    [388, 554, 64],
    [640, 544, 64],
    [422, 404, 62],
    [612, 400, 62],
    [514, 282, 58],
    [276, 474, 56],
    [746, 464, 56],
    [318, 326, 54],
    [706, 314, 54],
    [512, 682, 60],
    [382, 706, 54],
    [644, 702, 54],
    [512, 434, 58],
    [438, 492, 56],
    [588, 488, 56],
    [340, 626, 52],
    [690, 616, 52],
    [226, 382, 46],
    [796, 372, 46],
    [426, 224, 50],
    [608, 218, 50],
    [514, 178, 46],
    [258, 584, 48],
    [768, 574, 48],
    [512, 792, 48],
    [464, 344, 52],
    [568, 340, 52],
    [354, 476, 54],
    [668, 472, 54],
  ];

  for (const [fx, fy, fr] of spots) {
    drawSakuraFlower(
      ctx,
      fx + (rand() - 0.5) * 26,
      fy + (rand() - 0.5) * 26,
      fr * (0.9 + rand() * 0.2),
      rand() * Math.PI * 2,
      rand(),
      1.0
    );
  }

  // Unopened rose-pink blossom buds along fine outer twig tips
  for (let i = 0; i < 24; i++) {
    const a = rand() * Math.PI * 2;
    const rad = 275 + rand() * 155;
    const bx = 512 + Math.cos(a) * rad;
    const by = 480 + Math.sin(a) * rad * 0.85;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a + Math.PI * 0.5);
    ctx.fillStyle = '#dd6e93';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#533e30';
    ctx.beginPath();
    ctx.arc(0, 14, 5, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildGinkgoClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const rand = makeSeededRand(7331);
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = '#62513a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(512, 976);
  ctx.quadraticCurveTo(524, 680, 500, 340);
  ctx.stroke();
  for (const [bx, by, tx, ty, w] of [
    [512, 770, 236, 536, 7],
    [512, 700, 790, 488, 7],
    [508, 512, 266, 266, 5.5],
    [508, 464, 756, 246, 5.5],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + tx) * 0.5, by - 44, tx, ty);
    ctx.stroke();
  }

  // Rear shaded amber leaves for canopy volume
  for (let i = 0; i < 16; i++) {
    const lx = 220 + rand() * 584;
    const ly = 220 + rand() * 600;
    drawGinkgoFanLeaf(ctx, lx, ly, 86 + rand() * 28, (rand() - 0.5) * 1.4, 0.15);
  }

  const leaves: Array<[number, number, number]> = [
    [512, 792, 114],
    [344, 728, 106],
    [680, 724, 106],
    [244, 578, 98],
    [780, 572, 98],
    [428, 608, 116],
    [600, 604, 116],
    [512, 516, 120],
    [312, 448, 106],
    [712, 440, 106],
    [420, 372, 110],
    [608, 368, 110],
    [512, 292, 108],
    [236, 340, 92],
    [788, 332, 92],
    [344, 252, 92],
    [680, 248, 92],
    [512, 196, 88],
    [412, 824, 88],
    [616, 820, 88],
    [288, 652, 90],
    [744, 648, 90],
    [508, 676, 104],
    [388, 496, 102],
    [640, 492, 102],
    [512, 396, 104],
  ];

  for (const [lx, ly, ls] of leaves) {
    const angleToCenter = Math.atan2(lx - 512, 780 - ly) * 0.55 + (rand() - 0.5) * 0.72;
    drawGinkgoFanLeaf(
      ctx,
      lx + (rand() - 0.5) * 20,
      ly + (rand() - 0.5) * 20,
      ls * (0.92 + rand() * 0.2),
      angleToCenter,
      rand()
    );
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildPineClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = makeSeededRand(5521);
  ctx.clearRect(0, 0, 512, 512);

  ctx.strokeStyle = '#473626';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(256, 484);
  ctx.lineTo(256, 128);
  ctx.stroke();

  for (let i = 0; i < 240; i++) {
    const t = rand();
    const cy = 456 - t * 344;
    const cx = 256 + (rand() - 0.5) * (270 * (1 - t * 0.45));
    const ang = (rand() - 0.5) * 2.5;
    const len = 32 + rand() * 40;
    ctx.strokeStyle = rand() > 0.45 ? '#26492d' : rand() > 0.5 ? '#355f39' : '#1b3822';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildShrubClusterTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = makeSeededRand(3391);
  ctx.clearRect(0, 0, 512, 512);

  // Subtle woody shrub stems inside foliage cluster
  ctx.strokeStyle = '#3b2d22';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  for (let s = 0; s < 5; s++) {
    ctx.beginPath();
    ctx.moveTo(256, 445);
    ctx.quadraticCurveTo(256 + (s - 2) * 48, 320, 140 + s * 58, 175 + (s % 2) * 40);
    ctx.stroke();
  }

  for (let i = 0; i < 145; i++) {
    const lx = 78 + rand() * 356;
    const ly = 78 + rand() * 366;
    const ang = rand() * Math.PI * 2;
    const rx = 14 + rand() * 12;
    const ry = 28 + rand() * 16;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang);
    const leafGrad = ctx.createLinearGradient(0, -ry, 0, ry);
    if (rand() > 0.5) {
      leafGrad.addColorStop(0, '#3e6e36');
      leafGrad.addColorStop(1, '#234422');
    } else {
      leafGrad.addColorStop(0, '#4c7b3e');
      leafGrad.addColorStop(1, '#2c5128');
    }
    ctx.fillStyle = leafGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(138, 178, 108, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.78);
    ctx.lineTo(0, ry * 0.78);
    ctx.stroke();
    ctx.restore();
  }

  for (let b = 0; b < 14; b++) {
    const bx = 110 + rand() * 290;
    const by = 100 + rand() * 290;
    drawSakuraFlower(ctx, bx, by, 18 + rand() * 10, rand() * Math.PI * 2, rand() * 0.45, 0.92);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

function buildWildflowerTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  ctx.strokeStyle = '#3d6931';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(128, 248);
  ctx.quadraticCurveTo(122, 176, 128, 96);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(128, 192);
    ctx.rotate(side * 0.58);
    ctx.fillStyle = '#477838';
    ctx.beginPath();
    ctx.ellipse(0, -28, 11, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(128, 88);
  for (let p = 0; p < 6; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 6);
    const grad = ctx.createRadialGradient(0, -12, 4, 0, -40, 52);
    grad.addColorStop(0, '#ffe89c');
    grad.addColorStop(0.28, '#ffffff');
    grad.addColorStop(1, '#f4f4f6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -34, 15, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#e5a922';
  ctx.beginPath();
  ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
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
  const size = 512;
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
        Math.cos(u * 13 + v * 9) * 0.14 +
        (rand() - 0.5) * 0.2;
      const h = 0.5 + strata * 0.45;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const base = Math.max(48, Math.min(208, Math.round(96 + strata * 46)));
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
  rockColorMap.anisotropy = Math.min(16, maxAniso);

  const rockNormalMap = buildNormalFromHeight(heights, size, 2.8);
  rockNormalMap.repeat.set(2, 2);

  return { rockColorMap, rockNormalMap };
}

/**
 * Authentic botanical bark textures:
 * - Sakura (*Prunus serrulata*): dark mahogany/copper brown with horizontal pale lenticel bands
 * - Ginkgo (*Ginkgo biloba*): deep vertical grey-brown ridges and fissures
 * - Shared bark normal map for crisp shadow relief
 */
function buildBarkTextureSet(maxAniso: number): {
  barkMap: THREE.CanvasTexture;
  sakuraBarkMap: THREE.CanvasTexture;
  ginkgoBarkMap: THREE.CanvasTexture;
  barkNormalMap: THREE.DataTexture;
  sakuraBarkNormalMap: THREE.DataTexture;
  barkAoMap: THREE.DataTexture;
  barkRoughnessMap: THREE.DataTexture;
} {
  const size = 512;
  const rand = makeSeededRand(4409);

  // Shared fine timber/rosewood grain map (for beams & pillars)
  const [bCanvas, bCtx] = makeCanvas(size, size);
  bCtx.fillStyle = '#5c3c2a';
  bCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const h = 24 + rand() * 96;
    const w = 1 + rand() * 2.5;
    bCtx.fillStyle = rand() > 0.45 ? 'rgba(30,16,10,0.34)' : 'rgba(150,112,84,0.22)';
    bCtx.fillRect(x, y, w, h);
  }
  const barkMap = new THREE.CanvasTexture(bCanvas);
  barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.repeat.set(2, 3);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.anisotropy = Math.min(16, maxAniso);

  // Sakura bark: rich coppery-brown Prunus bark + crisp horizontal lenticels & subtle moss/lichen flecks
  const [sCanvas, sCtx] = makeCanvas(size, size);
  sCtx.fillStyle = '#4c322c';
  sCtx.fillRect(0, 0, size, size);
  const sakuraHeights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const band = Math.sin(v * 22 + Math.sin(u * 4) * 1.1) * 0.25 + Math.cos(v * 47 + u * 3) * 0.14;
      sakuraHeights[y * size + x] = 0.52 + band * 0.3;
    }
  }
  for (let i = 0; i < 680; i++) {
    const y = rand() * size;
    const x = rand() * size;
    const h = 14 + rand() * 48;
    sCtx.fillStyle = rand() > 0.5 ? 'rgba(32,19,17,0.34)' : 'rgba(112,72,62,0.24)';
    sCtx.fillRect(x, y, 2 + rand() * 5, h);
  }
  // Characteristic horizontal lenticels of cherry trees (also etched into height map)
  for (let i = 0; i < 280; i++) {
    const y = Math.floor(rand() * size);
    const x = Math.floor(rand() * size);
    const w = Math.floor(20 + rand() * 72);
    const h = Math.floor(2 + rand() * 4);
    const isLight = rand() > 0.35;
    sCtx.fillStyle = isLight ? 'rgba(156,114,96,0.52)' : 'rgba(24,14,12,0.5)';
    sCtx.fillRect(x, y, w, h);
    for (let dy = 0; dy < h; dy++) {
      const py = (y + dy) % size;
      for (let dx = 0; dx < w; dx++) {
        const px = (x + dx) % size;
        sakuraHeights[py * size + px] = Math.max(0.05, Math.min(0.95, sakuraHeights[py * size + px] + (isLight ? 0.22 : -0.25)));
      }
    }
  }
  const sakuraBarkMap = new THREE.CanvasTexture(sCanvas);
  sakuraBarkMap.wrapS = sakuraBarkMap.wrapT = THREE.RepeatWrapping;
  sakuraBarkMap.repeat.set(2, 4);
  sakuraBarkMap.colorSpace = THREE.SRGBColorSpace;
  sakuraBarkMap.anisotropy = Math.min(16, maxAniso);

  const sakuraBarkNormalMap = buildNormalFromHeight(sakuraHeights, size, 2.4);
  sakuraBarkNormalMap.repeat.set(2, 4);
  sakuraBarkNormalMap.anisotropy = Math.min(16, maxAniso);

  // Ginkgo bark: deeply fissured ash-grey / stone-brown vertical bark furrows + linear AO & roughness
  const [gCanvas, gCtx] = makeCanvas(size, size);
  gCtx.fillStyle = '#6f6559';
  gCtx.fillRect(0, 0, size, size);
  const heights = new Float32Array(size * size);
  const barkAoValues = new Float32Array(size * size);
  const barkRoughValues = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const ridge =
        Math.sin(u * 14 + Math.sin(v * 3) * 1.4) * 0.45 +
        Math.cos(u * 29 - Math.sin(v * 6) * 0.9) * 0.3 +
        Math.sin(u * 7 + v * 2) * 0.2;
      const h = 0.5 + ridge * 0.45;
      heights[y * size + x] = h;
      // Crevices get lower AO (0.42..1.0) and higher roughness (0.95..0.58)
      barkAoValues[y * size + x] = Math.max(0.42, Math.min(1.0, 0.56 + h * 0.52));
      barkRoughValues[y * size + x] = Math.max(0.56, Math.min(0.96, 0.92 - h * 0.32));
    }
  }
  for (let i = 0; i < 1200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const h = 30 + rand() * 110;
    const w = 2 + rand() * 6;
    gCtx.fillStyle = rand() > 0.48 ? 'rgba(38,32,26,0.46)' : 'rgba(166,152,136,0.3)';
    gCtx.fillRect(x, y, w, h);
  }
  const ginkgoBarkMap = new THREE.CanvasTexture(gCanvas);
  ginkgoBarkMap.wrapS = ginkgoBarkMap.wrapT = THREE.RepeatWrapping;
  ginkgoBarkMap.repeat.set(2, 4);
  ginkgoBarkMap.colorSpace = THREE.SRGBColorSpace;
  ginkgoBarkMap.anisotropy = Math.min(16, maxAniso);

  const barkNormalMap = buildNormalFromHeight(heights, size, 2.5);
  barkNormalMap.repeat.set(2, 4);
  barkNormalMap.anisotropy = Math.min(16, maxAniso);

  const barkAoMap = buildLinearDataMap(barkAoValues, size, 2, 4, maxAniso);
  const barkRoughnessMap = buildLinearDataMap(barkRoughValues, size, 2, 4, maxAniso);

  return {
    barkMap,
    sakuraBarkMap,
    ginkgoBarkMap,
    barkNormalMap,
    sakuraBarkNormalMap,
    barkAoMap,
    barkRoughnessMap,
  };
}

function buildArchitectureTextures(maxAniso: number): {
  plasterWallMap: THREE.CanvasTexture;
  plasterAoMap: THREE.DataTexture;
  timberPlankMap: THREE.CanvasTexture;
  timberAoMap: THREE.DataTexture;
  timberRoughnessMap: THREE.DataTexture;
  slateRoofMap: THREE.CanvasTexture;
  slateNormalMap: THREE.DataTexture;
  slateAoMap: THREE.DataTexture;
  slateRoughnessMap: THREE.DataTexture;
} {
  const rand = makeSeededRand(6207);

  // 1. Kyoto/Jiangnan warm lime-plaster stucco wall texture + subtle AO cavity map
  const pSize = 512;
  const [pCanvas, pCtx] = makeCanvas(pSize, pSize);
  pCtx.fillStyle = '#efe6d5';
  pCtx.fillRect(0, 0, pSize, pSize);
  for (let i = 0; i < 2400; i++) {
    const x = rand() * pSize;
    const y = rand() * pSize;
    const r = 3 + rand() * 14;
    pCtx.fillStyle = rand() > 0.5 ? 'rgba(255,252,246,0.18)' : 'rgba(182,168,144,0.14)';
    pCtx.beginPath();
    pCtx.arc(x, y, r, 0, Math.PI * 2);
    pCtx.fill();
  }
  const plasterWallMap = new THREE.CanvasTexture(pCanvas);
  plasterWallMap.wrapS = plasterWallMap.wrapT = THREE.RepeatWrapping;
  plasterWallMap.repeat.set(2, 2);
  plasterWallMap.colorSpace = THREE.SRGBColorSpace;
  plasterWallMap.anisotropy = Math.min(16, maxAniso);

  const plasterAoValues = new Float32Array(pSize * pSize);
  for (let y = 0; y < pSize; y++) {
    const edgeBottomShade = y > pSize * 0.82 ? 0.84 : 1.0;
    const edgeTopShade = y < pSize * 0.14 ? 0.86 : 1.0;
    for (let x = 0; x < pSize; x++) {
      const micro = 0.92 + Math.sin(x * 0.12 + y * 0.08) * 0.04 + (rand() - 0.5) * 0.05;
      plasterAoValues[y * pSize + x] = Math.min(1.0, micro * edgeBottomShade * edgeTopShade);
    }
  }
  const plasterAoMap = buildLinearDataMap(plasterAoValues, pSize, 1, 1, maxAniso);

  // 2. Grooved Cedar / Hinoki Floorboard Plank texture + groove AO & varnish roughness
  const tSize = 512;
  const [tCanvas, tCtx] = makeCanvas(tSize, tSize);
  tCtx.fillStyle = '#7c563a';
  tCtx.fillRect(0, 0, tSize, tSize);
  const plankCount = 8;
  const plankH = tSize / plankCount;
  const timberAoValues = new Float32Array(tSize * tSize);
  const timberRoughValues = new Float32Array(tSize * tSize);

  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH;
    const toneShift = (rand() - 0.5) * 20;
    tCtx.fillStyle = `rgb(${124 + toneShift}, ${86 + toneShift * 0.7}, ${58 + toneShift * 0.5})`;
    tCtx.fillRect(0, y0 + 2, tSize, plankH - 3);
    for (let g = 0; g < 75; g++) {
      const gy = y0 + 3 + rand() * (plankH - 6);
      const gx = rand() * tSize;
      const gw = 40 + rand() * 160;
      tCtx.fillStyle = rand() > 0.5 ? 'rgba(42,24,14,0.22)' : 'rgba(182,136,96,0.18)';
      tCtx.fillRect(gx, gy, gw, 1.5);
    }
    tCtx.fillStyle = 'rgba(24, 14, 8, 0.78)';
    tCtx.fillRect(0, y0, tSize, 2.8);
  }
  for (let y = 0; y < tSize; y++) {
    const localY = (y % plankH) / plankH;
    const isSeam = localY < 0.065 || localY > 0.945;
    for (let x = 0; x < tSize; x++) {
      const grain = Math.sin(y * 0.55 + Math.sin(x * 0.04) * 3.0) * 0.06;
      timberAoValues[y * tSize + x] = isSeam ? 0.36 : 0.94 + grain;
      timberRoughValues[y * tSize + x] = isSeam ? 0.92 : Math.max(0.4, Math.min(0.76, 0.56 - grain * 1.4));
    }
  }
  const timberPlankMap = new THREE.CanvasTexture(tCanvas);
  timberPlankMap.wrapS = timberPlankMap.wrapT = THREE.RepeatWrapping;
  timberPlankMap.repeat.set(2, 2);
  timberPlankMap.colorSpace = THREE.SRGBColorSpace;
  timberPlankMap.anisotropy = Math.min(16, maxAniso);

  const timberAoMap = buildLinearDataMap(timberAoValues, tSize, 2, 2, maxAniso);
  const timberRoughnessMap = buildLinearDataMap(timberRoughValues, tSize, 2, 2, maxAniso);

  // 3. Ultra-crisp 1024x1024 Traditional Curved Ceramic Roof Tiles + Normal, AO & Roughness Maps
  const sSize = 1024;
  const [sCanvas, sCtx] = makeCanvas(sSize, sSize);
  sCtx.fillStyle = '#2a313b';
  sCtx.fillRect(0, 0, sSize, sSize);
  const rows = 18;
  const cols = 20;
  const rowH = sSize / rows;
  const colW = sSize / cols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * colW;
      const y0 = r * rowH;
      const shade = 44 + Math.floor(rand() * 20);
      const grad = sCtx.createLinearGradient(x0, y0, x0 + colW, y0);
      grad.addColorStop(0.0, `rgb(${shade - 16}, ${shade - 12}, ${shade - 6})`);
      grad.addColorStop(0.32, `rgb(${shade + 30}, ${shade + 35}, ${shade + 44})`);
      grad.addColorStop(0.72, `rgb(${shade + 10}, ${shade + 14}, ${shade + 20})`);
      grad.addColorStop(1.0, `rgb(${shade - 18}, ${shade - 14}, ${shade - 8})`);
      sCtx.fillStyle = grad;
      sCtx.fillRect(x0 + 1.5, y0 + 1.5, colW - 3, rowH - 5);
      sCtx.fillStyle = 'rgba(8, 12, 18, 0.78)';
      sCtx.fillRect(x0, y0 + rowH - 5.5, colW, 5.5);
      sCtx.fillStyle = 'rgba(138, 152, 174, 0.26)';
      sCtx.fillRect(x0 + 2, y0 + rowH - 7.5, colW - 4, 2);
    }
  }
  const slateRoofMap = new THREE.CanvasTexture(sCanvas);
  slateRoofMap.wrapS = slateRoofMap.wrapT = THREE.RepeatWrapping;
  slateRoofMap.repeat.set(4, 2);
  slateRoofMap.colorSpace = THREE.SRGBColorSpace;
  slateRoofMap.anisotropy = Math.min(16, maxAniso);

  const nSize = 512;
  const tileHeights = new Float32Array(nSize * nSize);
  const tileAoValues = new Float32Array(nSize * nSize);
  const tileRoughValues = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const ty = (y / nSize) * rows;
    const rowFrac = ty - Math.floor(ty);
    for (let x = 0; x < nSize; x++) {
      const tx = (x / nSize) * cols;
      const colFrac = tx - Math.floor(tx);
      const rib = Math.sin(colFrac * Math.PI);
      const overlap = rowFrac > 0.86 ? -0.52 : rowFrac * 0.25;
      tileHeights[y * nSize + x] = 0.5 + rib * 0.35 + overlap * 0.25;
      // Valley seam & course overhang cast crisp ambient occlusion & higher matte roughness
      const seamAo = (1 - Math.abs(colFrac - 0.5) * 0.55) * (rowFrac > 0.86 ? 0.38 : 0.96);
      tileAoValues[y * nSize + x] = Math.max(0.32, Math.min(1.0, seamAo));
      tileRoughValues[y * nSize + x] = rowFrac > 0.86 ? 0.88 : Math.max(0.36, 0.66 - rib * 0.24);
    }
  }
  const slateNormalMap = buildNormalFromHeight(tileHeights, nSize, 3.4);
  slateNormalMap.repeat.set(4, 2);
  slateNormalMap.anisotropy = Math.min(16, maxAniso);

  const slateAoMap = buildLinearDataMap(tileAoValues, nSize, 4, 2, maxAniso);
  const slateRoughnessMap = buildLinearDataMap(tileRoughValues, nSize, 4, 2, maxAniso);

  return {
    plasterWallMap,
    plasterAoMap,
    timberPlankMap,
    timberAoMap,
    timberRoughnessMap,
    slateRoofMap,
    slateNormalMap,
    slateAoMap,
    slateRoughnessMap,
  };
}

export function createParadiseTextures(maxAniso: number): ProceduralTextureSet {
  const rand = makeSeededRand(1337);

  // 1. Crisp 512x512 terrain micro-detail noise
  const [tCanvas, tCtx] = makeCanvas(512, 512);
  const imgData = tCtx.createImageData(512, 512);
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
  terrainDetail.repeat.set(40, 40);
  terrainDetail.colorSpace = THREE.SRGBColorSpace;
  terrainDetail.anisotropy = Math.min(16, maxAniso);

  const {
    barkMap,
    sakuraBarkMap,
    ginkgoBarkMap,
    barkNormalMap,
    sakuraBarkNormalMap,
    barkAoMap,
    barkRoughnessMap,
  } = buildBarkTextureSet(maxAniso);
  const {
    plasterWallMap,
    plasterAoMap,
    timberPlankMap,
    timberAoMap,
    timberRoughnessMap,
    slateRoofMap,
    slateNormalMap,
    slateAoMap,
    slateRoughnessMap,
  } = buildArchitectureTextures(maxAniso);

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
    sakuraBarkMap,
    ginkgoBarkMap,
    barkNormalMap,
    sakuraBarkNormalMap,
    barkAoMap,
    barkRoughnessMap,
    plasterWallMap,
    plasterAoMap,
    timberPlankMap,
    timberAoMap,
    timberRoughnessMap,
    slateRoofMap,
    slateNormalMap,
    slateAoMap,
    slateRoughnessMap,
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
      sakuraBarkMap.dispose();
      ginkgoBarkMap.dispose();
      barkNormalMap.dispose();
      sakuraBarkNormalMap.dispose();
      barkAoMap.dispose();
      barkRoughnessMap.dispose();
      plasterWallMap.dispose();
      plasterAoMap.dispose();
      timberPlankMap.dispose();
      timberAoMap.dispose();
      timberRoughnessMap.dispose();
      slateRoofMap.dispose();
      slateNormalMap.dispose();
      slateAoMap.dispose();
      slateRoughnessMap.dispose();
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
