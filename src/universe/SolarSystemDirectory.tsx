/**
 * EARTH ONE - COSMOS PLANET SHOWCASE (3D directory/showcase)
 *
 * Preserves real Three.js showcase, drag-to-rotate, procedural textures/rings/clouds,
 * real celestial/mission data and ecosystem entry mapping.
 * Not currently mounted in App routing but kept as a functional, styled component.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Orbit, Compass, ArrowRight, Eye } from 'lucide-react';
import { CELESTIAL_BODIES, getCelestialBodyById } from './celestialBodies';
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

  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const activePlanetMeshRef = useRef<THREE.Mesh | null>(null);
  const activeCloudMeshRef = useRef<THREE.Mesh | null>(null);

  // Initialize and update 3D Planet Showcase
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 340;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
    const track = <T extends THREE.BufferGeometry | THREE.Material>(obj: T): T => {
      disposables.push(obj);
      return obj;
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xfff7e8, 1.7);
    sunLight.position.set(5, 3, 4);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0x7fd4ff, 0.45);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    const starCount = 140;
    const starGeo = track(new THREE.BufferGeometry());
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 16;
      starPos[i + 1] = (Math.random() - 0.5) * 16;
      starPos[i + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = track(new THREE.PointsMaterial({ color: 0xb7bdc8, size: 0.045, transparent: true, opacity: 0.6 }));
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const geometry = track(new THREE.SphereGeometry(1.5, 64, 64));
    let material: THREE.Material;
    let cloudMesh: THREE.Mesh | undefined;
    let ringsMesh: THREE.Mesh | undefined;

    if (activeBody.id === 'earth') {
      material = track(new THREE.MeshStandardMaterial({ map: createEarthDayTexture(), roughness: 0.62, metalness: 0.08 }));
      const cloudGeo = track(new THREE.SphereGeometry(1.52, 48, 48));
      const cloudMat = track(
        new THREE.MeshStandardMaterial({
          map: createEarthCloudTexture(),
          transparent: true,
          opacity: 0.42,
          blending: THREE.NormalBlending,
          depthWrite: false
        })
      );
      cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
      scene.add(cloudMesh);
    } else if (activeBody.id === 'saturn') {
      material = track(new THREE.MeshStandardMaterial({ map: createCelestialTexture('saturn_body'), roughness: 0.78 }));
      const ringGeo = track(new THREE.RingGeometry(1.9, 3.2, 96));
      // radial UVs for ring texture
      const pos = ringGeo.attributes.position;
      const uvs: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const dist = Math.sqrt(vx * vx + vy * vy);
        uvs.push((dist - 1.9) / (3.2 - 1.9), 0.5);
      }
      ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const ringMat = track(
        new THREE.MeshStandardMaterial({
          map: createSaturnRingTexture(),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          depthWrite: false
        })
      );
      ringsMesh = new THREE.Mesh(ringGeo, ringMat);
      ringsMesh.rotation.x = Math.PI * 0.42;
      ringsMesh.rotation.y = Math.PI * 0.08;
      scene.add(ringsMesh);
    } else if (activeBody.id === 'jupiter') {
      material = track(new THREE.MeshStandardMaterial({ map: createJupiterTexture(), roughness: 0.7 }));
    } else if (activeBody.id === 'mars') {
      material = track(new THREE.MeshStandardMaterial({ map: createMarsTexture(), roughness: 0.85 }));
    } else if (activeBody.id === 'sun') {
      material = track(new THREE.MeshBasicMaterial({ map: createSunTexture() }));
    } else {
      material = track(new THREE.MeshStandardMaterial({ map: createCelestialTexture(activeBody.id), roughness: 0.75 }));
    }

    const planetMesh = new THREE.Mesh(geometry, material);
    scene.add(planetMesh);
    activePlanetMeshRef.current = planetMesh;
    activeCloudMeshRef.current = cloudMesh || null;

    let animFrame = 0;
    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      if (planetMesh) planetMesh.rotation.y += 0.003;
      if (cloudMesh) cloudMesh.rotation.y += 0.004;
      if (ringsMesh) ringsMesh.rotation.z += 0.0008;
      stars.rotation.y += 0.00015;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 340;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrame);
      if (container && renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      activePlanetMeshRef.current = null;
      activeCloudMeshRef.current = null;
    };
  }, [activeBody]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !activePlanetMeshRef.current) return;
    const deltaX = e.clientX - prevMouseRef.current.x;
    const deltaY = e.clientY - prevMouseRef.current.y;
    activePlanetMeshRef.current.rotation.y += deltaX * 0.01;
    activePlanetMeshRef.current.rotation.x += deltaY * 0.01;
    if (activeCloudMeshRef.current) activeCloudMeshRef.current.rotation.y += deltaX * 0.01;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <section
      aria-labelledby="solar-system-heading"
      className="relative z-10 w-full overflow-hidden border-t px-4 py-10 sm:px-6 lg:px-10"
      style={{ borderColor: 'var(--color-one-border)', background: 'linear-gradient(180deg, rgba(5,7,11,0.85), rgba(3,5,8,0.95))' }}
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="one-badge one-badge-accent mb-2 inline-flex items-center gap-1.5">
              <Orbit className="h-3.5 w-3.5" />
              <span>ONE UNIVERSE · SPACE DIRECTORY</span>
            </div>
            <h2 id="solar-system-heading" className="text-2xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-3xl lg:text-4xl">
              ONE UNIVERSE
            </h2>
            <p className="mt-1 text-sm font-medium tracking-[0.12em] text-[color:var(--color-one-text-muted)]">One World. Infinite Possibilities.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-one-text-muted)]">
              真实 3D 天体与空间入口。每个天体对应已开放或建设中的数字空间，信息与入口均以真实生态映射为准。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectPlanet('')}
            className="one-btn one-btn-md one-btn-secondary shrink-0"
          >
            <Orbit className="h-4 w-4" />
            <span>进入 3D 太阳系</span>
          </button>
        </div>

        <div className="one-surface-elevated mb-8 grid grid-cols-1 items-center gap-6 overflow-hidden p-5 lg:grid-cols-12 lg:gap-8 lg:p-7">
          <div className="relative lg:col-span-6">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
              style={{ background: `radial-gradient(circle, ${activeBody.visual.baseColor}, transparent 70%)` }}
            />
            <div
              ref={canvasContainerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="relative flex h-72 w-full cursor-grab select-none items-center justify-center touch-none active:cursor-grabbing sm:h-80"
              title="拖拽旋转天体"
            />
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[color:var(--color-one-text-dim)]">
              <Compass className="h-3.5 w-3.5" style={{ color: 'var(--color-one-accent)' }} />
              <span>拖拽旋转 · 真实光照与纹理渲染</span>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeBody.visual.baseColor, boxShadow: `0 0 10px ${activeBody.visual.baseColor}` }} />
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">{activeBody.name}</span>
                <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{activeBody.type.replace(/_/g, ' ')}</span>
              </div>
              <h3 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-4xl">{activeBody.chineseName}</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-one-text-muted)]">{activeBody.humanityRole.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoCell label="轨道半长轴" value={`${activeBody.physical.meanOrbitRadiusAU} AU`} />
              <InfoCell label="平均半径" value={`${activeBody.physical.meanRadiusKm.toLocaleString()} km`} />
              <InfoCell label="表面重力" value={`${activeBody.physical.surfaceGravityMps2} m/s²`} />
              <InfoCell label="平均温度" value={`${Math.round(activeBody.physical.surfaceTempKelvin.mean - 273.15)}°C`} />
            </div>

            <div
              className="rounded-xl border p-3.5"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">对应空间</p>
              {activeEcosystem ? (
                <>
                  <p className="mt-1 text-sm font-medium text-[color:var(--color-one-text)]">
                    {activeEcosystem.titleZh} <span className="font-normal text-[color:var(--color-one-text-dim)]">· {activeEcosystem.titleEn}</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--color-one-text-muted)]">{activeEcosystem.descriptionZh}</p>
                </>
              ) : (
                <p className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">暂无映射空间信息</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeEcosystem?.available ? (
                <button type="button" onClick={() => onSelectPlanet(activeBody.id)} className="one-btn one-btn-md one-btn-primary">
                  <span>进入 {activeEcosystem.titleZh}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="rounded-xl border px-3 py-2 text-xs text-[color:var(--color-one-text-dim)]" style={{ borderColor: 'var(--color-one-border)' }}>
                  生态建设中
                </div>
              )}
              <button type="button" onClick={() => onSelectPlanet(activeBody.id)} className="one-btn one-btn-md one-btn-secondary">
                <Eye className="h-4 w-4" />
                <span>3D 对焦观测</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CELESTIAL_BODIES.map((body) => {
            const ecosystem = getPlanetEcosystem(body.id);
            const isCurrent = activePlanetId === body.id;
            return (
              <button
                key={body.id}
                type="button"
                onClick={() => setActivePlanetId(body.id)}
                aria-label={`${body.chineseName} ${ecosystem ? ecosystem.titleZh : ''}`}
                className="group rounded-2xl border p-4 text-left transition-all"
                style={
                  isCurrent
                    ? { borderColor: 'rgba(127,212,255,0.35)', background: 'rgba(127,212,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }
                    : { borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.45)' }
                }
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0 rounded-full border transition-transform group-hover:scale-105"
                    style={{ backgroundColor: body.visual.baseColor, borderColor: 'rgba(244,243,238,0.18)', boxShadow: `0 0 16px ${body.visual.baseColor}55` }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[color:var(--color-one-text)]">{ecosystem?.titleZh || body.chineseName}</span>
                    <span className="block truncate text-[11px] text-[color:var(--color-one-text-dim)]">{body.chineseName} · {body.name}</span>
                  </span>
                </span>
                <span className="mt-3 block text-[11px] leading-4 text-[color:var(--color-one-text-muted)]">
                  {ecosystem ? `${ecosystem.titleEn}` : body.type.replace(/_/g, ' ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
      <div className="text-[10px] text-[color:var(--color-one-text-dim)]">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-medium text-[color:var(--color-one-text)] sm:text-sm">{value}</div>
    </div>
  );
}
