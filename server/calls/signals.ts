export interface CallSignalEntry {
  seq: number;
  callId: string;
  fromUserId: string;
  toUserId?: string;
  signal: {
    type: 'offer' | 'answer' | 'candidate' | 'ready' | 'renegotiate';
    sdp?: any;
    candidate?: any;
  };
  at: string;
}

const MAX_SIGNALS_PER_CALL = 240;
const signalsByCall = new Map<string, CallSignalEntry[]>();
let globalSeq = 0;

export function pushCallSignal(
  callId: string,
  fromUserId: string,
  toUserId: string | undefined,
  signal: CallSignalEntry['signal']
): CallSignalEntry {
  const entry: CallSignalEntry = {
    seq: ++globalSeq,
    callId,
    fromUserId,
    toUserId: toUserId || undefined,
    signal,
    at: new Date().toISOString(),
  };
  const list = signalsByCall.get(callId) || [];
  list.push(entry);
  if (list.length > MAX_SIGNALS_PER_CALL) {
    list.splice(0, list.length - MAX_SIGNALS_PER_CALL);
  }
  signalsByCall.set(callId, list);
  return entry;
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
