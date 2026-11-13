/**
 * Global singleton HTMLAudioElement engine.
 * IMPORTANT: Must not create multiple independent audio elements/instances.
 */
export type AudioEngineEvents = {
  time: (current: number, duration: number) => void;
  duration: (duration: number) => void;
  ended: () => void;
  error: (message: string) => void;
  play: () => void;
  pause: () => void;
  loaded: () => void;
};

type Handler<K extends keyof AudioEngineEvents> = AudioEngineEvents[K];

class GlobalAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Map<keyof AudioEngineEvents, Set<Function>>();
  private bound = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private attachedTo: HTMLAudioElement | null = null;
  private currentSrc?: string;

  get element(): HTMLAudioElement | null {
    if (typeof document === 'undefined') return null;
    if (this.audio) return this.audio;
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.crossOrigin = 'anonymous';
    // keep it out of layout but in DOM for consistent behavior
    el.style.position = 'fixed';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.left = '-9999px';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this.audio = el;
    this.bind(el);
    return el;
  }

  private bind(el: HTMLAudioElement) {
    if (this.bound) return;
    this.bound = true;
    el.addEventListener('timeupdate', () => this.emit('time', el.currentTime || 0, Number.isFinite(el.duration) ? el.duration : 0));
    el.addEventListener('durationchange', () => this.emit('duration', Number.isFinite(el.duration) ? el.duration : 0));
    el.addEventListener('loadedmetadata', () => { this.emit('loaded'); this.emit('duration', Number.isFinite(el.duration) ? el.duration : 0); });
    el.addEventListener('ended', () => this.emit('ended'));
    el.addEventListener('pause', () => this.emit('pause'));
    el.addEventListener('play', () => this.emit('play'));
    el.addEventListener('error', () => {
      const mediaErr = el.error;
      const msg = mediaErr ? `Audio error (${mediaErr.code})` : 'Audio playback failed';
      this.emit('error', msg);
    });
  }

  on<K extends keyof AudioEngineEvents>(event: K, handler: Handler<K>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as Function);
    return () => this.off(event, handler);
  }

  off<K extends keyof AudioEngineEvents>(event: K, handler: Handler<K>) {
    this.listeners.get(event)?.delete(handler as Function);
  }

  private emit<K extends keyof AudioEngineEvents>(event: K, ...args: Parameters<AudioEngineEvents[K]>) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { (fn as any)(...args); } catch {}
    }
  }

  async load(src?: string) {
    const el = this.element;
    if (!el) return;
    if (!src) {
      this.currentSrc = undefined;
      el.removeAttribute('src');
      try { el.load(); } catch {}
      return;
    }
    if (this.currentSrc === src) return;
    this.currentSrc = src;
    el.src = src;
    try { el.load(); } catch {}
  }

  async play() {
    const el = this.element;
    if (!el) return false;
    try {
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  pause() {
    try { this.element?.pause(); } catch {}
  }

  seek(sec: number) {
    const el = this.element;
    if (!el || !Number.isFinite(sec)) return;
    try { el.currentTime = Math.max(0, sec); } catch {}
  }

  setVolume(volume: number, muted: boolean) {
    const el = this.element;
    if (!el) return;
    try {
      el.volume = Math.min(1, Math.max(0, volume));
      el.muted = !!muted;
    } catch {}
  }

  getAnalyser(): AnalyserNode | null {
    if (typeof window === 'undefined') return null;
    const el = this.element;
    if (!el) return null;
    if (this.analyser) return this.analyser;
    try {
      if (this.attachedTo && this.attachedTo !== el) {
        // cannot safely reattach a different media element to an existing source in most browsers
        return this.analyser;
      }
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx: AudioContext = this.audioCtx || new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.sourceNode = source;
      this.attachedTo = el;
      return analyser;
    } catch {
      return this.analyser;
    }
  }

  async resumeContext() {
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    } catch {}
  }

  getCurrentSrc() { return this.currentSrc; }
  getElement() { return this.audio; }
}

let singleton: GlobalAudioEngine | null = null;

export function getGlobalAudioEngine(): GlobalAudioEngine {
  if (!singleton) singleton = new GlobalAudioEngine();
  return singleton;
}
