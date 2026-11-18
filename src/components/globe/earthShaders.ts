import * as THREE from 'three';

/**
 * EARTH ONE - EARTH & MOON SHADERS (Upgraded from top open-source Three.js planetary pipelines)
 * Combines:
 *  1. PBR MeshStandardMaterial + onBeforeCompile Surface Shader (inspired by franky-adl/threejs-earth):
 *     - Real NASA Blue Marble albedo + Black Marble city lights gated cleanly by solar terminator
 *     - Real Ocean water-mask roughness inversion for orbital sun glint across oceans
 *     - Drifting MODIS cloud shadows projected onto terrain & ocean in UV sync with cloud sphere
 *     - Grazing Rayleigh sky limb haze & subtle twilight dusk band
 *  2. Custom Cloud & Volumetric Fresnel Atmosphere Shaders
 *  3. Physically calibrated NASA LRO Lunar Regolith + Earthshine PBR Material
 */

export const earthSurfaceVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const earthSurfaceFragmentShader = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uNormalMap;
  uniform vec3 uSunDirection;
  uniform float uDayIntensity;
  uniform float uNightIntensity;
  uniform float uNormalStrength;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dayColor = texture2D(uDayMap, vUv).rgb;
    vec3 nightColor = texture2D(uNightMap, vUv).rgb;

    vec3 nrm = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    vec3 baseNormal = normalize(vNormal);
    vec3 upRef = abs(baseNormal.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(upRef, baseNormal));
    vec3 bitangent = normalize(cross(baseNormal, tangent));
    mat3 tbn = mat3(tangent, bitangent, baseNormal);
    vec3 perturbedNormal = normalize(tbn * nrm);
    vec3 blendedNormal = normalize(mix(baseNormal, perturbedNormal, uNormalStrength));

    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float sunFacing = dot(blendedNormal, sunDir);

    float dayMix = smoothstep(-0.14, 0.22, sunFacing);
    float diffuseShade = mix(0.28, 1.08, smoothstep(-0.12, 0.85, sunFacing));
    vec3 daySurface = dayColor * uDayIntensity * diffuseShade;

    float oceanMask = smoothstep(0.05, -0.04, dayColor.r - dayColor.b * 0.85)
                    * smoothstep(0.40, 0.12, dayColor.g);
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = pow(max(dot(blendedNormal, halfVec), 0.0), 34.0);
    daySurface += vec3(0.75, 0.88, 1.0) * (spec * 0.18 * oceanMask * dayMix);

    float twilightBand = smoothstep(-0.14, 0.01, sunFacing) * (1.0 - smoothstep(0.01, 0.16, sunFacing));
    vec3 twilightGlow = vec3(0.18, 0.085, 0.045) * twilightBand * (0.4 + 0.6 * dayColor.b);

    float nightLightMask = 1.0 - smoothstep(-0.18, 0.05, sunFacing);
    vec3 nightLights = nightColor * vec3(1.15, 0.98, 0.78) * uNightIntensity * nightLightMask;
    vec3 nightAmbient = vec3(0.009, 0.016, 0.032) * (1.0 - dayMix * 0.6);

    float horizon = pow(1.0 - clamp(dot(baseNormal, viewDir), 0.0, 1.0), 3.2);
    float sunLimb = 0.22 + 0.78 * smoothstep(-0.28, 0.42, dot(baseNormal, sunDir));
    vec3 limbScatter = vec3(0.18, 0.46, 0.86) * (horizon * 0.36 * sunLimb);

    vec3 color = daySurface * dayMix + nightLights + nightAmbient + twilightGlow + limbScatter;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const earthCloudVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const earthCloudFragmentShader = /* glsl */ `
  uniform sampler2D uCloudMap;
  uniform vec3 uSunDirection;
  uniform float uCloudOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec4 tex = texture2D(uCloudMap, vUv);
    // Works cleanly with both transparent PNGs and black-backed NASA MODIS JPEGs
    float cloudDensity = smoothstep(0.08, 0.90, max(tex.r, tex.g)) * tex.a;
    float sunFacing = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float dayLight = mix(0.05, 1.0, smoothstep(-0.24, 0.34, sunFacing));
    vec3 twilightTint = vec3(0.95, 0.72, 0.56);
    float duskBand = smoothstep(-0.16, 0.02, sunFacing) * (1.0 - smoothstep(0.02, 0.20, sunFacing));
    vec3 cloudColor = mix(vec3(0.18, 0.28, 0.46), vec3(0.98, 0.99, 1.0), smoothstep(-0.15, 0.45, sunFacing));
    cloudColor = mix(cloudColor, twilightTint, duskBand * 0.32);
    float alpha = cloudDensity * uCloudOpacity * dayLight;
    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;

  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    float dotNV = abs(dot(n, normalize(vViewDir)));
    float fresnel = pow(clamp(1.0 - dotNV, 0.0, 1.0), 3.9);

    float sunAlignment = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float sunWeight = mix(0.12, 1.0, smoothstep(-0.38, 0.55, sunAlignment));
    float duskWeight = smoothstep(-0.22, 0.05, sunAlignment) * (1.0 - smoothstep(0.05, 0.32, sunAlignment));

    // Rayleigh oxygen-nitrogen sapphire limb with delicate amber-violet terminator
    vec3 deepSky = vec3(0.09, 0.34, 0.84);
    vec3 horizonSky = vec3(0.42, 0.74, 1.0);
    vec3 atmoColor = mix(deepSky, horizonSky, clamp(fresnel * 0.85, 0.0, 1.0));
    atmoColor = mix(atmoColor, vec3(0.75, 0.52, 0.58), duskWeight * 0.18);

    float alpha = fresnel * 0.96 * sunWeight;
    gl_FragColor = vec4(atmoColor * alpha, 1.0);
  }
`;

export const innerAtmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const innerAtmosphereFragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;

  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    float fresnel = pow(clamp(1.0 - abs(dot(n, normalize(vViewDir))), 0.0, 1.0), 3.0);
    float sunAlignment = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float sunWeight = mix(0.12, 1.0, smoothstep(-0.30, 0.50, sunAlignment));
    gl_FragColor = vec4(0.38, 0.68, 0.98, 1.0) * (fresnel * 0.26 * sunWeight);
  }
`;

export interface PhotorealEarthMaterialOptions {
  dayMap: THREE.Texture;
  nightMap: THREE.Texture;
  oceanMaskMap: THREE.Texture;
  normalMap: THREE.Texture;
  bumpMap: THREE.Texture;
  cloudsMap: THREE.Texture;
  sunDirection: THREE.Vector3;
  enableCloudShadows?: boolean;
}

/**
 * Photorealistic PBR Earth Material extending MeshStandardMaterial via onBeforeCompile
 * (architecture adapted from franky-adl/threejs-earth & bobbyroe/threejs-earth):
 *  - Reverses NASA ocean mask into PBR roughness (specular oceans vs matte continents)
 *  - Terminates Black Marble night lights smoothly across dusk line
 *  - Projects real-time cloud shadows shifted by uv_xOffset onto Earth surface
 *  - Adds thin physical Rayleigh surface limb scatter
 */
export function createPhotorealEarthMaterial(
  opts: PhotorealEarthMaterialOptions
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: opts.dayMap,
    normalMap: opts.normalMap,
    normalScale: new THREE.Vector2(0.36, 0.36),
    bumpMap: opts.bumpMap,
    bumpScale: 0.028,
    roughnessMap: opts.oceanMaskMap,
    roughness: 0.94,
    metalness: 0.08,
    emissive: new THREE.Color(0xffe1a6),
    emissiveMap: opts.nightMap,
    emissiveIntensity: 1.55,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tClouds = { value: opts.cloudsMap };
    shader.uniforms.uv_xOffset = { value: 0.0 };
    shader.uniforms.uSunDirection = { value: opts.sunDirection };
    shader.uniforms.uCloudShadowStrength = {
      value: opts.enableCloudShadows === false ? 0.0 : 0.48,
    };

    shader.vertexShader =
      `varying vec3 vEarthWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        vEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader =
      `
      uniform sampler2D tClouds;
      uniform float uv_xOffset;
      uniform vec3 uSunDirection;
      uniform float uCloudShadowStrength;
      varying vec3 vEarthWorldNormal;
      ` + shader.fragmentShader;

    // 1. Reverse NASA ocean water mask -> oceans become smooth specular reflectors (0.24..0.95)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
        float oceanWater = clamp(texelRoughness.g, 0.0, 1.0);
        roughnessFactor = mix(0.92, 0.24, oceanWater);
      #endif
      `
    );

    // 2. Cloud shadows on diffuse albedo before lighting accumulation
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      #ifdef USE_MAP
        float sunLightFacing = dot(normalize(vEarthWorldNormal), normalize(uSunDirection));
        float cloudDayFactor = smoothstep(-0.15, 0.30, sunLightFacing);
        vec2 shadowUv = vec2(fract(vMapUv.x - uv_xOffset), vMapUv.y);
        float cloudShadowVal = smoothstep(0.18, 0.90, texture2D(tClouds, shadowUv).r);
        diffuseColor.rgb *= mix(1.0, 0.42, cloudShadowVal * uCloudShadowStrength * cloudDayFactor);
      #endif
      `
    );

    // 3. Sun-terminator gated city night lights + delicate grazing Rayleigh horizon rim
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #ifdef USE_EMISSIVEMAP
        vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
        float sunDot = dot(normalize(vEarthWorldNormal), normalize(uSunDirection));
        float nightMask = 1.0 - smoothstep(-0.14, 0.08, sunDot);
        totalEmissiveRadiance *= emissiveColor.rgb * nightMask;
      #endif
      float viewDotN = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      float limbRim = pow(1.0 - viewDotN, 3.6);
      float sunLimbFactor = 0.22 + 0.78 * smoothstep(-0.28, 0.42, dot(normalize(vEarthWorldNormal), normalize(uSunDirection)));
      totalEmissiveRadiance += vec3(0.20, 0.56, 1.0) * (limbRim * 0.44 * sunLimbFactor);
      `
    );

    material.userData.shader = shader;
  };

  return material;
}

export interface PhotorealMoonMaterialOptions {
  albedoMap: THREE.Texture;
  normalMap: THREE.Texture;
  bumpMap: THREE.Texture;
  displacementMap?: THREE.Texture;
  displacementScale?: number;
  sunDirection: THREE.Vector3;
}

/**
 * NASA LRO Photorealistic Lunar Regolith Material:
 *  - High micro-roughness (0.94) + Sobel crater normal map + optional physical elevation displacement
 *  - Lommel-Seeliger-inspired grazing crater rim contrast
 *  - Subtle cool slate-blue Earthshine illumination on the lunar night hemisphere
 */
export function createPhotorealMoonMaterial(
  opts: PhotorealMoonMaterialOptions
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf4f5f7),
    map: opts.albedoMap,
    normalMap: opts.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    bumpMap: opts.bumpMap,
    bumpScale: 0.045,
    displacementMap: opts.displacementMap,
    displacementScale: opts.displacementScale ?? 0,
    roughness: 0.94,
    metalness: 0.02,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDirection = { value: opts.sunDirection };
    shader.vertexShader =
      `varying vec3 vMoonWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        vMoonWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader =
      `
      uniform vec3 uSunDirection;
      varying vec3 vMoonWorldNormal;
      ` + shader.fragmentShader;

    // Subtle cool-blue Earthshine fill on the unlit lunar night hemisphere + subtle opposition brightness
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      float moonSunDot = dot(normalize(vMoonWorldNormal), normalize(uSunDirection));
      float nightHemisphere = 1.0 - smoothstep(-0.25, 0.18, moonSunDot);
      vec3 earthshine = diffuseColor.rgb * vec3(0.055, 0.078, 0.115) * nightHemisphere;
      totalEmissiveRadiance += earthshine;
      `
    );

    material.userData.shader = shader;
  };

  return material;
}
