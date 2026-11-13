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
  sendSignal?: (toUserId: string | undefined, signal: any) => Promise<void> | void;
  pollSignals?: (afterSeq: number) => Promise<{ signals: any[]; lastSeq: number }>;
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
  remoteStream: MediaStream;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
};

export class WebRTCCallSession implements ICallMediaSession {
  private opts: CallMediaOptions | null = null;
  private state: CallMediaState = { phase: 'idle', canPlaybackAudio: true, participants: {} };
  private disposed = false;
  private peers = new Map<string, PeerEntry>();
  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  private facingMode: 'user' | 'environment' = 'user';
  private micEnabled = true;
  private cameraEnabled = false;
  private screenShareEnabled = false;
  private seenSeq = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollingInFlight = false;

  getState() { return this.state; }

  private emit(patch?: Partial<CallMediaState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...(patch || {}) };
    try { this.opts?.onState(this.state); } catch {}
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

    if (!navigator.mediaDevices?.getUserMedia) {
      this.emit({ error: '当前浏览器环境不支持本地音视频采集（需 HTTPS 或 localhost），将以只收听模式连接。' });
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
        // Fallback to audio-only when camera is unavailable/denied
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          this.localAudioTrack = audioStream.getAudioTracks()[0] || null;
          this.cameraEnabled = false;
          this.emit({ error: '未检测到可用摄像头，已自动切换为语音通话。' });
          return;
        } catch (audioErr: any) {
          this.emit({ error: friendlyMediaError(audioErr) });
          return;
        }
      }
      this.emit({ error: friendlyMediaError(err) });
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
          ],
    });
    const entry: PeerEntry = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingIce: [],
      remoteStream: new MediaStream(),
      audioTrack: null,
      videoTrack: null,
    };
    this.peers.set(peerId, entry);

    const selfId = this.opts?.selfUserId || '';
    const polite = selfId < peerId;

    // Add local tracks (or recvonly transceivers so receive works even without mic/cam)
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
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          await this.opts?.sendSignal?.(peerId, { type: 'offer', sdp: pc.localDescription.toJSON() });
        }
      } catch {
      } finally {
        entry.makingOffer = false;
      }
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

    const syncConnectionPhase = () => {
      if (this.disposed) return;
      const states = Array.from(this.peers.values()).map((p) => p.pc.connectionState);
      if (states.some((s) => s === 'connected')) {
        this.emit({ phase: 'connected', connectionQuality: 'excellent' });
      } else if (states.some((s) => s === 'disconnected')) {
        this.emit({ phase: 'reconnecting', connectionQuality: 'poor' });
      } else if (states.length && states.every((s) => s === 'failed')) {
        this.emit({ phase: 'failed', error: 'P2P 音视频连接失败，请检查网络或防火墙设置。' });
      }
      this.rebuildParticipants();
    };

    pc.onconnectionstatechange = syncConnectionPhase;
    pc.oniceconnectionstatechange = () => {
      if (this.disposed) return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.emit({ phase: 'connected', connectionQuality: 'excellent' });
      } else if (pc.iceConnectionState === 'disconnected') {
        this.emit({ phase: 'reconnecting', connectionQuality: 'poor' });
      }
    };

    if (!polite && (this.localAudioTrack || activeVideo || this.opts?.kind)) {
      // Trigger initial offer proactively when impolite peer creates connection
      setTimeout(() => {
        if (!this.disposed && pc.signalingState === 'stable' && !pc.remoteDescription && !entry.makingOffer) {
          void pc.onnegotiationneeded?.(new Event('negotiationneeded'));
        }
      }, 60);
    }

    return entry;
  }

  async connect(opts: CallMediaOptions): Promise<void> {
    if (this.peers.size > 0 || this.localAudioTrack || this.localVideoTrack) {
      await this.disconnect('replace');
    }
    this.disposed = false;
    this.opts = opts;
    this.seenSeq = 0;
    this.state = { phase: 'acquiring', canPlaybackAudio: true, participants: {}, roomName: opts.roomName };
    this.emit();

    await this.acquireInitialMedia(opts);
    if (this.disposed) return;

    this.emit({ phase: 'connecting' });
    const others = (opts.participantIds || []).filter((id) => id && id !== opts.selfUserId);
    for (const peerId of others) {
      this.getOrCreatePeer(peerId);
    }
    this.rebuildParticipants();

    // Announce readiness so remote peer initiates/re-syncs offer if needed
    try { await opts.sendSignal?.(undefined, { type: 'ready' }); } catch {}

    // Start resilient polling fallback for SDP/ICE signals
    if (opts.pollSignals) {
      const pull = async () => {
        if (this.disposed || this.pollingInFlight || !opts.pollSignals) return;
        this.pollingInFlight = true;
        try {
          const d = await opts.pollSignals(this.seenSeq);
          for (const item of d?.signals || []) {
            if (item?.fromUserId && item?.signal) {
              await this.handleRemoteSignal(item.fromUserId, item.signal, item.seq);
            }
          }
          if (typeof d?.lastSeq === 'number' && d.lastSeq > this.seenSeq) {
            this.seenSeq = d.lastSeq;
          }
        } catch {
        } finally {
          this.pollingInFlight = false;
        }
      };
      void pull();
      this.pollTimer = setInterval(() => { void pull(); }, 1200);
    }
  }

  async handleRemoteSignal(fromUserId: string, signal: any, seq?: number): Promise<void> {
    if (this.disposed || !fromUserId || fromUserId === this.opts?.selfUserId || !signal) return;
    if (typeof seq === 'number') {
      if (seq <= this.seenSeq) return;
      this.seenSeq = seq;
    }

    const entry = this.getOrCreatePeer(fromUserId);
    const pc = entry.pc;
    const selfId = this.opts?.selfUserId || '';
    const polite = selfId < fromUserId;

    if (signal.type === 'ready') {
      // Remote peer just entered call media; impolite peer sends a fresh offer if not connected
      if (!polite && pc.connectionState !== 'connected' && !entry.makingOffer) {
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer({ iceRestart: pc.iceConnectionState === 'failed' });
          await pc.setLocalDescription(offer);
          if (pc.localDescription) {
            await this.opts?.sendSignal?.(fromUserId, { type: 'offer', sdp: pc.localDescription.toJSON() });
          }
        } catch {
        } finally {
          entry.makingOffer = false;
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

      entry.isSettingRemoteAnswerPending = desc.type === 'answer';
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
      } finally {
        entry.isSettingRemoteAnswerPending = false;
      }

      // Flush buffered ICE candidates now that remote description is set
      while (entry.pendingIce.length > 0) {
        const cand = entry.pendingIce.shift()!;
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
      }

      if (desc.type === 'offer') {
        await pc.setLocalDescription();
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
      } catch (err) {
        if (!entry.ignoreOffer) throw err;
      }
    }
  }

  private async replaceVideoTrackOnPeers(newTrack: MediaStreamTrack | null) {
    for (const [peerId, entry] of this.peers.entries()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      } else if (newTrack) {
        entry.pc.addTrack(newTrack, new MediaStream([newTrack]));
        // Renego handled by onnegotiationneeded or trigger explicitly
        if (entry.pc.signalingState === 'stable') {
          try {
            entry.makingOffer = true;
            await entry.pc.setLocalDescription();
            if (entry.pc.localDescription) {
              await this.opts?.sendSignal?.(peerId, { type: 'offer', sdp: entry.pc.localDescription.toJSON() });
            }
          } catch {
          } finally {
            entry.makingOffer = false;
          }
        }
      }
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    if (enabled && !this.localAudioTrack && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const t = s.getAudioTracks()[0] || null;
        if (t) {
          this.localAudioTrack = t;
          for (const [, entry] of this.peers.entries()) {
            const sender = entry.pc.getSenders().find((sd) => sd.track?.kind === 'audio');
            if (sender) await sender.replaceTrack(t);
            else entry.pc.addTrack(t, new MediaStream([t]));
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
    if (enabled && !this.localVideoTrack && navigator.mediaDevices?.getUserMedia) {
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
    if (!navigator.mediaDevices?.getUserMedia) return;
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
    this.emit({ canPlaybackAudio: true });
  }

  async disconnect(reason = 'leave') {
    this.disposed = reason !== 'replace';
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
  if (name === 'NotAllowedError' || /Permission denied|not allowed/i.test(msg)) return '麦克风/摄像头权限被拒绝，请在浏览器设置中允许访问。';
  if (name === 'NotFoundError' || /Requested device not found/i.test(msg)) return '未检测到可用的麦克风或摄像头设备。';
  if (name === 'NotReadableError' || /Could not start|Device in use/i.test(msg)) return '麦克风/摄像头正被其他应用占用。';
  if (name === 'OverconstrainedError') return '当前设备不支持所请求的摄像头分辨率或模式。';
  if (/MEDIA_NOT_CONFIGURED/i.test(msg)) return '媒体服务未配置。';
  if (/MEDIA_SDK_UNAVAILABLE/i.test(msg)) return '服务端媒体 SDK 不可用。';
  return msg || '音视频媒体连接异常';
}
