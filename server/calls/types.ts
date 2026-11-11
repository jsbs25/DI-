export type CallKind = 'audio' | 'video';
export type CallScope = 'direct' | 'group';
export type CallStatus =
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended'
  | 'rejected'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'canceled';

export interface CallParticipantState {
  userId: string;
  joinedAt?: string;
  leftAt?: string;
  status: 'invited' | 'ringing' | 'joined' | 'left' | 'rejected' | 'missed' | 'busy';
  micEnabled?: boolean;
  cameraEnabled?: boolean;
  screenSharing?: boolean;
  deviceLabel?: string;
}

export interface CallRecord {
  id: string;
  roomName: string;
  scope: CallScope;
  kind: CallKind;
  conversationId?: string;
  initiatorId: string;
  participantIds: string[];
  participants: Record<string, CallParticipantState>;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  endedBy?: string;
  endReason?: string;
  busyFor?: string;
  mediaProvider?: 'livekit' | 'none';
  capabilities?: {
    audio: boolean;
    video: boolean;
    screenShare: boolean;
    multiParty: boolean;
    switchCamera: boolean;
  };
  metadata?: Record<string, any>;
}

export interface CallInviteInput {
  scope: CallScope;
  kind: CallKind;
  conversationId?: string;
  targetUserId?: string;
  participantIds?: string[];
}

export interface CallTokenResponse {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
  callId?: string;
  roomName?: string;
  token?: string;
  url?: string;
  expiresInSec?: number;
  provider?: 'livekit' | 'none';
}
