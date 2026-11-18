import * as THREE from 'three';

export type QualityTier = 'ultra' | 'balanced' | 'mobile' | 'software';

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
  terrainSegments: number;
  waterSegments: number;
  grassCount: number;
  flowerCount: number;
  reedCount: number;
  lotusCount: number;
  dewCount: number;
  treeCount: number;
  butterflyCount: number;
  birdCount: number;
  fireflyCount: number;
  koiCount: number;
  rainCount: number;
  petalCount: number;
  mistCount: number;
}

export function detectParadiseQuality(
  isSoftwareGl: boolean,
  reducedMotion: boolean,
  containerWidth: number,
  containerHeight: number
): ParadiseQualityProfile {
  const isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

  const minDim = Math.min(containerWidth, containerHeight);
  const maxDim = Math.max(containerWidth, containerHeight);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const mem = typeof navigator !== 'undefined' ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) : 8;
  const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Detect foldable / tablet / phone / M2 MacBook Air profiles
  const isPhone = isTouch && minDim < 540 && maxDim < 960;
  const isTabletOrFoldable = isTouch && !isPhone;

  let tier: QualityTier = 'ultra';
  if (isSoftwareGl) {
    tier = 'software';
  } else if (isPhone || mem <= 3 || cores <= 4 && isTouch) {
    tier = 'mobile';
  } else if (isTabletOrFoldable || cores <= 6 || mem <= 4) {
    tier = 'balanced';
  } else {
    tier = 'ultra';
  }

  switch (tier) {
    case 'software':
      // Keep full world composition & scene entities intact; scale only GPU cost
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
        terrainSegments: 96,
        waterSegments: 48,
        grassCount: 1600,
        flowerCount: 420,
        reedCount: 180,
        lotusCount: 24,
        dewCount: 180,
        treeCount: 18,
        butterflyCount: 10,
        birdCount: 5,
        fireflyCount: 65,
        koiCount: 6,
        rainCount: 520,
        petalCount: 90,
        mistCount: 14,
      };

    case 'mobile':
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.45),
        antialias: true,
        enableShadows: false,
        shadowMapSize: 0,
        enableBloom: false,
        terrainSegments: 96,
        waterSegments: 52,
        grassCount: 1500,
        flowerCount: 380,
        reedCount: 170,
        lotusCount: 22,
        dewCount: 160,
        treeCount: 16,
        butterflyCount: 9,
        birdCount: 5,
        fireflyCount: 56,
        koiCount: 6,
        rainCount: 500,
        petalCount: 80,
        mistCount: 12,
      };

    case 'balanced':
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.55),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 1024,
        enableBloom: false,
        terrainSegments: 120,
        waterSegments: 64,
        grassCount: 2800,
        flowerCount: 620,
        reedCount: 260,
        lotusCount: 32,
        dewCount: 260,
        treeCount: 22,
        butterflyCount: 14,
        birdCount: 7,
        fireflyCount: 95,
        koiCount: 8,
        rainCount: 950,
        petalCount: 140,
        mistCount: 16,
      };

    case 'ultra':
    default:
      return {
        tier,
        isSoftwareGl: false,
        isTouch,
        reducedMotion,
        pixelRatio: Math.min(rawDpr, 1.75),
        antialias: true,
        enableShadows: true,
        shadowMapSize: 2048,
        enableBloom: !reducedMotion,
        terrainSegments: 144,
        waterSegments: 80,
        grassCount: 4400,
        flowerCount: 920,
        reedCount: 340,
        lotusCount: 40,
        dewCount: 360,
        treeCount: 28,
        butterflyCount: 18,
        birdCount: 9,
        fireflyCount: 140,
        koiCount: 10,
        rainCount: 1500,
        petalCount: 200,
        mistCount: 20,
      };
  }
}

export interface ProceduralTextureSet {
  terrainDetail: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  slateRoofMap: THREE.CanvasTexture;
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

export function createParadiseTextures(maxAniso: number): ProceduralTextureSet {
  // 1. Subtle organic terrain micro-detail noise (repeat-tiled across terrain)
  const [tCanvas, tCtx] = makeCanvas(256, 256);
  const imgData = tCtx.createImageData(256, 256);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = 212 + Math.floor((rand() - 0.5) * 48);
    imgData.data[i] = v;
    imgData.data[i + 1] = Math.min(255, v + 3);
    imgData.data[i + 2] = Math.max(0, v - 4);
    imgData.data[i + 3] = 255;
  }
  tCtx.putImageData(imgData, 0, 0);
  const terrainDetail = new THREE.CanvasTexture(tCanvas);
  terrainDetail.wrapS = terrainDetail.wrapT = THREE.RepeatWrapping;
  terrainDetail.repeat.set(28, 28);
  terrainDetail.colorSpace = THREE.SRGBColorSpace;
  terrainDetail.anisotropy = Math.min(8, maxAniso);

  // 2. Cedar & birch bark grain
  const [bCanvas, bCtx] = makeCanvas(128, 256);
  bCtx.fillStyle = '#6c5848';
  bCtx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 420; i++) {
    const x = rand() * 128;
    const y = rand() * 256;
    const h = 10 + rand() * 38;
    const w = 1 + rand() * 2.5;
    bCtx.fillStyle = rand() > 0.45 ? 'rgba(42,32,24,0.34)' : 'rgba(148,132,114,0.22)';
    bCtx.fillRect(x, y, w, h);
  }
  const barkMap = new THREE.CanvasTexture(bCanvas);
  barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.repeat.set(2, 4);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.anisotropy = Math.min(4, maxAniso);

  // 3. Dark slate roof tiles texture
  const [sCanvas, sCtx] = makeCanvas(256, 256);
  sCtx.fillStyle = '#333b45';
  sCtx.fillRect(0, 0, 256, 256);
  const rows = 10;
  const cols = 8;
  const rowH = 256 / rows;
  const colW = 256 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const shade = 44 + Math.floor(rand() * 22);
      sCtx.fillStyle = `rgb(${shade}, ${shade + 7}, ${shade + 14})`;
      sCtx.fillRect(c * colW + offset + 1, r * rowH + 1, colW - 2, rowH - 2);
      sCtx.fillStyle = 'rgba(15, 18, 24, 0.45)';
      sCtx.fillRect(c * colW + offset, (r + 1) * rowH - 2, colW, 2);
    }
  }
  const slateRoofMap = new THREE.CanvasTexture(sCanvas);
  slateRoofMap.wrapS = slateRoofMap.wrapT = THREE.RepeatWrapping;
  slateRoofMap.repeat.set(3, 2);
  slateRoofMap.colorSpace = THREE.SRGBColorSpace;
  slateRoofMap.anisotropy = Math.min(4, maxAniso);

  // 4. Soft radial glow (fireflies & sun halo sprites)
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

  // 5. Soft cloud/mist puff sprite
  const [mCanvas, mCtx] = makeCanvas(128, 128);
  const mGrad = mCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  mGrad.addColorStop(0.0, 'rgba(255,255,255,0.65)');
  mGrad.addColorStop(0.45, 'rgba(248,252,255,0.34)');
  mGrad.addColorStop(1.0, 'rgba(240,248,255,0.0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 128, 128);
  const mistPuff = new THREE.CanvasTexture(mCanvas);
  mistPuff.colorSpace = THREE.SRGBColorSpace;

  return {
    terrainDetail,
    barkMap,
    slateRoofMap,
    softGlow,
    mistPuff,
    dispose: () => {
      terrainDetail.dispose();
      barkMap.dispose();
      slateRoofMap.dispose();
      softGlow.dispose();
      mistPuff.dispose();
    },
  };
}
