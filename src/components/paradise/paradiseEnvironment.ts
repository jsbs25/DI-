import * as THREE from 'three';

export type WeatherKind =
  | 'clear'
  | 'overcast'
  | 'breeze'
  | 'gale'
  | 'light-rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'morning-fog'
  | 'light-mist'
  | 'after-rain'
  | 'rainbow';

export type TimePreset = 'dawn' | 'day' | 'dusk' | 'evening' | 'night';

export interface WeatherOptionMeta {
  id: WeatherKind;
  zh: string;
  en: string;
}

export const WEATHER_OPTIONS: WeatherOptionMeta[] = [
  { id: 'clear', zh: '晴天', en: 'Clear' },
  { id: 'overcast', zh: '阴天', en: 'Overcast' },
  { id: 'breeze', zh: '微风', en: 'Breeze' },
  { id: 'gale', zh: '大风', en: 'Gale' },
  { id: 'light-rain', zh: '小雨', en: 'Light Rain' },
  { id: 'heavy-rain', zh: '大雨', en: 'Heavy Rain' },
  { id: 'thunderstorm', zh: '暴风雨', en: 'Storm' },
  { id: 'morning-fog', zh: '晨雾', en: 'Morning Fog' },
  { id: 'light-mist', zh: '薄雾', en: 'Light Mist' },
  { id: 'after-rain', zh: '雨后', en: 'After Rain' },
  { id: 'rainbow', zh: '彩虹', en: 'Rainbow' },
];

export const TIME_PRESET_VALUES: Record<TimePreset, number> = {
  dawn: 0.266,
  day: 0.48,
  dusk: 0.742,
  evening: 0.768,
  night: 0.94,
};

interface WeatherTargets {
  cloudCover: number;
  cloudDarkness: number;
  windStrength: number;
  rainIntensity: number;
  stormIntensity: number;
  fogDensity: number;
  targetWetness: number;
  targetDew: number;
  targetRainbow: number;
  sunAttenuation: number;
}

const WEATHER_TARGETS: Record<WeatherKind, WeatherTargets> = {
  clear: {
    cloudCover: 0.24,
    cloudDarkness: 0.04,
    windStrength: 0.22,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.0042,
    targetWetness: 0.0,
    targetDew: 0.05,
    targetRainbow: 0.0,
    sunAttenuation: 1.0,
  },
  overcast: {
    cloudCover: 0.86,
    cloudDarkness: 0.56,
    windStrength: 0.34,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.0085,
    targetWetness: 0.08,
    targetDew: 0.12,
    targetRainbow: 0.0,
    sunAttenuation: 0.42,
  },
  breeze: {
    cloudCover: 0.36,
    cloudDarkness: 0.08,
    windStrength: 0.52,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.0046,
    targetWetness: 0.0,
    targetDew: 0.06,
    targetRainbow: 0.0,
    sunAttenuation: 0.94,
  },
  gale: {
    cloudCover: 0.68,
    cloudDarkness: 0.38,
    windStrength: 1.0,
    rainIntensity: 0.04,
    stormIntensity: 0.0,
    fogDensity: 0.0072,
    targetWetness: 0.05,
    targetDew: 0.04,
    targetRainbow: 0.0,
    sunAttenuation: 0.68,
  },
  'light-rain': {
    cloudCover: 0.88,
    cloudDarkness: 0.64,
    windStrength: 0.46,
    rainIntensity: 0.45,
    stormIntensity: 0.0,
    fogDensity: 0.0115,
    targetWetness: 0.82,
    targetDew: 0.72,
    targetRainbow: 0.0,
    sunAttenuation: 0.32,
  },
  'heavy-rain': {
    cloudCover: 0.98,
    cloudDarkness: 0.84,
    windStrength: 0.82,
    rainIntensity: 0.94,
    stormIntensity: 0.12,
    fogDensity: 0.016,
    targetWetness: 1.0,
    targetDew: 0.95,
    targetRainbow: 0.0,
    sunAttenuation: 0.18,
  },
  thunderstorm: {
    cloudCover: 1.0,
    cloudDarkness: 0.96,
    windStrength: 1.05,
    rainIntensity: 1.0,
    stormIntensity: 1.0,
    fogDensity: 0.0185,
    targetWetness: 1.0,
    targetDew: 0.92,
    targetRainbow: 0.0,
    sunAttenuation: 0.12,
  },
  'morning-fog': {
    cloudCover: 0.48,
    cloudDarkness: 0.18,
    windStrength: 0.14,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.023,
    targetWetness: 0.28,
    targetDew: 0.82,
    targetRainbow: 0.0,
    sunAttenuation: 0.64,
  },
  'light-mist': {
    cloudCover: 0.4,
    cloudDarkness: 0.12,
    windStrength: 0.2,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.0145,
    targetWetness: 0.16,
    targetDew: 0.46,
    targetRainbow: 0.0,
    sunAttenuation: 0.78,
  },
  'after-rain': {
    cloudCover: 0.42,
    cloudDarkness: 0.12,
    windStrength: 0.25,
    rainIntensity: 0.0,
    stormIntensity: 0.0,
    fogDensity: 0.0088,
    targetWetness: 0.84,
    targetDew: 1.0,
    targetRainbow: 0.35,
    sunAttenuation: 0.96,
  },
  rainbow: {
    cloudCover: 0.34,
    cloudDarkness: 0.08,
    windStrength: 0.22,
    rainIntensity: 0.04,
    stormIntensity: 0.0,
    fogDensity: 0.0074,
    targetWetness: 0.72,
    targetDew: 0.95,
    targetRainbow: 1.0,
    sunAttenuation: 0.98,
  },
};

const AUTO_WEATHER_SEQUENCE: Array<{ kind: WeatherKind; durationSec: number }> = [
  { kind: 'clear', durationSec: 26 },
  { kind: 'breeze', durationSec: 20 },
  { kind: 'light-mist', durationSec: 16 },
  { kind: 'overcast', durationSec: 16 },
  { kind: 'light-rain', durationSec: 18 },
  { kind: 'heavy-rain', durationSec: 14 },
  { kind: 'thunderstorm', durationSec: 14 },
  { kind: 'after-rain', durationSec: 18 },
  { kind: 'rainbow', durationSec: 20 },
  { kind: 'morning-fog', durationSec: 16 },
  { kind: 'gale', durationSec: 14 },
];

export interface ParadiseAtmosphereState {
  timeOfDay: number;
  sunElevation: number;
  dayFactor: number;
  twilightFactor: number;
  eveningFactor: number;
  nightFactor: number;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  zenithColor: THREE.Color;
  horizonColor: THREE.Color;
  fogColor: THREE.Color;
  sunLightColor: THREE.Color;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  cloudCover: number;
  cloudDarkness: number;
  windStrength: number;
  rainIntensity: number;
  stormIntensity: number;
  lightningFlash: number;
  lightningAzimuth: number;
  fogDensity: number;
  wetness: number;
  dewAmount: number;
  rainbowIntensity: number;
  sunAttenuation: number;
  exposure: number;
  lanternGlow: number;
  activeWeather: WeatherKind;
}

export interface SkyDomeHandle {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  dispose: () => void;
}

export function getTimePhaseLabel(timeOfDay: number, isZh: boolean): string {
  const t = ((timeOfDay % 1) + 1) % 1;
  if (t >= 0.18 && t < 0.29) return isZh ? '黎明' : 'Dawn';
  if (t >= 0.29 && t < 0.68) return isZh ? '白天' : 'Day';
  if (t >= 0.68 && t < 0.775) return isZh ? '黄昏' : 'Dusk';
  if (t >= 0.775 && t < 0.85) return isZh ? '傍晚' : 'Evening';
  return isZh ? '夜晚' : 'Night';
}

export function formatClockTime(timeOfDay: number): string {
  const t = ((timeOfDay % 1) + 1) % 1;
  const totalMinutes = Math.floor(t * 1440);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class ParadiseEnvironmentEngine {
  public timeOfDay: number;
  public autoCycle: boolean;
  public autoWeather: boolean;
  public targetWeather: WeatherKind;

  public state: ParadiseAtmosphereState;
  private autoWeatherIndex = 0;
  private autoWeatherElapsed = 0;
  private nextLightningIn = 2.4;
  private lightningAge = 99;
  private lightningDouble = false;

  // Zero-GC pre-allocated palette stops
  private readonly cNightZenith = new THREE.Color(0x070d1c);
  private readonly cEveningZenith = new THREE.Color(0x162244);
  private readonly cDawnZenith = new THREE.Color(0x314a7a);
  private readonly cDayZenith = new THREE.Color(0x3a7bc8);
  private readonly cDuskZenith = new THREE.Color(0x283666);

  private readonly cNightHorizon = new THREE.Color(0x13203b);
  private readonly cEveningHorizon = new THREE.Color(0x3c436b);
  private readonly cDawnHorizon = new THREE.Color(0xeba07a);
  private readonly cDayHorizon = new THREE.Color(0xbce0f7);
  private readonly cDuskHorizon = new THREE.Color(0xe07e5a);

  private readonly cOvercastSky = new THREE.Color(0x667686);
  private readonly cOvercastNight = new THREE.Color(0x0d1422);

  private readonly cSunDay = new THREE.Color(0xfff5de);
  private readonly cSunLow = new THREE.Color(0xff9f68);
  private readonly cMoon = new THREE.Color(0x9fbce8);

  private readonly cGroundDay = new THREE.Color(0x34462c);
  private readonly cGroundDusk = new THREE.Color(0x2b2824);
  private readonly cGroundNight = new THREE.Color(0x0c131d);

  constructor(initialTime = 0.44, initialWeather: WeatherKind = 'clear') {
    this.timeOfDay = initialTime;
    this.autoCycle = true;
    this.autoWeather = true;
    this.targetWeather = initialWeather;

    const wt = WEATHER_TARGETS[initialWeather];
    this.state = {
      timeOfDay: initialTime,
      sunElevation: 0.6,
      dayFactor: 1,
      twilightFactor: 0,
      eveningFactor: 0,
      nightFactor: 0,
      sunDir: new THREE.Vector3(0.4, 0.7, -0.5).normalize(),
      moonDir: new THREE.Vector3(-0.4, -0.7, 0.5).normalize(),
      zenithColor: new THREE.Color(),
      horizonColor: new THREE.Color(),
      fogColor: new THREE.Color(),
      sunLightColor: new THREE.Color(),
      hemiSkyColor: new THREE.Color(),
      hemiGroundColor: new THREE.Color(),
      cloudCover: wt.cloudCover,
      cloudDarkness: wt.cloudDarkness,
      windStrength: wt.windStrength,
      rainIntensity: wt.rainIntensity,
      stormIntensity: wt.stormIntensity,
      lightningFlash: 0,
      lightningAzimuth: 0.25,
      fogDensity: wt.fogDensity,
      wetness: wt.targetWetness,
      dewAmount: wt.targetDew,
      rainbowIntensity: wt.targetRainbow,
      sunAttenuation: wt.sunAttenuation,
      exposure: 1.05,
      lanternGlow: 0,
      activeWeather: initialWeather,
    };

    this.evaluateAtTime(initialTime);
  }

  public setTimePreset(preset: TimePreset) {
    this.timeOfDay = TIME_PRESET_VALUES[preset];
  }

  public triggerLightning() {
    this.lightningAge = 0;
    this.lightningDouble = Math.random() > 0.35;
    this.state.lightningAzimuth = (Math.random() - 0.5) * 1.4;
  }

  public update(dt: number) {
    if (this.autoCycle) {
      this.timeOfDay = (this.timeOfDay + dt / 160) % 1;
    }

    if (this.autoWeather) {
      this.autoWeatherElapsed += dt;
      const cur = AUTO_WEATHER_SEQUENCE[this.autoWeatherIndex];
      if (this.autoWeatherElapsed >= cur.durationSec) {
        this.autoWeatherElapsed = 0;
        this.autoWeatherIndex = (this.autoWeatherIndex + 1) % AUTO_WEATHER_SEQUENCE.length;
        this.targetWeather = AUTO_WEATHER_SEQUENCE[this.autoWeatherIndex].kind;
      }
    }

    const target = WEATHER_TARGETS[this.targetWeather];
    this.state.activeWeather = this.targetWeather;

    this.state.cloudCover = THREE.MathUtils.damp(this.state.cloudCover, target.cloudCover, 0.65, dt);
    this.state.cloudDarkness = THREE.MathUtils.damp(this.state.cloudDarkness, target.cloudDarkness, 0.65, dt);
    this.state.windStrength = THREE.MathUtils.damp(this.state.windStrength, target.windStrength, 1.0, dt);
    this.state.rainIntensity = THREE.MathUtils.damp(this.state.rainIntensity, target.rainIntensity, 0.9, dt);
    this.state.stormIntensity = THREE.MathUtils.damp(this.state.stormIntensity, target.stormIntensity, 0.9, dt);
    this.state.fogDensity = THREE.MathUtils.damp(this.state.fogDensity, target.fogDensity, 0.65, dt);
    this.state.sunAttenuation = THREE.MathUtils.damp(this.state.sunAttenuation, target.sunAttenuation, 0.7, dt);

    const wetRate = target.targetWetness > this.state.wetness ? 0.5 : 0.16;
    this.state.wetness = THREE.MathUtils.damp(this.state.wetness, target.targetWetness, wetRate, dt);
    const dewRate = target.targetDew > this.state.dewAmount ? 0.42 : 0.18;
    this.state.dewAmount = THREE.MathUtils.damp(this.state.dewAmount, target.targetDew, dewRate, dt);

    // Thunderstorm realistic double-pulse lightning
    if (this.state.stormIntensity > 0.3) {
      this.nextLightningIn -= dt;
      if (this.nextLightningIn <= 0) {
        this.triggerLightning();
        this.nextLightningIn = 3.0 + Math.random() * 5.2;
      }
    }
    this.lightningAge += dt;
    let flash = 0;
    if (this.lightningAge < 0.55) {
      const p1 = Math.exp(-this.lightningAge * 14.0);
      const p2 = this.lightningDouble ? Math.exp(-Math.max(0, this.lightningAge - 0.13) * 12.0) * 0.85 : 0;
      flash = Math.min(1, p1 + (this.lightningAge >= 0.13 ? p2 : 0)) * Math.max(0.2, this.state.stormIntensity);
    }
    this.state.lightningFlash = flash;

    this.evaluateAtTime(this.timeOfDay);

    // Rainbow naturally shines strongest in daytime/golden sunlight
    const sunVis = THREE.MathUtils.smoothstep(this.state.sunElevation, -0.02, 0.25);
    const targetRb = target.targetRainbow * sunVis;
    this.state.rainbowIntensity = THREE.MathUtils.damp(this.state.rainbowIntensity, targetRb, 0.75, dt);
  }

  private evaluateAtTime(tRaw: number) {
    const t = ((tRaw % 1) + 1) % 1;
    this.state.timeOfDay = t;

    const sunAngle = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(sunAngle);
    const horiz = Math.cos(sunAngle);

    this.state.sunElevation = elev;
    this.state.sunDir.set(horiz * 0.82, elev, -0.48 - 0.18 * Math.sin(sunAngle)).normalize();
    this.state.moonDir.copy(this.state.sunDir).negate();

    const dayFactor = THREE.MathUtils.smoothstep(elev, -0.06, 0.32);
    const nightFactor = 1 - THREE.MathUtils.smoothstep(elev, -0.18, 0.10);
    const twilightFactor = Math.exp(-Math.pow((elev - 0.02) / 0.14, 2));
    // Evening blue-hour curve right after sunset
    const isEveningSide = horiz < 0 ? 1 : 0;
    const eveningFactor = isEveningSide * Math.exp(-Math.pow((elev + 0.08) / 0.1, 2));
    const isMorningSide = horiz > 0 ? 1 : 0;

    this.state.dayFactor = dayFactor;
    this.state.nightFactor = nightFactor;
    this.state.twilightFactor = twilightFactor;
    this.state.eveningFactor = eveningFactor;

    this.state.zenithColor.copy(this.cNightZenith).lerp(this.cDayZenith, dayFactor);
    const twZenith = isMorningSide ? this.cDawnZenith : this.cDuskZenith;
    this.state.zenithColor.lerp(twZenith, twilightFactor * 0.74);
    this.state.zenithColor.lerp(this.cEveningZenith, eveningFactor * 0.65);

    this.state.horizonColor.copy(this.cNightHorizon).lerp(this.cDayHorizon, dayFactor);
    const twHorizon = isMorningSide ? this.cDawnHorizon : this.cDuskHorizon;
    this.state.horizonColor.lerp(twHorizon, twilightFactor * 0.86);
    this.state.horizonColor.lerp(this.cEveningHorizon, eveningFactor * 0.55);

    const stormShade = Math.min(1, this.state.cloudDarkness * 0.94);
    const stormTarget = this.cOvercastNight.clone().lerp(this.cOvercastSky, dayFactor);
    this.state.zenithColor.lerp(stormTarget, stormShade * 0.82);
    this.state.horizonColor.lerp(stormTarget, stormShade * 0.86);

    // Subtle cool sky flash during lightning
    if (this.state.lightningFlash > 0.01) {
      this.state.zenithColor.offsetHSL(0, -0.05, this.state.lightningFlash * 0.18);
      this.state.horizonColor.offsetHSL(0, -0.05, this.state.lightningFlash * 0.15);
    }

    this.state.fogColor.copy(this.state.horizonColor);
    if (this.state.activeWeather === 'morning-fog' && dayFactor > 0.1) {
      this.state.fogColor.lerp(this.cDawnHorizon, 0.16);
    }

    const sunColor = this.cSunLow.clone().lerp(this.cSunDay, THREE.MathUtils.smoothstep(elev, 0.02, 0.45));
    this.state.sunLightColor.copy(this.cMoon).lerp(sunColor, THREE.MathUtils.smoothstep(elev, -0.05, 0.15));

    this.state.hemiSkyColor.copy(this.state.zenithColor).lerp(this.state.horizonColor, 0.55);
    this.state.hemiGroundColor
      .copy(this.cGroundNight)
      .lerp(this.cGroundDusk, Math.max(twilightFactor, eveningFactor * 0.6))
      .lerp(this.cGroundDay, dayFactor);

    this.state.exposure =
      THREE.MathUtils.lerp(0.86, 1.06, dayFactor) * THREE.MathUtils.lerp(1.0, 0.84, stormShade);
    this.state.lanternGlow = THREE.MathUtils.smoothstep(0.18 - elev, 0, 0.34);
  }
}

export function createParadiseSkyDome(): SkyDomeHandle {
  const geo = new THREE.SphereGeometry(165, 48, 32);

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, -0.7, 0.5).normalize() },
    uZenithColor: { value: new THREE.Color(0x3a7bc8) },
    uHorizonColor: { value: new THREE.Color(0xbce0f7) },
    uCloudCover: { value: 0.25 },
    uCloudDarkness: { value: 0.05 },
    uDayFactor: { value: 1.0 },
    uTwilightFactor: { value: 0.0 },
    uNightFactor: { value: 0.0 },
    uWindSpeed: { value: 0.2 },
    uLightningFlash: { value: 0.0 },
    uLightningAzimuth: { value: 0.25 },
    uRainbowIntensity: { value: 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform float uCloudCover;
      uniform float uCloudDarkness;
      uniform float uDayFactor;
      uniform float uTwilightFactor;
      uniform float uNightFactor;
      uniform float uWindSpeed;
      uniform float uLightningFlash;
      uniform float uLightningAzimuth;
      uniform float uRainbowIntensity;

      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = rot * p * 2.04;
          a *= 0.5;
        }
        return v;
      }

      vec3 spectralRainbow(float t) {
        // Subtle natural pastel spectrum (violet -> indigo -> blue -> green -> yellow -> orange -> red)
        vec3 c0 = vec3(0.45, 0.34, 0.78);
        vec3 c1 = vec3(0.28, 0.62, 0.92);
        vec3 c2 = vec3(0.36, 0.82, 0.54);
        vec3 c3 = vec3(0.96, 0.86, 0.36);
        vec3 c4 = vec3(0.95, 0.42, 0.34);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        float horizonCurve = pow(1.0 - h, 2.35);
        vec3 sky = mix(uZenithColor, uHorizonColor, horizonCurve);

        // Solar scatter + crisp disc
        float sunCos = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunVis = smoothstep(-0.08, 0.08, uSunDir.y) * (1.0 - uCloudDarkness * 0.88);
        float sunGlow = pow(sunCos, 10.0) * 0.34 + pow(sunCos, 96.0) * 0.55;
        float sunDisc = smoothstep(0.99935, 0.99972, sunCos);
        vec3 sunCol = mix(vec3(1.0, 0.55, 0.28), vec3(1.0, 0.96, 0.88), smoothstep(-0.02, 0.35, uSunDir.y));
        sky += sunCol * (sunGlow + sunDisc * 2.4) * sunVis;

        // Lunar disc + cool silver halo
        float moonCos = max(dot(dir, normalize(uMoonDir)), 0.0);
        float moonVis = smoothstep(-0.05, 0.12, uMoonDir.y) * (1.0 - uCloudDarkness * 0.85);
        float moonGlow = pow(moonCos, 24.0) * 0.18 + pow(moonCos, 160.0) * 0.42;
        float moonDisc = smoothstep(0.99942, 0.99972, moonCos);
        vec2 moonUv = dir.xy * 45.0;
        float mare = fbm(moonUv) * 0.25;
        sky += vec3(0.78, 0.87, 1.0) * (moonGlow + moonDisc * (1.45 - mare)) * moonVis;

        // Crisp starfield
        if (uNightFactor > 0.02 && dir.y > 0.02) {
          vec2 starGrid = dir.xz / (dir.y + 0.35) * 145.0;
          vec2 id = floor(starGrid);
          vec2 gv = fract(starGrid) - 0.5;
          float rnd = hash21(id);
          if (rnd > 0.968) {
            float d = length(gv - (vec2(rnd, fract(rnd * 37.0)) - 0.5) * 0.55);
            float twinkle = 0.65 + 0.35 * sin(uTime * (1.4 + rnd * 3.0) + rnd * 62.0);
            float star = smoothstep(0.11, 0.0, d) * twinkle * smoothstep(0.03, 0.28, dir.y);
            vec3 starTint = mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.92, 0.8), fract(rnd * 13.7));
            sky += starTint * star * uNightFactor * (1.0 - uCloudCover * 0.9) * 1.1;
          }
        }

        // Optical post-rain Rainbow Arc framed gently across the valley vista
        if (uRainbowIntensity > 0.01 && dir.y > 0.02) {
          vec3 rbCenter = normalize(vec3(-0.18, 0.04, -0.96));
          float ang = acos(clamp(dot(dir, rbCenter), -1.0, 1.0));
          float bandCoord = (ang - 0.43) / 0.055;
          if (bandCoord > 0.0 && bandCoord < 1.0) {
            float bell = sin(bandCoord * 3.14159);
            float horizFade = smoothstep(0.03, 0.14, dir.y);
            vec3 rbCol = spectralRainbow(bandCoord);
            sky += rbCol * bell * horizFade * uRainbowIntensity * 0.42;
          }
        }

        // Storm cloud lightning sheet glow + jagged distant bolt silhouette
        if (uLightningFlash > 0.01 && dir.y > 0.01) {
          vec3 flashDir = normalize(vec3(uLightningAzimuth, 0.28, -0.92));
          float fDot = max(dot(dir, flashDir), 0.0);
          float cloudScatter = pow(fDot, 5.0) * uLightningFlash;
          sky += vec3(0.72, 0.84, 1.0) * cloudScatter * 0.95;

          float boltX = abs(dir.x - (uLightningAzimuth + 0.04 * sin(dir.y * 34.0 + uTime * 40.0) + 0.02 * sin(dir.y * 78.0)));
          float boltMask = smoothstep(0.008, 0.001, boltX) * smoothstep(0.04, 0.15, dir.y) * smoothstep(0.62, 0.35, dir.y);
          sky += vec3(0.92, 0.97, 1.0) * boltMask * uLightningFlash * 2.2;
        }

        // Volumetric planar clouds
        if (dir.y > 0.015) {
          vec2 cloudUv = dir.xz / (dir.y + 0.14) * 1.35;
          cloudUv += vec2(uTime * (0.014 + uWindSpeed * 0.04), uTime * 0.006);
          float c1 = fbm(cloudUv * 1.15);
          float c2 = fbm(cloudUv * 2.4 - vec2(uTime * 0.012, 0.0));
          float density = c1 * 0.72 + c2 * 0.28;

          float thresh = mix(0.74, 0.26, uCloudCover);
          float cloudMask = smoothstep(thresh, thresh + 0.26, density);
          cloudMask *= smoothstep(0.015, 0.16, dir.y);

          vec3 cloudBright = mix(vec3(0.18, 0.23, 0.34), vec3(0.98, 0.98, 0.99), uDayFactor);
          vec3 cloudWarm = mix(cloudBright, vec3(1.0, 0.72, 0.54), uTwilightFactor * 0.82);
          cloudWarm += sunCol * pow(sunCos, 6.0) * 0.36 * sunVis;
          vec3 cloudShadow = mix(vec3(0.06, 0.09, 0.15), vec3(0.28, 0.32, 0.38), uDayFactor);
          vec3 cloudFinal = mix(cloudWarm, cloudShadow, clamp(uCloudDarkness * 0.9 + (1.0 - c1) * 0.28, 0.0, 1.0));
          cloudFinal += vec3(0.65, 0.78, 1.0) * uLightningFlash * (0.45 + c2 * 0.5);

          sky = mix(sky, cloudFinal, cloudMask * mix(0.72, 0.96, uCloudCover));
        }

        if (dir.y < 0.0) {
          sky = mix(uHorizonColor, uHorizonColor * 0.85, clamp(-dir.y * 4.0, 0.0, 1.0));
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    uniforms,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
