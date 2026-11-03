/**
 * EARTH ONE - EARTH SHADERS
 * Custom GLSL shaders for the NASA-grade Earth rendering:
 *  1. Day/Night blended surface (Blue Marble day + Black Marble city lights)
 *  2. Fresnel atmospheric scattering rim glow
 */

export const earthSurfaceVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    // World-space normal for the sun-direction terminator
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

    // Perturb the normal with the normal map for subtle terrain shading
    vec3 nrm = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    vec3 baseNormal = normalize(vNormal);
    vec3 tangent = normalize(cross(baseNormal, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = normalize(cross(baseNormal, tangent));
    mat3 tbn = mat3(tangent, bitangent, baseNormal);
    vec3 perturbedNormal = normalize(tbn * nrm);
    vec3 blendedNormal = normalize(mix(baseNormal, perturbedNormal, uNormalStrength));

    // Terminator: dot(worldNormal, sunDir) in [-1, 1]
    vec3 sunDir = normalize(uSunDirection);
    float ndl = dot(blendedNormal, sunDir);

    // Smooth day/night blend across a soft terminator band.
    float dayMix = smoothstep(-0.15, 0.25, ndl);
    float nightMix = 1.0 - dayMix;

    // Blue Marble day surface (slightly dimmed for a photographic look)
    vec3 day = dayColor * uDayIntensity;

    // Black Marble night surface: city lights preserved, oceans nearly black
    vec3 night = nightColor * uNightIntensity;

    // A faint cool ambient so night-side oceans aren't pure black voids
    vec3 ambient = vec3(0.012, 0.02, 0.04);

    vec3 color = day * dayMix + night * nightMix + ambient;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    // Fresnel: strongest at the limb (grazing angle), zero facing the camera
    float fresnel = pow(1.0 - abs(dot(n, vViewDir)), 3.5);

    // Deep ice-blue Rayleigh scattering, paler toward the outer edge
    vec3 deepBlue = vec3(0.06, 0.30, 0.92);
    vec3 paleBlue = vec3(0.36, 0.70, 1.0);
    vec3 atmoColor = mix(deepBlue, paleBlue, fresnel * 0.8);

    float alpha = fresnel * 1.35;
    gl_FragColor = vec4(atmoColor, 1.0) * alpha;
  }
`;

export const innerAtmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const innerAtmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(n, vViewDir)), 2.0);
    gl_FragColor = vec4(0.45, 0.72, 1.0, 1.0) * fresnel * 0.32;
  }
`;
