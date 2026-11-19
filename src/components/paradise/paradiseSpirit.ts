import * as THREE from 'three';
import type { SpiritState } from '../../agent/uiStateManager.ts';
import type { ParadiseQualityProfile } from './paradiseQuality.ts';
import { terrainHeightAt } from './paradiseTerrain.ts';
import { PAVILION_WORLD_POS, REST_HOUSE_WORLD_POS } from './paradiseArchitecture.ts';

export interface ParadiseSpiritHandle {
  group: THREE.Group;
  hitTarget: THREE.Object3D;
  spiritPos: THREE.Vector3;
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

const WAYPOINTS: Array<[number, number]> = [
  [-7.8, 3.2],
  [-6.8, -3.5],
  [-6.4, -8.4],
  [-5.3, -12.6],
  [4.5, -10.8],
  [10.2, -9.2],
  [PAV_X, PAV_Z],
];

const IDLE_ROAM_SPOTS: Array<[number, number]> = [
  [-1.8, 4.4],
  [-6.4, -8.4],
  [1.2, -10.4],
  [-4.2, 8.6],
  [8.4, 5.2],
];

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

  return Math.max(0.18, ground);
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function createSilkGownTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#f8f4ec');
  grad.addColorStop(0.28, '#e3ece5');
  grad.addColorStop(0.62, '#9ec2b2');
  grad.addColorStop(0.86, '#5c8c7c');
  grad.addColorStop(1.0, '#456b60');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let x = 0; x < 512; x += 16) {
    ctx.fillStyle = x % 32 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(20,40,34,0.06)';
    ctx.fillRect(x, 180, 6, 332);
  }

  for (let i = 0; i < 18; i++) {
    const cx = (i * 29 + 14) % 512;
    const cy = 418 + Math.sin(i * 1.4) * 26;
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(249, 224, 229, 0.72)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.2, 3.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(235, 198, 120, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(218, 182, 108, 0.75)';
  ctx.fillRect(0, 488, 512, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function createFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fbe3d2';
  ctx.fillRect(0, 0, 512, 256);

  const blushL = ctx.createRadialGradient(204, 152, 2, 204, 152, 24);
  blushL.addColorStop(0, 'rgba(238, 136, 132, 0.34)');
  blushL.addColorStop(1, 'rgba(238, 136, 132, 0)');
  ctx.fillStyle = blushL;
  ctx.fillRect(174, 122, 60, 60);

  const blushR = ctx.createRadialGradient(308, 152, 2, 308, 152, 24);
  blushR.addColorStop(0, 'rgba(238, 136, 132, 0.34)');
  blushR.addColorStop(1, 'rgba(238, 136, 132, 0)');
  ctx.fillStyle = blushR;
  ctx.fillRect(278, 122, 60, 60);

  const drawEye = (ex: number, ey: number) => {
    ctx.fillStyle = '#fff9f5';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    const iris = ctx.createLinearGradient(ex, ey - 9, ex, ey + 9);
    iris.addColorStop(0, '#2a4d47');
    iris.addColorStop(0.55, '#468274');
    iris.addColorStop(1, '#9cd6be');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, ey + 1, 8.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#182428';
    ctx.beginPath();
    ctx.arc(ex, ey + 1, 4.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 3.2, ey - 3.2, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 3.4, ey + 3.6, 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#251e22';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ex, ey + 2, 14.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  };

  drawEye(222, 128);
  drawEye(290, 128);

  ctx.strokeStyle = '#3a2d2b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(207, 108);
  ctx.quadraticCurveTo(222, 102, 236, 107);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(276, 107);
  ctx.quadraticCurveTo(290, 102, 305, 108);
  ctx.stroke();

  ctx.strokeStyle = '#c8776e';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(246, 166);
  ctx.quadraticCurveTo(256, 173, 266, 166);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createParadiseSpirit(quality: ParadiseQualityProfile): ParadiseSpiritHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  const silkTex = trackTex(createSilkGownTexture());
  const faceTex = trackTex(createFaceTexture());

  const silkGownMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: silkTex,
      roughness: 0.56,
      metalness: 0.04,
      sheen: 0.78,
      sheenRoughness: 0.36,
      sheenColor: new THREE.Color(0xf7efe4),
    })
  );

  const innerCollarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfaf5ec,
      roughness: 0.52,
      metalness: 0.02,
    })
  );

  const shawlSilkMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd9eee4,
      roughness: 0.38,
      metalness: 0.02,
      sheen: 0.9,
      sheenColor: new THREE.Color(0xfff5ec),
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    })
  );

  const goldTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdcb464,
      roughness: 0.28,
      metalness: 0.72,
    })
  );

  const faceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.58,
      metalness: 0.01,
    })
  );

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbe3d2,
      roughness: 0.6,
      metalness: 0.01,
    })
  );

  const hairMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1d202b,
      roughness: 0.38,
      metalness: 0.12,
      clearcoat: 0.28,
      clearcoatRoughness: 0.45,
    })
  );

  const blossomMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6ccd4,
      roughness: 0.45,
      emissive: new THREE.Color(0x3a1c24),
      emissiveIntensity: 0.15,
    })
  );

  const wispOrbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff0c8,
      emissive: new THREE.Color(0xf7d27a),
      emissiveIntensity: 1.45,
      roughness: 0.2,
    })
  );

  const rig = new THREE.Group();
  group.add(rig);

  // Sculpted LatheGeometry flowing kimono gown silhouette
  const gownProfile = [
    new THREE.Vector2(0.01, 0.02),
    new THREE.Vector2(0.32, 0.04),
    new THREE.Vector2(0.285, 0.24),
    new THREE.Vector2(0.23, 0.48),
    new THREE.Vector2(0.18, 0.68),
    new THREE.Vector2(0.132, 0.84),
    new THREE.Vector2(0.152, 0.96),
    new THREE.Vector2(0.162, 1.08),
    new THREE.Vector2(0.115, 1.15),
    new THREE.Vector2(0.04, 1.18),
  ];
  const gownGeo = trackGeo(new THREE.LatheGeometry(gownProfile, 28));
  const gownMesh = new THREE.Mesh(gownGeo, silkGownMat);
  gownMesh.castShadow = quality.enableShadows;
  gownMesh.receiveShadow = quality.enableShadows;
  rig.add(gownMesh);

  const collarRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.088, 0.022, 10, 22)),
    innerCollarMat
  );
  collarRing.position.set(0, 1.15, 0.012);
  collarRing.rotation.x = Math.PI * 0.42;
  rig.add(collarRing);

  const obiProfile = [
    new THREE.Vector2(0.146, 0.78),
    new THREE.Vector2(0.154, 0.84),
    new THREE.Vector2(0.15, 0.91),
  ];
  const obiMesh = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(obiProfile, 24)), goldTrimMat);
  rig.add(obiMesh);

  const bowLeft = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.065, 10, 10)), goldTrimMat);
  bowLeft.scale.set(1.25, 0.72, 0.45);
  bowLeft.position.set(-0.065, 0.85, -0.16);
  bowLeft.rotation.z = 0.25;
  const bowRight = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.065, 10, 10)), goldTrimMat);
  bowRight.scale.set(1.25, 0.72, 0.45);
  bowRight.position.set(0.065, 0.85, -0.16);
  bowRight.rotation.z = -0.25;
  rig.add(bowLeft, bowRight);

  const shoeGeo = trackGeo(new THREE.CapsuleGeometry(0.036, 0.06, 4, 8).rotateX(Math.PI / 2));
  const leftFootPivot = new THREE.Group();
  leftFootPivot.position.set(-0.075, 0.12, 0);
  const leftShoe = new THREE.Mesh(shoeGeo, innerCollarMat);
  leftShoe.position.set(0, -0.08, 0.04);
  leftFootPivot.add(leftShoe);

  const rightFootPivot = new THREE.Group();
  rightFootPivot.position.set(0.075, 0.12, 0);
  const rightShoe = new THREE.Mesh(shoeGeo, innerCollarMat);
  rightShoe.position.set(0, -0.08, 0.04);
  rightFootPivot.add(rightShoe);
  rig.add(leftFootPivot, rightFootPivot);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.86, 0);
  rig.add(torsoPivot);

  const shawlCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, -0.24, 0.08),
    new THREE.Vector3(-0.26, 0.18, 0.04),
    new THREE.Vector3(-0.18, 0.46, -0.18),
    new THREE.Vector3(0, 0.54, -0.28),
    new THREE.Vector3(0.18, 0.46, -0.18),
    new THREE.Vector3(0.26, 0.18, 0.04),
    new THREE.Vector3(0.28, -0.24, 0.08),
  ]);
  const shawlMesh = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(shawlCurve, 36, 0.028, 8, false)),
    shawlSilkMat
  );
  torsoPivot.add(shawlMesh);

  const sleeveProfile = [
    new THREE.Vector2(0.042, 0),
    new THREE.Vector2(0.056, -0.14),
    new THREE.Vector2(0.095, -0.31),
    new THREE.Vector2(0.078, -0.34),
  ];
  const sleeveGeo = trackGeo(new THREE.LatheGeometry(sleeveProfile, 16));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.032, 10, 10));

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.175, 0.25, 0);
  const leftSleeve = new THREE.Mesh(sleeveGeo, silkGownMat);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.scale.set(0.85, 1.1, 0.75);
  leftHand.position.y = -0.34;
  leftArmPivot.add(leftSleeve, leftHand);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.175, 0.25, 0);
  const rightSleeve = new THREE.Mesh(sleeveGeo, silkGownMat);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.scale.set(0.85, 1.1, 0.75);
  rightHand.position.y = -0.34;
  rightArmPivot.add(rightSleeve, rightHand);
  torsoPivot.add(leftArmPivot, rightArmPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.31, 0.01);
  torsoPivot.add(headPivot);

  const neck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.044, 0.052, 0.1, 12)), skinMat);
  neck.position.y = 0.03;
  headPivot.add(neck);

  // Pre-rotate head SphereGeometry so UV u=0.5 faces +Z before applying head scale
  const headGeo = trackGeo(new THREE.SphereGeometry(0.132, 24, 20).rotateY(-Math.PI / 2));
  const headMesh = new THREE.Mesh(headGeo, faceMat);
  headMesh.position.y = 0.155;
  headMesh.scale.set(0.95, 1.03, 0.94);
  headMesh.castShadow = quality.enableShadows;
  headPivot.add(headMesh);

  const hairCrown = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.141, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58)),
    hairMat
  );
  hairCrown.position.set(0, 0.165, -0.012);
  hairCrown.rotation.x = -0.22;
  headPivot.add(hairCrown);

  const makeHairStrand = (pts: THREE.Vector3[], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const strand = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(curve, 14, radius, 7, false)), hairMat);
    headPivot.add(strand);
    return strand;
  };
  makeHairStrand(
    [new THREE.Vector3(-0.09, 0.22, 0.06), new THREE.Vector3(-0.132, 0.11, 0.075), new THREE.Vector3(-0.125, -0.03, 0.045)],
    0.024
  );
  makeHairStrand(
    [new THREE.Vector3(0.09, 0.22, 0.06), new THREE.Vector3(0.132, 0.11, 0.075), new THREE.Vector3(0.125, -0.03, 0.045)],
    0.024
  );
  makeHairStrand(
    [new THREE.Vector3(-0.07, 0.26, 0.08), new THREE.Vector3(-0.02, 0.225, 0.122), new THREE.Vector3(0.04, 0.21, 0.115)],
    0.022
  );

  const backHairPivot = new THREE.Group();
  backHairPivot.position.set(0, 0.22, -0.11);
  headPivot.add(backHairPivot);

  const backHairBun = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.064, 12, 12)), hairMat);
  backHairBun.position.set(0, 0.06, 0.02);
  backHairPivot.add(backHairBun);

  const backLockCurves = [
    [new THREE.Vector3(-0.04, 0.02, 0), new THREE.Vector3(-0.075, -0.16, -0.06), new THREE.Vector3(-0.06, -0.36, -0.04)],
    [new THREE.Vector3(0, 0.02, -0.01), new THREE.Vector3(0, -0.18, -0.085), new THREE.Vector3(0, -0.40, -0.06)],
    [new THREE.Vector3(0.04, 0.02, 0), new THREE.Vector3(0.075, -0.16, -0.06), new THREE.Vector3(0.06, -0.36, -0.04)],
  ];
  for (const pts of backLockCurves) {
    const c = new THREE.CatmullRomCurve3(pts);
    backHairPivot.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(c, 16, 0.028, 7, false)), hairMat));
  }

  const hairpinRod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.006, 0.004, 0.21, 8)), goldTrimMat);
  hairpinRod.position.set(0, 0.28, -0.09);
  hairpinRod.rotation.z = Math.PI * 0.44;
  headPivot.add(hairpinRod);

  const petalGeo = trackGeo(new THREE.SphereGeometry(0.014, 8, 8));
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeo, blossomMat);
    petal.scale.set(1.1, 0.8, 0.4);
    petal.position.set(-0.075 + Math.cos(a) * 0.016, 0.275 + Math.sin(a) * 0.016, -0.068);
    headPivot.add(petal);
  }

  const wispOrbitGroup = new THREE.Group();
  wispOrbitGroup.position.set(0, 1.15, 0);
  rig.add(wispOrbitGroup);
  const wispOrbs: THREE.Mesh[] = [];
  const wispOrbGeo = trackGeo(new THREE.SphereGeometry(0.024, 10, 10));
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(wispOrbGeo, wispOrbMat);
    wispOrbs.push(orb);
    wispOrbitGroup.add(orb);
  }

  const wispLight = new THREE.PointLight(0xffebd0, 0.55, 6.5, 1.8);
  wispLight.position.set(0, 1.35, 0.25);
  rig.add(wispLight);

  const hitTarget = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 1.65, 8)),
    trackMat(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.position.y = 0.84;
  hitTarget.userData.spiritClick = true;
  rig.add(hitTarget);

  const spiritPos = new THREE.Vector3(-4.2, walkableFloorY(-4.2, 4.6), 4.6);
  group.position.copy(spiritPos);
  let yaw = 0.6;
  let idleIdx = 0;
  let idlePauseTimer = 2.0;
  let routeIndex = 0;
  let routeActive = false;
  let currentVisualState: SpiritState = 'idle_explore';
  let swirlSmoothed = 0;

  const tmpTarget = new THREE.Vector3();
  const tmpDelta = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  const pickNearestRouteStart = (px: number, pz: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const d = Math.hypot(px - WAYPOINTS[i][0], pz - WAYPOINTS[i][1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  let prevTargetState: SpiritState = 'idle_explore';

  const update = (
    elapsed: number,
    dt: number,
    targetState: SpiritState,
    cameraPos: THREE.Vector3,
    nightFactor: number,
    rainIntensity: number
  ): SpiritState => {
    if (targetState !== prevTargetState) {
      prevTargetState = targetState;
      if (targetState === 'woken_approaching' || targetState === 'entering_pavilion') {
        routeIndex = pickNearestRouteStart(spiritPos.x, spiritPos.z);
        routeActive = true;
      } else if (targetState === 'returning_to_rest') {
        routeIndex = pickNearestRouteStart(spiritPos.x, spiritPos.z);
        routeActive = true;
      } else if (targetState === 'idle_explore') {
        routeActive = false;
      }
    }

    let moveSpeed = 0;
    let desiredYaw = yaw;
    let targetSwirl = 0;

    if (targetState === 'woken_approaching' || targetState === 'entering_pavilion') {
      const wp = WAYPOINTS[Math.min(routeIndex, WAYPOINTS.length - 1)];
      tmpTarget.set(wp[0], walkableFloorY(wp[0], wp[1]), wp[1]);
      const d = Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z);
      if (d < 0.55) {
        if (routeIndex < WAYPOINTS.length - 1) routeIndex++;
        else {
          routeActive = false;
          currentVisualState = 'working_in_pavilion';
        }
      }
      if (routeActive) {
        moveSpeed = 3.85;
        currentVisualState = routeIndex >= WAYPOINTS.length - 1 ? 'entering_pavilion' : 'woken_approaching';
      } else {
        tmpLook.subVectors(cameraPos, spiritPos);
        desiredYaw = Math.atan2(tmpLook.x, tmpLook.z);
        targetSwirl = 0.85;
        currentVisualState = 'working_in_pavilion';
      }
    } else if (targetState === 'working_in_pavilion' || targetState === 'presenting_result') {
      const distPav = Math.hypot(PAV_X - spiritPos.x, PAV_Z - spiritPos.z);
      if (distPav > 1.2) {
        const wp = WAYPOINTS[Math.min(routeIndex, WAYPOINTS.length - 1)];
        tmpTarget.set(wp[0], walkableFloorY(wp[0], wp[1]), wp[1]);
        if (Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z) < 0.6 && routeIndex < WAYPOINTS.length - 1) {
          routeIndex++;
        }
        moveSpeed = 3.4;
        targetSwirl = 0.45;
      } else {
        tmpLook.subVectors(cameraPos, spiritPos);
        desiredYaw = Math.atan2(tmpLook.x, tmpLook.z);
        targetSwirl = targetState === 'working_in_pavilion' ? 1.0 : 0.65;
      }
      currentVisualState = targetState;
    } else if (targetState === 'returning_to_rest' || targetState === 'sleeping_in_house') {
      const distRest = Math.hypot(REST_X - spiritPos.x, REST_Z - spiritPos.z);
      if (distRest > 0.65) {
        if (routeIndex > 0) {
          const wp = WAYPOINTS[routeIndex];
          tmpTarget.set(wp[0], walkableFloorY(wp[0], wp[1]), wp[1]);
          if (Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z) < 0.75) routeIndex--;
        } else {
          tmpTarget.set(REST_X, walkableFloorY(REST_X, REST_Z), REST_Z);
        }
        moveSpeed = 3.1;
        currentVisualState = 'returning_to_rest';
      } else {
        desiredYaw = 0.72;
        currentVisualState = 'sleeping_in_house';
      }
    } else {
      const spot = IDLE_ROAM_SPOTS[idleIdx];
      tmpTarget.set(spot[0], walkableFloorY(spot[0], spot[1]), spot[1]);
      const distSpot = Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z);
      if (distSpot < 0.45) {
        idlePauseTimer -= dt;
        if (idlePauseTimer <= 0) {
          idleIdx = (idleIdx + 1) % IDLE_ROAM_SPOTS.length;
          idlePauseTimer = 3.2 + (idleIdx % 3) * 1.4;
        }
      } else {
        moveSpeed = rainIntensity > 0.45 ? 1.9 : 1.35;
      }
      currentVisualState = 'idle_explore';
    }

    if (moveSpeed > 0.05) {
      tmpDelta.set(tmpTarget.x - spiritPos.x, 0, tmpTarget.z - spiritPos.z);
      const len = tmpDelta.length();
      if (len > 0.001) {
        tmpDelta.divideScalar(len);
        const step = Math.min(len, moveSpeed * dt);
        spiritPos.x += tmpDelta.x * step;
        spiritPos.z += tmpDelta.z * step;
        desiredYaw = Math.atan2(tmpDelta.x, tmpDelta.z);
      }
    }

    const groundY = walkableFloorY(spiritPos.x, spiritPos.z);
    spiritPos.y = THREE.MathUtils.damp(spiritPos.y, groundY, 10, dt);
    yaw = lerpAngle(yaw, desiredYaw, Math.min(1, dt * 6.5));

    group.position.copy(spiritPos);
    group.rotation.y = yaw;

    const walkPhase = elapsed * (moveSpeed > 2.4 ? 8.5 : 5.4);
    const isMoving = moveSpeed > 0.15;
    const isWorking = currentVisualState === 'working_in_pavilion' || currentVisualState === 'presenting_result';
    const isSleeping = currentVisualState === 'sleeping_in_house';

    const stride = isMoving ? Math.sin(walkPhase) * 0.38 : 0;
    leftFootPivot.rotation.x = THREE.MathUtils.damp(leftFootPivot.rotation.x, stride, 10, dt);
    rightFootPivot.rotation.x = THREE.MathUtils.damp(rightFootPivot.rotation.x, -stride, 10, dt);

    const armTargetL = isMoving
      ? -stride * 0.45
      : isWorking
      ? -0.55 + Math.sin(elapsed * 2.4) * 0.18
      : isSleeping
      ? 0.08
      : -0.08 + Math.sin(elapsed * 1.4) * 0.04;
    const armTargetR = isMoving
      ? stride * 0.45
      : isWorking
      ? -0.62 + Math.cos(elapsed * 2.2) * 0.18
      : isSleeping
      ? 0.08
      : -0.08 - Math.sin(elapsed * 1.4) * 0.04;

    leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, armTargetL, 8, dt);
    rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, armTargetR, 8, dt);
    leftArmPivot.rotation.z = THREE.MathUtils.damp(leftArmPivot.rotation.z, isWorking ? -0.26 : -0.1, 8, dt);
    rightArmPivot.rotation.z = THREE.MathUtils.damp(rightArmPivot.rotation.z, isWorking ? 0.26 : 0.1, 8, dt);

    const floatLift = isWorking
      ? 0.08 + Math.sin(elapsed * 2.2) * 0.04
      : isMoving
      ? Math.abs(Math.sin(walkPhase)) * 0.032
      : isSleeping
      ? -0.05
      : Math.sin(elapsed * 1.6) * 0.018;
    rig.position.y = THREE.MathUtils.damp(rig.position.y, floatLift, 8, dt);

    torsoPivot.rotation.x = THREE.MathUtils.damp(torsoPivot.rotation.x, isMoving ? 0.04 : 0, 6, dt);
    headPivot.rotation.x = THREE.MathUtils.damp(
      headPivot.rotation.x,
      isSleeping ? 0.2 : Math.sin(elapsed * 1.2) * 0.04,
      6,
      dt
    );
    backHairPivot.rotation.x = THREE.MathUtils.damp(
      backHairPivot.rotation.x,
      (isMoving ? 0.24 : 0.04) + Math.sin(elapsed * 3.1) * 0.05,
      7,
      dt
    );

    const wispRadius = isWorking ? 0.56 : 0.42;
    const wispSpeed = isWorking ? 2.1 : 0.85;
    for (let i = 0; i < wispOrbs.length; i++) {
      const ang = elapsed * wispSpeed + (i * Math.PI * 2) / 3;
      wispOrbs[i].position.set(
        Math.cos(ang) * wispRadius,
        Math.sin(elapsed * 2.1 + i * 2) * 0.14,
        Math.sin(ang) * wispRadius
      );
      wispOrbs[i].visible = !isSleeping;
    }

    wispLight.intensity = (0.35 + nightFactor * 0.72 + (isWorking ? 0.55 : 0)) * (isSleeping ? 0.3 : 1.0);
    swirlSmoothed = THREE.MathUtils.damp(swirlSmoothed, targetSwirl, 3.2, dt);

    return currentVisualState;
  };

  return {
    group,
    hitTarget,
    spiritPos,
    get pavilionSwirlIntensity() {
      return swirlSmoothed;
    },
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
