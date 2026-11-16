import * as THREE from 'three';

export interface SpatialParticleField {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  uniforms: {
    uTime: { value: number };
    uPixelRatio: { value: number };
    uPointer: { value: THREE.Vector3 };
    uPointerStrength: { value: number };
    uAudioBass: { value: number };
  };
  dispose: () => void;
}

/**
 * Foreground & midground floating cosmic stardust motes.
 * Single GPU draw call — gently responds to spatial pointer parallax and acoustic resonance.
 */
export function createSpatialParticleField(count: number, pixelRatio: number): SpatialParticleField {
  const safeCount = Math.max(0, Math.min(count, 1000));
  const positions = new Float32Array(safeCount * 3);
  const seeds = new Float32Array(safeCount * 3);

  for (let i = 0; i < safeCount; i++) {
    // Spread softly in foreground/midground depth volumes rather than an artificial tight shell
    const h1 = (i * 0.6180339887) % 1;
    const h2 = (i * 0.3819660113) % 1;
    const h3 = (i * 0.7548776662) % 1;

    const x = (h1 - 0.5) * 16.0;
    const y = (h2 - 0.5) * 10.5;
    const z = -9.5 + h3 * 12.0; // -9.5 .. +2.5 across foreground & sculpture space

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    seeds[i * 3] = (i * 0.371) % 1;     // size / flicker phase
    seeds[i * 3 + 1] = (i * 0.739) % 1; // spectral hue blend (silver -> ice-blue -> lavender)
    seeds[i * 3 + 2] = 0.4 + ((i * 0.193) % 1) * 0.9; // drift speed factor
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(pixelRatio, 1.75) },
    uPointer: { value: new THREE.Vector3(0, 0, 0) },
    uPointerStrength: { value: 0 },
    uAudioBass: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec3 uPointer;
      uniform float uPointerStrength;
      uniform float uAudioBass;

      varying float vMix;
      varying float vAlpha;

      void main() {
        float phase = aSeed.x * 6.2831853;
        float speed = 0.08 + aSeed.z * 0.12;

        vec3 pos = position;
        pos.x += sin(uTime * speed + phase) * 0.38;
        pos.y += cos(uTime * speed * 0.85 + phase * 1.3) * 0.32;
        pos.z += sin(uTime * speed * 0.6 + phase * 0.7) * 0.25;

        // Subtle foreground depth parallax against pointer
        float depthWeight = clamp((pos.z + 10.0) / 12.5, 0.15, 1.0);
        pos.x -= uPointer.x * 0.28 * depthWeight * uPointerStrength;
        pos.y -= uPointer.y * 0.22 * depthWeight * uPointerStrength;

        // Gentle radial acoustic breath
        pos *= 1.0 + uAudioBass * 0.045;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float baseSize = mix(6.5, 15.0, aSeed.x);
        gl_PointSize = clamp(baseSize * uPixelRatio * (1.0 / max(1.6, -mvPosition.z)), 1.0, 5.2);

        vMix = aSeed.y;
        float distFade = smoothstep(18.0, 4.5, -mvPosition.z);
        float pulse = 0.45 + 0.55 * (sin(uTime * 0.85 + phase) * 0.5 + 0.5);
        vAlpha = distFade * pulse * 0.56;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying float vMix;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;

        float falloff = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.4);
        vec3 starlight = vec3(0.90, 0.94, 1.0);
        vec3 iceBlue = vec3(0.46, 0.76, 1.0);
        vec3 champagne = vec3(0.84, 0.73, 0.54);

        vec3 tint = mix(starlight, iceBlue, smoothstep(0.15, 0.75, vMix));
        if (vMix > 0.82) {
          tint = mix(iceBlue, champagne, (vMix - 0.82) * 5.0);
        }

        gl_FragColor = vec4(tint, falloff * vAlpha * 0.85);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    uniforms,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
