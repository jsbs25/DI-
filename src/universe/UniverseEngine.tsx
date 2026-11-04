/**
 * EARTH ONE - UNIVERSE ENGINE
 * Interactive Solar System & Celestial Explorer
 * 
 * Renders the Sun, 8 canonical planets, Earth-Moon system, and photorealistic
 * Saturn ring system with Cassini division (matching Cassini-Huygens imaging).
 * Features smooth camera transitions, orbital speed controls, raycasting,
 * and astrophysical telemetry inspection.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { 
  CELESTIAL_BODIES, 
  CelestialBody, 
  getCelestialBodyById 
} from './celestialBodies';
import { 
  createEarthDayTexture, 
  createEarthCloudTexture, 
  createSaturnRingTexture, 
  createJupiterTexture, 
  createMarsTexture, 
  createSunTexture, 
  createCelestialTexture 
} from './proceduralPlanets';
import { PlanetTelemetryDrawer } from './PlanetTelemetryDrawer';
import { 
  Play, 
  Pause, 
  FastForward, 
  Maximize2, 
  RotateCcw, 
  Globe2, 
  Layers
} from 'lucide-react';

interface UniverseEngineProps {
  onSwitchToEarthWorld: () => void;
  onSwitchToSaturnWorld: () => void;
}

interface PlanetMeshNode {
  body: CelestialBody;
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  cloudMesh?: THREE.Mesh;
  ringsMesh?: THREE.Mesh;
  orbitLine: THREE.Line;
  currentAngle: number;
}

export const UniverseEngine: React.FC<UniverseEngineProps> = ({ onSwitchToEarthWorld, onSwitchToSaturnWorld }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<CelestialBody | null>(() => getCelestialBodyById('saturn') || null);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showOrbits, setShowOrbits] = useState<boolean>(true);
  const [webGlAvailable, setWebGlAvailable] = useState<boolean>(true);

  // References for Three.js scene loop
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const planetNodesRef = useRef<PlanetMeshNode[]>([]);
  const moonNodeRef = useRef<{ mesh: THREE.Mesh; angle: number; parentMesh: THREE.Mesh | null }>({
    mesh: null as unknown as THREE.Mesh,
    angle: 0,
    parentMesh: null
  });
  
  // Camera animation target
  const cameraTargetRef = useRef<{
    position: THREE.Vector3;
    lookAt: THREE.Vector3;
    isTransitioning: boolean;
  }>({
    position: new THREE.Vector3(0, 75, 140),
    lookAt: new THREE.Vector3(0, 0, 0),
    isTransitioning: false
  });

  // Focus a specific planet with smooth camera transition
  const handleFocusPlanet = useCallback((planetId: string) => {
    const body = getCelestialBodyById(planetId);
    if (!body) return;
    setSelectedPlanet(body);

    const node = planetNodesRef.current.find(n => n.body.id === planetId);
    if (node) {
      const worldPos = new THREE.Vector3();
      node.mesh.getWorldPosition(worldPos);

      // Position camera offset based on display size
      const dist = body.visual.displayRadius * 3.5 + 4;
      cameraTargetRef.current = {
        position: new THREE.Vector3(worldPos.x + dist * 0.8, worldPos.y + dist * 0.5, worldPos.z + dist),
        lookAt: worldPos.clone(),
        isTransitioning: true
      };
    } else if (planetId === 'sun') {
      cameraTargetRef.current = {
        position: new THREE.Vector3(0, 25, 38),
        lookAt: new THREE.Vector3(0, 0, 0),
        isTransitioning: true
      };
    }
  }, []);

  // Reset to full Solar System Overview
  const handleOverviewCamera = useCallback(() => {
    cameraTargetRef.current = {
      position: new THREE.Vector3(0, 110, 170),
      lookAt: new THREE.Vector3(0, 0, 0),
      isTransitioning: true
    };
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 85, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 2. WebGL Renderer with software fallback check
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch {
      setWebGlAvailable(false);
      return;
    }

    // 3. Deep Space Starfield Background
    const starsCount = 3500;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starsCount * 3);
    const starColors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount; i++) {
      const r = 400 + Math.random() * 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const colorMod = 0.75 + Math.random() * 0.25;
      starColors[i * 3] = colorMod;
      starColors[i * 3 + 1] = colorMod;
      starColors[i * 3 + 2] = 1.0;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.85 });
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    // 4. Central Sun & Lighting
    const sunBody = CELESTIAL_BODIES.find(b => b.id === 'sun')!;
    const sunGeo = new THREE.SphereGeometry(sunBody.visual.displayRadius, 64, 64);
    const sunTex = createSunTexture();
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTex });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.userData = { body: sunBody };
    scene.add(sunMesh);

    // Sun point light & ambient solar radiation
    const sunLight = new THREE.PointLight(0xfff6e6, 3.5, 600, 0.4);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x223355, 0.65);
    scene.add(ambientLight);

    // Sun atmospheric corona flare
    const coronaGeo = new THREE.SphereGeometry(sunBody.visual.displayRadius * 1.15, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.25,
      side: THREE.BackSide
    });
    const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    sunMesh.add(coronaMesh);

    // 5. Planetary System Construction
    const nodes: PlanetMeshNode[] = [];

    CELESTIAL_BODIES.filter(b => b.id !== 'sun' && b.id !== 'moon').forEach((body, idx) => {
      const pivot = new THREE.Group();
      scene.add(pivot);

      // Render Orbit Trajectory Line
      const orbitCurve = new THREE.EllipseCurve(0, 0, body.visual.orbitDistance, body.visual.orbitDistance, 0, Math.PI * 2, false, 0);
      const points = orbitCurve.getPoints(128);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0, p.y)));
      const orbitMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.22 });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      scene.add(orbitLine);

      // Create Planet Geometry & Procedural Material
      const sphereGeo = new THREE.SphereGeometry(body.visual.displayRadius, 48, 48);
      let planetMat: THREE.Material;

      if (body.id === 'earth') {
        const earthDayTex = createEarthDayTexture();
        planetMat = new THREE.MeshStandardMaterial({
          map: earthDayTex,
          roughness: 0.65,
          metalness: 0.1
        });
      } else if (body.id === 'saturn') {
        const saturnTex = createCelestialTexture('saturn_body');
        planetMat = new THREE.MeshStandardMaterial({
          map: saturnTex,
          roughness: 0.7,
          metalness: 0.05
        });
      } else if (body.id === 'jupiter') {
        const jupiterTex = createJupiterTexture();
        planetMat = new THREE.MeshStandardMaterial({
          map: jupiterTex,
          roughness: 0.6
        });
      } else if (body.id === 'mars') {
        const marsTex = createMarsTexture();
        planetMat = new THREE.MeshStandardMaterial({
          map: marsTex,
          roughness: 0.8
        });
      } else {
        const genTex = createCelestialTexture(body.id);
        planetMat = new THREE.MeshStandardMaterial({
          map: genTex,
          roughness: 0.75
        });
      }

      const planetMesh = new THREE.Mesh(sphereGeo, planetMat);
      planetMesh.position.set(body.visual.orbitDistance, 0, 0);
      planetMesh.rotation.z = (body.physical.axialTiltDegrees * Math.PI) / 180;
      planetMesh.userData = { body };
      pivot.add(planetMesh);

      let cloudMesh: THREE.Mesh | undefined;
      let ringsMesh: THREE.Mesh | undefined;

      // Special Layer: Earth Dynamic Clouds
      if (body.id === 'earth') {
        const cloudGeo = new THREE.SphereGeometry(body.visual.displayRadius * 1.025, 48, 48);
        const cloudTex = createEarthCloudTexture();
        const cloudMat = new THREE.MeshStandardMaterial({
          map: cloudTex,
          transparent: true,
          opacity: 0.75,
          blending: THREE.NormalBlending
        });
        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        planetMesh.add(cloudMesh);

        // Add Moon orbiting Earth
        const moonBody = getCelestialBodyById('moon')!;
        const moonGeo = new THREE.SphereGeometry(moonBody.visual.displayRadius, 24, 24);
        const moonTex = createCelestialTexture('moon');
        const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 0.9 });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.userData = { body: moonBody };
        planetMesh.add(moonMesh);
        moonNodeRef.current = { mesh: moonMesh, angle: 0, parentMesh: planetMesh };
      }

      // Special Layer: Saturn Magnificent Rings with Cassini Division
      // Matches the user-provided Cassini-Huygens reference (/public/assets/aistudio/image_4845819a.png)
      if (body.visual.rings) {
        const innerR = body.visual.displayRadius * body.visual.rings.innerRadiusRatio;
        const outerR = body.visual.displayRadius * body.visual.rings.outerRadiusRatio;
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 96);
        
        // Correct UV mapping for radial ring texture
        const pos = ringGeo.attributes.position;
        const uvs = [];
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vy = pos.getY(i);
          const dist = Math.sqrt(vx * vx + vy * vy);
          const u = (dist - innerR) / (outerR - innerR);
          uvs.push(u, 0.5);
        }
        ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        const ringTex = createSaturnRingTexture();
        const ringMat = new THREE.MeshStandardMaterial({
          map: ringTex,
          side: THREE.DoubleSide,
          transparent: true,
          roughness: 0.5,
          metalness: 0.1
        });
        ringsMesh = new THREE.Mesh(ringGeo, ringMat);
        ringsMesh.rotation.x = Math.PI / 2; // Flat in equator plane
        planetMesh.add(ringsMesh);
      }

      // Initial distributed orbit angle
      const initialAngle = (idx / 8) * Math.PI * 2;
      pivot.rotation.y = initialAngle;

      nodes.push({
        body,
        pivot,
        mesh: planetMesh,
        cloudMesh,
        ringsMesh,
        orbitLine,
        currentAngle: initialAngle
      });
    });

    planetNodesRef.current = nodes;

    // 6. Interactive Raycasting for Planet Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const interactiveMeshes = [sunMesh, ...nodes.map(n => n.mesh)];
      if (moonNodeRef.current.mesh) interactiveMeshes.push(moonNodeRef.current.mesh);

      const intersects = raycaster.intersectObjects(interactiveMeshes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData?.body) {
          handleFocusPlanet(hit.userData.body.id);
        }
      }
    };

    containerRef.current.addEventListener('pointerdown', handlePointerDown);

    // 7. Mouse Drag Rotation Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !cameraRef.current) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      // Orbit camera around target
      const cam = cameraRef.current;
      const radius = cam.position.length();
      const theta = Math.atan2(cam.position.x, cam.position.z) - deltaX * 0.005;
      const phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, Math.asin(cam.position.y / radius) + deltaY * 0.005));

      cam.position.x = radius * Math.cos(phi) * Math.sin(theta);
      cam.position.y = radius * Math.sin(phi);
      cam.position.z = radius * Math.cos(phi) * Math.cos(theta);
      cam.lookAt(cameraTargetRef.current.lookAt);
      cameraTargetRef.current.isTransitioning = false;
    };

    const onMouseUp = () => { isDragging = false; };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      cameraRef.current.position.multiplyScalar(factor);
      cameraRef.current.position.clampLength(12, 500);
      cameraTargetRef.current.isTransitioning = false;
    };

    const dom = containerRef.current;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // 8. Animation & Physics Loop
    let animId: number;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Rotate Sun
      sunMesh.rotation.y += 0.002;

      // Orbit and spin planets
      if (!isPaused) {
        const speedMultiplier = simSpeed * dt;

        nodes.forEach(node => {
          // Keplerian relative orbital angular velocity (faster inner, slower outer)
          const baseOrbitalSpeed = Math.sqrt(100 / (node.body.visual.orbitDistance || 1)) * 0.08;
          node.currentAngle += baseOrbitalSpeed * speedMultiplier;
          node.pivot.rotation.y = node.currentAngle;

          // Planetary self-rotation (diurnal spin)
          node.mesh.rotation.y += 0.015;

          // Earth Cloud Layer differential spin
          if (node.cloudMesh) {
            node.cloudMesh.rotation.y += 0.018;
          }
        });

        // Orbit Moon around Earth
        if (moonNodeRef.current.mesh) {
          moonNodeRef.current.angle += 0.3 * speedMultiplier;
          const moonDist = 5.2;
          moonNodeRef.current.mesh.position.set(
            Math.cos(moonNodeRef.current.angle) * moonDist,
            0,
            Math.sin(moonNodeRef.current.angle) * moonDist
          );
          moonNodeRef.current.mesh.rotation.y += 0.01;
        }
      }

      // Smooth Camera Transition (Exponential Damping)
      if (cameraTargetRef.current.isTransitioning && cameraRef.current) {
        const cam = cameraRef.current;
        const targetPos = cameraTargetRef.current.position;
        const targetLook = cameraTargetRef.current.lookAt;

        cam.position.lerp(targetPos, 0.05);
        cam.lookAt(targetLook);

        if (cam.position.distanceTo(targetPos) < 0.2) {
          cameraTargetRef.current.isTransitioning = false;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Listener
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [handleFocusPlanet, isPaused, simSpeed]);

  // Update orbit lines visibility
  useEffect(() => {
    planetNodesRef.current.forEach(node => {
      node.orbitLine.visible = showOrbits;
    });
  }, [showOrbits]);

  if (!webGlAvailable) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 text-white p-6">
        <div className="max-w-md text-center p-6 bg-red-950/40 border border-red-500/30 rounded-2xl">
          <h3 className="text-lg font-bold text-red-300 mb-2">WebGL Hardware Acceleration Needed</h3>
          <p className="text-sm text-white/70">
            三维宇宙引擎需要 WebGL 支持。请在浏览器设置中启用硬件加速以畅享太阳系与深空探索。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-black overflow-hidden select-none">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left Status & Mode Header */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-cyan-400">
            UNIVERSE ENGINE • SOLAR SYSTEM EXPLORER
          </span>
        </div>
        <p className="text-xs text-white/50 max-w-sm">
          基于 NASA 天体物理模型与卡西尼-惠更斯探测器观测数据构建的三维数字太阳系
        </p>
      </div>

      {/* Collapsible Celestial Selector Pill Bar */}
      <div className="absolute top-4 right-4 z-20 hidden md:flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl">
        {CELESTIAL_BODIES.map(body => (
          <button
            key={body.id}
            onClick={() => handleFocusPlanet(body.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedPlanet?.id === body.id
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            {body.chineseName}
          </button>
        ))}
      </div>

      {/* Bottom Horizontal Engine Control Dock */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-950/85 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/15 shadow-2xl">
        {/* Return to Earth Social World */}
        <button
          onClick={onSwitchToEarthWorld}
          className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-900/40 transition-all mr-2"
        >
          <Globe2 className="w-3.5 h-3.5" />
          <span>返回地球社交孪生 (Earth Social Twin)</span>
        </button>

        <div className="h-4 w-px bg-white/20 mx-1" />

        {/* Orbit Lines Toggle */}
        <button
          onClick={() => setShowOrbits(!showOrbits)}
          className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
            showOrbits ? 'bg-white/15 text-cyan-300' : 'text-white/60 hover:bg-white/10'
          }`}
          title="切换公转轨道线显示"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">轨道线</span>
        </button>

        {/* Reset / Solar Overview */}
        <button
          onClick={handleOverviewCamera}
          className="p-2 rounded-xl text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1"
          title="太阳系全景视角"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">全景</span>
        </button>

        {/* Simulation Speed Controls */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title={isPaused ? '恢复演化' : '暂停'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {[1, 5, 25].map(speed => (
            <button
              key={speed}
              onClick={() => {
                setSimSpeed(speed);
                setIsPaused(false);
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                simSpeed === speed && !isPaused
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Planet Telemetry Science Drawer */}
      <PlanetTelemetryDrawer
        planet={selectedPlanet}
        onClose={() => setSelectedPlanet(null)}
        onFocusPlanet={handleFocusPlanet}
        onSwitchToEarthWorld={onSwitchToEarthWorld}
        onSwitchToSaturnWorld={onSwitchToSaturnWorld}
      />
    </div>
  );
};
