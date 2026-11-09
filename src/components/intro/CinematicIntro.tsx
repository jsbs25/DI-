import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Volume2,
  VolumeX,
  SkipForward,
  Play,
  Pause,
  Sparkles,
  Repeat,
  Gauge,
  Compass,
  Globe2,
  Orbit,
  Zap,
} from 'lucide-react';

export type SceneKind = 'hyperspace' | 'digitalEarth' | 'cosmic';

interface CinematicIntroProps {
  onComplete: () => void;
}

interface SceneMeta {
  kind: SceneKind;
  step: string;
  phaseCode: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  telemetry: string;
  duration: number; // in milliseconds
  accentColor: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export const SCENES: SceneMeta[] = [
  {
    kind: 'hyperspace',
    step: 'PHASE 01 / WARP DRIVE',
    phaseCode: 'WARP-01',
    titleZh: '超空间跃迁',
    titleEn: 'HYPERSPACE WARP',
    subtitleZh: '启动曲率引擎 · 穿透虚空接入全球数字共生网络',
    subtitleEn: 'Initiating Curvature Drive · Entering Planetary Network',
    telemetry: 'FTL SPEED: 0.992c | QUANTUM LINK: 100% | VECTOR: SOLAR-CORE',
    duration: 5000,
    accentColor: '#38bdf8',
    icon: Zap,
  },
  {
    kind: 'digitalEarth',
    step: 'PHASE 02 / DIGITAL TWIN',
    phaseCode: 'EARTH-02',
    titleZh: '数字地球全息矩阵',
    titleEn: 'DIGITAL EARTH MATRIX',
    subtitleZh: '三维点阵遥测在线 · 实时同步全球观测与防御节点',
    subtitleEn: '3D Point Matrix Online · Synchronizing Global Geo-Telemetry',
    telemetry: 'GEO-NODES: 2,840 | ACTIVE ARCS: 48 | LATENCY: 1.1ms',
    duration: 5200,
    accentColor: '#22d3ee',
    icon: Globe2,
  },
  {
    kind: 'cosmic',
    step: 'PHASE 03 / COSMIC ODYSSEY',
    phaseCode: 'COSMIC-03',
    titleZh: '宇宙文明共振',
    titleEn: 'COSMIC CIVILIZATION',
    subtitleZh: '开启无垠知识探索 · 链接十大星际知识库与空间观测站',
    subtitleEn: 'Unlocking Celestial Repositories & Deep Space Observatories',
    telemetry: 'CELESTIAL BODIES: 10 | RESONANCE: SYNCED | ARCHIVE: LIVE',
    duration: 5500,
    accentColor: '#818cf8',
    icon: Orbit,
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
  setSpeedMultiplier: (spd: number) => void;
};

function createRenderer(container: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.cursor = 'grab';
  container.appendChild(renderer.domElement);
  return renderer;
}

// -------------------------------------------------------------
// 1. HYPERSPACE WARP: Streak Lines + Nebula Wormhole + Radial Rush + Camera Warp
// -------------------------------------------------------------
function initHyperspace(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.022);
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 350);
  camera.position.z = 10;
  const renderer = createRenderer(container);

  const group = new THREE.Group();
  scene.add(group);

  let speedMultiplier = 1.0;

  // Warp streak lines (line segments stretching along Z)
  const lineCount = 850;
  const linePositions = new Float32Array(lineCount * 6);
  const lineColors = new Float32Array(lineCount * 6);
  const lineSpeeds = new Float32Array(lineCount);
  const lineLengths = new Float32Array(lineCount);

  for (let i = 0; i < lineCount; i++) {
    const x = (Math.random() - 0.5) * 90;
    const y = (Math.random() - 0.5) * 90;
    const z = -Math.random() * 220;
    const len = 3.0 + Math.random() * 8.0;

    linePositions[i * 6] = x;
    linePositions[i * 6 + 1] = y;
    linePositions[i * 6 + 2] = z;

    linePositions[i * 6 + 3] = x;
    linePositions[i * 6 + 4] = y;
    linePositions[i * 6 + 5] = z - len;

    // Palette: Cyan, Electric Violet, White
    const paletteChoice = Math.random();
    let r = 0.2, g = 0.8, b = 1.0;
    if (paletteChoice > 0.75) {
      r = 1.0; g = 1.0; b = 1.0; // Pure white beam
    } else if (paletteChoice > 0.45) {
      r = 0.65; g = 0.35; b = 1.0; // Electric violet
    } else {
      r = 0.1; g = 0.9; b = 1.0; // Cyan
    }

    lineColors[i * 6] = r;
    lineColors[i * 6 + 1] = g;
    lineColors[i * 6 + 2] = b;
    lineColors[i * 6 + 3] = r * 0.2;
    lineColors[i * 6 + 4] = g * 0.2;
    lineColors[i * 6 + 5] = b * 0.4;

    lineSpeeds[i] = 1.5 + Math.random() * 2.8;
    lineLengths[i] = len;
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  group.add(lines);

  // Concentric warp shockwave rings
  const ringCount = 6;
  const rings: THREE.Mesh[] = [];
  for (let r = 0; r < ringCount; r++) {
    const ringGeo = new THREE.RingGeometry(1.0 + r * 0.7, 1.06 + r * 0.72, 80);
    const ringMat = new THREE.MeshBasicMaterial({
      color: r % 2 === 0 ? 0x22d3ee : 0xa855f7,
      transparent: true,
      opacity: 0.4 - r * 0.05,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = -140;
    scene.add(ringMesh);
    rings.push(ringMesh);
  }

  // Accretion Singularity core
  const glowGeo = new THREE.SphereGeometry(2.0, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.z = -140;
  scene.add(glow);

  // Swirling vortex particles around the core
  const vortexCount = 400;
  const vortexPositions = new Float32Array(vortexCount * 3);
  const vortexAngles = new Float32Array(vortexCount);
  const vortexRadii = new Float32Array(vortexCount);
  const vortexColors = new Float32Array(vortexCount * 3);

  for (let i = 0; i < vortexCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 2.5 + Math.random() * 8.0;
    vortexAngles[i] = angle;
    vortexRadii[i] = rad;
    vortexPositions[i * 3] = Math.cos(angle) * rad;
    vortexPositions[i * 3 + 1] = Math.sin(angle) * rad;
    vortexPositions[i * 3 + 2] = -140 + (Math.random() - 0.5) * 10;

    vortexColors[i * 3] = 0.4;
    vortexColors[i * 3 + 1] = 0.8;
    vortexColors[i * 3 + 2] = 1.0;
  }

  const vortexGeo = new THREE.BufferGeometry();
  vortexGeo.setAttribute('position', new THREE.BufferAttribute(vortexPositions, 3));
  vortexGeo.setAttribute('color', new THREE.BufferAttribute(vortexColors, 3));
  const vortexMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
  });
  const vortex = new THREE.Points(vortexGeo, vortexMat);
  scene.add(vortex);

  // Mouse Parallax
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

  let raf = 0;
  const startTime = performance.now();

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const elapsed = (performance.now() - startTime) / 1000;
    const accel = Math.min(3.2, 1.0 + elapsed * 0.45) * speedMultiplier;

    // Smooth mouse parallax
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;
    group.rotation.x = -mouseY * 0.15;
    group.rotation.y = mouseX * 0.15;

    // Camera dynamic FOV dilation
    const targetFov = 75 + Math.min(15, accel * 3.5);
    camera.fov += (targetFov - camera.fov) * 0.05;
    camera.updateProjectionMatrix();

    const pos = lineGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < lineCount; i++) {
      const spd = lineSpeeds[i] * accel;
      const len = lineLengths[i];
      pos[i * 6 + 2] += spd;
      pos[i * 6 + 5] = pos[i * 6 + 2] - len;

      if (pos[i * 6 + 2] > 20) {
        pos[i * 6 + 2] = -200;
        pos[i * 6 + 5] = -200 - len;
        const nx = (Math.random() - 0.5) * 90;
        const ny = (Math.random() - 0.5) * 90;
        pos[i * 6] = nx;
        pos[i * 6 + 3] = nx;
        pos[i * 6 + 1] = ny;
        pos[i * 6 + 4] = ny;
      }
    }
    lineGeo.attributes.position.needsUpdate = true;
    group.rotation.z += 0.004 * speedMultiplier;

    // Rings pulse & rotate
    rings.forEach((ring, idx) => {
      ring.rotation.z += (idx % 2 === 0 ? 0.012 : -0.012) * speedMultiplier;
      const s = 1 + Math.sin(elapsed * 2.5 + idx) * 0.15;
      ring.scale.set(s, s, s);
    });
    glow.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.25);

    // Swirl vortex
    const vPos = vortexGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < vortexCount; i++) {
      vortexAngles[i] += (0.015 + (1 / vortexRadii[i]) * 0.03) * speedMultiplier;
      vPos[i * 3] = Math.cos(vortexAngles[i]) * vortexRadii[i];
      vPos[i * 3 + 1] = Math.sin(vortexAngles[i]) * vortexRadii[i];
    }
    vortexGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  };
  animate();

  return {
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    setSpeedMultiplier: (spd: number) => {
      speedMultiplier = spd;
    },
    cleanup: () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// -------------------------------------------------------------
// 2. DIGITAL EARTH: Geodesic Grid + Coordinate Beacons + Great-Circle Geo-Arcs + Telemetry HUD
// -------------------------------------------------------------
function initDigitalEarth(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0.5, 4.5);
  const renderer = createRenderer(container);

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  let speedMultiplier = 1.0;

  // Outer wireframe sphere
  const sphereGeo = new THREE.SphereGeometry(1.4, 40, 40);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.38,
  });
  const wire = new THREE.Mesh(sphereGeo, wireMat);
  earthGroup.add(wire);

  // Inner atmospheric solid glow
  const innerGeo = new THREE.SphereGeometry(1.37, 32, 32);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x0369a1,
    transparent: true,
    opacity: 0.15,
  });
  earthGroup.add(new THREE.Mesh(innerGeo, innerMat));

  // Concentric orbital telemetry rings with high-tech dashes
  const ring1Geo = new THREE.RingGeometry(1.75, 1.77, 96);
  const ring1Mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
  ring1.rotation.x = Math.PI / 2.3;
  earthGroup.add(ring1);

  const ring2Geo = new THREE.RingGeometry(2.0, 2.015, 80);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    transparent: true,
    opacity: 0.4,
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
    { name: 'Paris', lat: 48.85, lng: 2.35 },
    { name: 'Singapore', lat: 1.35, lng: 103.82 },
  ];

  function latLngToVec3(lat: number, lng: number, radius = 1.41): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  const cityVectors: THREE.Vector3[] = [];
  const beaconGeo = new THREE.SphereGeometry(0.04, 16, 16);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending });

  cities.forEach((c) => {
    const v = latLngToVec3(c.lat, c.lng, 1.41);
    cityVectors.push(v);

    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.copy(v);
    earthGroup.add(beacon);

    // Light pillar projecting outward into orbit
    const topV = v.clone().multiplyScalar(1.28);
    const pillarPositions = new Float32Array([v.x, v.y, v.z, topV.x, topV.y, topV.z]);
    const pillarGeo = new THREE.BufferGeometry();
    pillarGeo.setAttribute('position', new THREE.BufferAttribute(pillarPositions, 3));
    const pillarLine = new THREE.Line(
      pillarGeo,
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
    );
    earthGroup.add(pillarLine);
  });

  // Great-Circle Arc Connections between key international cities
  const arcPairs = [
    [0, 5], // Tokyo - Beijing
    [5, 6], // Beijing - Dubai
    [6, 3], // Dubai - Cairo
    [3, 8], // Cairo - Paris
    [8, 1], // Paris - London
    [1, 2], // London - New York
    [2, 7], // New York - Rio
    [0, 4], // Tokyo - Sydney
    [5, 9], // Beijing - Singapore
    [9, 4], // Singapore - Sydney
  ];

  arcPairs.forEach(([i1, i2]) => {
    const v1 = cityVectors[i1];
    const v2 = cityVectors[i2];
    const points: THREE.Vector3[] = [];
    const segments = 36;
    for (let s = 0; s <= segments; s++) {
      const alpha = s / segments;
      const p = new THREE.Vector3().lerpVectors(v1, v2, alpha);
      // Elevate arc outwards above the globe surface
      const arcAltitude = 1.41 + Math.sin(alpha * Math.PI) * 0.35;
      p.normalize().multiplyScalar(arcAltitude);
      points.push(p);
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
    const arcMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    const arcLine = new THREE.Line(arcGeo, arcMat);
    earthGroup.add(arcLine);
  });

  // Dense particle cloud wrapping Earth
  const pCount = 1100;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.42 + Math.random() * 0.25;
    pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pPos[i * 3 + 1] = r * Math.cos(phi);
    pPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const particlesGeo = new THREE.BufferGeometry();
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    particlesGeo,
    new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.022, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  );
  earthGroup.add(particles);

  // Orbiting telemetry satellite with signal cone
  const satGroup = new THREE.Group();
  const satBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  const satPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.01, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  satGroup.add(satBody, satPanel);
  scene.add(satGroup);

  // Mouse drag rotation support
  let isDragging = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let autoRotate = true;

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    renderer.domElement.style.cursor = 'grabbing';
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    autoRotate = false;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    earthGroup.rotation.y += deltaX * 0.006;
    earthGroup.rotation.x += deltaY * 0.006;
  };

  const onMouseUp = () => {
    isDragging = false;
    renderer.domElement.style.cursor = 'grab';
    setTimeout(() => { autoRotate = true; }, 3000);
  };

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    if (autoRotate) {
      earthGroup.rotation.y += 0.0035 * speedMultiplier;
      earthGroup.rotation.x = Math.sin(t * 0.4) * 0.08;
    }
    ring1.rotation.z -= 0.002 * speedMultiplier;
    ring2.rotation.z += 0.003 * speedMultiplier;
    wire.scale.setScalar(1 + Math.sin(t * 2) * 0.01);

    // Satellite orbit trajectory
    const satAngle = t * 0.6 * speedMultiplier;
    const satRadius = 2.2;
    satGroup.position.set(
      Math.cos(satAngle) * satRadius,
      Math.sin(satAngle * 1.5) * 0.5,
      Math.sin(satAngle) * satRadius
    );
    satGroup.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  animate();

  return {
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    setSpeedMultiplier: (spd: number) => {
      speedMultiplier = spd;
    },
    cleanup: () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(raf);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// -------------------------------------------------------------
// 3. COSMIC CIVILIZATION: 10 Planet Resonator + Crystalline Nexus + Constellation Beams
// -------------------------------------------------------------
function initCosmic(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.035);
  const camera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 0.1, 160);
  camera.position.set(0, 1.0, 5.8);
  const renderer = createRenderer(container);

  const group = new THREE.Group();
  scene.add(group);

  let speedMultiplier = 1.0;

  // Core crystalline nexus (dual wireframe + internal glowing core)
  const coreGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x818cf8,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const innerCoreGeo = new THREE.OctahedronGeometry(0.52, 0);
  const innerCoreMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: false,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
  });
  const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
  group.add(innerCore);

  // Dual gyroscopic torus rings
  const ringGeo = new THREE.TorusGeometry(1.75, 0.02, 16, 120);
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

  // Ten Celestial Bodies of EARTH ONE orbiting around the Nexus
  const planetConfig = [
    { id: 'sun', name: '太阳 SUN', color: 0xfbbf24, dist: 2.1, speed: 0.8, size: 0.12 },
    { id: 'earth', name: '地球 EARTH', color: 0x38bdf8, dist: 2.5, speed: 0.7, size: 0.09 },
    { id: 'moon', name: '月球 MOON', color: 0xe2e8f0, dist: 2.7, speed: 0.85, size: 0.06 },
    { id: 'jupiter', name: '木星 JUPITER', color: 0xfb923c, dist: 3.0, speed: 0.5, size: 0.14 },
    { id: 'saturn', name: '土星 SATURN', color: 0xfde047, dist: 3.3, speed: 0.42, size: 0.11, hasRing: true },
    { id: 'mars', name: '火星 MARS', color: 0xef4444, dist: 3.6, speed: 0.6, size: 0.08 },
    { id: 'neptune', name: '海王星 NEPTUNE', color: 0x3b82f6, dist: 3.9, speed: 0.35, size: 0.10 },
    { id: 'venus', name: '金星 VENUS', color: 0xf472b6, dist: 4.2, speed: 0.65, size: 0.09 },
    { id: 'mercury', name: '水星 MERCURY', color: 0x94a3b8, dist: 4.4, speed: 0.9, size: 0.07 },
    { id: 'uranus', name: '天王星 URANUS', color: 0x2dd4bf, dist: 4.6, speed: 0.38, size: 0.10 },
  ];

  const planetMeshes: THREE.Mesh[] = [];
  const planetOrbitTrails: THREE.Line[] = [];
  const beamLines: THREE.Line[] = [];

  planetConfig.forEach((p, idx) => {
    // Planet body
    const pGeo = new THREE.SphereGeometry(p.size, 16, 16);
    const pMat = new THREE.MeshBasicMaterial({ color: p.color, blending: THREE.AdditiveBlending });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    group.add(pMesh);
    planetMeshes.push(pMesh);

    // Saturn miniature planetary ring
    if (p.hasRing) {
      const satRingGeo = new THREE.RingGeometry(p.size * 1.4, p.size * 2.2, 32);
      const satRingMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const satRing = new THREE.Mesh(satRingGeo, satRingMat);
      satRing.rotation.x = Math.PI / 3;
      pMesh.add(satRing);
    }

    // Circular orbit guide
    const orbitPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: 0.18,
    });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    group.add(orbitLine);
    planetOrbitTrails.push(orbitLine);

    // Laser beam connecting nexus to planet
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const beamMat = new THREE.LineBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const beamLine = new THREE.Line(beamGeo, beamMat);
    group.add(beamLine);
    beamLines.push(beamLine);
  });

  // Background galaxy stars
  const sCount = 1600;
  const sPos = new Float32Array(sCount * 3);
  const sColors = new Float32Array(sCount * 3);
  for (let i = 0; i < sCount; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 70;
    sPos[i * 3 + 1] = (Math.random() - 0.5) * 70;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 70;

    const r = Math.random();
    if (r > 0.6) {
      sColors[i * 3] = 0.5; sColors[i * 3 + 1] = 0.8; sColors[i * 3 + 2] = 1.0;
    } else if (r > 0.3) {
      sColors[i * 3] = 0.9; sColors[i * 3 + 1] = 0.5; sColors[i * 3 + 2] = 0.9;
    } else {
      sColors[i * 3] = 1.0; sColors[i * 3 + 1] = 0.95; sColors[i * 3 + 2] = 0.8;
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sColors, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
  );
  scene.add(stars);

  // Mouse drag rotation support
  let isDragging = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let autoRotate = true;

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    renderer.domElement.style.cursor = 'grabbing';
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    autoRotate = false;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    group.rotation.y += deltaX * 0.005;
    group.rotation.x += deltaY * 0.005;
  };

  const onMouseUp = () => {
    isDragging = false;
    renderer.domElement.style.cursor = 'grab';
    setTimeout(() => { autoRotate = true; }, 3500);
  };

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;

    core.rotation.x += 0.006 * speedMultiplier;
    core.rotation.y += 0.008 * speedMultiplier;
    innerCore.rotation.x -= 0.009 * speedMultiplier;
    innerCore.rotation.y -= 0.007 * speedMultiplier;

    ring1.rotation.z += 0.005 * speedMultiplier;
    ring1.rotation.x = Math.sin(t * 0.5) * 0.35;
    ring2.rotation.y -= 0.005 * speedMultiplier;

    if (autoRotate) {
      group.rotation.y += 0.0025 * speedMultiplier;
    }
    stars.rotation.y += 0.0003 * speedMultiplier;

    // Update 10 Planet positions & resonance beams
    planetConfig.forEach((p, idx) => {
      const angle = t * 0.35 * p.speed * speedMultiplier + (idx * Math.PI * 2) / 10;
      const x = Math.cos(angle) * p.dist;
      const y = Math.sin(t * 0.8 + idx) * 0.25;
      const z = Math.sin(angle) * p.dist;

      const pMesh = planetMeshes[idx];
      pMesh.position.set(x, y, z);

      // Pulse beam
      const bLine = beamLines[idx];
      const bPos = bLine.geometry.attributes.position.array as Float32Array;
      bPos[0] = 0; bPos[1] = 0; bPos[2] = 0;
      bPos[3] = x; bPos[4] = y; bPos[5] = z;
      bLine.geometry.attributes.position.needsUpdate = true;
    });

    camera.position.x = Math.sin(t * 0.25) * 0.35;
    camera.position.y = 1.0 + Math.cos(t * 0.25) * 0.2;
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
    setSpeedMultiplier: (spd: number) => {
      speedMultiplier = spd;
    },
    cleanup: () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
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

      // Celestial harmonic chord: 55Hz (A1), 110Hz (A2), 164.81Hz (E3), 220Hz (A3), 329.63Hz (E4)
      const freqs = [55.0, 110.0, 164.81, 220.0, 329.63];
      this.oscs = freqs.map((f, i) => {
        const osc = this.ctx!.createOscillator();
        osc.type = i === 0 ? 'sine' : i % 2 === 0 ? 'sine' : 'triangle';
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
      // AudioContext not permitted or supported
    }
  }

  playTransitionChime(freq = 587.33) {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;
    try {
      const chime = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
      chime.connect(gain);
      gain.connect(this.masterGain);
      chime.start();
      chime.stop(this.ctx.currentTime + 1.25);
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
  const [isLooping, setIsLooping] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
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

  // Keyboard shortcut listener (Escape or Space to skip, 1/2/3 to switch scenes, L to loop, P to pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        finish();
      } else if (e.key === '1') {
        setSceneFading(false);
        setIndex(0);
        audioSynthRef.current?.playTransitionChime(440);
      } else if (e.key === '2') {
        setSceneFading(false);
        setIndex(1);
        audioSynthRef.current?.playTransitionChime(554.37);
      } else if (e.key === '3') {
        setSceneFading(false);
        setIndex(2);
        audioSynthRef.current?.playTransitionChime(659.25);
      } else if (e.key === 'l' || e.key === 'L') {
        setIsLooping((prev) => !prev);
      } else if (e.key === 'p' || e.key === 'P') {
        setIsPaused((prev) => !prev);
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

  // Speed toggle
  const toggleSpeed = () => {
    const nextSpeed = speedMultiplier === 1.0 ? 1.5 : speedMultiplier === 1.5 ? 2.0 : 1.0;
    setSpeedMultiplier(nextSpeed);
    controllerRef.current?.setSpeedMultiplier(nextSpeed);
  };

  // Scene transition timer (runs when not paused and not looping)
  useEffect(() => {
    if (isPaused || isLooping) return;
    if (index >= SCENES.length) {
      finish();
      return;
    }

    const currentDuration = SCENES[index].duration / speedMultiplier;
    const fadeStart = Math.max(0, currentDuration - 600);

    const tFade = window.setTimeout(() => {
      setSceneFading(true);
    }, fadeStart);

    const tNext = window.setTimeout(() => {
      setSceneFading(false);
      if (index === SCENES.length - 1) {
        finish();
      } else {
        setIndex((prev) => prev + 1);
        audioSynthRef.current?.playTransitionChime(550 + (index + 1) * 80);
      }
    }, currentDuration);

    return () => {
      window.clearTimeout(tFade);
      window.clearTimeout(tNext);
    };
  }, [index, isPaused, isLooping, speedMultiplier, finish]);

  // Initialize current Three.js scene
  useEffect(() => {
    const el = containerRef.current;
    if (!el || index >= SCENES.length) return;

    controllerRef.current?.cleanup();
    const currentSceneMeta = SCENES[index];
    controllerRef.current = INIT_MAP[currentSceneMeta.kind](el);
    controllerRef.current.setSpeedMultiplier(speedMultiplier);

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
  }, [index, speedMultiplier]);

  const scene = SCENES[Math.min(index, SCENES.length - 1)];
  const progressPercent = ((Math.min(index, SCENES.length - 1) + 1) / SCENES.length) * 100;
  const SceneIcon = scene.icon;

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
      <div className="absolute top-5 left-6 right-6 flex items-center justify-between text-xs tracking-widest text-slate-400 font-mono z-20 pointer-events-none">
        <div className="flex items-center space-x-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
          <span className="text-cyan-300 font-semibold uppercase tracking-[0.2em]">EARTH ONE / SYSTEM BOOT</span>
          <span className="hidden md:inline text-slate-600">|</span>
          <span className="hidden md:inline text-slate-400 text-[11px] font-sans">
            可鼠标拖拽 3D 视角 · 按键 1/2/3 切换 · 空格跳过
          </span>
        </div>
        <div className="hidden sm:block text-slate-400 tracking-[0.18em] text-[10px] uppercase font-mono">
          {scene.telemetry}
        </div>
      </div>

      {/* Top Center Direct Scene Switcher (3 Modes) */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center p-1 rounded-full bg-slate-950/80 border border-slate-800/80 backdrop-blur-xl shadow-2xl pointer-events-auto">
        {SCENES.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === index;
          return (
            <button
              key={s.kind}
              type="button"
              onClick={() => {
                setSceneFading(false);
                setIndex(i);
                audioSynthRef.current?.playTransitionChime(440 + i * 110);
              }}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-600 to-sky-500 text-white shadow-[0_0_16px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="font-sans font-medium">{s.titleZh}</span>
              <span className="text-[10px] opacity-70 font-mono hidden md:inline">0{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Center Cinematic Typography & Bilingual Subtitles */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div
          className={`text-center px-6 max-w-3xl transition-all duration-600 ease-out transform ${
            sceneFading ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
          }`}
        >
          {/* Phase Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 text-[11px] tracking-[0.35em] uppercase mb-4 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <SceneIcon className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
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
                className="group relative py-2 px-1 focus:outline-none transition-all"
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
      <div className="absolute bottom-8 left-8 flex items-center space-x-2.5 z-20 pointer-events-auto">
        {/* Audio Toggle */}
        <button
          type="button"
          onClick={toggleSound}
          className={`flex items-center space-x-1.5 px-3 py-2 rounded-full border text-xs tracking-wider transition-all backdrop-blur-md ${
            soundEnabled
              ? 'border-cyan-500/70 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
          title={soundEnabled ? '关闭背景合成声效 (M)' : '开启宇宙全息音频 (M)'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline font-mono">{soundEnabled ? 'AUDIO ON' : 'AUDIO OFF'}</span>
        </button>

        {/* Pause/Play Toggle */}
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-full border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 text-xs tracking-wider transition-all backdrop-blur-md font-mono"
          title={isPaused ? '继续播放 (P)' : '暂停播放 (P)'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 text-cyan-400" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPaused ? 'RESUME' : 'PAUSE'}</span>
        </button>

        {/* Loop Mode Toggle */}
        <button
          type="button"
          onClick={() => setIsLooping((prev) => !prev)}
          className={`flex items-center space-x-1.5 px-3 py-2 rounded-full border text-xs tracking-wider transition-all backdrop-blur-md font-mono ${
            isLooping
              ? 'border-cyan-500/70 bg-cyan-950/60 text-cyan-300'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
          }`}
          title={isLooping ? '取消单幕循环 (L)' : '单幕循环播放 (L)'}
        >
          <Repeat className={`w-3.5 h-3.5 ${isLooping ? 'text-cyan-400' : ''}`} />
          <span className="hidden sm:inline">{isLooping ? 'LOOP ON' : 'LOOP'}</span>
        </button>

        {/* Speed Multiplier */}
        <button
          type="button"
          onClick={toggleSpeed}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-full border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 text-xs tracking-wider transition-all backdrop-blur-md font-mono"
          title="切换播放倍速"
        >
          <Gauge className="w-3.5 h-3.5 text-slate-400" />
          <span>{speedMultiplier.toFixed(1)}x</span>
        </button>
      </div>

      {/* Bottom Right Skip / Enter Button */}
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
