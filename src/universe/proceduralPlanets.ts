/**
 * EARTH ONE - UNIVERSE ENGINE
 * Procedural Planetary & Celestial Texture Synthesis
 * 
 * Generates photorealistic procedural textures in-memory using HTML5 Canvas.
 * Strictly guarantees ZERO external 404 image dependencies.
 * Matches astronomical observations from NASA Blue/Black Marble, Cassini-Huygens (Saturn),
 * Juno (Jupiter), and Perseverance (Mars).
 */

import * as THREE from 'three';

// Cache generated textures so canvas generation only runs once per celestial body
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Procedural Earth Day Texture
 * NASA Blue Marble style: Rich continental landmasses, arid Sahara/Gobi bands,
 * verdant rainforests, temperate green forests, mountain ridgelines, coastal shallows,
 * and brilliant polar ice caps.
 */
export function createEarthDayTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_day_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Deep Ocean Base with realistic bathymetric depth gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#0a2342'); // Arctic ocean
  oceanGrad.addColorStop(0.2, '#0c356a');
  oceanGrad.addColorStop(0.5, '#062852'); // Equatorial deep ocean
  oceanGrad.addColorStop(0.8, '#0c356a');
  oceanGrad.addColorStop(1, '#0a2342'); // Antarctic
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Continental Shallows / Continental Shelves (Cyan turquoise)
  const drawShallows = (x: number, y: number, r: number) => {
    const rad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    rad.addColorStop(0, 'rgba(12, 120, 160, 0.45)');
    rad.addColorStop(0.8, 'rgba(15, 80, 120, 0.2)');
    rad.addColorStop(1, 'rgba(6, 40, 82, 0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Coastal shelves around major landmasses
  drawShallows(width * 0.72, height * 0.38, width * 0.22); // East Asia
  drawShallows(width * 0.25, height * 0.35, width * 0.18); // North America
  drawShallows(width * 0.52, height * 0.32, width * 0.14); // Europe
  drawShallows(width * 0.32, height * 0.65, width * 0.15); // South America
  drawShallows(width * 0.52, height * 0.55, width * 0.16); // Africa

  // 3. Continents & Landmasses
  ctx.save();
  // Eurasia & East Asia
  ctx.fillStyle = '#2d5a27'; // Forest green base
  ctx.beginPath();
  ctx.ellipse(width * 0.68, height * 0.35, width * 0.18, height * 0.18, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Arid Sahara / Middle East / Gobi desert belt
  const aridGrad = ctx.createLinearGradient(width * 0.42, 0, width * 0.75, 0);
  aridGrad.addColorStop(0, 'rgba(194, 153, 94, 0.9)'); // Sahara
  aridGrad.addColorStop(0.3, 'rgba(212, 172, 108, 0.95)'); // Arabian peninsula
  aridGrad.addColorStop(0.6, 'rgba(189, 148, 88, 0.85)'); // Central Asia
  aridGrad.addColorStop(1, 'rgba(168, 138, 84, 0.75)'); // Gobi
  ctx.fillStyle = aridGrad;
  ctx.beginPath();
  ctx.ellipse(width * 0.55, height * 0.42, width * 0.16, height * 0.08, -0.05, 0, Math.PI * 2);
  ctx.fill();

  // Tropical Africa Rainforest
  ctx.fillStyle = '#1c441b';
  ctx.beginPath();
  ctx.ellipse(width * 0.52, height * 0.58, width * 0.09, height * 0.14, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // North America
  ctx.fillStyle = '#3a6634';
  ctx.beginPath();
  ctx.ellipse(width * 0.22, height * 0.32, width * 0.12, height * 0.16, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Western Great Plains / Desert
  ctx.fillStyle = '#a68a56';
  ctx.beginPath();
  ctx.ellipse(width * 0.20, height * 0.36, width * 0.05, height * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // South America & Amazon Basin
  ctx.fillStyle = '#1e4b1a'; // Amazon lush emerald
  ctx.beginPath();
  ctx.ellipse(width * 0.32, height * 0.66, width * 0.08, height * 0.16, 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Australia
  ctx.fillStyle = '#b86b35'; // Outback red-ochre
  ctx.beginPath();
  ctx.ellipse(width * 0.82, height * 0.70, width * 0.07, height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Polar Ice Caps (Crisp glacial albedo)
  ctx.fillStyle = '#f0f6ff';
  // Arctic
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.04, width * 0.45, height * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // Antarctica
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.96, width * 0.48, height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5. Procedural Noise & Coastal Texturing
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 16) {
    const noise = (Math.random() - 0.5) * 16;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Earth Night Lights Texture
 * NASA Black Marble: Clusters of golden-amber urban illumination
 * corresponding to human population density.
 */
export function createEarthNightTexture(width = 2048, height = 1024): THREE.CanvasTexture {
  const cacheKey = `earth_night_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep dark celestial unlit base
  ctx.fillStyle = '#010206';
  ctx.fillRect(0, 0, width, height);

  const drawMetroCluster = (x: number, y: number, radius: number, intensity: number) => {
    const rad = ctx.createRadialGradient(x, y, 1, x, y, radius);
    rad.addColorStop(0, `rgba(255, 235, 170, ${intensity})`);
    rad.addColorStop(0.3, `rgba(240, 185, 80, ${intensity * 0.75})`);
    rad.addColorStop(0.7, `rgba(180, 100, 30, ${intensity * 0.3})`);
    rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // Major Human Metropolitan Centers
  // East Asia (Tokyo, Beijing, Shanghai, Seoul, Pearl River Delta)
  drawMetroCluster(width * 0.74, height * 0.36, 42, 0.95);
  drawMetroCluster(width * 0.71, height * 0.38, 38, 0.9);
  drawMetroCluster(width * 0.76, height * 0.34, 34, 0.95);

  // Western Europe & London/Paris/Rhine-Ruhr
  drawMetroCluster(width * 0.51, height * 0.30, 48, 0.95);
  drawMetroCluster(width * 0.54, height * 0.33, 40, 0.9);

  // North America (Northeast Megalopolis, Midwest, California, Texas)
  drawMetroCluster(width * 0.28, height * 0.33, 50, 0.95);
  drawMetroCluster(width * 0.24, height * 0.35, 42, 0.85);
  drawMetroCluster(width * 0.18, height * 0.36, 40, 0.9);
  drawMetroCluster(width * 0.23, height * 0.40, 35, 0.85);

  // India & South Asia (Indo-Gangetic Plain)
  drawMetroCluster(width * 0.65, height * 0.45, 46, 0.9);

  // Nile Delta & Middle East
  drawMetroCluster(width * 0.55, height * 0.41, 32, 0.9);
  drawMetroCluster(width * 0.59, height * 0.42, 36, 0.88);

  // South America (São Paulo, Rio de Janeiro, Buenos Aires)
  drawMetroCluster(width * 0.35, height * 0.72, 38, 0.85);
  drawMetroCluster(width * 0.32, height * 0.77, 30, 0.8);

  // Fine point scatter for secondary cities and transport corridors
  ctx.fillStyle = 'rgba(255, 210, 120, 0.75)';
  for (let i = 0; i < 900; i++) {
    const rx = (0.15 + Math.random() * 0.7) * width;
    const ry = (0.2 + Math.random() * 0.6) * height;
    ctx.fillRect(rx, ry, Math.random() > 0.8 ? 2 : 1, Math.random() > 0.8 ? 2 : 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Earth Cloud & Weather System Texture
 * Translucent cyclonic swirls, mid-latitude fronts, and tropical convergence zones.
 */
export function createEarthCloudTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `earth_clouds_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Transparent base
  ctx.clearRect(0, 0, width, height);

  // Draw smooth atmospheric cloud bands
  for (let y = 0; y < height; y += 4) {
    const lat = (y / height - 0.5) * 2; // -1 to 1
    // High cloudiness at equator (ITCZ) and mid-latitudes (storm tracks)
    const factor = Math.exp(-Math.pow(lat, 2) * 2) * 0.45 +
                   Math.exp(-Math.pow(Math.abs(lat) - 0.55, 2) * 15) * 0.5;
    
    if (factor > 0.15) {
      ctx.fillStyle = `rgba(255, 255, 255, ${factor * 0.35})`;
      ctx.fillRect(0, y, width, 4);
    }
  }

  // Draw swirling storm vortexes (Cyclones / Hurricanes)
  const drawCyclone = (cx: number, cy: number, radius: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    for (let r = 0; r < radius; r += 3) {
      const angle = (r / radius) * Math.PI * 4;
      const alpha = (1 - r / radius) * 0.55;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * r, Math.sin(angle) * (r * 0.6), 4 + r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  drawCyclone(width * 0.28, height * 0.38, 48); // North Atlantic
  drawCyclone(width * 0.78, height * 0.32, 54); // Northwest Pacific Typhoon
  drawCyclone(width * 0.65, height * 0.65, 42); // Southern Indian Ocean

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Saturn Ring Texture
 * Inspired directly by Cassini-Huygens imaging (/public/assets/aistudio/image_4845819a.png):
 * - C Ring: Inner faint translucent ring
 * - B Ring: Dense, highly reflective main ring (warm golden ochre)
 * - Cassini Division: Prominent dark vacuum gap (~4,800 km wide) with near-zero opacity
 * - A Ring: Outer ring with delicate Encke gap
 * - F Ring boundary
 * 
 * Generates a 1D radial strip texture mapped onto Three.js RingGeometry UVs.
 */
export function createSaturnRingTexture(size = 1024): THREE.CanvasTexture {
  const cacheKey = `saturn_rings_${size}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, 0);

  // Normalized distance from inner radius (0.0) to outer radius (1.0):
  // 0.00 - 0.20: C Ring (semi-transparent warm grey)
  grad.addColorStop(0.00, 'rgba(80, 70, 60, 0.0)');
  grad.addColorStop(0.05, 'rgba(120, 110, 95, 0.25)');
  grad.addColorStop(0.18, 'rgba(150, 135, 115, 0.40)');

  // 0.20 - 0.58: B Ring (brightest, dense golden tan with fine concentric banding)
  grad.addColorStop(0.21, 'rgba(215, 190, 150, 0.85)');
  grad.addColorStop(0.35, 'rgba(235, 210, 165, 0.98)');
  grad.addColorStop(0.48, 'rgba(220, 195, 155, 0.92)');
  grad.addColorStop(0.56, 'rgba(195, 170, 130, 0.88)');

  // 0.57 - 0.65: CASSINI DIVISION (The iconic sharp gap seen in Cassini-Huygens photo)
  grad.addColorStop(0.57, 'rgba(30, 25, 20, 0.08)');
  grad.addColorStop(0.61, 'rgba(10, 8, 5, 0.01)'); // Pitch black gap
  grad.addColorStop(0.65, 'rgba(35, 30, 25, 0.10)');

  // 0.65 - 0.94: A Ring (moderate brightness, delicate dust lanes)
  grad.addColorStop(0.66, 'rgba(190, 168, 132, 0.75)');
  grad.addColorStop(0.78, 'rgba(175, 155, 120, 0.70)');
  grad.addColorStop(0.85, 'rgba(130, 115, 90, 0.35)'); // Encke gap trace
  grad.addColorStop(0.87, 'rgba(170, 150, 118, 0.65)');
  grad.addColorStop(0.94, 'rgba(140, 120, 95, 0.50)');

  // 0.95 - 1.00: F Ring boundary & outer dissipation
  grad.addColorStop(0.96, 'rgba(40, 35, 30, 0.05)');
  grad.addColorStop(0.98, 'rgba(160, 140, 110, 0.35)'); // Narrow F ring
  grad.addColorStop(1.00, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, 64);

  // Add micro-ringlet noise to mimic hundreds of thousands of icy debris bands
  const imgData = ctx.getImageData(0, 0, size, 64);
  const data = imgData.data;
  for (let x = 0; x < size; x++) {
    const microMod = 0.92 + Math.sin(x * 1.8) * 0.08 + Math.sin(x * 6.3) * 0.05;
    for (let y = 0; y < 64; y++) {
      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, data[idx] * microMod);
      data[idx + 1] = Math.min(255, data[idx + 1] * microMod);
      data[idx + 2] = Math.min(255, data[idx + 2] * microMod);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Jupiter Gas Giant Texture
 * Alternating equatorial and polar atmospheric jet-stream belts,
 * turbulent vortices, and the Great Red Spot.
 */
export function createJupiterTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `jupiter_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Atmospheric zones & belts gradient
  for (let y = 0; y < height; y++) {
    const normY = y / height;
    // Harmonic wave modulation for ammonia-cloud belts
    const beltFreq = Math.sin(normY * Math.PI * 14) * 0.5 + 0.5;
    const isDarkBelt = beltFreq > 0.45;
    
    if (isDarkBelt) {
      // Brown/orange belt
      const r = Math.floor(180 + Math.sin(normY * 20) * 30);
      const g = Math.floor(110 + Math.sin(normY * 25) * 20);
      const b = Math.floor(65 + Math.sin(normY * 18) * 15);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
      // Light white/cream zone
      const r = Math.floor(235 + Math.cos(normY * 15) * 15);
      const g = Math.floor(215 + Math.cos(normY * 18) * 15);
      const b = Math.floor(185 + Math.cos(normY * 20) * 15);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    }
    ctx.fillRect(0, y, width, 1);
  }

  // Jupiter Great Red Spot (Anticyclonic Storm)
  const grsX = width * 0.62;
  const grsY = height * 0.62;
  const grsGrad = ctx.createRadialGradient(grsX, grsY, 5, grsX, grsY, 38);
  grsGrad.addColorStop(0, '#c74426');
  grsGrad.addColorStop(0.6, '#b5351a');
  grsGrad.addColorStop(1, 'rgba(180, 90, 45, 0)');
  ctx.fillStyle = grsGrad;
  ctx.beginPath();
  ctx.ellipse(grsX, grsY, 44, 26, 0.08, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Mars Surface Texture
 * Iron-oxide rust regolith, dark basaltic albedo provinces (Syrtis Major),
 * Valles Marineris rift, and reflective polar ice.
 */
export function createMarsTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `mars_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Base Martian rust red
  ctx.fillStyle = '#b34d28';
  ctx.fillRect(0, 0, width, height);

  // Dark basaltic albedo features (Syrtis Major / Sinus Meridiani)
  ctx.fillStyle = '#6e321d';
  ctx.beginPath();
  ctx.ellipse(width * 0.45, height * 0.52, width * 0.15, height * 0.18, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(width * 0.75, height * 0.48, width * 0.12, height * 0.14, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Polar ice caps (Carbon dioxide & water ice)
  ctx.fillStyle = '#f5f7fa';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.02, width * 0.28, height * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.98, width * 0.24, height * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Sun Solar Corona & Granulation Texture
 */
export function createSunTexture(width = 1024, height = 512): THREE.CanvasTexture {
  const cacheKey = `sun_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Glowing solar photosphere base
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#fff3a8');
  grad.addColorStop(0.3, '#ffaa33');
  grad.addColorStop(0.7, '#ff6600');
  grad.addColorStop(1, '#ff3300');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Granular convective cells
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 4 + Math.random() * 18;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 200, 0.4)' : 'rgba(180, 40, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Procedural Generic Celestial Body Texture (Moon, Mercury, Venus, Uranus, Neptune)
 */
export function createCelestialTexture(type: string, width = 512, height = 256): THREE.CanvasTexture {
  const cacheKey = `${type}_${width}x${height}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (type === 'moon' || type === 'mercury') {
    // Highly cratered lunar/hermian surface
    ctx.fillStyle = type === 'moon' ? '#999999' : '#888484';
    ctx.fillRect(0, 0, width, height);
    // Lunar Maria (Dark basalt seas)
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.ellipse(width * 0.4, height * 0.4, width * 0.16, height * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Impact Craters
    for (let i = 0; i < 150; i++) {
      const cx = Math.random() * width;
      const cy = Math.random() * height;
      const cr = 2 + Math.random() * 8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (type === 'venus') {
    // Opaque sulfuric acid shroud
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#e8c589');
    grad.addColorStop(0.5, '#d9a966');
    grad.addColorStop(1, '#e8c589');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (type === 'saturn_body') {
    // Pale golden gas giant banding
    for (let y = 0; y < height; y++) {
      const normY = y / height;
      const band = Math.sin(normY * Math.PI * 18) * 15;
      ctx.fillStyle = `rgb(${Math.floor(226 + band)}, ${Math.floor(191 + band * 0.8)}, ${Math.floor(125 + band * 0.5)})`;
      ctx.fillRect(0, y, width, 1);
    }
  } else if (type === 'uranus') {
    ctx.fillStyle = '#78c7d2';
    ctx.fillRect(0, 0, width, height);
  } else if (type === 'neptune') {
    // Deep azure with faint storm bands
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#2d54b8');
    grad.addColorStop(0.5, '#3b6ee8');
    grad.addColorStop(1, '#2d54b8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // Great Dark Spot
    ctx.fillStyle = '#1e387d';
    ctx.beginPath();
    ctx.ellipse(width * 0.6, height * 0.55, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}
