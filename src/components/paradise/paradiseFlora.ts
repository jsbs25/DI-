import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import {
  gardenPathFactor,
  lakeSignedDist,
  sampleTerrainBiome,
  streamDistanceAndFlow,
  terrainHeightAt,
} from './paradiseTerrain.ts';

export interface ParadiseFloraHandle {
  group: THREE.Group;
  uniforms: {
    uTime: { value: number };
    uWindStrength: { value: number };
    uWetness: { value: number };
    uDewAmount: { value: number };
    uNightFactor: { value: number };
    uPointerPos: { value: THREE.Vector3 };
    uPointerStrength: { value: number };
  };
  flowerSpots: THREE.Vector3[];
  update: (elapsed: number, windStrength: number, dewAmount: number, nightFactor: number) => void;
  dispose: () => void;
}

function seededRand(seedStart: number): () => number {
  let s = seedStart;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createParadiseFlora(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseFloraHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const rand = seededRand(4099);

  const uniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 0.22 },
    uWetness: { value: 0.0 },
    uDewAmount: { value: 0.05 },
    uNightFactor: { value: 0.0 },
    uPointerPos: { value: new THREE.Vector3(0, -20, 0) },
    uPointerStrength: { value: 0.0 },
  };

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Helper to inject distinct multi-frequency procedural wind + wetness sheen into PBR materials
  const applyBotanicalWind = (
    mat: THREE.MeshStandardMaterial,
    cfg: {
      freq: number;
      amp: number;
      heightFactor: number;
      pointerReactive?: boolean;
      nightBloomGlow?: boolean;
      cacheKey: string;
    }
  ) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindStrength = uniforms.uWindStrength;
      shader.uniforms.uWetness = uniforms.uWetness;
      shader.uniforms.uNightFactor = uniforms.uNightFactor;
      shader.uniforms.uPointerPos = uniforms.uPointerPos;
      shader.uniforms.uPointerStrength = uniforms.uPointerStrength;

      shader.vertexShader =
        `uniform float uTime;\nuniform float uWindStrength;\nuniform vec3 uPointerPos;\nuniform float uPointerStrength;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 instWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float phase = instWorld.x * 0.43 + instWorld.z * 0.37;
          #else
            vec4 instWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float phase = position.x * 0.35 + position.z * 0.35;
          #endif
          float hWeight = clamp(position.y * ${cfg.heightFactor.toFixed(3)}, 0.0, 2.2);
          float hBend = hWeight * hWeight;
          float gust = sin(uTime * ${cfg.freq.toFixed(2)} + phase + sin(phase * 0.5 + uTime * 0.4)) * 0.72
                     + cos(uTime * ${(cfg.freq * 1.73).toFixed(2)} - phase * 1.4) * 0.28;
          float windPush = (0.04 + uWindStrength * ${cfg.amp.toFixed(3)}) * hBend;
          transformed.x += (gust + uWindStrength * 0.48) * windPush;
          transformed.z += sin(uTime * ${(cfg.freq * 0.81).toFixed(2)} + phase * 1.3) * windPush * 0.65;
          ${
            cfg.pointerReactive
              ? `
          vec2 toPlant = instWorld.xz - uPointerPos.xz;
          float pDist = length(toPlant);
          float pInfluence = (1.0 - smoothstep(0.25, 2.9, pDist)) * uPointerStrength * hWeight;
          if (pInfluence > 0.001 && pDist > 0.001) {
            vec2 pushDir = toPlant / pDist;
            transformed.x += pushDir.x * pInfluence * 0.48;
            transformed.z += pushDir.y * pInfluence * 0.48;
            transformed.y -= pInfluence * 0.14;
          }
          `
              : ''
          }
          `
        );

      shader.fragmentShader =
        `uniform float uWetness;\nuniform float uNightFactor;\n` +
        shader.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            /* glsl */ `
            #include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, 0.18, uWetness * 0.8);
            `
          )
          .replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `
            #include <emissivemap_fragment>
            ${
              cfg.nightBloomGlow
                ? `totalEmissiveRadiance += diffuseColor.rgb * uNightFactor * 0.12;`
                : ''
            }
            `
          );
    };
    mat.customProgramCacheKey = () => cfg.cacheKey;
  };

  // =========================================================================
  // 1. Trees: Sakura Blossom Trees, Weeping Willows, and Mountain Pines
  // =========================================================================
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c4637,
      roughness: 0.88,
      metalness: 0.02,
      map: textures.barkMap,
    })
  );

  const blossomMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6cbd5,
      roughness: 0.68,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(blossomMat, {
    freq: 1.35,
    amp: 0.18,
    heightFactor: 0.25,
    cacheKey: 'paradise-blossom-wind',
  });

  const willowLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x557e42,
      roughness: 0.7,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(willowLeafMat, {
    freq: 1.05,
    amp: 0.34,
    heightFactor: 0.32,
    cacheKey: 'paradise-willow-wind',
  });

  const pineFoliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2c4f34,
      roughness: 0.82,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(pineFoliageMat, {
    freq: 0.78,
    amp: 0.14,
    heightFactor: 0.16,
    cacheKey: 'paradise-pine-wind',
  });

  // Build composite Sakura tree prototype (curved trunk + 3 boughs)
  const buildTrunkClusterGeo = (scaleH: number) => {
    const mainTrunk = new THREE.CylinderGeometry(0.14, 0.28, scaleH, 7);
    mainTrunk.translate(0, scaleH * 0.5, 0);
    const b1 = new THREE.CylinderGeometry(0.06, 0.13, scaleH * 0.62, 6);
    b1.rotateZ(0.55);
    b1.translate(scaleH * 0.2, scaleH * 0.72, 0.08);
    const b2 = new THREE.CylinderGeometry(0.06, 0.12, scaleH * 0.58, 6);
    b2.rotateZ(-0.52);
    b2.rotateY(1.2);
    b2.translate(-scaleH * 0.18, scaleH * 0.75, -0.1);
    const merged = BufferGeometryUtils.mergeGeometries([mainTrunk, b1, b2]);
    mainTrunk.dispose();
    b1.dispose();
    b2.dispose();
    return trackGeo(merged);
  };

  // Multi-puff organic blossom crown geometry
  const buildBlossomCrownGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    const offsets: Array<[number, number, number, number]> = [
      [0, 3.6, 0, 1.45],
      [1.05, 3.25, 0.45, 1.05],
      [-1.05, 3.35, -0.35, 1.1],
      [0.25, 3.9, -0.85, 1.0],
      [-0.35, 3.2, 0.95, 0.95],
    ];
    for (const [ox, oy, oz, r] of offsets) {
      const s = new THREE.IcosahedronGeometry(r, 1);
      s.scale(1.18, 0.74, 1.15);
      s.translate(ox, oy, oz);
      parts.push(s);
    }
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return trackGeo(merged);
  };

  // Willow drooping frond canopy
  const buildWillowCrownGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    const dome = new THREE.SphereGeometry(1.7, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
    dome.scale(1.15, 0.85, 1.15);
    dome.translate(0, 3.85, 0);
    parts.push(dome);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const frond = new THREE.ConeGeometry(0.32, 2.5, 5, 1, true);
      frond.rotateX(Math.PI); // hang downward
      frond.translate(Math.cos(ang) * 1.42, 2.75, Math.sin(ang) * 1.42);
      parts.push(frond);
    }
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return trackGeo(merged);
  };

  // Layered conifer pine geometry
  const buildPineCrownGeo = () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let tier = 0; tier < 3; tier++) {
      const c = new THREE.ConeGeometry(1.55 - tier * 0.34, 2.2 - tier * 0.25, 8);
      c.translate(0, 2.6 + tier * 1.25, 0);
      parts.push(c);
    }
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return trackGeo(merged);
  };

  const sakuraTrunkGeo = buildTrunkClusterGeo(3.2);
  const sakuraCrownGeo = buildBlossomCrownGeo();
  const willowCrownGeo = buildWillowCrownGeo();
  const pineTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.32, 3.4, 7).translate(0, 1.7, 0));
  const pineCrownGeo = buildPineCrownGeo();

  const sakuraSpots: Array<[number, number, number]> = [
    [-11.5, 7.2, 1.08],
    [-14.2, -3.5, 1.15],
    [16.2, 7.6, 1.05],
    [18.5, -5.2, 1.12],
    [-4.5, 14.5, 0.94],
    [10.2, 14.2, 1.0],
    [-16.8, -14.8, 1.06],
    [22.0, -15.5, 1.18],
  ];

  const willowSpots: Array<[number, number, number]> = [
    [-0.8, -9.8, 1.08],
    [11.4, 4.4, 1.02],
    [-11.2, -13.2, 0.96],
    [17.6, 1.8, 1.14],
    [-1.4, 5.2, 0.92],
  ];

  const pineSpots: Array<[number, number, number]> = [];
  const targetPines = Math.max(8, quality.treeCount - sakuraSpots.length - willowSpots.length);
  for (let i = 0; i < 120 && pineSpots.length < targetPines; i++) {
    const angle = rand() * Math.PI * 2;
    const rad = 23 + rand() * 34;
    const px = Math.cos(angle) * rad;
    const pz = Math.sin(angle) * rad;
    // Leave foreground camera vista open on +Z south side
    if (pz > 19 && Math.abs(px) < 22) continue;
    const sample = sampleTerrainBiome(px, pz);
    if (sample.height < 0.45 || sample.height > 9.5 || sample.pathWeight > 0.25) continue;
    pineSpots.push([px, pz, 0.9 + rand() * 0.65]);
  }

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  const placeTreeBatch = (
    spots: Array<[number, number, number]>,
    tGeo: THREE.BufferGeometry,
    cGeo: THREE.BufferGeometry,
    cMat: THREE.Material,
    tintRange: [number, number, number, number]
  ) => {
    if (!spots.length) return;
    const trunks = new THREE.InstancedMesh(tGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(cGeo, cMat, spots.length);
    trunks.castShadow = quality.enableShadows;
    trunks.receiveShadow = quality.enableShadows;
    crowns.castShadow = quality.enableShadows;
    crowns.receiveShadow = quality.enableShadows;

    spots.forEach(([tx, tz, sc], idx) => {
      const ty = terrainHeightAt(tx, tz) - 0.12;
      dummy.position.set(tx, ty, tz);
      dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.06);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);
      crowns.setMatrixAt(idx, dummy.matrix);

      tmpColor.setHSL(
        tintRange[0] + (rand() - 0.5) * tintRange[1],
        tintRange[2],
        tintRange[3] + (rand() - 0.5) * 0.08
      );
      crowns.setColorAt(idx, tmpColor);
    });

    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks, crowns);
  };

  placeTreeBatch(sakuraSpots, sakuraTrunkGeo, sakuraCrownGeo, blossomMat, [0.95, 0.05, 0.62, 0.84]);
  placeTreeBatch(willowSpots, sakuraTrunkGeo, willowCrownGeo, willowLeafMat, [0.27, 0.04, 0.42, 0.42]);
  placeTreeBatch(pineSpots, pineTrunkGeo, pineCrownGeo, pineFoliageMat, [0.35, 0.04, 0.42, 0.30]);

  // =========================================================================
  // 2. Hanging Wisteria Vines along Pavilion Eaves & Cliff Overhang
  // =========================================================================
  const vineGeo = trackGeo(new THREE.ConeGeometry(0.11, 1.15, 5).rotateX(Math.PI).translate(0, -0.58, 0));
  const vineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b82d6,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(vineMat, {
    freq: 0.88,
    amp: 0.42,
    heightFactor: 0.9,
    cacheKey: 'paradise-vine-pendulum',
  });

  const vineCount = 24;
  const vineMesh = new THREE.InstancedMesh(vineGeo, vineMat, vineCount);
  const pavBaseY = terrainHeightAt(12.8, -7.8);
  for (let i = 0; i < vineCount; i++) {
    if (i < 16) {
      // Around pavilion eaves
      const ang = (i / 16) * Math.PI * 2;
      const rad = 2.15 + (i % 2) * 0.28;
      dummy.position.set(12.8 + Math.cos(ang) * rad, pavBaseY + 3.28, -7.8 + Math.sin(ang) * rad);
    } else {
      // Hanging along waterfall rocky ledge
      dummy.position.set(-22.2 + (i - 16) * 0.9, 9.6 - (i % 3) * 0.5, -21.8 + (i % 2) * 0.7);
    }
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(0.85 + rand() * 0.4, 0.75 + rand() * 0.65, 0.85 + rand() * 0.4);
    dummy.updateMatrix();
    vineMesh.setMatrixAt(i, dummy.matrix);
    tmpColor.setHSL(0.74 + (rand() - 0.5) * 0.06, 0.48, 0.66 + (rand() - 0.5) * 0.14);
    vineMesh.setColorAt(i, tmpColor);
  }
  vineMesh.instanceMatrix.needsUpdate = true;
  if (vineMesh.instanceColor) vineMesh.instanceColor.needsUpdate = true;
  vineMesh.computeBoundingSphere();
  group.add(vineMesh);

  // =========================================================================
  // 3. Meadow Grass Blades (High-frequency wind waves + Pointer Parting)
  // =========================================================================
  const bladeGeo = trackGeo(new THREE.PlaneGeometry(0.11, 0.62, 1, 3));
  bladeGeo.translate(0, 0.31, 0);
  const bPos = bladeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bPos.count; i++) {
    const yNorm = bPos.getY(i) / 0.62;
    bPos.setX(i, bPos.getX(i) * (1 - yNorm * 0.86)); // taper to sharp blade tip
    bPos.setZ(i, Math.pow(yNorm, 2) * 0.14); // natural gentle arc
  }
  bladeGeo.computeVertexNormals();

  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c8b43,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  applyBotanicalWind(grassMat, {
    freq: 2.35,
    amp: 0.44,
    heightFactor: 1.55,
    pointerReactive: true,
    cacheKey: 'paradise-grass-wind',
  });

  const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, quality.grassCount);
  grassMesh.receiveShadow = quality.enableShadows;
  let placedGrass = 0;
  for (let attempt = 0; attempt < quality.grassCount * 4 && placedGrass < quality.grassCount; attempt++) {
    const gx = (rand() - 0.5) * 58;
    const gz = (rand() - 0.5) * 54 + 2;
    const s = sampleTerrainBiome(gx, gz);
    if (s.height < 0.16 || s.height > 4.2 || s.pathWeight > 0.38 || s.rockWeight > 0.42) continue;

    dummy.position.set(gx, s.height - 0.02, gz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const sc = 0.72 + rand() * 0.85;
    dummy.scale.set(sc * (0.85 + rand() * 0.3), sc, sc);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(placedGrass, dummy.matrix);

    tmpColor.setHSL(0.26 + (rand() - 0.5) * 0.07, 0.44 + rand() * 0.18, 0.34 + rand() * 0.18);
    grassMesh.setColorAt(placedGrass, tmpColor);
    placedGrass++;
  }
  grassMesh.count = placedGrass;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);

  // =========================================================================
  // 4. Multi-Species Wildflowers (Different frequency, pointer interaction, subtle night moonflower glow)
  // =========================================================================
  const stemPart = new THREE.CylinderGeometry(0.018, 0.024, 0.42, 4).translate(0, 0.21, 0);
  const blossomHead = new THREE.DodecahedronGeometry(0.11, 0).scale(1.15, 0.55, 1.15).translate(0, 0.45, 0);
  const flowerGeo = trackGeo(BufferGeometryUtils.mergeGeometries([stemPart, blossomHead]));
  stemPart.dispose();
  blossomHead.dispose();

  const flowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.58,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(flowerMat, {
    freq: 1.32,
    amp: 0.26,
    heightFactor: 1.8,
    pointerReactive: true,
    nightBloomGlow: true,
    cacheKey: 'paradise-flower-wind',
  });

  const flowerPalette = [0xf7b9c8, 0xfdf5e6, 0xf6d56f, 0xa8c6f7, 0xe895a8, 0xc9b4f2];
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, quality.flowerCount);
  const flowerSpots: THREE.Vector3[] = [];
  let placedFlowers = 0;

  for (let attempt = 0; attempt < quality.flowerCount * 5 && placedFlowers < quality.flowerCount; attempt++) {
    // Cluster blooms organically in foreground meadow & hillside terraces
    const clusterSeed = Math.floor(attempt / 7);
    const baseAngle = clusterSeed * 2.39996;
    const baseRad = 3.5 + (clusterSeed % 17) * 1.45;
    const cx = Math.cos(baseAngle) * baseRad;
    const cz = Math.sin(baseAngle) * baseRad + 4.5;
    const fx = cx + (rand() - 0.5) * 3.4;
    const fz = cz + (rand() - 0.5) * 3.4;

    const s = sampleTerrainBiome(fx, fz);
    if (s.height < 0.2 || s.height > 3.8 || s.pathWeight > 0.3 || s.rockWeight > 0.35) continue;

    dummy.position.set(fx, s.height - 0.02, fz);
    dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
    const sc = 0.78 + rand() * 0.65;
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(placedFlowers, dummy.matrix);

    tmpColor.setHex(flowerPalette[Math.floor(rand() * flowerPalette.length)]);
    flowerMesh.setColorAt(placedFlowers, tmpColor);

    if (flowerSpots.length < 48 && placedFlowers % 14 === 0) {
      flowerSpots.push(new THREE.Vector3(fx, s.height + 0.45, fz));
    }
    placedFlowers++;
  }
  flowerMesh.count = placedFlowers;
  flowerMesh.instanceMatrix.needsUpdate = true;
  if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
  flowerMesh.computeBoundingSphere();
  group.add(flowerMesh);

  // =========================================================================
  // 5. Waterside Reeds & Cattails (Resonant whip motion along riverbanks)
  // =========================================================================
  const reedShaft = new THREE.CylinderGeometry(0.015, 0.028, 1.35, 5).translate(0, 0.675, 0);
  const reedHead = new THREE.CapsuleGeometry(0.042, 0.16, 3, 5).translate(0, 1.24, 0);
  const reedGeo = trackGeo(BufferGeometryUtils.mergeGeometries([reedShaft, reedHead]));
  reedShaft.dispose();
  reedHead.dispose();

  const reedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x627c44,
      roughness: 0.76,
      metalness: 0.02,
    })
  );
  applyBotanicalWind(reedMat, {
    freq: 1.72,
    amp: 0.36,
    heightFactor: 0.75,
    pointerReactive: true,
    cacheKey: 'paradise-reed-wind',
  });

  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, quality.reedCount);
  let placedReeds = 0;
  for (let attempt = 0; attempt < quality.reedCount * 16 && placedReeds < quality.reedCount; attempt++) {
    const rx = (rand() - 0.5) * 44 + 2;
    const rz = (rand() - 0.5) * 38 - 3;
    const hy = terrainHeightAt(rx, rz);
    // Keep strictly on shallow banks around water level (y in [-0.24, +0.32])
    if (hy < -0.24 || hy > 0.34) continue;
    if (gardenPathFactor(rx, rz) > 0.35) continue;

    dummy.position.set(rx, hy - 0.05, rz);
    dummy.rotation.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1);
    dummy.scale.setScalar(0.78 + rand() * 0.55);
    dummy.updateMatrix();
    reedMesh.setMatrixAt(placedReeds, dummy.matrix);
    tmpColor.setHSL(0.21 + (rand() - 0.5) * 0.05, 0.36, 0.32 + rand() * 0.14);
    reedMesh.setColorAt(placedReeds, tmpColor);
    placedReeds++;
  }
  reedMesh.count = placedReeds;
  reedMesh.instanceMatrix.needsUpdate = true;
  if (reedMesh.instanceColor) reedMesh.instanceColor.needsUpdate = true;
  reedMesh.computeBoundingSphere();
  group.add(reedMesh);

  // =========================================================================
  // 6. Floating Lotus Pads & Water Lilies on Lake Surface
  // =========================================================================
  const lotusGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 12, 1, false, 0.25, Math.PI * 1.86));
  const lotusMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b7644,
      roughness: 0.46,
      metalness: 0.03,
    })
  );
  const lotusMesh = new THREE.InstancedMesh(lotusGeo, lotusMat, quality.lotusCount);
  const lotusData: Array<{ x: number; z: number; rot: number; scale: number; phase: number }> = [];
  for (let attempt = 0; attempt < 400 && lotusData.length < quality.lotusCount; attempt++) {
    const lx = 5.5 + (rand() - 0.5) * 16;
    const lz = -1.8 + (rand() - 0.5) * 10;
    const ld = lakeSignedDist(lx, lz);
    const st = streamDistanceAndFlow(lx, lz);
    if (ld < -1.2 && st.dist > 1.8) {
      lotusData.push({
        x: lx,
        z: lz,
        rot: rand() * Math.PI * 2,
        scale: 0.65 + rand() * 0.65,
        phase: rand() * Math.PI * 2,
      });
    }
  }
  lotusMesh.count = lotusData.length;
  lotusData.forEach((d, idx) => {
    dummy.position.set(d.x, 0.02, d.z);
    dummy.rotation.set(0, d.rot, 0);
    dummy.scale.setScalar(d.scale);
    dummy.updateMatrix();
    lotusMesh.setMatrixAt(idx, dummy.matrix);
    tmpColor.setHSL(0.32 + (rand() - 0.5) * 0.05, 0.46, 0.34 + rand() * 0.12);
    lotusMesh.setColorAt(idx, tmpColor);
  });
  lotusMesh.instanceMatrix.needsUpdate = true;
  if (lotusMesh.instanceColor) lotusMesh.instanceColor.needsUpdate = true;
  lotusMesh.computeBoundingSphere();
  group.add(lotusMesh);

  // =========================================================================
  // 7. Botanical Dew & Raindrops on Foreground Flowers / Leaves
  // =========================================================================
  const dewGeo = trackGeo(new THREE.SphereGeometry(0.032, 6, 5));
  const dewMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xeaf6ff,
      roughness: 0.05,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.72,
    })
  );
  const dewMesh = new THREE.InstancedMesh(dewGeo, dewMat, quality.dewCount);
  const dewBasePositions: Array<[number, number, number]> = [];
  for (let i = 0; i < quality.dewCount; i++) {
    const fx = (rand() - 0.5) * 26;
    const fz = 1.5 + rand() * 19;
    const fy = terrainHeightAt(fx, fz);
    if (fy < 0.2) continue;
    dewBasePositions.push([fx, fy + 0.34 + rand() * 0.24, fz]);
  }
  dewMesh.count = dewBasePositions.length;
  dewMesh.visible = false;
  dewBasePositions.forEach(([dx, dy, dz], i) => {
    dummy.position.set(dx, dy, dz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.8 + (i % 4) * 0.25);
    dummy.updateMatrix();
    dewMesh.setMatrixAt(i, dummy.matrix);
  });
  dewMesh.instanceMatrix.needsUpdate = true;
  dewMesh.computeBoundingSphere();
  group.add(dewMesh);

  const update = (elapsed: number, windStrength: number, dewAmount: number, nightFactor: number) => {
    uniforms.uTime.value = elapsed;
    uniforms.uWindStrength.value = windStrength;
    uniforms.uDewAmount.value = dewAmount;
    uniforms.uNightFactor.value = nightFactor;

    // Gentle floating bob of lotus pads on lake wave height
    if (lotusData.length > 0) {
      const waveAmp = 0.018 + windStrength * 0.032;
      for (let i = 0; i < lotusData.length; i++) {
        const d = lotusData[i];
        const wy = Math.sin(d.x * 0.72 + elapsed * 1.45) * Math.cos(d.z * 0.65 - elapsed * 1.1) * waveAmp;
        const tilt = Math.cos(elapsed * 1.2 + d.phase) * (0.02 + windStrength * 0.04);
        dummy.position.set(d.x, wy + 0.022, d.z);
        dummy.rotation.set(tilt, d.rot + Math.sin(elapsed * 0.35 + d.phase) * 0.05, tilt * 0.7);
        dummy.scale.setScalar(d.scale);
        dummy.updateMatrix();
        lotusMesh.setMatrixAt(i, dummy.matrix);
      }
      lotusMesh.instanceMatrix.needsUpdate = true;
    }

    // Surface water droplets visible during rain, after-rain & morning dew
    if (dewAmount > 0.14) {
      dewMesh.visible = true;
      dewMat.opacity = Math.min(0.82, (dewAmount - 0.14) * 0.92);
    } else {
      dewMesh.visible = false;
    }
  };

  return {
    group,
    uniforms,
    flowerSpots,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
