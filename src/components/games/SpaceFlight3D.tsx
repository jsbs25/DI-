import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import { Play, RotateCcw, Volume2, VolumeX, Shield, Award, Sparkles, Zap, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';

interface SpaceFlight3DProps {
  lang: Language;
}

export const SpaceFlight3D: React.FC<SpaceFlight3DProps> = ({ lang }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('earth_one_space_highscore') || '0', 10);
    } catch {
      return 0;
    }
  });
  const [shields, setShields] = useState(100);
  const [distanceAU, setDistanceAU] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Audio Context ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSynthSound = (type: 'collect' | 'hit' | 'boost' | 'gameover') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'collect') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'gameover') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.6);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch {
      // Audio fallback silent
    }
  };

  // Game internal state ref
  const gameRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    ship: null as THREE.Group | null,
    asteroids: [] as { mesh: THREE.Mesh; rotSpeed: THREE.Vector3; speed: number }[],
    crystals: [] as { mesh: THREE.Mesh; rotSpeed: number }[],
    starField: null as THREE.Points | null,
    shipPos: { x: 0, y: 0 },
    keys: { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, KeyA: false, KeyD: false, KeyW: false, KeyS: false },
    score: 0,
    shields: 100,
    distance: 0,
    animFrame: 0,
    lastTime: performance.now()
  });

  // Touch control helper
  const handleTouchDir = (dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) => {
    if (dir === 'left') gameRef.current.keys.ArrowLeft = pressed;
    if (dir === 'right') gameRef.current.keys.ArrowRight = pressed;
    if (dir === 'up') gameRef.current.keys.ArrowUp = pressed;
    if (dir === 'down') gameRef.current.keys.ArrowDown = pressed;
  };

  const startGame = () => {
    setIsPlaying(true);
    setIsGameOver(false);
    setScore(0);
    setShields(100);
    setDistanceAU(0);
    gameRef.current.score = 0;
    gameRef.current.shields = 100;
    gameRef.current.distance = 0;
    gameRef.current.shipPos = { x: 0, y: 0 };
    // clear asteroids
    gameRef.current.asteroids.forEach(a => gameRef.current.scene?.remove(a.mesh));
    gameRef.current.asteroids = [];
    gameRef.current.crystals.forEach(c => gameRef.current.scene?.remove(c.mesh));
    gameRef.current.crystals = [];
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.015);
    gameRef.current.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, -10);
    gameRef.current.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    gameRef.current.renderer = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x38bdf8, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Deep space stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 200;
      starPos[i + 1] = (Math.random() - 0.5) * 200;
      starPos[i + 2] = -Math.random() * 250;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.8, transparent: true, opacity: 0.8 });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
    gameRef.current.starField = starField;

    // Construct Player Ship Orion-X
    const shipGroup = new THREE.Group();

    // Hull (fuselage)
    const bodyGeo = new THREE.ConeGeometry(0.8, 3.2, 5);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x0369a1,
      emissiveIntensity: 0.2
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    shipGroup.add(bodyMesh);

    // Cockpit Canopy
    const cockpitGeo = new THREE.SphereGeometry(0.35, 16, 16);
    cockpitGeo.scale(1, 0.6, 1.8);
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.6
    });
    const cockpitMesh = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpitMesh.position.set(0, 0.35, 0.2);
    shipGroup.add(cockpitMesh);

    // Delta Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(2.2, -1.2);
    wingShape.lineTo(0.4, -1.0);
    wingShape.lineTo(0, 0);
    const wingExtrude = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02 });
    wingExtrude.center();
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    const leftWing = new THREE.Mesh(wingExtrude, wingMat);
    leftWing.rotation.x = Math.PI / 2;
    leftWing.position.set(-1.1, 0, 0.4);
    shipGroup.add(leftWing);

    const rightWing = leftWing.clone();
    rightWing.scale.set(-1, 1, 1);
    rightWing.position.set(1.1, 0, 0.4);
    shipGroup.add(rightWing);

    // Glowing Thruster
    const thrusterGeo = new THREE.CylinderGeometry(0.2, 0.35, 0.5, 12);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const thrusterMesh = new THREE.Mesh(thrusterGeo, thrusterMat);
    thrusterMesh.position.set(0, 0, 1.6);
    shipGroup.add(thrusterMesh);

    // Plasma plume
    const plumeGeo = new THREE.ConeGeometry(0.25, 1.2, 8);
    plumeGeo.rotateX(-Math.PI / 2);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 });
    const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
    plumeMesh.position.set(0, 0, 2.2);
    shipGroup.add(plumeMesh);

    scene.add(shipGroup);
    gameRef.current.ship = shipGroup;

    // Key listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code in gameRef.current.keys) {
        (gameRef.current.keys as Record<string, boolean>)[e.code] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code in gameRef.current.keys) {
        (gameRef.current.keys as Record<string, boolean>)[e.code] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let lastSpawnAsteroid = 0;
    let lastSpawnCrystal = 0;

    const animate = (time: number) => {
      gameRef.current.animFrame = requestAnimationFrame(animate);

      const delta = Math.min((time - gameRef.current.lastTime) / 1000, 0.1);
      gameRef.current.lastTime = time;

      // Move stars toward camera to create hyperspace effect
      if (starField) {
        const positions = (starField.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 2; i < positions.length; i += 3) {
          positions[i] += delta * 60;
          if (positions[i] > 10) {
            positions[i] = -250;
          }
        }
        starField.geometry.attributes.position.needsUpdate = true;
      }

      // Ship controls
      const keys = gameRef.current.keys;
      const speed = 14 * delta;
      const boundsX = 9.5;
      const boundsY = 5.5;

      let moveX = 0;
      let moveY = 0;
      if (keys.ArrowLeft || keys.KeyA) moveX -= 1;
      if (keys.ArrowRight || keys.KeyD) moveX += 1;
      if (keys.ArrowUp || keys.KeyW) moveY += 1;
      if (keys.ArrowDown || keys.KeyS) moveY -= 1;

      gameRef.current.shipPos.x = THREE.MathUtils.clamp(gameRef.current.shipPos.x + moveX * speed, -boundsX, boundsX);
      gameRef.current.shipPos.y = THREE.MathUtils.clamp(gameRef.current.shipPos.y + moveY * speed, -boundsY, boundsY);

      if (shipGroup) {
        shipGroup.position.x = gameRef.current.shipPos.x;
        shipGroup.position.y = gameRef.current.shipPos.y;
        // Bank roll when turning
        const targetRoll = -moveX * 0.45;
        const targetPitch = moveY * 0.25;
        shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, targetRoll, 0.15);
        shipGroup.rotation.x = THREE.MathUtils.lerp(shipGroup.rotation.x, targetPitch, 0.15);
        // Thruster flicker
        plumeMesh.scale.set(0.9 + Math.random() * 0.3, 0.9 + Math.random() * 0.3, 1 + Math.random() * 0.4);
      }

      // Camera soft follow
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, gameRef.current.shipPos.x * 0.4, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, gameRef.current.shipPos.y * 0.4 + 2.5, 0.08);

      // Only run game hazard logic when game is playing
      if (isPlayingRef.current && !isGameOverRef.current) {
        // Distance
        gameRef.current.distance += delta * 0.2;
        setDistanceAU(parseFloat(gameRef.current.distance.toFixed(2)));

        // Passive score
        gameRef.current.score += Math.round(delta * 25);
        setScore(gameRef.current.score);

        // Spawn Asteroids
        if (time - lastSpawnAsteroid > 550) {
          lastSpawnAsteroid = time;
          const asteroidGeo = new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.9, 1);
          // Deform vertices for realistic cratered look
          const pos = asteroidGeo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            v.multiplyScalar(0.85 + Math.random() * 0.3);
            pos.setXYZ(i, v.x, v.y, v.z);
          }
          asteroidGeo.computeVertexNormals();

          const asteroidMat = new THREE.MeshStandardMaterial({
            color: 0x78716c,
            roughness: 0.85,
            metalness: 0.1
          });
          const asteroidMesh = new THREE.Mesh(asteroidGeo, asteroidMat);
          asteroidMesh.position.set(
            (Math.random() - 0.5) * 22,
            (Math.random() - 0.5) * 14,
            -180
          );
          scene.add(asteroidMesh);
          gameRef.current.asteroids.push({
            mesh: asteroidMesh,
            rotSpeed: new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2),
            speed: 55 + Math.random() * 35
          });
        }

        // Spawn Energy Crystals
        if (time - lastSpawnCrystal > 1200) {
          lastSpawnCrystal = time;
          const crystalGeo = new THREE.OctahedronGeometry(0.65, 0);
          const crystalMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.8,
            metalness: 0.9,
            roughness: 0.1
          });
          const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
          crystalMesh.position.set(
            (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 11,
            -180
          );
          scene.add(crystalMesh);
          gameRef.current.crystals.push({
            mesh: crystalMesh,
            rotSpeed: 3.5
          });
        }

        // Update Asteroids & Collision Detection
        for (let i = gameRef.current.asteroids.length - 1; i >= 0; i--) {
          const ast = gameRef.current.asteroids[i];
          ast.mesh.position.z += ast.speed * delta;
          ast.mesh.rotation.x += ast.rotSpeed.x * delta;
          ast.mesh.rotation.y += ast.rotSpeed.y * delta;

          // Collision check with ship
          const dist = ast.mesh.position.distanceTo(shipGroup.position);
          if (dist < 1.8) {
            // Impact!
            scene.remove(ast.mesh);
            gameRef.current.asteroids.splice(i, 1);
            playSynthSound('hit');

            gameRef.current.shields = Math.max(0, gameRef.current.shields - 35);
            setShields(gameRef.current.shields);

            if (gameRef.current.shields <= 0) {
              // Game Over!
              setIsGameOver(true);
              setIsPlaying(false);
              playSynthSound('gameover');
              const finalScore = gameRef.current.score;
              setHighScore(prev => {
                const best = Math.max(prev, finalScore);
                try {
                  localStorage.setItem('earth_one_space_highscore', String(best));
                } catch {
                  // ignore
                }
                return best;
              });
            }
            continue;
          }

          // Offscreen removal
          if (ast.mesh.position.z > 20) {
            scene.remove(ast.mesh);
            gameRef.current.asteroids.splice(i, 1);
          }
        }

        // Update Crystals & Collection
        for (let i = gameRef.current.crystals.length - 1; i >= 0; i--) {
          const cry = gameRef.current.crystals[i];
          cry.mesh.position.z += 48 * delta;
          cry.mesh.rotation.y += cry.rotSpeed * delta;
          cry.mesh.rotation.z += cry.rotSpeed * 0.5 * delta;

          const dist = cry.mesh.position.distanceTo(shipGroup.position);
          if (dist < 2.0) {
            // Collected!
            scene.remove(cry.mesh);
            gameRef.current.crystals.splice(i, 1);
            playSynthSound('collect');
            gameRef.current.score += 200;
            setScore(gameRef.current.score);
            // Recharge shields slightly
            gameRef.current.shields = Math.min(100, gameRef.current.shields + 10);
            setShields(gameRef.current.shields);
            continue;
          }

          if (cry.mesh.position.z > 20) {
            scene.remove(cry.mesh);
            gameRef.current.crystals.splice(i, 1);
          }
        }
      }

      renderer.render(scene, camera);
    };

    gameRef.current.animFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(gameRef.current.animFrame);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Sync refs for animation loop
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isGameOverRef = useRef(isGameOver);
  isGameOverRef.current = isGameOver;

  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex flex-col">
      {/* Top HUD Telemetry Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-sm pointer-events-auto">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>ORION-X RECON</span>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">DIST:</span>
            <span className="text-slate-100 font-bold">{distanceAU} AU</span>
          </div>
        </div>

        {/* Shield Bar & Score */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Shield className={`w-4 h-4 ${shields > 40 ? 'text-emerald-400' : 'text-rose-400'}`} />
            <div className="w-24 h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  shields > 60 ? 'bg-cyan-400' : shields > 25 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${shields}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-200">{shields}%</span>
          </div>

          <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">SCORE: </span>
            <span className="font-bold text-amber-400">{score}</span>
          </div>

          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title={soundEnabled ? 'Mute' : 'Enable Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        className="w-full h-[520px] sm:h-[580px] bg-slate-950 cursor-crosshair touch-none select-none relative"
      />

      {/* Start / Game Over Screen Overlay */}
      {(!isPlaying || isGameOver) && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/90 border border-cyan-500/30 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
              <Zap className="w-8 h-8 text-cyan-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {isGameOver ? 'HULL COMPROMISED' : '3D SPACE FLIGHT SIMULATOR'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {isGameOver
                  ? 'Your starship sustained catastrophic asteroid impact in deep space.'
                  : 'Pilot the Orion-X deep space shuttle. Dodge asteroid debris, collect photon crystals, and explore distant cosmic sectors!'}
              </p>
            </div>

            {/* Score Summary */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left">
              <div>
                <span className="text-[10px] text-slate-400 font-mono uppercase">Mission Score</span>
                <div className="text-xl font-bold font-mono text-cyan-300">{score}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-mono uppercase">Record High</span>
                <div className="text-xl font-bold font-mono text-amber-400">{highScore}</div>
              </div>
            </div>

            {/* Controls Guide */}
            <div className="text-xs text-slate-400 flex items-center justify-center space-x-4">
              <span>⌨️ Keys: <strong className="text-slate-200">WASD</strong> or <strong className="text-slate-200">Arrows</strong></span>
              <span>·</span>
              <span>💎 Collect Crystals for +200 & Shields</span>
            </div>

            <button
              onClick={startGame}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-2 cursor-pointer transition-all hover:scale-[1.02]"
            >
              {isGameOver ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isGameOver ? 'RE-ENGAGE ENGINES' : 'LAUNCH ORION-X MISSION'}</span>
            </button>
          </div>
        </div>
      )}

      {/* On-Screen Mobile Touch Controls */}
      {isPlaying && !isGameOver && (
        <div className="absolute bottom-4 inset-x-4 z-20 flex justify-between items-end pointer-events-none sm:hidden">
          {/* D-Pad */}
          <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-md pointer-events-auto">
            <div />
            <button
              onPointerDown={() => handleTouchDir('up', true)}
              onPointerUp={() => handleTouchDir('up', false)}
              className="w-11 h-11 rounded-xl bg-slate-800/90 active:bg-cyan-500 active:text-slate-950 text-slate-200 flex items-center justify-center font-bold"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            <div />

            <button
              onPointerDown={() => handleTouchDir('left', true)}
              onPointerUp={() => handleTouchDir('left', false)}
              className="w-11 h-11 rounded-xl bg-slate-800/90 active:bg-cyan-500 active:text-slate-950 text-slate-200 flex items-center justify-center font-bold"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onPointerDown={() => handleTouchDir('down', true)}
              onPointerUp={() => handleTouchDir('down', false)}
              className="w-11 h-11 rounded-xl bg-slate-800/90 active:bg-cyan-500 active:text-slate-950 text-slate-200 flex items-center justify-center font-bold"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              onPointerDown={() => handleTouchDir('right', true)}
              onPointerUp={() => handleTouchDir('right', false)}
              className="w-11 h-11 rounded-xl bg-slate-800/90 active:bg-cyan-500 active:text-slate-950 text-slate-200 flex items-center justify-center font-bold"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
