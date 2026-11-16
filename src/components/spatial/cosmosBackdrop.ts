import * as THREE from 'three';

export interface CosmosBackdropHandle {
  group: THREE.Group;
  update: (elapsed: number, dt: number, pointerX: number, pointerY: number) => void;
  dispose: () => void;
}

export interface CosmosTierOptions {
  isSoftwareGl: boolean;
  reducedMotion: boolean;
  isTouch: boolean;
  pixelRatio: number;
}

const GLSL_NOISE_3D = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm5(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise3(p);
    p = p * 2.04 + vec3(13.7, 7.1, 19.3);
    amp *= 0.5;
  }
  return sum;
}

float fbm6(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    sum += amp * vnoise3(p);
    p = p * 2.02 + vec3(9.2, 17.4, 5.8);
    amp *= 0.5;
  }
  return sum;
}
`;

function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Pure High-Contrast Deep Space + Photorealistic Hero Planet & Lunar Horizon.
 * - Pure obsidian black void (#010206) with crisp pinpoint stars (zero muddy purple/blue fog)
 * - Photorealistic 3D FBM terrestrial Blue-Marble planet with Rayleigh azure rim, clouds, & night city lights
 * - Crisp cratered silver companion moon for balanced orbital depth
 */
export function createCosmosBackdrop(opts: CosmosTierOptions): CosmosBackdropHandle {
  const { isSoftwareGl, reducedMotion, isTouch, pixelRatio } = opts;
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

  const rand = createRng(20260402);

  // Crisp top-right orbital sunlight vector producing a dramatic 3D crescent/terminator on the planet
  const sunDir = new THREE.Vector3(0.74, 0.36, 0.57).normalize();

  // ------------------------------------------------------------------
  // 1. Pure Deep-Space Sky Dome (velvet obsidian black with ultra-subtle cool starlight gradient)
  // ------------------------------------------------------------------
  const skyGeo = trackGeo(new THREE.SphereGeometry(140, 24, 16));
  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          // Ultra-clean obsidian deep space void with barely perceptible cool horizon depth
          float band = exp(-pow(d.y * 0.8 + d.x * 0.35, 2.0) * 6.0);
          vec3 col = mix(vec3(0.004, 0.006, 0.014), vec3(0.012, 0.022, 0.044), band * 0.45);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // ------------------------------------------------------------------
  // 2. Pinpoint Astronomical Starfield on Pure Black Void
  // ------------------------------------------------------------------
  const starCount = isSoftwareGl ? 700 : isTouch ? 1800 : 3200;
  const starPos = new Float32Array(starCount * 3);
  const starMeta = new Float32Array(starCount * 4);
  const starLayer = new Float32Array(starCount * 2);

  const starPalette = [
    [0.76, 0.88, 1.0], // pale ice-blue
    [0.96, 0.98, 1.0], // crisp starlight white
    [1.0, 0.96, 0.88], // warm ivory
    [1.0, 0.88, 0.72], // subtle amber
  ];

  for (let i = 0; i < starCount; i++) {
    const r = 34 + rand() * 88;
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);

    starPos[i * 3] = r * s * Math.cos(phi);
    starPos[i * 3 + 1] = r * u;
    starPos[i * 3 + 2] = r * s * Math.sin(phi);

    const c = starPalette[Math.floor(rand() * starPalette.length)];
    const mag = 0.35 + Math.pow(rand(), 2.35) * 3.1;

    starMeta[i * 4] = c[0];
    starMeta[i * 4 + 1] = c[1];
    starMeta[i * 4 + 2] = c[2];
    starMeta[i * 4 + 3] = mag;

    starLayer[i * 2] = r < 52 ? 0.8 : r < 82 ? 0.45 : 0.18;
    starLayer[i * 2 + 1] = 0.6 + rand() * 1.3;
  }

  const starGeo = trackGeo(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aMeta', new THREE.BufferAttribute(starMeta, 4));
  starGeo.setAttribute('aLayer', new THREE.BufferAttribute(starLayer, 2));

  const starUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(pixelRatio, 1.75) },
    uParallax: { value: new THREE.Vector2(0, 0) },
  };
  const starMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aMeta;
        attribute vec2 aLayer;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec2 uParallax;

        varying vec3 vCol;
        varying float vAlpha;

        void main() {
          vec3 pos = position;
          pos.x -= uParallax.x * aLayer.x * 1.1;
          pos.y -= uParallax.y * aLayer.x * 0.8;

          float bright = pow(2.1, -aMeta.w);
          float phase = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
          float twinkle = 0.84 + 0.16 * sin(uTime * aLayer.y + phase);

          vCol = aMeta.rgb;
          vAlpha = clamp(bright * twinkle * 0.96, 0.08, 0.96);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = clamp((1.1 + bright * 2.7) * uPixelRatio, 1.0, 4.8);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vCol;
        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float core = exp(-d * d * 26.0);
          gl_FragColor = vec4(vCol, core * vAlpha);
        }
      `,
    })
  );
  const starPoints = new THREE.Points(starGeo, starMat);
  starPoints.frustumCulled = false;
  group.add(starPoints);

  // ------------------------------------------------------------------
  // 3. Monumental Photorealistic Blue-Marble Planet (Orbital Horizon View)
  //    Clean sapphire ocean, 3D FBM terrain relief, clouds, night city lights, & crisp Rayleigh blue rim
  // ------------------------------------------------------------------
  const planetGroup = new THREE.Group();
  planetGroup.position.set(4.95, -2.55, -14.2);
  planetGroup.rotation.z = -0.24;
  planetGroup.rotation.x = 0.14;

  const planetRadius = 4.65;
  const planetUniforms = {
    uTime: { value: 0 },
    uSunWorldDir: { value: sunDir.clone() },
  };
  const planetGeo = trackGeo(
    new THREE.SphereGeometry(planetRadius, isSoftwareGl ? 36 : 80, isSoftwareGl ? 24 : 56)
  );
  const planetMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: planetUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vObjPos;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vObjPos = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uSunWorldDir;
        varying vec3 vObjPos;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        ${GLSL_NOISE_3D}

        float continentHeight(vec3 p) {
          float warp = fbm5(p * 1.85 + vec3(2.4, 0.8, 1.1));
          return fbm6(p * 2.35 + vec3(warp * 0.92));
        }

        void main() {
          vec3 p = normalize(vObjPos);
          vec3 N = normalize(vWorldNormal);
          vec3 L = normalize(uSunWorldDir);
          vec3 V = normalize(cameraPosition - vWorldPos);

          float h = continentHeight(p);
          float seaLevel = 0.505;
          float isLand = smoothstep(seaLevel - 0.005, seaLevel + 0.007, h);

          // Crisp tangent mountain relief
          float eps = 0.014;
          float hx = continentHeight(normalize(p + vec3(eps, 0.0, 0.0)));
          float hy = continentHeight(normalize(p + vec3(0.0, eps, 0.0)));
          vec3 bumpN = normalize(N + vec3(h - hx, h - hy, 0.0) * (isLand * 17.5));

          // Pure deep sapphire ocean & turquoise coastal shelves
          float shallow = smoothstep(seaLevel - 0.085, seaLevel, h);
          vec3 deepOcean = vec3(0.012, 0.068, 0.195);
          vec3 coastalOcean = vec3(0.032, 0.255, 0.42);
          vec3 oceanCol = mix(deepOcean, coastalOcean, shallow);

          // Land biomes: emerald forest -> arid plateau -> alpine rock -> polar snow
          float elev = clamp((h - seaLevel) / 0.24, 0.0, 1.0);
          float lat = abs(p.y);
          float moisture = vnoise3(p * 4.4 + vec3(3.1));
          vec3 forest = vec3(0.09, 0.24, 0.13);
          vec3 desert = vec3(0.55, 0.44, 0.30);
          vec3 alpine = vec3(0.32, 0.31, 0.30);
          vec3 snow = vec3(0.92, 0.95, 0.99);

          vec3 landCol = mix(desert, forest, smoothstep(0.32, 0.68, moisture));
          landCol = mix(landCol, alpine, smoothstep(0.42, 0.80, elev));
          float polarIce = smoothstep(0.76, 0.90, lat + (vnoise3(p * 8.5) - 0.5) * 0.12);
          landCol = mix(landCol, snow, max(polarIce, smoothstep(0.76, 0.95, elev)));
          oceanCol = mix(oceanCol, snow, polarIce * 0.94);

          vec3 surfAlbedo = mix(oceanCol, landCol, isLand);

          // Drifting multi-scale atmospheric cloud swirls
          vec3 cloudP = vec3(p.x + uTime * 0.0055, p.y * 1.08, p.z);
          float cloudSwirl = fbm5(cloudP * 2.1 + vec3(1.7));
          float clouds = smoothstep(0.50, 0.77, fbm5(cloudP * 4.1 + vec3(cloudSwirl * 0.95)));

          float ndotl = dot(bumpN, L);
          float diff = max(ndotl, 0.0);
          float sunEnvelope = smoothstep(-0.08, 0.22, dot(N, L));

          // Specular ocean glint
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 56.0) * (1.0 - isLand) * (1.0 - clouds) * 0.65;

          // Subtle night-side golden city-light clusters on coastal lowlands
          float nightMask = smoothstep(0.08, -0.22, dot(N, L));
          float coastalBand = isLand * (1.0 - smoothstep(0.02, 0.35, elev)) * (1.0 - polarIce);
          float cityMacro = smoothstep(0.58, 0.78, vnoise3(p * 12.0 + vec3(1.9)));
          float cityPoints = smoothstep(0.76, 0.94, vnoise3(p * 68.0));
          vec3 cityLights = vec3(1.0, 0.78, 0.44) * cityPoints * cityMacro * coastalBand * nightMask * (1.0 - clouds * 0.75) * 0.55;

          // Day lighting + crisp azure atmospheric rim
          float rim = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.6);
          float twilight = smoothstep(-0.24, 0.35, dot(N, L));
          vec3 atmoCol = mix(vec3(0.24, 0.58, 1.0), vec3(0.58, 0.84, 1.0), twilight);

          vec3 lit = surfAlbedo * (0.015 + diff * (1.0 - clouds * 0.52) * 1.08) + vec3(spec) * sunEnvelope;
          lit = mix(lit, vec3(0.95, 0.97, 1.0) * (0.025 + max(dot(N, L), 0.0) * 1.02), clouds * 0.84);
          lit += cityLights;
          lit += atmoCol * rim * twilight * 0.62;

          gl_FragColor = vec4(lit, 1.0);
        }
      `,
    })
  );
  const planetMesh = new THREE.Mesh(planetGeo, planetMat);
  planetGroup.add(planetMesh);

  // Outer Razor-Clean Rayleigh Atmospheric Halo on sunlit limb
  const atmoGeo = trackGeo(
    new THREE.SphereGeometry(planetRadius * 1.038, isSoftwareGl ? 32 : 64, isSoftwareGl ? 24 : 44)
  );
  const atmoMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: { uSunWorldDir: { value: sunDir.clone() } },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uSunWorldDir;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float rim = pow(clamp(0.56 - dot(-N, V), 0.0, 1.0), 3.4);
          float sunMask = smoothstep(-0.24, 0.58, dot(N, normalize(uSunWorldDir)));
          vec3 azure = vec3(0.24, 0.60, 1.0);
          gl_FragColor = vec4(azure, rim * sunMask * 0.55);
        }
      `,
    })
  );
  planetGroup.add(new THREE.Mesh(atmoGeo, atmoMat));
  group.add(planetGroup);

  // ------------------------------------------------------------------
  // 4. Distant Crisp Cratered Silver Moon (upper-left balance)
  // ------------------------------------------------------------------
  const moonGeo = trackGeo(new THREE.SphereGeometry(0.76, isSoftwareGl ? 24 : 48, isSoftwareGl ? 18 : 36));
  const moonMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: { uSunWorldDir: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `
        varying vec3 vObjPos;
        varying vec3 vWorldNormal;
        void main() {
          vObjPos = normalize(position);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uSunWorldDir;
        varying vec3 vObjPos;
        varying vec3 vWorldNormal;
        ${GLSL_NOISE_3D}
        void main() {
          vec3 p = normalize(vObjPos);
          float maria = smoothstep(0.45, 0.68, fbm5(p * 3.2 + vec3(1.1)));
          float craters = abs(vnoise3(p * 18.0) - 0.5) * 2.0;
          float micro = vnoise3(p * 42.0);
          vec3 nPerturb = normalize(vWorldNormal + vec3(craters - 0.5, micro - 0.5, 0.0) * 0.16);
          float diff = max(dot(nPerturb, normalize(uSunWorldDir)), 0.025);
          vec3 col = mix(vec3(0.62, 0.65, 0.70), vec3(0.28, 0.31, 0.35), maria);
          col *= (0.86 + craters * 0.22);
          gl_FragColor = vec4(col * diff, 1.0);
        }
      `,
    })
  );
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.position.set(-5.8, 2.75, -19.5);
  group.add(moonMesh);

  let dampedPx = 0;
  let dampedPy = 0;

  const update = (elapsed: number, dt: number, pointerX: number, pointerY: number) => {
    planetUniforms.uTime.value = elapsed;
    starUniforms.uTime.value = elapsed;

    if (!reducedMotion && !isSoftwareGl) {
      dampedPx = THREE.MathUtils.damp(dampedPx, pointerX, 3.2, dt);
      dampedPy = THREE.MathUtils.damp(dampedPy, pointerY, 3.2, dt);

      starUniforms.uParallax.value.set(dampedPx, dampedPy);
      planetMesh.rotation.y += dt * 0.024;
      moonMesh.rotation.y += dt * 0.015;

      planetGroup.position.x = 4.95 - dampedPx * 0.42;
      planetGroup.position.y = -2.55 - dampedPy * 0.28;
      moonMesh.position.x = -5.8 - dampedPx * 0.28;
      moonMesh.position.y = 2.75 - dampedPy * 0.2;
    }
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };

  return { group, update, dispose };
}
