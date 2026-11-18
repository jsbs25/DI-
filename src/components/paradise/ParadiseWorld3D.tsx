import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ChevronDown, ChevronUp, Compass, RotateCcw, SunMedium, Wind } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  detectWebGLSupport,
  isSoftwareRenderer,
  prefersReducedMotion,
} from '../spatial/webglCapabilities.ts';
import { createParadiseTextures, detectParadiseQuality } from './paradiseQuality.ts';
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

type CameraPresetId = 'overlook' | 'bridge' | 'blossoms' | 'pavilion';

interface CameraPreset {
  id: CameraPresetId;
  zh: string;
  en: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overlook', zh: '全景', en: 'Overlook', pos: [-4.5, 8.2, 23.5], target: [2.5, 1.4, -2.5] },
  { id: 'bridge', zh: '溪桥', en: 'Bridge', pos: [-2.2, 4.2, 5.8], target: [-6.4, 1.1, -8.4] },
  { id: 'blossoms', zh: '花海', en: 'Blossoms', pos: [7.2, 2.8, 16.5], target: [-3.5, 1.3, 6.2] },
  { id: 'pavilion', zh: '亭台', en: 'Pavilion', pos: [3.2, 4.4, 5.2], target: [12.4, 2.2, -7.8] },
];

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

  const [webglReady, setWebglReady] = useState<boolean>(() => detectWebGLSupport());
  const [contextLost, setContextLost] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // Synced display HUD state (throttled updates so React never churns every animation frame)
  const [autoCycle, setAutoCycle] = useState(true);
  const [autoWeather, setAutoWeather] = useState(true);
  const [timeOfDay, setTimeOfDay] = useState(0.44);
  const [activeWeather, setActiveWeather] = useState<WeatherKind>('clear');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overlook');

  // Mutable engine command refs shared with WebGL animation loop (zero canvas tear-down on UI changes)
  const envRef = useRef<ParadiseEnvironmentEngine | null>(null);
  const cameraMoveRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    targetPos: new THREE.Vector3(-4.5, 8.2, 23.5),
    targetLook: new THREE.Vector3(2.5, 1.4, -2.5),
  });

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
    const quality = detectParadiseQuality(isSoftwareGl, reducedMotion, width, height);

    renderer.setPixelRatio(quality.pixelRatio);
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
    // Adjust initial overlook distance slightly on narrow portrait phones/foldables
    const portraitZScale = aspect < 0.78 ? 1.18 : 1.0;
    camera.position.set(-4.5 * portraitZScale, 8.2, 23.5 * portraitZScale);

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
    controls.target.set(2.5, 1.4, -2.5);
    controls.update();

    const onControlStart = () => {
      cameraMoveRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // Environment reflection map for realistic water sheen, bronze & wet dew highlights
    const pmremGen = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGen.fromScene(roomEnv, 0.05);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    roomEnv.dispose();
    pmremGen.dispose();

    const textures = createParadiseTextures(renderer.capabilities.getMaxAnisotropy());
    const envEngine = new ParadiseEnvironmentEngine(0.44, 'clear');
    envRef.current = envEngine;

    // 1. Sky Dome + Sun + Moon + Stars + Clouds + Rainbow + Lightning
    const skyDome = createParadiseSkyDome();
    scene.add(skyDome.mesh);

    // 2. Calibrated 3D Atmospheric Lighting (1 shadow caster + Hemisphere sky/ground + Pavilion lantern)
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

    // 3. Real Spatial World Modules
    const terrain = createParadiseTerrain(quality, textures);
    scene.add(terrain.group);

    const architecture = createParadiseArchitecture(quality, textures);
    scene.add(architecture.group);

    const flora = createParadiseFlora(quality, textures);
    scene.add(flora.group);

    const fauna = createParadiseFauna(quality, textures, flora.flowerSpots);
    scene.add(fauna.group);

    const weatherFX = createParadiseWeatherFX(quality, textures);
    scene.add(weatherFX.group);

    // Optional restrained optical Bloom on capable desktop/tablet GPUs (skipped on phone & software GL)
    let composer: EffectComposer | null = null;
    let composerRT: THREE.WebGLRenderTarget | null = null;
    let bloomPass: UnrealBloomPass | null = null;

    if (quality.enableBloom) {
      composerRT = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(width * quality.pixelRatio)),
        Math.max(1, Math.floor(height * quality.pixelRatio)),
        { type: THREE.HalfFloatType }
      );
      composer = new EffectComposer(renderer, composerRT);
      composer.setPixelRatio(quality.pixelRatio);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.16, 0.34, 0.9);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      renderer.compile(scene, camera);
    }

    // 4. Interactive Mouse / Touch Raycasting (Throttled for smooth FPS)
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
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(quality.pixelRatio);
        composer.setSize(w, h);
        bloomPass?.setSize(w, h);
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    window.addEventListener('orientationchange', handleResize);

    let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onVisibilityChange = () => {
      hidden = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Software-GL GPU fence pacing (prevents CPU-starvation on headless/VDI SwiftShader)
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

    const tick = () => {
      if (disposed || !renderer) return;
      if (hidden) {
        frameId = isSoftwareGl ? window.setTimeout(tick, 200) : requestAnimationFrame(tick);
        return;
      }

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt > 0 ? rawDt : 0.016, 0.08);
      const elapsed = clock.getElapsedTime();

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
      const moonBaseInt = THREE.MathUtils.smoothstep(st.moonDir.y, 0.0, 0.4) * 0.55 * (1 - st.cloudDarkness * 0.55);
      sunLight.intensity = useMoon ? moonBaseInt : Math.max(0.25, sunBaseInt);

      hemiLight.color.copy(st.hemiSkyColor);
      hemiLight.groundColor.copy(st.hemiGroundColor);
      hemiLight.intensity = THREE.MathUtils.lerp(0.38, 0.85, st.dayFactor) * THREE.MathUtils.lerp(1, 0.72, st.cloudDarkness);

      // Storm lightning scene illumination
      lightningLight.intensity = st.lightningFlash * 3.4;
      lightningLight.position.set(st.lightningAzimuth * 30, 32, -36);

      // Warm lakeside pavilion lantern glow
      architecture.lanternLight.intensity = st.lanternGlow * 2.2;
      architecture.lanternGlassMat.emissiveIntensity = 0.12 + st.lanternGlow * 1.85;
      for (const mat of architecture.wettableMaterials) {
        const baseR = typeof mat.userData.baseRoughness === 'number' ? mat.userData.baseRoughness : 0.7;
        mat.roughness = THREE.MathUtils.lerp(baseR, Math.max(0.14, baseR * 0.36), st.wetness);
      }

      // Sync Terrain, Water, Waterfall
      terrain.terrainUniforms.uWetness.value = st.wetness;
      terrain.waterUniforms.uTime.value = elapsed;
      terrain.waterUniforms.uSunDir.value.copy(st.sunDir);
      terrain.waterUniforms.uMoonDir.value.copy(st.moonDir);
      (terrain.waterUniforms.uSkyHorizon.value as THREE.Color).copy(st.horizonColor);
      (terrain.waterUniforms.uSkyZenith.value as THREE.Color).copy(st.zenithColor);
      (terrain.waterUniforms.uSunColor.value as THREE.Color).copy(st.sunLightColor);
      (terrain.waterUniforms.uFogColor.value as THREE.Color).copy(st.fogColor);
      terrain.waterUniforms.uFogDensity.value = st.fogDensity;
      terrain.waterUniforms.uDayFactor.value = st.dayFactor;
      terrain.waterUniforms.uNightFactor.value = st.nightFactor;
      terrain.waterUniforms.uWindStrength.value = st.windStrength;
      terrain.waterUniforms.uRainIntensity.value = st.rainIntensity;

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

      // Flora, Fauna, Weather FX
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
        pointerActive
      );
      weatherFX.update(
        elapsed,
        dt,
        controls.target,
        st.windStrength,
        st.rainIntensity,
        st.fogDensity,
        st.dayFactor,
        st.fogColor
      );

      // Smooth damped camera preset transitions (cancels cleanly on arrival or user drag)
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

      // Clamp camera gracefully above ground surface
      const camFloor = Math.max(0.8, terrainHeightAt(camera.position.x, camera.position.z) + 0.9);
      if (camera.position.y < camFloor) camera.position.y = camFloor;

      controls.update();

      if (composer) {
        composer.render();
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

      bloomPass?.dispose();
      composer?.dispose();
      composerRT?.dispose();
      skyDome.dispose();
      terrain.dispose();
      architecture.dispose();
      flora.dispose();
      fauna.dispose();
      weatherFX.dispose();
      textures.dispose();
      envRT.dispose();
      renderer?.dispose();
      envRef.current = null;
    };
  }, [webglReady]);

  const applyTimePreset = (preset: TimePreset) => {
    const engine = envRef.current;
    if (!engine) return;
    engine.autoCycle = false;
    engine.setTimePreset(preset);
    setAutoCycle(false);
    setTimeOfDay(TIME_PRESET_VALUES[preset]);
  };

  const toggleAutoCycle = () => {
    const engine = envRef.current;
    if (!engine) return;
    engine.autoCycle = !engine.autoCycle;
    setAutoCycle(engine.autoCycle);
  };

  const applyWeather = (w: WeatherKind) => {
    const engine = envRef.current;
    if (!engine) return;
    engine.autoWeather = false;
    engine.targetWeather = w;
    if (w === 'thunderstorm') engine.triggerLightning();
    setAutoWeather(false);
    setActiveWeather(w);
  };

  const toggleAutoWeather = () => {
    const engine = envRef.current;
    if (!engine) return;
    engine.autoWeather = !engine.autoWeather;
    setAutoWeather(engine.autoWeather);
  };

  const moveCameraToPreset = (preset: CameraPreset) => {
    setCameraPreset(preset.id);
    cameraMoveRef.current.targetPos.set(...preset.pos);
    cameraMoveRef.current.targetLook.set(...preset.target);
    cameraMoveRef.current.active = true;
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

      {/* Compact Collapsible Environment Dock (Safe-area aware, leaves center & AI orb 100% unobstructed) */}
      <div
        className="pointer-events-none fixed right-3 top-[calc(3.9rem+env(safe-area-inset-top))] md:top-auto md:right-auto md:bottom-[max(1.5rem,env(safe-area-inset-bottom))] md:left-[6.25rem] z-20 flex flex-col items-end md:items-start gap-2 max-w-[calc(100vw-1.5rem)] md:max-w-[440px]"
      >
        {controlsOpen && (
          <div className="pointer-events-auto w-[min(92vw,420px)] rounded-2xl border border-white/15 bg-[#0c1420]/88 p-3.5 shadow-2xl text-xs text-slate-100">
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
                {autoCycle ? (isZh ? '自动流转' : 'Auto') : isZh ? '手动时间' : 'Manual'}
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
                {autoWeather ? (isZh ? '自动演变' : 'Auto') : isZh ? '固定天气' : 'Fixed'}
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
            <div className="mt-3 flex items-center justify-between gap-1.5 pt-2.5 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-1.5">
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
            </div>
          </div>
        )}

        {/* Always-accessible single-row control strip */}
        <div className="pointer-events-auto inline-flex items-center rounded-xl border border-white/15 bg-[#0c1420]/84 divide-x divide-white/12 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setControlsOpen((o) => !o)}
            className="inline-flex h-10 md:h-9 items-center gap-2 px-3 text-[11px] font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="tabular-nums text-amber-200">{currentClockLabel}</span>
            <span className="text-slate-300">
              {currentPhaseLabel} · {isZh ? activeWeatherMeta.zh : activeWeatherMeta.en}
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
