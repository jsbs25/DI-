import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, LocateFixed, Radio, RotateCcw, SlidersHorizontal, SunMedium, Wind } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import {
  detectWebGLSupport,
  isSoftwareRenderer,
  prefersReducedMotion,
} from '../spatial/webglCapabilities.ts';
import {
  createParadiseTextures,
  detectParadiseQuality,
  type UserQualityChoice,
} from './paradiseQuality.ts';
import {
  createParadiseSkyDome,
  formatClockTime,
  getTimePhaseLabel,
  ParadiseEnvironmentEngine,
  TIME_PRESET_VALUES,
  WEATHER_OPTIONS,
  type TimePreset,
  type WeatherKind,
} from './paradiseEnvironment.ts';
import { createParadiseTerrain, terrainHeightAt } from './paradiseTerrain.ts';
import { createParadiseArchitecture } from './paradiseArchitecture.ts';
import { createParadiseFlora } from './paradiseFlora.ts';
import { createParadiseFauna } from './paradiseFauna.ts';
import { createParadiseWeatherFX } from './paradiseWeatherFX.ts';
import { createParadisePostPipeline, type ParadisePostPipeline } from './paradisePost.ts';
import { createParadiseSpirit } from './paradiseSpirit.ts';
import { createParadiseCat } from './paradiseCat.ts';
import { PavilionAiHud } from './PavilionAiHud.tsx';

type CameraPresetId = 'overlook' | 'bridge' | 'blossoms' | 'pavilion';

interface CameraPreset {
  id: CameraPresetId;
  zh: string;
  en: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overlook', zh: '全景', en: 'Overlook', pos: [-4.5, 8.2, 23.5], target: [2.5, 1.8, -2.5] },
  { id: 'bridge', zh: '溪桥', en: 'Bridge', pos: [-2.2, 4.2, 5.8], target: [-6.4, 1.3, -8.4] },
  { id: 'blossoms', zh: '银杏樱林', en: 'Ginkgo & Sakura', pos: [-11.2, 3.8, 15.2], target: [3.2, 2.2, 1.2] },
  { id: 'pavilion', zh: '亭台', en: 'Pavilion', pos: [3.2, 4.2, 5.2], target: [12.8, 2.6, -7.8] },
];

const QUALITY_OPTIONS: Array<{ id: UserQualityChoice; zh: string; en: string }> = [
  { id: 'auto', zh: '自动', en: 'Auto' },
  { id: 'high', zh: '高', en: 'High' },
  { id: 'medium', zh: '中', en: 'Med' },
  { id: 'low', zh: '低', en: 'Low' },
];

const QUALITY_STORAGE_KEY = 'earthone_paradise_quality_v1';

function computeLocalWallTimeFraction(): number {
  const now = new Date();
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

function readStoredQuality(): UserQualityChoice {
  try {
    const v = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') return v;
  } catch {
    // ignore storage access issues
  }
  return 'auto';
}

interface ParadiseWorld3DProps {
  lang: Language;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
}

export const ParadiseWorld3D: React.FC<ParadiseWorld3DProps> = ({
  lang,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const stageRef = useRef<HTMLDivElement | null>(null);

  const agentSnap = useAgentUiState();
  const [webglReady, setWebglReady] = useState<boolean>(() => detectWebGLSupport());
  const [contextLost, setContextLost] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // Synced display HUD state (throttled updates so React never churns every animation frame)
  const [autoCycle, setAutoCycle] = useState(false);
  const [autoWeather, setAutoWeather] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(() => computeLocalWallTimeFraction());
  const [activeWeather, setActiveWeather] = useState<WeatherKind>('clear');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overlook');
  const [userQuality, setUserQuality] = useState<UserQualityChoice>(() => readStoredQuality());

  // Mutable engine command refs shared with WebGL animation loop
  const envRef = useRef<ParadiseEnvironmentEngine | null>(null);
  const realtimeSyncRef = useRef<boolean>(agentSnap.realtimeSync);
  realtimeSyncRef.current = agentSnap.realtimeSync;
  const spiritStateRef = useRef(agentSnap.spiritState);
  spiritStateRef.current = agentSnap.spiritState;
  const lastHandledEnvSeqRef = useRef<number>(0);

  const persistedRef = useRef<{
    timeOfDay: number;
    autoCycle: boolean;
    weather: WeatherKind;
    autoWeather: boolean;
    hasCam: boolean;
    camPos: THREE.Vector3;
    camTarget: THREE.Vector3;
  }>({
    timeOfDay: computeLocalWallTimeFraction(),
    autoCycle: false,
    weather: 'clear',
    autoWeather: false,
    hasCam: false,
    camPos: new THREE.Vector3(-4.5, 8.2, 23.5),
    camTarget: new THREE.Vector3(2.5, 1.4, -2.5),
  });

  const cameraMoveRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(-4.5, 8.2, 23.5),
    targetLook: new THREE.Vector3(2.5, 1.4, -2.5),
  });

  // Real-time external weather fetcher (Open-Meteo via /api/environment/weather)
  const fetchLiveWeather = async (useGeoPrompt = false) => {
    try {
      let query = '';
      if (useGeoPrompt && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 })
          );
          query = `?lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
        } catch {
          query = '';
        }
      } else if (typeof navigator !== 'undefined' && navigator.permissions && navigator.geolocation) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (perm.state === 'granted') {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4500 })
            );
            query = `?lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
          }
        } catch {
          // silent non-granted fallback
        }
      }

      const res = await fetch(`/api/environment/weather${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        uiStateManager.setLiveWeather({
          locationName: isZh ? '实时气象暂不可用' : 'Live weather unavailable',
          temperatureC: 0,
          humidityPct: 0,
          windSpeedKmh: 0,
          conditionZh: '未能获取实时气象',
          conditionEn: 'Unavailable',
          mappedWeather: 'clear',
          observedAt: new Date().toISOString(),
          unavailable: true,
          error: data?.error || `HTTP ${res.status}`,
        });
        return;
      }

      uiStateManager.setLiveWeather(data);
      if (realtimeSyncRef.current && envRef.current && data?.mappedWeather) {
        envRef.current.autoWeather = false;
        envRef.current.targetWeather = data.mappedWeather as WeatherKind;
        if (data.mappedWeather === 'thunderstorm') envRef.current.triggerLightning();
        setAutoWeather(false);
        setActiveWeather(data.mappedWeather as WeatherKind);
      }
    } catch (err: any) {
      uiStateManager.setLiveWeather({
        locationName: isZh ? '实时气象暂不可用' : 'Live weather unavailable',
        temperatureC: 0,
        humidityPct: 0,
        windSpeedKmh: 0,
        conditionZh: '网络不可达',
        conditionEn: 'Offline',
        mappedWeather: 'clear',
        observedAt: new Date().toISOString(),
        unavailable: true,
        error: err?.message || 'Network error',
      });
    }
  };

  useEffect(() => {
    void fetchLiveWeather(false);
    const id = window.setInterval(() => {
      if (realtimeSyncRef.current) void fetchLiveWeather(false);
    }, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Listen to ONE AI agent environment commands
  useEffect(() => {
    const cmd = agentSnap.weatherCommand;
    if (!cmd || cmd.seq === lastHandledEnvSeqRef.current) return;
    lastHandledEnvSeqRef.current = cmd.seq;

    const engine = envRef.current;
    if (cmd.realtimeSync === true) {
      if (engine) {
        engine.autoCycle = false;
        engine.autoWeather = false;
        engine.timeOfDay = computeLocalWallTimeFraction();
        if (agentSnap.liveWeather && !agentSnap.liveWeather.unavailable) {
          engine.targetWeather = agentSnap.liveWeather.mappedWeather;
        }
      }
      setAutoCycle(false);
      setAutoWeather(false);
      void fetchLiveWeather(false);
      return;
    }

    if (cmd.weatherPreset && engine) {
      engine.autoWeather = false;
      engine.targetWeather = cmd.weatherPreset;
      if (cmd.weatherPreset === 'thunderstorm') engine.triggerLightning();
      setAutoWeather(false);
      setActiveWeather(cmd.weatherPreset);
    }
    if (cmd.timePreset && engine) {
      engine.autoCycle = false;
      engine.setTimePreset(cmd.timePreset);
      setAutoCycle(false);
      setTimeOfDay(TIME_PRESET_VALUES[cmd.timePreset]);
    }
  }, [agentSnap.weatherCommand]);

  useEffect(() => {
    if (!webglReady) return;
    const container = stageRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;

    const width = Math.max(300, container.clientWidth || 640);
    const height = Math.max(300, container.clientHeight || 480);
    const reducedMotion = prefersReducedMotion();

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const gl = renderer.getContext();
    const isSoftwareGl = isSoftwareRenderer(gl);
    const quality = detectParadiseQuality(isSoftwareGl, reducedMotion, width, height, userQuality);

    let activePixelRatio = quality.pixelRatio;
    let dynDofEnabled = quality.enableDOF;

    renderer.setPixelRatio(activePixelRatio);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = quality.enableShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(0xbce0f7, 0.0042);
    scene.fog = fog;
    scene.background = new THREE.Color(0xbce0f7);

    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(aspect < 0.78 ? 50 : 42, aspect, 0.2, 260);
    const portraitZScale = aspect < 0.78 ? 1.18 : 1.0;

    if (persistedRef.current.hasCam) {
      camera.position.copy(persistedRef.current.camPos);
    } else {
      camera.position.set(-4.5 * portraitZScale, 8.2, 23.5 * portraitZScale);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.enablePan = true;
    controls.panSpeed = 0.65;
    controls.rotateSpeed = 0.72;
    controls.minDistance = 7.5;
    controls.maxDistance = 42.0;
    controls.minPolarAngle = Math.PI * 0.14;
    controls.maxPolarAngle = Math.PI * 0.465;
    if (persistedRef.current.hasCam) {
      controls.target.copy(persistedRef.current.camTarget);
    } else {
      controls.target.set(2.5, 1.4, -2.5);
    }
    controls.update();

    const onControlStart = () => {
      cameraMoveRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // Environment reflection map for water sheen, bronze & wet dew highlights
    const pmremGen = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGen.fromScene(roomEnv, 0.05);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    roomEnv.dispose();
    pmremGen.dispose();

    const textures = createParadiseTextures(renderer.capabilities.getMaxAnisotropy());
    const envEngine = new ParadiseEnvironmentEngine(
      persistedRef.current.timeOfDay,
      persistedRef.current.weather
    );
    envEngine.autoCycle = persistedRef.current.autoCycle;
    envEngine.autoWeather = persistedRef.current.autoWeather;
    envRef.current = envEngine;

    // 1. Sky Dome + Sun + Moon + Stars + Milky Way + Multi-layer Beer-Powder Clouds
    const skyDome = createParadiseSkyDome();
    scene.add(skyDome.mesh);

    // 2. Calibrated 3D Atmospheric Lighting
    const hemiLight = new THREE.HemisphereLight(0xbce0f7, 0x34462c, 0.75);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5de, 1.85);
    sunLight.position.set(16, 26, -12);
    sunLight.castShadow = quality.enableShadows;
    if (quality.enableShadows) {
      sunLight.shadow.mapSize.width = quality.shadowMapSize;
      sunLight.shadow.mapSize.height = quality.shadowMapSize;
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 96;
      const d = 32;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.025;
    }
    scene.add(sunLight);

    const lightningLight = new THREE.DirectionalLight(0xcfe4ff, 0);
    lightningLight.position.set(8, 34, -36);
    scene.add(lightningLight);

    // 3. Spatial World Modules
    const terrain = createParadiseTerrain(quality, textures);
    scene.add(terrain.group);

    const architecture = createParadiseArchitecture(quality, textures);
    scene.add(architecture.group);

    const flora = createParadiseFlora(quality, textures);
    scene.add(flora.group);

    const fauna = createParadiseFauna(quality, textures, flora.flowerSpots);
    scene.add(fauna.group);

    const spirit = createParadiseSpirit(quality);
    scene.add(spirit.group);

    const cat = createParadiseCat(quality);
    scene.add(cat.group);

    const weatherFX = createParadiseWeatherFX(quality, textures, flora.treeCanopies);
    scene.add(weatherFX.group);

    // 4. Volumetric God-Rays + Depth-Aware DOF + Subtle Bloom Post-Processing
    let postPipeline: ParadisePostPipeline | null = null;
    if (quality.enableBloom || quality.enableGodRays || quality.enableDOF) {
      postPipeline = createParadisePostPipeline(
        renderer,
        scene,
        camera,
        width,
        height,
        activePixelRatio,
        {
          enableBloom: quality.enableBloom,
          enableGodRays: quality.enableGodRays,
          enableDOF: dynDofEnabled,
        }
      );
      renderer.compile(scene, camera);
    }

    // 5. Interactive Mouse / Touch Raycasting
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const pointerWorld = new THREE.Vector3(0, -20, 0);
    const pointerWorldDamped = new THREE.Vector3(0, -20, 0);
    let pointerActive = 0;
    let lastRaycastMs = 0;
    let downPos = { x: 0, y: 0 };

    const updateNdc = (clientX: number, clientY: number) => {
      if (!renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const raycastGroundOrWater = (): { type: 'water' | 'land'; point: THREE.Vector3 } | null => {
      raycaster.setFromCamera(pointerNdc, camera);
      const waterHits = raycaster.intersectObject(terrain.waterMesh, false);
      const terrainHits = raycaster.intersectObject(terrain.terrainMesh, false);
      const wHit = waterHits[0];
      const tHit = terrainHits[0];
      if (wHit && (!tHit || wHit.distance <= tHit.distance)) {
        return { type: 'water', point: wHit.point };
      }
      if (tHit) {
        return { type: 'land', point: tHit.point };
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastMs < 40) return;
      lastRaycastMs = now;
      updateNdc(e.clientX, e.clientY);
      const hit = raycastGroundOrWater();
      if (hit) {
        pointerWorld.copy(hit.point);
        pointerActive = 1;
        if (hit.type === 'water' && Math.hypot(e.movementX, e.movementY) > 6) {
          terrain.triggerWaterRipple(hit.point.x, hit.point.z, clock.getElapsedTime(), 0.45);
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
      updateNdc(e.clientX, e.clientY);
      const hit = raycastGroundOrWater();
      if (hit) {
        pointerWorld.copy(hit.point);
        pointerActive = 1;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved > 8) return;
      updateNdc(e.clientX, e.clientY);

      raycaster.setFromCamera(pointerNdc, camera);
      const actorHits = raycaster.intersectObjects([spirit.hitTarget, cat.hitTarget, architecture.pavilionGroup], true);
      if (actorHits.length > 0) {
        const hitObj = actorHits[0].object;
        if (hitObj === cat.hitTarget) {
          weatherFX.emitPetalBurst(cat.group.position);
          return;
        }
        // Clicked Spirit or Waterside Pavilion: wake Spirit & open Pavilion HUD
        uiStateManager.setPavilionHudOpen(true);
        if (spiritStateRef.current === 'idle_explore' || spiritStateRef.current === 'sleeping_in_house' || spiritStateRef.current === 'returning_to_rest') {
          uiStateManager.setSpiritState('woken_approaching');
        }
        weatherFX.emitPetalBurst(spirit.spiritPos);
        return;
      }

      const hit = raycastGroundOrWater();
      if (!hit) return;
      if (hit.type === 'water') {
        terrain.triggerWaterRipple(hit.point.x, hit.point.z, clock.getElapsedTime(), 1.15);
      } else {
        weatherFX.emitPetalBurst(hit.point);
      }
    };

    const onPointerLeave = () => {
      pointerActive = 0;
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      if (disposed || !renderer) return;
      const w = Math.max(300, container.clientWidth || 640);
      const h = Math.max(300, container.clientHeight || 480);
      const nextAspect = w / h;
      camera.aspect = nextAspect;
      camera.fov = nextAspect < 0.78 ? 50 : 42;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(activePixelRatio);
      renderer.setSize(w, h, false);
      postPipeline?.setSize(w, h, activePixelRatio);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    window.addEventListener('orientationchange', handleResize);

    let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onVisibilityChange = () => {
      hidden = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Software-GL GPU fence pacing
    function afterDraw(cb: () => void) {
      const gl2 = renderer?.getContext() as WebGL2RenderingContext | undefined;
      if (!gl2 || typeof gl2.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl2.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync ? gl2.getSyncParameter(sync, gl2.SYNC_STATUS) : gl2.SIGNALED;
        if (status === gl2.UNSIGNALED) {
          frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl2.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 6);
    }

    const clock = new THREE.Clock();
    let hudSyncAccum = 0;

    // Adaptive FPS governor state (for smooth MacBook Air M2 performance in 'auto' mode)
    let smoothedDt = 0.016;
    let slowAccum = 0;
    let fastAccum = 0;
    let governorStage: 0 | 1 | 2 = 0;

    const camForward = new THREE.Vector3();
    const tmpKeyWorld = new THREE.Vector3();
    const sunScreenPos = new THREE.Vector2(0.6, 0.75);
    const godRayColor = new THREE.Color(0xffdfa8);

    const tick = () => {
      if (disposed || !renderer) return;
      if (hidden) {
        frameId = isSoftwareGl ? window.setTimeout(tick, 200) : requestAnimationFrame(tick);
        return;
      }

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt > 0 ? rawDt : 0.016, 0.08);
      const elapsed = clock.getElapsedTime();

      // Dynamic FPS governor when user selected 'auto' on GPU
      if (userQuality === 'auto' && !isSoftwareGl && elapsed > 3.0 && rawDt < 0.14) {
        smoothedDt += (rawDt - smoothedDt) * 0.08;
        if (smoothedDt > 0.029) {
          slowAccum += dt;
          fastAccum = 0;
          if (slowAccum > 2.5) {
            slowAccum = 0;
            if (governorStage === 0 && dynDofEnabled) {
              governorStage = 1;
              dynDofEnabled = false;
              postPipeline?.setOptions({ enableDOF: false });
            } else if (governorStage <= 1 && activePixelRatio > 1.05) {
              governorStage = 2;
              activePixelRatio = Math.max(1.0, quality.pixelRatio * 0.8);
              handleResize();
            }
          }
        } else if (smoothedDt < 0.0175) {
          fastAccum += dt;
          slowAccum = 0;
          if (fastAccum > 6.5 && governorStage > 0) {
            fastAccum = 0;
            if (governorStage === 2) {
              governorStage = 1;
              activePixelRatio = quality.pixelRatio;
              handleResize();
            } else if (governorStage === 1 && quality.enableDOF) {
              governorStage = 0;
              dynDofEnabled = true;
              postPipeline?.setOptions({ enableDOF: true });
            }
          }
        }
      }

      // Sync local wall-clock continuously when Real-Time Sync is active
      if (realtimeSyncRef.current) {
        envEngine.autoCycle = false;
        envEngine.timeOfDay = computeLocalWallTimeFraction();
      }

      // Advance continuous Day-Night & Weather simulation
      envEngine.update(reducedMotion ? dt * 0.25 : dt);
      const st = envEngine.state;

      // Sync Sky & Scene Fog
      (scene.background as THREE.Color).copy(st.horizonColor);
      fog.color.copy(st.fogColor);
      fog.density = st.fogDensity;
      renderer.toneMappingExposure = st.exposure;

      skyDome.uniforms.uTime.value = elapsed;
      skyDome.uniforms.uSunDir.value.copy(st.sunDir);
      skyDome.uniforms.uMoonDir.value.copy(st.moonDir);
      (skyDome.uniforms.uZenithColor.value as THREE.Color).copy(st.zenithColor);
      (skyDome.uniforms.uHorizonColor.value as THREE.Color).copy(st.horizonColor);
      skyDome.uniforms.uCloudCover.value = st.cloudCover;
      skyDome.uniforms.uCloudDarkness.value = st.cloudDarkness;
      skyDome.uniforms.uDayFactor.value = st.dayFactor;
      skyDome.uniforms.uTwilightFactor.value = st.twilightFactor;
      skyDome.uniforms.uNightFactor.value = st.nightFactor;
      skyDome.uniforms.uWindSpeed.value = st.windStrength;
      skyDome.uniforms.uLightningFlash.value = st.lightningFlash;
      skyDome.uniforms.uLightningAzimuth.value = st.lightningAzimuth;
      skyDome.uniforms.uRainbowIntensity.value = st.rainbowIntensity;

      // Sync Sun / Moon key light & Hemisphere ambient
      const useMoon = st.sunElevation < -0.02;
      const activeKeyDir = useMoon ? st.moonDir : st.sunDir;
      sunLight.position.copy(activeKeyDir).multiplyScalar(42);
      if (sunLight.position.y < 6) sunLight.position.y = 6;
      sunLight.color.copy(st.sunLightColor);

      const sunBaseInt = THREE.MathUtils.smoothstep(st.sunElevation, -0.02, 0.35) * 2.15 * st.sunAttenuation;
      const moonBaseInt = THREE.MathUtils.smoothstep(st.moonDir.y, 0.0, 0.4) * 0.58 * (1 - st.cloudDarkness * 0.55);
      sunLight.intensity = useMoon ? moonBaseInt : Math.max(0.25, sunBaseInt);

      hemiLight.color.copy(st.hemiSkyColor);
      hemiLight.groundColor.copy(st.hemiGroundColor);
      hemiLight.intensity = THREE.MathUtils.lerp(0.38, 0.85, st.dayFactor) * THREE.MathUtils.lerp(1, 0.72, st.cloudDarkness);

      // Storm lightning illumination
      lightningLight.intensity = st.lightningFlash * 3.4;
      lightningLight.position.set(st.lightningAzimuth * 30, 32, -36);

      // Warm lakeside pavilion lantern, Spirit Rest Cottage hearth & rain material wetness
      architecture.lanternLight.intensity = st.lanternGlow * 2.2;
      architecture.lanternGlassMat.emissiveIntensity = 0.12 + st.lanternGlow * 1.85;
      const spiritSleeping = spiritStateRef.current === 'sleeping_in_house' || spiritStateRef.current === 'returning_to_rest';
      architecture.restHouseLight.intensity = 0.25 + st.lanternGlow * 1.5 + (spiritSleeping ? 0.85 : 0);
      architecture.restWindowMat.emissiveIntensity = 0.18 + st.lanternGlow * 1.35 + (spiritSleeping ? 0.55 : 0);
      for (const mat of architecture.wettableMaterials) {
        const baseR = typeof mat.userData.baseRoughness === 'number' ? mat.userData.baseRoughness : 0.7;
        mat.roughness = THREE.MathUtils.lerp(baseR, Math.max(0.14, baseR * 0.36), st.wetness);
      }

      // Sync Terrain, Water.js Planar Reflection & Waterfall
      terrain.terrainUniforms.uWetness.value = st.wetness;
      terrain.terrainUniforms.uTime.value = elapsed;

      const wu = terrain.waterUniforms;
      if (wu.time) wu.time.value = elapsed * (0.65 + st.windStrength * 0.45);
      if (wu.sunDirection) (wu.sunDirection.value as THREE.Vector3).copy(useMoon ? st.moonDir : st.sunDir);
      if (wu.sunColor) (wu.sunColor.value as THREE.Color).copy(useMoon ? st.hemiSkyColor : st.sunLightColor);
      if (wu.waterColor) {
        (wu.waterColor.value as THREE.Color).setRGB(
          THREE.MathUtils.lerp(0.02, 0.04, st.dayFactor),
          THREE.MathUtils.lerp(0.05, 0.19, st.dayFactor),
          THREE.MathUtils.lerp(0.09, 0.21, st.dayFactor)
        );
      }
      if (wu.distortionScale) wu.distortionScale.value = 1.65 + st.windStrength * 1.45;
      if (wu.uDayFactor) wu.uDayFactor.value = st.dayFactor;
      if (wu.uNightFactor) wu.uNightFactor.value = st.nightFactor;
      if (wu.uMoonDir) (wu.uMoonDir.value as THREE.Vector3).copy(st.moonDir);
      if (wu.uWindStrength) wu.uWindStrength.value = st.windStrength;
      if (wu.uRainIntensity) wu.uRainIntensity.value = st.rainIntensity;

      terrain.waterfallUniforms.uTime.value = elapsed;
      terrain.waterfallUniforms.uDayFactor.value = st.dayFactor;
      (terrain.waterfallUniforms.uSkyHorizon.value as THREE.Color).copy(st.horizonColor);
      terrain.waterfallUniforms.uRainIntensity.value = st.rainIntensity;
      (terrain.waterfallUniforms.uFogColor.value as THREE.Color).copy(st.fogColor);
      terrain.waterfallUniforms.uFogDensity.value = st.fogDensity;

      // Damped pointer world interaction
      pointerWorldDamped.lerp(pointerWorld, 1 - Math.exp(-8 * dt));
      flora.uniforms.uPointerPos.value.copy(pointerWorldDamped);
      flora.uniforms.uPointerStrength.value = THREE.MathUtils.damp(
        flora.uniforms.uPointerStrength.value,
        pointerActive,
        6,
        dt
      );
      flora.uniforms.uWetness.value = st.wetness;

      // Camera forward vector for curiosity butterflies & volumetric god-rays
      camera.getWorldDirection(camForward);

      // Flora, Fauna, AI Spirit, Garden Cat, Weather FX
      flora.update(elapsed, reducedMotion ? st.windStrength * 0.25 : st.windStrength, st.dewAmount, st.nightFactor);
      fauna.update(
        elapsed,
        dt,
        st.dayFactor,
        st.nightFactor,
        st.eveningFactor,
        st.rainIntensity,
        st.windStrength,
        pointerWorldDamped,
        pointerActive,
        camera.position,
        camForward
      );
      const visualSpiritState = spirit.update(
        elapsed,
        dt,
        spiritStateRef.current,
        camera.position,
        st.nightFactor,
        st.rainIntensity
      );
      cat.update(
        elapsed,
        dt,
        st.dayFactor,
        st.nightFactor,
        st.rainIntensity,
        spirit.spiritPos,
        visualSpiritState,
        fauna.butterflyPositions,
        camera.position
      );
      weatherFX.update(
        elapsed,
        dt,
        controls.target,
        st.windStrength,
        st.rainIntensity,
        st.fogDensity,
        st.dayFactor,
        st.fogColor,
        spirit.pavilionSwirlIntensity
      );

      // Smooth damped camera preset transitions
      if (cameraMoveRef.current.active) {
        const k = 1 - Math.exp(-3.2 * dt);
        camera.position.lerp(cameraMoveRef.current.targetPos, k);
        controls.target.lerp(cameraMoveRef.current.targetLook, k);
        if (
          camera.position.distanceTo(cameraMoveRef.current.targetPos) < 0.08 &&
          controls.target.distanceTo(cameraMoveRef.current.targetLook) < 0.08
        ) {
          cameraMoveRef.current.active = false;
        }
      }

      const camFloor = Math.max(0.8, terrainHeightAt(camera.position.x, camera.position.z) + 0.9);
      if (camera.position.y < camFloor) camera.position.y = camFloor;

      controls.update();

      // Persist state continuously in case quality tier is switched seamlessly
      persistedRef.current.hasCam = true;
      persistedRef.current.camPos.copy(camera.position);
      persistedRef.current.camTarget.copy(controls.target);
      persistedRef.current.timeOfDay = st.timeOfDay;
      persistedRef.current.weather = envEngine.targetWeather;
      persistedRef.current.autoCycle = envEngine.autoCycle;
      persistedRef.current.autoWeather = envEngine.autoWeather;

      if (postPipeline) {
        // Project active sun/moon disc onto UV plane for crepuscular light shafts
        tmpKeyWorld.copy(activeKeyDir).multiplyScalar(140).add(camera.position).project(camera);
        sunScreenPos.set(tmpKeyWorld.x * 0.5 + 0.5, tmpKeyWorld.y * 0.5 + 0.5);

        const facingKey = THREE.MathUtils.smoothstep(activeKeyDir.dot(camForward), -0.15, 0.35);
        const keyElevationVis = useMoon
          ? THREE.MathUtils.smoothstep(st.moonDir.y, 0.02, 0.25) * 0.14
          : THREE.MathUtils.smoothstep(st.sunElevation, -0.04, 0.22) *
            (0.24 + st.twilightFactor * 0.16) *
            st.sunAttenuation;
        const rayIntensity = facingKey * keyElevationVis * (1 - st.cloudDarkness * 0.65);

        if (useMoon) {
          godRayColor.setRGB(0.62, 0.76, 0.98);
        } else {
          godRayColor.copy(st.sunLightColor).lerp(new THREE.Color(0xfff0d0), 0.35);
        }

        postPipeline.setOptions({
          enableBloom: quality.enableBloom,
          enableGodRays: quality.enableGodRays,
          enableDOF: dynDofEnabled,
          sunScreenPos,
          godRayIntensity: rayIntensity,
          godRayColor,
          focusDistance: camera.position.distanceTo(controls.target),
          cameraNear: camera.near,
          cameraFar: camera.far,
        });
        postPipeline.render();
      } else {
        renderer.render(scene, camera);
      }

      // Throttled UI clock & weather state sync (~4 Hz)
      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.25) {
        hudSyncAccum = 0;
        setTimeOfDay(st.timeOfDay);
        setActiveWeather(st.activeWeather);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();

      const domEl = renderer?.domElement;
      if (domEl) {
        domEl.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointerup', onPointerUp);
        domEl.removeEventListener('pointerleave', onPointerLeave);
        domEl.removeEventListener('webglcontextlost', onContextLost);
        domEl.removeEventListener('webglcontextrestored', onContextRestored);
        if (domEl.parentNode === container) container.removeChild(domEl);
      }

      postPipeline?.dispose();
      skyDome.dispose();
      terrain.dispose();
      architecture.dispose();
      flora.dispose();
      fauna.dispose();
      spirit.dispose();
      cat.dispose();
      weatherFX.dispose();
      textures.dispose();
      envRT.dispose();
      renderer?.dispose();
      envRef.current = null;
    };
  }, [webglReady, userQuality]);

  const applyTimePreset = (preset: TimePreset) => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    if (!engine) return;
    engine.autoCycle = false;
    engine.setTimePreset(preset);
    setAutoCycle(false);
    setTimeOfDay(TIME_PRESET_VALUES[preset]);
  };

  const toggleAutoCycle = () => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    if (!engine) return;
    engine.autoCycle = !engine.autoCycle;
    setAutoCycle(engine.autoCycle);
  };

  const applyWeather = (w: WeatherKind) => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    if (!engine) return;
    engine.autoWeather = false;
    engine.targetWeather = w;
    if (w === 'thunderstorm') engine.triggerLightning();
    setAutoWeather(false);
    setActiveWeather(w);
  };

  const toggleAutoWeather = () => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    if (!engine) return;
    engine.autoWeather = !engine.autoWeather;
    setAutoWeather(engine.autoWeather);
  };

  const restoreRealtimeSync = () => {
    uiStateManager.setRealtimeSync(true);
    const engine = envRef.current;
    if (engine) {
      engine.autoCycle = false;
      engine.autoWeather = false;
      engine.timeOfDay = computeLocalWallTimeFraction();
      if (agentSnap.liveWeather && !agentSnap.liveWeather.unavailable) {
        engine.targetWeather = agentSnap.liveWeather.mappedWeather;
        setActiveWeather(agentSnap.liveWeather.mappedWeather);
      }
    }
    setAutoCycle(false);
    setAutoWeather(false);
    setTimeOfDay(computeLocalWallTimeFraction());
    void fetchLiveWeather(false);
  };

  const moveCameraToPreset = (preset: CameraPreset) => {
    setCameraPreset(preset.id);
    cameraMoveRef.current.targetPos.set(...preset.pos);
    cameraMoveRef.current.targetLook.set(...preset.target);
    cameraMoveRef.current.active = true;
  };

  const selectQuality = (q: UserQualityChoice) => {
    setUserQuality(q);
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, q);
    } catch {
      // ignore
    }
  };

  const currentPhaseLabel = getTimePhaseLabel(timeOfDay, isZh);
  const currentClockLabel = formatClockTime(timeOfDay);
  const activeWeatherMeta = WEATHER_OPTIONS.find((w) => w.id === activeWeather) || WEATHER_OPTIONS[0];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0e1928] text-[#F7F5F0] select-none">
      {webglReady && !contextLost ? (
        <div
          ref={stageRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="PARADISE WORLD 3D Garden Sanctuary"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
          style={{
            background: 'linear-gradient(180deg, #2b4c6f 0%, #5b89a6 45%, #2f4f38 100%)',
          }}
        >
          <p className="text-lg font-semibold tracking-tight text-white">PARADISE WORLD</p>
          <p className="mt-1.5 text-xs text-white/80">
            {isZh ? '3D 天堂花园实时渲染环境（需要启用 WebGL 渲染支持）' : 'Interactive 3D Paradise Garden (WebGL required)'}
          </p>
        </div>
      )}

      {/* Pavilion AI Workspace HUD (shown smoothly while Spirit works / presents, hidden inside Communication drawer) */}
      <PavilionAiHud lang={lang} />

      {/* Compact Collapsible Environment Dock (Anchored bottom-right on desktop / top-right on mobile so center garden & bottom Spirit bar stay unobstructed) */}
      <div
        className="pointer-events-none fixed right-3 top-[calc(3.85rem+env(safe-area-inset-top))] md:top-auto md:bottom-[max(1.25rem,env(safe-area-inset-bottom))] md:right-4 z-20 flex flex-col items-end gap-2 max-w-[calc(100vw-1.5rem)] md:max-w-[430px]"
      >
        {controlsOpen && (
          <div className="pointer-events-auto w-[min(92vw,420px)] rounded-2xl border border-white/15 bg-[#0c1420]/92 p-3.5 shadow-2xl text-xs text-slate-100">
            {/* Real-Time Weather & Local Clock Banner */}
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-200">
                  <Radio className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {agentSnap.liveWeather
                      ? agentSnap.liveWeather.unavailable
                        ? isZh
                          ? '实时气象服务暂不可用'
                          : 'Live weather unavailable'
                        : `${agentSnap.liveWeather.locationName} · ${Math.round(agentSnap.liveWeather.temperatureC)}°C · ${isZh ? agentSnap.liveWeather.conditionZh : agentSnap.liveWeather.conditionEn}`
                      : isZh
                      ? '正在同步真实天气...'
                      : 'Syncing live weather...'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void fetchLiveWeather(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/8 px-2 text-[10px] text-slate-200 hover:bg-white/16 cursor-pointer"
                  title={isZh ? '按当前位置刷新真实天气' : 'Locate & refresh live weather'}
                >
                  <LocateFixed className="h-3 w-3" />
                  <span>{isZh ? '定位' : 'Locate'}</span>
                </button>
                <button
                  type="button"
                  onClick={restoreRealtimeSync}
                  className={`inline-flex h-7 items-center rounded-lg px-2 text-[10px] font-medium cursor-pointer ${
                    agentSnap.realtimeSync ? 'bg-emerald-400/22 text-emerald-200' : 'bg-white/10 text-slate-200 hover:bg-white/18'
                  }`}
                >
                  {isZh ? '实时同步' : 'Live Sync'}
                </button>
              </div>
            </div>

            {/* Day-Night Controls */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 font-medium text-slate-100">
                <SunMedium className="h-3.5 w-3.5 text-amber-300" />
                <span>{isZh ? '昼夜循环' : 'Day & Night'}</span>
                <span className="text-slate-400 tabular-nums">
                  {currentPhaseLabel} · {currentClockLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAutoCycle}
                className={`min-h-[30px] rounded-lg px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  autoCycle ? 'bg-amber-300/20 text-amber-200' : 'bg-white/8 text-slate-300 hover:bg-white/14'
                }`}
              >
                {agentSnap.realtimeSync ? (isZh ? '真实时间' : 'Real-Time') : autoCycle ? (isZh ? '自动演示' : 'Demo Cycle') : isZh ? '手动时间' : 'Manual'}
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'dawn', zh: '黎明', en: 'Dawn' },
                  { id: 'day', zh: '白天', en: 'Day' },
                  { id: 'dusk', zh: '黄昏', en: 'Dusk' },
                  { id: 'evening', zh: '傍晚', en: 'Evening' },
                  { id: 'night', zh: '夜晚', en: 'Night' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyTimePreset(p.id)}
                  className="min-h-[32px] rounded-lg bg-white/8 px-2.5 text-[11px] font-medium text-slate-200 hover:bg-white/16 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isZh ? p.zh : p.en}
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={timeOfDay}
              aria-label={isZh ? '时间滑块' : 'Time of day'}
              onChange={(e) => {
                const v = Number(e.target.value);
                uiStateManager.setRealtimeSync(false);
                if (envRef.current) {
                  envRef.current.autoCycle = false;
                  envRef.current.timeOfDay = v;
                }
                setAutoCycle(false);
                setTimeOfDay(v);
              }}
              className="mt-2.5 w-full accent-amber-300 cursor-pointer"
            />

            {/* Dynamic Weather Controls */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 font-medium text-slate-100">
                <Wind className="h-3.5 w-3.5 text-sky-300" />
                <span>{isZh ? '天气系统' : 'Weather'}</span>
              </div>
              <button
                type="button"
                onClick={toggleAutoWeather}
                className={`min-h-[30px] rounded-lg px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  autoWeather ? 'bg-sky-400/20 text-sky-200' : 'bg-white/8 text-slate-300 hover:bg-white/14'
                }`}
              >
                {agentSnap.realtimeSync ? (isZh ? '跟随实况' : 'Live') : autoWeather ? (isZh ? '自动演变' : 'Auto') : isZh ? '固定天气' : 'Fixed'}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {WEATHER_OPTIONS.map((w) => {
                const selected = activeWeather === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => applyWeather(w.id)}
                    className={`min-h-[32px] rounded-lg px-2 text-[11px] font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                      selected
                        ? 'bg-white text-slate-900'
                        : 'bg-white/8 text-slate-200 hover:bg-white/15'
                    }`}
                  >
                    {isZh ? w.zh : w.en}
                  </button>
                );
              })}
            </div>

            {/* Camera Viewpoints */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-white/10">
              {CAMERA_PRESETS.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => moveCameraToPreset(cp)}
                  className={`min-h-[32px] inline-flex items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    cameraPreset === cp.id
                      ? 'bg-emerald-300/22 text-emerald-100'
                      : 'bg-white/8 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  <Compass className="h-3 w-3" />
                  <span>{isZh ? cp.zh : cp.en}</span>
                </button>
              ))}
            </div>

            {/* Render Quality Tier Selector */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 font-medium text-slate-100">
                <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-300" />
                <span>{isZh ? '画质等级' : 'Quality'}</span>
              </div>
              <div className="inline-flex rounded-lg bg-white/8 p-0.5 gap-0.5">
                {QUALITY_OPTIONS.map((opt) => {
                  const active = userQuality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectQuality(opt.id)}
                      className={`min-h-[26px] rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        active ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {isZh ? opt.zh : opt.en}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Always-accessible single-row control strip */}
        <div className="pointer-events-auto inline-flex items-center rounded-xl border border-white/15 bg-[#0c1420]/90 divide-x divide-white/12 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setControlsOpen((o) => !o)}
            className="inline-flex h-10 md:h-9 items-center gap-2 px-3 text-[11px] font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer whitespace-nowrap"
          >
            {agentSnap.realtimeSync && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
            <span className="tabular-nums text-amber-200">{currentClockLabel}</span>
            <span className="text-slate-300">
              {currentPhaseLabel} ·{' '}
              {agentSnap.liveWeather && !agentSnap.liveWeather.unavailable && agentSnap.realtimeSync
                ? `${Math.round(agentSnap.liveWeather.temperatureC)}°C ${isZh ? activeWeatherMeta.zh : activeWeatherMeta.en}`
                : isZh
                ? activeWeatherMeta.zh
                : activeWeatherMeta.en}
            </span>
            {controlsOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-300" /> : <ChevronUp className="h-3.5 w-3.5 text-slate-300" />}
          </button>

          <button
            type="button"
            onClick={() => moveCameraToPreset(CAMERA_PRESETS[0])}
            className="inline-flex h-10 w-10 md:h-9 md:w-9 items-center justify-center text-slate-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
            title={isZh ? '重置视角' : 'Reset View'}
            aria-label={isZh ? '重置视角' : 'Reset View'}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {immersive && onImmersiveChange && (
            <button
              type="button"
              onClick={() => onImmersiveChange(false)}
              className="h-10 md:h-9 px-3 bg-[#F7F5F0] text-[11px] font-medium text-[#0c1420] hover:bg-[#EAE5DC] transition-colors cursor-pointer whitespace-nowrap"
            >
              {isZh ? '退出' : 'Exit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParadiseWorld3D;
