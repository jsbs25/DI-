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

export function createParadiseCat(quality: ParadiseQualityProfile): ParadiseCatHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Warm calico-cream PBR fur palette
  const creamFurMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf7efe3,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  const gingerPatchMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd98643,
      roughness: 0.8,
      metalness: 0.02,
    })
  );
  const charcoalPatchMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3532,
      roughness: 0.82,
      metalness: 0.02,
    })
  );
  const earPinkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf2b3b0,
      roughness: 0.65,
      metalness: 0.01,
    })
  );
  const amberEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4bd47,
      emissive: new THREE.Color(0x523909),
      emissiveIntensity: 0.35,
      roughness: 0.24,
    })
  );
  const collarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb93f3b,
      roughness: 0.5,
      metalness: 0.15,
    })
  );
  const bellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0c965,
      roughness: 0.25,
      metalness: 0.85,
    })
  );

  // Body pivot centered slightly above ground so 4 legs stand at local y = 0
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  // Torso (spine runs along +Z forward)
  const torso = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.11, 0.26, 6, 12).rotateX(Math.PI / 2)), creamFurMat);
  torso.position.set(0, 0.24, 0);
  torso.castShadow = quality.enableShadows;
  bodyRoot.add(torso);

  // Calico shoulder & hip markings
  const patchBack = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.112, 10, 10)), gingerPatchMat);
  patchBack.scale.set(0.98, 0.88, 1.06);
  patchBack.position.set(0.015, 0.255, -0.05);
  bodyRoot.add(patchBack);

  const patchFlank = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.095, 10, 10)), charcoalPatchMat);
  patchFlank.position.set(-0.025, 0.245, 0.09);
  bodyRoot.add(patchFlank);

  // Red silk collar + brass bell
  const collar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.088, 0.015, 6, 16)), collarMat);
  collar.position.set(0, 0.275, 0.165);
  collar.rotation.x = Math.PI * 0.38;
  bodyRoot.add(collar);

  const bell = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.022, 8, 8)), bellMat);
  bell.position.set(0, 0.205, 0.22);
  bodyRoot.add(bell);

  // Articulated Head + Ears + Eyes + Whisker Muzzle
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.31, 0.21);
  bodyRoot.add(headPivot);

  const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.105, 14, 12)), creamFurMat);
  head.position.set(0, 0.065, 0.04);
  head.castShadow = quality.enableShadows;
  headPivot.add(head);

  const earCap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072, 10, 8)), gingerPatchMat);
  earCap.position.set(0.036, 0.115, 0.025);
  headPivot.add(earCap);

  const muzzle = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.046, 10, 8)), creamFurMat);
  muzzle.scale.set(1.15, 0.82, 0.9);
  muzzle.position.set(0, 0.035, 0.128);
  headPivot.add(muzzle);

  const nose = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.014, 6, 6)), earPinkMat);
  nose.position.set(0, 0.052, 0.165);
  headPivot.add(nose);

  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.017, 8, 8));
  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.009, 6, 6));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, amberEyeMat);
    eye.position.set(side * 0.044, 0.082, 0.13);
    headPivot.add(eye);

    const pupil = new THREE.Mesh(pupilGeo, charcoalPatchMat);
    pupil.position.set(side * 0.044, 0.082, 0.143);
    headPivot.add(pupil);

    const outerEar = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.038, 0.082, 5)), side > 0 ? gingerPatchMat : charcoalPatchMat);
    outerEar.position.set(side * 0.066, 0.162, 0.02);
    outerEar.rotation.z = -side * 0.24;
    headPivot.add(outerEar);

    const innerEar = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.022, 0.056, 4)), earPinkMat);
    innerEar.position.set(side * 0.066, 0.156, 0.032);
    innerEar.rotation.z = -side * 0.24;
    headPivot.add(innerEar);
  }

  // 4 Articulated Legs (upper + paw, hip at y = 0.18)
  const legGeo = trackGeo(new THREE.CapsuleGeometry(0.03, 0.125, 4, 8));
  const pawGeo = trackGeo(new THREE.SphereGeometry(0.034, 8, 8));
  const makeLeg = (lx: number, lz: number, front: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.18, lz);
    const leg = new THREE.Mesh(legGeo, front ? creamFurMat : gingerPatchMat);
    leg.position.y = -0.075;
    const paw = new THREE.Mesh(pawGeo, creamFurMat);
    paw.position.set(0, -0.155, 0.012);
    pivot.add(leg, paw);
    bodyRoot.add(pivot);
    return pivot;
  };

  const legFL = makeLeg(-0.062, 0.13, true);
  const legFR = makeLeg(0.062, 0.13, true);
  const legBL = makeLeg(-0.068, -0.13, false);
  const legBR = makeLeg(0.068, -0.13, false);

  // Multi-segment curved tail
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.28, -0.2);
  bodyRoot.add(tailBase);

  const tailSeg1 = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.024, 0.14, 4, 8)), charcoalPatchMat);
  tailSeg1.position.set(0, 0.07, -0.05);
  tailSeg1.rotation.x = -0.55;
  tailBase.add(tailSeg1);

  const tailTipPivot = new THREE.Group();
  tailTipPivot.position.set(0, 0.14, -0.1);
  tailBase.add(tailTipPivot);
  const tailSeg2 = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.021, 0.13, 4, 8)), creamFurMat);
  tailSeg2.position.set(0, 0.065, -0.02);
  tailSeg2.rotation.x = -0.22;
  tailTipPivot.add(tailSeg2);

  // Invisible hit collider for gentle playful pet/jump on click
  const hitTarget = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.32, 8, 8)),
    trackMat(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.position.set(0, 0.25, 0);
  hitTarget.userData.catClick = true;
  bodyRoot.add(hitTarget);

  // Autonomous feline state
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
      // Curl up cozily on Rest Cottage veranda
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
      // Follow Spirit playfully toward the Pavilion terrace
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
      // Sunny daytime: check if a butterfly is fluttering close by to chase!
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
          // Pick a pleasant sunlit meadow spot
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

    // Articulated quadruped gait vs seated / curled nap posture
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
      // Seated attentive posture
      legFL.rotation.x = THREE.MathUtils.damp(legFL.rotation.x, 0.05, 8, dt);
      legFR.rotation.x = THREE.MathUtils.damp(legFR.rotation.x, 0.05, 8, dt);
      legBL.rotation.x = THREE.MathUtils.damp(legBL.rotation.x, -0.78, 8, dt);
      legBR.rotation.x = THREE.MathUtils.damp(legBR.rotation.x, -0.78, 8, dt);
      bodyRoot.position.y = THREE.MathUtils.damp(bodyRoot.position.y, -0.02, 8, dt);
      bodyRoot.rotation.x = THREE.MathUtils.damp(bodyRoot.rotation.x, -0.22, 8, dt);
    }

    // Gentle head tilt & playful tail wave
    headPivot.rotation.y = Math.sin(elapsed * 1.1) * (napping ? 0.05 : 0.24);
    headPivot.rotation.z = napping ? 0.18 : Math.sin(elapsed * 0.7) * 0.08;
    tailBase.rotation.z = Math.sin(elapsed * (moving ? 5.2 : 2.1)) * (napping ? 0.08 : 0.34);
    tailTipPivot.rotation.z = Math.cos(elapsed * (moving ? 5.2 : 2.1)) * 0.28;
    amberEyeMat.emissiveIntensity = 0.25 + nightFactor * 0.85;
  };

  return {
    group,
    hitTarget,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
