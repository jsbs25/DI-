import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/**
 * Safely merges non-indexed/indexed BufferGeometries by converting each to non-indexed
 * with clean normals and UVs so mergeGeometries never fails.
 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((g) => {
    const clean = g.index ? g.toNonIndexed() : g.clone();
    if (!clean.attributes.normal) clean.computeVertexNormals();
    if (!clean.attributes.uv) {
      const count = clean.attributes.position.count;
      clean.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    // Strip unexpected extra attributes before merge
    for (const key of Object.keys(clean.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        clean.deleteAttribute(key);
      }
    }
    return clean;
  });
  const merged = mergeGeometries(normalized, false);
  for (const c of normalized) c.dispose();
  if (!merged) {
    return new THREE.SphereGeometry(0.3, 8, 8);
  }
  merged.computeVertexNormals();
  return merged;
}

function createFishFlankTexture(
  topColor: string,
  midColor: string,
  bellyColor: string,
  stripeColor?: string
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0.0, topColor);
    grad.addColorStop(0.48, midColor);
    grad.addColorStop(1.0, bellyColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);

    if (stripeColor) {
      ctx.fillStyle = stripeColor;
      for (let x = 18; x < 110; x += 22) {
        ctx.fillRect(x, 4, 8, 54);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createTurtleShellTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#334d37';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#c8a96e';
    ctx.lineWidth = 4;
    for (let y = 16; y < 128; y += 32) {
      for (let x = 16; x < 128; x += 32) {
        ctx.fillStyle = (x + y) % 64 === 0 ? '#4e693e' : '#3b573b';
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds streamlined fish geometry oriented strictly with +Z nose and -Z tail.
 */
function buildStreamlinedFishGeo(
  len: number,
  height: number,
  width: number,
  tallProfile = false
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Torso sculpted from sphere
  const body = new THREE.SphereGeometry(0.5, 14, 10);
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i); // +0.5 nose, -0.5 tail
    const t = z + 0.5; // 0 tail .. 1 nose
    const taper = t < 0.55 ? Math.pow(t / 0.55, 0.72) : Math.sin(((1 - t) / 0.45) * (Math.PI * 0.5));
    const finalW = Math.max(0.06, taper) * width;
    const finalH = Math.max(0.08, tallProfile ? Math.pow(taper, 0.55) : taper) * height;
    pos.setXYZ(i, x * finalW, y * finalH, z * len);
  }
  parts.push(body);

  // Forked caudal fin at tail (-Z)
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0.04 * height);
  tailShape.lineTo(-0.34 * len, 0.48 * height);
  tailShape.lineTo(-0.22 * len, 0.0);
  tailShape.lineTo(-0.34 * len, -0.48 * height);
  tailShape.lineTo(0, -0.04 * height);
  tailShape.closePath();

  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.015, bevelEnabled: false });
  tailGeo.rotateY(-Math.PI / 2);
  tailGeo.translate(0.0075, 0, -len * 0.44);
  parts.push(tailGeo);

  // Dorsal fin
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.1 * len, 0);
  dorsalShape.lineTo(-0.08 * len, (tallProfile ? 0.55 : 0.34) * height);
  dorsalShape.lineTo(-0.22 * len, 0);
  dorsalShape.closePath();
  const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.012, bevelEnabled: false });
  dorsalGeo.rotateY(-Math.PI / 2);
  dorsalGeo.translate(0.006, height * 0.34, 0);
  parts.push(dorsalGeo);

  const merged = mergeParts(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Adds GPU tail-undulation wave along Z axis (nose at +Z rigid, tail at -Z sways smoothly).
 */
function applyFishSwimShader(
  mat: THREE.MeshStandardMaterial,
  timeUniform: { value: number },
  tailSpan: number,
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
        float tailWeight = clamp((0.18 * ${tailSpan.toFixed(2)} - position.z) / ${tailSpan.toFixed(2)}, 0.0, 1.0);
        float swimWave = sin(uSwimTime * ${freq.toFixed(2)} + aSwimPhase + position.z * 5.2);
        transformed.x += swimWave * pow(tailWeight, 1.35) * ${amp.toFixed(3)};`
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
  const baitTex = createFishFlankTexture('#1f5a78', '#8ad2f2', '#e3f7ff');
  const tropTex = createFishFlankTexture('#0e7490', '#f59e0b', '#fef3c7', 'rgba(15, 23, 42, 0.55)');
  const sharkTex = createFishFlankTexture('#1d3548', '#48677e', '#cfdce6');
  const whaleTex = createFishFlankTexture('#0e1f33', '#1d3a57', '#7b97ad');
  const dolphinTex = createFishFlankTexture('#294b6b', '#5f89ab', '#dcebf5');
  const turtleTex = createTurtleShellTexture();
  const mantaTex = createFishFlankTexture('#0c1c2e', '#1a3852', '#c8e4f4');
  disposablesTex.push(baitTex, tropTex, sharkTex, whaleTex, dolphinTex, turtleTex, mantaTex);

  // 1. Baitfish Boids School (InstancedMesh)
  const baitGeo = buildStreamlinedFishGeo(0.56, 0.16, 0.1, false);
  const baitfishPhases = new Float32Array(tier.baitfishCount);
  for (let i = 0; i < tier.baitfishCount; i++) baitfishPhases[i] = Math.random() * Math.PI * 2;
  baitGeo.setAttribute('aSwimPhase', new THREE.InstancedBufferAttribute(baitfishPhases, 1));
  disposablesGeo.push(baitGeo);

  const baitMat = new THREE.MeshStandardMaterial({
    map: baitTex,
    roughness: 0.25,
    metalness: 0.55,
    color: '#d9f4ff',
  });
  applyFishSwimShader(baitMat, baitfishTimeUniform, 0.56, 0.085, 8.2);
  disposablesMat.push(baitMat);

  const baitfishInst = new THREE.InstancedMesh(baitGeo, baitMat, tier.baitfishCount);
  baitfishInst.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < tier.baitfishCount; i++) {
    col.setHSL(0.54 + (Math.random() - 0.5) * 0.05, 0.65, 0.68 + Math.random() * 0.18);
    baitfishInst.setColorAt(i, col);
  }
  if (baitfishInst.instanceColor) baitfishInst.instanceColor.needsUpdate = true;
  group.add(baitfishInst);

  // 2. Tropical Reef Fish School (InstancedMesh)
  const tropGeo = buildStreamlinedFishGeo(0.72, 0.42, 0.14, true);
  const tropicalPhases = new Float32Array(tier.tropicalCount);
  for (let i = 0; i < tier.tropicalCount; i++) tropicalPhases[i] = Math.random() * Math.PI * 2;
  tropGeo.setAttribute('aSwimPhase', new THREE.InstancedBufferAttribute(tropicalPhases, 1));
  disposablesGeo.push(tropGeo);

  const tropMat = new THREE.MeshStandardMaterial({
    map: tropTex,
    roughness: 0.36,
    metalness: 0.2,
    color: '#ffffff',
  });
  applyFishSwimShader(tropMat, tropicalTimeUniform, 0.72, 0.11, 7.0);
  disposablesMat.push(tropMat);

  const tropicalInst = new THREE.InstancedMesh(tropGeo, tropMat, tier.tropicalCount);
  tropicalInst.frustumCulled = false;
  const tropColors = ['#ff8a4c', '#ffd166', '#22d3ee', '#fb7185', '#a78bfa', '#34d399'];
  for (let i = 0; i < tier.tropicalCount; i++) {
    col.set(tropColors[i % tropColors.length]);
    tropicalInst.setColorAt(i, col);
  }
  if (tropicalInst.instanceColor) tropicalInst.instanceColor.needsUpdate = true;
  group.add(tropicalInst);

  // 3. Hero Pelagic Fish (articulated tail so speed surges cleanly when charging screen)
  const pelagicBodyGeo = new THREE.SphereGeometry(0.5, 16, 12);
  const pb = pelagicBodyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pb.count; i++) {
    const x = pb.getX(i);
    const y = pb.getY(i);
    const z = pb.getZ(i);
    const t = z + 0.5;
    const taper = Math.sin(Math.pow(t, 0.75) * Math.PI);
    pb.setXYZ(i, x * taper * 0.42, y * taper * 0.58, z * 1.9);
  }
  pelagicBodyGeo.computeVertexNormals();

  const pelagicTailShape = new THREE.Shape();
  pelagicTailShape.moveTo(0, 0.06);
  pelagicTailShape.lineTo(-0.62, 0.46);
  pelagicTailShape.lineTo(-0.34, 0);
  pelagicTailShape.lineTo(-0.62, -0.46);
  pelagicTailShape.lineTo(0, -0.06);
  pelagicTailShape.closePath();
  const pelagicTailGeo = new THREE.ExtrudeGeometry(pelagicTailShape, { depth: 0.025, bevelEnabled: false });
  pelagicTailGeo.rotateY(-Math.PI / 2);
  pelagicTailGeo.translate(0.0125, 0, 0);

  const pelagicDorsalShape = new THREE.Shape();
  pelagicDorsalShape.moveTo(0.25, 0);
  pelagicDorsalShape.lineTo(-0.1, 0.36);
  pelagicDorsalShape.lineTo(-0.28, 0);
  pelagicDorsalShape.closePath();
  const pelagicDorsalGeo = new THREE.ExtrudeGeometry(pelagicDorsalShape, { depth: 0.02, bevelEnabled: false });
  pelagicDorsalGeo.rotateY(-Math.PI / 2);

  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#05080f', roughness: 0.1, metalness: 0.2 });
  const pelagicMat = new THREE.MeshStandardMaterial({
    map: baitTex,
    color: '#7dd3fc',
    roughness: 0.26,
    metalness: 0.45,
  });
  disposablesGeo.push(pelagicBodyGeo, pelagicTailGeo, pelagicDorsalGeo, eyeGeo);
  disposablesMat.push(eyeMat, pelagicMat);

  const pelagics: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.pelagicCount; i++) {
    const root = new THREE.Group();
    const bodyMesh = new THREE.Mesh(pelagicBodyGeo, pelagicMat);
    const dorsal = new THREE.Mesh(pelagicDorsalGeo, pelagicMat);
    dorsal.position.set(0.01, 0.22, 0.05);
    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    const eR = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(0.14, 0.06, 0.65);
    eR.position.set(-0.14, 0.06, 0.65);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.78);
    const tailMesh = new THREE.Mesh(pelagicTailGeo, pelagicMat);
    tailPivot.add(tailMesh);

    root.add(bodyMesh, dorsal, eL, eR, tailPivot);
    const sc = 0.85 + (i % 3) * 0.24;
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

  // 4. Dolphins (Pod of 3 with vertical pitching fluke & sleek rostrum)
  const dolphinBodyGeo = new THREE.SphereGeometry(0.5, 20, 14);
  const dp = dolphinBodyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i);
    const y = dp.getY(i);
    const z = dp.getZ(i); // +0.5 nose .. -0.5 tail
    const t = z + 0.5;
    let rad = Math.sin(Math.pow(t, 0.7) * Math.PI) * 0.52;
    if (t > 0.84) rad *= 0.42; // beak rostrum pinch
    dp.setXYZ(i, x * rad * 1.65, y * rad * 1.78, z * 3.6);
  }
  dolphinBodyGeo.computeVertexNormals();

  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, 0.08);
  flukeShape.lineTo(0.68, -0.35);
  flukeShape.lineTo(0.12, -0.18);
  flukeShape.lineTo(0, -0.26);
  flukeShape.lineTo(-0.12, -0.18);
  flukeShape.lineTo(-0.68, -0.35);
  flukeShape.closePath();
  const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, { depth: 0.04, bevelEnabled: false });
  flukeGeo.rotateX(Math.PI / 2);

  const dolphinDorsal = new THREE.ExtrudeGeometry(
    (() => {
      const s = new THREE.Shape();
      s.moveTo(0.32, 0);
      s.lineTo(-0.22, 0.58);
      s.lineTo(-0.18, 0);
      s.closePath();
      return s;
    })(),
    { depth: 0.035, bevelEnabled: false }
  );
  dolphinDorsal.rotateY(-Math.PI / 2);

  const dolphinPec = new THREE.ConeGeometry(0.16, 0.65, 6);
  dolphinPec.rotateZ(Math.PI / 2);

  const dolphinMat = new THREE.MeshStandardMaterial({
    map: dolphinTex,
    roughness: 0.24,
    metalness: 0.12,
  });
  disposablesGeo.push(dolphinBodyGeo, flukeGeo, dolphinDorsal, dolphinPec);
  disposablesMat.push(dolphinMat);

  const dolphins: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.dolphinCount; i++) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(dolphinBodyGeo, dolphinMat);
    const dorsal = new THREE.Mesh(dolphinDorsal, dolphinMat);
    dorsal.position.set(0.017, 0.34, 0.05);

    const pecL = new THREE.Mesh(dolphinPec, dolphinMat);
    pecL.position.set(0.45, -0.16, 0.45);
    pecL.rotation.set(0.2, -0.45, -0.45);
    const pecR = new THREE.Mesh(dolphinPec, dolphinMat);
    pecR.position.set(-0.45, -0.16, 0.45);
    pecR.rotation.set(0.2, 0.45, 0.45 + Math.PI);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -1.55);
    const fluke = new THREE.Mesh(flukeGeo, dolphinMat);
    tailPivot.add(fluke);

    const dEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const dEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    dEyeL.position.set(0.24, 0.1, 1.05);
    dEyeR.position.set(-0.24, 0.1, 1.05);

    root.add(body, dorsal, pecL, pecR, tailPivot, dEyeL, dEyeR);
    const sc = 0.85 + i * 0.1;
    root.scale.setScalar(sc);
    group.add(root);

    dolphins.push({
      kind: 'dolphin',
      root,
      tailPivot,
      phase: i * 1.7,
      baseScale: sc,
    });
  }

  // 5. Sea Turtles (Carapace + Scute texture + Sweeping Front Wing Flippers)
  const shellGeo = new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
  shellGeo.scale(0.95, 0.44, 1.24);
  const plastronGeo = new THREE.CylinderGeometry(0.7, 0.6, 0.14, 14);
  plastronGeo.scale(0.95, 1, 1.2);
  const turtleHeadGeo = new THREE.SphereGeometry(0.24, 12, 10);
  turtleHeadGeo.scale(0.85, 0.8, 1.35);

  const frontFlipperGeo = new THREE.BoxGeometry(0.95, 0.06, 0.34);
  frontFlipperGeo.translate(0.47, 0, 0);
  const rearFlipperGeo = new THREE.BoxGeometry(0.42, 0.05, 0.24);
  rearFlipperGeo.translate(0.21, 0, 0);

  const shellMat = new THREE.MeshStandardMaterial({
    map: turtleTex,
    roughness: 0.62,
    metalness: 0.05,
  });
  const turtleSkinMat = new THREE.MeshStandardMaterial({
    color: '#4f7356',
    roughness: 0.55,
    metalness: 0.04,
  });
  disposablesGeo.push(shellGeo, plastronGeo, turtleHeadGeo, frontFlipperGeo, rearFlipperGeo);
  disposablesMat.push(shellMat, turtleSkinMat);

  const turtles: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.turtleCount; i++) {
    const root = new THREE.Group();
    const shell = new THREE.Mesh(shellGeo, shellMat);
    const belly = new THREE.Mesh(plastronGeo, turtleSkinMat);
    belly.position.set(0, -0.04, 0);
    const head = new THREE.Mesh(turtleHeadGeo, turtleSkinMat);
    head.position.set(0, 0.05, 1.15);

    const tEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const tEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    tEyeL.position.set(0.15, 0.1, 1.25);
    tEyeR.position.set(-0.15, 0.1, 1.25);

    const leftFlipper = new THREE.Group();
    leftFlipper.position.set(0.62, 0, 0.52);
    const ffL = new THREE.Mesh(frontFlipperGeo, turtleSkinMat);
    ffL.rotation.y = -0.35;
    leftFlipper.add(ffL);

    const rightFlipper = new THREE.Group();
    rightFlipper.position.set(-0.62, 0, 0.52);
    const ffR = new THREE.Mesh(frontFlipperGeo, turtleSkinMat);
    ffR.scale.x = -1;
    ffR.rotation.y = 0.35;
    rightFlipper.add(ffR);

    const rfL = new THREE.Mesh(rearFlipperGeo, turtleSkinMat);
    rfL.position.set(0.4, -0.05, -0.82);
    rfL.rotation.y = -0.9;
    const rfR = new THREE.Mesh(rearFlipperGeo, turtleSkinMat);
    rfR.scale.x = -1;
    rfR.position.set(-0.4, -0.05, -0.82);
    rfR.rotation.y = 0.9;

    root.add(shell, belly, head, tEyeL, tEyeR, leftFlipper, rightFlipper, rfL, rfR);
    const sc = 1.05 + i * 0.2;
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

  // 6. Bioluminescent Jellyfish (Physical Bell + 6 Undulating Tube Tentacles)
  const bellGeo = new THREE.SphereGeometry(0.65, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const bellMatPalette = ['#38bdf8', '#c084fc', '#2dd4bf', '#f472b6'];
  const jellyTentacleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, -0.55, 0.05),
    new THREE.Vector3(-0.06, -1.15, -0.05),
    new THREE.Vector3(0.09, -1.75, 0.06),
  ]);
  const jellyTentacleGeo = new THREE.TubeGeometry(jellyTentacleCurve, 14, 0.022, 6, false);
  const jellyCoreGeo = new THREE.SphereGeometry(0.24, 12, 10);
  disposablesGeo.push(bellGeo, jellyTentacleGeo, jellyCoreGeo);

  const jellies: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.jellyCount; i++) {
    const tint = bellMatPalette[i % bellMatPalette.length];
    const bellMat = new THREE.MeshPhysicalMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.45,
      roughness: 0.14,
      metalness: 0.04,
      transparent: true,
      opacity: 0.72,
      transmission: tier.isSoftwareGl ? 0 : 0.38,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: tint,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    disposablesMat.push(bellMat, coreMat);

    const root = new THREE.Group();
    const bellMesh = new THREE.Mesh(bellGeo, bellMat);
    const coreMesh = new THREE.Mesh(jellyCoreGeo, coreMat);
    coreMesh.position.y = -0.08;
    root.add(bellMesh, coreMesh);

    const tentacles: THREE.Object3D[] = [];
    for (let t = 0; t < 6; t++) {
      const ang = (t / 6) * Math.PI * 2;
      const tent = new THREE.Mesh(jellyTentacleGeo, coreMat);
      tent.position.set(Math.cos(ang) * 0.28, -0.02, Math.sin(ang) * 0.28);
      tent.rotation.y = ang;
      root.add(tent);
      tentacles.push(tent);
    }

    const sc = 0.65 + (i % 3) * 0.22;
    root.scale.setScalar(sc);
    group.add(root);

    jellies.push({
      kind: 'jelly',
      root,
      bellMesh,
      tentacles,
      phase: i * 1.13,
      baseScale: sc,
    });
  }

  // 7. Sharks (Patrolling in midground/background + fierce candidate for glass charge)
  const sharkFrontGeo = new THREE.SphereGeometry(0.55, 22, 16);
  const sp = sharkFrontGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const t = z + 0.5; // 0 rear .. 1 snout
    const profile = t > 0.45 ? Math.cos(((t - 0.45) / 0.55) * (Math.PI * 0.48)) : 0.65 + 0.35 * (t / 0.45);
    sp.setXYZ(i, x * profile * 1.15, y * profile * 1.08, z * 4.4);
  }
  sharkFrontGeo.computeVertexNormals();

  const sharkDorsalShape = new THREE.Shape();
  sharkDorsalShape.moveTo(0.45, 0);
  sharkDorsalShape.lineTo(-0.35, 1.15);
  sharkDorsalShape.lineTo(-0.12, 0);
  sharkDorsalShape.closePath();
  const sharkDorsalGeo = new THREE.ExtrudeGeometry(sharkDorsalShape, { depth: 0.05, bevelEnabled: false });
  sharkDorsalGeo.rotateY(-Math.PI / 2);

  const sharkTailShape = new THREE.Shape();
  sharkTailShape.moveTo(0, 0.24);
  sharkTailShape.lineTo(-1.35, 1.15);
  sharkTailShape.lineTo(-0.62, 0.05);
  sharkTailShape.lineTo(-0.98, -0.68);
  sharkTailShape.lineTo(0, -0.18);
  sharkTailShape.closePath();
  const sharkTailGeo = new THREE.ExtrudeGeometry(sharkTailShape, { depth: 0.05, bevelEnabled: false });
  sharkTailGeo.rotateY(-Math.PI / 2);

  const sharkPecGeo = new THREE.ConeGeometry(0.32, 1.25, 6);
  sharkPecGeo.rotateZ(Math.PI / 2);

  const sharkMat = new THREE.MeshStandardMaterial({
    map: sharkTex,
    roughness: 0.34,
    metalness: 0.14,
  });
  disposablesGeo.push(sharkFrontGeo, sharkDorsalGeo, sharkTailGeo, sharkPecGeo);
  disposablesMat.push(sharkMat);

  const sharks: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.sharkCount; i++) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(sharkFrontGeo, sharkMat);
    const dorsal = new THREE.Mesh(sharkDorsalGeo, sharkMat);
    dorsal.position.set(0.025, 0.44, 0.15);

    const pecL = new THREE.Mesh(sharkPecGeo, sharkMat);
    pecL.position.set(0.78, -0.25, 0.65);
    pecL.rotation.set(0.18, -0.45, -0.35);
    const pecR = new THREE.Mesh(sharkPecGeo, sharkMat);
    pecR.position.set(-0.78, -0.25, 0.65);
    pecR.rotation.set(0.18, 0.45, 0.35 + Math.PI);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -1.95);
    const tailFin = new THREE.Mesh(sharkTailGeo, sharkMat);
    tailPivot.add(tailFin);

    const sEyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const sEyeR = new THREE.Mesh(eyeGeo, eyeMat);
    sEyeL.scale.setScalar(1.6);
    sEyeR.scale.setScalar(1.6);
    sEyeL.position.set(0.32, 0.1, 1.55);
    sEyeR.position.set(-0.32, 0.1, 1.55);

    root.add(body, dorsal, pecL, pecR, tailPivot, sEyeL, sEyeR);
    const sc = 1.05 + i * 0.25;
    root.scale.setScalar(sc);
    group.add(root);

    sharks.push({
      kind: 'shark',
      root,
      tailPivot,
      phase: i * 1.9,
      baseScale: sc,
    });
  }

  // 8. Humpback Whale (Majestic distant silhouette gliding across the abyss)
  const whaleBodyGeo = new THREE.SphereGeometry(1.0, 24, 18);
  const wp = whaleBodyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i);
    const y = wp.getY(i);
    const z = wp.getZ(i);
    const t = z + 1.0; // 0 tail .. 2 head
    const swell = t > 1.2 ? Math.cos(((t - 1.2) / 0.8) * Math.PI * 0.48) : 0.22 + 0.78 * (t / 1.2);
    wp.setXYZ(i, x * swell * 1.45, y * swell * 1.28, z * 6.8);
  }
  whaleBodyGeo.computeVertexNormals();

  const whalePecGeo = new THREE.BoxGeometry(3.8, 0.14, 0.95);
  whalePecGeo.translate(1.9, 0, 0);
  const whaleFlukeGeo = new THREE.BoxGeometry(3.4, 0.12, 1.15);
  whaleFlukeGeo.translate(0, 0, -0.55);

  const whaleMat = new THREE.MeshStandardMaterial({
    map: whaleTex,
    roughness: 0.46,
    metalness: 0.08,
  });
  disposablesGeo.push(whaleBodyGeo, whalePecGeo, whaleFlukeGeo);
  disposablesMat.push(whaleMat);

  const whaleRoot = new THREE.Group();
  const whaleBody = new THREE.Mesh(whaleBodyGeo, whaleMat);
  const wPecL = new THREE.Mesh(whalePecGeo, whaleMat);
  wPecL.position.set(1.1, -0.35, 1.8);
  wPecL.rotation.set(0.15, -0.45, -0.22);
  const wPecR = new THREE.Mesh(whalePecGeo, whaleMat);
  wPecR.scale.x = -1;
  wPecR.position.set(-1.1, -0.35, 1.8);
  wPecR.rotation.set(0.15, 0.45, 0.22);

  const whaleTailPivot = new THREE.Group();
  whaleTailPivot.position.set(0, 0, -5.8);
  whaleTailPivot.add(new THREE.Mesh(whaleFlukeGeo, whaleMat));
  whaleRoot.add(whaleBody, wPecL, wPecR, whaleTailPivot);
  whaleRoot.scale.setScalar(1.35);
  group.add(whaleRoot);

  const whale: ArticulatedCreatureRig = {
    kind: 'whale',
    root: whaleRoot,
    tailPivot: whaleTailPivot,
    phase: 0.4,
    baseScale: 1.35,
  };

  // 9. Manta Rays (Wing-flap GLSL shader on broad diamond wings + whip tail)
  const mantaGeo = new THREE.PlaneGeometry(3.8, 2.3, 24, 14);
  mantaGeo.rotateX(-Math.PI / 2);
  const mp = mantaGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i); // -1.9..1.9 wing span
    const z = mp.getZ(i); // -1.15..1.15 fore-aft
    const span = Math.abs(x) / 1.9;
    const chordScale = Math.max(0.14, 1.0 - Math.pow(span, 1.25) * 0.85);
    const thickness = Math.exp(-span * span * 5.0) * 0.18 * (1 - Math.abs(z));
    mp.setXYZ(i, x, thickness, z * chordScale - span * 0.35);
  }
  mantaGeo.computeVertexNormals();

  const mantaTailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, -0.9),
    new THREE.Vector3(0, -0.05, -2.2),
    new THREE.Vector3(0, 0.02, -3.4),
  ]);
  const mantaTailGeo = new THREE.TubeGeometry(mantaTailCurve, 10, 0.028, 6, false);
  disposablesGeo.push(mantaGeo, mantaTailGeo);

  const mantas: ArticulatedCreatureRig[] = [];
  for (let i = 0; i < tier.mantaCount; i++) {
    const wingUniforms = { uTime: { value: 0 }, uPhase: { value: i * 2.1 } };
    const mMat = new THREE.MeshStandardMaterial({
      map: mantaTex,
      roughness: 0.38,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    mMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wingUniforms.uTime;
      shader.uniforms.uPhase = wingUniforms.uPhase;
      shader.vertexShader =
        `uniform float uTime;\nuniform float uPhase;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wingSpan = abs(position.x) / 1.9;
          float flap = sin(uTime * 2.35 + uPhase - wingSpan * 1.9) * pow(wingSpan, 1.2) * 0.62;
          transformed.y += flap;`
        );
    };
    disposablesMat.push(mMat);

    const root = new THREE.Group();
    const wings = new THREE.Mesh(mantaGeo, mMat);
    const tail = new THREE.Mesh(mantaTailGeo, mMat);
    root.add(wings, tail);
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

  // 10. Octopus (Bulbous mantle + 8 curved undulating arms)
  const octoHeadGeo = new THREE.SphereGeometry(0.42, 16, 12);
  octoHeadGeo.scale(0.88, 1.35, 0.95);
  const octoArmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.32, -0.35, 0.12),
    new THREE.Vector3(0.62, -0.78, -0.1),
    new THREE.Vector3(0.88, -1.05, 0.16),
  ]);
  const octoArmGeo = new THREE.TubeGeometry(octoArmCurve, 12, 0.06, 7, false);
  const octoMat = new THREE.MeshStandardMaterial({
    color: '#d95b72',
    emissive: '#3b0c1e',
    emissiveIntensity: 0.45,
    roughness: 0.44,
    metalness: 0.06,
  });
  disposablesGeo.push(octoHeadGeo, octoArmGeo);
  disposablesMat.push(octoMat);

  const octoRoot = new THREE.Group();
  const octoHead = new THREE.Mesh(octoHeadGeo, octoMat);
  octoHead.position.y = 0.28;
  octoHead.rotation.x = -0.24;
  const oEyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const oEyeR = new THREE.Mesh(eyeGeo, eyeMat);
  oEyeL.position.set(0.24, 0.14, 0.34);
  oEyeR.position.set(-0.24, 0.14, 0.34);
  octoRoot.add(octoHead, oEyeL, oEyeR);

  const armSegments: THREE.Object3D[] = [];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const armPivot = new THREE.Group();
    armPivot.rotation.y = ang;
    const armMesh = new THREE.Mesh(octoArmGeo, octoMat);
    armMesh.position.set(0.18, -0.05, 0);
    armPivot.add(armMesh);
    octoRoot.add(armPivot);
    armSegments.push(armPivot);
  }
  octoRoot.scale.setScalar(1.05);
  group.add(octoRoot);

  const octopus: ArticulatedCreatureRig = {
    kind: 'octopus',
    root: octoRoot,
    armSegments,
    phase: 0.8,
    baseScale: 1.05,
  };

  const animateRig = (rig: ArticulatedCreatureRig, elapsed: number, speedFactor: number) => {
    const t = elapsed * (0.9 + speedFactor * 1.15) + rig.phase;
    switch (rig.kind) {
      case 'pelagic':
        if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(t * 7.5) * 0.45;
        break;
      case 'shark':
        if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(t * 3.4) * 0.34;
        break;
      case 'dolphin':
        // Dolphins swim via vertical fluke oscillation
        if (rig.tailPivot) rig.tailPivot.rotation.x = Math.sin(t * 5.2) * 0.38;
        break;
      case 'whale':
        if (rig.tailPivot) rig.tailPivot.rotation.x = Math.sin(elapsed * 1.15 + rig.phase) * 0.24;
        break;
      case 'turtle':
        if (rig.leftFlipper && rig.rightFlipper) {
          const stroke = Math.sin(elapsed * 2.15 + rig.phase);
          const twist = Math.cos(elapsed * 2.15 + rig.phase);
          rig.leftFlipper.rotation.z = stroke * 0.55;
          rig.leftFlipper.rotation.y = twist * 0.28;
          rig.rightFlipper.rotation.z = -stroke * 0.55;
          rig.rightFlipper.rotation.y = -twist * 0.28;
        }
        break;
      case 'jelly':
        if (rig.bellMesh) {
          const pulse = Math.sin(elapsed * 2.1 + rig.phase);
          const bellR = 1 + pulse * 0.14;
          const bellH = 1 - pulse * 0.11;
          rig.bellMesh.scale.set(bellR, bellH, bellR);
        }
        if (rig.tentacles) {
          for (let i = 0; i < rig.tentacles.length; i++) {
            const tent = rig.tentacles[i];
            tent.rotation.x = Math.sin(elapsed * 1.8 + rig.phase + i * 0.7) * 0.14;
            tent.rotation.z = Math.cos(elapsed * 1.5 + rig.phase + i * 0.9) * 0.12;
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
            arm.rotation.z = Math.sin(elapsed * 2.6 + i * 0.8) * 0.22;
            arm.rotation.x = Math.cos(elapsed * 2.1 + i * 0.6) * 0.14;
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
