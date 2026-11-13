export type NotificationPrefs = {
  friendRequests: boolean;
  friendAccepted: boolean;
  groupEvents: boolean;
  messages: boolean;
  desktop: boolean;
  sound: boolean;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  friendRequests: true,
  friendAccepted: true,
  groupEvents: true,
  messages: true,
  desktop: true,
  sound: false,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '08:00',
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const v = value.slice(0, 5);
  return TIME_RE.test(v) ? v : fallback;
}

export function normalizeNotificationPrefs(raw: any): NotificationPrefs {
  const base = DEFAULT_NOTIFICATION_PREFS;
  const cur = raw && typeof raw === 'object' ? raw : {};
  const out: any = { ...base };
  for (const k of ['friendRequests','friendAccepted','groupEvents','messages','desktop','sound','dndEnabled'] as const) {
    if (typeof cur[k] === 'boolean') out[k] = cur[k];
  }
  out.dndStart = normalizeTime(cur.dndStart, base.dndStart);
  out.dndEnd = normalizeTime(cur.dndEnd, base.dndEnd);
  return out as NotificationPrefs;
}

export function getNotificationCategory(type: string): 'messages' | 'friendRequests' | 'friendAccepted' | 'groupEvents' | 'other' {
  switch (type) {
    case 'message_new': return 'messages';
    case 'friend_request': return 'friendRequests';
    case 'friend_accepted': return 'friendAccepted';
    case 'group_invite':
    case 'group_member_joined':
    case 'group_member_left':
    case 'group_admin_changed':
    case 'group_owner_transferred':
      return 'groupEvents';
    default: return 'other';
  }
}

export function isCategoryEnabled(prefs: NotificationPrefs, type: string): boolean {
  const cat = getNotificationCategory(type);
  if (cat === 'messages') return !!prefs.messages;
  if (cat === 'friendRequests') return !!prefs.friendRequests;
  if (cat === 'friendAccepted') return !!prefs.friendAccepted;
  if (cat === 'groupEvents') return !!prefs.groupEvents;
  return true;
}

export function parseHHMM(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// DND is evaluated in user's device local time on client for alerts; server uses provided local time context if available.
export function isDndActiveAtMinutes(prefs: NotificationPrefs, minutes: number): boolean {
  if (!prefs.dndEnabled) return false;
  const start = parseHHMM(prefs.dndStart);
  const end = parseHHMM(prefs.dndEnd);
  if (start == null || end == null) return false;
  if (start === end) return false; // same time => never active (avoid accidental all-day)
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end; // cross-midnight
}

export function isDndActiveNow(prefs: NotificationPrefs, now = new Date()): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  return isDndActiveAtMinutes(prefs, mins);
}

export type NotifyDecision = {
  categoryEnabled: boolean;
  persist: boolean;
  pushRealtime: boolean; // deliver notification payload/sync so center can update
  alertDesktop: boolean;
  alertSound: boolean;
  dndActive: boolean;
};

// Always persist notifications so history remains viewable and message/friend/group operations unaffected.
// Realtime push is sent when category enabled so center/unread stay consistent with reminders for that type;
// disabled types are still persisted but not pushed as active reminders (history remains queryable).
export function decideNotification(prefsRaw: any, type: string, opts?: { dndActive?: boolean; localMinutes?: number | null }) : NotifyDecision {
  const prefs = normalizeNotificationPrefs(prefsRaw);
  const categoryEnabled = isCategoryEnabled(prefs, type);
  const dndActive = typeof opts?.dndActive === 'boolean'
    ? opts.dndActive
    : (typeof opts?.localMinutes === 'number' ? isDndActiveAtMinutes(prefs, opts.localMinutes) : isDndActiveNow(prefs));
  const pushRealtime = categoryEnabled; // keep center/reminders consistent; history retained regardless
  const alertDesktop = categoryEnabled && !!prefs.desktop && !dndActive;
  const alertSound = categoryEnabled && !!prefs.sound && !dndActive;
  return { categoryEnabled, persist: true, pushRealtime, alertDesktop, alertSound, dndActive };
}
