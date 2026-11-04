import type { User } from '../src/types/index.ts';

export type PublicUser = Omit<User, 'email' | 'hasCompletedOnboarding'>;

/**
 * Return only fields intended for public profiles and search results.
 * A private location retains its city/country label and consent flag, but never
 * returns the stored latitude or longitude. The source object is not mutated.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    banner: user.banner,
    bio: user.bio,
    location: {
      countryCode: user.location.countryCode,
      countryName: user.location.countryName,
      cityName: user.location.cityName,
      isPublic: user.location.isPublic,
      lat: user.location.isPublic ? user.location.lat : 0,
      lng: user.location.isPublic ? user.location.lng : 0
    },
    interests: [...user.interests],
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    tipsReceived: user.tipsReceived,
    isOnline: user.isOnline,
    verified: user.verified,
    joinedAt: user.joinedAt
  };
}
