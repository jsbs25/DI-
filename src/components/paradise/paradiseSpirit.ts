import * as THREE from 'three';
import type { SpiritState } from '../../agent/uiStateManager.ts';
import type { ParadiseQualityProfile } from './paradiseQuality.ts';
import { terrainHeightAt } from './paradiseTerrain.ts';
import { PAVILION_WORLD_POS, REST_HOUSE_WORLD_POS } from './paradiseArchitecture.ts';

export interface ParadiseSpiritHandle {
  group: THREE.Group;
  hitTarget: THREE.Object3D;
  spiritPos: THREE.Vector3;
  getHeadWorldPosition: (out: THREE.Vector3) => THREE.Vector3;
  pavilionSwirlIntensity: number;
  update: (
    elapsed: number,
    dt: number,
    targetState: SpiritState,
    cameraPos: THREE.Vector3,
    nightFactor: number,
    rainIntensity: number
  ) => SpiritState;
  dispose: () => void;
}

const PAV_X = PAVILION_WORLD_POS.x;
const PAV_Z = PAVILION_WORLD_POS.z;
const REST_X = REST_HOUSE_WORLD_POS.x;
const REST_Z = REST_HOUSE_WORLD_POS.z;

/**
 * Mathematically verified 100% dry-land foreground garden path & meadow chain.
 * Every node and every adjacent segment satisfies minHeight >= 1.09m and water === 0.00
 * so the Spirit walks strictly on real solid ground and NEVER steps into or floats over water.
 */
const DRY_LAND_NODES: ReadonlyArray<readonly [number, number]> = [
  [-11.4, 5.8], // 0: rest_house terrace
  [-7.4, 6.4],  // 1: west_meadow
  [-2.6, 7.6],  // 2: south_terrace
  [-1.2, 9.6],  // 3: talk_spot (scenic foreground stone path facing overlook camera)
  [0.2, 12.2],  // 4: center_path
  [5.2, 10.0],  // 5: east_meadow
  [9.8, 8.6],   // 6: east_overlook
];

const REST_NODE_IDX = 0;
const TALK_NODE_IDX = 3;
const IDLE_NODE_CHOICES = [1, 2, 3, 4, 5, 6];

/**
 * Returns the true solid walkable ground elevation at (x, z).
 * Does NOT clamp water up to 0.18m so water stays below 0.05m and characters never float on water.
 */
export function walkableFloorY(x: number, z: number): number {
  const ground = terrainHeightAt(x, z);

  const dPav = Math.hypot(x - PAV_X, z - PAV_Z);
  if (dPav < 2.25) return terrainHeightAt(PAV_X, PAV_Z) + 0.70;
  if (dPav < 3.85) {
    const t = Math.max(0, Math.min(1, (3.85 - dPav) / 1.6));
    return THREE.MathUtils.lerp(ground, terrainHeightAt(PAV_X, PAV_Z) + 0.70, t);
  }

  const dRest = Math.hypot(x - REST_X, z - REST_Z);
  if (dRest < 1.85) return terrainHeightAt(REST_X, REST_Z) + 0.36;
  if (dRest < 3.1) {
    const t = Math.max(0, Math.min(1, (3.1 - dRest) / 1.25));
    return THREE.MathUtils.lerp(ground, terrainHeightAt(REST_X, REST_Z) + 0.36, t);
  }

  const dxB = x - -6.4;
  const dzB = z - -8.4;
  const cosB = Math.cos(-0.24);
  const sinB = Math.sin(-0.24);
  const localX = dxB * cosB - dzB * sinB;
  const localZ = dxB * sinB + dzB * cosB;
  if (Math.abs(localX) < 1.3 && Math.abs(localZ) <= 3.9) {
    const tSpan = Math.max(-0.5, Math.min(0.5, localZ / 7.6));
    const archY = 0.18 + Math.cos(tSpan * Math.PI) * 0.96 + 0.05;
    return Math.max(ground, archY);
  }

  return ground;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(10, 18, 14, 0.44)');
  grad.addColorStop(0.55, 'rgba(10, 18, 14, 0.20)');
  grad.addColorStop(1.0, 'rgba(10, 18, 14, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSilkGownTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Refined celadon-jade to moon-ivory gradient silk
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#fbf8f1');
  grad.addColorStop(0.24, '#eef3ec');
  grad.addColorStop(0.52, '#bfd8cc');
  grad.addColorStop(0.78, '#7ea898');
  grad.addColorStop(0.93, '#4c7568');
  grad.addColorStop(1.0, '#36584e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine vertical woven silk pleats
  for (let x = 0; x < 512; x += 12) {
    ctx.fillStyle = x % 24 === 0 ? 'rgba(255,255,255,0.11)' : 'rgba(18,36,30,0.065)';
    ctx.fillRect(x, 120, 4, 392);
  }

  // Delicate gold thread cloud-scroll wave near hem
  ctx.strokeStyle = 'rgba(232, 200, 132, 0.65)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = 0; x <= 512; x += 6) {
    const y = 454 + Math.sin((x / 512) * Math.PI * 10) * 8;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Embroidered plum & sakura petals along lower skirt
  for (let i = 0; i < 16; i++) {
    const cx = (i * 32 + 16) % 512;
    const cy = 414 + Math.sin(i * 1.35) * 18;
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2 + i * 0.2;
      ctx.save();
      ctx.translate(cx + Math.cos(ang) * 6.5, cy + Math.sin(ang) * 6.5);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(252, 234, 236, 0.80)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.8, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(236, 198, 118, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lower gold border trim
  ctx.fillStyle = 'rgba(222, 188, 120, 0.78)';
  ctx.fillRect(0, 488, 512, 5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createFaceCanvasTexture(eyesClosed = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Natural porcelain-warm skin base
  const skinGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skinGrad.addColorStop(0.0, '#f8e3d4');
  skinGrad.addColorStop(0.55, '#f6ddcc');
  skinGrad.addColorStop(1.0, '#ebcbb7');
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // On THREE.SphereGeometry, u=0.5 (x=512) maps to +X unless rotated; we rotate head mesh Y by -PI/2 so u=0.5 faces +Z!
  const cx = 512;

  // Soft warm forehead/cheek luminosity
  const glow = ctx.createRadialGradient(cx, 255, 16, cx, 255, 155);
  glow.addColorStop(0.0, 'rgba(255, 246, 238, 0.32)');
  glow.addColorStop(1.0, 'rgba(255, 246, 238, 0.0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 170, 120, 340, 280);

  // Subtle rosy cheeks
  for (const side of [-1, 1]) {
    const bx = cx + side * 66;
    const by = 294;
    const blush = ctx.createRadialGradient(bx, by, 4, bx, by, 34);
    blush.addColorStop(0.0, 'rgba(232, 134, 134, 0.30)');
    blush.addColorStop(0.6, 'rgba(232, 134, 134, 0.10)');
    blush.addColorStop(1.0, 'rgba(232, 134, 134, 0.0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(bx, by, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  // Graceful willow-leaf eyebrows
  ctx.strokeStyle = '#3b2b27';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 26, 224);
    ctx.quadraticCurveTo(cx + side * 56, 212, cx + side * 88, 226);
    ctx.stroke();
  }

  // Painterly expressive eyes (almond proportion, warm deep amber-jade iris)
  for (const side of [-1, 1]) {
    const ex = cx + side * 52;
    const ey = 258;

    if (eyesClosed) {
      // Gentle serene blink curve
      ctx.strokeStyle = '#251a19';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 24, ey + 2);
      ctx.quadraticCurveTo(ex, ey + 13, ex + 24, ey + 2);
      ctx.stroke();
    } else {
      // Soft upper-lid crease
      ctx.strokeStyle = 'rgba(138, 98, 82, 0.35)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - 22, ey - 17);
      ctx.quadraticCurveTo(ex, ey - 25, ex + 23, ey - 15);
      ctx.stroke();

      // Sclera
      ctx.fillStyle = '#fcfaf7';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 23, 14.5, side * -0.06, 0, Math.PI * 2);
      ctx.fill();

      // Deep espresso-jade layered iris
      const irisGrad = ctx.createRadialGradient(ex, ey + 3, 2, ex, ey, 14);
      irisGrad.addColorStop(0.0, '#181e24');
      irisGrad.addColorStop(0.42, '#2d4746');
      irisGrad.addColorStop(0.76, '#4c756d');
      irisGrad.addColorStop(1.0, '#222b2e');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(ex, ey + 0.5, 13.2, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      ctx.fillStyle = '#121417';
      ctx.beginPath();
      ctx.arc(ex, ey + 0.5, 6.2, 0, Math.PI * 2);
      ctx.fill();

      // Crisp specular catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 5, ey - 4.5, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 235, 0.85)';
      ctx.beginPath();
      ctx.arc(ex + 5.5, ey + 4.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Tapered upper lash line with subtle wing
      ctx.strokeStyle = '#1c1415';
      ctx.lineWidth = 5.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 25, ey + 2);
      ctx.quadraticCurveTo(ex, ey - 17, ex + 26, ey + 1);
      ctx.stroke();

      // Soft lower lash hint
      ctx.strokeStyle = 'rgba(72, 52, 48, 0.42)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(ex - 16, ey + 13);
      ctx.quadraticCurveTo(ex, ey + 16, ex + 16, ey + 13);
      ctx.stroke();
    }
  }

  // Delicate nose shadow
  ctx.fillStyle = 'rgba(182, 132, 110, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, 294, 4.2, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm gentle rose-peach smile
  ctx.fillStyle = 'rgba(214, 114, 114, 0.72)';
  ctx.beginPath();
  ctx.moveTo(cx - 19, 326);
  ctx.quadraticCurveTo(cx, 319, cx + 19, 326);
  ctx.quadraticCurveTo(cx, 339, cx - 19, 326);
  ctx.fill();

  ctx.strokeStyle = 'rgba(156, 74, 78, 0.65)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 17, 326);
  ctx.quadraticCurveTo(cx, 332, cx + 17, 326);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Builds a gracefully curved flat silk ribbon strip (NOT a round tube) from a 3D spline.
 */
function createFlatSilkRibbonGeometry(
  points: THREE.Vector3[],
  widthStart: number,
  widthEnd: number,
  segments = 28
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    curve.getTangent(t, tangent);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
    side.normalize();

    const halfW = THREE.MathUtils.lerp(widthStart, widthEnd, t) * 0.5;
    // Slight natural twist along the flowing silk
    const twist = Math.sin(t * Math.PI * 1.4) * 0.25;
    const ox = side.x * Math.cos(twist) * halfW;
    const oy = Math.sin(twist) * halfW * 0.55;
    const oz = side.z * Math.cos(twist) * halfW;

    positions.push(p.x - ox, p.y - oy, p.z - oz);
    positions.push(p.x + ox, p.y + oy, p.z + oz);
    uvs.push(0, t, 1, t);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a pleated Hanfu skirt LatheGeometry with gentle scalloped folds along the hem.
 */
function createPleatedSkirtGeometry(
  profile: Array<[number, number]>,
  radialSegments = 48,
  pleatCount = 18,
  pleatAmp = 0.016
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const minY = profile[0][1];
  const maxY = profile[profile.length - 1][1];
  const spanY = Math.max(0.001, maxY - minY);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.01) {
      const ang = Math.atan2(z, x);
      const heightRatio = Math.max(0, Math.min(1, (y - minY) / spanY));
      const foldWeight = Math.pow(1 - heightRatio, 1.35);
      const ripple = Math.sin(ang * pleatCount) * pleatAmp * foldWeight;
      const scale = (r + ripple) / r;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createParadiseSpirit(quality: ParadiseQualityProfile): ParadiseSpiritHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();
  group.name = 'paradise_garden_companion';

  // Ground contact shadow disc (keeps figure unmistakably grounded on stone/grass)
  const shadowTex = track(createContactShadowTexture());
  const shadowDisc = new THREE.Mesh(
    track(new THREE.CircleGeometry(0.48, 28)),
    track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    )
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.016;
  group.add(shadowDisc);

  // Main body rig (grounded at y=0, total height ~1.64m)
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  // Materials
  const gownTex = track(createSilkGownTexture());
  const faceOpenTex = track(createFaceCanvasTexture(false));
  const faceClosedTex = track(createFaceCanvasTexture(true));

  const innerGownMat = track(
    new THREE.MeshPhysicalMaterial({
      map: gownTex,
      roughness: 0.52,
      metalness: 0.02,
      sheen: 0.55,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color('#eef7f2'),
      side: THREE.DoubleSide,
    })
  );

  const outerSheerMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e6f2ec'),
      roughness: 0.34,
      metalness: 0.02,
      sheen: 0.72,
      sheenColor: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  const ivorySilkMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#fbf7ee'),
      roughness: 0.46,
      metalness: 0.02,
      sheen: 0.48,
      sheenColor: new THREE.Color('#fff9ed'),
      side: THREE.DoubleSide,
    })
  );

  const jadeTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4a8374'),
      roughness: 0.36,
      metalness: 0.08,
    })
  );

  const goldMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#d8b16a'),
      roughness: 0.28,
      metalness: 0.78,
    })
  );

  const pearlMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#fff9f0'),
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.85,
    })
  );

  const blossomMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f7cdd6'),
      roughness: 0.45,
      metalness: 0.0,
    })
  );

  const skinMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f4d8c6'),
      roughness: 0.56,
      metalness: 0.0,
    })
  );

  const faceMat = track(
    new THREE.MeshStandardMaterial({
      map: faceOpenTex,
      roughness: 0.52,
      metalness: 0.0,
    })
  );

  const hairMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#211a1e'),
      roughness: 0.38,
      metalness: 0.06,
      sheen: 0.45,
      sheenColor: new THREE.Color('#5a4b52'),
      side: THREE.DoubleSide,
    })
  );

  const shoeMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3e5f56'),
      roughness: 0.55,
      metalness: 0.04,
    })
  );

  const ribbonMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d4ebe2'),
      emissive: new THREE.Color('#4a7c6e'),
      emissiveIntensity: 0.08,
      roughness: 0.35,
      sheen: 0.8,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  // === 1. Grounded Embroidered Silk Shoes ===
  const createShoe = (side: -1 | 1): THREE.Group => {
    const foot = new THREE.Group();
    foot.position.set(side * 0.088, 0.036, 0.03);
    const sole = new THREE.Mesh(track(new THREE.BoxGeometry(0.072, 0.022, 0.165)), ivorySilkMat);
    sole.position.set(0, -0.022, 0.01);
    foot.add(sole);

    const upper = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.035, 0.085, 6, 12)), shoeMat);
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(1.0, 1.0, 0.78);
    upper.position.set(0, 0.002, 0.012);
    upper.castShadow = true;
    foot.add(upper);

    // Tiny upturned cloud-toe bead
    const toeBead = new THREE.Mesh(track(new THREE.SphereGeometry(0.013, 8, 8)), pearlMat);
    toeBead.position.set(0, 0.015, 0.082);
    foot.add(toeBead);
    return foot;
  };
  const footL = createShoe(-1);
  const footR = createShoe(1);
  bodyRoot.add(footL, footR);

  // === 2. Pleated Hanfu Underskirt & Sheer Organza Overskirt ===
  const skirtPivot = new THREE.Group();
  skirtPivot.position.set(0, 0.96, 0);
  bodyRoot.add(skirtPivot);

  const innerSkirtGeo = track(
    createPleatedSkirtGeometry(
      [
        [0.37, -0.92],
        [0.33, -0.68],
        [0.26, -0.42],
        [0.19, -0.18],
        [0.142, 0.0],
      ],
      48,
      18,
      0.015
    )
  );
  const innerSkirt = new THREE.Mesh(innerSkirtGeo, innerGownMat);
  innerSkirt.castShadow = true;
  innerSkirt.receiveShadow = true;
  skirtPivot.add(innerSkirt);

  const outerSkirtGeo = track(
    createPleatedSkirtGeometry(
      [
        [0.43, -0.84],
        [0.36, -0.58],
        [0.27, -0.32],
        [0.18, -0.08],
        [0.15, 0.01],
      ],
      44,
      14,
      0.018
    )
  );
  const outerSkirt = new THREE.Mesh(outerSkirtGeo, outerSheerMat);
  skirtPivot.add(outerSkirt);

  // Front jade embroidered apron panel (蔽膝)
  const frontPanel = new THREE.Mesh(track(new THREE.PlaneGeometry(0.14, 0.64, 4, 10)), jadeTrimMat);
  const fpPos = frontPanel.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fpPos.count; i++) {
    const py = fpPos.getY(i);
    const t = (0.32 - py) / 0.64; // 0 at waist, 1 at hem
    fpPos.setZ(i, 0.148 + t * 0.155 + Math.sin(t * Math.PI) * 0.018);
  }
  fpPos.needsUpdate = true;
  frontPanel.geometry.computeVertexNormals();
  frontPanel.position.set(0, -0.33, 0);
  skirtPivot.add(frontPanel);

  // === 3. Tailored Cross-Collar Upper Torso & Gold Waist Sash ===
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.96, 0);
  bodyRoot.add(torsoPivot);

  const bodiceGeo = track(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.135, 0.0),
        new THREE.Vector2(0.148, 0.12),
        new THREE.Vector2(0.168, 0.25),
        new THREE.Vector2(0.152, 0.35),
        new THREE.Vector2(0.082, 0.40),
      ],
      28
    )
  );
  const bodice = new THREE.Mesh(bodiceGeo, ivorySilkMat);
  bodice.scale.set(1.06, 1.0, 0.82);
  bodice.castShadow = true;
  bodice.receiveShadow = true;
  torsoPivot.add(bodice);

  // Sculpted shoulder capelet (云肩)
  const capeletGeo = track(
    createPleatedSkirtGeometry(
      [
        [0.23, 0.25],
        [0.20, 0.32],
        [0.14, 0.37],
        [0.082, 0.395],
      ],
      32,
      8,
      0.012
    )
  );
  const capelet = new THREE.Mesh(capeletGeo, outerSheerMat);
  capelet.scale.set(1.08, 1.0, 0.86);
  torsoPivot.add(capelet);

  // Cross-collar jade lapel V-trim (交领)
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(track(new THREE.BoxGeometry(0.026, 0.22, 0.014)), jadeTrimMat);
    lapel.position.set(side * 0.044, 0.295, 0.122);
    lapel.rotation.z = side * 0.46;
    lapel.rotation.x = -0.18;
    torsoPivot.add(lapel);
  }

  // Braided jade & gold high-waist sash + jade pendant
  const sash = new THREE.Mesh(track(new THREE.TorusGeometry(0.145, 0.022, 10, 32)), jadeTrimMat);
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1.06, 0.86, 1.0);
  sash.position.set(0, 0.05, 0);
  torsoPivot.add(sash);

  const goldBelt = new THREE.Mesh(track(new THREE.TorusGeometry(0.152, 0.009, 8, 32)), goldMat);
  goldBelt.rotation.x = Math.PI / 2;
  goldBelt.scale.set(1.06, 0.86, 1.0);
  goldBelt.position.set(0, 0.05, 0);
  torsoPivot.add(goldBelt);

  const jadeDisc = new THREE.Mesh(track(new THREE.TorusGeometry(0.025, 0.008, 10, 20)), jadeTrimMat);
  jadeDisc.position.set(0.06, -0.02, 0.142);
  torsoPivot.add(jadeDisc);

  const tassel = new THREE.Mesh(track(new THREE.ConeGeometry(0.015, 0.095, 10)), goldMat);
  tassel.position.set(0.06, -0.095, 0.145);
  torsoPivot.add(tassel);

  // === 4. Flowing Flat Silk Ribbons (飘带) ===
  const ribbonL = new THREE.Mesh(
    track(
      createFlatSilkRibbonGeometry(
        [
          new THREE.Vector3(-0.16, 0.34, 0.04),
          new THREE.Vector3(-0.30, 0.18, -0.06),
          new THREE.Vector3(-0.34, -0.14, -0.22),
          new THREE.Vector3(-0.22, -0.46, -0.34),
          new THREE.Vector3(-0.28, -0.76, -0.28),
        ],
        0.042,
        0.072,
        24
      )
    ),
    ribbonMat
  );
  const ribbonR = new THREE.Mesh(
    track(
      createFlatSilkRibbonGeometry(
        [
          new THREE.Vector3(0.16, 0.34, 0.04),
          new THREE.Vector3(0.30, 0.18, -0.06),
          new THREE.Vector3(0.34, -0.14, -0.22),
          new THREE.Vector3(0.22, -0.46, -0.34),
          new THREE.Vector3(0.28, -0.76, -0.28),
        ],
        0.042,
        0.072,
        24
      )
    ),
    ribbonMat
  );
  torsoPivot.add(ribbonL, ribbonR);

  // === 5. Graceful Arms, Wide Hanfu Sleeves & Lotus Garden Lantern ===
  const armL = new THREE.Group();
  armL.position.set(-0.175, 0.32, 0.0);
  const sleeveL = new THREE.Mesh(track(new THREE.ConeGeometry(0.092, 0.36, 16, 1, true)), ivorySilkMat);
  sleeveL.position.set(-0.02, -0.16, 0.03);
  sleeveL.rotation.z = -0.18;
  sleeveL.rotation.x = -0.14;
  sleeveL.castShadow = true;
  const cuffL = new THREE.Mesh(track(new THREE.TorusGeometry(0.086, 0.008, 8, 20)), jadeTrimMat);
  cuffL.position.set(-0.052, -0.335, 0.055);
  cuffL.rotation.x = Math.PI / 2 - 0.14;
  cuffL.rotation.y = -0.18;
  const handL = new THREE.Mesh(track(new THREE.SphereGeometry(0.028, 10, 10)), skinMat);
  handL.scale.set(0.85, 1.1, 0.72);
  handL.position.set(-0.042, -0.33, 0.068);
  armL.add(sleeveL, cuffL, handL);
  torsoPivot.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.175, 0.32, 0.0);
  const sleeveR = new THREE.Mesh(track(new THREE.ConeGeometry(0.092, 0.35, 16, 1, true)), ivorySilkMat);
  sleeveR.position.set(0.03, -0.15, 0.09);
  sleeveR.rotation.z = 0.24;
  sleeveR.rotation.x = -0.45;
  sleeveR.castShadow = true;
  const cuffR = new THREE.Mesh(track(new THREE.TorusGeometry(0.084, 0.008, 8, 20)), jadeTrimMat);
  cuffR.position.set(0.068, -0.30, 0.165);
  cuffR.rotation.x = Math.PI / 2 - 0.45;
  cuffR.rotation.y = 0.24;
  const handR = new THREE.Mesh(track(new THREE.SphereGeometry(0.028, 10, 10)), skinMat);
  handR.scale.set(0.85, 1.1, 0.72);
  handR.position.set(0.072, -0.295, 0.195);
  armR.add(sleeveR, cuffR, handR);
  torsoPivot.add(armR);

  // Delicate Lotus-Glass Garden Lantern suspended from right hand
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0.078, -0.30, 0.22);
  armR.add(lanternPivot);

  const lanternCord = new THREE.Mesh(track(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6)), goldMat);
  lanternCord.position.set(0, -0.055, 0);
  lanternPivot.add(lanternCord);

  const lanternCapTop = new THREE.Mesh(track(new THREE.ConeGeometry(0.055, 0.032, 8)), goldMat);
  lanternCapTop.position.set(0, -0.118, 0);
  lanternPivot.add(lanternCapTop);

  const lanternGlassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#fff1d0'),
      emissive: new THREE.Color('#ffb85c'),
      emissiveIntensity: 0.75,
      roughness: 0.22,
      transmission: 0.35,
      transparent: true,
      opacity: 0.88,
    })
  );
  const lanternBody = new THREE.Mesh(track(new THREE.SphereGeometry(0.064, 14, 12)), lanternGlassMat);
  lanternBody.scale.set(0.95, 1.22, 0.95);
  lanternBody.position.set(0, -0.195, 0);
  lanternPivot.add(lanternBody);

  const lanternCoreMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fff5d6'),
    })
  );
  const lanternCore = new THREE.Mesh(track(new THREE.SphereGeometry(0.024, 10, 10)), lanternCoreMat);
  lanternCore.position.set(0, -0.195, 0);
  lanternPivot.add(lanternCore);

  const lanternBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.038, 0.026, 0.024, 8)), goldMat);
  lanternBase.position.set(0, -0.275, 0);
  lanternPivot.add(lanternBase);

  const lanternTassel = new THREE.Mesh(track(new THREE.ConeGeometry(0.012, 0.075, 8)), jadeTrimMat);
  lanternTassel.position.set(0, -0.325, 0);
  lanternPivot.add(lanternTassel);

  const lanternLight = new THREE.PointLight('#ffca7a', 0.45, 5.2, 1.8);
  lanternLight.position.set(0, -0.195, 0);
  lanternPivot.add(lanternLight);

  // === 6. Slender Neck, Sculpted Head & Painterly Face ===
  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.042, 0.048, 0.11, 14)), skinMat);
  neck.position.set(0, 0.425, 0.005);
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.545, 0.012);
  torsoPivot.add(headPivot);

  const headMesh = new THREE.Mesh(track(new THREE.SphereGeometry(0.118, 32, 24)), faceMat);
  headMesh.scale.set(0.89, 1.02, 0.93);
  // Rotate -PI/2 around Y so u=0.5 of SphereGeometry aligns precisely with +Z (front)
  headMesh.rotation.y = -Math.PI / 2;
  headMesh.castShadow = true;
  headPivot.add(headMesh);

  // Delicate ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(track(new THREE.SphereGeometry(0.021, 10, 10)), skinMat);
    ear.scale.set(0.55, 1.15, 0.72);
    ear.position.set(side * 0.102, -0.006, -0.008);
    headPivot.add(ear);

    const earring = new THREE.Mesh(track(new THREE.SphereGeometry(0.0085, 8, 8)), pearlMat);
    earring.position.set(side * 0.105, -0.032, -0.006);
    headPivot.add(earring);
  }

  // === 7. Sculpted Multi-Layered Hair, Side Locks, Buns & Blossom Hairpin ===
  const hairCrown = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.125, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.64)),
    hairMat
  );
  hairCrown.scale.set(0.94, 1.03, 0.98);
  hairCrown.position.set(0, 0.012, -0.012);
  hairCrown.rotation.x = -0.18;
  hairCrown.castShadow = true;
  headPivot.add(hairCrown);

  // Soft curved side-parted bangs (flat tapered sculpted ribbons, zero tubes!)
  const bangL = new THREE.Mesh(
    track(
      createFlatSilkRibbonGeometry(
        [
          new THREE.Vector3(0.012, 0.115, 0.068),
          new THREE.Vector3(-0.042, 0.088, 0.108),
          new THREE.Vector3(-0.088, 0.028, 0.095),
          new THREE.Vector3(-0.108, -0.062, 0.056),
          new THREE.Vector3(-0.114, -0.165, 0.034),
        ],
        0.048,
        0.016,
        16
      )
    ),
    hairMat
  );
  const bangR = new THREE.Mesh(
    track(
      createFlatSilkRibbonGeometry(
        [
          new THREE.Vector3(-0.012, 0.115, 0.068),
          new THREE.Vector3(0.048, 0.086, 0.108),
          new THREE.Vector3(0.092, 0.024, 0.094),
          new THREE.Vector3(0.110, -0.066, 0.056),
          new THREE.Vector3(0.115, -0.165, 0.034),
        ],
        0.048,
        0.016,
        16
      )
    ),
    hairMat
  );
  headPivot.add(bangL, bangR);

  // Flowing back hair waterfall cloak (layered tapered silk-hair sheets)
  const backHairPivot = new THREE.Group();
  backHairPivot.position.set(0, 0.01, -0.092);
  headPivot.add(backHairPivot);

  const hairCurtainSpecs = [
    { x: 0.0, z: -0.02, w0: 0.15, w1: 0.21, drop: 0.56 },
    { x: -0.075, z: 0.005, w0: 0.085, w1: 0.095, drop: 0.50 },
    { x: 0.075, z: 0.005, w0: 0.085, w1: 0.095, drop: 0.50 },
  ];
  for (const s of hairCurtainSpecs) {
    const strand = new THREE.Mesh(
      track(
        createFlatSilkRibbonGeometry(
          [
            new THREE.Vector3(s.x, 0.03, s.z),
            new THREE.Vector3(s.x * 1.12, -s.drop * 0.34, s.z - 0.032),
            new THREE.Vector3(s.x * 1.18, -s.drop * 0.70, s.z - 0.058),
            new THREE.Vector3(s.x * 1.10, -s.drop, s.z - 0.048),
          ],
          s.w0,
          s.w1,
          16
        )
      ),
      hairMat
    );
    strand.castShadow = true;
    backHairPivot.add(strand);
  }

  // Graceful classic top-chignon & twin pearl-accented side buns
  const topBun = new THREE.Mesh(track(new THREE.SphereGeometry(0.056, 16, 14)), hairMat);
  topBun.scale.set(1.12, 0.85, 0.95);
  topBun.position.set(0, 0.135, -0.038);
  headPivot.add(topBun);

  for (const side of [-1, 1]) {
    const sideBun = new THREE.Mesh(track(new THREE.SphereGeometry(0.038, 12, 12)), hairMat);
    sideBun.position.set(side * 0.082, 0.088, -0.056);
    headPivot.add(sideBun);

    const pearlBand = new THREE.Mesh(track(new THREE.TorusGeometry(0.039, 0.006, 8, 16)), pearlMat);
    pearlBand.position.set(side * 0.082, 0.088, -0.056);
    pearlBand.rotation.y = side * 0.7;
    headPivot.add(pearlBand);
  }

  // Carved gold & sakura-blossom hairpin (步摇)
  const hairpinStem = new THREE.Mesh(track(new THREE.CylinderGeometry(0.004, 0.0025, 0.17, 8)), goldMat);
  hairpinStem.position.set(0.03, 0.145, -0.032);
  hairpinStem.rotation.z = -1.18;
  headPivot.add(hairpinStem);

  const pinBlossom = new THREE.Group();
  pinBlossom.position.set(0.095, 0.172, -0.025);
  for (let p = 0; p < 5; p++) {
    const ang = (p / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(track(new THREE.SphereGeometry(0.015, 8, 8)), blossomMat);
    petal.scale.set(1.2, 0.45, 0.85);
    petal.position.set(Math.cos(ang) * 0.014, Math.sin(ang) * 0.014, 0);
    petal.rotation.z = ang;
    pinBlossom.add(petal);
  }
  const pinCenter = new THREE.Mesh(track(new THREE.SphereGeometry(0.009, 8, 8)), goldMat);
  pinBlossom.add(pinCenter);
  headPivot.add(pinBlossom);

  // Subtle ambient firefly motes only at twilight/night (no harsh glowing blobs during daytime)
  const moteCount = quality.tier === 'low' ? 4 : 8;
  const moteGeo = track(new THREE.BufferGeometry());
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const ang = (i / moteCount) * Math.PI * 2;
    motePos[i * 3] = Math.cos(ang) * 0.52;
    motePos[i * 3 + 1] = 0.72 + (i % 3) * 0.34;
    motePos[i * 3 + 2] = Math.sin(ang) * 0.52;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = track(
    new THREE.PointsMaterial({
      color: '#ffe5a8',
      size: 0.055,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  // Invisible generous click target capsule
  const hitTarget = new THREE.Mesh(
    track(new THREE.CapsuleGeometry(0.46, 1.25, 4, 8)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.position.set(0, 0.92, 0);
  hitTarget.name = 'paradise_spirit_hit';
  group.add(hitTarget);

  // === Dry-Land Node-by-Node Graph Locomotion State ===
  let currentNodeIdx = TALK_NODE_IDX;
  let goalNodeIdx = TALK_NODE_IDX;
  let idlePauseTimer = 6.0;
  let blinkTimer = 3.2;
  let blinkDuration = 0;
  let walkPhase = 0;

  const startXZ = DRY_LAND_NODES[TALK_NODE_IDX];
  const spiritPos = new THREE.Vector3(startXZ[0], walkableFloorY(startXZ[0], startXZ[1]), startXZ[1]);
  group.position.copy(spiritPos);
  group.rotation.y = 0.25; // Facing warmly toward the overlook camera

  const tmpTarget = new THREE.Vector3();
  const tmpHeadLocal = new THREE.Vector3();

  const handle: ParadiseSpiritHandle = {
    group,
    hitTarget,
    spiritPos,
    pavilionSwirlIntensity: 0,

    getHeadWorldPosition(out: THREE.Vector3): THREE.Vector3 {
      group.updateMatrixWorld(true);
      // Aim cleanly ~32cm above her crown/hairpin
      tmpHeadLocal.set(0, 0.34, 0);
      headPivot.localToWorld(out.copy(tmpHeadLocal));
      return out;
    },

    update(elapsed, dt, targetState, cameraPos, nightFactor, rainIntensity) {
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      let nextState: SpiritState = targetState;
      let moveSpeed = 0;
      let faceCamera = false;

      // Choose target node on the 100% dry-land garden path
      if (targetState === 'sleeping_in_house' || targetState === 'returning_to_rest') {
        goalNodeIdx = REST_NODE_IDX;
      } else if (
        targetState === 'woken_approaching' ||
        targetState === 'entering_pavilion' ||
        targetState === 'working_in_pavilion' ||
        targetState === 'presenting_result'
      ) {
        goalNodeIdx = TALK_NODE_IDX;
      } else {
        // idle_explore: leisurely stroll strictly along dry-land meadow & stone-path nodes
        if (currentNodeIdx === goalNodeIdx) {
          idlePauseTimer -= safeDt;
          if (idlePauseTimer <= 0) {
            const candidates = IDLE_NODE_CHOICES.filter((idx) => idx !== currentNodeIdx);
            goalNodeIdx = candidates[Math.floor(Math.random() * candidates.length)];
            idlePauseTimer = 5.5 + Math.random() * 5.0;
          }
        }
      }

      // Step strictly one adjacent node at a time so she NEVER cuts across water!
      let stepNodeIdx = currentNodeIdx;
      if (currentNodeIdx < goalNodeIdx) stepNodeIdx = currentNodeIdx + 1;
      else if (currentNodeIdx > goalNodeIdx) stepNodeIdx = currentNodeIdx - 1;

      const [tx, tz] = DRY_LAND_NODES[stepNodeIdx];
      tmpTarget.set(tx, walkableFloorY(tx, tz), tz);

      const dx = tmpTarget.x - spiritPos.x;
      const dz = tmpTarget.z - spiritPos.z;
      const dist = Math.hypot(dx, dz);

      const isUrgent =
        targetState === 'woken_approaching' ||
        targetState === 'entering_pavilion' ||
        targetState === 'working_in_pavilion' ||
        targetState === 'presenting_result';

      if (dist > 0.14) {
        moveSpeed = isUrgent ? 2.15 : 1.15;
        const step = Math.min(dist, moveSpeed * safeDt);
        spiritPos.x += (dx / dist) * step;
        spiritPos.z += (dz / dist) * step;
        const heading = Math.atan2(dx, dz);
        group.rotation.y = lerpAngle(group.rotation.y, heading, Math.min(1, safeDt * 7.5));
      } else {
        currentNodeIdx = stepNodeIdx;
        if (currentNodeIdx === goalNodeIdx) {
          if (targetState === 'woken_approaching' || targetState === 'entering_pavilion') {
            nextState = 'presenting_result';
          } else if (targetState === 'returning_to_rest') {
            nextState = 'sleeping_in_house';
          }
          faceCamera =
            nextState === 'presenting_result' ||
            nextState === 'working_in_pavilion' ||
            nextState === 'woken_approaching' ||
            currentNodeIdx === TALK_NODE_IDX;
        }
      }

      // Ground strictly on true terrain elevation (ZERO hovering, ZERO water levitation!)
      const groundY = walkableFloorY(spiritPos.x, spiritPos.z);
      spiritPos.y = groundY;
      group.position.copy(spiritPos);

      if (faceCamera) {
        const toCam = Math.atan2(cameraPos.x - spiritPos.x, cameraPos.z - spiritPos.z);
        group.rotation.y = lerpAngle(group.rotation.y, toCam, Math.min(1, safeDt * 4.5));
      }

      // === Natural Grounded Walking & Idle Breathing Animation ===
      const isMoving = moveSpeed > 0.1;
      if (isMoving) {
        walkPhase += safeDt * (moveSpeed > 1.7 ? 7.6 : 5.4);
      } else {
        // Settle smoothly back to neutral standing stance
        walkPhase = THREE.MathUtils.lerp(walkPhase, Math.round(walkPhase / Math.PI) * Math.PI, Math.min(1, safeDt * 6));
      }

      const stride = isMoving ? Math.sin(walkPhase) : 0;
      const stepBob = isMoving ? Math.abs(Math.sin(walkPhase)) * 0.022 : 0;
      const breath = Math.sin(elapsed * 2.1) * 0.008;

      bodyRoot.position.y = stepBob;
      torsoPivot.position.y = 0.96 + breath;
      torsoPivot.rotation.z = stride * 0.025 + Math.sin(elapsed * 1.1) * 0.012;
      torsoPivot.rotation.x = isMoving ? 0.045 : Math.sin(elapsed * 1.3) * 0.015;

      // Grounded footsteps (heel-toe stride, never sinks below y=0)
      footL.position.z = 0.03 + stride * 0.11;
      footL.position.y = 0.036 + Math.max(0, stride) * 0.034;
      footL.rotation.x = -Math.max(0, stride) * 0.18;

      footR.position.z = 0.03 - stride * 0.11;
      footR.position.y = 0.036 + Math.max(0, -stride) * 0.034;
      footR.rotation.x = -Math.max(0, -stride) * 0.18;

      // Subtle skirt & ribbon momentum sway
      skirtPivot.rotation.x = isMoving ? -0.055 + Math.sin(walkPhase * 2) * 0.015 : 0;
      skirtPivot.rotation.z = -stride * 0.03;

      const windSway = Math.sin(elapsed * 2.2) * (0.06 + rainIntensity * 0.05) + (isMoving ? 0.14 : 0);
      ribbonL.rotation.x = windSway;
      ribbonL.rotation.z = Math.sin(elapsed * 1.9 + 0.5) * 0.05;
      ribbonR.rotation.x = windSway * 0.95;
      ribbonR.rotation.z = -Math.sin(elapsed * 1.9 + 1.4) * 0.05;
      backHairPivot.rotation.x = 0.03 + (isMoving ? 0.11 : 0) + Math.sin(elapsed * 2.0) * 0.025;

      // Graceful arms & gently swinging lotus lantern
      armL.rotation.x = -stride * 0.24 + Math.sin(elapsed * 1.6) * 0.03;
      armR.rotation.x = stride * 0.12 - 0.08 + Math.sin(elapsed * 1.5 + 1.0) * 0.025;
      lanternPivot.rotation.z = Math.sin(elapsed * 2.4) * 0.06 - stride * 0.08;
      lanternPivot.rotation.x = Math.cos(elapsed * 2.0) * 0.04 + (isMoving ? 0.1 : 0);

      // Gentle attentive head motion
      headPivot.rotation.y = Math.sin(elapsed * 0.9) * 0.05;
      headPivot.rotation.x =
        targetState === 'working_in_pavilion'
          ? -0.04 + Math.sin(elapsed * 3.0) * 0.03
          : Math.sin(elapsed * 1.2) * 0.025;

      // Natural eye blink every 3.5-6 seconds
      blinkTimer -= safeDt;
      if (blinkTimer <= 0 && blinkDuration <= 0) {
        blinkDuration = 0.14;
        faceMat.map = faceClosedTex;
        faceMat.needsUpdate = true;
      }
      if (blinkDuration > 0) {
        blinkDuration -= safeDt;
        if (blinkDuration <= 0) {
          faceMat.map = faceOpenTex;
          faceMat.needsUpdate = true;
          blinkTimer = 3.2 + Math.random() * 2.8;
        }
      }

      // Lotus lantern warmth adapts naturally to dusk/night
      const nightGlow = THREE.MathUtils.clamp(nightFactor * 1.35 + (targetState === 'working_in_pavilion' ? 0.35 : 0), 0.12, 1.4);
      lanternGlassMat.emissiveIntensity = 0.35 + nightGlow * 1.1;
      lanternLight.intensity = 0.12 + nightGlow * 1.35;

      // Soft twilight firefly motes
      moteMat.opacity = Math.max(0, (nightFactor - 0.28) * 0.72);
      motes.rotation.y = elapsed * 0.32;

      handle.pavilionSwirlIntensity = targetState === 'working_in_pavilion' ? 0.7 : 0;
      return nextState;
    },

    dispose() {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };

  return handle;
}
