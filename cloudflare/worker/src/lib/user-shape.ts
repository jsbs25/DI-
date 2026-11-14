import { normalizePrivacySettings, DEFAULT_PRIVACY_SETTINGS, canViewProfileByPolicy } from './privacy';
import { qAll, qFirst } from './db';

export type DbUserRow = Record<string, any>;

export function parseJsonMaybe<T = any>(v: any, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(String(v)); } catch { return fallback; }
}

export function userLocation(row: DbUserRow) {
  return {
    countryCode: row.country_code || 'UN',
    countryName: row.country_name || 'Global',
    cityName: row.city_name || 'Earth',
    lat: typeof row.lat === 'number' ? row.lat : 0,
    lng: typeof row.lng === 'number' ? row.lng : 0,
    isPublic: row.is_public == null ? true : !!row.is_public,
  };
}

export function linkedIdentitiesPublic(row: DbUserRow) {
  const linked = parseJsonMaybe<any[]>(row.linked_identities_json, []);
  return linked.map(i => ({
    provider: i.provider,
    linked: !!i.providerUserId,
    displayName: i.displayName,
    email: i.provider === 'email' ? i.email : undefined,
    phone: i.provider === 'phone' ? i.phone : undefined,
    linkedAt: i.linkedAt,
  }));
}

export async function hasPassword(db: D1Database, userId: string) {
  const r = await qFirst<{ n: number }>(db, 'SELECT COUNT(*) as n FROM auth_accounts WHERE user_id = ?', userId);
  return Number(r?.n || 0) > 0;
}

export function selfUserView(row: DbUserRow, opts: { hasPassword: boolean }) {
  const loc = userLocation(row);
  const linked = linkedIdentitiesPublic(row);
  return {
    id: row.id,
    earthId: row.earth_id ?? parseJsonMaybe<any>(row.extra_json, {})?.earthId ?? null,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    banner: row.banner,
    bio: row.bio || '',
    location: loc,
    interests: parseJsonMaybe<string[]>(row.interests_json, []),
    followersCount: Number(row.followers_count || 0),
    followingCount: Number(row.following_count || 0),
    tipsReceived: Number(row.tips_received || 0),
    isOnline: !!row.is_online,
    lastActiveAt: row.last_active_at || undefined,
    verified: !!row.verified,
    joinedAt: row.joined_at,
    createdAt: row.joined_at,
    accountStatus: row.account_status || parseJsonMaybe<any>(row.extra_json, {})?.accountStatus || 'active',
    email: row.email || undefined,
    phone: row.phone || undefined,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    linkedIdentities: linked,
    hasCompletedOnboarding: row.has_completed_onboarding == null ? true : !!row.has_completed_onboarding,
    hasPassword: opts.hasPassword,
    bindingStatus: {
      email: { bound: !!row.email, verified: !!row.email_verified, value: row.email || null },
      phone: { bound: !!row.phone, verified: !!row.phone_verified, value: row.phone || null },
      google: { bound: linked.some(i => i.provider === 'google') },
      wechat: { bound: linked.some(i => i.provider === 'wechat') },
    },
  };
}

export async function getFriendIds(db: D1Database, userId: string): Promise<string[]> {
  // friend graph can be represented in multiple ways; best-effort: accepted friend_requests both directions
  const rows = await qAll<any>(db, `SELECT from_user_id, to_user_id FROM friend_requests WHERE status = 'accepted' AND (from_user_id = ? OR to_user_id = ?)`, userId, userId);
  const out = new Set<string>();
  for (const r of rows) out.add(r.from_user_id === userId ? r.to_user_id : r.from_user_id);
  return [...out];
}

export async function isBlockedEither(db: D1Database, a: string, b: string): Promise<boolean> {
  const r = await qFirst<{ n: number }>(db, `SELECT COUNT(*) as n FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`, a, b, b, a);
  return Number(r?.n || 0) > 0;
}

export async function getPrivacy(db: D1Database, userId: string) {
  const row = await qFirst<{ settings_json: string }>(db, 'SELECT settings_json FROM privacy_settings WHERE user_id = ?', userId);
  return normalizePrivacySettings(row ? parseJsonMaybe(row.settings_json, {}) : {});
}

export async function publicProfileView(db: D1Database, viewerId: string | null, targetRow: DbUserRow) {
  const targetId = targetRow.id;
  const isSelf = !!viewerId && viewerId === targetId;
  if (isSelf) return { user: selfUserView(targetRow, { hasPassword: await hasPassword(db, targetId) }), isSelf: true, isFriend: true, blocked: false, pendingRequest: null, restricted: false };
  const isFriend = viewerId ? (await getFriendIds(db, viewerId)).includes(targetId) : false;
  const blocked = viewerId ? await isBlockedEither(db, viewerId, targetId) : false;
  const priv = await getPrivacy(db, targetId);
  const canView = canViewProfileByPolicy(false, isFriend, blocked, priv);
  let pending: any = null;
  if (viewerId) {
    pending = await qFirst(db, `SELECT * FROM friend_requests WHERE status='pending' AND ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)) LIMIT 1`, viewerId, targetId, targetId, viewerId);
  }
  if (!canView) {
    return {
      user: {
        id: targetRow.id,
        username: targetRow.username,
        displayName: targetRow.display_name,
        avatar: targetRow.avatar,
        bio: '',
        isOnline: false,
        lastActiveAt: undefined,
        joinedAt: undefined,
        verified: !!targetRow.verified,
      },
      isSelf: false, isFriend, blocked, pendingRequest: pending, restricted: true,
    };
  }
  const loc = userLocation(targetRow);
  const safeLoc = {
    countryCode: loc.countryCode, countryName: loc.countryName, cityName: loc.cityName, isPublic: loc.isPublic,
    lat: loc.isPublic ? loc.lat : 0, lng: loc.isPublic ? loc.lng : 0,
  };
  return {
    user: {
      id: targetRow.id,
      earthId: targetRow.earth_id ?? parseJsonMaybe<any>(targetRow.extra_json, {})?.earthId ?? null,
      username: targetRow.username,
      displayName: targetRow.display_name,
      avatar: targetRow.avatar,
      banner: targetRow.banner,
      bio: targetRow.bio || '',
      location: safeLoc,
      interests: parseJsonMaybe<string[]>(targetRow.interests_json, []),
      followersCount: Number(targetRow.followers_count || 0),
      followingCount: Number(targetRow.following_count || 0),
      isOnline: priv.showOnlineStatus ? !!targetRow.is_online : false,
      lastActiveAt: priv.showLastActive ? (targetRow.last_active_at || undefined) : undefined,
      verified: !!targetRow.verified,
      joinedAt: targetRow.joined_at,
      createdAt: targetRow.joined_at,
      accountStatus: targetRow.account_status || parseJsonMaybe<any>(targetRow.extra_json, {})?.accountStatus || 'active',
    },
    isSelf: false, isFriend, blocked, pendingRequest: pending, restricted: false,
  };
}
