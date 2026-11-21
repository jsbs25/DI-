import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import type { Language, User } from '../../types/index.ts';
import { ParadiseBrandEmblem } from '../brand/ParadiseBrandEmblem.tsx';
import {
  detectWebGLSupport,
  isSoftwareRenderer,
  prefersReducedMotion,
} from '../spatial/webglCapabilities.ts';
import {
  createParadiseTextures,
  detectParadiseQuality,
} from '../paradise/paradiseQuality.ts';
import {
  createParadiseSkyDome,
  ParadiseEnvironmentEngine,
  sampleWindField,
} from '../paradise/paradiseEnvironment.ts';
import { sampleTerrainBiome, terrainHeightAt } from '../paradise/paradiseTerrain.ts';
import { createParadiseArchitecture } from '../paradise/paradiseArchitecture.ts';
import {
  createParadisePostPipeline,
  type ParadisePostPipeline,
} from '../paradise/paradisePost.ts';
import {
  formatPersonalWelcomeVo,
  INTRO_PHASES,
  INTRO_TOTAL_DURATION_SEC,
  SceneTimelineDirector,
} from './cinematicTimeline.ts';
import { CinematicAudioController } from './cinematicAudio.ts';

export interface CinematicIntroProps {
  onComplete: () => void;
  onAuthSuccess?: (user: User, token: string, isNewRegistration: boolean) => void;
  currentUser?: User | null;
  lang?: Language;
  gestureUnlocked?: boolean;
}

// Pre-allocated zero-GC math scratchpads
const _windVec = new THREE.Vector3();
const _sunProj = new THREE.Vector3();
const _sunPos2D = new THREE.Vector2();
const _godRayColor = new THREE.Color(0xffdca8);
const _dummyMat4 = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyEuler = new THREE.Euler();
const _dummyScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();

interface PetalParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  scale: number;
  phase: number;
  isGinkgo: boolean;
}

/**
 * Patches standard double-sided alpha-tested foliage/blossom cards so thin
 * sunlit petals glow gently from behind rather than turning dark on backfaces
 * (normal-flip technique verified in nicoo-474/sakura-sky-island).
 */
function applyBacklitFoliageNormalPatch(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `
      #include <normal_fragment_begin>
      normal = normalize( vNormal );
      nonPerturbedNormal = normal;
      `
    );
  };
  mat.customProgramCacheKey = () => 'one_intro_backlit_foliage_v2';
}

function buildIntroTerrainGeometry(segments: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(180, 180, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const cDeepBed = new THREE.Color(0x1b2b31);
  const cShore = new THREE.Color(0x746d58);
  const cMeadow = new THREE.Color(0x33572d);
  const cMeadowRich = new THREE.Color(0x234424);
  const cPath = new THREE.Color(0x827d73);
  const cRock = new THREE.Color(0x4f555d);
  const cFarRidge = new THREE.Color(0x243b34);
  const cTmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const s = sampleTerrainBiome(x, z);
    posAttr.setY(i, s.height);

    const n = 0.5 + 0.5 * Math.sin(x * 0.19 + Math.cos(z * 0.17) * 1.6);
    cTmp.copy(cMeadow).lerp(cMeadowRich, n);

    if (s.height < 0.05) {
      const bedT = Math.max(0, Math.min(1, (0.05 - s.height) / 0.9));
      cTmp.lerp(cDeepBed, bedT);
    }
    if (s.shoreWeight > 0) cTmp.lerp(cShore, s.shoreWeight * 0.8);
    if (s.pathWeight > 0) cTmp.lerp(cPath, s.pathWeight * 0.85);
    if (s.rockWeight > 0) cTmp.lerp(cRock, s.rockWeight * 0.88);
    const dist = Math.hypot(x, z);
    if (dist > 40) {
      const ridgeT = Math.max(0, Math.min(1, (dist - 40) / 56));
      cTmp.lerp(cFarRidge, ridgeT * 0.65);
    }

    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildIntroCanopyGroves(
  barkMap: THREE.CanvasTexture,
  sakuraClusterMap: THREE.CanvasTexture,
  ginkgoClusterMap: THREE.CanvasTexture,
  pineClusterMap: THREE.CanvasTexture
): {
  group: THREE.Group;
  treeMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
} {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const treeMaterials: THREE.MeshStandardMaterial[] = [];

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x4b3329,
    map: barkMap,
    roughness: 0.92,
    metalness: 0.02,
  });
  const sakuraMat = new THREE.MeshStandardMaterial({
    map: sakuraClusterMap,
    alphaTest: 0.32,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.02,
    color: 0xffedf3,
  });
  const ginkgoMat = new THREE.MeshStandardMaterial({
    map: ginkgoClusterMap,
    alphaTest: 0.34,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.68,
    metalness: 0.02,
    color: 0xffe48c,
  });
  const pineMat = new THREE.MeshStandardMaterial({
    map: pineClusterMap,
    alphaTest: 0.34,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0.02,
    color: 0x2b4b31,
  });

  applyBacklitFoliageNormalPatch(sakuraMat);
  applyBacklitFoliageNormalPatch(ginkgoMat);
  applyBacklitFoliageNormalPatch(pineMat);
  mats.push(barkMat, sakuraMat, ginkgoMat, pineMat);
  treeMaterials.push(sakuraMat, ginkgoMat, pineMat);

  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.24, 3.3, 8);
  trunkGeo.translate(0, 1.65, 0);
  const boughGeo = new THREE.CylinderGeometry(0.05, 0.11, 2.05, 6);
  boughGeo.translate(0, 1.0, 0);
  const clusterPlane = new THREE.PlaneGeometry(3.2, 3.2);
  geos.push(trunkGeo, boughGeo, clusterPlane);

  const addTree = (x: number, z: number, kind: 'sakura' | 'ginkgo' | 'pine', scale: number, seed: number) => {
    const y = terrainHeightAt(x, z);
    if (!Number.isFinite(y) || y < -0.1) return;

    const tree = new THREE.Group();
    tree.position.set(x, y - 0.12, z);
    tree.scale.setScalar(scale);

    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.rotation.z = Math.sin(seed) * 0.08;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    const leafMat = kind === 'sakura' ? sakuraMat : kind === 'ginkgo' ? ginkgoMat : pineMat;

    // 3 diverging boughs forming natural organic crown silhouette
    for (let b = 0; b < 3; b++) {
      const ang = (b * Math.PI * 2) / 3 + seed * 0.7;
      const bough = new THREE.Mesh(boughGeo, barkMat);
      bough.position.set(0, 2.35, 0);
      bough.rotation.order = 'YXZ';
      bough.rotation.y = ang;
      bough.rotation.x = 0.56;
      tree.add(bough);

      const clusterX = Math.sin(ang) * 1.15;
      const clusterZ = Math.cos(ang) * 1.15;
      for (let c = 0; c < 2; c++) {
        const card = new THREE.Mesh(clusterPlane, leafMat);
        card.position.set(clusterX * (0.85 + c * 0.2), 3.45 + c * 0.45, clusterZ * (0.85 + c * 0.2));
        card.rotation.y = ang + c * 1.05;
        card.rotation.x = -0.22 + c * 0.35;
        card.scale.setScalar(0.82 + ((seed + b + c) % 3) * 0.16);
        card.castShadow = true;
        tree.add(card);
      }
    }

    // Crown apex card
    const apex = new THREE.Mesh(clusterPlane, leafMat);
    apex.position.set(0, 4.35, 0);
    apex.rotation.y = seed;
    apex.rotation.x = -0.35;
    apex.scale.setScalar(0.95);
    tree.add(apex);

    group.add(tree);
  };

  // Sculpted sakura shore grove (eastern & right-shore framing; keeps center camera corridor open!)
  const sakuraSites: Array<[number, number, number]> = [
    [11.5, 4.2, 1.15],
    [15.4, 8.8, 1.24],
    [18.8, 2.2, 1.08],
    [14.2, -13.6, 1.22],
    [8.2, -14.8, 1.05],
    [20.4, -7.8, 1.28],
    [9.8, 14.5, 1.04],
    [-16.2, -11.4, 1.12],
    [-21.5, -2.5, 1.22],
    [22.4, 10.6, 1.18],
  ];
  sakuraSites.forEach(([x, z, s], idx) => addTree(x, z, 'sakura', s, idx * 1.9 + 0.4));

  // Sculpted golden ginkgo grove (western & northern shore balance)
  const ginkgoSites: Array<[number, number, number]> = [
    [-11.8, 6.2, 1.18],
    [-15.8, 11.2, 1.24],
    [-14.6, -2.2, 1.12],
    [-11.4, -15.4, 1.22],
    [-2.5, -18.2, 1.16],
    [4.4, -17.4, 1.08],
    [-19.2, 4.8, 1.28],
    [17.6, -16.8, 1.24],
  ];
  ginkgoSites.forEach(([x, z, s], idx) => addTree(x, z, 'ginkgo', s, idx * 2.3 + 1.1));

  // Evergreen alpine perimeter pines framing distant horizon ridges
  const pineSites: Array<[number, number, number]> = [
    [-26.0, -18.0, 1.45],
    [-18.5, -26.5, 1.55],
    [-6.0, -28.0, 1.5],
    [8.5, -26.5, 1.48],
    [21.0, -23.5, 1.52],
    [29.5, -11.0, 1.45],
    [-29.5, 12.0, 1.42],
    [28.5, 15.0, 1.4],
  ];
  pineSites.forEach(([x, z, s], idx) => addTree(x, z, 'pine', s, idx * 1.7 + 2.2));

  return {
    group,
    treeMaterials,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/**
 * View-angle-attenuated volumetric sunrise shaft cones (technique inspired by sakura-sky-island)
 */
function createSunBeams(): {
  group: THREE.Group;
  uniforms: { uTime: { value: number }; uIntensity: { value: number }; uColor: { value: THREE.Color } };
  dispose: () => void;
} {
  const group = new THREE.Group();
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0.25 },
    uColor: { value: new THREE.Color(0xffdca2) },
  };

  const geo = new THREE.CylinderGeometry(1.1, 4.6, 32, 20, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;

      void main() {
        vec3 N = normalize(vNormalView);
        vec3 V = normalize(vViewPos);
        float edgeFade = pow(abs(dot(N, V)), 1.35);
        float verticalFade = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float shimmer = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 12.56);
        float alpha = edgeFade * verticalFade * shimmer * uIntensity * 0.16;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const placements: Array<[number, number, number, number, number]> = [
    [7.5, 12.5, -5.5, 0.42, 0.26],
    [-4.2, 13.0, -3.5, 0.38, 0.3],
    [13.8, 12.2, 2.5, 0.44, 0.24],
    [-11.0, 11.8, 4.5, 0.4, 0.28],
  ];

  placements.forEach(([x, y, z, rz, rx]) => {
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(x, y, z);
    beam.rotation.set(rx, 0, rz);
    group.add(beam);
  });

  return {
    group,
    uniforms,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export const CinematicIntro: React.FC<CinematicIntroProps> = ({
  onComplete,
  currentUser,
  lang = 'zh',
  gestureUnlocked = false,
}) => {
  const isZh = lang === 'zh';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<CinematicAudioController | null>(null);
  const directorRef = useRef<SceneTimelineDirector | null>(null);
  if (!directorRef.current) {
    directorRef.current = new SceneTimelineDirector();
  }

  const [webglReady] = useState<boolean>(() => detectWebGLSupport());
  const [contextLost, setContextLost] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [activePhaseId, setActivePhaseId] = useState(INTRO_PHASES[0].id);
  const [brandOpacity, setBrandOpacity] = useState(0);
  const [welcomeOpacity, setWelcomeOpacity] = useState(0);
  const [activeCaption, setActiveCaption] = useState('');
  const [progressRatio, setProgressRatio] = useState(0);

  const isDoneRef = useRef(false);
  const speedBoostRef = useRef(1.0);
  const soundEnabledRef = useRef(false);
  const userNameRef = useRef<string | undefined>(
    currentUser?.displayName || currentUser?.username || undefined
  );
  userNameRef.current = currentUser?.displayName || currentUser?.username || undefined;

  // Initialize audio & honor user-gesture unlock if triggered via Sign In / Replay
  useEffect(() => {
    const audio = new CinematicAudioController();
    audioRef.current = audio;

    if (gestureUnlocked) {
      const ok = audio.startAmbient();
      if (ok) {
        soundEnabledRef.current = true;
        setSoundEnabled(true);
      }
    }

    const unlockOnFirstGesture = () => {
      if (isDoneRef.current || soundEnabledRef.current) return;
      const ok = audio.startAmbient();
      if (ok) {
        soundEnabledRef.current = true;
        setSoundEnabled(true);
      }
    };

    window.addEventListener('pointerdown', unlockOnFirstGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      audio.dispose();
      audioRef.current = null;
    };
  }, [gestureUnlocked]);

  const toggleSound = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (!soundEnabledRef.current) {
      const started = audio.startAmbient();
      if (started) {
        soundEnabledRef.current = true;
        setSoundEnabled(true);
      }
    } else {
      const next = !soundEnabledRef.current;
      audio.setMuted(!next);
      soundEnabledRef.current = next;
      setSoundEnabled(next);
    }
  }, []);

  const finishCeremony = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    speedBoostRef.current = 3.2;
    setIsFadingOut(true);
    audioRef.current?.playArrivalChime();

    window.setTimeout(() => {
      audioRef.current?.dispose();
      onComplete();
    }, 780);
  }, [onComplete]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finishCeremony();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finishCeremony, toggleSound]);

  // -------------------------------------------------------------------------
  // Main 3D Paradise Dawn Awakening & CatmullRomCurve3 Cinema Render Loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!webglReady) {
      const t = window.setTimeout(finishCeremony, 2200);
      return () => window.clearTimeout(t);
    }

    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = prefersReducedMotion();
    if (reducedMotion) {
      setBrandOpacity(1);
      setActivePhaseId('brandReveal');
      const timer = window.setTimeout(finishCeremony, 2400);
      return () => window.clearTimeout(timer);
    }

    let disposed = false;
    let frameId = 0;

    const width = Math.max(320, container.clientWidth || 1280);
    const height = Math.max(240, container.clientHeight || 720);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      const t = window.setTimeout(finishCeremony, 1800);
      return () => window.clearTimeout(t);
    }

    const gl = renderer.getContext();
    const isSoftwareGl = isSoftwareRenderer(gl);
    const quality = detectParadiseQuality(isSoftwareGl, reducedMotion, width, height, 'auto');

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(quality.pixelRatio, 1.5));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = quality.enableShadows && !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(0x284068, 0.0155);
    scene.fog = fog;
    scene.background = new THREE.Color(0x1f3458);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.25, 240);

    // PMREM environment reflection for mirror-smooth water & lantern bronze
    const pmremGen = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGen.fromScene(roomEnv, 0.05);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.5;
    roomEnv.dispose();
    pmremGen.dispose();

    const textures = createParadiseTextures(renderer.capabilities.getMaxAnisotropy());
    const envEngine = new ParadiseEnvironmentEngine(0.214, 'morning-fog');
    envEngine.autoCycle = false;
    envEngine.autoWeather = false;

    // 1. Dynamic Dawn Sky Dome + Volumetric Clouds
    const skyDome = createParadiseSkyDome();
    scene.add(skyDome.mesh);

    // 2. Calibrated Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x6e8ec2, 0x263222, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffcb94, 1.45);
    sunLight.position.set(18, 12, -16);
    if (renderer.shadowMap.enabled) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 92;
      const d = 30;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.025;
    }
    scene.add(sunLight);

    // 3. Terrain Valley & Shoreline Basin
    const terrainSegs = quality.tier === 'high' ? 116 : quality.tier === 'medium' ? 92 : 68;
    const terrainGeo = buildIntroTerrainGeometry(terrainSegs);
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: textures.terrainDetail,
      roughness: 0.88,
      metalness: 0.03,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 4. Reflective Animated Water Surface
    const waterGeo = new THREE.PlaneGeometry(78, 66);
    let waterHandle: Water | null = null;
    let fallbackWaterMesh: THREE.Mesh | null = null;
    let fallbackWaterMat: THREE.ShaderMaterial | null = null;

    if (!isSoftwareGl && quality.tier !== 'low') {
      waterHandle = new Water(waterGeo, {
        textureWidth: quality.tier === 'high' ? 512 : 256,
        textureHeight: quality.tier === 'high' ? 512 : 256,
        waterNormals: textures.waterNormals,
        sunDirection: new THREE.Vector3(0.5, 0.35, -0.7).normalize(),
        sunColor: 0xffd5a2,
        waterColor: 0x164952,
        distortionScale: 1.65,
        fog: true,
      });
      waterHandle.rotation.x = -Math.PI / 2;
      waterHandle.position.set(1.5, 0.0, -3.5);
      scene.add(waterHandle);
    } else {
      fallbackWaterMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSkyColor: { value: new THREE.Color(0xeba175) },
          uDeepColor: { value: new THREE.Color(0x133845) },
          uSunDir: { value: new THREE.Vector3(0.5, 0.35, -0.7).normalize() },
        },
        transparent: true,
        vertexShader: /* glsl */ `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uSkyColor;
          uniform vec3 uDeepColor;
          uniform vec3 uSunDir;
          varying vec3 vWorldPos;
          void main() {
            vec2 p = vWorldPos.xz;
            float r1 = sin(p.x * 1.4 + uTime * 1.2) * cos(p.y * 1.1 - uTime * 0.9);
            float r2 = sin(p.x * 2.9 - p.y * 2.3 + uTime * 1.9);
            vec3 N = normalize(vec3((r1 + r2 * 0.5) * 0.08, 1.0, (r1 - r2 * 0.5) * 0.08));
            vec3 V = normalize(cameraPosition - vWorldPos);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
            vec3 R = reflect(-V, N);
            float sunSpec = pow(max(dot(R, normalize(uSunDir)), 0.0), 72.0);
            vec3 col = mix(uDeepColor, uSkyColor, clamp(fresnel * 0.82 + 0.14, 0.0, 1.0));
            col += vec3(1.0, 0.88, 0.7) * sunSpec * 0.95;
            gl_FragColor = vec4(col, 0.92);
          }
        `,
      });
      fallbackWaterMesh = new THREE.Mesh(waterGeo, fallbackWaterMat);
      fallbackWaterMesh.rotation.x = -Math.PI / 2;
      fallbackWaterMesh.position.set(1.5, 0.0, -3.5);
      scene.add(fallbackWaterMesh);
    }

    // 5. Traditional Pagoda Pavilion, Arched Footbridge & Stone Lanterns
    const architecture = createParadiseArchitecture(quality, textures);
    scene.add(architecture.group);

    // 6. Sculpted Sakura, Ginkgo & Pine Shoreline Groves
    const groves = buildIntroCanopyGroves(
      textures.barkMap,
      textures.sakuraClusterMap,
      textures.ginkgoClusterMap,
      textures.pineClusterMap
    );
    scene.add(groves.group);

    // 7. Aerodynamic Sakura Petal & Golden Ginkgo Leaf Instanced Systems
    const petalCount = quality.tier === 'high' ? 280 : quality.tier === 'medium' ? 200 : 130;
    const ginkgoCount = quality.tier === 'high' ? 190 : quality.tier === 'medium' ? 140 : 90;
    const totalDriftCount = petalCount + ginkgoCount;

    const sakuraGeo = new THREE.PlaneGeometry(0.16, 0.16, 2, 2);
    // Gentle petal cup curvature
    const sPos = sakuraGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sPos.count; i++) {
      const x = sPos.getX(i);
      const y = sPos.getY(i);
      sPos.setZ(i, (x * x + y * y) * 2.2);
    }
    sakuraGeo.computeVertexNormals();

    const ginkgoGeo = new THREE.PlaneGeometry(0.24, 0.24, 2, 2);
    const gPos = ginkgoGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gPos.count; i++) {
      const x = gPos.getX(i);
      const y = gPos.getY(i);
      gPos.setZ(i, Math.sin(x * 16) * 0.015 - y * y * 0.8);
    }
    ginkgoGeo.computeVertexNormals();

    const sakuraParticleMat = new THREE.MeshStandardMaterial({
      map: textures.sakuraPetalTex,
      alphaTest: 0.25,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      roughness: 0.62,
      emissive: new THREE.Color(0x4d2032),
      emissiveIntensity: 0.22,
    });
    applyBacklitFoliageNormalPatch(sakuraParticleMat);

    const ginkgoParticleMat = new THREE.MeshStandardMaterial({
      map: textures.ginkgoLeafTex,
      alphaTest: 0.25,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      roughness: 0.58,
      emissive: new THREE.Color(0x523c0a),
      emissiveIntensity: 0.18,
    });
    applyBacklitFoliageNormalPatch(ginkgoParticleMat);

    const sakuraInst = new THREE.InstancedMesh(sakuraGeo, sakuraParticleMat, petalCount);
    const ginkgoInst = new THREE.InstancedMesh(ginkgoGeo, ginkgoParticleMat, ginkgoCount);
    sakuraInst.frustumCulled = false;
    ginkgoInst.frustumCulled = false;

    const particles: PetalParticle[] = [];
    for (let i = 0; i < totalDriftCount; i++) {
      const isGinkgo = i >= petalCount;
      particles.push({
        x: (Math.random() - 0.5) * 44,
        y: 1.0 + Math.random() * 14,
        z: (Math.random() - 0.5) * 48,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.35 + Math.random() * 0.5),
        vz: (Math.random() - 0.5) * 0.3,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        spinX: (Math.random() - 0.5) * 2.4,
        spinY: (Math.random() - 0.5) * 2.1,
        spinZ: (Math.random() - 0.5) * 2.4,
        scale: isGinkgo ? 0.8 + Math.random() * 0.55 : 0.72 + Math.random() * 0.58,
        phase: Math.random() * Math.PI * 2,
        isGinkgo,
      });

      const idx = isGinkgo ? i - petalCount : i;
      if (isGinkgo) {
        _tmpColor.setHSL(0.11 + Math.random() * 0.03, 0.88, 0.56 + Math.random() * 0.14);
        ginkgoInst.setColorAt(idx, _tmpColor);
      } else {
        _tmpColor.setHSL(0.94 + Math.random() * 0.03, 0.7 + Math.random() * 0.2, 0.86 + Math.random() * 0.12);
        sakuraInst.setColorAt(idx, _tmpColor);
      }
    }
    if (sakuraInst.instanceColor) sakuraInst.instanceColor.needsUpdate = true;
    if (ginkgoInst.instanceColor) ginkgoInst.instanceColor.needsUpdate = true;
    scene.add(sakuraInst, ginkgoInst);

    // 8. Atmospheric Lake Mist Banks
    const mistCount = 14;
    const mistGeo = new THREE.PlaneGeometry(16, 7.5);
    const mistMat = new THREE.MeshBasicMaterial({
      map: textures.mistPuff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      color: 0xe6eff9,
    });
    const mistMeshes: Array<{ mesh: THREE.Mesh; baseX: number; speed: number; phase: number }> = [];
    for (let i = 0; i < mistCount; i++) {
      const m = new THREE.Mesh(mistGeo, mistMat);
      const bx = (Math.random() - 0.5) * 42;
      const bz = -18 + Math.random() * 34;
      m.position.set(bx, 1.3 + Math.random() * 2.4, bz);
      m.scale.setScalar(0.85 + Math.random() * 0.75);
      scene.add(m);
      mistMeshes.push({ mesh: m, baseX: bx, speed: 0.35 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
    }

    // 9. Crepuscular Volumetric Sunrise Beams
    const sunBeams = createSunBeams();
    scene.add(sunBeams.group);

    // 10. Optional HDR Bloom / GodRays Pipeline (skipped cleanly on software WebGL)
    let postPipeline: ParadisePostPipeline | null = null;
    if (!isSoftwareGl && (quality.enableBloom || quality.enableGodRays)) {
      postPipeline = createParadisePostPipeline(
        renderer,
        scene,
        camera,
        width,
        height,
        renderer.getPixelRatio(),
        {
          enableBloom: quality.enableBloom,
          enableGodRays: quality.enableGodRays,
          enableDOF: false,
        }
      );
      postPipeline.setOptions({ cameraNear: 0.25, cameraFar: 240 });
    } else {
      try {
        renderer.compile(scene, camera);
      } catch {}
    }

    // Subtle mouse parallax
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;
    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      targetMouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetMouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!container || !renderer || disposed) return;
      const w = Math.max(300, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      postPipeline?.setSize(w, h, renderer.getPixelRatio());
    };
    window.addEventListener('resize', onResize);

    const director = directorRef.current!;
    let lastClockMs = performance.now();
    let timelineSec = 0;
    let hudSyncAccum = 0;
    let lastPhaseId = INTRO_PHASES[0].id;
    let lastCaption = '';

    // Synchronize frame 0 immediately so no uninitialized flash occurs
    const eval0 = director.evaluate(0, userNameRef.current);
    camera.position.copy(eval0.cameraPos);
    camera.lookAt(eval0.lookAt);

    function afterDraw(cb: () => void) {
      const context = renderer?.getContext() as WebGL2RenderingContext | null;
      if (!context || typeof context.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      context.flush();
      const poll = () => {
        if (disposed) {
          if (sync) context.deleteSync(sync);
          return;
        }
        const status = sync ? context.getSyncParameter(sync, context.SYNC_STATUS) : context.SIGNALED;
        if (status === context.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) context.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = Math.min(0.08, Math.max(0.001, (nowMs - lastClockMs) / 1000));
      lastClockMs = nowMs;

      timelineSec = Math.min(
        INTRO_TOTAL_DURATION_SEC,
        timelineSec + rawDt * speedBoostRef.current
      );

      const ev = director.evaluate(timelineSec, userNameRef.current);

      // Update environment lighting & sky dome from timeline phase
      envEngine.timeOfDay = ev.timeOfDay;
      envEngine.update(rawDt);
      const atmo = envEngine.state;

      fog.color.copy(atmo.fogColor);
      fog.density = ev.fogDensity;
      (scene.background as THREE.Color).copy(atmo.horizonColor);
      renderer!.toneMappingExposure = atmo.exposure;

      skyDome.uniforms.uTime.value += rawDt;
      skyDome.uniforms.uSunDir.value.copy(atmo.sunDir);
      skyDome.uniforms.uMoonDir.value.copy(atmo.moonDir);
      skyDome.uniforms.uZenithColor.value.copy(atmo.zenithColor);
      skyDome.uniforms.uHorizonColor.value.copy(atmo.horizonColor);
      skyDome.uniforms.uCloudCover.value = THREE.MathUtils.lerp(0.55, 0.28, ev.progress);
      skyDome.uniforms.uCloudDarkness.value = THREE.MathUtils.lerp(0.18, 0.04, ev.progress);
      skyDome.uniforms.uDayFactor.value = atmo.dayFactor;
      skyDome.uniforms.uTwilightFactor.value = atmo.twilightFactor;
      skyDome.uniforms.uNightFactor.value = atmo.nightFactor;
      skyDome.uniforms.uWindSpeed.value = ev.windStrength;

      hemiLight.color.copy(atmo.hemiSkyColor);
      hemiLight.groundColor.copy(atmo.hemiGroundColor);
      hemiLight.intensity = 0.45 + atmo.dayFactor * 0.48 + atmo.twilightFactor * 0.22;

      sunLight.position.copy(atmo.sunDir).multiplyScalar(42);
      sunLight.color.copy(atmo.sunLightColor);
      sunLight.intensity = 0.55 + atmo.dayFactor * 1.45 + atmo.twilightFactor * 0.65;

      // Pavilion stone lantern warm glow
      architecture.lanternLight.intensity = ev.lanternGlow * 2.6;
      architecture.lanternGlassMat.emissiveIntensity = 0.25 + ev.lanternGlow * 2.2;

      // Water uniforms
      if (waterHandle) {
        waterHandle.material.uniforms.time.value += rawDt * 0.42;
        waterHandle.material.uniforms.sunDirection.value.copy(atmo.sunDir);
        waterHandle.material.uniforms.sunColor.value.copy(atmo.sunLightColor);
      } else if (fallbackWaterMat) {
        fallbackWaterMat.uniforms.uTime.value += rawDt;
        fallbackWaterMat.uniforms.uSkyColor.value.copy(atmo.horizonColor);
        fallbackWaterMat.uniforms.uSunDir.value.copy(atmo.sunDir);
      }

      // Sunrise beams & mist
      sunBeams.uniforms.uTime.value += rawDt;
      sunBeams.uniforms.uIntensity.value = ev.godRayIntensity;
      sunBeams.uniforms.uColor.value.copy(atmo.sunLightColor).lerp(_godRayColor, 0.5);

      mistMat.opacity = 0.26 * ev.mistOpacity;
      mistMat.color.copy(atmo.horizonColor).lerp(_godRayColor, 0.18);
      for (const item of mistMeshes) {
        item.mesh.position.x = item.baseX + Math.sin(skyDome.uniforms.uTime.value * 0.18 * item.speed + item.phase) * 3.8;
        item.mesh.lookAt(camera.position.x, item.mesh.position.y, camera.position.z);
      }

      // Update aerodynamic Sakura petals & Ginkgo leaves
      let sIdx = 0;
      let gIdx = 0;
      const tNow = skyDome.uniforms.uTime.value;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        sampleWindField(p.x, p.y, p.z, tNow, ev.windStrength, _windVec);
        const flutter = Math.sin(tNow * 2.6 + p.phase) * (0.28 + ev.windStrength * 0.42);
        p.x += (_windVec.x * 0.55 + flutter * 0.35) * rawDt;
        p.y += (p.vy * (0.8 + ev.windStrength * 0.25) + _windVec.y * 0.3) * rawDt;
        p.z += (_windVec.z * 0.55 + Math.cos(tNow * 2.1 + p.phase) * 0.25) * rawDt;

        p.rx += p.spinX * rawDt * (0.7 + ev.windStrength);
        p.ry += p.spinY * rawDt * (0.7 + ev.windStrength);
        p.rz += p.spinZ * rawDt * (0.7 + ev.windStrength);

        if (p.y < 0.05 || Math.abs(p.x) > 26 || Math.abs(p.z) > 28) {
          p.x = (Math.random() - 0.5) * 40;
          p.y = 8.5 + Math.random() * 8.5;
          p.z = (Math.random() - 0.5) * 42;
        }

        const visScale = p.scale * (0.65 + 0.55 * ev.petalIntensity);
        _dummyPos.set(p.x, p.y, p.z);
        _dummyEuler.set(p.rx, p.ry, p.rz);
        _dummyQuat.setFromEuler(_dummyEuler);
        _dummyScale.setScalar(visScale);
        _dummyMat4.compose(_dummyPos, _dummyQuat, _dummyScale);

        if (p.isGinkgo) {
          ginkgoInst.setMatrixAt(gIdx++, _dummyMat4);
        } else {
          sakuraInst.setMatrixAt(sIdx++, _dummyMat4);
        }
      }
      sakuraInst.instanceMatrix.needsUpdate = true;
      ginkgoInst.instanceMatrix.needsUpdate = true;

      // Subtle damped mouse parallax offset during flythrough
      mouseX += (targetMouseX - mouseX) * Math.min(1, rawDt * 3.5);
      mouseY += (targetMouseY - mouseY) * Math.min(1, rawDt * 3.5);
      const parallaxAmp = 1.0 - ev.fadeOutOverlay;

      camera.position.set(
        ev.cameraPos.x + mouseX * 0.65 * parallaxAmp,
        ev.cameraPos.y - mouseY * 0.35 * parallaxAmp,
        ev.cameraPos.z
      );
      camera.fov = ev.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(ev.lookAt);

      // Update ambient audio & English Voice Over triggers cleanly
      audioRef.current?.updateAtmosphere(ev.windStrength, ev.timeOfDay);
      if (timelineSec >= 2.85 && timelineSec < 6.0) {
        audioRef.current?.speakCueOnce('phase_brand', INTRO_PHASES[1].voLine || '');
      } else if (timelineSec >= 6.45 && timelineSec < 10.2) {
        audioRef.current?.speakCueOnce('phase_welcome', formatPersonalWelcomeVo(userNameRef.current));
      }

      // Render frame via PostPipeline or direct Renderer
      if (postPipeline) {
        _sunProj.copy(atmo.sunDir).multiplyScalar(100).project(camera);
        _sunPos2D.set(_sunProj.x * 0.5 + 0.5, _sunProj.y * 0.5 + 0.5);
        postPipeline.setOptions({
          sunScreenPos: _sunPos2D,
          godRayIntensity: ev.godRayIntensity,
          godRayColor: atmo.sunLightColor,
        });
        postPipeline.render();
      } else {
        renderer!.render(scene, camera);
      }

      // Throttled React HUD sync (~16fps) to avoid layout thrashing
      hudSyncAccum += rawDt;
      if (hudSyncAccum >= 0.06 || ev.phase.id !== lastPhaseId || ev.activeCaption !== lastCaption) {
        hudSyncAccum = 0;
        lastPhaseId = ev.phase.id;
        lastCaption = ev.activeCaption;
        setActivePhaseId(ev.phase.id);
        setBrandOpacity(ev.brandOpacity);
        setWelcomeOpacity(ev.welcomeOpacity);
        setActiveCaption(ev.activeCaption);
        setProgressRatio(ev.progress);
      }

      if (timelineSec >= INTRO_TOTAL_DURATION_SEC && !isDoneRef.current) {
        finishCeremony();
        return;
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('resize', onResize);
      renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      postPipeline?.dispose();
      skyDome.dispose();
      architecture.dispose();
      groves.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      waterGeo.dispose();
      waterHandle?.material?.dispose();
      fallbackWaterMat?.dispose();
      sakuraGeo.dispose();
      ginkgoGeo.dispose();
      sakuraParticleMat.dispose();
      ginkgoParticleMat.dispose();
      mistGeo.dispose();
      mistMat.dispose();
      sunBeams.dispose();
      textures.dispose();
      envRT.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [finishCeremony, webglReady]);

  const userDisplay = currentUser?.displayName || currentUser?.username;
  const activePhaseMeta = INTRO_PHASES.find((p) => p.id === activePhaseId) || INTRO_PHASES[0];

  return (
    <div
      className={`fixed inset-0 z-[250] overflow-hidden select-none transition-opacity duration-700 ease-out bg-gradient-to-b from-[#0b162a] via-[#1b2e4d] to-[#e49a73] ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label={isZh ? 'ONE 入场欢迎仪式' : 'ONE Opening Ceremony'}
    >
      {/* Dedicated WebGL Stage */}
      {webglReady && !contextLost && (
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      )}

      {/* Subtle Cinema Vignette Scrims (solid alpha gradients only — no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />

      {/* Top Precision Timeline Progress Bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[2px] bg-white/15">
        <div
          className="h-full bg-gradient-to-r from-[#C4A876] via-[#f7e7c4] to-[#ffffff] transition-[width] duration-100 ease-linear"
          style={{ width: `${Math.round(progressRatio * 1000) / 10}%` }}
        />
      </div>

      {/* Subtle Unboxed Chapter Indicator */}
      <div className="pointer-events-none fixed left-6 top-6 z-20 flex items-center gap-2.5 text-xs font-medium tracking-[0.14em] text-white/80">
        <span>{isZh ? activePhaseMeta.zhLabel : activePhaseMeta.enLabel}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums text-white/60">
          {Math.round(progressRatio * 100)}%
        </span>
      </div>

      {/* Phase 2: Harmonized Paradise Brand Crest Reveal (User Logo + ONE ORIGIN Ring) */}
      <div
        className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-6 text-center transition-transform duration-700 ease-out"
        style={{
          opacity: brandOpacity,
          transform: `translate3d(0, ${(1 - brandOpacity) * 14}px, 0)`,
        }}
      >
        <div className="mb-5 drop-shadow-[0_14px_38px_rgba(0,0,0,0.45)]">
          <ParadiseBrandEmblem
            surface="garden-night"
            variant="medallion"
            size={88}
          />
        </div>
        <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-semibold tracking-[0.28em] text-[#F7F5F0] drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)]">
          EARTH ONE
        </h1>
        <p className="mt-3 max-w-xl text-balance text-sm sm:text-base font-normal tracking-[0.14em] text-[#EAE4D7] drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)]">
          {isZh ? '同一个世界，无限可能' : 'One World, Infinite Possibilities'}
        </p>
      </div>

      {/* Phase 3: Living Sanctuary Personalized Welcome */}
      <div
        className="pointer-events-none fixed inset-x-0 top-[18%] z-10 flex flex-col items-center px-6 text-center transition-transform duration-700 ease-out"
        style={{
          opacity: welcomeOpacity,
          transform: `translate3d(0, ${(1 - welcomeOpacity) * 12}px, 0)`,
        }}
      >
        <p className="text-xs font-medium tracking-[0.22em] text-[#E6CE9E] drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          {isZh ? '欢迎来到 ONE' : 'WELCOME TO ONE'}
        </p>
        <h2 className="mt-2 max-w-2xl text-balance text-[clamp(1.75rem,3.6vw,2.75rem)] font-medium tracking-wide text-[#faf7f0] drop-shadow-[0_6px_28px_rgba(0,0,0,0.6)]">
          {userDisplay
            ? isZh
              ? `欢迎来到 ONE，${userDisplay}`
              : `Welcome to ONE, ${userDisplay}`
            : isZh
              ? '欢迎来到 ONE'
              : 'Welcome to ONE'}
        </h2>
      </div>

      {/* Synchronized Voice Over Subtitle Line */}
      {activeCaption && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-5">
          <p className="max-w-xl text-balance rounded-2xl border border-white/14 bg-[#111b26]/78 px-4 py-2 text-center text-xs sm:text-sm leading-relaxed text-[#f7f4ec] shadow-lg">
            {activeCaption}
          </p>
        </div>
      )}

      {/* Clean Single-Row Bottom Action Controls matching Paradise World organic shell */}
      <div className="fixed inset-x-0 bottom-5 z-30 flex items-center justify-between px-5 sm:px-8 pointer-events-none">
        <button
          type="button"
          onClick={toggleSound}
          className={`pointer-events-auto inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            soundEnabled
              ? 'border-[#C4A876]/65 bg-[#121c28]/82 text-[#f7f4ec] hover:bg-[#1a2838]'
              : 'border-white/20 bg-[#121c28]/72 text-[#e8e2d5]/85 hover:bg-[#1a2838] hover:text-white'
          }`}
          aria-label={soundEnabled ? 'Mute sound' : 'Enable sound and voice over'}
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-[#d6b77f]" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
          <span>
            {soundEnabled
              ? isZh
                ? '语音与花园声景开启'
                : 'Audio On'
              : isZh
                ? '开启声景与旁白 (M)'
                : 'Enable Audio (M)'}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finishCeremony();
          }}
          className="pointer-events-auto inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#d6b77f]/55 bg-[#f7f3eb]/90 px-5 text-xs sm:text-sm font-semibold text-[#1e2d26] hover:bg-[#ffffff] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_8px_24px_rgba(4,10,16,0.35)]"
        >
          <span>{isZh ? '进入 ONE' : 'Enter ONE'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
