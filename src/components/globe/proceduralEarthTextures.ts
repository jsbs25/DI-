import * as THREE from 'three';

/**
 * EARTH ONE - PHOTOREALISTIC PROCEDURAL PLANETARY TEXTURE ENGINE
 * Synthesizes NASA Blue Marble / Apollo 17 grade Earth textures using
 * fractal Brownian motion (fBm) terrain, midpoint-displaced natural coastlines,
 * ocean depth gradients, continental shelf shallows, biome climate bands,
 * night lights, dynamic weather clouds, and deep-space celestial backdrops.
 *
 * 100% self-contained on HTML5 Canvas. Zero external 404 dependencies.
 */

// Cache for generated textures to prevent re-generation overhead
const textureCache = new Map<string, THREE.CanvasTexture>();

// Cache for coastline-displaced land polygons (keyed by resolution)
const landPathCache = new Map<string, number[][][]>();

// Cache for terrain masks (land / coast / desert / rainforest)
interface TerrainMasks {
  land: Uint8ClampedArray;
  coast: Uint8ClampedArray;
  desert: Uint8ClampedArray;
  rainforest: Uint8ClampedArray;
}
const maskCache = new Map<string, TerrainMasks>();

// Helper to convert lat/long (-90..90, -180..180) to canvas (x, y)
function geoToCanvas(lat: number, lng: number, width: number, height: number): [number, number] {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

/* ------------------------------------------------------------------------- */
/*  Deterministic fractal noise (seamless in longitude, no external deps)     */
/* ------------------------------------------------------------------------- */

// Fast deterministic integer hash -> [0, 1)
function hash2i(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 2D value noise with horizontal wrap (periodX in lattice cells) for seamless equirectangular tiling
function valueNoise2(x: number, y: number, periodX: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const x0 = ((xi % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const y0 = yi;
  const y1 = yi + 1;

  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);

  const n00 = hash2i(x0, y0, seed);
  const n10 = hash2i(x1, y0, seed);
  const n01 = hash2i(x0, y1, seed);
  const n11 = hash2i(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

// Fractal Brownian motion (4-5 octaves) -> [0, 1]
function fbm2(x: number, y: number, periodX: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, periodX * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(lo: number, hi: number, v: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

// Linear RGB mix between two [r,g,b] tuples
function mixc(a: number[], b: number[], t: number): number[] {
  const tt = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * tt,
    a[1] + (b[1] - a[1]) * tt,
    a[2] + (b[2] - a[2]) * tt
  ];
}

/* ------------------------------------------------------------------------- */
/*  Geographic polygon data                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Detailed geographic continental polygon outlines (equirectangular lat/lng)
 */
const WORLD_LANDMASSES: [number, number][][] = [
  // North America & Canada & Alaska
  [
    [71, -156], [70, -140], [69, -133], [60, -138], [55, -130], [50, -127], [48, -124],
    [38, -123], [32, -117], [28, -114], [23, -110], [19, -105], [16, -95], [15, -92],
    [9, -83], [8, -78], [11, -75], [16, -83], [19, -88], [21, -89], [25, -80],
    [30, -81], [35, -75], [41, -71], [44, -66], [47, -53], [52, -56], [58, -62],
    [62, -64], [62, -75], [58, -78], [55, -82], [52, -80], [52, -92], [57, -90],
    [64, -90], [68, -96], [68, -115], [70, -128], [72, -150]
  ],
  // Baja California
  [
    [32, -116], [28, -113], [23, -110], [24, -111], [29, -114], [32, -117]
  ],
  // Florida Peninsula
  [
    [30, -81], [27, -80], [25, -80], [25, -81], [28, -82], [30, -84]
  ],
  // Greenland
  [
    [83, -30], [81, -12], [76, -19], [70, -22], [65, -38], [60, -43], [60, -46],
    [65, -52], [72, -56], [77, -68], [81, -64], [83, -45]
  ],
  // South America
  [
    [12, -72], [11, -63], [7, -58], [4, -51], [0, -49], [-3, -40], [-6, -35],
    [-10, -36], [-13, -39], [-18, -39], [-23, -42], [-28, -48], [-33, -51],
    [-38, -57], [-45, -64], [-52, -68], [-55, -67], [-54, -71], [-50, -75],
    [-42, -74], [-30, -71], [-18, -70], [-14, -76], [-5, -81], [0, -80],
    [5, -77], [8, -77], [9, -75]
  ],
  // Eurasia (Europe + Asia + Siberia)
  [
    [36, -6], [43, -9], [44, -1], [48, -4], [50, 1], [53, 5], [55, 8],
    [57, 10], [58, 12], [60, 22], [65, 22], [71, 26], [69, 36], [68, 50],
    [73, 72], [73, 80], [77, 104], [74, 115], [71, 130], [70, 140], [71, 150],
    [66, 170], [65, 178], [60, 166], [56, 162], [51, 157], [46, 142],
    [43, 134], [40, 128], [37, 126], [35, 129], [34, 126], [38, 119],
    [31, 122], [28, 121], [23, 117], [22, 114], [21, 108], [11, 108],
    [10, 105], [13, 100], [8, 98], [13, 93], [16, 96], [22, 90],
    [22, 88], [16, 82], [10, 79], [8, 77], [13, 74], [20, 73], [24, 68],
    [25, 62], [25, 57], [23, 58], [16, 54], [13, 44], [13, 43], [18, 40],
    [28, 34], [31, 35], [36, 36], [37, 30], [41, 28], [40, 23], [37, 22],
    [40, 18], [45, 13], [44, 8], [43, 3], [37, -2], [36, -5]
  ],
  // Scandinavia Peninsula
  [
    [58, 6], [62, 5], [68, 14], [71, 26], [70, 30], [65, 24], [60, 19],
    [56, 12], [56, 8], [58, 6]
  ],
  // British Isles & Ireland
  [
    [50, -5], [51, 1], [53, 0], [56, -2], [58, -3], [58, -5], [55, -6],
    [53, -4], [51, -4]
  ],
  [
    [51, -10], [54, -10], [55, -6], [53, -6], [51, -8]
  ],
  // Africa
  [
    [36, -5], [37, 10], [33, 11], [32, 20], [32, 32], [28, 34], [22, 37],
    [15, 41], [12, 44], [12, 51], [10, 51], [4, 48], [-1, 41], [-5, 39],
    [-11, 40], [-15, 40], [-26, 33], [-33, 27], [-34, 19], [-30, 17],
    [-22, 14], [-15, 12], [-6, 12], [-5, 9], [4, 9], [5, 4], [5, 1],
    [4, -7], [8, -13], [12, -16], [16, -16], [21, -17], [28, -13], [32, -9],
    [35, -6]
  ],
  // Madagascar
  [
    [-12, 49], [-16, 50], [-25, 47], [-25, 44], [-20, 44], [-13, 48]
  ],
  // India Subcontinent (Enhanced outline)
  [
    [24, 68], [21, 70], [18, 73], [15, 74], [10, 76], [8, 77], [9, 78],
    [13, 80], [17, 82], [21, 87], [23, 89], [26, 89], [28, 85], [31, 78],
    [30, 71], [27, 68], [24, 68]
  ],
  // Japan (Honshu, Hokkaido, Kyushu)
  [
    [45, 142], [43, 145], [42, 141], [40, 140], [36, 140], [35, 139],
    [34, 136], [33, 131], [33, 130], [35, 133], [37, 137], [40, 140],
    [44, 142]
  ],
  // Australia
  [
    [-11, 142], [-14, 144], [-20, 148], [-25, 153], [-32, 153], [-38, 149],
    [-39, 146], [-37, 140], [-35, 136], [-32, 132], [-32, 125], [-35, 117],
    [-34, 115], [-29, 114], [-22, 114], [-19, 121], [-16, 123], [-14, 126],
    [-12, 130], [-12, 136], [-15, 136], [-17, 140], [-11, 142]
  ],
  // New Zealand (North & South Islands)
  [
    [-35, 174], [-38, 178], [-41, 175], [-39, 174], [-36, 173]
  ],
  [
    [-41, 174], [-44, 171], [-46, 168], [-46, 166], [-43, 170], [-41, 173]
  ],
  // Indonesia & Southeast Asia Islands
  [
    // Sumatra
    [5, 96], [3, 98], [-1, 102], [-5, 105], [-6, 104], [-2, 100], [2, 97], [5, 96]
  ],
  [
    // Borneo
    [7, 117], [5, 119], [1, 118], [-3, 116], [-4, 114], [-2, 110], [1, 109], [4, 114], [7, 117]
  ],
  // Antarctica (Realistic glaciated continent)
  [
    [-65, -65], [-68, -63], [-72, -60], [-75, -25], [-72, 10], [-68, 40],
    [-66, 70], [-66, 90], [-65, 110], [-66, 130], [-67, 140], [-71, 165],
    [-78, 170], [-82, -180], [-80, -140], [-74, -105], [-72, -80], [-65, -65]
  ]
];

/**
 * Biome Overlays (Deserts, Rainforests)
 */
const DESERT_ZONES: [number, number][][] = [
  // Sahara & Sahel
  [[32, -10], [33, 15], [30, 32], [22, 36], [16, 36], [15, -15], [24, -15]],
  // Arabian Peninsula & Middle East
  [[31, 35], [32, 50], [24, 57], [16, 54], [14, 44], [22, 38], [28, 35]],
  // Gobi & Taklamakan
  [[46, 80], [45, 110], [38, 112], [37, 78]],
  // Australian Outback (Red Ochre center)
  [[-20, 118], [-18, 138], [-28, 142], [-32, 134], [-30, 120]],
  // North American Mojave/Sonoran
  [[38, -118], [36, -108], [28, -105], [26, -112], [32, -116]],
  // Kalahari / Namib
  [[-18, 13], [-18, 26], [-28, 25], [-29, 17]]
];

const RAINFOREST_ZONES: [number, number][][] = [
  // Amazon Basin (Lush dense emerald canopy)
  [[5, -74], [4, -50], [-4, -45], [-12, -50], [-14, -68], [-5, -75]],
  // Congo Basin (Central Africa)
  [[4, 12], [4, 28], [-4, 28], [-5, 14]],
  // Southeast Asia & Sundaland
  [[8, 98], [4, 104], [-5, 105], [-5, 118], [7, 118], [15, 108]]
];

/* ------------------------------------------------------------------------- */
/*  Natural coastline generation                                             */
/* ------------------------------------------------------------------------- */

// Deterministic PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Midpoint displacement: subdivide each segment, jittering the midpoint
// perpendicular to the edge. Produces fractal, organic coastlines.
function subdividePolyline(pts: number[][], jag: number, rand: () => number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (rand() - 0.5) * 2 * jag * len;
    out.push(a, [mx + nx * offset, my + ny * offset]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Convert lat/lng polygons to jittered canvas-space coastlines (cached per resolution)
function getJitteredLandPolygons(width: number, height: number): number[][][] {
  const key = `${width}x${height}`;
  const cached = landPathCache.get(key);
  if (cached) return cached;

  const rand = mulberry32(20261104);
  const polys = WORLD_LANDMASSES.map(poly => {
    let pts = poly.map(([lat, lng]) => {
      const [x, y] = geoToCanvas(lat, lng, width, height);
      return [x, y];
    });
    // Close the loop so first == last after subdivision
    pts = [...pts, pts[0]];
    for (let it = 0; it < 3; it++) {
      pts = subdividePolyline(pts, 0.22, rand);
    }
    return pts;
  });

  landPathCache.set(key, polys);
  return polys;
}

// Trace a list of polygons onto the context (caller then fills or strokes)
function tracePolys(ctx: CanvasRenderingContext2D, polys: number[][][]) {
  for (const poly of polys) {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const [x, y] = poly[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

// Trace lat/lng zones (biomes) and fill them
function traceZones(ctx: CanvasRenderingContext2D, zones: [number, number][][], width: number, height: number) {
  for (const zone of zones) {
    ctx.beginPath();
    for (let i = 0; i < zone.length; i++) {
      const [x, y] = geoToCanvas(zone[i][0], zone[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

// Extract the alpha channel from an ImageData (1 byte per pixel)
function alphaOf(img: ImageData): Uint8ClampedArray {
  const d = img.data;
  const out = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = d[j];
  return out;
}

// Build land / coast / desert / rainforest masks at a given resolution (cached)
function getTerrainMasks(width: number, height: number): TerrainMasks {
  const key = `masks_${width}x${height}`;
  const cached = maskCache.get(key);
  if (cached) return cached;

  const landPolys = getJitteredLandPolygons(width, height);

  // 1. Land mask
  const landCanvas = document.createElement('canvas');
  landCanvas.width = width;
  landCanvas.height = height;
  const lctx = landCanvas.getContext('2d')!;
  lctx.fillStyle = '#ffffff';
  tracePolys(lctx, landPolys);
  lctx.fill();
  const land = alphaOf(lctx.getImageData(0, 0, width, height));

  // 2. Coastal / continental shelf halo (blurred land outline)
  const coastCanvas = document.createElement('canvas');
  coastCanvas.width = width;
  coastCanvas.height = height;
  const cctx = coastCanvas.getContext('2d')!;
  cctx.strokeStyle = '#ffffff';
  cctx.lineWidth = Math.max(8, width * 0.012);
  cctx.lineJoin = 'round';
  cctx.lineCap = 'round';
  cctx.filter = 'blur(8px)';
  tracePolys(cctx, landPolys);
  cctx.stroke();
  cctx.filter = 'none';
  const coast = alphaOf(cctx.getImageData(0, 0, width, height));

  // 3. Desert mask
  const desertCanvas = document.createElement('canvas');
  desertCanvas.width = width;
  desertCanvas.height = height;
  const dctx = desertCanvas.getContext('2d')!;
  dctx.fillStyle = '#ffffff';
  dctx.filter = 'blur(6px)';
  traceZones(dctx, DESERT_ZONES, width, height);
  dctx.fill();
  dctx.filter = 'none';
  const desert = alphaOf(dctx.getImageData(0, 0, width, height));

  // 4. Rainforest mask
  const rfCanvas = document.createElement('canvas');
  rfCanvas.width = width;
  rfCanvas.height = height;
  const rctx = rfCanvas.getContext('2d')!;
  rctx.fillStyle = '#ffffff';
  rctx.filter = 'blur(6px)';
  traceZones(rctx, RAINFOREST_ZONES, width, height);
  rctx.fill();
  rctx.filter = 'none';
  const rainforest = alphaOf(rctx.getImageData(0, 0, width, height));

  const masks = { land, coast, desert, rainforest };
  maskCache.set(key, masks);
  return masks;
}

/* ------------------------------------------------------------------------- */
/*  1. PHOTOREALISTIC BLUE MARBLE ALBEDO TEXTURE                              */
/* ------------------------------------------------------------------------- */

export function createRealisticEarthDayTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_photoreal_day_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const { land, coast, desert, rainforest } = getTerrainMasks(width, height);

  // Feature scale: integer lattice period across the map width, seamless in longitude
  const PERIOD = 48;
  const s = PERIOD / width;

  const out = ctx.createImageData(width, height);
  const outData = out.data;

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    const absLat = Math.abs(lat);
    const temp = 1 - absLat / 90; // 0 pole -> 1 equator

    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let r: number, g: number, b: number;

      if (land[i] > 128) {
        // ------- LAND -------
        const e = fbm2(x * s, y * s, PERIOD, 1001, 4);   // elevation
        const m = fbm2(x * s, y * s, PERIOD, 2053, 3);   // moisture

        if (absLat > 72 || lat < -60) {
          // Polar ice sheets
          const ice = mixc([206, 220, 234], [250, 253, 255], m);
          [r, g, b] = ice;
        } else if (desert[i] > 120) {
          // Arid desert belts
          const d = mixc([206, 182, 132], [150, 122, 86], e);
          [r, g, b] = d;
        } else if (rainforest[i] > 120) {
          // Lush tropical rainforest
          const f = mixc([26, 70, 40], [14, 46, 28], e);
          [r, g, b] = f;
        } else {
          // Temperate / boreal vegetation gradient with elevation relief
          let veg = mixc([96, 122, 68], [52, 92, 44], temp);
          veg = mixc(veg, [126, 112, 88], smoothstep(0.45, 0.75, e));
          veg = mixc(veg, [veg[0] * 0.72, veg[1] * 0.78, veg[2] * 0.62], (1 - m) * 0.35);
          veg = mixc(veg, [240, 244, 248], smoothstep(0.78, 0.92, e));
          [r, g, b] = veg;
        }
      } else {
        // ------- OCEAN -------
        const d = fbm2(x * s, y * s, PERIOD, 3079, 3);
        let ocean = mixc([5, 17, 42], [10, 36, 76], d);

        // Continental shelf shallows near coastlines
        if (coast[i] > 20) {
          const t = (coast[i] / 255) * 0.85;
          ocean = mixc(ocean, [36, 126, 164], t);
        }
        [r, g, b] = ocean;
      }

      outData[i * 4] = r;
      outData[i * 4 + 1] = g;
      outData[i * 4 + 2] = b;
      outData[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  2. OCEAN SPECULAR / ROUGHNESS MAP                                         */
/* ------------------------------------------------------------------------- */

export function createRealisticEarthRoughnessTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_roughness_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const { land } = getTerrainMasks(width, height);
  const out = ctx.createImageData(width, height);
  const outData = out.data;

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    const absLat = Math.abs(lat);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v: number;
      if (land[i] > 128) {
        // Land is matte (high roughness)
        v = absLat > 72 || lat < -60 ? 175 : 235;
      } else {
        // Ocean is glossy (low roughness -> strong sun glint)
        v = 30;
      }
      outData[i * 4] = v;
      outData[i * 4 + 1] = v;
      outData[i * 4 + 2] = v;
      outData[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  3. ELEVATION / MOUNTAIN BUMP MAP                                          */
/* ------------------------------------------------------------------------- */

export function createRealisticEarthBumpTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_bump_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const { land } = getTerrainMasks(width, height);
  const PERIOD = 48;
  const s = PERIOD / width;

  const out = ctx.createImageData(width, height);
  const outData = out.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v: number;
      if (land[i] > 128) {
        const e = fbm2(x * s, y * s, PERIOD, 1001, 4);
        v = 118 + e * 135; // 118..253 relief on land
      } else {
        v = 128; // neutral ocean
      }
      outData[i * 4] = v;
      outData[i * 4 + 1] = v;
      outData[i * 4 + 2] = v;
      outData[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  4. NASA BLACK MARBLE NIGHT LIGHTS TEXTURE                                 */
/* ------------------------------------------------------------------------- */

export function createRealisticEarthNightTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_photoreal_night_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Pitch black unlit side
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const drawCityGlow = (lat: number, lng: number, radius: number, intensity: number) => {
    const [cx, cy] = geoToCanvas(lat, lng, width, height);
    const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, radius);
    grad.addColorStop(0, `rgba(255, 240, 180, ${intensity})`);
    grad.addColorStop(0.35, `rgba(245, 175, 60, ${intensity * 0.7})`);
    grad.addColorStop(0.7, `rgba(180, 95, 20, ${intensity * 0.25})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // Major Human Metropolitan Corridors (NASA Black Marble accurate positions)
  const METROPOLISES = [
    { lat: 35.7, lng: 139.7, r: 24, i: 1.0 },   // Tokyo Greater Area
    { lat: 34.7, lng: 135.5, r: 18, i: 0.95 },  // Osaka/Kyoto
    { lat: 37.5, lng: 126.9, r: 18, i: 0.95 },  // Seoul Capital
    { lat: 31.2, lng: 121.5, r: 28, i: 1.0 },   // Shanghai / Yangtze Delta
    { lat: 39.9, lng: 116.4, r: 24, i: 0.98 },  // Beijing
    { lat: 23.1, lng: 113.2, r: 26, i: 1.0 },   // Pearl River Delta
    { lat: 30.6, lng: 104.1, r: 16, i: 0.9 },   // Chengdu
    { lat: 29.5, lng: 106.5, r: 16, i: 0.9 },   // Chongqing
    { lat: 1.3, lng: 103.8, r: 12, i: 0.95 },   // Singapore
    { lat: 13.7, lng: 100.5, r: 14, i: 0.85 },  // Bangkok
    { lat: 14.6, lng: 121.0, r: 14, i: 0.85 },  // Manila
    { lat: -6.2, lng: 106.8, r: 16, i: 0.85 },  // Jakarta
    { lat: 28.6, lng: 77.2, r: 22, i: 0.95 },   // Delhi NCR
    { lat: 19.0, lng: 72.8, r: 20, i: 0.95 },   // Mumbai
    { lat: 12.9, lng: 77.6, r: 16, i: 0.9 },    // Bengaluru
    { lat: 22.5, lng: 88.3, r: 16, i: 0.9 },    // Kolkata
    { lat: 24.8, lng: 67.0, r: 15, i: 0.85 },   // Karachi
    { lat: 31.5, lng: 74.3, r: 14, i: 0.85 },   // Lahore
    { lat: 51.5, lng: -0.1, r: 24, i: 1.0 },    // London
    { lat: 48.9, lng: 2.35, r: 22, i: 1.0 },    // Paris
    { lat: 50.9, lng: 6.9, r: 26, i: 0.95 },    // Rhine-Ruhr / Benelux
    { lat: 52.3, lng: 4.9, r: 16, i: 0.9 },     // Amsterdam
    { lat: 52.5, lng: 13.4, r: 18, i: 0.9 },    // Berlin
    { lat: 48.1, lng: 11.5, r: 14, i: 0.9 },    // Munich
    { lat: 45.4, lng: 9.2, r: 18, i: 0.9 },     // Milan / Po Valley
    { lat: 40.4, lng: -3.7, r: 16, i: 0.9 },    // Madrid
    { lat: 55.7, lng: 37.6, r: 22, i: 0.95 },   // Moscow
    { lat: 59.9, lng: 30.3, r: 14, i: 0.85 },   // St. Petersburg
    { lat: 30.0, lng: 31.2, r: 20, i: 0.95 },   // Cairo & Nile Valley
    { lat: 25.2, lng: 55.3, r: 16, i: 0.95 },   // Dubai / Abu Dhabi
    { lat: 24.7, lng: 46.7, r: 15, i: 0.9 },    // Riyadh
    { lat: 32.0, lng: 34.8, r: 14, i: 0.9 },    // Tel Aviv
    { lat: 35.7, lng: 51.4, r: 16, i: 0.88 },   // Tehran
    { lat: 41.0, lng: 28.9, r: 18, i: 0.9 },    // Istanbul
    { lat: 6.5, lng: 3.4, r: 16, i: 0.85 },     // Lagos
    { lat: -26.2, lng: 28.0, r: 16, i: 0.9 },   // Johannesburg
    { lat: -33.9, lng: 18.4, r: 12, i: 0.85 },  // Cape Town
    { lat: 40.7, lng: -74.0, r: 30, i: 1.0 },   // New York / Northeast
    { lat: 41.8, lng: -87.6, r: 24, i: 0.98 },  // Chicago & Great Lakes
    { lat: 34.0, lng: -118.2, r: 26, i: 1.0 },  // Los Angeles Basin
    { lat: 37.7, lng: -122.4, r: 20, i: 0.98 }, // San Francisco Bay
    { lat: 47.6, lng: -122.3, r: 16, i: 0.9 },  // Seattle
    { lat: 29.7, lng: -95.3, r: 20, i: 0.95 },  // Houston
    { lat: 32.7, lng: -96.8, r: 20, i: 0.95 },  // Dallas-Fort Worth
    { lat: 25.7, lng: -80.2, r: 18, i: 0.95 },  // Miami / South Florida
    { lat: 33.7, lng: -84.3, r: 18, i: 0.9 },   // Atlanta
    { lat: 43.6, lng: -79.3, r: 18, i: 0.95 },  // Toronto
    { lat: 45.5, lng: -73.5, r: 16, i: 0.9 },   // Montreal
    { lat: 19.4, lng: -99.1, r: 24, i: 0.95 },  // Mexico City
    { lat: -23.5, lng: -46.6, r: 24, i: 0.98 }, // São Paulo
    { lat: -22.9, lng: -43.1, r: 20, i: 0.95 }, // Rio de Janeiro
    { lat: -34.6, lng: -58.3, r: 22, i: 0.95 }, // Buenos Aires
    { lat: -33.4, lng: -70.6, r: 16, i: 0.88 }, // Santiago
    { lat: 4.7, lng: -74.0, r: 16, i: 0.88 },   // Bogotá
    { lat: -12.0, lng: -77.0, r: 16, i: 0.88 }, // Lima
    { lat: -33.8, lng: 151.2, r: 18, i: 0.95 }, // Sydney
    { lat: -37.8, lng: 144.9, r: 18, i: 0.95 }, // Melbourne
    { lat: -27.4, lng: 153.0, r: 14, i: 0.88 }, // Brisbane
    { lat: -31.9, lng: 115.8, r: 12, i: 0.85 }  // Perth
  ];

  for (const city of METROPOLISES) {
    drawCityGlow(city.lat, city.lng, city.r, city.i);
  }

  // Nile River light ribbon (famous orbital landmark)
  ctx.strokeStyle = 'rgba(255, 210, 90, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const nilePoints = [
    [24, 32.8], [26, 32.7], [27, 31.5], [29, 31.2], [30.1, 31.3]
  ];
  for (let i = 0; i < nilePoints.length; i++) {
    const [x, y] = geoToCanvas(nilePoints[i][0], nilePoints[i][1], width, height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Highway corridors & secondary townships across populated landmasses
  ctx.fillStyle = 'rgba(255, 215, 120, 0.7)';
  for (let i = 0; i < 1800; i++) {
    const randLand = WORLD_LANDMASSES[Math.floor(Math.random() * WORLD_LANDMASSES.length)];
    const pt = randLand[Math.floor(Math.random() * randLand.length)];
    const [cx, cy] = geoToCanvas(
      pt[0] + (Math.random() - 0.5) * 8,
      pt[1] + (Math.random() - 0.5) * 8,
      width,
      height
    );
    const sz = Math.random() > 0.85 ? 2.2 : 1.2;
    ctx.fillRect(cx, cy, sz, sz);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  5. DYNAMIC PHOTOREALISTIC WEATHER CLOUD TEXTURE                           */
/* ------------------------------------------------------------------------- */

export function createRealisticEarthCloudTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_clouds_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);

  // Intertropical Convergence Zone (ITCZ) equatorial fluffy cloud bands
  for (let y = height * 0.42; y <= height * 0.56; y += 4) {
    const norm = Math.sin(((y - height * 0.42) / (height * 0.14)) * Math.PI);
    for (let x = 0; x < width; x += 10) {
      const n = Math.sin(x * 0.015) * Math.cos(y * 0.02) + Math.sin(x * 0.04 + y * 0.03);
      if (n > 0.3) {
        const alpha = (n - 0.3) * 0.45 * norm;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.85, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, 6 + Math.random() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Mid-latitude storm fronts & swirls
  const drawCyclone = (lat: number, lng: number, radius: number) => {
    const [cx, cy] = geoToCanvas(lat, lng, width, height);
    for (let theta = 0; theta < Math.PI * 4; theta += 0.15) {
      const r = (theta / (Math.PI * 4)) * radius;
      const x = cx + Math.cos(theta) * r;
      const y = cy + Math.sin(theta) * r * 0.7;
      const alpha = (1 - (r / radius)) * 0.75;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 8 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawCyclone(24, -65, 75);  // Atlantic Hurricane
  drawCyclone(18, 135, 90);  // Pacific Typhoon
  drawCyclone(48, -35, 110); // North Atlantic gale
  drawCyclone(52, 160, 110); // Aleutian Low
  drawCyclone(-45, 90, 120); // Southern Ocean storm

  // Wispy cirrus filaments across temperate zones
  ctx.save();
  ctx.filter = 'blur(4px)';
  for (let y = height * 0.2; y <= height * 0.8; y += 8) {
    if (Math.abs(y - height * 0.5) > height * 0.1) {
      for (let x = 0; x < width; x += 16) {
        const noise = Math.sin(x * 0.008 + y * 0.015) * Math.sin(x * 0.02 - y * 0.01);
        if (noise > 0.4) {
          ctx.fillStyle = `rgba(250, 252, 255, ${(noise - 0.4) * 0.5})`;
          ctx.beginPath();
          ctx.arc(x, y, 12 + noise * 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Lightweight, seamless spherical-coordinate cloud layer texture.
 * Evaluated directly on unit sphere (x, y, z) so there is zero antimeridian seam or polar pinch.
 */
export function createSubtleEarthCloudTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_clouds_seamless_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const data = img.data;

  const fbm3 = (x: number, y: number, z: number) => {
    const n1 = Math.sin(x * 2.4 + Math.cos(y * 2.1 + z * 1.9)) * Math.cos(z * 2.3 - x * 1.7);
    const n2 = Math.sin(x * 5.2 - z * 4.4 + y * 3.1) * Math.cos(y * 4.8 + x * 3.7);
    const n3 = Math.sin(z * 9.8 + x * 8.1 - y * 7.4) * Math.cos(x * 9.2 + y * 8.6);
    const n4 = Math.sin(y * 17.5 + z * 15.2) * 0.5 + Math.cos(x * 16.3 - z * 14.1) * 0.5;
    return n1 * 0.48 + n2 * 0.28 + n3 * 0.16 + n4 * 0.08;
  };

  for (let py = 0; py < height; py++) {
    const v = py / Math.max(1, height - 1);
    const phi = v * Math.PI; // 0..PI
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    // Subtle climatological bands (ITCZ near equator + storm tracks near +/- 48 deg)
    const latNorm = Math.abs(v - 0.5) * 2.0; // 0 equator -> 1 poles
    const itczBoost = Math.exp(-Math.pow(latNorm / 0.16, 2)) * 0.14;
    const stormTrackBoost = Math.exp(-Math.pow((latNorm - 0.52) / 0.20, 2)) * 0.16;

    for (let px = 0; px < width; px++) {
      const u = px / width;
      const theta = u * Math.PI * 2;
      const sx = sinPhi * Math.cos(theta);
      const sy = cosPhi;
      const sz = sinPhi * Math.sin(theta);

      // Gentle Coriolis zonal swirl warp
      const swirl = sy * 0.65;
      const wx = sx * Math.cos(swirl) - sz * Math.sin(swirl);
      const wz = sx * Math.sin(swirl) + sz * Math.cos(swirl);

      const val = fbm3(wx, sy, wz) + itczBoost + stormTrackBoost;
      const t = Math.max(0, Math.min(1, (val - 0.14) / 0.52));
      const smooth = t * t * (3 - 2 * t);

      const idx = (py * width + px) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(smooth * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  6. DEEP COSMOS & MILKY WAY SKYBOX TEXTURE                                 */
/* ------------------------------------------------------------------------- */

export function createRealisticMilkyWayTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `milky_way_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep space pitch black with subtle stellar gradient
  ctx.fillStyle = '#010206';
  ctx.fillRect(0, 0, width, height);

  // Milky Way celestial band diagonal across sky
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-0.35);

  const galGrad = ctx.createLinearGradient(0, -height * 0.2, 0, height * 0.2);
  galGrad.addColorStop(0, 'rgba(12, 18, 45, 0)');
  galGrad.addColorStop(0.3, 'rgba(30, 42, 90, 0.28)');
  galGrad.addColorStop(0.48, 'rgba(165, 140, 195, 0.42)');
  galGrad.addColorStop(0.52, 'rgba(190, 165, 215, 0.48)');
  galGrad.addColorStop(0.7, 'rgba(30, 42, 90, 0.28)');
  galGrad.addColorStop(1, 'rgba(12, 18, 45, 0)');
  ctx.fillStyle = galGrad;
  ctx.fillRect(-width, -height * 0.3, width * 2, height * 0.6);

  // Dark molecular dust rifts
  ctx.fillStyle = 'rgba(2, 4, 10, 0.65)';
  for (let x = -width * 0.8; x <= width * 0.8; x += 18) {
    const waveY = Math.sin(x * 0.004) * 25 + Math.sin(x * 0.01) * 12;
    const r = 18 + Math.random() * 22;
    ctx.beginPath();
    ctx.arc(x, waveY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dense star clouds in the galactic core
  ctx.fillStyle = 'rgba(255, 248, 230, 0.85)';
  for (let i = 0; i < 2200; i++) {
    const sx = (Math.random() - 0.5) * width * 1.6;
    const sy = (Math.random() - 0.5) * height * 0.25;
    const sz = Math.random() > 0.92 ? 1.8 : 0.9;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.restore();

  // General field background stars
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const bright = Math.random();
    const size = bright > 0.95 ? 2.0 : bright > 0.7 ? 1.2 : 0.7;
    if (bright > 0.9) ctx.fillStyle = 'rgba(195, 220, 255, 0.95)';
    else if (bright > 0.8) ctx.fillStyle = 'rgba(255, 242, 210, 0.9)';
    else ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* ------------------------------------------------------------------------- */
/*  Lat/Lng -> 3D Cartesian on a sphere                                       */
/* ------------------------------------------------------------------------- */

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}
