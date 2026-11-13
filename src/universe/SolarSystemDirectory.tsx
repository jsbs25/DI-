/**
 * EARTH ONE - COSMOS PLANET SHOWCASE (宇宙浏览器风格 3D 星球主展台)
 * 
 * Features:
 * 1. Interactive 3D WebGL Rotating Planet Orb with atmosphere glow, procedural textures,
 *    and photorealistic Saturn ring system with Cassini division.
 * 2. Drag-to-rotate celestial orb with cosmic particle dust.
 * 3. Real astrophysical telemetry HUD (radius, mass, period, temperature).
 * 4. Direct portal into each celestial body's active ecosystem (土星影视、金星音乐馆、月球深空天文图库、太阳图书馆、木星浏览器等).
 * 5. Full compliance with static markup regression contracts.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Orbit, Compass, Sparkles, ExternalLink, ArrowRight, Eye, Layers } from 'lucide-react';
import { CELESTIAL_BODIES, CelestialBody, getCelestialBodyById } from './celestialBodies';
import { getPlanetEcosystem } from './planetEcosystems';
import {
  createEarthDayTexture,
  createEarthCloudTexture,
  createSaturnRingTexture,
  createJupiterTexture,
  createMarsTexture,
  createSunTexture,
  createCelestialTexture
} from './proceduralPlanets';

interface SolarSystemDirectoryProps {
  onSelectPlanet: (planetId: string) => void;
}

export const SolarSystemDirectory: React.FC<SolarSystemDirectoryProps> = ({ onSelectPlanet }) => {
  const [activePlanetId, setActivePlanetId] = useState<string>('earth');
  const activeBody = getCelestialBodyById(activePlanetId) || CELESTIAL_BODIES[3]; // Earth default
  const activeEcosystem = getPlanetEcosystem(activePlanetId);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const planetMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudMeshRef = useRef<THREE.Mesh | null>(null);
  const ringsMeshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });

  // Initialize and update 3D Planet Showcase
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 340;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.5);
    cameraRef.current = camera;

    // 2. Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunLight.position.set(5, 3, 4);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.6);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    // 4. Background Cosmic Star Dust Particles
    const starCount = 120;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 16;
      starPos[i + 1] = (Math.random() - 0.5) * 16;
      starPos[i + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.05, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 5. Planet Mesh Geometry & Texture
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    let material: THREE.Material;

    if (activeBody.id === 'earth') {
      material = new THREE.MeshStandardMaterial({
        map: createEarthDayTexture(),
        roughness: 0.6,
        metalness: 0.1
      });
      // Clouds
      const cloudGeo = new THREE.SphereGeometry(1.52, 48, 48);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: createEarthCloudTexture(),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
      });
      const clouds = new THREE.Mesh(cloudGeo, cloudMat);
      scene.add(clouds);
      cloudMeshRef.current = clouds;
    } else if (activeBody.id === 'saturn') {
      material = new THREE.MeshStandardMaterial({
        map: createCelestialTexture('saturn_body'),
        roughness: 0.8
      });
      // Rings with Cassini division
      const ringGeo = new THREE.RingGeometry(1.9, 3.2, 64);
      const ringMat = new THREE.MeshStandardMaterial({
        map: createSaturnRingTexture(),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88
      });
      const rings = new THREE.Mesh(ringGeo, ringMat);
      rings.rotation.x = Math.PI * 0.42;
      rings.rotation.y = Math.PI * 0.08;
      scene.add(rings);
      ringsMeshRef.current = rings;
    } else if (activeBody.id === 'jupiter') {
      material = new THREE.MeshStandardMaterial({
        map: createJupiterTexture(),
        roughness: 0.7
      });
    } else if (activeBody.id === 'mars') {
      material = new THREE.MeshStandardMaterial({
        map: createMarsTexture(),
        roughness: 0.85
      });
    } else if (activeBody.id === 'sun') {
      material = new THREE.MeshBasicMaterial({
        map: createSunTexture()
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        map: createCelestialTexture(activeBody.id),
        roughness: 0.75
      });
    }

    const planetMesh = new THREE.Mesh(geometry, material);
    scene.add(planetMesh);
    planetMeshRef.current = planetMesh;

    // 6. Animation Loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (planetMeshRef.current) {
        planetMeshRef.current.rotation.y += 0.003;
      }
      if (cloudMeshRef.current) {
        cloudMeshRef.current.rotation.y += 0.004;
      }
      if (ringsMeshRef.current) {
        ringsMeshRef.current.rotation.z += 0.001;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 340;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      geometry.dispose();
    };
  }, [activeBody]);

  // Drag to spin planet
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !planetMeshRef.current) return;
    const deltaX = e.clientX - prevMouseRef.current.x;
    const deltaY = e.clientY - prevMouseRef.current.y;

    planetMeshRef.current.rotation.y += deltaX * 0.01;
    planetMeshRef.current.rotation.x += deltaY * 0.01;

    if (cloudMeshRef.current) {
      cloudMeshRef.current.rotation.y += deltaX * 0.01;
    }
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <section
      aria-labelledby="solar-system-heading"
      className="relative z-10 w-full border-t border-slate-800/80 bg-[radial-gradient(ellipse_at_50%_0%,rgba(14,165,233,0.08),transparent_60%),#020511] px-4 py-12 sm:px-8 lg:px-12 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-mono font-semibold mb-2">
              <Orbit className="w-3.5 h-3.5 animate-spin-slow" />
              <span>EARTH ONE · COSMOS BROWSER ENGINE</span>
            </div>
            <h2 id="solar-system-heading" className="text-2xl font-extrabold text-white sm:text-4xl tracking-tight">
              太阳系 · 10 个天体
            </h2>
            <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-300">
              地球是人类主世界；从太阳、月球到八大行星，可进入各自已开放的数字生态，未开放的生态会明确标注建设状态。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectPlanet('')}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-600/30 to-blue-600/30 px-5 py-2.5 text-xs font-bold text-cyan-100 transition-all hover:scale-105 hover:border-cyan-300 hover:text-white shadow-lg shadow-cyan-950 cursor-pointer"
          >
            <Orbit className="h-4 w-4 text-cyan-300" />
            <span>浏览 3D 太阳系</span>
          </button>
        </div>

        {/* 3D Cosmos Planet Showcase (GitHub 宇宙浏览器同款 3D 旋转星球展台) */}
        <div className="mb-10 rounded-3xl border border-slate-800/80 bg-gradient-to-r from-slate-950/90 via-[#070d1e]/80 to-slate-950/90 p-6 lg:p-8 shadow-2xl backdrop-blur-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden">
          {/* Background Ambient Glow */}
          <div
            className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 rounded-full blur-[140px] pointer-events-none opacity-40"
            style={{ backgroundColor: activeBody.visual.baseColor }}
          />

          {/* Left: 3D Rotating Planet Canvas */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center relative">
            <div
              ref={canvasContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-72 sm:h-80 cursor-grab active:cursor-grabbing relative flex items-center justify-center select-none"
              title="按住鼠标拖拽可 360° 旋转星球"
            />
            <div className="mt-2 text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>按住鼠标拖拽自由旋转天体 · 真实光照与物理自转</span>
            </div>
          </div>

          {/* Right: Astrophysical Telemetry & Active Ecosystem Portal */}
          <div className="lg:col-span-6 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: activeBody.visual.baseColor, boxShadow: `0 0 12px ${activeBody.visual.baseColor}` }}
                />
                <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                  {activeBody.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {activeBody.humanityRole.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <h3 className="mt-1.5 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {activeBody.chineseName}
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {activeBody.humanityRole.description}
              </p>
            </div>

            {/* Astrophysical Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-mono">轨道半长轴</div>
                <div className="text-xs sm:text-sm font-bold text-white font-mono mt-0.5 truncate">{activeBody.physical.meanOrbitRadiusAU} AU</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-mono">平均半径</div>
                <div className="text-xs sm:text-sm font-bold text-white font-mono mt-0.5 truncate">{activeBody.physical.meanRadiusKm.toLocaleString()} km</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-mono">表面重力</div>
                <div className="text-xs sm:text-sm font-bold text-white font-mono mt-0.5 truncate">{activeBody.physical.surfaceGravityMps2} m/s²</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-mono">表面平均温</div>
                <div className="text-xs sm:text-sm font-bold text-white font-mono mt-0.5 truncate">{Math.round(activeBody.physical.surfaceTempKelvin.mean - 273.15)}°C</div>
              </div>
            </div>

            {/* Planet Portal Action */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectPlanet(activeBody.id)}
                className={`inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r ${activeEcosystem?.buttonClass || 'from-cyan-600 to-blue-600'} px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer`}
              >
                <span>
                  {activeBody.id === 'venus'
                    ? '进入创作工坊与金星音乐馆'
                    : `进入${activeEcosystem?.titleZh || activeBody.chineseName}`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectPlanet(activeBody.id)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>3D 轨道特写对焦</span>
              </button>
            </div>
          </div>
        </div>

        {/* 10 Celestial Bodies Quick Selector Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CELESTIAL_BODIES.map(body => {
            const ecosystem = getPlanetEcosystem(body.id);
            const isCurrent = activePlanetId === body.id;

            return (
              <button
                key={body.id}
                type="button"
                onClick={() => {
                  setActivePlanetId(body.id);
                }}
                aria-label={`探索${body.chineseName}，${body.id === 'venus' ? '进入创作工坊与金星音乐馆' : `进入${ecosystem?.titleZh}`}`}
                className={`group min-h-32 rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                  isCurrent
                    ? 'border-cyan-400/80 bg-cyan-950/30 shadow-lg shadow-cyan-950/60 ring-1 ring-cyan-400/50 -translate-y-1'
                    : 'border-slate-800/80 bg-slate-950/60 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 rounded-full border border-white/20 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: body.visual.baseColor, boxShadow: `0 0 20px ${body.visual.baseColor}66` }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm sm:text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {body.chineseName}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400 font-mono">
                      {body.name}
                    </span>
                  </span>
                </span>
                <span className="mt-3.5 block text-xs text-slate-400 truncate">
                  {body.id === 'venus' ? '进入创作工坊与金星音乐馆' : `进入${ecosystem?.titleZh || body.chineseName}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
