import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { BRIDGE_CONFIG, gardenPathFactor, terrainHeightAt } from './paradiseTerrain.ts';

export const PAVILION_WORLD_POS = new THREE.Vector3(9.8, terrainHeightAt(9.8, -6.2) + 0.74, -6.2);
export const REST_HOUSE_WORLD_POS = new THREE.Vector3(-9.8, terrainHeightAt(-9.8, 1.6) + 0.38, 1.6);
export const LANGUAGE_HOUSE_WORLD_POS = new THREE.Vector3(8.2, terrainHeightAt(8.2, 6.8) + 0.38, 6.8);
export const AI_HOUSE_WORLD_POS = new THREE.Vector3(0.0, terrainHeightAt(0.0, -10.8) + 0.44, -10.8);
export const PHONE_BOOTH_WORLD_POS = new THREE.Vector3(-4.2, terrainHeightAt(-4.2, 9.8) + 0.26, 9.8);

export type ArchitecturePortalId = 'library' | 'arabic-learning' | 'aihub' | 'chat' | 'venus';

export interface ArchitecturePortal {
  id: ArchitecturePortalId;
  labelZh: string;
  labelEn: string;
  labelAr: string;
  group: THREE.Group;
  signMat: THREE.MeshStandardMaterial;
  worldPos: THREE.Vector3;
}

export interface ParadiseArchitectureHandle {
  group: THREE.Group;
  pavilionGroup: THREE.Group;
  restHouseGroup: THREE.Group;
  portals: ArchitecturePortal[];
  lanternLight: THREE.PointLight;
  lanternGlassMat: THREE.MeshStandardMaterial;
  restHouseLight: THREE.PointLight;
  restWindowMat: THREE.MeshStandardMaterial;
  extraLights: THREE.PointLight[];
  extraWindowMats: THREE.MeshStandardMaterial[];
  aiCrownGroup: THREE.Group;
  wettableMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

/**
 * Builds an authentic Chinese/Kyoto concave curved pavilion roof (飞檐翘角)
 * with upturned diagonal hip corners and cylindrical tile UVs.
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
    const sx = u * r * halfSpan;
    const sz = r * halfSpan;
    const ang = quadrant * (Math.PI / 2);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const x = sx * cosA - sz * sinA;
    const z = sx * sinA + sz * cosA;

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
        uvs.push((u * 0.5 + 0.5) * r * 2.4, r * 2.6);
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
 * Builds curved hip ridge beams (垂脊) curving from apex out to upturned roof corners.
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

/**
 * Builds a single concave catenary gable roof slope (悬山卷棚坡面) with solid thickness
 * and crisp cylindrical roof tile UVs.
 */
function createCurvedGableRoofSlopeGeo(
  halfWidth: number,
  ridgeHeight: number,
  eaveDrop: number,
  lengthZ: number,
  thickness = 0.075,
  stepsX = 14,
  stepsZ = 10
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const evalSlopeY = (t: number) => {
    // t in [0, 1] from ridge center (0) to outer eave tip (1)
    // Concave catenary East-Asian curve with slight upturned eave lip at tip
    const baseSlope = Math.pow(1 - t, 1.38) * ridgeHeight - t * eaveDrop;
    const eaveTurn = Math.pow(t, 4.2) * 0.11;
    return baseSlope + eaveTurn;
  };

  // Top tiled surface + underside soffit surface
  const buildSheet = (yOffset: number, flipWinding: boolean) => {
    const baseVertex = positions.length / 3;
    const cols = stepsZ + 1;
    for (let ix = 0; ix <= stepsX; ix++) {
      const t = ix / stepsX;
      const x = t * halfWidth;
      const y = evalSlopeY(t) + yOffset;
      for (let iz = 0; iz <= stepsZ; iz++) {
        const uz = iz / stepsZ;
        const z = (uz - 0.5) * lengthZ;
        positions.push(x, y, z);
        uvs.push(uz * 3.4, t * 2.2);
      }
    }
    for (let ix = 0; ix < stepsX; ix++) {
      for (let iz = 0; iz < stepsZ; iz++) {
        const a = baseVertex + ix * cols + iz;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (flipWinding) {
          indices.push(a, b, c, b, d, c);
        } else {
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  };

  buildSheet(0, false);
  buildSheet(-thickness, true);

  // Outer eave rim fascia closing the edge
  const fasciaBase = positions.length / 3;
  const eaveY = evalSlopeY(1);
  for (let iz = 0; iz <= stepsZ; iz++) {
    const uz = iz / stepsZ;
    const z = (uz - 0.5) * lengthZ;
    positions.push(halfWidth, eaveY, z);
    uvs.push(uz * 3.4, 0.95);
    positions.push(halfWidth, eaveY - thickness, z);
    uvs.push(uz * 3.4, 1.0);
  }
  for (let iz = 0; iz < stepsZ; iz++) {
    const a = fasciaBase + iz * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a triangular plastered gable wall (山花墙) that cleanly fills the upper roof triangle.
 */
function createGableTriangleGeo(halfWidth: number, peakHeight: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(0, peakHeight);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geo.translate(0, 0, -thickness * 0.5);
  geo.computeVertexNormals();
  return geo;
}

export function createParadiseArchitecture(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet
): ParadiseArchitectureHandle {
  const group = new THREE.Group();
  const wettableMaterials: THREE.MeshStandardMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const signTextures: THREE.CanvasTexture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    if (g.attributes.uv && !g.attributes.uv2) {
      g.setAttribute('uv2', g.attributes.uv);
    }
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

  // Distinct high-definition PBR material library with AO + Roughness + Normal maps
  const graniteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x918c83,
      roughness: 0.88,
      metalness: 0.04,
      map: textures.rockColorMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      aoMap: textures.plasterAoMap,
      aoMapIntensity: 0.55,
    })
  );

  const plinthStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa49e93,
      roughness: 0.82,
      metalness: 0.04,
      map: textures.terrainDetail,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      aoMap: textures.plasterAoMap,
      aoMapIntensity: 0.45,
    })
  );

  const rosewoodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x51271c,
      roughness: 0.78,
      metalness: 0.05,
      map: textures.sakuraBarkMap,
      normalMap: textures.sakuraBarkNormalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      aoMap: textures.barkAoMap,
      aoMapIntensity: 0.68,
      roughnessMap: textures.barkRoughnessMap,
    })
  );

  const cedarDeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x926848,
      roughness: 0.88,
      metalness: 0.02,
      map: textures.timberPlankMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.48, 0.48),
      aoMap: textures.timberAoMap,
      aoMapIntensity: 0.92,
      roughnessMap: textures.timberRoughnessMap,
    })
  );

  const charredCedarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x352923,
      roughness: 0.92,
      metalness: 0.03,
      map: textures.timberPlankMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      aoMap: textures.timberAoMap,
      aoMapIntensity: 0.95,
      roughnessMap: textures.timberRoughnessMap,
    })
  );

  const plasterWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf2eadb,
      roughness: 0.88,
      metalness: 0.01,
      map: textures.plasterWallMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.24, 0.24),
      aoMap: textures.plasterAoMap,
      aoMapIntensity: 0.72,
    })
  );

  const ceramicTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x45505d,
      roughness: 0.84,
      metalness: 0.16,
      map: textures.slateRoofMap,
      normalMap: textures.slateNormalMap,
      normalScale: new THREE.Vector2(1.05, 1.05),
      aoMap: textures.slateAoMap,
      aoMapIntensity: 0.95,
      roughnessMap: textures.slateRoughnessMap,
      side: THREE.DoubleSide,
    })
  );

  const ridgeStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2c343e,
      roughness: 0.56,
      metalness: 0.14,
      normalMap: textures.slateNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: textures.slateAoMap,
      aoMapIntensity: 0.65,
    })
  );

  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb08d4c,
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

  type SignIconKind = 'library' | 'music' | 'language' | 'ai' | 'phone';

  const drawSignIcon = (
    ctx: CanvasRenderingContext2D,
    kind: SignIconKind,
    cx: number,
    cy: number,
    r: number,
    color: string
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.14;

    if (kind === 'library') {
      // Crisp minimalist open book icon
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.45, cy - r * 0.72, cx - r * 0.88, cy - r * 0.48);
      ctx.lineTo(cx - r * 0.88, cy + r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.45, cy + r * 0.35, cx, cy + r * 0.56);
      ctx.quadraticCurveTo(cx + r * 0.45, cy + r * 0.35, cx + r * 0.88, cy + r * 0.55);
      ctx.lineTo(cx + r * 0.88, cy - r * 0.48);
      ctx.quadraticCurveTo(cx + r * 0.45, cy - r * 0.72, cx, cy - r * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx, cy + r * 0.56);
      ctx.stroke();
    } else if (kind === 'music') {
      // Clean double eighth-note icon
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.36, cy + r * 0.42);
      ctx.lineTo(cx - r * 0.36, cy - r * 0.52);
      ctx.lineTo(cx + r * 0.56, cy - r * 0.72);
      ctx.lineTo(cx + r * 0.56, cy + r * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.52, cy + r * 0.48, r * 0.24, r * 0.18, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.4, cy + r * 0.3, r * 0.24, r * 0.18, -0.25, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'language') {
      // Minimalist globe meridian emblem
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.76, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.38, r * 0.76, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.74, cy);
      ctx.lineTo(cx + r * 0.74, cy);
      ctx.stroke();
    } else if (kind === 'ai') {
      // Crisp 4-point star emblem
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.85);
      ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 0.1, cx + r * 0.85, cy);
      ctx.quadraticCurveTo(cx + r * 0.1, cy + r * 0.1, cx, cy + r * 0.85);
      ctx.quadraticCurveTo(cx - r * 0.1, cy + r * 0.1, cx - r * 0.85, cy);
      ctx.quadraticCurveTo(cx - r * 0.1, cy - r * 0.1, cx, cy - r * 0.85);
      ctx.closePath();
      ctx.fill();
    } else {
      // Classic curved telephone handset icon
      ctx.lineWidth = r * 0.24;
      ctx.beginPath();
      ctx.arc(cx + r * 0.16, cy - r * 0.16, r * 0.72, Math.PI * 0.62, Math.PI * 1.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - r * 0.44, cy - r * 0.42, r * 0.2, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.44, cy + r * 0.42, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /**
   * Builds a grounded, realistic garden wooden-and-stone standing signpost (庭院立牌)
   * placed neatly beside a building, displaying a clear minimalist icon + short title
   * with zero lengthy text or floating UI clutter.
   */
  const createStandingSignpost = (opts: {
    title: string;
    icon: SignIconKind;
    worldX: number;
    worldZ: number;
    boardW: number;
    boardH: number;
    postH: number;
    bgHex: string;
    borderHex: string;
    textHex: string;
    emissiveHex: number;
  }): { group: THREE.Group; faceMat: THREE.MeshStandardMaterial } => {
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Rich matte dark timber/lacquer backdrop for clean, glare-free contrast
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, opts.bgHex);
      grad.addColorStop(1, '#100d0b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle single inner gilded hairline border
      ctx.strokeStyle = opts.borderHex;
      ctx.lineWidth = 14;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
      ctx.globalAlpha = 1;

      // Measure text to center [icon + short title] cleanly as one cohesive lockup
      const fontSize = opts.title.length >= 4 ? 236 : opts.title.length === 3 ? 268 : 292;
      ctx.font = `700 ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      const textW = ctx.measureText(opts.title).width;
      const iconR = 112;
      const gap = 64;
      const totalW = iconR * 2 + gap + textW;
      const startX = (canvas.width - totalW) * 0.5;
      const centerY = canvas.height * 0.52;

      // Crisp gilded icon badge on left
      drawSignIcon(ctx, opts.icon, startX + iconR, centerY, iconR * 0.84, opts.borderHex);

      // Crisp single-line short title on right
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 13;
      ctx.strokeStyle = 'rgba(8, 7, 6, 0.78)';
      const textX = startX + iconR * 2 + gap;
      ctx.strokeText(opts.title, textX, centerY);
      ctx.fillStyle = opts.textHex;
      ctx.fillText(opts.title, textX, centerY);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    signTextures.push(tex);

    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(opts.emissiveHex),
      emissiveIntensity: 0.34,
      roughness: 0.86,
      metalness: 0.02,
    });
    materials.push(faceMat);

    const signGroup = new THREE.Group();
    const groundY = terrainHeightAt(opts.worldX, opts.worldZ);
    signGroup.position.set(opts.worldX, groundY, opts.worldZ);
    // Face naturally toward the Overlook viewer at (0, y, 25.4)
    signGroup.rotation.y = Math.atan2(0.0 - opts.worldX, 25.4 - opts.worldZ);

    const postOffsetX = opts.boardW * 0.44;
    const boardCenterY = opts.postH - opts.boardH * 0.5 - 0.14;
    const boardDepth = 0.095;

    // Grounded carved granite foundation plinth seated cleanly into earth
    const stonePlinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(opts.boardW + 0.36, 0.44, 0.48)),
      graniteMat
    );
    stonePlinth.position.y = -0.04;
    stonePlinth.castShadow = quality.enableShadows;
    stonePlinth.receiveShadow = quality.enableShadows;
    signGroup.add(stonePlinth);

    const stoneCap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(opts.boardW + 0.22, 0.09, 0.38)),
      plinthStoneMat
    );
    stoneCap.position.y = 0.21;
    stoneCap.receiveShadow = quality.enableShadows;
    signGroup.add(stoneCap);

    // Twin rosewood timber posts + stone collar bases
    const postGeo = trackGeo(new THREE.BoxGeometry(0.115, opts.postH, 0.115));
    const shoeGeo = trackGeo(new THREE.BoxGeometry(0.17, 0.14, 0.17));
    for (const px of [-postOffsetX, postOffsetX]) {
      const shoe = new THREE.Mesh(shoeGeo, bronzeMat);
      shoe.position.set(px, 0.29, 0);
      signGroup.add(shoe);

      const post = new THREE.Mesh(postGeo, rosewoodMat);
      post.position.set(px, 0.22 + opts.postH * 0.5, 0);
      post.castShadow = quality.enableShadows;
      post.receiveShadow = quality.enableShadows;
      signGroup.add(post);
    }

    // Horizontal lower tie-rail between the twin posts
    const lowerRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(postOffsetX * 2, 0.075, 0.075)),
      rosewoodMat
    );
    lowerRail.position.y = Math.max(0.56, boardCenterY - opts.boardH * 0.5 - 0.22);
    signGroup.add(lowerRail);

    // Solid walnut sign board backing + subtle bronze frame trim
    const board = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(opts.boardW, opts.boardH, boardDepth)),
      rosewoodMat
    );
    board.position.y = boardCenterY;
    board.castShadow = quality.enableShadows;
    board.receiveShadow = quality.enableShadows;
    signGroup.add(board);

    const trimT = 0.042;
    const topTrim = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(opts.boardW + trimT * 1.4, trimT, boardDepth + 0.025)),
      bronzeMat
    );
    topTrim.position.y = boardCenterY + opts.boardH * 0.5 + trimT * 0.3;
    const botTrim = topTrim.clone();
    botTrim.position.y = boardCenterY - opts.boardH * 0.5 - trimT * 0.3;
    signGroup.add(topTrim, botTrim);

    // Front & back crisp single-line lettering faces
    const faceGeo = trackGeo(new THREE.PlaneGeometry(opts.boardW - 0.04, opts.boardH - 0.04));
    const frontFace = new THREE.Mesh(faceGeo, faceMat);
    frontFace.position.set(0, boardCenterY, boardDepth * 0.5 + 0.008);
    const backFace = new THREE.Mesh(faceGeo, faceMat);
    backFace.position.set(0, boardCenterY, -(boardDepth * 0.5 + 0.008));
    backFace.rotation.y = Math.PI;
    signGroup.add(frontFace, backFace);

    // Traditional miniature pitched slate eaves cap (小牌檐) sheltering the wooden sign
    const capY = 0.22 + opts.postH + 0.04;
    const capW = opts.boardW + 0.52;
    const capSlopeGeo = trackGeo(new THREE.BoxGeometry(capW, 0.055, 0.36));
    const frontEave = new THREE.Mesh(capSlopeGeo, ceramicTileMat);
    frontEave.position.set(0, capY, 0.14);
    frontEave.rotation.x = 0.34;
    frontEave.castShadow = quality.enableShadows;
    const backEave = new THREE.Mesh(capSlopeGeo, ceramicTileMat);
    backEave.position.set(0, capY, -0.14);
    backEave.rotation.x = -0.34;
    backEave.castShadow = quality.enableShadows;
    const capRidge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(capW + 0.06, 0.075, 0.09)), ridgeStoneMat);
    capRidge.position.set(0, capY + 0.085, 0);
    signGroup.add(frontEave, backEave, capRidge);

    return { group: signGroup, faceMat };
  };

  // =========================================================================
  // 1. Waterside Double-Eave Timber Pavilion (音乐馆) at (9.8, y, -6.2)
  // =========================================================================
  const pav = new THREE.Group();
  const pavX = 9.8;
  const pavZ = -6.2;
  const pavScale = 1.18;
  const pavBaseY = terrainHeightAt(pavX, pavZ);
  pav.position.set(pavX, pavBaseY, pavZ);
  pav.rotation.y = -0.36; // angled cleanly toward lake & Overlook viewer so plaque reads sharply
  pav.scale.setScalar(pavScale);

  // Lower carved stone terrace plinth (seats cleanly below terrain)
  const lowerPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.26, 0.58, 5.26)), graniteMat);
  lowerPlinth.position.y = -0.02;
  lowerPlinth.castShadow = quality.enableShadows;
  lowerPlinth.receiveShadow = quality.enableShadows;
  pav.add(lowerPlinth);

  // Recessed upper stone podium molding (须弥座台基)
  const upperPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.64, 0.34, 4.64)), plinthStoneMat);
  upperPlinth.position.y = 0.42;
  upperPlinth.castShadow = quality.enableShadows;
  upperPlinth.receiveShadow = quality.enableShadows;
  pav.add(upperPlinth);

  // Grooved cedar plank floor deck + edge trim
  const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.26, 0.12, 4.26)), cedarDeckMat);
  deck.position.y = 0.64;
  deck.receiveShadow = quality.enableShadows;
  pav.add(deck);

  // 3 Wide carved granite entrance steps facing garden path + side cheek curbs
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.08, 0.16, 0.44)), plinthStoneMat);
    step.position.set(0, 0.48 - s * 0.16, 2.48 + s * 0.42);
    step.receiveShadow = quality.enableShadows;
    pav.add(step);
  }
  for (const side of [-1.12, 1.12]) {
    const cheek = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.17, 0.42, 1.36)), graniteMat);
    cheek.position.set(side, 0.32, 2.86);
    cheek.rotation.x = 0.34;
    pav.add(cheek);
  }

  // Carved stone drum column bases (LatheGeometry 柱础) + 4 Rosewood Pillars
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
  const pillarGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.138, 2.76, 16));

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

  // Carved lakeside balustrade benches (美人靠) along West, North, and East bays
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

  // Upper eave tie-beams (额枋), stepped Dougong brackets (斗拱) & carved arch braces (雀替)
  const beamXGeo = trackGeo(new THREE.BoxGeometry(3.92, 0.18, 0.16));
  const beamZGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.18, 3.92));
  const lowerBeamXGeo = trackGeo(new THREE.BoxGeometry(3.46, 0.1, 0.11));
  const lowerBeamZGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.1, 3.46));
  const bracketBaseGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.1, 0.28));
  const bracketTopGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.11, 0.42));
  const corbelGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.18, 0.08));

  for (const z of [-1.68, 1.68]) {
    const b = new THREE.Mesh(beamXGeo, rosewoodMat);
    b.position.set(0, 3.44, z);
    pav.add(b);
    const lb = new THREE.Mesh(lowerBeamXGeo, cedarDeckMat);
    lb.position.set(0, 3.16, z);
    pav.add(lb);
  }
  for (const x of [-1.68, 1.68]) {
    const b = new THREE.Mesh(beamZGeo, rosewoodMat);
    b.position.set(x, 3.44, 0);
    pav.add(b);
    const lb = new THREE.Mesh(lowerBeamZGeo, cedarDeckMat);
    lb.position.set(x, 3.16, 0);
    pav.add(lb);
  }
  for (const [cx, cz] of mainCols) {
    const br1 = new THREE.Mesh(bracketBaseGeo, rosewoodMat);
    br1.position.set(cx, 3.55, cz);
    pav.add(br1);
    const br2 = new THREE.Mesh(bracketTopGeo, bronzeMat);
    br2.position.set(cx, 3.63, cz);
    pav.add(br2);

    // Carved corner braces along both tie-beam axes
    const c1 = new THREE.Mesh(corbelGeo, cedarDeckMat);
    c1.position.set(cx - Math.sign(cx) * 0.24, 3.28, cz);
    pav.add(c1);
    const c2 = new THREE.Mesh(corbelGeo, cedarDeckMat);
    c2.position.set(cx, 3.28, cz - Math.sign(cz) * 0.24);
    c2.rotation.y = Math.PI / 2;
    pav.add(c2);
  }

  // Radiating wooden eave rafters beneath lower roof
  const rafterGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.06, 1.78));
  for (let side = 0; side < 4; side++) {
    for (let r = -4; r <= 4; r++) {
      const rafter = new THREE.Mesh(rafterGeo, cedarDeckMat);
      const ang = side * (Math.PI / 2);
      const localX = r * 0.44;
      const localZ = 2.04;
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

  // Lower sweeping concave roof (飞檐翘角) + 4 diagonal curved ridge beams + eave-edge wadang tile discs
  const lowerRoofSpan = 2.88;
  const lowerRoofHeight = 1.24;
  const lowerRoofLift = 0.46;
  const lowerRoofGeo = trackGeo(createSweepingPagodaRoofGeo(lowerRoofSpan, lowerRoofHeight, lowerRoofLift, 18, 20));
  const lowerRoof = new THREE.Mesh(lowerRoofGeo, ceramicTileMat);
  lowerRoof.position.y = 3.5;
  lowerRoof.castShadow = quality.enableShadows;
  lowerRoof.receiveShadow = quality.enableShadows;
  pav.add(lowerRoof);

  const lowerRidgeGeo = trackGeo(createHipRidgeGeo(lowerRoofSpan, lowerRoofHeight, lowerRoofLift, 0.056));
  for (let q = 0; q < 4; q++) {
    const ridge = new THREE.Mesh(lowerRidgeGeo, ridgeStoneMat);
    ridge.position.y = 3.5;
    ridge.rotation.y = q * (Math.PI / 2);
    pav.add(ridge);
  }

  // Sculpted eave-end circular Wadang (瓦当) tile caps along lower roof eaves
  const wadangGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 8));
  wadangGeo.rotateX(Math.PI / 2);
  for (let q = 0; q < 4; q++) {
    const ang = q * (Math.PI / 2);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (let k = -9; k <= 9; k++) {
      const u = k / 9.5;
      const sx = u * lowerRoofSpan;
      const sz = lowerRoofSpan;
      const yLift = Math.pow(Math.abs(u), 2.1) * lowerRoofLift;
      const cap = new THREE.Mesh(wadangGeo, ridgeStoneMat);
      cap.position.set(sx * cosA - sz * sinA, 3.49 + yLift, sx * sinA + sz * cosA);
      cap.rotation.y = ang;
      pav.add(cap);
    }
  }

  // Architectural 8-post carved clerestory collar drum (重檐镂空腰阁) between lower & upper tiers
  const clerestoryGroup = new THREE.Group();
  clerestoryGroup.position.y = 4.46;
  const clerestoryCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 0.46, 1.56)), plasterWallMat);
  clerestoryGroup.add(clerestoryCore);
  const clPostGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.56, 0.11));
  for (const px of [-0.84, 0, 0.84]) {
    for (const pz of [-0.84, 0, 0.84]) {
      if (px === 0 && pz === 0) continue;
      const cp = new THREE.Mesh(clPostGeo, rosewoodMat);
      cp.position.set(px, 0, pz);
      clerestoryGroup.add(cp);
    }
  }
  const clRing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.84, 0.11, 1.84)), rosewoodMat);
  clRing.position.y = 0.24;
  clerestoryGroup.add(clRing);
  pav.add(clerestoryGroup);

  // Upper sweeping concave roof (重檐顶) + 4 upper hip ridges + upper wadang caps
  const upperRoofSpan = 1.68;
  const upperRoofHeight = 0.94;
  const upperRoofLift = 0.36;
  const upperRoofGeo = trackGeo(createSweepingPagodaRoofGeo(upperRoofSpan, upperRoofHeight, upperRoofLift, 14, 16));
  const upperRoof = new THREE.Mesh(upperRoofGeo, ceramicTileMat);
  upperRoof.position.y = 4.64;
  upperRoof.castShadow = quality.enableShadows;
  pav.add(upperRoof);

  const upperRidgeGeo = trackGeo(createHipRidgeGeo(upperRoofSpan, upperRoofHeight, upperRoofLift, 0.044));
  for (let q = 0; q < 4; q++) {
    const ridge = new THREE.Mesh(upperRidgeGeo, ridgeStoneMat);
    ridge.position.y = 4.64;
    ridge.rotation.y = q * (Math.PI / 2);
    pav.add(ridge);
  }

  for (let q = 0; q < 4; q++) {
    const ang = q * (Math.PI / 2);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (let k = -5; k <= 5; k++) {
      const u = k / 5.5;
      const sx = u * upperRoofSpan;
      const sz = upperRoofSpan;
      const yLift = Math.pow(Math.abs(u), 2.1) * upperRoofLift;
      const cap = new THREE.Mesh(wadangGeo, ridgeStoneMat);
      cap.position.set(sx * cosA - sz * sinA, 4.63 + yLift, sx * sinA + sz * cosA);
      cap.rotation.y = ang;
      pav.add(cap);
    }
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
    new THREE.Vector2(0.0, 0.72),
  ];
  const finial = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(finialProfile, 16)), bronzeMat);
  finial.position.y = 5.5;
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

  // Classical Music Stage inside Pavilion: Carved Guqin Table & 7-String Zither
  const musicTableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.07, 0.58)), rosewoodMat);
  musicTableTop.position.set(0, 1.32, -0.32);
  musicTableTop.castShadow = quality.enableShadows;
  pav.add(musicTableTop);
  const tableLegGeo = trackGeo(new THREE.BoxGeometry(0.07, 0.62, 0.48));
  for (const tx of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(tableLegGeo, rosewoodMat);
    leg.position.set(tx, 1.0, -0.32);
    pav.add(leg);
  }
  const guqinBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.055, 0.22)), charredCedarMat);
  guqinBody.position.set(0, 1.385, -0.32);
  pav.add(guqinBody);
  const guqinTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.06, 0.014, 0.14)), bronzeMat);
  guqinTrim.position.set(0, 1.42, -0.32);
  pav.add(guqinTrim);

  // Grounded garden standing signpost placed cleanly beside the Music Pavilion
  const musicSign = createStandingSignpost({
    title: '音乐馆',
    icon: 'music',
    worldX: 12.9,
    worldZ: -4.2,
    boardW: 2.45,
    boardH: 0.84,
    postH: 2.3,
    bgHex: '#2f1317',
    borderHex: '#e6c677',
    textHex: '#fffcf5',
    emissiveHex: 0xffe4aa,
  });
  const musicPortalGroup = new THREE.Group();
  musicPortalGroup.add(pav, musicSign.group);
  group.add(musicPortalGroup);

  // =========================================================================
  // 2. Realistic Bank-to-Bank Arched Timber & Granite Bridge (连岸石基木拱桥)
  // Spans strictly perpendicular across the stream, solidly anchored into BOTH banks
  // =========================================================================
  const bridge = new THREE.Group();
  bridge.position.set(BRIDGE_CONFIG.centerX, BRIDGE_CONFIG.deckBaseY, BRIDGE_CONFIG.centerZ);
  bridge.rotation.y = BRIDGE_CONFIG.rotY;

  const span = BRIDGE_CONFIG.span; // 9.4m clear span from bank A to bank B
  const halfSpan = span * 0.5;
  const archRise = BRIDGE_CONFIG.archRise; // graceful 1.02m rise over stream
  const bridgeWidth = 2.42;
  const railOffset = 1.08;

  const evalArchY = (t: number) => Math.cos(t * Math.PI) * archRise; // t in [-0.5, 0.5]
  const evalArchSlope = (t: number) => -Math.sin(t * Math.PI) * ((archRise * Math.PI) / span);

  // 2a. Deep Ashlar Masonry Abutments + Flared Wing-Walls + Granite Approach Steps on BOTH banks
  const abutmentMainGeo = trackGeo(new THREE.BoxGeometry(bridgeWidth + 0.68, 2.35, 1.85));
  const copingGeo = trackGeo(new THREE.BoxGeometry(bridgeWidth + 0.86, 0.16, 1.98));
  const wingWallGeo = trackGeo(new THREE.BoxGeometry(0.42, 1.95, 1.75));
  const approachStepGeo = trackGeo(new THREE.BoxGeometry(bridgeWidth + 0.14, 0.16, 0.44));
  const entryCurbGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.52, 1.65));

  for (const dir of [-1, 1]) {
    // Solid stone masonry pier anchored deep into the earth/riverbank (-2.2m below deck)
    const abutment = new THREE.Mesh(abutmentMainGeo, graniteMat);
    abutment.position.set(0, -1.16, dir * (halfSpan + 0.58));
    abutment.castShadow = quality.enableShadows;
    abutment.receiveShadow = quality.enableShadows;
    bridge.add(abutment);

    // Dressed stone top coping cap slab flush with bank approach
    const coping = new THREE.Mesh(copingGeo, plinthStoneMat);
    coping.position.set(0, 0.04, dir * (halfSpan + 0.62));
    coping.castShadow = quality.enableShadows;
    coping.receiveShadow = quality.enableShadows;
    bridge.add(coping);

    // Flared left & right stone retaining wing-walls gripping into the sloping riverbank earth
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingWallGeo, graniteMat);
      wing.position.set(side * (bridgeWidth * 0.5 + 0.48), -0.84, dir * (halfSpan + 0.92));
      wing.rotation.y = side * dir * -0.44;
      wing.castShadow = quality.enableShadows;
      wing.receiveShadow = quality.enableShadows;
      bridge.add(wing);

      // Low granite approach entry curb flanking the steps
      const curb = new THREE.Mesh(entryCurbGeo, plinthStoneMat);
      curb.position.set(side * (bridgeWidth * 0.5 + 0.12), 0.12, dir * (halfSpan + 1.38));
      curb.rotation.x = dir * 0.18;
      curb.castShadow = quality.enableShadows;
      curb.receiveShadow = quality.enableShadows;
      bridge.add(curb);
    }

    // 3 Wide carved granite approach steps seamlessly bridging abutment down onto garden footpath
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(approachStepGeo, plinthStoneMat);
      step.position.set(0, -0.02 - s * 0.12, dir * (halfSpan + 1.15 + s * 0.42));
      step.receiveShadow = quality.enableShadows;
      bridge.add(step);
    }
  }

  // 2b. Twin Heavy Curved Arch Ribs + Center Keel Beam + Cross Joists supporting the deck
  const crossJoistGeo = trackGeo(new THREE.BoxGeometry(bridgeWidth + 0.08, 0.14, 0.14));
  for (const xBeam of [-0.94, 0.0, 0.94]) {
    const ribPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 26; k++) {
      const t = k / 26 - 0.5;
      const z = t * (span + 0.9);
      const tClamped = Math.max(-0.5, Math.min(0.5, z / span));
      const y = evalArchY(tClamped) - (xBeam === 0 ? 0.18 : 0.16);
      ribPts.push(new THREE.Vector3(xBeam, y, z));
    }
    const ribGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 28, xBeam === 0 ? 0.105 : 0.115, 8, false));
    const rib = new THREE.Mesh(ribGeo, charredCedarMat);
    rib.castShadow = quality.enableShadows;
    rib.receiveShadow = quality.enableShadows;
    bridge.add(rib);
  }

  // Structural lower diagonal timber struts bracing arch ribs into stone abutments
  const braceGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.16, 1.95));
  for (const dir of [-1, 1]) {
    for (const side of [-0.92, 0.92]) {
      const brace = new THREE.Mesh(braceGeo, charredCedarMat);
      brace.position.set(side, -0.26, dir * (halfSpan - 0.72));
      brace.rotation.x = dir * -0.44;
      brace.castShadow = quality.enableShadows;
      bridge.add(brace);
    }
  }

  // 2c. 28 Individual Weathered Cedar Deck Planks + Closely Spaced Balusters + 6 Carved Newel Posts
  const plankCount = 28;
  const plankGeo = trackGeo(new THREE.BoxGeometry(bridgeWidth, 0.095, 0.315));
  const postGeo = trackGeo(new THREE.BoxGeometry(0.135, 1.04, 0.135));
  const postBaseGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.12, 0.18));
  const balusterGeo = trackGeo(new THREE.BoxGeometry(0.052, 0.74, 0.052));
  const giboshiProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.088, 0.0),
    new THREE.Vector2(0.082, 0.04),
    new THREE.Vector2(0.055, 0.07),
    new THREE.Vector2(0.082, 0.13),
    new THREE.Vector2(0.048, 0.19),
    new THREE.Vector2(0.0, 0.24),
  ];
  const giboshiGeo = trackGeo(new THREE.LatheGeometry(giboshiProfile, 12));

  const newelIndices = new Set([0, 6, 13, 14, 21, plankCount - 1]);
  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1) - 0.5;
    const zPos = t * span;
    const archY = evalArchY(t);
    const slope = evalArchSlope(t);

    const plank = new THREE.Mesh(plankGeo, cedarDeckMat);
    plank.position.set(0, archY, zPos);
    plank.rotation.x = -slope;
    plank.castShadow = quality.enableShadows;
    plank.receiveShadow = quality.enableShadows;
    bridge.add(plank);

    if (i % 3 === 1) {
      const joist = new THREE.Mesh(crossJoistGeo, charredCedarMat);
      joist.position.set(0, archY - 0.12, zPos);
      joist.rotation.x = -slope;
      bridge.add(joist);
    }

    if (newelIndices.has(i) && i !== 14) {
      for (const side of [-railOffset, railOffset]) {
        const pBase = new THREE.Mesh(postBaseGeo, plinthStoneMat);
        pBase.position.set(side, archY + 0.06, zPos);
        bridge.add(pBase);

        const post = new THREE.Mesh(postGeo, rosewoodMat);
        post.position.set(side, archY + 0.52, zPos);
        post.castShadow = quality.enableShadows;
        bridge.add(post);

        const cap = new THREE.Mesh(giboshiGeo, bronzeMat);
        cap.position.set(side, archY + 1.03, zPos);
        bridge.add(cap);
      }
    } else if (i % 2 === 0 && i > 0 && i < plankCount - 1) {
      for (const side of [-railOffset, railOffset]) {
        const bal = new THREE.Mesh(balusterGeo, cedarDeckMat);
        bal.position.set(side, archY + 0.44, zPos);
        bal.castShadow = quality.enableShadows;
        bridge.add(bal);
      }
    }
  }

  // 2d. Continuous Double Curved Timber Handrails (top + mid + kickboard) flaring onto both abutments
  for (const side of [-railOffset, railOffset]) {
    const topRailPts: THREE.Vector3[] = [];
    const midRailPts: THREE.Vector3[] = [];
    const curbRailPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 26; k++) {
      const t = k / 26 - 0.5;
      const z = t * (span + 0.45);
      const tClamped = Math.max(-0.5, Math.min(0.5, z / span));
      const y = evalArchY(tClamped);
      topRailPts.push(new THREE.Vector3(side, y + 0.91, z));
      midRailPts.push(new THREE.Vector3(side, y + 0.52, z));
      curbRailPts.push(new THREE.Vector3(side * 0.96, y + 0.09, z));
    }
    const topGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topRailPts), 28, 0.056, 8, false));
    const topMesh = new THREE.Mesh(topGeo, rosewoodMat);
    topMesh.castShadow = quality.enableShadows;
    bridge.add(topMesh);

    const midGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midRailPts), 28, 0.036, 8, false));
    bridge.add(new THREE.Mesh(midGeo, rosewoodMat));

    const curbGeo = trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curbRailPts), 28, 0.048, 6, false));
    bridge.add(new THREE.Mesh(curbGeo, charredCedarMat));
  }

  group.add(bridge);

  // =========================================================================
  // 3. Carved Traditional Granite Garden Lanterns (石灯笼) framing Bridge & Path
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

  // Place warm stone lanterns flanking both ends of the bridge and the pavilion approach
  buildStoneLantern(
    BRIDGE_CONFIG.bankAX + BRIDGE_CONFIG.axisZ * 2.1 - BRIDGE_CONFIG.axisX * 0.9,
    BRIDGE_CONFIG.bankAZ - BRIDGE_CONFIG.axisX * 2.1 - BRIDGE_CONFIG.axisZ * 0.9
  );
  buildStoneLantern(
    BRIDGE_CONFIG.bankBX - BRIDGE_CONFIG.axisZ * 2.0 + BRIDGE_CONFIG.axisX * 0.9,
    BRIDGE_CONFIG.bankBZ + BRIDGE_CONFIG.axisX * 2.0 + BRIDGE_CONFIG.axisZ * 0.9
  );
  buildStoneLantern(8.8, -8.2);

  // =========================================================================
  // 4. Natural Shoreline Accent Boulders (trimmed cleanly — waterfall gorge rocks live in paradiseTerrain)
  // =========================================================================
  const rockDefs: Array<[number, number, number, number, number]> = [
    [-11.8, -13.2, 1.55, 1.05, 1.7],
    [-12.0, -6.5, 1.3, 0.82, 2.3],
    [-5.0, -12.8, 1.2, 0.82, 0.4],
    [13.8, -2.4, 1.35, 0.82, 2.8],
    [14.2, 2.2, 1.45, 0.88, 0.6],
    [-5.6, 3.4, 1.05, 0.64, 2.1],
    [5.9, 3.6, 1.1, 0.64, 0.9],
  ];

  for (let idx = 0; idx < rockDefs.length; idx++) {
    const [rx, rz, rw, rh, rot] = rockDefs[idx];
    const rockGeo = trackGeo(new THREE.IcosahedronGeometry(1, 2));
    const rp = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const vx = rp.getX(i);
      const vy = rp.getY(i);
      const vz = rp.getZ(i);
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

  // Keep reference to gardenPathFactor clean (unused stepping-stone disc clutter removed)
  void gardenPathFactor;

  // =========================================================================
  // 4b. Classic Wooden Garden Crossroads Wayfinding Signpost (庭院路口指路牌)
  //     Positioned cleanly beside the main foreground courtyard fork at (1.85, y, 11.4)
  // =========================================================================
  const buildCrossroadsSignpost = (wx: number, wz: number) => {
    const cg = new THREE.Group();
    const gy = terrainHeightAt(wx, wz);
    cg.position.set(wx, gy, wz);

    // Carved granite base plinth + timber main post + bronze finial
    const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.36, 0.42, 8)), graniteMat);
    base.position.y = 0.04;
    base.castShadow = quality.enableShadows;
    base.receiveShadow = quality.enableShadows;
    cg.add(base);

    const mainPost = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.1, 2.45, 10)), rosewoodMat);
    mainPost.position.y = 1.42;
    mainPost.castShadow = quality.enableShadows;
    cg.add(mainPost);

    const postCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.18, 0.16, 8)), ceramicTileMat);
    postCap.position.y = 2.68;
    cg.add(postCap);
    const capKnob = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 8)), bronzeMat);
    capKnob.position.y = 2.78;
    cg.add(capKnob);

    // 4 slim wooden directional arrow arms pointing cleanly toward each garden zone
    const armDefs: Array<{ label: string; y: number; targetX: number; targetZ: number }> = [
      { label: 'AI 中心', y: 2.34, targetX: 0.0, targetZ: -10.8 },
      { label: '音乐馆', y: 2.02, targetX: 9.8, targetZ: -6.2 },
      { label: '语言中心', y: 1.7, targetX: 8.2, targetZ: 6.8 },
      { label: '图书馆 · 通讯', y: 1.38, targetX: -9.8, targetZ: 1.6 },
    ];

    for (const arm of armDefs) {
      const armCanvas = document.createElement('canvas');
      armCanvas.width = 768;
      armCanvas.height = 192;
      const actx = armCanvas.getContext('2d');
      if (actx) {
        actx.fillStyle = '#251710';
        actx.fillRect(0, 0, armCanvas.width, armCanvas.height);
        actx.strokeStyle = '#d8b768';
        actx.lineWidth = 8;
        actx.strokeRect(12, 12, armCanvas.width - 24, armCanvas.height - 24);
        actx.fillStyle = '#fff9ec';
        actx.textAlign = 'center';
        actx.textBaseline = 'middle';
        actx.font = '700 84px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
        actx.fillText(arm.label, armCanvas.width * 0.5, armCanvas.height * 0.53);
      }
      const armTex = new THREE.CanvasTexture(armCanvas);
      armTex.colorSpace = THREE.SRGBColorSpace;
      armTex.anisotropy = 8;
      signTextures.push(armTex);

      const armMat = new THREE.MeshStandardMaterial({
        map: armTex,
        emissiveMap: armTex,
        emissive: new THREE.Color(0xffe4aa),
        emissiveIntensity: 0.24,
        roughness: 0.82,
        metalness: 0.04,
      });
      materials.push(armMat);

      const armGroup = new THREE.Group();
      armGroup.position.y = arm.y;
      // Rotate so arm's +X tip points naturally toward the destination building
      const dirAng = Math.atan2(-(arm.targetZ - wz), arm.targetX - wx);
      armGroup.rotation.y = dirAng;

      const armW = 1.18;
      const armH = 0.26;
      const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(armW, armH, 0.055)), rosewoodMat);
      plank.position.x = armW * 0.48;
      plank.castShadow = quality.enableShadows;
      armGroup.add(plank);

      // Pointed arrow tip triangle at outer end (+X)
      const tipGeo = trackGeo(new THREE.ConeGeometry(armH * 0.54, 0.22, 4));
      tipGeo.rotateZ(-Math.PI / 2);
      tipGeo.rotateX(Math.PI / 4);
      const tip = new THREE.Mesh(tipGeo, bronzeMat);
      tip.position.x = armW * 0.98 + 0.08;
      armGroup.add(tip);

      // Front & back legible lettering strips
      const stripGeo = trackGeo(new THREE.PlaneGeometry(armW - 0.06, armH - 0.04));
      const fStrip = new THREE.Mesh(stripGeo, armMat);
      fStrip.position.set(armW * 0.48, 0, 0.032);
      const bStrip = new THREE.Mesh(stripGeo, armMat);
      bStrip.position.set(armW * 0.48, 0, -0.032);
      bStrip.rotation.y = Math.PI;
      armGroup.add(fStrip, bStrip);

      cg.add(armGroup);
    }

    group.add(cg);
  };
  buildCrossroadsSignpost(1.85, 11.4);

  // =========================================================================
  // 5. Realistic East-Asian Library Cottage (图书馆) at (-9.8, y, 1.6)
  // =========================================================================
  const restHouseGroup = new THREE.Group();
  const rhX = -9.8;
  const rhZ = 1.6;
  const rhScale = 1.15;
  const rhBaseY = terrainHeightAt(rhX, rhZ);
  restHouseGroup.position.set(rhX, rhBaseY, rhZ);
  restHouseGroup.rotation.y = 0.38; // face southeast cleanly toward viewer & main courtyard
  restHouseGroup.scale.setScalar(rhScale);

  const restWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b3,
    emissive: new THREE.Color(0xffa748),
    emissiveIntensity: 0.24,
    roughness: 0.32,
    metalness: 0.04,
  });
  materials.push(restWindowMat);

  // 5a. Ashlar stone terrace plinth + upper stone coping rim + entry steps
  const rhStoneSubBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.06, 0.42, 3.82)), graniteMat);
  rhStoneSubBase.position.set(0, 0.02, 0.08);
  rhStoneSubBase.castShadow = quality.enableShadows;
  rhStoneSubBase.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhStoneSubBase);

  const rhStoneCoping = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.84, 0.12, 3.62)), plinthStoneMat);
  rhStoneCoping.position.set(0, 0.24, 0.08);
  rhStoneCoping.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhStoneCoping);

  // Grooved cedar veranda deck (缘侧)
  const rhVeranda = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.64, 0.11, 3.44)), cedarDeckMat);
  rhVeranda.position.set(0, 0.34, 0.08);
  rhVeranda.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhVeranda);

  // Entry stone stairs + side stone cheek curbs
  for (let s = 0; s < 2; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.34, 0.12, 0.34)), plinthStoneMat);
    step.position.set(0, 0.24 - s * 0.12, 1.92 + s * 0.3);
    step.receiveShadow = quality.enableShadows;
    restHouseGroup.add(step);
  }
  for (const side of [-0.74, 0.74]) {
    const cheek = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.26, 0.72)), graniteMat);
    cheek.position.set(side, 0.16, 2.04);
    cheek.rotation.x = 0.28;
    restHouseGroup.add(cheek);
  }

  // Front porch timber balustrades flanking the central entry + side veranda rails
  const rhRailPostGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.64, 0.09));
  const rhFrontRailGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.065, 0.08));
  const rhSideRailGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.065, 0.74));
  const rhBalusterGeo = trackGeo(new THREE.BoxGeometry(0.036, 0.44, 0.036));

  for (const side of [-1, 1]) {
    // Front flanking balustrade (leaves central 1.1m opening clear for steps)
    const frontRailTop = new THREE.Mesh(rhFrontRailGeo, rosewoodMat);
    frontRailTop.position.set(side * 1.16, 0.94, 1.66);
    restHouseGroup.add(frontRailTop);
    const frontRailBot = new THREE.Mesh(rhFrontRailGeo, rosewoodMat);
    frontRailBot.position.set(side * 1.16, 0.54, 1.66);
    restHouseGroup.add(frontRailBot);

    const innerNewel = new THREE.Mesh(rhRailPostGeo, rosewoodMat);
    innerNewel.position.set(side * 0.68, 0.72, 1.66);
    restHouseGroup.add(innerNewel);
    const innerCap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 8)), bronzeMat);
    innerCap.position.set(side * 0.68, 1.07, 1.66);
    restHouseGroup.add(innerCap);

    for (let k = 0; k < 3; k++) {
      const bal = new THREE.Mesh(rhBalusterGeo, cedarDeckMat);
      bal.position.set(side * (0.88 + k * 0.24), 0.74, 1.66);
      restHouseGroup.add(bal);
    }

    // Side veranda porch rail from front post to main cottage wall
    const sideRailTop = new THREE.Mesh(rhSideRailGeo, rosewoodMat);
    sideRailTop.position.set(side * 1.62, 0.94, 1.24);
    restHouseGroup.add(sideRailTop);
    const sideRailBot = new THREE.Mesh(rhSideRailGeo, rosewoodMat);
    sideRailBot.position.set(side * 1.62, 0.54, 1.24);
    restHouseGroup.add(sideRailBot);
  }

  // 5b. Load-bearing Rosewood Post & Beam Frame + Stone Column Plinths
  const rhMainPostGeo = trackGeo(new THREE.BoxGeometry(0.145, 2.02, 0.145));
  const rhColDrumGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 12));
  const rhCols: Array<[number, number]> = [
    [-1.58, -1.44],
    [1.58, -1.44],
    [-1.58, 0.84],
    [1.58, 0.84],
    [-1.62, 1.66],
    [1.62, 1.66],
  ];
  for (const [cx, cz] of rhCols) {
    const drum = new THREE.Mesh(rhColDrumGeo, plinthStoneMat);
    drum.position.set(cx, 0.44, cz);
    restHouseGroup.add(drum);

    const col = new THREE.Mesh(rhMainPostGeo, rosewoodMat);
    col.position.set(cx, 1.46, cz);
    col.castShadow = quality.enableShadows;
    restHouseGroup.add(col);
  }

  // Horizontal sill beams, lintel tie-beams, and eave wall plates
  const rhEavePlateZ = trackGeo(new THREE.BoxGeometry(0.13, 0.14, 3.24));
  const rhCrossBeamX = trackGeo(new THREE.BoxGeometry(3.32, 0.15, 0.13));
  for (const side of [-1.58, 1.58]) {
    const plate = new THREE.Mesh(rhEavePlateZ, rosewoodMat);
    plate.position.set(side, 2.48, 0.11);
    restHouseGroup.add(plate);
  }
  for (const bz of [-1.44, 0.84, 1.66]) {
    const beam = new THREE.Mesh(rhCrossBeamX, rosewoodMat);
    beam.position.set(0, 2.44, bz);
    restHouseGroup.add(beam);
  }

  // 5c. Enclosed Cottage Body: Charred-Cedar Wainscoting + Lime Plaster Upper Walls + Closed Gable Triangles
  const rhWainscot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.16, 0.56, 2.28)), charredCedarMat);
  rhWainscot.position.set(0, 0.67, -0.3);
  rhWainscot.castShadow = quality.enableShadows;
  rhWainscot.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhWainscot);

  const rhUpperPlaster = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.08, 1.46, 2.22)), plasterWallMat);
  rhUpperPlaster.position.set(0, 1.68, -0.3);
  rhUpperPlaster.castShadow = quality.enableShadows;
  rhUpperPlaster.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rhUpperPlaster);

  // Horizontal mid-wall waist beam separating cedar wainscoting & white plaster
  const rhWaistBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.22, 0.08, 2.34)), rosewoodMat);
  rhWaistBeam.position.set(0, 0.96, -0.3);
  restHouseGroup.add(rhWaistBeam);

  // Closed triangular gable end walls (front & rear) sealing the catenary gable roof cleanly!
  const gableWidthHalf = 1.56;
  const gablePeakHeight = 1.06;
  const gableWallGeo = trackGeo(createGableTriangleGeo(gableWidthHalf, gablePeakHeight, 0.14));
  for (const gz of [-1.41, 0.81]) {
    const gable = new THREE.Mesh(gableWallGeo, plasterWallMat);
    gable.position.set(0, 2.4, gz);
    gable.castShadow = quality.enableShadows;
    restHouseGroup.add(gable);
  }
  // Open front porch gable king-post truss (人字梁 + 瓜柱) so looking up under porch roof reveals real joinery
  const porchTrussPost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.96, 0.11)), rosewoodMat);
  porchTrussPost.position.set(0, 2.92, 1.66);
  restHouseGroup.add(porchTrussPost);
  const porchPendant = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.075, 0.28, 8)), bronzeMat);
  porchPendant.position.set(0, 2.28, 1.68);
  restHouseGroup.add(porchPendant);

  // 5d. Authentic 3D Shoji Sliding Doorway with Kumiko Lattice Muntins
  const doorRecessX = 1.04;
  const doorHeight = 1.56;
  const doorFrameOuter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, doorHeight + 0.08, 0.11)), rosewoodMat);
  doorFrameOuter.position.set(0, 0.4 + doorHeight * 0.5, 0.81);
  restHouseGroup.add(doorFrameOuter);

  const doorGlowPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(doorRecessX - 0.04, doorHeight - 0.06)), restWindowMat);
  doorGlowPlane.position.set(0, 0.4 + doorHeight * 0.5, 0.87);
  restHouseGroup.add(doorGlowPlane);

  // 3D Vertical & horizontal kumiko shoji bars in front of the glowing rice-paper plane
  const vMuntinGeo = trackGeo(new THREE.BoxGeometry(0.024, doorHeight - 0.06, 0.026));
  const hMuntinGeo = trackGeo(new THREE.BoxGeometry(doorRecessX - 0.04, 0.022, 0.026));
  for (const mx of [-0.26, 0, 0.26]) {
    const bar = new THREE.Mesh(vMuntinGeo, mx === 0 ? rosewoodMat : cedarDeckMat);
    bar.position.set(mx, 0.4 + doorHeight * 0.5, 0.882);
    restHouseGroup.add(bar);
  }
  for (let row = 0; row < 5; row++) {
    const bar = new THREE.Mesh(hMuntinGeo, cedarDeckMat);
    bar.position.set(0, 0.62 + row * 0.26, 0.882);
    restHouseGroup.add(bar);
  }
  // Wooden lower kick-panel on shoji doors
  const doorKickPanel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(doorRecessX - 0.04, 0.28, 0.03)), charredCedarMat);
  doorKickPanel.position.set(0, 0.54, 0.88);
  restHouseGroup.add(doorKickPanel);

  // 5e. Side Kumiko Shoji Windows (Left & Right walls) with sills, lintels & 3D lattice bars
  const winW = 1.06;
  const winH = 0.84;
  const sideWinFrameGeo = trackGeo(new THREE.BoxGeometry(0.11, winH + 0.08, winW + 0.1));
  const sideWinSillGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.06, winW + 0.18));
  const sideWinPaneGeo = trackGeo(new THREE.PlaneGeometry(winW - 0.06, winH - 0.06));
  const sideWinVBarGeo = trackGeo(new THREE.BoxGeometry(0.024, winH - 0.06, 0.024));
  const sideWinHBarGeo = trackGeo(new THREE.BoxGeometry(0.024, 0.022, winW - 0.06));

  for (const side of [-1, 1]) {
    const wallX = side * 1.545;
    const wFrame = new THREE.Mesh(sideWinFrameGeo, rosewoodMat);
    wFrame.position.set(wallX, 1.48, -0.3);
    restHouseGroup.add(wFrame);

    const wSill = new THREE.Mesh(sideWinSillGeo, cedarDeckMat);
    wSill.position.set(side * 1.57, 1.04, -0.3);
    restHouseGroup.add(wSill);

    const wPane = new THREE.Mesh(sideWinPaneGeo, restWindowMat);
    wPane.position.set(side * 1.605, 1.48, -0.3);
    wPane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    restHouseGroup.add(wPane);

    for (const wz of [-0.62, -0.3, 0.02]) {
      const vb = new THREE.Mesh(sideWinVBarGeo, cedarDeckMat);
      vb.position.set(side * 1.615, 1.48, wz);
      restHouseGroup.add(vb);
    }
    for (const wy of [1.26, 1.48, 1.7]) {
      const hb = new THREE.Mesh(sideWinHBarGeo, cedarDeckMat);
      hb.position.set(side * 1.615, wy, -0.3);
      restHouseGroup.add(hb);
    }
  }

  // 5f. Sweeping Concave Catenary Tile Roof (江南卷棚黛瓦坡屋顶) + Exposed Eave Rafters + Ridge Finials
  const roofHalfW = 2.38;
  const roofRidgeH = 1.08;
  const roofEaveDrop = 0.08;
  const roofLenZ = 4.18;
  const slopeGeo = trackGeo(createCurvedGableRoofSlopeGeo(roofHalfW, roofRidgeH, roofEaveDrop, roofLenZ, 0.075, 14, 12));

  const rightSlope = new THREE.Mesh(slopeGeo, ceramicTileMat);
  rightSlope.position.set(0, 2.46, 0.12);
  rightSlope.castShadow = quality.enableShadows;
  rightSlope.receiveShadow = quality.enableShadows;
  restHouseGroup.add(rightSlope);

  const leftSlope = new THREE.Mesh(slopeGeo, ceramicTileMat);
  leftSlope.position.set(0, 2.46, 0.12);
  leftSlope.scale.x = -1;
  leftSlope.castShadow = quality.enableShadows;
  leftSlope.receiveShadow = quality.enableShadows;
  restHouseGroup.add(leftSlope);

  // Sculpted ridge beam (正脊) + upturned gable ridge finials (吻兽脊端)
  const rhRidgeBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.17, roofLenZ + 0.12)), ridgeStoneMat);
  rhRidgeBeam.position.set(0, 2.46 + roofRidgeH + 0.05, 0.12);
  restHouseGroup.add(rhRidgeBeam);

  const finialHornGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.24, 0.16));
  for (const fz of [0.12 - roofLenZ * 0.5, 0.12 + roofLenZ * 0.5]) {
    const horn = new THREE.Mesh(finialHornGeo, ridgeStoneMat);
    horn.position.set(0, 2.46 + roofRidgeH + 0.16, fz);
    horn.rotation.x = Math.sign(fz - 0.12) * -0.22;
    restHouseGroup.add(horn);
  }

  // Exposed under-eave cedar rafters (椽子) along both left & right eaves
  const rhRafterGeo = trackGeo(new THREE.BoxGeometry(2.38, 0.052, 0.052));
  for (let r = -5; r <= 5; r++) {
    const rz = 0.12 + r * 0.37;
    const rr = new THREE.Mesh(rhRafterGeo, cedarDeckMat);
    rr.position.set(1.14, 2.86, rz);
    rr.rotation.z = -0.44;
    restHouseGroup.add(rr);

    const lr = new THREE.Mesh(rhRafterGeo, cedarDeckMat);
    lr.position.set(-1.14, 2.86, rz);
    lr.rotation.z = 0.44;
    restHouseGroup.add(lr);
  }

  // Eave-edge circular Wadang tile caps lining both left & right roof eaves
  for (const side of [-1, 1]) {
    for (let r = -6; r <= 6; r++) {
      const cap = new THREE.Mesh(wadangGeo, ridgeStoneMat);
      cap.position.set(side * (roofHalfW - 0.02), 2.46 - roofEaveDrop + 0.09, 0.12 + r * 0.32);
      cap.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      restHouseGroup.add(cap);
    }
  }

  // 5g. Cantilevered Porch Lantern Bracket & Bronze-Capped Paper Lantern + Hearth Light
  const bracketArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.055, 0.055, 0.46)), rosewoodMat);
  bracketArm.position.set(0.84, 2.26, 1.54);
  restHouseGroup.add(bracketArm);
  const rhLanternCord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6)), bronzeMat);
  rhLanternCord.position.set(0.84, 2.13, 1.66);
  restHouseGroup.add(rhLanternCord);
  const rhLanternCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.12, 0.06, 8)), bronzeMat);
  rhLanternCap.position.set(0.84, 2.02, 1.66);
  restHouseGroup.add(rhLanternCap);
  const rhPorchLantern = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.095, 0.08, 0.22, 8)), restWindowMat);
  rhPorchLantern.position.set(0.84, 1.88, 1.66);
  restHouseGroup.add(rhPorchLantern);

  const restHouseLight = new THREE.PointLight(0xffb463, 0.25, 10, 1.6);
  restHouseLight.position.set(0, 1.35, 1.35);
  restHouseGroup.add(restHouseLight);

  // Grounded garden standing signpost placed cleanly beside the Library cottage
  const librarySign = createStandingSignpost({
    title: '图书馆',
    icon: 'library',
    worldX: -6.8,
    worldZ: 3.3,
    boardW: 2.2,
    boardH: 0.76,
    postH: 2.1,
    bgHex: '#24150e',
    borderHex: '#e6c473',
    textHex: '#fffcf5',
    emissiveHex: 0xffe2a4,
  });
  const libraryPortalGroup = new THREE.Group();
  libraryPortalGroup.add(restHouseGroup, librarySign.group);
  group.add(libraryPortalGroup);

  const extraLights: THREE.PointLight[] = [];
  const extraWindowMats: THREE.MeshStandardMaterial[] = [];

  // =========================================================================
  // 6. Warm Sand-Plaster & Arched Language Center Hall (语言中心)
  //    at (8.2, y, 6.8) — right-foreground sunlit flower meadow
  // =========================================================================
  const langHouseGroup = new THREE.Group();
  const lhX = 8.2;
  const lhZ = 6.8;
  const lhScale = 1.16;
  const lhBaseY = terrainHeightAt(lhX, lhZ);
  langHouseGroup.position.set(lhX, lhBaseY, lhZ);
  langHouseGroup.rotation.y = -0.34; // angled cleanly toward viewer & foreground path
  langHouseGroup.scale.setScalar(lhScale);

  const terracottaTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7c4a38,
      roughness: 0.82,
      metalness: 0.08,
      map: textures.slateRoofMap,
      normalMap: textures.slateNormalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      aoMap: textures.slateAoMap,
      aoMapIntensity: 0.85,
      side: THREE.DoubleSide,
    })
  );
  const warmSandWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4e7d2,
      roughness: 0.86,
      metalness: 0.01,
      map: textures.plasterWallMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      aoMap: textures.plasterAoMap,
      aoMapIntensity: 0.65,
    })
  );
  const emeraldTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e4c3f,
      roughness: 0.56,
      metalness: 0.14,
    })
  );
  const langWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe6b8,
    emissive: new THREE.Color(0xffb452),
    emissiveIntensity: 0.28,
    roughness: 0.28,
    metalness: 0.05,
  });
  materials.push(langWindowMat);
  extraWindowMats.push(langWindowMat);

  // Stone terrace plinth + entry steps
  const lhPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.42, 0.48, 3.86)), graniteMat);
  lhPlinth.position.set(0, 0.04, 0.06);
  lhPlinth.castShadow = quality.enableShadows;
  lhPlinth.receiveShadow = quality.enableShadows;
  langHouseGroup.add(lhPlinth);

  const lhDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.12, 0.12, 3.58)), plinthStoneMat);
  lhDeck.position.set(0, 0.32, 0.06);
  lhDeck.receiveShadow = quality.enableShadows;
  langHouseGroup.add(lhDeck);

  for (let s = 0; s < 2; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.62, 0.13, 0.36)), plinthStoneMat);
    step.position.set(0, 0.24 - s * 0.12, 1.98 + s * 0.32);
    step.receiveShadow = quality.enableShadows;
    langHouseGroup.add(step);
  }

  // Main Sand-Plaster Academy Hall walls + decorative emerald waist & cornice bands
  const lhBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.48, 2.18, 2.52)), warmSandWallMat);
  lhBody.position.set(0, 1.46, -0.22);
  lhBody.castShadow = quality.enableShadows;
  lhBody.receiveShadow = quality.enableShadows;
  langHouseGroup.add(lhBody);

  const lhCornice = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.72, 0.14, 2.74)), emeraldTrimMat);
  lhCornice.position.set(0, 2.56, -0.22);
  langHouseGroup.add(lhCornice);

  // Front Porch Colonnade (4 timber-and-brass columns supporting porch arch beam)
  const lhColGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.115, 2.16, 12));
  for (const [cx, cz] of [
    [-1.68, 1.56],
    [-0.78, 1.56],
    [0.78, 1.56],
    [1.68, 1.56],
  ] as Array<[number, number]>) {
    const col = new THREE.Mesh(lhColGeo, rosewoodMat);
    col.position.set(cx, 1.44, cz);
    col.castShadow = quality.enableShadows;
    langHouseGroup.add(col);
    const colRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12)), bronzeMat);
    colRing.position.set(cx, 2.46, cz);
    langHouseGroup.add(colRing);
  }
  const lhPorchBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.68, 0.18, 0.18)), emeraldTrimMat);
  lhPorchBeam.position.set(0, 2.54, 1.56);
  langHouseGroup.add(lhPorchBeam);

  // Signature Arched Entryway + Flanking Arched Windows with Warm Glow & Brass Lattice
  const addArchedWindow = (wx: number, wy: number, wz: number, rotY: number, w: number, h: number) => {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    wg.rotation.y = rotY;
    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.12, h, 0.1)), emeraldTrimMat);
    wg.add(frame);
    const archTop = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(w * 0.56, w * 0.56, 0.1, 14, 1, false, 0, Math.PI)), emeraldTrimMat);
    archTop.rotation.z = Math.PI / 2;
    archTop.rotation.y = Math.PI / 2;
    archTop.position.y = h * 0.5;
    wg.add(archTop);

    const glass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w - 0.04, h - 0.04)), langWindowMat);
    glass.position.z = 0.056;
    wg.add(glass);
    const archGlass = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(w * 0.48, 14, 0, Math.PI)), langWindowMat);
    archGlass.position.set(0, h * 0.5 - 0.02, 0.056);
    wg.add(archGlass);

    // Subtle brass vertical + horizontal lattice mullions
    const vBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, h + w * 0.42, 0.025)), bronzeMat);
    vBar.position.set(0, w * 0.18, 0.065);
    wg.add(vBar);
    const hBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w - 0.04, 0.026, 0.025)), bronzeMat);
    hBar.position.set(0, 0.05, 0.065);
    wg.add(hBar);
    langHouseGroup.add(wg);
  };

  // Front grand arched doorway + 2 flanking front arched windows + 2 side arched windows
  addArchedWindow(0, 1.18, 1.04, 0, 1.02, 1.46);
  addArchedWindow(-1.18, 1.42, 1.04, 0, 0.64, 0.88);
  addArchedWindow(1.18, 1.42, 1.04, 0, 0.64, 0.88);
  addArchedWindow(-1.74, 1.42, -0.22, -Math.PI / 2, 0.96, 0.94);
  addArchedWindow(1.74, 1.42, -0.22, Math.PI / 2, 0.96, 0.94);

  // Sweeping Terracotta-Clay Curved Roof + Sculpted Bronze Finial Dome
  const lhRoofGeo = trackGeo(createSweepingPagodaRoofGeo(2.65, 1.32, 0.34, 16, 18));
  const lhRoof = new THREE.Mesh(lhRoofGeo, terracottaTileMat);
  lhRoof.position.set(0, 2.52, 0.24);
  lhRoof.castShadow = quality.enableShadows;
  lhRoof.receiveShadow = quality.enableShadows;
  langHouseGroup.add(lhRoof);

  const lhRidgeGeo = trackGeo(createHipRidgeGeo(2.65, 1.32, 0.34, 0.048));
  for (let q = 0; q < 4; q++) {
    const ridge = new THREE.Mesh(lhRidgeGeo, ridgeStoneMat);
    ridge.position.set(0, 2.52, 0.24);
    ridge.rotation.y = q * (Math.PI / 2);
    langHouseGroup.add(ridge);
  }
  const lhFinial = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(finialProfile, 14)), bronzeMat);
  lhFinial.position.set(0, 3.78, 0.24);
  lhFinial.scale.setScalar(0.82);
  langHouseGroup.add(lhFinial);

  const langHouseLight = new THREE.PointLight(0xffbb66, 0.28, 11, 1.6);
  langHouseLight.position.set(0, 1.7, 1.45);
  langHouseGroup.add(langHouseLight);
  extraLights.push(langHouseLight);

  // Grounded garden standing signpost placed cleanly beside the Language Center
  const languageSign = createStandingSignpost({
    title: '语言中心',
    icon: 'language',
    worldX: 5.3,
    worldZ: 8.6,
    boardW: 2.3,
    boardH: 0.76,
    postH: 2.02,
    bgHex: '#102c24',
    borderHex: '#e8c87a',
    textHex: '#fffcf5',
    emissiveHex: 0xffe8ad,
  });
  const languagePortalGroup = new THREE.Group();
  languagePortalGroup.add(langHouseGroup, languageSign.group);
  group.add(languagePortalGroup);

  // =========================================================================
  // 7. Starlight Timber-and-Glass AI Atelier (AI 中心)
  //    at (0.0, y, -10.8) — hero north lakeside terrace right across the mirror-lake
  // =========================================================================
  const aiHouseGroup = new THREE.Group();
  const aiX = 0.0;
  const aiZ = -10.8;
  const aiScale = 1.22;
  const aiBaseY = terrainHeightAt(aiX, aiZ);
  aiHouseGroup.position.set(aiX, aiBaseY, aiZ);
  aiHouseGroup.rotation.y = 0.02; // face south straight across lake toward viewer
  aiHouseGroup.scale.setScalar(aiScale);

  const aiGlassMat = new THREE.MeshStandardMaterial({
    color: 0xdff5ff,
    emissive: new THREE.Color(0x74d4ff),
    emissiveIntensity: 0.42,
    roughness: 0.16,
    metalness: 0.18,
  });
  materials.push(aiGlassMat);
  extraWindowMats.push(aiGlassMat);

  const aiSlateRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a3644,
      roughness: 0.72,
      metalness: 0.24,
      map: textures.slateRoofMap,
      normalMap: textures.slateNormalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      side: THREE.DoubleSide,
    })
  );

  // Stepped dark ashlar stone terrace + broad steps
  const aiPlinthLower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.56, 4.4)), graniteMat);
  aiPlinthLower.position.set(0, 0.04, 0);
  aiPlinthLower.castShadow = quality.enableShadows;
  aiPlinthLower.receiveShadow = quality.enableShadows;
  aiHouseGroup.add(aiPlinthLower);

  const aiPlinthTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.74, 0.16, 3.96)), plinthStoneMat);
  aiPlinthTop.position.set(0, 0.36, 0);
  aiPlinthTop.receiveShadow = quality.enableShadows;
  aiHouseGroup.add(aiPlinthTop);

  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.15, 0.13, 0.38)), plinthStoneMat);
    step.position.set(0, 0.3 - s * 0.12, 2.18 + s * 0.34);
    step.receiveShadow = quality.enableShadows;
    aiHouseGroup.add(step);
  }

  // Luminous Floor-to-Ceiling Gallery Glass Core framed by Sleek Charred-Cedar & Bronze Columns
  const aiCoreGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.72, 2.42, 2.86)), aiGlassMat);
  aiCoreGlass.position.set(0, 1.65, -0.1);
  aiHouseGroup.add(aiCoreGlass);

  // Exterior structural timber & bronze columns + architectural mullions
  const aiPostGeo = trackGeo(new THREE.BoxGeometry(0.16, 2.52, 0.16));
  for (const px of [-2.02, -0.95, 0.95, 2.02]) {
    for (const pz of [-1.62, 1.48]) {
      const post = new THREE.Mesh(aiPostGeo, charredCedarMat);
      post.position.set(px, 1.68, pz);
      post.castShadow = quality.enableShadows;
      aiHouseGroup.add(post);
    }
  }
  // Horizontal fascia beams & slim bronze mullions across glass front
  const aiFasciaX = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.42, 0.22, 3.48)), charredCedarMat);
  aiFasciaX.position.set(0, 2.94, -0.06);
  aiHouseGroup.add(aiFasciaX);
  const aiBronzeBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.48, 0.06, 3.54)), bronzeMat);
  aiBronzeBand.position.set(0, 2.82, -0.06);
  aiHouseGroup.add(aiBronzeBand);

  // Double-tier Modernist-Kyoto Cantilevered Slate Roof
  const aiLowerRoof = new THREE.Mesh(
    trackGeo(createSweepingPagodaRoofGeo(3.05, 1.12, 0.32, 16, 18)),
    aiSlateRoofMat
  );
  aiLowerRoof.position.set(0, 2.94, -0.06);
  aiLowerRoof.castShadow = quality.enableShadows;
  aiLowerRoof.receiveShadow = quality.enableShadows;
  aiHouseGroup.add(aiLowerRoof);

  // Upper luminous clerestory lantern skylight + upper cap roof
  const aiSkylight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.74, 0.56, 1.54)), aiGlassMat);
  aiSkylight.position.set(0, 4.02, -0.06);
  aiHouseGroup.add(aiSkylight);
  const aiUpperRoof = new THREE.Mesh(
    trackGeo(createSweepingPagodaRoofGeo(1.62, 0.72, 0.24, 12, 14)),
    aiSlateRoofMat
  );
  aiUpperRoof.position.set(0, 4.24, -0.06);
  aiUpperRoof.castShadow = quality.enableShadows;
  aiHouseGroup.add(aiUpperRoof);

  // Sculpted Gilded Bronze Astrolabe / Star-Ring Crown Finial (gently rotates in animation loop!)
  const aiCrownGroup = new THREE.Group();
  aiCrownGroup.position.set(0, 5.28, -0.06);
  const ring1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.42, 0.032, 8, 28)), bronzeMat);
  const ring2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.3, 0.026, 8, 24)), bronzeMat);
  ring2.rotation.y = Math.PI / 3;
  ring2.rotation.x = Math.PI / 4;
  const starCore = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.14, 0)), aiGlassMat);
  aiCrownGroup.add(ring1, ring2, starCore);
  aiHouseGroup.add(aiCrownGroup);

  const aiHouseLight = new THREE.PointLight(0x88dcff, 0.42, 14, 1.55);
  aiHouseLight.position.set(0, 2.2, 1.4);
  aiHouseGroup.add(aiHouseLight);
  extraLights.push(aiHouseLight);

  // Grounded garden standing signpost placed cleanly beside the AI Center
  const aiSign = createStandingSignpost({
    title: 'AI 中心',
    icon: 'ai',
    worldX: 3.9,
    worldZ: -8.8,
    boardW: 2.65,
    boardH: 0.88,
    postH: 2.4,
    bgHex: '#0e1b2b',
    borderHex: '#92daf7',
    textHex: '#ffffff',
    emissiveHex: 0xb6e8ff,
  });
  const aiPortalGroup = new THREE.Group();
  aiPortalGroup.add(aiHouseGroup, aiSign.group);
  group.add(aiPortalGroup);

  // =========================================================================
  // 8. Classic Heritage Red Telephone Booth (通讯 · 电话亭)
  //    at (-4.2, y, 9.8) — nestled in a landscaped roadside cobblestone flower alcove 4.4m off the footpath!
  // =========================================================================
  const phoneBoothGroup = new THREE.Group();
  const pbX = -4.2;
  const pbZ = 9.8;
  const pbScale = 1.14;
  const pbBaseY = terrainHeightAt(pbX, pbZ);
  phoneBoothGroup.position.set(pbX, pbBaseY, pbZ);
  phoneBoothGroup.rotation.y = 0.22; // face viewer & lane gracefully from its dedicated side alcove
  phoneBoothGroup.scale.setScalar(pbScale);

  const boothRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa42225,
      roughness: 0.34,
      metalness: 0.28,
    })
  );
  const boothGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdff1f8,
      emissive: new THREE.Color(0xffdfa8),
      emissiveIntensity: 0.16,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.42,
    })
  );
  const boothLampMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d4,
    emissive: new THREE.Color(0xffc96b),
    emissiveIntensity: 0.72,
    roughness: 0.25,
    metalness: 0.04,
  });
  materials.push(boothLampMat);
  extraWindowMats.push(boothLampMat);

  // Landscaped Round Cobblestone Alcove Pad + Dressed Granite Curb Plinth
  const pbAlcovePad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.78, 1.88, 0.14, 24)), plinthStoneMat);
  pbAlcovePad.position.y = -0.02;
  pbAlcovePad.receiveShadow = quality.enableShadows;
  phoneBoothGroup.add(pbAlcovePad);

  const pbBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.64, 0.24, 1.64)), graniteMat);
  pbBase.position.y = 0.08;
  pbBase.castShadow = quality.enableShadows;
  pbBase.receiveShadow = quality.enableShadows;
  phoneBoothGroup.add(pbBase);

  const pbFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.08, 1.36)), plinthStoneMat);
  pbFloor.position.y = 0.22;
  phoneBoothGroup.add(pbFloor);

  // 4 Sturdy Heritage Red Corner Pilasters
  const pbHalf = 0.62;
  const pbPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 2.52, 0.14));
  for (const sx of [-pbHalf, pbHalf]) {
    for (const sz of [-pbHalf, pbHalf]) {
      const p = new THREE.Mesh(pbPostGeo, boothRedMat);
      p.position.set(sx, 1.46, sz);
      p.castShadow = quality.enableShadows;
      phoneBoothGroup.add(p);
    }
  }

  // Lower iron kick-panels around all 4 sides + brass door handle on front (+Z)
  const kickXGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.52, 0.08));
  const kickZGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.52, 1.16));
  for (const sz of [-pbHalf, pbHalf]) {
    const k = new THREE.Mesh(kickXGeo, boothRedMat);
    k.position.set(0, 0.48, sz);
    phoneBoothGroup.add(k);
  }
  for (const sx of [-pbHalf, pbHalf]) {
    const k = new THREE.Mesh(kickZGeo, boothRedMat);
    k.position.set(sx, 0.48, 0);
    phoneBoothGroup.add(k);
  }

  // Multi-pane Glass Panels & Classic Red Mullion Grids on all 4 sides
  const glassPaneGeo = trackGeo(new THREE.PlaneGeometry(1.1, 1.72));
  const hBarGeo = trackGeo(new THREE.BoxGeometry(1.12, 0.036, 0.045));
  const vBarGeo = trackGeo(new THREE.BoxGeometry(0.036, 1.74, 0.045));

  for (let side = 0; side < 4; side++) {
    const sGroup = new THREE.Group();
    sGroup.rotation.y = side * (Math.PI / 2);

    const gPane = new THREE.Mesh(glassPaneGeo, boothGlassMat);
    gPane.position.set(0, 1.62, pbHalf);
    sGroup.add(gPane);

    // 2 vertical mullions + 4 horizontal muntin bars = iconic 3x5 phone booth panes
    for (const mx of [-0.28, 0.28]) {
      const vb = new THREE.Mesh(vBarGeo, boothRedMat);
      vb.position.set(mx, 1.62, pbHalf);
      sGroup.add(vb);
    }
    for (let row = 0; row < 4; row++) {
      const hb = new THREE.Mesh(hBarGeo, boothRedMat);
      hb.position.set(0, 0.94 + row * 0.42, pbHalf);
      sGroup.add(hb);
    }
    phoneBoothGroup.add(sGroup);
  }

  // Polished Brass Door Handle on Front Door (+Z)
  const doorHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8)), bronzeMat);
  doorHandle.position.set(0.42, 1.24, pbHalf + 0.07);
  phoneBoothGroup.add(doorHandle);

  // Sculpted Interior: Cedar Shelf, Classic Wall Payphone Box, Silver Keypad & Curved Handset
  const pbShelf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.96, 0.06, 0.34)), cedarDeckMat);
  pbShelf.position.set(0, 1.12, -0.38);
  phoneBoothGroup.add(pbShelf);

  const phoneBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.44, 0.16)), charredCedarMat);
  phoneBody.position.set(0, 1.48, -0.46);
  phoneBoothGroup.add(phoneBody);

  const phoneDial = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.18, 0.03)), bronzeMat);
  phoneDial.position.set(0, 1.44, -0.37);
  phoneBoothGroup.add(phoneDial);

  const handsetBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 8)), charredCedarMat);
  handsetBar.position.set(-0.2, 1.52, -0.44);
  phoneBoothGroup.add(handsetBar);

  // Warm Glowing Interior Ceiling Dome Lamp + PointLight
  const ceilingLamp = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 12, 8)), boothLampMat);
  ceilingLamp.position.set(0, 2.52, 0);
  phoneBoothGroup.add(ceilingLamp);

  const phoneBoothLight = new THREE.PointLight(0xffcb74, 0.45, 9, 1.6);
  phoneBoothLight.position.set(0, 2.32, 0);
  phoneBoothGroup.add(phoneBoothLight);
  extraLights.push(phoneBoothLight);

  // Upper Cornice Transom Box + Domed Cupola Roof + Bronze Crown Finial
  const pbCornice = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.34, 1.52)), boothRedMat);
  pbCornice.position.y = 2.74;
  pbCornice.castShadow = quality.enableShadows;
  phoneBoothGroup.add(pbCornice);

  // Illuminated ivory top transom strip around all 4 sides
  const transomGlow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 0.15, 1.56)), boothLampMat);
  transomGlow.position.y = 2.74;
  phoneBoothGroup.add(transomGlow);

  const pbDome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.84, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48)),
    boothRedMat
  );
  pbDome.scale.set(0.95, 0.62, 0.95);
  pbDome.position.y = 2.86;
  pbDome.castShadow = quality.enableShadows;
  phoneBoothGroup.add(pbDome);

  const pbCrown = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 10, 8)), bronzeMat);
  pbCrown.position.y = 3.42;
  phoneBoothGroup.add(pbCrown);

  // Grounded garden standing signpost placed cleanly beside the Red Telephone Booth
  const phoneSign = createStandingSignpost({
    title: '通讯',
    icon: 'phone',
    worldX: -1.95,
    worldZ: 10.6,
    boardW: 1.72,
    boardH: 0.66,
    postH: 1.82,
    bgHex: '#591216',
    borderHex: '#ebd082',
    textHex: '#fffcf5',
    emissiveHex: 0xffe4ad,
  });
  const phonePortalGroup = new THREE.Group();
  phonePortalGroup.add(phoneBoothGroup, phoneSign.group);
  group.add(phonePortalGroup);

  const portals: ArchitecturePortal[] = [
    {
      id: 'library',
      labelZh: '图书馆',
      labelEn: 'Library',
      labelAr: 'المكتبة',
      group: libraryPortalGroup,
      signMat: librarySign.faceMat,
      worldPos: REST_HOUSE_WORLD_POS.clone(),
    },
    {
      id: 'venus',
      labelZh: '音乐馆',
      labelEn: 'Music Hall',
      labelAr: 'قاعة الموسيقى',
      group: musicPortalGroup,
      signMat: musicSign.faceMat,
      worldPos: PAVILION_WORLD_POS.clone(),
    },
    {
      id: 'arabic-learning',
      labelZh: '语言中心',
      labelEn: 'Language Center',
      labelAr: 'مركز اللغات',
      group: languagePortalGroup,
      signMat: languageSign.faceMat,
      worldPos: LANGUAGE_HOUSE_WORLD_POS.clone(),
    },
    {
      id: 'aihub',
      labelZh: 'AI 中心',
      labelEn: 'AI Center',
      labelAr: 'مركز الذكاء',
      group: aiPortalGroup,
      signMat: aiSign.faceMat,
      worldPos: AI_HOUSE_WORLD_POS.clone(),
    },
    {
      id: 'chat',
      labelZh: '通讯',
      labelEn: 'Telephone',
      labelAr: 'الهاتف',
      group: phonePortalGroup,
      signMat: phoneSign.faceMat,
      worldPos: PHONE_BOOTH_WORLD_POS.clone(),
    },
  ];

  return {
    group,
    pavilionGroup: pav,
    restHouseGroup,
    portals,
    lanternLight,
    lanternGlassMat,
    restHouseLight,
    restWindowMat,
    extraLights,
    extraWindowMats,
    aiCrownGroup,
    wettableMaterials,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      signTextures.forEach((t) => t.dispose());
    },
  };
}
