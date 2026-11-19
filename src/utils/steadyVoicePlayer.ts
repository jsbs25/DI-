/**
 * Steady Broadcast-Grade Voice Playback Engine
 *
 * Eliminates voice volume fluctuations ("忽大忽小") and base64 Audio-tag decode glitches
 * by routing all AI speech through a single WebAudio Master Voice Bus:
 *   BufferSource -> HighPass(80Hz) -> DynamicsCompressor(fixed broadcast leveling) -> MasterGain(0.88) -> Destination
 *
 * Guarantees:
 * - Constant, locked conversational loudness across every sentence and voice persona
 * - Zero erratic playbackRate/pitch warping (strictly 1.0x natural cadence)
 * - Smooth 10ms fade-in/out on start & stop (zero pops or clicks)
 * - Reliable decoding on Desktop Safari, Chrome, Edge, iOS, and Android
 */

let sharedCtx: AudioContext | null = null;
let sharedHighPass: BiquadFilterNode | null = null;
let sharedCompressor: DynamicsCompressorNode | null = null;
let sharedMasterGain: GainNode | null = null;

let activeSource: AudioBufferSourceNode | null = null;
let activeEnvelope: GainNode | null = null;
let activeHtmlAudio: HTMLAudioElement | null = null;
let activePlayToken = 0;

const FIXED_VOICE_GAIN = 0.88;

function ensureVoiceBus(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctx();

    // Gentle 80Hz high-pass removes low-end thump/rumble from TTS synthesis
    sharedHighPass = sharedCtx.createBiquadFilter();
    sharedHighPass.type = 'highpass';
    sharedHighPass.frequency.value = 80;
    sharedHighPass.Q.value = 0.7;

    // Broadcast-style DynamicsCompressor keeps soft & loud syllables at steady loudness
    sharedCompressor = sharedCtx.createDynamicsCompressor();
    sharedCompressor.threshold.value = -18;
    sharedCompressor.knee.value = 12;
    sharedCompressor.ratio.value = 6;
    sharedCompressor.attack.value = 0.004;
    sharedCompressor.release.value = 0.12;

    // Fixed steady output level
    sharedMasterGain = sharedCtx.createGain();
    sharedMasterGain.gain.value = FIXED_VOICE_GAIN;

    sharedHighPass.connect(sharedCompressor);
    sharedCompressor.connect(sharedMasterGain);
    sharedMasterGain.connect(sharedCtx.destination);
  }

  return sharedCtx;
}

export function unlockSteadyVoiceAudio(): void {
  const ctx = ensureVoiceBus();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

export function stopSteadyVoice(): void {
  activePlayToken += 1;

  if (activeEnvelope && sharedCtx && sharedCtx.state === 'running') {
    try {
      const now = sharedCtx.currentTime;
      activeEnvelope.gain.cancelScheduledValues(now);
      activeEnvelope.gain.setValueAtTime(Math.max(0.0001, activeEnvelope.gain.value), now);
      activeEnvelope.gain.linearRampToValueAtTime(0.0001, now + 0.015);
    } catch {
      // ignore
    }
  }

  const prevSource = activeSource;
  activeSource = null;
  activeEnvelope = null;
  if (prevSource) {
    try {
      prevSource.onended = null;
      prevSource.stop(sharedCtx ? sharedCtx.currentTime + 0.018 : 0);
    } catch {
      try {
        prevSource.stop();
      } catch {
        // ignore
      }
    }
  }

  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.onended = null;
      activeHtmlAudio.onerror = null;
      activeHtmlAudio.pause();
      activeHtmlAudio.src = '';
    } catch {
      // ignore
    }
    activeHtmlAudio = null;
  }
}

/**
 * Normalizes a decoded AudioBuffer in-place to a fixed conversational RMS (-16 dBFS)
 * with soft-knee peak limiting so every voice source (Gemini WAV or fallback MP3)
 * plays at the exact same comfortable, unchanging volume.
 */
function normalizeDecodedBufferInPlace(buffer: AudioBuffer): void {
  const channels = buffer.numberOfChannels;
  const len = buffer.length;
  if (len === 0 || channels === 0) return;

  // Measure active speech RMS (ignore silence frames below -42 dBFS ~ 0.008)
  let sumSq = 0;
  let activeCount = 0;
  let peak = 0;

  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const s = data[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      if (abs > 0.008) {
        sumSq += s * s;
        activeCount += 1;
      }
    }
  }

  if (activeCount < 64 || peak < 0.002) return;

  const activeRms = Math.sqrt(sumSq / activeCount);
  // Target steady conversational RMS (~ -15.5 dBFS = 0.168)
  const targetRms = 0.168;
  const gain = Math.max(0.32, Math.min(3.4, targetRms / Math.max(activeRms, 0.005)));
  const ceiling = 0.88;
  const fadeSamples = Math.min(Math.floor(buffer.sampleRate * 0.008), Math.floor(len / 4));

  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let v = data[i] * gain;
      // Smooth tanh soft-limiter above 0.72 so loud transients never clip or jump
      const abs = Math.abs(v);
      if (abs > 0.72) {
        v = Math.sign(v) * (0.72 + (ceiling - 0.72) * Math.tanh((abs - 0.72) / (ceiling - 0.72)));
      }
      if (i < fadeSamples) {
        v *= i / fadeSamples;
      } else if (i >= len - fadeSamples) {
        v *= (len - 1 - i) / fadeSamples;
      }
      data[i] = v;
    }
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function playNormalizedArrayBuffer(
  arrayBuffer: ArrayBuffer,
  mimeType = 'audio/wav',
  shouldContinue?: () => boolean
): Promise<boolean> {
  if (shouldContinue && !shouldContinue()) return false;
  stopSteadyVoice();
  const myToken = activePlayToken;

  const ctx = ensureVoiceBus();
  if (ctx && sharedHighPass) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (myToken !== activePlayToken || (shouldContinue && !shouldContinue())) return false;

      // Copy buffer because decodeAudioData detaches the passed ArrayBuffer
      const cloned = arrayBuffer.slice(0);
      const decoded = await ctx.decodeAudioData(cloned);
      if (myToken !== activePlayToken || (shouldContinue && !shouldContinue())) return false;

      normalizeDecodedBufferInPlace(decoded);

      return await new Promise<boolean>((resolve) => {
        if (myToken !== activePlayToken || (shouldContinue && !shouldContinue())) {
          resolve(false);
          return;
        }
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.playbackRate.value = 1.0;

        const env = ctx.createGain();
        env.gain.setValueAtTime(1.0, ctx.currentTime);

        source.connect(env);
        env.connect(sharedHighPass!);

        activeSource = source;
        activeEnvelope = env;

        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          if (activeSource === source) {
            activeSource = null;
            activeEnvelope = null;
          }
          try {
            source.disconnect();
            env.disconnect();
          } catch {
            // ignore
          }
          resolve(ok);
        };

        source.onended = () => done(true);
        try {
          source.start(0);
        } catch {
          done(false);
        }
      });
    } catch {
      // Fall through to Blob HTMLAudio fallback if WebAudio decode fails
    }
  }

  // Safe Blob-URL HTMLAudioElement fallback (still locked at volume 0.85, playbackRate 1.0)
  if (myToken !== activePlayToken || (shouldContinue && !shouldContinue())) return false;
  try {
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.volume = 0.85;
    audio.playbackRate = 1.0;
    activeHtmlAudio = audio;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (activeHtmlAudio === audio) activeHtmlAudio = null;
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().catch(() => done(false));
    });
  } catch {
    return false;
  }
}

export async function playNormalizedBase64Audio(
  base64Audio: string,
  mimeType = 'audio/wav',
  shouldContinue?: () => boolean
): Promise<boolean> {
  try {
    const ab = base64ToArrayBuffer(base64Audio);
    return await playNormalizedArrayBuffer(ab, mimeType, shouldContinue);
  } catch {
    return false;
  }
}
