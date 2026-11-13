/**
 * EARTH ONE - SCENE BUILDERS
 * Reusable Three.js builders for the globe's orbital system, global data
 * connection arcs, and deep-space star field. Kept modular so the main
 * DigitalGlobe component stays focused on integration.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Orbit system
// ---------------------------------------------------------------------------

export interface OrbitRing {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

/**
 * Build a set of subtle precision orbital hairlines around the earth.
 */
export function buildOrbitSystem(earthRadius: number): OrbitRing {
  const group = new THREE.Group();

  const ringConfigs: {
    radius: number;
    color: number;
    opacity: number;
    inclinationX: number;
    inclinationY: number;
    speed: number;
  }[] = [
    // Primary LEO / ISS-band hairline
    { radius: earthRadius * 1.24, color: 0x94b8d8, opacity: 0.22, inclinationX: 0.12, inclinationY: 0.0, speed: 0.0004 },
    // MEO inclined hairline
    { radius: earthRadius * 1.38, color: 0x8da4ba, opacity: 0.14, inclinationX: 0.44, inclinationY: 0.22, speed: -0.00028 },
    // Polar / sun-synchronous hairline
    { radius: earthRadius * 1.50, color: 0xb69c74, opacity: 0.12, inclinationX: -0.35, inclinationY: 0.38, speed: 0.0002 }
  ];

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  for (const cfg of ringConfigs) {
    const geometry = new THREE.RingGeometry(cfg.radius, cfg.radius + 0.006, 256);
    const material = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    geometries.push(geometry);
    materials.push(material);

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = cfg.inclinationY;
    ring.rotation.z = cfg.inclinationX;
    ring.renderOrder = 1;
    group.add(ring);
  }

  const rings = group.children as THREE.Mesh[];
  const speeds = ringConfigs.map(c => c.speed);

  return {
    group,
    update: () => {
      rings.forEach((ring, i) => {
        ring.rotation.y += speeds[i];
      });
    },
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}

// ---------------------------------------------------------------------------
// Global data connection arcs
// ---------------------------------------------------------------------------

export interface ConnectionArc {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

interface ArcEndpoint {
  lat: number;
  lng: number;
}

const ARC_CONNECTIONS: [ArcEndpoint, ArcEndpoint][] = [
  [{ lat: 35.7, lng: 139.7 }, { lat: 51.5, lng: -0.1 }],     // Tokyo → London
  [{ lat: 39.9, lng: 116.4 }, { lat: 40.7, lng: -74.0 }],    // Beijing → New York
  [{ lat: 51.5, lng: -0.1 }, { lat: 0.0, lng: 20.0 }],       // London → Central Africa
  [{ lat: 39.9, lng: 116.4 }, { lat: 30.0, lng: 31.2 }],     // Beijing → Cairo
  [{ lat: 40.7, lng: -74.0 }, { lat: -23.5, lng: -46.6 }]    // New York → São Paulo
];

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function buildArc(start: THREE.Vector3, end: THREE.Vector3, color: number, opacity: number): {
  line: THREE.Line;
  points: THREE.Vector3[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
} {
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dist = start.distanceTo(end);
  const lift = dist * 0.26;
  mid.normalize().multiplyScalar(start.length() + lift);

  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  const points = curve.getPoints(64);

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 2;
  return { line, points, geometry, material };
}

/**
 * Build restrained global data connection arcs with subtle traveling light pulses.
 */
export function buildConnectionArcs(earthRadius: number): ConnectionArc {
  const group = new THREE.Group();

  const arcColors = [0x6bb4ec, 0x6bb4ec, 0xcba86b, 0x6bb4ec, 0xcba86b];
  const pulses: { mesh: THREE.Mesh; points: THREE.Vector3[]; speed: number; offset: number }[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const sharedPulseGeo = new THREE.SphereGeometry(0.018, 8, 8);
  geometries.push(sharedPulseGeo);

  ARC_CONNECTIONS.forEach(([a, b], i) => {
    const start = latLngToVector3(a.lat, a.lng, earthRadius * 1.016);
    const end = latLngToVector3(b.lat, b.lng, earthRadius * 1.016);
    const color = arcColors[i % arcColors.length];
    const { line, points, geometry, material } = buildArc(start, end, color, 0.24);
    geometries.push(geometry);
    materials.push(material);
    group.add(line);

    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    materials.push(pulseMat);
    const pulse = new THREE.Mesh(sharedPulseGeo, pulseMat);
    pulse.renderOrder = 3;
    group.add(pulse);
    pulses.push({ mesh: pulse, points, speed: 0.0005 + Math.random() * 0.0004, offset: Math.random() });
  });

  return {
    group,
    update: (elapsed: number) => {
      pulses.forEach(p => {
        const t = (elapsed * p.speed + p.offset) % 1;
        const scaled = t * (p.points.length - 1);
        const idx = Math.floor(scaled);
        const next = Math.min(idx + 1, p.points.length - 1);
        p.mesh.position.lerpVectors(p.points[idx], p.points[next], scaled - idx);
      });
    },
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}

// ---------------------------------------------------------------------------
// Star field
// ---------------------------------------------------------------------------

function createStarSpriteTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.55, 'rgba(210, 228, 255, 0.22)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildStarField(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 130 + Math.random() * 170;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Subtle natural stellar color temperatures (cool blue, crisp white, warm gold)
    const b = 0.28 + Math.random() * 0.62;
    const tint = Math.random();
    if (tint > 0.88) {
      colors[i * 3] = b;
      colors[i * 3 + 1] = 0.88 * b;
      colors[i * 3 + 2] = 0.72 * b;
    } else if (tint > 0.68) {
      colors[i * 3] = 0.78 * b;
      colors[i * 3 + 1] = 0.88 * b;
      colors[i * 3 + 2] = b;
    } else {
      colors[i * 3] = b;
      colors[i * 3 + 1] = b;
      colors[i * 3 + 2] = b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const sprite = createStarSpriteTexture();
  const material = new THREE.PointsMaterial({
    size: sprite ? 1.55 : 0.9,
    map: sprite ?? undefined,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    alphaTest: 0.01,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.userData.dispose = () => {
    geometry.dispose();
    material.dispose();
    sprite?.dispose();
  };
  return points;
}
