import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Compass,
  Sun,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Sparkles,
  MapPin
} from 'lucide-react';
import { Language } from '../types/index.ts';
import { latLngToVector3 } from '../components/globe/proceduralEarthTextures.ts';
import { buildPhotorealMoonRig, type PhotorealMoonRig } from './celestialMeshBuilders.ts';

interface LunarLandmark {
  id: string;
  nameZh: string;
  nameEn: string;
  lat: number;
  lng: number;
  metaZh: string;
  metaEn: string;
  descZh: string;
  descEn: string;
}

const LUNAR_LANDMARKS: LunarLandmark[] = [
  {
    id: 'apollo11',
    nameZh: '静海 · Apollo 11',
    nameEn: 'Mare Tranquillitatis',
    lat: 0.6741,
    lng: 23.4731,
    metaZh: '0.67°N, 23.47°E · 1969-07-20',
    metaEn: '0.67°N, 23.47°E · 1969-07-20',
    descZh: '人类首次载人登月着陆点，玄武岩月海平原。',
    descEn: 'First crewed lunar landing site on flat basaltic mare plains.'
  },
  {
    id: 'tycho',
    nameZh: '第谷环形山',
    nameEn: 'Tycho Crater',
    lat: -43.31,
    lng: -11.36,
    metaZh: '43.31°S, 11.36°W · 直径 85 km',
    metaEn: '43.31°S, 11.36°W · Ø 85 km',
    descZh: '南半球年轻撞击坑，放射状亮白色溅射纹长达 1,500 km。',
    descEn: 'Prominent young impact crater with bright ejecta rays spanning 1,500 km.'
  },
  {
    id: 'copernicus',
    nameZh: '哥白尼环形山',
    nameEn: 'Copernicus Crater',
    lat: 9.62,
    lng: -20.08,
    metaZh: '9.62°N, 20.08°W · 直径 93 km',
    metaEn: '9.62°N, 20.08°W · Ø 93 km',
    descZh: '“月球之王”典型阶梯状坑壁与中央峰构造，晨昏线处极具立体感。',
    descEn: 'Terraced inner walls and central peaks with dramatic terminator shadows.'
  },
  {
    id: 'mare_imbrium',
    nameZh: '雨海盆地',
    nameEn: 'Mare Imbrium',
    lat: 32.8,
    lng: -15.6,
    metaZh: '32.8°N, 15.6°W · 直径 1,146 km',
    metaEn: '32.8°N, 15.6°W · Ø 1,146 km',
    descZh: '太阳系最大多环撞击盆地之一，四周环绕亚平宁与阿尔卑斯月山。',
    descEn: 'Vast lava-filled multi-ring basin bordered by lunar mountain arcs.'
  },
  {
    id: 'shackleton',
    nameZh: '沙克尔顿南极坑',
    nameEn: 'Shackleton South Pole',
    lat: -89.9,
    lng: 0.0,
    metaZh: '89.9°S, 0.0° · 永久阴影区',
    metaEn: '89.9°S, 0.0° · Eternal Shadow',
    descZh: '坑底处于永久阴影中封存水冰，坑缘享受近乎永恒阳光。',
    descEn: 'Permanently shadowed crater floor preserving water ice near sunlit rims.'
  }
];

const MOON_PHASE_PRESETS = [
  { id: 'waxing', angle: 58, zh: '上弦刀锋', en: 'First Quarter' },
  { id: 'gibbous', angle: 28, zh: '盈凸月', en: 'Waxing Gibbous' },
  { id: 'full', angle: 6, zh: '满月全貌', en: 'Full Moon' },
  { id: 'waning', angle: 298, zh: '下弦光影', en: 'Last Quarter' }
];

interface InteractiveMoonViewportProps {
  lang: Language;
}

const MOON_RADIUS = 2.05;

export const InteractiveMoonViewport: React.FC<InteractiveMoonViewportProps> = ({ lang }) => {
  const isZh = lang === 'zh';
  const mountRef = useRef<HTMLDivElement>(null);

  const [sunAngleDeg, setSunAngleDeg] = useState<number>(58);
  const [selectedLandmark, setSelectedLandmark] = useState<LunarLandmark>(LUNAR_LANDMARKS[0]);
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [autoSpin, setAutoSpin] = useState<boolean>(true);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const refs = useRef<{
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    moonRig: PhotorealMoonRig | null;
    sunLight: THREE.DirectionalLight | null;
    rimLight: THREE.DirectionalLight | null;
    pinMeshes: Map<string, THREE.Mesh>;
    targetCameraDir: THREE.Vector3 | null;
    autoSpin: boolean;
    reducedMotion: boolean;
    frameId: number;
  }>({
    renderer: null,
    camera: null,
    controls: null,
    moonRig: null,
    sunLight: null,
    rimLight: null,
    pinMeshes: new Map(),
    targetCameraDir: null,
    autoSpin: true,
    reducedMotion: false,
    frameId: 0
  });

  useEffect(() => {
    refs.current.autoSpin = autoSpin;
  }, [autoSpin]);

  const applySunAngle = useCallback((deg: number) => {
    const rad = (deg * Math.PI) / 180;
    // Camera sits near +X/+Z Earth-facing near-side (+X is 0° longitude on SphereGeometry)
    const dir = new THREE.Vector3(Math.cos(rad), 0.22, Math.sin(rad)).normalize();
    if (refs.current.moonRig) {
      refs.current.moonRig.setSunDirection(dir);
    }
    if (refs.current.sunLight) {
      refs.current.sunLight.position.copy(dir).multiplyScalar(18);
    }
    if (refs.current.rimLight) {
      refs.current.rimLight.position.copy(dir).multiplyScalar(-14);
    }
  }, []);

  useEffect(() => {
    applySunAngle(sunAngleDeg);
  }, [sunAngleDeg, applySunAngle]);

  const focusLandmark = useCallback((landmark: LunarLandmark) => {
    setSelectedLandmark(landmark);
    setAutoSpin(false);
    refs.current.autoSpin = false;

    const surfacePos = latLngToVector3(landmark.lat, landmark.lng, MOON_RADIUS);
    refs.current.targetCameraDir = surfacePos.normalize();

    refs.current.pinMeshes.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (id === landmark.id) {
        mat.color.setHex(0x7fd4ff);
        mesh.scale.setScalar(1.45);
      } else {
        mat.color.setHex(0xf4f3ee);
        mesh.scale.setScalar(1.0);
      }
    });
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) {
      refs.current.reducedMotion = true;
      setAutoSpin(false);
      refs.current.autoSpin = false;
    }

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030508);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
    // Start facing the lunar nearside (0° longitude = +X in SphereGeometry)
    camera.position.set(6.4, 0.9, 1.3);
    refs.current.camera = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      setWebglUnavailable(false);
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.touchAction = 'none';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    refs.current.renderer = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.12;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const disposables: Array<{ dispose: () => void }> = [envTarget];

    // Subtle deep-space starfield
    const starCount = 480;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 36 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xdbeafe,
      size: 0.14,
      transparent: true,
      opacity: 0.72
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    disposables.push(starGeo, starMat);

    // Physical lighting rig
    const hemiLight = new THREE.HemisphereLight(0x88b4ff, 0x05070c, 0.12);
    scene.add(hemiLight);

    const initialSunRad = (sunAngleDeg * Math.PI) / 180;
    const sunDir = new THREE.Vector3(Math.cos(initialSunRad), 0.22, Math.sin(initialSunRad)).normalize();

    const sunLight = new THREE.DirectionalLight(0xfffaf0, 3.35);
    sunLight.position.copy(sunDir).multiplyScalar(18);
    scene.add(sunLight);
    refs.current.sunLight = sunLight;

    const rimLight = new THREE.DirectionalLight(0x4b7fc7, 0.28);
    rimLight.position.copy(sunDir).multiplyScalar(-14);
    scene.add(rimLight);
    refs.current.rimLight = rimLight;

    // Photorealistic NASA LRO Moon with LOLA elevation displacement + Sobel normal map
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const moonRig = buildPhotorealMoonRig({
      radius: MOON_RADIUS,
      segments: 128,
      sunDirection: sunDir,
      anisotropy: maxAniso,
      enableDisplacement: true,
      displacementScale: MOON_RADIUS * 0.03
    });
    scene.add(moonRig.group);
    refs.current.moonRig = moonRig;
    disposables.push(moonRig);

    // Subtle landmark pins anchored directly to lunar coordinates
    const pinGeo = new THREE.SphereGeometry(0.036, 16, 16);
    disposables.push(pinGeo);
    const pinMeshes = new Map<string, THREE.Mesh>();

    LUNAR_LANDMARKS.forEach((lm, idx) => {
      const mat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0x7fd4ff : 0xf4f3ee
      });
      const pin = new THREE.Mesh(pinGeo, mat);
      const pos = latLngToVector3(lm.lat, lm.lng, MOON_RADIUS * 1.032);
      pin.position.copy(pos);
      if (idx === 0) pin.scale.setScalar(1.45);
      pin.userData = { landmark: lm };
      moonRig.group.add(pin);
      pinMeshes.set(lm.id, pin);
      disposables.push(mat);
    });
    refs.current.pinMeshes = pinMeshes;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = MOON_RADIUS * 1.55;
    controls.maxDistance = MOON_RADIUS * 5.2;
    controls.rotateSpeed = 0.55;
    refs.current.controls = controls;

    const onControlStart = () => {
      refs.current.targetCameraDir = null;
      setAutoSpin(false);
      refs.current.autoSpin = false;
    };
    controls.addEventListener('start', onControlStart);

    // Raycast click on lunar landmarks
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Array.from(pinMeshes.values()), false);
      if (hits.length > 0) {
        const lm = hits[0].object.userData?.landmark as LunarLandmark | undefined;
        if (lm) focusLandmark(lm);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      cancelAnimationFrame(refs.current.frameId);
      setWebglUnavailable(true);
    };
    const onContextRestored = () => setWebglUnavailable(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    ro?.observe(container);

    const clock = new THREE.Clock();
    const curDir = new THREE.Vector3();
    const desiredCamPos = new THREE.Vector3();

    const animate = () => {
      refs.current.frameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);

      if (refs.current.autoSpin && !refs.current.reducedMotion && !refs.current.targetCameraDir) {
        // Gentle orbital camera drift around the Moon without breaking landmark coordinates
        const dist = camera.position.length();
        const theta = Math.atan2(camera.position.z, camera.position.x) - dt * 0.11;
        const y = camera.position.y;
        const horiz = Math.sqrt(Math.max(0.01, dist * dist - y * y));
        camera.position.x = horiz * Math.cos(theta);
        camera.position.z = horiz * Math.sin(theta);
      }

      if (refs.current.targetCameraDir) {
        const dist = THREE.MathUtils.damp(camera.position.length(), MOON_RADIUS * 2.75, 4.5, dt);
        curDir.copy(camera.position).normalize();
        curDir.lerp(refs.current.targetCameraDir, Math.min(1, dt * 4.5)).normalize();
        desiredCamPos.copy(curDir).multiplyScalar(dist);
        camera.position.copy(desiredCamPos);
        if (curDir.distanceTo(refs.current.targetCameraDir) < 0.015) {
          refs.current.targetCameraDir = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(refs.current.frameId);
      ro?.disconnect();
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      refs.current.renderer = null;
      refs.current.camera = null;
      refs.current.controls = null;
      refs.current.moonRig = null;
      refs.current.sunLight = null;
      refs.current.rimLight = null;
      refs.current.pinMeshes.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetView = () => {
    setAutoSpin(true);
    refs.current.autoSpin = true;
    refs.current.targetCameraDir = new THREE.Vector3(1, 0.14, 0.2).normalize();
    setSunAngleDeg(58);
  };

  if (webglUnavailable) {
    return (
      <div className="one-surface-elevated relative overflow-hidden p-6 text-center">
        <p className="text-sm text-[color:var(--color-one-text-muted)]">
          {isZh ? '当前浏览器未启用 WebGL，无法渲染实时 3D 月球高程模型。' : 'WebGL unavailable for live 3D Moon rendering.'}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={isZh ? 'NASA LRO 3D 月球高程实验室' : 'NASA LRO 3D Lunar Explorer'}
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'var(--color-one-border)',
        background: '#030508'
      }}
    >
      {/* Clean unobstructed 3D canvas stage */}
      <div
        ref={mountRef}
        className="h-[420px] w-full cursor-grab touch-none active:cursor-grabbing sm:h-[500px]"
      />

      {/* Minimal top-left metadata title */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1">
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-[#080c14]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-one-accent)]">
          <Sparkles className="h-3 w-3" />
          <span>NASA LRO · LOLA 3D LUNAR RELIEF</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#080c14]/88 px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--color-one-text)]">
            <MapPin className="h-3.5 w-3.5 text-[color:var(--color-one-accent)]" />
            <span>{isZh ? selectedLandmark.nameZh : selectedLandmark.nameEn}</span>
            <span className="font-mono text-[10px] text-[color:var(--color-one-text-dim)]">
              {isZh ? selectedLandmark.metaZh : selectedLandmark.metaEn}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[color:var(--color-one-text-muted)]">
            {isZh ? selectedLandmark.descZh : selectedLandmark.descEn}
          </p>
        </div>
      </div>

      {/* Top-right compact camera reset */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAutoSpin((s) => !s)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-[#080c14]/90 px-2.5 text-[11px] font-medium text-[color:var(--color-one-text-muted)] transition hover:border-white/25 hover:text-[color:var(--color-one-text)]"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>{autoSpin ? (isZh ? '公转观测中' : 'Orbiting') : isZh ? '手动凝视' : 'Manual'}</span>
        </button>
        <button
          type="button"
          onClick={handleResetView}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-[#080c14]/90 text-[color:var(--color-one-text-muted)] transition hover:border-white/25 hover:text-[color:var(--color-one-text)]"
          title={isZh ? '重置视角与光影' : 'Reset view & lighting'}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Collapsible bottom dock (zero mid-screen clutter) */}
      <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-4xl">
        <div className="rounded-xl border border-white/12 bg-[#0a0f18]/94 shadow-2xl">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] font-medium text-[color:var(--color-one-text-muted)]">
              <Sun className="h-3.5 w-3.5 text-amber-300" />
              <span>{isZh ? '太阳晨昏角' : 'Solar Terminator'}</span>
              <span className="font-mono text-[11px] text-[color:var(--color-one-accent)]">
                {sunAngleDeg}°
              </span>
            </div>

            <div className="flex flex-1 items-center gap-2 max-w-xs sm:max-w-sm">
              <input
                type="range"
                min={0}
                max={360}
                value={sunAngleDeg}
                onChange={(e) => setSunAngleDeg(Number(e.target.value))}
                aria-label={isZh ? '太阳照射相位角度' : 'Lunar solar illumination angle'}
                className="h-1.5 w-full cursor-pointer accent-sky-400"
              />
            </div>

            <button
              type="button"
              onClick={() => setDockExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]"
            >
              <span>{dockExpanded ? (isZh ? '收起' : 'Hide') : (isZh ? '地标与月相' : 'Landmarks')}</span>
              {dockExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
          </div>

          {dockExpanded && (
            <div className="flex flex-col gap-2 border-t border-white/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Lunar landmarks */}
              <div className="flex flex-wrap items-center gap-1.5">
                {LUNAR_LANDMARKS.map((lm) => {
                  const active = selectedLandmark.id === lm.id;
                  return (
                    <button
                      key={lm.id}
                      type="button"
                      onClick={() => focusLandmark(lm)}
                      className="rounded-md px-2 py-1 text-[11px] font-medium transition"
                      style={
                        active
                          ? {
                              color: '#e6f4ff',
                              background: 'rgba(127,212,255,0.18)',
                              border: '1px solid rgba(127,212,255,0.36)'
                            }
                          : {
                              color: 'var(--color-one-text-muted)',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)'
                            }
                      }
                    >
                      {isZh ? lm.nameZh : lm.nameEn}
                    </button>
                  );
                })}
              </div>

              {/* Phase presets */}
              <div className="flex shrink-0 items-center gap-1">
                {MOON_PHASE_PRESETS.map((p) => {
                  const active = Math.abs(sunAngleDeg - p.angle) <= 4;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSunAngleDeg(p.angle)}
                      className="rounded-md px-2 py-1 text-[10px] font-medium transition"
                      style={
                        active
                          ? {
                              color: '#fde68a',
                              background: 'rgba(251,191,36,0.14)',
                              border: '1px solid rgba(251,191,36,0.3)'
                            }
                          : {
                              color: 'var(--color-one-text-dim)',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)'
                            }
                      }
                    >
                      {isZh ? p.zh : p.en}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
