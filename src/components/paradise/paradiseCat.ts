import * as THREE from 'three';
import type { SpiritState } from '../../agent/uiStateManager.ts';
import type { ParadiseQualityProfile } from './paradiseQuality.ts';
import { lakeSignedDist, streamDistanceAndFlow } from './paradiseTerrain.ts';
import { REST_HOUSE_WORLD_POS } from './paradiseArchitecture.ts';
import { walkableFloorY } from './paradiseSpirit.ts';

export interface ParadiseCatHandle {
  group: THREE.Group;
  hitTarget: THREE.Object3D;
  update: (
    elapsed: number,
    dt: number,
    dayFactor: number,
    nightFactor: number,
    rainIntensity: number,
    spiritPos: THREE.Vector3,
    spiritState: SpiritState,
    butterflyPositions: THREE.Vector3[],
    cameraPos: THREE.Vector3
  ) => void;
  dispose: () => void;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function createCalicoFurTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8f2e8';
  ctx.fillRect(0, 0, 512, 512);

  const paintPatch = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    const g = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.25, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, color);
    g.addColorStop(0.75, color);
    g.addColorStop(1, 'rgba(248, 242, 232, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0.3, 0, Math.PI * 2);
    ctx.fill();
  };

  paintPatch(145, 210, 96, 74, '#d98947');
  paintPatch(370, 290, 92, 68, '#d58240');
  paintPatch(260, 145, 76, 58, '#413834');
  paintPatch(120, 360, 74, 54, '#3a322e');
  paintPatch(390, 175, 68, 52, '#4a3f3a');

  for (let i = 0; i < 1600; i++) {
    const x = (i * 197) % 512;
    const y = (i * 113) % 512;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(65,52,44,0.08)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y + 8);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCatEyeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  g.addColorStop(0, '#f4c653');
  g.addColorStop(0.65, '#c98e2c');
  g.addColorStop(1, '#584418');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#141210';
  ctx.beginPath();
  ctx.ellipse(64, 64, 14, 42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(52, 46, 9, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createParadiseCat(quality: ParadiseQualityProfile): ParadiseCatHandle {
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

  const furTex = trackTex(createCalicoFurTexture());
  const eyeTex = trackTex(createCatEyeTexture());

  const calicoFurMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: furTex,
      roughness: 0.84,
      metalness: 0.01,
      sheen: 0.62,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xfff6ea),
    })
  );
  const creamPawMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xfbf5ec,
      roughness: 0.82,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xffffff),
    })
  );
  const gingerEarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd98744,
      roughness: 0.8,
    })
  );
  const charcoalEarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3a3330,
      roughness: 0.82,
    })
  );
  const innerPinkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf2b3b0,
      roughness: 0.62,
    })
  );
  const catEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: eyeTex,
      roughness: 0.16,
      metalness: 0.05,
      emissive: new THREE.Color(0x3a2a06),
      emissiveIntensity: 0.2,
    })
  );
  const collarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9f453d,
      roughness: 0.55,
      metalness: 0.1,
    })
  );
  const bellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe8c468,
      roughness: 0.25,
      metalness: 0.82,
    })
  );
  const whiskerMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xf7efe4,
      transparent: true,
      opacity: 0.78,
    })
  );

  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const torsoProfile = [
    new THREE.Vector2(0.01, -0.22),
    new THREE.Vector2(0.088, -0.19),
    new THREE.Vector2(0.114, -0.11),
    new THREE.Vector2(0.095, 0.0),
    new THREE.Vector2(0.112, 0.11),
    new THREE.Vector2(0.098, 0.19),
    new THREE.Vector2(0.01, 0.22),
  ];
  const torsoGeo = trackGeo(new THREE.LatheGeometry(torsoProfile, 22).rotateX(Math.PI / 2));
  const torso = new THREE.Mesh(torsoGeo, calicoFurMat);
  torso.position.set(0, 0.225, 0);
  torso.scale.set(0.92, 1.02, 1.0);
  torso.castShadow = quality.enableShadows;
  torso.receiveShadow = quality.enableShadows;
  bodyRoot.add(torso);

  const chestRuff = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.082, 12, 10)), creamPawMat);
  chestRuff.scale.set(0.95, 1.08, 0.82);
  chestRuff.position.set(0, 0.21, 0.165);
  bodyRoot.add(chestRuff);

  const collar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.078, 0.013, 8, 20)), collarMat);
  collar.position.set(0, 0.255, 0.165);
  collar.rotation.x = Math.PI * 0.36;
  bodyRoot.add(collar);

  const bell = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.018, 10, 10)), bellMat);
  bell.position.set(0, 0.188, 0.215);
  bodyRoot.add(bell);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.295, 0.195);
  bodyRoot.add(headPivot);

  const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.104, 18, 16)), calicoFurMat);
  head.scale.set(1.08, 0.94, 0.96);
  head.position.set(0, 0.06, 0.04);
  head.castShadow = quality.enableShadows;
  headPivot.add(head);

  const cheekL = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.044, 10, 10)), creamPawMat);
  cheekL.position.set(-0.042, 0.036, 0.095);
  const cheekR = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.044, 10, 10)), creamPawMat);
  cheekR.position.set(0.042, 0.036, 0.095);
  const muzzle = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.042, 10, 10)), creamPawMat);
  muzzle.scale.set(1.25, 0.78, 0.92);
  muzzle.position.set(0, 0.032, 0.12);
  headPivot.add(cheekL, cheekR, muzzle);

  const nose = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.013, 8, 8)), innerPinkMat);
  nose.scale.set(1.15, 0.85, 0.75);
  nose.position.set(0, 0.052, 0.158);
  headPivot.add(nose);

  const earShape = new THREE.Shape();
  earShape.moveTo(-0.034, 0);
  earShape.quadraticCurveTo(-0.02, 0.068, 0, 0.088);
  earShape.quadraticCurveTo(0.02, 0.068, 0.034, 0);
  earShape.closePath();

  const outerEarGeo = trackGeo(
    new THREE.ExtrudeGeometry(earShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.007,
      bevelSegments: 3,
    })
  );
  const innerEarGeo = trackGeo(
    new THREE.ExtrudeGeometry(earShape, {
      depth: 0.006,
      bevelEnabled: false,
    })
  );

  // Pre-rotate SphereGeometry -Math.PI/2 on Y so slit pupil faces +Z before Z flattening scale
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.022, 12, 12).rotateY(-Math.PI / 2));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, catEyeMat);
    eye.scale.set(1.0, 1.0, 0.78);
    eye.position.set(side * 0.044, 0.078, 0.12);
    headPivot.add(eye);

    const outerEar = new THREE.Mesh(outerEarGeo, side > 0 ? gingerEarMat : charcoalEarMat);
    outerEar.position.set(side * 0.056, 0.125, 0.02);
    outerEar.rotation.z = -side * 0.28;
    outerEar.rotation.y = side * 0.18;
    headPivot.add(outerEar);

    const innerEar = new THREE.Mesh(innerEarGeo, innerPinkMat);
    innerEar.scale.set(0.62, 0.68, 1);
    innerEar.position.set(side * 0.056, 0.128, 0.032);
    innerEar.rotation.z = -side * 0.28;
    innerEar.rotation.y = side * 0.18;
    headPivot.add(innerEar);

    for (let w = 0; w < 3; w++) {
      const yOff = 0.042 + (w - 1) * 0.011;
      const zCurve = 0.125 - w * 0.008;
      const wGeo = trackGeo(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.038, yOff, 0.138),
          new THREE.Vector3(side * 0.115, yOff + (w - 1) * 0.01, zCurve),
        ])
      );
      headPivot.add(new THREE.Line(wGeo, whiskerMat));
    }
  }

  const upperLegGeo = trackGeo(new THREE.CapsuleGeometry(0.028, 0.095, 5, 10));
  const pawGeo = trackGeo(new THREE.SphereGeometry(0.031, 10, 10));
  const makeLeg = (lx: number, lz: number, front: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.17, lz);
    const leg = new THREE.Mesh(upperLegGeo, front ? creamPawMat : calicoFurMat);
    leg.position.y = -0.068;
    leg.castShadow = quality.enableShadows;
    const paw = new THREE.Mesh(pawGeo, creamPawMat);
    paw.scale.set(1.0, 0.72, 1.25);
    paw.position.set(0, -0.145, 0.014);
    pivot.add(leg, paw);
    bodyRoot.add(pivot);
    return pivot;
  };

  const legFL = makeLeg(-0.058, 0.12, true);
  const legFR = makeLeg(0.058, 0.12, true);
  const legBL = makeLeg(-0.064, -0.12, false);
  const legBR = makeLeg(0.064, -0.12, false);

  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.255, -0.185);
  bodyRoot.add(tailBase);

  const tailLowerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.05, -0.075),
    new THREE.Vector3(0, 0.13, -0.115),
  ]);
  const tailLower = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(tailLowerCurve, 12, 0.025, 8, false)),
    gingerEarMat
  );
  tailBase.add(tailLower);

  const tailTipPivot = new THREE.Group();
  tailTipPivot.position.set(0, 0.13, -0.115);
  tailBase.add(tailTipPivot);
  const tailTipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.09, -0.03),
    new THREE.Vector3(0, 0.16, 0.03),
  ]);
  const tailTip = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(tailTipCurve, 10, 0.021, 8, false)),
    creamPawMat
  );
  tailTipPivot.add(tailTip);

  const hitTarget = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8)),
    trackMat(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.position.set(0, 0.25, 0);
  hitTarget.userData.catClick = true;
  bodyRoot.add(hitTarget);

  const catPos = new THREE.Vector3(-8.2, walkableFloorY(-8.2, 5.2), 5.2);
  let yaw = 0.9;
  let roamX = -3.4;
  let roamZ = 6.8;
  let wanderTimer = 4.0;
  let sitTimer = 0;

  const tmpDelta = new THREE.Vector3();

  const isDryCatSpot = (x: number, z: number) => {
    if (lakeSignedDist(x, z) < 0.8) return false;
    const st = streamDistanceAndFlow(x, z);
    if (st.dist < st.width * 1.2) return false;
    return walkableFloorY(x, z) > 0.2;
  };

  const update = (
    elapsed: number,
    dt: number,
    dayFactor: number,
    nightFactor: number,
    rainIntensity: number,
    spiritPos: THREE.Vector3,
    spiritState: SpiritState,
    butterflyPositions: THREE.Vector3[],
    cameraPos: THREE.Vector3
  ) => {
    let targetX = roamX;
    let targetZ = roamZ;
    let speed = 1.15;
    let napping = false;
    let lookAtCam = false;

    const shelterMode = rainIntensity > 0.42 || nightFactor > 0.65 || spiritState === 'sleeping_in_house';

    if (shelterMode) {
      targetX = REST_HOUSE_WORLD_POS.x + 0.72;
      targetZ = REST_HOUSE_WORLD_POS.z + 0.82;
      const distHome = Math.hypot(targetX - catPos.x, targetZ - catPos.z);
      if (distHome < 0.35) {
        speed = 0;
        napping = true;
      } else {
        speed = 1.85;
      }
    } else if (spiritState === 'woken_approaching' || spiritState === 'entering_pavilion' || spiritState === 'working_in_pavilion') {
      targetX = spiritPos.x - 1.15;
      targetZ = spiritPos.z + 0.95;
      const dSpirit = Math.hypot(targetX - catPos.x, targetZ - catPos.z);
      if (dSpirit > 1.2) {
        speed = Math.min(2.6, 1.3 + dSpirit * 0.25);
      } else {
        speed = 0;
        lookAtCam = true;
      }
    } else {
      let nearBfly: THREE.Vector3 | null = null;
      let nearDist = 4.6;
      if (dayFactor > 0.25 && butterflyPositions.length > 0) {
        for (let i = 0; i < butterflyPositions.length; i++) {
          const bp = butterflyPositions[i];
          if (bp.y < 1.9 && isDryCatSpot(bp.x, bp.z)) {
            const d = Math.hypot(bp.x - catPos.x, bp.z - catPos.z);
            if (d < nearDist) {
              nearDist = d;
              nearBfly = bp;
            }
          }
        }
      }

      if (nearBfly) {
        targetX = nearBfly.x;
        targetZ = nearBfly.z;
        speed = nearDist > 0.7 ? 1.95 : 0.3;
      } else if (sitTimer > 0) {
        sitTimer -= dt;
        speed = 0;
        lookAtCam = catPos.distanceTo(cameraPos) < 12;
      } else {
        wanderTimer -= dt;
        const dRoam = Math.hypot(roamX - catPos.x, roamZ - catPos.z);
        if (dRoam < 0.45 || wanderTimer <= 0) {
          if (dRoam < 0.45 && Math.random() > 0.45) {
            sitTimer = 2.6 + Math.random() * 2.8;
          }
          for (let tries = 0; tries < 10; tries++) {
            const rx = -11 + Math.random() * 19;
            const rz = -1 + Math.random() * 14;
            if (isDryCatSpot(rx, rz)) {
              roamX = rx;
              roamZ = rz;
              break;
            }
          }
          wanderTimer = 5.5 + Math.random() * 4.5;
        }
        targetX = roamX;
        targetZ = roamZ;
        speed = 1.05;
      }
    }

    let desiredYaw = yaw;
    if (speed > 0.08) {
      tmpDelta.set(targetX - catPos.x, 0, targetZ - catPos.z);
      const len = tmpDelta.length();
      if (len > 0.01) {
        tmpDelta.divideScalar(len);
        const step = Math.min(len, speed * dt);
        const nx = catPos.x + tmpDelta.x * step;
        const nz = catPos.z + tmpDelta.z * step;
        if (isDryCatSpot(nx, nz) || shelterMode) {
          catPos.x = nx;
          catPos.z = nz;
        }
        desiredYaw = Math.atan2(tmpDelta.x, tmpDelta.z);
      }
    } else if (lookAtCam) {
      desiredYaw = Math.atan2(cameraPos.x - catPos.x, cameraPos.z - catPos.z);
    }

    const groundY = walkableFloorY(catPos.x, catPos.z);
    catPos.y = THREE.MathUtils.damp(catPos.y, groundY, 12, dt);
    yaw = lerpAngle(yaw, desiredYaw, Math.min(1, dt * 7.0));

    group.position.copy(catPos);
    group.rotation.y = yaw;

    const moving = speed > 0.15;
    if (moving) {
      const freq = speed > 1.7 ? 12.5 : 8.2;
      const amp = speed > 1.7 ? 0.58 : 0.38;
      const p = elapsed * freq;
      legFL.rotation.x = Math.sin(p) * amp;
      legBR.rotation.x = Math.sin(p) * amp;
      legFR.rotation.x = Math.sin(p + Math.PI) * amp;
      legBL.rotation.x = Math.sin(p + Math.PI) * amp;
      bodyRoot.position.y = THREE.MathUtils.damp(bodyRoot.position.y, Math.abs(Math.sin(p)) * 0.025, 10, dt);
      bodyRoot.rotation.x = THREE.MathUtils.damp(bodyRoot.rotation.x, 0, 8, dt);
    } else if (napping) {
      legFL.rotation.x = THREE.MathUtils.damp(legFL.rotation.x, 1.15, 6, dt);
      legFR.rotation.x = THREE.MathUtils.damp(legFR.rotation.x, 1.15, 6, dt);
      legBL.rotation.x = THREE.MathUtils.damp(legBL.rotation.x, -1.05, 6, dt);
      legBR.rotation.x = THREE.MathUtils.damp(legBR.rotation.x, -1.05, 6, dt);
      bodyRoot.position.y = THREE.MathUtils.damp(bodyRoot.position.y, -0.14, 6, dt);
      bodyRoot.rotation.x = THREE.MathUtils.damp(bodyRoot.rotation.x, 0.08, 6, dt);
    } else {
      legFL.rotation.x = THREE.MathUtils.damp(legFL.rotation.x, 0.05, 8, dt);
      legFR.rotation.x = THREE.MathUtils.damp(legFR.rotation.x, 0.05, 8, dt);
      legBL.rotation.x = THREE.MathUtils.damp(legBL.rotation.x, -0.78, 8, dt);
      legBR.rotation.x = THREE.MathUtils.damp(legBR.rotation.x, -0.78, 8, dt);
      bodyRoot.position.y = THREE.MathUtils.damp(bodyRoot.position.y, -0.02, 8, dt);
      bodyRoot.rotation.x = THREE.MathUtils.damp(bodyRoot.rotation.x, -0.22, 8, dt);
    }

    headPivot.rotation.y = Math.sin(elapsed * 1.1) * (napping ? 0.05 : 0.24);
    headPivot.rotation.z = napping ? 0.18 : Math.sin(elapsed * 0.7) * 0.08;
    tailBase.rotation.z = Math.sin(elapsed * (moving ? 5.2 : 2.1)) * (napping ? 0.08 : 0.34);
    tailTipPivot.rotation.z = Math.cos(elapsed * (moving ? 5.2 : 2.1)) * 0.28;
    catEyeMat.emissiveIntensity = 0.15 + nightFactor * 0.65;
  };

  return {
    group,
    hitTarget,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
