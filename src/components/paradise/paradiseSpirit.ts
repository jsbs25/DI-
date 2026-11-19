import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { uiStateManager, type SpiritState } from '../../agent/uiStateManager.ts';
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
 * Open-source rigged & animated 3D Butterfly glTF model from GitHub
 * (includes skeletal 'Flying' and 'Idle' animations with textured wings).
 */
const BUTTERFLY_MODEL_URL = '/assets/models/butterfly.glb';
const TARGET_WINGSPAN_M = 0.96;

interface FlightWaypoint {
  x: number;
  z: number;
  hoverHeight: number;
  canPerch?: boolean;
}

/**
 * Scenic 3D garden flight waypoints over blossoms, meadows, and foreground talk perch.
 */
const FLIGHT_WAYPOINTS: ReadonlyArray<FlightWaypoint> = [
  { x: -10.8, z: 5.6, hoverHeight: 0.72, canPerch: true }, // 0: rest house blossom perch
  { x: -6.8, z: 6.8, hoverHeight: 1.55 },                  // 1: west flower meadow
  { x: -3.2, z: 7.4, hoverHeight: 1.38, canPerch: true },  // 2: south blossom bank
  { x: -1.1, z: 9.8, hoverHeight: 1.48 },                  // 3: foreground talk spot facing camera
  { x: 1.6, z: 10.6, hoverHeight: 1.68 },                  // 4: sunny foreground garden arc
  { x: 5.4, z: 9.2, hoverHeight: 1.42, canPerch: true },   // 5: east floral terrace
  { x: 8.6, z: 7.4, hoverHeight: 1.78 },                   // 6: east overlook breeze
  { x: 2.2, z: 4.8, hoverHeight: 1.95 },                   // 7: lotus lakeside breeze
];

const REST_WP_IDX = 0;
const TALK_WP_IDX = 3;
const ROAM_WP_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * Returns solid terrain / deck elevation at (x, z) so the butterfly glides gracefully above it.
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

  return Math.max(0.18, ground);
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(214, 244, 255, 0.92)');
  grad.addColorStop(0.32, 'rgba(128, 214, 255, 0.45)');
  grad.addColorStop(0.68, 'rgba(255, 224, 152, 0.16)');
  grad.addColorStop(1.0, 'rgba(128, 214, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSoftShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 58);
  grad.addColorStop(0.0, 'rgba(12, 22, 18, 0.34)');
  grad.addColorStop(0.55, 'rgba(12, 22, 18, 0.14)');
  grad.addColorStop(1.0, 'rgba(12, 22, 18, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lightweight procedural butterfly placeholder shown for the ~100ms while butterfly.glb loads.
 */
function createFallbackButterfly(track: <T extends { dispose: () => void }>(item: T) => T) {
  const root = new THREE.Group();
  const wingGeo = track(new THREE.ShapeGeometry(
    (() => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.18, 0.24, 0.48, 0.28, 0.44, 0.04);
      s.bezierCurveTo(0.40, -0.06, 0.26, -0.10, 0.28, -0.22);
      s.bezierCurveTo(0.26, -0.34, 0.08, -0.26, 0, -0.06);
      return s;
    })()
  ));
  const wingMat = track(
    new THREE.MeshStandardMaterial({
      color: '#5ec9ff',
      emissive: '#3896e8',
      emissiveIntensity: 0.45,
      roughness: 0.32,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
  );
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.scale.x = -1;
  root.add(rightWing, leftWing);

  const body = new THREE.Mesh(
    track(new THREE.CapsuleGeometry(0.025, 0.22, 4, 8)),
    track(new THREE.MeshStandardMaterial({ color: '#1b2b3d', roughness: 0.5 }))
  );
  body.rotation.x = Math.PI / 2;
  root.add(body);

  return { root, leftWing, rightWing };
}

export function createParadiseSpirit(quality: ParadiseQualityProfile): ParadiseSpiritHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  let isDisposed = false;

  const group = new THREE.Group();
  group.name = 'paradise_one_butterfly';

  // Soft projected ground shadow directly beneath the flying butterfly
  const shadowTex = track(createSoftShadowTexture());
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const shadowDisc = new THREE.Mesh(track(new THREE.CircleGeometry(0.42, 24)), shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  group.add(shadowDisc);

  // Flying body orientation pivot (yaw/pitch/roll banking in flight)
  const flightPivot = new THREE.Group();
  group.add(flightPivot);

  // Subtle luminous halo sprite behind butterfly for instant readability against sunlit foliage
  const glowTex = track(createGlowTexture());
  const haloMat = track(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: '#bfeaff',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.set(1.18, 1.18, 1);
  flightPivot.add(haloSprite);

  // Temporary fallback butterfly until the GitHub GLB finishes loading
  const fallback = createFallbackButterfly(track);
  flightPivot.add(fallback.root);

  // GLTF butterfly animation state
  let mixer: THREE.AnimationMixer | null = null;
  let flyingAction: THREE.AnimationAction | null = null;
  let idleAction: THREE.AnimationAction | null = null;
  let activeClip: 'flying' | 'idle' = 'flying';
  let loadedModel: THREE.Group | null = null;
  const wingMaterials: THREE.MeshStandardMaterial[] = [];

  const loader = new GLTFLoader();
  loader.load(
    BUTTERFLY_MODEL_URL,
    (gltf) => {
      if (isDisposed) {
        gltf.scene.traverse((obj: any) => {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m?.dispose?.());
          else obj.material?.dispose?.();
        });
        return;
      }

      const model = gltf.scene;
      // Measure bounds and normalize to a graceful companion wingspan
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxSpan = Math.max(size.x, size.z, 0.001);
      const scaleFactor = TARGET_WINGSPAN_M / maxSpan;
      model.scale.setScalar(scaleFactor);
      model.position.set(-center.x * scaleFactor, -center.y * scaleFactor, -center.z * scaleFactor);

      // Enhance materials for iridescent outdoor visibility & soft twilight radiance
      model.traverse((obj: any) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = false;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) {
            m.map.colorSpace = THREE.SRGBColorSpace;
            m.map.anisotropy = 8;
          }
          m.side = THREE.DoubleSide;
          if ('roughness' in m) m.roughness = Math.min(0.55, m.roughness ?? 0.42);
          if ('metalness' in m) m.metalness = Math.max(0.18, m.metalness ?? 0.22);
          if (m instanceof THREE.MeshStandardMaterial) {
            if (m.map && !m.emissiveMap) {
              m.emissiveMap = m.map;
            }
            m.emissive = new THREE.Color('#8cd6ff');
            m.emissiveIntensity = 0.24;
            wingMaterials.push(m);
          }
          m.needsUpdate = true;
        }
      });

      const modelHolder = new THREE.Group();
      // Tilt slightly forward-upward so the gorgeous dorsal wings are visible to the overlook camera
      modelHolder.rotation.x = 0.22;
      modelHolder.add(model);
      flightPivot.add(modelHolder);
      loadedModel = modelHolder;
      fallback.root.visible = false;

      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        const flyClip =
          gltf.animations.find((a) => /fly/i.test(a.name)) || gltf.animations[0];
        const idleClip =
          gltf.animations.find((a) => /idle/i.test(a.name)) || flyClip;

        flyingAction = mixer.clipAction(flyClip);
        flyingAction.setLoop(THREE.LoopRepeat, Infinity);
        flyingAction.play();

        if (idleClip && idleClip !== flyClip) {
          idleAction = mixer.clipAction(idleClip);
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
        }
      }
    },
    undefined,
    () => {
      // Keep graceful procedural fallback if model fails to load
    }
  );

  // Shimmering fairy wing-dust trail particles in world space (parented to group, updated cleanly)
  const dustCount = quality.tier === 'low' ? 18 : 32;
  const dustGeo = track(new THREE.BufferGeometry());
  const dustPositions = new Float32Array(dustCount * 3);
  const dustOffsets = new Float32Array(dustCount * 3);
  const dustPhases = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const ang = (i / dustCount) * Math.PI * 2;
    const rad = 0.24 + (i % 5) * 0.11;
    dustOffsets[i * 3] = Math.cos(ang) * rad;
    dustOffsets[i * 3 + 1] = ((i % 7) - 3) * 0.08;
    dustOffsets[i * 3 + 2] = Math.sin(ang) * rad;
    dustPhases[i] = i * 0.67;
    dustPositions[i * 3] = dustOffsets[i * 3];
    dustPositions[i * 3 + 1] = dustOffsets[i * 3 + 1];
    dustPositions[i * 3 + 2] = dustOffsets[i * 3 + 2];
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = track(
    new THREE.PointsMaterial({
      color: '#ffe8a8',
      size: 0.055,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const wingDust = new THREE.Points(dustGeo, dustMat);
  group.add(wingDust);

  // Soft warm-azure butterfly aura light (illuminates petals gently at dusk/night)
  const butterflyGlow = new THREE.PointLight('#bce8ff', 0.24, 5.2, 1.8);
  butterflyGlow.position.set(0, 0.15, 0);
  group.add(butterflyGlow);

  // Generous invisible click sphere so the user can effortlessly tap the butterfly anywhere
  const hitTarget = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.68, 12, 10)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  hitTarget.name = 'paradise_spirit_hit';
  group.add(hitTarget);

  // === Graceful 3D Butterfly Flight State ===
  let currentWpIdx = TALK_WP_IDX;
  let goalWpIdx = TALK_WP_IDX;
  let roamPauseTimer = 4.5;
  let isPerched = false;
  let currentYaw = 0;
  let currentPitch = 0;
  let currentRoll = 0;
  let greetingFlutterTimer = 1.6;
  let prevTargetState: SpiritState = 'idle_explore';

  const startWp = FLIGHT_WAYPOINTS[TALK_WP_IDX];
  const spiritPos = new THREE.Vector3(
    startWp.x,
    walkableFloorY(startWp.x, startWp.z) + startWp.hoverHeight,
    startWp.z
  );
  group.position.copy(spiritPos);

  const tmpGoal = new THREE.Vector3();
  const velocity = new THREE.Vector3();

  const setClip = (next: 'flying' | 'idle') => {
    if (activeClip === next || !flyingAction) return;
    activeClip = next;
    if (next === 'idle' && idleAction) {
      idleAction.reset().fadeIn(0.45).play();
      flyingAction.fadeOut(0.45);
    } else if (flyingAction) {
      flyingAction.reset().fadeIn(0.32).play();
      idleAction?.fadeOut(0.32);
    }
  };

  const handle: ParadiseSpiritHandle = {
    group,
    hitTarget,
    spiritPos,
    pavilionSwirlIntensity: 0,

    getHeadWorldPosition(out: THREE.Vector3): THREE.Vector3 {
      return out.set(spiritPos.x, spiritPos.y + 0.56, spiritPos.z);
    },

    update(elapsed, dt, targetState, cameraPos, nightFactor, _rainIntensity) {
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      let nextState: SpiritState = targetState;

      if (
        (targetState === 'woken_approaching' || targetState === 'presenting_result') &&
        prevTargetState !== targetState
      ) {
        greetingFlutterTimer = 1.5;
      }
      prevTargetState = targetState;

      const snap = uiStateManager.getSnapshot();
      const isSpeaking = Boolean(snap.spiritBubble?.speaking || snap.liveVoicePhase === 'speaking');
      const isThinking = targetState === 'working_in_pavilion' || snap.liveVoicePhase === 'thinking';
      const isLiveActive = Boolean(snap.liveVoiceActive || snap.voiceListening);

      const wantsForegroundTalk =
        isLiveActive ||
        isSpeaking ||
        isThinking ||
        targetState === 'woken_approaching' ||
        targetState === 'entering_pavilion' ||
        targetState === 'presenting_result';

      if (targetState === 'sleeping_in_house' || targetState === 'returning_to_rest') {
        goalWpIdx = REST_WP_IDX;
      } else if (wantsForegroundTalk) {
        goalWpIdx = TALK_WP_IDX;
      } else {
        if (currentWpIdx === goalWpIdx) {
          roamPauseTimer -= safeDt;
          if (roamPauseTimer <= 0) {
            const candidates = ROAM_WP_CHOICES.filter((idx) => idx !== currentWpIdx);
            goalWpIdx = candidates[Math.floor(Math.random() * candidates.length)];
            roamPauseTimer = 4.8 + Math.random() * 4.5;
          }
        }
      }

      const wp = FLIGHT_WAYPOINTS[goalWpIdx];
      const baseGroundY = walkableFloorY(wp.x, wp.z);

      // Gentle figure-8 fluttering around the target hover point when roaming or conversing
      const orbitAmp = wantsForegroundTalk ? 0.24 : isPerched ? 0.02 : 0.46;
      const orbitFreq = wantsForegroundTalk ? 1.15 : 0.72;
      const swayX = Math.sin(elapsed * orbitFreq) * orbitAmp;
      const swayZ = Math.sin(elapsed * orbitFreq * 2) * (orbitAmp * 0.45);
      const bobY = isPerched
        ? Math.sin(elapsed * 2.2) * 0.015
        : Math.sin(elapsed * 2.8) * 0.14 + Math.cos(elapsed * 1.4) * 0.06;

      tmpGoal.set(
        wp.x + swayX,
        baseGroundY + (isPerched ? 0.34 : wp.hoverHeight) + bobY,
        wp.z + swayZ
      );

      const dx = tmpGoal.x - spiritPos.x;
      const dy = tmpGoal.y - spiritPos.y;
      const dz = tmpGoal.z - spiritPos.z;
      const dist = Math.hypot(dx, dy, dz);

      const maxSpeed = wantsForegroundTalk ? 4.4 : 2.35;
      const desiredSpeed = Math.min(maxSpeed, dist * (wantsForegroundTalk ? 2.8 : 1.45));

      if (dist > 0.06) {
        velocity.x = THREE.MathUtils.damp(velocity.x, (dx / dist) * desiredSpeed, 4.8, safeDt);
        velocity.y = THREE.MathUtils.damp(velocity.y, (dy / dist) * desiredSpeed, 4.8, safeDt);
        velocity.z = THREE.MathUtils.damp(velocity.z, (dz / dist) * desiredSpeed, 4.8, safeDt);
      } else {
        velocity.multiplyScalar(Math.exp(-6 * safeDt));
      }

      spiritPos.addScaledVector(velocity, safeDt);

      // Ensure butterfly stays comfortably above terrain & water at all times
      const currentFloorY = walkableFloorY(spiritPos.x, spiritPos.z);
      const minClearanceY = currentFloorY + (isPerched ? 0.28 : 0.65);
      if (spiritPos.y < minClearanceY) {
        spiritPos.y = THREE.MathUtils.damp(spiritPos.y, minClearanceY, 8, safeDt);
      }

      const horizDistToWp = Math.hypot(wp.x - spiritPos.x, wp.z - spiritPos.z);
      if (horizDistToWp < 0.55) {
        currentWpIdx = goalWpIdx;
        if (targetState === 'woken_approaching' || targetState === 'entering_pavilion') {
          nextState = 'presenting_result';
        } else if (targetState === 'returning_to_rest') {
          nextState = 'sleeping_in_house';
        }
      }

      // Perch gently when sleeping or occasionally pausing on a blossom terrace
      const shouldPerch =
        !wantsForegroundTalk &&
        (targetState === 'sleeping_in_house' || (Boolean(wp.canPerch) && horizDistToWp < 0.65 && roamPauseTimer > 1.8));
      isPerched = shouldPerch;
      setClip(isPerched ? 'idle' : 'flying');

      group.position.copy(spiritPos);

      // Position soft contact shadow directly on the ground underneath the butterfly
      const altitude = Math.max(0.15, spiritPos.y - currentFloorY);
      shadowDisc.position.set(0, currentFloorY - spiritPos.y + 0.025, 0);
      const shadowScale = THREE.MathUtils.clamp(1.05 - altitude * 0.16, 0.42, 1.0);
      shadowDisc.scale.setScalar(shadowScale);
      shadowMat.opacity = THREE.MathUtils.clamp(0.36 - altitude * 0.08, 0.1, 0.34);

      // Orientation: bank into flight direction while travelling, face camera gracefully when hovering to talk
      const horizSpeed = Math.hypot(velocity.x, velocity.z);
      const toCamYaw = Math.atan2(cameraPos.x - spiritPos.x, cameraPos.z - spiritPos.z);
      let targetYaw = toCamYaw + Math.sin(elapsed * 1.1) * 0.16;
      if (horizSpeed > 0.65 && !wantsForegroundTalk) {
        targetYaw = Math.atan2(velocity.x, velocity.z);
      } else if (horizSpeed > 1.25 && wantsForegroundTalk) {
        targetYaw = Math.atan2(velocity.x, velocity.z);
      }

      const yawDiff = ((targetYaw - currentYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      currentYaw = lerpAngle(currentYaw, targetYaw, Math.min(1, safeDt * 5.2));
      const targetRoll = THREE.MathUtils.clamp(-yawDiff * 0.48, -0.45, 0.45);
      const targetPitch = THREE.MathUtils.clamp(velocity.y * 0.22, -0.28, 0.32) + (isSpeaking ? Math.sin(elapsed * 6.5) * 0.06 : 0);

      currentRoll = THREE.MathUtils.damp(currentRoll, targetRoll, 6.5, safeDt);
      currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 6.5, safeDt);

      flightPivot.rotation.set(currentPitch, currentYaw, currentRoll);

      if (greetingFlutterTimer > 0) {
        greetingFlutterTimer = Math.max(0, greetingFlutterTimer - safeDt);
      }

      // Advance real GLTF skeletal wing animations
      if (mixer) {
        const speedBoost =
          isPerched
            ? 0.55
            : isSpeaking
              ? 1.55
              : isThinking
                ? 1.35
                : greetingFlutterTimer > 0
                  ? 1.75
                  : THREE.MathUtils.clamp(0.95 + horizSpeed * 0.32, 0.9, 1.85);
        mixer.timeScale = speedBoost;
        mixer.update(safeDt);
      } else {
        // Fallback wing flap animation while GLB loads
        const flap = Math.sin(elapsed * (isSpeaking ? 18 : 13)) * 0.78;
        fallback.leftWing.rotation.y = flap;
        fallback.rightWing.rotation.y = -flap;
      }

      // Dynamic wing luminescence & iridescent glow across day, twilight, and speaking states
      const glowLevel = 0.24 + nightFactor * 0.52 + (isSpeaking ? 0.26 : 0) + (isThinking ? 0.16 : 0);
      for (let i = 0; i < wingMaterials.length; i++) {
        wingMaterials[i].emissiveIntensity = glowLevel;
      }
      haloMat.opacity = 0.26 + nightFactor * 0.34 + (isSpeaking ? 0.22 : 0);
      const haloScale = 1.08 + Math.sin(elapsed * 3.2) * 0.09 + (isSpeaking ? 0.18 : 0);
      haloSprite.scale.set(haloScale, haloScale, 1);

      // Fairy stardust trail swirling delicately around the wings
      const posAttr = dustGeo.attributes.position as THREE.BufferAttribute;
      const swirlRate = isSpeaking ? 1.5 : isThinking ? 1.85 : 0.78;
      for (let i = 0; i < dustCount; i++) {
        const ph = dustPhases[i] + elapsed * swirlRate;
        const ox = dustOffsets[i * 3];
        const oy = dustOffsets[i * 3 + 1];
        const oz = dustOffsets[i * 3 + 2];
        const cosP = Math.cos(ph * 0.55);
        const sinP = Math.sin(ph * 0.55);
        const trailX = -velocity.x * (0.04 + (i % 5) * 0.035);
        const trailY = -velocity.y * (0.04 + (i % 5) * 0.035);
        const trailZ = -velocity.z * (0.04 + (i % 5) * 0.035);
        posAttr.setXYZ(
          i,
          ox * cosP - oz * sinP + trailX,
          oy + Math.sin(ph * 1.4) * 0.12 + trailY,
          ox * sinP + oz * cosP + trailZ
        );
      }
      posAttr.needsUpdate = true;
      dustMat.opacity = 0.48 + nightFactor * 0.38 + (isSpeaking ? 0.16 : 0);

      butterflyGlow.intensity = 0.24 + nightFactor * 1.25 + (isSpeaking ? 0.42 : 0);
      handle.pavilionSwirlIntensity = isThinking ? 0.72 : 0;

      return nextState;
    },

    dispose() {
      isDisposed = true;
      if (mixer) {
        mixer.stopAllAction();
        mixer = null;
      }
      if (loadedModel) {
        loadedModel.traverse((obj: any) => {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m?.dispose?.());
          else obj.material?.dispose?.();
        });
        loadedModel = null;
      }
      for (const item of disposables) {
        item.dispose();
      }
    },
  };

  return handle;
}
