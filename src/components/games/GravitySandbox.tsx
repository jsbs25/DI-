import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../../types/index.ts';
import { Play, Pause, RotateCcw, Sparkles, Orbit, Plus, Info, Zap } from 'lucide-react';

interface GravityBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
  name: string;
  trail: { x: number; y: number }[];
}

interface GravitySandboxProps {
  lang: Language;
}

export const GravitySandbox: React.FC<GravitySandboxProps> = ({ lang }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [selectedBodyType, setSelectedBodyType] = useState<'star' | 'planet' | 'giant'>('planet');
  const [bodyCount, setBodyCount] = useState(0);
  const [spawnVector, setSpawnVector] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  const bodiesRef = useRef<GravityBody[]>([]);
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const timeSpeedRef = useRef(timeSpeed);
  timeSpeedRef.current = timeSpeed;

  const G = 1200; // Gravitational scaling constant

  // Load Presets
  const loadPreset = (preset: 'solar' | 'binary' | 'figure8' | 'chaos') => {
    const canvas = canvasRef.current;
    const w = canvas?.width || 800;
    const h = canvas?.height || 500;
    const cx = w / 2;
    const cy = h / 2;

    if (preset === 'solar') {
      bodiesRef.current = [
        {
          id: 'sun',
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          mass: 800,
          radius: 18,
          color: '#fbbf24',
          name: 'Sol (Sun)',
          trail: []
        },
        {
          id: 'mercury',
          x: cx + 70,
          y: cy,
          vx: 0,
          vy: 3.7,
          mass: 2,
          radius: 4,
          color: '#cbd5e1',
          name: 'Mercury',
          trail: []
        },
        {
          id: 'earth',
          x: cx + 130,
          y: cy,
          vx: 0,
          vy: 2.7,
          mass: 8,
          radius: 7,
          color: '#38bdf8',
          name: 'Earth',
          trail: []
        },
        {
          id: 'mars',
          x: cx + 180,
          y: cy,
          vx: 0,
          vy: 2.3,
          mass: 4,
          radius: 5.5,
          color: '#fb7185',
          name: 'Mars',
          trail: []
        },
        {
          id: 'jupiter',
          x: cx + 250,
          y: cy,
          vx: 0,
          vy: 1.95,
          mass: 35,
          radius: 12,
          color: '#fdba74',
          name: 'Jupiter',
          trail: []
        }
      ];
    } else if (preset === 'binary') {
      bodiesRef.current = [
        {
          id: 'starA',
          x: cx - 90,
          y: cy,
          vx: 0,
          vy: -1.7,
          mass: 500,
          radius: 15,
          color: '#38bdf8',
          name: 'Alpha Star',
          trail: []
        },
        {
          id: 'starB',
          x: cx + 90,
          y: cy,
          vx: 0,
          vy: 1.7,
          mass: 500,
          radius: 15,
          color: '#f43f5e',
          name: 'Beta Star',
          trail: []
        },
        {
          id: 'planet1',
          x: cx,
          y: cy + 220,
          vx: 2.3,
          vy: 0,
          mass: 5,
          radius: 6,
          color: '#a855f7',
          name: 'Circumbinary Planet',
          trail: []
        }
      ];
    } else if (preset === 'figure8') {
      // Classic 3-body choreographed figure-8 solution
      const m = 350;
      const vFac = 1.35;
      bodiesRef.current = [
        {
          id: 'body1',
          x: cx - 120,
          y: cy,
          vx: 0.46 * vFac,
          vy: 0.43 * vFac,
          mass: m,
          radius: 12,
          color: '#38bdf8',
          name: 'Body Alpha',
          trail: []
        },
        {
          id: 'body2',
          x: cx + 120,
          y: cy,
          vx: 0.46 * vFac,
          vy: 0.43 * vFac,
          mass: m,
          radius: 12,
          color: '#34d399',
          name: 'Body Beta',
          trail: []
        },
        {
          id: 'body3',
          x: cx,
          y: cy,
          vx: -2 * 0.46 * vFac,
          vy: -2 * 0.43 * vFac,
          mass: m,
          radius: 12,
          color: '#fbbf24',
          name: 'Body Gamma',
          trail: []
        }
      ];
    } else if (preset === 'chaos') {
      const colors = ['#38bdf8', '#34d399', '#f43f5e', '#a855f7', '#fbbf24', '#cbd5e1'];
      bodiesRef.current = [
        {
          id: 'core',
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          mass: 1200,
          radius: 20,
          color: '#f59e0b',
          name: 'Supermassive Core',
          trail: []
        }
      ];
      for (let i = 0; i < 7; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 200;
        const orbSpeed = Math.sqrt((G * 1200) / dist) * 0.05 * (0.8 + Math.random() * 0.4);
        bodiesRef.current.push({
          id: `chaos_${i}`,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: -Math.sin(angle) * orbSpeed,
          vy: Math.cos(angle) * orbSpeed,
          mass: 2 + Math.random() * 15,
          radius: 4 + Math.random() * 5,
          color: colors[i % colors.length],
          name: `Protoplanet ${i + 1}`,
          trail: []
        });
      }
    }
    setBodyCount(bodiesRef.current.length);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = Math.max(480, Math.min(600, window.innerHeight * 0.55));
    };
    resize();
    window.addEventListener('resize', resize);

    loadPreset('solar');

    let animId = 0;
    const ctx = canvas.getContext('2d')!;

    const render = () => {
      animId = requestAnimationFrame(render);
      const dt = 0.5 * timeSpeedRef.current;

      // Semi-transparent clear for subtle phosphor persistence
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw faint coordinate grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      const step = 60;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      const bodies = bodiesRef.current;

      // Physics update if running
      if (isRunningRef.current) {
        // N-body gravity calculations
        for (let i = 0; i < bodies.length; i++) {
          let fx = 0;
          let fy = 0;
          const b1 = bodies[i];

          for (let j = 0; j < bodies.length; j++) {
            if (i === j) continue;
            const b2 = bodies[j];
            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const distSq = dx * dx + dy * dy + 100; // Softening parameter to prevent infinities
            const dist = Math.sqrt(distSq);

            const force = (G * b1.mass * b2.mass) / distSq;
            fx += force * (dx / dist);
            fy += force * (dy / dist);

            // Collision check & merge
            if (dist < b1.radius + b2.radius && b1.mass >= b2.mass) {
              // Merge momentum
              b1.vx = (b1.vx * b1.mass + b2.vx * b2.mass) / (b1.mass + b2.mass);
              b1.vy = (b1.vy * b1.mass + b2.vy * b2.mass) / (b1.mass + b2.mass);
              b1.mass += b2.mass;
              b1.radius = Math.min(30, Math.sqrt(b1.radius * b1.radius + b2.radius * b2.radius));
              bodies.splice(j, 1);
              j--;
              setBodyCount(bodies.length);
            }
          }

          const ax = fx / b1.mass;
          const ay = fy / b1.mass;
          b1.vx += ax * dt;
          b1.vy += ay * dt;
        }

        // Apply velocities and record trail
        for (const b of bodies) {
          b.x += b1Velocity(b.vx, dt);
          b.y += b1Velocity(b.vy, dt);

          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 55) {
            b.trail.shift();
          }
        }
      }

      function b1Velocity(v: number, d: number) {
        return v * d;
      }

      // Draw Orbit Trails
      for (const b of bodies) {
        if (b.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(b.trail[0].x, b.trail[0].y);
          for (let i = 1; i < b.trail.length; i++) {
            ctx.lineTo(b.trail[i].x, b.trail[i].y);
          }
          ctx.strokeStyle = b.color;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }

      // Draw Celestial Bodies
      for (const b of bodies) {
        // Outer glow
        const glow = ctx.createRadialGradient(b.x, b.y, b.radius * 0.3, b.x, b.y, b.radius * 2.8);
        glow.addColorStop(0, b.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Solid core
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x, b.y + b.radius + 12);
      }

      // Draw active drag vector when user is spawning
      if (spawnVector) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(spawnVector.startX, spawnVector.startY);
        ctx.lineTo(spawnVector.curX, spawnVector.curY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Preview spawn ball
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(spawnVector.startX, spawnVector.startY, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Mouse & Touch interaction for spawning bodies
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSpawnVector({ startX: x, startY: y, curX: x, curY: y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!spawnVector) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpawnVector({
      ...spawnVector,
      curX: e.clientX - rect.left,
      curY: e.clientY - rect.top
    });
  };

  const handlePointerUp = () => {
    if (!spawnVector) return;

    // Velocity proportional to drag distance and direction
    const vx = (spawnVector.curX - spawnVector.startX) * 0.04;
    const vy = (spawnVector.curY - spawnVector.startY) * 0.04;

    const configs = {
      star: { mass: 700, radius: 16, color: '#fbbf24', name: 'New Star' },
      planet: { mass: 10, radius: 6.5, color: '#38bdf8', name: 'New Planet' },
      giant: { mass: 65, radius: 13, color: '#c084fc', name: 'Gas Giant' }
    };
    const cfg = configs[selectedBodyType];

    bodiesRef.current.push({
      id: `spawn_${Date.now()}`,
      x: spawnVector.startX,
      y: spawnVector.startY,
      vx,
      vy,
      mass: cfg.mass,
      radius: cfg.radius,
      color: cfg.color,
      name: cfg.name,
      trail: []
    });

    setSpawnVector(null);
    setBodyCount(bodiesRef.current.length);
  };

  return (
    <div className="w-full rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex flex-col space-y-4 p-5 sm:p-6">
      {/* Top Header & Presets Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
            <Orbit className="w-4 h-4" />
            <span>N-BODY ORBITAL MECHANICS SANDBOX</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Cosmic Gravitational Sandbox</h2>
          <p className="text-xs text-slate-400">
            Click & drag anywhere to launch custom celestial bodies with orbital momentum.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadPreset('solar')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            Solar System
          </button>
          <button
            onClick={() => loadPreset('binary')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            Binary Stars
          </button>
          <button
            onClick={() => loadPreset('figure8')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            Figure-8 Solution
          </button>
          <button
            onClick={() => loadPreset('chaos')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            Protoplanet Chaos
          </button>
        </div>
      </div>

      {/* Physics Canvas */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950 shadow-inner">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full cursor-crosshair touch-none select-none"
        />

        {/* Floating Controls Overlay */}
        <div className="absolute top-3 left-3 flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <span className="text-slate-400">Active Bodies:</span>
          <span className="font-mono font-bold text-cyan-400">{bodyCount}</span>
        </div>

        <div className="absolute top-3 right-3 flex items-center space-x-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer shadow-lg transition-colors"
            title={isRunning ? 'Pause Simulation' : 'Resume Simulation'}
          >
            {isRunning ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            onClick={() => {
              bodiesRef.current = [];
              setBodyCount(0);
            }}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 cursor-pointer shadow-lg transition-colors"
            title="Clear all bodies"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Spawn Bar & Speed Tuning */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">Spawn Type:</span>
          <button
            onClick={() => setSelectedBodyType('planet')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              selectedBodyType === 'planet'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            🌍 Terrestrial Planet (Mass 10)
          </button>
          <button
            onClick={() => setSelectedBodyType('giant')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              selectedBodyType === 'giant'
                ? 'bg-purple-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            🪐 Gas Giant (Mass 65)
          </button>
          <button
            onClick={() => setSelectedBodyType('star')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              selectedBodyType === 'star'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            ☀️ Stellar Mass (Mass 700)
          </button>
        </div>

        {/* Warp Speed Multiplier */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Time Warp:</span>
          {[0.5, 1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => setTimeSpeed(s)}
              className={`px-2.5 py-1 rounded-lg font-mono cursor-pointer transition-all ${
                timeSpeed === s
                  ? 'bg-cyan-950 border border-cyan-500 text-cyan-300 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
