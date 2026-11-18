/**
 * High-Clarity Voice Message Recorder & Vocal Normalization DSP
 *
 * Captures clean mono PCM audio via Web Audio API, waits briefly on stop to preserve
 * trailing syllables ("后面"不再截断), applies vocal clarity EQ + adaptive loudness
 * leveling so quiet/trailing speech stays clear, and encodes to universally playable
 * 24 kHz 16-bit PCM WAV (with high-bitrate 128 kbps MediaRecorder automatic fallback).
 */

const TARGET_SAMPLE_RATE = 24000;
const TAIL_PRESERVE_MS = 180;

function resampleFloat32(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!input.length || fromRate <= 0 || fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  if (ratio > 1) {
    // Box-averaged downsampling prevents aliasing mud on voices
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      out[i] = sum / (end - start);
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = input[Math.min(idx, input.length - 1)];
      const b = input[Math.min(idx + 1, input.length - 1)];
      out[i] = a + (b - a) * frac;
    }
  }
  return out;
}

/**
 * Enhances speech intelligibility from start to finish:
 * 1. DC removal + 85Hz high-pass filter (removes breath/handling rumble)
 * 2. Gentle 2.8 kHz presence emphasis (keeps consonants crisp, prevents muffled tails)
 * 3. Smooth windowed loudness leveling (raises soft trailing syllables without amplifying silence)
 * 4. Soft-knee peak limiter (-1 dBFS)
 */
function enhanceVoiceClarity(samples: Float32Array, sampleRate: number): Float32Array {
  if (!samples.length) return samples;
  const out = new Float32Array(samples.length);

  // 1. 85 Hz 1-pole high-pass filter
  const rcHp = 1 / (2 * Math.PI * 85);
  const dt = 1 / sampleRate;
  const alphaHp = rcHp / (rcHp + dt);
  let prevX = 0;
  let prevY = 0;

  // 2. Mild vocal presence emphasis (~2.5 kHz high-shelf style differentiator blend)
  const rcShelf = 1 / (2 * Math.PI * 2200);
  const alphaLp = dt / (rcShelf + dt);
  let lowLp = 0;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const hp = alphaHp * (prevY + x - prevX);
    prevX = x;
    prevY = hp;
    lowLp += alphaLp * (hp - lowLp);
    const highDetail = hp - lowLp;
    out[i] = hp + highDetail * 0.42;
  }

  // 3. Smooth block AGC so quieter words at the end stay equally audible
  const winSize = Math.max(1, Math.round(sampleRate * 0.14)); // 140ms window
  const blockCount = Math.ceil(out.length / winSize);
  const blockGains = new Float32Array(blockCount);
  const noiseFloor = 0.0045;
  const targetRms = 0.19;

  // Measure overall speech RMS first for conservative baseline
  let totalSq = 0;
  let activeCount = 0;
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    if (Math.abs(v) > noiseFloor) {
      totalSq += v * v;
      activeCount++;
    }
  }
  const globalRms = activeCount > 0 ? Math.sqrt(totalSq / activeCount) : 0.05;
  const baseGain = Math.min(4.5, Math.max(1.0, targetRms / Math.max(globalRms, 0.015)));

  for (let b = 0; b < blockCount; b++) {
    const start = b * winSize;
    const end = Math.min(out.length, start + winSize);
    let sq = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
      const av = Math.abs(out[i]);
      if (av > peak) peak = av;
      sq += out[i] * out[i];
    }
    const rms = Math.sqrt(sq / Math.max(1, end - start));
    if (peak < noiseFloor * 1.4 || rms < noiseFloor) {
      // Quiet room pause: keep gain modest so background hiss never pumps
      blockGains[b] = Math.min(1.4, baseGain * 0.75);
    } else {
      const desired = Math.min(5.2, targetRms / Math.max(rms, 0.012));
      blockGains[b] = Math.min(5.2, baseGain * 0.45 + desired * 0.55);
    }
  }

  // Apply smoothed gain + soft limiter
  let currentGain = blockGains[0] || 1;
  const smoothCoeff = 0.0012;
  for (let i = 0; i < out.length; i++) {
    const b = Math.min(blockCount - 1, Math.floor(i / winSize));
    currentGain += (blockGains[b] - currentGain) * smoothCoeff;
    const amplified = out[i] * currentGain;
    // Smooth saturation prevents harsh digital clipping while maximizing loudness
    out[i] = amplified > 0.72 || amplified < -0.72 ? Math.tanh(amplified * 1.05) * 0.92 : amplified;
  }

  return out;
}

function encodeWav16Mono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // NumChannels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export interface VoiceRecorderSession {
  stopAndFinalize: () => Promise<{ file: File; durationSec: number } | null>;
  cancel: () => void;
}

export async function startClearVoiceRecorder(options?: {
  onLevel?: (level: number) => void;
}): Promise<VoiceRecorderSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const startedAt = Date.now();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx) {
    try {
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const src = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      const pcmChunks: Float32Array[] = [];
      let totalFrames = 0;
      let stopped = false;

      processor.onaudioprocess = (ev) => {
        if (stopped) return;
        const ch = ev.inputBuffer.getChannelData(0);
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        pcmChunks.push(copy);
        totalFrames += copy.length;

        if (options?.onLevel) {
          let sumSq = 0;
          for (let i = 0; i < copy.length; i += 4) sumSq += copy[i] * copy[i];
          const rms = Math.sqrt(sumSq / Math.max(1, copy.length / 4));
          options.onLevel(Math.min(1, rms * 5.5));
        }
      };

      src.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      const cleanupPcm = () => {
        stopped = true;
        try { processor.disconnect(); } catch {}
        try { src.disconnect(); } catch {}
        try { silentGain.disconnect(); } catch {}
        try { void ctx.close(); } catch {}
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      };

      return {
        cancel: cleanupPcm,
        stopAndFinalize: async () => {
          // Wait briefly so the tail end of the final word finishes entering ScriptProcessor
          await new Promise((r) => setTimeout(r, TAIL_PRESERVE_MS));
          const nativeRate = ctx.sampleRate || 48000;
          cleanupPcm();
          if (!totalFrames) return null;

          const merged = new Float32Array(totalFrames);
          let cursor = 0;
          for (const c of pcmChunks) {
            merged.set(c, cursor);
            cursor += c.length;
          }

          const resampled = resampleFloat32(merged, nativeRate, TARGET_SAMPLE_RATE);
          const enhanced = enhanceVoiceClarity(resampled, TARGET_SAMPLE_RATE);
          const wavBuffer = encodeWav16Mono(enhanced, TARGET_SAMPLE_RATE);
          const durationSec = Math.max(1, Math.round(enhanced.length / TARGET_SAMPLE_RATE));
          const file = new File([wavBuffer], `voice-${Date.now()}.wav`, { type: 'audio/wav' });
          return { file, durationSec };
        },
      };
    } catch {
      // Fall through to MediaRecorder fallback if Web Audio fails
    }
  }

  // Fallback: high-bitrate MediaRecorder with tail flush delay
  const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const picked =
    preferredTypes.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    }) || '';
  const rec = picked
    ? new MediaRecorder(stream, { mimeType: picked, audioBitsPerSecond: 128000 })
    : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  rec.start(120);

  const cleanupMr = () => {
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch {}
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
  };

  return {
    cancel: cleanupMr,
    stopAndFinalize: async () => {
      await new Promise((r) => setTimeout(r, TAIL_PRESERVE_MS));
      try {
        rec.requestData();
      } catch {}
      const blob: Blob = await new Promise((resolve) => {
        rec.onstop = () => {
          const rawMime = (rec.mimeType || 'audio/webm').split(';')[0].trim();
          resolve(new Blob(chunks, { type: rawMime }));
        };
        try {
          if (rec.state !== 'inactive') rec.stop();
          else resolve(new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0].trim() }));
        } catch {
          resolve(new Blob(chunks, { type: 'audio/webm' }));
        }
      });
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      if (!blob.size) return null;
      const mime = blob.type || 'audio/webm';
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
      return { file, durationSec };
    },
  };
}
