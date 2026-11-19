import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { gardenPathFactor, terrainHeightAt } from './paradiseTerrain.ts';

export const PAVILION_WORLD_POS = new THREE.Vector3(12.8, terrainHeightAt(12.8, -7.8) + 0.64, -7.8);
export const REST_HOUSE_WORLD_POS = new THREE.Vector3(-11.4, terrainHeightAt(-11.4, 5.8) + 0.32, 5.8);

export interface ParadiseArchitectureHandle {
  group: THREE.Group;
  pavilionGroup: THREE.Group;
  restHouseGroup: THREE.Group;
  lanternLight: THREE.PointLight;
  lanternGlassMat: THREE.MeshStandardMaterial;
  restHouseLight: THREE.PointLight;
  restWindowMat: THREE.MeshStandardMaterial;
  wettableMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

/**
 * Builds an authentic Chinese/Kyoto concave curved pavilion roof (飞檐翘角)
 * with upturned diagonal hip corners, eaves thickness skirt, and cylindrical tile UVs.
 */
function createSweepingPagodaRoofGeo(
  halfSpan: number,
  height: number,
  cornerLift: number,
  radialSteps = 16,
  edgeSteps = 18
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const evalRoofPoint = (quadrant: number, u: number, r: number): [number, number, number] => {
    // u in [-1, 1] along edge, r in [0, 1] from apex to eave rim
    // Map square coordinates onto quadrant rotated by quadrant * 90 deg
    const sx = u * r * halfSpan;
    const sz = r * halfSpan;
    const ang = quadrant * (Math.PI / 2);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const x = sx * cosA - sz * sinA;
    const z = sx * sinA + sz * cosA;

    // Catenary sag along roof slope + sweeping upturned corner eaves (飞檐)
    const sag = Math.pow(1 - r, 1.48) * height;
    const cornerFactor = Math.pow(Math.abs(u), 2.1) * Math.pow(r, 2.05);
    const edgeDroop = Math.sin(r * Math.PI) * 0.08 * (1 - Math.abs(u));
    const y = sag + cornerFactor * cornerLift - edgeDroop;
    return [x, y, z];
  };

  for (let q = 0; q < 4; q++) {
    const baseVertex = positions.length / 3;
    const cols = edgeSteps + 1;

    for (let ir = 0; ir <= radialSteps; ir++) {
      const r = ir / radialSteps;
      for (let iu = 0; iu <= edgeSteps; iu++) {
        const u = (iu / edgeSteps) * 2 - 1;
        const [x, y, z] = evalRoofPoint(q, u, r);
        positions.push(x, y, z);
        uvs.push((u * 0.5 + 0.5) * r * 2.2, r * 2.4);
      }
    }

    for (let ir = 0; ir < radialSteps; ir++) {
      for (let iu = 0; iu < edgeSteps; iu++) {
        const a = baseVertex + ir * cols + iu;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds curved hip ridge beams (垂脊) curving from apex out to upturned roof corners
 */
function createHipRidgeGeo(
  halfSpan: number,
  height: number,
  cornerLift: number,
  radius = 0.055
): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const r = i / steps;
    const x = r * halfSpan * 1.015;
    const z = r * halfSpan * 1.015;
    const sag = Math.pow(1 - r, 1.48) * height;
    const cornerFactor = Math.pow(r, 2.05);
    const y = sag + cornerFactor * cornerLift + 0.03;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 18, radius, 8, false);
}

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

  // Distinct PBR material library (roughness separation >= 0.25 across adjacent elements)
  const graniteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8e8980,
      roughness: 0.88,
      metalness: 0.04,
      map: textures.rockColorMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
    })
  );

  const plinthStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9c968b,
      roughness: 0.84,
      metalness: 0.05,
      map: textures.terrainDetail,
    })
  );

  const rosewoodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x52281d,
      roughness: 0.44,
      metalness: 0.06,
      map: textures.barkMap,
    })
  );

  const cedarDeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x765037,
      roughness: 0.68,
      metalness: 0.03,
      map: textures.barkMap,
    })
  );

  const ceramicTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3a434e,
      roughness: 0.46,
      metalness: 0.16,
      map: textures.slateRoofMap,
      side: THREE.DoubleSide,
    })
  );

  const ridgeStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a313a,
      roughness: 0.52,
      metalness: 0.12,
    })
  );

  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa68548,
      roughness: 0.26,
      metalness: 0.88,
    })
  );

  const lanternGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffebc6,
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 0.18,
    roughness: 0.35,
    metalness: 0.04,
  });
  materials.push(lanternGlassMat);

  // =========================================================================
  // 1. Waterside Double-Eave Timber Pavilion (临水重檐飞檐亭) at (12.8, y, -7.8)
  // =========================================================================
  const pav = new THREE.Group();
  const pavX = 12.8;
  const pavZ = -7.8;
  const pavBaseY = terrainHeightAt(pavX, pavZ);
  pav.position.set(pavX, pavBaseY, pavZ);
  pav.rotation.y = -0.58; // face lake & arched bridge gracefully

  // Lower carved stone terrace plinth (seats cleanly below terrain)
  const lowerPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.56, 5.2)), graniteMat);
  lowerPlinth.position.y = -0.02;
  lowerPlinth.castShadow = quality.enableShadows;
  lowerPlinth.receiveShadow = quality.enableShadows;
  pav.add(lowerPlinth);

  // Recessed upper stone podium molding (须弥座台基)
  const upperPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 0.34, 4.6)), plinthStoneMat);
  upperPlinth.position.y = 0.42;
  upperPlinth.castShadow = quality.enableShadows;
  upperPlinth.receiveShadow = quality.enableShadows;
  pav.add(upperPlinth);

  // Beveled dark cedar floor deck
  const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.24, 0.12, 4.24)), cedarDeckMat);
  deck.position.y = 0.64;
  deck.receiveShadow = quality.enableShadows;
  pav.add(deck);

  // 3 Wide carved granite entrance steps facing garden path + side cheek curbs
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.05, 0.16, 0.44)), plinthStoneMat);
    step.position.set(0, 0.48 - s * 0.16, 2.48 + s * 0.42);
    step.receiveShadow = quality.enableShadows;
    pav.add(step);
  }
  for (const side of [-1.1, 1.1]) {
    const cheek = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.42, 1.35)), graniteMat);
    cheek.position.set(side, 0.32, 2.86);
    cheek.rotation.x = 0.34;
    pav.add(cheek);
  }

  // Carved stone drum column bases (LatheGeometry 柱础) + 8 Rosewood Pillars (main 4 + outer corner porch posts)
  const drumProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.24, 0.0),
    new THREE.Vector2(0.24, 0.06),
    new THREE.Vector2(0.21, 0.1),
    new THREE.Vector2(0.19, 0.16),
    new THREE.Vector2(0.15, 0.19),
    new THREE.Vector2(0.0, 0.19),
  ];
  const drumGeo = trackGeo(new THREE.LatheGeometry(drumProfile, 16));
  const pillarGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.135, 2.75, 14));

  const mainCols: Array<[number, number]> = [
    [-1.68, -1.68],
    [1.68, -1.68],
    [-1.68, 1.68],
    [1.68, 1.68],
  ];
  for (const [cx, cz] of mainCols) {
    const drum = new THREE.Mesh(drumGeo, plinthStoneMat);
    drum.position.set(cx, 0.7, cz);
    pav.add(drum);

    const col = new THREE.Mesh(pillarGeo, rosewoodMat);
    col.position.set(cx, 2.15, cz);
    col.castShadow = quality.enableShadows;
    pav.add(col);
  }

  // Carved lakeside balustrade benches (美人靠) along West, North, and East bays (front South bay open for steps)
  const railBarGeo = trackGeo(new THREE.BoxGeometry(3.26, 0.09, 0.13));
  const seatPlankGeo = trackGeo(new THREE.BoxGeometry(3.06, 0.08, 0.46));
  const spindleGeo = trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 6));

  const addBayBalustrade = (rotY: number) => {
    const bay = new THREE.Group();
    bay.rotation.y = rotY;
    const topRail = new THREE.Mesh(railBarGeo, rosewoodMat);
    topRail.position.set(0, 1.38, -1.68);
    bay.add(topRail);

    const midRail = new THREE.Mesh(railBarGeo, rosewoodMat);
    midRail.position.set(0, 0.96, -1.68);
    bay.add(midRail);

    const seat = new THREE.Mesh(seatPlankGeo, cedarDeckMat);
    seat.position.set(0, 0.94, -1.46);
    bay.add(seat);

    for (let k = -4; k <= 4; k++) {
      const sp = new THREE.Mesh(spindleGeo, rosewoodMat);
      sp.position.set(k * 0.32, 1.17, -1.68);
      bay.add(sp);
    }
    pav.add(bay);
  };
  addBayBalustrade(0);
  addBayBalustrade(Math.PI / 2);
  addBayBalustrade(-Math.PI / 2);

  // Upper eave tie-beams (额枋) + decorative bracket blocks (斗拱) + radiating rafters (飞椽)
  const beamXGeo = trackGeo(new THREE.BoxGeometry(3.88, 0.18, 0.16));
  const beamZGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.18, 3.88));
  const bracketGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.32));
  for (const z of [-1.68, 1.68]) {
    const b = new THREE.Mesh(beamXGeo, rosewoodMat);
    b.position.set(0, 3.44, z);
    pav.add(b);
  }
  for (const x of [-1.68, 1.68]) {
    const b = new THREE.Mesh(beamZGeo, rosewoodMat);
    b.position.set(x, 3.44, 0);
    pav.add(b);
  }
  for (const [cx, cz] of mainCols) {
    const br = new THREE.Mesh(bracketGeo, rosewoodMat);
    br.position.set(cx, 3.58, cz);
    pav.add(br);
  }

  // Radiating wooden eave rafters beneath lower roof
  const rafterGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.06, 1.75));
  for (let side = 0; side < 4; side++) {
    for (let r = -4; r <= 4; r++) {
      const rafter = new THREE.Mesh(rafterGeo, cedarDeckMat);
      const ang = side * (Math.PI / 2);
      const localX = r * 0.44;
      const localZ = 2.02;
      rafter.position.set(
        localX * Math.cos(ang) - localZ * Math.sin(ang),
        3.56,
        localX * Math.sin(ang) + localZ * Math.cos(ang)
      );
      rafter.rotation.y = ang;
      rafter.rotation.x = 0.24;
      pav.add(rafter);
    }
  }

  // Lower sweeping concave roof (飞檐翘角) + 4 diagonal curved ridge beams
  const lowerRoofSpan = 2.86;
  const lowerRoofHeight = 1.24;
  const lowerRoofLift = 0.44;
  const lowerRoofGeo = trackGeo(createSweepingPagodaRoofGeo(lowerRoofSpan, lowerRoofHeight, lowerRoofLift, 16, 18));
  const lowerRoof = new THREE.Mesh(lowerRoofGeo, ceramicTileMat);
  lowerRoof.position.y = 3.5;
  lowerRoof.castShadow = quality.enableShadows;
  lowerRoof.receiveShadow = quality.enableShadows;
  pav.add(lowerRoof);

  const lowerRidgeGeo = trackGeo(createHipRidgeGeo(lowerRoofSpan, lowerRoofHeight, lowerRoofLift, 0.055));
  for (let q = 0; q < 4; q++) {
    const ridge = new THREE.Mesh(lowerRidgeGeo, ridgeStoneMat);
    ridge.position.y = 3.5;
    ridge.rotation.y = q * (Math.PI / 2);
    pav.add(ridge);
  }

  // Clerestory wooden collar screen (重檐腰部) between lower & upper tier
  const clerestory = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.78, 0.56, 1.78)), rosewoodMat);
  clerestory.position.y = 4.46;
  pav.add(clerestory);

  // Upper sweeping concave roof (重檐顶) + 4 upper hip ridges
  const upperRoofSpan = 1.65;
  const upperRoofHeight = 0.92;
  const upperRoofLift = 0.34;
  const upperRoofGeo = trackGeo(createSweepingPagodaRoofGeo(upperRoofSpan, upperRoofHeight, upperRoofLift, 14, 14));
  const upperRoof = new THREE.Mesh(upperRoofGeo, ceramicTileMat);
  upperRoof.position.y = 4.62;
  upperRoof.castShadow = quality.enableShadows;
  pav.add(upperRoof);

  const upperRidgeGeo = trackGeo(createHipRidgeGeo(upperRoofSpan, upperRoofHeight, upperRoofLift, 0.042));
  for (let q = 0; q < 4; q++) {
    const ridge = new THREE.Mesh(upperRidgeGeo, ridgeStoneMat);
    ridge.position.y = 4.62;
    ridge.rotation.y = q * (Math.PI / 2);
    pav.add(ridge);
  }

  // Multi-part turned bronze lotus finial (宝顶 LatheGeometry)
  const finialProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.18, 0.08),
    new THREE.Vector2(0.11, 0.14),
    new THREE.Vector2(0.15, 0.22),
    new THREE.Vector2(0.07, 0.32),
    new THREE.Vector2(0.09, 0.4),
    new THREE.Vector2(0.025, 0.58),
    new THREE.Vector2(0.0, 0.7),
  ];
  const finial = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(finialProfile, 16)), bronzeMat);
  finial.position.y = 5.46;
  pav.add(finial);

  // Hanging Silk-Paper & Bronze Palace Lantern inside pavilion
  const lanternCord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6)), bronzeMat);
  lanternCord.position.set(0, 3.22, 0);
  pav.add(lanternCord);

  const lanternCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.22, 0.11, 8)), bronzeMat);
  lanternCap.position.set(0, 2.94, 0);
  pav.add(lanternCap);

  const lanternBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.15, 0.12, 0.32, 8)), lanternGlassMat);
  lanternBody.position.set(0, 2.74, 0);
  pav.add(lanternBody);

  const lanternBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.06, 0.08, 8)), bronzeMat);
  lanternBase.position.set(0, 2.54, 0);
  pav.add(lanternBase);

  const lanternLight = new THREE.PointLight(0xffb45c, 0.0, 16, 1.65);
  lanternLight.position.set(0, 2.7, 0);
  pav.add(lanternLight);

  group.add(pav);

  // =========================================================================
  // 2. Arched Timber & Granite Footbridge (拱桥) across the Stream at (-6.4, -8.4)
  // =========================================================================
  const bridge = new THREE.Group();
  const brX = -6.4;
  const brZ = -8.4;
  bridge.position.set(brX, 0.18, brZ);
  bridge.rotation.y = 0.24;

  const span = 7.6;
  const plankCount = 22;
  const plankGeo = trackGeo(new THREE.BoxGeometry(2.24, 0.085, 0.31));
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.072, 0.94, 10));
  const capGeo = trackGeo(new THREE.SphereGeometry(0.085, 10, 8));

  // Stone bridge abutments seated deep into both stream banks
  for (const endZ of [-span * 0.52, span * 0.52]) {
    const abutment = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.75, 1.35, 1.25)), graniteMat);
    abutment.position.set(0, -0.35, endZ);
    abutment.castShadow = quality.enableShadows;
    abutment.receiveShadow = quality.enableShadows;
    bridge.add(abutment);
  }

  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1) - 0.5;
    const zPos = t * span;
    const archY = Math.cos(t * Math.PI) * 0.96;
    const slope = -Math.sin(t * Math.PI) * ((0.96 * Math.PI) / span);

    const plank = new THREE.Mesh(plankGeo, cedarDeckMat);
    plank.position.set(0, archY, zPos);
    plank.rotation.x = -slope;
    plank.castShadow = quality.enableShadows;
    plank.receiveShadow = quality.enableShadows;
    bridge.add(plank);

    if (i === 0 || i === 5 || i === 10 || i === 16 || i === plankCount - 1) {
      for (const side of [-1.02, 1.02]) {
        const post = new THREE.Mesh(postGeo, rosewoodMat);
        post.position.set(side, archY + 0.45, zPos);
        post.castShadow = quality.enableShadows;
        bridge.add(post);

        const cap = new THREE.Mesh(capGeo, bronzeMat);
        cap.position.set(side, archY + 0.94, zPos);
        bridge.add(cap);
      }
    }
  }

  // Curved structural arch stringers & curved timber handrails
  for (const side of [-1.02, 1.02]) {
    const railPts: THREE.Vector3[] = [];
    const archPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 20; k++) {
      const t = k / 20 - 0.5;
      const z = t * span;
      const y = Math.cos(t * Math.PI) * 0.96;
      railPts.push(new THREE.Vector3(side, y + 0.84, z));
      archPts.push(new THREE.Vector3(side * 0.9, y - 0.14, z));
    }
    const railGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 24, 0.044, 8, false));
    bridge.add(new THREE.Mesh(railGeo, rosewoodMat));

    const archBeamGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts), 24, 0.095, 8, false));
    const archBeam = new THREE.Mesh(archBeamGeo, rosewoodMat);
    archBeam.castShadow = quality.enableShadows;
    bridge.add(archBeam);
  }

  group.add(bridge);

  // =========================================================================
  // 3. Carved Traditional Granite Garden Lanterns (石灯笼) along Path
  // =========================================================================
  const buildStoneLantern = (lx: number, lz: number) => {
    const lg = new THREE.Group();
    const ly = terrainHeightAt(lx, lz);
    lg.position.set(lx, ly - 0.06, lz);

    const ped = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.34, 0.28, 6)), graniteMat);
    ped.position.y = 0.14;
    lg.add(ped);

    const shaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 0.72, 8)), graniteMat);
    shaft.position.y = 0.62;
    shaft.castShadow = quality.enableShadows;
    lg.add(shaft);

    const platform = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.18, 0.14, 6)), graniteMat);
    platform.position.y = 1.02;
    lg.add(platform);

    const chamber = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 6)), lanternGlassMat);
    chamber.position.y = 1.21;
    lg.add(chamber);

    const roof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.42, 0.28, 6)), graniteMat);
    roof.position.y = 1.44;
    roof.castShadow = quality.enableShadows;
    lg.add(roof);

    const tip = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.075, 8, 8)), graniteMat);
    tip.position.y = 1.61;
    lg.add(tip);

    group.add(lg);
  };

  buildStoneLantern(-4.2, -4.1); // South bridge approach
  buildStoneLantern(8.8, -8.2);  // Pavilion garden turn

  // =========================================================================
  // 4. Stratified Granite Shoreline & Waterfall Cliff Boulders
  // =========================================================================
  const rockDefs: Array<[number, number, number, number, number]> = [
    [-22.2, -23.0, 2.7, 2.3, 0.5],
    [-17.8, -22.2, 2.5, 2.0, 1.1],
    [-23.6, -19.2, 2.2, 1.7, 2.0],
    [-16.2, -19.0, 1.85, 1.35, 0.8],
    [-11.5, -13.0, 1.65, 1.15, 1.7],
    [-8.8, -6.5, 1.35, 0.88, 2.3],
    [-3.5, -10.8, 1.3, 0.9, 0.4],
    [0.8, -6.5, 1.25, 0.82, 1.9],
    [13.4, -3.2, 1.4, 0.85, 2.8],
    [14.8, 1.2, 1.5, 0.92, 0.6],
    [11.2, 5.2, 1.3, 0.78, 1.5],
    [-2.8, 3.6, 1.25, 0.76, 2.1],
    [4.4, 5.8, 1.2, 0.72, 0.9],
  ];

  for (let idx = 0; idx < rockDefs.length; idx++) {
    const [rx, rz, rw, rh, rot] = rockDefs[idx];
    const rockGeo = trackGeo(new THREE.IcosahedronGeometry(1, 2));
    const rp = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const vx = rp.getX(i);
      const vy = rp.getY(i);
      const vz = rp.getZ(i);
      // Angular granite strata ridges
      const strata =
        1 +
        0.16 * Math.sin(vx * 3.1 + idx) +
        0.14 * Math.cos(vy * 4.2 - vz * 2.4) +
        0.08 * Math.sin((vx + vz) * 6.0);
      rp.setXYZ(i, vx * rw * strata, vy * rh * (vy < 0 ? 0.65 : strata), vz * rw * strata);
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(rockGeo, graniteMat);
    const groundY = terrainHeightAt(rx, rz);
    rock.position.set(rx, Math.max(-0.25, groundY) + rh * 0.24, rz);
    rock.rotation.y = rot;
    rock.castShadow = quality.enableShadows;
    rock.receiveShadow = quality.enableShadows;
    group.add(rock);
  }

  // Flagstone stepping pads along garden footpath
  const stoneStepGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.54, 0.09, 7));
  const stepRand = (seed: number) => {
    const s = Math.sin(seed * 91.7) * 43758.54;
    return s - Math.floor(s);
  };
  let placed = 0;
  for (let z = 18; z >= -14 && placed < 46; z -= 1.35) {
    for (let x = -9; x <= 14 && placed < 46; x += 1.25) {
      const pf = gardenPathFactor(x, z);
      const h = terrainHeightAt(x, z);
      if (pf > 0.62 && h > 0.24) {
        const jx = x + (stepRand(x * 3 + z) - 0.5) * 0.36;
        const jz = z + (stepRand(z * 5 - x) - 0.5) * 0.36;
        const pad = new THREE.Mesh(stoneStepGeo, plinthStoneMat);
        pad.position.set(jx, terrainHeightAt(jx, jz) + 0.018, jz);
        pad.rotation.y = stepRand(x + z * 2) * Math.PI;
        pad.scale.set(0.85 + stepRand(placed) * 0.4, 1, 0.75 + stepRand(placed + 9) * 0.38);
        pad.receiveShadow = quality.enableShadows;
        group.add(pad);
        placed++;
      }
    }
  }

  // =========================================================================
  // 5. Spirit Rest Cottage (精灵休息木屋) at (-11.4, y, 5.8)
  // =========================================================================
  const restHouseGroup = new THREE.Group();
  const rhX = -11.4;
  const rhZ = 5.8;
  const rhBaseY = terrainHeightAt(rhX, rhZ);
  restHouseGroup.position.set(rhX, rhBaseY, rhZ);
  restHouseGroup.rotation.y = 0.72; // face southeast toward meadow, bridge & pavilion

  const plasterWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xece3d2,
      roughness: 0.86,
      metalness: 0.02,
      map: textures.terrainDetail,
    })
  );

  const restWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b3,
    emissive: new THREE.Color(0xffa748),
    emissiveIntensity: 0.24,
    roughness: 0.32,
    metalness: 0.04,
  });
  materials.push(restWindowMat);

  // Granite stone foundation & timber veranda deck
  const rhStoneBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.75, 0.36, 3.35)), graniteMat);
  rhStoneBase.position.y = 0.08;
  rhStoneBase.castShadow = quality.enableShadows;
  rhStoneBase.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhStoneBase);

  const rhVeranda = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.45, 0.12, 3.15)), cedarDeckMat);
  rhVeranda.position.y = 0.3;
  rhVeranda.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhVeranda);

  // Two cozy veranda entry steps
  for (let s = 0; s < 2; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.26, 0.12, 0.32)), plinthStoneMat);
    step.position.set(0, 0.22 - s * 0.12, 1.66 + s * 0.28);
    step.receiveShadow = quality.enableShadows;
    restHouseGroup.add(step);
  }

  // Timber corner posts & roof framing
  const rhPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.95, 0.14));
  const rhCols: Array<[number, number]> = [
    [-1.42, -1.2],
    [1.42, -1.2],
    [-1.42, 0.76],
    [1.42, 0.76],
    [-1.42, 1.36],
    [1.42, 1.36],
  ];
  for (const [cx, cz] of rhCols) {
    const col = new THREE.Mesh(rhPostGeo, rosewoodMat);
    col.position.set(cx, 1.32, cz);
    col.castShadow = quality.enableShadows;
    restHouseGroup.add(col);
  }

  // Warm plaster cottage enclosure (rear half enclosed, front porch open)
  const rhMainBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.74, 1.84, 1.88)), plasterWallMat);
  rhMainBody.position.set(0, 1.28, -0.22);
  rhMainBody.castShadow = quality.enableShadows;
  rhMainBody.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhMainBody);

  // Wooden door frame & recessed warm shoji doorway
  const doorFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.96, 1.46, 0.12)), rosewoodMat);
  doorFrame.position.set(0, 1.09, 0.72);
  restHouseGroup.add(doorFrame);

  const doorGlow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.76, 1.32)), restWindowMat);
  doorGlow.position.set(0, 1.06, 0.785);
  restHouseGroup.add(doorGlow);

  // Side lattice shoji windows
  for (const side of [-1, 1]) {
    const winFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.74, 0.92)), rosewoodMat);
    winFrame.position.set(side * 1.38, 1.34, -0.22);
    restHouseGroup.add(winFrame);

    const winPane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.78, 0.58)), restWindowMat);
    winPane.position.set(side * 1.425, 1.34, -0.22);
    winPane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    restHouseGroup.add(winPane);
  }

  // Sweeping traditional pitched cottage roof with gentle eaves overhang
  const rhRoofLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.42, 0.11, 3.62)), ceramicTileMat);
  rhRoofLeft.position.set(-0.98, 2.58, 0.14);
  rhRoofLeft.rotation.z = 0.44;
  rhRoofLeft.castShadow = quality.enableShadows;
  rhRoofLeft.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhRoofLeft);

  const rhRoofRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.42, 0.11, 3.62)), ceramicTileMat);
  rhRoofRight.position.set(0.98, 2.58, 0.14);
  rhRoofRight.rotation.z = -0.44;
  rhRoofRight.castShadow = quality.enableShadows;
  rhRoofRight.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhRoofRight);

  const rhRidgeBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.18, 3.74)), ridgeStoneMat);
  rhRidgeBeam.position.set(0, 3.09, 0.14);
  restHouseGroup.add(rhRidgeBeam);

  // Porch hanging lantern & cozy interior hearth light
  const rhPorchLantern = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.08, 0.24, 8)), restWindowMat);
  rhPorchLantern.position.set(0.76, 1.98, 1.24);
  restHouseGroup.add(rhPorchLantern);

  const restHouseLight = new THREE.PointLight(0xffb463, 0.25, 9, 1.6);
  restHouseLight.position.set(0, 1.35, 1.15);
  restHouseGroup.add(restHouseLight);

  group.add(restHouseGroup);

  return {
    group,
    pavilionGroup: pav,
    restHouseGroup,
    lanternLight,
    lanternGlassMat,
    restHouseLight,
    restWindowMat,
    wettableMaterials,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
