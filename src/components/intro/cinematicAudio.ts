/**
 * Procedural Ambient Soundscape & Natural English Voice Over Engine
 *
 * Designed strictly for zero external audio 404s and graceful autoplay compliance:
 * - Procedural Web Audio ambient breeze, brook shimmer, dawn Lydian harmonic pad & temple bell
 * - Natural English Web Speech API narrator with intelligent voice selection & gain ducking
 */

export class CinematicAudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private noiseSource: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private isStarted = false;
  private isMuted = false;
  private disposed = false;

  private spokenCues = new Set<string>();
  private duckTimer: number | null = null;
  private cachedEnglishVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.resolveEnglishVoice();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.addEventListener?.('voiceschanged', this.handleVoicesChanged);
      } catch {
        // ignore environments without event listener support
      }
    }
  }

  private handleVoicesChanged = () => {
    this.resolveEnglishVoice();
  };

  private resolveEnglishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;

      const preferredNames = [
        'Samantha',
        'Daniel',
        'Arthur',
        'Karen',
        'Serena',
        'Google US English',
        'Google UK English Female',
        'Google UK English Male',
        'Microsoft Aria',
        'Microsoft Jenny',
        'Microsoft Guy',
        'Natural',
      ];

      for (const name of preferredNames) {
        const match = voices.find(
          (v) => v.lang.toLowerCase().startsWith('en') && v.name.includes(name)
        );
        if (match) {
          this.cachedEnglishVoice = match;
          return match;
        }
      }

      const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
      this.cachedEnglishVoice = anyEn || null;
      return this.cachedEnglishVoice;
    } catch {
      return null;
    }
  }

  public get active(): boolean {
    return this.isStarted && !this.isMuted && !this.disposed;
  }

  public startAmbient(): boolean {
    if (this.disposed) return false;
    if (this.isStarted) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      this.setMuted(false);
      return true;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(this.isMuted ? 0.0001 : 0.72, ctx.currentTime + 2.2);
      master.connect(ctx.destination);
      this.masterGain = master;

      // 1. Warm Dawn Pentatonic / Lydian Pad (D3, A3, E4, F#4, A4)
      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.085, ctx.currentTime);
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(420, ctx.currentTime);
      padFilter.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 7.5);
      padFilter.Q.value = 0.7;
      padGain.connect(padFilter);
      padFilter.connect(master);
      this.padGain = padGain;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 1.6;
      lfo.connect(lfoGain);
      lfo.start();
      this.lfoOsc = lfo;

      const notes = [146.83, 220.0, 329.63, 369.99, 440.0];
      this.oscs = notes.map((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        lfoGain.connect(osc.detune);

        const voiceGain = ctx.createGain();
        voiceGain.gain.setValueAtTime(0.24 / (idx + 1), ctx.currentTime);
        osc.connect(voiceGain);
        voiceGain.connect(padGain);
        osc.start();
        return osc;
      });

      // 2. Gentle Valley Wind & Water Brook Filtered Pink Noise
      const sampleRate = ctx.sampleRate;
      const noiseLen = sampleRate * 3;
      const buffer = ctx.createBuffer(1, noiseLen, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < noiseLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2) * 0.35;
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buffer;
      noiseSrc.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(340, ctx.currentTime);
      windFilter.Q.value = 1.4;
      this.windFilter = windFilter;

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.055, ctx.currentTime);
      this.windGain = windGain;

      noiseSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noiseSrc.start();
      this.noiseSource = noiseSrc;

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      this.isStarted = true;
      return true;
    } catch {
      return false;
    }
  }

  public updateAtmosphere(windStrength: number, timeOfDay: number) {
    if (!this.isStarted || !this.ctx || this.disposed) return;
    try {
      const now = this.ctx.currentTime;
      if (this.windFilter && this.windGain) {
        const targetFreq = 280 + windStrength * 460;
        const targetAmp = 0.035 + Math.min(1, windStrength) * 0.06;
        this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.25);
        this.windGain.gain.setTargetAtTime(targetAmp, now, 0.25);
      }
      if (this.padGain && !this.duckTimer) {
        const sunriseLift = Math.max(0, Math.min(1, (timeOfDay - 0.21) / 0.12));
        this.padGain.gain.setTargetAtTime(0.065 + sunriseLift * 0.03, now, 0.4);
      }
    } catch {
      // ignore closed context timing errors
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (this.ctx && this.masterGain) {
      try {
        const now = this.ctx.currentTime;
        this.masterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.72, now, 0.14);
      } catch {}
    }
  }

  public speakCueOnce(cueId: string, text: string) {
    if (this.disposed || this.isMuted || !text.trim() || this.spokenCues.has(cueId)) return;
    this.spokenCues.add(cueId);

    // Subtle harmonic chime cue even if SpeechSynthesis is blocked in sandboxed headless mode
    this.playSoftChime([587.33, 880.0], 0.045);

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 0.96;
      utterance.volume = 0.85;

      const voice = this.cachedEnglishVoice || this.resolveEnglishVoice();
      if (voice) {
        utterance.voice = voice;
      }

      const restorePad = () => {
        if (this.duckTimer !== null) {
          window.clearTimeout(this.duckTimer);
          this.duckTimer = null;
        }
        if (this.ctx && this.padGain && !this.disposed) {
          try {
            this.padGain.gain.setTargetAtTime(0.088, this.ctx.currentTime, 0.45);
          } catch {}
        }
      };

      utterance.onstart = () => {
        if (this.ctx && this.padGain && !this.disposed) {
          try {
            this.padGain.gain.setTargetAtTime(0.036, this.ctx.currentTime, 0.2);
          } catch {}
        }
      };
      utterance.onend = restorePad;
      utterance.onerror = restorePad;

      // Safety un-duck timeout if browser fails to fire onend
      this.duckTimer = window.setTimeout(restorePad, 6500);
      synth.speak(utterance);
    } catch {
      // SpeechSynthesis unavailable or blocked by autoplay policy; captions remain visible
    }
  }

  public playArrivalChime() {
    if (this.disposed || this.isMuted) return;
    this.playSoftChime([440.0, 587.33, 659.25, 880.0, 1174.66], 0.055);
  }

  private playSoftChime(freqs: number[], gainLevel: number) {
    if (!this.isStarted || !this.ctx || !this.masterGain || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      freqs.forEach((f, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.085);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.085);
        gain.gain.linearRampToValueAtTime(gainLevel / (1 + idx * 0.25), now + idx * 0.085 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.085 + 1.55);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + idx * 0.085);
        osc.stop(now + idx * 0.085 + 1.65);
      });
    } catch {
      // ignore oscillator scheduling issues
    }
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.duckTimer !== null) {
      window.clearTimeout(this.duckTimer);
      this.duckTimer = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.removeEventListener?.('voiceschanged', this.handleVoicesChanged);
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.ctx) {
      const ctx = this.ctx;
      try {
        if (this.masterGain) {
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, ctx.currentTime);
          this.masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        }
      } catch {}
      window.setTimeout(() => {
        this.oscs.forEach((o) => {
          try { o.stop(); } catch {}
        });
        try { this.noiseSource?.stop(); } catch {}
        try { this.lfoOsc?.stop(); } catch {}
        this.oscs = [];
        this.noiseSource = null;
        this.lfoOsc = null;
        ctx.close().catch(() => {});
      }, 400);
      this.ctx = null;
    }
  }
}
