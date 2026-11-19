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

// Scenic garden waypoints ensuring Spirit walks over dry meadow, paths, and arched bridge
const WAYPOINTS: Array<[number, number]> = [
  [-7.8, 3.2], // West meadow near Rest Cottage approach
  [-6.8, -3.5], // South bridge approach
  [-6.4, -8.4], // Arched bridge crest
  [-5.3, -12.6], // North bridge landing
  [4.5, -10.8], // Lakeside sakura curve
  [10.2, -9.2], // Pavilion step approach
  [PAV_X, PAV_Z], // Lakeside Pavilion center
];

const IDLE_ROAM_SPOTS: Array<[number, number]> = [
  [-1.8, 4.4],
  [-6.4, -8.4], // Bridge overlook
  [1.2, -10.4],
  [-4.2, 8.6],
  [8.4, 5.2],
];

/**
 * Exact walkable surface elevation across garden terrain, arched footbridge,
 * Waterside Pavilion cedar deck, and Rest Cottage veranda.
 */
export function walkableFloorY(x: number, z: number): number {
  const ground = terrainHeightAt(x, z);

  // 1. Waterside Pavilion deck at (12.8, -7.8)
  const dPav = Math.hypot(x - PAV_X, z - PAV_Z);
  if (dPav < 2.25) {
    return terrainHeightAt(PAV_X, PAV_Z) + 0.70;
  }
  if (dPav < 3.85) {
    const t = Math.max(0, Math.min(1, (3.85 - dPav) / 1.6));
    return THREE.MathUtils.lerp(ground, terrainHeightAt(PAV_X, PAV_Z) + 0.70, t);
  }

  // 2. Rest Cottage veranda at (-11.4, 5.8)
  const dRest = Math.hypot(x - REST_X, z - REST_Z);
  if (dRest < 1.85) {
    return terrainHeightAt(REST_X, REST_Z) + 0.36;
  }
  if (dRest < 3.1) {
    const t = Math.max(0, Math.min(1, (3.1 - dRest) / 1.25));
    return THREE.MathUtils.lerp(ground, terrainHeightAt(REST_X, REST_Z) + 0.36, t);
  }

  // 3. Arched Timber Footbridge at (-6.4, 0.18, -8.4), rotation.y = 0.24, span = 7.6
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

export function createParadiseSpirit(quality: ParadiseQualityProfile): ParadiseSpiritHandle {
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

  // Materials (jade-silk outer robe, warm cream inner silk, skin, dark hair, brushed gold)
  const outerRobeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3f8f78,
      roughness: 0.62,
      metalness: 0.06,
      emissive: new THREE.Color(0x16382d),
      emissiveIntensity: 0.18,
    })
  );
  const innerSilkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4eee2,
      roughness: 0.56,
      metalness: 0.04,
    })
  );
  const sashGoldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3b963,
      roughness: 0.34,
      metalness: 0.68,
      emissive: new THREE.Color(0x705118),
      emissiveIntensity: 0.22,
    })
  );
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbe5d4,
      roughness: 0.65,
      metalness: 0.01,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d2331,
      roughness: 0.45,
      metalness: 0.1,
    })
  );
  const eyeGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9ef5db,
      emissive: new THREE.Color(0x69f0c8),
      emissiveIntensity: 1.4,
      roughness: 0.2,
    })
  );
  const haloMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xbefbe4,
      emissive: new THREE.Color(0x62ebc2),
      emissiveIntensity: 1.15,
      roughness: 0.2,
      transparent: true,
      opacity: 0.72,
    })
  );

  // Root body rig (bottom at local y = 0)
  const rig = new THREE.Group();
  group.add(rig);

  // Articulated legs (pivoted at hip y = 0.54)
  const legGeo = trackGeo(new THREE.CapsuleGeometry(0.052, 0.34, 4, 8));
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.08, 0.54, 0);
  const leftLeg = new THREE.Mesh(legGeo, innerSilkMat);
  leftLeg.position.y = -0.22;
  leftLegPivot.add(leftLeg);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.08, 0.54, 0);
  const rightLeg = new THREE.Mesh(legGeo, innerSilkMat);
  rightLeg.position.y = -0.22;
  rightLegPivot.add(rightLeg);
  rig.add(leftLegPivot, rightLegPivot);

  // Lower flared silk hakama / skirt (seated from y=0.14 to y=0.72)
  const skirtGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.34, 0.62, 16, 1, false));
  const skirt = new THREE.Mesh(skirtGeo, outerRobeMat);
  skirt.position.y = 0.43;
  skirt.castShadow = quality.enableShadows;
  rig.add(skirt);

  // Inner pale hem trim
  const hemTrim = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.325, 0.355, 0.08, 16)), innerSilkMat);
  hemTrim.position.y = 0.14;
  rig.add(hemTrim);

  // Torso & golden obi sash
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.72, 0);
  rig.add(torsoPivot);

  const torso = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.175, 0.44, 14)), innerSilkMat);
  torso.position.y = 0.22;
  torso.castShadow = quality.enableShadows;
  torsoPivot.add(torso);

  const vest = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.155, 0.188, 0.34, 14)), outerRobeMat);
  vest.position.y = 0.19;
  torsoPivot.add(vest);

  const sash = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.184, 0.184, 0.11, 14)), sashGoldMat);
  sash.position.y = 0.04;
  torsoPivot.add(sash);

  // Flowing rear ribbon tails
  const ribbonGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.46, 0.02));
  const ribbonLeft = new THREE.Mesh(ribbonGeo, sashGoldMat);
  ribbonLeft.position.set(-0.07, -0.18, -0.18);
  ribbonLeft.rotation.x = 0.24;
  ribbonLeft.rotation.z = -0.12;
  const ribbonRight = new THREE.Mesh(ribbonGeo, sashGoldMat);
  ribbonRight.position.set(0.07, -0.18, -0.18);
  ribbonRight.rotation.x = 0.24;
  ribbonRight.rotation.z = 0.12;
  torsoPivot.add(ribbonLeft, ribbonRight);

  // Articulated arms with wide draped spirit sleeves
  const sleeveGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.11, 0.36, 10));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.044, 8, 8));

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.2, 0.38, 0);
  const leftSleeve = new THREE.Mesh(sleeveGeo, outerRobeMat);
  leftSleeve.position.y = -0.16;
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.y = -0.35;
  leftArmPivot.add(leftSleeve, leftHand);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.2, 0.38, 0);
  const rightSleeve = new THREE.Mesh(sleeveGeo, outerRobeMat);
  rightSleeve.position.y = -0.16;
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.y = -0.35;
  rightArmPivot.add(rightSleeve, rightHand);
  torsoPivot.add(leftArmPivot, rightArmPivot);

  // Articulated Head, Hair Bun, Luminous Eyes & Golden Hairpin
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.47, 0);
  torsoPivot.add(headPivot);

  const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.145, 16, 14)), skinMat);
  head.position.y = 0.12;
  head.castShadow = quality.enableShadows;
  headPivot.add(head);

  const hairCap = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.156, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    hairMat
  );
  hairCap.position.set(0, 0.135, -0.015);
  hairCap.rotation.x = -0.18;
  headPivot.add(hairCap);

  const hairBun = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.068, 10, 10)), hairMat);
  hairBun.position.set(0, 0.27, -0.07);
  headPivot.add(hairBun);

  const hairPin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 6)), sashGoldMat);
  hairPin.position.set(0, 0.27, -0.07);
  hairPin.rotation.z = Math.PI * 0.42;
  headPivot.add(hairPin);

  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.019, 8, 8));
  const leftEye = new THREE.Mesh(eyeGeo, eyeGlowMat);
  leftEye.position.set(-0.048, 0.12, 0.128);
  const rightEye = new THREE.Mesh(eyeGeo, eyeGlowMat);
  rightEye.position.set(0.048, 0.12, 0.128);
  headPivot.add(leftEye, rightEye);

  // Floating Jade-Gold Aura Halo & Wisp Light
  const haloRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.26, 0.016, 8, 28)), haloMat);
  haloRing.position.set(0, 0.34, -0.14);
  torsoPivot.add(haloRing);

  const wispLight = new THREE.PointLight(0x7df5ce, 0.55, 6.5, 1.8);
  wispLight.position.set(0, 1.35, 0.2);
  rig.add(wispLight);

  // Invisible slightly wider hit collider for effortless clicking/tapping
  const hitTarget = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 1.65, 8)),
    trackMat(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.position.y = 0.84;
  hitTarget.userData.spiritClick = true;
  rig.add(hitTarget);

  // Spirit locomotion state
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
    // Detect state transition to start pathing cleanly
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
      // Walk briskly along garden waypoints -> Pavilion
      const wp = WAYPOINTS[Math.min(routeIndex, WAYPOINTS.length - 1)];
      tmpTarget.set(wp[0], walkableFloorY(wp[0], wp[1]), wp[1]);
      const d = Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z);
      if (d < 0.55) {
        if (routeIndex < WAYPOINTS.length - 1) {
          routeIndex++;
        } else {
          routeActive = false;
          currentVisualState = 'working_in_pavilion';
        }
      }
      if (routeActive) {
        moveSpeed = 3.85;
        currentVisualState = routeIndex >= WAYPOINTS.length - 1 ? 'entering_pavilion' : 'woken_approaching';
      } else {
        // Arrived inside pavilion: turn gently toward user camera
        tmpLook.subVectors(cameraPos, spiritPos);
        desiredYaw = Math.atan2(tmpLook.x, tmpLook.z);
        targetSwirl = 0.85;
        currentVisualState = 'working_in_pavilion';
      }
    } else if (targetState === 'working_in_pavilion' || targetState === 'presenting_result') {
      const distPav = Math.hypot(PAV_X - spiritPos.x, PAV_Z - spiritPos.z);
      if (distPav > 1.2) {
        // Gently walk into pavilion center
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
          if (Math.hypot(tmpTarget.x - spiritPos.x, tmpTarget.z - spiritPos.z) < 0.75) {
            routeIndex--;
          }
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
      // idle_explore: wander gently between scenic meadow & bridge spots
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

    // Apply horizontal locomotion
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

    // Articulated skeletal animation (walking stride vs pavilion hover/gesture vs resting)
    const walkPhase = elapsed * (moveSpeed > 2.4 ? 9.5 : 5.8);
    const isMoving = moveSpeed > 0.15;
    const isWorking = currentVisualState === 'working_in_pavilion' || currentVisualState === 'presenting_result';
    const isSleeping = currentVisualState === 'sleeping_in_house';

    const stride = isMoving ? Math.sin(walkPhase) * (moveSpeed > 2.4 ? 0.56 : 0.34) : 0;
    leftLegPivot.rotation.x = THREE.MathUtils.damp(leftLegPivot.rotation.x, stride, 10, dt);
    rightLegPivot.rotation.x = THREE.MathUtils.damp(rightLegPivot.rotation.x, -stride, 10, dt);

    const armTargetL = isMoving
      ? -stride * 0.65
      : isWorking
      ? -0.68 + Math.sin(elapsed * 2.8) * 0.24
      : isSleeping
      ? 0.08
      : -0.12 + Math.sin(elapsed * 1.4) * 0.06;
    const armTargetR = isMoving
      ? stride * 0.65
      : isWorking
      ? -0.78 + Math.cos(elapsed * 2.6) * 0.26
      : isSleeping
      ? 0.08
      : -0.12 - Math.sin(elapsed * 1.4) * 0.06;

    leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, armTargetL, 8, dt);
    rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, armTargetR, 8, dt);
    leftArmPivot.rotation.z = THREE.MathUtils.damp(leftArmPivot.rotation.z, isWorking ? -0.32 : -0.1, 8, dt);
    rightArmPivot.rotation.z = THREE.MathUtils.damp(rightArmPivot.rotation.z, isWorking ? 0.32 : 0.1, 8, dt);

    // Subtle float lift in Pavilion or bob step while walking
    const floatLift = isWorking
      ? 0.14 + Math.sin(elapsed * 2.5) * 0.06
      : isMoving
      ? Math.abs(Math.sin(walkPhase)) * 0.045
      : isSleeping
      ? -0.08
      : Math.sin(elapsed * 1.7) * 0.025;
    rig.position.y = THREE.MathUtils.damp(rig.position.y, floatLift, 8, dt);

    // Gentle head look & halo spin
    headPivot.rotation.x = THREE.MathUtils.damp(
      headPivot.rotation.x,
      isSleeping ? 0.22 : Math.sin(elapsed * 1.3) * 0.05,
      6,
      dt
    );
    haloRing.rotation.z += dt * (isWorking ? 1.8 : 0.45);
    haloRing.scale.setScalar(isSleeping ? 0.55 : isWorking ? 1.18 + Math.sin(elapsed * 4) * 0.06 : 1.0);
    haloMat.opacity = isSleeping ? 0.18 : isWorking ? 0.92 : 0.62;
    eyeGlowMat.emissiveIntensity = isSleeping ? 0.25 : isWorking ? 2.1 : 1.25;

    // Ribbon flutter
    ribbonLeft.rotation.x = 0.24 + (isMoving ? 0.38 : 0) + Math.sin(elapsed * 4.2) * 0.12;
    ribbonRight.rotation.x = 0.24 + (isMoving ? 0.38 : 0) + Math.cos(elapsed * 4.0) * 0.12;

    // Lantern / wisp warmth brighter at night or when working
    const glowLevel = (0.45 + nightFactor * 0.85 + (isWorking ? 0.75 : 0)) * (isSleeping ? 0.35 : 1.0);
    wispLight.intensity = glowLevel;

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
    },
  };
}
