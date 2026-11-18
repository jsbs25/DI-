import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { gardenPathFactor, terrainHeightAt } from './paradiseTerrain.ts';

export interface ParadiseArchitectureHandle {
  group: THREE.Group;
  lanternLight: THREE.PointLight;
  lanternGlassMat: THREE.MeshStandardMaterial;
  wettableMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

/**
 * Builds grounded composite multi-part garden structures:
 * 1. Lakeside Cedar & Slate Pavilion (10+ parts, stone plinth, steps, columns, tiered hip roof, glowing night lantern)
 * 2. Arched Timber & Stone Footbridge spanning the winding stream
 * 3. Sculpted shoreline granite boulders & stepping stones
 */
export function createParadiseArchitecture(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseArchitectureHandle {
  const group = new THREE.Group();
  const wettableMaterials: THREE.MeshStandardMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    if (m instanceof THREE.MeshStandardMaterial) {
      m.userData.baseRoughness = m.roughness;
      wettableMaterials.push(m);
    }
    return m;
  };

  // Materials with realistic roughness separation >= 0.25 across adjacent parts
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8f8a80,
      roughness: 0.88,
      metalness: 0.04,
      map: textures.terrainDetail,
    })
  );

  const darkCedarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3c28,
      roughness: 0.72,
      metalness: 0.05,
      map: textures.barkMap,
    })
  );

  const warmPlankMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b563c,
      roughness: 0.64,
      metalness: 0.04,
      map: textures.barkMap,
    })
  );

  const slateRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b444f,
      roughness: 0.52,
      metalness: 0.14,
      map: textures.slateRoofMap,
    })
  );

  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b7f4a,
      roughness: 0.28,
      metalness: 0.85,
    })
  );

  const lanternGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: new THREE.Color(0xffb454),
    emissiveIntensity: 0.15,
    roughness: 0.35,
    metalness: 0.05,
  });
  materials.push(lanternGlassMat);

  // =========================================================================
  // 1. Lakeside Cedar & Slate Pavilion at (12.8, terrainY, -7.8)
  // =========================================================================
  const pav = new THREE.Group();
  const pavX = 12.8;
  const pavZ = -7.8;
  const pavBaseY = terrainHeightAt(pavX, pavZ);
  pav.position.set(pavX, pavBaseY, pavZ);
  pav.rotation.y = -0.58; // face the lake and arched bridge gracefully

  // Stone foundation plinth (extends slightly below terrain so slopes never show air gap)
  const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.72, 4.4)), stoneMat);
  plinth.position.y = 0.06;
  plinth.castShadow = quality.enableShadows;
  plinth.receiveShadow = quality.enableShadows;
  pav.add(plinth);

  // Upper timber deck
  const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.0, 0.14, 4.0)), warmPlankMat);
  deck.position.y = 0.48;
  deck.receiveShadow = quality.enableShadows;
  pav.add(deck);

  // Entrance stone steps facing bridge (-Z/front)
  for (let s = 0; s < 2; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.18, 0.55)), stoneMat);
    step.position.set(0, 0.26 - s * 0.16, 2.35 + s * 0.45);
    step.receiveShadow = quality.enableShadows;
    pav.add(step);
  }

  // 4 octagonal cedar columns + stone column bases
  const colGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 2.55, 8));
  const baseGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.21, 0.18, 8));
  const colOffsets: Array<[number, number]> = [
    [-1.55, -1.55],
    [1.55, -1.55],
    [-1.55, 1.55],
    [1.55, 1.55],
  ];
  for (const [cx, cz] of colOffsets) {
    const cBase = new THREE.Mesh(baseGeo, stoneMat);
    cBase.position.set(cx, 0.62, cz);
    pav.add(cBase);

    const col = new THREE.Mesh(colGeo, darkCedarMat);
    col.position.set(cx, 1.92, cz);
    col.castShadow = quality.enableShadows;
    pav.add(col);
  }

  // Low timber bench rails along back & sides
  const railH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.1, 0.09, 0.12)), darkCedarMat);
  railH.position.set(0, 1.05, -1.55);
  pav.add(railH);
  const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.85, 0.08, 0.44)), warmPlankMat);
  bench.position.set(0, 0.88, -1.36);
  pav.add(bench);

  // Cross eave beams
  const beamXGeo = trackGeo(new THREE.BoxGeometry(3.65, 0.16, 0.16));
  const beamZGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.16, 3.65));
  for (const z of [-1.55, 1.55]) {
    const b = new THREE.Mesh(beamXGeo, darkCedarMat);
    b.position.set(0, 3.22, z);
    pav.add(b);
  }
  for (const x of [-1.55, 1.55]) {
    const b = new THREE.Mesh(beamZGeo, darkCedarMat);
    b.position.set(x, 3.22, 0);
    pav.add(b);
  }

  // Curved overhanging hip roof (4-sided curved pyramid + upper second tier)
  const lowerRoofGeo = trackGeo(new THREE.ConeGeometry(3.45, 1.05, 4));
  lowerRoofGeo.rotateY(Math.PI / 4);
  const lrPos = lowerRoofGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < lrPos.count; i++) {
    const ry = lrPos.getY(i);
    if (ry < 0) {
      // Gently upturn the corner eaves for classical garden elegance
      const dist = Math.hypot(lrPos.getX(i), lrPos.getZ(i));
      lrPos.setY(i, ry + Math.pow(dist / 3.45, 2) * 0.34);
    }
  }
  lowerRoofGeo.computeVertexNormals();
  const lowerRoof = new THREE.Mesh(lowerRoofGeo, slateRoofMat);
  lowerRoof.position.y = 3.74;
  lowerRoof.castShadow = quality.enableShadows;
  lowerRoof.receiveShadow = quality.enableShadows;
  pav.add(lowerRoof);

  const upperRoofGeo = trackGeo(new THREE.ConeGeometry(1.95, 0.92, 4));
  upperRoofGeo.rotateY(Math.PI / 4);
  const upperRoof = new THREE.Mesh(upperRoofGeo, slateRoofMat);
  upperRoof.position.y = 4.38;
  upperRoof.castShadow = quality.enableShadows;
  pav.add(upperRoof);

  // Bronze spire finial
  const finial = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.11, 0.52, 8)), bronzeMat);
  finial.position.y = 5.02;
  pav.add(finial);
  const finialOrb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 12, 10)), bronzeMat);
  finialOrb.position.y = 4.82;
  pav.add(finialOrb);

  // Hanging courtyard lantern under roof eaves (soft warm light at dusk & night)
  const lanternCord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6)), bronzeMat);
  lanternCord.position.set(0, 3.12, 0);
  pav.add(lanternCord);

  const lanternCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.18, 0.1, 8)), bronzeMat);
  lanternCap.position.set(0, 2.9, 0);
  pav.add(lanternCap);

  const lanternBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.11, 0.28, 8)), lanternGlassMat);
  lanternBody.position.set(0, 2.74, 0);
  pav.add(lanternBody);

  const lanternLight = new THREE.PointLight(0xffb562, 0.0, 14, 1.7);
  lanternLight.position.set(0, 2.65, 0);
  pav.add(lanternLight);

  group.add(pav);

  // =========================================================================
  // 2. Arched Timber & Stone Footbridge across the Stream
  // Stream crosses roughly between (-6.8, -4.4) and (-5.5, -12.4) -> bridge centered at (-6.2, -8.4)
  // =========================================================================
  const bridge = new THREE.Group();
  const brX = -6.4;
  const brZ = -8.4;
  bridge.position.set(brX, 0.18, brZ);
  bridge.rotation.y = 0.24; // aligned perpendicular to stream channel

  const span = 7.4;
  const plankCount = 18;
  const plankGeo = trackGeo(new THREE.BoxGeometry(2.15, 0.09, 0.36));
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.075, 0.92, 8));
  const capGeo = trackGeo(new THREE.SphereGeometry(0.085, 10, 8));

  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1) - 0.5; // -0.5..0.5
    const zPos = t * span;
    const archY = Math.cos(t * Math.PI) * 0.92;
    const slope = -Math.sin(t * Math.PI) * (0.92 * Math.PI / span);

    const plank = new THREE.Mesh(plankGeo, warmPlankMat);
    plank.position.set(0, archY, zPos);
    plank.rotation.x = -slope;
    plank.castShadow = quality.enableShadows;
    plank.receiveShadow = quality.enableShadows;
    bridge.add(plank);

    if (i === 0 || i === 5 || i === 12 || i === plankCount - 1) {
      for (const side of [-0.98, 0.98]) {
        const post = new THREE.Mesh(postGeo, darkCedarMat);
        post.position.set(side, archY + 0.44, zPos);
        post.castShadow = quality.enableShadows;
        bridge.add(post);

        const cap = new THREE.Mesh(capGeo, bronzeMat);
        cap.position.set(side, archY + 0.92, zPos);
        bridge.add(cap);
      }
    }
  }

  // Curved arched side rails
  const railCurveL = new THREE.CatmullRomCurve3(
    [-0.5, -0.25, 0, 0.25, 0.5].map((t) => new THREE.Vector3(-0.98, Math.cos(t * Math.PI) * 0.92 + 0.78, t * span))
  );
  const railCurveR = new THREE.CatmullRomCurve3(
    [-0.5, -0.25, 0, 0.25, 0.5].map((t) => new THREE.Vector3(0.98, Math.cos(t * Math.PI) * 0.92 + 0.78, t * span))
  );
  const railL = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(railCurveL, 20, 0.045, 6, false)), darkCedarMat);
  const railR = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(railCurveR, 20, 0.045, 6, false)), darkCedarMat);
  bridge.add(railL, railR);

  // Stone bridge abutments grounded cleanly into banks
  const abutGeo = trackGeo(new THREE.BoxGeometry(2.45, 1.35, 1.25));
  for (const zEnd of [-span * 0.52, span * 0.52]) {
    const ab = new THREE.Mesh(abutGeo, stoneMat);
    ab.position.set(0, -0.42, zEnd);
    ab.receiveShadow = quality.enableShadows;
    bridge.add(ab);
  }
  group.add(bridge);

  // =========================================================================
  // 3. Instanced Shoreline Granite Boulders & Path Stepping Stones
  // =========================================================================
  const boulderGeo = trackGeo(new THREE.DodecahedronGeometry(1, 1));
  const bPos = boulderGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const y = bPos.getY(i);
    const z = bPos.getZ(i);
    const wobble = 0.84 + 0.24 * Math.sin(x * 3.1 + y * 2.4 + z * 2.7);
    bPos.setXYZ(i, x * wobble, y * wobble * 0.68, z * wobble);
  }
  boulderGeo.computeVertexNormals();

  const boulderSpots: Array<[number, number, number]> = [
    // Waterfall cliff boulders & plunge pool rim
    [-22.5, -20.5, 2.2],
    [-16.2, -22.2, 2.0],
    [-24.2, -23.0, 2.8],
    [-17.4, -17.6, 1.35],
    [-15.2, -20.0, 1.15],
    [-22.8, -17.4, 1.5],
    // Stream banks & lake edges
    [-11.8, -14.2, 1.1],
    [-9.5, -10.5, 0.95],
    [-3.2, -6.2, 0.85],
    [1.6, 4.8, 1.2],
    [8.2, 5.2, 1.05],
    [14.5, 3.6, 1.35],
    [16.2, -2.5, 1.15],
    [6.5, -8.8, 1.3],
    [0.8, -8.4, 0.9],
    [-13.5, 6.2, 1.2],
    [17.5, 9.4, 1.4],
  ];

  const boulders = new THREE.InstancedMesh(boulderGeo, stoneMat, boulderSpots.length);
  boulders.castShadow = quality.enableShadows;
  boulders.receiveShadow = quality.enableShadows;
  const dummy = new THREE.Object3D();
  const bColor = new THREE.Color();

  boulderSpots.forEach(([bx, bz, scale], i) => {
    const by = terrainHeightAt(bx, bz);
    dummy.position.set(bx, by + scale * 0.14, bz);
    dummy.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    dummy.scale.set(scale * 1.15, scale * 0.78, scale * 0.98);
    dummy.updateMatrix();
    boulders.setMatrixAt(i, dummy.matrix);
    bColor.setHSL(0.08, 0.08, 0.44 + (i % 5) * 0.05);
    boulders.setColorAt(i, bColor);
  });
  boulders.instanceMatrix.needsUpdate = true;
  if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
  boulders.computeBoundingSphere();
  group.add(boulders);

  // Garden path stepping stones sampled organically along footpath
  const stoneStepGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.52, 0.14, 7));
  const stepPositions: Array<[number, number, number]> = [];
  for (let gz = -14; gz <= 20; gz += 1.45) {
    for (let gx = -12; gx <= 14; gx += 1.25) {
      const pf = gardenPathFactor(gx, gz);
      const hy = terrainHeightAt(gx, gz);
      if (pf > 0.72 && hy > 0.16 && stepPositions.length < 44) {
        const jx = gx + Math.sin(gx * 4.1 + gz) * 0.25;
        const jz = gz + Math.cos(gz * 3.7 + gx) * 0.25;
        stepPositions.push([jx, jz, 0.78 + ((stepPositions.length * 37) % 10) * 0.04]);
      }
    }
  }
  if (stepPositions.length > 0) {
    const stepMesh = new THREE.InstancedMesh(stoneStepGeo, stoneMat, stepPositions.length);
    stepMesh.receiveShadow = quality.enableShadows;
    stepPositions.forEach(([sx, sz, sc], idx) => {
      const sy = terrainHeightAt(sx, sz);
      dummy.position.set(sx, sy + 0.02, sz);
      dummy.rotation.set(0, idx * 0.9, 0);
      dummy.scale.set(sc, 1, sc * 0.84);
      dummy.updateMatrix();
      stepMesh.setMatrixAt(idx, dummy.matrix);
    });
    stepMesh.instanceMatrix.needsUpdate = true;
    stepMesh.computeBoundingSphere();
    group.add(stepMesh);
  }

  return {
    group,
    lanternLight,
    lanternGlassMat,
    wettableMaterials,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
