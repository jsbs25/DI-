import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { sampleWindField } from './paradiseEnvironment.ts';
import { terrainHeightAt } from './paradiseTerrain.ts';
import type { TreeCanopySource } from './paradiseFlora.ts';

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
    fogColor: THREE.Color,
    pavilionSwirl?: number
  ) => void;
  dispose: () => void;
}

interface LeafParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
  baseScale: number;
  phase: number;
  burst: boolean;
  resting: boolean;
  restTimer: number;
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

const DEFAULT_SAKURA_CANOPIES: TreeCanopySource[] = [
  { x: -12, y: 6.4, z: 4, radius: 4.0, kind: 'sakura' },
  { x: 10, y: 6.8, z: -3, radius: 4.4, kind: 'sakura' },
  { x: -5, y: 6.2, z: -12, radius: 3.8, kind: 'sakura' },
  { x: 14, y: 6.5, z: 7, radius: 4.1, kind: 'sakura' },
];

const DEFAULT_GINKGO_CANOPIES: TreeCanopySource[] = [
  { x: 8, y: 7.4, z: 11, radius: 4.2, kind: 'ginkgo' },
  { x: -15, y: 7.2, z: -6, radius: 4.0, kind: 'ginkgo' },
  { x: 16, y: 7.6, z: -10, radius: 4.3, kind: 'ginkgo' },
  { x: -6, y: 7.0, z: 15, radius: 3.7, kind: 'ginkgo' },
];

export function createParadiseWeatherFX(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet,
  treeCanopies: TreeCanopySource[] = []
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

  const sakuraSources = treeCanopies.filter((c) => c.kind === 'sakura');
  const ginkgoSources = treeCanopies.filter((c) => c.kind === 'ginkgo');
  const activeSakuraSources = sakuraSources.length > 0 ? sakuraSources : DEFAULT_SAKURA_CANOPIES;
  const activeGinkgoSources = ginkgoSources.length > 0 ? ginkgoSources : DEFAULT_GINKGO_CANOPIES;

  // =========================================================================
  // 1. Directional Wind-Tilted Rain Streaks (InstancedMesh)
  // =========================================================================
  const rainCount = quality.rainCount;
  const rainGeo = trackGeo(new THREE.PlaneGeometry(0.02, 0.76));
  const rainMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.4,
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
    rainOffsets[i * 3] = (Math.random() - 0.5) * 48;
    rainOffsets[i * 3 + 1] = Math.random() * 22;
    rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * 48;
    rainSpeeds[i] = 17 + Math.random() * 9;
  }
  group.add(rainMesh);

  // =========================================================================
  // 2. Aerodynamic Thin-Plate Petals & Ginkgo Leaves Shedding From Real Crowns
  // =========================================================================
  const buildCurvedQuad = (w: number, h: number, cup: number) => {
    const g = trackGeo(new THREE.PlaneGeometry(w, h, 2, 2));
    const attr = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      const px = attr.getX(i);
      const py = attr.getY(i);
      attr.setZ(i, (px * px + py * py) * cup);
    }
    g.computeVertexNormals();
    return g;
  };

  const petalGeo = buildCurvedQuad(0.145, 0.145, 1.45);
  const petalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sakuraPetalTex,
      alphaTest: 0.28,
      color: 0xffffff,
      roughness: 0.54,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );

  const ginkgoGeo = buildCurvedQuad(0.225, 0.225, 0.95);
  const ginkgoMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.ginkgoLeafTex,
      alphaTest: 0.28,
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );

  const petalCount = quality.petalCount;
  const ginkgoCount = quality.ginkgoLeafCount;
  const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  const ginkgoMesh = new THREE.InstancedMesh(ginkgoGeo, ginkgoMat, ginkgoCount);
  petalMesh.frustumCulled = false;
  ginkgoMesh.frustumCulled = false;

  const petals: LeafParticle[] = [];
  const ginkgoLeaves: LeafParticle[] = [];
  const tmpColor = new THREE.Color();

  // Natural pale ivory-blush sakura petals (no pink filter wash) & warm autumn ginkgo gold
  const sakuraColors = [0xffffff, 0xfff5f8, 0xffdde7, 0xfac8d7];
  const ginkgoColors = [0xffffff, 0xffe87d, 0xffd043, 0xeea922];

  const spawnInCanopy = (
    p: LeafParticle,
    sources: TreeCanopySource[],
    initialSpread: boolean
  ) => {
    const src = sources[Math.floor(Math.random() * sources.length)];
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rad = src.radius * (0.35 + Math.pow(Math.random(), 0.65) * 0.72);
    const sinPhi = Math.sin(phi);
    const sx = src.x + Math.cos(theta) * sinPhi * rad;
    const sy = Math.max(2.0, src.y + Math.cos(phi) * rad * 0.55);
    const sz = src.z + Math.sin(theta) * sinPhi * rad;

    p.pos.set(sx, initialSpread ? Math.max(0.6, sy - Math.random() * 4.5) : sy, sz);
    p.vel.set(0.3 + Math.random() * 0.5, -0.18 - Math.random() * 0.25, (Math.random() - 0.5) * 0.35);
    p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    p.scale = p.baseScale;
    p.burst = false;
    p.resting = false;
    p.restTimer = 0;
  };

  const initField = (
    list: LeafParticle[],
    mesh: THREE.InstancedMesh,
    count: number,
    palette: number[],
    baseScale: number,
    sources: TreeCanopySource[]
  ) => {
    for (let i = 0; i < count; i++) {
      const s = baseScale * (0.72 + Math.random() * 0.64);
      const particle: LeafParticle = {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 2.8,
          (Math.random() - 0.5) * 2.2
        ),
        scale: s,
        baseScale: s,
        phase: Math.random() * Math.PI * 2,
        burst: false,
        resting: false,
        restTimer: 0,
      };
      if (i < 2) {
        // Only 1-2 petals/leaves begin airborne; others wait quietly before occasionally drifting
        spawnInCanopy(particle, sources, true);
      } else {
        particle.pos.set(0, -60, 0);
        particle.vel.set(0, 0, 0);
        particle.scale = 0.001;
        particle.resting = true;
        particle.restTimer = 2.5 + i * 2.8 + Math.random() * 4.5;
      }
      list.push(particle);
      tmpColor.setHex(palette[i % palette.length]);
      mesh.setColorAt(i, tmpColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  initField(petals, petalMesh, petalCount, sakuraColors, 1.0, activeSakuraSources);
  initField(ginkgoLeaves, ginkgoMesh, ginkgoCount, ginkgoColors, 1.05, activeGinkgoSources);

  let burstCursorP = 0;
  let burstCursorG = 0;
  const emitPetalBurst = (worldPos: THREE.Vector3) => {
    const burstAmt = Math.min(4, petalCount);
    for (let k = 0; k < burstAmt; k++) {
      const p = petals[burstCursorP];
      burstCursorP = (burstCursorP + 1) % petalCount;
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.0 + Math.random() * 2.0;
      p.pos.set(
        worldPos.x + (Math.random() - 0.5) * 1.2,
        Math.max(0.45, worldPos.y + 0.35 + Math.random() * 0.7),
        worldPos.z + (Math.random() - 0.5) * 1.2
      );
      p.vel.set(Math.cos(ang) * spd, 1.3 + Math.random() * 1.8, Math.sin(ang) * spd);
      p.scale = p.baseScale;
      p.resting = false;
      p.burst = true;
    }
    const burstG = Math.min(3, ginkgoCount);
    for (let k = 0; k < burstG; k++) {
      const g = ginkgoLeaves[burstCursorG];
      burstCursorG = (burstCursorG + 1) % ginkgoCount;
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.1 + Math.random() * 2.5;
      g.pos.set(
        worldPos.x + (Math.random() - 0.5) * 1.5,
        Math.max(0.45, worldPos.y + 0.35 + Math.random() * 0.8),
        worldPos.z + (Math.random() - 0.5) * 1.5
      );
      g.vel.set(Math.cos(ang) * spd, 1.4 + Math.random() * 2.1, Math.sin(ang) * spd);
      g.scale = g.baseScale;
      g.resting = false;
      g.burst = true;
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
      opacity: 0.22,
      depthWrite: false,
    })
  );

  for (let i = 0; i < quality.mistCount; i++) {
    const isWf = i < 6;
    const sp = new THREE.Sprite(mistMat.clone());
    materials.push(sp.material);

    const bx = isWf ? -19.2 + (Math.random() - 0.5) * 4.2 : (Math.random() - 0.5) * 46;
    const by = isWf ? 0.65 + Math.random() * 1.7 : 0.8 + Math.random() * 2.0;
    const bz = isWf ? -20.2 + (Math.random() - 0.5) * 3.4 : (Math.random() - 0.5) * 34 - 4;
    const baseScale = isWf ? 4.8 + Math.random() * 3.0 : 10 + Math.random() * 8;

    sp.position.set(bx, by, bz);
    sp.scale.set(baseScale * 1.65, baseScale * 0.56, 1);
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
  const tmpWind = new THREE.Vector3();

  const stepLeafLayer = (
    list: LeafParticle[],
    mesh: THREE.InstancedMesh,
    sources: TreeCanopySource[],
    totalCount: number,
    activeFraction: number,
    elapsed: number,
    dt: number,
    windStrength: number,
    rainIntensity: number,
    gravityTerminal: number,
    pavilionSwirl = 0
  ) => {
    const activeCount = Math.min(totalCount, Math.floor(totalCount * activeFraction));
    mesh.count = totalCount;
    const wetGravityScale = 1 + rainIntensity * 1.35;

    for (let i = 0; i < totalCount; i++) {
      const p = list[i];
      if (i >= activeCount && !p.burst && !p.resting) {
        dummy.position.set(0, -60, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      if (p.resting) {
        p.restTimer -= dt;
        if (p.pos.y > -20) {
          // Settle softly flat against terrain or drift gently on lake surface
          p.rot.x = THREE.MathUtils.damp(p.rot.x, -Math.PI * 0.5, 6, dt);
          p.rot.z = THREE.MathUtils.damp(p.rot.z, 0, 6, dt);
          if (p.pos.y <= 0.08) {
            p.pos.x += (0.12 + windStrength * 0.22) * dt;
          }
          // Stay visible briefly on ground (~2s), then hide cleanly while waiting for next gentle drift
          if (p.restTimer > 5.0) {
            const fadeOut = THREE.MathUtils.clamp((p.restTimer - 5.0) / 0.8, 0.001, 1.0);
            p.scale = p.baseScale * fadeOut;
          } else {
            p.pos.set(0, -60, 0);
            p.scale = 0.001;
          }
        } else {
          p.scale = 0.001;
        }

        if (p.restTimer <= 0) {
          spawnInCanopy(p, sources, false);
        }
      } else {
        sampleWindField(p.pos.x, p.pos.y, p.pos.z, elapsed, windStrength, tmpWind);

        if (p.burst) {
          p.vel.y -= 2.4 * dt;
          p.vel.lerp(tmpWind, Math.min(1, dt * 1.4));
          if (p.vel.y < -0.5) p.burst = false;
        } else {
          // Thin-plate aerodynamic cross-flow lift & flutter drag
          const cx = Math.cos(p.rot.x);
          const sx = Math.sin(p.rot.x);
          const cz = Math.cos(p.rot.z);
          const sz = Math.sin(p.rot.z);
          const nx = sz * cx;
          const ny = cz * cx;
          const nz = sx;

          const relX = tmpWind.x - p.vel.x;
          const relY = tmpWind.y - p.vel.y;
          const relZ = tmpWind.z - p.vel.z;
          const vDotN = relX * nx + relY * ny + relZ * nz;
          const dragCoeff = 2.6 + Math.abs(vDotN) * 1.35;

          // Aerodynamic drag pulls toward local wind field while flat face catches lift
          p.vel.x += (relX * dragCoeff - nx * vDotN * 1.45) * dt;
          p.vel.y += (-gravityTerminal * wetGravityScale + relY * 1.8 - ny * vDotN * 1.35) * dt;
          p.vel.z += (relZ * dragCoeff - nz * vDotN * 1.45) * dt;

          // Optional Pavilion Spirit Swirl: draw nearby petals into an ascending lotus vortex around (12.8, ~2.8, -7.8)
          if (pavilionSwirl > 0.05) {
            const dxP = 12.8 - p.pos.x;
            const dzP = -7.8 - p.pos.z;
            const distP = Math.hypot(dxP, dzP);
            if (distP < 10.5 && distP > 0.35) {
              const pull = pavilionSwirl * (1 - distP / 10.5) * 4.2;
              const invD = 1 / distP;
              // Tangential swirl + gentle upward thermal lift + soft inward draw
              p.vel.x += (-dzP * invD * 2.1 + dxP * invD * 0.85) * pull * dt;
              p.vel.z += (dxP * invD * 2.1 + dzP * invD * 0.85) * pull * dt;
              p.vel.y += Math.max(0, 3.4 - p.pos.y) * 0.65 * pull * dt;
            }
          }

          // Flutter rocking side-glide
          const rock = Math.sin(elapsed * 4.4 + p.phase) * 0.55;
          p.vel.x += rock * cz * dt;
          p.vel.z += Math.cos(elapsed * 3.7 + p.phase * 1.2) * 0.42 * dt;
          p.vel.y = Math.max(-2.4, Math.min(1.8, p.vel.y));
        }

        p.pos.addScaledVector(p.vel, dt);
        const aeroSpinScale = 0.75 + windStrength * 0.9;
        p.rot.x += (p.spin.x * aeroSpinScale + Math.sin(elapsed * 3.1 + p.phase) * 1.1) * dt;
        p.rot.y += p.spin.y * aeroSpinScale * dt;
        p.rot.z += (p.spin.z * aeroSpinScale + Math.cos(elapsed * 2.6 + p.phase) * 0.9) * dt;

        const floorY = Math.max(0.03, terrainHeightAt(p.pos.x, p.pos.z) + 0.03);
        if (p.pos.y <= floorY) {
          p.pos.y = floorY;
          p.resting = true;
          // 1.5-2.0s visible on ground, then 5-8s quiet pause before next occasional leaf
          p.restTimer = 6.5 + Math.random() * 6.5;
        } else if (Math.abs(p.pos.x) > 35 || p.pos.z < -30 || p.pos.z > 35) {
          p.pos.set(0, -60, 0);
          p.scale = 0.001;
          p.resting = true;
          p.restTimer = 4.5 + Math.random() * 6.0;
        }
      }

      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const update = (
    elapsed: number,
    dt: number,
    cameraTarget: THREE.Vector3,
    windStrength: number,
    rainIntensity: number,
    fogDensity: number,
    dayFactor: number,
    fogColor: THREE.Color,
    pavilionSwirl = 0
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
          rx = (Math.random() - 0.5) * 48;
        }
        if (rx > 24) rx -= 48;

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

    // 2. Occasional Sparse Sakura Petals & Golden Ginkgo Leaves (1-2 at a time)
    const rainSuppress = 1 - rainIntensity * 0.45;
    const activeFrac = THREE.MathUtils.clamp((0.4 + windStrength * 0.35) * rainSuppress, 0.25, 0.75);
    stepLeafLayer(
      petals,
      petalMesh,
      activeSakuraSources,
      petalCount,
      activeFrac,
      elapsed,
      dt,
      windStrength,
      rainIntensity,
      0.52,
      pavilionSwirl
    );
    stepLeafLayer(
      ginkgoLeaves,
      ginkgoMesh,
      activeGinkgoSources,
      ginkgoCount,
      activeFrac,
      elapsed,
      dt,
      windStrength,
      rainIntensity,
      0.62
    );

    // 3. Soft Morning Fog, Light Mist & Waterfall Plunge Spray
    const mistStrength = THREE.MathUtils.clamp((fogDensity - 0.004) * 55, 0.08, 1.0);
    for (const m of mistPuffs) {
      const sp = m.sprite;
      const mat = sp.material as THREE.SpriteMaterial;
      if (m.isWaterfallSpray) {
        const rise = (elapsed * m.driftSpeed + m.phase) % 2.4;
        sp.position.set(
          m.baseX + Math.sin(elapsed * 0.9 + m.phase) * 0.6,
          m.baseY + rise * 0.75,
          m.baseZ + Math.cos(elapsed * 0.8 + m.phase) * 0.55
        );
        const fade = Math.sin((rise / 2.4) * Math.PI);
        mat.opacity = (0.14 + rainIntensity * 0.14) * fade;
        mat.color.copy(fogColor).lerp(new THREE.Color(0xffffff), 0.55);
      } else {
        sp.position.x = m.baseX + Math.sin(elapsed * m.driftSpeed + m.phase) * 3.8;
        sp.position.z = m.baseZ + Math.cos(elapsed * m.driftSpeed * 0.8 + m.phase) * 2.2;
        mat.opacity = mistStrength * (0.12 + 0.16 * (1 - dayFactor * 0.4));
        mat.color.copy(fogColor).lerp(new THREE.Color(0xffffff), 0.3);
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
