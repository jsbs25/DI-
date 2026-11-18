import * as THREE from 'three';
import {
  createBubbleSpriteTexture,
  createCausticPatternTexture,
  createMarineSnowTexture,
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
 * Used to anchor every rock, coral formation, kelp stalk, and bottom-dwelling creature flush on the floor.
 */
export function getSeabedHeight(x: number, z: number): number {
  const baseY = -13.8;
  const rollingDunes =
    Math.sin(x * 0.085 + 0.4) * Math.cos(z * 0.075 - 0.3) * 1.85 +
    Math.sin(x * 0.21 - z * 0.16) * 0.68 +
    Math.cos(x * 0.43 + z * 0.39) * 0.24;

  // Natural perimeter amphitheater ridges so distant horizon looks volcanic and organic
  const radial = Math.hypot(x * 0.85, z + 14);
  const rimLift = Math.max(0, radial - 28) * 0.16;

  // Center foreground channel slightly recessed to preserve deep underwater camera sightlines
  const centerChannel = Math.exp(-((x * x) / 110 + ((z - 2) * (z - 2)) / 140)) * -1.1;

  return baseY + rollingDunes + Math.min(7.5, rimLift) + centerChannel;
}

function createSeabedSandTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1b3546';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const ripple = Math.sin(u * 14 + Math.sin(v * 4) * 1.4) * 0.5 + 0.5;
        const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
        const lum = 0.72 + ripple * 0.24 + (grain - 0.5) * 0.14;
        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, Math.round(34 * lum));
        d[idx + 1] = Math.min(255, Math.round(68 * lum));
        d[idx + 2] = Math.min(255, Math.round(86 * lum));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRockTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n1 = Math.sin(x * 0.09) * Math.cos(y * 0.11);
        const n2 = Math.sin((x + y) * 0.23) * 0.4;
        const speck = ((Math.sin(x * 37.2 + y * 91.7) * 43758.54) % 1 + 1) % 1;
        const v = 0.65 + (n1 + n2) * 0.15 + (speck - 0.5) * 0.16;
        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, Math.round(42 * v));
        d[idx + 1] = Math.min(255, Math.round(58 * v));
        d[idx + 2] = Math.min(255, Math.round(68 * v));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
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

  // 1. Seabed terrain with real-time GLSL water caustics projected onto the sand
  const sandTex = createSeabedSandTexture(512);
  sandTex.anisotropy = tier.maxAnisotropy;
  const causticTex = createCausticPatternTexture(256);
  causticTex.anisotropy = tier.maxAnisotropy;
  disposablesTex.push(sandTex, causticTex);

  const floorGeo = new THREE.PlaneGeometry(180, 180, 110, 110);
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
    roughness: 0.9,
    metalness: 0.04,
    color: new THREE.Color('#6aa8bd'),
  });
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticUniforms.uTime;
    shader.uniforms.uCausticMap = causticUniforms.uCausticMap;
    shader.vertexShader =
      `varying vec3 vSeaWorldPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvSeaWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader =
      `uniform float uTime;\nuniform sampler2D uCausticMap;\nvarying vec3 vSeaWorldPos;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 cUv1 = vSeaWorldPos.xz * 0.068 + vec2(uTime * 0.022, -uTime * 0.017);
        vec2 cUv2 = vSeaWorldPos.xz * 0.095 - vec2(uTime * 0.015, uTime * 0.024);
        vec3 c1 = texture2D(uCausticMap, cUv1).rgb;
        vec3 c2 = texture2D(uCausticMap, cUv2).rgb;
        float distFade = exp(-length(vSeaWorldPos.xz - vec2(0.0, 10.0)) * 0.022);
        vec3 causticLight = min(c1, c2) * 1.95 * distFade;
        totalEmissiveRadiance += causticLight * vec3(0.45, 0.92, 1.05);`
      );
  };
  disposablesMat.push(floorMat);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  group.add(floorMesh);

  // 2. Sculpted Reef Rocks & Outcrops (InstancedMesh for crisp multi-silhouette rock reefs)
  const rockTex = createRockTexture(256);
  disposablesTex.push(rockTex);

  const rockGeo = new THREE.DodecahedronGeometry(1.0, 2);
  const rockPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rockPos.count; i++) {
    const vx = rockPos.getX(i);
    const vy = rockPos.getY(i);
    const vz = rockPos.getZ(i);
    const crag = 0.78 + 0.28 * Math.sin(vx * 3.1 + vz * 2.4) * Math.cos(vy * 3.7);
    rockPos.setXYZ(i, vx * crag, vy * crag * 0.72, vz * crag);
  }
  rockGeo.computeVertexNormals();
  disposablesGeo.push(rockGeo);

  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    roughness: 0.88,
    metalness: 0.06,
    color: new THREE.Color('#2d4a5c'),
  });
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticUniforms.uTime;
    shader.uniforms.uCausticMap = causticUniforms.uCausticMap;
    shader.vertexShader =
      `varying vec3 vRockWorldPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvec4 rw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrw = instanceMatrix * rw;\n#endif\nvRockWorldPos = (modelMatrix * rw).xyz;`
      );
    shader.fragmentShader =
      `uniform float uTime;\nuniform sampler2D uCausticMap;\nvarying vec3 vRockWorldPos;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 rcUv = vRockWorldPos.xz * 0.08 + vec2(uTime * 0.02, -uTime * 0.014);
        vec3 rc = texture2D(uCausticMap, rcUv).rgb;
        float topMask = smoothstep(-15.0, -7.0, vRockWorldPos.y);
        totalEmissiveRadiance += rc * topMask * 0.55 * vec3(0.35, 0.85, 1.0);`
      );
  };
  disposablesMat.push(rockMat);

  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, tier.rockCount);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const reefSpots: Array<{ x: number; z: number; y: number; radius: number }> = [];

  for (let i = 0; i < tier.rockCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 6 + rng() * 48;
    const rx = Math.cos(angle) * dist * 1.15;
    const rz = Math.sin(angle) * dist * 0.9 - 16;
    const ry = getSeabedHeight(rx, rz);
    const sx = 1.2 + rng() * 3.4;
    const sy = 0.9 + rng() * 2.5;
    const sz = 1.2 + rng() * 3.1;

    dummy.position.set(rx, ry + sy * 0.22, rz);
    dummy.rotation.set((rng() - 0.5) * 0.35, rng() * Math.PI * 2, (rng() - 0.5) * 0.35);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);

    const shade = 0.72 + rng() * 0.45;
    tint.setRGB(shade * 0.88, shade * 0.98, shade * 1.08);
    rockInst.setColorAt(i, tint);

    if (i < tier.coralClusters) {
      reefSpots.push({ x: rx, z: rz, y: ry + sy * 0.55, radius: Math.max(sx, sz) * 0.65 });
    }
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // 3. Multi-Species 3D Corals & Bioluminescent Anemones
  const coralGroup = new THREE.Group();
  const brainGeo = new THREE.SphereGeometry(0.65, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const brainPos = brainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < brainPos.count; i++) {
    const vx = brainPos.getX(i);
    const vy = brainPos.getY(i);
    const vz = brainPos.getZ(i);
    const ridge = 1 + 0.08 * Math.sin(vx * 18) * Math.cos(vz * 18);
    brainPos.setXYZ(i, vx * ridge, vy, vz * ridge);
  }
  brainGeo.computeVertexNormals();

  // Branching Staghorn Coral cluster geometry merged via multiple curved TubeGeometries
  const tubeCurveA = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 0.5, 0.04),
    new THREE.Vector3(0.32, 1.05, 0.14),
    new THREE.Vector3(0.45, 1.48, 0.2),
  ]);
  const tubeCurveB = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.25, 0),
    new THREE.Vector3(-0.18, 0.72, -0.1),
    new THREE.Vector3(-0.42, 1.25, -0.22),
  ]);
  const tubeCurveC = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 0.4, 0.02),
    new THREE.Vector3(0.02, 0.85, -0.26),
    new THREE.Vector3(-0.08, 1.32, -0.45),
  ]);
  const branchGeoA = new THREE.TubeGeometry(tubeCurveA, 12, 0.075, 7, false);
  const branchGeoB = new THREE.TubeGeometry(tubeCurveB, 10, 0.065, 7, false);
  const branchGeoC = new THREE.TubeGeometry(tubeCurveC, 10, 0.06, 7, false);
  const anemoneBulbGeo = new THREE.CapsuleGeometry(0.055, 0.52, 4, 8);
  anemoneBulbGeo.translate(0, 0.28, 0);

  disposablesGeo.push(brainGeo, branchGeoA, branchGeoB, branchGeoC, anemoneBulbGeo);

  const coralPalette = ['#ef6c57', '#f4a261', '#c77dff', '#38bdf8', '#2dd4bf', '#fb7185'];
  const brainMat = new THREE.MeshStandardMaterial({
    roughness: 0.65,
    metalness: 0.05,
    color: '#ffffff',
  });
  const staghornMat = new THREE.MeshStandardMaterial({
    roughness: 0.58,
    metalness: 0.08,
    color: '#ffffff',
  });
  const anemoneMat = new THREE.MeshStandardMaterial({
    color: '#22d3ee',
    emissive: '#0ea5e9',
    emissiveIntensity: 0.85,
    roughness: 0.3,
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

    // Brain coral flush on reef/floor
    const bScale = 0.65 + rng() * 1.1;
    dummy.position.set(cx, cy - 0.08, cz);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(bScale, bScale * (0.75 + rng() * 0.4), bScale);
    dummy.updateMatrix();
    brainInst.setMatrixAt(i, dummy.matrix);
    tint.set(coralPalette[i % coralPalette.length]);
    brainInst.setColorAt(i, tint);

    // Staghorn coral cluster offset nearby
    const sx = spot.x + (rng() - 0.5) * spot.radius * 1.4;
    const sz = spot.z + (rng() - 0.5) * spot.radius * 1.4;
    const sy = getSeabedHeight(sx, sz);
    const sScale = 0.8 + rng() * 1.25;
    dummy.position.set(sx, sy - 0.05, sz);
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

    // Glowing anemone stalks around spot
    const ax0 = spot.x + (rng() - 0.5) * 1.4;
    const az0 = spot.z + (rng() - 0.5) * 1.4;
    const ay0 = getSeabedHeight(ax0, az0);
    for (let k = 0; k < 4; k++) {
      dummy.position.set(ax0 + (rng() - 0.5) * 0.35, ay0 - 0.04, az0 + (rng() - 0.5) * 0.35);
      dummy.rotation.set((rng() - 0.5) * 0.45, rng() * Math.PI * 2, (rng() - 0.5) * 0.45);
      dummy.scale.setScalar(0.75 + rng() * 0.85);
      dummy.updateMatrix();
      anemoneInst.setMatrixAt(anemoneIdx, dummy.matrix);
      tint.set(k % 2 === 0 ? '#38f8ff' : '#a855f7');
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

  // 4. GPU-Animated Swaying Kelp Forest (InstancedMesh + GLSL vertex wave)
  const kelpBladeGeo = new THREE.PlaneGeometry(0.42, 6.2, 2, 14);
  kelpBladeGeo.translate(0, 3.1, 0);
  // Taper kelp blade tip organically
  const kp = kelpBladeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < kp.count; i++) {
    const y = kp.getY(i);
    const h = y / 6.2;
    const taper = Math.sin(Math.min(1, h) * Math.PI * 0.92) * (1 - h * 0.45) + 0.12;
    const ruffle = Math.sin(h * 18) * 0.06;
    kp.setX(i, kp.getX(i) * taper);
    kp.setZ(i, ruffle);
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
    color: '#1b6b4a',
    emissive: '#072b24',
    emissiveIntensity: 0.35,
    roughness: 0.62,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  kelpMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = kelpUniforms.uTime;
    shader.vertexShader =
      `attribute float aKelpPhase;\nuniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hFrac = clamp(position.y / 6.2, 0.0, 1.0);
        float swayAmp = pow(hFrac, 1.45) * 0.92;
        transformed.x += sin(uTime * 1.25 + aKelpPhase + position.y * 0.55) * swayAmp;
        transformed.z += cos(uTime * 0.95 + aKelpPhase * 1.3 + position.y * 0.45) * swayAmp * 0.72;`
      );
  };
  disposablesMat.push(kelpMat);

  const kelpInst = new THREE.InstancedMesh(kelpBladeGeo, kelpMat, tier.kelpCount);
  kelpInst.frustumCulled = false;
  for (let i = 0; i < tier.kelpCount; i++) {
    // Cluster kelp around reef borders & midground while keeping central camera cone open
    const cluster = rng();
    let kx: number;
    let kz: number;
    if (cluster < 0.7) {
      const side = rng() < 0.5 ? -1 : 1;
      kx = side * (9 + rng() * 32);
      kz = -4 - rng() * 44;
    } else {
      kx = (rng() - 0.5) * 56;
      kz = -24 - rng() * 30;
    }
    const ky = getSeabedHeight(kx, kz);
    const scaleH = 0.65 + rng() * 1.35;
    dummy.position.set(kx, ky - 0.12, kz);
    dummy.rotation.set((rng() - 0.5) * 0.12, rng() * Math.PI * 2, (rng() - 0.5) * 0.12);
    dummy.scale.set(0.8 + rng() * 0.65, scaleH, 1);
    dummy.updateMatrix();
    kelpInst.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.41 + (rng() - 0.5) * 0.06, 0.58, 0.24 + rng() * 0.14);
    kelpInst.setColorAt(i, tint);
  }
  kelpInst.instanceMatrix.needsUpdate = true;
  if (kelpInst.instanceColor) kelpInst.instanceColor.needsUpdate = true;
  group.add(kelpInst);

  // 5. Rising Bubbles Particle System
  const bubbleTex = createBubbleSpriteTexture(128);
  const snowTex = createMarineSnowTexture(64);
  disposablesTex.push(bubbleTex, snowTex);

  const bPositions = new Float32Array(tier.bubbleCount * 3);
  const bSpeeds = new Float32Array(tier.bubbleCount);
  const bOffsets = new Float32Array(tier.bubbleCount);
  for (let i = 0; i < tier.bubbleCount; i++) {
    bPositions[i * 3] = (rng() - 0.5) * 58;
    bPositions[i * 3 + 1] = -14 + rng() * 32;
    bPositions[i * 3 + 2] = -38 + rng() * 46;
    bSpeeds[i] = 1.1 + rng() * 2.4;
    bOffsets[i] = rng() * Math.PI * 2;
  }
  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bPositions, 3));
  disposablesGeo.push(bubbleGeo);

  const bubbleMat = new THREE.PointsMaterial({
    map: bubbleTex,
    size: 0.42,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#c8f6ff'),
  });
  disposablesMat.push(bubbleMat);
  const bubblesPoints = new THREE.Points(bubbleGeo, bubbleMat);
  bubblesPoints.frustumCulled = false;
  group.add(bubblesPoints);

  // 6. Suspended Marine Snow / Plankton Motes
  const sPositions = new Float32Array(tier.snowCount * 3);
  const sPhases = new Float32Array(tier.snowCount);
  for (let i = 0; i < tier.snowCount; i++) {
    sPositions[i * 3] = (rng() - 0.5) * 64;
    sPositions[i * 3 + 1] = -13 + rng() * 34;
    sPositions[i * 3 + 2] = -46 + rng() * 56;
    sPhases[i] = rng() * Math.PI * 2;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sPositions, 3));
  disposablesGeo.push(snowGeo);

  const snowMat = new THREE.PointsMaterial({
    map: snowTex,
    size: 0.22,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#9ae6ff'),
  });
  disposablesMat.push(snowMat);
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  group.add(snowPoints);

  // 7. Impact Burst Bubble Pool (triggered when a creature collides with camera glass)
  const BURST_CAP = 90;
  const burstPos = new Float32Array(BURST_CAP * 3);
  const burstVel = new Float32Array(BURST_CAP * 3);
  const burstLife = new Float32Array(BURST_CAP); // 0 = dead, >0 active
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
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#ecfeff'),
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
      causticUniforms.uTime.value = elapsed;
      kelpUniforms.uTime.value = elapsed;

      // Update rising ambient bubbles
      const bArr = bubbleGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tier.bubbleCount; i++) {
        const ix = i * 3;
        let x = bPositions[ix];
        let y = bPositions[ix + 1] + bSpeeds[i] * dt;
        const off = bOffsets[i];
        x += Math.sin(elapsed * 2.1 + off) * dt * 0.35;
        if (y > 18.5) {
          y = -14.2;
          x = ((i * 7.31) % 54) - 27;
        }
        bPositions[ix] = x;
        bPositions[ix + 1] = y;
      }
      bArr.needsUpdate = true;

      // Update gentle marine snow drift
      const sArr = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < tier.snowCount; i++) {
        const ix = i * 3;
        const ph = sPhases[i];
        sPositions[ix] += Math.sin(elapsed * 0.35 + ph) * dt * 0.28;
        sPositions[ix + 1] += (Math.cos(elapsed * 0.25 + ph) * 0.14 - 0.08) * dt;
        if (sPositions[ix + 1] < -14) sPositions[ix + 1] = 18;
      }
      sArr.needsUpdate = true;

      // Update impact bubble burst
      let burstActive = false;
      for (let i = 0; i < BURST_CAP; i++) {
        if (burstLife[i] > 0) {
          burstActive = true;
          burstLife[i] -= dt;
          const ix = i * 3;
          // Drag + buoyancy upward
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
