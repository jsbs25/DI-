import * as THREE from 'three';
import {
  createBubbleSpriteTexture,
  createCausticPatternTexture,
  createMarineSnowTexture,
  createOceanSurfaceMaterial,
} from './oceanShaders.ts';

export interface OceanEnvironmentTier {
  kelpCount: number;
  bubbleCount: number;
  snowCount: number;
  rockCount: number;
  coralClusters: number;
  maxAnisotropy: number;
}

export interface OceanEnvironmentHandle {
  group: THREE.Group;
  update: (elapsed: number, dt: number) => void;
  spawnImpactBubbles: (worldOrigin: THREE.Vector3, dirToCam: THREE.Vector3, strength: number) => void;
  dispose: () => void;
}

/**
 * Deterministic multi-octave seabed terrain height function (in world units).
 */
export function getSeabedHeight(x: number, z: number): number {
  const baseY = -14.2;
  const rollingDunes =
    Math.sin(x * 0.082 + 0.4) * Math.cos(z * 0.072 - 0.3) * 1.95 +
    Math.sin(x * 0.21 - z * 0.17) * 0.72 +
    Math.cos(x * 0.44 + z * 0.37) * 0.26;

  // Natural volcanic reef ridges around the distant basin
  const radial = Math.hypot(x * 0.84, z + 14);
  const rimLift = Math.max(0, radial - 26) * 0.17;

  // Deep central trench maintaining long pelagic sightlines
  const centerChannel = Math.exp(-((x * x) / 115 + ((z - 1) * (z - 1)) / 145)) * -1.35;

  return baseY + rollingDunes + Math.min(8.2, rimLift) + centerChannel;
}

function createSeabedSandTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const ripple = Math.sin(u * 14 + Math.sin(v * 4) * 1.45) * 0.5 + 0.5;
        const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
        const mottling = Math.sin(u * 3 + v * 2) * Math.cos(u * 2 - v * 4) * 0.12;
        const lum = 0.68 + ripple * 0.26 + mottling + (grain - 0.5) * 0.16;
        const idx = (y * size + x) * 4;
        // Natural mineral ocean silt & pale slate sand tone
        d[idx] = Math.min(255, Math.round(48 * lum));
        d[idx + 1] = Math.min(255, Math.round(78 * lum));
        d[idx + 2] = Math.min(255, Math.round(92 * lum));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tangent-space normal map matching current-carved seabed sand ripples.
 */
function createSandRippleNormalMap(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const hAt = (x: number, y: number) => {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const w = Math.sin(u * 14 + Math.sin(v * 4) * 1.45) * 0.65;
      const grain = ((Math.sin(x * 19.31 + y * 47.17) * 43758.5) % 1 + 1) % 1;
      return w + (grain - 0.5) * 0.18;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 1.6;
        const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 1.6;
        const len = Math.hypot(-dx, -dy, 1.0);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1.0 / len;
        const idx = (y * size + x) * 4;
        d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.needsUpdate = true;
  return tex;
}

function createBasaltRockTextures(size = 256): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const colCanvas = document.createElement('canvas');
  colCanvas.width = size;
  colCanvas.height = size;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;

  const cCtx = colCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  if (cCtx && bCtx) {
    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    const cd = cImg.data;
    const bd = bImg.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n1 = Math.sin(x * 0.08) * Math.cos(y * 0.095);
        const n2 = Math.sin((x - y) * 0.21) * 0.48;
        const crevice = Math.abs(Math.sin(x * 0.14 + Math.cos(y * 0.11) * 2.1));
        const speck = ((Math.sin(x * 37.2 + y * 91.7) * 43758.54) % 1 + 1) % 1;
        const height = Math.max(0, Math.min(1, 0.55 + (n1 + n2) * 0.18 + (speck - 0.5) * 0.2 - (1 - crevice) * 0.22));
        const algaeTint = height > 0.62 ? (height - 0.62) * 0.6 : 0;

        const idx = (y * size + x) * 4;
        cd[idx] = Math.min(255, Math.round(34 * (0.65 + height * 0.6) + algaeTint * 14));
        cd[idx + 1] = Math.min(255, Math.round(46 * (0.65 + height * 0.6) + algaeTint * 36));
        cd[idx + 2] = Math.min(255, Math.round(52 * (0.65 + height * 0.6) + algaeTint * 22));
        cd[idx + 3] = 255;

        const bVal = Math.round(height * 255);
        bd[idx] = bVal;
        bd[idx + 1] = bVal;
        bd[idx + 2] = bVal;
        bd[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  }

  const map = new THREE.CanvasTexture(colCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createOceanEnvironment(tier: OceanEnvironmentTier): OceanEnvironmentHandle {
  const group = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const disposablesTex: THREE.Texture[] = [];
  const rng = seededRng(20260409);

  // 0. Real 3D Overhead Ocean Surface Ceiling (waves + Snell's Window looking up)
  const surfGeo = new THREE.PlaneGeometry(210, 210, 68, 68);
  surfGeo.rotateX(Math.PI / 2);
  surfGeo.translate(0, 24.5, -18);
  const surfMat = createOceanSurfaceMaterial();
  disposablesGeo.push(surfGeo);
  disposablesMat.push(surfMat);
  const surfMesh = new THREE.Mesh(surfGeo, surfMat);
  group.add(surfMesh);

  // 1. Seabed Terrain with Tangent-Space Sand Ripples & Depth-Attenuated Caustics
  const sandTex = createSeabedSandTexture(512);
  sandTex.anisotropy = tier.maxAnisotropy;
  const sandNormal = createSandRippleNormalMap(256);
  sandNormal.anisotropy = tier.maxAnisotropy;
  const causticTex = createCausticPatternTexture(256);
  causticTex.anisotropy = tier.maxAnisotropy;
  disposablesTex.push(sandTex, sandNormal, causticTex);

  const floorGeo = new THREE.PlaneGeometry(185, 185, 128, 128);
  floorGeo.rotateX(-Math.PI / 2);
  const posAttr = floorGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i) - 18;
    posAttr.setZ(i, wz);
    posAttr.setY(i, getSeabedHeight(wx, wz));
  }
  floorGeo.computeVertexNormals();
  disposablesGeo.push(floorGeo);

  const causticUniforms = {
    uTime: { value: 0 },
    uCausticMap: { value: causticTex },
  };

  const floorMat = new THREE.MeshStandardMaterial({
    map: sandTex,
    normalMap: sandNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.92,
    metalness: 0.02,
    color: new THREE.Color('#6a95a6'),
  });
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticUniforms.uTime;
    shader.uniforms.uCausticMap = causticUniforms.uCausticMap;
    shader.vertexShader =
      `varying vec3 vSeaWorldPos;\nvarying vec3 vSeaWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSeaWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSeaWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader =
      `uniform float uTime;\nuniform sampler2D uCausticMap;\nvarying vec3 vSeaWorldPos;\nvarying vec3 vSeaWorldNormal;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Dynamic depth-based caustic refraction projection onto seafloor
        float depthFrac = clamp((-9.0 - vSeaWorldPos.y) / 7.5, 0.0, 1.0);
        vec2 warp = vec2(sin(vSeaWorldPos.z * 0.14 + uTime * 0.55), cos(vSeaWorldPos.x * 0.13 - uTime * 0.48)) * 0.04;
        vec2 cUv1 = vSeaWorldPos.xz * 0.062 + warp + vec2(uTime * 0.021, -uTime * 0.016);
        vec2 cUv2 = vSeaWorldPos.xz * 0.088 - warp * 0.7 - vec2(uTime * 0.014, uTime * 0.023);
        vec3 c1 = texture2D(uCausticMap, cUv1).rgb;
        vec3 c2 = texture2D(uCausticMap, cUv2).rgb;
        float upDot = clamp(dot(normalize(vSeaWorldNormal), normalize(vec3(0.26, 0.92, 0.24))), 0.0, 1.0);
        float distFade = exp(-length(vSeaWorldPos.xz - vec2(0.0, 10.0)) * 0.024);
        float depthAtten = mix(1.35, 0.45, depthFrac);
        vec3 causticLight = min(c1, c2) * upDot * distFade * depthAtten * 2.15;
        totalEmissiveRadiance += causticLight * vec3(0.42, 0.86, 0.96);`
      );
  };
  disposablesMat.push(floorMat);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  group.add(floorMesh);

  // 2. Fissured Volcanic Basalt Reef Outcrops (Multi-octave rock displacement + bumpMap)
  const { map: rockTex, bumpMap: rockBump } = createBasaltRockTextures(256);
  disposablesTex.push(rockTex, rockBump);

  const rockGeo = new THREE.IcosahedronGeometry(1.0, 3);
  const rockPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rockPos.count; i++) {
    const vx = rockPos.getX(i);
    const vy = rockPos.getY(i);
    const vz = rockPos.getZ(i);
    const strata =
      0.74 +
      0.22 * Math.sin(vx * 2.4 + vz * 1.9) * Math.cos(vy * 3.1) +
      0.11 * Math.sin(vy * 7.2 + vx * 4.5);
    const flatBase = vy < -0.35 ? 0.65 : 1.0;
    rockPos.setXYZ(i, vx * strata, vy * strata * 0.68 * flatBase, vz * strata);
  }
  rockGeo.computeVertexNormals();
  disposablesGeo.push(rockGeo);

  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    bumpMap: rockBump,
    bumpScale: 0.18,
    roughness: 0.9,
    metalness: 0.04,
    color: new THREE.Color('#3b5561'),
  });
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticUniforms.uTime;
    shader.uniforms.uCausticMap = causticUniforms.uCausticMap;
    shader.vertexShader =
      `varying vec3 vRockWorldPos;\nvarying vec3 vRockNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 rw = vec4(transformed, 1.0);
        vec3 rn = objectNormal;
        #ifdef USE_INSTANCING
        rw = instanceMatrix * rw;
        rn = mat3(instanceMatrix) * rn;
        #endif
        vRockWorldPos = (modelMatrix * rw).xyz;
        vRockNormal = normalize(mat3(modelMatrix) * rn);`
      );
    shader.fragmentShader =
      `uniform float uTime;\nuniform sampler2D uCausticMap;\nvarying vec3 vRockWorldPos;\nvarying vec3 vRockNormal;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 rcUv = vRockWorldPos.xz * 0.075 + vec2(uTime * 0.019, -uTime * 0.015);
        vec3 rc = texture2D(uCausticMap, rcUv).rgb;
        float topMask = smoothstep(-15.5, -7.5, vRockWorldPos.y) * max(0.0, vRockNormal.y);
        totalEmissiveRadiance += rc * topMask * 0.72 * vec3(0.38, 0.85, 0.98);`
      );
  };
  disposablesMat.push(rockMat);

  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, tier.rockCount);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const reefSpots: Array<{ x: number; z: number; y: number; radius: number }> = [];

  for (let i = 0; i < tier.rockCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 7 + rng() * 48;
    const rx = Math.cos(angle) * dist * 1.18;
    const rz = Math.sin(angle) * dist * 0.88 - 17;
    const ry = getSeabedHeight(rx, rz);
    const sx = 1.4 + rng() * 3.8;
    const sy = 1.0 + rng() * 2.8;
    const sz = 1.4 + rng() * 3.4;

    dummy.position.set(rx, ry + sy * 0.16, rz);
    dummy.rotation.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);

    const shade = 0.7 + rng() * 0.4;
    tint.setRGB(shade * 0.9, shade * 0.98, shade * 1.04);
    rockInst.setColorAt(i, tint);

    if (i < tier.coralClusters) {
      reefSpots.push({ x: rx, z: rz, y: ry + sy * 0.52, radius: Math.max(sx, sz) * 0.62 });
    }
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // 3. Natural Mineral-Toned Corals, Sea Fans & Subtle Deep Polyps
  const coralGroup = new THREE.Group();
  const brainGeo = new THREE.SphereGeometry(0.68, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const brainPos = brainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < brainPos.count; i++) {
    const vx = brainPos.getX(i);
    const vy = brainPos.getY(i);
    const vz = brainPos.getZ(i);
    const ridge = 1 + 0.09 * Math.sin(vx * 18 + Math.cos(vz * 9) * 1.4) * Math.cos(vz * 18);
    brainPos.setXYZ(i, vx * ridge, vy, vz * ridge);
  }
  brainGeo.computeVertexNormals();

  // Tapered organic branching staghorn tubes
  const makeTaperedBranch = (pts: THREE.Vector3[], baseR: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 14, baseR, 8, false);
    const gp = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const cTmp = new THREE.Vector3();
    for (let i = 0; i < gp.count; i++) {
      const t = uv.getX(i);
      curve.getPointAt(Math.min(1, Math.max(0, t)), cTmp);
      const shrink = 1 - t * 0.72;
      gp.setXYZ(
        i,
        cTmp.x + (gp.getX(i) - cTmp.x) * shrink,
        cTmp.y + (gp.getY(i) - cTmp.y) * shrink,
        cTmp.z + (gp.getZ(i) - cTmp.z) * shrink
      );
    }
    geo.computeVertexNormals();
    return geo;
  };

  const branchGeoA = makeTaperedBranch(
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.08, 0.52, 0.04),
      new THREE.Vector3(0.32, 1.08, 0.14),
      new THREE.Vector3(0.45, 1.54, 0.2),
    ],
    0.09
  );
  const branchGeoB = makeTaperedBranch(
    [
      new THREE.Vector3(0, 0.25, 0),
      new THREE.Vector3(-0.18, 0.74, -0.1),
      new THREE.Vector3(-0.42, 1.28, -0.22),
    ],
    0.075
  );
  const branchGeoC = makeTaperedBranch(
    [
      new THREE.Vector3(0.05, 0.42, 0.02),
      new THREE.Vector3(0.02, 0.88, -0.26),
      new THREE.Vector3(-0.08, 1.36, -0.45),
    ],
    0.068
  );

  // Subtle deep sea-anemone polyps (slender organic filaments)
  const polypCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, 0.26, 0.02),
    new THREE.Vector3(-0.03, 0.54, -0.02),
  ]);
  const anemoneBulbGeo = new THREE.TubeGeometry(polypCurve, 8, 0.036, 6, false);

  disposablesGeo.push(brainGeo, branchGeoA, branchGeoB, branchGeoC, anemoneBulbGeo);

  // Grounded natural oceanic mineral hues (no toy neon shades)
  const coralPalette = ['#8c4d3e', '#9e6844', '#584a68', '#336b6d', '#7b4953', '#6b6544'];
  const brainMat = new THREE.MeshStandardMaterial({
    bumpMap: rockBump,
    bumpScale: 0.08,
    roughness: 0.78,
    metalness: 0.02,
    color: '#ffffff',
  });
  const staghornMat = new THREE.MeshStandardMaterial({
    roughness: 0.72,
    metalness: 0.04,
    color: '#ffffff',
  });
  const anemoneMat = new THREE.MeshStandardMaterial({
    color: '#46a8bd',
    emissive: '#0c4e66',
    emissiveIntensity: 0.45,
    roughness: 0.45,
  });
  disposablesMat.push(brainMat, staghornMat, anemoneMat);

  const brainInst = new THREE.InstancedMesh(brainGeo, brainMat, reefSpots.length);
  const stagInstA = new THREE.InstancedMesh(branchGeoA, staghornMat, reefSpots.length);
  const stagInstB = new THREE.InstancedMesh(branchGeoB, staghornMat, reefSpots.length);
  const stagInstC = new THREE.InstancedMesh(branchGeoC, staghornMat, reefSpots.length);
  const anemoneCount = reefSpots.length * 4;
  const anemoneInst = new THREE.InstancedMesh(anemoneBulbGeo, anemoneMat, anemoneCount);

  let anemoneIdx = 0;
  for (let i = 0; i < reefSpots.length; i++) {
    const spot = reefSpots[i];
    const cx = spot.x + (rng() - 0.5) * spot.radius;
    const cz = spot.z + (rng() - 0.5) * spot.radius;
    const cy = getSeabedHeight(cx, cz);

    const bScale = 0.65 + rng() * 1.15;
    dummy.position.set(cx, cy - 0.08, cz);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(bScale, bScale * (0.72 + rng() * 0.35), bScale);
    dummy.updateMatrix();
    brainInst.setMatrixAt(i, dummy.matrix);
    tint.set(coralPalette[i % coralPalette.length]);
    brainInst.setColorAt(i, tint);

    const sx = spot.x + (rng() - 0.5) * spot.radius * 1.4;
    const sz = spot.z + (rng() - 0.5) * spot.radius * 1.4;
    const sy = getSeabedHeight(sx, sz);
    const sScale = 0.8 + rng() * 1.3;
    dummy.position.set(sx, sy - 0.06, sz);
    dummy.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
    dummy.scale.setScalar(sScale);
    dummy.updateMatrix();
    stagInstA.setMatrixAt(i, dummy.matrix);
    stagInstB.setMatrixAt(i, dummy.matrix);
    stagInstC.setMatrixAt(i, dummy.matrix);
    tint.set(coralPalette[(i + 2) % coralPalette.length]);
    stagInstA.setColorAt(i, tint);
    stagInstB.setColorAt(i, tint);
    stagInstC.setColorAt(i, tint);

    const ax0 = spot.x + (rng() - 0.5) * 1.3;
    const az0 = spot.z + (rng() - 0.5) * 1.3;
    const ay0 = getSeabedHeight(ax0, az0);
    for (let k = 0; k < 4; k++) {
      dummy.position.set(ax0 + (rng() - 0.5) * 0.32, ay0 - 0.04, az0 + (rng() - 0.5) * 0.32);
      dummy.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
      dummy.scale.setScalar(0.7 + rng() * 0.8);
      dummy.updateMatrix();
      anemoneInst.setMatrixAt(anemoneIdx, dummy.matrix);
      tint.set(k % 2 === 0 ? '#4fc3dc' : '#7b68a8');
      anemoneInst.setColorAt(anemoneIdx, tint);
      anemoneIdx++;
    }
  }

  for (const inst of [brainInst, stagInstA, stagInstB, stagInstC, anemoneInst]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    coralGroup.add(inst);
  }
  group.add(coralGroup);

  // 4. Translucent Ruffled Giant Kelp Forest (GPU Sway + Backlit Subsurface Glow)
  const kelpBladeGeo = new THREE.PlaneGeometry(0.46, 6.8, 3, 16);
  kelpBladeGeo.translate(0, 3.4, 0);
  const kp = kelpBladeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < kp.count; i++) {
    const x = kp.getX(i);
    const y = kp.getY(i);
    const h = y / 6.8;
    const taper = Math.sin(Math.min(1, h) * Math.PI * 0.92) * (1 - h * 0.42) + 0.1;
    const edgeWave = Math.sin(h * 22.0 + Math.sign(x) * 1.2) * 0.075 * Math.abs(x / 0.23);
    kp.setX(i, x * taper);
    kp.setZ(i, edgeWave);
  }
  kelpBladeGeo.computeVertexNormals();
  disposablesGeo.push(kelpBladeGeo);

  const kelpPhases = new Float32Array(tier.kelpCount);
  for (let i = 0; i < tier.kelpCount; i++) {
    kelpPhases[i] = rng() * Math.PI * 2;
  }
  kelpBladeGeo.setAttribute('aKelpPhase', new THREE.InstancedBufferAttribute(kelpPhases, 1));

  const kelpUniforms = {
    uTime: { value: 0 },
  };
  const kelpMat = new THREE.MeshStandardMaterial({
    color: '#25523b',
    roughness: 0.56,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  kelpMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = kelpUniforms.uTime;
    shader.vertexShader =
      `attribute float aKelpPhase;\nuniform float uTime;\nvarying float vKelpHeight;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hFrac = clamp(position.y / 6.8, 0.0, 1.0);
        vKelpHeight = hFrac;
        float swayAmp = pow(hFrac, 1.45) * 0.96;
        transformed.x += sin(uTime * 1.15 + aKelpPhase + position.y * 0.52) * swayAmp;
        transformed.z += cos(uTime * 0.88 + aKelpPhase * 1.3 + position.y * 0.44) * swayAmp * 0.72;`
      );
    shader.fragmentShader =
      `varying float vKelpHeight;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Subtle subsurface translucency near upper sun-catching fronds
        totalEmissiveRadiance += vec3(0.05, 0.16, 0.11) * smoothstep(0.35, 1.0, vKelpHeight);`
      );
  };
  disposablesMat.push(kelpMat);

  const kelpInst = new THREE.InstancedMesh(kelpBladeGeo, kelpMat, tier.kelpCount);
  kelpInst.frustumCulled = false;
  for (let i = 0; i < tier.kelpCount; i++) {
    const cluster = rng();
    let kx: number;
    let kz: number;
    if (cluster < 0.72) {
      const side = rng() < 0.5 ? -1 : 1;
      kx = side * (9.5 + rng() * 32);
      kz = -4 - rng() * 44;
    } else {
      kx = (rng() - 0.5) * 58;
      kz = -25 - rng() * 30;
    }
    const ky = getSeabedHeight(kx, kz);
    const scaleH = 0.7 + rng() * 1.45;
    dummy.position.set(kx, ky - 0.12, kz);
    dummy.rotation.set((rng() - 0.5) * 0.12, rng() * Math.PI * 2, (rng() - 0.5) * 0.12);
    dummy.scale.set(0.85 + rng() * 0.65, scaleH, 1);
    dummy.updateMatrix();
    kelpInst.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.38 + (rng() - 0.5) * 0.05, 0.44, 0.18 + rng() * 0.12);
    kelpInst.setColorAt(i, tint);
  }
  kelpInst.instanceMatrix.needsUpdate = true;
  if (kelpInst.instanceColor) kelpInst.instanceColor.needsUpdate = true;
  group.add(kelpInst);

  // 5. Fine Bubbles & Pelagic Marine Snow
  const bubbleTex = createBubbleSpriteTexture(128);
  const snowTex = createMarineSnowTexture(64);
  disposablesTex.push(bubbleTex, snowTex);

  const bPositions = new Float32Array(tier.bubbleCount * 3);
  const bSpeeds = new Float32Array(tier.bubbleCount);
  const bOffsets = new Float32Array(tier.bubbleCount);
  for (let i = 0; i < tier.bubbleCount; i++) {
    bPositions[i * 3] = (rng() - 0.5) * 58;
    bPositions[i * 3 + 1] = -14 + rng() * 35;
    bPositions[i * 3 + 2] = -38 + rng() * 46;
    bSpeeds[i] = 1.0 + rng() * 2.1;
    bOffsets[i] = rng() * Math.PI * 2;
  }
  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bPositions, 3));
  disposablesGeo.push(bubbleGeo);

  const bubbleMat = new THREE.PointsMaterial({
    map: bubbleTex,
    size: 0.34,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#bdefff'),
  });
  disposablesMat.push(bubbleMat);
  const bubblesPoints = new THREE.Points(bubbleGeo, bubbleMat);
  bubblesPoints.frustumCulled = false;
  group.add(bubblesPoints);

  const sPositions = new Float32Array(tier.snowCount * 3);
  const sPhases = new Float32Array(tier.snowCount);
  for (let i = 0; i < tier.snowCount; i++) {
    sPositions[i * 3] = (rng() - 0.5) * 66;
    sPositions[i * 3 + 1] = -13 + rng() * 36;
    sPositions[i * 3 + 2] = -46 + rng() * 56;
    sPhases[i] = rng() * Math.PI * 2;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sPositions, 3));
  disposablesGeo.push(snowGeo);

  const snowMat = new THREE.PointsMaterial({
    map: snowTex,
    size: 0.19,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#8cd7ef'),
  });
  disposablesMat.push(snowMat);
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  group.add(snowPoints);

  // 6. Impact Burst Bubble Pool
  const BURST_CAP = 96;
  const burstPos = new Float32Array(BURST_CAP * 3);
  const burstVel = new Float32Array(BURST_CAP * 3);
  const burstLife = new Float32Array(BURST_CAP);
  for (let i = 0; i < BURST_CAP; i++) {
    burstPos[i * 3 + 1] = -999;
    burstLife[i] = 0;
  }
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  disposablesGeo.push(burstGeo);

  const burstMat = new THREE.PointsMaterial({
    map: bubbleTex,
    size: 0.34,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#e8fcff'),
  });
  disposablesMat.push(burstMat);
  const burstPoints = new THREE.Points(burstGeo, burstMat);
  burstPoints.frustumCulled = false;
  burstPoints.renderOrder = 15;
  group.add(burstPoints);

  const spawnImpactBubbles = (worldOrigin: THREE.Vector3, dirToCam: THREE.Vector3, strength: number) => {
    const count = Math.round(BURST_CAP * Math.min(1, 0.55 + strength * 0.45));
    let spawned = 0;
    for (let i = 0; i < BURST_CAP && spawned < count; i++) {
      const ang = (spawned / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const spd = 2.4 + Math.random() * 6.8 * strength;
      burstPos[i * 3] = worldOrigin.x + (Math.random() - 0.5) * 0.45;
      burstPos[i * 3 + 1] = worldOrigin.y + (Math.random() - 0.5) * 0.45;
      burstPos[i * 3 + 2] = worldOrigin.z + (Math.random() - 0.5) * 0.3;

      burstVel[i * 3] = Math.cos(ang) * spd + dirToCam.x * 0.6;
      burstVel[i * 3 + 1] = Math.sin(ang) * spd + 1.2 + Math.random() * 1.8;
      burstVel[i * 3 + 2] = -0.8 - Math.random() * 2.5;
      burstLife[i] = 1.6 + Math.random() * 1.4;
      spawned++;
    }
    (burstGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };

  return {
    group,
    spawnImpactBubbles,
    update: (elapsed: number, dt: number) => {
      surfMat.uniforms.uTime.value = elapsed;
      causticUniforms.uTime.value = elapsed;
      kelpUniforms.uTime.value = elapsed;

      const bArr = bubbleGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tier.bubbleCount; i++) {
        const ix = i * 3;
        let x = bPositions[ix];
        let y = bPositions[ix + 1] + bSpeeds[i] * dt;
        const off = bOffsets[i];
        x += Math.sin(elapsed * 2.0 + off) * dt * 0.32;
        if (y > 22.5) {
          y = -14.2;
          x = ((i * 7.31) % 54) - 27;
        }
        bPositions[ix] = x;
        bPositions[ix + 1] = y;
      }
      bArr.needsUpdate = true;

      const sArr = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tier.snowCount; i++) {
        const ix = i * 3;
        const ph = sPhases[i];
        sPositions[ix] += Math.sin(elapsed * 0.32 + ph) * dt * 0.25;
        sPositions[ix + 1] += (Math.cos(elapsed * 0.24 + ph) * 0.12 - 0.08) * dt;
        if (sPositions[ix + 1] < -14.5) sPositions[ix + 1] = 20;
      }
      sArr.needsUpdate = true;

      let burstActive = false;
      for (let i = 0; i < BURST_CAP; i++) {
        if (burstLife[i] > 0) {
          burstActive = true;
          burstLife[i] -= dt;
          const ix = i * 3;
          burstVel[ix] *= Math.exp(-3.4 * dt);
          burstVel[ix + 1] = burstVel[ix + 1] * Math.exp(-2.8 * dt) + 2.2 * dt;
          burstVel[ix + 2] *= Math.exp(-3.2 * dt);

          burstPos[ix] += burstVel[ix] * dt;
          burstPos[ix + 1] += burstVel[ix + 1] * dt;
          burstPos[ix + 2] += burstVel[ix + 2] * dt;
          if (burstLife[i] <= 0) {
            burstPos[ix + 1] = -999;
          }
        }
      }
      if (burstActive) {
        (burstGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    },
    dispose: () => {
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
      for (const t of disposablesTex) t.dispose();
    },
  };
}
