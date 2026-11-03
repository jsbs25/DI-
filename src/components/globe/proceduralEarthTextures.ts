import * as THREE from 'three';

/**
 * EARTH ONE - PHOTOREALISTIC PROCEDURAL PLANETARY TEXTURE ENGINE
 * Synthesizes photorealistic NASA Blue Marble / Apollo 17 grade Earth textures,
 * ocean roughness maps, continental elevation bump maps, night lights,
 * dynamic weather clouds, and deep-space celestial milky way backdrops.
 * 
 * 100% self-contained on HTML5 Canvas. Zero external 404 dependencies.
 */

// Cache for generated textures to prevent re-generation overhead
const textureCache = new Map<string, THREE.CanvasTexture>();

// Helper to convert lat/long (-90..90, -180..180) to canvas (x, y)
function geoToCanvas(lat: number, lng: number, width: number, height: number): [number, number] {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

/**
 * Detailed geographic continental polygon outlines
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
 * Biome Overlays (Deserts, Rainforests, Mountain ranges, Polar Caps)
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

const MOUNTAIN_CHAINS: [number, number][][] = [
  // Himalayas & Tibetan Plateau
  [[36, 75], [37, 95], [28, 97], [27, 85], [32, 75]],
  // Andes Spine
  [[8, -75], [-5, -78], [-18, -69], [-33, -70], [-52, -72]],
  // Rockies
  [[58, -125], [48, -115], [38, -106], [32, -104]],
  // European Alps
  [[47, 6], [48, 12], [45, 13], [44, 7]]
];

/**
 * 1. PHOTOREALISTIC BLUE MARBLE ALBEDO TEXTURE
 * Renders authentic ocean depths, coastal shallows, biomes, deserts, vegetation,
 * mountain relief, and polar ice shelves.
 */
export function createRealisticEarthDayTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_photoreal_day_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1.1 Deep Oceanic Abyss Gradient (true NASA Blue Marble navy & royal blue)
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#041126');   // Polar Arctic sea
  oceanGrad.addColorStop(0.18, '#061d3d');
  oceanGrad.addColorStop(0.5, '#041630');  // Deep equatorial ocean
  oceanGrad.addColorStop(0.82, '#061d3d');
  oceanGrad.addColorStop(1, '#030d20');   // Antarctic ocean
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // 1.2 Continental Shelves / Shallow Coastal Waters (turquoise aquamarine halo)
  ctx.save();
  ctx.strokeStyle = 'rgba(20, 150, 180, 0.45)';
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.filter = 'blur(6px)';

  for (const land of WORLD_LANDMASSES) {
    ctx.beginPath();
    for (let i = 0; i < land.length; i++) {
      const [x, y] = geoToCanvas(land[i][0], land[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // 1.3 Base Continents (Temperate forest / savanna green)
  ctx.save();
  ctx.fillStyle = '#264a22'; // Realistic continental base green
  ctx.strokeStyle = '#1b3b18';
  ctx.lineWidth = 1.0;
  ctx.lineJoin = 'round';

  for (const land of WORLD_LANDMASSES) {
    ctx.beginPath();
    for (let i = 0; i < land.length; i++) {
      const [x, y] = geoToCanvas(land[i][0], land[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 1.4 Lush Dense Rainforest Biomes (Amazon, Congo, Southeast Asia)
  ctx.save();
  ctx.fillStyle = '#143615'; // Deep emerald jungle
  ctx.filter = 'blur(8px)';
  for (const zone of RAINFOREST_ZONES) {
    ctx.beginPath();
    for (let i = 0; i < zone.length; i++) {
      const [x, y] = geoToCanvas(zone[i][0], zone[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 1.5 Arid Desert Belts (Sahara, Arabia, Gobi, Australian Outback)
  ctx.save();
  ctx.filter = 'blur(5px)';
  for (const desert of DESERT_ZONES) {
    const isOutback = desert[0][1] > 100 && desert[0][0] < 0;
    // Outback is reddish-terracotta; Sahara is golden sand
    ctx.fillStyle = isOutback ? 'rgba(186, 92, 45, 0.92)' : 'rgba(214, 178, 118, 0.92)';
    ctx.beginPath();
    for (let i = 0; i < desert.length; i++) {
      const [x, y] = geoToCanvas(desert[i][0], desert[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 1.6 Rugged Mountain Ranges & Snow-capped Ridges
  ctx.save();
  ctx.filter = 'blur(3px)';
  for (const mtn of MOUNTAIN_CHAINS) {
    // Rocky brown elevation
    ctx.strokeStyle = 'rgba(112, 92, 70, 0.85)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < mtn.length; i++) {
      const [x, y] = geoToCanvas(mtn[i][0], mtn[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Snow caps along the ridge
    ctx.strokeStyle = 'rgba(245, 250, 255, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
  ctx.restore();

  // 1.7 Brilliant Polar Ice Shelves (Arctic, Greenland, Antarctica)
  ctx.save();
  // Arctic ice pack
  const arcticGrad = ctx.createLinearGradient(0, 0, 0, height * 0.16);
  arcticGrad.addColorStop(0, '#ffffff');
  arcticGrad.addColorStop(0.65, '#e2effd');
  arcticGrad.addColorStop(1, 'rgba(226, 239, 253, 0)');
  ctx.fillStyle = arcticGrad;
  ctx.fillRect(0, 0, width, height * 0.16);

  // Greenland Ice Sheet
  ctx.fillStyle = '#f8fbff';
  ctx.beginPath();
  const [gx, gy] = geoToCanvas(74, -40, width, height);
  ctx.ellipse(gx, gy, width * 0.045, height * 0.12, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Antarctic Glacial Continent
  const antGrad = ctx.createLinearGradient(0, height * 0.82, 0, height);
  antGrad.addColorStop(0, 'rgba(230, 243, 255, 0)');
  antGrad.addColorStop(0.3, '#edf5fe');
  antGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = antGrad;
  ctx.fillRect(0, height * 0.82, width, height * 0.18);
  ctx.restore();

  // 1.8 Realistic Earth Surface Grain & Geological Topography noise
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 8) {
    const n = (Math.random() - 0.5) * 8;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 2. OCEAN SPECULAR / ROUGHNESS MAP
 * In Three.js PBR:
 * - Oceans = dark (roughness ~0.15) -> produces brilliant Sun glint / reflection
 * - Land = white (roughness ~0.95) -> matte finish, no specular glare on dirt
 */
export function createRealisticEarthRoughnessTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_roughness_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Oceans are glossy (low roughness = dark gray)
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, width, height);

  // Land is matte (high roughness = bright)
  ctx.fillStyle = '#e8e8e8';
  for (const land of WORLD_LANDMASSES) {
    ctx.beginPath();
    for (let i = 0; i < land.length; i++) {
      const [x, y] = geoToCanvas(land[i][0], land[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Polar ice is semi-matte
  ctx.fillStyle = '#b0b0b0';
  ctx.fillRect(0, 0, width, height * 0.12);
  ctx.fillRect(0, height * 0.85, width, height * 0.15);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 3. ELEVATION / MOUNTAIN BUMP MAP
 * Renders topographical relief so mountains cast realistic physical shadows
 * under glancing sunlight.
 */
export function createRealisticEarthBumpTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_bump_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Neutral ocean base (128 gray)
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  // Continents slight plateau (140)
  ctx.fillStyle = '#909090';
  for (const land of WORLD_LANDMASSES) {
    ctx.beginPath();
    for (let i = 0; i < land.length; i++) {
      const [x, y] = geoToCanvas(land[i][0], land[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Mountain ranges elevated (220 - 255)
  ctx.save();
  ctx.filter = 'blur(4px)';
  for (const mtn of MOUNTAIN_CHAINS) {
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < mtn.length; i++) {
      const [x, y] = geoToCanvas(mtn[i][0], mtn[i][1], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 4. PHOTOREALISTIC NASA BLACK MARBLE NIGHT LIGHTS TEXTURE
 * Warm golden-amber urban clusters matching global human population corridors.
 */
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
    // East Asia & Japan
    { lat: 35.7, lng: 139.7, r: 24, i: 1.0 },   // Tokyo Greater Area
    { lat: 34.7, lng: 135.5, r: 18, i: 0.95 },  // Osaka/Kyoto
    { lat: 37.5, lng: 126.9, r: 18, i: 0.95 },  // Seoul Capital
    { lat: 31.2, lng: 121.5, r: 28, i: 1.0 },   // Shanghai / Yangtze Delta
    { lat: 39.9, lng: 116.4, r: 24, i: 0.98 },  // Beijing
    { lat: 23.1, lng: 113.2, r: 26, i: 1.0 },   // Pearl River (Guangzhou/Shenzhen/HK)
    { lat: 30.6, lng: 104.1, r: 16, i: 0.9 },   // Chengdu
    { lat: 29.5, lng: 106.5, r: 16, i: 0.9 },   // Chongqing
    { lat: 1.3, lng: 103.8, r: 12, i: 0.95 },   // Singapore
    { lat: 13.7, lng: 100.5, r: 14, i: 0.85 },  // Bangkok
    { lat: 14.6, lng: 121.0, r: 14, i: 0.85 },  // Manila
    { lat: -6.2, lng: 106.8, r: 16, i: 0.85 },  // Jakarta

    // South Asia & India
    { lat: 28.6, lng: 77.2, r: 22, i: 0.95 },   // Delhi NCR
    { lat: 19.0, lng: 72.8, r: 20, i: 0.95 },   // Mumbai
    { lat: 12.9, lng: 77.6, r: 16, i: 0.9 },    // Bengaluru
    { lat: 22.5, lng: 88.3, r: 16, i: 0.9 },    // Kolkata
    { lat: 24.8, lng: 67.0, r: 15, i: 0.85 },   // Karachi
    { lat: 31.5, lng: 74.3, r: 14, i: 0.85 },   // Lahore

    // Western Europe (The "Blue Banana" megalopolis ribbon)
    { lat: 51.5, lng: -0.1, r: 24, i: 1.0 },    // London
    { lat: 48.9, lng: 2.35, r: 22, i: 1.0 },    // Paris
    { lat: 50.9, lng: 6.9, r: 26, i: 0.95 },    // Rhine-Ruhr / Cologne / Benelux
    { lat: 52.3, lng: 4.9, r: 16, i: 0.9 },     // Amsterdam
    { lat: 52.5, lng: 13.4, r: 18, i: 0.9 },    // Berlin
    { lat: 48.1, lng: 11.5, r: 14, i: 0.9 },    // Munich
    { lat: 45.4, lng: 9.2, r: 18, i: 0.9 },     // Milan / Po Valley
    { lat: 40.4, lng: -3.7, r: 16, i: 0.9 },    // Madrid
    { lat: 55.7, lng: 37.6, r: 22, i: 0.95 },   // Moscow
    { lat: 59.9, lng: 30.3, r: 14, i: 0.85 },   // St. Petersburg

    // Middle East & Africa
    { lat: 30.0, lng: 31.2, r: 20, i: 0.95 },   // Cairo & Nile Valley ribbon
    { lat: 25.2, lng: 55.3, r: 16, i: 0.95 },   // Dubai / Abu Dhabi
    { lat: 24.7, lng: 46.7, r: 15, i: 0.9 },    // Riyadh
    { lat: 32.0, lng: 34.8, r: 14, i: 0.9 },    // Tel Aviv
    { lat: 35.7, lng: 51.4, r: 16, i: 0.88 },   // Tehran
    { lat: 41.0, lng: 28.9, r: 18, i: 0.9 },    // Istanbul
    { lat: 6.5, lng: 3.4, r: 16, i: 0.85 },     // Lagos
    { lat: -26.2, lng: 28.0, r: 16, i: 0.9 },   // Johannesburg
    { lat: -33.9, lng: 18.4, r: 12, i: 0.85 },  // Cape Town

    // North America
    { lat: 40.7, lng: -74.0, r: 30, i: 1.0 },   // New York / Northeast Megalopolis
    { lat: 41.8, lng: -87.6, r: 24, i: 0.98 },  // Chicago & Great Lakes
    { lat: 34.0, lng: -118.2, r: 26, i: 1.0 },  // Los Angeles Basin
    { lat: 37.7, lng: -122.4, r: 20, i: 0.98 }, // San Francisco Bay Area
    { lat: 47.6, lng: -122.3, r: 16, i: 0.9 },  // Seattle
    { lat: 29.7, lng: -95.3, r: 20, i: 0.95 },  // Houston
    { lat: 32.7, lng: -96.8, r: 20, i: 0.95 },  // Dallas-Fort Worth
    { lat: 25.7, lng: -80.2, r: 18, i: 0.95 },  // Miami / South Florida
    { lat: 33.7, lng: -84.3, r: 18, i: 0.9 },   // Atlanta
    { lat: 43.6, lng: -79.3, r: 18, i: 0.95 },  // Toronto
    { lat: 45.5, lng: -73.5, r: 16, i: 0.9 },   // Montreal
    { lat: 19.4, lng: -99.1, r: 24, i: 0.95 },  // Mexico City

    // South America
    { lat: -23.5, lng: -46.6, r: 24, i: 0.98 }, // São Paulo
    { lat: -22.9, lng: -43.1, r: 20, i: 0.95 }, // Rio de Janeiro
    { lat: -34.6, lng: -58.3, r: 22, i: 0.95 }, // Buenos Aires
    { lat: -33.4, lng: -70.6, r: 16, i: 0.88 }, // Santiago
    { lat: 4.7, lng: -74.0, r: 16, i: 0.88 },   // Bogotá
    { lat: -12.0, lng: -77.0, r: 16, i: 0.88 }, // Lima

    // Oceania
    { lat: -33.8, lng: 151.2, r: 18, i: 0.95 }, // Sydney
    { lat: -37.8, lng: 144.9, r: 18, i: 0.95 }, // Melbourne
    { lat: -27.4, lng: 153.0, r: 14, i: 0.88 }, // Brisbane
    { lat: -31.9, lng: 115.8, r: 12, i: 0.85 }  // Perth
  ];

  for (const city of METROPOLISES) {
    drawCityGlow(city.lat, city.lng, city.r, city.i);
  }

  // Draw Nile River light ribbon (famous orbital landmark)
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

  // Highway corridors & secondary townships scattered across populated landmasses
  ctx.fillStyle = 'rgba(255, 215, 120, 0.7)';
  for (let i = 0; i < 1800; i++) {
    // Bias towards continents
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 5. DYNAMIC PHOTOREALISTIC WEATHER CLOUD TEXTURE
 * Realistic cyclonic spirals, temperate storm fronts, ITCZ equatorial cloud bands,
 * and feathered cirrus formations.
 */
export function createRealisticEarthCloudTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_clouds_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);

  // 5.1 Intertropical Convergence Zone (ITCZ) equatorial fluffy cloud bands
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

  // 5.2 Mid-latitude storm fronts & swirls (North Atlantic, North Pacific, Roaring Forties)
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

  // Tropical cyclones & storms
  drawCyclone(24, -65, 75);  // Atlantic Hurricane
  drawCyclone(18, 135, 90);  // Pacific Typhoon
  drawCyclone(48, -35, 110); // North Atlantic gale
  drawCyclone(52, 160, 110); // Aleutian Low
  drawCyclone(-45, 90, 120); // Southern Ocean storm

  // 5.3 Wispy cirrus filaments across temperate zones
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 6. MAJESTIC DEEP COSMOS & MILKY WAY SKYBOX TEXTURE
 * Creates a vast, cinematic deep space backdrop with the glowing galactic band,
 * dark molecular dust rifts, and billions-of-stars feeling to replace ugly flat backdrops.
 */
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
  ctx.rotate(-0.35); // 20 deg tilt of galactic plane

  // Primary galactic glow (warm core + deep indigo halo)
  const galGrad = ctx.createLinearGradient(0, -height * 0.2, 0, height * 0.2);
  galGrad.addColorStop(0, 'rgba(12, 18, 45, 0)');
  galGrad.addColorStop(0.3, 'rgba(30, 42, 90, 0.28)');
  galGrad.addColorStop(0.48, 'rgba(165, 140, 195, 0.42)'); // Sagittarius bright core
  galGrad.addColorStop(0.52, 'rgba(190, 165, 215, 0.48)');
  galGrad.addColorStop(0.7, 'rgba(30, 42, 90, 0.28)');
  galGrad.addColorStop(1, 'rgba(12, 18, 45, 0)');

  ctx.fillStyle = galGrad;
  ctx.fillRect(-width, -height * 0.3, width * 2, height * 0.6);

  // Dark molecular dust rifts (The Great Rift)
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

    // Astronomical color temperatures (O/B blue-white, G yellow, M red)
    if (bright > 0.9) ctx.fillStyle = 'rgba(195, 220, 255, 0.95)';
    else if (bright > 0.8) ctx.fillStyle = 'rgba(255, 242, 210, 0.9)';
    else ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';

    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Converts Latitude & Longitude to 3D Cartesian coordinates on a sphere of radius R.
 */
export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}
