import * as THREE from 'three';
import type { ParadiseQualityProfile, ProceduralTextureSet } from './paradiseQuality.ts';
import { sampleWindField } from './paradiseEnvironment.ts';
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
    pointerActive: number,
    cameraPos?: THREE.Vector3,
    cameraForward?: THREE.Vector3
  ) => void;
  butterflyPositions: THREE.Vector3[];
  dispose: () => void;
}

interface ButterflyAgent {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  halo?: THREE.Sprite;
  haloMat?: THREE.SpriteMaterial;
  isGlowingBlue: boolean;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  yaw: number;
  roll: number;
  restTimer: number;
  curiousTimer: number;
  resting: boolean;
  phase: number;
  homeFlowerIdx: number;
}

interface BirdAgent {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  leftInnerWing: THREE.Group;
  leftOuterWing: THREE.Group;
  rightInnerWing: THREE.Group;
  rightOuterWing: THREE.Group;
  center: THREE.Vector3;
  rx: number;
  rz: number;
  alt: number;
  omega: number;
  angle: number;
  flapPhase: number;
  glideOffset: number;
  scale: number;
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

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
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
  // 1. Textured Patterned Butterflies + 2 Bioluminescent Glowing Blue Morphos
  // =========================================================================
  const bflyGeo = trackGeo(new THREE.PlaneGeometry(0.3, 0.22, 6, 2));
  bflyGeo.rotateX(-Math.PI / 2);

  // Species palettes: [innerWing, outerBorder, accentSpot]
  const butterflySpecies: Array<[number, number, number]> = [
    [0x5bbce8, 0x162b4d, 0xd8f3ff], // Blue Morpho
    [0xf09d38, 0x2a1810, 0xfff0d4], // Monarch Amber
    [0xf7e37e, 0x3b3520, 0x7bc2e8], // Swallowtail Citrine
    [0xfbf2f5, 0x7c4f60, 0xffd5e2], // Sakura Pieris
  ];

  const totalButterflies = quality.butterflyCount + 2;
  const glowingSpawnSpots = [
    new THREE.Vector3(-2.4, 1.38, 6.4),
    new THREE.Vector3(2.9, 1.48, 2.4),
  ];

  const butterflies: ButterflyAgent[] = [];
  const butterflyPositions: THREE.Vector3[] = [];
  for (let i = 0; i < totalButterflies; i++) {
    const isGlowingBlue = i >= quality.butterflyCount;
    const glowingIdx = i - quality.butterflyCount;
    const [cMain, cEdge, cSpot] = isGlowingBlue
      ? [0x3be0ff, 0x0d4599, 0xe2fbff]
      : butterflySpecies[i % butterflySpecies.length];

    const mat = trackMat(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uFlapAmp: { value: 1.0 },
          uFlapFreq: { value: 13.5 },
          uOpacity: { value: 1.0 },
          uGlowStrength: { value: isGlowingBlue ? 1.35 : 0.0 },
          uMainColor: { value: new THREE.Color(cMain) },
          uEdgeColor: { value: new THREE.Color(cEdge) },
          uSpotColor: { value: new THREE.Color(cSpot) },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uFlapAmp;
          uniform float uFlapFreq;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float wingDist = abs(pos.x) / 0.15;
            float flap = sin(uTime * uFlapFreq) * uFlapAmp;
            // Wing flexes gracefully with slight outer feather bend
            pos.y += pow(wingDist, 1.15) * flap * 0.125 + wingDist * 0.025;
            pos.z -= wingDist * flap * 0.015;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform float uGlowStrength;
          uniform vec3 uMainColor;
          uniform vec3 uEdgeColor;
          uniform vec3 uSpotColor;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - vec2(0.5, 0.5);
            float bodyAxis = abs(p.x);
            // Slender dark thorax & abdomen down centerline
            float bodyMask = (1.0 - smoothstep(0.015, 0.032, bodyAxis)) * (1.0 - smoothstep(0.05, 0.32, abs(p.y)));

            // Organic forewing + hindwing double-lobe silhouette
            vec2 fp = vec2(abs(p.x) - 0.23, p.y - 0.13);
            float lobeTop = length(fp * vec2(1.42, 1.85));
            vec2 hp = vec2(abs(p.x) - 0.18, p.y + 0.17);
            float lobeBot = length(hp * vec2(1.68, 2.02));
            float wingShape = min(lobeTop, lobeBot);

            float wingGap = smoothstep(0.012, 0.035, bodyAxis);
            if (wingShape > 0.42 && bodyMask < 0.2) discard;

            // Delicate radial venation ribs & sub-marginal ocelli spots
            float angle = atan(p.y * 1.15, abs(p.x));
            float veins = smoothstep(0.86, 0.99, abs(sin(angle * 7.5 + wingShape * 4.0)));
            float rim = smoothstep(0.24, 0.41, wingShape);
            float spotBand = (1.0 - smoothstep(0.012, 0.045, abs(wingShape - 0.34))) * step(0.3, fract(angle * 3.8));

            vec3 wingCol = mix(uMainColor, uEdgeColor, rim * 0.88 + veins * 0.28);
            wingCol = mix(wingCol, uSpotColor, spotBand * 0.75);
            if (uGlowStrength > 0.01) {
              float coreLum = (1.0 - rim * 0.65) + spotBand * 0.45;
              wingCol += uMainColor * (uGlowStrength * coreLum * 0.75);
            }
            vec3 finalCol = mix(wingCol, vec3(0.11, 0.1, 0.11), bodyMask);

            float alpha = max(wingGap * step(wingShape, 0.42), bodyMask) * uOpacity * 0.96;
            if (alpha < 0.04) discard;
            gl_FragColor = vec4(finalCol, alpha);
          }
        `,
      })
    );

    const mesh = new THREE.Mesh(bflyGeo, mat);
    const homeIdx = i % anchors.length;
    const origin = isGlowingBlue ? glowingSpawnSpots[glowingIdx % glowingSpawnSpots.length] : anchors[homeIdx];
    const startPos = isGlowingBlue
      ? origin.clone()
      : origin
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 4, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 4));
    mesh.position.copy(startPos);
    mesh.scale.setScalar(isGlowingBlue ? 1.28 : 0.85 + Math.random() * 0.45);
    group.add(mesh);

    let halo: THREE.Sprite | undefined;
    let haloMat: THREE.SpriteMaterial | undefined;
    if (isGlowingBlue) {
      haloMat = trackMat(
        new THREE.SpriteMaterial({
          map: textures.softGlow,
          color: 0x4ce2ff,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo = new THREE.Sprite(haloMat);
      halo.position.copy(startPos);
      halo.scale.set(0.88, 0.88, 0.88);
      group.add(halo);
    }

    butterflies.push({
      mesh,
      mat,
      halo,
      haloMat,
      isGlowingBlue,
      pos: startPos,
      target: origin.clone().add(new THREE.Vector3(0, 0.45, 0)),
      speed: isGlowingBlue ? 1.35 + glowingIdx * 0.22 : 1.4 + Math.random() * 0.72,
      yaw: Math.random() * Math.PI * 2,
      roll: 0,
      restTimer: Math.random() * 3.5,
      curiousTimer: 0,
      resting: false,
      phase: Math.random() * Math.PI * 2,
      homeFlowerIdx: homeIdx,
    });
    butterflyPositions.push(startPos);
  }

  let nextCameraVisitAt = 5.5;

  // =========================================================================
  // 2. Graceful Soaring White Egrets (白鹭) with Articulated 2-Joint Cambered Wings
  // =========================================================================
  const buildCamberedWingSegment = (
    span: number,
    rootChord: number,
    tipChord: number,
    sweepBack: number,
    camber: number,
    isOuter: boolean
  ): THREE.BufferGeometry => {
    const segsX = 6;
    const segsZ = 3;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let ix = 0; ix <= segsX; ix++) {
      const u = ix / segsX; // 0 = root/wrist, 1 = wrist/wingtip
      const x = u * span;
      // Smoothly tapered airfoil chord, tapering to feathered wingtip on outer segment
      const tipTaper = isOuter ? Math.pow(1 - u, 0.72) : 1 - u * 0.24;
      const chord = THREE.MathUtils.lerp(rootChord, tipChord, u) * (isOuter ? Math.max(0.12, tipTaper) : 1.0);
      const zCenter = -sweepBack * Math.pow(u, isOuter ? 1.35 : 1.15);
      // Slight graceful arch along wingspan
      const archY = isOuter ? -Math.pow(u, 1.8) * 0.045 : Math.sin(u * Math.PI * 0.65) * 0.032;

      for (let iz = 0; iz <= segsZ; iz++) {
        const v = iz / segsZ; // 0 = leading edge (+z), 1 = trailing edge (-z)
        const z = zCenter + (0.5 - v) * chord;
        // Airfoil camber dome + slight trailing-edge feather notch wave on outer primaries
        const notch = isOuter && iz === segsZ && u > 0.35 ? Math.sin(u * Math.PI * 5) * 0.02 : 0;
        const y = archY + Math.sin(v * Math.PI) * camber * (1 - u * 0.45);
        positions.push(x, y, z - notch);
        uvs.push(u, v);
      }
    }

    const row = segsZ + 1;
    for (let ix = 0; ix < segsX; ix++) {
      for (let iz = 0; iz < segsZ; iz++) {
        const a = ix * row + iz;
        const b = (ix + 1) * row + iz;
        const c = (ix + 1) * row + (iz + 1);
        const d = ix * row + (iz + 1);
        indices.push(a, d, b, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  // Sculpted anatomical bird geometries (forward along +Z)
  const egretTorsoGeo = trackGeo(new THREE.SphereGeometry(0.088, 12, 8));
  egretTorsoGeo.scale(0.86, 0.72, 2.35);

  const egretNeckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.16),
    new THREE.Vector3(0, 0.065, 0.25),
    new THREE.Vector3(0, 0.035, 0.32),
    new THREE.Vector3(0, 0.072, 0.41),
  ]);
  const egretNeckGeo = trackGeo(new THREE.TubeGeometry(egretNeckCurve, 8, 0.024, 6, false));

  const egretHeadGeo = trackGeo(new THREE.SphereGeometry(0.036, 8, 7));
  egretHeadGeo.scale(0.85, 0.82, 1.32);
  egretHeadGeo.translate(0, 0.078, 0.44);

  const egretBeakGeo = trackGeo(new THREE.ConeGeometry(0.012, 0.11, 5));
  egretBeakGeo.rotateX(Math.PI / 2);
  egretBeakGeo.translate(0, 0.074, 0.535);

  const egretTailGeo = trackGeo(new THREE.PlaneGeometry(0.18, 0.22, 2, 1));
  egretTailGeo.rotateX(-Math.PI / 2);
  {
    const tp = egretTailGeo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < tp.count; k++) {
      const z = tp.getZ(k);
      if (z > 0) tp.setX(k, tp.getX(k) * 0.32); // narrow at tail root, fanned at back (-z)
    }
    egretTailGeo.translate(0, 0.01, -0.26);
    egretTailGeo.computeVertexNormals();
  }

  const egretLegGeo = trackGeo(new THREE.CylinderGeometry(0.005, 0.004, 0.34, 4));
  egretLegGeo.rotateX(Math.PI / 2);

  const innerWingSpan = 0.46;
  const outerWingSpan = 0.56;
  const innerWingGeo = buildCamberedWingSegment(innerWingSpan, 0.25, 0.21, 0.06, 0.032, false);
  const outerWingGeo = buildCamberedWingSegment(outerWingSpan, 0.21, 0.055, 0.16, 0.02, true);

  const egretPlumageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6f4ee,
      emissive: 0x262930,
      emissiveIntensity: 0.12,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  const egretPrimaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8dfe8,
      emissive: 0x1d232b,
      emissiveIntensity: 0.1,
      roughness: 0.65,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  const egretBeakMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd99b38,
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  const egretLegMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4046,
      roughness: 0.72,
      metalness: 0.04,
    })
  );

  const birds: BirdAgent[] = [];
  const egretCount = Math.min(Math.max(4, quality.birdCount), 7);
  for (let i = 0; i < egretCount; i++) {
    const bGroup = new THREE.Group();
    const bodyPivot = new THREE.Group();
    bGroup.add(bodyPivot);

    const torso = new THREE.Mesh(egretTorsoGeo, egretPlumageMat);
    const neck = new THREE.Mesh(egretNeckGeo, egretPlumageMat);
    const head = new THREE.Mesh(egretHeadGeo, egretPlumageMat);
    const beak = new THREE.Mesh(egretBeakGeo, egretBeakMat);
    const tail = new THREE.Mesh(egretTailGeo, egretPlumageMat);

    const leftLeg = new THREE.Mesh(egretLegGeo, egretLegMat);
    leftLeg.position.set(0.026, -0.024, -0.34);
    const rightLeg = new THREE.Mesh(egretLegGeo, egretLegMat);
    rightLeg.position.set(-0.026, -0.024, -0.34);

    // Left 2-joint wing (+X side)
    const leftInnerWing = new THREE.Group();
    leftInnerWing.position.set(0.055, 0.028, 0.04);
    leftInnerWing.add(new THREE.Mesh(innerWingGeo, egretPlumageMat));

    const leftOuterWing = new THREE.Group();
    leftOuterWing.position.set(innerWingSpan, 0.008, -0.06);
    leftOuterWing.add(new THREE.Mesh(outerWingGeo, egretPrimaryMat));
    leftInnerWing.add(leftOuterWing);

    // Right 2-joint wing (-X side mirrored cleanly)
    const rightInnerWing = new THREE.Group();
    rightInnerWing.position.set(-0.055, 0.028, 0.04);
    const rInnerMesh = new THREE.Mesh(innerWingGeo, egretPlumageMat);
    rInnerMesh.scale.x = -1;
    rightInnerWing.add(rInnerMesh);

    const rightOuterWing = new THREE.Group();
    rightOuterWing.position.set(-innerWingSpan, 0.008, -0.06);
    const rOuterMesh = new THREE.Mesh(outerWingGeo, egretPrimaryMat);
    rOuterMesh.scale.x = -1;
    rightOuterWing.add(rOuterMesh);
    rightInnerWing.add(rightOuterWing);

    bodyPivot.add(torso, neck, head, beak, tail, leftLeg, rightLeg, leftInnerWing, rightInnerWing);
    const sc = 0.88 + (i % 3) * 0.14;
    bodyPivot.scale.setScalar(sc);
    group.add(bGroup);

    birds.push({
      group: bGroup,
      bodyPivot,
      leftInnerWing,
      leftOuterWing,
      rightInnerWing,
      rightOuterWing,
      center: new THREE.Vector3(
        (i % 2 === 0 ? -1 : 1) * (4 + i * 1.4),
        14.2 + (i % 4) * 1.8,
        -10 + (i - egretCount * 0.5) * 3.8
      ),
      rx: 17 + i * 3.4,
      rz: 13 + i * 2.6,
      alt: 13.5 + (i % 4) * 2.1,
      omega: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.028),
      angle: (i / Math.max(1, egretCount)) * Math.PI * 2,
      flapPhase: i * 1.37 + Math.random() * 1.5,
      glideOffset: i * 2.1,
      scale: sc,
    });
  }

  // =========================================================================
  // 3. Nighttime Bioluminescent Fireflies (Gentle organic pulse glow)
  // =========================================================================
  const ffCount = quality.fireflyCount;
  const ffGeo = trackGeo(new THREE.BufferGeometry());
  const ffHome = new Float32Array(ffCount * 3);
  const ffPositions = new Float32Array(ffCount * 3);
  const ffSeeds = new Float32Array(ffCount * 4);

  for (let i = 0; i < ffCount; i++) {
    const spot = anchors[i % anchors.length];
    const x = spot.x + (Math.random() - 0.5) * 11;
    const z = spot.z + (Math.random() - 0.5) * 11;
    const groundY = Math.max(0.05, terrainHeightAt(x, z));
    const y = groundY + 0.4 + Math.random() * 2.7;

    ffHome[i * 3] = x;
    ffHome[i * 3 + 1] = y;
    ffHome[i * 3 + 2] = z;

    ffPositions[i * 3] = x;
    ffPositions[i * 3 + 1] = y;
    ffPositions[i * 3 + 2] = z;

    ffSeeds[i * 4] = Math.random() * Math.PI * 2; // phase
    ffSeeds[i * 4 + 1] = 0.52 + Math.random() * 0.95; // pulse rate
    ffSeeds[i * 4 + 2] = 0.72 + Math.random() * 0.72; // size mult
    ffSeeds[i * 4 + 3] = Math.random(); // warm amber <-> pale chartreuse hue blend
  }

  const ffPosAttr = new THREE.BufferAttribute(ffPositions, 3);
  ffGeo.setAttribute('position', ffPosAttr);
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeeds, 4));

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
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uVisibility;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vHue;
        void main() {
          // Organic slow double-wave emergence + gentle fade out between blinks
          float waveA = 0.5 + 0.5 * sin(uTime * aSeed.y * 1.9 + aSeed.x);
          float waveB = 0.5 + 0.5 * cos(uTime * aSeed.y * 0.65 + aSeed.x * 1.7);
          float pulse = pow(waveA, 3.0) * (0.35 + 0.65 * waveB);
          vAlpha = (0.06 + 0.94 * pulse) * uVisibility;
          vHue = aSeed.w;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float sz = mix(14.0, 28.0, pulse) * aSeed.z * uPixelRatio;
          gl_PointSize = clamp(sz / max(1.0, -mvPosition.z), 2.0, 26.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vHue;
        void main() {
          if (vAlpha < 0.01) discard;
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 greenGold = vec3(0.74, 0.94, 0.36);
          vec3 warmAmber = vec3(1.0, 0.84, 0.38);
          vec3 baseHue = mix(greenGold, warmAmber, vHue);
          vec3 col = mix(baseHue, vec3(1.0, 0.98, 0.82), smoothstep(0.55, 0.95, tex.a));
          gl_FragColor = vec4(col, tex.a * vAlpha * 0.92);
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
  const tmpWind = new THREE.Vector3();
  const tmpCamSpot = new THREE.Vector3();
  const tmpSide = new THREE.Vector3();

  const update = (
    elapsed: number,
    dt: number,
    dayFactor: number,
    nightFactor: number,
    eveningFactor: number,
    rainIntensity: number,
    windStrength: number,
    pointerWorld: THREE.Vector3,
    pointerActive: number,
    cameraPos?: THREE.Vector3,
    cameraForward?: THREE.Vector3
  ) => {
    // 1. Update butterflies (active during daytime/dawn/dusk when rain is low)
    const bflyVis = THREE.MathUtils.clamp(
      (dayFactor * 1.15 + 0.16 - nightFactor * 0.88) * (1 - rainIntensity * 0.92),
      0,
      1
    );

    // Periodic camera-curiosity fly-by: pick one nearby butterfly to float past the camera view
    if (
      cameraPos &&
      cameraForward &&
      bflyVis > 0.45 &&
      butterflies.length > 0 &&
      elapsed >= nextCameraVisitAt
    ) {
      nextCameraVisitAt = elapsed + 11 + Math.random() * 8;
      // Choose the butterfly closest to camera for a natural organic approach
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < butterflies.length; i++) {
        const d = butterflies[i].pos.distanceToSquared(cameraPos);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      butterflies[bestIdx].curiousTimer = 4.2;
      butterflies[bestIdx].resting = false;
    }

    for (const b of butterflies) {
      const activeVis = b.isGlowingBlue
        ? Math.max(0.74, bflyVis) * (1 - rainIntensity * 0.85)
        : bflyVis;
      b.mesh.visible = activeVis > 0.04;
      if (b.halo) b.halo.visible = b.mesh.visible;
      if (!b.mesh.visible) continue;

      b.mat.uniforms.uTime.value = elapsed + b.phase;
      b.mat.uniforms.uOpacity.value = activeVis;

      // Scatter gently if user sweeps pointer close
      const distPtr = b.pos.distanceTo(pointerWorld);
      if (pointerActive > 0.25 && distPtr < 3.0) {
        b.resting = false;
        b.curiousTimer = 0;
        b.restTimer = 0;
        tmpDir.copy(b.pos).sub(pointerWorld).setY(0.7).normalize();
        b.target.copy(b.pos).addScaledVector(tmpDir, 2.8);
      }

      // Camera-curiosity fly-by target
      if (b.curiousTimer > 0 && cameraPos && cameraForward) {
        b.curiousTimer -= dt;
        tmpSide.set(-cameraForward.z, 0, cameraForward.x).normalize();
        const swayX = Math.sin(elapsed * 1.45 + b.phase) * 0.95;
        const swayY = Math.cos(elapsed * 1.9 + b.phase) * 0.35 - 0.18;
        tmpCamSpot
          .copy(cameraPos)
          .addScaledVector(cameraForward, 2.75)
          .addScaledVector(tmpSide, swayX);
        tmpCamSpot.y += swayY;
        const minGround = terrainHeightAt(tmpCamSpot.x, tmpCamSpot.z) + 0.55;
        if (tmpCamSpot.y < minGround) tmpCamSpot.y = minGround;
        b.target.copy(tmpCamSpot);
      }

      if (b.resting) {
        b.restTimer -= dt;
        b.mat.uniforms.uFlapAmp.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapAmp.value, 0.2, 6, dt);
        b.mat.uniforms.uFlapFreq.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapFreq.value, 3.0, 6, dt);
        b.roll = THREE.MathUtils.damp(b.roll, 0, 5, dt);
        if (b.restTimer <= 0) {
          b.resting = false;
          const nextIdx = (b.homeFlowerIdx + 1 + Math.floor(Math.random() * 4)) % anchors.length;
          b.homeFlowerIdx = nextIdx;
          b.target
            .copy(anchors[nextIdx])
            .add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 0.4 + Math.random() * 1.5, (Math.random() - 0.5) * 3.5));
        }
      } else {
        b.mat.uniforms.uFlapAmp.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapAmp.value, 1.0, 7, dt);
        b.mat.uniforms.uFlapFreq.value = THREE.MathUtils.damp(b.mat.uniforms.uFlapFreq.value, 14.2, 7, dt);

        tmpDir.copy(b.target).sub(b.pos);
        const distT = tmpDir.length();
        if (distT < 0.34 && b.curiousTimer <= 0) {
          if (Math.random() > 0.45) {
            b.resting = true;
            b.restTimer = 1.6 + Math.random() * 2.8;
          } else {
            const nextIdx = (b.homeFlowerIdx + 1 + Math.floor(Math.random() * 5)) % anchors.length;
            b.homeFlowerIdx = nextIdx;
            b.target
              .copy(anchors[nextIdx])
              .add(new THREE.Vector3((Math.random() - 0.5) * 4.5, 0.5 + Math.random() * 1.6, (Math.random() - 0.5) * 4.5));
          }
        } else if (distT > 0.02) {
          tmpDir.normalize();
          sampleWindField(b.pos.x, b.pos.y, b.pos.z, elapsed, windStrength, tmpWind);
          const flutter = Math.sin(elapsed * 4.8 + b.phase) * 0.36;
          const flySpeed = b.curiousTimer > 0 ? Math.min(2.6, b.speed * 1.45) : b.speed;
          b.pos.addScaledVector(tmpDir, flySpeed * dt);
          b.pos.y += flutter * dt;
          b.pos.addScaledVector(tmpWind, 0.14 * dt);

          const desiredYaw = Math.atan2(tmpDir.x, tmpDir.z);
          const prevYaw = b.yaw;
          b.yaw = lerpAngle(b.yaw, desiredYaw, Math.min(1, dt * 6.5));
          const turnRate = THREE.MathUtils.clamp((b.yaw - prevYaw) * 14, -0.45, 0.45);
          b.roll = THREE.MathUtils.damp(b.roll, -turnRate, 6, dt);
        }
      }

      const groundFloor = Math.max(0.25, terrainHeightAt(b.pos.x, b.pos.z) + 0.28);
      if (b.pos.y < groundFloor) b.pos.y = groundFloor;
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.set(0, b.yaw, b.roll);

      if (b.halo && b.haloMat) {
        b.halo.position.copy(b.pos);
        const pulse = 0.72 + 0.28 * Math.sin(elapsed * 4.5 + b.phase);
        const nightBoost = THREE.MathUtils.lerp(0.65, 1.0, nightFactor);
        b.haloMat.opacity = activeVis * pulse * nightBoost * 0.78;
        const sc = 0.78 + 0.24 * pulse;
        b.halo.scale.set(sc, sc, sc);
      }
    }

    // 2. Update graceful soaring White Egrets across valley sky
    const birdVis = THREE.MathUtils.clamp((dayFactor * 1.15 + 0.22 - nightFactor * 0.92) * (1 - rainIntensity * 0.85), 0, 1);
    for (const bird of birds) {
      bird.group.visible = birdVis > 0.05;
      if (!bird.group.visible) continue;

      bird.angle += bird.omega * dt * (1 + windStrength * 0.18);
      const bx = bird.center.x + Math.cos(bird.angle) * bird.rx;
      const bz = bird.center.z + Math.sin(bird.angle) * bird.rz;
      const by = bird.alt + Math.sin(bird.angle * 1.5 + bird.flapPhase) * 1.35;

      const step = bird.omega >= 0 ? 0.045 : -0.045;
      const nx = bird.center.x + Math.cos(bird.angle + step) * bird.rx;
      const nz = bird.center.z + Math.sin(bird.angle + step) * bird.rz;
      const ny = bird.alt + Math.sin((bird.angle + step) * 1.5 + bird.flapPhase) * 1.35;

      bird.group.position.set(bx, by, bz);
      bird.group.lookAt(nx, ny, nz);

      // Gentle inward bank angle during curved soaring path
      const bankSign = bird.omega >= 0 ? -1 : 1;
      bird.bodyPivot.rotation.z = bankSign * 0.24 + Math.sin(elapsed * 0.7 + bird.glideOffset) * 0.05;

      // Natural soaring rhythm: ~70% effortless thermal glide, ~30% slow measured 2-joint wingbeats (~3.2 rad/s)
      const cycle = Math.sin(elapsed * 0.36 + bird.glideOffset);
      const flapBlend = THREE.MathUtils.smoothstep(cycle, 0.28, 0.72);
      const beatPhase = elapsed * 3.25 + bird.flapPhase;
      const innerBeat = Math.sin(beatPhase) * 0.34;
      const outerBeat = Math.sin(beatPhase - 0.62) * 0.44; // realistic wrist-joint lag

      // Subtle serene dihedral angle during glide
      const glideInner = 0.09 + Math.sin(elapsed * 1.1 + bird.flapPhase) * 0.025;
      const glideOuter = -0.06 + Math.sin(elapsed * 1.1 + bird.flapPhase) * 0.02;

      const innerAngle = THREE.MathUtils.lerp(glideInner, innerBeat, flapBlend);
      const outerAngle = THREE.MathUtils.lerp(glideOuter, outerBeat, flapBlend);

      bird.leftInnerWing.rotation.z = innerAngle;
      bird.leftOuterWing.rotation.z = outerAngle;
      bird.rightInnerWing.rotation.z = -innerAngle;
      bird.rightOuterWing.rotation.z = -outerAngle;

      // Subtle aerodynamic body bob during wingbeats
      bird.bodyPivot.position.y = -Math.sin(beatPhase) * 0.035 * flapBlend;
    }

    // 3. Update Fireflies at dusk / evening / night
    const ffVis = THREE.MathUtils.clamp((nightFactor * 1.15 + eveningFactor * 0.78) * (1 - rainIntensity * 0.82), 0, 1);
    ffUniforms.uTime.value = elapsed;
    ffUniforms.uVisibility.value = ffVis;
    fireflies.visible = ffVis > 0.02;

    if (fireflies.visible) {
      for (let i = 0; i < ffCount; i++) {
        const hx = ffHome[i * 3];
        const hy = ffHome[i * 3 + 1];
        const hz = ffHome[i * 3 + 2];
        const ph = ffSeeds[i * 4];

        let fx = hx + Math.sin(elapsed * 0.55 + ph) * 1.45 + Math.cos(elapsed * 0.31 + ph * 2.1) * 0.7;
        let fy = hy + Math.sin(elapsed * 0.82 + ph * 1.7) * 0.48;
        let fz = hz + Math.cos(elapsed * 0.48 + ph * 1.3) * 1.45;

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
    butterflyPositions,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
