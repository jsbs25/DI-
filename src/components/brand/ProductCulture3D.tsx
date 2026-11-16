import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Compass, Layers, Maximize2, RotateCcw } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { BRAND_CONCEPTS, BrandMark } from './brandLogos.tsx';
import { useOptionalPlayerContext } from '../../music/PlayerContext.tsx';
import { createCosmosBackdrop, type CosmosBackdropHandle } from '../spatial/cosmosBackdrop.ts';
import {
  buildHorizonSculpture,
  buildInfinitySculpture,
  buildOriginFinalSculpture,
  createCultureMaterials,
  disposeCultureMaterials,
  type BuiltSculpture,
  type CultureConceptKey,
} from '../spatial/oneEmblemBuilder.ts';
import { createSpatialParticleField, type SpatialParticleField } from '../spatial/spatialParticles.ts';
import {
  detectWebGLSupport,
  isSoftwareRenderer,
  prefersReducedMotion,
} from '../spatial/webglCapabilities.ts';

export type { CultureConceptKey };

interface ProductCulture3DProps {
  lang: Language;
  activeConcept?: CultureConceptKey;
  onSelectConcept?: (concept: CultureConceptKey) => void;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
  onOpenBrandSystem?: () => void;
  onOpenSpace?: (tab: string) => void;
  shiftRightOnDesktop?: boolean;
}

export const CULTURE_PILLARS = [
  { code: '01', zh: '唯一', en: 'Uniqueness', descZh: '独立精神骨架，克制且跨越周期。', descEn: 'A sovereign geometric spine built to endure.' },
  { code: '02', zh: '统一', en: 'Unity', descZh: '多元文明与语言共处同一秩序之中。', descEn: 'Diverse civilizations united within one order.' },
  { code: '03', zh: '起源', en: 'Origin', descZh: '万象始于清醒而稳定的香槟金原点。', descEn: 'All form radiates from a lucid gold center.' },
  { code: '04', zh: '连接', en: 'Connection', descZh: '45° 翡翠门桥连通人与世界、过去与未来。', descEn: 'A 45° jade threshold bridging people and systems.' },
  { code: '05', zh: '无限', en: 'Infinity', descZh: '开放象限留白，面向未来持续生长。', descEn: 'An open quadrant embracing boundless evolution.' },
] as const;

function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => materials.add(m));
    } else if (mesh.material) {
      materials.add(mesh.material);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    if (m.userData?.ownedLocally) m.dispose();
  });
}

export const ProductCulture3D: React.FC<ProductCulture3DProps> = ({
  lang,
  activeConcept = 'origin-final',
  immersive = false,
  onImmersiveChange,
  shiftRightOnDesktop = false,
}) => {
  const isZh = lang === 'zh';
  const player = useOptionalPlayerContext();
  const concept = activeConcept;

  const [expanded, setExpanded] = useState(false);
  const [webglReady, setWebglReady] = useState<boolean>(() => detectWebGLSupport());
  const [contextLost, setContextLost] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const conceptRef = useRef<CultureConceptKey>(concept);
  const shiftRef = useRef<boolean>(shiftRightOnDesktop);
  const expandedRef = useRef<boolean>(expanded);
  const playerRef = useRef(player);

  const resetViewRef = useRef<(() => void) | null>(null);
  const rebuildSculptureRef = useRef<((nextConcept: CultureConceptKey) => void) | null>(null);

  conceptRef.current = concept;
  shiftRef.current = shiftRightOnDesktop;
  expandedRef.current = expanded;
  playerRef.current = player;

  const conceptMeta = useMemo(
    () => BRAND_CONCEPTS.find((c) => c.id === concept) || BRAND_CONCEPTS[0],
    [concept]
  );

  useEffect(() => {
    rebuildSculptureRef.current?.(concept);
  }, [concept]);

  useEffect(() => {
    resetViewRef.current?.();
  }, [shiftRightOnDesktop]);

  useEffect(() => {
    if (!webglReady) return;
    const container = stageRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let composerRT: THREE.WebGLRenderTarget | null = null;
    let pmremGen: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    let particleField: SpatialParticleField | null = null;
    let cosmosBackdrop: CosmosBackdropHandle | null = null;

    const width = Math.max(300, container.clientWidth || 640);
    const height = Math.max(300, container.clientHeight || 520);
    const isTouch =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    const reducedMotion = prefersReducedMotion();

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
    // Capped DPR keeps Retina M2 MacBook Air & iPad sharp without excess GPU fragment pressure
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isTouch ? 1.55 : 1.75);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010206);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 240);

    const computeHomePose = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      const aspect = w / Math.max(1, h);
      const offsetX = shiftRef.current && w >= 960 ? -1.35 : 0;
      const dist = aspect < 0.72 ? 9.4 : aspect < 1.05 ? 8.3 : 7.1;
      const target = new THREE.Vector3(offsetX, 0.02, 0);
      const pos = new THREE.Vector3(offsetX + 0.72, 0.42, dist);
      return { target, pos };
    };

    const initialPose = computeHomePose();
    camera.position.copy(initialPose.pos);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 4.4;
    controls.maxDistance = 14.0;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.78;
    controls.target.copy(initialPose.target);
    controls.update();

    // Subdued starlight reflection map for smoked titanium, crystal glass, and gold seed
    pmremGen = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmremGen.fromScene(roomEnv, 0.065);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.54;
    roomEnv.dispose();

    // Infinite 3D Universe Engine (volumetric blue-violet nebulae, spiral galaxies, blackbody starfield, meteors)
    cosmosBackdrop = createCosmosBackdrop({
      isSoftwareGl,
      reducedMotion,
      isTouch,
      pixelRatio: dpr,
    });
    scene.add(cosmosBackdrop.group);

    // Calibrated spatial lighting rig harmonizing central portal with the cosmos
    const hemi = new THREE.HemisphereLight(0xa6c8f5, 0x050712, 0.36);
    scene.add(hemi);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const rectTop = new THREE.RectAreaLight(0xe4f0ff, 0.95, 5.4, 2.0);
      rectTop.position.set(0, 4.8, 2.5);
      rectTop.lookAt(0, 0, 0);
      scene.add(rectTop);
    }

    const keyLight = new THREE.DirectionalLight(0xeef4ff, 1.24);
    keyLight.position.set(8.5, 5.8, 5.5);
    scene.add(keyLight);

    const iceRimLight = new THREE.DirectionalLight(0x5eaeff, 0.76);
    iceRimLight.position.set(-7.5, 2.4, -7.0);
    scene.add(iceRimLight);

    const oceanBounceLight = new THREE.DirectionalLight(0x3a78bd, 0.36);
    oceanBounceLight.position.set(5.5, -4.5, -8.5);
    scene.add(oceanBounceLight);

    const goldAccentLight = new THREE.PointLight(0xd4b67c, 0.44, 10, 1.5);
    goldAccentLight.position.set(0.35, 0.95, 2.9);
    scene.add(goldAccentLight);

    // Multi-depth floating foreground cosmic stardust
    if (!isSoftwareGl && !reducedMotion) {
      particleField = createSpatialParticleField(isTouch ? 180 : 340, dpr);
      scene.add(particleField.points);
    }

    const mats = createCultureMaterials(isSoftwareGl);

    // Central Beautified Concept #1 Sovereign Entrance floating gracefully above the bottom AI bar
    const pivot = new THREE.Group();
    pivot.position.y = 0.24;
    pivot.scale.setScalar(0.9);
    scene.add(pivot);

    let sculpture: BuiltSculpture | null = null;
    let needsDraw = true;

    const mountSculpture = (c: CultureConceptKey) => {
      if (sculpture) {
        pivot.remove(sculpture.group);
        disposeObject3D(sculpture.group);
      }
      if (c === 'infinity') sculpture = buildInfinitySculpture(mats, isSoftwareGl);
      else if (c === 'horizon') sculpture = buildHorizonSculpture(mats, isSoftwareGl);
      else sculpture = buildOriginFinalSculpture(mats, isSoftwareGl);

      pivot.add(sculpture.group);
      needsDraw = true;
    };

    rebuildSculptureRef.current = mountSculpture;
    mountSculpture(conceptRef.current);

    // Selective ultra-restrained optical Bloom (ONLY catches ice blue-white crystal edges & brightest star cores)
    if (!isSoftwareGl && !reducedMotion) {
      composerRT = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(width * dpr)),
        Math.max(1, Math.floor(height * dpr)),
        {
          type: THREE.HalfFloatType,
        }
      );
      composer = new EffectComposer(renderer, composerRT);
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.18, // restrained optical glow strength (zero whitewash)
        0.32, // tight halo radius
        0.90  // high luminance threshold
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());

      // Pre-compile shaders cleanly to eliminate first-interaction hitch on M2 / desktop
      renderer.compile(scene, camera);
    }

    resetViewRef.current = () => {
      if (!controls) return;
      const pose = computeHomePose();
      controls.target.copy(pose.target);
      camera.position.copy(pose.pos);
      controls.update();
      needsDraw = true;
    };

    let isDragging = false;
    const onControlStart = () => {
      isDragging = true;
      needsDraw = true;
    };
    const onControlEnd = () => {
      isDragging = false;
      needsDraw = true;
    };
    const onControlChange = () => {
      needsDraw = true;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);
    controls.addEventListener('change', onControlChange);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const pointerWorld = new THREE.Vector3();
    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerDamped = new THREE.Vector2(0, 0);
    const tmpVec = new THREE.Vector3();
    let pointerActive = 0;
    let hoveredEmblem = false;
    let expandProgress = 0;
    let audioBassSmoothed = 0;
    let audioMidSmoothed = 0;
    const fftBins = new Uint8Array(32);
    let downPos = { x: 0, y: 0 };

    const updatePointerFromEvent = (e: PointerEvent) => {
      if (!renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerTarget.copy(pointerNdc);
      pointerActive = 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) return;
      updatePointerFromEvent(e);
      if (!renderer) return;

      let nextEmblemHover = false;
      if (sculpture) {
        raycaster.setFromCamera(pointerNdc, camera);
        const emblemHits = raycaster.intersectObjects(sculpture.group.children, true);
        nextEmblemHover = emblemHits.length > 0;
      }

      hoveredEmblem = nextEmblemHover;
      renderer.domElement.style.cursor = nextEmblemHover ? 'pointer' : isDragging ? 'grabbing' : 'grab';
      needsDraw = true;
    };

    const onPointerLeave = () => {
      pointerActive = 0;
      pointerTarget.set(0, 0);
      hoveredEmblem = false;
      if (renderer) renderer.domElement.style.cursor = 'grab';
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
      updatePointerFromEvent(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved > 6 || !renderer) return;
      updatePointerFromEvent(e);
      raycaster.setFromCamera(pointerNdc, camera);
      if (sculpture) {
        const hits = raycaster.intersectObjects(sculpture.group.children, true);
        if (hits.length > 0) {
          setExpanded((prev) => !prev);
          needsDraw = true;
        }
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      needsDraw = true;
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const resizeToContainer = () => {
      if (disposed || !renderer || !controls) return;
      const w = Math.max(300, container.clientWidth || 640);
      const h = Math.max(300, container.clientHeight || 520);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        bloomPass?.setSize(w, h);
      }

      if (!isDragging) {
        const pose = computeHomePose();
        controls.target.copy(pose.target);
        camera.position.z = pose.pos.z;
        controls.update();
      }
      needsDraw = true;
    };

    const ro = new ResizeObserver(resizeToContainer);
    ro.observe(container);
    let orientTimer: ReturnType<typeof setTimeout> | null = null;
    const onOrient = () => {
      if (orientTimer) clearTimeout(orientTimer);
      orientTimer = setTimeout(resizeToContainer, 150);
    };
    window.addEventListener('orientationchange', onOrient);

    let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onVisChange = () => {
      hidden = document.visibilityState === 'hidden';
      if (!hidden) needsDraw = true;
    };
    document.addEventListener('visibilitychange', onVisChange);

    let swRenderedOnce = false;
    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed || !renderer || !controls) return;
      rafId = requestAnimationFrame(animate);
      if (hidden) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      let rawBass = 0;
      let rawMid = 0;
      const pApi = playerRef.current;
      if (pApi?.state?.isPlaying) {
        const analyser = pApi.getAudioAnalyser();
        if (analyser) {
          analyser.getByteFrequencyData(fftBins);
          let lowSum = 0;
          let midSum = 0;
          for (let i = 0; i < 6; i++) lowSum += fftBins[i] || 0;
          for (let i = 6; i < 18; i++) midSum += fftBins[i] || 0;
          rawBass = lowSum / (6 * 255);
          rawMid = midSum / (12 * 255);
        }
      }
      audioBassSmoothed = THREE.MathUtils.damp(audioBassSmoothed, rawBass, 9, dt);
      audioMidSmoothed = THREE.MathUtils.damp(audioMidSmoothed, rawMid, 8, dt);

      mats.liquidUniforms.uTime.value = elapsed;
      mats.liquidUniforms.uAudioEnergy.value = audioBassSmoothed;
      mats.liquidUniforms.uHoverBoost.value = THREE.MathUtils.damp(
        mats.liquidUniforms.uHoverBoost.value,
        hoveredEmblem ? 1 : 0,
        7,
        dt
      );

      pointerDamped.x = THREE.MathUtils.damp(pointerDamped.x, pointerTarget.x, 5.2, dt);
      pointerDamped.y = THREE.MathUtils.damp(pointerDamped.y, pointerTarget.y, 5.2, dt);

      cosmosBackdrop?.update(elapsed, dt, pointerDamped.x, pointerDamped.y);

      if (particleField) {
        particleField.uniforms.uTime.value = elapsed;
        particleField.uniforms.uAudioBass.value = audioBassSmoothed;
        pointerWorld.set(pointerDamped.x * 3.4, pointerDamped.y * 2.2, 0.4);
        particleField.uniforms.uPointer.value.copy(pointerWorld);
        particleField.uniforms.uPointerStrength.value = THREE.MathUtils.damp(
          particleField.uniforms.uPointerStrength.value,
          pointerActive,
          5,
          dt
        );
      }

      const targetExpand = expandedRef.current ? 1 : 0;
      expandProgress = THREE.MathUtils.damp(expandProgress, targetExpand, 6.5, dt);
      if (sculpture) {
        for (const node of sculpture.expandables) {
          tmpVec.copy(node.expandDelta).multiplyScalar(expandProgress).add(node.basePos);
          node.object.position.copy(tmpVec);
        }
      }

      if (!reducedMotion && !isSoftwareGl) {
        if (!isDragging) {
          const targetRotY = Math.sin(elapsed * 0.2) * 0.18 + pointerDamped.x * 0.15;
          const targetRotX = Math.cos(elapsed * 0.16) * 0.04 + pointerDamped.y * -0.08;
          pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, targetRotY, 4.5, dt);
          pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x, targetRotX, 4.5, dt);
          pivot.position.y = 0.24 + Math.sin(elapsed * 0.58) * 0.04;
        }
        if (sculpture?.animatedCore) {
          sculpture.animatedCore.rotation.y += dt * (0.32 + audioBassSmoothed * 0.8);
          const seedPulse = 1 + audioBassSmoothed * 0.12 + (hoveredEmblem ? 0.045 : 0);
          sculpture.animatedCore.scale.setScalar(
            THREE.MathUtils.damp(sculpture.animatedCore.scale.x, seedPulse, 10, dt)
          );
        }
        if (sculpture?.secondaryRing) {
          sculpture.secondaryRing.rotation.z -= dt * (0.09 + audioMidSmoothed * 0.3);
        }
        if (sculpture?.gimbalInner) {
          sculpture.gimbalInner.rotation.x += dt * 0.2;
          sculpture.gimbalInner.rotation.z -= dt * 0.15;
        }
        needsDraw = true;
      }

      controls.update();

      if (isSoftwareGl && swRenderedOnce && !needsDraw) return;

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        swRenderedOnce = true;
        needsDraw = false;
      }
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (orientTimer) clearTimeout(orientTimer);
      ro.disconnect();
      window.removeEventListener('orientationchange', onOrient);
      document.removeEventListener('visibilitychange', onVisChange);
      controls?.removeEventListener('start', onControlStart);
      controls?.removeEventListener('end', onControlEnd);
      controls?.removeEventListener('change', onControlChange);
      controls?.dispose();

      const domEl = renderer?.domElement;
      if (domEl) {
        domEl.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('pointerleave', onPointerLeave);
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointerup', onPointerUp);
        domEl.removeEventListener('webglcontextlost', onContextLost);
        domEl.removeEventListener('webglcontextrestored', onContextRestored);
        if (domEl.parentNode === container) {
          container.removeChild(domEl);
        }
      }

      bloomPass?.dispose();
      composer?.dispose();
      composerRT?.dispose();
      cosmosBackdrop?.dispose();
      particleField?.dispose();
      disposeObject3D(scene);
      disposeCultureMaterials(mats);
      envRT?.dispose();
      pmremGen?.dispose();
      renderer?.dispose();
      rebuildSculptureRef.current = null;
      resetViewRef.current = null;
    };
  }, [webglReady]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020308] text-[#F7F5F0] select-none">
      {webglReady && !contextLost ? (
        <div
          key="culture-webgl"
          ref={stageRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="EARTH ONE Immersive Cosmos & 3D Entrance"
        />
      ) : (
        <div key="culture-fallback" className="absolute inset-0 flex items-center justify-center bg-[#020308] p-8">
          <div className="flex flex-col items-center gap-4">
            <BrandMark concept={concept} mode="dark" lockup="symbol" size={180} />
            <p className="text-xs tracking-[0.2em] uppercase text-[#94D2FF]">
              {conceptMeta.name} · {conceptMeta.zhName}
            </p>
          </div>
        </div>
      )}

      {/* Discreet Apple-style spatial control capsule tucked out of the center AI zone */}
      <div className="pointer-events-none fixed top-[calc(3.95rem+env(safe-area-inset-top))] right-3 md:top-auto md:right-auto md:bottom-7 md:left-[5.5rem] z-20">
        <div className="pointer-events-auto inline-flex items-center rounded-full border border-white/14 bg-[#070B16]/72 backdrop-blur-2xl divide-x divide-white/10 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className={`inline-flex h-9 items-center gap-1.5 px-3.5 text-[11px] font-medium transition-colors cursor-pointer ${
              expanded
                ? 'bg-[#69B8FF]/20 text-[#D7EEFF]'
                : 'text-[#C2CFDF] hover:bg-white/[0.08] hover:text-white'
            }`}
            title={isZh ? '三维结构展开 / 合拢' : 'Explode / Assemble'}
          >
            <Layers className="h-3.5 w-3.5 text-[#8ECFFF]" />
            <span className="hidden sm:inline">{expanded ? (isZh ? '合拢' : 'Assemble') : (isZh ? '展开' : 'Expand')}</span>
          </button>

          <button
            type="button"
            onClick={() => resetViewRef.current?.()}
            className="inline-flex h-9 w-9 items-center justify-center text-[#C2CFDF] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            title={isZh ? '重置视角' : 'Reset View'}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {immersive && onImmersiveChange && (
            <button
              type="button"
              onClick={() => onImmersiveChange(false)}
              className="h-9 px-3.5 bg-[#F7F5F0] text-[11px] font-medium text-[#020308] hover:bg-[#EAE5DC] transition-colors cursor-pointer whitespace-nowrap"
            >
              {isZh ? '退出' : 'Exit'}
            </button>
          )}
        </div>
      </div>

      {/* Minimal Top Hint when Inspecting Fullscreen */}
      {immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 mx-auto flex max-w-[1360px] items-center justify-between px-4 sm:px-8 md:pl-[5.5rem]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-[#070B16]/78 backdrop-blur-2xl px-3.5 py-2 text-xs">
            <Compass className="h-3.5 w-3.5 text-[#8ECFFF]" />
            <span className="font-medium text-[#F7F5F0]">
              {conceptMeta.name} · {conceptMeta.zhName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#070B16]/78 backdrop-blur-2xl px-3.5 py-2 text-xs text-[#F7F5F0] hover:border-[#8ECFFF] cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5 text-[#8ECFFF]" />
            <span>{expanded ? (isZh ? '合拢' : 'Assemble') : (isZh ? '展开' : 'Explode')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductCulture3D;
