import * as THREE from 'three';

/**
 * ONE Cinematic Opening Timeline & Camera Director
 *
 * Architectural synthesis grounded in inspected open-source techniques:
 * - Multi-phase declarative keyframe staging inspired by htekdev/explainer-3d (MIT)
 * - Scrubbable normalized track & easing evaluation inspired by theatre-js/theatre (Apache-2.0)
 * - Arc-length CatmullRomCurve3 camera rails & damping via mrdoob/three.js (MIT)
 * - Single linear-HDR exposure & quality discipline inspired by Leonxlnx/sakura-realm (MIT)
 */

export type CinematicPhaseId =
  | 'awakening'
  | 'brandReveal'
  | 'welcomeSequence'
  | 'mainWorldTransition';

export interface CinematicPhaseMeta {
  id: CinematicPhaseId;
  startSec: number;
  endSec: number;
  enLabel: string;
  zhLabel: string;
  voLine?: string;
  voAtSec?: number;
}

export interface TimelineTrackPoint {
  sec: number;
  timeOfDay: number;
  fogDensity: number;
  windStrength: number;
  godRayIntensity: number;
  bloomStrength: number;
  mistOpacity: number;
  petalIntensity: number;
  lanternGlow: number;
  fov: number;
}

export interface CinematicEvaluation {
  elapsedSec: number;
  progress: number;
  phase: CinematicPhaseMeta;
  phaseProgress: number;
  cameraPos: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
  timeOfDay: number;
  fogDensity: number;
  windStrength: number;
  godRayIntensity: number;
  bloomStrength: number;
  mistOpacity: number;
  petalIntensity: number;
  lanternGlow: number;
  brandOpacity: number;
  welcomeOpacity: number;
  fadeOutOverlay: number;
  activeCaption: string;
}

export const INTRO_TOTAL_DURATION_SEC = 13.2;

export const INTRO_PHASES: readonly CinematicPhaseMeta[] = [
  {
    id: 'awakening',
    startSec: 0.0,
    endSec: 2.8,
    enLabel: 'World Awakening',
    zhLabel: '晨曦初醒',
  },
  {
    id: 'brandReveal',
    startSec: 2.8,
    endSec: 6.4,
    enLabel: 'ONE',
    zhLabel: '独一之境',
    voAtSec: 2.85,
    voLine: 'Light breaks across a quiet valley. One sky. One living sanctuary.',
  },
  {
    id: 'welcomeSequence',
    startSec: 6.4,
    endSec: 10.6,
    enLabel: 'Living Sanctuary',
    zhLabel: '万物共生',
    voAtSec: 6.45,
    voLine: 'Welcome to ONE. Where nature, thought, and humanity meet as one.',
  },
  {
    id: 'mainWorldTransition',
    startSec: 10.6,
    endSec: INTRO_TOTAL_DURATION_SEC,
    enLabel: 'Entering Paradise World',
    zhLabel: '步入主世界',
  },
] as const;

export function formatPersonalWelcomeVo(userName?: string | null): string {
  const clean = (userName || '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, 32);
  if (clean && /^[A-Za-z0-9 ._-]+$/.test(clean)) {
    return `Welcome to ONE, ${clean}. Where nature, thought, and humanity meet as one.`;
  }
  return 'Welcome to ONE. Where nature, thought, and humanity meet as one.';
}

const CAMERA_PATH_POINTS: Array<[number, number, number]> = [
  // 01: High above western mist ridge looking softly across sleepy lake
  [-18.0, 14.5, -24.0],
  // 02: Rising through drifting cherry blossom & ginkgo canopy mist
  [-13.5, 11.4, -10.5],
  // 03: Sweeping open crest toward shimmering sunrise water reflection
  [-6.8, 7.6, 2.5],
  // 04: Low graceful glide over emerald lake near arched bridge & pagoda lanterns
  [0.5, 4.1, 10.8],
  // 05: Ascending smoothly around south-west shoreline toward Overlook vista
  [-2.6, 6.4, 18.6],
  // 06: Exact match to ParadiseWorld3D Overlook preset (-4.5, 8.2, 23.5)
  [-4.5, 8.2, 23.5],
];

const LOOKAT_PATH_POINTS: Array<[number, number, number]> = [
  [3.0, 3.2, -3.5],
  [5.2, 2.5, -2.5],
  [6.8, 2.2, -3.0],
  [8.4, 2.0, -5.8],
  [4.8, 1.85, -3.6],
  // Exact match to ParadiseWorld3D Overlook target (2.5, 1.8, -2.5)
  [2.5, 1.8, -2.5],
];

const ATMOSPHERE_TRACK: readonly TimelineTrackPoint[] = [
  {
    sec: 0.0,
    timeOfDay: 0.214, // pre-dawn indigo twilight with fading stars
    fogDensity: 0.0155,
    windStrength: 0.14,
    godRayIntensity: 0.06,
    bloomStrength: 0.42,
    mistOpacity: 0.92,
    petalIntensity: 0.45,
    lanternGlow: 1.0,
    fov: 48,
  },
  {
    sec: 2.8,
    timeOfDay: 0.246, // first golden peach horizon break
    fogDensity: 0.0125,
    windStrength: 0.28,
    godRayIntensity: 0.26,
    bloomStrength: 0.48,
    mistOpacity: 0.84,
    petalIntensity: 0.85,
    lanternGlow: 0.88,
    fov: 45.5,
  },
  {
    sec: 6.4,
    timeOfDay: 0.268, // radiant sunrise across sakura & ginkgo valley
    fogDensity: 0.0086,
    windStrength: 0.44,
    godRayIntensity: 0.44,
    bloomStrength: 0.46,
    mistOpacity: 0.62,
    petalIntensity: 1.0,
    lanternGlow: 0.56,
    fov: 43.5,
  },
  {
    sec: 10.6,
    timeOfDay: 0.305, // crisp morning light bridging toward daytime garden
    fogDensity: 0.0056,
    windStrength: 0.32,
    godRayIntensity: 0.28,
    bloomStrength: 0.32,
    mistOpacity: 0.34,
    petalIntensity: 0.78,
    lanternGlow: 0.22,
    fov: 42.2,
  },
  {
    sec: INTRO_TOTAL_DURATION_SEC,
    timeOfDay: 0.345, // aligned with clear morning overlook handoff
    fogDensity: 0.0044,
    windStrength: 0.24,
    godRayIntensity: 0.18,
    bloomStrength: 0.24,
    mistOpacity: 0.16,
    petalIntensity: 0.62,
    lanternGlow: 0.08,
    fov: 42.0,
  },
];

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function smoother01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function windowFade(sec: number, fadeInStart: number, fullStart: number, fullEnd: number, fadeOutEnd: number): number {
  if (sec <= fadeInStart || sec >= fadeOutEnd) return 0;
  if (sec < fullStart) return smooth01((sec - fadeInStart) / Math.max(0.001, fullStart - fadeInStart));
  if (sec > fullEnd) return 1 - smooth01((sec - fullEnd) / Math.max(0.001, fadeOutEnd - fullEnd));
  return 1;
}

function sampleAtmosphereTrack(sec: number): Omit<TimelineTrackPoint, 'sec'> {
  const clamped = Math.max(0, Math.min(INTRO_TOTAL_DURATION_SEC, sec));
  let idx = 0;
  while (idx < ATMOSPHERE_TRACK.length - 2 && clamped > ATMOSPHERE_TRACK[idx + 1].sec) {
    idx++;
  }
  const a = ATMOSPHERE_TRACK[idx];
  const b = ATMOSPHERE_TRACK[idx + 1];
  const span = Math.max(0.0001, b.sec - a.sec);
  const t = smooth01((clamped - a.sec) / span);

  const lerp = (v0: number, v1: number) => v0 + (v1 - v0) * t;
  return {
    timeOfDay: lerp(a.timeOfDay, b.timeOfDay),
    fogDensity: lerp(a.fogDensity, b.fogDensity),
    windStrength: lerp(a.windStrength, b.windStrength),
    godRayIntensity: lerp(a.godRayIntensity, b.godRayIntensity),
    bloomStrength: lerp(a.bloomStrength, b.bloomStrength),
    mistOpacity: lerp(a.mistOpacity, b.mistOpacity),
    petalIntensity: lerp(a.petalIntensity, b.petalIntensity),
    lanternGlow: lerp(a.lanternGlow, b.lanternGlow),
    fov: lerp(a.fov, b.fov),
  };
}

export class SceneTimelineDirector {
  public readonly durationSec = INTRO_TOTAL_DURATION_SEC;
  private readonly camCurve: THREE.CatmullRomCurve3;
  private readonly lookCurve: THREE.CatmullRomCurve3;
  private readonly _posOut = new THREE.Vector3();
  private readonly _lookOut = new THREE.Vector3();

  constructor() {
    this.camCurve = new THREE.CatmullRomCurve3(
      CAMERA_PATH_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'centripetal',
      0.5
    );
    this.lookCurve = new THREE.CatmullRomCurve3(
      LOOKAT_PATH_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'centripetal',
      0.5
    );
  }

  public getPhaseAt(sec: number): CinematicPhaseMeta {
    const clamped = Math.max(0, Math.min(this.durationSec, sec));
    for (const phase of INTRO_PHASES) {
      if (clamped < phase.endSec || phase.id === 'mainWorldTransition') {
        return phase;
      }
    }
    return INTRO_PHASES[INTRO_PHASES.length - 1];
  }

  public evaluate(rawElapsedSec: number, userName?: string | null): CinematicEvaluation {
    const elapsedSec = Math.max(0, Math.min(this.durationSec, rawElapsedSec));
    const progress = elapsedSec / this.durationSec;

    // Cinematic camera curve easing: slow contemplative acceleration, silky decelerated overlook settle
    const curveU = smoother01(progress * 0.94 + smooth01(progress) * 0.06);
    this.camCurve.getPointAt(curveU, this._posOut);
    this.lookCurve.getPointAt(curveU, this._lookOut);

    const phase = this.getPhaseAt(elapsedSec);
    const phaseSpan = Math.max(0.001, phase.endSec - phase.startSec);
    const phaseProgress = Math.max(0, Math.min(1, (elapsedSec - phase.startSec) / phaseSpan));

    const atmo = sampleAtmosphereTrack(elapsedSec);

    const brandOpacity = windowFade(elapsedSec, 2.35, 3.3, 5.7, 6.45);
    const welcomeOpacity = windowFade(elapsedSec, 6.35, 7.1, 10.1, 10.95);
    const fadeOutOverlay =
      elapsedSec > 11.7 ? smooth01((elapsedSec - 11.7) / (this.durationSec - 11.7)) : 0;

    let activeCaption = '';
    if (elapsedSec >= 2.75 && elapsedSec < 6.25) {
      activeCaption = INTRO_PHASES[1].voLine || '';
    } else if (elapsedSec >= 6.35 && elapsedSec < 10.85) {
      activeCaption = formatPersonalWelcomeVo(userName);
    }

    return {
      elapsedSec,
      progress,
      phase,
      phaseProgress,
      cameraPos: this._posOut,
      lookAt: this._lookOut,
      fov: atmo.fov,
      timeOfDay: atmo.timeOfDay,
      fogDensity: atmo.fogDensity,
      windStrength: atmo.windStrength,
      godRayIntensity: atmo.godRayIntensity,
      bloomStrength: atmo.bloomStrength,
      mistOpacity: atmo.mistOpacity,
      petalIntensity: atmo.petalIntensity,
      lanternGlow: atmo.lanternGlow,
      brandOpacity,
      welcomeOpacity,
      fadeOutOverlay,
      activeCaption,
    };
  }
}
