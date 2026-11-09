import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GlobeUserNode, GlobeCountryStat, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { latLngToVector3 } from './proceduralEarthTextures.ts';
import {
  earthSurfaceVertexShader,
  earthSurfaceFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  innerAtmosphereVertexShader,
  innerAtmosphereFragmentShader
} from './earthShaders.ts';
import { buildOrbitSystem, buildConnectionArcs, buildStarField } from './sceneBuilders.ts';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Globe2,
  Orbit,
  Network,
  Volume2,
  VolumeX,
  Sparkles,
  MapPin,
  ExternalLink,
  RotateCw,
  Eye,
  EyeOff,
  ChevronRight,
  Users2,
  X,
  Radio,
  Activity,
  Navigation,
  Satellite,
  Flame,
  Layers
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
}

export const DigitalGlobe: React.FC<DigitalGlobeProps> = ({
  nodes,
  countries,
  activeCountry,
  currentUserId,
  focusCoordinates,
  onSelectCountry,
  onSelectUser,
  onSelectTab,
  onExploreUniverse,
  onExploreCommunity,
  showGlobeTools = true,
  onToggleGlobeTools,
  lang
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

  // Camera & Mode state
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBeacons, setShowBeacons] = useState(true);
  const [showISS, setShowISS] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(false);
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

  // Mutable Three.js loop state
  const stateRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    controls: null as OrbitControls | null,
    composer: null as EffectComposer | null,
    earthGroup: null as THREE.Group | null,
    orbitSystem: null as { update: (elapsed: number) => void } | null,
    connectionArcs: null as { update: (elapsed: number) => void } | null,
    beaconGroup: null as THREE.Group | null,
    issGroup: null as THREE.Group | null,
    earthquakeGroup: null as THREE.Group | null,
    interactiveMeshes: [] as { mesh: THREE.Object3D; data: GlobeUserNode }[],
    autoRotate: true,
    showBeacons: true,
    showISS: true,
    showEarthquakes: true,
    targetSphericalRotation: null as { x: number; y: number } | null,
    frameId: 0
  });

  // Sync state
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
        // network silent fallback
      }
    };

    const fetchEarthquakes = async () => {
      try {
        const res = await fetch('/api/telemetry/earthquakes');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && Array.isArray(data.features)) {
          setEarthquakes(data.features.slice(0, 8));
        }
      } catch {
        // network silent fallback
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
    const earthRadius = 4.5;
    const pos = latLngToVector3(issData.lat, issData.lng, earthRadius * 1.09);
    stateRef.current.issGroup.position.copy(pos);
    stateRef.current.issGroup.lookAt(0, 0, 0);
  }, [issData]);

  // Update Earthquake markers in 3D scene
  useEffect(() => {
    const group = stateRef.current.earthquakeGroup;
    if (!group) return;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const earthRadius = 4.5;
    earthquakes.forEach((quake, idx) => {
      const pos = latLngToVector3(quake.lat, quake.lng, earthRadius * 1.008);
      const normal = pos.clone().normalize();
      const qGroup = new THREE.Group();
      qGroup.position.copy(pos);
      qGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const magColor = quake.mag >= 5.5 ? 0xef4444 : quake.mag >= 4.5 ? 0xf59e0b : 0x06b6d4;
      const ringRadius = 0.08 + Math.min(quake.mag * 0.03, 0.25);

      const ringGeo = new THREE.RingGeometry(ringRadius * 0.4, ringRadius, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: magColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      qGroup.add(ring);

      const dotGeo = new THREE.SphereGeometry(0.035, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: magColor });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.y = 0.02;
      qGroup.add(dot);

      qGroup.userData = { pulseOffset: idx * 0.8 };
      group.add(qGroup);
    });
  }, [earthquakes]);

  // Smoothly rotate the earth to a country or citizen coordinate.
  // Camera stays managed by OrbitControls (no zoom), so we only rotate the
  // globe itself toward the target latitude/longitude.
  const flyToCoordinates = useCallback((lat: number, lng: number) => {
    setIsZoomedIn(true);
    if (!stateRef.current.earthGroup) return;
    setAutoRotate(false);
    stateRef.current.autoRotate = false;

    const targetY = -((lng + 90) * (Math.PI / 180));
    const targetX = lat * (Math.PI / 180);

    stateRef.current.targetSphericalRotation = { x: targetX, y: targetY };
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

  // Toggle between Overview and Explore modes. Zoom is intentionally disabled
  // (per OrbitControls config), so this only toggles auto-rotation and resets
  // any targeted globe rotation back to the natural overview state.
  const handleToggleExplore = () => {
    if (isZoomedIn) {
      setIsZoomedIn(false);
      stateRef.current.targetSphericalRotation = null;
      setAutoRotate(true);
    } else {
      setIsZoomedIn(true);
      setAutoRotate(false);
    }
  };

  // MAIN THREE.JS LIVE 3D WEBGL ENGINE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect GPU capabilities
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // pure deep space
    stateRef.current.scene = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const isNarrow = width < 768;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1500);
    camera.position.set(0, 0, isNarrow ? 70 : 13.5);
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
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    stateRef.current.renderer = renderer;

    // 3. DEEP SPACE BACKDROP — pure black with a subtle distant star field
    const starCount = isSoftwareGl ? 500 : 1400;
    scene.add(buildStarField(starCount));

    // 4. LIGHTING — the surface shader computes day/night itself via a sun
    // direction uniform, so we keep only a subtle ambient to avoid dead-black
    // night-side oceans.
    const sunDirection = new THREE.Vector3(-0.55, 0.35, 0.55).normalize();
    const ambientLight = new THREE.AmbientLight(0x223044, 0.6);
    scene.add(ambientLight);

    // 5. CENTRAL EARTH SYSTEM
    const earthRadius = 4.5;
    const earthGroup = new THREE.Group();
    // Desktop: offset right to frame the hero typography on the left.
    // Mobile: center the earth, slightly raised so it doesn't collide with
    // the title block above or the stat cards below.
    earthGroup.position.set(isNarrow ? 0 : 0.65, isNarrow ? 0.55 : 0.25, 0);
    earthGroup.rotation.x = 0.234; // 23.4° axial tilt
    scene.add(earthGroup);
    stateRef.current.earthGroup = earthGroup;

    // 5.1 Earth surface — custom day/night shader blending Blue Marble (day)
    // and Black Marble city lights (night) across a smooth terminator.
    const textureLoader = new THREE.TextureLoader();

    const loadTexture = (url: string, fallbackColor: number) => {
      const tex = textureLoader.load(
        url,
        undefined,
        undefined,
        () => {
          // Fallback: create a 1x1 solid-color texture on load failure
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
      tex.anisotropy = 8;
      return tex;
    };

    const dayTexture = loadTexture('/assets/earth/earth_day_2048.jpg', 0x0a1a3a);
    const nightTexture = loadTexture('/assets/earth/earth_night_2048.jpg', 0x020408);
    const normalTexture = loadTexture('/assets/earth/earth_normal_2048.jpg', 0x808080);

    const earthGeo = new THREE.SphereGeometry(earthRadius, isSoftwareGl ? 64 : 128, isSoftwareGl ? 64 : 128);
    const earthMat = new THREE.ShaderMaterial({
      vertexShader: earthSurfaceVertexShader,
      fragmentShader: earthSurfaceFragmentShader,
      uniforms: {
        uDayMap: { value: dayTexture },
        uNightMap: { value: nightTexture },
        uNormalMap: { value: normalTexture },
        uSunDirection: { value: sunDirection },
        uDayIntensity: { value: 0.85 },
        uNightIntensity: { value: 1.0 },
        uNormalStrength: { value: 0.35 }
      }
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // 5.2 Atmospheric Fresnel rim glow (outer + inner layers)
    const atmoGeo = new THREE.SphereGeometry(earthRadius * 1.045, 96, 96);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

    const innerAtmoGeo = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
    const innerAtmoMat = new THREE.ShaderMaterial({
      vertexShader: innerAtmosphereVertexShader,
      fragmentShader: innerAtmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(innerAtmoGeo, innerAtmoMat));

    // 5.3 Orbital system + global data connection arcs
    const orbitSystem = buildOrbitSystem(earthRadius);
    scene.add(orbitSystem.group);
    stateRef.current.orbitSystem = orbitSystem;

    const connectionArcs = buildConnectionArcs(earthRadius);
    earthGroup.add(connectionArcs.group);
    stateRef.current.connectionArcs = connectionArcs;

    // 5.4 Human Citizen Beacons
    const beaconGroup = new THREE.Group();
    earthGroup.add(beaconGroup);
    stateRef.current.beaconGroup = beaconGroup;

    const interactiveMeshes: { mesh: THREE.Object3D; data: GlobeUserNode }[] = [];
    nodes.forEach(node => {
      const isMe = currentUserId && node.userId === currentUserId;
      const pos = latLngToVector3(node.lat, node.lng, earthRadius * 1.014);
      const normal = pos.clone().normalize();

      const singleBeacon = new THREE.Group();
      singleBeacon.position.copy(pos);
      singleBeacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const auraGeo = new THREE.RingGeometry(0.04, isMe ? 0.22 : 0.14, 24);
      const auraMat = new THREE.MeshBasicMaterial({
        color: isMe ? 0x10b981 : 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.rotation.x = Math.PI / 2;
      singleBeacon.add(auraMesh);

      const pearlGeo = new THREE.SphereGeometry(isMe ? 0.12 : 0.08, 16, 16);
      const pearlMat = new THREE.MeshStandardMaterial({
        color: isMe ? 0x34d399 : 0x38bdf8,
        emissive: isMe ? 0x059669 : 0x0284c7,
        emissiveIntensity: 2.2
      });
      const pearlMesh = new THREE.Mesh(pearlGeo, pearlMat);
      pearlMesh.position.y = 0.1;
      singleBeacon.add(pearlMesh);

      beaconGroup.add(singleBeacon);
      interactiveMeshes.push({ mesh: pearlMesh, data: node });
    });
    stateRef.current.interactiveMeshes = interactiveMeshes;

    // 5.5 ISS (International Space Station) 3D Model
    const issGroup = new THREE.Group();
    const issCoreGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.32, 12);
    const issCoreMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.2
    });
    const issCore = new THREE.Mesh(issCoreGeo, issCoreMat);
    issCore.rotation.z = Math.PI / 2;
    issGroup.add(issCore);

    // Solar panels (deep navy + cyan sheen)
    const panelGeo = new THREE.BoxGeometry(0.35, 0.01, 0.12);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
      metalness: 0.8,
      roughness: 0.3
    });
    const panel1 = new THREE.Mesh(panelGeo, panelMat);
    panel1.position.set(0.24, 0, 0);
    issGroup.add(panel1);

    const panel2 = new THREE.Mesh(panelGeo, panelMat);
    panel2.position.set(-0.24, 0, 0);
    issGroup.add(panel2);

    // Glowing ISS Locator Beacon Ring
    const beaconRingGeo = new THREE.RingGeometry(0.18, 0.22, 32);
    const beaconRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const issBeaconRing = new THREE.Mesh(beaconRingGeo, beaconRingMat);
    issGroup.add(issBeaconRing);

    // Initial position
    const initialIssPos = latLngToVector3(0, 0, earthRadius * 1.09);
    issGroup.position.copy(initialIssPos);
    earthGroup.add(issGroup);
    issGroup.visible = stateRef.current.showISS;
    stateRef.current.issGroup = issGroup;

    // 5.6 Real-Time USGS Earthquakes Layer
    const earthquakeGroup = new THREE.Group();
    earthGroup.add(earthquakeGroup);
    earthquakeGroup.visible = stateRef.current.showEarthquakes;
    stateRef.current.earthquakeGroup = earthquakeGroup;

    // 6. ORBIT CONTROLS — drag to rotate, no zoom, damped, limited pitch
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;         // disable scroll/pinch zoom
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.4;
    controls.minPolarAngle = Math.PI * 0.25;  // limit vertical rotation
    controls.maxPolarAngle = Math.PI * 0.75;
    controls.autoRotate = false;
    controls.target.set(isNarrow ? 0 : 0.65, isNarrow ? 0.55 : 0.25, 0);
    stateRef.current.controls = controls;

    // 7. BLOOM POST-PROCESSING (subtle, city lights only)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      isSoftwareGl ? 0.0 : 0.28,  // bloom strength
      0.6,                         // radius
      0.85                          // threshold (only bright lights bloom)
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    stateRef.current.composer = composer;

    // 8. RAYCASTING & POINTER INTERACTION
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Check pin raycast hover
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidateObjects = stateRef.current.interactiveMeshes.map(m => m.mesh);
      const intersects = raycaster.intersectObjects(candidateObjects, true);
      if (intersects.length > 0) {
        const found = stateRef.current.interactiveMeshes.find(
          item => item.mesh === intersects[0].object
        );
        if (found) {
          setHoveredNode(found.data);
          setHoverPosition({ x: cx, y: cy });
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredNode(null);
      setHoverPosition(null);
      renderer.domElement.style.cursor = 'grab';
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const candidateObjects = stateRef.current.interactiveMeshes.map(m => m.mesh);
      const intersects = raycaster.intersectObjects(candidateObjects, true);
      if (intersects.length > 0) {
        const found = stateRef.current.interactiveMeshes.find(
          item => item.mesh === intersects[0].object
        );
        if (found) {
          flyToCoordinates(found.data.lat, found.data.lng);
          onSelectUser(found.data);
        }
      }
    };

    const dom = renderer.domElement;
    window.addEventListener('mousemove', onPointerMove);
    dom.addEventListener('click', onClick);

    // Touch hover
    window.addEventListener('touchmove', onPointerMove, { passive: true });

    // Window resize
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Pause rendering when the tab is hidden (save battery / GPU)
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(stateRef.current.frameId);
      } else {
        clock.getDelta(); // reset delta to avoid a jump after resume
        animate();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 9. ANIMATION LOOP
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // OrbitControls manages camera rotation, damping, and look-at.
      controls.update();

      // Earth slow, natural rotation
      if (stateRef.current.earthGroup) {
        if (stateRef.current.targetSphericalRotation) {
          stateRef.current.earthGroup.rotation.y = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.y,
            stateRef.current.targetSphericalRotation.y,
            3.0,
            delta
          );
          stateRef.current.earthGroup.rotation.x = THREE.MathUtils.damp(
            stateRef.current.earthGroup.rotation.x,
            stateRef.current.targetSphericalRotation.x,
            3.0,
            delta
          );
        } else if (stateRef.current.autoRotate) {
          stateRef.current.earthGroup.rotation.y += 0.0012;
        }
      }

      // Orbit rings rotate independently
      if (stateRef.current.orbitSystem) {
        stateRef.current.orbitSystem.update(elapsed);
      }

      // Connection arc pulses
      if (stateRef.current.connectionArcs) {
        stateRef.current.connectionArcs.update(elapsed);
      }

      // Earthquake ring pulsations
      if (stateRef.current.earthquakeGroup && stateRef.current.earthquakeGroup.visible) {
        stateRef.current.earthquakeGroup.children.forEach(child => {
          const offset = (child.userData as { pulseOffset?: number })?.pulseOffset || 0;
          const scale = 1 + 0.22 * Math.sin(elapsed * 3.5 + offset);
          child.scale.set(scale, scale, scale);
        });
      }

      // ISS beacon ring pulsation
      if (stateRef.current.issGroup && stateRef.current.issGroup.visible) {
        const ring = stateRef.current.issGroup.children[3];
        if (ring) {
          const s = 1 + 0.18 * Math.sin(elapsed * 3);
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

      controls.dispose();
      composer.dispose();
      renderer.dispose();
      if (container.contains(dom)) container.removeChild(dom);
    };
  }, [nodes, currentUserId, onSelectUser, flyToCoordinates]);

  return (
    <div className="relative w-full h-full min-h-[calc(100svh-7rem)] md:min-h-[calc(100vh-4rem)] flex-1 overflow-x-clip bg-[#010309] select-none md:overflow-hidden">
      {/* ============================================================== */}
      {/* 1. LIVE THREE.JS 3D WEBGL UNIVERSE CANVAS                      */}
      {/* ============================================================== */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />
      {webglUnavailable && (
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-[#010309]" role="img" aria-label="Static Earth preview; WebGL is unavailable">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(10,35,82,.34),transparent_55%),radial-gradient(circle_at_18%_22%,#fff_0_1px,transparent_1.5px),radial-gradient(circle_at_76%_18%,#bfdbfe_0_1px,transparent_1.5px),radial-gradient(circle_at_86%_68%,#fff_0_1px,transparent_1.5px)]" />
          <div
            className="relative h-[40vw] w-[40vw] max-h-[48vh] max-w-[48vh] overflow-hidden rounded-full border border-blue-300/60 shadow-[0_0_70px_12px_rgba(37,99,235,.32)] md:h-[48vh] md:w-[48vh]"
            style={{ backgroundImage: 'url(/assets/earth/earth_day_2048.jpg)', backgroundSize: 'auto 100%', backgroundPosition: '45% center' }}
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(191,219,254,.28),transparent_22%),radial-gradient(circle_at_52%_54%,transparent_42%,rgba(1,5,18,.55)_76%,#010309_100%)]" />
            <div className="absolute -inset-[12%] rounded-full border border-blue-300/25 rotate-[-22deg]" />
            <div className="absolute inset-0 rounded-full shadow-[inset_-18px_-4px_44px_rgba(0,0,0,.72),inset_6px_0_24px_rgba(147,197,253,.24)]" />
          </div>
        </div>
      )}

      <aside
        id="globe-local-nav"
        style={{ display: showGlobeTools ? undefined : 'none' }}
        className="absolute bottom-6 left-3 top-4 z-20 hidden w-[174px] flex-col rounded-[26px] border border-slate-700/70 bg-[#071020]/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-2xl md:flex"
      >
        <div className="flex items-center gap-2 border-b border-slate-800/90 px-2 pb-3 pt-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/15 text-blue-300 shadow-[0_0_24px_rgba(37,99,235,.24)]">
            <Globe2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[.12em] text-white">地球计划</div>
            <div className="text-[9px] text-slate-400">One Universe. One World.</div>
          </div>
        </div>

        <nav aria-label="Earth One navigation" className="mt-3 flex flex-col gap-1">
          {[
            { id: 'globe', label: t.globeTab, icon: <Globe2 className="h-4 w-4" /> },
            { id: 'feed', label: t.feedTab, icon: <Compass className="h-4 w-4" /> },
            { id: 'universe', label: t.universeTab, icon: <Orbit className="h-4 w-4" /> },
            { id: 'community', label: t.communityTab, icon: <Users2 className="h-4 w-4" /> },
            { id: 'knowledge', label: t.knowledgeTab, icon: <Network className="h-4 w-4" /> },
            { id: 'library', label: t.digitalLibrary, icon: <BookOpen className="h-4 w-4" /> }
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={item.id === 'globe' ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[11px] font-semibold transition-all ${item.id === 'globe' ? 'bg-gradient-to-r from-blue-600/90 to-blue-500/50 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-300/30' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'}`}
            >
              <span className={item.id === 'globe' ? 'text-blue-100' : 'text-slate-400'}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => setAppsExpanded(open => !open)}
            aria-expanded={appsExpanded}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
          >
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <span className="flex-1">{t.apps}</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${appsExpanded ? 'rotate-90' : ''}`} />
          </button>
          {appsExpanded && (
            <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-slate-700 pl-2">
              {[
                { id: 'chat', label: t.globalMessenger },
                { id: 'aihub', label: t.aiHubTab },
                { id: 'browser', label: t.webBrowser },
                { id: 'crawler', label: t.crawlerCenter },
                { id: 'creator', label: t.creatorArticles },
                { id: 'video', label: t.worldVideoCenter },
                { id: 'game', label: t.globalGameCenter }
              ].map(item => (
                <button key={item.id} type="button" onClick={() => onSelectTab(item.id)} className="rounded-lg px-2 py-1.5 text-left text-[9px] text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-white">
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto overflow-hidden rounded-2xl border border-blue-400/20 bg-[radial-gradient(ellipse_at_70%_20%,rgba(37,99,235,.35),transparent_54%),linear-gradient(145deg,#101e39,#070b17_75%)] p-3">
          <div className="mb-2 flex h-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,.5),transparent_55%),radial-gradient(circle_at_20%_10%,#fff_0_1px,transparent_1.5px),radial-gradient(circle_at_74%_30%,#93c5fd_0_1px,transparent_1.5px),#050914]">
            <Orbit className="h-7 w-7 text-blue-300 drop-shadow-[0_0_14px_rgba(96,165,250,.9)]" />
          </div>
          <p className="text-[10px] font-semibold text-white">{t.universeTab}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-400">{t.vastHome}</p>
          <button type="button" onClick={onExploreUniverse} className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-300 hover:text-white">
            {t.learnMore}<ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. WORLD-CLASS USER HERO OVERLAY                               */}
      {/* ============================================================== */}
      <div className="relative z-10 h-full min-h-[calc(100svh-7rem)] md:min-h-[calc(100vh-4rem)] max-w-[1680px] mx-auto px-5 sm:px-8 md:pl-[220px] lg:pl-[220px] flex flex-col justify-start md:justify-between pt-8 sm:pt-20 pb-8 pointer-events-none">
        {/* Left Hero Title & CTA */}
        <div className="max-w-xl pointer-events-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-medium mb-3">
            <Globe2 className="w-3.5 h-3.5" />
            <span>{t.appName}</span>
            <span className="text-slate-500">·</span>
            <span>{t.tagline}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
            {t.appName}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-300/90 leading-relaxed font-sans max-w-lg">
            {t.motto}
          </p>

          {showFirstUseHint && (
            <div className="mt-3 flex max-w-md items-start gap-2 rounded-xl border border-cyan-900/70 bg-slate-950/75 px-3 py-2 text-xs leading-relaxed text-cyan-100/90 shadow-lg backdrop-blur-md">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <p className="flex-1">{t.firstUseHint}</p>
              <button
                type="button"
                onClick={() => {
                  setShowFirstUseHint(false);
                  try { localStorage.setItem('earth-one-globe-hint-dismissed', '1'); } catch {}
                }}
                className="rounded-md p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label={t.dismissFirstUseHint}
                title={t.dismissFirstUseHint}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Start Exploring Action Button & Tools Disclosure */}
          <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={onExploreUniverse}
              aria-pressed="false"
              className="inline-flex items-center space-x-2 sm:space-x-3 px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-xs sm:text-base shadow-xl shadow-blue-500/40 border border-cyan-300/50 cursor-pointer transition-all hover:scale-105 active:scale-95 group"
            >
              <span>{t.startExploring}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </button>

            {onToggleGlobeTools && (
              <button
                type="button"
                onClick={onToggleGlobeTools}
                aria-expanded={showGlobeTools}
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 sm:py-3.5 rounded-full border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-medium transition-all shadow-lg"
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>{showGlobeTools ? t.hideGlobeTools : t.showGlobeTools}</span>
              </button>
            )}
          </div>

          {/* Statistics Panel */}
          <div
            id="globe-statistics-panel"
            style={{ display: showGlobeTools ? undefined : 'none' }}
            className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 max-w-md"
          >
            <div className="p-3 rounded-2xl bg-slate-950/75 border border-slate-800/80 backdrop-blur-md">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t.onlineUsers}</div>
              <div className="text-base sm:text-lg font-bold font-mono text-cyan-300 mt-0.5">
                {nodes.length > 0 ? nodes.length.toLocaleString() : '1,280'}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/75 border border-slate-800/80 backdrop-blur-md">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t.activeNodes}</div>
              <div className="text-base sm:text-lg font-bold font-mono text-emerald-300 mt-0.5">
                {countries.length > 0 ? countries.length : '196'}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/75 border border-slate-800/80 backdrop-blur-md">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t.registeredCitizens}</div>
              <div className="text-base sm:text-lg font-bold font-mono text-amber-300 mt-0.5">
                368,420
              </div>
            </div>
          </div>
        </div>

          {/* Mobile controls stay in document flow instead of covering the stats. */}
          <div
            id="globe-mobile-controls"
            style={{ display: showGlobeTools ? undefined : 'none' }}
            className="mt-3 flex flex-wrap items-center gap-1.5 pointer-events-auto md:hidden"
            aria-label={t.globeControls}
          >
            <button onClick={handleToggleExplore} className="rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 text-slate-300" aria-label={isZoomedIn ? t.zoomOut : t.inspectEarth} title={isZoomedIn ? t.zoomOut : t.inspectEarth}>
              <Orbit className="h-4 w-4" />
            </button>
            <button onClick={() => setShowBeacons(!showBeacons)} className={`rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 ${showBeacons ? 'text-cyan-300' : 'text-slate-500'}`} aria-label={t.toggleBeacons} title={t.toggleBeacons}>
              <Network className="h-4 w-4" />
            </button>
            <button onClick={() => setAutoRotate(!autoRotate)} className={`rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 ${autoRotate ? 'text-cyan-300' : 'text-slate-500'}`} aria-label={t.autoRotation} title={t.autoRotation}>
              <RotateCw className="h-4 w-4" />
            </button>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 text-slate-300" aria-label={soundEnabled ? t.mute : t.playCosmicSound} title={soundEnabled ? t.mute : t.playCosmicSound}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {onExploreUniverse && (
              <button onClick={onExploreUniverse} className="rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 text-purple-300" aria-label={t.solarSystemEngine} title={t.solarSystemEngine}>
                <Sparkles className="h-4 w-4" />
              </button>
            )}
          </div>

        <div className="h-[38vh] shrink-0 md:hidden" aria-hidden="true" />

        {/* Ultra-Clean Floating Aerospace Telemetry Capsule (Sleek, Unobstructed, High-Tech) */}
        <div className="w-full flex justify-center pointer-events-auto pt-4 sm:pt-6">
          <div
            id="globe-telemetry-panel"
            style={{ display: showGlobeTools ? undefined : 'none' }}
            className="w-full max-w-4xl p-2.5 sm:p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs"
          >
            {/* 1. ISS Live Telemetry */}
            <div className="flex items-center space-x-3 w-full md:w-auto">
              <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                <Satellite className="w-4 h-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-white text-xs">{t.issTracker || '国际空间站实时遥测'}</span>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 font-mono text-[9px] border border-cyan-800/60">
                    NORAD 25544
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center space-x-2 mt-0.5">
                  <span>{issData ? `${issData.lat.toFixed(1)}°, ${issData.lng.toFixed(1)}°` : '0.0°, 0.0°'}</span>
                  <span>·</span>
                  <span className="text-cyan-300">{issData ? `${issData.altitudeKm.toFixed(0)}km` : '420km'}</span>
                  <span>·</span>
                  <span className="text-emerald-300">{issData ? `${Math.round(issData.velocityKmh).toLocaleString()}km/h` : '27,580km/h'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (issData) {
                    flyToCoordinates(issData.lat, issData.lng);
                  }
                }}
                className="ml-auto md:ml-2 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
                title="镜头瞬移锁定空间站"
              >
                <Navigation className="w-3 h-3" />
                <span>锁定聚焦</span>
              </button>
            </div>

            <div className="hidden md:block h-6 w-px bg-slate-800" />

            {/* 2. Space Weather & Planetary Environment */}
            <div className="hidden lg:flex items-center space-x-3 text-slate-400 text-[11px]">
              <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-slate-200">{t.seismicMonitor || '全球地震带实时监测'}</div>
                <div className="font-mono text-slate-400 text-[10px] mt-0.5">
                  Kp-2.1 (地磁宁静) · 太阳风 412 km/s · 通讯正常
                </div>
              </div>
            </div>

            <div className="hidden md:block h-6 w-px bg-slate-800" />

            {/* 3. Quick Layer Toggles */}
            <div className="flex items-center space-x-1.5 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowISS(!showISS)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showISS ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="开关国际空间站模型"
              >
                🛰️ 空间站
              </button>

              <button
                type="button"
                onClick={() => setShowBeacons(!showBeacons)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  showBeacons ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="开关全球公民信标"
              >
                👥 公民信标
              </button>

              <button
                type="button"
                onClick={() => setAutoRotate(!autoRotate)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  autoRotate ? 'bg-blue-950/60 border-blue-500/50 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="开关地球自转"
              >
                🌍 自转
              </button>
            </div>
          </div>
        </div>

        {/* Centered Footer Motto (omitted when empty to keep space clean) */}
        {t.footerMotto ? (
          <div className="w-full text-center mt-6 pt-4 border-t border-slate-900/80 text-[11px] text-slate-500 font-mono tracking-wider">
            {t.footerMotto}
          </div>
        ) : null}
      </div>



      {/* ============================================================== */}
      {/* 3. RIGHT FLOATING VERTICAL ACTION RAIL                         */}
      {/* ============================================================== */}
      <aside
        id="globe-controls-rail"
        style={{ display: showGlobeTools ? undefined : 'none' }}
        className="hidden md:flex fixed right-6 top-1/2 -translate-y-1/2 z-20 flex-col space-y-3 pointer-events-auto"
      >
        <div className="p-2 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl shadow-2xl flex flex-col space-y-3 text-slate-400">
          {/* Orbit switch */}
          <button
            onClick={handleToggleExplore}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isZoomedIn
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                : 'hover:bg-slate-800/80 hover:text-white'
            }`}
            title={isZoomedIn ? t.zoomOut : t.inspectEarth}
          >
            <Orbit className="w-4 h-4" />
          </button>

          {/* Solar explorer */}
          {onExploreUniverse && (
            <button
              onClick={onExploreUniverse}
              className="p-2.5 rounded-xl hover:bg-slate-800/80 hover:text-purple-300 transition-colors cursor-pointer"
              title={t.solarSystemEngine}
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}

          {/* Citizen beacons */}
          <button
            onClick={() => setShowBeacons(!showBeacons)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              showBeacons ? 'text-cyan-400 bg-cyan-950/60' : 'hover:bg-slate-800/80 hover:text-white'
            }`}
            title={t.toggleBeacons}
          >
            <Network className="w-4 h-4" />
          </button>

          {/* Auto rotate toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              autoRotate ? 'text-cyan-400' : 'text-slate-600'
            }`}
            title={t.autoRotation}
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Deep Space Sound */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl hover:bg-slate-800/80 hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? t.mute : t.playCosmicSound}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 4. HOVERED CITIZEN TOOLTIP                                     */}
      {/* ============================================================== */}
      {hoveredNode && hoverPosition && (
        <div
          className="fixed z-40 pointer-events-none px-4 py-3 rounded-2xl bg-slate-950/90 border border-cyan-400/50 text-slate-100 shadow-2xl backdrop-blur-xl text-xs max-w-xs animate-in fade-in"
          style={{
            left: `${hoverPosition.x + 16}px`,
            top: `${hoverPosition.y - 25}px`
          }}
        >
          <div className="flex items-center space-x-3 mb-1">
            <img
              src={hoveredNode.avatar}
              alt={hoveredNode.displayName}
              className="w-8 h-8 rounded-full object-cover border border-cyan-400 shadow"
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
