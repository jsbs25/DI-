/**
 * EARTH ONE - EARTH SHADERS
 * Custom GLSL shaders for photographic Earth rendering:
 *  1. Day/Night blended surface (Blue Marble + ocean specular + twilight + Black Marble city lights)
 *  2. Daylight-illuminated translucent dynamic cloud layer
 *  3. Sun-aware Fresnel Rayleigh atmospheric scattering rim
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

    // Pole-safe orthonormal TBN perturbation from terrain normal map
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

    // Natural spherical daylight falloff & soft atmospheric terminator
    float dayMix = smoothstep(-0.14, 0.22, sunFacing);
    float diffuseShade = mix(0.30, 1.08, smoothstep(-0.12, 0.85, sunFacing));
    vec3 daySurface = dayColor * uDayIntensity * diffuseShade;

    // Subtle specular sheen restricted to oceans on the sunlit side
    float oceanMask = smoothstep(0.05, -0.04, dayColor.r - dayColor.b * 0.85)
                    * smoothstep(0.40, 0.12, dayColor.g);
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = pow(max(dot(blendedNormal, halfVec), 0.0), 34.0);
    daySurface += vec3(0.75, 0.88, 1.0) * (spec * 0.16 * oceanMask * dayMix);

    // Delicate twilight amber-rose scatter along the terminator band
    float twilightBand = smoothstep(-0.14, 0.01, sunFacing) * (1.0 - smoothstep(0.01, 0.16, sunFacing));
    vec3 twilightGlow = vec3(0.16, 0.08, 0.045) * twilightBand * (0.4 + 0.6 * dayColor.b);

    // Night-side cities glowing warmly while oceans remain calm dark navy
    float nightLightMask = 1.0 - smoothstep(-0.18, 0.05, sunFacing);
    vec3 nightLights = nightColor * vec3(1.12, 0.98, 0.78) * uNightIntensity * nightLightMask;
    vec3 nightAmbient = vec3(0.009, 0.016, 0.032) * (1.0 - dayMix * 0.6);

    // Subtle grazing horizon atmospheric scatter directly on Earth curvature
    float horizon = pow(1.0 - clamp(dot(baseNormal, viewDir), 0.0, 1.0), 3.2);
    float sunLimb = 0.22 + 0.78 * smoothstep(-0.28, 0.42, dot(baseNormal, sunDir));
    vec3 limbScatter = vec3(0.16, 0.42, 0.78) * (horizon * 0.34 * sunLimb);

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
    float sunFacing = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float dayLight = mix(0.06, 1.0, smoothstep(-0.22, 0.30, sunFacing));
    vec3 cloudColor = mix(vec3(0.28, 0.38, 0.56), vec3(0.96, 0.98, 1.0), smoothstep(-0.15, 0.45, sunFacing));
    float alpha = tex.a * tex.r * uCloudOpacity * dayLight;
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
    float fresnel = pow(clamp(1.0 - abs(dot(n, normalize(vViewDir))), 0.0, 1.0), 3.8);

    float sunAlignment = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float sunWeight = mix(0.14, 1.0, smoothstep(-0.35, 0.55, sunAlignment));

    // Restrained natural Rayleigh ice-blue limb (brighter sunlit limb, subtle night limb)
    vec3 deepSky = vec3(0.08, 0.32, 0.78);
    vec3 horizonSky = vec3(0.38, 0.68, 0.98);
    vec3 atmoColor = mix(deepSky, horizonSky, fresnel * 0.75);

    float alpha = fresnel * 0.92 * sunWeight;
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
    float fresnel = pow(clamp(1.0 - abs(dot(n, normalize(vViewDir))), 0.0, 1.0), 2.8);
    float sunAlignment = dot(normalize(vWorldNormal), normalize(uSunDirection));
    float sunWeight = mix(0.12, 1.0, smoothstep(-0.30, 0.50, sunAlignment));
    gl_FragColor = vec4(0.36, 0.64, 0.96, 1.0) * (fresnel * 0.22 * sunWeight);
  }
`;
