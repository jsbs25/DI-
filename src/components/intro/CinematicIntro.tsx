import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Volume2, VolumeX, SkipForward, Play, Pause, Sparkles } from 'lucide-react';

type SceneKind = 'hyperspace' | 'digitalEarth' | 'cosmic';

interface CinematicIntroProps {
  onComplete: () => void;
}

interface SceneMeta {
  kind: SceneKind;
  step: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  telemetry: string;
  duration: number; // in milliseconds
}

const SCENES: SceneMeta[] = [
  {
    kind: 'hyperspace',
    step: 'PHASE 01 / WARP DRIVE',
    titleZh: '超空间跃迁',
    titleEn: 'HYPERSPACE WARP',
    subtitleZh: '启动曲率引擎 · 穿透虚空接入全球数字共生网络',
    subtitleEn: 'Initiating Curvature Drive · Entering Planetary Network',
    telemetry: 'VELOCITY: 0.98c | QUANTUM LINK: 100% | FTL VECTOR: ACTIVE',
    duration: 4200,
  },
  {
    kind: 'digitalEarth',
    step: 'PHASE 02 / DIGITAL TWIN',
    titleZh: '数字地球全息矩阵',
    titleEn: 'DIGITAL EARTH MATRIX',
    subtitleZh: '三维点阵遥测在线 · 实时同步全球观测与防御节点',
    subtitleEn: '3D Point Matrix Online · Synchronizing Global Geo-Telemetry',
    telemetry: 'GEO-NODES: 2,840 | LATENCY: 1.2ms | DEFENSE GRID: NOMINAL',
    duration: 4500,
  },
  {
    kind: 'cosmic',
    step: 'PHASE 03 / COSMIC ODYSSEY',
    titleZh: '宇宙文明共振',
    titleEn: 'COSMIC CIVILIZATION',
    subtitleZh: '开启无垠知识探索 · 链接星际知识库与空间观测站',
    subtitleEn: 'Unlocking Celestial Repositories & Deep Space Observatories',
    telemetry: 'CELESTIAL BODIES: 10 | OPEN ARCHIVE: READY | SYSTEM: ALL NOMINAL',
    duration: 4800,
  },
];

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

type SceneController = {
  cleanup: () => void;
  resize: (w: number, h: number) => void;
};

function createRenderer(container: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);
  return renderer;
}

// -------------------------------------------------------------
// 1. HYPERSPACE WARP: Streak Lines + Nebula Wormhole + Radial Rush
// -------------------------------------------------------------
function initHyperspace(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.025);
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 300);
  camera.position.z = 10;
  const renderer = createRenderer(container);

  // Group to rotate together
  const group = new THREE.Group();
  scene.add(group);

  // Warp streak lines (line segments stretching along Z)
  const lineCount = 650;
  const linePositions = new Float32Array(lineCount * 6);
  const lineColors = new Float32Array(lineCount * 6);
  const lineSpeeds = new Float32Array(lineCount);
  const lineLengths = new Float32Array(lineCount);

  for (let i = 0; i < lineCount; i++) {
    const x = (Math.random() - 0.5) * 80;
    const y = (Math.random() - 0.5) * 80;
    const z = -Math.random() * 200;
    const len = 2.5 + Math.random() * 6.0;

    linePositions[i * 6] = x;
    linePositions[i * 6 + 1] = y;
    linePositions[i * 6 + 2] = z;

    linePositions[i * 6 + 3] = x;
    linePositions[i * 6 + 4] = y;
    linePositions[i * 6 + 5] = z - len;

    // Cyan to blue to white palette
    const isBright = Math.random() > 0.7;
    const r = isBright ? 0.8 : 0.1;
    const g = isBright ? 0.95 : 0.7;
    const b = 1.0;

    lineColors[i * 6] = r;
    lineColors[i * 6 + 1] = g;
    lineColors[i * 6 + 2] = b;
    lineColors[i * 6 + 3] = r * 0.3;
    lineColors[i * 6 + 4] = g * 0.3;
    lineColors[i * 6 + 5] = b * 0.5;

    lineSpeeds[i] = 1.2 + Math.random() * 2.2;
    lineLengths[i] = len;
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  group.add(lines);

  // Distant central singularity / nebula glow
  const ringCount = 4;
  const rings: THREE.Mesh[] = [];
  for (let r = 0; r < ringCount; r++) {
    const ringGeo = new THREE.RingGeometry(0.8 + r * 0.6, 0.85 + r * 0.62, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: r % 2 === 0 ? 0x22d3ee : 0x818cf8,
      transparent: true,
      opacity: 0.35 - r * 0.06,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = -120;
    scene.add(ringMesh);
    rings.push(ringMesh);
  }

  // Core glow sphere
  const glowGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.z = -120;
  scene.add(glow);

  let raf = 0;
  let startTime = performance.now();

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const elapsed = (performance.now() - startTime) / 1000;
    const accel = Math.min(2.5, 1.0 + elapsed * 0.4);

    const pos = lineGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < lineCount; i++) {
      const spd = lineSpeeds[i] * accel;
      const len = lineLengths[i];
      pos[i * 6 + 2] += spd;
      pos[i * 6 + 5] = pos[i * 6 + 2] - len;

      if (pos[i * 6 + 2] > 15) {
        pos[i * 6 + 2] = -180;
        pos[i * 6 + 5] = -180 - len;
        const nx = (Math.random() - 0.5) * 80;
        const ny = (Math.random() - 0.5) * 80;
        pos[i * 6] = nx;
        pos[i * 6 + 3] = nx;
        pos[i * 6 + 1] = ny;
        pos[i * 6 + 4] = ny;
      }
    }
    lineGeo.attributes.position.needsUpdate = true;
    group.rotation.z += 0.003;

    // Rings pulse
    rings.forEach((ring, idx) => {
      ring.rotation.z += (idx % 2 === 0 ? 0.01 : -0.01);
      const s = 1 + Math.sin(elapsed * 2 + idx) * 0.12;
      ring.scale.set(s, s, s);
    });
    glow.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.2);

    renderer.render(scene, camera);
  };
  animate();

  return {
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    cleanup: () => {
      cancelAnimationFrame(raf);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// -------------------------------------------------------------
// 2. DIGITAL EARTH: Geodesic Grid + Coordinate Beacons + Orbit Rings
// -------------------------------------------------------------
function initDigitalEarth(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0.4, 4.4);
  const renderer = createRenderer(container);

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // Outer wireframe sphere
  const sphereGeo = new THREE.SphereGeometry(1.4, 36, 36);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const wire = new THREE.Mesh(sphereGeo, wireMat);
  earthGroup.add(wire);

  // Inner solid glow sphere
  const innerGeo = new THREE.SphereGeometry(1.36, 32, 32);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.12,
  });
  earthGroup.add(new THREE.Mesh(innerGeo, innerMat));

  // Concentric orbital telemetry rings
  const ring1Geo = new THREE.RingGeometry(1.75, 1.77, 96);
  const ring1Mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
  ring1.rotation.x = Math.PI / 2.3;
  earthGroup.add(ring1);

  const ring2Geo = new THREE.RingGeometry(1.95, 1.96, 72);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.rotation.x = -Math.PI / 3;
  ring2.rotation.y = Math.PI / 6;
  earthGroup.add(ring2);

  // City beacons (lat/lng to 3D Cartesian)
  const cities = [
    { name: 'Tokyo', lat: 35.67, lng: 139.65 },
    { name: 'London', lat: 51.5, lng: -0.12 },
    { name: 'New York', lat: 40.71, lng: -74.0 },
    { name: 'Cairo', lat: 30.04, lng: 31.23 },
    { name: 'Sydney', lat: -33.86, lng: 151.2 },
    { name: 'Beijing', lat: 39.9, lng: 116.4 },
    { name: 'Dubai', lat: 25.2, lng: 55.27 },
    { name: 'Rio', lat: -22.9, lng: -43.17 },
  ];

  const beaconGeo = new THREE.SphereGeometry(0.035, 16, 16);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending });
  const beaconPillars: THREE.Line[] = [];

  cities.forEach((c) => {
    const phi = (90 - c.lat) * (Math.PI / 180);
    const theta = (c.lng + 180) * (Math.PI / 180);
    const r = 1.41;
    const x = -(r * Math.sin(phi) * Math.cos(theta));
    const z = r * Math.sin(phi) * Math.sin(theta);
    const y = r * Math.cos(phi);

    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(x, y, z);
    earthGroup.add(beacon);

    // Light pillar projecting outward
    const pillarPositions = new Float32Array([x, y, z, x * 1.25, y * 1.25, z * 1.25]);
    const pillarGeo = new THREE.BufferGeometry();
    pillarGeo.setAttribute('position', new THREE.BufferAttribute(pillarPositions, 3));
    const pillarLine = new THREE.Line(
      pillarGeo,
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
    );
    earthGroup.add(pillarLine);
    beaconPillars.push(pillarLine);
  });

  // Dense particle cloud wrapping Earth
  const pCount = 900;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.42 + Math.random() * 0.22;
    pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pPos[i * 3 + 1] = r * Math.cos(phi);
    pPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const particlesGeo = new THREE.BufferGeometry();
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    particlesGeo,
    new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.02, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  );
  earthGroup.add(particles);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    earthGroup.rotation.y += 0.0035;
    earthGroup.rotation.x = Math.sin(t * 0.4) * 0.08;
    ring1.rotation.z -= 0.002;
    ring2.rotation.z += 0.003;
    wire.scale.setScalar(1 + Math.sin(t * 2) * 0.01);
    renderer.render(scene, camera);
  };
  animate();

  return {
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    cleanup: () => {
      cancelAnimationFrame(raf);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// -------------------------------------------------------------
// 3. COSMIC CIVILIZATION: Nexus Polyhedron + Constellation Links
// -------------------------------------------------------------
function initCosmic(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.04);
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 150);
  camera.position.set(0, 0.8, 5.2);
  const renderer = createRenderer(container);

  const group = new THREE.Group();
  scene.add(group);

  // Core crystalline nexus (dual wireframe + internal core)
  const coreGeo = new THREE.IcosahedronGeometry(0.95, 1);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x818cf8,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const innerCoreGeo = new THREE.OctahedronGeometry(0.55, 0);
  const innerCoreMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: false,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });
  const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
  group.add(innerCore);

  // Dual gyroscopic torus rings
  const ringGeo = new THREE.TorusGeometry(1.75, 0.018, 16, 120);
  const ring1 = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
  );
  const ring2 = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
  );
  ring2.rotation.x = Math.PI / 2.2;
  ring2.scale.setScalar(1.15);
  group.add(ring1, ring2);

  // Satellite civilization nodes with laser links
  const nodeCount = 8;
  const nodes: THREE.Mesh[] = [];
  const nodePosList: THREE.Vector3[] = [];
  const nodeGeo = new THREE.SphereGeometry(0.08, 16, 16);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending });

  for (let i = 0; i < nodeCount; i++) {
    const angle = (i / nodeCount) * Math.PI * 2;
    const rad = 2.4 + (i % 2) * 0.4;
    const v = new THREE.Vector3(
      Math.cos(angle) * rad,
      Math.sin(angle * 2) * 0.35,
      Math.sin(angle) * rad
    );
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.copy(v);
    group.add(node);
    nodes.push(node);
    nodePosList.push(v);
  }

  // Constellation link lines connecting satellite nodes to core
  const linePositions = new Float32Array(nodeCount * 6);
  for (let i = 0; i < nodeCount; i++) {
    linePositions[i * 6] = 0;
    linePositions[i * 6 + 1] = 0;
    linePositions[i * 6 + 2] = 0;
    linePositions[i * 6 + 3] = nodePosList[i].x;
    linePositions[i * 6 + 4] = nodePosList[i].y;
    linePositions[i * 6 + 5] = nodePosList[i].z;
  }
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const linkLines = new THREE.LineSegments(
    linkGeo,
    new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
  );
  group.add(linkLines);

  // Background galaxy stars
  const sCount = 1400;
  const sPos = new Float32Array(sCount * 3);
  const sColors = new Float32Array(sCount * 3);
  for (let i = 0; i < sCount; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 60;
    sPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 60;

    const r = Math.random();
    if (r > 0.6) {
      sColors[i * 3] = 0.5;
      sColors[i * 3 + 1] = 0.8;
      sColors[i * 3 + 2] = 1.0;
    } else if (r > 0.3) {
      sColors[i * 3] = 0.9;
      sColors[i * 3 + 1] = 0.5;
      sColors[i * 3 + 2] = 0.9;
    } else {
      sColors[i * 3] = 1.0;
      sColors[i * 3 + 1] = 0.95;
      sColors[i * 3 + 2] = 0.8;
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sColors, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
  );
  scene.add(stars);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    core.rotation.x += 0.005;
    core.rotation.y += 0.007;
    innerCore.rotation.x -= 0.008;
    innerCore.rotation.y -= 0.006;

    ring1.rotation.z += 0.004;
    ring1.rotation.x = Math.sin(t * 0.5) * 0.35;
    ring2.rotation.y -= 0.004;

    group.rotation.y += 0.002;
    stars.rotation.y += 0.0004;

    camera.position.x = Math.sin(t * 0.3) * 0.3;
    camera.position.y = 0.8 + Math.cos(t * 0.3) * 0.15;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  animate();

  return {
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    cleanup: () => {
      cancelAnimationFrame(raf);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

const INIT_MAP: Record<SceneKind, (el: HTMLDivElement) => SceneController> = {
  hyperspace: initHyperspace,
  digitalEarth: initDigitalEarth,
  cosmic: initCosmic,
};

// -------------------------------------------------------------
// Web Audio Ambient Synthesizer (Zero External Dependencies)
// -------------------------------------------------------------
class CosmicAudioSynth {
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
      this.masterGain.gain.exponentialRampToValueAtTime(0.08, this.ctx.currentTime + 1.5);
      this.masterGain.connect(this.ctx.destination);

      // Celestial chord: 55Hz (A1), 110Hz (A2), 164.81Hz (E3), 220Hz (A3)
      const freqs = [55.0, 110.0, 164.81, 220.0];
      this.oscs = freqs.map((f, i) => {
        const osc = this.ctx!.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);
        const subGain = this.ctx!.createGain();
        subGain.gain.setValueAtTime(0.4 / (i + 1), this.ctx!.currentTime);
        osc.connect(subGain);
        subGain.connect(this.masterGain!);
        osc.start();
        return osc;
      });
      this.isPlaying = true;
    } catch {
      // AudioContext not permitted or supported
    }
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

  get playing() {
    return this.isPlaying;
  }
}

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [sceneFading, setSceneFading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioSynthRef = useRef<CosmicAudioSynth | null>(null);
  const doneRef = useRef(false);

  // Initialize synth instance
  useEffect(() => {
    audioSynthRef.current = new CosmicAudioSynth();
    return () => {
      audioSynthRef.current?.stop();
    };
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    audioSynthRef.current?.stop();
    window.setTimeout(() => {
      onComplete();
    }, 650);
  }, [onComplete]);

  // Keyboard shortcut listener (Escape or Space to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finish]);

  // Audio toggle
  const toggleSound = () => {
    if (!soundEnabled) {
      audioSynthRef.current?.start();
      setSoundEnabled(true);
    } else {
      audioSynthRef.current?.stop();
      setSoundEnabled(false);
    }
  };

  // Scene transition timer
  useEffect(() => {
    if (isPaused) return;
    if (index >= SCENES.length) {
      finish();
      return;
    }

    const currentDuration = SCENES[index].duration;
    const fadeStart = Math.max(0, currentDuration - 600);

    const tFade = window.setTimeout(() => {
      setSceneFading(true);
    }, fadeStart);

    const tNext = window.setTimeout(() => {
      setSceneFading(false);
      setIndex((prev) => prev + 1);
    }, currentDuration);

    return () => {
      window.clearTimeout(tFade);
      window.clearTimeout(tNext);
    };
  }, [index, isPaused, finish]);

  // Initialize current Three.js scene
  useEffect(() => {
    const el = containerRef.current;
    if (!el || index >= SCENES.length) return;

    controllerRef.current?.cleanup();
    const currentSceneMeta = SCENES[index];
    controllerRef.current = INIT_MAP[currentSceneMeta.kind](el);

    const onResize = () => {
      if (!containerRef.current || !controllerRef.current) return;
      controllerRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      controllerRef.current?.cleanup();
      controllerRef.current = null;
    };
  }, [index]);

  const scene = SCENES[Math.min(index, SCENES.length - 1)];
  const progressPercent = ((Math.min(index, SCENES.length - 1) + 1) / SCENES.length) * 100;

  return (
    <div
      className={`fixed inset-0 z-[250] bg-[#020617] select-none overflow-hidden transition-opacity duration-700 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="EARTH ONE 电影级入场交互界面"
    >
      {/* 3D WebGL Canvas Layer */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
          sceneFading ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
        }`}
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {/* Atmospheric Vignette & Gradients */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#020617] via-transparent to-[#020617]/70" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(2,6,23,0.85)_100%)]" />

      {/* Futuristic Scanline Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[linear-gradient(rgba(14,165,233,0)_50%,rgba(14,165,233,0.3)_50%)]"
        style={{ backgroundSize: '100% 4px' }}
      />

      {/* Top Telemetry Header */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-xs tracking-widest text-slate-400 font-mono z-10 pointer-events-none">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          <span className="text-cyan-300 font-semibold uppercase">EARTH ONE / SYSTEM BOOT</span>
        </div>
        <div className="hidden sm:block text-slate-500 tracking-[0.2em] text-[10px] uppercase">
          {scene.telemetry}
        </div>
      </div>

      {/* Center Cinematic Typography & Bilingual Subtitles */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div
          className={`text-center px-6 max-w-3xl transition-all duration-600 ease-out transform ${
            sceneFading ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
          }`}
        >
          {/* Phase Badge */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 text-[11px] tracking-[0.35em] uppercase mb-4 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
            <span>{scene.step}</span>
          </div>

          {/* Main Title */}
          <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-[0.16em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-sky-300 drop-shadow-[0_0_35px_rgba(34,211,238,0.35)]">
            EARTH ONE
          </h1>

          {/* Bilingual Scene Titles */}
          <div className="mt-3 text-lg sm:text-2xl font-medium tracking-[0.25em] text-cyan-100/95 uppercase drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]">
            {scene.titleZh}
          </div>
          <div className="text-xs sm:text-sm tracking-[0.3em] text-cyan-400/80 uppercase font-mono mt-0.5">
            {scene.titleEn}
          </div>

          {/* Bilingual Narrative Subtitles */}
          <div className="mt-5 text-sm sm:text-base text-slate-300 font-light tracking-[0.12em] leading-relaxed">
            {scene.subtitleZh}
          </div>
          <div className="mt-1 text-xs sm:text-xs text-slate-400/80 font-mono tracking-[0.18em] uppercase">
            {scene.subtitleEn}
          </div>

          {/* Interactive Scene Segment Indicators */}
          <div className="mt-8 flex items-center justify-center gap-3 pointer-events-auto">
            {SCENES.map((s, i) => (
              <button
                key={s.kind}
                type="button"
                onClick={() => {
                  setSceneFading(false);
                  setIndex(i);
                }}
                className={`group relative py-2 px-1 focus:outline-none transition-all`}
                title={`跳转至: ${s.titleZh}`}
              >
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index
                      ? 'w-10 bg-gradient-to-r from-cyan-400 to-sky-300 shadow-[0_0_12px_#38bdf8]'
                      : i < index
                      ? 'w-6 bg-cyan-700/80'
                      : 'w-4 bg-slate-800 hover:bg-slate-700'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Progress Line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-slate-900/80">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 via-sky-300 to-cyan-400 transition-all duration-500 shadow-[0_0_10px_#22d3ee]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Bottom Left Control Strip */}
      <div className="absolute bottom-8 left-8 flex items-center space-x-3 z-20 pointer-events-auto">
        {/* Audio Toggle */}
        <button
          type="button"
          onClick={toggleSound}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-full border text-xs tracking-wider transition-all backdrop-blur-md ${
            soundEnabled
              ? 'border-cyan-500/70 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
          title={soundEnabled ? '关闭背景合成声效' : '开启宇宙全息音频'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline font-mono">{soundEnabled ? 'AUDIO ON' : 'AUDIO OFF'}</span>
        </button>

        {/* Pause/Play Toggle */}
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-full border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 text-xs tracking-wider transition-all backdrop-blur-md font-mono"
          title={isPaused ? '继续播放' : '暂停播放'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 text-cyan-400" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPaused ? 'RESUME' : 'PAUSE'}</span>
        </button>
      </div>

      {/* Bottom Right Skip Button */}
      <div className="absolute bottom-8 right-8 z-20 pointer-events-auto">
        <button
          type="button"
          onClick={finish}
          className="group flex items-center space-x-2 px-5 py-2.5 rounded-full border border-cyan-500/50 bg-slate-950/80 text-cyan-200 text-xs font-medium tracking-[0.15em] hover:bg-cyan-950/80 hover:border-cyan-400 hover:text-white transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] backdrop-blur-md"
        >
          <span>进入地球计划 · SKIP</span>
          <SkipForward className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
