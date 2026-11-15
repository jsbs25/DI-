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

export function canViewProfileByPolicy(isSelf: boolean, isFriend: boolean, blockedEither: boolean, targetPrivacy: PrivacySettings) {
  if (blockedEither) return false;
  if (isSelf) return true;
  if (targetPrivacy.profileVisibility === 'everyone') return true;
  if (targetPrivacy.profileVisibility === 'friends') return !!isFriend;
  return false; // self only
}

export function canSearchByField(query: string, target: { id: string; username: string; displayName: string }, targetPrivacy: PrivacySettings) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const cleanQ = q.replace(/^@+/, '');
  if (!cleanQ) return false;
  const byUsername = targetPrivacy.searchableByUsername && String(target.username || '').toLowerCase().includes(cleanQ);
  const byId = targetPrivacy.searchableById && String(target.id || '').toLowerCase().includes(cleanQ);
  const byName = targetPrivacy.searchableByDisplayName && String(target.displayName || '').toLowerCase().includes(cleanQ);
  return byUsername || byId || byName;
}
