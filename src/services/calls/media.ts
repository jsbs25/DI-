import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalParticipant,
  type Participant,
  createLocalTracks,
  createLocalScreenTracks,
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

export interface CallMediaState {
  phase: CallMediaPhase;
  roomName?: string;
  error?: string;
  reason?: string;
  canPlaybackAudio: boolean;
  connectionQuality?: string;
  participants: Record<string, CallMediaParticipantView>;
}

export interface CallMediaOptions {
  url: string;
  token: string;
  roomName?: string;
  kind: 'audio' | 'video';
  initialMicEnabled?: boolean;
  initialCameraEnabled?: boolean;
  onState: (state: CallMediaState) => void;
}

function trackToMedia(t: any): MediaStreamTrack | null {
  try { return t?.mediaStreamTrack || t?.track?.mediaStreamTrack || null; } catch { return null; }
}

export class LiveKitCallSession {
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
    // preserve tracks if missing
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
      await room.connect(opts.url, opts.token, { autoSubscribe: true });
      this.emit({ phase: room.state === ConnectionState.Connected ? 'connected' : 'connecting', canPlaybackAudio: room.canPlaybackAudio });

      // publish local tracks
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
      // try facingMode toggle
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
        // best effort: cycle video input devices
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
      if (enabled) {
        await room.localParticipant.setScreenShareEnabled(true);
      } else {
        await room.localParticipant.setScreenShareEnabled(false);
      }
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

export function friendlyMediaError(e: any): string {
  const name = String(e?.name || '');
  const msg = String(e?.message || e || '');
  if (name === 'NotAllowedError' || /Permission denied|not allowed/i.test(msg)) return 'Microphone/camera permission denied. Please allow access in browser settings.';
  if (name === 'NotFoundError' || /Requested device not found/i.test(msg)) return 'No microphone/camera device found.';
  if (name === 'NotReadableError' || /Could not start|Device in use/i.test(msg)) return 'Microphone/camera is in use by another app.';
  if (name === 'OverconstrainedError') return 'Requested camera/microphone constraints are not supported.';
  if (/MEDIA_NOT_CONFIGURED/i.test(msg)) return 'Media server is not configured.';
  if (/MEDIA_SDK_UNAVAILABLE/i.test(msg)) return 'Media SDK unavailable on server.';
  return msg || 'Media connection error';
}
