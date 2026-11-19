/**
 * Real-time bidirectional PCM WebAudio client for Gemini Live API:
 * - Captures mic at 16kHz PCM little-endian base64
 * - Local Voice Activity Detection (VAD) for zero-latency barge-in interruption
 * - Plays 24kHz PCM model output gaplessly via scheduled AudioBufferSourceNodes
 * - Exposes instant flushOutput() to cancel queued & playing AI speech in < 5ms
 * - Exposes real-time mic & speaker energy meters for the 3D Living Orb
 */

export interface AudioLiveCallbacks {
  onMicPcmBase64: (base64Pcm: string) => void;
  onLocalBargeIn?: () => void;
  onError?: (err: Error) => void;
}

function float32ToPcm16Base64(floatData: Float32Array): string {
  const pcm16 = new Int16Array(floatData.length);
  for (let i = 0; i < floatData.length; i++) {
    const s = Math.max(-1, Math.min(1, floatData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export class AudioLiveClient {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private muteSink: GainNode | null = null;

  private outputGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  private micEnergy = 0;
  private noiseFloor = 0.012;
  private consecutiveSpeechFrames = 0;
  private lastBargeInAt = 0;
  private isAssistantOutputting = false;
  private echoSuppressUntil = 0;
  private analyserData = new Uint8Array(32);

  public setAssistantOutputting(active: boolean) {
    this.isAssistantOutputting = active;
  }

  public isPlayingOutput(): boolean {
    if (this.activeSources.size > 0) return true;
    if (this.outputCtx && this.nextStartTime > this.outputCtx.currentTime + 0.04) return true;
    return false;
  }

  public getEnergies(): { input: number; output: number } {
    let output = 0;
    if (this.outputAnalyser && this.isPlayingOutput()) {
      this.outputAnalyser.getByteFrequencyData(this.analyserData);
      let sum = 0;
      for (let i = 0; i < this.analyserData.length; i++) {
        sum += this.analyserData[i];
      }
      output = Math.min(1, sum / (this.analyserData.length * 140));
    }
    return {
      input: this.micEnergy,
      output,
    };
  }

  public async ensureOutputReady() {
    if (!this.outputCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.outputCtx = new Ctx({ sampleRate: 24000 });
      this.outputGain = this.outputCtx.createGain();
      this.outputGain.gain.value = 0.88;

      const compressor = this.outputCtx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.12;

      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 64;
      this.outputGain.connect(compressor);
      compressor.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.outputCtx.destination);
      this.analyserData = new Uint8Array(this.outputAnalyser.frequencyBinCount);
      this.nextStartTime = this.outputCtx.currentTime;
    }
    if (this.outputCtx.state === 'suspended') {
      await this.outputCtx.resume();
    }
  }

  public async startMic(callbacks: AudioLiveCallbacks): Promise<void> {
    await this.ensureOutputReady();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not supported in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micStream = stream;

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const inputCtx = new Ctx({ sampleRate: 16000 });
    if (inputCtx.state === 'suspended') {
      await inputCtx.resume();
    }
    this.inputCtx = inputCtx;

    const source = inputCtx.createMediaStreamSource(stream);
    this.micSource = source;

    const processor = inputCtx.createScriptProcessor(2048, 1, 1);
    this.processor = processor;

    // Route through a zero-gain sink so ScriptProcessorNode ticks without speaker feedback
    const muteSink = inputCtx.createGain();
    muteSink.gain.value = 0;
    this.muteSink = muteSink;

    processor.onaudioprocess = (ev) => {
      const raw = ev.inputBuffer.getChannelData(0);
      // Resample if browser ignored requested 16kHz sampleRate
      const samples =
        inputCtx.sampleRate === 16000
          ? raw
          : this.downsampleBuffer(raw, inputCtx.sampleRate, 16000);

      // Compute RMS energy for 3D orb & responsive local VAD barge-in
      let sumSq = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSq += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, samples.length));
      this.micEnergy = Math.min(1, rms * 7.5);

      // Adaptive noise floor when AI isn't speaking
      if (!this.isPlayingOutput() && rms < 0.06) {
        this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
      }

      const nowTs = Date.now();
      const assistantPlaying = this.isPlayingOutput() || this.isAssistantOutputting;
      let bargeTriggered = false;
      const bargeThreshold = Math.max(0.055, this.noiseFloor * 3.4);
      if (assistantPlaying && rms > bargeThreshold) {
        this.consecutiveSpeechFrames += 1;
        if (this.consecutiveSpeechFrames >= 2 && nowTs - this.lastBargeInAt > 380) {
          this.lastBargeInAt = nowTs;
          this.consecutiveSpeechFrames = 0;
          this.flushOutput();
          this.echoSuppressUntil = 0;
          callbacks.onLocalBargeIn?.();
          bargeTriggered = true;
        }
      } else {
        this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 1);
      }

      // Gate mic uplink while AI audio is playing to prevent echo/self-hearing loops.
      // On local barge-in we flush output and forward this frame so interruption is captured.
      if (!assistantPlaying || bargeTriggered) {
        if (!bargeTriggered && nowTs < this.echoSuppressUntil) {
          // Drop residual acoustic echo tail after AI playback.
        } else {
          const b64 = float32ToPcm16Base64(samples);
          callbacks.onMicPcmBase64(b64);
        }
      }
    };

    source.connect(processor);
    processor.connect(muteSink);
    muteSink.connect(inputCtx.destination);
  }

  private downsampleBuffer(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const outLen = Math.round(buffer.length / ratio);
    const out = new Float32Array(outLen);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < out.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      out[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return out;
  }

  public enqueuePcm24k(base64Pcm: string) {
    if (!this.outputCtx || !this.outputGain) return;
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume();
    }

    const float32 = pcm16Base64ToFloat32(base64Pcm);
    if (float32.length === 0) return;

    const audioBuffer = this.outputCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32 as unknown as Float32Array<ArrayBuffer>, 0);

    const src = this.outputCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.outputGain);

    const now = this.outputCtx.currentTime;
    const startAt = Math.max(now + 0.015, this.nextStartTime);
    this.nextStartTime = startAt + audioBuffer.duration;

    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      if (this.activeSources.size === 0 && !this.isAssistantOutputting) {
        this.echoSuppressUntil = Date.now() + 700;
      }
      try {
        src.disconnect();
      } catch {}
    };

    try {
      src.start(startAt);
    } catch {
      this.activeSources.delete(src);
    }
  }

  public flushOutput() {
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
    this.isAssistantOutputting = false;
  }

  public stopMic() {
    this.micEnergy = 0;
    if (this.processor) {
      try {
        this.processor.onaudioprocess = null;
        this.processor.disconnect();
      } catch {}
      this.processor = null;
    }
    if (this.muteSink) {
      try {
        this.muteSink.disconnect();
      } catch {}
      this.muteSink = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      this.micStream = null;
    }
    if (this.inputCtx) {
      try {
        void this.inputCtx.close();
      } catch {}
      this.inputCtx = null;
    }
  }

  public dispose() {
    this.flushOutput();
    this.stopMic();
    if (this.outputCtx) {
      try {
        void this.outputCtx.close();
      } catch {}
      this.outputCtx = null;
    }
    this.outputGain = null;
    this.outputAnalyser = null;
  }
}
