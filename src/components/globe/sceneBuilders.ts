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
}

/**
 * Build a set of 3D orbital rings around the earth with varied radius,
 * inclination, and style. Returns groups added to the scene plus an update
 * callback for independent slow rotation.
 */
export function buildOrbitSystem(earthRadius: number): OrbitRing {
  const group = new THREE.Group();

  const ringConfigs: {
    radius: number;
    color: number;
    opacity: number;
    dashed: boolean;
    dashSize: number;
    gapSize: number;
    inclinationX: number;
    inclinationY: number;
    speed: number;
  }[] = [
    // White primary orbit
    { radius: earthRadius * 1.32, color: 0x9fb8cc, opacity: 0.35, dashed: false, dashSize: 0.2, gapSize: 0.1, inclinationX: 0.0, inclinationY: 0.0, speed: 0.0006 },
    // Dark red inclined orbit
    { radius: earthRadius * 1.46, color: 0x7a3030, opacity: 0.4, dashed: false, dashSize: 0.2, gapSize: 0.1, inclinationX: 0.42, inclinationY: 0.18, speed: -0.0004 },
    // Translucent dashed orbit
    { radius: earthRadius * 1.6, color: 0x6b8ca8, opacity: 0.3, dashed: true, dashSize: 0.24, gapSize: 0.16, inclinationX: -0.3, inclinationY: 0.35, speed: 0.0003 },
    // Tilted auxiliary orbit
    { radius: earthRadius * 1.74, color: 0x4a5f74, opacity: 0.22, dashed: false, dashSize: 0.2, gapSize: 0.1, inclinationX: 0.85, inclinationY: -0.25, speed: -0.00025 }
  ];

  for (const cfg of ringConfigs) {
    const geometry = new THREE.RingGeometry(cfg.radius, cfg.radius + 0.008, 256);
    // RingGeometry lies in XY plane by default; we rotate to XZ (around earth's equator)
    const material = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2; // lay flat into equatorial plane
    ring.rotation.y = cfg.inclinationY;
    ring.rotation.z = cfg.inclinationX;
    ring.renderOrder = 1;
    group.add(ring);
  }

  const rings = group.children as THREE.Mesh[];
  const speeds = ringConfigs.map(c => c.speed);

  return {
    group,
    update: (elapsed: number) => {
      rings.forEach((ring, i) => {
        ring.rotation.y += speeds[i];
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Global data connection arcs
// ---------------------------------------------------------------------------

export interface ConnectionArc {
  group: THREE.Group;
  update: (elapsed: number) => void;
}

interface ArcEndpoint {
  lat: number;
  lng: number;
}

const ARC_CONNECTIONS: [ArcEndpoint, ArcEndpoint][] = [
  [{ lat: 35.7, lng: 139.7 }, { lat: 51.5, lng: -0.1 }],     // Tokyo → London
  [{ lat: 39.9, lng: 116.4 }, { lat: 40.7, lng: -74.0 }],    // Beijing → New York
  [{ lat: 51.5, lng: -0.1 }, { lat: 0.0, lng: 20.0 }],       // London → Central Africa
  [{ lat: 39.9, lng: 116.4 }, { lat: 30.0, lng: 31.2 }],     // Beijing → Cairo (Middle East)
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

function buildArc(start: THREE.Vector3, end: THREE.Vector3, color: number, opacity: number): { line: THREE.Line; points: THREE.Vector3[] } {
  const mid = start.clone().add(end).multiplyScalar(0.5);
  // Arc height based on distance between endpoints — higher for long arcs
  const dist = start.distanceTo(end);
  const lift = dist * 0.28;
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
  return { line, points };
}

/**
 * Build global data connection arcs with traveling light pulses.
 */
export function buildConnectionArcs(earthRadius: number): ConnectionArc {
  const group = new THREE.Group();

  const arcColors = [0x7cc7ff, 0x7cc7ff, 0xd8b06a, 0x7cc7ff, 0xd8b06a];
  const pulses: { mesh: THREE.Mesh; points: THREE.Vector3[]; speed: number; offset: number }[] = [];

  ARC_CONNECTIONS.forEach(([a, b], i) => {
    const start = latLngToVector3(a.lat, a.lng, earthRadius * 1.02);
    const end = latLngToVector3(b.lat, b.lng, earthRadius * 1.02);
    const color = arcColors[i % arcColors.length];
    const { line, points } = buildArc(start, end, color, 0.35);
    group.add(line);

    // Traveling pulse
    const pulseGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.renderOrder = 3;
    group.add(pulse);
    pulses.push({ mesh: pulse, points, speed: 0.0006 + Math.random() * 0.0006, offset: Math.random() });
  });

  return {
    group,
    update: (elapsed: number) => {
      pulses.forEach(p => {
        const t = (elapsed * p.speed + p.offset) % 1;
        const idx = Math.floor(t * (p.points.length - 1));
        const next = Math.min(idx + 1, p.points.length - 1);
        p.mesh.position.lerpVectors(p.points[idx], p.points[next], (t * (p.points.length - 1)) - idx);
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Star field
// ---------------------------------------------------------------------------

export function buildStarField(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Distant stars on a large sphere shell
    const r = 120 + Math.random() * 160;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Subtle brightness variation, mostly white with faint blue/gold tint
    const b = 0.4 + Math.random() * 0.6;
    const isBlue = Math.random() > 0.82;
    const isGold = Math.random() > 0.9;
    colors[i * 3] = isGold ? b : isBlue ? 0.8 * b : b;
    colors[i * 3 + 1] = isGold ? 0.88 * b : isBlue ? 0.9 * b : b;
    colors[i * 3 + 2] = isBlue ? b : isGold ? 0.7 * b : b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false
  });

  return new THREE.Points(geometry, material);
}
