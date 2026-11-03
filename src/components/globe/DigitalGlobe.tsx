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
  Compass,
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
  ChevronRight
} from 'lucide-react';

interface DigitalGlobeProps {
  nodes: GlobeUserNode[];
  countries: GlobeCountryStat[];
  activeCountry: string | null;
  currentUserId?: string;
  focusCoordinates?: { lat: number; lng: number; timestamp?: number } | null;
  onSelectCountry: (countryCode: string | null) => void;
  onSelectUser: (user: GlobeUserNode) => void;
  onExploreUniverse?: () => void;
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
  onExploreUniverse,
  lang
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const t = translations[lang] || translations.zh;

  // Camera & Mode state
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBeacons, setShowBeacons] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GlobeUserNode | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

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
    interactiveMeshes: [] as { mesh: THREE.Object3D; data: GlobeUserNode }[],
    autoRotate: true,
    showBeacons: true,
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

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1500);
    camera.position.set(0, 0, 13.5);
    stateRef.current.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance'
    });
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
    const isNarrow = width < 768;
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
    <div className="relative w-full h-full min-h-[calc(100vh-4rem)] flex-1 overflow-hidden bg-[#010309] select-none">
      {/* ============================================================== */}
      {/* 1. LIVE THREE.JS 3D WEBGL UNIVERSE CANVAS                      */}
      {/* ============================================================== */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {/* ============================================================== */}
      {/* 2. WORLD-CLASS USER HERO OVERLAY                               */}
      {/* ============================================================== */}
      <div className="relative z-10 h-full min-h-[calc(100vh-4rem)] max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 flex flex-col justify-between pt-14 sm:pt-20 pb-8 pointer-events-none">
        {/* Left Hero Title & CTA */}
        <div className="max-w-xl pointer-events-auto">
          <h1 className="font-extrabold text-5xl sm:text-6xl md:text-7xl tracking-tight text-white font-sans drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
            EARTH ONE
          </h1>
          <h2 className="font-bold text-3xl sm:text-4xl md:text-5xl text-slate-100 tracking-tight mt-2 font-sans drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
            {t.heroSubtitle}
          </h2>
          <p className="text-base sm:text-lg text-slate-300 mt-5 font-normal leading-relaxed drop-shadow-md">
            {t.heroDescription}
          </p>

          {/* Start Exploring Action Button */}
          <div className="mt-8 flex items-center space-x-4">
            <button
              onClick={handleToggleExplore}
              className="inline-flex items-center space-x-3 px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm sm:text-base shadow-xl shadow-blue-500/40 border border-cyan-300/50 cursor-pointer transition-all hover:scale-105 active:scale-95 group"
            >
              <span>{isZoomedIn ? t.overviewView : t.startExploring}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </button>

            {onExploreUniverse && (
              <button
                onClick={onExploreUniverse}
                className="inline-flex items-center space-x-2 px-5 py-3.5 rounded-full bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 text-slate-200 text-sm font-medium backdrop-blur-md cursor-pointer transition-all hover:text-white"
              >
                <Orbit className="w-4 h-4 text-purple-400" />
                <span>{t.solarSystem}</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Cards Row: Universe Overview + Our Galaxy */}
        <div className="w-full flex flex-col lg:flex-row items-end justify-between gap-6 pointer-events-auto pt-10">
          {/* Bottom Left: Universe Overview Card */}
          <div className="w-full max-w-lg p-5 rounded-3xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 tracking-wide mb-4">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>{t.universeOverview}</span>
            </div>

            <div className="flex items-center justify-between">
              {/* Stat 1 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  8.0B+
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {t.peopleOnEarth}
                </div>
              </div>

              <div className="h-9 w-[1px] bg-slate-800" />

              {/* Stat 2 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  8
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {t.planets}
                </div>
              </div>

              <div className="h-9 w-[1px] bg-slate-800" />

              {/* Stat 3 */}
              <div>
                <div className="font-bold text-2xl sm:text-3xl text-white font-mono">
                  100B+
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {t.starsInGalaxy}
                </div>
              </div>

              {/* Telemetry Waveform */}
              <div className="hidden sm:block pl-2">
                <svg className="w-24 h-9 overflow-visible" viewBox="0 0 100 36">
                  <path
                    d="M 0,22 Q 15,22 25,10 T 50,26 T 75,6 T 100,18"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Right: Our Galaxy Card */}
          <div
            onClick={onExploreUniverse || handleToggleExplore}
            className="w-full max-w-sm p-4 rounded-3xl bg-slate-950/70 hover:bg-slate-900/80 border border-slate-800/80 backdrop-blur-xl shadow-2xl flex items-center space-x-4 cursor-pointer transition-all hover:scale-[1.02] group"
          >
            {/* Galaxy Thumbnail */}
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-purple-500/40 shadow-lg shadow-purple-500/20 shrink-0 relative bg-[#040817] flex items-center justify-center">
              <Orbit className="w-9 h-9 text-purple-400 animate-spin" style={{ animationDuration: '30s' }} />
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/30 via-cyan-500/20 to-transparent" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm sm:text-base text-white group-hover:text-cyan-300 transition-colors">
                {t.ourGalaxy}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {t.vastHome}
              </p>
              <div className="mt-2 text-xs font-semibold text-cyan-400 flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
                <span>{t.learnMore}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Centered Footer Motto */}
        <div className="w-full text-center mt-6 pt-4 border-t border-slate-900/80 text-[11px] text-slate-500 font-mono tracking-wider">
          {t.footerMotto}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. RIGHT FLOATING VERTICAL ACTION RAIL                         */}
      {/* ============================================================== */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col space-y-3 pointer-events-auto">
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
