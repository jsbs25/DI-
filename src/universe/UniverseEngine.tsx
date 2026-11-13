/**
 * EARTH ONE - UNIVERSE ENGINE
 * Interactive Solar System & Celestial Explorer
 *
 * Preserves real Three.js/WebGL engine: Sun, 8 planets, Earth-Moon, Saturn rings
 * with Cassini division, procedural textures, raycast focus, camera controls,
 * orbital simulation, and ecosystem/telemetry integration.
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
import { getPlanetEcosystem } from './planetEcosystems';
import {
  Play,
  Pause,
  Maximize2,
  Globe2,
  Layers,
  Compass,
  Orbit,
  Sparkles
} from 'lucide-react';

interface UniverseEngineProps {
  onSwitchToEarthWorld: () => void;
  onEnterEcosystem?: (planetId: string) => void;
  initialPlanetId?: string;
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

export const UniverseEngine: React.FC<UniverseEngineProps> = ({
  onSwitchToEarthWorld,
  onEnterEcosystem,
  initialPlanetId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<CelestialBody | null>(
    () => getCelestialBodyById(initialPlanetId || 'saturn') || null
  );
  const initialFocusRequestedRef = useRef(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showOrbits, setShowOrbits] = useState<boolean>(true);
  const [webGlAvailable, setWebGlAvailable] = useState<boolean>(true);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const planetNodesRef = useRef<PlanetMeshNode[]>([]);
  const orbitVisibleRef = useRef<boolean>(true);
  const moonNodeRef = useRef<{ mesh: THREE.Mesh | null; angle: number; parentMesh: THREE.Mesh | null }>({
    mesh: null,
    angle: 0,
    parentMesh: null
  });

  // Simulation refs to avoid scene rebuild on control changes
  const simSpeedRef = useRef(simSpeed);
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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

  const focusCameraOnWorldPosition = useCallback((worldPos: THREE.Vector3, distance: number) => {
    cameraTargetRef.current = {
      position: new THREE.Vector3(worldPos.x + distance * 0.8, worldPos.y + distance * 0.5, worldPos.z + distance),
      lookAt: worldPos.clone(),
      isTransitioning: true
    };
  }, []);

  // Focus a specific planet with smooth camera transition
  const handleFocusPlanet = useCallback(
    (planetId: string) => {
      const body = getCelestialBodyById(planetId);
      if (!body) return;
      setSelectedPlanet(body);

      const node = planetNodesRef.current.find((n) => n.body.id === planetId);
      if (node) {
        const worldPos = new THREE.Vector3();
        node.mesh.getWorldPosition(worldPos);
        const dist = body.visual.displayRadius * 3.5 + 4;
        focusCameraOnWorldPosition(worldPos, dist);
      } else if (planetId === 'sun') {
        cameraTargetRef.current = {
          position: new THREE.Vector3(0, 25, 38),
          lookAt: new THREE.Vector3(0, 0, 0),
          isTransitioning: true
        };
      }
    },
    [focusCameraOnWorldPosition]
  );

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
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020409);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 85, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch {
      setWebGlAvailable(false);
      return;
    }

    const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
    const track = <T extends THREE.BufferGeometry | THREE.Material>(obj: T): T => {
      disposables.push(obj);
      return obj;
    };

    // Starfield
    const starsCount = 3500;
    const starGeometry = track(new THREE.BufferGeometry());
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
    const starMaterial = track(
      new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.8 })
    );
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    // Sun & lighting
    const sunBody = CELESTIAL_BODIES.find((b) => b.id === 'sun')!;
    const sunGeo = track(new THREE.SphereGeometry(sunBody.visual.displayRadius, 64, 64));
    const sunTex = createSunTexture();
    const sunMat = track(new THREE.MeshBasicMaterial({ map: sunTex }));
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.userData = { body: sunBody };
    scene.add(sunMesh);

    const sunLight = new THREE.PointLight(0xfff6e6, 3.2, 650, 0.45);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x223355, 0.6);
    scene.add(ambientLight);

    const coronaGeo = track(new THREE.SphereGeometry(sunBody.visual.displayRadius * 1.12, 32, 32));
    const coronaMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xffaa55,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide
      })
    );
    const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    sunMesh.add(coronaMesh);

    // Planets
    const nodes: PlanetMeshNode[] = [];
    const planetBodies = CELESTIAL_BODIES.filter((b) => b.id !== 'sun' && b.id !== 'moon');

    planetBodies.forEach((body, idx) => {
      const pivot = new THREE.Group();
      scene.add(pivot);

      const orbitCurve = new THREE.EllipseCurve(
        0,
        0,
        body.visual.orbitDistance,
        body.visual.orbitDistance,
        0,
        Math.PI * 2,
        false,
        0
      );
      const points = orbitCurve.getPoints(128);
      const orbitGeo = track(
        new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0, p.y)))
      );
      const orbitMat = track(
        new THREE.LineBasicMaterial({ color: 0x6b8aa6, transparent: true, opacity: 0.22 })
      );
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      orbitLine.visible = orbitVisibleRef.current;
      scene.add(orbitLine);

      const sphereGeo = track(new THREE.SphereGeometry(body.visual.displayRadius, 48, 48));
      let planetMat: THREE.Material;

      if (body.id === 'earth') {
        planetMat = track(
          new THREE.MeshStandardMaterial({ map: createEarthDayTexture(), roughness: 0.65, metalness: 0.08 })
        );
      } else if (body.id === 'saturn') {
        planetMat = track(
          new THREE.MeshStandardMaterial({ map: createCelestialTexture('saturn_body'), roughness: 0.72, metalness: 0.04 })
        );
      } else if (body.id === 'jupiter') {
        planetMat = track(new THREE.MeshStandardMaterial({ map: createJupiterTexture(), roughness: 0.62 }));
      } else if (body.id === 'mars') {
        planetMat = track(new THREE.MeshStandardMaterial({ map: createMarsTexture(), roughness: 0.82 }));
      } else {
        planetMat = track(new THREE.MeshStandardMaterial({ map: createCelestialTexture(body.id), roughness: 0.75 }));
      }

      const planetMesh = new THREE.Mesh(sphereGeo, planetMat);
      planetMesh.position.set(body.visual.orbitDistance, 0, 0);
      planetMesh.rotation.z = (body.physical.axialTiltDegrees * Math.PI) / 180;
      planetMesh.userData = { body };
      pivot.add(planetMesh);

      let cloudMesh: THREE.Mesh | undefined;
      let ringsMesh: THREE.Mesh | undefined;

      if (body.id === 'earth') {
        const cloudGeo = track(new THREE.SphereGeometry(body.visual.displayRadius * 1.025, 48, 48));
        const cloudMat = track(
          new THREE.MeshStandardMaterial({
            map: createEarthCloudTexture(),
            transparent: true,
            opacity: 0.72,
            blending: THREE.NormalBlending,
            depthWrite: false
          })
        );
        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        planetMesh.add(cloudMesh);

        const moonBody = getCelestialBodyById('moon')!;
        const moonGeo = track(new THREE.SphereGeometry(moonBody.visual.displayRadius, 24, 24));
        const moonMat = track(
          new THREE.MeshStandardMaterial({ map: createCelestialTexture('moon'), roughness: 0.92 })
        );
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.userData = { body: moonBody };
        planetMesh.add(moonMesh);
        moonNodeRef.current = { mesh: moonMesh, angle: 0, parentMesh: planetMesh };
      }

      if (body.visual.rings) {
        const innerR = body.visual.displayRadius * body.visual.rings.innerRadiusRatio;
        const outerR = body.visual.displayRadius * body.visual.rings.outerRadiusRatio;
        const ringGeo = track(new THREE.RingGeometry(innerR, outerR, 96));
        const pos = ringGeo.attributes.position;
        const uvs: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vy = pos.getY(i);
          const dist = Math.sqrt(vx * vx + vy * vy);
          const u = (dist - innerR) / (outerR - innerR);
          uvs.push(u, 0.5);
        }
        ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        const ringMat = track(
          new THREE.MeshStandardMaterial({
            map: createSaturnRingTexture(),
            side: THREE.DoubleSide,
            transparent: true,
            roughness: 0.55,
            metalness: 0.08,
            depthWrite: false
          })
        );
        ringsMesh = new THREE.Mesh(ringGeo, ringMat);
        ringsMesh.rotation.x = Math.PI / 2;
        planetMesh.add(ringsMesh);
      }

      const initialAngle = (idx / planetBodies.length) * Math.PI * 2;
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

    if (initialPlanetId && !initialFocusRequestedRef.current) {
      initialFocusRequestedRef.current = true;
      // defer to next tick so refs/nodes are ready
      requestAnimationFrame(() => handleFocusPlanet(initialPlanetId));
    }

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current || !cameraRef.current) return;
      // ignore if it was a drag end handled separately? simple pick
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current);
      const interactiveMeshes: THREE.Object3D[] = [sunMesh, ...nodes.map((n) => n.mesh)];
      if (moonNodeRef.current.mesh) interactiveMeshes.push(moonNodeRef.current.mesh);
      const intersects = raycaster.intersectObjects(interactiveMeshes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData?.body) {
          handleFocusPlanet(hit.userData.body.id);
        }
      }
    };

    // Controls
    let isDragging = false;
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onPointerDownDrag = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMoveDrag = (e: PointerEvent) => {
      if (!isDragging || !cameraRef.current) return;
      const totalDx = e.clientX - dragStartX;
      const totalDy = e.clientY - dragStartY;
      if (Math.abs(totalDx) + Math.abs(totalDy) > 4) dragMoved = true;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      const cam = cameraRef.current;
      const radius = cam.position.length();
      const theta = Math.atan2(cam.position.x, cam.position.z) - deltaX * 0.005;
      const phi = Math.max(
        0.12,
        Math.min(Math.PI / 2 - 0.06, Math.asin(Math.min(0.999, Math.max(-0.999, cam.position.y / radius))) + deltaY * 0.005)
      );

      cam.position.x = radius * Math.cos(phi) * Math.sin(theta);
      cam.position.y = radius * Math.sin(phi);
      cam.position.z = radius * Math.cos(phi) * Math.cos(theta);
      cam.lookAt(cameraTargetRef.current.lookAt);
      cameraTargetRef.current.isTransitioning = false;
    };

    const onPointerUpDrag = (e: PointerEvent) => {
      if (isDragging && !dragMoved) {
        handlePointerDown(e);
      }
      isDragging = false;
      dragMoved = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      cameraRef.current.position.multiplyScalar(factor);
      const len = cameraRef.current.position.length();
      if (len < 12) cameraRef.current.position.setLength(12);
      if (len > 520) cameraRef.current.position.setLength(520);
      cameraTargetRef.current.isTransitioning = false;
    };

    container.addEventListener('pointerdown', onPointerDownDrag);
    window.addEventListener('pointermove', onPointerMoveDrag);
    window.addEventListener('pointerup', onPointerUpDrag);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    let animId = 0;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      sunMesh.rotation.y += 0.002;

      if (!isPausedRef.current) {
        const speedMultiplier = simSpeedRef.current * dt;
        nodes.forEach((node) => {
          const baseOrbitalSpeed = Math.sqrt(100 / (node.body.visual.orbitDistance || 1)) * 0.08;
          node.currentAngle += baseOrbitalSpeed * speedMultiplier;
          node.pivot.rotation.y = node.currentAngle;
          node.mesh.rotation.y += 0.015;
          if (node.cloudMesh) node.cloudMesh.rotation.y += 0.018;
        });
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

      if (cameraTargetRef.current.isTransitioning && cameraRef.current) {
        const cam = cameraRef.current;
        const targetPos = cameraTargetRef.current.position;
        const targetLook = cameraTargetRef.current.lookAt;
        cam.position.lerp(targetPos, 0.05);
        // smooth lookAt by moving camera orientation toward target (approximate)
        const currentDir = new THREE.Vector3();
        cam.getWorldDirection(currentDir);
        const desiredDir = targetLook.clone().sub(cam.position).normalize();
        currentDir.lerp(desiredDir, 0.08).normalize();
        cam.lookAt(cam.position.clone().add(currentDir));
        if (cam.position.distanceTo(targetPos) < 0.25) {
          cam.lookAt(targetLook);
          cameraTargetRef.current.isTransitioning = false;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', onPointerDownDrag);
      window.removeEventListener('pointermove', onPointerMoveDrag);
      window.removeEventListener('pointerup', onPointerUpDrag);
      container.removeEventListener('wheel', onWheel);

      if (container && renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      // Dispose scene resources (geometries/materials). Procedural textures are cached in module.
      disposables.forEach((d) => d.dispose());
      renderer.dispose();

      planetNodesRef.current = [];
      moonNodeRef.current = { mesh: null, angle: 0, parentMesh: null };
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [handleFocusPlanet, initialPlanetId]);

  // Orbit lines visibility
  useEffect(() => {
    orbitVisibleRef.current = showOrbits;
    planetNodesRef.current.forEach((node) => {
      node.orbitLine.visible = showOrbits;
    });
  }, [showOrbits]);

  if (!webGlAvailable) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center p-6" style={{ background: 'var(--color-one-bg)' }}>
        <div className="one-surface-elevated max-w-md p-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border" style={{ borderColor: 'rgba(227,179,65,0.3)', background: 'rgba(227,179,65,0.1)', color: 'var(--color-one-warning)' }}>
            <Orbit className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-[color:var(--color-one-text)]">需要 WebGL 支持</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-one-text-muted)]">
            三维宇宙引擎需要 WebGL。请在浏览器设置中启用硬件加速后重新打开。
          </p>
        </div>
      </div>
    );
  }

  const selectedEco = selectedPlanet ? getPlanetEcosystem(selectedPlanet.id) : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden select-none" style={{ background: '#020409' }}>
      {/* Three.js Canvas */}
      <div ref={containerRef} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" />

      {/* Top HUD */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[min(92vw,420px)] flex-col gap-2 sm:left-5 sm:top-5">
        <div className="one-surface-subtle pointer-events-auto inline-flex w-fit items-center gap-2 px-3 py-2" style={{ background: 'rgba(14,19,27,0.7)', backdropFilter: 'blur(12px)' }}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: 'var(--color-one-accent)' }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--color-one-accent)' }} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-one-accent)' }}>
            ONE UNIVERSE
          </span>
        </div>
        <div className="pointer-events-auto rounded-2xl border px-3.5 py-3" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.62)', backdropFilter: 'blur(12px)' }}>
          <p className="text-sm font-medium tracking-[0.08em] text-[color:var(--color-one-text)]">One World. Infinite Possibilities.</p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--color-one-text-muted)]">
            真实 3D 太阳系与空间入口。拖拽旋转视角，滚轮缩放，点选天体查看真实信息与可用空间。
          </p>
        </div>
      </div>

      {/* Space selector (desktop) */}
      <div
        className="absolute right-4 top-4 z-20 hidden max-w-[46vw] flex-wrap justify-end gap-1.5 rounded-2xl border p-2 md:flex"
        style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.66)', backdropFilter: 'blur(14px)' }}
      >
        {CELESTIAL_BODIES.map((body) => {
          const eco = getPlanetEcosystem(body.id);
          const active = selectedPlanet?.id === body.id;
          const label = eco ? eco.titleZh : body.chineseName;
          return (
            <button
              key={body.id}
              onClick={() => handleFocusPlanet(body.id)}
              className="rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all"
              title={`${body.chineseName} · ${eco ? `${eco.titleZh} / ${eco.titleEn}` : body.name}`}
              style={
                active
                  ? {
                      color: 'var(--color-one-text)',
                      background: 'rgba(127,212,255,0.16)',
                      border: '1px solid rgba(127,212,255,0.3)'
                    }
                  : {
                      color: 'var(--color-one-text-muted)',
                      background: 'rgba(244,243,238,0.03)',
                      border: '1px solid transparent'
                    }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Mobile quick selector */}
      <div className="absolute inset-x-3 top-[7.5rem] z-20 md:hidden">
        <div
          className="flex gap-1.5 overflow-x-auto rounded-2xl border p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.66)', backdropFilter: 'blur(14px)' }}
        >
          {CELESTIAL_BODIES.map((body) => {
            const eco = getPlanetEcosystem(body.id);
            const active = selectedPlanet?.id === body.id;
            const label = eco ? eco.titleZh : body.chineseName;
            return (
              <button
                key={body.id}
                onClick={() => handleFocusPlanet(body.id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                style={
                  active
                    ? { color: 'var(--color-one-text)', background: 'rgba(127,212,255,0.16)', border: '1px solid rgba(127,212,255,0.3)' }
                    : { color: 'var(--color-one-text-muted)', background: 'rgba(244,243,238,0.03)', border: '1px solid var(--color-one-border)' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected space hint */}
      {selectedPlanet && selectedEco && (
        <div className="pointer-events-none absolute left-4 top-[10.8rem] z-20 hidden max-w-sm sm:left-5 md:top-[5.5rem] md:block lg:top-24">
          <div
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border px-3.5 py-3"
            style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.6)', backdropFilter: 'blur(12px)' }}
          >
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
              style={{ borderColor: 'rgba(244,243,238,0.18)', background: 'rgba(244,243,238,0.04)', color: 'var(--color-one-text)' }}
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[color:var(--color-one-text-dim)]">{selectedPlanet.chineseName} · {selectedPlanet.name}</p>
              <p className="mt-0.5 text-sm font-medium text-[color:var(--color-one-text)]">{selectedEco.titleZh}</p>
              <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-one-text-muted)]">{selectedEco.descriptionZh}</p>
            </div>
          </div>
        </div>
      )}

      {/* Control dock */}
      <div
        className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-2xl border px-2.5 py-2 md:bottom-5 md:gap-2 md:px-3"
        style={{ borderColor: 'var(--color-one-border-strong)', background: 'rgba(14,19,27,0.78)', backdropFilter: 'blur(16px)', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}
      >
        <button onClick={onSwitchToEarthWorld} className="one-btn one-btn-sm one-btn-primary shrink-0 whitespace-nowrap">
          <Globe2 className="h-4 w-4" />
          <span>返回地球世界</span>
        </button>

        <div className="mx-0.5 h-5 w-px shrink-0" style={{ background: 'var(--color-one-border)' }} />

        <button
          onClick={() => setShowOrbits((v) => !v)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition"
          style={
            showOrbits
              ? { color: 'var(--color-one-accent)', background: 'rgba(127,212,255,0.12)', border: '1px solid rgba(127,212,255,0.22)' }
              : { color: 'var(--color-one-text-muted)', border: '1px solid transparent' }
          }
          title="显示/隐藏轨道"
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">轨道</span>
        </button>

        <button
          onClick={handleOverviewCamera}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[color:var(--color-one-text-muted)] transition hover:bg-[rgba(244,243,238,0.06)] hover:text-[color:var(--color-one-text)]"
          title="全景视角"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">全景</span>
        </button>

        <button
          onClick={() => selectedPlanet && handleFocusPlanet(selectedPlanet.id)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[color:var(--color-one-text-muted)] transition hover:bg-[rgba(244,243,238,0.06)] hover:text-[color:var(--color-one-text)]"
          title="对焦当前天体"
          disabled={!selectedPlanet}
        >
          <Compass className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">对焦</span>
        </button>

        <div className="mx-0.5 h-5 w-px shrink-0" style={{ background: 'var(--color-one-border)' }} />

        <div className="flex shrink-0 items-center gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}>
          <button
            onClick={() => setIsPaused((p) => !p)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[rgba(244,243,238,0.08)]"
            title={isPaused ? '继续' : '暂停'}
            style={{ color: isPaused ? 'var(--color-one-success)' : 'var(--color-one-text-muted)' }}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          {[1, 5, 25].map((speed) => {
            const active = simSpeed === speed && !isPaused;
            return (
              <button
                key={speed}
                onClick={() => {
                  setSimSpeed(speed);
                  setIsPaused(false);
                }}
                className="rounded-md px-2 py-1 font-mono text-[11px] font-medium transition"
                style={
                  active
                    ? { color: 'var(--color-one-accent)', background: 'rgba(127,212,255,0.14)' }
                    : { color: 'var(--color-one-text-dim)' }
                }
              >
                {speed}x
              </button>
            );
          })}
        </div>
      </div>

      {/* Telemetry drawer */}
      <PlanetTelemetryDrawer
        planet={selectedPlanet}
        onClose={() => setSelectedPlanet(null)}
        onFocusPlanet={handleFocusPlanet}
        onEnterEcosystem={onEnterEcosystem}
      />
    </div>
  );
};
