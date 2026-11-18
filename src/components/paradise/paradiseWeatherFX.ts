import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';

export interface ParadiseWeatherFXHandle {
  group: THREE.Group;
  emitPetalBurst: (worldPos: THREE.Vector3) => void;
  update: (
    elapsed: number,
    dt: number,
    cameraTarget: THREE.Vector3,
    windStrength: number,
    rainIntensity: number,
    fogDensity: number,
    dayFactor: number,
    fogColor: THREE.Color
  ) => void;
  dispose: () => void;
}

interface PetalParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
  life: number;
  burst: boolean;
}

interface MistPuff {
  sprite: THREE.Sprite;
  baseX: number;
  baseY: number;
  baseZ: number;
  driftSpeed: number;
  phase: number;
  isWaterfallSpray: boolean;
  baseScale: number;
}

export function createParadiseWeatherFX(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseWeatherFXHandle {
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

  // =========================================================================
  // 1. Directional Wind-Tilted Rain Streaks (InstancedMesh)
  // =========================================================================
  const rainCount = quality.rainCount;
  const rainGeo = trackGeo(new THREE.PlaneGeometry(0.022, 0.72));
  const rainMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  rainMesh.renderOrder = 8;

  const rainOffsets = new Float32Array(rainCount * 3);
  const rainSpeeds = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainOffsets[i * 3] = (Math.random() - 0.5) * 44;
    rainOffsets[i * 3 + 1] = Math.random() * 22;
    rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * 44;
    rainSpeeds[i] = 17 + Math.random() * 9;
  }
  group.add(rainMesh);

  // =========================================================================
  // 2. Drifting Cherry Blossom Petals & Leaves (Wind-carried + Interactive bursts)
  // =========================================================================
  const petalCount = quality.petalCount;
  const petalGeo = trackGeo(new THREE.PlaneGeometry(0.13, 0.09, 2, 1));
  const pPos = petalGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pPos.count; i++) {
    if (Math.abs(pPos.getX(i)) > 0.02) pPos.setZ(i, 0.02);
  }
  petalGeo.computeVertexNormals();

  const petalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );

  const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  petalMesh.frustumCulled = false;
  const petals: PetalParticle[] = [];
  const petalColor = new THREE.Color();
  const petalColors = [0xf7c5d3, 0xfee8ee, 0xf2b1c2, 0x8fb369];

  for (let i = 0; i < petalCount; i++) {
    petals.push({
      pos: new THREE.Vector3((Math.random() - 0.5) * 34, 1 + Math.random() * 9, (Math.random() - 0.5) * 32),
      vel: new THREE.Vector3(0.4 + Math.random() * 0.8, -0.5 - Math.random() * 0.45, (Math.random() - 0.5) * 0.5),
      rot: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      spin: new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5),
      scale: 0.75 + Math.random() * 0.65,
      life: 1,
      burst: false,
    });
    petalColor.setHex(petalColors[i % petalColors.length]);
    petalMesh.setColorAt(i, petalColor);
  }
  if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
  group.add(petalMesh);

  let burstCursor = 0;
  const emitPetalBurst = (worldPos: THREE.Vector3) => {
    const burstAmt = Math.min(28, petalCount);
    for (let k = 0; k < burstAmt; k++) {
      const p = petals[burstCursor];
      burstCursor = (burstCursor + 1) % petalCount;
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 2.6;
      p.pos.set(
        worldPos.x + (Math.random() - 0.5) * 1.4,
        Math.max(0.45, worldPos.y + 0.35 + Math.random() * 0.8),
        worldPos.z + (Math.random() - 0.5) * 1.4
      );
      p.vel.set(Math.cos(ang) * spd, 1.4 + Math.random() * 2.2, Math.sin(ang) * spd);
      p.burst = true;
    }
  };

  // =========================================================================
  // 3. Soft Valley Morning Mist & Waterfall Plunge Pool Spray
  // =========================================================================
  const mistPuffs: MistPuff[] = [];
  const mistMat = trackMat(
    new THREE.SpriteMaterial({
      map: textures.mistPuff,
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
  );

  for (let i = 0; i < quality.mistCount; i++) {
    const isWf = i < 5;
    const sp = new THREE.Sprite(mistMat.clone());
    materials.push(sp.material);

    const bx = isWf ? -19.2 + (Math.random() - 0.5) * 3.8 : (Math.random() - 0.5) * 38;
    const by = isWf ? 0.6 + Math.random() * 1.5 : 0.7 + Math.random() * 1.6;
    const bz = isWf ? -20.2 + (Math.random() - 0.5) * 3.2 : (Math.random() - 0.5) * 30 - 3;
    const baseScale = isWf ? 4.5 + Math.random() * 2.8 : 9 + Math.random() * 7;

    sp.position.set(bx, by, bz);
    sp.scale.set(baseScale * 1.6, baseScale * 0.55, 1);
    group.add(sp);

    mistPuffs.push({
      sprite: sp,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      driftSpeed: isWf ? 0.65 + Math.random() * 0.45 : 0.2 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      isWaterfallSpray: isWf,
      baseScale,
    });
  }

  const dummy = new THREE.Object3D();

  const update = (
    elapsed: number,
    dt: number,
    cameraTarget: THREE.Vector3,
    windStrength: number,
    rainIntensity: number,
    fogDensity: number,
    dayFactor: number,
    fogColor: THREE.Color
  ) => {
    // 1. Update Rain Streaks
    if (rainIntensity > 0.02) {
      rainMesh.visible = true;
      const activeCount = Math.max(40, Math.floor(rainCount * rainIntensity));
      rainMesh.count = activeCount;
      rainMat.opacity = Math.min(0.55, 0.16 + rainIntensity * 0.36);

      const windTiltX = windStrength * 0.38;
      const windVelX = windStrength * 8.5;

      for (let i = 0; i < activeCount; i++) {
        let rx = rainOffsets[i * 3] + windVelX * dt;
        let ry = rainOffsets[i * 3 + 1] - rainSpeeds[i] * (0.85 + rainIntensity * 0.45) * dt;
        const rz = rainOffsets[i * 3 + 2];

        if (ry < 0) {
          ry = 18 + Math.random() * 4;
          rx = (Math.random() - 0.5) * 44;
        }
        if (rx > 22) rx -= 44;

        rainOffsets[i * 3] = rx;
        rainOffsets[i * 3 + 1] = ry;

        dummy.position.set(cameraTarget.x + rx, ry, cameraTarget.z + rz);
        dummy.rotation.set(0, 0, -windTiltX);
        dummy.scale.set(1, 0.8 + rainIntensity * 0.75, 1);
        dummy.updateMatrix();
        rainMesh.setMatrixAt(i, dummy.matrix);
      }
      rainMesh.instanceMatrix.needsUpdate = true;
    } else {
      rainMesh.visible = false;
    }

    // 2. Update Drifting Petals & Leaves
    const activePetals = Math.min(petalCount, Math.floor(petalCount * (0.38 + windStrength * 0.62)));
    petalMesh.count = petalCount;
    for (let i = 0; i < petalCount; i++) {
      const p = petals[i];
      const isVisible = i < activePetals || p.burst;
      if (!isVisible) {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        petalMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      if (p.burst) {
        p.vel.y -= 2.4 * dt;
        p.vel.x *= Math.exp(-1.1 * dt);
        p.vel.z *= Math.exp(-1.1 * dt);
      } else {
        p.vel.x = (0.55 + windStrength * 3.1) + Math.sin(elapsed * 0.9 + i) * 0.45;
        p.vel.y = -0.45 - Math.abs(Math.sin(elapsed + i * 0.7)) * 0.25;
        p.vel.z = Math.cos(elapsed * 0.7 + i * 1.1) * (0.4 + windStrength * 0.9);
      }

      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;

      if (p.pos.y < 0.08 || p.pos.x > 22) {
        p.burst = false;
        p.pos.set(-18 + Math.random() * 32, 4.5 + Math.random() * 6.5, -14 + Math.random() * 28);
      }

      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      petalMesh.setMatrixAt(i, dummy.matrix);
    }
    petalMesh.instanceMatrix.needsUpdate = true;

    // 3. Update Valley Morning Fog & Waterfall Spray Mist
    const mistStrength = THREE.MathUtils.clamp((fogDensity - 0.004) / 0.018, 0, 1);
    for (const m of mistPuffs) {
      if (m.isWaterfallSpray) {
        const cycle = (elapsed * m.driftSpeed + m.phase) % 1;
        m.sprite.position.set(
          m.baseX + Math.sin(elapsed * 0.7 + m.phase) * 0.85,
          m.baseY + cycle * 1.4,
          m.baseZ + cycle * 1.8
        );
        m.sprite.material.opacity = Math.sin(cycle * Math.PI) * THREE.MathUtils.lerp(0.14, 0.28, dayFactor);
        m.sprite.material.color.copy(fogColor).lerp(new THREE.Color(0xffffff), 0.55);
      } else {
        m.sprite.visible = mistStrength > 0.04;
        if (!m.sprite.visible) continue;
        m.sprite.position.set(
          m.baseX + Math.sin(elapsed * 0.14 * m.driftSpeed + m.phase) * 5.2,
          m.baseY + Math.cos(elapsed * 0.2 + m.phase) * 0.22,
          m.baseZ + Math.cos(elapsed * 0.12 * m.driftSpeed + m.phase) * 3.4
        );
        m.sprite.material.opacity = mistStrength * (0.14 + 0.08 * Math.sin(elapsed * 0.3 + m.phase));
        m.sprite.material.color.copy(fogColor);
      }
    }
  };

  return {
    group,
    emitPetalBurst,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
