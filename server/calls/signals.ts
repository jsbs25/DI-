export interface CallSignalEntry {
  seq: number;
  signalId?: string;
  callId: string;
  fromUserId: string;
  toUserId?: string;
  signal: {
    type: 'offer' | 'answer' | 'candidate' | 'ready' | 'renegotiate';
    sdp?: any;
    candidate?: any;
    reset?: boolean;
  };
  at: string;
}

const MAX_SIGNALS_PER_CALL = 400;
const signalsByCall = new Map<string, CallSignalEntry[]>();
let globalSeq = 0;

export function pushCallSignal(
  callId: string,
  fromUserId: string,
  toUserId: string | undefined,
  signal: CallSignalEntry['signal'],
  signalId?: string
): { entry: CallSignalEntry; deduplicated: boolean } {
  const list = signalsByCall.get(callId) || [];
  if (signalId) {
    const existing = list.find(
      (s) => s.signalId === signalId && s.fromUserId === fromUserId
    );
    if (existing) {
      return { entry: existing, deduplicated: true };
    }
  }
  const entry: CallSignalEntry = {
    seq: ++globalSeq,
    ...(signalId ? { signalId } : {}),
    callId,
    fromUserId,
    toUserId: toUserId || undefined,
    signal,
    at: new Date().toISOString(),
  };
  list.push(entry);
  if (list.length > MAX_SIGNALS_PER_CALL) {
    list.splice(0, list.length - MAX_SIGNALS_PER_CALL);
  }
  signalsByCall.set(callId, list);
  return { entry, deduplicated: false };
}

export function listCallSignalsForUser(
  callId: string,
  userId: string,
  afterSeq = 0
): { signals: CallSignalEntry[]; lastSeq: number } {
  const list = signalsByCall.get(callId) || [];
  const signals = list.filter(
    (s) =>
      s.seq > afterSeq &&
      s.fromUserId !== userId &&
      (!s.toUserId || s.toUserId === userId)
  );
  const lastSeq = list.length ? list[list.length - 1].seq : afterSeq;
  return { signals, lastSeq };
}

export function clearCallSignals(callId: string) {
  signalsByCall.delete(callId);
}
