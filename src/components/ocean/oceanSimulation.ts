import * as THREE from 'three';
import { getSeabedHeight } from './oceanEnvironment.ts';
import type { ArticulatedCreatureRig, MarineCreaturesHandle } from './marineCreatures.ts';

export type ImpactFrequencyMode = 'normal' | 'rare' | 'off';

export type ImpactPhase = 'idle' | 'notice' | 'charge' | 'approach' | 'recover';

export interface GlassImpactEvent {
  uv: THREE.Vector2;
  worldPoint: THREE.Vector3;
  dirToCam: THREE.Vector3;
  strength: number;
  creatureKind: 'shark' | 'dolphin' | 'pelagic';
}

export interface OceanSimulationOptions {
  creatures: MarineCreaturesHandle;
  reducedMotion: boolean;
  onGlassImpact: (event: GlassImpactEvent) => void;
}

export interface OceanSimulationHandle {
  update: (
    elapsed: number,
    dt: number,
    camera: THREE.Camera,
    pointerNdc: THREE.Vector2,
    pointerActive: boolean,
    pointerSpeed: number
  ) => void;
  setImpactFrequency: (mode: ImpactFrequencyMode) => void;
  triggerImpactNow: (preferred?: 'shark' | 'dolphin' | 'pelagic') => boolean;
  getImpactPhase: () => ImpactPhase;
}

interface BoidState {
  count: number;
  pos: Float32Array;
  vel: Float32Array;
  homeBiasZ: number;
  minY: number;
  maxY: number;
  maxSpeed: number;
  minSpeed: number;
  neighborDist: number;
  sepDist: number;
  baseScale: number;
}

interface SoloSwimmerState {
  rig: ArticulatedCreatureRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  homeCenter: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  orbitAngle: number;
  orbitSpeed: number;
  cruisingSpeed: number;
  verticalAmp: number;
  phase: number;
}

export function createOceanSimulation({
  creatures,
  reducedMotion,
  onGlassImpact,
}: OceanSimulationOptions): OceanSimulationHandle {
  // Reusable zero-GC math scratchpads
  const _dummy = new THREE.Object3D();
  const _vA = new THREE.Vector3();
  const _vB = new THREE.Vector3();
  const _vC = new THREE.Vector3();
  const _sep = new THREE.Vector3();
  const _ali = new THREE.Vector3();
  const _coh = new THREE.Vector3();
  const _steer = new THREE.Vector3();
  const _pointerWorld = new THREE.Vector3(0, -1, -6);
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _lookMat = new THREE.Matrix4();
  const _targetQuat = new THREE.Quaternion();
  const _rollQuat = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  const _zAxis = new THREE.Vector3(0, 0, 1);

  // Initialize Baitfish Boids
  const initBoids = (
    count: number,
    homeBiasZ: number,
    minY: number,
    maxY: number,
    maxSpeed: number,
    minSpeed: number,
    neighborDist: number,
    sepDist: number,
    baseScale: number
  ): BoidState => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const cluster = i % 3;
      const cx = (cluster - 1) * 9.5;
      const cz = homeBiasZ + (cluster % 2) * -6;
      const px = cx + (Math.random() - 0.5) * 12;
      const pz = cz + (Math.random() - 0.5) * 10;
      const floor = getSeabedHeight(px, pz) + 1.3;
      const py = Math.max(floor, minY + Math.random() * (maxY - minY));
      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;

      const ang = Math.random() * Math.PI * 2;
      const spd = minSpeed + Math.random() * (maxSpeed - minSpeed) * 0.6;
      vel[i * 3] = Math.cos(ang) * spd;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      vel[i * 3 + 2] = Math.sin(ang) * spd;
    }
    return {
      count,
      pos,
      vel,
      homeBiasZ,
      minY,
      maxY,
      maxSpeed,
      minSpeed,
      neighborDist,
      sepDist,
      baseScale,
    };
  };

  const baitBoids = initBoids(
    creatures.baitfishInst.count,
    -7.5,
    -7.5,
    8.5,
    6.4,
    2.2,
    4.6,
    1.15,
    0.92
  );

  const tropBoids = initBoids(
    creatures.tropicalInst.count,
    -11.5,
    -10.2,
    1.5,
    4.2,
    1.5,
    4.8,
    1.45,
    1.05
  );

  // Initialize solo/pod swimmers
  const initSwimmers = (
    rigs: ArticulatedCreatureRig[],
    centerZ: number,
    rxBase: number,
    rzBase: number,
    yRange: [number, number],
    speedRange: [number, number]
  ): SoloSwimmerState[] =>
    rigs.map((rig, i) => {
      const ang = (i / Math.max(1, rigs.length)) * Math.PI * 2 + 0.3;
      const rx = rxBase + (i % 2) * 4.5;
      const rz = rzBase + (i % 3) * 3.0;
      const px = Math.cos(ang) * rx;
      const pz = centerZ + Math.sin(ang) * rz;
      const py = yRange[0] + ((i * 0.37) % 1) * (yRange[1] - yRange[0]);
      const dir = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).normalize();
      const spd = speedRange[0] + (i % 3) * ((speedRange[1] - speedRange[0]) * 0.4);
      const st: SoloSwimmerState = {
        rig,
        pos: new THREE.Vector3(px, py, pz),
        vel: dir.multiplyScalar(spd),
        quat: new THREE.Quaternion(),
        homeCenter: new THREE.Vector3(0, py, centerZ),
        radiusX: rx,
        radiusZ: rz,
        orbitAngle: ang,
        orbitSpeed: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.045),
        cruisingSpeed: spd,
        verticalAmp: 0.9 + (i % 2) * 0.65,
        phase: rig.phase,
      };
      rig.root.position.copy(st.pos);
      return st;
    });

  const pelagicStates = initSwimmers(creatures.pelagics, -10, 12, 9, [-5.5, 4.5], [3.6, 5.2]);
  const dolphinStates = initSwimmers(creatures.dolphins, -12, 16, 11, [-3.0, 6.5], [5.4, 6.8]);
  const turtleStates = initSwimmers(creatures.turtles, -9, 13, 8, [1.0, 7.5], [1.6, 2.2]);
  const sharkStates = initSwimmers(creatures.sharks, -24, 21, 12, [-4.5, 3.8], [3.8, 4.6]);
  const mantaStates = initSwimmers(creatures.mantas, -20, 18, 10, [-6.5, 2.5], [2.4, 3.1]);
  const jellyStates = initSwimmers(creatures.jellies, -11, 15, 11, [-6.0, 7.2], [0.45, 0.72]);

  // Whale deep abyssal patrol
  const whaleState: SoloSwimmerState = {
    rig: creatures.whale,
    pos: new THREE.Vector3(-34, 3.5, -52),
    vel: new THREE.Vector3(1.6, 0, 0.2),
    quat: new THREE.Quaternion(),
    homeCenter: new THREE.Vector3(0, 3.2, -52),
    radiusX: 38,
    radiusZ: 10,
    orbitAngle: Math.PI,
    orbitSpeed: 0.042,
    cruisingSpeed: 1.85,
    verticalAmp: 1.5,
    phase: 0.4,
  };

  // Octopus near foreground-right reef rock
  const octoBaseX = 7.4;
  const octoBaseZ = -9.2;
  const octoFloor = getSeabedHeight(octoBaseX, octoBaseZ) + 1.8;
  const octoState: SoloSwimmerState = {
    rig: creatures.octopus,
    pos: new THREE.Vector3(octoBaseX, octoFloor, octoBaseZ),
    vel: new THREE.Vector3(-0.6, 0.2, 0.3),
    quat: new THREE.Quaternion(),
    homeCenter: new THREE.Vector3(octoBaseX, octoFloor, octoBaseZ),
    radiusX: 3.4,
    radiusZ: 3.0,
    orbitAngle: 0.7,
    orbitSpeed: 0.22,
    cruisingSpeed: 1.1,
    verticalAmp: 0.9,
    phase: 0.8,
  };

  // --- Screen-Glass Impact Orchestration State ---
  let impactFrequency: ImpactFrequencyMode = 'normal';
  let impactPhase: ImpactPhase = 'idle';
  let impactTimer = reducedMotion ? 9999 : 11.5; // First surprise around ~11.5s after landing
  let phaseElapsed = 0;
  let chargerState: SoloSwimmerState | null = null;
  let chargerKind: 'shark' | 'dolphin' | 'pelagic' = 'shark';
  const glassTargetUv = new THREE.Vector2(0.5, 0.52);
  const glassWorldPoint = new THREE.Vector3();
  const chargerStartPos = new THREE.Vector3();
  let lastBurstCooldown = 0;

  const scheduleNextCountdown = () => {
    if (impactFrequency === 'off' || reducedMotion) {
      impactTimer = 99999;
    } else if (impactFrequency === 'rare') {
      impactTimer = 34 + Math.random() * 20;
    } else {
      impactTimer = 15 + Math.random() * 11;
    }
  };

  const pickCharger = (preferred?: 'shark' | 'dolphin' | 'pelagic'): {
    st: SoloSwimmerState | null;
    kind: 'shark' | 'dolphin' | 'pelagic';
  } => {
    const roll = Math.random();
    const kind: 'shark' | 'dolphin' | 'pelagic' =
      preferred ?? (roll < 0.45 ? 'shark' : roll < 0.75 ? 'dolphin' : 'pelagic');
    if (kind === 'shark' && sharkStates.length > 0) {
      return { st: sharkStates[Math.floor(Math.random() * sharkStates.length)], kind: 'shark' };
    }
    if (kind === 'dolphin' && dolphinStates.length > 0) {
      return { st: dolphinStates[Math.floor(Math.random() * dolphinStates.length)], kind: 'dolphin' };
    }
    if (pelagicStates.length > 0) {
      return { st: pelagicStates[Math.floor(Math.random() * pelagicStates.length)], kind: 'pelagic' };
    }
    return { st: null, kind: 'pelagic' };
  };

  const triggerImpactNow = (preferred?: 'shark' | 'dolphin' | 'pelagic'): boolean => {
    if (impactPhase !== 'idle' || reducedMotion) return false;
    const picked = pickCharger(preferred);
    if (!picked.st) return false;
    chargerState = picked.st;
    chargerKind = picked.kind;
    glassTargetUv.set(0.34 + Math.random() * 0.32, 0.38 + Math.random() * 0.24);
    impactPhase = 'notice';
    phaseElapsed = 0;
    return true;
  };

  // Orient +Z smoothly along velocity direction with subtle roll into turns
  const orientCreature = (
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    currQuat: THREE.Quaternion,
    dt: number,
    rollFactor = 0.25,
    turnRate = 5.5
  ) => {
    if (vel.lengthSq() < 0.0001) return;
    _vA.copy(vel).normalize();
    _vB.copy(pos).add(_vA);
    _lookMat.lookAt(_vB, pos, _up);
    _targetQuat.setFromRotationMatrix(_lookMat);

    // Subtle sideways bank proportional to horizontal X steering
    const bank = THREE.MathUtils.clamp(-_vA.x * rollFactor, -0.45, 0.45);
    _rollQuat.setFromAxisAngle(_zAxis, bank);
    _targetQuat.multiply(_rollQuat);

    currQuat.slerp(_targetQuat, Math.min(1, dt * turnRate));
  };

  // Update Boids array (3D Flocking + Seabed Floor Avoidance + Interactive Cursor Personality)
  const stepBoids = (
    b: BoidState,
    inst: THREE.InstancedMesh,
    phases: Float32Array,
    elapsed: number,
    dt: number,
    pointerActive: boolean,
    pointerSpeed: number,
    curiosityWeight: number,
    scatterWeight: number
  ) => {
    const n = b.count;
    const nSq = b.neighborDist * b.neighborDist;
    const sSq = b.sepDist * b.sepDist;

    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const px = b.pos[ix];
      const py = b.pos[ix + 1];
      const pz = b.pos[ix + 2];

      _sep.set(0, 0, 0);
      _ali.set(0, 0, 0);
      _coh.set(0, 0, 0);
      let neighCount = 0;
      let sepCount = 0;

      // Sample strided subset if large school for steady O(N) budget across laptops & mobile
      const stride = n > 90 ? 2 : 1;
      for (let j = i % stride; j < n; j += stride) {
        if (i === j) continue;
        const jx = j * 3;
        const dx = px - b.pos[jx];
        const dy = py - b.pos[jx + 1];
        const dz = pz - b.pos[jx + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nSq && d2 > 0.0001) {
          neighCount++;
          _ali.x += b.vel[jx];
          _ali.y += b.vel[jx + 1];
          _ali.z += b.vel[jx + 2];
          _coh.x += b.pos[jx];
          _coh.y += b.pos[jx + 1];
          _coh.z += b.pos[jx + 2];

          if (d2 < sSq) {
            sepCount++;
            const inv = 1 / Math.sqrt(d2);
            _sep.x += dx * inv;
            _sep.y += dy * inv;
            _sep.z += dz * inv;
          }
        }
      }

      _steer.set(0, 0, 0);

      if (neighCount > 0) {
        _ali.divideScalar(neighCount).normalize().multiplyScalar(b.maxSpeed);
        _ali.x -= b.vel[ix];
        _ali.y -= b.vel[ix + 1];
        _ali.z -= b.vel[ix + 2];
        _steer.addScaledVector(_ali, 0.95);

        _coh.divideScalar(neighCount);
        _coh.set(_coh.x - px, _coh.y - py, _coh.z - pz);
        if (_coh.lengthSq() > 0.01) {
          _coh.normalize().multiplyScalar(b.maxSpeed);
          _coh.x -= b.vel[ix];
          _coh.y -= b.vel[ix + 1];
          _coh.z -= b.vel[ix + 2];
          _steer.addScaledVector(_coh, 0.72);
        }
      }

      if (sepCount > 0) {
        _sep.divideScalar(sepCount).normalize().multiplyScalar(b.maxSpeed * 1.25);
        _steer.addScaledVector(_sep, 1.55);
      }

      // Gentle school wandering swirl wave so baitfish naturally split & curve organically
      const swirlAngle = elapsed * 0.45 + (i % 5) * 0.9;
      _steer.x += Math.cos(swirlAngle) * 0.65;
      _steer.z += Math.sin(swirlAngle) * 0.55;

      // Soft aquarium bounds + terrain clearance
      if (px > 18) _steer.x -= (px - 18) * 0.9;
      if (px < -18) _steer.x += (-18 - px) * 0.9;
      if (pz > 4.5) _steer.z -= (pz - 4.5) * 1.1;
      if (pz < -30) _steer.z += (-30 - pz) * 0.9;

      const floorY = getSeabedHeight(px, pz) + 1.25;
      const lowLimit = Math.max(b.minY, floorY);
      if (py < lowLimit) _steer.y += (lowLimit - py) * 2.8;
      if (py > b.maxY) _steer.y -= (py - b.maxY) * 1.9;

      // Authentic Mouse Interaction: Calm Orbit / Curiosity vs Fast Sweep Startle
      if (pointerActive) {
        const pdx = _pointerWorld.x - px;
        const pdy = _pointerWorld.y - py;
        const pdz = _pointerWorld.z - pz;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
        if (pDist < 15 && pDist > 0.2) {
          if (pointerSpeed > 1.75) {
            // Sudden hand/mouse sweep scatters fish radially!
            const burst = (1 - pDist / 15) * scatterWeight * Math.min(2.2, pointerSpeed * 0.55);
            _steer.x -= (pdx / pDist) * burst;
            _steer.y -= (pdy / pDist) * burst * 0.7;
            _steer.z -= (pdz / pDist) * burst;
          } else {
            // Calm cursor draws nearby small fish into an orbiting swirl around cursor
            const pull = (1 - pDist / 15) * curiosityWeight;
            if (pDist > 2.6) {
              _steer.x += (pdx / pDist) * pull;
              _steer.y += (pdy / pDist) * pull * 0.85;
              _steer.z += (pdz / pDist) * pull;
            }
            // Tangential orbit component around cursor
            _steer.x += (-pdz / pDist) * pull * 1.25;
            _steer.z += (pdx / pDist) * pull * 1.25;
          }
        }
      }

      // Integrate velocity
      b.vel[ix] += _steer.x * dt;
      b.vel[ix + 1] += _steer.y * dt;
      b.vel[ix + 2] += _steer.z * dt;

      // Clamp speed
      const spd = Math.hypot(b.vel[ix], b.vel[ix + 1], b.vel[ix + 2]);
      const clamped = Math.max(b.minSpeed, Math.min(b.maxSpeed, spd));
      if (spd > 0.0001) {
        const ratio = clamped / spd;
        b.vel[ix] *= ratio;
        b.vel[ix + 1] *= ratio;
        b.vel[ix + 2] *= ratio;
      }

      // Integrate position
      b.pos[ix] += b.vel[ix] * dt;
      b.pos[ix + 1] += b.vel[ix + 1] * dt;
      b.pos[ix + 2] += b.vel[ix + 2] * dt;

      // Update InstancedMesh matrix facing velocity direction (+Z forward)
      _dummy.position.set(b.pos[ix], b.pos[ix + 1], b.pos[ix + 2]);
      _dummy.lookAt(
        b.pos[ix] + b.vel[ix],
        b.pos[ix + 1] + b.vel[ix + 1],
        b.pos[ix + 2] + b.vel[ix + 2]
      );
      const sc = b.baseScale * (0.86 + ((i * 17) % 10) * 0.032);
      _dummy.scale.setScalar(sc);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);

      // Advance phase slightly with speed
      phases[i] += dt * (0.4 + clamped * 0.14);
    }
    inst.instanceMatrix.needsUpdate = true;
  };

  return {
    setImpactFrequency: (mode: ImpactFrequencyMode) => {
      impactFrequency = mode;
      if (impactPhase === 'idle') scheduleNextCountdown();
    },
    triggerImpactNow,
    getImpactPhase: () => impactPhase,
    update: (elapsed, rawDt, camera, pointerNdc, pointerActive, pointerSpeed) => {
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      if (lastBurstCooldown > 0) lastBurstCooldown -= dt;

      // Unproject cursor onto underwater midground plane (z = -6)
      if (pointerActive) {
        _rayOrigin.copy(camera.position);
        _vA.set(pointerNdc.x, pointerNdc.y, 0.5).unproject(camera);
        _rayDir.copy(_vA).sub(_rayOrigin).normalize();
        const planeZ = -6.0;
        const denom = Math.abs(_rayDir.z) > 0.05 ? _rayDir.z : -0.5;
        const t = THREE.MathUtils.clamp((planeZ - _rayOrigin.z) / denom, 6, 36);
        _pointerWorld.copy(_rayOrigin).addScaledVector(_rayDir, t);
      }

      // GPU tail shaders clock
      creatures.baitfishTimeUniform.value = elapsed;
      creatures.tropicalTimeUniform.value = elapsed;

      // 1. Update Fish Schools (Baitfish + Tropical Reef Fish)
      stepBoids(
        baitBoids,
        creatures.baitfishInst,
        creatures.baitfishPhases,
        elapsed,
        dt,
        pointerActive,
        pointerSpeed,
        4.6,
        9.2
      );
      stepBoids(
        tropBoids,
        creatures.tropicalInst,
        creatures.tropicalPhases,
        elapsed,
        dt,
        pointerActive,
        pointerSpeed,
        2.5,
        5.8
      );

      // 2. Impact Orchestrator State Machine
      if (impactPhase === 'idle' && impactFrequency !== 'off' && !reducedMotion) {
        impactTimer -= dt;
        if (impactTimer <= 0) {
          triggerImpactNow();
        }
      } else if (impactPhase !== 'idle' && chargerState) {
        phaseElapsed += dt;

        // Compute target 3D point just on the screen glass ahead of camera
        const ndcX = (glassTargetUv.x - 0.5) * 2;
        const ndcY = (glassTargetUv.y - 0.5) * 2;
        _vC.set(ndcX, ndcY, 0.5).unproject(camera);
        _rayDir.copy(_vC).sub(camera.position).normalize();
        const glassDist = chargerKind === 'shark' ? 3.2 : chargerKind === 'dolphin' ? 2.6 : 2.1;
        glassWorldPoint.copy(camera.position).addScaledVector(_rayDir, glassDist);

        if (impactPhase === 'notice') {
          // Creature notices user, turns nose cleanly toward glass
          const toGlass = _vA.copy(glassWorldPoint).sub(chargerState.pos).normalize();
          chargerState.vel.lerp(toGlass.multiplyScalar(2.0), dt * 4.5);
          chargerState.pos.addScaledVector(chargerState.vel, dt);
          orientCreature(chargerState.pos, chargerState.vel, chargerState.quat, dt, 0.15, 7.5);
          chargerState.rig.root.position.copy(chargerState.pos);
          chargerState.rig.root.quaternion.copy(chargerState.quat);
          creatures.animateRig(chargerState.rig, elapsed, 1.3);

          if (phaseElapsed >= 0.72) {
            chargerStartPos.copy(chargerState.pos);
            impactPhase = 'charge';
            phaseElapsed = 0;
          }
        } else if (impactPhase === 'charge' || impactPhase === 'approach') {
          const toGlass = _vA.copy(glassWorldPoint).sub(chargerState.pos);
          const dist = toGlass.length();
          toGlass.normalize();
          const rushSpeed = impactPhase === 'approach' ? 24.0 : 16.5;
          chargerState.vel.lerp(toGlass.multiplyScalar(rushSpeed), dt * 9.0);
          chargerState.pos.addScaledVector(chargerState.vel, dt);

          orientCreature(chargerState.pos, chargerState.vel, chargerState.quat, dt, 0.2, 12.0);
          chargerState.rig.root.position.copy(chargerState.pos);
          chargerState.rig.root.quaternion.copy(chargerState.quat);
          creatures.animateRig(chargerState.rig, elapsed, 3.0);

          if (impactPhase === 'charge' && dist < 8.5) {
            impactPhase = 'approach';
            phaseElapsed = 0;
          }
          if (dist < 1.35 || phaseElapsed > 1.75) {
            // BOOM — Glass Collision!
            const dirToCam = _vB.copy(camera.position).sub(chargerState.pos).normalize();
            const strength =
              chargerKind === 'shark' ? 1.0 : chargerKind === 'dolphin' ? 0.85 : 0.72;
            onGlassImpact({
              uv: glassTargetUv.clone(),
              worldPoint: glassWorldPoint.clone(),
              dirToCam: dirToCam.clone(),
              strength,
              creatureKind: chargerKind,
            });
            // Instant startled bounce-off impulse away from glass
            const sideBounce = chargerState.pos.x >= 0 ? 1 : -1;
            chargerState.vel.set(sideBounce * 7.5, 2.8, -11.5);
            impactPhase = 'recover';
            phaseElapsed = 0;
          }
        } else if (impactPhase === 'recover') {
          // Creature darts back into midground reef
          _vA.set(
            chargerState.pos.x >= 0 ? 12 : -12,
            0.5,
            chargerKind === 'shark' ? -24 : -14
          ).sub(chargerState.pos).normalize();
          chargerState.vel.lerp(_vA.multiplyScalar(8.5), dt * 2.5);
          chargerState.pos.addScaledVector(chargerState.vel, dt);
          orientCreature(chargerState.pos, chargerState.vel, chargerState.quat, dt, 0.35, 6.0);
          chargerState.rig.root.position.copy(chargerState.pos);
          chargerState.rig.root.quaternion.copy(chargerState.quat);
          creatures.animateRig(chargerState.rig, elapsed, 2.0);

          if (phaseElapsed >= 2.65) {
            impactPhase = 'idle';
            chargerState = null;
            scheduleNextCountdown();
          }
        }
      }

      // 3. Autonomous Swimmer Groups
      const updateGroup = (
        states: SoloSwimmerState[],
        followCursor: number,
        followBait: boolean,
        roll: number,
        speedAnim: number
      ) => {
        for (let i = 0; i < states.length; i++) {
          const s = states[i];
          if (s === chargerState && impactPhase !== 'idle') continue;

          s.orbitAngle += s.orbitSpeed * dt;
          // Target along dynamic smooth 3D Lissajous-style reef patrol
          const tx =
            s.homeCenter.x +
            Math.cos(s.orbitAngle) * s.radiusX +
            Math.sin(s.orbitAngle * 2.3 + s.phase) * 2.8;
          const tz =
            s.homeCenter.z +
            Math.sin(s.orbitAngle * 0.9) * s.radiusZ +
            Math.cos(s.orbitAngle * 1.7) * 2.2;
          const floor = getSeabedHeight(tx, tz) + 1.8;
          const ty = Math.max(
            floor,
            s.homeCenter.y + Math.sin(elapsed * 0.55 + s.phase) * s.verticalAmp
          );

          _vA.set(tx, ty, tz);

          // Dolphins gently steer toward baitfish centroid or rapid cursor trail
          if (followBait && baitBoids.count > 0) {
            const sampleIdx = (i * 19) % baitBoids.count;
            _vB.set(
              baitBoids.pos[sampleIdx * 3],
              baitBoids.pos[sampleIdx * 3 + 1],
              baitBoids.pos[sampleIdx * 3 + 2]
            );
            _vA.lerp(_vB, pointerActive && pointerSpeed > 1.5 ? 0.25 : 0.42);
          }

          if (pointerActive && followCursor > 0) {
            _vA.lerp(_pointerWorld, pointerSpeed > 1.6 ? followCursor * 1.3 : followCursor);
          }

          _steer.copy(_vA).sub(s.pos);
          if (_steer.lengthSq() > 0.01) {
            _steer.normalize().multiplyScalar(s.cruisingSpeed);
            s.vel.lerp(_steer, dt * 1.45);
          }
          s.pos.addScaledVector(s.vel, dt);

          const safeY = getSeabedHeight(s.pos.x, s.pos.z) + 1.3;
          if (s.pos.y < safeY) s.pos.y = safeY;

          orientCreature(s.pos, s.vel, s.quat, dt, roll, 3.8);
          s.rig.root.position.copy(s.pos);
          s.rig.root.quaternion.copy(s.quat);
          creatures.animateRig(s.rig, elapsed, speedAnim);
        }
      };

      updateGroup(pelagicStates, 0.14, false, 0.25, 1.15);
      updateGroup(dolphinStates, 0.28, true, 0.42, 1.35);
      updateGroup(turtleStates, 0.08, false, 0.12, 0.9);
      updateGroup(sharkStates, 0.06, false, 0.2, 1.0);
      updateGroup(mantaStates, 0.07, false, 0.32, 0.95);

      // 4. Jellyfish Vertical Pulse Drift
      for (let i = 0; i < jellyStates.length; i++) {
        const j = jellyStates[i];
        const pulse = Math.sin(elapsed * 2.1 + j.phase);
        j.pos.x =
          j.homeCenter.x + Math.cos(elapsed * 0.14 + j.phase) * j.radiusX * 0.55;
        j.pos.z =
          j.homeCenter.z + Math.sin(elapsed * 0.12 + j.phase * 1.4) * j.radiusZ * 0.5;
        j.pos.y += (Math.max(0, pulse) * 0.42 - 0.14) * dt;
        if (j.pos.y > 9.5) j.pos.y = -4.5;
        const floorY = getSeabedHeight(j.pos.x, j.pos.z) + 2.2;
        if (j.pos.y < floorY) j.pos.y = floorY;

        j.rig.root.position.copy(j.pos);
        j.rig.root.rotation.set(
          Math.sin(elapsed * 0.6 + j.phase) * 0.14,
          elapsed * 0.15 + j.phase,
          Math.cos(elapsed * 0.55 + j.phase) * 0.14
        );
        creatures.animateRig(j.rig, elapsed, 1.0);
      }

      // 5. Distant Abyssal Humpback Whale
      whaleState.orbitAngle += whaleState.orbitSpeed * dt;
      const wx = Math.sin(whaleState.orbitAngle) * whaleState.radiusX;
      const wz = whaleState.homeCenter.z + Math.cos(whaleState.orbitAngle) * whaleState.radiusZ;
      const wy = whaleState.homeCenter.y + Math.sin(elapsed * 0.22) * whaleState.verticalAmp;
      _vA.set(wx, wy, wz);
      whaleState.vel.copy(_vA).sub(whaleState.pos).divideScalar(Math.max(0.016, dt));
      whaleState.pos.copy(_vA);
      orientCreature(whaleState.pos, whaleState.vel, whaleState.quat, dt, 0.08, 1.5);
      whaleState.rig.root.position.copy(whaleState.pos);
      whaleState.rig.root.quaternion.copy(whaleState.quat);
      creatures.animateRig(whaleState.rig, elapsed, 0.8);

      // 6. Reef Octopus intermittent hover + jet burst
      octoState.orbitAngle += octoState.orbitSpeed * dt;
      const pulseJet = Math.max(0, Math.sin(elapsed * 0.85));
      octoState.pos.x = octoBaseX + Math.cos(octoState.orbitAngle) * 3.1;
      octoState.pos.z = octoBaseZ + Math.sin(octoState.orbitAngle) * 2.5;
      const oFloor = getSeabedHeight(octoState.pos.x, octoState.pos.z) + 1.4;
      octoState.pos.y = oFloor + pulseJet * 1.4 + Math.sin(elapsed * 1.7) * 0.35;
      octoState.rig.root.position.copy(octoState.pos);
      octoState.rig.root.rotation.y = -octoState.orbitAngle;
      creatures.animateRig(octoState.rig, elapsed, 1.0 + pulseJet);
    },
  };
}
