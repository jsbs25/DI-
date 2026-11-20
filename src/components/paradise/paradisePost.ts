import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface ParadisePostOptions {
  enableBloom: boolean;
  enableGodRays: boolean;
  enableDOF: boolean;
  sunScreenPos: THREE.Vector2;
  godRayIntensity: number;
  godRayColor: THREE.Color;
  focusDistance: number;
  cameraNear: number;
  cameraFar: number;
}

export interface ParadisePostPipeline {
  setOptions: (opts: Partial<ParadisePostOptions>) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  render: () => void;
  dispose: () => void;
}

const VolumetricAndDOFShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uHasDepth: { value: 1.0 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uLightScreenPos: { value: new THREE.Vector2(0.65, 0.72) },
    uGodRayIntensity: { value: 0.25 },
    uGodRayColor: { value: new THREE.Color(0xffdfa8) },
    uDofIntensity: { value: 0.14 },
    uFocusDist: { value: 24.0 },
    uCameraNear: { value: 0.2 },
    uCameraFar: { value: 260.0 },
    uClarity: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uHasDepth;
    uniform vec2 uResolution;
    uniform vec2 uLightScreenPos;
    uniform float uGodRayIntensity;
    uniform vec3 uGodRayColor;
    uniform float uDofIntensity;
    uniform float uFocusDist;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uClarity;
    varying vec2 vUv;

    float igNoise(vec2 p) {
      vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
      return fract(magic.z * fract(dot(p, magic.xy)));
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      vec2 invRes = 1.0 / max(vec2(1.0), uResolution);

      // 0. Luma-preserving micro-contrast clarity (crisp HD foliage, tiles & bark without ringing halos)
      if (uClarity > 0.01) {
        vec3 nSum =
          texture2D(tDiffuse, clamp(vUv + vec2(invRes.x, 0.0), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(vUv - vec2(invRes.x, 0.0), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(vUv + vec2(0.0, invRes.y), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(vUv - vec2(0.0, invRes.y), 0.001, 0.999)).rgb;
        vec3 blurCenter = nSum * 0.25;
        float lumaBase = dot(col, vec3(0.299, 0.587, 0.114));
        float lumaBlur = dot(blurCenter, vec3(0.299, 0.587, 0.114));
        float detail = clamp((lumaBase - lumaBlur) * uClarity, -0.07, 0.07);
        col = max(vec3(0.0), col + detail);
      }

      // 1. Subtle Optical Depth of Field (keeps mid-ground trees & architecture razor sharp)
      if (uHasDepth > 0.5 && uDofIntensity > 0.01) {
        float centerRaw = texture2D(tDepth, vUv).x;
        float centerDist = -perspectiveDepthToViewZ(centerRaw, uCameraNear, uCameraFar);
        float isSky = step(0.9985, centerRaw);

        float focusSpan = max(16.0, uFocusDist * 0.95);
        float coc = clamp(abs(centerDist - uFocusDist) / focusSpan - 0.24, 0.0, 1.0);
        coc = mix(coc, min(coc, 0.25), isSky) * uDofIntensity;

        if (coc > 0.03) {
          vec2 texel = invRes * (1.0 + coc * 2.8);
          vec2 taps[8];
          taps[0] = vec2(-0.707, -0.707);
          taps[1] = vec2( 0.707, -0.707);
          taps[2] = vec2(-0.707,  0.707);
          taps[3] = vec2( 0.707,  0.707);
          taps[4] = vec2( 0.0,   -1.0);
          taps[5] = vec2( 0.0,    1.0);
          taps[6] = vec2(-1.0,    0.0);
          taps[7] = vec2( 1.0,    0.0);

          vec3 blurAccum = col;
          float weightSum = 1.0;
          for (int i = 0; i < 8; i++) {
            vec2 suv = clamp(vUv + taps[i] * texel, 0.002, 0.998);
            float sRaw = texture2D(tDepth, suv).x;
            float sDist = -perspectiveDepthToViewZ(sRaw, uCameraNear, uCameraFar);
            float sCoc = clamp(abs(sDist - uFocusDist) / focusSpan - 0.24, 0.0, 1.0);
            float w = (sDist >= centerDist - 1.2) ? 1.0 : smoothstep(0.05, 0.35, sCoc);
            blurAccum += texture2D(tDiffuse, suv).rgb * w;
            weightSum += w;
          }
          col = mix(col, blurAccum / weightSum, clamp(coc * 0.85, 0.0, 0.45));
        }
      }

      // 2. Volumetric Screen-Space Crepuscular Light Shafts (God Rays)
      if (uHasDepth > 0.5 && uGodRayIntensity > 0.005) {
        vec2 delta = (vUv - uLightScreenPos);
        float lightDist = length(delta);
        if (lightDist < 1.35) {
          vec2 stepUv = delta * (0.72 / 14.0);
          float jitter = igNoise(gl_FragCoord.xy);
          vec2 sampleUv = vUv - stepUv * jitter;
          float illuminationDecay = 1.0;
          float rayAccum = 0.0;

          for (int i = 0; i < 14; i++) {
            sampleUv -= stepUv;
            vec2 clampedUv = clamp(sampleUv, 0.002, 0.998);
            float d = texture2D(tDepth, clampedUv).x;
            float skyTransmission = smoothstep(0.992, 0.9992, d);
            float sampleLuma = dot(texture2D(tDiffuse, clampedUv).rgb, vec3(0.299, 0.587, 0.114));
            rayAccum += skyTransmission * min(1.8, sampleLuma) * illuminationDecay;
            illuminationDecay *= 0.91;
          }

          float radialMask = 1.0 - smoothstep(0.08, 1.35, lightDist);
          col += uGodRayColor * (rayAccum / 14.0) * uGodRayIntensity * radialMask;
        }
      }

      // 3. Subtle optical lens vignette
      vec2 vDist = (vUv - 0.5) * vec2(1.05, 0.92);
      float vig = 1.0 - smoothstep(0.48, 0.98, dot(vDist, vDist)) * 0.10;
      col *= vig;

      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export function createParadisePostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  pixelRatio: number,
  initial: { enableBloom: boolean; enableGodRays: boolean; enableDOF: boolean }
): ParadisePostPipeline {
  const rtWidth = Math.max(1, Math.floor(width * pixelRatio));
  const rtHeight = Math.max(1, Math.floor(height * pixelRatio));
  const supportsDepthTex = renderer.capabilities.isWebGL2;

  const rtParams: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
  };
  if (supportsDepthTex) {
    const depthTex = new THREE.DepthTexture(rtWidth, rtHeight, THREE.UnsignedIntType);
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;
    rtParams.depthTexture = depthTex;
  }

  const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, rtParams);
  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const volDofPass = new ShaderPass(VolumetricAndDOFShader);
  volDofPass.uniforms.uHasDepth.value = supportsDepthTex ? 1.0 : 0.0;
  volDofPass.uniforms.uResolution.value.set(rtWidth, rtHeight);
  volDofPass.uniforms.uDofIntensity.value = initial.enableDOF ? 0.14 : 0;
  volDofPass.enabled = true;
  composer.addPass(volDofPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.11, 0.28, 0.93);
  bloomPass.enabled = initial.enableBloom;
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let godRaysOn = initial.enableGodRays;
  let dofOn = initial.enableDOF;

  const setOptions = (opts: Partial<ParadisePostOptions>) => {
    if (typeof opts.enableBloom === 'boolean') {
      bloomPass.enabled = opts.enableBloom;
    }
    if (typeof opts.enableGodRays === 'boolean') {
      godRaysOn = opts.enableGodRays;
      if (!godRaysOn) volDofPass.uniforms.uGodRayIntensity.value = 0;
    }
    if (typeof opts.enableDOF === 'boolean') {
      dofOn = opts.enableDOF;
      volDofPass.uniforms.uDofIntensity.value = dofOn ? 0.14 : 0;
    }
    if (opts.sunScreenPos) {
      (volDofPass.uniforms.uLightScreenPos.value as THREE.Vector2).copy(opts.sunScreenPos);
    }
    if (typeof opts.godRayIntensity === 'number') {
      volDofPass.uniforms.uGodRayIntensity.value = godRaysOn ? opts.godRayIntensity : 0;
    }
    if (opts.godRayColor) {
      (volDofPass.uniforms.uGodRayColor.value as THREE.Color).copy(opts.godRayColor);
    }
    if (typeof opts.focusDistance === 'number') {
      volDofPass.uniforms.uFocusDist.value = opts.focusDistance;
    }
    if (typeof opts.cameraNear === 'number') {
      volDofPass.uniforms.uCameraNear.value = opts.cameraNear;
    }
    if (typeof opts.cameraFar === 'number') {
      volDofPass.uniforms.uCameraFar.value = opts.cameraFar;
    }
    volDofPass.enabled = true;
  };

  const setSize = (w: number, h: number, pr: number) => {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    volDofPass.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(w * pr)),
      Math.max(1, Math.floor(h * pr))
    );
  };

  const render = () => {
    // Bind depth texture from the exact buffer RenderPass writes into (avoid WebGL feedback loop)
    if (supportsDepthTex && composer.readBuffer.depthTexture) {
      volDofPass.uniforms.tDepth.value = composer.readBuffer.depthTexture;
    }
    composer.render();
  };

  return {
    setOptions,
    setSize,
    render,
    dispose: () => {
      volDofPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderTarget.dispose();
    },
  };
}
