import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, Download, Loader2, LocateFixed, MapPin, Radio, RotateCcw, Search, SlidersHorizontal, SunMedium, Wind, X } from 'lucide-react';
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
import { BRIDGE_CONFIG, createParadiseTerrain, terrainHeightAt } from './paradiseTerrain.ts';
import { createParadiseArchitecture } from './paradiseArchitecture.ts';
import { createParadiseFlora } from './paradiseFlora.ts';
import { createParadiseFauna } from './paradiseFauna.ts';
import { createParadiseWeatherFX } from './paradiseWeatherFX.ts';
import { createParadisePostPipeline, type ParadisePostPipeline } from './paradisePost.ts';
import { createParadiseSpirit } from './paradiseSpirit.ts';
import { createParadiseCat } from './paradiseCat.ts';
import { triggerImageDownload } from './SpiritSpeechBubble.tsx';
import { LiveLanguageStudio } from '../learning/LiveLanguageStudio.tsx';

type CameraPresetId = 'overlook' | 'bridge' | 'library' | 'pavilion' | 'aihub' | 'language';

interface CameraPreset {
  id: CameraPresetId;
  zh: string;
  en: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overlook', zh: '全景', en: 'Overlook', pos: [0.0, 9.6, 25.4], target: [0.0, 1.8, -0.4] },
  {
    id: 'bridge',
    zh: '溪桥',
    en: 'Bridge',
    pos: [BRIDGE_CONFIG.centerX + 5.6, 3.8, BRIDGE_CONFIG.centerZ + 10.8],
    target: [BRIDGE_CONFIG.centerX, 1.25, BRIDGE_CONFIG.centerZ],
  },
  { id: 'library', zh: '图书馆', en: 'Library', pos: [-4.8, 4.2, 11.4], target: [-9.8, 2.3, 1.6] },
  { id: 'language', zh: '语言中心', en: 'Language', pos: [3.6, 4.0, 15.8], target: [8.2, 2.2, 6.8] },
  { id: 'pavilion', zh: '音乐馆', en: 'Music Hall', pos: [4.2, 4.6, 4.2], target: [9.8, 2.7, -6.2] },
  { id: 'aihub', zh: 'AI 中心', en: 'AI Center', pos: [0.0, 4.8, 0.2], target: [0.0, 2.6, -10.8] },
];

const BUILDING_LANDMARKS: ReadonlyArray<{
  id: 'library' | 'chat' | 'aihub' | 'venus' | 'arabic-learning';
  zh: string;
  en: string;
  ar: string;
}> = [
  { id: 'library', zh: '图书馆', en: 'Library', ar: 'المكتبة' },
  { id: 'chat', zh: '通讯 · 电话亭', en: 'Telephone', ar: 'الهاتف' },
  { id: 'aihub', zh: 'AI 中心', en: 'ONE AI', ar: 'الذكاء' },
  { id: 'venus', zh: '音乐馆', en: 'Music Hall', ar: 'الموسيقى' },
  { id: 'arabic-learning', zh: '语言中心', en: 'Language Center', ar: 'اللغات' },
];

function getResponsiveCameraConfig(aspect: number): { fov: number; distScale: number } {
  if (aspect < 0.72) {
    // Portrait phone: expanded panoramic lens so all 5 spaciously separated houses fit immediately in one screen
    return { fov: 68, distScale: 1.32 };
  }
  if (aspect < 1.05) {
    // Portrait / square tablet (e.g. iPad portrait)
    return { fov: 62, distScale: 1.18 };
  }
  // Landscape tablet / desktop: expanded wide-screen panoramic vista showing the entire spacious garden upfront
  return { fov: 54, distScale: 1.0 };
}

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
  onSelectTab?: (tab: string) => void;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
}

export const ParadiseWorld3D: React.FC<ParadiseWorld3DProps> = ({
  lang,
  onSelectTab,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const stageRef = useRef<HTMLDivElement | null>(null);
  const onSelectTabRef = useRef(onSelectTab);
  onSelectTabRef.current = onSelectTab;
  const [hoveredLandmark, setHoveredLandmark] = useState<{ id: string; label: string } | null>(null);

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
  const spiritBubbleRef = useRef<HTMLDivElement | null>(null);
  const portalLabelRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
    camPos: new THREE.Vector3(0.0, 9.6, 25.4),
    camTarget: new THREE.Vector3(0.0, 1.8, -0.4),
  });

  const cameraMoveRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(0.0, 9.6, 25.4),
    targetLook: new THREE.Vector3(0.0, 1.8, -0.4),
  });

  const [locating, setLocating] = useState(false);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [liveClockNow, setLiveClockNow] = useState<Date>(() => new Date());

  // Live 1-second wall-clock ticker for crisp standard top-center desktop time
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveClockNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Sync browser status-bar theme-color & document backdrop while 3D Garden is active
  // so iPhone / iPad top notch safe-area matches the deep sky and NEVER flashes white glare.
  const isGardenDayTheme = agentSnap.gardenDaylight > 0.44;
  useEffect(() => {
    const skyColor = isGardenDayTheme ? '#1e4f94' : '#091322';
    const metaTags = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const prevMetaValues = metaTags.map((m) => m.getAttribute('content'));
    metaTags.forEach((m) => m.setAttribute('content', skyColor));

    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = skyColor;
    document.body.style.backgroundColor = skyColor;

    return () => {
      metaTags.forEach((m, idx) => {
        const orig = prevMetaValues[idx];
        if (orig !== null) m.setAttribute('content', orig);
      });
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, [isGardenDayTheme]);

  // Real-time external weather & standard location fetcher (GPS -> saved -> IP -> IANA timezone)
  const fetchLiveWeather = async (useGeoPrompt = false, customCity?: string) => {
    const WEATHER_LOC_KEY = 'earthone_live_location_v2';
    setLocateNotice(null);
    if (useGeoPrompt) setLocating(true);

    try {
      const tz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch {
          return '';
        }
      })();
      const params = new URLSearchParams();
      params.set('lang', isZh ? 'zh' : 'en');
      if (tz) params.set('tz', tz);

      if (customCity && customCity.trim()) {
        params.set('city', customCity.trim());
        try {
          localStorage.setItem(WEATHER_LOC_KEY, JSON.stringify({ city: customCity.trim(), updatedAt: Date.now() }));
        } catch {}
      } else if (useGeoPrompt && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 30000,
            })
          );
          const latStr = pos.coords.latitude.toFixed(5);
          const lonStr = pos.coords.longitude.toFixed(5);
          params.set('lat', latStr);
          params.set('lon', lonStr);
          try {
            localStorage.setItem(WEATHER_LOC_KEY, JSON.stringify({ lat: latStr, lon: lonStr, updatedAt: Date.now() }));
          } catch {}
        } catch (geoErr: any) {
          setLocateNotice(
            isZh
              ? '浏览器未授予 GPS 权限，已按网络与时区自动定位，也可手动输入城市。'
              : 'GPS permission unavailable; using automatic IP/timezone location or search a city below.'
          );
        }
      } else {
        // 1) Try already-granted high-accuracy GPS silently
        let gotGps = false;
        if (typeof navigator !== 'undefined' && navigator.permissions && navigator.geolocation) {
          try {
            const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            if (perm.state === 'granted') {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 8000,
                  maximumAge: 60000,
                })
              );
              params.set('lat', pos.coords.latitude.toFixed(5));
              params.set('lon', pos.coords.longitude.toFixed(5));
              gotGps = true;
            }
          } catch {
            // silent fallback
          }
        }
        // 2) Otherwise honor previously saved user location (city or GPS)
        if (!gotGps) {
          try {
            const rawSaved = localStorage.getItem(WEATHER_LOC_KEY);
            if (rawSaved) {
              const saved = JSON.parse(rawSaved);
              if (saved?.city) params.set('city', String(saved.city));
              else if (saved?.lat && saved?.lon) {
                params.set('lat', String(saved.lat));
                params.set('lon', String(saved.lon));
              }
            }
          } catch {
            // ignore storage errors
          }
        }
      }

      const res = await fetch(`/api/environment/weather?${params.toString()}`);
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
      if (realtimeSyncRef.current && data?.mappedWeather) {
        if (envRef.current) {
          envRef.current.autoWeather = false;
          envRef.current.targetWeather = data.mappedWeather as WeatherKind;
          if (data.mappedWeather === 'thunderstorm') envRef.current.triggerLightning();
        }
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
    } finally {
      if (useGeoPrompt) setLocating(false);
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

    if (cmd.weatherPreset) {
      if (engine) {
        engine.autoWeather = false;
        engine.targetWeather = cmd.weatherPreset;
        if (cmd.weatherPreset === 'thunderstorm') engine.triggerLightning();
      }
      setAutoWeather(false);
      setActiveWeather(cmd.weatherPreset);
    }
    if (cmd.timePreset) {
      if (engine) {
        engine.autoCycle = false;
        engine.setTimePreset(cmd.timePreset);
      }
      setAutoCycle(false);
      setTimeOfDay(TIME_PRESET_VALUES[cmd.timePreset]);
    }
  }, [agentSnap.weatherCommand]);

  // Subtle, quiet feature-reminder whispers from the butterfly while idling
  useEffect(() => {
    const promptsZh = [
      {
        text: '点击花园里的「图书馆」木屋，就能直接进去静心读书。',
        quickActions: [{ label: '进图书馆', action: 'open_library' as const }],
      },
      {
        text: '湖畔飞檐亭是「音乐馆」，点一下亭子或直接跟我说都能听歌。',
        quickActions: [{ label: '听轻音乐', action: 'play_music' as const }],
      },
      {
        text: '花园里的图书馆、语言中心、AI 中心、音乐馆和红色电话亭，点哪座就能进哪座。',
        quickActions: [],
      },
    ];
    const promptsEn = [
      {
        text: 'Click the Library house on the left meadow anytime to read.',
        quickActions: [{ label: 'Library', action: 'open_library' as const }],
      },
      {
        text: 'The lakeside pavilion is our Music Hall — tap it or ask me for music.',
        quickActions: [{ label: 'Play Music', action: 'play_music' as const }],
      },
      {
        text: 'Click any labeled building or the red Telephone Booth in the garden to enter.',
        quickActions: [],
      },
    ];

    let idx = 0;
    let hideTimer: number | null = null;
    const scheduleNext = () => {
      const snap = uiStateManager.getSnapshot();
      const busy =
        snap.liveVoiceActive ||
        snap.voiceListening ||
        snap.musicPlaying ||
        snap.commDrawerOpen ||
        snap.languageStudioOpen ||
        Boolean(snap.spiritBubble?.visible) ||
        Boolean(snap.pendingConfirmation);
      if (busy) return;

      const list = lang === 'zh' ? promptsZh : promptsEn;
      const item = list[idx % list.length];
      idx += 1;
      uiStateManager.setSpiritBubble({
        visible: true,
        isLoading: false,
        isAmbientHint: true,
        badge: '',
        text: item.text,
        quickActions: item.quickActions,
      });
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        const cur = uiStateManager.getSnapshot().spiritBubble;
        if (cur?.visible && cur.isAmbientHint) {
          uiStateManager.hideSpiritBubble();
        }
      }, 7500);
    };

    const initialTimer = window.setTimeout(scheduleNext, 16000);
    const interval = window.setInterval(scheduleNext, 48000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [lang]);

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
    const camCfg = getResponsiveCameraConfig(aspect);
    const camera = new THREE.PerspectiveCamera(camCfg.fov, aspect, 0.2, 260);

    if (persistedRef.current.hasCam) {
      camera.position.copy(persistedRef.current.camPos);
    } else {
      const baseTarget = new THREE.Vector3(0.0, 1.8, -0.4);
      const basePos = new THREE.Vector3(0.0, 9.6, 25.4);
      basePos.sub(baseTarget).multiplyScalar(camCfg.distScale).add(baseTarget);
      camera.position.copy(basePos);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.enablePan = true;
    controls.panSpeed = 0.65;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.85;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.minDistance = 5.5;
    controls.maxDistance = 46.0;
    controls.minPolarAngle = Math.PI * 0.14;
    controls.maxPolarAngle = Math.PI * 0.465;
    if (persistedRef.current.hasCam) {
      controls.target.copy(persistedRef.current.camTarget);
    } else {
      controls.target.set(0.0, 1.8, -0.4);
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
    sunLight.target.position.set(1.5, 0, -2.5);
    scene.add(sunLight.target);
    sunLight.castShadow = quality.enableShadows;
    if (quality.enableShadows) {
      sunLight.shadow.mapSize.width = quality.shadowMapSize;
      sunLight.shadow.mapSize.height = quality.shadowMapSize;
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 88;
      const d = 22;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.00035;
      sunLight.shadow.normalBias = 0.018;
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
    // Skip HalfFloat EffectComposer on touch devices (phones/tablets) & when all post FX are off:
    // direct MSAA rendering eliminates mobile Safari/iPadOS HalfFloat FBO white glare at the top sky!
    let postPipeline: ParadisePostPipeline | null = null;
    if (
      !quality.isSoftwareGl &&
      !quality.isTouch &&
      (quality.enableBloom || quality.enableGodRays || dynDofEnabled)
    ) {
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

    const portalGroups = architecture.portals.map((p) => p.group);
    let hoveredPortalId: string | null = null;

    const findHitPortal = () => {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(portalGroups, true);
      if (hits.length === 0) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        const match = architecture.portals.find((p) => p.group === obj);
        if (match) return match;
        obj = obj.parent;
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastMs < 40) return;
      lastRaycastMs = now;
      updateNdc(e.clientX, e.clientY);

      if (e.pointerType !== 'touch') {
        const hoveredPortal = findHitPortal();
        const nextId = hoveredPortal ? hoveredPortal.id : null;
        if (nextId !== hoveredPortalId) {
          hoveredPortalId = nextId;
          if (renderer) {
            renderer.domElement.style.cursor = hoveredPortal ? 'pointer' : '';
          }
          if (hoveredPortal) {
            const label =
              lang === 'ar'
                ? hoveredPortal.labelAr
                : lang === 'en'
                  ? hoveredPortal.labelEn
                  : hoveredPortal.labelZh;
            setHoveredLandmark({ id: hoveredPortal.id, label });
          } else {
            setHoveredLandmark(null);
          }
        }
      }

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

      // 1. Check Spirit Butterfly & Garden Cat first
      const actorHits = raycaster.intersectObjects([spirit.hitTarget, cat.hitTarget], true);
      if (actorHits.length > 0) {
        const hitObj = actorHits[0].object;
        if (hitObj === cat.hitTarget) {
          weatherFX.emitPetalBurst(cat.group.position);
          return;
        }
        uiStateManager.setPavilionHudOpen(false);
        if (spiritStateRef.current === 'idle_explore' || spiritStateRef.current === 'sleeping_in_house' || spiritStateRef.current === 'returning_to_rest') {
          uiStateManager.setSpiritState('woken_approaching');
        }
        const aiName = uiStateManager.getSnapshot().aiName;
        uiStateManager.setSpiritBubble({
          visible: true,
          isLoading: false,
          badge: lang === 'zh' ? '花径伴侣' : 'Garden Companion',
          text:
            lang === 'zh'
              ? `我在呢！点击花园里的图书馆、音乐馆、语言中心、AI 中心或红色电话亭都可以直接进入，也可以直接和我聊天。`
              : `I'm right here! Click any labeled building or the red Phone Booth to enter, or chat directly with ${aiName}.`,
        });
        weatherFX.emitPetalBurst(spirit.spiritPos);
        return;
      }

      // 2. Check ALL 5 Permanent Labeled Architectural Landmarks (click directly to enter!)
      const clickedPortal = findHitPortal();
      if (clickedPortal) {
        weatherFX.emitPetalBurst(clickedPortal.worldPos);
        setHoveredLandmark(null);
        onSelectTabRef.current?.(clickedPortal.id);
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
      if (hoveredPortalId !== null) {
        hoveredPortalId = null;
        if (renderer) renderer.domElement.style.cursor = '';
        setHoveredLandmark(null);
      }
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
      const nextCamCfg = getResponsiveCameraConfig(nextAspect);
      camera.aspect = nextAspect;
      camera.fov = nextCamCfg.fov;
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
      sunLight.position.copy(activeKeyDir).multiplyScalar(42).add(sunLight.target.position);
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

      // Warm lakeside Music Pavilion lantern, Library hearth, Language Hall, AI Center & Red Phone Booth glow
      architecture.lanternLight.intensity = st.lanternGlow * 2.2;
      architecture.lanternGlassMat.emissiveIntensity = 0.12 + st.lanternGlow * 1.85;
      const spiritSleeping = spiritStateRef.current === 'sleeping_in_house' || spiritStateRef.current === 'returning_to_rest';
      architecture.restHouseLight.intensity = 0.25 + st.lanternGlow * 1.5 + (spiritSleeping ? 0.85 : 0);
      architecture.restWindowMat.emissiveIntensity = 0.18 + st.lanternGlow * 1.35 + (spiritSleeping ? 0.55 : 0);
      for (const lgt of architecture.extraLights) {
        lgt.intensity = 0.35 + st.lanternGlow * 1.75;
      }
      for (const wMat of architecture.extraWindowMats) {
        wMat.emissiveIntensity = 0.28 + st.lanternGlow * 1.25;
      }
      for (const portal of architecture.portals) {
        const isHovered = hoveredPortalId === portal.id;
        portal.signMat.emissiveIntensity = (isHovered ? 0.66 : 0.3) + st.lanternGlow * 0.44;
      }
      architecture.aiCrownGroup.rotation.y = elapsed * 0.42;
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

      // Project 3D Spirit head position to 2D viewport for the live overhead speech bubble (0 React re-renders/frame)
      const bubbleEl = spiritBubbleRef.current;
      if (bubbleEl) {
        spirit.getHeadWorldPosition(tmpKeyWorld);
        tmpKeyWorld.project(camera);
        const rect = container.getBoundingClientRect();
        const vw = rect.width || window.innerWidth;
        const vh = rect.height || window.innerHeight;
        const isCompact = vw < 1024;
        const topSafe = isCompact ? 132 : 112;
        const bottomSafe = isCompact ? 124 : 110;
        let sx = (tmpKeyWorld.x * 0.5 + 0.5) * vw + rect.left;
        let sy = (-tmpKeyWorld.y * 0.5 + 0.5) * vh + rect.top;
        // If Spirit is momentarily behind the camera, anchor cleanly in upper-left safe zone
        if (tmpKeyWorld.z > 1) {
          sx = rect.left + Math.min(vw * 0.36, 240);
          sy = rect.top + Math.max(topSafe + 30, vh * 0.42);
        } else {
          const padX = Math.min(isCompact ? 155 : 185, vw * 0.43);
          sx = Math.max(rect.left + padX, Math.min(rect.left + vw - padX, sx));
          sy = Math.max(rect.top + topSafe, Math.min(rect.top + vh - bottomSafe, sy));
        }
        bubbleEl.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`;
      }

      // Project crisp clickable 2D DOM architectural waypoint tags cleanly over each of the 5 buildings
      // (GPU translate3d direct DOM updates — zero React re-renders per frame)
      const labelRect = container.getBoundingClientRect();
      const lvw = labelRect.width || window.innerWidth;
      const lvh = labelRect.height || window.innerHeight;
      for (const portal of architecture.portals) {
        const tagEl = portalLabelRefs.current[portal.id];
        if (!tagEl) continue;
        tmpKeyWorld.copy(portal.labelPos).project(camera);
        const inFront = tmpKeyWorld.z >= -1 && tmpKeyWorld.z <= 1;
        const px = (tmpKeyWorld.x * 0.5 + 0.5) * lvw;
        const py = (-tmpKeyWorld.y * 0.5 + 0.5) * lvh;
        const visible = inFront && px > 36 && px < lvw - 36 && py > 62 && py < lvh - 32;
        if (visible) {
          tagEl.style.opacity = '1';
          tagEl.style.pointerEvents = 'auto';
          tagEl.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0) translate(-50%, -100%)`;
        } else {
          tagEl.style.opacity = '0';
          tagEl.style.pointerEvents = 'none';
        }
      }

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
        uiStateManager.setGardenDaylight(st.dayFactor);
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
    if (engine) {
      engine.autoCycle = false;
      engine.setTimePreset(preset);
    }
    setAutoCycle(false);
    setTimeOfDay(TIME_PRESET_VALUES[preset]);
  };

  const toggleAutoCycle = () => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    const next = !autoCycle;
    if (engine) {
      engine.autoCycle = next;
    }
    setAutoCycle(next);
  };

  const applyWeather = (w: WeatherKind) => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    if (engine) {
      engine.autoWeather = false;
      engine.targetWeather = w;
      if (w === 'thunderstorm') engine.triggerLightning();
    }
    setAutoWeather(false);
    setActiveWeather(w);
  };

  const toggleAutoWeather = () => {
    const engine = envRef.current;
    uiStateManager.setRealtimeSync(false);
    const next = !autoWeather;
    if (engine) {
      engine.autoWeather = next;
    }
    setAutoWeather(next);
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
    const el = stageRef.current;
    const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : window.innerWidth / Math.max(1, window.innerHeight);
    const { distScale } = getResponsiveCameraConfig(aspect);
    const look = new THREE.Vector3(...preset.target);
    const pos = new THREE.Vector3(...preset.pos);
    pos.sub(look).multiplyScalar(distScale).add(look);
    cameraMoveRef.current.targetPos.copy(pos);
    cameraMoveRef.current.targetLook.copy(look);
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
  const isDayUi = agentSnap.gardenDaylight > 0.44;
  // Glare-free natural stone/obsidian surfaces (no backdrop-blur or bright white rings over WebGL)
  const dockShellCls = isDayUi
    ? 'border-[#1d2d25]/14 bg-[#f3eee4]/92 text-[#1d2b24] shadow-[0_6px_18px_rgba(16,28,22,0.14)]'
    : 'border-white/12 bg-[#0f1722]/88 text-[#f2eee6] shadow-[0_8px_22px_rgba(4,8,14,0.34)]';
  const dockBorderCls = isDayUi ? 'border-black/10' : 'border-white/10';
  const dockDividerCls = isDayUi ? 'divide-black/10' : 'divide-white/12';
  const dockPillCls = isDayUi
    ? 'bg-black/[0.06] text-[#223029] hover:bg-black/[0.12]'
    : 'bg-white/[0.08] text-[#ece7dc] hover:bg-white/[0.15]';
  const dockActiveCls = isDayUi
    ? 'bg-[#2a3832] text-[#f7f4ee]'
    : 'bg-[#e9e2d4] text-[#17202b]';

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
          <p className="text-lg font-semibold tracking-tight text-white">EARTH ONE</p>
          <p className="mt-1.5 text-xs text-white/80">
            {isZh ? '3D 实时花园环境（需要启用 WebGL 渲染支持）' : 'Interactive 3D Paradise Garden (WebGL required)'}
          </p>
        </div>
      )}

      {/* Crisp 3D-Tracked Architectural Building Labels — razor-sharp vector text pinned above each of the 5 landmarks */}
      {webglReady && !contextLost && !immersive && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {BUILDING_LANDMARKS.map((lm) => {
            const labelText = lang === 'ar' ? lm.ar : lang === 'en' ? lm.en : lm.zh;
            const isHovered = hoveredLandmark?.id === lm.id;
            return (
              <button
                key={lm.id}
                ref={(el) => {
                  portalLabelRefs.current[lm.id] = el;
                }}
                type="button"
                onClick={() => onSelectTabRef.current?.(lm.id)}
                onMouseEnter={() => setHoveredLandmark({ id: lm.id, label: labelText })}
                onMouseLeave={() => setHoveredLandmark((prev) => (prev?.id === lm.id ? null : prev))}
                style={{ opacity: 0, willChange: 'transform, opacity' }}
                className={`absolute left-0 top-0 inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 sm:px-3 py-1 sm:py-1.5 text-[12.5px] sm:text-[14px] font-semibold tracking-wide transition-colors duration-150 cursor-pointer ${
                  isDayUi
                    ? isHovered
                      ? 'border-[#1d2d25]/45 bg-[#1b2b23] text-[#fffaf0] shadow-[0_6px_18px_rgba(12,24,18,0.34)]'
                      : 'border-[#1d2d25]/28 bg-[#1b2b23]/88 text-[#fcf8ef] hover:bg-[#1b2b23] shadow-[0_5px_16px_rgba(12,24,18,0.3)]'
                    : isHovered
                      ? 'border-[#e8cc82]/60 bg-[#0d1724] text-[#fff8e6] shadow-[0_8px_22px_rgba(0,0,0,0.48)]'
                      : 'border-white/24 bg-[#0d1724]/88 text-[#f6f1e6] hover:bg-[#152436] shadow-[0_6px_18px_rgba(0,0,0,0.44)]'
                }`}
              >
                <span>{labelText}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Subtle Hover Prompt ONLY while pointing at one of the 5 clickable 3D buildings */}
      {hoveredLandmark && (
        <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[52] -translate-x-1/2">
          <div className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-medium tracking-wide transition-all ${dockShellCls}`}>
            <span>
              {isZh ? `点击进入 · ${hoveredLandmark.label}` : `Click to enter · ${hoveredLandmark.label}`}
            </span>
          </div>
        </div>
      )}

      {/* Interactive Language Learning & Free-Quota Image Studio Drawer */}
      <LiveLanguageStudio lang={lang} variant="garden-drawer" />

      {/* Full-Screen Generated Image Lightbox */}
      {agentSnap.imageLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => uiStateManager.setImageLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/15 bg-[#121a26] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={agentSnap.imageLightbox.imageUrl}
              alt={agentSnap.imageLightbox.captionZh}
              className="max-h-[76vh] max-w-[88vw] object-contain"
            />
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5 text-xs text-[#f4f0e8]">
              <div className="min-w-0">
                <div className="font-semibold truncate">{agentSnap.imageLightbox.captionZh}</div>
                <div className="text-[11px] opacity-65 truncate">
                  {agentSnap.imageLightbox.providerLabelZh || 'ONE 画室'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => agentSnap.imageLightbox && triggerImageDownload(agentSnap.imageLightbox)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#e9e1d0] px-3 py-1.5 font-medium text-[#141e2b] cursor-pointer hover:bg-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isZh ? '下载图片' : 'Download'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => uiStateManager.setImageLightbox(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white cursor-pointer hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top-Center Clock, Location & Live Weather Pill — strictly aligned on the same row as top navbar on phone, tablet & desktop */}
      <div
        className="pointer-events-none fixed left-1/2 -translate-x-1/2 top-[max(0.5rem,env(safe-area-inset-top))] sm:top-[max(0.65rem,env(safe-area-inset-top))] z-[56] flex flex-col items-center gap-2 max-w-[calc(100vw-11.25rem)] sm:max-w-[calc(100vw-13.5rem)] md:max-w-[calc(100vw-18.5rem)] lg:max-w-[calc(100vw-25rem)]"
      >
        <div className={`pointer-events-auto inline-flex h-8 sm:h-9 max-w-full items-center rounded-full border divide-x overflow-hidden transition-colors ${dockShellCls} ${dockDividerCls}`}>
          <button
            type="button"
            onClick={() => setControlsOpen((o) => !o)}
            className="inline-flex h-8 sm:h-9 min-w-0 max-w-full items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 text-[11px] sm:text-[11.5px] font-medium hover:opacity-85 transition-opacity cursor-pointer whitespace-nowrap"
            title={isZh ? '实时时间、定位与昼夜天气设置' : 'Live time, location, daylight & weather'}
          >
            <span className="tabular-nums text-[11px] sm:text-[12.5px] font-semibold tracking-tight leading-none shrink-0">
              {agentSnap.realtimeSync
                ? `${String(liveClockNow.getHours()).padStart(2, '0')}:${String(liveClockNow.getMinutes()).padStart(2, '0')}`
                : currentClockLabel}
            </span>
            <span className="opacity-35 leading-none shrink-0">·</span>
            <span className="inline-flex items-center min-w-0 max-w-[5.25rem] sm:max-w-[8.5rem] md:max-w-[10.5rem] lg:max-w-[175px] truncate opacity-90">
              <span className="truncate leading-none">
                {agentSnap.liveWeather && !agentSnap.liveWeather.unavailable
                  ? agentSnap.liveWeather.locationName
                  : isZh
                    ? '定位中'
                    : 'Locating'}
              </span>
            </span>
            {agentSnap.liveWeather && !agentSnap.liveWeather.unavailable && (
              <>
                <span className="hidden md:inline opacity-35 leading-none shrink-0">·</span>
                <span className="hidden md:inline opacity-85 leading-none shrink-0">
                  {Math.round(agentSnap.liveWeather.temperatureC)}°C {isZh ? activeWeatherMeta.zh : activeWeatherMeta.en}
                </span>
              </>
            )}
            {controlsOpen ? <ChevronUp className="h-3 w-3 opacity-65 shrink-0" /> : <ChevronDown className="h-3 w-3 opacity-65 shrink-0" />}
          </button>

          <button
            type="button"
            onClick={() => void fetchLiveWeather(true)}
            disabled={locating}
            className="hidden md:inline-flex h-9 w-9 items-center justify-center opacity-80 hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-45 shrink-0"
            title={isZh ? '高精度 GPS 重新定位' : 'Refresh precise GPS location'}
            aria-label={isZh ? '高精度定位' : 'Locate'}
          >
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => moveCameraToPreset(CAMERA_PRESETS[0])}
            className="hidden md:inline-flex h-9 w-9 items-center justify-center opacity-80 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
            title={isZh ? '重置视角' : 'Reset View'}
            aria-label={isZh ? '重置视角' : 'Reset View'}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {immersive && onImmersiveChange && (
            <button
              type="button"
              onClick={() => onImmersiveChange(false)}
              className={`h-8 sm:h-9 px-2 sm:px-3 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${dockActiveCls}`}
            >
              {isZh ? '退出' : 'Exit'}
            </button>
          )}
        </div>

        {controlsOpen && (
          <div className={`pointer-events-auto w-[min(92vw,372px)] max-h-[calc(100dvh-11.5rem)] overflow-y-auto overscroll-contain rounded-[22px] border p-3.5 text-xs transition-colors ${dockShellCls}`}>

            <div className={`mb-2.5 space-y-2 rounded-xl border px-2.5 py-2 ${dockBorderCls} ${isDayUi ? 'bg-white/48' : 'bg-white/[0.04]'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium">
                    <Radio className="h-3 w-3 shrink-0 opacity-75" />
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
                  <div className="mt-0.5 text-[10px] opacity-65 tabular-nums">
                    {liveClockNow.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                    {agentSnap.liveWeather?.locationSource === 'gps'
                      ? isZh ? ' · GPS 精确定位' : ' · GPS Precise'
                      : agentSnap.liveWeather?.locationSource === 'city'
                        ? isZh ? ' · 指定城市' : ' · Selected City'
                        : agentSnap.liveWeather?.locationSource === 'ip'
                          ? isZh ? ' · 网络自动定位' : ' · IP Auto-Locate'
                          : isZh ? ' · 时区自动定位' : ' · Timezone Locate'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={locating}
                    onClick={() => void fetchLiveWeather(true)}
                    className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] cursor-pointer transition-colors disabled:opacity-50 ${dockPillCls}`}
                    title={isZh ? '按当前位置刷新真实天气' : 'Locate & refresh live weather'}
                  >
                    {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
                    <span>{isZh ? '精准定位' : 'GPS'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={restoreRealtimeSync}
                    className={`inline-flex h-7 items-center rounded-lg px-2 text-[10px] font-medium cursor-pointer transition-colors ${
                      agentSnap.realtimeSync ? dockActiveCls : dockPillCls
                    }`}
                  >
                    {isZh ? '实时同步' : 'Live'}
                  </button>
                </div>
              </div>

              {/* Manual Standard City Pinpoint Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = cityQuery.trim();
                  if (!q) return;
                  void fetchLiveWeather(false, q);
                  setCityQuery('');
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder={isZh ? '输入城市名校准定位（如：上海、西安、安曼、利雅得）' : 'Search city (e.g. Shanghai, Amman, London)'}
                  className={`h-7 flex-1 rounded-lg border bg-transparent px-2.5 text-[11px] focus:outline-none ${dockBorderCls}`}
                />
                <button
                  type="submit"
                  className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-medium cursor-pointer transition-colors ${dockPillCls}`}
                >
                  <Search className="h-3 w-3" />
                  <span>{isZh ? '切换' : 'Set'}</span>
                </button>
              </form>

              {locateNotice && (
                <div className="text-[10px] opacity-75 leading-relaxed">{locateNotice}</div>
              )}
            </div>

            <div className={`flex items-center justify-between gap-2 pb-2 border-b ${dockBorderCls}`}>
              <div className="flex items-center gap-1.5 font-medium">
                <SunMedium className="h-3.5 w-3.5 opacity-80" />
                <span>{isZh ? '昼夜光影' : 'Day & Night'}</span>
                <span className="opacity-65 tabular-nums">
                  {currentPhaseLabel} · {currentClockLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAutoCycle}
                className={`min-h-[28px] rounded-lg px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  autoCycle ? dockActiveCls : dockPillCls
                }`}
              >
                {agentSnap.realtimeSync ? (isZh ? '真实时间' : 'Real-Time') : autoCycle ? (isZh ? '自动演示' : 'Demo') : isZh ? '手动' : 'Manual'}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
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
                  className={`min-h-[30px] rounded-lg px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${dockPillCls}`}
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
              className={`mt-2 w-full cursor-pointer ${isDayUi ? 'accent-[#2a3832]' : 'accent-[#e9e2d4]'}`}
            />

            <div className={`mt-2.5 flex items-center justify-between gap-2 pt-2 border-t ${dockBorderCls}`}>
              <div className="flex items-center gap-1.5 font-medium">
                <Wind className="h-3.5 w-3.5 opacity-80" />
                <span>{isZh ? '天气系统' : 'Weather'}</span>
              </div>
              <button
                type="button"
                onClick={toggleAutoWeather}
                className={`min-h-[28px] rounded-lg px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  autoWeather ? dockActiveCls : dockPillCls
                }`}
              >
                {agentSnap.realtimeSync ? (isZh ? '跟随实况' : 'Live') : autoWeather ? (isZh ? '自动' : 'Auto') : isZh ? '固定' : 'Fixed'}
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
                    className={`min-h-[30px] rounded-lg px-2 text-[11px] font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                      selected ? dockActiveCls : dockPillCls
                    }`}
                  >
                    {isZh ? w.zh : w.en}
                  </button>
                );
              })}
            </div>

            <div className={`mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t ${dockBorderCls}`}>
              {CAMERA_PRESETS.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => moveCameraToPreset(cp)}
                  className={`min-h-[30px] inline-flex items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    cameraPreset === cp.id ? dockActiveCls : dockPillCls
                  }`}
                >
                  <Compass className="h-3 w-3" />
                  <span>{isZh ? cp.zh : cp.en}</span>
                </button>
              ))}
            </div>

            <div className={`mt-2.5 flex items-center justify-between gap-2 pt-2 border-t ${dockBorderCls}`}>
              <div className="flex items-center gap-1.5 font-medium">
                <SlidersHorizontal className="h-3.5 w-3.5 opacity-80" />
                <span>{isZh ? '画质等级' : 'Quality'}</span>
              </div>
              <div className={`inline-flex rounded-lg p-0.5 gap-0.5 ${isDayUi ? 'bg-black/[0.06]' : 'bg-white/[0.08]'}`}>
                {QUALITY_OPTIONS.map((opt) => {
                  const active = userQuality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectQuality(opt.id)}
                      className={`min-h-[26px] rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        active ? dockActiveCls : 'opacity-75 hover:opacity-100'
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
      </div>
    </div>
  );
};

export default ParadiseWorld3D;
