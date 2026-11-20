import React, { useEffect, useMemo, useRef } from 'react';
import type { WeatherKind } from './paradiseEnvironment.ts';
import gardenDayImg from '../../assets/images/garden_sanctuary_day_1795170050256.jpg';
import gardenDuskImg from '../../assets/images/garden_sanctuary_dusk_1795170051093.jpg';
import gardenNightImg from '../../assets/images/garden_sanctuary_night_1795170050668.jpg';

interface HDParadiseSanctuaryProps {
  /** Normalized time of day in [0, 1) where 0.5 is noon and 0.0/1.0 is midnight. */
  timeOfDay: number;
  /** Active weather effect synced to live weather or user selection. */
  weather: WeatherKind;
  /** Whether inline ONE AI music is playing (shows gentle gliding butterfly + note over pond). */
  musicPlaying?: boolean;
  /** Whether ONE AI is thinking or speaking. */
  aiActive?: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Computes normalized Day / Dusk / Night crossfade weights and daylight luminance [0, 1]
 * from wall-clock timeOfDay in [0, 1).
 */
export function computeSanctuaryLighting(timeOfDay: number): {
  dayOpacity: number;
  duskOpacity: number;
  nightOpacity: number;
  daylight: number;
} {
  const t = ((timeOfDay % 1) + 1) % 1;

  // Dawn window: 0.21 (~05:00) -> 0.34 (~08:10)
  // Dusk window: 0.67 (~16:05) -> 0.85 (~20:24)
  let day = 0;
  let dusk = 0;
  let night = 0;

  if (t < 0.21) {
    night = 1;
  } else if (t < 0.275) {
    // Night -> Dawn (warm golden dusk palette)
    const k = smoothstep(0.21, 0.275, t);
    night = 1 - k;
    dusk = k;
  } else if (t < 0.345) {
    // Dawn -> Full Morning Daylight
    const k = smoothstep(0.275, 0.345, t);
    dusk = 1 - k;
    day = k;
  } else if (t < 0.67) {
    day = 1;
  } else if (t < 0.76) {
    // Afternoon -> Golden Hour Dusk
    const k = smoothstep(0.67, 0.76, t);
    day = 1 - k;
    dusk = k;
  } else if (t < 0.85) {
    // Dusk -> Moonlit Night
    const k = smoothstep(0.76, 0.85, t);
    dusk = 1 - k;
    night = k;
  } else {
    night = 1;
  }

  const daylight = clamp01(day * 0.96 + dusk * 0.48 + night * 0.08);
  return {
    dayOpacity: day,
    duskOpacity: dusk,
    nightOpacity: night,
    daylight,
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
  kind: 'petal' | 'firefly' | 'rain' | 'snow' | 'mote';
  hue: string;
}

export const HDParadiseSanctuary: React.FC<HDParadiseSanctuaryProps> = ({
  timeOfDay,
  weather,
  musicPlaying = false,
  aiActive = false,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const parallaxLayerRef = useRef<HTMLDivElement | null>(null);

  const lighting = useMemo(() => computeSanctuaryLighting(timeOfDay), [timeOfDay]);

  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const lightingRef = useRef(lighting);
  lightingRef.current = lighting;
  const musicRef = useRef(musicPlaying);
  musicRef.current = musicPlaying;
  const aiActiveRef = useRef(aiActive);
  aiActiveRef.current = aiActive;

  // Subtle pointer parallax tracking (disabled on coarse touch or reduced motion)
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      pointerTargetRef.current.x = nx;
      pointerTargetRef.current.y = ny;
    };

    const onPointerLeave = () => {
      pointerTargetRef.current.x = 0;
      pointerTargetRef.current.y = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  // Crisp lightweight HTML5 Canvas atmospheric layer (petals, fireflies, rain, snow, pond shimmer, music butterfly)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = stageRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = Math.max(320, container.clientWidth || window.innerWidth);
      height = Math.max(320, container.clientHeight || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Seed ambient particles
    const ambientParticles: Particle[] = [];
    const weatherParticles: Particle[] = [];

    const seedAmbient = () => {
      ambientParticles.length = 0;
      const count = width < 640 ? 22 : 36;
      for (let i = 0; i < count; i++) {
        const isPetal = i % 2 === 0;
        ambientParticles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: isPetal ? 12 + Math.random() * 18 : (Math.random() - 0.5) * 14,
          vy: isPetal ? 10 + Math.random() * 16 : (Math.random() - 0.5) * 10,
          size: isPetal ? 2.6 + Math.random() * 2.8 : 1.6 + Math.random() * 2.4,
          alpha: 0.35 + Math.random() * 0.55,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1,
          kind: isPetal ? 'petal' : 'firefly',
          hue: i % 3 === 0 ? '#f7d694' : '#ffd8e4',
        });
      }
    };

    const seedWeather = () => {
      weatherParticles.length = 0;
      const count = width < 640 ? 60 : 120;
      for (let i = 0; i < count; i++) {
        weatherParticles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: -35 - Math.random() * 35,
          vy: 280 + Math.random() * 240,
          size: 1.2 + Math.random() * 2.4,
          alpha: 0.25 + Math.random() * 0.45,
          phase: Math.random() * Math.PI * 2,
          speed: 0.8 + Math.random() * 1.2,
          kind: 'rain',
          hue: '#ffffff',
        });
      }
    };

    seedAmbient();
    seedWeather();

    let rafId = 0;
    let lastTs = performance.now();
    let elapsed = 0;
    let lightningFlash = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      if (document.hidden) {
        lastTs = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;
      elapsed += dt;

      // Smooth damped micro-parallax transform on the background photo stack
      if (!reducedMotion && parallaxLayerRef.current) {
        const cur = pointerCurrentRef.current;
        const tgt = pointerTargetRef.current;
        cur.x += (tgt.x - cur.x) * Math.min(1, dt * 3.5);
        cur.y += (tgt.y - cur.y) * Math.min(1, dt * 3.5);
        const breathe = 1.045 + Math.sin(elapsed * 0.18) * 0.008;
        const tx = -cur.x * 11;
        const ty = -cur.y * 7;
        parallaxLayerRef.current.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${breathe.toFixed(4)})`;
      }

      ctx.clearRect(0, 0, width, height);
      if (reducedMotion) return;

      const curWeather = weatherRef.current;
      const curLight = lightingRef.current;
      const isNight = curLight.nightOpacity > 0.35;
      const isDusk = curLight.duskOpacity > 0.25;

      // 1. Subtle water reflection shimmer across lower pond area
      const pondTop = height * 0.63;
      const shimmerAlpha = isNight ? 0.055 : isDusk ? 0.075 : 0.065;
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const sy = pondTop + (i / 9) * (height * 0.26);
        const sx = width * (0.26 + ((i * 0.09 + Math.sin(elapsed * 0.45 + i) * 0.025) % 0.52));
        const sw = 42 + Math.sin(elapsed * 0.9 + i * 1.7) * 18;
        ctx.fillStyle = isNight
          ? `rgba(218, 232, 255, ${shimmerAlpha})`
          : isDusk
            ? `rgba(255, 212, 150, ${shimmerAlpha})`
            : `rgba(255, 252, 240, ${shimmerAlpha})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw, 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2. Ambient sakura petals (day/dusk) & glowing fireflies (dusk/night)
      const windBoost = curWeather === 'gale' ? 2.8 : curWeather === 'breeze' ? 1.55 : 1;
      for (const p of ambientParticles) {
        if (p.kind === 'petal') {
          if (curWeather === 'heavy-rain' || curWeather === 'thunderstorm') continue;
          const vis = clamp01(curLight.dayOpacity * 0.85 + curLight.duskOpacity * 0.65 + curLight.nightOpacity * 0.12);
          if (vis < 0.05) continue;
          p.x += (p.vx * windBoost + Math.sin(elapsed * p.speed + p.phase) * 14) * dt;
          p.y += (p.vy + Math.cos(elapsed * p.speed * 0.8 + p.phase) * 5) * dt;
          if (p.x > width + 16) p.x = -12;
          if (p.y > height + 16) {
            p.y = -12;
            p.x = Math.random() * width;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(elapsed * 0.9 + p.phase);
          ctx.globalAlpha = p.alpha * vis * 0.72;
          ctx.fillStyle = p.hue;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.72, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Bioluminescent fireflies at dusk/night, sunlit dust motes during day
          const fireflyVis = clamp01(curLight.nightOpacity * 0.95 + curLight.duskOpacity * 0.55);
          const moteVis = clamp01(curLight.dayOpacity * 0.45);
          const vis = Math.max(fireflyVis, moteVis);
          if (vis < 0.05) continue;

          p.x += Math.sin(elapsed * 0.55 * p.speed + p.phase) * 16 * dt;
          p.y += Math.cos(elapsed * 0.48 * p.speed + p.phase * 1.3) * 11 * dt;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < height * 0.16) p.y = height * 0.82;
          if (p.y > height * 0.92) p.y = height * 0.25;

          const pulse = 0.45 + 0.55 * Math.sin(elapsed * 2.1 * p.speed + p.phase);
          const r = fireflyVis > moteVis ? p.size * 2.4 : p.size * 1.5;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
          if (fireflyVis > moteVis) {
            grad.addColorStop(0, `rgba(255, 240, 178, ${(0.85 * pulse * vis).toFixed(3)})`);
            grad.addColorStop(0.45, `rgba(244, 212, 128, ${(0.32 * pulse * vis).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(244, 212, 128, 0)');
          } else {
            grad.addColorStop(0, `rgba(255, 250, 232, ${(0.55 * pulse * vis).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(255, 250, 232, 0)');
          }
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Weather overlays (Rain / Thunderstorm / Mist / Morning Fog / Rainbow)
      if (curWeather === 'light-rain' || curWeather === 'heavy-rain' || curWeather === 'thunderstorm') {
        const density = curWeather === 'light-rain' ? 0.45 : 1;
        const limit = Math.floor(weatherParticles.length * density);
        ctx.save();
        ctx.strokeStyle = isNight ? 'rgba(204, 222, 245, 0.34)' : 'rgba(245, 250, 255, 0.42)';
        ctx.lineWidth = curWeather === 'light-rain' ? 0.9 : 1.15;
        ctx.beginPath();
        for (let i = 0; i < limit; i++) {
          const r = weatherParticles[i];
          const speedMul = curWeather === 'light-rain' ? 0.72 : 1.15;
          r.x += r.vx * speedMul * dt;
          r.y += r.vy * speedMul * dt;
          if (r.y > height + 20) {
            r.y = -20 - Math.random() * 40;
            r.x = Math.random() * (width + 120);
          }
          if (r.x < -40) r.x = width + 40;
          const len = curWeather === 'light-rain' ? 11 : 17;
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x - len * 0.14, r.y + len);
        }
        ctx.stroke();
        ctx.restore();

        if (curWeather === 'thunderstorm') {
          if (lightningFlash <= 0 && Math.random() < dt * 0.16) {
            lightningFlash = 0.28;
          }
          if (lightningFlash > 0) {
            ctx.fillStyle = `rgba(220, 235, 255, ${lightningFlash.toFixed(3)})`;
            ctx.fillRect(0, 0, width, height);
            lightningFlash = Math.max(0, lightningFlash - dt * 1.4);
          }
        }
      } else if (curWeather === 'light-mist' || curWeather === 'morning-fog') {
        const mistAlpha = curWeather === 'morning-fog' ? 0.32 : 0.18;
        const mistGrad = ctx.createLinearGradient(0, height * 0.32, 0, height * 0.95);
        mistGrad.addColorStop(0, 'rgba(232, 238, 240, 0)');
        mistGrad.addColorStop(0.55, isNight ? `rgba(175, 195, 215, ${(mistAlpha * 0.75).toFixed(2)})` : `rgba(246, 245, 240, ${mistAlpha.toFixed(2)})`);
        mistGrad.addColorStop(1, isNight ? `rgba(160, 182, 204, ${(mistAlpha * 0.9).toFixed(2)})` : `rgba(242, 240, 234, ${(mistAlpha * 1.1).toFixed(2)})`);
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, height * 0.32, width, height * 0.68);
      } else if (curWeather === 'rainbow' && !isNight) {
        ctx.save();
        const cx = width * 0.52;
        const cy = height * 0.72;
        const radius = Math.min(width, height) * 0.56;
        const bands = [
          'rgba(255, 120, 120, 0.09)',
          'rgba(255, 186, 110, 0.09)',
          'rgba(255, 240, 130, 0.08)',
          'rgba(130, 230, 175, 0.08)',
          'rgba(130, 195, 255, 0.08)',
          'rgba(175, 145, 255, 0.07)',
        ];
        bands.forEach((color, idx) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(cx, cy, radius - idx * 6.5, Math.PI * 1.12, Math.PI * 1.88);
          ctx.stroke();
        });
        ctx.restore();
      }

      // 4. Graceful ambient ONE Spirit butterfly when playing music or AI is responding
      if (musicRef.current || aiActiveRef.current) {
        const cx = width * 0.5 + Math.cos(elapsed * (musicRef.current ? 1.15 : 0.65)) * Math.min(82, width * 0.16);
        const cy = height * 0.44 + Math.sin(elapsed * (musicRef.current ? 1.7 : 1.0)) * 22;
        const flap = Math.abs(Math.sin(elapsed * 8.5));
        const wingW = 7 + flap * 7;

        ctx.save();
        ctx.translate(cx, cy);
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        halo.addColorStop(0, 'rgba(248, 224, 168, 0.38)');
        halo.addColorStop(1, 'rgba(248, 224, 168, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();

        // Delicate translucent wings
        ctx.fillStyle = isNight ? 'rgba(245, 226, 178, 0.88)' : 'rgba(255, 246, 224, 0.92)';
        ctx.beginPath();
        ctx.ellipse(-wingW * 0.55, -2, wingW * 0.65, 5.2, -0.35, 0, Math.PI * 2);
        ctx.ellipse(wingW * 0.55, -2, wingW * 0.65, 5.2, 0.35, 0, Math.PI * 2);
        ctx.ellipse(-wingW * 0.42, 4, wingW * 0.46, 3.6, 0.25, 0, Math.PI * 2);
        ctx.ellipse(wingW * 0.42, 4, wingW * 0.46, 3.6, -0.25, 0, Math.PI * 2);
        ctx.fill();

        // Floating music note above butterfly when music is playing
        if (musicRef.current) {
          const noteLift = (elapsed * 18) % 24;
          const noteAlpha = Math.sin((noteLift / 24) * Math.PI) * 0.9;
          ctx.fillStyle = `rgba(255, 244, 214, ${noteAlpha.toFixed(3)})`;
          ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('♪', Math.sin(elapsed * 2.4) * 5, -14 - noteLift);
        }
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Weather color grading filter so Overcast/Rain/Storm/Mist subtly shift atmosphere naturally
  const weatherFilter =
    weather === 'thunderstorm'
      ? 'brightness(0.76) saturate(0.84) contrast(1.06)'
      : weather === 'heavy-rain'
        ? 'brightness(0.84) saturate(0.88)'
        : weather === 'light-rain' || weather === 'overcast'
          ? 'brightness(0.92) saturate(0.92)'
          : weather === 'after-rain' || weather === 'rainbow'
            ? 'brightness(1.03) saturate(1.06)'
            : weather === 'morning-fog' || weather === 'light-mist'
              ? 'brightness(0.98) saturate(0.86) contrast(0.94)'
              : 'none';

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 overflow-hidden bg-[#0c141d] select-none"
      aria-label="EARTH ONE HD Garden Sanctuary"
    >
      {/* Photorealistic 3-phase Day / Dusk / Night Crossfade Stack */}
      <div
        ref={parallaxLayerRef}
        className="absolute inset-0 will-change-transform"
        style={{
          transform: 'scale(1.045)',
          filter: weatherFilter,
          transition: 'filter 900ms ease',
        }}
      >
        <img
          src={gardenNightImg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000"
          style={{ opacity: 1 }}
        />
        <img
          src={gardenDuskImg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000"
          style={{ opacity: lighting.duskOpacity + lighting.dayOpacity * 0.25 }}
        />
        <img
          src={gardenDayImg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000"
          style={{ opacity: lighting.dayOpacity }}
        />
      </div>

      {/* Live Atmospheric Canvas Overlay (petals, fireflies, pond shimmer, weather, music butterfly) */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Architectural Top & Bottom Contrast Scrims for Effortless Apple-Grade UI Legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background:
            lighting.daylight > 0.45
              ? 'linear-gradient(180deg, rgba(16, 26, 22, 0.26) 0%, rgba(16, 26, 22, 0.06) 55%, rgba(16, 26, 22, 0) 100%)'
              : 'linear-gradient(180deg, rgba(6, 11, 18, 0.48) 0%, rgba(6, 11, 18, 0.14) 55%, rgba(6, 11, 18, 0) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
        style={{
          background:
            lighting.daylight > 0.45
              ? 'linear-gradient(0deg, rgba(12, 20, 17, 0.46) 0%, rgba(12, 20, 17, 0.16) 48%, rgba(12, 20, 17, 0) 100%)'
              : 'linear-gradient(0deg, rgba(6, 10, 16, 0.66) 0%, rgba(6, 10, 16, 0.24) 52%, rgba(6, 10, 16, 0) 100%)',
        }}
      />
    </div>
  );
};

export default HDParadiseSanctuary;
