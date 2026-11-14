import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Participant,
  createLocalTracks,
  type LocalTrack,
} from 'livekit-client';

export type CallMediaPhase = 'idle' | 'acquiring' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed' | 'blocked';

export interface CallMediaParticipantView {
  identity: string;
  name?: string;
  isLocal: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  speaking: boolean;
  connectionQuality?: string;
  audioTrack?: MediaStreamTrack | null;
  videoTrack?: MediaStreamTrack | null;
  screenTrack?: MediaStreamTrack | null;
}

export interface CallAudioDiagnostics {
  localLevel: number;
  iceState: string;
  bytesSent: number;
  bytesReceived: number;
  usingRelay: boolean;
  hasLocalAudio: boolean;
  remoteAudioFrames: number;
}

export interface CallMediaState {
  phase: CallMediaPhase;
  roomName?: string;
  error?: string;
  reason?: string;
  canPlaybackAudio: boolean;
  connectionQuality?: string;
  audioStats?: CallAudioDiagnostics;
  participants: Record<string, CallMediaParticipantView>;
}

export interface CallMediaOptions {
  url?: string;
  token?: string;
  roomName?: string;
  callId?: string;
  selfUserId?: string;
  selfName?: string;
  participantIds?: string[];
  iceServers?: RTCIceServer[];
  kind: 'audio' | 'video';
  initialMicEnabled?: boolean;
  initialCameraEnabled?: boolean;
  reconnect?: boolean;
  sendSignal?: (toUserId: string | undefined, signal: any) => Promise<void> | void;
  pollSignals?: (afterSeq: number) => Promise<{ signals: any[]; lastSeq: number }>;
  sendAudioFrame?: (pcmBase64: string, sampleRate: number) => void;
  onState: (state: CallMediaState) => void;
}

export interface ICallMediaSession {
  getState(): CallMediaState;
  connect(opts: CallMediaOptions): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  switchCamera(): Promise<void>;
  setScreenShareEnabled(enabled: boolean): Promise<void>;
  startAudioPlayback(): Promise<void>;
  disconnect(reason?: string): Promise<void>;
  handleRemoteSignal?(fromUserId: string, signal: any, seq?: number): Promise<void>;
  handleRemoteAudioFrame?(fromUserId: string, pcmBase64: string, sampleRate: number): void;
}

function trackToMedia(t: any): MediaStreamTrack | null {
  try { return t?.mediaStreamTrack || t?.track?.mediaStreamTrack || null; } catch { return null; }
}

export class LiveKitCallSession implements ICallMediaSession {
  private room: Room | null = null;
  private opts: CallMediaOptions | null = null;
  private state: CallMediaState = { phase: 'idle', canPlaybackAudio: false, participants: {} };
  private disposed = false;
  private screenTracks: LocalTrack[] = [];

  getState() { return this.state; }
  getRoom() { return this.room; }

  private emit(patch?: Partial<CallMediaState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...(patch || {}) };
    try { this.opts?.onState(this.state); } catch {}
  }

  private upsertParticipant(p: Participant, isLocal: boolean) {
    const id = p.identity || (isLocal ? 'local' : 'remote');
    const prev = this.state.participants[id] || { identity: id, isLocal, audioEnabled: false, videoEnabled: false, screenShareEnabled: false, speaking: false };
    const pubs: any[] = Array.from((p as any).trackPublications?.values?.() || (p as any).tracks?.values?.() || []);
    let audioTrack: MediaStreamTrack | null = prev.audioTrack || null;
    let videoTrack: MediaStreamTrack | null = prev.videoTrack || null;
    let screenTrack: MediaStreamTrack | null = prev.screenTrack || null;
    let audioEnabled = !!prev.audioEnabled;
    let videoEnabled = !!prev.videoEnabled;
    let screenShareEnabled = !!prev.screenShareEnabled;
    for (const pub of pubs) {
      const src = pub.source || pub.trackSource;
      const subscribed = pub.isSubscribed !== false;
      const muted = !!pub.isMuted;
      const mt = trackToMedia(pub.track || pub);
      if (src === Track.Source.Microphone || src === 'microphone') { audioEnabled = subscribed && !muted && !!(mt || pub.track); if (mt) audioTrack = mt; }
      else if (src === Track.Source.Camera || src === 'camera') { videoEnabled = subscribed && !muted && !!(mt || pub.track); if (mt) videoTrack = mt; }
      else if (src === Track.Source.ScreenShare || src === 'screen_share' || src === 'screenShare') { screenShareEnabled = subscribed && !muted && !!(mt || pub.track); if (mt) screenTrack = mt; }
    }
    this.state.participants[id] = {
      ...prev,
      identity: id,
      name: (p as any).name || prev.name,
      isLocal,
      audioEnabled,
      videoEnabled,
      screenShareEnabled,
      speaking: !!(p as any).isSpeaking,
      connectionQuality: String((p as any).connectionQuality || prev.connectionQuality || ''),
      audioTrack,
      videoTrack,
      screenTrack,
    };
  }

  private refreshParticipants() {
    const room = this.room; if (!room) return;
    const next: Record<string, CallMediaParticipantView> = {};
    const keep = this.state.participants;
    this.state.participants = next;
    try { this.upsertParticipant(room.localParticipant, true); } catch {}
    try {
      const remotes: RemoteParticipant[] = Array.from(room.remoteParticipants?.values?.() || []);
      for (const rp of remotes) this.upsertParticipant(rp, false);
    } catch {}
    for (const [id, v] of Object.entries(keep)) {
      if (this.state.participants[id]) {
        const cur = this.state.participants[id];
        if (!cur.audioTrack && v.audioTrack) cur.audioTrack = v.audioTrack;
        if (!cur.videoTrack && v.videoTrack) cur.videoTrack = v.videoTrack;
        if (!cur.screenTrack && v.screenTrack) cur.screenTrack = v.screenTrack;
      }
    }
    this.emit({ participants: { ...this.state.participants } });
  }

  async connect(opts: CallMediaOptions): Promise<void> {
    if (this.room) await this.disconnect('replace');
    this.disposed = false;
    this.opts = opts;
    this.state = { phase: 'acquiring', canPlaybackAudio: false, participants: {}, roomName: opts.roomName };
    this.emit();

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;

    room
      .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
      .on(RoomEvent.ParticipantDisconnected, () => this.refreshParticipants())
      .on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => this.refreshParticipants())
      .on(RoomEvent.TrackUnsubscribed, () => this.refreshParticipants())
      .on(RoomEvent.TrackMuted, () => this.refreshParticipants())
      .on(RoomEvent.TrackUnmuted, () => this.refreshParticipants())
      .on(RoomEvent.LocalTrackPublished, () => this.refreshParticipants())
      .on(RoomEvent.LocalTrackUnpublished, () => this.refreshParticipants())
      .on(RoomEvent.ActiveSpeakersChanged, () => this.refreshParticipants())
      .on(RoomEvent.ConnectionQualityChanged, () => this.refreshParticipants())
      .on(RoomEvent.AudioPlaybackStatusChanged, () => this.emit({ canPlaybackAudio: room.canPlaybackAudio }))
      .on(RoomEvent.ConnectionStateChanged, (st: ConnectionState) => {
        if (st === ConnectionState.Connecting) this.emit({ phase: 'connecting' });
        else if (st === ConnectionState.Connected) this.emit({ phase: 'connected' });
        else if (st === ConnectionState.Reconnecting) this.emit({ phase: 'reconnecting' });
        else if (st === ConnectionState.Disconnected) this.emit({ phase: 'disconnected' });
      })
      .on(RoomEvent.Disconnected, () => this.emit({ phase: 'disconnected' }));

    try {
      this.emit({ phase: 'connecting' });
      await room.connect(opts.url || '', opts.token || '', { autoSubscribe: true });
      this.emit({ phase: room.state === ConnectionState.Connected ? 'connected' : 'connecting', canPlaybackAudio: room.canPlaybackAudio });

      const wantAudio = opts.initialMicEnabled !== false;
      const wantVideo = opts.kind === 'video' ? (opts.initialCameraEnabled !== false) : false;
      try {
        if (wantAudio || wantVideo) {
          const tracks = await createLocalTracks({ audio: wantAudio, video: wantVideo ? { facingMode: 'user' } : false });
          for (const t of tracks) await room.localParticipant.publishTrack(t);
        }
      } catch (e: any) {
        const msg = friendlyMediaError(e);
        this.emit({ error: msg });
      }
      try { await room.startAudio(); } catch {}
      this.refreshParticipants();
    } catch (e: any) {
      this.emit({ phase: 'failed', error: friendlyMediaError(e) });
      throw e;
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    const room = this.room; if (!room) return;
    try { await room.localParticipant.setMicrophoneEnabled(enabled); } catch (e: any) { this.emit({ error: friendlyMediaError(e) }); }
    this.refreshParticipants();
  }

  async setCameraEnabled(enabled: boolean) {
    const room = this.room; if (!room) return;
    try { await room.localParticipant.setCameraEnabled(enabled); } catch (e: any) { this.emit({ error: friendlyMediaError(e) }); }
    this.refreshParticipants();
  }

  async switchCamera() {
    const room = this.room; if (!room) return;
    try {
      const lp: any = room.localParticipant;
      const pub = lp.getTrackPublication ? lp.getTrackPublication(Track.Source.Camera) : null;
      const track: any = pub?.track;
      if (track?.switchCamera) {
        const facing = track.getSettings?.().facingMode === 'environment' ? 'user' : 'environment';
        await track.switchCamera(facing);
      } else if (track?.restartTrack) {
        const facing = track.getSettings?.().facingMode === 'environment' ? 'user' : 'environment';
        await track.restartTrack({ facingMode: facing });
      } else if (typeof lp.switchActiveDevice === 'function') {
        const devices = await Room.getLocalDevices('videoinput');
        if (devices && devices.length > 1) {
          const current = pub?.track?.mediaStreamTrack?.getSettings?.().deviceId;
          const idx = Math.max(0, devices.findIndex(d => d.deviceId === current));
          const next = devices[(idx + 1) % devices.length];
          await lp.switchActiveDevice('videoinput', next.deviceId);
        }
      }
    } catch (e: any) { this.emit({ error: friendlyMediaError(e) }); }
    this.refreshParticipants();
  }

  async setScreenShareEnabled(enabled: boolean) {
    const room = this.room; if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(enabled);
    } catch (e: any) { this.emit({ error: friendlyMediaError(e) }); }
    this.refreshParticipants();
  }

  async startAudioPlayback() {
    try { await this.room?.startAudio(); this.emit({ canPlaybackAudio: !!this.room?.canPlaybackAudio }); } catch {}
  }

  async disconnect(reason = 'leave') {
    this.disposed = reason !== 'replace';
    const room = this.room;
    this.room = null;
    try {
      if (room) {
        try { await room.localParticipant.setMicrophoneEnabled(false); } catch {}
        try { await room.localParticipant.setCameraEnabled(false); } catch {}
        try { await room.localParticipant.setScreenShareEnabled(false); } catch {}
        try { room.localParticipant.trackPublications?.forEach((pub: any) => { try { pub.track?.stop?.(); } catch {} }); } catch {}
        try { await room.disconnect(true); } catch { try { room.disconnect(); } catch {} }
      }
    } finally {
      if (reason !== 'replace') this.emit({ phase: 'disconnected' });
      this.state.participants = {};
    }
  }
}

type PeerEntry = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingIce: RTCIceCandidateInit[];
  signalChain: Promise<void>;
  lastOfferAt: number;
  remoteStream: MediaStream;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
};

let sharedCallAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCallAudioCtx || sharedCallAudioCtx.state === 'closed') {
      sharedCallAudioCtx = new Ctx();
    }
    return sharedCallAudioCtx;
  } catch {
    return null;
  }
}

export async function unlockCallAudioContext(): Promise<boolean> {
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Play 1-sample silent buffer inside user gesture to unlock iOS/Android/Desktop playback
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    return ctx.state === 'running';
  } catch {
    return ctx.state === 'running';
  }
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

export function hasLocalMediaSupport(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  } catch {
    return false;
  }
}

export class WebRTCCallSession implements ICallMediaSession {
  private opts: CallMediaOptions | null = null;
  private state: CallMediaState = { phase: 'idle', canPlaybackAudio: true, participants: {} };
  private disposed = false;
  private mediaReady = false;
  private preMediaSignals: Array<{ fromUserId: string; signal: any; seq?: number }> = [];
  private peers = new Map<string, PeerEntry>();
  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  private facingMode: 'user' | 'environment' = 'user';
  private micEnabled = true;
  private cameraEnabled = false;
  private screenShareEnabled = false;
  private pollAfterSeq = 0;
  private seenSeqs = new Set<number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private relayFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingInFlight = false;
  private usingRelay = false;
  private localAudioLevel = 0;
  private remoteAudioFrames = 0;
  private webrtcBytesReceived = 0;
  private captureNode: ScriptProcessorNode | null = null;
  private captureSrc: MediaStreamAudioSourceNode | null = null;
  private captureGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private nextRelayPlayTime = 0;

  getState() { return this.state; }

  private emit(patch?: Partial<CallMediaState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...(patch || {}) };
    try { this.opts?.onState(this.state); } catch {}
  }

  private findSender(pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | undefined {
    const direct = pc.getSenders().find((s) => s.track?.kind === kind);
    if (direct) return direct;
    const tr = pc.getTransceivers().find(
      (t) => t.receiver?.track?.kind === kind || t.sender?.track?.kind === kind
    );
    return tr?.sender;
  }

  private rebuildParticipants(error?: string) {
    const selfId = this.opts?.selfUserId || 'local';
    const next: Record<string, CallMediaParticipantView> = {
      [selfId]: {
        identity: selfId,
        name: this.opts?.selfName || 'Me',
        isLocal: true,
        audioEnabled: !!this.localAudioTrack && this.localAudioTrack.enabled && this.micEnabled,
        videoEnabled: !!this.localVideoTrack && this.localVideoTrack.enabled && this.cameraEnabled,
        screenShareEnabled: !!this.localScreenTrack && this.screenShareEnabled,
        speaking: false,
        connectionQuality: 'good',
        audioTrack: this.localAudioTrack,
        videoTrack: this.localVideoTrack,
        screenTrack: this.localScreenTrack,
      },
    };
    for (const [peerId, entry] of this.peers.entries()) {
      const pcState = entry.pc.connectionState;
      const quality =
        pcState === 'connected' ? 'excellent' :
        pcState === 'connecting' ? 'good' :
        pcState === 'disconnected' ? 'poor' : 'good';
      next[peerId] = {
        identity: peerId,
        isLocal: false,
        audioEnabled: !!entry.audioTrack && entry.audioTrack.readyState === 'live',
        videoEnabled: !!entry.videoTrack && entry.videoTrack.readyState === 'live',
        screenShareEnabled: false,
        speaking: false,
        connectionQuality: quality,
        audioTrack: entry.audioTrack,
        videoTrack: entry.videoTrack,
        screenTrack: null,
      };
    }
    this.emit({ participants: next, ...(error !== undefined ? { error } : {}) });
  }

  private async acquireInitialMedia(opts: CallMediaOptions) {
    const wantAudio = opts.initialMicEnabled !== false;
    const wantVideo = opts.kind === 'video' && opts.initialCameraEnabled !== false;
    this.micEnabled = wantAudio;
    this.cameraEnabled = wantVideo;

    if (!hasLocalMediaSupport()) {
      const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
      this.emit({
        error: insecure
          ? '当前网站通过 HTTP 访问，浏览器安全策略已禁止调用麦克风与摄像头；请使用 HTTPS 或 localhost 打开以启用实时音视频（信令已正常连接）。'
          : '当前浏览器不支持麦克风/摄像头采集，将以只收听模式连接。',
      });
      return;
    }

    if (!wantAudio && !wantVideo) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: wantAudio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
        video: wantVideo ? { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      this.localAudioTrack = stream.getAudioTracks()[0] || null;
      this.localVideoTrack = stream.getVideoTracks()[0] || null;
      if (this.localAudioTrack) this.localAudioTrack.enabled = this.micEnabled;
      if (this.localVideoTrack) this.localVideoTrack.enabled = this.cameraEnabled;
    } catch (err: any) {
      if (wantVideo && wantAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          this.localAudioTrack = audioStream.getAudioTracks()[0] || null;
          if (this.localAudioTrack) this.localAudioTrack.enabled = this.micEnabled;
          this.cameraEnabled = false;
          this.emit({ error: '未检测到可用摄像头或权限受限，已自动切换为语音通话。' });
          return;
        } catch (audioErr: any) {
          this.emit({ error: friendlyMediaError(audioErr) });
          return;
        }
      }
      this.emit({ error: friendlyMediaError(err) });
    }
  }

  private async createAndSendOffer(peerId: string, entry: PeerEntry, iceRestart = false) {
    const pc = entry.pc;
    if (this.disposed || entry.makingOffer) return;
    if (!iceRestart && pc.signalingState !== 'stable') return;
    try {
      entry.makingOffer = true;
      entry.lastOfferAt = Date.now();
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (this.disposed) return;
      await pc.setLocalDescription(offer);
      if (pc.localDescription) {
        await this.opts?.sendSignal?.(peerId, { type: 'offer', sdp: pc.localDescription.toJSON() });
      }
    } catch {
    } finally {
      entry.makingOffer = false;
    }
  }

  private getOrCreatePeer(peerId: string): PeerEntry {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: this.opts?.iceServers?.length
        ? this.opts.iceServers
        : [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
          ],
    });
    const entry: PeerEntry = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingIce: [],
      signalChain: Promise.resolve(),
      lastOfferAt: 0,
      remoteStream: new MediaStream(),
      audioTrack: null,
      videoTrack: null,
    };
    this.peers.set(peerId, entry);

    const selfId = this.opts?.selfUserId || '';
    const polite = selfId < peerId;

    if (this.localAudioTrack) {
      pc.addTrack(this.localAudioTrack, new MediaStream([this.localAudioTrack]));
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
    }
    const activeVideo = this.localScreenTrack || this.localVideoTrack;
    if (activeVideo) {
      pc.addTrack(activeVideo, new MediaStream([activeVideo]));
    } else if (this.opts?.kind === 'video') {
      try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch {}
    }

    pc.onicecandidate = (ev) => {
      if (this.disposed || !ev.candidate) return;
      void this.opts?.sendSignal?.(peerId, { type: 'candidate', candidate: ev.candidate.toJSON() });
    };

    pc.onnegotiationneeded = async () => {
      if (this.disposed) return;
      // Avoid initial offer collisions: only impolite peer sends initial offer,
      // while polite peer triggers offers for subsequent mid-call track changes.
      if (polite && !pc.remoteDescription) return;
      await this.createAndSendOffer(peerId, entry, false);
    };

    pc.ontrack = (ev) => {
      const track = ev.track;
      if (track.kind === 'audio') {
        entry.audioTrack = track;
      } else if (track.kind === 'video') {
        entry.videoTrack = track;
      }
      track.onended = () => {
        if (entry.audioTrack === track) entry.audioTrack = null;
        if (entry.videoTrack === track) entry.videoTrack = null;
        this.rebuildParticipants();
      };
      track.onunmute = () => this.rebuildParticipants();
      this.rebuildParticipants();
    };

    const isAnyPeerConnected = () =>
      Array.from(this.peers.values()).some(
        (p) => p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
      );

    const syncConnectionPhase = () => {
      if (this.disposed) return;
      const states = Array.from(this.peers.values()).map((p) => p.pc.connectionState);
      const iceStates = Array.from(this.peers.values()).map((p) => p.pc.iceConnectionState);
      if (states.some((s) => s === 'connected') || iceStates.some((s) => s === 'connected' || s === 'completed')) {
        if (this.usingRelay && this.webrtcBytesReceived > 0) this.usingRelay = false;
        this.emit({ phase: 'connected', connectionQuality: 'excellent' });
      } else if (this.usingRelay) {
        this.emit({ phase: 'connected', connectionQuality: 'good' });
      } else if (states.some((s) => s === 'disconnected') || iceStates.some((s) => s === 'disconnected')) {
        this.emit({ phase: 'reconnecting', connectionQuality: 'poor' });
      } else if (states.length && (states.every((s) => s === 'failed') || iceStates.every((s) => s === 'failed'))) {
        if (this.opts?.sendAudioFrame) {
          this.activateAudioRelay();
        } else {
          this.emit({ phase: 'failed', error: 'P2P 音视频连接失败，请检查网络、防火墙或尝试重连。' });
        }
      }
      this.rebuildParticipants();
    };

    pc.onconnectionstatechange = syncConnectionPhase;
    pc.oniceconnectionstatechange = () => {
      if (this.disposed) return;
      if (pc.iceConnectionState === 'failed' && !isAnyPeerConnected() && this.opts?.sendAudioFrame) {
        this.activateAudioRelay();
      }
      syncConnectionPhase();
    };

    if (!polite) {
      setTimeout(() => {
        if (!this.disposed && pc.signalingState === 'stable' && !pc.remoteDescription && !entry.makingOffer) {
          void this.createAndSendOffer(peerId, entry, false);
        }
      }, 80);
    }

    return entry;
  }

  private startAudioCaptureAndMonitor() {
    this.stopAudioCapture();
    if (!this.localAudioTrack) return;
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      const src = ctx.createMediaStreamSource(new MediaStream([this.localAudioTrack]));
      this.captureSrc = src;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      this.analyser = analyser;
      this.analyserData = new Uint8Array(analyser.frequencyBinCount);

      if (typeof ctx.createScriptProcessor === 'function' && this.opts?.sendAudioFrame) {
        const proc = ctx.createScriptProcessor(2048, 1, 1);
        const zeroGain = ctx.createGain();
        zeroGain.gain.value = 0;
        src.connect(proc);
        proc.connect(zeroGain);
        zeroGain.connect(ctx.destination);
        this.captureNode = proc;
        this.captureGain = zeroGain;

        const inRate = ctx.sampleRate || 48000;
        const outRate = 16000;
        const ratio = inRate / outRate;
        let carry: number[] = [];

        proc.onaudioprocess = (ev) => {
          if (this.disposed || !this.usingRelay || !this.micEnabled || !this.localAudioTrack?.enabled) return;
          const isP2pFlowing = this.webrtcBytesReceived > 0 && Array.from(this.peers.values()).some(
            (p) => p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
          );
          if (isP2pFlowing) {
            this.usingRelay = false;
            return;
          }
          const input = ev.inputBuffer.getChannelData(0);
          for (let i = 0; i < input.length; i++) carry.push(input[i]);
          const neededIn = Math.floor(640 * ratio); // ~40ms at 16kHz
          while (carry.length >= neededIn) {
            const slice = carry.splice(0, neededIn);
            const pcm = new Int16Array(640);
            for (let j = 0; j < 640; j++) {
              const idx = Math.min(slice.length - 1, Math.floor(j * ratio));
              const sample = Math.max(-1, Math.min(1, slice[idx]));
              pcm[j] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            }
            try { this.opts?.sendAudioFrame?.(int16ToBase64(pcm), outRate); } catch {}
          }
        };
      }
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    } catch {}
  }

  private stopAudioCapture() {
    try { this.captureNode?.disconnect(); } catch {}
    try { this.captureSrc?.disconnect(); } catch {}
    try { this.captureGain?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    this.captureNode = null;
    this.captureSrc = null;
    this.captureGain = null;
    this.analyser = null;
    this.analyserData = null;
  }

  private activateAudioRelay() {
    if (this.disposed) return;
    if (this.usingRelay) {
      if (this.state.phase !== 'connected') {
        this.emit({ phase: 'connected', connectionQuality: 'good' });
      }
      return;
    }
    this.usingRelay = true;
    const ctx = getSharedAudioContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    this.emit({ phase: 'connected', connectionQuality: 'good' });
  }

  handleRemoteAudioFrame(fromUserId: string, pcmBase64: string, sampleRate: number): void {
    if (this.disposed || !fromUserId || fromUserId === this.opts?.selfUserId || !pcmBase64) return;
    const peer = this.peers.get(fromUserId);
    const peerConnected = !!(peer && (peer.pc.connectionState === 'connected' || peer.pc.iceConnectionState === 'connected' || peer.pc.iceConnectionState === 'completed'));
    if (peerConnected && this.webrtcBytesReceived > 0) {
      return; // P2P RTP confirmed flowing
    }
    if (!this.usingRelay) {
      this.activateAudioRelay();
    }
    this.remoteAudioFrames += 1;
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') {
        this.emit({ canPlaybackAudio: false });
        return;
      }
    }
    try {
      const floatData = base64ToFloat32(pcmBase64);
      if (!floatData.length) return;
      const sr = Math.max(8000, Math.min(48000, sampleRate || 16000));
      const buf = ctx.createBuffer(1, floatData.length, sr);
      buf.getChannelData(0).set(floatData);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      if (this.nextRelayPlayTime < now || this.nextRelayPlayTime > now + 0.6) {
        this.nextRelayPlayTime = now + 0.05;
      }
      src.start(this.nextRelayPlayTime);
      this.nextRelayPlayTime += buf.duration;
      if (!this.state.canPlaybackAudio) this.emit({ canPlaybackAudio: true });
    } catch {}
  }

  private async refreshAudioDiagnostics() {
    if (this.disposed) return;
    let level = 0;
    if (this.analyser && this.analyserData && this.micEnabled && this.localAudioTrack?.enabled) {
      try {
        this.analyser.getByteTimeDomainData(this.analyserData);
        let peak = 0;
        for (let i = 0; i < this.analyserData.length; i++) {
          const v = Math.abs(this.analyserData[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        level = Math.min(100, Math.round(peak * 220));
      } catch {}
    }
    this.localAudioLevel = level;

    let bytesSent = 0;
    let bytesReceived = 0;
    let iceState = 'new';
    for (const [, entry] of this.peers.entries()) {
      iceState = entry.pc.iceConnectionState || entry.pc.connectionState || iceState;
      try {
        const stats = await entry.pc.getStats();
        stats.forEach((rep: any) => {
          if (rep.type === 'outbound-rtp' && (rep.kind === 'audio' || rep.mediaType === 'audio')) {
            bytesSent += Number(rep.bytesSent || 0);
          }
          if (rep.type === 'inbound-rtp' && (rep.kind === 'audio' || rep.mediaType === 'audio')) {
            bytesReceived += Number(rep.bytesReceived || 0);
          }
        });
      } catch {}
    }
    this.webrtcBytesReceived = bytesReceived;
    const p2pConnected = Array.from(this.peers.values()).some(
      (p) => p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
    );
    if (this.usingRelay && p2pConnected && bytesReceived > 0) {
      this.usingRelay = false;
    }
    const nextPhasePatch: Partial<CallMediaState> =
      this.usingRelay && this.state.phase !== 'connected'
        ? { phase: 'connected', connectionQuality: 'good' }
        : {};
    this.emit({
      ...nextPhasePatch,
      audioStats: {
        localLevel: this.localAudioLevel,
        iceState,
        bytesSent,
        bytesReceived,
        usingRelay: this.usingRelay,
        hasLocalAudio: !!this.localAudioTrack,
        remoteAudioFrames: this.remoteAudioFrames,
      },
    });
  }

  async connect(opts: CallMediaOptions): Promise<void> {
    if (this.peers.size > 0 || this.localAudioTrack || this.localVideoTrack || this.localScreenTrack) {
      await this.disconnect('replace');
    }
    this.disposed = false;
    this.mediaReady = false;
    this.preMediaSignals = [];
    this.opts = opts;
    this.pollAfterSeq = 0;
    this.seenSeqs.clear();
    this.usingRelay = false;
    this.remoteAudioFrames = 0;
    this.webrtcBytesReceived = 0;
    this.nextRelayPlayTime = 0;
    this.state = { phase: 'acquiring', canPlaybackAudio: true, participants: {}, roomName: opts.roomName };
    this.emit();

    await this.acquireInitialMedia(opts);
    if (this.disposed) return;

    this.startAudioCaptureAndMonitor();

    this.mediaReady = true;
    this.emit({ phase: this.usingRelay ? 'connected' : 'connecting' });
    if (opts.reconnect && opts.pollSignals) {
      try {
        const cur = await opts.pollSignals(Number.MAX_SAFE_INTEGER);
        if (typeof cur?.lastSeq === 'number' && cur.lastSeq > this.pollAfterSeq) {
          this.pollAfterSeq = cur.lastSeq;
        }
      } catch {}
    }
    const others = (opts.participantIds || []).filter((id) => id && id !== opts.selfUserId);
    for (const peerId of others) {
      this.getOrCreatePeer(peerId);
    }
    this.rebuildParticipants();

    // Flush any remote signals that arrived while waiting for mic/camera permissions
    if (this.preMediaSignals.length > 0) {
      const queued = [...this.preMediaSignals];
      this.preMediaSignals = [];
      for (const item of queued) {
        await this.handleRemoteSignal(item.fromUserId, item.signal, item.seq);
      }
    }

    // Announce readiness so remote peer initiates/re-syncs offer cleanly
    try { await opts.sendSignal?.(undefined, { type: 'ready', ...(opts.reconnect ? { reset: true } : {}) }); } catch {}

    // If direct P2P ICE fails to connect within 2.8s (e.g. symmetric NAT without TURN), seamlessly activate WS audio relay
    if (opts.sendAudioFrame) {
      this.relayFallbackTimer = setTimeout(() => {
        if (this.disposed) return;
        const connected = Array.from(this.peers.values()).some(
          (p) => p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
        );
        if (!connected) {
          this.activateAudioRelay();
        }
      }, 2800);
    }

    this.statsTimer = setInterval(() => {
      void this.refreshAudioDiagnostics();
    }, 600);

    // Resilient polling fallback for SDP/ICE signals
    if (opts.pollSignals) {
      const pull = async () => {
        if (this.disposed || this.pollingInFlight || !opts.pollSignals) return;
        this.pollingInFlight = true;
        try {
          const d = await opts.pollSignals(this.pollAfterSeq);
          for (const item of d?.signals || []) {
            if (item?.fromUserId && item?.signal) {
              await this.handleRemoteSignal(item.fromUserId, item.signal, item.seq);
            }
          }
          if (typeof d?.lastSeq === 'number' && d.lastSeq > this.pollAfterSeq) {
            this.pollAfterSeq = d.lastSeq;
          }
        } catch {
        } finally {
          this.pollingInFlight = false;
        }
      };
      void pull();
      this.pollTimer = setInterval(() => { void pull(); }, 1000);
    }
  }

  async handleRemoteSignal(fromUserId: string, signal: any, seq?: number): Promise<void> {
    if (this.disposed || !fromUserId || fromUserId === this.opts?.selfUserId || !signal) return;
    if (!this.mediaReady) {
      if (typeof seq === 'number' && this.preMediaSignals.some((x) => x.seq === seq)) return;
      this.preMediaSignals.push({ fromUserId, signal, seq });
      return;
    }
    if (typeof seq === 'number') {
      if (this.seenSeqs.has(seq)) return;
      this.seenSeqs.add(seq);
    }

    const entry = this.getOrCreatePeer(fromUserId);
    entry.signalChain = entry.signalChain
      .then(() => this.processPeerSignal(fromUserId, entry, signal))
      .catch(() => {});
    await entry.signalChain;
  }

  private async processPeerSignal(fromUserId: string, entry: PeerEntry, signal: any): Promise<void> {
    if (this.disposed) return;
    const pc = entry.pc;
    const selfId = this.opts?.selfUserId || '';
    const polite = selfId < fromUserId;

    if (signal.type === 'ready') {
      if (signal.reset) entry.pendingIce = [];
      if (!polite && (signal.reset || pc.connectionState !== 'connected') && !entry.makingOffer) {
        const recentlyOffered = Date.now() - entry.lastOfferAt < 350;
        if (signal.reset || !recentlyOffered || pc.remoteDescription) {
          await this.createAndSendOffer(fromUserId, entry, !!pc.remoteDescription || !!signal.reset);
        }
      }
      return;
    }

    if (signal.type === 'offer' || signal.type === 'answer') {
      const desc = signal.sdp;
      if (!desc) return;
      const offerCollision =
        desc.type === 'offer' &&
        (entry.makingOffer || pc.signalingState !== 'stable');
      entry.ignoreOffer = !polite && offerCollision;
      if (entry.ignoreOffer) return;

      if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') {
        return;
      }

      if (offerCollision && polite && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch {}
      }

      entry.isSettingRemoteAnswerPending = desc.type === 'answer';
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
      } finally {
        entry.isSettingRemoteAnswerPending = false;
      }

      while (entry.pendingIce.length > 0) {
        const cand = entry.pendingIce.shift()!;
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
      }

      if (desc.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pc.localDescription) {
          await this.opts?.sendSignal?.(fromUserId, { type: 'answer', sdp: pc.localDescription.toJSON() });
        }
      }
      return;
    }

    if (signal.type === 'candidate' && signal.candidate) {
      try {
        if (!pc.remoteDescription) {
          entry.pendingIce.push(signal.candidate);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
      }
    }
  }

  private async replaceVideoTrackOnPeers(newTrack: MediaStreamTrack | null) {
    for (const [peerId, entry] of this.peers.entries()) {
      const sender = this.findSender(entry.pc, 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
        const tr = entry.pc.getTransceivers().find((t) => t.sender === sender);
        if (tr && newTrack && tr.direction === 'recvonly') {
          try { tr.direction = 'sendrecv'; } catch {}
          await this.createAndSendOffer(peerId, entry, false);
        }
      } else if (newTrack) {
        entry.pc.addTrack(newTrack, new MediaStream([newTrack]));
        await this.createAndSendOffer(peerId, entry, false);
      }
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    if (enabled && !this.localAudioTrack && hasLocalMediaSupport()) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        const t = s.getAudioTracks()[0] || null;
        if (t) {
          this.localAudioTrack = t;
          this.startAudioCaptureAndMonitor();
          for (const [peerId, entry] of this.peers.entries()) {
            const sender = this.findSender(entry.pc, 'audio');
            if (sender) {
              await sender.replaceTrack(t);
              const tr = entry.pc.getTransceivers().find((x) => x.sender === sender);
              if (tr && tr.direction === 'recvonly') {
                try { tr.direction = 'sendrecv'; } catch {}
                await this.createAndSendOffer(peerId, entry, false);
              }
            } else {
              entry.pc.addTrack(t, new MediaStream([t]));
              await this.createAndSendOffer(peerId, entry, false);
            }
          }
        }
      } catch (e: any) {
        this.emit({ error: friendlyMediaError(e) });
      }
    }
    if (this.localAudioTrack) this.localAudioTrack.enabled = enabled;
    this.rebuildParticipants();
  }

  async setCameraEnabled(enabled: boolean) {
    this.cameraEnabled = enabled;
    if (enabled && !this.localVideoTrack && hasLocalMediaSupport()) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const t = s.getVideoTracks()[0] || null;
        if (t) {
          this.localVideoTrack = t;
          if (!this.screenShareEnabled) await this.replaceVideoTrackOnPeers(t);
        }
      } catch (e: any) {
        this.cameraEnabled = false;
        this.emit({ error: friendlyMediaError(e) });
      }
    }
    if (this.localVideoTrack) this.localVideoTrack.enabled = enabled;
    this.rebuildParticipants();
  }

  async switchCamera() {
    if (!hasLocalMediaSupport()) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      const old = this.localVideoTrack;
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const next = s.getVideoTracks()[0] || null;
      if (next) {
        next.enabled = this.cameraEnabled;
        this.localVideoTrack = next;
        if (!this.screenShareEnabled) await this.replaceVideoTrackOnPeers(next);
        try { old?.stop(); } catch {}
      }
    } catch (e: any) {
      this.emit({ error: friendlyMediaError(e) });
    }
    this.rebuildParticipants();
  }

  async setScreenShareEnabled(enabled: boolean) {
    if (enabled) {
      if (!(navigator.mediaDevices as any)?.getDisplayMedia) {
        this.emit({ error: '当前设备浏览器不支持屏幕共享。' });
        return;
      }
      try {
        const s: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
        const t = s.getVideoTracks()[0] || null;
        if (!t) return;
        this.localScreenTrack = t;
        this.screenShareEnabled = true;
        t.onended = () => { void this.setScreenShareEnabled(false); };
        await this.replaceVideoTrackOnPeers(t);
      } catch (e: any) {
        this.emit({ error: friendlyMediaError(e) });
      }
    } else {
      const old = this.localScreenTrack;
      this.localScreenTrack = null;
      this.screenShareEnabled = false;
      try { old?.stop(); } catch {}
      await this.replaceVideoTrackOnPeers(this.cameraEnabled ? this.localVideoTrack : null);
    }
    this.rebuildParticipants();
  }

  async startAudioPlayback() {
    const unlocked = await unlockCallAudioContext();
    this.emit({ canPlaybackAudio: unlocked || true });
  }

  async disconnect(reason = 'leave') {
    this.disposed = reason !== 'replace';
    this.mediaReady = false;
    this.preMediaSignals = [];
    this.usingRelay = false;
    this.seenSeqs.clear();
    if (this.relayFallbackTimer) {
      clearTimeout(this.relayFallbackTimer);
      this.relayFallbackTimer = null;
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopAudioCapture();
    for (const [, entry] of this.peers.entries()) {
      try { entry.pc.close(); } catch {}
    }
    this.peers.clear();
    for (const t of [this.localAudioTrack, this.localVideoTrack, this.localScreenTrack]) {
      try { t?.stop(); } catch {}
    }
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.localScreenTrack = null;
    this.screenShareEnabled = false;
    if (reason !== 'replace') this.emit({ phase: 'disconnected', participants: {} });
    else this.state.participants = {};
  }
}

export function createCallMediaSession(provider?: string): ICallMediaSession {
  if (provider === 'livekit') return new LiveKitCallSession();
  return new WebRTCCallSession();
}

export function friendlyMediaError(e: any): string {
  const name = String(e?.name || '');
  const msg = String(e?.message || e || '');
  if (name === 'NotAllowedError' || /Permission denied|not allowed/i.test(msg)) return '麦克风/摄像头权限被拒绝，请在浏览器地址栏允许访问。';
  if (name === 'NotFoundError' || /Requested device not found/i.test(msg)) return '未检测到可用的麦克风或摄像头设备。';
  if (name === 'NotReadableError' || /Could not start|Device in use/i.test(msg)) return '麦克风/摄像头正被其他应用占用。';
  if (name === 'OverconstrainedError') return '当前设备不支持所请求的摄像头分辨率或模式。';
  if (/MEDIA_NOT_CONFIGURED/i.test(msg)) return '媒体服务未配置。';
  if (/MEDIA_SDK_UNAVAILABLE/i.test(msg)) return '服务端媒体 SDK 不可用。';
  return msg || '音视频媒体连接异常';
}
