import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Lock,
  Mail,
  User as UserIcon,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Compass,
  Play,
  RotateCcw,
  Zap
} from 'lucide-react';
import { User } from '../../types/index.ts';

export type FlightPhase = 'hyperspace' | 'cosmic' | 'digitalEarth';

interface CinematicIntroProps {
  onComplete: () => void;
  onAuthSuccess?: (user: User, token: string, isNewRegistration: boolean) => void;
  currentUser?: User | null;
}

// -------------------------------------------------------------
// Web Audio Ambient Synthesizer for Space Journey
// -------------------------------------------------------------
class CosmicFlightSynth {
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
      this.masterGain.gain.exponentialRampToValueAtTime(0.07, this.ctx.currentTime + 1.8);
      this.masterGain.connect(this.ctx.destination);

      // Deep space ambient drone chord: 55Hz (A1), 110Hz (A2), 164.81Hz (E3), 220Hz (A3)
      const freqs = [55.0, 110.0, 164.81, 220.0];
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

  playAccessChime() {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      [587.33, 880.0, 1174.66].forEach((f, idx) => {
        const chime = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(f, now + idx * 0.12);
        gain.gain.setValueAtTime(0.08, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.2);
        chime.connect(gain);
        gain.connect(this.masterGain!);
        chime.start(now + idx * 0.12);
        chime.stop(now + idx * 0.12 + 1.3);
      });
    } catch {}
  }

  stop() {
    if (!this.isPlaying || !this.ctx) return;
    try {
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.8);
      }
      setTimeout(() => {
        this.oscs.forEach((o) => {
          try { o.stop(); } catch {}
        });
        this.oscs = [];
        this.ctx?.close().catch(() => {});
        this.ctx = null;
        this.isPlaying = false;
      }, 850);
    } catch {
      this.isPlaying = false;
    }
  }
}

export function CinematicIntro({ onComplete, onAuthSuccess, currentUser }: CinematicIntroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const synthRef = useRef<CosmicFlightSynth | null>(null);

  // Authentication State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccessUser, setAuthSuccessUser] = useState<User | null>(currentUser || null);

  // Flight & Experience State
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [flightPhase, setFlightPhase] = useState<FlightPhase>('hyperspace');
  const [cameraSpeed, setCameraSpeed] = useState<number>(1.0);
  const [showTerminal, setShowTerminal] = useState(true);

  // Three.js instances ref
  const threeRefs = useRef<{
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    scene: THREE.Scene | null;
    rafId: number;
    startTime: number;
    speedBoost: number;
  }>({
    renderer: null,
    camera: null,
    scene: null,
    rafId: 0,
    startTime: performance.now(),
    speedBoost: 1.0,
  });

  // Sound initialization
  useEffect(() => {
    synthRef.current = new CosmicFlightSynth();
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  const toggleSound = () => {
    if (!soundEnabled) {
      synthRef.current?.start();
      setSoundEnabled(true);
    } else {
      synthRef.current?.stop();
      setSoundEnabled(false);
    }
  };

  // Complete and enter system with warp burst
  const completeIntro = useCallback(() => {
    setIsFadingOut(true);
    synthRef.current?.playAccessChime();
    threeRefs.current.speedBoost = 6.0; // Accelerate camera forward into core

    window.setTimeout(() => {
      synthRef.current?.stop();
      onComplete();
    }, 850);
  }, [onComplete]);

  // Handle Login submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setAuthError('请输入用户名/邮箱及访问密码');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setAuthSuccessUser(data.user);
        onAuthSuccess?.(data.user, data.token, !data.user.hasCompletedOnboarding);
        // Play success chime and trigger hyper-dive
        synthRef.current?.playAccessChime();
        window.setTimeout(() => {
          completeIntro();
        }, 600);
      } else {
        setAuthError(data.error || '认证失败，请检查凭据');
      }
    } catch {
      setAuthError('安全网关连接超时，请重试');
    } finally {
      setAuthLoading(false);
    }
  };

  // Quick 1-click test citizens
  const handleQuickDemoCitizen = (uname: string) => {
    setIdentifier(uname);
    setPassword('password123');
    setAuthError(null);
  };

  // Keyboard controls (Escape or Space to skip, M to mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        completeIntro();
      } else if (e.key === 'm' || e.key === 'M') {
        if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
          toggleSound();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completeIntro, soundEnabled]);

  // -------------------------------------------------------------
  // CONTINUOUS 3D COSMIC FLIGHT (Three.js Unified Scene)
  // -------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.015);

    const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 500);
    // Camera begins in deep space heading towards Earth
    camera.position.set(0, 3, 75);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    threeRefs.current.renderer = renderer;
    threeRefs.current.camera = camera;
    threeRefs.current.scene = scene;
    threeRefs.current.startTime = performance.now();
    threeRefs.current.speedBoost = 1.0;

    // 1. Hyperspace Warp Corridor (lines stretching across space)
    const warpLineCount = 950;
    const warpPositions = new Float32Array(warpLineCount * 6);
    const warpColors = new Float32Array(warpLineCount * 6);
    const warpSpeeds = new Float32Array(warpLineCount);
    const warpLengths = new Float32Array(warpLineCount);

    for (let i = 0; i < warpLineCount; i++) {
      const x = (Math.random() - 0.5) * 120;
      const y = (Math.random() - 0.5) * 120;
      const z = (Math.random() - 0.5) * 200;
      const len = 3.5 + Math.random() * 8.0;

      warpPositions[i * 6] = x;
      warpPositions[i * 6 + 1] = y;
      warpPositions[i * 6 + 2] = z;
      warpPositions[i * 6 + 3] = x;
      warpPositions[i * 6 + 4] = y;
      warpPositions[i * 6 + 5] = z - len;

      const pColor = Math.random();
      let r = 0.2, g = 0.8, b = 1.0;
      if (pColor > 0.75) {
        r = 1.0; g = 1.0; b = 1.0; // White beam
      } else if (pColor > 0.45) {
        r = 0.65; g = 0.35; b = 1.0; // Violet beam
      }

      warpColors[i * 6] = r;
      warpColors[i * 6 + 1] = g;
      warpColors[i * 6 + 2] = b;
      warpColors[i * 6 + 3] = r * 0.2;
      warpColors[i * 6 + 4] = g * 0.2;
      warpColors[i * 6 + 5] = b * 0.4;

      warpSpeeds[i] = 1.2 + Math.random() * 2.5;
      warpLengths[i] = len;
    }

    const warpGeo = new THREE.BufferGeometry();
    warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPositions, 3));
    warpGeo.setAttribute('color', new THREE.BufferAttribute(warpColors, 3));
    const warpLines = new THREE.LineSegments(
      warpGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    );
    scene.add(warpLines);

    // 2. Cosmic Civilization Planetary Cluster (Ten Celestial Bodies orbiting central nexus at Z = -25)
    const cosmicGroup = new THREE.Group();
    cosmicGroup.position.set(0, 0, -35);
    scene.add(cosmicGroup);

    // Crystalline Nexus core
    const nexusCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.6, 1),
      new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
    );
    const nexusInner = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.0, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending })
    );
    cosmicGroup.add(nexusCore, nexusInner);

    // Ten Planets of EARTH ONE
    const planetsData = [
      { id: 'sun', color: 0xfbbf24, dist: 3.5, speed: 0.9, size: 0.22 },
      { id: 'earth', color: 0x38bdf8, dist: 4.8, speed: 0.7, size: 0.16 },
      { id: 'moon', color: 0xe2e8f0, dist: 5.3, speed: 0.85, size: 0.11 },
      { id: 'jupiter', color: 0xfb923c, dist: 6.2, speed: 0.5, size: 0.25 },
      { id: 'saturn', color: 0xfde047, dist: 7.2, speed: 0.4, size: 0.2, hasRing: true },
      { id: 'mars', color: 0xef4444, dist: 8.0, speed: 0.65, size: 0.15 },
      { id: 'neptune', color: 0x3b82f6, dist: 8.8, speed: 0.35, size: 0.18 },
      { id: 'venus', color: 0xf472b6, dist: 9.6, speed: 0.6, size: 0.17 },
      { id: 'mercury', color: 0x94a3b8, dist: 10.4, speed: 0.8, size: 0.13 },
      { id: 'uranus', color: 0x2dd4bf, dist: 11.2, speed: 0.38, size: 0.19 },
    ];

    const planetMeshes: THREE.Mesh[] = [];
    const planetBeams: THREE.Line[] = [];

    planetsData.forEach((p, idx) => {
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.size, 16, 16),
        new THREE.MeshBasicMaterial({ color: p.color, blending: THREE.AdditiveBlending })
      );
      if (p.hasRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.size * 1.5, p.size * 2.4, 32),
          new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
        );
        ring.rotation.x = Math.PI / 3;
        pMesh.add(ring);
      }
      cosmicGroup.add(pMesh);
      planetMeshes.push(pMesh);

      // Beam from Nexus to planet
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const bLine = new THREE.Line(
        bGeo,
        new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
      );
      cosmicGroup.add(bLine);
      planetBeams.push(bLine);
    });

    // 3. Digital Earth Destination Globe (positioned at Z = 0)
    const earthGroup = new THREE.Group();
    earthGroup.position.set(0, 0, 0);
    scene.add(earthGroup);

    // Geodesic wireframe globe
    const earthWire = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 44, 44),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.42 })
    );
    const earthInner = new THREE.Mesh(
      new THREE.SphereGeometry(2.35, 36, 36),
      new THREE.MeshBasicMaterial({ color: 0x0369a1, transparent: true, opacity: 0.2 })
    );
    earthGroup.add(earthWire, earthInner);

    // Concentric high-tech orbital telemetry rings
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.03, 96),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring1.rotation.x = Math.PI / 2.3;
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.42, 80),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring2.rotation.x = -Math.PI / 3;
    ring2.rotation.y = Math.PI / 6;
    earthGroup.add(ring1, ring2);

    // City Beacons & Arc connections
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

      // Beacon sphere
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending })
      );
      beacon.position.copy(v);
      earthGroup.add(beacon);

      // Light pillar
      const topV = v.clone().multiplyScalar(1.22);
      const pPositions = new Float32Array([v.x, v.y, v.z, topV.x, topV.y, topV.z]);
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      const pLine = new THREE.Line(
        pGeo,
        new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
      );
      earthGroup.add(pLine);
    });

    // Great circle arcs between cities
    const arcPairs = [[0, 1], [1, 5], [5, 4], [4, 8], [8, 2], [2, 3], [3, 7], [0, 6]];
    arcPairs.forEach(([i1, i2]) => {
      const v1 = cityVecs[i1];
      const v2 = cityVecs[i2];
      const pts: THREE.Vector3[] = [];
      const segs = 32;
      for (let s = 0; s <= segs; s++) {
        const a = s / segs;
        const p = new THREE.Vector3().lerpVectors(v1, v2, a);
        const alt = 2.42 + Math.sin(a * Math.PI) * 0.45;
        p.normalize().multiplyScalar(alt);
        pts.push(p);
      }
      const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const arcLine = new THREE.Line(
        arcGeo,
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
      );
      earthGroup.add(arcLine);
    });

    // 4. Galaxy Deep Starfield
    const starCount = 2000;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 180;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 180;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 250;

      const rnd = Math.random();
      starColors[i * 3] = rnd > 0.5 ? 0.6 : 0.9;
      starColors[i * 3 + 1] = rnd > 0.3 ? 0.85 : 0.6;
      starColors[i * 3 + 2] = 1.0;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
    );
    scene.add(starField);

    // Mouse Interaction for Free Orbital Look
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

    // Animation Loop: Movie-like seamless camera flight
    const animate = () => {
      threeRefs.current.rafId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - threeRefs.current.startTime) / 1000;
      const t = elapsed * cameraSpeed;

      // Mouse smoothing
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      // CONTINUOUS CAMERA JOURNEY:
      // Starts at Z = 65 (Deep Hyperspace Warp),
      // Cruises forward through Cosmic Nexus (Z ~ 20 to -10),
      // Swoops in front of Digital Earth (stabilizes around Z = 7.0)
      const flightDuration = 10.0;
      const progress = Math.min(1.0, t / flightDuration);
      const currentBoost = threeRefs.current.speedBoost;

      let targetCamZ = 75 - Math.pow(progress, 0.85) * 68;
      if (currentBoost > 1.0) {
        // Hyper-dive on login success / skip
        targetCamZ -= (currentBoost - 1.0) * 4.0;
      }
      camera.position.z += (targetCamZ - camera.position.z) * 0.06;

      // Camera dynamic yaw & height swooping
      const camY = 1.5 + Math.cos(t * 0.4) * 0.8 + mouseY * 1.5;
      const camX = Math.sin(t * 0.35) * 1.8 + mouseX * 2.0;
      camera.position.x += (camX - camera.position.x) * 0.05;
      camera.position.y += (camY - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      // Determine flight phase for UI indicator
      if (camera.position.z > 35) {
        setFlightPhase('hyperspace');
      } else if (camera.position.z > 15) {
        setFlightPhase('cosmic');
      } else {
        setFlightPhase('digitalEarth');
      }

      // Update Hyperspace streak lines
      const wPos = warpGeo.attributes.position.array as Float32Array;
      const warpSpeedFactor = (1.5 + Math.max(0, 1.0 - progress)) * currentBoost;
      for (let i = 0; i < warpLineCount; i++) {
        const spd = warpSpeeds[i] * warpSpeedFactor;
        const len = warpLengths[i];
        wPos[i * 6 + 2] += spd;
        wPos[i * 6 + 5] = wPos[i * 6 + 2] - len;
        if (wPos[i * 6 + 2] > camera.position.z + 10) {
          wPos[i * 6 + 2] = camera.position.z - 150;
          wPos[i * 6 + 5] = wPos[i * 6 + 2] - len;
        }
      }
      warpGeo.attributes.position.needsUpdate = true;

      // Rotate Cosmic Nexus and planets
      nexusCore.rotation.x += 0.007;
      nexusCore.rotation.y += 0.01;
      nexusInner.rotation.x -= 0.01;

      planetsData.forEach((p, idx) => {
        const pAngle = t * 0.45 * p.speed + (idx * Math.PI * 2) / 10;
        const px = Math.cos(pAngle) * p.dist;
        const py = Math.sin(t * 0.6 + idx) * 0.4;
        const pz = Math.sin(pAngle) * p.dist;

        const pm = planetMeshes[idx];
        pm.position.set(px, py, pz);

        const bLine = planetBeams[idx];
        const bPos = bLine.geometry.attributes.position.array as Float32Array;
        bPos[0] = 0; bPos[1] = 0; bPos[2] = 0;
        bPos[3] = px; bPos[4] = py; bPos[5] = pz;
        bLine.geometry.attributes.position.needsUpdate = true;
      });

      // Rotate Digital Earth
      earthGroup.rotation.y += 0.004;
      ring1.rotation.z -= 0.002;
      ring2.rotation.z += 0.003;
      earthWire.scale.setScalar(1 + Math.sin(t * 1.5) * 0.008);

      starField.rotation.y += 0.0003;

      renderer.render(scene, camera);
    };

    threeRefs.current.rafId = requestAnimationFrame(animate);

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
      cancelAnimationFrame(threeRefs.current.rafId);
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [cameraSpeed]);

  return (
    <div
      className={`fixed inset-0 z-[250] bg-[#020617] select-none overflow-hidden transition-opacity duration-700 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="EARTH ONE 宇宙穿梭与身份认证终端"
    >
      {/* 3D WebGL Canvas Layer */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Atmospheric Vignette & Gradients (Deep Cinema feel) */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#020617]/90 via-transparent to-[#020617]/80" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(2,6,23,0.85)_100%)]" />

      {/* Cyber Scanline Texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(14,165,233,0)_50%,rgba(14,165,233,0.35)_50%)]"
        style={{ backgroundSize: '100% 4px' }}
      />

      {/* Minimalist Top HUD Telemetry */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-xs tracking-widest text-slate-400 font-mono z-20 pointer-events-none">
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
          <span className="text-cyan-200 font-bold tracking-[0.2em] uppercase font-sans text-sm">
            EARTH ONE
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-xs tracking-wider">
            {flightPhase === 'hyperspace' && '曲率跃迁穿梭 · WARP VECTOR'}
            {flightPhase === 'cosmic' && '星际文明共振 · COSMIC NEXUS'}
            {flightPhase === 'digitalEarth' && '数字地球全息入轨 · ORBITAL APPROACH'}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 text-[11px] text-slate-500">
            <Compass className="w-3.5 h-3.5 text-cyan-500" />
            <span>3D 视角自由转动中</span>
          </div>
        </div>
      </div>

      {/* Holographic Cyber-Terminal: Identity Verification & Password Gateway */}
      {showTerminal && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-30 pointer-events-none">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-950/85 border border-cyan-500/35 shadow-[0_0_50px_rgba(6,182,212,0.18)] backdrop-blur-2xl pointer-events-auto transform transition-all animate-in fade-in zoom-in-95 duration-500">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-100 tracking-wide font-sans">
                    身份认证 · 接入终端
                  </h2>
                  <p className="text-[10px] text-slate-400 tracking-wider font-mono uppercase">
                    QUANTUM GATEWAY AUTHENTICATION
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>ONLINE</span>
              </div>
            </div>

            {/* If user is already authenticated */}
            {authSuccessUser ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center space-x-3.5">
                  <CheckCircle2 className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-cyan-300 font-mono">已确认公民身份</div>
                    <div className="text-sm font-semibold text-white">{authSuccessUser.displayName || authSuccessUser.username}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{authSuccessUser.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={completeIntro}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 via-sky-500 to-cyan-500 text-white font-medium text-sm tracking-wider shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] transition-all flex items-center justify-center space-x-2 group"
                >
                  <span>以该身份进入系统</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            ) : (
              /* Authentication Form */
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                    <span>{authError}</span>
                  </div>
                )}

                {/* Identifier Input */}
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>公民用户名 / 注册邮箱</span>
                    <span className="text-[10px] text-slate-500">IDENTIFIER</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="如: elena_astronomer / 用户名"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>访问秘钥 / 登录密码</span>
                    <span className="text-[10px] text-slate-500">PASSWORD</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入认证密码"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Fast Citizen Test Preset Chips */}
                <div className="pt-1">
                  <div className="text-[10px] text-slate-400 font-mono mb-2 flex items-center space-x-1.5">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    <span>快速填入测试公民账号:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickDemoCitizen('elena_astronomer')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-cyan-300 hover:border-cyan-500/50 hover:bg-slate-850 transition-all"
                    >
                      天文观测者 Elena
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDemoCitizen('alex_dev')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-sky-300 hover:border-sky-500/50 hover:bg-slate-850 transition-all"
                    >
                      系统工程师 Alex
                    </button>
                  </div>
                </div>

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 via-sky-500 to-cyan-500 text-white font-medium text-sm tracking-wider shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:shadow-[0_0_35px_rgba(6,182,212,0.55)] transition-all flex items-center justify-center space-x-2 group disabled:opacity-50"
                >
                  {authLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>认证接入 · AUTHENTICATE</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                {/* Guest Direct Access Bypass Button */}
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={completeIntro}
                    className="text-xs text-slate-400 hover:text-cyan-300 transition-colors inline-flex items-center space-x-1.5 py-1"
                  >
                    <span>以探险家身份免密进入 · BROWSE AS GUEST</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between z-20 pointer-events-auto">
        {/* Left Audio Toggle */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={toggleSound}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-full border text-xs tracking-wider transition-all backdrop-blur-md ${
              soundEnabled
                ? 'border-cyan-500/70 bg-cyan-950/70 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:text-slate-200'
            }`}
            title={soundEnabled ? '静音宇宙合成音效 (M)' : '开启宇宙全息音频 (M)'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="font-mono text-[11px]">{soundEnabled ? 'AUDIO ON' : 'AUDIO OFF'}</span>
          </button>

          {/* Toggle Terminal Visibility */}
          <button
            type="button"
            onClick={() => setShowTerminal(!showTerminal)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-full border border-slate-800 bg-slate-950/70 text-slate-400 hover:text-slate-200 text-xs backdrop-blur-md transition-all font-mono text-[11px]"
          >
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>{showTerminal ? '隐藏认证窗' : '显示认证窗'}</span>
          </button>
        </div>

        {/* Right Direct Enter / Skip Button */}
        <div>
          <button
            type="button"
            onClick={completeIntro}
            className="group flex items-center space-x-2 px-5 py-2.5 rounded-full border border-cyan-500/50 bg-slate-950/80 text-cyan-200 text-xs font-medium tracking-[0.15em] hover:bg-cyan-950/80 hover:border-cyan-400 hover:text-white transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] backdrop-blur-md"
          >
            <span>直接穿梭进入 · SKIP</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
