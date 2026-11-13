import type { User } from '../src/types/index.ts';
import { normalizePrivacySettings, type PrivacySettings } from './privacyPolicy.ts';

export type PublicUser = Omit<User, 'email' | 'hasCompletedOnboarding' | 'phone' | 'linkedIdentities' | 'friendIds' | 'blockedUserIds' | 'emailVerified' | 'phoneVerified'> & {
  location?: any;
  isOnline?: boolean;
  lastActiveAt?: string;
  joinedAt?: string;
};

/**
 * Return only fields intended for public directory/search surfaces.
 * Enforces privacy defaults for unauthenticated/viewer-less contexts:
 * - location coords masked unless user marked location public
 * - presence/last-active masked unless user privacy allows
 * - never exposes account/contact/internal fields
 */
export function toPublicUser(user: User, opts?: { privacy?: Partial<PrivacySettings> | null }): PublicUser {
  const priv = normalizePrivacySettings(opts?.privacy || (user as any)?.__privacy || {});
  const loc = user.location ? {
    countryCode: user.location.countryCode,
    countryName: user.location.countryName,
    cityName: user.location.cityName,
    isPublic: !!user.location.isPublic,
    lat: user.location.isPublic ? user.location.lat : 0,
    lng: user.location.isPublic ? user.location.lng : 0,
  } : undefined;
  return {
    id: user.id,
    earthId: (user as any).earthId,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    banner: user.banner,
    bio: user.bio,
    location: loc as any,
    interests: [...(user.interests || [])],
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    tipsReceived: user.tipsReceived,
    isOnline: priv.showOnlineStatus ? !!(user as any).isOnline : false,
    lastActiveAt: priv.showLastActive ? (user as any).lastActiveAt : undefined,
    verified: user.verified,
    joinedAt: user.joinedAt,
    accountStatus: (user as any).accountStatus,
  } as PublicUser;
}
