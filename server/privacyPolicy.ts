export type ProfileVisibility = 'everyone' | 'friends' | 'self';
export type FriendRequestPolicy = 'everyone' | 'mutual_group' | 'none';
export type StrangerMessagePolicy = 'everyone' | 'friends' | 'mutual_group';

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  searchableByUsername: boolean;
  searchableById: boolean;
  searchableByDisplayName: boolean;
  friendRequestPolicy: FriendRequestPolicy;
  showOnlineStatus: boolean;
  showLastActive: boolean;
  strangerMessagePolicy: StrangerMessagePolicy;
  readReceipts: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  profileVisibility: 'everyone',
  searchableByUsername: true,
  searchableById: true,
  searchableByDisplayName: true,
  friendRequestPolicy: 'everyone',
  showOnlineStatus: true,
  showLastActive: true,
  strangerMessagePolicy: 'everyone',
  readReceipts: true,
};

function oneOf<T extends string>(v: any, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function normalizePrivacySettings(raw: any): PrivacySettings {
  const cur = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_PRIVACY_SETTINGS;
  return {
    profileVisibility: oneOf(cur.profileVisibility, ['everyone', 'friends', 'self'] as const, d.profileVisibility),
    searchableByUsername: typeof cur.searchableByUsername === 'boolean' ? cur.searchableByUsername : d.searchableByUsername,
    searchableById: typeof cur.searchableById === 'boolean' ? cur.searchableById : d.searchableById,
    searchableByDisplayName: typeof cur.searchableByDisplayName === 'boolean' ? cur.searchableByDisplayName : d.searchableByDisplayName,
    friendRequestPolicy: oneOf(cur.friendRequestPolicy, ['everyone', 'mutual_group', 'none'] as const, d.friendRequestPolicy),
    showOnlineStatus: typeof cur.showOnlineStatus === 'boolean' ? cur.showOnlineStatus : d.showOnlineStatus,
    showLastActive: typeof cur.showLastActive === 'boolean' ? cur.showLastActive : d.showLastActive,
    strangerMessagePolicy: oneOf(cur.strangerMessagePolicy, ['everyone', 'friends', 'mutual_group'] as const, d.strangerMessagePolicy),
    readReceipts: typeof cur.readReceipts === 'boolean' ? cur.readReceipts : d.readReceipts,
  };
}

export function canViewProfile(viewerId: string | null, targetId: string, targetPrivacy: PrivacySettings, opts: { isFriend: boolean; blocked: boolean }) {
  if (opts.blocked) return false;
  if (viewerId && viewerId === targetId) return true;
  if (targetPrivacy.profileVisibility === 'everyone') return true;
  if (targetPrivacy.profileVisibility === 'friends') return !!opts.isFriend;
  return false; // self
}

export function maskPresenceForViewer(viewerId: string | null, targetId: string, targetPrivacy: PrivacySettings, isSelf: boolean) {
  if (isSelf || (viewerId && viewerId === targetId)) return { showOnline: true, showLastActive: true };
  return {
    showOnline: !!targetPrivacy.showOnlineStatus,
    showLastActive: !!targetPrivacy.showLastActive,
  };
}

export function canSearchMatch(query: string, target: { id: string; username: string; displayName: string }, targetPrivacy: PrivacySettings) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const byUsername = targetPrivacy.searchableByUsername && String(target.username || '').toLowerCase().includes(q);
  const byId = targetPrivacy.searchableById && String(target.id || '').toLowerCase().includes(q);
  const byName = targetPrivacy.searchableByDisplayName && String(target.displayName || '').toLowerCase().includes(q);
  return byUsername || byId || byName;
}

export function canSendFriendRequest(fromUserId: string, toUserId: string, targetPrivacy: PrivacySettings, ctx: { isFriend: boolean; blockedEither: boolean; hasMutualGroup: boolean }) {
  if (ctx.blockedEither) return { ok: false, error: 'Cannot send friend request due to block settings.' };
  if (ctx.isFriend) return { ok: false, error: 'Already friends.' };
  if (targetPrivacy.friendRequestPolicy === 'everyone') return { ok: true as const };
  if (targetPrivacy.friendRequestPolicy === 'mutual_group') return ctx.hasMutualGroup ? { ok: true as const } : { ok: false, error: 'This user only accepts friend requests from people in mutual groups.' };
  return { ok: false, error: 'This user does not accept friend requests.' };
}

export function canSendDirectMessage(fromUserId: string, toUserId: string, targetPrivacy: PrivacySettings, ctx: { isFriend: boolean; blockedEither: boolean; hasMutualGroup: boolean }) {
  if (ctx.blockedEither) return { ok: false, error: 'Messaging is not allowed due to block settings.' };
  if (targetPrivacy.strangerMessagePolicy === 'everyone') return { ok: true as const };
  if (targetPrivacy.strangerMessagePolicy === 'friends') return ctx.isFriend ? { ok: true as const } : { ok: false, error: 'This user only accepts messages from friends.' };
  return (ctx.isFriend || ctx.hasMutualGroup) ? { ok: true as const } : { ok: false, error: 'This user only accepts messages from friends or mutual group members.' };
}
