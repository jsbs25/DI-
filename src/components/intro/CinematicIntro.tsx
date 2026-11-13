import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Volume2, VolumeX, ArrowRight } from 'lucide-react';
import { User } from '../../types/index.ts';

/**
 * Three cinematic traversal phases merged into one continuous camera trajectory:
 * - 'hyperspace': Deep cosmic space & relativistic warp streaks
 * - 'cosmic': Stellar constellation, planetary orbits & celestial nexus
 * - 'digitalEarth': Luminous 3D Earth space with geo-arcs, beacons & atmosphere
 */
export type FlightStage = 'hyperspace' | 'cosmic' | 'digitalEarth';

interface CinematicIntroProps {
  onComplete: () => void;
  onAuthSuccess?: (user: User, token: string, isNewRegistration: boolean) => void;
  currentUser?: User | null;
}

// -------------------------------------------------------------
// Cinematic Web Audio Ambient Synthesizer
// -------------------------------------------------------------
class CinematicAudioSynth {
  private ctx: AudioContext | null = null;
  private oscs: OscillatorNode[] = [];
  private masterGain: GainNode | null = null;
  private isPlaying = false;

  start() {
    if (this.isPlaying) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.masterGain.gain.exponentialRampToValueAtTime(0.065, this.ctx.currentTime + 1.8);
      this.masterGain.connect(this.ctx.destination);

      // Deep harmonic cosmic chord: A1 (55Hz), E2 (82.4Hz), A2 (110Hz), E3 (164.8Hz), C#4 (277.2Hz)
      const freqs = [55.0, 82.4, 110.0, 164.81, 277.18];
      this.oscs = freqs.map((f, i) => {
        const osc = this.ctx!.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);
        const subGain = this.ctx!.createGain();
        subGain.gain.setValueAtTime(0.35 / (i + 1), this.ctx!.currentTime);
        osc.connect(subGain);
        subGain.connect(this.masterGain!);
        osc.start();
        return osc;
      });
      this.isPlaying = true;
    } catch {
      // Audio not permitted or supported
    }
  }

  playArrivalChime() {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      [440.0, 659.25, 880.0, 1318.5].forEach((f, idx) => {
        const chime = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(f, now + idx * 0.1);
        gain.gain.setValueAtTime(0.08, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.4);
        chime.connect(gain);
        gain.connect(this.masterGain!);
        chime.start(now + idx * 0.1);
        chime.stop(now + idx * 0.1 + 1.5);
      });
    } catch {}
  }

  stop() {
    if (!this.isPlaying || !this.ctx) return;
    try {
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
      }
      setTimeout(() => {
        this.oscs.forEach((o) => {
          try { o.stop(); } catch {}
        });
        this.oscs = [];
        this.ctx?.close().catch(() => {});
        this.ctx = null;
        this.isPlaying = false;
      }, 700);
    } catch {
      this.isPlaying = false;
    }
  }
}

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const synthRef = useRef<CinematicAudioSynth | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const isDoneRef = useRef(false);

  // Three.js animation references
  const animRef = useRef<{
    rafId: number;
    startTime: number;
    speedBoost: number;
    isDiving: boolean;
  }>({
    rafId: 0,
    startTime: performance.now(),
    speedBoost: 1.0,
    isDiving: false,
  });

  // Sound initialization
  useEffect(() => {
    synthRef.current = new CinematicAudioSynth();
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  const toggleSound = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!soundEnabled) {
      synthRef.current?.start();
      setSoundEnabled(true);
    } else {
      synthRef.current?.stop();
      setSoundEnabled(false);
    }
  };

  // Smooth final zoom and exit into the application
  const finishFlight = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    animRef.current.isDiving = true;
    animRef.current.speedBoost = 5.0;
    setIsFadingOut(true);
    synthRef.current?.playArrivalChime();

    window.setTimeout(() => {
      synthRef.current?.stop();
      onComplete();
    }, 750);
  }, [onComplete]);

  // Click anywhere or press key to glide into Earth
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finishFlight();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishFlight, soundEnabled]);

  // -------------------------------------------------------------
  // CONTINUOUS 3D FLIGHT: Cosmic Universe -> Zoom into Earth Space
  // -------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.012);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 700);
    // Initial cosmic universe camera position (high, distant, looking into the void towards Earth)
    camera.position.set(22, 42, 230);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // 1. PHASE 1: HYPERSPACE (Streak lines rushing along the cosmic axis)
    // -------------------------------------------------------------
    const warpCount = 1100;
    const warpPositions = new Float32Array(warpCount * 6);
    const warpColors = new Float32Array(warpCount * 6);
    const warpSpeeds = new Float32Array(warpCount);
    const warpLengths = new Float32Array(warpCount);

    for (let i = 0; i < warpCount; i++) {
      const x = (Math.random() - 0.5) * 160;
      const y = (Math.random() - 0.5) * 140;
      const z = Math.random() * 260 - 30;
      const len = 4.0 + Math.random() * 9.0;

      warpPositions[i * 6] = x;
      warpPositions[i * 6 + 1] = y;
      warpPositions[i * 6 + 2] = z;
      warpPositions[i * 6 + 3] = x;
      warpPositions[i * 6 + 4] = y;
      warpPositions[i * 6 + 5] = z - len;

      const pCol = Math.random();
      let r = 0.2, g = 0.8, b = 1.0;
      if (pCol > 0.7) {
        r = 1.0; g = 1.0; b = 1.0; // Pure white streak
      } else if (pCol > 0.4) {
        r = 0.65; g = 0.35; b = 1.0; // Electric violet
      }

      warpColors[i * 6] = r;
      warpColors[i * 6 + 1] = g;
      warpColors[i * 6 + 2] = b;
      warpColors[i * 6 + 3] = r * 0.15;
      warpColors[i * 6 + 4] = g * 0.15;
      warpColors[i * 6 + 5] = b * 0.35;

      warpSpeeds[i] = 1.6 + Math.random() * 2.8;
      warpLengths[i] = len;
    }

    const warpGeo = new THREE.BufferGeometry();
    warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPositions, 3));
    warpGeo.setAttribute('color', new THREE.BufferAttribute(warpColors, 3));
    const warpLines = new THREE.LineSegments(
      warpGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
    );
    scene.add(warpLines);

    // 2. PHASE 2: COSMIC (Celestial planetary cluster & energy nexus around Z = 60 to 20)
    // -------------------------------------------------------------
    const cosmicGroup = new THREE.Group();
    cosmicGroup.position.set(0, 0, 35);
    scene.add(cosmicGroup);

    // Crystalline Nexus Polyhedron
    const nexusCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.8, 1),
      new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    );
    const nexusInner = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
    );
    cosmicGroup.add(nexusCore, nexusInner);

    // Orbiting celestial planet bodies with laser beams
    const planetData = [
      { color: 0xfbbf24, dist: 5.2, speed: 0.8, size: 0.28 }, // Sun
      { color: 0x38bdf8, dist: 7.0, speed: 0.65, size: 0.22 }, // Earth
      { color: 0xe2e8f0, dist: 7.8, speed: 0.8, size: 0.14 }, // Moon
      { color: 0xfb923c, dist: 9.2, speed: 0.45, size: 0.32 }, // Jupiter
      { color: 0xfde047, dist: 10.6, speed: 0.38, size: 0.26, hasRing: true }, // Saturn
      { color: 0xef4444, dist: 11.8, speed: 0.55, size: 0.19 }, // Mars
      { color: 0x3b82f6, dist: 13.0, speed: 0.32, size: 0.24 }, // Neptune
      { color: 0xf472b6, dist: 14.2, speed: 0.5, size: 0.22 }, // Venus
      { color: 0x94a3b8, dist: 15.4, speed: 0.75, size: 0.17 }, // Mercury
      { color: 0x2dd4bf, dist: 16.6, speed: 0.35, size: 0.25 }, // Uranus
    ];

    const planetMeshes: THREE.Mesh[] = [];
    const planetBeams: THREE.Line[] = [];

    planetData.forEach((p) => {
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.size, 16, 16),
        new THREE.MeshBasicMaterial({ color: p.color, blending: THREE.AdditiveBlending })
      );
      if (p.hasRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.size * 1.5, p.size * 2.5, 32),
          new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
        );
        ring.rotation.x = Math.PI / 3;
        pMesh.add(ring);
      }
      cosmicGroup.add(pMesh);
      planetMeshes.push(pMesh);

      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const bLine = new THREE.Line(
        bGeo,
        new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
      );
      cosmicGroup.add(bLine);
      planetBeams.push(bLine);
    });

    // 3. PHASE 3: DIGITAL EARTH (Target destination globe positioned at Z = 0)
    // -------------------------------------------------------------
    const earthGroup = new THREE.Group();
    earthGroup.position.set(0, 0, 0);
    scene.add(earthGroup);

    // Geodesic wireframe globe
    const earthWire = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 46, 46),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.45 })
    );
    // Atmospheric glow core
    const earthCore = new THREE.Mesh(
      new THREE.SphereGeometry(2.35, 36, 36),
      new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.22 })
    );
    earthGroup.add(earthWire, earthCore);

    // Concentric orbital telemetry rings
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(3.1, 3.13, 96),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring1.rotation.x = Math.PI / 2.3;
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(3.55, 3.57, 80),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring2.rotation.x = -Math.PI / 3;
    ring2.rotation.y = Math.PI / 6;
    earthGroup.add(ring1, ring2);

    // Global city coordinate beacons
    const cityCoords = [
      { name: 'Tokyo', lat: 35.67, lng: 139.65 },
      { name: 'Beijing', lat: 39.9, lng: 116.4 },
      { name: 'London', lat: 51.5, lng: -0.12 },
      { name: 'New York', lat: 40.71, lng: -74.0 },
      { name: 'Cairo', lat: 30.04, lng: 31.23 },
      { name: 'Dubai', lat: 25.2, lng: 55.27 },
      { name: 'Sydney', lat: -33.86, lng: 151.2 },
      { name: 'Rio', lat: -22.9, lng: -43.17 },
      { name: 'Paris', lat: 48.85, lng: 2.35 },
      { name: 'Singapore', lat: 1.35, lng: 103.82 },
    ];

    const cityVecs: THREE.Vector3[] = [];
    cityCoords.forEach((c) => {
      const phi = (90 - c.lat) * (Math.PI / 180);
      const theta = (c.lng + 180) * (Math.PI / 180);
      const r = 2.42;
      const v = new THREE.Vector3(
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      cityVecs.push(v);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending })
      );
      beacon.position.copy(v);
      earthGroup.add(beacon);

      const topV = v.clone().multiplyScalar(1.25);
      const pPositions = new Float32Array([v.x, v.y, v.z, topV.x, topV.y, topV.z]);
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      const pLine = new THREE.Line(
        pGeo,
        new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
      );
      earthGroup.add(pLine);
    });

    // Great-circle data arcs crossing over the globe
    const arcPairs = [[0, 1], [1, 5], [5, 4], [4, 8], [8, 2], [2, 3], [3, 7], [0, 6], [1, 9]];
    arcPairs.forEach(([i1, i2]) => {
      const v1 = cityVecs[i1];
      const v2 = cityVecs[i2];
      const pts: THREE.Vector3[] = [];
      const segs = 32;
      for (let s = 0; s <= segs; s++) {
        const a = s / segs;
        const p = new THREE.Vector3().lerpVectors(v1, v2, a);
        const alt = 2.42 + Math.sin(a * Math.PI) * 0.48;
        p.normalize().multiplyScalar(alt);
        pts.push(p);
      }
      const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const arcLine = new THREE.Line(
        arcGeo,
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
      );
      earthGroup.add(arcLine);
    });

    // 4. Galaxy Deep Starfield
    // -------------------------------------------------------------
    const starCount = 2400;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 260;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 260;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 350;

      const rnd = Math.random();
      starColors[i * 3] = rnd > 0.6 ? 0.6 : 1.0;
      starColors[i * 3 + 1] = rnd > 0.3 ? 0.85 : 0.95;
      starColors[i * 3 + 2] = 1.0;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    );
    scene.add(starField);

    // Mouse parallax tracking
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetMouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetMouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    // -------------------------------------------------------------
    // SMOOTH CAMERA ZOOM: Deep Universe -> Zoom into Earth Space
    // -------------------------------------------------------------
    const flightDuration = 6.8; // Duration in seconds of the seamless cosmic flight

    const animate = () => {
      animRef.current.rafId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - animRef.current.startTime) / 1000;
      const boost = animRef.current.speedBoost;

      // Mouse smoothing
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      // Normalized progress with smooth ease-in-out curve
      const rawProgress = Math.min(1.0, (elapsed * boost) / flightDuration);
      // Smoothstep easing for cinematic camera acceleration and decelerated orbit arrival
      const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);

      // Camera Trajectory:
      // Z moves from deep space (230) -> sweeping through cosmic nexus (60) -> entering Earth space (4.8)
      let camZ = 230 - progress * 225.2;
      // Camera X and Y banking curves
      let camX = (1 - progress) * (22 * Math.cos(elapsed * 0.45)) + mouseX * 1.5;
      let camY = (1 - progress) * (42 * (1 - progress * 0.7) + Math.sin(elapsed * 0.3) * 5) + progress * 0.5 + mouseY * 1.5;

      // Final hyper-dive if user clicks / completes
      if (animRef.current.isDiving) {
        camZ -= 3.5;
      }

      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0, 0);

      // If flight completes smoothly, trigger finish
      if (rawProgress >= 1.0 && !isDoneRef.current) {
        finishFlight();
      }

      // Animate hyperspace streaks
      const wPos = warpGeo.attributes.position.array as Float32Array;
      const streakSpeed = (2.0 + Math.max(0, 1.2 - progress * 1.2)) * boost;
      for (let i = 0; i < warpCount; i++) {
        const spd = warpSpeeds[i] * streakSpeed;
        const len = warpLengths[i];
        wPos[i * 6 + 2] += spd;
        wPos[i * 6 + 5] = wPos[i * 6 + 2] - len;
        if (wPos[i * 6 + 2] > camera.position.z + 15) {
          wPos[i * 6 + 2] = camera.position.z - 160;
          wPos[i * 6 + 5] = wPos[i * 6 + 2] - len;
        }
      }
      warpGeo.attributes.position.needsUpdate = true;

      // Animate Cosmic nexus & planets
      nexusCore.rotation.x += 0.008;
      nexusCore.rotation.y += 0.012;
      nexusInner.rotation.x -= 0.01;

      planetData.forEach((p, idx) => {
        const pAngle = elapsed * 0.5 * p.speed + (idx * Math.PI * 2) / 10;
        const px = Math.cos(pAngle) * p.dist;
        const py = Math.sin(elapsed * 0.7 + idx) * 0.4;
        const pz = Math.sin(pAngle) * p.dist;

        const pm = planetMeshes[idx];
        pm.position.set(px, py, pz);

        const bLine = planetBeams[idx];
        const bPos = bLine.geometry.attributes.position.array as Float32Array;
        bPos[0] = 0; bPos[1] = 0; bPos[2] = 0;
        bPos[3] = px; bPos[4] = py; bPos[5] = pz;
        bLine.geometry.attributes.position.needsUpdate = true;
      });

      // Animate Digital Earth rotation & pulses
      earthGroup.rotation.y += 0.004;
      ring1.rotation.z -= 0.0025;
      ring2.rotation.z += 0.003;
      earthWire.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.008);

      starField.rotation.y += 0.00025;

      renderer.render(scene, camera);
    };

    animRef.current.rafId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animRef.current.rafId);
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [finishFlight]);

  return (
    <div
      onClick={finishFlight}
      className={`fixed inset-0 z-[250] bg-[#020617] select-none cursor-pointer overflow-hidden transition-opacity duration-700 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="EARTH ONE 宇宙穿梭"
      title="点击任意处直接进入"
    >
      {/* 3D WebGL Canvas Layer (Pure Visual Spectacle, Zero Text Overlays) */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Atmospheric Cinematic Vignette & Gradients */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#020617]/70 via-transparent to-[#020617]/60" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(2,6,23,0.8)_100%)]" />

      {/* Subtle Bottom Controls (Minimal Icons Only, Zero Text Overlay) */}
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between z-20 pointer-events-none">
        {/* Audio Toggle (Icon only) */}
        <button
          type="button"
          onClick={toggleSound}
          className={`pointer-events-auto p-3 rounded-full border backdrop-blur-md transition-all ${
            soundEnabled
              ? 'border-cyan-500/70 bg-cyan-950/70 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
              : 'border-slate-800/80 bg-slate-950/60 text-slate-400 hover:text-slate-200'
          }`}
          title={soundEnabled ? '静音音效 (M)' : '开启全息宇宙音频 (M)'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Minimal Direct Enter Icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finishFlight();
          }}
          className="pointer-events-auto p-3 rounded-full border border-cyan-500/40 bg-slate-950/70 text-cyan-200 hover:text-white hover:border-cyan-400 hover:bg-cyan-950/80 transition-all shadow-[0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-md group"
          title="直接进入系统 (Space / Esc)"
        >
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
