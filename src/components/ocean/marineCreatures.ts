import * as THREE from 'three';

export interface MarineCreatureTier {
  baitfishCount: number;
  tropicalCount: number;
  pelagicCount: number;
  jellyCount: number;
  turtleCount: number;
  dolphinCount: number;
  sharkCount: number;
  mantaCount: number;
  isSoftwareGl: boolean;
}

export interface ArticulatedCreatureRig {
  kind: 'pelagic' | 'dolphin' | 'turtle' | 'shark' | 'whale' | 'manta' | 'jelly' | 'octopus';
  root: THREE.Group;
  tailPivot?: THREE.Object3D;
  leftFlipper?: THREE.Object3D;
  rightFlipper?: THREE.Object3D;
  bellMesh?: THREE.Object3D;
  tentacles?: THREE.Object3D[];
  armSegments?: THREE.Object3D[];
  swimUniforms?: { uTime: { value: number }; uSpeed: { value: number } };
  wingUniforms?: { uTime: { value: number }; uPhase: { value: number } };
  phase: number;
  baseScale: number;
}

export interface MarineCreaturesHandle {
  group: THREE.Group;
  baitfishInst: THREE.InstancedMesh;
  tropicalInst: THREE.InstancedMesh;
  baitfishPhases: Float32Array;
  tropicalPhases: Float32Array;
  baitfishTimeUniform: { value: number };
  tropicalTimeUniform: { value: number };
  pelagics: ArticulatedCreatureRig[];
  dolphins: ArticulatedCreatureRig[];
  turtles: ArticulatedCreatureRig[];
  sharks: ArticulatedCreatureRig[];
  whale: ArticulatedCreatureRig;
  mantas: ArticulatedCreatureRig[];
  jellies: ArticulatedCreatureRig[];
  octopus: ArticulatedCreatureRig;
  animateRig: (rig: ArticulatedCreatureRig, elapsed: number, speedFactor: number) => void;
  dispose: () => void;
}

interface SpineStation {
  t: number; // 0 = rear (-Z), 1 = snout (+Z)
  rx: number;
  ryTop: number;
  ryBot: number;
  yOffset: number;
}

/**
 * Lofts an anatomical, watertight organic marine body along Z (+Z snout, -Z tail)
 * with independent dorsal/ventral profiles and smooth UVs for flank textures.
 */
function buildLoftedBodyGeometry(
  stations: SpineStation[],
  radialSegs: number,
  length: number
): THREE.BufferGeometry {
  const rings = stations.length;
  const cols = radialSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rings; r++) {
    const st = stations[r];
    const z = (st.t - 0.5) * length;
    for (let c = 0; c <= radialSegs; c++) {
      const u = c / radialSegs;
      const theta = u * Math.PI * 2; // 0 = top dorsal (+Y), PI/2 = right (+X), PI = belly (-Y)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const ry = cosT >= 0 ? st.ryTop : st.ryBot;
      const x = sinT * st.rx;
      const y = cosT * ry + st.yOffset;
      positions.push(x, y, z);
      // Map U so theta=0 (dorsal) maps to v=0, theta=PI (belly) maps to v=1 on flank canvas texture!
      const bellyV = 0.5 - cosT * 0.5;
      uvs.push(st.t, bellyV);
    }
  }

  for (let r = 0; r < rings - 1; r++) {
    for (let c = 0; c < radialSegs; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface FinSpanSection {
  spanPos: number; // position along span axis
  zCenter: number; // swept Z offset
  chord: number; // fore-aft length
  thickness: number;
  offsetY?: number;
}

/**
 * Builds a cambered NACA-profile swept hydrofoil fin along +X span (horizontal or rotated vertical).
 */
function buildHydrofoilFinGeometry(sections: FinSpanSection[], chordSegs = 8): THREE.BufferGeometry {
  const rows = sections.length;
  const cols = chordSegs * 2 + 1; // wraps top surface leading->trailing->bottom->leading
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const sec = sections[r];
    const x = sec.spanPos;
    const halfC = Math.max(0.002, sec.chord * 0.5);
    const yOff = sec.offsetY ?? 0;

    for (let c = 0; c < cols; c++) {
      const isTop = c <= chordSegs;
      const p = isTop ? c / chordSegs : 1 - (c - chordSegs) / chordSegs; // 0 = leading (+Z), 1 = trailing (-Z)
      // NACA 00xx half-thickness profile
      const naca =
        5.0 *
        (0.2969 * Math.sqrt(Math.max(0, p)) -
          0.126 * p -
          0.3516 * p * p +
          0.2843 * p * p * p -
          0.1015 * p * p * p * p);
      const localZ = sec.zCenter + (0.5 - p) * (halfC * 2);
      const localY = yOff + (isTop ? 1 : -1) * naca * sec.thickness;
      positions.push(x, localY, localZ);
      uvs.push(p, r / Math.max(1, rows - 1));
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createSharkSkinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#1a2a38');
    grad.addColorStop(0.42, '#2d4659');
    grad.addColorStop(0.56, '#768d9d');
    grad.addColorStop(0.68, '#cbd7df');
    grad.addColorStop(1.0, '#dfe7ec');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Subtle organic dermal mottling
    for (let i = 0; i < 420; i++) {
      const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * 256;
      const y = (Math.cos(i * 41.7) * 0.5 + 0.5) * 74;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(18, 30, 40, 0.14)' : 'rgba(140, 170, 190, 0.08)';
      ctx.fillRect(x, y, 3, 2);
    }

    // 5 crisp anatomical gill slits near u ~ 0.65..0.74
    ctx.strokeStyle = 'rgba(12, 22, 30, 0.72)';
    ctx.lineWidth = 2.2;
    for (let g = 0; g < 5; g++) {
      const gx = 165 + g * 6.5;
      ctx.beginPath();
      ctx.moveTo(gx, 48);
      ctx.quadraticCurveTo(gx - 2, 62, gx + 1, 76);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWhaleSkinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#0f1c2b');
    grad.addColorStop(0.55, '#1d3247');
    grad.addColorStop(0.75, '#466176');
    grad.addColorStop(1.0, '#9fb5c6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Pale ventral throat grooves (baleen pleats) along forward belly
    ctx.strokeStyle = 'rgba(20, 34, 48, 0.52)';
    ctx.lineWidth = 1.6;
    for (let y = 84; y < 126; y += 4.5) {
      ctx.beginPath();
      ctx.moveTo(118, y);
      ctx.lineTo(246, y);
      ctx.stroke();
    }

    // Subtle organic barnacle & scar mottling
    for (let i = 0; i < 180; i++) {
      const x = (Math.sin(i * 31.7) * 0.5 + 0.5) * 250;
      const y = (Math.cos(i * 17.3) * 0.5 + 0.5) * 116;
      ctx.fillStyle = 'rgba(215, 228, 238, 0.14)';
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createDolphinSkinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#223d56');
    grad.addColorStop(0.45, '#4b7391');
    grad.addColorStop(0.66, '#a9c4d6');
    grad.addColorStop(1.0, '#dceaf2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFishSkinTexture(
  dorsal: string,
  flank: string,
  belly: string,
  bandTint?: string
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0.0, dorsal);
    grad.addColorStop(0.45, flank);
    grad.addColorStop(1.0, belly);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);

    if (bandTint) {
      ctx.fillStyle = bandTint;
      for (let x = 26; x < 102; x += 18) {
        ctx.fillRect(x, 6, 6, 48);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createTurtleCarapaceTexture(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const b = document.createElement('canvas');
  b.width = 256;
  b.height = 256;
  const ctx = c.getContext('2d');
  const bCtx = b.getContext('2d');

  if (ctx && bCtx) {
    ctx.fillStyle = '#33422b';
    ctx.fillRect(0, 0, 256, 256);
    bCtx.fillStyle = '#555555';
    bCtx.fillRect(0, 0, 256, 256);

    const scutes = [
      [128, 48, 34, 28],
      [128, 102, 42, 30],
      [128, 160, 40, 30],
      [128, 212, 32, 24],
      [68, 76, 32, 34],
      [188, 76, 32, 34],
      [64, 134, 34, 36],
      [192, 134, 34, 36],
      [74, 190, 30, 30],
      [182, 190, 30, 30],
    ];
    for (let i = 0; i < scutes.length; i++) {
      const [sx, sy, rx, ry] = scutes[i];
      const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, rx);
      grad.addColorStop(0.0, '#7c6238');
      grad.addColorStop(0.65, '#465232');
      grad.addColorStop(1.0, '#222c1f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#9c8353';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const bGrad = bCtx.createRadialGradient(sx, sy, 2, sx, sy, rx);
      bGrad.addColorStop(0.0, '#e0e0e0');
      bGrad.addColorStop(0.85, '#999999');
      bGrad.addColorStop(1.0, '#222222');
      bCtx.fillStyle = bGrad;
      bCtx.beginPath();
      bCtx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      bCtx.fill();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.needsUpdate = true;
  return { map, bumpMap };
}

function createMantaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#152230';
    ctx.fillRect(0, 0, 256, 128);
    // Soft pale chevron shoulder markings on dorsal wings
    ctx.fillStyle = 'rgba(175, 206, 224, 0.36)';
    ctx.beginPath();
    ctx.moveTo(95, 28);
    ctx.quadraticCurveTo(60, 48, 35, 68);
    ctx.quadraticCurveTo(68, 56, 104, 42);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(161, 28);
    ctx.quadraticCurveTo(196, 48, 221, 68);
    ctx.quadraticCurveTo(188, 56, 152, 42);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Full-spine sinusoidal swimming shader for instanced schools (nose stays anchored, body ripples smoothly to tail).
 */
function applyInstancedSpineSwimShader(
  mat: THREE.MeshStandardMaterial,
  timeUniform: { value: number },
  bodyLen: number,
  amp: number,
  freq: number
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwimTime = timeUniform;
    shader.vertexShader =
      `attribute float aSwimPhase;\nuniform float uSwimTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float spineT = clamp((0.45 * ${bodyLen.toFixed(2)} - position.z) / ${bodyLen.toFixed(2)}, 0.0, 1.0);
        float envelope = pow(spineT, 1.45);
        float wave = sin(uSwimTime * ${freq.toFixed(2)} + aSwimPhase - position.z * ${(5.4 / bodyLen).toFixed(2)});
        transformed.x += wave * envelope * ${amp.toFixed(3)};`
      );
  };
}

/**
 * Full-spine swim shader + overhead dynamic caustic glint for solo hero swimmers (Sharks, Dolphins, Whales).
 */
function applySoloSwimmerShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: { uTime: { value: number }; uSpeed: { value: number } },
  bodyLen: number,
  amp: number,
  freq: number,
  verticalFluke = false
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSpeed = uniforms.uSpeed;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uSpeed;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float spineT = clamp((0.35 * ${bodyLen.toFixed(2)} - position.z) / ${bodyLen.toFixed(2)}, 0.0, 1.0);
        float wave = sin(uTime * ${freq.toFixed(2)} * uSpeed - position.z * ${(4.2 / bodyLen).toFixed(2)}) * pow(spineT, 1.55) * ${amp.toFixed(3)};
        ${verticalFluke ? 'transformed.y += wave;' : 'transformed.x += wave;'}`
      );
  };
}

export function createMarineCreatures(tier: MarineCreatureTier): MarineCreaturesHandle {
  const group = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const disposablesTex: THREE.Texture[] = [];

  const baitfishTimeUniform = { value: 0 };
  const tropicalTimeUniform = { value: 0 };

  // Textures
  const baitTex = createFishSkinTexture('#1b455e', '#7fb9d4', '#dcecf4');
  const tropTex = createFishSkinTexture('#194f75', '#b57b3b', '#e2d7be', 'rgba(20, 32, 48, 0.42)');
  const sharkTex = createSharkSkinTexture();
  const whaleTex = createWhaleSkinTexture();
  const dolphinTex = createDolphinSkinTexture();
  const { map: turtleMap, bumpMap: turtleBump } = createTurtleCarapaceTexture();
  const mantaTex = createMantaTexture();
  disposablesTex.push(baitTex, tropTex, sharkTex, whaleTex, dolphinTex, turtleMap, turtleBump, mantaTex);

  const eyeGeo = new THREE.SphereGeometry(0.042, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#05090d', roughness: 0.08, metalness: 0.25 });
  disposablesGeo.push(eyeGeo);
  disposablesMat.push(eyeMat);

  // =========================================================================
  // 1. Baitfish School (Lofted Sardine/Mackerel Body + Forked Hydrofoil Tail)
  // =========================================================================
  const baitStations: SpineStation[] = [
    { t: 0.0, rx: 0.012, ryTop: 0.018, ryBot: 0.018, yOffset: 0 },
    { t: 0.16, rx: 0.025, ryTop: 0.045, ryBot: 0.042, yOffset: 0 },
    { t: 0.48, rx: 0.048, ryTop: 0.078, ryBot: 0.074, yOffset: 0 },
    { t: 0.78, rx: 0.044, ryTop: 0.068, ryBot: 0.062, yOffset: 0 },
    { t: 0.94, rx: 0.022, ryTop: 0.036, ryBot: 0.032, yOffset: 0 },
    { t: 1.0, rx: 0.005, ryTop: 0.008, ryBot: 0.008, yOffset: 0 },
  ];
  const baitBodyGeo = buildLoftedBodyGeometry(baitStations, 12, 0.56);
  const baitTailGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -0.11, zCenter: -0.35, chord: 0.09, thickness: 0.012 },
      { spanPos: -0.02, zCenter: -0.29, chord: 0.06, thickness: 0.014 },
      { spanPos: 0.02, zCenter: -0.29, chord: 0.06, thickness: 0.014 },
      { spanPos: 0.11, zCenter: -0.35, chord: 0.09, thickness: 0.012 },
    ],
    6
  );
  baitTailGeo.rotateZ(Math.PI / 2);

  // Merge lofted body + vertical forked caudal fin cleanly
  const baitMerged = (() => {
    const a = baitBodyGeo.toNonIndexed();
    const b = baitTailGeo.toNonIndexed();
    const posA = a.attributes.position.array as Float32Array;
    const posB = b.attributes.position.array as Float32Array;
    const normA = a.attributes.normal.array as Float32Array;
    const normB = b.attributes.normal.array as Float32Array;
    const uvA = a.attributes.uv.array as Float32Array;
    const uvB = b.attributes.uv.array as Float32Array;
    const pos = new Float32Array(posA.length + posB.length);
    pos.set(posA, 0);
    pos.set(posB, posA.length);
    const norm = new Float32Array(normA.length + normB.length);
    norm.set(normA, 0);
    norm.set(normB, normA.length);
    const uv = new Float32Array(uvA.length + uvB.length);
    uv.set(uvA, 0);
    uv.set(uvB, uvA.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    a.dispose();
    b.dispose();
    return g;
  })();
  baitBodyGeo.dispose();
  baitTailGeo.dispose();

  const baitfishPhases = new Float32Array(tier.baitfishCount);
  for (let i = 0; i < tier.baitfishCount; i++) baitfishPhases[i] = Math.random() * Math.PI * 2;
  baitMerged.setAttribute('aSwimPhase', new THREE.InstancedBufferAttribute(baitfishPhases, 1));
  disposablesGeo.push(baitMerged);

  const baitMat = new THREE.MeshStandardMaterial({
    map: baitTex,
    roughness: 0.18,
    metalness: 0.68,
    color: '#d4edf7',
  });
  applyInstancedSpineSwimShader(baitMat, baitfishTimeUniform, 0.56, 0.085, 8.6);
  disposablesMat.push(baitMat);

  const baitfishInst = new THREE.InstancedMesh(baitMerged, baitMat, tier.baitfishCount);
  baitfishInst.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < tier.baitfishCount; i++) {
    col.setHSL(0.54 + (Math.random() - 0.5) * 0.03, 0.25, 0.78 + Math.random() * 0.16);
    baitfishInst.setColorAt(i, col);
  }
  if (baitfishInst.instanceColor) baitfishInst.instanceColor.needsUpdate = true;
  group.add(baitfishInst);

  // =========================================================================
  // 2. Tropical Reef Fish School (Organic Disc Profile + Swept Dorsal/Caudal)
  // =========================================================================
  const tropStations: SpineStation[] = [
    { t: 0.0, rx: 0.015, ryTop: 0.035, ryBot: 0.035, yOffset: 0 },
    { t: 0.18, rx: 0.035, ryTop: 0.12, ryBot: 0.11, yOffset: 0 },
    { t: 0.52, rx: 0.072, ryTop: 0.20, ryBot: 0.18, yOffset: 0 },
    { t: 0.80, rx: 0.056, ryTop: 0.14, ryBot: 0.12, yOffset: 0 },
    { t: 0.96, rx: 0.022, ryTop: 0.045, ryBot: 0.04, yOffset: -0.01 },
    { t: 1.0, rx: 0.005, ryTop: 0.01, ryBot: 0.01, yOffset: -0.01 },
  ];
  const tropBodyGeo = buildLoftedBodyGeometry(tropStations, 14, 0.68);
  const tropTailGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -0.17, zCenter: -0.43, chord: 0.12, thickness: 0.016 },
      { spanPos: 0.0, zCenter: -0.35, chord: 0.09, thickness: 0.02 },
      { spanPos: 0.17, zCenter: -0.43, chord: 0.12, thickness: 0.016 },
    ],
    6
  );
  tropTailGeo.rotateZ(Math.PI / 2);

  const tropMerged = (() => {
    const a = tropBodyGeo.toNonIndexed();
    const b = tropTailGeo.toNonIndexed();
    const pos = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
    pos.set(a.attributes.position.array as Float32Array, 0);
    pos.set(b.attributes.position.array as Float32Array, a.attributes.position.array.length);
    const norm = new Float32Array(a.attributes.normal.array.length + b.attributes.normal.array.length);
    norm.set(a.attributes.normal.array as Float32Array, 0);
    norm.set(b.attributes.normal.array as Float32Array, a.attributes.normal.array.length);
    const uv = new Float32Array(a.attributes.uv.array.length + b.attributes.uv.array.length);
    uv.set(a.attributes.uv.array as Float32Array, 0);
    uv.set(b.attributes.uv.array as Float32Array, a.attributes.uv.array.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    a.dispose();
    b.dispose();
    return g;
  })();
  tropBodyGeo.dispose();
  tropTailGeo.dispose();

  const tropicalPhases = new Float32Array(tier.tropicalCount);
  for (let i = 0; i < tier.tropicalCount; i++) tropicalPhases[i] = Math.random() * Math.PI * 2;
  tropMerged.setAttribute('aSwimPhase', new THREE.InstancedBufferAttribute(tropicalPhases, 1));
  disposablesGeo.push(tropMerged);

  const tropMat = new THREE.MeshStandardMaterial({
    map: tropTex,
    roughness: 0.34,
    metalness: 0.24,
    color: '#ffffff',
  });
  applyInstancedSpineSwimShader(tropMat, tropicalTimeUniform, 0.68, 0.095, 7.2);
  disposablesMat.push(tropMat);

  const tropicalInst = new THREE.InstancedMesh(tropMerged, tropMat, tier.tropicalCount);
  tropicalInst.frustumCulled = false;
  // Realistic Pacific reef tangs & damselfish tones
  const tropColors = ['#c98746', '#408ba8', '#7896a3', '#a66253', '#528073', '#b39a56'];
  for (let i = 0; i < tier.tropicalCount; i++) {
    col.set(tropColors[i % tropColors.length]);
    tropicalInst.setColorAt(i, col);
  }
  if (tropicalInst.instanceColor) tropicalInst.instanceColor.needsUpdate = true;
  group.add(tropicalInst);

  // =========================================================================
  // 3. Pelagic Swimmers (Jacks / Tuna with Cambered Hydrofoil Fins)
  // =========================================================================
  const pelagicStations: SpineStation[] = [
    { t: 0.0, rx: 0.03, ryTop: 0.045, ryBot: 0.045, yOffset: 0 },
    { t: 0.16, rx: 0.075, ryTop: 0.14, ryBot: 0.13, yOffset: 0 },
    { t: 0.45, rx: 0.17, ryTop: 0.29, ryBot: 0.27, yOffset: 0 },
    { t: 0.72, rx: 0.18, ryTop: 0.28, ryBot: 0.25, yOffset: 0 },
    { t: 0.90, rx: 0.10, ryTop: 0.16, ryBot: 0.14, yOffset: 0 },
    { t: 1.0, rx: 0.015, ryTop: 0.02, ryBot: 0.02, yOffset: 0 },
  ];
  const pelagicBodyGeo = buildLoftedBodyGeometry(pelagicStations, 18, 1.85);
  const pelagicTailGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -0.38, zCenter: -0.34, chord: 0.18, thickness: 0.024 },
      { spanPos: -0.14, zCenter: -0.16, chord: 0.14, thickness: 0.032 },
      { spanPos: 0.0, zCenter: -0.05, chord: 0.14, thickness: 0.04 },
      { spanPos: 0.14, zCenter: -0.16, chord: 0.14, thickness: 0.032 },
      { spanPos: 0.38, zCenter: -0.34, chord: 0.18, thickness: 0.024 },
    ],
    8
  );
  pelagicTailGeo.rotateZ(Math.PI / 2);

  const pelagicDorsalGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.36, thickness: 0.03 },
      { spanPos: 0.18, zCenter: -0.1, chord: 0.22, thickness: 0.02 },
      { spanPos: 0.34, zCenter: -0.22, chord: 0.08, thickness: 0.01 },
    ],
    6
  );
  pelagicDorsalGeo.rotateZ(Math.PI / 2);

  const pelagicPecGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.2, thickness: 0.022 },
      { spanPos: 0.24, zCenter: -0.12, chord: 0.12, thickness: 0.015 },
      { spanPos: 0.42, zCenter: -0.24, chord: 0.05, thickness: 0.008 },
    ],
    6
  );

  const pelagicMat = new THREE.MeshStandardMaterial({
    map: baitTex,
    color: '#9fcce0',
    roughness: 0.2,
    metalness: 0.56,
  });
  disposablesGeo.push(pelagicBodyGeo, pelagicTailGeo, pelagicDorsalGeo, pelagicPecGeo);
  disposablesMat.push(pelagicMat);

  const pelagics: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.pelagicCount; i++) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(pelagicBodyGeo, pelagicMat);
    const dorsal = new THREE.Mesh(pelagicDorsalGeo, pelagicMat);
    dorsal.position.set(0, 0.25, 0.08);
    const pecL = new THREE.Mesh(pelagicPecGeo, pelagicMat);
    pecL.position.set(0.14, -0.08, 0.26);
    pecL.rotation.set(0.12, -0.28, -0.35);
    const pecR = new THREE.Mesh(pelagicPecGeo, pelagicMat);
    pecR.scale.x = -1;
    pecR.position.set(-0.14, -0.08, 0.26);
    pecR.rotation.set(0.12, 0.28, 0.35);

    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    const eR = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(0.12, 0.06, 0.62);
    eR.position.set(-0.12, 0.06, 0.62);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.86);
    tailPivot.add(new THREE.Mesh(pelagicTailGeo, pelagicMat));

    root.add(body, dorsal, pecL, pecR, eL, eR, tailPivot);
    const sc = 0.88 + (i % 3) * 0.22;
    root.scale.setScalar(sc);
    group.add(root);

    pelagics.push({
      kind: 'pelagic',
      root,
      tailPivot,
      phase: Math.random() * Math.PI * 2,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 4. Dolphins (Sleek Melon + Narrow Rostrum + Falcate Fin + Curved Flukes)
  // =========================================================================
  const dolphinStations: SpineStation[] = [
    { t: 0.0, rx: 0.04, ryTop: 0.055, ryBot: 0.055, yOffset: -0.02 },
    { t: 0.14, rx: 0.09, ryTop: 0.14, ryBot: 0.12, yOffset: 0 },
    { t: 0.36, rx: 0.24, ryTop: 0.33, ryBot: 0.28, yOffset: 0.03 },
    { t: 0.58, rx: 0.34, ryTop: 0.41, ryBot: 0.34, yOffset: 0.04 },
    { t: 0.78, rx: 0.29, ryTop: 0.34, ryBot: 0.26, yOffset: 0.02 },
    { t: 0.87, rx: 0.17, ryTop: 0.22, ryBot: 0.14, yOffset: -0.02 }, // melon curve
    { t: 0.92, rx: 0.085, ryTop: 0.085, ryBot: 0.075, yOffset: -0.06 }, // rostrum base
    { t: 1.0, rx: 0.032, ryTop: 0.032, ryBot: 0.028, yOffset: -0.07 }, // rostrum tip
  ];
  const dolphinBodyGeo = buildLoftedBodyGeometry(dolphinStations, 24, 3.5);
  const dolphinFlukeGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -0.62, zCenter: -0.32, chord: 0.22, thickness: 0.028 },
      { spanPos: -0.25, zCenter: -0.14, chord: 0.32, thickness: 0.044 },
      { spanPos: 0.0, zCenter: -0.18, chord: 0.26, thickness: 0.052 },
      { spanPos: 0.25, zCenter: -0.14, chord: 0.32, thickness: 0.044 },
      { spanPos: 0.62, zCenter: -0.32, chord: 0.22, thickness: 0.028 },
    ],
    8
  );
  const dolphinDorsalGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.05, chord: 0.62, thickness: 0.045 },
      { spanPos: 0.25, zCenter: -0.12, chord: 0.40, thickness: 0.036 },
      { spanPos: 0.48, zCenter: -0.32, chord: 0.14, thickness: 0.018 },
    ],
    8
  );
  dolphinDorsalGeo.rotateZ(Math.PI / 2);

  const dolphinPecGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.36, thickness: 0.04 },
      { spanPos: 0.28, zCenter: -0.16, chord: 0.24, thickness: 0.028 },
      { spanPos: 0.56, zCenter: -0.34, chord: 0.09, thickness: 0.012 },
    ],
    8
  );

  disposablesGeo.push(dolphinBodyGeo, dolphinFlukeGeo, dolphinDorsalGeo, dolphinPecGeo);

  const dolphins: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.dolphinCount; i++) {
    const swimUniforms = { uTime: { value: 0 }, uSpeed: { value: 1 } };
    const dMat = new THREE.MeshStandardMaterial({
      map: dolphinTex,
      roughness: 0.18,
      metalness: 0.14,
    });
    applySoloSwimmerShader(dMat, swimUniforms, 3.5, 0.18, 4.8, true);
    disposablesMat.push(dMat);

    const root = new THREE.Group();
    const body = new THREE.Mesh(dolphinBodyGeo, dMat);
    const dorsal = new THREE.Mesh(dolphinDorsalGeo, dMat);
    dorsal.position.set(0, 0.37, 0.08);

    const pecL = new THREE.Mesh(dolphinPecGeo, dMat);
    pecL.position.set(0.26, -0.16, 0.45);
    pecL.rotation.set(0.14, -0.22, -0.46);
    const pecR = new THREE.Mesh(dolphinPecGeo, dMat);
    pecR.scale.x = -1;
    pecR.position.set(-0.26, -0.16, 0.45);
    pecR.rotation.set(0.14, 0.22, 0.46);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, -0.02, -1.68);
    tailPivot.add(new THREE.Mesh(dolphinFlukeGeo, dMat));

    const dEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const dEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    dEyeL.position.set(0.17, 0.05, 1.15);
    dEyeR.position.set(-0.17, 0.05, 1.15);

    root.add(body, dorsal, pecL, pecR, tailPivot, dEyeL, dEyeR);
    const sc = 0.86 + i * 0.09;
    root.scale.setScalar(sc);
    group.add(root);

    dolphins.push({
      kind: 'dolphin',
      root,
      tailPivot,
      swimUniforms,
      phase: i * 1.7,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 5. Sea Turtles (Keratin Scute Carapace + Cambered Swept Wing Flippers)
  // =========================================================================
  const turtleShellGeo = new THREE.SphereGeometry(0.84, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  turtleShellGeo.scale(0.92, 0.40, 1.24);
  const turtlePlastronGeo = new THREE.SphereGeometry(0.76, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  turtlePlastronGeo.scale(0.92, 0.24, 1.22);

  const turtleHeadStations: SpineStation[] = [
    { t: 0.0, rx: 0.14, ryTop: 0.13, ryBot: 0.11, yOffset: 0 },
    { t: 0.45, rx: 0.17, ryTop: 0.16, ryBot: 0.14, yOffset: 0.02 },
    { t: 0.80, rx: 0.14, ryTop: 0.13, ryBot: 0.11, yOffset: 0.01 },
    { t: 1.0, rx: 0.04, ryTop: 0.04, ryBot: 0.03, yOffset: -0.02 },
  ];
  const turtleHeadGeo = buildLoftedBodyGeometry(turtleHeadStations, 14, 0.58);

  // Curved swept hydrofoil wing flippers (ZERO BoxGeometry!)
  const turtleWingGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.34, thickness: 0.055 },
      { spanPos: 0.35, zCenter: -0.08, chord: 0.36, thickness: 0.045, offsetY: 0.02 },
      { spanPos: 0.72, zCenter: -0.26, chord: 0.24, thickness: 0.032, offsetY: 0.01 },
      { spanPos: 1.02, zCenter: -0.46, chord: 0.10, thickness: 0.016, offsetY: -0.01 },
    ],
    8
  );
  const turtleRearGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.22, thickness: 0.035 },
      { spanPos: 0.26, zCenter: -0.14, chord: 0.20, thickness: 0.024 },
      { spanPos: 0.44, zCenter: -0.26, chord: 0.09, thickness: 0.012 },
    ],
    6
  );

  const shellMat = new THREE.MeshStandardMaterial({
    map: turtleMap,
    bumpMap: turtleBump,
    bumpScale: 0.05,
    roughness: 0.54,
    metalness: 0.04,
  });
  const turtleSkinMat = new THREE.MeshStandardMaterial({
    color: '#496144',
    bumpMap: turtleBump,
    bumpScale: 0.02,
    roughness: 0.52,
    metalness: 0.04,
  });
  disposablesGeo.push(turtleShellGeo, turtlePlastronGeo, turtleHeadGeo, turtleWingGeo, turtleRearGeo);
  disposablesMat.push(shellMat, turtleSkinMat);

  const turtles: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.turtleCount; i++) {
    const root = new THREE.Group();
    const shell = new THREE.Mesh(turtleShellGeo, shellMat);
    const belly = new THREE.Mesh(turtlePlastronGeo, turtleSkinMat);
    const head = new THREE.Mesh(turtleHeadGeo, turtleSkinMat);
    head.position.set(0, 0.03, 1.12);

    const tEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const tEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    tEyeL.position.set(0.11, 0.07, 1.26);
    tEyeR.position.set(-0.11, 0.07, 1.26);

    const leftFlipper = new THREE.Group();
    leftFlipper.position.set(0.56, -0.03, 0.52);
    const ffL = new THREE.Mesh(turtleWingGeo, turtleSkinMat);
    leftFlipper.add(ffL);

    const rightFlipper = new THREE.Group();
    rightFlipper.position.set(-0.56, -0.03, 0.52);
    const ffR = new THREE.Mesh(turtleWingGeo, turtleSkinMat);
    ffR.scale.x = -1;
    rightFlipper.add(ffR);

    const rfL = new THREE.Mesh(turtleRearGeo, turtleSkinMat);
    rfL.position.set(0.32, -0.06, -0.82);
    rfL.rotation.y = -0.78;
    const rfR = new THREE.Mesh(turtleRearGeo, turtleSkinMat);
    rfR.scale.x = -1;
    rfR.position.set(-0.32, -0.06, -0.82);
    rfR.rotation.y = 0.78;

    root.add(shell, belly, head, tEyeL, tEyeR, leftFlipper, rightFlipper, rfL, rfR);
    const sc = 1.05 + i * 0.18;
    root.scale.setScalar(sc);
    group.add(root);

    turtles.push({
      kind: 'turtle',
      root,
      leftFlipper,
      rightFlipper,
      phase: i * 2.4,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 6. Bioluminescent Medusa Jellyfish (Double Dome + Lacy Oral Arms + 8 Filaments)
  // =========================================================================
  const outerBellGeo = new THREE.SphereGeometry(0.66, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const innerBellGeo = new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const tentacleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, -0.62, 0.04),
    new THREE.Vector3(-0.08, -1.32, -0.05),
    new THREE.Vector3(0.07, -2.05, 0.04),
  ]);
  const filamentGeo = new THREE.TubeGeometry(tentacleCurve, 18, 0.013, 6, false);
  const oralCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.11, -0.45, 0.06),
    new THREE.Vector3(-0.09, -0.95, -0.08),
    new THREE.Vector3(0.08, -1.35, 0.05),
  ]);
  const oralArmGeo = new THREE.TubeGeometry(oralCurve, 14, 0.036, 6, false);
  disposablesGeo.push(outerBellGeo, innerBellGeo, filamentGeo, oralArmGeo);

  const jellyColors = ['#54b4d3', '#8b7ec8', '#48a89d', '#b87098'];
  const jellies: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.jellyCount; i++) {
    const tint = jellyColors[i % jellyColors.length];
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.25,
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: 0.58,
      transmission: tier.isSoftwareGl ? 0 : 0.45,
      side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: '#e0f7ff',
      emissive: tint,
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.72,
      roughness: 0.28,
    });
    disposablesMat.push(outerMat, innerMat);

    const root = new THREE.Group();
    const bellGroup = new THREE.Group();
    const outerBell = new THREE.Mesh(outerBellGeo, outerMat);
    const innerBell = new THREE.Mesh(innerBellGeo, innerMat);
    innerBell.position.y = -0.04;
    bellGroup.add(outerBell, innerBell);
    root.add(bellGroup);

    const tentacles: THREE.Object3D[] = [];
    for (let o = 0; o < 4; o++) {
      const ang = (o / 4) * Math.PI * 2;
      const oral = new THREE.Mesh(oralArmGeo, innerMat);
      oral.position.set(Math.cos(ang) * 0.12, -0.06, Math.sin(ang) * 0.12);
      oral.rotation.y = ang;
      root.add(oral);
      tentacles.push(oral);
    }
    for (let t = 0; t < 8; t++) {
      const ang = (t / 8) * Math.PI * 2;
      const fil = new THREE.Mesh(filamentGeo, outerMat);
      fil.position.set(Math.cos(ang) * 0.36, -0.02, Math.sin(ang) * 0.36);
      fil.rotation.y = ang;
      root.add(fil);
      tentacles.push(fil);
    }

    const sc = 0.68 + (i % 3) * 0.2;
    root.scale.setScalar(sc);
    group.add(root);

    jellies.push({
      kind: 'jelly',
      root,
      bellMesh: bellGroup,
      tentacles,
      phase: i * 1.17,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 7. Sharks (Anatomical Lofted Torso + Heterocercal Tail + Hydrofoil Fins)
  // =========================================================================
  const sharkStations: SpineStation[] = [
    { t: 0.0, rx: 0.055, ryTop: 0.075, ryBot: 0.075, yOffset: 0 },
    { t: 0.14, rx: 0.13, ryTop: 0.18, ryBot: 0.15, yOffset: 0 },
    { t: 0.38, rx: 0.33, ryTop: 0.42, ryBot: 0.32, yOffset: 0.02 },
    { t: 0.62, rx: 0.46, ryTop: 0.52, ryBot: 0.38, yOffset: 0.04 },
    { t: 0.80, rx: 0.40, ryTop: 0.40, ryBot: 0.28, yOffset: 0.03 },
    { t: 0.93, rx: 0.24, ryTop: 0.20, ryBot: 0.12, yOffset: 0.02 },
    { t: 1.0, rx: 0.045, ryTop: 0.045, ryBot: 0.028, yOffset: 0.01 },
  ];
  const sharkBodyGeo = buildLoftedBodyGeometry(sharkStations, 24, 4.5);

  const sharkDorsalGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.05, chord: 0.92, thickness: 0.065 },
      { spanPos: 0.45, zCenter: -0.18, chord: 0.56, thickness: 0.045 },
      { spanPos: 0.95, zCenter: -0.48, chord: 0.16, thickness: 0.02 },
    ],
    8
  );
  sharkDorsalGeo.rotateZ(Math.PI / 2);

  // Asymmetric heterocercal shark caudal fin (tall swept upper lobe, shorter lower lobe)
  const sharkTailGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -0.62, zCenter: -0.65, chord: 0.22, thickness: 0.028 },
      { spanPos: -0.22, zCenter: -0.32, chord: 0.32, thickness: 0.045 },
      { spanPos: 0.0, zCenter: -0.18, chord: 0.38, thickness: 0.065 },
      { spanPos: 0.55, zCenter: -0.62, chord: 0.40, thickness: 0.045 },
      { spanPos: 1.08, zCenter: -1.16, chord: 0.18, thickness: 0.022 },
    ],
    8
  );
  sharkTailGeo.rotateZ(Math.PI / 2);

  const sharkPecGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 0.58, thickness: 0.058 },
      { spanPos: 0.52, zCenter: -0.24, chord: 0.38, thickness: 0.04 },
      { spanPos: 1.04, zCenter: -0.58, chord: 0.12, thickness: 0.015 },
    ],
    8
  );
  disposablesGeo.push(sharkBodyGeo, sharkDorsalGeo, sharkTailGeo, sharkPecGeo);

  const sharks: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.sharkCount; i++) {
    const swimUniforms = { uTime: { value: 0 }, uSpeed: { value: 1 } };
    const sMat = new THREE.MeshStandardMaterial({
      map: sharkTex,
      roughness: 0.32,
      metalness: 0.12,
    });
    applySoloSwimmerShader(sMat, swimUniforms, 4.5, 0.24, 3.2, false);
    disposablesMat.push(sMat);

    const root = new THREE.Group();
    const body = new THREE.Mesh(sharkBodyGeo, sMat);
    const dorsal = new THREE.Mesh(sharkDorsalGeo, sMat);
    dorsal.position.set(0, 0.44, 0.18);

    const pecL = new THREE.Mesh(sharkPecGeo, sMat);
    pecL.position.set(0.36, -0.24, 0.55);
    pecL.rotation.set(0.12, -0.25, -0.32);
    const pecR = new THREE.Mesh(sharkPecGeo, sMat);
    pecR.scale.x = -1;
    pecR.position.set(-0.36, -0.24, 0.55);
    pecR.rotation.set(0.12, 0.25, 0.32);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.02, -2.18);
    tailPivot.add(new THREE.Mesh(sharkTailGeo, sMat));

    const sEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const sEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    sEyeL.scale.setScalar(1.45);
    sEyeR.scale.setScalar(1.45);
    sEyeL.position.set(0.24, 0.06, 1.56);
    sEyeR.position.set(-0.24, 0.06, 1.56);

    root.add(body, dorsal, pecL, pecR, tailPivot, sEyeL, sEyeR);
    const sc = 1.05 + i * 0.22;
    root.scale.setScalar(sc);
    group.add(root);

    sharks.push({
      kind: 'shark',
      root,
      tailPivot,
      swimUniforms,
      phase: i * 1.9,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 8. Humpback Whale (Anatomical Baleen Torso + Long Scalloped Hydrofoil Wings)
  // =========================================================================
  const whaleStations: SpineStation[] = [
    { t: 0.0, rx: 0.14, ryTop: 0.18, ryBot: 0.18, yOffset: 0 },
    { t: 0.15, rx: 0.36, ryTop: 0.46, ryBot: 0.42, yOffset: 0 },
    { t: 0.38, rx: 0.92, ryTop: 1.06, ryBot: 0.88, yOffset: 0.08 },
    { t: 0.62, rx: 1.38, ryTop: 1.28, ryBot: 1.35, yOffset: 0.06 },
    { t: 0.82, rx: 1.34, ryTop: 0.96, ryBot: 1.18, yOffset: 0 },
    { t: 0.94, rx: 0.88, ryTop: 0.48, ryBot: 0.62, yOffset: -0.05 },
    { t: 1.0, rx: 0.32, ryTop: 0.14, ryBot: 0.20, yOffset: -0.08 },
  ];
  const whaleBodyGeo = buildLoftedBodyGeometry(whaleStations, 28, 13.5);

  const whalePecGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: 0.0, zCenter: 0.0, chord: 1.25, thickness: 0.14 },
      { spanPos: 1.35, zCenter: -0.45, chord: 1.05, thickness: 0.11 },
      { spanPos: 2.85, zCenter: -1.18, chord: 0.68, thickness: 0.075 },
      { spanPos: 4.15, zCenter: -1.92, chord: 0.26, thickness: 0.032 },
    ],
    8
  );

  const whaleFlukeGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -2.05, zCenter: -0.92, chord: 0.56, thickness: 0.065 },
      { spanPos: -0.85, zCenter: -0.35, chord: 0.92, thickness: 0.11 },
      { spanPos: 0.0, zCenter: -0.42, chord: 0.72, thickness: 0.13 },
      { spanPos: 0.85, zCenter: -0.35, chord: 0.92, thickness: 0.11 },
      { spanPos: 2.05, zCenter: -0.92, chord: 0.56, thickness: 0.065 },
    ],
    8
  );

  const whaleSwimUniforms = { uTime: { value: 0 }, uSpeed: { value: 1 } };
  const whaleMat = new THREE.MeshStandardMaterial({
    map: whaleTex,
    roughness: 0.46,
    metalness: 0.06,
  });
  applySoloSwimmerShader(whaleMat, whaleSwimUniforms, 13.5, 0.42, 1.15, true);
  disposablesGeo.push(whaleBodyGeo, whalePecGeo, whaleFlukeGeo);
  disposablesMat.push(whaleMat);

  const whaleRoot = new THREE.Group();
  const whaleBody = new THREE.Mesh(whaleBodyGeo, whaleMat);
  const wPecL = new THREE.Mesh(whalePecGeo, whaleMat);
  wPecL.position.set(1.05, -0.42, 2.2);
  wPecL.rotation.set(0.1, -0.35, -0.26);
  const wPecR = new THREE.Mesh(whalePecGeo, whaleMat);
  wPecR.scale.x = -1;
  wPecR.position.set(-1.05, -0.42, 2.2);
  wPecR.rotation.set(0.1, 0.35, 0.26);

  const whaleTailPivot = new THREE.Group();
  whaleTailPivot.position.set(0, 0, -6.55);
  whaleTailPivot.add(new THREE.Mesh(whaleFlukeGeo, whaleMat));
  whaleRoot.add(whaleBody, wPecL, wPecR, whaleTailPivot);
  whaleRoot.scale.setScalar(1.32);
  group.add(whaleRoot);

  const whale: ArticulatedCreatureRig = {
    kind: 'whale',
    root: whaleRoot,
    tailPivot: whaleTailPivot,
    swimUniforms: whaleSwimUniforms,
    phase: 0.4,
    baseScale: 1.32,
  };

  // =========================================================================
  // 9. Manta Rays (Sculpted Wing Span + Curled Cephalic Lobes + Whip Tail)
  // =========================================================================
  const mantaGeo = buildHydrofoilFinGeometry(
    [
      { spanPos: -2.15, zCenter: -0.68, chord: 0.26, thickness: 0.03 },
      { spanPos: -1.45, zCenter: -0.28, chord: 0.85, thickness: 0.075 },
      { spanPos: -0.75, zCenter: 0.08, chord: 1.38, thickness: 0.16 },
      { spanPos: 0.0, zCenter: 0.18, chord: 1.68, thickness: 0.30 },
      { spanPos: 0.75, zCenter: 0.08, chord: 1.38, thickness: 0.16 },
      { spanPos: 1.45, zCenter: -0.28, chord: 0.85, thickness: 0.075 },
      { spanPos: 2.15, zCenter: -0.68, chord: 0.26, thickness: 0.03 },
    ],
    12
  );
  const cephalicCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, -0.02, 0.22),
    new THREE.Vector3(0.02, -0.08, 0.42),
  ]);
  const cephalicGeo = new THREE.TubeGeometry(cephalicCurve, 8, 0.048, 6, false);
  const mantaTailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.01, -0.66),
    new THREE.Vector3(0, -0.04, -1.9),
    new THREE.Vector3(0, 0.02, -3.25),
  ]);
  const mantaTailGeo = new THREE.TubeGeometry(mantaTailCurve, 12, 0.024, 6, false);
  disposablesGeo.push(mantaGeo, cephalicGeo, mantaTailGeo);

  const mantas: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.mantaCount; i++) {
    const wingUniforms = { uTime: { value: 0 }, uPhase: { value: i * 2.1 } };
    const mMat = new THREE.MeshStandardMaterial({
      map: mantaTex,
      roughness: 0.36,
      metalness: 0.12,
    });
    mMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wingUniforms.uTime;
      shader.uniforms.uPhase = wingUniforms.uPhase;
      shader.vertexShader =
        `uniform float uTime;\nuniform float uPhase;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wingSpan = abs(position.x) / 2.15;
          float flap = sin(uTime * 2.1 + uPhase - wingSpan * 2.1) * pow(wingSpan, 1.25) * 0.68;
          transformed.y += flap;`
        );
    };
    disposablesMat.push(mMat);

    const root = new THREE.Group();
    const wings = new THREE.Mesh(mantaGeo, mMat);
    const tail = new THREE.Mesh(mantaTailGeo, mMat);
    const hornL = new THREE.Mesh(cephalicGeo, mMat);
    hornL.position.set(0.26, -0.02, 0.84);
    const hornR = new THREE.Mesh(cephalicGeo, mMat);
    hornR.scale.x = -1;
    hornR.position.set(-0.26, -0.02, 0.84);

    root.add(wings, tail, hornL, hornR);
    const sc = 0.95 + i * 0.25;
    root.scale.setScalar(sc);
    group.add(root);

    mantas.push({
      kind: 'manta',
      root,
      wingUniforms,
      phase: i * 2.1,
      baseScale: sc,
    });
  }

  // =========================================================================
  // 10. Reef Octopus (Smooth Muscular Mantle + 8 Tapered Sinusoidal Arms)
  // =========================================================================
  const octoMantleGeo = new THREE.SphereGeometry(0.4, 18, 14);
  octoMantleGeo.scale(0.84, 1.38, 0.92);
  const octoArmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.32, -0.34, 0.12),
    new THREE.Vector3(0.64, -0.76, -0.08),
    new THREE.Vector3(0.92, -1.06, 0.15),
  ]);
  const octoArmGeo = new THREE.TubeGeometry(octoArmCurve, 14, 0.068, 8, false);
  // Taper octopus arm tip naturally
  const oPos = octoArmGeo.attributes.position as THREE.BufferAttribute;
  const oUv = octoArmGeo.attributes.uv as THREE.BufferAttribute;
  const oTmp = new THREE.Vector3();
  for (let i = 0; i < oPos.count; i++) {
    const t = Math.min(1, Math.max(0, oUv.getX(i)));
    octoArmCurve.getPointAt(t, oTmp);
    const taper = 1 - t * 0.85;
    oPos.setXYZ(
      i,
      oTmp.x + (oPos.getX(i) - oTmp.x) * taper,
      oTmp.y + (oPos.getY(i) - oTmp.y) * taper,
      oTmp.z + (oPos.getZ(i) - oTmp.z) * taper
    );
  }
  octoArmGeo.computeVertexNormals();

  const octoMat = new THREE.MeshStandardMaterial({
    color: '#8e454e',
    roughness: 0.42,
    metalness: 0.04,
  });
  disposablesGeo.push(octoMantleGeo, octoArmGeo);
  disposablesMat.push(octoMat);

  const octoRoot = new THREE.Group();
  const octoHead = new THREE.Mesh(octoMantleGeo, octoMat);
  octoHead.position.y = 0.28;
  octoHead.rotation.x = -0.24;
  const oEyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const oEyeR = new THREE.Mesh(eyeGeo, eyeMat);
  oEyeL.position.set(0.22, 0.14, 0.32);
  oEyeR.position.set(-0.22, 0.14, 0.32);
  octoRoot.add(octoHead, oEyeL, oEyeR);

  const armSegments: THREE.Object3D[] = [];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const armPivot = new THREE.Group();
    armPivot.rotation.y = ang;
    const armMesh = new THREE.Mesh(octoArmGeo, octoMat);
    armMesh.position.set(0.16, -0.05, 0);
    armPivot.add(armMesh);
    octoRoot.add(armPivot);
    armSegments.push(armPivot);
  }
  octoRoot.scale.setScalar(1.0);
  group.add(octoRoot);

  const octopus: ArticulatedCreatureRig = {
    kind: 'octopus',
    root: octoRoot,
    armSegments,
    phase: 0.8,
    baseScale: 1.0,
  };

  const animateRig = (rig: ArticulatedCreatureRig, elapsed: number, speedFactor: number) => {
    if (rig.swimUniforms) {
      rig.swimUniforms.uTime.value = elapsed;
      rig.swimUniforms.uSpeed.value = 0.85 + speedFactor * 0.65;
    }

    const t = elapsed * (0.9 + speedFactor * 1.15) + rig.phase;
    switch (rig.kind) {
      case 'pelagic':
        if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(t * 7.5) * 0.42;
        break;
      case 'shark':
        if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(t * 3.2) * 0.32;
        break;
      case 'dolphin':
        if (rig.tailPivot) rig.tailPivot.rotation.x = Math.sin(t * 4.8) * 0.34;
        break;
      case 'whale':
        if (rig.tailPivot) rig.tailPivot.rotation.x = Math.sin(elapsed * 1.15 + rig.phase) * 0.22;
        break;
      case 'turtle':
        if (rig.leftFlipper && rig.rightFlipper) {
          const stroke = Math.sin(elapsed * 2.05 + rig.phase);
          const feather = Math.cos(elapsed * 2.05 + rig.phase);
          rig.leftFlipper.rotation.z = stroke * 0.54;
          rig.leftFlipper.rotation.x = feather * 0.24;
          rig.rightFlipper.rotation.z = -stroke * 0.54;
          rig.rightFlipper.rotation.x = feather * 0.24;
        }
        break;
      case 'jelly':
        if (rig.bellMesh) {
          const pulse = Math.sin(elapsed * 2.05 + rig.phase);
          const bellR = 1 + pulse * 0.14;
          const bellH = 1 - pulse * 0.11;
          rig.bellMesh.scale.set(bellR, bellH, bellR);
        }
        if (rig.tentacles) {
          for (let i = 0; i < rig.tentacles.length; i++) {
            const tent = rig.tentacles[i];
            tent.rotation.x = Math.sin(elapsed * 1.7 + rig.phase + i * 0.65) * 0.13;
            tent.rotation.z = Math.cos(elapsed * 1.45 + rig.phase + i * 0.85) * 0.11;
          }
        }
        break;
      case 'manta':
        if (rig.wingUniforms) rig.wingUniforms.uTime.value = elapsed;
        break;
      case 'octopus':
        if (rig.armSegments) {
          for (let i = 0; i < rig.armSegments.length; i++) {
            const arm = rig.armSegments[i];
            arm.rotation.z = Math.sin(elapsed * 2.5 + i * 0.8) * 0.2;
            arm.rotation.x = Math.cos(elapsed * 2.0 + i * 0.6) * 0.13;
          }
        }
        break;
    }
  };

  return {
    group,
    baitfishInst,
    tropicalInst,
    baitfishPhases,
    tropicalPhases,
    baitfishTimeUniform,
    tropicalTimeUniform,
    pelagics,
    dolphins,
    turtles,
    sharks,
    whale,
    mantas,
    jellies,
    octopus,
    animateRig,
    dispose: () => {
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
      for (const t of disposablesTex) t.dispose();
    },
  };
}
