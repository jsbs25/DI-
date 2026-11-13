import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GlobeUserNode, GlobeCountryStat, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { latLngToVector3, createSubtleEarthCloudTexture } from './proceduralEarthTextures.ts';
import {
  earthSurfaceVertexShader,
  earthSurfaceFragmentShader,
  earthCloudVertexShader,
  earthCloudFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  innerAtmosphereVertexShader,
  innerAtmosphereFragmentShader
} from './earthShaders.ts';
import { buildOrbitSystem, buildConnectionArcs, buildStarField } from './sceneBuilders.ts';
import {
  ArrowRight,
  Globe2,
  Orbit,
  Network,
  Volume2,
  VolumeX,
  Sparkles,
  MapPin,
  ExternalLink,
  RotateCw,
  RotateCcw,
  X,
  Radio,
  Navigation,
  Satellite,
  Layers,
  ZoomIn,
  ZoomOut,
  Cloud
} from 'lucide-react';

interface DigitalGlobeProps {
  nodes: GlobeUserNode[];
  countries: GlobeCountryStat[];
  activeCountry: string | null;
  currentUserId?: string;
  focusCoordinates?: { lat: number; lng: number; timestamp?: number } | null;
  onSelectCountry: (countryCode: string | null) => void;
  onSelectUser: (user: GlobeUserNode) => void;
  onSelectTab: (tab: string) => void;
  onExploreUniverse?: () => void;
  onExploreCommunity?: () => void;
  showGlobeTools?: boolean;
  onToggleGlobeTools?: () => void;
  lang: Language;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
}

const EARTH_RADIUS = 4.5;
const INITIAL_ROTATION_X = 0.22;
const INITIAL_ROTATION_Y = -2.05;

export const DigitalGlobe: React.FC<DigitalGlobeProps> = ({
  nodes,
  countries,
  activeCountry,
  currentUserId,
  focusCoordinates,
  onSelectUser,
  onExploreUniverse,
  showGlobeTools = false,
  onToggleGlobeTools,
  lang,
  immersive = false,
  onImmersiveChange
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const t = translations[lang] || translations.zh;
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [showFirstUseHint, setShowFirstUseHint] = useState(() => {
    try {
      return !localStorage.getItem('earth-one-globe-hint-dismissed');
    } catch {
      return true;
    }
  });

  // Camera & layer visibility state
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBeacons, setShowBeacons] = useState(true);
  const [showISS, setShowISS] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GlobeUserNode | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Real-time telemetry states
  const [issData, setIssData] = useState<{
    lat: number;
    lng: number;
    altitudeKm: number;
    velocityKmh: number;
    visibility: string;
    timestamp: number;
  } | null>(null);
  const [earthquakes, setEarthquakes] = useState<Array<{
    id: string;
    title: string;
    mag: number;
    place: string;
    lat: number;
    lng: number;
    depthKm: number;
  }>>([]);

  // Keep latest callbacks/props in refs so the Three.js WebGL context initializes once
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const earthquakesRef = useRef(earthquakes);
  earthquakesRef.current = earthquakes;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const onSelectUserRef = useRef(onSelectUser);
  onSelectUserRef.current = onSelectUser;

  // Mutable Three.js loop state
  const stateRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    controls: null as OrbitControls | null,
    composer: null as EffectComposer | null,
    earthGroup: null as THREE.Group | null,
    cloudMesh: null as THREE.Mesh | null,
    orbitSystem: null as { update: (elapsed: number) => void; dispose: () => void } | null,
    connectionArcs: null as { update: (elapsed: number) => void; dispose: () => void } | null,
    beaconGroup: null as THREE.Group | null,
    issGroup: null as THREE.Group | null,
    earthquakeGroup: null as THREE.Group | null,
    interactiveMeshes: [] as { mesh: THREE.Object3D; data: GlobeUserNode }[],
    autoRotate: true,
    showBeacons: true,
    showISS: true,
    showEarthquakes: true,
    showClouds: true,
    reducedMotion: false,
    targetSphericalRotation: null as { x: number; y: number } | null,
    targetCameraDistance: null as number | null,
    isNarrow: false,
    frameId: 0
  });

  // Respect prefers-reduced-motion dynamically
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      stateRef.current.reducedMotion = mq.matches;
      if (mq.matches) {
        setAutoRotate(false);
        stateRef.current.autoRotate = false;
      }
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (immersive) {
      setAutoRotate(false);
      stateRef.current.autoRotate = false;
    }
  }, [immersive]);

  useEffect(() => {
    stateRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    stateRef.current.showBeacons = showBeacons;
    if (stateRef.current.beaconGroup) {
      stateRef.current.beaconGroup.visible = showBeacons;
    }
  }, [showBeacons]);

  useEffect(() => {
    stateRef.current.showISS = showISS;
    if (stateRef.current.issGroup) {
      stateRef.current.issGroup.visible = showISS;
    }
  }, [showISS]);

  useEffect(() => {
    stateRef.current.showEarthquakes = showEarthquakes;
    if (stateRef.current.earthquakeGroup) {
      stateRef.current.earthquakeGroup.visible = showEarthquakes;
    }
  }, [showEarthquakes]);

  useEffect(() => {
    stateRef.current.showClouds = showClouds;
    if (stateRef.current.cloudMesh) {
      stateRef.current.cloudMesh.visible = showClouds;
    }
  }, [showClouds]);

  // Real-time telemetry fetching (ISS orbit & USGS earthquakes)
  useEffect(() => {
    let isMounted = true;

    const fetchISS = async () => {
      try {
        const res = await fetch('/api/telemetry/iss');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data && typeof data.lat === 'number') {
          setIssData(data);
        }
      } catch {
        // silent network fallback
      }
    };

    const fetchEarthquakes = async () => {
      try {
        const res = await fetch('/api/telemetry/earthquakes');
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data.earthquakes)
          ? data.earthquakes
          : Array.isArray(data.features)
          ? data.features
          : [];
        if (isMounted && list.length > 0) {
          setEarthquakes(list.slice(0, 12));
        }
      } catch {
        // silent network fallback
      }
    };

    fetchISS();
    fetchEarthquakes();

    const issInterval = setInterval(fetchISS, 5000);
    const eqInterval = setInterval(fetchEarthquakes, 60000);

    return () => {
      isMounted = false;
      clearInterval(issInterval);
      clearInterval(eqInterval);
    };
  }, []);

  // Update ISS position in 3D scene when telemetry updates
  useEffect(() => {
    if (!issData || !stateRef.current.issGroup) return;
    const pos = latLngToVector3(issData.lat, issData.lng, EARTH_RADIUS * 1.09);
    stateRef.current.issGroup.position.copy(pos);
    stateRef.current.issGroup.lookAt(0, 0, 0);
  }, [issData]);

  // Incrementally sync citizen beacons when nodes or user ID changes (without rebuilding WebGLRenderer)
  const syncBeacons = useCallback((beaconList: GlobeUserNode[], activeUserId?: string) => {
    const group = stateRef.current.beaconGroup;
    if (!group) return;

    // Dispose prior beacon resources cleanly
    group.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
        else mesh.material.dispose();
      }
    });
    group.clear();

    const upVec = new THREE.Vector3(0, 1, 0);
    const interactiveMeshes: { mesh: THREE.Object3D; data: GlobeUserNode }[] = [];

    beaconList.forEach(node => {
      const isMe = Boolean(activeUserId && node.userId === activeUserId);
      const pos = latLngToVector3(node.lat, node.lng, EARTH_RADIUS * 1.014);
      const normal = pos.clone().normalize();

      const singleBeacon = new THREE.Group();
      singleBeacon.position.copy(pos);
      singleBeacon.quaternion.setFromUnitVectors(upVec, normal);

      const auraGeo = new THREE.RingGeometry(0.04, isMe ? 0.2 : 0.13, 24);
      const auraMat = new THREE.MeshBasicMaterial({
        color: isMe ? 0x10b981 : 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.rotation.x = Math.PI / 2;
      singleBeacon.add(auraMesh);

      const pearlGeo = new THREE.SphereGeometry(isMe ? 0.11 : 0.072, 16, 16);
      const pearlMat = new THREE.MeshStandardMaterial({
        color: isMe ? 0x34d399 : 0x38bdf8,
        emissive: isMe ? 0x059669 : 0x0284c7,
        emissiveIntensity: 1.65
      });
      const pearlMesh = new THREE.Mesh(pearlGeo, pearlMat);
      pearlMesh.position.y = 0.09;
      singleBeacon.add(pearlMesh);

      group.add(singleBeacon);
      interactiveMeshes.push({ mesh: pearlMesh, data: node });
    });

    stateRef.current.interactiveMeshes = interactiveMeshes;
  }, []);

  useEffect(() => {
    syncBeacons(nodes, currentUserId);
  }, [nodes, currentUserId, syncBeacons]);

  // Incrementally sync USGS Earthquake markers in 3D scene
  const syncEarthquakes = useCallback((quakeList: typeof earthquakes) => {
    const group = stateRef.current.earthquakeGroup;
    if (!group) return;

    group.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
        else mesh.material.dispose();
      }
    });
    group.clear();

    const upVec = new THREE.Vector3(0, 1, 0);
    quakeList.forEach((quake, idx) => {
      const pos = latLngToVector3(quake.lat, quake.lng, EARTH_RADIUS * 1.008);
      const normal = pos.clone().normalize();
      const qGroup = new THREE.Group();
      qGroup.position.copy(pos);
      qGroup.quaternion.setFromUnitVectors(upVec, normal);

      const magColor = quake.mag >= 5.5 ? 0xef4444 : quake.mag >= 4.5 ? 0xf59e0b : 0x38bdf8;
      const ringRadius = 0.048 + Math.min(quake.mag * 0.012, 0.11);

      const ringGeo = new THREE.RingGeometry(ringRadius * 0.72, ringRadius, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: magColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      qGroup.add(ring);

      const dotGeo = new THREE.SphereGeometry(0.022, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: magColor });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.y = 0.014;
      qGroup.add(dot);

      qGroup.userData = { pulseOffset: idx * 0.8 };
      group.add(qGroup);
    });
  }, []);

  useEffect(() => {
    syncEarthquakes(earthquakes);
  }, [earthquakes, syncEarthquakes]);

  // Smoothly rotate Earth toward target geographic coordinates (lat/lng)
  const flyToCoordinates = useCallback((lat: number, lng: number) => {
    if (!stateRef.current.earthGroup) return;
    setAutoRotate(false);
    stateRef.current.autoRotate = false;

    const targetY = -((lng + 90) * (Math.PI / 180));
    const targetX = THREE.MathUtils.clamp(lat * (Math.PI / 180), -Math.PI * 0.42, Math.PI * 0.42);

    stateRef.current.targetSphericalRotation = { x: targetX, y: targetY };
  }, []);

  const zoomCameraBy = useCallback((deltaRatio: number) => {
    const cam = stateRef.current.camera;
    const ctrl = stateRef.current.controls;
    if (!cam || !ctrl) return;
    const currentDist = cam.position.distanceTo(ctrl.target);
    const nextDist = THREE.MathUtils.clamp(currentDist * deltaRatio, 6.6, 28.0);
    stateRef.current.targetCameraDistance = nextDist;
  }, []);

  const resetGlobeView = useCallback(() => {
    const isNarrow = stateRef.current.isNarrow;
    stateRef.current.targetCameraDistance = isNarrow ? 23.6 : 15.6;
    stateRef.current.targetSphericalRotation = { x: INITIAL_ROTATION_X, y: INITIAL_ROTATION_Y };
  }, []);

  useEffect(() => {
    if (activeCountry) {
      const match = countries.find(c => c.code.toLowerCase() === activeCountry.toLowerCase());
      if (match) flyToCoordinates(match.lat, match.lng);
    }
  }, [activeCountry, countries, flyToCoordinates]);

  useEffect(() => {
    if (focusCoordinates) {
      flyToCoordinates(focusCoordinates.lat, focusCoordinates.lng);
    }
  }, [focusCoordinates, flyToCoordinates]);

  // Overview <-> Immersive: fade UI HUD cleanly, keep full 3D globe interaction + clear exit control.
  const handleToggleExplore = () => {
    const next = !immersive;
    if (next) {
      setAutoRotate(false);
      stateRef.current.autoRotate = false;
      stateRef.current.targetCameraDistance = stateRef.current.isNarrow ? 21.5 : 14.4;
      onImmersiveChange?.(true);
    } else {
      stateRef.current.targetSphericalRotation = null;
      stateRef.current.targetCameraDistance = stateRef.current.isNarrow ? 23.6 : 15.6;
      if (!stateRef.current.reducedMotion) {
        setAutoRotate(true);
        stateRef.current.autoRotate = true;
      }
      onImmersiveChange?.(false);
    }
  };

  // Expose lightweight telemetry handle on container for automated runtime diagnostics
  useEffect(() => {
    const el = mountRef.current as (HTMLDivElement & { __globeDebug?: any }) | null;
    if (!el) return;
    el.__globeDebug = {
      flyTo: (lat: number, lng: number) => flyToCoordinates(lat, lng),
      zoomBy: (ratio: number) => zoomCameraBy(ratio),
      resetView: () => resetGlobeView(),
      getMetrics: () => {
        const cam = stateRef.current.camera;
        const ctrl = stateRef.current.controls;
        const eg = stateRef.current.earthGroup;
        return {
          cameraDistance: cam && ctrl ? Number(cam.position.distanceTo(ctrl.target).toFixed(4)) : null,
          earthRotation: eg ? { x: Number(eg.rotation.x.toFixed(4)), y: Number(eg.rotation.y.toFixed(4)) } : null,
          showISS: stateRef.current.issGroup?.visible ?? null,
          showBeacons: stateRef.current.beaconGroup?.visible ?? null,
          showEarthquakes: stateRef.current.earthquakeGroup?.visible ?? null,
          showClouds: stateRef.current.cloudMesh?.visible ?? null,
          beaconCount: stateRef.current.beaconGroup?.children.length ?? 0,
          earthquakeCount: stateRef.current.earthquakeGroup?.children.length ?? 0
        };
      }
    };
  }, [flyToCoordinates, zoomCameraBy, resetGlobeView]);

  // MAIN THREE.JS LIVE 3D WEBGL ENGINE (initialized once on mount)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect GPU capabilities & environment
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 2. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010308);
    stateRef.current.scene = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const isNarrow = width < 768;
    stateRef.current.isNarrow = isNarrow;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1500);
    camera.position.set(0, 0, isNarrow ? 23.6 : 15.6);
    stateRef.current.camera = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance'
      });
      setWebglUnavailable(false);
    } catch (error) {
      console.warn('WebGL is unavailable; showing the static Earth preview instead.', error);
      setWebglUnavailable(true);
      return;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    stateRef.current.renderer = renderer;

    // 3. DEEP SPACE BACKDROP — optical pinpoint stars
    const starCount = isSoftwareGl ? 600 : 1600;
    const starField = buildStarField(starCount);
    scene.add(starField);

    // 4. LIGHTING
    const sunDirection = new THREE.Vector3(-0.62, 0.32, 0.72).normalize();
    const ambientLight = new THREE.AmbientLight(0x283850, 0.68);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xfff8ee, 1.35);
    directionalLight.position.copy(sunDirection).multiplyScalar(30);
    scene.add(directionalLight);

    // 5. CENTRAL EARTH SYSTEM
    const earthGroup = new THREE.Group();
    earthGroup.position.set(isNarrow ? 0 : 1.1, isNarrow ? -0.78 : 0.02, 0);
    earthGroup.rotation.set(INITIAL_ROTATION_X, INITIAL_ROTATION_Y, 0);
    scene.add(earthGroup);
    stateRef.current.earthGroup = earthGroup;

    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (url: string, fallbackColor: number) => {
      const tex = textureLoader.load(
        url,
        undefined,
        undefined,
        () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = `#${fallbackColor.toString(16).padStart(6, '0')}`;
          ctx.fillRect(0, 0, 1, 1);
          tex.image = canvas as unknown as HTMLImageElement;
          tex.needsUpdate = true;
        }
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = isSoftwareGl ? 1 : 8;
      return tex;
    };

    const dayTexture = loadTexture('/assets/earth/earth_day_2048.jpg', 0x0a1a3a);
    const nightTexture = loadTexture('/assets/earth/earth_night_2048.jpg', 0x020408);
    const normalTexture = loadTexture('/assets/earth/earth_normal_2048.jpg', 0x808080);

    const segs = isSoftwareGl ? 64 : 128;
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, segs, segs);
    const earthMat = new THREE.ShaderMaterial({
      vertexShader: earthSurfaceVertexShader,
      fragmentShader: earthSurfaceFragmentShader,
      uniforms: {
        uDayMap: { value: dayTexture },
        uNightMap: { value: nightTexture },
        uNormalMap: { value: normalTexture },
        uSunDirection: { value: sunDirection },
        uDayIntensity: { value: 0.98 },
        uNightIntensity: { value: 1.05 },
        uNormalStrength: { value: 0.38 }
      }
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // 5.15 Seamless Dynamic Procedural Cloud Layer
    const cloudTexture = createSubtleEarthCloudTexture(isSoftwareGl ? 512 : 1024, isSoftwareGl ? 256 : 512);
    const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.011, isSoftwareGl ? 48 : 96, isSoftwareGl ? 48 : 96);
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: earthCloudVertexShader,
      fragmentShader: earthCloudFragmentShader,
      uniforms: {
        uCloudMap: { value: cloudTexture },
        uSunDirection: { value: sunDirection },
        uCloudOpacity: { value: 0.42 }
      },
      transparent: true,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.visible = stateRef.current.showClouds;
    earthGroup.add(cloudMesh);
    stateRef.current.cloudMesh = cloudMesh;

    // 5.2 Sun-Aware Atmospheric Fresnel Scattering (outer + inner layers)
    const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.042, 80, 80);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uSunDirection: { value: sunDirection }
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    const innerAtmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.007, 64, 64);
    const innerAtmoMat = new THREE.ShaderMaterial({
      vertexShader: innerAtmosphereVertexShader,
      fragmentShader: innerAtmosphereFragmentShader,
      uniforms: {
        uSunDirection: { value: sunDirection }
      },
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(innerAtmoGeo, innerAtmoMat));

    // 5.3 Orbital hairlines + global connection arcs
    const orbitSystem = buildOrbitSystem(EARTH_RADIUS);
    scene.add(orbitSystem.group);
    stateRef.current.orbitSystem = orbitSystem;

    const connectionArcs = buildConnectionArcs(EARTH_RADIUS);
    earthGroup.add(connectionArcs.group);
    stateRef.current.connectionArcs = connectionArcs;

    // 5.4 Human Citizen Beacons
    const beaconGroup = new THREE.Group();
    earthGroup.add(beaconGroup);
    beaconGroup.visible = stateRef.current.showBeacons;
    stateRef.current.beaconGroup = beaconGroup;
    syncBeacons(nodesRef.current, currentUserIdRef.current);

    // 5.5 ISS (International Space Station) 3D Model
    const issGroup = new THREE.Group();
    const issCoreGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.30, 12);
    const issCoreMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.25
    });
    const issCore = new THREE.Mesh(issCoreGeo, issCoreMat);
    issCore.rotation.z = Math.PI / 2;
    issGroup.add(issCore);

    const panelGeo = new THREE.BoxGeometry(0.32, 0.01, 0.11);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      metalness: 0.75,
      roughness: 0.3
    });
    const panel1 = new THREE.Mesh(panelGeo, panelMat);
    panel1.position.set(0.22, 0, 0);
    issGroup.add(panel1);

    const panel2 = new THREE.Mesh(panelGeo, panelMat);
    panel2.position.set(-0.22, 0, 0);
    issGroup.add(panel2);

    const beaconRingGeo = new THREE.RingGeometry(0.16, 0.20, 32);
    const beaconRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82
    });
    const issBeaconRing = new THREE.Mesh(beaconRingGeo, beaconRingMat);
    issGroup.add(issBeaconRing);

    issGroup.position.copy(latLngToVector3(0, 0, EARTH_RADIUS * 1.09));
    earthGroup.add(issGroup);
    issGroup.visible = stateRef.current.showISS;
    stateRef.current.issGroup = issGroup;

    // 5.6 Real-Time USGS Earthquakes Layer
    const earthquakeGroup = new THREE.Group();
    earthGroup.add(earthquakeGroup);
    earthquakeGroup.visible = stateRef.current.showEarthquakes;
    stateRef.current.earthquakeGroup = earthquakeGroup;
    syncEarthquakes(earthquakesRef.current);

    // 6. ORBIT CONTROLS — smooth zoom + damped rotation + non-fighting drag
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.zoomSpeed = 0.75;
    controls.minDistance = 6.6;
    controls.maxDistance = 28.0;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.45;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.autoRotate = false;
    controls.target.set(isNarrow ? 0 : 1.1, isNarrow ? -0.78 : 0.02, 0);
    stateRef.current.controls = controls;

    const onControlStart = () => {
      // Cancel any scripted flight or zoom animation immediately when user interacts
      stateRef.current.targetSphericalRotation = null;
      stateRef.current.targetCameraDistance = null;
    };
    controls.addEventListener('start', onControlStart);

    // 7. RESTRAINED POST-PROCESSING (only subtle glow on bright night highlights; skipped on software WebGL)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      isSoftwareGl ? 0.0 : 0.16,
      0.45,
      0.90
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    stateRef.current.composer = composer;

    // 8. RAYCASTING & POINTER INTERACTION (preallocated math objects)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tmpCameraDir = new THREE.Vector3();

    const findIntersectedBeacon = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidateObjects = stateRef.current.interactiveMeshes.map(m => m.mesh);
      if (candidateObjects.length === 0) return null;
      const intersects = raycaster.intersectObjects(candidateObjects, false);
      if (intersects.length === 0) return null;
      return stateRef.current.interactiveMeshes.find(item => item.mesh === intersects[0].object) || null;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      if (cx === undefined || cy === undefined) return;

      const found = findIntersectedBeacon(cx, cy);
      if (found) {
        setHoveredNode(found.data);
        setHoverPosition({ x: cx, y: cy });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredNode(null);
        setHoverPosition(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onClick = (e: MouseEvent) => {
      const found = findIntersectedBeacon(e.clientX, e.clientY);
      if (found) {
        flyToCoordinates(found.data.lat, found.data.lng);
        onSelectUserRef.current(found.data);
      }
    };

    const dom = renderer.domElement;
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    dom.addEventListener('click', onClick);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(stateRef.current.frameId);
      setWebglUnavailable(true);
    };
    const onContextRestored = () => {
      setWebglUnavailable(false);
    };
    dom.addEventListener('webglcontextlost', onContextLost);
    dom.addEventListener('webglcontextrestored', onContextRestored);

    // Responsive resize
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const nowNarrow = w < 768;
      stateRef.current.isNarrow = nowNarrow;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);

      earthGroup.position.set(nowNarrow ? 0 : 1.1, nowNarrow ? -0.78 : 0.02, 0);
      controls.target.set(nowNarrow ? 0 : 1.1, nowNarrow ? -0.78 : 0.02, 0);
    };
    window.addEventListener('resize', onResize);

    // Pause rendering when tab hidden
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(stateRef.current.frameId);
      } else {
        clock.getDelta();
        animate();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 9. ANIMATION LOOP
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Smooth imperative zoom distance animation
      if (stateRef.current.targetCameraDistance !== null) {
        tmpCameraDir.subVectors(camera.position, controls.target);
        const curDist = tmpCameraDir.length();
        const nextDist = THREE.MathUtils.damp(curDist, stateRef.current.targetCameraDistance, 6.0, delta);
        if (Math.abs(nextDist - stateRef.current.targetCameraDistance) < 0.01) {
          tmpCameraDir.setLength(stateRef.current.targetCameraDistance);
          stateRef.current.targetCameraDistance = null;
        } else {
          tmpCameraDir.setLength(nextDist);
        }
        camera.position.copy(controls.target).add(tmpCameraDir);
      }

      controls.update();

      // Earth smooth flight or natural slow axial rotation
      if (stateRef.current.earthGroup) {
        if (stateRef.current.targetSphericalRotation) {
          stateRef.current.earthGroup.rotation.y = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.y,
            stateRef.current.targetSphericalRotation.y,
            3.2,
            delta
          );
          stateRef.current.earthGroup.rotation.x = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.x,
            stateRef.current.targetSphericalRotation.x,
            3.2,
            delta
          );
          if (
            Math.abs(stateRef.current.earthGroup.rotation.y - stateRef.current.targetSphericalRotation.y) < 0.002 &&
            Math.abs(stateRef.current.earthGroup.rotation.x - stateRef.current.targetSphericalRotation.x) < 0.002
          ) {
            stateRef.current.targetSphericalRotation = null;
          }
        } else if (stateRef.current.autoRotate && !stateRef.current.reducedMotion) {
          stateRef.current.earthGroup.rotation.y += delta * 0.045;
        }
      }

      // Gentle independent cloud drift
      if (stateRef.current.cloudMesh && stateRef.current.cloudMesh.visible && !stateRef.current.reducedMotion) {
        stateRef.current.cloudMesh.rotation.y += delta * 0.012;
      }

      // Orbit rings & arcs
      if (!stateRef.current.reducedMotion) {
        stateRef.current.orbitSystem?.update(elapsed);
        stateRef.current.connectionArcs?.update(elapsed);
      }

      // Earthquake ring pulsations
      if (stateRef.current.earthquakeGroup?.visible && !stateRef.current.reducedMotion) {
        stateRef.current.earthquakeGroup.children.forEach(child => {
          const offset = (child.userData as { pulseOffset?: number })?.pulseOffset || 0;
          const scale = 1 + 0.18 * Math.sin(elapsed * 3.0 + offset);
          child.scale.set(scale, scale, scale);
        });
      }

      // ISS beacon ring pulsation
      if (stateRef.current.issGroup?.visible && !stateRef.current.reducedMotion) {
        const ring = stateRef.current.issGroup.children[3];
        if (ring) {
          const s = 1 + 0.15 * Math.sin(elapsed * 2.8);
          ring.scale.set(s, s, s);
        }
      }

      composer.render();
      stateRef.current.frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(stateRef.current.frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('webglcontextlost', onContextLost);
      dom.removeEventListener('webglcontextrestored', onContextRestored);
      controls.removeEventListener('start', onControlStart);

      orbitSystem.dispose();
      connectionArcs.dispose();
      (starField.userData.dispose as (() => void) | undefined)?.();

      earthGeo.dispose();
      earthMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      innerAtmoGeo.dispose();
      innerAtmoMat.dispose();
      issCoreGeo.dispose();
      issCoreMat.dispose();
      panelGeo.dispose();
      panelMat.dispose();
      beaconRingGeo.dispose();
      beaconRingMat.dispose();

      dayTexture.dispose();
      nightTexture.dispose();
      normalTexture.dispose();
      cloudTexture.dispose();

      controls.dispose();
      composer.dispose();
      renderer.dispose();
      if (container.contains(dom)) container.removeChild(dom);
    };
  }, [flyToCoordinates, syncBeacons, syncEarthquakes]);

  const latestQuake = earthquakes[0];

  return (
    <div className="relative w-full h-full min-h-[calc(100svh-7rem)] md:min-h-[calc(100vh-4rem)] flex-1 overflow-x-clip bg-[#010308] select-none md:overflow-hidden">
      {/* 1. LIVE THREE.JS 3D WEBGL ENGINE */}
      <div
        ref={mountRef}
        id="earth-engine-canvas"
        className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
      />
      {webglUnavailable && (
        <div
          className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-[#010308]"
          role="img"
          aria-label="Static Earth preview; WebGL is unavailable"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(10,35,82,.32),transparent_55%),radial-gradient(circle_at_18%_22%,#fff_0_1px,transparent_1.5px),radial-gradient(circle_at_76%_18%,#bfdbfe_0_1px,transparent_1.5px),radial-gradient(circle_at_86%_68%,#fff_0_1px,transparent_1.5px)]" />
          <div
            className="relative h-[58vw] w-[58vw] max-h-[48vh] max-w-[48vh] overflow-hidden rounded-full border border-blue-300/50 shadow-[0_0_64px_10px_rgba(37,99,235,.28)] md:h-[52vh] md:w-[52vh]"
            style={{ backgroundImage: 'url(/assets/earth/earth_day_2048.jpg)', backgroundSize: 'auto 100%', backgroundPosition: '45% center' }}
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(191,219,254,.25),transparent_22%),radial-gradient(circle_at_52%_54%,transparent_42%,rgba(1,5,18,.58)_76%,#010308_100%)]" />
            <div className="absolute -inset-[12%] rounded-full border border-blue-300/20 rotate-[-22deg]" />
            <div className="absolute inset-0 rounded-full shadow-[inset_-18px_-4px_44px_rgba(0,0,0,.74),inset_6px_0_24px_rgba(147,197,253,.22)]" />
          </div>
        </div>
      )}

      {/* 2. RESTRAINED HERO & LAYER DISCLOSURE OVERLAY */}
      <div
        className={`relative z-10 h-full min-h-[100dvh] max-w-[1680px] mx-auto px-5 sm:px-8 md:pl-28 lg:pl-32 flex flex-col justify-start md:justify-between pt-20 sm:pt-24 pb-20 md:pb-8 pointer-events-none transition-opacity duration-500 ${
          immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Top-left Hero Title & Essential Actions */}
        <div
          className={`max-w-lg pointer-events-auto transition-all duration-500 ${
            immersive ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-slate-300 text-xs font-medium mb-3">
            <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t.appName}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{t.tagline}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-sans font-semibold text-white tracking-tight leading-[1.06]">
            {t.appName}
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-300/80 leading-relaxed font-sans max-w-md">
            {t.motto}
          </p>

          {showFirstUseHint && (
            <div className="mt-4 flex max-w-md items-start gap-2.5 rounded-2xl border border-white/10 bg-slate-950/75 px-3.5 py-3 text-xs leading-relaxed text-slate-200">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <p className="flex-1 text-slate-300">{t.firstUseHint}</p>
              <button
                type="button"
                onClick={() => {
                  setShowFirstUseHint(false);
                  try { localStorage.setItem('earth-one-globe-hint-dismissed', '1'); } catch {}
                }}
                className="rounded-md p-0.5 text-slate-500 hover:bg-white/5 hover:text-white"
                aria-label={t.dismissFirstUseHint}
                title={t.dismissFirstUseHint}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Primary Actions: Explore Space + Toggle Data/Controls */}
          <div className="mt-5 sm:mt-7 flex flex-wrap items-center gap-2.5">
            <button
              onClick={onExploreUniverse}
              className="inline-flex items-center space-x-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white text-slate-950 font-semibold text-sm shadow-lg shadow-black/25 cursor-pointer transition-all hover:bg-slate-100 hover:-translate-y-px active:translate-y-0 group"
            >
              <span>{t.startExploring}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            {onToggleGlobeTools && (
              <button
                type="button"
                data-globe-tools-toggle="true"
                onClick={onToggleGlobeTools}
                aria-expanded={showGlobeTools}
                className="inline-flex items-center space-x-2 px-4 py-2.5 sm:py-3 rounded-full border border-white/15 bg-slate-950/70 text-slate-200 text-sm font-medium transition-all hover:bg-slate-900/90 cursor-pointer"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>{showGlobeTools ? t.hideGlobeTools : t.showGlobeTools}</span>
              </button>
            )}

            <button
              type="button"
              data-globe-immersive-toggle="true"
              onClick={handleToggleExplore}
              aria-pressed={immersive}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 sm:py-3 rounded-full border border-white/10 bg-slate-950/55 text-slate-300 text-sm font-medium transition-all hover:bg-slate-900/90 hover:text-white cursor-pointer"
              title={t.inspectEarth || 'Explore'}
            >
              <Orbit className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">{lang === 'zh' ? '沉浸观察' : 'Immersive'}</span>
            </button>
          </div>

          {/* Statistics Panel (On-demand) */}
          <div
            id="globe-statistics-panel"
            style={{ display: showGlobeTools ? undefined : 'none' }}
            className="grid grid-cols-3 gap-2 mt-4 max-w-sm"
          >
            <div className="px-3 py-2.5 rounded-xl border border-white/10 bg-slate-950/75">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t.onlineUsers}</div>
              <div className="text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-100 mt-0.5">
                {nodes.length > 0 ? nodes.length.toLocaleString() : '1,280'}
              </div>
            </div>
            <div className="px-3 py-2.5 rounded-xl border border-white/10 bg-slate-950/75">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t.activeNodes}</div>
              <div className="text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-100 mt-0.5">
                {countries.length > 0 ? countries.length : '196'}
              </div>
            </div>
            <div className="px-3 py-2.5 rounded-xl border border-white/10 bg-slate-950/75">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t.registeredCitizens}</div>
              <div className="text-sm sm:text-base font-semibold font-mono tabular-nums text-slate-100 mt-0.5">
                368,420
              </div>
            </div>
          </div>
        </div>

        {/* Mobile quick controls (visible when tools opened) */}
        <div
          id="globe-mobile-controls"
          style={{ display: showGlobeTools ? undefined : 'none' }}
          className={`mt-3 flex flex-wrap items-center gap-1.5 pointer-events-auto md:hidden transition-opacity ${
            immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          aria-label={t.globeControls}
        >
          <button onClick={() => zoomCameraBy(0.84)} className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 text-slate-200" aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => zoomCameraBy(1.18)} className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 text-slate-200" aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={resetGlobeView} className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 text-slate-200" aria-label={t.resetView}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowBeacons(!showBeacons)} className={`rounded-xl border border-white/10 bg-slate-950/75 p-2.5 ${showBeacons ? 'text-cyan-300' : 'text-slate-500'}`} aria-label={t.toggleBeacons}>
            <Network className="h-4 w-4" />
          </button>
          <button onClick={() => setShowClouds(!showClouds)} className={`rounded-xl border border-white/10 bg-slate-950/75 p-2.5 ${showClouds ? 'text-sky-300' : 'text-slate-500'}`} aria-label="Clouds">
            <Cloud className="h-4 w-4" />
          </button>
          <button onClick={() => setAutoRotate(!autoRotate)} className={`rounded-xl border border-white/10 bg-slate-950/75 p-2.5 ${autoRotate ? 'text-cyan-300' : 'text-slate-500'}`} aria-label={t.autoRotation}>
            <RotateCw className="h-4 w-4" />
          </button>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 text-slate-300" aria-label={soundEnabled ? t.mute : t.playCosmicSound}>
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>

        <div className="h-[34vh] shrink-0 md:hidden" aria-hidden="true" />

        {/* Bottom Telemetry Dock (On-demand) */}
        <div className={`w-full flex justify-center pointer-events-auto pt-4 sm:pt-6 transition-opacity duration-500 ${immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div
            id="globe-telemetry-panel"
            style={{ display: showGlobeTools ? undefined : 'none' }}
            className="w-full max-w-4xl px-3.5 py-2.5 rounded-2xl border border-white/10 bg-slate-950/80 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs"
          >
            {/* 1. ISS Live Telemetry */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-cyan-400 shrink-0">
                <Satellite className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-100 text-xs">{t.issTracker || '国际空间站实时遥测'}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-slate-400 font-mono text-[9px] border border-white/[0.06]">
                    NORAD 25544
                  </span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-400 flex items-center space-x-2 mt-0.5">
                  <span>{issData ? `${issData.lat.toFixed(1)}°, ${issData.lng.toFixed(1)}°` : '0.0°, 0.0°'}</span>
                  <span>·</span>
                  <span>{issData ? `${issData.altitudeKm.toFixed(0)} km` : '420 km'}</span>
                </div>
              </div>

              <button
                type="button"
                data-focus-iss="true"
                onClick={() => {
                  if (issData) {
                    flyToCoordinates(issData.lat, issData.lng);
                  }
                }}
                className="ml-auto lg:ml-2 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title={t.flyToIss || 'Focus ISS'}
              >
                <Navigation className="w-3 h-3 text-cyan-400" />
                <span>{lang === 'zh' ? '锁定' : 'Focus'}</span>
              </button>
            </div>

            <div className="hidden lg:block h-6 w-px bg-white/[0.08]" />

            {/* 2. Seismic Monitor (USGS) */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto text-slate-400 text-[11px]">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-amber-400/90 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-200">{t.seismicMonitor || '全球地震带实时监测'}</div>
                <div className="font-mono tabular-nums text-slate-400 text-[10px] mt-0.5 truncate max-w-[200px]">
                  {latestQuake
                    ? `M${latestQuake.mag.toFixed(1)} · ${latestQuake.place} (${earthquakes.length})`
                    : `${earthquakes.length} ${lang === 'zh' ? '处活跃震源' : 'events'}`}
                </div>
              </div>
              {latestQuake && (
                <button
                  type="button"
                  data-focus-quake="true"
                  onClick={() => flyToCoordinates(latestQuake.lat, latestQuake.lng)}
                  className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-amber-200 text-[11px] font-medium transition-colors cursor-pointer"
                  title={latestQuake.title}
                >
                  {lang === 'zh' ? '定位震源' : 'Locate'}
                </button>
              )}
            </div>

            <div className="hidden lg:block h-6 w-px bg-white/[0.08]" />

            {/* 3. Quick Layer Toggles */}
            <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto justify-end">
              <button
                type="button"
                data-toggle-layer="iss"
                aria-pressed={showISS}
                onClick={() => setShowISS(!showISS)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showISS ? 'bg-[rgba(78,161,255,0.14)] border-[rgba(78,161,255,0.3)] text-cyan-200' : 'bg-transparent border-white/[0.08] text-slate-500 hover:text-slate-300'
                }`}
              >
                {lang === 'zh' ? '空间站' : 'ISS'}
              </button>
              <button
                type="button"
                data-toggle-layer="seismic"
                aria-pressed={showEarthquakes}
                onClick={() => setShowEarthquakes(!showEarthquakes)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showEarthquakes ? 'bg-[rgba(245,158,11,0.14)] border-[rgba(245,158,11,0.3)] text-amber-200' : 'bg-transparent border-white/[0.08] text-slate-500 hover:text-slate-300'
                }`}
              >
                {lang === 'zh' ? '地震带' : 'Seismic'}
              </button>
              <button
                type="button"
                data-toggle-layer="beacons"
                aria-pressed={showBeacons}
                onClick={() => setShowBeacons(!showBeacons)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showBeacons ? 'bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.28)] text-emerald-200' : 'bg-transparent border-white/[0.08] text-slate-500 hover:text-slate-300'
                }`}
              >
                {lang === 'zh' ? '信标' : 'Beacons'}
              </button>
              <button
                type="button"
                data-toggle-layer="clouds"
                aria-pressed={showClouds}
                onClick={() => setShowClouds(!showClouds)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showClouds ? 'bg-white/[0.08] border-white/20 text-slate-100' : 'bg-transparent border-white/[0.08] text-slate-500 hover:text-slate-300'
                }`}
              >
                {lang === 'zh' ? '云层' : 'Clouds'}
              </button>
              <button
                type="button"
                data-toggle-layer="rotate"
                aria-pressed={autoRotate}
                onClick={() => setAutoRotate(!autoRotate)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  autoRotate ? 'bg-white/[0.08] border-white/20 text-slate-100' : 'bg-transparent border-white/[0.08] text-slate-500 hover:text-slate-300'
                }`}
              >
                {lang === 'zh' ? '自转' : 'Rotate'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. RIGHT FLOATING VERTICAL ACTION RAIL (Desktop, on-demand when tools expanded) */}
      <aside
        id="globe-controls-rail"
        style={{ display: showGlobeTools && !immersive ? undefined : 'none' }}
        className="hidden md:flex fixed right-5 top-1/2 -translate-y-1/2 z-20 flex-col space-y-2 pointer-events-auto"
      >
        <div className="p-1.5 rounded-2xl border border-white/10 bg-slate-950/75 shadow-lg flex flex-col gap-1 text-slate-400">
          <button
            type="button"
            onClick={() => zoomCameraBy(0.84)}
            className="p-2.5 rounded-xl hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            title={lang === 'zh' ? '放大地球' : 'Zoom in'}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomCameraBy(1.18)}
            className="p-2.5 rounded-xl hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            title={lang === 'zh' ? '缩小地球' : 'Zoom out'}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetGlobeView}
            className="p-2.5 rounded-xl hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            title={t.resetView}
            aria-label={t.resetView}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="my-0.5 h-px bg-white/10 mx-1.5" />
          <button
            type="button"
            onClick={handleToggleExplore}
            className="p-2.5 rounded-xl hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            title={t.inspectEarth || 'Explore'}
          >
            <Orbit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowBeacons(!showBeacons)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${showBeacons ? 'text-cyan-300 bg-white/[0.06]' : 'hover:bg-white/[0.06] hover:text-white'}`}
            title={t.toggleBeacons}
          >
            <Network className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${autoRotate ? 'text-cyan-300' : 'text-slate-500 hover:text-white hover:bg-white/[0.06]'}`}
            title={t.autoRotation}
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? t.mute : t.playCosmicSound}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-300" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Clear Always-Accessible Exit Button in Immersive Mode (Desktop + Mobile) */}
      {immersive && (
        <div className="pointer-events-auto fixed bottom-6 right-5 z-40">
          <button
            type="button"
            data-exit-immersive="true"
            onClick={handleToggleExplore}
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/90 px-4 py-2.5 text-sm font-medium text-white shadow-2xl hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>{lang === 'zh' ? '退出沉浸' : 'Exit Immersive'}</span>
          </button>
        </div>
      )}

      {/* 4. HOVERED CITIZEN TOOLTIP */}
      {hoveredNode && hoverPosition && (
        <div
          className="fixed z-40 pointer-events-none px-4 py-3 rounded-2xl bg-slate-950/92 border border-cyan-400/40 text-slate-100 shadow-2xl text-xs max-w-xs"
          style={{
            left: `${hoverPosition.x + 16}px`,
            top: `${hoverPosition.y - 25}px`
          }}
        >
          <div className="flex items-center space-x-3 mb-1">
            <img
              src={hoveredNode.avatar}
              alt={hoveredNode.displayName}
              className="w-8 h-8 rounded-full object-cover border border-cyan-400/60 shadow"
            />
            <div>
              <div className="font-bold text-white flex items-center space-x-1.5">
                <span>{hoveredNode.displayName}</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                  {hoveredNode.countryCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                <MapPin className="w-3 h-3 text-cyan-400" />
                <span>{hoveredNode.cityName}, {hoveredNode.countryName}</span>
              </p>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-cyan-400 font-semibold flex items-center space-x-1">
            <ExternalLink className="w-3 h-3" />
            <span>Click to visit citizen space</span>
          </div>
        </div>
      )}
    </div>
  );
};
