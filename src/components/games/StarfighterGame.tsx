import React, { useEffect, useRef, useState, useCallback } from 'react';
import { soundSynth } from './soundSynth.ts';
import {
  Rocket,
  Shield,
  Zap,
  RotateCcw,
  Trophy,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Flame,
  Bomb
} from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  color: string;
  points: number;
  rotation: number;
  vRot: number;
  isAlien?: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'shield' | 'spread' | 'bomb';
  radius: number;
}

export const StarfighterGame: React.FC<{ lang?: string }> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('earth_one_starfighter_hiscore') || '0', 10);
    } catch {
      return 0;
    }
  });
  const [shieldHp, setShieldHp] = useState(100);
  const [wave, setWave] = useState(1);
  const [bombs, setBombs] = useState(2);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameOver, setGameOver] = useState(false);

  // Keyboard state
  const keysRef = useRef<{ left: boolean; right: boolean; up: boolean; down: boolean; fire: boolean }>({
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false
  });

  // Game internal state ref
  const stateRef = useRef<{
    player: { x: number; y: number; vx: number; vy: number; width: number; height: number; weaponType: 'single' | 'dual' | 'triple'; weaponTimer: number };
    bullets: Bullet[];
    asteroids: Asteroid[];
    particles: Particle[];
    powerups: PowerUp[];
    stars: { x: number; y: number; speed: number; radius: number; alpha: number }[];
    lastFireTime: number;
    lastSpawnTime: number;
    score: number;
    shieldHp: number;
    bombs: number;
    wave: number;
  }>({
    player: { x: 300, y: 500, vx: 0, vy: 0, width: 34, height: 42, weaponType: 'single', weaponTimer: 0 },
    bullets: [],
    asteroids: [],
    particles: [],
    powerups: [],
    stars: [],
    lastFireTime: 0,
    lastSpawnTime: 0,
    score: 0,
    shieldHp: 100,
    bombs: 2,
    wave: 1
  });

  // Sound sync
  useEffect(() => {
    soundSynth.enabled = soundEnabled;
  }, [soundEnabled]);

  // Handle key events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'KeyA', 'a'].includes(e.code) || ['ArrowLeft', 'KeyA', 'a'].includes(e.key)) keysRef.current.left = true;
      if (['ArrowRight', 'KeyD', 'd'].includes(e.code) || ['ArrowRight', 'KeyD', 'd'].includes(e.key)) keysRef.current.right = true;
      if (['ArrowUp', 'KeyW', 'w'].includes(e.code) || ['ArrowUp', 'KeyW', 'w'].includes(e.key)) keysRef.current.up = true;
      if (['ArrowDown', 'KeyS', 's'].includes(e.code) || ['ArrowDown', 'KeyS', 's'].includes(e.key)) keysRef.current.down = true;
      if (['Space'].includes(e.code) || e.key === ' ') {
        e.preventDefault();
        keysRef.current.fire = true;
      }
      if (['KeyB', 'b'].includes(e.key)) {
        triggerNovaBomb();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'KeyA', 'a'].includes(e.code) || ['ArrowLeft', 'KeyA', 'a'].includes(e.key)) keysRef.current.left = false;
      if (['ArrowRight', 'KeyD', 'd'].includes(e.code) || ['ArrowRight', 'KeyD', 'd'].includes(e.key)) keysRef.current.right = false;
      if (['ArrowUp', 'KeyW', 'w'].includes(e.code) || ['ArrowUp', 'KeyW', 'w'].includes(e.key)) keysRef.current.up = false;
      if (['ArrowDown', 'KeyS', 's'].includes(e.code) || ['ArrowDown', 'KeyS', 's'].includes(e.key)) keysRef.current.down = false;
      if (['Space'].includes(e.code) || e.key === ' ') keysRef.current.fire = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Init stars
  const initStars = (width: number, height: number) => {
    const stars = [];
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.5 + Math.random() * 2.2,
        radius: Math.random() < 0.2 ? 1.5 : 0.8,
        alpha: 0.2 + Math.random() * 0.8
      });
    }
    stateRef.current.stars = stars;
  };

  const startGame = () => {
    const canvas = canvasRef.current;
    const width = canvas ? canvas.width : 600;
    const height = canvas ? canvas.height : 600;

    initStars(width, height);
    stateRef.current = {
      player: { x: width / 2, y: height - 80, vx: 0, vy: 0, width: 34, height: 42, weaponType: 'single', weaponTimer: 0 },
      bullets: [],
      asteroids: [],
      particles: [],
      powerups: [],
      stars: stateRef.current.stars,
      lastFireTime: 0,
      lastSpawnTime: 0,
      score: 0,
      shieldHp: 100,
      bombs: 2,
      wave: 1
    };

    setScore(0);
    setShieldHp(100);
    setWave(1);
    setBombs(2);
    setGameOver(false);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const triggerNovaBomb = () => {
    if (stateRef.current.bombs <= 0 || !isPlaying || isPaused) return;
    stateRef.current.bombs -= 1;
    setBombs(stateRef.current.bombs);
    soundSynth.playExplosion();

    // Destroy all asteroids on screen
    const canvas = canvasRef.current;
    if (!canvas) return;

    for (let i = 0; i < 60; i++) {
      stateRef.current.particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        radius: 2 + Math.random() * 4,
        color: '#38bdf8',
        alpha: 1,
        decay: 0.02
      });
    }

    stateRef.current.score += stateRef.current.asteroids.length * 50;
    setScore(stateRef.current.score);
    stateRef.current.asteroids = [];
  };

  // Main Game Loop
  useEffect(() => {
    if (!isPlaying || isPaused) return;

    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fireBullet = (now: number) => {
      const p = stateRef.current.player;
      soundSynth.playLaser();
      if (p.weaponType === 'single') {
        stateRef.current.bullets.push({
          x: p.x,
          y: p.y - 20,
          vx: 0,
          vy: -9,
          radius: 3,
          color: '#38bdf8'
        });
      } else if (p.weaponType === 'dual') {
        stateRef.current.bullets.push(
          { x: p.x - 10, y: p.y - 18, vx: 0, vy: -9.5, radius: 3, color: '#38bdf8' },
          { x: p.x + 10, y: p.y - 18, vx: 0, vy: -9.5, radius: 3, color: '#38bdf8' }
        );
      } else {
        // Triple Spread
        stateRef.current.bullets.push(
          { x: p.x, y: p.y - 20, vx: 0, vy: -10, radius: 3.5, color: '#f43f5e' },
          { x: p.x - 12, y: p.y - 15, vx: -2.5, vy: -9, radius: 3, color: '#fbbf24' },
          { x: p.x + 12, y: p.y - 15, vx: 2.5, vy: -9, radius: 3, color: '#fbbf24' }
        );
      }
      stateRef.current.lastFireTime = now;
    };

    const spawnAsteroid = () => {
      const isAlien = Math.random() < 0.25;
      const radius = isAlien ? 18 : 15 + Math.random() * 25;
      const x = radius + Math.random() * (canvas.width - radius * 2);
      const hp = isAlien ? 3 : Math.ceil(radius / 10);

      stateRef.current.asteroids.push({
        x,
        y: -radius - 10,
        vx: (Math.random() - 0.5) * 1.8,
        vy: 1.2 + Math.random() * 2.2 + stateRef.current.wave * 0.3,
        radius,
        hp,
        maxHp: hp,
        color: isAlien ? '#e11d48' : '#78716c',
        points: isAlien ? 100 : Math.round(radius * 3),
        rotation: 0,
        vRot: (Math.random() - 0.5) * 0.05,
        isAlien
      });
    };

    const update = () => {
      const now = performance.now();
      const s = stateRef.current;
      const p = s.player;

      // Player Movement
      const ACCEL = 0.6;
      const FRICTION = 0.90;
      const MAX_SPEED = 6.5;

      if (keysRef.current.left) p.vx -= ACCEL;
      if (keysRef.current.right) p.vx += ACCEL;
      if (keysRef.current.up) p.vy -= ACCEL;
      if (keysRef.current.down) p.vy += ACCEL;

      p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx * FRICTION));
      p.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vy * FRICTION));

      p.x += p.vx;
      p.y += p.vy;

      // Bound player inside canvas
      p.x = Math.max(p.width / 2, Math.min(canvas.width - p.width / 2, p.x));
      p.y = Math.max(p.height / 2, Math.min(canvas.height - p.height / 2, p.y));

      // Thruster flame particles
      if (Math.random() < 0.7) {
        s.particles.push({
          x: p.x + (Math.random() - 0.5) * 8,
          y: p.y + p.height / 2,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 3 + Math.random() * 3,
          radius: 2 + Math.random() * 2,
          color: Math.random() < 0.5 ? '#38bdf8' : '#f59e0b',
          alpha: 0.9,
          decay: 0.04
        });
      }

      // Weapon timer cooldown
      if (p.weaponTimer > 0) {
        p.weaponTimer -= 1;
        if (p.weaponTimer <= 0) p.weaponType = 'single';
      }

      // Auto/Hold Fire
      const fireInterval = p.weaponType === 'triple' ? 140 : 180;
      if (keysRef.current.fire && now - s.lastFireTime > fireInterval) {
        fireBullet(now);
      }

      // Spawn Asteroids
      const spawnInterval = Math.max(600, 1500 - s.wave * 120);
      if (now - s.lastSpawnTime > spawnInterval) {
        spawnAsteroid();
        s.lastSpawnTime = now;
      }

      // Update Stars
      for (const star of s.stars) {
        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
      }

      // Update Bullets
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.y < -10 || b.x < -10 || b.x > canvas.width + 10) {
          s.bullets.splice(i, 1);
        }
      }

      // Update Powerups
      for (let i = s.powerups.length - 1; i >= 0; i--) {
        const pw = s.powerups[i];
        pw.y += pw.vy;

        // Pickup collision
        const dist = Math.hypot(pw.x - p.x, pw.y - p.y);
        if (dist < pw.radius + p.width / 2) {
          soundSynth.playPowerup();
          if (pw.type === 'shield') {
            s.shieldHp = Math.min(100, s.shieldHp + 35);
            setShieldHp(s.shieldHp);
          } else if (pw.type === 'spread') {
            p.weaponType = 'triple';
            p.weaponTimer = 450; // frames
          } else if (pw.type === 'bomb') {
            s.bombs = Math.min(5, s.bombs + 1);
            setBombs(s.bombs);
          }
          s.powerups.splice(i, 1);
          continue;
        }

        if (pw.y > canvas.height + 20) {
          s.powerups.splice(i, 1);
        }
      }

      // Update Asteroids & Bullet Collisions
      for (let aIdx = s.asteroids.length - 1; aIdx >= 0; aIdx--) {
        const ast = s.asteroids[aIdx];
        ast.x += ast.vx;
        ast.y += ast.vy;
        ast.rotation += ast.vRot;

        // Bounce horizontally on edges
        if (ast.x - ast.radius < 0 || ast.x + ast.radius > canvas.width) {
          ast.vx = -ast.vx;
        }

        // Bullet vs Asteroid collision
        for (let bIdx = s.bullets.length - 1; bIdx >= 0; bIdx--) {
          const b = s.bullets[bIdx];
          const dist = Math.hypot(ast.x - b.x, ast.y - b.y);
          if (dist < ast.radius + b.radius) {
            // Hit!
            s.bullets.splice(bIdx, 1);
            ast.hp -= 1;

            // Sparks
            for (let k = 0; k < 4; k++) {
              s.particles.push({
                x: b.x,
                y: b.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                radius: 1.5,
                color: '#38bdf8',
                alpha: 0.9,
                decay: 0.05
              });
            }

            if (ast.hp <= 0) {
              soundSynth.playExplosion();
              s.score += ast.points;
              setScore(s.score);

              // Wave progression
              const newWave = Math.floor(s.score / 500) + 1;
              if (newWave !== s.wave) {
                s.wave = newWave;
                setWave(newWave);
              }

              // Debris explosion particles
              for (let k = 0; k < 12; k++) {
                s.particles.push({
                  x: ast.x,
                  y: ast.y,
                  vx: (Math.random() - 0.5) * 6,
                  vy: (Math.random() - 0.5) * 6,
                  radius: 2 + Math.random() * 3,
                  color: ast.isAlien ? '#f43f5e' : '#a8a29e',
                  alpha: 1,
                  decay: 0.03
                });
              }

              // Chance to drop powerup
              if (Math.random() < 0.2) {
                const types: ('shield' | 'spread' | 'bomb')[] = ['shield', 'spread', 'bomb'];
                const selectedType = types[Math.floor(Math.random() * types.length)];
                s.powerups.push({
                  x: ast.x,
                  y: ast.y,
                  vy: 1.5,
                  type: selectedType,
                  radius: 10
                });
              }

              s.asteroids.splice(aIdx, 1);
              break;
            }
          }
        }

        // Asteroid vs Player Collision
        if (s.asteroids[aIdx]) {
          const playerDist = Math.hypot(ast.x - p.x, ast.y - p.y);
          if (playerDist < ast.radius + p.width / 2.5) {
            // Player hit!
            soundSynth.playExplosion();
            const damage = ast.isAlien ? 30 : Math.round(ast.radius * 1.2);
            s.shieldHp -= damage;
            setShieldHp(Math.max(0, s.shieldHp));

            // Explosion effect
            for (let k = 0; k < 15; k++) {
              s.particles.push({
                x: ast.x,
                y: ast.y,
                vx: (Math.random() - 0.5) * 7,
                vy: (Math.random() - 0.5) * 7,
                radius: 3,
                color: '#f97316',
                alpha: 1,
                decay: 0.03
              });
            }

            s.asteroids.splice(aIdx, 1);

            if (s.shieldHp <= 0) {
              // Game Over
              setGameOver(true);
              setIsPlaying(false);
              if (s.score > highScore) {
                setHighScore(s.score);
                try {
                  localStorage.setItem('earth_one_starfighter_hiscore', String(s.score));
                } catch {}
              }
              return;
            }
          }
        }

        // Remove offscreen asteroids
        if (s.asteroids[aIdx] && s.asteroids[aIdx].y > canvas.height + 40) {
          s.asteroids.splice(aIdx, 1);
        }
      }

      // Update Particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= pt.decay;
        if (pt.alpha <= 0) {
          s.particles.splice(i, 1);
        }
      }

      // -------------------------------------------------------------
      // RENDER
      // -------------------------------------------------------------
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      for (const star of s.stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const pt of s.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Powerups
      for (const pw of s.powerups) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pw.x, pw.y, pw.radius, 0, Math.PI * 2);
        ctx.fillStyle = pw.type === 'shield' ? '#38bdf8' : pw.type === 'spread' ? '#f59e0b' : '#ec4899';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pw.type === 'shield' ? 'S' : pw.type === 'spread' ? '3X' : 'B', pw.x, pw.y);
        ctx.restore();
      }

      // Bullets
      for (const b of s.bullets) {
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Asteroids
      for (const ast of s.asteroids) {
        ctx.save();
        ctx.translate(ast.x, ast.y);
        ctx.rotate(ast.rotation);

        if (ast.isAlien) {
          // Alien drone rendering
          ctx.fillStyle = '#e11d48';
          ctx.shadowColor = '#e11d48';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -ast.radius);
          ctx.lineTo(ast.radius, ast.radius * 0.7);
          ctx.lineTo(0, ast.radius * 0.3);
          ctx.lineTo(-ast.radius, ast.radius * 0.7);
          ctx.closePath();
          ctx.fill();
          // Drone core
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Rocky asteroid
          ctx.fillStyle = '#44403c';
          ctx.strokeStyle = '#78716c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const sides = 8;
          for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const r = ast.radius * (0.8 + ((i % 3) * 0.15));
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        // HP bar for durable asteroids
        if (ast.maxHp > 1) {
          const hpWidth = ast.radius * 1.6;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(ast.x - hpWidth / 2, ast.y - ast.radius - 8, hpWidth, 3);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(ast.x - hpWidth / 2, ast.y - ast.radius - 8, hpWidth * (ast.hp / ast.maxHp), 3);
        }
      }

      // Player Spaceship
      ctx.save();
      ctx.translate(p.x, p.y);

      // Shield Aura
      if (s.shieldHp > 30) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ship body
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.moveTo(0, -p.height / 2);
      ctx.lineTo(p.width / 2, p.height / 2);
      ctx.lineTo(0, p.height / 3);
      ctx.lineTo(-p.width / 2, p.height / 2);
      ctx.closePath();
      ctx.fill();

      // Ship cockpit
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(0, -4, 4, 0, Math.PI * 2);
      ctx.fill();

      // Wing accents
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, isPaused, highScore]);

  // Touch controls helpers
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPlaying || isPaused || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    stateRef.current.player.x = touchX * scaleX;
    stateRef.current.player.y = Math.min(canvasRef.current.height - 40, touchY * scaleY);
    keysRef.current.fire = true;
  };

  const handleTouchEnd = () => {
    keysRef.current.fire = false;
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center space-y-4">
      {/* HUD Info Bar */}
      <div className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono">
            <Rocket className="w-4 h-4" />
            <span className="font-bold">STARFIGHTER</span>
          </div>
          <div className="text-slate-400">
            Wave: <span className="text-slate-100 font-bold font-mono">{wave}</span>
          </div>
          <div className="text-slate-400">
            Score: <span className="text-amber-400 font-bold font-mono text-sm">{score}</span>
          </div>
        </div>

        {/* Shield bar */}
        <div className="flex items-center space-x-2">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <div className="w-24 h-2.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all ${
                shieldHp > 50 ? 'bg-cyan-500' : shieldHp > 25 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.max(0, shieldHp)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-slate-300">{shieldHp}%</span>
        </div>

        {/* Bombs & Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={triggerNovaBomb}
            disabled={bombs <= 0 || !isPlaying}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              bombs > 0 && isPlaying
                ? 'bg-rose-600/80 hover:bg-rose-500 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title="Trigger Nova Bomb (Key B)"
          >
            <Bomb className="w-3.5 h-3.5" />
            <span>{bombs}</span>
          </button>

          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div
        className="relative rounded-2xl overflow-hidden border-2 border-slate-800 shadow-2xl bg-black"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={520}
          className="block max-w-full h-auto cursor-crosshair touch-none"
        />

        {/* Start / Game Over Overlay */}
        {(!isPlaying || gameOver) && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center shadow-cyan-500/20 shadow-xl">
              <Rocket className="w-8 h-8 text-cyan-400" />
            </div>

            {gameOver ? (
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-rose-400">Interception Failed</h3>
                <p className="text-xs text-slate-400">
                  Mission Score: <span className="font-mono text-cyan-300 font-bold">{score}</span> | Wave: <span className="font-mono text-slate-200">{wave}</span>
                </p>
                {score >= highScore && score > 0 && (
                  <div className="text-amber-400 text-xs font-bold flex items-center justify-center space-x-1 pt-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>New Galactic Record!</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-slate-100">Cosmic Starfighter</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Pilot the EARTH ONE deep space interceptor. Destroy asteroids, collect quantum powerups, and defend orbital satellites!
                </p>
              </div>
            )}

            <button
              onClick={startGame}
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-transform hover:scale-105 cursor-pointer flex items-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{gameOver ? 'Launch Again' : 'Start Mission'}</span>
            </button>

            <div className="text-[11px] text-slate-500 flex items-center space-x-4 pt-2">
              <span>⌨️ Keys: [W/A/S/D] or [Arrows] Move</span>
              <span>[Space] Shoot</span>
              <span>[B] Nova Bomb</span>
              <span>📱 Touch & Drag</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
