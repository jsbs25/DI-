// Web Audio API ringtone & ringback synthesizer with deterministic cleanup

let activeMode: 'none' | 'incoming' | 'ringback' = 'none';
let loopTimer: ReturnType<typeof setInterval> | null = null;
let toneCtx: AudioContext | null = null;

function getToneCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!toneCtx || toneCtx.state === 'closed') toneCtx = new Ctx();
    if (toneCtx && toneCtx.state === 'suspended') {
      void toneCtx.resume().catch(() => {});
    }
    return toneCtx;
  } catch {
    return null;
  }
}

function playBeep(freq: number, startDelaySec: number, durationSec: number, gainPeak = 0.06) {
  const ctx = getToneCtx();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startDelaySec;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.025);
    gain.gain.setValueAtTime(gainPeak, Math.max(t0 + 0.03, t0 + durationSec - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  } catch {}
}

function triggerIncomingBurst() {
  // Warm dual-chime ring pattern
  playBeep(523.25, 0.0, 0.24, 0.055);
  playBeep(659.25, 0.26, 0.34, 0.055);
  playBeep(523.25, 0.72, 0.24, 0.05);
  playBeep(659.25, 0.98, 0.34, 0.05);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([240, 140, 240]);
    }
  } catch {}
}

function triggerRingbackBurst() {
  // Subtle single ringback tone for caller
  playBeep(440, 0.0, 0.75, 0.03);
}

export function stopCallTones() {
  activeMode = 'none';
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {}
}

export function startIncomingRingtone() {
  if (activeMode === 'incoming') return;
  stopCallTones();
  activeMode = 'incoming';
  triggerIncomingBurst();
  loopTimer = setInterval(() => {
    if (activeMode === 'incoming') triggerIncomingBurst();
  }, 2800);
}

export function startOutgoingRingback() {
  if (activeMode === 'ringback') return;
  stopCallTones();
  activeMode = 'ringback';
  triggerRingbackBurst();
  loopTimer = setInterval(() => {
    if (activeMode === 'ringback') triggerRingbackBurst();
  }, 3200);
}
