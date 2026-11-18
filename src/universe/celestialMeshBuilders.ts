import * as THREE from 'three';
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  createPhotorealEarthMaterial,
  createPhotorealMoonMaterial,
  earthCloudFragmentShader,
  earthCloudVertexShader,
  innerAtmosphereFragmentShader,
  innerAtmosphereVertexShader,
} from '../components/globe/earthShaders.ts';
import {
  createRealisticEarthBumpTexture,
  createRealisticEarthDayTexture,
  createRealisticEarthNightTexture,
  createRealisticEarthRoughnessTexture,
  createSubtleEarthCloudTexture,
} from '../components/globe/proceduralEarthTextures.ts';
import { createCelestialTexture } from './proceduralPlanets.ts';

function createSolidTexture(hex: number, srgb = false): THREE.DataTexture {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Loads a local high-res NASA texture while preserving a valid instant fallback image
 * on frame 0 so meshes never render black/blank or hit 404 errors if offline.
 */
export function loadPlanetTexture(
  url: string,
  fallbackTex: THREE.Texture,
  options: { srgb?: boolean; anisotropy?: number } = {}
): { texture: THREE.Texture; dispose: () => void } {
  const { srgb = false, anisotropy = 4 } = options;
  const tex = new THREE.Texture();
  tex.image = fallbackTex.image;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;

  let disposed = false;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (disposed) return;
    tex.image = img;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  };
  img.src = url;

  return {
    texture: tex,
    dispose: () => {
      disposed = true;
      tex.dispose();
    },
  };
}

export interface PhotorealEarthRig {
  group: THREE.Group;
  earthMesh: THREE.Mesh;
  cloudMesh: THREE.Mesh;
  earthMaterial: THREE.MeshStandardMaterial;
  cloudMaterial: THREE.ShaderMaterial;
  syncCloudShadows: (cloudRotationOffsetRad: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  dispose: () => void;
}

export function buildPhotorealEarthRig(options: {
  radius: number;
  segments?: number;
  sunDirection: THREE.Vector3;
  anisotropy?: number;
  cloudOpacity?: number;
  enableCloudShadows?: boolean;
  includeInnerAtmosphere?: boolean;
}): PhotorealEarthRig {
  const {
    radius,
    segments = 96,
    sunDirection,
    anisotropy = 4,
    cloudOpacity = 0.56,
    enableCloudShadows = true,
    includeInnerAtmosphere = true,
  } = options;

  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const fallbackDay = createRealisticEarthDayTexture(512, 256);
  const fallbackNight = createRealisticEarthNightTexture(512, 256);
  const fallbackOcean = createRealisticEarthRoughnessTexture(512, 256);
  const fallbackBump = createRealisticEarthBumpTexture(512, 256);
  const fallbackClouds = createSubtleEarthCloudTexture(512, 256);
  const fallbackNormal = createSolidTexture(0x8080ff, false);
  disposables.push(fallbackNormal);

  const dayLoader = loadPlanetTexture('/assets/earth/earth_day_2048.jpg', fallbackDay, {
    srgb: true,
    anisotropy,
  });
  const nightLoader = loadPlanetTexture('/assets/earth/earth_night_2048.jpg', fallbackNight, {
    srgb: true,
    anisotropy,
  });
  const oceanLoader = loadPlanetTexture('/assets/earth/earth_ocean_2048.jpg', fallbackOcean, {
    srgb: false,
    anisotropy,
  });
  const bumpLoader = loadPlanetTexture('/assets/earth/earth_bump_2048.jpg', fallbackBump, {
    srgb: false,
    anisotropy,
  });
  const normalLoader = loadPlanetTexture('/assets/earth/earth_normal_2048.jpg', fallbackNormal, {
    srgb: false,
    anisotropy,
  });
  const cloudsLoader = loadPlanetTexture('/assets/earth/earth_clouds_2048.jpg', fallbackClouds, {
    srgb: true,
    anisotropy,
  });

  disposables.push(dayLoader, nightLoader, oceanLoader, bumpLoader, normalLoader, cloudsLoader);

  const earthGeo = new THREE.SphereGeometry(radius, segments, segments);
  const earthMaterial = createPhotorealEarthMaterial({
    dayMap: dayLoader.texture,
    nightMap: nightLoader.texture,
    oceanMaskMap: oceanLoader.texture,
    normalMap: normalLoader.texture,
    bumpMap: bumpLoader.texture,
    cloudsMap: cloudsLoader.texture,
    sunDirection,
    enableCloudShadows,
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMaterial);
  group.add(earthMesh);
  disposables.push(earthGeo, earthMaterial);

  // Drifting MODIS cloud layer sphere
  const cloudSegs = Math.max(36, Math.round(segments * 0.75));
  const cloudGeo = new THREE.SphereGeometry(radius * 1.012, cloudSegs, cloudSegs);
  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: earthCloudVertexShader,
    fragmentShader: earthCloudFragmentShader,
    uniforms: {
      uCloudMap: { value: cloudsLoader.texture },
      uSunDirection: { value: sunDirection },
      uCloudOpacity: { value: cloudOpacity },
    },
    transparent: true,
    depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMaterial);
  cloudMesh.renderOrder = 2;
  group.add(cloudMesh);
  disposables.push(cloudGeo, cloudMaterial);

  // Outer volumetric Rayleigh atmosphere halo
  const atmoGeo = new THREE.SphereGeometry(radius * 1.045, cloudSegs, cloudSegs);
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      uSunDirection: { value: sunDirection },
    },
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  atmoMesh.renderOrder = 3;
  group.add(atmoMesh);
  disposables.push(atmoGeo, atmoMat);

  if (includeInnerAtmosphere) {
    const innerGeo = new THREE.SphereGeometry(radius * 1.007, cloudSegs, cloudSegs);
    const innerMat = new THREE.ShaderMaterial({
      vertexShader: innerAtmosphereVertexShader,
      fragmentShader: innerAtmosphereFragmentShader,
      uniforms: {
        uSunDirection: { value: sunDirection },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.renderOrder = 4;
    group.add(innerMesh);
    disposables.push(innerGeo, innerMat);
  }

  return {
    group,
    earthMesh,
    cloudMesh,
    earthMaterial,
    cloudMaterial,
    syncCloudShadows: (cloudRotationOffsetRad: number) => {
      const shader = earthMaterial.userData.shader as
        | { uniforms?: Record<string, { value: unknown }> }
        | undefined;
      if (shader?.uniforms?.uv_xOffset) {
        shader.uniforms.uv_xOffset.value =
          ((cloudRotationOffsetRad / (Math.PI * 2)) % 1 + 1) % 1;
      }
    },
    setSunDirection: (dir: THREE.Vector3) => {
      sunDirection.copy(dir).normalize();
      cloudMaterial.uniforms.uSunDirection.value.copy(sunDirection);
      atmoMat.uniforms.uSunDirection.value.copy(sunDirection);
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export interface PhotorealMoonRig {
  group: THREE.Group;
  moonMesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  setSunDirection: (dir: THREE.Vector3) => void;
  dispose: () => void;
}

export function buildPhotorealMoonRig(options: {
  radius: number;
  segments?: number;
  sunDirection: THREE.Vector3;
  anisotropy?: number;
  enableDisplacement?: boolean;
  displacementScale?: number;
}): PhotorealMoonRig {
  const {
    radius,
    segments = 96,
    sunDirection,
    anisotropy = 4,
    enableDisplacement = false,
    displacementScale = radius * 0.024,
  } = options;

  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const fallbackAlbedo = createCelestialTexture('moon', 512, 256);
  const fallbackNormal = createSolidTexture(0x8080ff, false);
  const fallbackBump = createSolidTexture(0x808080, false);
  disposables.push(fallbackNormal, fallbackBump);

  const albedoLoader = loadPlanetTexture('/assets/moon/moon_albedo_2048.jpg', fallbackAlbedo, {
    srgb: true,
    anisotropy,
  });
  const normalLoader = loadPlanetTexture('/assets/moon/moon_normal_2048.jpg', fallbackNormal, {
    srgb: false,
    anisotropy,
  });
  const bumpLoader = loadPlanetTexture('/assets/moon/moon_bump_2048.jpg', fallbackBump, {
    srgb: false,
    anisotropy,
  });
  disposables.push(albedoLoader, normalLoader, bumpLoader);

  const moonGeo = new THREE.SphereGeometry(radius, segments, segments);
  const moonMat = createPhotorealMoonMaterial({
    albedoMap: albedoLoader.texture,
    normalMap: normalLoader.texture,
    bumpMap: bumpLoader.texture,
    displacementMap: enableDisplacement ? bumpLoader.texture : undefined,
    displacementScale: enableDisplacement ? displacementScale : 0,
    sunDirection,
  });

  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  group.add(moonMesh);
  disposables.push(moonGeo, moonMat);

  // Delicate dusty-exosphere grazing rim (barely perceptible lunar silhouette edge separation)
  const rimGeo = new THREE.SphereGeometry(radius * 1.018, 48, 48);
  const rimMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: sunDirection },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vWN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vWN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      varying vec3 vN;
      varying vec3 vWN;
      varying vec3 vV;
      void main() {
        float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 4.5);
        float sun = mix(0.08, 1.0, smoothstep(-0.2, 0.5, dot(normalize(vWN), normalize(uSunDirection))));
        gl_FragColor = vec4(vec3(0.78, 0.84, 0.94) * (rim * 0.24 * sun), 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  group.add(rimMesh);
  disposables.push(rimGeo, rimMat);

  return {
    group,
    moonMesh,
    material: moonMat,
    setSunDirection: (dir: THREE.Vector3) => {
      sunDirection.copy(dir).normalize();
      rimMat.uniforms.uSunDirection.value.copy(sunDirection);
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
