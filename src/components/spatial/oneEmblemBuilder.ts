import * as THREE from 'three';

export type CultureConceptKey = 'origin-final' | 'infinity' | 'horizon';
export type EmblemPartKey = 'seed' | 'ring' | 'portal' | 'axis';
export type SpatialPortalId = 'cinema' | 'music' | 'library';

export interface SpatialPortalDef {
  id: SpatialPortalId;
  tab: 'video' | 'venus' | 'library';
  zh: string;
  en: string;
  subZh: string;
  subEn: string;
  accent: string;
}

export const SPATIAL_PORTALS: SpatialPortalDef[] = [
  {
    id: 'cinema',
    tab: 'video',
    zh: '影视空间',
    en: 'Cinema',
    subZh: '电影级视界入口',
    subEn: 'Cinematic Vision',
    accent: '#C4A876',
  },
  {
    id: 'music',
    tab: 'venus',
    zh: '音乐声场',
    en: 'Sonic',
    subZh: '实时频谱共振',
    subEn: 'Audio Reactive',
    accent: '#2E8B74',
  },
  {
    id: 'library',
    tab: 'library',
    zh: '世界图书馆',
    en: 'Library',
    subZh: '立体典籍档案',
    subEn: 'Knowledge Archive',
    accent: '#D4DBE6',
  },
];

export interface LiquidMetalUniforms {
  uTime: { value: number };
  uAudioEnergy: { value: number };
  uHoverBoost: { value: number };
}

export interface CultureMaterials {
  porcelain: THREE.MeshPhysicalMaterial;
  smokedTitanium: THREE.MeshPhysicalMaterial;
  jadeCrystal: THREE.MeshPhysicalMaterial;
  crystalLens: THREE.MeshPhysicalMaterial;
  liquidTitanium: THREE.MeshPhysicalMaterial;
  liquidGold: THREE.MeshPhysicalMaterial;
  obsidian: THREE.MeshPhysicalMaterial;
  holoLineGold: THREE.MeshStandardMaterial;
  holoLineJade: THREE.MeshStandardMaterial;
  holoEdgeBlue: THREE.MeshStandardMaterial;
  liquidUniforms: LiquidMetalUniforms;
}

export interface ExpandableNode {
  object: THREE.Object3D;
  basePos: THREE.Vector3;
  expandDelta: THREE.Vector3;
}

export interface BuiltSculpture {
  group: THREE.Group;
  animatedCore: THREE.Object3D | null;
  secondaryRing: THREE.Object3D | null;
  gimbalInner: THREE.Object3D | null;
  expandables: ExpandableNode[];
}

export interface BuiltPortalAnchor {
  id: SpatialPortalId;
  tab: 'video' | 'venus' | 'library';
  root: THREE.Group;
  orbGroup: THREE.Group;
  haloRing: THREE.Mesh;
  basePos: THREE.Vector3;
  eqBars?: THREE.Mesh[];
}

function attachLiquidMetalShader(
  mat: THREE.MeshPhysicalMaterial,
  uniforms: LiquidMetalUniforms,
  cacheKey: string,
  waveAmp: number,
  sheenColorHex: number
) {
  const sheenColor = new THREE.Color(sheenColorHex);
  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAudioEnergy = uniforms.uAudioEnergy;
    shader.uniforms.uHoverBoost = uniforms.uHoverBoost;
    shader.uniforms.uSheenColor = { value: sheenColor };
    shader.uniforms.uWaveAmp = { value: waveAmp };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uAudioEnergy;
         uniform float uHoverBoost;
         uniform float uWaveAmp;
         varying float vLiquidWave;
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         float lwPhase = position.y * 4.2 + position.x * 3.1 - uTime * 1.35;
         float lwAmp = uWaveAmp * (1.0 + uAudioEnergy * 1.45 + uHoverBoost * 0.65);
         float lwSlope = cos(lwPhase) * lwAmp * 2.2;
         objectNormal = normalize(objectNormal + vec3(lwSlope * 0.14, lwSlope * 0.1, -lwSlope * 0.12));
        `
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float lwDisp = sin(position.y * 4.2 + position.x * 3.1 - uTime * 1.35) * uWaveAmp * (1.0 + uAudioEnergy * 1.45 + uHoverBoost * 0.65);
         transformed += normalize(objectNormal + vec3(0.0001)) * lwDisp;
         vLiquidWave = sin(lwPhase) * 0.5 + 0.5;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSheenColor;
         uniform float uAudioEnergy;
         uniform float uHoverBoost;
         varying float vLiquidWave;
        `
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float rim = pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.4);
         float liquidPulse = mix(0.02, 0.1, vLiquidWave) * (0.25 + uAudioEnergy * 0.5 + uHoverBoost * 0.35);
         totalEmissiveRadiance += uSheenColor * (rim * (0.1 + uHoverBoost * 0.16 + uAudioEnergy * 0.2) + liquidPulse * 0.14);
        `
      );
  };
}

function attachBlueWhiteEnergyRimShader(
  mat: THREE.MeshPhysicalMaterial,
  uniforms: LiquidMetalUniforms,
  cacheKey: string,
  rimColorHex: number,
  baseRimStrength: number
) {
  const rimColor = new THREE.Color(rimColorHex);
  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAudioEnergy = uniforms.uAudioEnergy;
    shader.uniforms.uHoverBoost = uniforms.uHoverBoost;
    shader.uniforms.uEnergyRimColor = { value: rimColor };
    shader.uniforms.uBaseRimStrength = { value: baseRimStrength };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uAudioEnergy;
         uniform float uHoverBoost;
         uniform vec3 uEnergyRimColor;
         uniform float uBaseRimStrength;
        `
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float fresnel = pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.6);
         float breath = 0.88 + 0.12 * sin(uTime * 1.45);
         float edgeEnergy = fresnel * (uBaseRimStrength * breath + uHoverBoost * 0.24 + uAudioEnergy * 0.28);
         totalEmissiveRadiance += uEnergyRimColor * edgeEnergy;
        `
      );
  };
}

export function createCultureMaterials(isSoftwareGl: boolean): CultureMaterials {
  const liquidUniforms: LiquidMetalUniforms = {
    uTime: { value: 0 },
    uAudioEnergy: { value: 0 },
    uHoverBoost: { value: 0 },
  };

  // Sculpted Brushed Pearl-Platinum Ceramic (kept refined for architectural accents)
  const porcelain = new THREE.MeshPhysicalMaterial({
    color: 0xd9e2ee,
    roughness: 0.24,
    metalness: 0.24,
    clearcoat: 0.82,
    clearcoatRoughness: 0.12,
    reflectivity: 0.88,
  });

  // Aerospace Dark Smoked Titanium with subtle blue-white edge shimmer
  const smokedTitanium = new THREE.MeshPhysicalMaterial({
    color: 0x1a2234,
    roughness: 0.22,
    metalness: 0.90,
    clearcoat: 0.72,
    clearcoatRoughness: 0.10,
    envMapIntensity: 1.35,
  });
  if (!isSoftwareGl) {
    attachBlueWhiteEnergyRimShader(smokedTitanium, liquidUniforms, 'one-smoked-ti-rim-v1', 0x94d2ff, 0.36);
  }

  // Translucent Sapphire-Jade Optical Crystal Glass (45° Threshold Bridge)
  const jadeCrystal = new THREE.MeshPhysicalMaterial({
    color: 0x258178,
    roughness: isSoftwareGl ? 0.16 : 0.06,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: isSoftwareGl ? 0.84 : 0.92,
    transmission: isSoftwareGl ? 0 : 0.70,
    ior: 1.54,
    thickness: 0.72,
    attenuationColor: new THREE.Color(0x1b6d72),
    attenuationDistance: 1.35,
    iridescence: isSoftwareGl ? 0 : 0.38,
    iridescenceIOR: 1.34,
  });
  if (!isSoftwareGl) {
    attachBlueWhiteEnergyRimShader(jadeCrystal, liquidUniforms, 'one-jade-crystal-rim-v1', 0xa6dcff, 0.28);
  }

  // Clear Arctic Optical Crystal Glass (lenses / chamfer guards / inner prism)
  const crystalLens = new THREE.MeshPhysicalMaterial({
    color: 0xdbeeff,
    roughness: isSoftwareGl ? 0.14 : 0.04,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: isSoftwareGl ? 0.62 : 0.88,
    transmission: isSoftwareGl ? 0 : 0.82,
    ior: 1.52,
    thickness: 0.42,
    attenuationColor: new THREE.Color(0xaed4f7),
    attenuationDistance: 1.65,
  });
  if (!isSoftwareGl) {
    attachBlueWhiteEnergyRimShader(crystalLens, liquidUniforms, 'one-crystal-lens-rim-v1', 0x9cd4ff, 0.32);
  }

  // Liquid Chrome-Titanium (architectural spine & precision inner bevel tracks)
  const liquidTitanium = new THREE.MeshPhysicalMaterial({
    color: 0xbcc8d8,
    roughness: 0.14,
    metalness: 0.96,
    clearcoat: 0.55,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.4,
  });
  if (!isSoftwareGl) {
    attachLiquidMetalShader(liquidTitanium, liquidUniforms, 'one-liquid-titanium-v2', 0.0038, 0x94cfff);
  }

  // Liquid Champagne Gold Core (refined metallic sheen, zero harsh glare)
  const liquidGold = new THREE.MeshPhysicalMaterial({
    color: 0xcab07b,
    roughness: 0.15,
    metalness: 0.96,
    clearcoat: 0.55,
    clearcoatRoughness: 0.08,
    emissive: 0x261a08,
    emissiveIntensity: 0.08,
    envMapIntensity: 1.1,
  });
  if (!isSoftwareGl) {
    attachLiquidMetalShader(liquidGold, liquidUniforms, 'one-liquid-gold-v2', 0.007, 0xd4b67c);
  }

  const obsidian = new THREE.MeshPhysicalMaterial({
    color: 0x0b0e16,
    roughness: 0.28,
    metalness: 0.48,
    clearcoat: 0.5,
    clearcoatRoughness: 0.16,
  });

  // Subtle metallic accent lines (tone-mapped for crisp hardware precision)
  const holoLineGold = new THREE.MeshStandardMaterial({
    color: 0xd4b77d,
    emissive: 0x7c6233,
    emissiveIntensity: 0.26,
    roughness: 0.26,
    metalness: 0.85,
  });

  const holoLineJade = new THREE.MeshStandardMaterial({
    color: 0x4fb89f,
    emissive: 0x206858,
    emissiveIntensity: 0.34,
    roughness: 0.22,
    metalness: 0.55,
  });

  // Subtle blue-white energy rim hairline (tuned right near Bloom threshold so edges whisper, never blow out)
  const holoEdgeBlue = new THREE.MeshStandardMaterial({
    color: 0xbde2ff,
    emissive: 0x69b8ff,
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.84,
  });

  return {
    porcelain,
    smokedTitanium,
    jadeCrystal,
    crystalLens,
    liquidTitanium,
    liquidGold,
    obsidian,
    holoLineGold,
    holoLineJade,
    holoEdgeBlue,
    liquidUniforms,
  };
}

export function disposeCultureMaterials(mats: CultureMaterials) {
  mats.porcelain.dispose();
  mats.smokedTitanium.dispose();
  mats.jadeCrystal.dispose();
  mats.crystalLens.dispose();
  mats.liquidTitanium.dispose();
  mats.liquidGold.dispose();
  mats.obsidian.dispose();
  mats.holoLineGold.dispose();
  mats.holoLineJade.dispose();
  mats.holoEdgeBlue.dispose();
}

function tagPart(obj: THREE.Object3D, partKey: EmblemPartKey) {
  obj.traverse((child) => {
    child.userData.partKey = partKey;
  });
}

function regExpand(
  list: ExpandableNode[],
  object: THREE.Object3D,
  dx: number,
  dy: number,
  dz: number
) {
  list.push({
    object,
    basePos: object.position.clone(),
    expandDelta: new THREE.Vector3(dx, dy, dz),
  });
}

export function buildOriginFinalSculpture(mats: CultureMaterials, isSoftwareGl: boolean): BuiltSculpture {
  const group = new THREE.Group();
  const expandables: ExpandableNode[] = [];

  // 1. Sleek 270° Open Smoked-Titanium & Optical Crystal Ring (no chunky white ring)
  //    Preserves the 90° top-left open threshold while letting the deep cosmos breathe behind it
  const ringAssembly = new THREE.Group();
  const outerR = 1.54;
  const innerR = 1.24;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, outerR, Math.PI, Math.PI * 2.5, false);
  ringShape.lineTo(0, innerR);
  ringShape.absarc(0, 0, innerR, Math.PI * 2.5, Math.PI, true);
  ringShape.closePath();

  const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.036,
    bevelSize: 0.028,
    bevelSegments: isSoftwareGl ? 3 : 6,
    curveSegments: isSoftwareGl ? 56 : 96,
  });
  ringGeo.translate(0, 0, -0.11);
  const ringMesh = new THREE.Mesh(ringGeo, mats.smokedTitanium);
  ringAssembly.add(ringMesh);

  // Translucent optical crystal glass outer collar framing the smoked titanium arc
  const crystalRimShape = new THREE.Shape();
  crystalRimShape.absarc(0, 0, outerR + 0.075, Math.PI, Math.PI * 2.5, false);
  crystalRimShape.lineTo(0, outerR - 0.01);
  crystalRimShape.absarc(0, 0, outerR - 0.01, Math.PI * 2.5, Math.PI, true);
  crystalRimShape.closePath();
  const crystalRimGeo = new THREE.ExtrudeGeometry(crystalRimShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.016,
    bevelSegments: isSoftwareGl ? 2 : 4,
    curveSegments: isSoftwareGl ? 48 : 84,
  });
  crystalRimGeo.translate(0, 0, -0.07);
  ringAssembly.add(new THREE.Mesh(crystalRimGeo, mats.crystalLens));

  // Inner brushed silver-titanium track & subtle blue-white edge energy wire
  const bevelRingGeo = new THREE.TorusGeometry(innerR, 0.019, 16, 96, Math.PI * 1.5);
  const bevelFront = new THREE.Mesh(bevelRingGeo, mats.liquidTitanium);
  bevelFront.rotation.z = Math.PI;
  bevelFront.position.z = 0.122;
  ringAssembly.add(bevelFront);

  const bevelBack = bevelFront.clone();
  bevelBack.position.z = -0.122;
  ringAssembly.add(bevelBack);

  // Subtle blue-white optical energy edge running along outer crest (never blows out into screen glare)
  const outerEnergyArc = new THREE.Mesh(
    new THREE.TorusGeometry(outerR + 0.075, 0.0085, 12, 96, Math.PI * 1.5),
    mats.holoEdgeBlue
  );
  outerEnergyArc.rotation.z = Math.PI;
  ringAssembly.add(outerEnergyArc);

  // Precision InstancedMesh caliper degree ticks on front face
  const tickCount = 30;
  const tickGeo = new THREE.BoxGeometry(0.012, 0.052, 0.01);
  const tickInst = new THREE.InstancedMesh(tickGeo, mats.liquidGold, tickCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tickCount; i++) {
    const a = Math.PI + (i / (tickCount - 1)) * Math.PI * 1.5;
    const r = (outerR + innerR) * 0.5;
    dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.145);
    dummy.rotation.set(0, 0, a - Math.PI / 2);
    dummy.scale.set(1, i % 5 === 0 ? 1.4 : 0.85, 1);
    dummy.updateMatrix();
    tickInst.setMatrixAt(i, dummy.matrix);
  }
  tickInst.instanceMatrix.needsUpdate = true;
  ringAssembly.add(tickInst);

  tagPart(ringAssembly, 'ring');
  regExpand(expandables, ringAssembly, -0.16, -0.05, -0.14);
  group.add(ringAssembly);

  // 2. Compact Precision Caliper Hairline (stays closely nestled around the sculpture, zero giant screen-spanning ring)
  const outerHaloGroup = new THREE.Group();
  const fineCaliper = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.006, 12, 112), mats.holoEdgeBlue);
  fineCaliper.rotation.x = Math.PI * 0.34;
  fineCaliper.rotation.y = -0.24;
  outerHaloGroup.add(fineCaliper);

  tagPart(outerHaloGroup, 'ring');
  regExpand(expandables, outerHaloGroup, 0, 0.12, 0.08);
  group.add(outerHaloGroup);

  // 3. Concealed Architectural "1" Spine (Brushed Titanium + Smoked Glass Backing)
  const axisGroup = new THREE.Group();
  const upperShape = new THREE.Shape();
  upperShape.moveTo(-0.30, 0.30);
  upperShape.lineTo(-0.07, 0.45);
  upperShape.lineTo(0.10, 0.45);
  upperShape.lineTo(0.10, 0.12);
  upperShape.lineTo(-0.09, 0.12);
  upperShape.lineTo(-0.09, 0.28);
  upperShape.lineTo(-0.24, 0.20);
  upperShape.closePath();

  const upperGeo = new THREE.ExtrudeGeometry(upperShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 4,
  });
  upperGeo.translate(0, 0, -0.12);
  const upperMesh = new THREE.Mesh(upperGeo, mats.liquidTitanium);
  axisGroup.add(upperMesh);

  const lowerGeo = new THREE.BoxGeometry(0.19, 0.64, 0.22);
  const lowerMesh = new THREE.Mesh(lowerGeo, mats.smokedTitanium);
  lowerMesh.position.set(0, -0.58, 0);
  axisGroup.add(lowerMesh);

  // Optical crystal lamina framing the vertical "1" column
  const axisGlass = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.045), mats.crystalLens);
  axisGlass.position.set(0, -0.58, -0.14);
  axisGroup.add(axisGlass);

  tagPart(axisGroup, 'axis');
  regExpand(expandables, axisGroup, 0, -0.16, -0.32);
  group.add(axisGroup);

  // 4. 45° Optical Crystal Sapphire-Jade Threshold Bridge + Blue-White Waveguide Core
  const portalGroup = new THREE.Group();
  const portalShape = new THREE.Shape();
  portalShape.moveTo(-0.92, 0.10);
  portalShape.lineTo(-0.12, 0.90);
  portalShape.lineTo(0.05, 0.74);
  portalShape.lineTo(-0.75, -0.06);
  portalShape.closePath();

  const portalGeo = new THREE.ExtrudeGeometry(portalShape, {
    depth: 0.30,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.022,
    bevelSegments: 5,
  });
  portalGeo.translate(0, 0, -0.15);
  const portalMesh = new THREE.Mesh(portalGeo, mats.jadeCrystal);
  portalGroup.add(portalMesh);

  // Inner ice-blue-white optical waveguide filament aligned along the 45° bridge
  const filament = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.04, 0.022), mats.holoEdgeBlue);
  filament.position.set(-0.43, 0.42, 0);
  filament.rotation.z = -Math.PI * 0.25;
  portalGroup.add(filament);

  tagPart(portalGroup, 'portal');
  regExpand(expandables, portalGroup, 0.24, 0.24, 0.32);
  group.add(portalGroup);

  // 5. Champagne Liquid-Gold Origin Seed Core + Faceted Optical Crystal & Micro Gimbals
  const seedGroup = new THREE.Group();
  const seedSphere = new THREE.Mesh(new THREE.SphereGeometry(0.21, 48, 48), mats.liquidGold);
  seedGroup.add(seedSphere);

  // Inner faceted optical crystal prism enclosing the gold seed
  const crystalShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.29, 0), mats.crystalLens);
  seedGroup.add(crystalShell);

  const seedCollarBlue = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.009, 14, 80), mats.holoEdgeBlue);
  seedCollarBlue.rotation.x = Math.PI * 0.36;
  seedCollarBlue.rotation.y = Math.PI * 0.24;
  seedGroup.add(seedCollarBlue);

  const seedCollarGold = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.008, 12, 80), mats.liquidGold);
  seedCollarGold.rotation.x = -Math.PI * 0.28;
  seedCollarGold.rotation.y = Math.PI * 0.42;
  seedGroup.add(seedCollarGold);

  tagPart(seedGroup, 'seed');
  regExpand(expandables, seedGroup, 0, 0, 0.44);
  group.add(seedGroup);

  return {
    group,
    animatedCore: seedGroup,
    secondaryRing: outerHaloGroup,
    gimbalInner: crystalShell,
    expandables,
  };
}

export function buildInfinitySculpture(mats: CultureMaterials, isSoftwareGl: boolean): BuiltSculpture {
  const group = new THREE.Group();
  const expandables: ExpandableNode[] = [];
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (r: number, deg: number): [number, number] => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];

  const addChevron = (
    baseDeg: number,
    mat: THREE.Material,
    zOffset: number,
    part: EmblemPartKey,
    expandVec: [number, number, number]
  ) => {
    const outerR = 1.94;
    const innerR = 0.86;
    const shape = new THREE.Shape();
    const p1 = pt(innerR, baseDeg);
    const p2 = pt(outerR, baseDeg + 20);
    const p3 = pt(outerR, baseDeg + 56);
    const p4 = pt(innerR + 0.3, baseDeg + 34);
    shape.moveTo(p1[0], p1[1]);
    shape.lineTo(p2[0], p2[1]);
    shape.lineTo(p3[0], p3[1]);
    shape.lineTo(p4[0], p4[1]);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.028,
      bevelSize: 0.022,
      bevelSegments: 4,
    });
    geo.translate(0, 0, -0.12 + zOffset);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = !isSoftwareGl;
    tagPart(mesh, part);
    regExpand(expandables, mesh, ...expandVec);
    group.add(mesh);
  };

  addChevron(20, mats.porcelain, 0.16, 'ring', [0.22, 0.14, 0.24]);
  addChevron(110, mats.jadeCrystal, -0.14, 'portal', [-0.22, 0.22, -0.22]);
  addChevron(200, mats.porcelain, 0.16, 'ring', [-0.22, -0.18, 0.24]);
  addChevron(290, mats.liquidTitanium, -0.14, 'axis', [0.22, -0.22, -0.22]);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.011, 14, 112), mats.holoLineGold);
  outerRing.rotation.x = Math.PI * 0.18;
  tagPart(outerRing, 'ring');
  group.add(outerRing);

  const diamondGroup = new THREE.Group();
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mats.liquidGold);
  diamond.castShadow = !isSoftwareGl;
  diamondGroup.add(diamond);

  const crystalOct = new THREE.Mesh(new THREE.OctahedronGeometry(0.56, 0), mats.crystalLens);
  diamondGroup.add(crystalOct);

  const diamondRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.015, 16, 72), mats.holoLineJade);
  diamondRing.rotation.x = Math.PI * 0.4;
  diamondGroup.add(diamondRing);

  tagPart(diamondGroup, 'seed');
  regExpand(expandables, diamondGroup, 0, 0, 0.45);
  group.add(diamondGroup);

  return {
    group,
    animatedCore: diamondGroup,
    secondaryRing: outerRing,
    gimbalInner: crystalOct,
    expandables,
  };
}

export function buildHorizonSculpture(mats: CultureMaterials, isSoftwareGl: boolean): BuiltSculpture {
  const group = new THREE.Group();
  const expandables: ExpandableNode[] = [];

  const horizonShape = new THREE.Shape();
  horizonShape.moveTo(-1.95, 0.02);
  horizonShape.bezierCurveTo(-0.85, 0.44, 0.85, -0.26, 1.95, 0.08);
  horizonShape.lineTo(1.95, -0.22);
  horizonShape.bezierCurveTo(0.85, -0.52, -0.85, 0.16, -1.95, -0.24);
  horizonShape.closePath();

  const horizonGeo = new THREE.ExtrudeGeometry(horizonShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.022,
    bevelSegments: 4,
    curveSegments: 56,
  });
  horizonGeo.translate(0, 0, -0.24);
  const horizonMesh = new THREE.Mesh(horizonGeo, mats.jadeCrystal);
  horizonMesh.castShadow = !isSoftwareGl;
  tagPart(horizonMesh, 'portal');
  regExpand(expandables, horizonMesh, 0, 0.05, 0.34);
  group.add(horizonMesh);

  const upperShape = new THREE.Shape();
  upperShape.moveTo(-1.42, 0.56);
  upperShape.bezierCurveTo(-0.56, 1.38, 0.56, 1.38, 1.42, 0.56);
  upperShape.lineTo(1.22, 0.42);
  upperShape.bezierCurveTo(0.48, 1.12, -0.48, 1.12, -1.22, 0.42);
  upperShape.closePath();

  const upperGeo = new THREE.ExtrudeGeometry(upperShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 48,
  });
  upperGeo.translate(0, 0, -0.14);
  const upperMesh = new THREE.Mesh(upperGeo, mats.porcelain);
  upperMesh.castShadow = !isSoftwareGl;
  tagPart(upperMesh, 'ring');
  regExpand(expandables, upperMesh, 0, 0.28, -0.18);
  group.add(upperMesh);

  const plinthShape = new THREE.Shape();
  plinthShape.moveTo(-1.55, -0.62);
  plinthShape.lineTo(-0.46, -0.62);
  plinthShape.lineTo(-0.46, -1.16);
  plinthShape.bezierCurveTo(-0.24, -1.48, 0.24, -1.48, 0.46, -1.16);
  plinthShape.lineTo(0.46, -0.62);
  plinthShape.lineTo(1.55, -0.62);
  plinthShape.lineTo(1.55, -1.66);
  plinthShape.lineTo(-1.55, -1.66);
  plinthShape.closePath();

  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  plinthGeo.translate(0, 0, -0.2);
  const plinthMesh = new THREE.Mesh(plinthGeo, mats.liquidTitanium);
  plinthMesh.receiveShadow = !isSoftwareGl;
  tagPart(plinthMesh, 'axis');
  regExpand(expandables, plinthMesh, 0, -0.24, -0.28);
  group.add(plinthMesh);

  const zenithGroup = new THREE.Group();
  zenithGroup.position.set(0, 0.72, 0.14);
  const zenith = new THREE.Mesh(new THREE.SphereGeometry(0.28, 42, 42), mats.liquidGold);
  zenith.castShadow = !isSoftwareGl;
  zenithGroup.add(zenith);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.013, 14, 64), mats.holoLineGold);
  halo.rotation.x = Math.PI * 0.42;
  zenithGroup.add(halo);

  tagPart(zenithGroup, 'seed');
  regExpand(expandables, zenithGroup, 0, 0.18, 0.42);
  group.add(zenithGroup);

  return {
    group,
    animatedCore: zenithGroup,
    secondaryRing: halo,
    gimbalInner: null,
    expandables,
  };
}

/**
 * Three tactile architectural mini-sculptures orbiting outside the ONE emblem
 * representing functional realms: Cinema, Sonic/Music, and World Library.
 */
export function buildSpatialPortalAnchors(mats: CultureMaterials): BuiltPortalAnchor[] {
  const anchors: BuiltPortalAnchor[] = [];

  const configs: Array<{
    id: SpatialPortalId;
    tab: 'video' | 'venus' | 'library';
    pos: [number, number, number];
    haloColor: number;
  }> = [
    { id: 'cinema', tab: 'video', pos: [-2.68, 1.18, -0.45], haloColor: 0xc4a876 },
    { id: 'music', tab: 'venus', pos: [2.75, 0.92, 0.35], haloColor: 0x2e8b74 },
    { id: 'library', tab: 'library', pos: [2.52, -1.26, -0.35], haloColor: 0xd4dbe6 },
  ];

  for (const cfg of configs) {
    const root = new THREE.Group();
    root.position.set(...cfg.pos);

    const orbGroup = new THREE.Group();
    const eqBars: THREE.Mesh[] = [];

    if (cfg.id === 'cinema') {
      // Chamfered aperture lens bezel + crystal optical core
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 16, 48), mats.liquidTitanium);
      orbGroup.add(bezel);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 36), mats.crystalLens);
      lens.rotation.x = Math.PI / 2;
      orbGroup.add(lens);
      const iris = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mats.liquidGold);
      orbGroup.add(iris);
    } else if (cfg.id === 'music') {
      // Crystal sonic disc + live FFT frequency resonator bars
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 42), mats.jadeCrystal);
      disc.rotation.x = Math.PI * 0.38;
      orbGroup.add(disc);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 24), mats.liquidGold);
      orbGroup.add(core);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.14, 0.032), mats.holoLineJade);
        bar.position.set(Math.cos(ang) * 0.22, 0.1, Math.sin(ang) * 0.22);
        eqBars.push(bar);
        orbGroup.add(bar);
      }
    } else {
      // 3-folio architectural optical crystal slabs
      for (let i = -1; i <= 1; i++) {
        const folio = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.42, 0.036),
          i === 0 ? mats.porcelain : mats.crystalLens
        );
        folio.position.set(i * 0.075, i * 0.02, i * 0.065);
        folio.rotation.y = i * 0.18;
        orbGroup.add(folio);
      }
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.24), mats.liquidGold);
      spine.position.set(-0.18, 0, 0);
      orbGroup.add(spine);
    }

    const haloMat = new THREE.MeshBasicMaterial({
      color: cfg.haloColor,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    });
    const haloRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.445, 48), haloMat);
    haloRing.rotation.x = Math.PI * 0.34;
    orbGroup.add(haloRing);

    root.add(orbGroup);
    root.traverse((child) => {
      child.userData.portalId = cfg.id;
      child.userData.portalTab = cfg.tab;
    });

    anchors.push({
      id: cfg.id,
      tab: cfg.tab,
      root,
      orbGroup,
      haloRing,
      basePos: root.position.clone(),
      eqBars: eqBars.length > 0 ? eqBars : undefined,
    });
  }

  return anchors;
}
