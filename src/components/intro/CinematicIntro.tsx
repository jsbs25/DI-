import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type SceneKind = 'hyperspace' | 'digitalEarth' | 'cosmic';

interface CinematicIntroProps {
  onComplete: () => void;
}

const SCENES: Array<{ kind: SceneKind; subtitle: string; duration: number }> = [
  { kind: 'hyperspace', subtitle: 'Entering the Network', duration: 3800 },
  { kind: 'digitalEarth', subtitle: 'Digital Earth Online', duration: 4000 },
  { kind: 'cosmic', subtitle: 'Cosmic Civilization', duration: 4200 },
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

type SceneController = { cleanup: () => void; resize: (w: number, h: number) => void };

function createRenderer(container: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);
  return renderer;
}

function initHyperspace(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.035);
  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 200);
  camera.position.z = 5;
  const renderer = createRenderer(container);

  const starCount = 1800;
  const positions = new Float32Array(starCount * 3);
  const speeds = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 2] = -Math.random() * 120;
    speeds[i] = 0.2 + Math.random() * 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.08, transparent: true, opacity: 0.9 });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const glowGeo = new THREE.SphereGeometry(0.6, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.15 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.z = -2;
  scene.add(glow);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < starCount; i++) {
      pos[i * 3 + 2] += speeds[i] * 0.9;
      if (pos[i * 3 + 2] > 6) {
        pos[i * 3 + 2] = -120;
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      }
    }
    geo.attributes.position.needsUpdate = true;
    points.rotation.z += 0.0015;
    glow.scale.setScalar(1 + Math.sin(Date.now() * 0.002) * 0.08);
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

function initDigitalEarth(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 4.2);
  const renderer = createRenderer(container);

  const group = new THREE.Group();
  scene.add(group);

  const sphereGeo = new THREE.SphereGeometry(1.35, 32, 32);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.55 });
  const wire = new THREE.Mesh(sphereGeo, wireMat);
  group.add(wire);

  const innerGeo = new THREE.SphereGeometry(1.32, 24, 24);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.08 });
  group.add(new THREE.Mesh(innerGeo, innerMat));

  const ringGeo = new THREE.RingGeometry(1.7, 1.74, 96);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.4;
  group.add(ring);

  const particlesGeo = new THREE.BufferGeometry();
  const pCount = 500;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.36 + Math.random() * 0.08;
    pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pPos[i * 3 + 1] = r * Math.cos(phi);
    pPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(particlesGeo, new THREE.PointsMaterial({ color: 0xa5f3fc, size: 0.018, transparent: true, opacity: 0.9 }));
  group.add(particles);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    group.rotation.y += 0.004;
    group.rotation.x = Math.sin(Date.now() * 0.0004) * 0.08;
    ring.rotation.z -= 0.003;
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

function initCosmic(container: HTMLDivElement): SceneController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030014, 0.06);
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 1.2, 5);
  camera.lookAt(0, 0, 0);
  const renderer = createRenderer(container);

  const coreGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, wireframe: true, transparent: true, opacity: 0.85 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  const haloGeo = new THREE.TorusGeometry(1.6, 0.015, 16, 120);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.6 });
  const halo1 = new THREE.Mesh(haloGeo, haloMat);
  const halo2 = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.35 }));
  halo2.rotation.x = Math.PI / 2;
  halo2.scale.setScalar(1.15);
  scene.add(halo1, halo2);

  const starGeo = new THREE.BufferGeometry();
  const sCount = 900;
  const sPos = new Float32Array(sCount * 3);
  for (let i = 0; i < sCount; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 40;
    sPos[i * 3 + 1] = (Math.random() - 0.5) * 40;
    sPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.7 }));
  scene.add(stars);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = Date.now() * 0.001;
    core.rotation.x += 0.006;
    core.rotation.y += 0.008;
    core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.04);
    halo1.rotation.z += 0.004;
    halo1.rotation.x = Math.sin(t * 0.6) * 0.4;
    halo2.rotation.y -= 0.003;
    stars.rotation.y += 0.0006;
    camera.position.x = Math.sin(t * 0.25) * 0.25;
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

const INIT: Record<SceneKind, (el: HTMLDivElement) => SceneController> = {
  hyperspace: initHyperspace,
  digitalEarth: initDigitalEarth,
  cosmic: initCosmic,
};

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [sceneFading, setSceneFading] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    window.setTimeout(() => onComplete(), 650);
  };

  useEffect(() => {
    if (index >= SCENES.length) {
      finish();
      return;
    }
    const { duration } = SCENES[index];
    const fadeStart = Math.max(0, duration - 550);
    const t1 = window.setTimeout(() => setSceneFading(true), fadeStart);
    const t2 = window.setTimeout(() => {
      setSceneFading(false);
      setIndex((i) => i + 1);
    }, duration);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [index]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || index >= SCENES.length) return;
    controllerRef.current?.cleanup();
    controllerRef.current = INIT[SCENES[index].kind](el);
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
  const progress = ((Math.min(index, SCENES.length - 1) + 1) / SCENES.length) * 100;

  return (
    <div
      className={`fixed inset-0 z-[200] bg-[#020617] transition-opacity duration-700 ${fading ? 'opacity-0' : 'opacity-100'}`}
      aria-label="EARTH ONE cinematic intro"
    >
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${sceneFading ? 'opacity-0' : 'opacity-100'}`}
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#020617] via-transparent to-[#020617]/40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <div className={`text-center px-6 transition-opacity duration-500 ${sceneFading ? 'opacity-0' : 'opacity-100'}`}>
          <div className="text-[11px] tracking-[0.45em] text-cyan-300/80 uppercase mb-3">Project</div>
          <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl font-bold tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-cyan-300 drop-shadow-[0_0_30px_rgba(34,211,238,0.25)]">
            EARTH ONE
          </h1>
          <div className="mt-4 text-sm sm:text-base text-slate-300/90 tracking-[0.22em] uppercase">{scene.subtitle}</div>
          <div className="mt-6 flex items-center justify-center gap-2">
            {SCENES.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${i <= Math.min(index, SCENES.length - 1) ? 'w-8 bg-cyan-400/80' : 'w-4 bg-slate-700/70'}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-slate-900/60">
        <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <button
        type="button"
        onClick={finish}
        className="absolute bottom-8 right-8 px-4 py-2 rounded-full border border-slate-700/80 bg-slate-950/60 text-slate-300 text-xs tracking-wider hover:border-cyan-500/60 hover:text-cyan-200 transition-colors backdrop-blur-sm"
      >
        Skip
      </button>
    </div>
  );
}
