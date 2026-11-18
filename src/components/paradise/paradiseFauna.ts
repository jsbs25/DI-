import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { lakeSignedDist, terrainHeightAt } from './paradiseTerrain.ts';

export interface ParadiseFaunaHandle {
  group: THREE.Group;
  update: (
    elapsed: number,
    dt: number,
    dayFactor: number,
    nightFactor: number,
    eveningFactor: number,
    rainIntensity: number,
    windStrength: number,
    pointerWorld: THREE.Vector3,
    pointerActive: number
  ) => void;
  dispose: () => void;
}

interface ButterflyAgent {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  yaw: number;
  restTimer: number;
  resting: boolean;
  phase: number;
  homeFlowerIdx: number;
}

interface BirdAgent {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  center: THREE.Vector3;
  rx: number;
  rz: number;
  alt: number;
  omega: number;
  angle: number;
  flapPhase: number;
}

interface KoiAgent {
  mesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
  rx: number;
  rz: number;
  angle: number;
  speed: number;
}

export function createParadiseFauna(
  quality: ParadiseQualityProfile,
  textures: ProceduralTextureSet,
  flowerSpots: THREE.Vector3[]
): ParadiseFaunaHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Fallback anchor points if few flowers
  const anchors =
    flowerSpots.length >= 6
      ? flowerSpots
      : [
          new THREE.Vector3(-4, 1.2, 8),
          new THREE.Vector3(3, 1.1, 10),
          new THREE.Vector3(-7, 1.3, 4),
          new THREE.Vector3(8, 1.2, 6),
          new THREE.Vector3(0, 1.1, 13),
          new THREE.Vector3(-2, 1.1, 2),
        ];

  // =========================================================================
  // 1. Daytime Butterflies (Articulated vertex wing flap + natural floral flight)
  // =========================================================================
  const bflyGeo = trackGeo(new THREE.PlaneGeometry(0.28, 0.2, 4, 2));
  bflyGeo.rotateX(-Math.PI / 2);

  const butterflyColors: Array<[number, number]> = [
    [0x6ec3f4, 0x204b85], // Blue Morpho
    [0xf4a842, 0x7c3412], // Monarch Gold
    [0xf8e58c, 0x8d6e1f], // Swallowtail Lemon
    [0xf7dce6, 0xb86882], // Sakura Pieris
  ];

  const butterflies: ButterflyAgent[] = [];
  for (let i = 0; i < quality.butterflyCount; i++) {
    const [cMain, cEdge] = butterflyColors[i % butterflyColors.length];
    const mat = trackMat(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uFlapAmp: { value: 1.0 },
          uFlapFreq: { value: 13.5 },
          uOpacity: { value: 1.0 },
          uMainColor: { value: new THREE.Color(cMain) },
          uEdgeColor: { value: new THREE.Color(cEdge) },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uFlapAmp;
          uniform float uFlapFreq;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float wingDist = abs(pos.x) / 0.14;
            float flap = sin(uTime * uFlapFreq) * uFlapAmp;
            pos.y += wingDist * flap * 0.11 + wingDist * 0.025;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform vec3 uMainColor;
          uniform vec3 uEdgeColor;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - vec2(0.5, 0.5);
            float bodyGap = smoothstep(0.015, 0.055, abs(p.x));
            // Organic double-lobe wing silhouette
            float lobeTop = length((p - vec2(sign(p.x) * 0.23, 0.14)) * vec2(1.45, 1.9));
            float lobeBot = length((p - vec2(sign(p.x) * 0.19, -0.17)) * vec2(1.7, 2.1));
            float wingShape = min(lobeTop, lobeBot);
            if (wingShape > 0.43 || bodyGap < 0.05) discard;
            float rim = smoothstep(0.24, 0.42, wingShape);
            vec3 col = mix(uMainColor, uEdgeColor, rim);
            gl_FragColor = vec4(col, uOpacity * 0.94);
          }
        `,
      })
    );

    const mesh = new THREE.Mesh(bflyGeo, mat);
    const homeIdx = i % anchors.length;
    const origin = anchors[homeIdx];
    const startPos = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 4));
    mesh.position.copy(startPos);
    mesh.scale.setScalar(0.85 + Math.random() * 0.45);
    group.add(mesh);

    butterflies.push({
      mesh,
      mat,
      pos: startPos,
      target: origin.clone().add(new THREE.Vector3(0, 0.45, 0)),
      speed: 1.35 + Math.random() * 0.7,
      yaw: Math.random() * Math.PI * 2,
      restTimer: Math.random() * 4,
      resting: false,
      phase: Math.random() * Math.PI * 2,
      homeFlowerIdx: homeIdx,
    });
  }

  // =========================================================================
  // 2. Soaring Garden Songbirds / Swallows
  // =========================================================================
  const wingGeo = trackGeo(new THREE.PlaneGeometry(0.45, 0.14));
  wingGeo.translate(0.22, 0, 0);
  const bodyGeo = trackGeo(new THREE.ConeGeometry(0.05, 0.34, 5).rotateX(Math.PI / 2));
  const birdMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b424d,
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  );

  const birds: BirdAgent[] = [];
  for (let i = 0; i < quality.birdCount; i++) {
    const bGroup = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, birdMat);
    const lw = new THREE.Mesh(wingGeo, birdMat);
    const rw = new THREE.Mesh(wingGeo, birdMat);
    rw.scale.x = -1;
    bGroup.add(body, lw, rw);
    group.add(bGroup);

    birds.push({
      group: bGroup,
      leftWing: lw,
      rightWing: rw,
      center: new THREE.Vector3((Math.random() - 0.5) * 14, 10 + i * 1.6, -8 + (Math.random() - 0.5) * 16),
      rx: 14 + i * 3.2,
      rz: 11 + i * 2.5,
      alt: 9.5 + (i % 4) * 2.6,
      omega: 0.22 + (i % 3) * 0.06,
      angle: (i / Math.max(1, quality.birdCount)) * Math.PI * 2,
      flapPhase: Math.random() * Math.PI * 2,
    });
  }

  // =========================================================================
  // 3. Nighttime Fireflies & Gentle Twilight Moths (Warm amber glow, non-neon)
  // =========================================================================
  const ffCount = quality.fireflyCount;
  const ffGeo = trackGeo(new THREE.BufferGeometry());
  const ffHome = new Float32Array(ffCount * 3);
  const ffPositions = new Float32Array(ffCount * 3);
  const ffSeeds = new Float32Array(ffCount * 3);

  for (let i = 0; i < ffCount; i++) {
    // Cluster fireflies naturally around lakeside reeds, willow banks & flower beds
    const spot = anchors[i % anchors.length];
    const x = spot.x + (Math.random() - 0.5) * 10;
    const z = spot.z + (Math.random() - 0.5) * 10;
    const groundY = Math.max(0.05, terrainHeightAt(x, z));
    const y = groundY + 0.45 + Math.random() * 2.4;

    ffHome[i * 3] = x;
    ffHome[i * 3 + 1] = y;
    ffHome[i * 3 + 2] = z;

    ffPositions[i * 3] = x;
    ffPositions[i * 3 + 1] = y;
    ffPositions[i * 3 + 2] = z;

    ffSeeds[i * 3] = Math.random() * Math.PI * 2; // phase
    ffSeeds[i * 3 + 1] = 0.6 + Math.random() * 0.9; // blink rate
    ffSeeds[i * 3 + 2] = 0.75 + Math.random() * 0.65; // size mult
  }

  const ffPosAttr = new THREE.BufferAttribute(ffPositions, 3);
  ffGeo.setAttribute('position', ffPosAttr);
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeeds, 3));

  const ffUniforms = {
    uTime: { value: 0 },
    uVisibility: { value: 0 },
    uPixelRatio: { value: quality.pixelRatio },
    uMap: { value: textures.softGlow },
  };

  const ffMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: ffUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime;
        uniform float uVisibility;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          float pulse = pow(0.5 + 0.5 * sin(uTime * aSeed.y * 2.2 + aSeed.x), 2.4);
          vAlpha = (0.18 + 0.82 * pulse) * uVisibility;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp((24.0 * aSeed.z * uPixelRatio) / max(1.0, -mvPosition.z), 2.0, 22.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          vec4 tex = texture2D(uMap, gl_PointCoord);
          // Warm firefly amber-chartreuse bioluminescence (natural & calming)
          vec3 col = mix(vec3(0.76, 0.92, 0.34), vec3(1.0, 0.86, 0.42), tex.a);
          gl_FragColor = vec4(col, tex.a * vAlpha * 0.88);
        }
      `,
    })
  );

  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  fireflies.renderOrder = 6;
  group.add(fireflies);

  // =========================================================================
  // 4. Lake Koi Fish gliding smoothly underwater
  // =========================================================================
  const koiGeo = trackGeo(new THREE.CapsuleGeometry(0.06, 0.32, 4, 6).rotateX(Math.PI / 2));
  const koiColors = [0xd66a3c, 0xeadfd2, 0xe08f45];
  const kois: KoiAgent[] = [];
  for (let i = 0; i < quality.koiCount; i++) {
    const kMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: koiColors[i % koiColors.length],
        roughness: 0.35,
        metalness: 0.05,
        transparent: true,
        opacity: 0.72,
      })
    );
    const kMesh = new THREE.Mesh(koiGeo, kMat);
    const cx = 4.5 + (Math.random() - 0.5) * 6;
    const cz = -1.8 + (Math.random() - 0.5) * 4;
    if (lakeSignedDist(cx, cz) > -1.0) continue;
    kMesh.position.set(cx, -0.18, cz);
    group.add(kMesh);
    kois.push({
      mesh: kMesh,
      centerX: cx,
      centerZ: cz,
      rx: 1.5 + Math.random() * 2.2,
      rz: 1.2 + Math.random() * 1.8,
      angle: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.3,
    });
  }

  const tmpDir = new THREE.Vector3();

  const update = (
    elapsed: number,
    dt: number,
    dayFactor: number,
    nightFactor: number,
    eveningFactor: number,
    rainIntensity: number,
    windStrength: number,
    pointerWorld: THREE.Vector3,
    pointerActive: number
  ) => {
    // 1. Update butterflies (active during daytime/dawn/dusk when rain is low)
    const bflyVis = THREE.MathUtils.clamp((dayFactor * 1.15 + 0.15 - nightFactor * 0.85) * (1 - rainIntensity * 0.92), 0, 1);

    for (const b of butterflies) {
      b.mesh.visible = bflyVis > 0.04;
      if (!b.mesh.visible) continue;

      b.mat.uniforms.uTime.value = elapsed + b.phase;
      b.mat.uniforms.uOpacity.value = bflyVis;

      // Scatter gently if user sweeps pointer close
      const distPtr = b.pos.distanceTo(pointerWorld);
      if (pointerActive > 0.25 && distPtr < 3.0) {
        b.resting = false;
        b.restTimer = 0;
        tmpDir.copy(b.pos).sub(pointerWorld).setY(0.7).normalize();
        b.target.copy(b.pos).addScaledVector(tmpDir, 2.8);
      }

      if (b.resting) {
        b.restTimer -= dt;
        b.mat.uniforms.uFlapAmp.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapAmp.value, 0.22, 6, dt);
        b.mat.uniforms.uFlapFreq.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapFreq.value, 3.2, 6, dt);
        if (b.restTimer <= 0) {
          b.resting = false;
          const nextIdx = (b.homeFlowerIdx + 1 + Math.floor(Math.random() * 4)) % anchors.length;
          b.homeFlowerIdx = nextIdx;
          b.target.copy(anchors[nextIdx]).add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 0.4 + Math.random() * 1.5, (Math.random() - 0.5) * 3.5));
        }
      } else {
        b.mat.uniforms.uFlapAmp.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapAmp.value, 1.0, 7, dt);
        b.mat.uniforms.uFlapFreq.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapFreq.value, 14.0, 7, dt);

        tmpDir.copy(b.target).sub(b.pos);
        const distT = tmpDir.length();
        if (distT < 0.32) {
          if (Math.random() > 0.45) {
            b.resting = true;
            b.restTimer = 1.6 + Math.random() * 2.8;
          } else {
            const nextIdx = (b.homeFlowerIdx + 1 + Math.floor(Math.random() * 5)) % anchors.length;
            b.homeFlowerIdx = nextIdx;
            b.target.copy(anchors[nextIdx]).add(new THREE.Vector3((Math.random() - 0.5) * 4.5, 0.5 + Math.random() * 1.6, (Math.random() - 0.5) * 4.5));
          }
        } else {
          tmpDir.normalize();
          // Organic meandering curl + wind drift
          const flutter = Math.sin(elapsed * 4.5 + b.phase) * 0.35;
          b.pos.addScaledVector(tmpDir, b.speed * dt);
          b.pos.y += flutter * dt;
          b.pos.x += windStrength * 0.28 * Math.sin(elapsed * 0.9 + b.phase) * dt;
          const desiredYaw = Math.atan2(tmpDir.x, tmpDir.z);
          b.yaw = desiredYaw;
        }
      }

      const groundFloor = Math.max(0.25, terrainHeightAt(b.pos.x, b.pos.z) + 0.28);
      if (b.pos.y < groundFloor) b.pos.y = groundFloor;
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y = b.yaw;
    }

    // 2. Update soaring birds across valley sky
    const birdVis = THREE.MathUtils.clamp((dayFactor * 1.1 + 0.2 - nightFactor * 0.9) * (1 - rainIntensity * 0.8), 0, 1);
    for (const bird of birds) {
      bird.group.visible = birdVis > 0.05;
      if (!bird.group.visible) continue;

      bird.angle += bird.omega * dt * (1 + windStrength * 0.25);
      const bx = bird.center.x + Math.cos(bird.angle) * bird.rx;
      const bz = bird.center.z + Math.sin(bird.angle) * bird.rz;
      const by = bird.alt + Math.sin(bird.angle * 2 + bird.flapPhase) * 1.15;

      const nx = bird.center.x + Math.cos(bird.angle + 0.05) * bird.rx;
      const nz = bird.center.z + Math.sin(bird.angle + 0.05) * bird.rz;
      bird.group.position.set(bx, by, bz);
      bird.group.lookAt(nx, by, nz);

      // Alternating periods of wingbeats and peaceful soaring glides
      const glideCycle = Math.sin(elapsed * 0.45 + bird.flapPhase);
      const flap = glideCycle > -0.2 ? Math.sin(elapsed * 9.5 + bird.flapPhase) * 0.48 : Math.sin(elapsed * 1.8) * 0.08;
      bird.leftWing.rotation.z = flap;
      bird.rightWing.rotation.z = -flap;
    }

    // 3. Update Fireflies at dusk / evening / night
    const ffVis = THREE.MathUtils.clamp((nightFactor * 1.1 + eveningFactor * 0.72) * (1 - rainIntensity * 0.85), 0, 1);
    ffUniforms.uTime.value = elapsed;
    ffUniforms.uVisibility.value = ffVis;
    fireflies.visible = ffVis > 0.02;

    if (fireflies.visible) {
      for (let i = 0; i < ffCount; i++) {
        const hx = ffHome[i * 3];
        const hy = ffHome[i * 3 + 1];
        const hz = ffHome[i * 3 + 2];
        const ph = ffSeeds[i * 3];

        let fx = hx + Math.sin(elapsed * 0.55 + ph) * 1.35 + Math.cos(elapsed * 0.31 + ph * 2.1) * 0.65;
        let fy = hy + Math.sin(elapsed * 0.82 + ph * 1.7) * 0.45;
        let fz = hz + Math.cos(elapsed * 0.48 + ph * 1.3) * 1.35;

        // Gentle curiosity drift toward quiet pointer presence at night
        if (pointerActive > 0.25) {
          const dx = pointerWorld.x - fx;
          const dz = pointerWorld.z - fz;
          const d = Math.hypot(dx, dz);
          if (d < 6.0 && d > 0.5) {
            const pull = (1 - d / 6.0) * 0.85;
            fx += dx * pull * 0.45;
            fz += dz * pull * 0.45;
            fy += (pointerWorld.y + 0.8 - fy) * pull * 0.25;
          }
        }

        ffPositions[i * 3] = fx;
        ffPositions[i * 3 + 1] = fy;
        ffPositions[i * 3 + 2] = fz;
      }
      ffPosAttr.needsUpdate = true;
    }

    // 4. Lake Koi fish gliding smoothly beneath clear water surface
    for (const k of kois) {
      k.angle += k.speed * dt;
      const kx = k.centerX + Math.cos(k.angle) * k.rx;
      const kz = k.centerZ + Math.sin(k.angle) * k.rz;
      const nextX = k.centerX + Math.cos(k.angle + 0.06) * k.rx;
      const nextZ = k.centerZ + Math.sin(k.angle + 0.06) * k.rz;
      k.mesh.position.set(kx, -0.18 + Math.sin(elapsed * 1.4 + k.angle) * 0.03, kz);
      k.mesh.lookAt(nextX, k.mesh.position.y, nextZ);
    }
  };

  return {
    group,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
