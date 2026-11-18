import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Eye, Maximize2, Minimize2, RotateCcw, Sparkles, Waves } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  detectWebGLSupport,
  isSoftwareRenderer,
  prefersReducedMotion,
} from '../spatial/webglCapabilities.ts';
import {
  createOceanDomeMaterial,
  createVolumetricGodRays,
  OceanPostShader,
} from './oceanShaders.ts';
import { createOceanEnvironment } from './oceanEnvironment.ts';
import { createMarineCreatures } from './marineCreatures.ts';
import {
  createOceanSimulation,
  type GlassImpactEvent,
  type ImpactFrequencyMode,
} from './oceanSimulation.ts';

export interface DeepSeaSceneProps {
  lang: Language;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
}

interface OverlayCrackState {
  active: boolean;
  xPct: number;
  yPct: number;
  seed: number;
  strength: number;
}

/**
 * Generates an authentic underwater PMREM reflection environment:
 * cool bright cyan overhead solar dome fading into deep Prussian blue abyss below,
 * replacing bright studio RoomEnvironment so wet marine skin catches realistic underwater glints.
 */
function buildUnderwaterEnvTexture(pmremGen: THREE.PMREMGenerator): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  const sphereGeo = new THREE.SphereGeometry(20, 24, 16);
  const sphereMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 deepCol = vec3(0.01, 0.04, 0.08);
        vec3 midCol = vec3(0.03, 0.16, 0.25);
        vec3 topCol = vec3(0.32, 0.78, 0.92);
        vec3 col = mix(deepCol, midCol, smoothstep(-0.6, 0.15, y));
        col = mix(col, topCol, smoothstep(0.25, 0.95, y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const envMesh = new THREE.Mesh(sphereGeo, sphereMat);
  envScene.add(envMesh);

  const rt = pmremGen.fromScene(envScene, 0.04);
  sphereGeo.dispose();
  sphereMat.dispose();
  return rt;
}

function playSubtleGlassThud(strength: number) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.close().catch(() => {});
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(108 * (0.85 + strength * 0.2), now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.24);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14 * strength, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 360);
  } catch {
    // Graceful no-op when audio output isn't unlocked
  }
}

export const DeepSeaScene: React.FC<DeepSeaSceneProps> = ({
  lang,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const [webglReady, setWebglReady] = useState<boolean>(() => detectWebGLSupport());
  const [contextLost, setContextLost] = useState(false);
  const [impactMode, setImpactMode] = useState<ImpactFrequencyMode>('normal');
  const [overlayCrack, setOverlayCrack] = useState<OverlayCrackState>({
    active: false,
    xPct: 50,
    yPct: 50,
    seed: 1,
    strength: 0,
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<ReturnType<typeof createOceanSimulation> | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const crackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    simRef.current?.setImpactFrequency(impactMode);
  }, [impactMode]);

  useEffect(() => {
    if (!immersive || !onImmersiveChange) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onImmersiveChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive, onImmersiveChange]);

  useEffect(() => {
    if (!webglReady) return;
    const container = stageRef.current;
    if (!container) return;

    let disposed = false;
    let paused = false;
    let rafId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let oceanPass: ShaderPass | null = null;
    let composerRT: THREE.WebGLRenderTarget | null = null;
    let pmremGen: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;

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
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010c18');
    scene.fog = new THREE.FogExp2('#031e33', 0.0205);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 180);
    const baseCamPos = new THREE.Vector3(0, 0.9, 9.5);
    const baseLookAt = new THREE.Vector3(0, -1.7, -16);
    camera.position.copy(baseCamPos);
    camera.lookAt(baseLookAt);

    // Custom underwater specular PMREM reflection map (cool solar zenith + abyssal nadir)
    pmremGen = new THREE.PMREMGenerator(renderer);
    envRT = buildUnderwaterEnvTexture(pmremGen);
    scene.environment = envRT.texture;
    scene.environmentIntensity = isSoftwareGl ? 0.42 : 0.65;

    // -------------------------------------------------------------------------
    // Calibrated Underwater Lighting Rig (AmbientLight + DirectionalLight + Rim)
    // -------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight('#0b2f48', 0.46);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#4ab8df', '#04121d', 0.68);
    scene.add(hemiLight);

    const sunDirectionalLight = new THREE.DirectionalLight('#a6ecff', 2.45);
    sunDirectionalLight.position.set(14, 44, 10);
    scene.add(sunDirectionalLight);

    const rimDirectionalLight = new THREE.DirectionalLight('#1e6e94', 0.92);
    rimDirectionalLight.position.set(-16, 10, -28);
    scene.add(rimDirectionalLight);

    const reefScatterLight = new THREE.PointLight('#145a78', 0.85, 34, 1.4);
    reefScatterLight.position.set(0, -6, -8);
    scene.add(reefScatterLight);

    // 1. Pelagic Beer-Lambert Water Dome
    const domeGeo = new THREE.SphereGeometry(98, isSoftwareGl ? 24 : 36, isSoftwareGl ? 16 : 24);
    const domeMat = createOceanDomeMaterial();
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    scene.add(domeMesh);

    // 2. Depth-Aware Volumetric Light Scattering Shader (God Rays)
    const godRays = createVolumetricGodRays(isSoftwareGl ? 8 : isTouch ? 10 : 14);
    scene.add(godRays.group);

    // 3. Real 3D Overhead Water Surface + Seabed Normal Maps + Reefs + Kelp
    const envTier = isSoftwareGl
      ? {
          kelpCount: 65,
          bubbleCount: 130,
          snowCount: 220,
          rockCount: 28,
          coralClusters: 16,
          maxAnisotropy: 1,
        }
      : isTouch
      ? {
          kelpCount: 115,
          bubbleCount: 220,
          snowCount: 380,
          rockCount: 40,
          coralClusters: 24,
          maxAnisotropy: 4,
        }
      : {
          kelpCount: 165,
          bubbleCount: 340,
          snowCount: 640,
          rockCount: 54,
          coralClusters: 32,
          maxAnisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
        };

    const environment = createOceanEnvironment(envTier);
    scene.add(environment.group);

    // 4. Anatomical 3D Marine Creatures
    const creatureTier = isSoftwareGl
      ? {
          baitfishCount: 70,
          tropicalCount: 22,
          pelagicCount: 4,
          jellyCount: 5,
          turtleCount: 2,
          dolphinCount: 2,
          sharkCount: 2,
          mantaCount: 1,
          isSoftwareGl: true,
        }
      : isTouch
      ? {
          baitfishCount: 95,
          tropicalCount: 28,
          pelagicCount: 5,
          jellyCount: 6,
          turtleCount: 2,
          dolphinCount: 3,
          sharkCount: 2,
          mantaCount: 2,
          isSoftwareGl: false,
        }
      : {
          baitfishCount: 135,
          tropicalCount: 42,
          pelagicCount: 7,
          jellyCount: 8,
          turtleCount: 2,
          dolphinCount: 3,
          sharkCount: 2,
          mantaCount: 2,
          isSoftwareGl: false,
        };

    const creatures = createMarineCreatures(creatureTier);
    scene.add(creatures.group);

    // 5. Post-Processing Pipeline (Depth-Dynamic Refraction Shader + Subtle Bloom + OutputPass)
    let usePost = !isSoftwareGl && !reducedMotion;
    if (usePost) {
      try {
        composerRT = new THREE.WebGLRenderTarget(
          Math.max(1, Math.floor(width * dpr)),
          Math.max(1, Math.floor(height * dpr)),
          { type: THREE.HalfFloatType }
        );
        composer = new EffectComposer(renderer, composerRT);
        composer.setPixelRatio(dpr);
        composer.setSize(width, height);
        composer.addPass(new RenderPass(scene, camera));

        bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.19, 0.52, 0.88);
        composer.addPass(bloomPass);

        oceanPass = new ShaderPass(OceanPostShader);
        oceanPass.uniforms.uAspect.value = width / Math.max(1, height);
        oceanPass.uniforms.uMotionScale.value = reducedMotion ? 0.15 : 1.0;
        oceanPass.uniforms.uCameraDepth.value = 0.45;
        composer.addPass(oceanPass);

        composer.addPass(new OutputPass());
      } catch {
        usePost = false;
      }
    }

    let activeImpactAge = -1;
    let cameraShakeTime = 0;
    let cameraShakeStrength = 0;

    const handleGlassImpact = (event: GlassImpactEvent) => {
      activeImpactAge = 0;
      cameraShakeTime = 0.65;
      cameraShakeStrength = 0.52 * event.strength;

      if (oceanPass) {
        oceanPass.uniforms.uImpactCenter.value.copy(event.uv);
        oceanPass.uniforms.uImpactTime.value = 0;
        oceanPass.uniforms.uImpactStrength.value = event.strength;
        oceanPass.uniforms.uCrackSeed.value = Math.random() * 25 + 1;
      } else {
        setOverlayCrack({
          active: true,
          xPct: event.uv.x * 100,
          yPct: (1 - event.uv.y) * 100,
          seed: Math.random(),
          strength: event.strength,
        });
        if (crackTimerRef.current) window.clearTimeout(crackTimerRef.current);
        crackTimerRef.current = window.setTimeout(() => {
          setOverlayCrack((prev) => ({ ...prev, active: false }));
        }, 2650);
      }

      environment.spawnImpactBubbles(event.worldPoint, event.dirToCam, event.strength);
      playSubtleGlassThud(event.strength);
    };

    const sim = createOceanSimulation({
      creatures,
      reducedMotion,
      onGlassImpact: handleGlassImpact,
    });
    sim.setImpactFrequency(impactMode);
    simRef.current = sim;

    const pointerNdc = new THREE.Vector2(0, 0);
    const prevPointerNdc = new THREE.Vector2(0, 0);
    const camOffset = new THREE.Vector2(0, 0);
    let pointerActive = false;
    let pointerSpeed = 0;
    let dragLookX = 0;
    let dragLookY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    resetViewRef.current = () => {
      dragLookX = 0;
      dragLookY = 0;
      camOffset.set(0, 0);
    };

    const updatePointerCoords = (clientX: number, clientY: number) => {
      const rect = renderer?.domElement.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const dx = nx - prevPointerNdc.x;
      const dy = ny - prevPointerNdc.y;
      pointerSpeed = Math.min(6.0, pointerSpeed * 0.4 + Math.hypot(dx, dy) * 32.0);
      prevPointerNdc.set(nx, ny);
      pointerNdc.set(nx, ny);
      pointerActive = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointerCoords(e.clientX, e.clientY);
      if (isDragging) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragLookX = THREE.MathUtils.clamp(dragLookX - dx * 0.0085, -4.8, 4.8);
        dragLookY = THREE.MathUtils.clamp(dragLookY + dy * 0.006, -2.6, 3.0);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      updatePointerCoords(e.clientX, e.clientY);
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onPointerLeave = () => {
      pointerActive = false;
      isDragging = false;
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };

    const onContextRestored = () => {
      setContextLost(false);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointermove', onPointerMove, { passive: true });
    domEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    domEl.addEventListener('pointerleave', onPointerLeave);
    domEl.addEventListener('webglcontextlost', onContextLost);
    domEl.addEventListener('webglcontextrestored', onContextRestored);

    const onVisChange = () => {
      paused = document.hidden;
    };
    document.addEventListener('visibilitychange', onVisChange);

    const handleResize = () => {
      if (!renderer || disposed) return;
      const w = Math.max(300, container.clientWidth);
      const h = Math.max(300, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
      if (bloomPass) bloomPass.resolution.set(w, h);
      if (oceanPass) oceanPass.uniforms.uAspect.value = w / Math.max(1, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    let lastNow = performance.now();
    let elapsed = 0;
    let lowFpsAccum = 0;
    let downgraded = false;

    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    let swBusy = false;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      if (paused) {
        lastNow = performance.now();
        return;
      }

      if (isSoftwareGl && swBusy) return;

      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      const motionMult = reducedMotion ? 0.25 : 1.0;
      elapsed += dt * motionMult;

      if (!isSoftwareGl && !downgraded) {
        if (dt > 0.044) {
          lowFpsAccum += dt;
          if (lowFpsAccum > 2.5) {
            downgraded = true;
            creatures.baitfishInst.count = Math.max(48, Math.floor(creatures.baitfishInst.count * 0.65));
            creatures.tropicalInst.count = Math.max(16, Math.floor(creatures.tropicalInst.count * 0.7));
          }
        } else {
          lowFpsAccum = Math.max(0, lowFpsAccum - dt * 0.5);
        }
      }

      pointerSpeed *= Math.exp(-dt * 4.5);

      const targetParallaxX = (pointerActive ? pointerNdc.x * 1.35 : 0) + dragLookX;
      const targetParallaxY = (pointerActive ? pointerNdc.y * 0.85 : 0) + dragLookY;
      camOffset.x += (targetParallaxX - camOffset.x) * Math.min(1, dt * 2.8);
      camOffset.y += (targetParallaxY - camOffset.y) * Math.min(1, dt * 2.8);

      const driftX = Math.sin(elapsed * 0.22) * 0.52;
      const driftY = Math.cos(elapsed * 0.29) * 0.34;

      let shakeX = 0;
      let shakeY = 0;
      let shakeZ = 0;
      if (cameraShakeTime > 0) {
        cameraShakeTime = Math.max(0, cameraShakeTime - dt);
        const decay = (cameraShakeTime / 0.65) * cameraShakeStrength;
        shakeX = Math.sin(elapsed * 58.0) * decay;
        shakeY = Math.cos(elapsed * 49.0) * decay * 0.85;
        shakeZ = Math.sin(elapsed * 36.0) * decay * 1.4;
      }

      const camY = THREE.MathUtils.clamp(
        baseCamPos.y + camOffset.y * 0.65 + driftY + shakeY,
        -4.2,
        7.5
      );
      camera.position.set(
        baseCamPos.x + camOffset.x * 0.9 + driftX + shakeX,
        camY,
        baseCamPos.z + shakeZ
      );
      camera.lookAt(
        baseLookAt.x + camOffset.x * 2.1 + shakeX * 1.5,
        baseLookAt.y + camOffset.y * 1.4 + shakeY * 1.5,
        baseLookAt.z
      );

      // Modulate overhead solar directional intensity subtly with surface wave cadence
      sunDirectionalLight.intensity = 2.35 + Math.sin(elapsed * 0.85) * 0.18;

      // Update Ocean World, Volumetric Shaders & Autonomous Boids
      domeMat.uniforms.uTime.value = elapsed;
      godRays.update(elapsed);
      environment.update(elapsed, dt * motionMult);
      sim.update(elapsed, dt * motionMult, camera, pointerNdc, pointerActive, pointerSpeed);

      if (activeImpactAge >= 0) {
        activeImpactAge += dt;
        if (oceanPass) oceanPass.uniforms.uImpactTime.value = activeImpactAge;
        if (activeImpactAge > 3.0) {
          activeImpactAge = -1;
          if (oceanPass) oceanPass.uniforms.uImpactTime.value = -1;
        }
      }

      if (usePost && composer && oceanPass) {
        oceanPass.uniforms.uTime.value = elapsed;
        // Pass normalized underwater camera depth (0 shallow .. 1 deep) to refraction shader
        oceanPass.uniforms.uCameraDepth.value = THREE.MathUtils.clamp((7.5 - camY) / 12.0, 0.12, 0.88);
        composer.render();
      } else if (renderer) {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl && isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          swBusy = true;
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.clientWaitSync(sync, 0, 0);
            if (
              status === gl2.ALREADY_SIGNALED ||
              status === gl2.CONDITION_SATISFIED ||
              status === gl2.WAIT_FAILED
            ) {
              gl2.deleteSync(sync);
              swBusy = false;
            } else {
              window.setTimeout(poll, 4);
            }
          };
          poll();
        }
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (crackTimerRef.current) window.clearTimeout(crackTimerRef.current);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pointerup', onPointerUp);

      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointerleave', onPointerLeave);
      domEl.removeEventListener('webglcontextlost', onContextLost);
      domEl.removeEventListener('webglcontextrestored', onContextRestored);
      if (domEl.parentNode === container) container.removeChild(domEl);

      bloomPass?.dispose();
      composer?.dispose();
      composerRT?.dispose();
      domeGeo.dispose();
      domeMat.dispose();
      godRays.dispose();
      environment.dispose();
      creatures.dispose();
      envRT?.dispose();
      pmremGen?.dispose();
      renderer?.dispose();
      simRef.current = null;
      resetViewRef.current = null;
    };
  }, [webglReady]);

  const cycleImpactMode = () => {
    setImpactMode((prev) => (prev === 'normal' ? 'rare' : prev === 'rare' ? 'off' : 'normal'));
  };

  const triggerApproach = () => {
    if (impactMode === 'off') setImpactMode('normal');
    simRef.current?.triggerImpactNow();
  };

  const modeLabel =
    impactMode === 'normal'
      ? isZh
        ? '生态偶遇：自动'
        : 'Encounter: Auto'
      : impactMode === 'rare'
      ? isZh
        ? '生态偶遇：较少'
        : 'Encounter: Rare'
      : isZh
      ? '生态偶遇：静默'
      : 'Encounter: Off';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#010c18] text-[#E6F8FF] select-none">
      {webglReady && !contextLost ? (
        <div
          key="deep-sea-webgl"
          ref={stageRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="EARTH ONE DeepSeaScene 3D Underwater World"
        />
      ) : (
        <div
          key="deep-sea-fallback"
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#083c57] via-[#031d32] to-[#010b15] p-8 text-center"
        >
          <Waves className="mb-3 h-10 w-10 text-cyan-300/80" />
          <p className="text-sm font-medium text-cyan-100">
            {isZh ? '深海世界正在兼容模式下运行' : 'DeepSeaScene running in compatible mode'}
          </p>
        </div>
      )}

      {/* Synchronized SVG Glass Fracture Overlay for Software WebGL / No-Composer fallback */}
      {overlayCrack.active && (
        <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden animate-in fade-in duration-100">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full opacity-90"
            style={{ filter: 'drop-shadow(0 0 4px rgba(186,245,255,0.85))' }}
          >
            <g
              stroke="rgba(224, 249, 255, 0.9)"
              strokeWidth={0.28 * (0.7 + overlayCrack.strength * 0.35)}
              fill="none"
            >
              {Array.from({ length: 14 }).map((_, i) => {
                const a = (i / 14) * Math.PI * 2 + overlayCrack.seed * 3.1;
                const len = 18 + ((i * 13) % 24);
                const x1 = overlayCrack.xPct;
                const y1 = overlayCrack.yPct;
                const mx = x1 + Math.cos(a + 0.08) * (len * 0.5);
                const my = y1 + Math.sin(a + 0.08) * (len * 0.5);
                const x2 = x1 + Math.cos(a - 0.05) * len;
                const y2 = y1 + Math.sin(a - 0.05) * len;
                return <polyline key={i} points={`${x1},${y1} ${mx},${my} ${x2},${y2}`} />;
              })}
              <circle cx={overlayCrack.xPct} cy={overlayCrack.yPct} r="6.5" strokeOpacity="0.65" />
              <circle cx={overlayCrack.xPct} cy={overlayCrack.yPct} r="14.5" strokeOpacity="0.45" />
              <circle cx={overlayCrack.xPct} cy={overlayCrack.yPct} r="24" strokeOpacity="0.24" />
            </g>
          </svg>
        </div>
      )}

      {/* Minimal grounded observation control capsule */}
      <div className="pointer-events-none fixed top-[calc(3.95rem+env(safe-area-inset-top))] right-3 md:top-auto md:right-auto md:bottom-7 md:left-[5.5rem] z-20">
        <div className="pointer-events-auto inline-flex items-center rounded-full border border-cyan-200/16 bg-[#031424]/74 backdrop-blur-2xl divide-x divide-cyan-200/12 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={cycleImpactMode}
            className="inline-flex h-10 md:h-9 items-center gap-1.5 px-3 text-[11px] font-medium text-cyan-100/90 hover:bg-cyan-400/15 hover:text-white transition-colors cursor-pointer"
            title={isZh ? '切换深海生物靠近交互频率' : 'Adjust marine encounter frequency'}
          >
            <Eye className="h-3.5 w-3.5 text-cyan-300" />
            <span className="hidden sm:inline">{modeLabel}</span>
          </button>

          <button
            type="button"
            onClick={triggerApproach}
            className="inline-flex h-10 md:h-9 items-center gap-1.5 px-3 text-[11px] font-medium text-cyan-100/90 hover:bg-cyan-400/15 hover:text-white transition-colors cursor-pointer"
            title={isZh ? '吸引远处大型海洋生物近距离游来' : 'Attract a deep-sea creature toward the lens'}
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-300" />
            <span className="hidden sm:inline">{isZh ? '吸引近游' : 'Approach'}</span>
          </button>

          {onImmersiveChange && (
            <button
              type="button"
              onClick={() => onImmersiveChange(!immersive)}
              className="inline-flex h-10 w-10 md:h-9 md:w-9 items-center justify-center text-cyan-100/90 hover:bg-cyan-400/15 hover:text-white transition-colors cursor-pointer"
              title={immersive ? (isZh ? '退出沉浸' : 'Exit Immersive') : (isZh ? '沉浸观赏' : 'Immersive View')}
            >
              {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => resetViewRef.current?.()}
            className="inline-flex h-10 w-10 md:h-9 md:w-9 items-center justify-center text-cyan-100/90 hover:bg-cyan-400/15 hover:text-white transition-colors cursor-pointer"
            title={isZh ? '恢复默认潜航视角' : 'Reset Camera View'}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeepSeaScene;
