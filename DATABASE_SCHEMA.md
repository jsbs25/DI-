# EARTH ONE - UNIFIED DATABASE SCHEMA

As specified in Chapter 16 of the EARTH ONE specification, the platform maintains a unified user identity across all functional subsystems.

## 1. Table Definitions

### Identity & Privacy
1. `users`: `id`, `username`, `email`, `role`, `createdAt`, `status`
2. `user_profiles`: `userId`, `displayName`, `bio`, `avatarUrl`, `bannerUrl`, `interests`, `badge`, `website`
3. `user_locations`: `userId`, `countryCode`, `countryName`, `cityName`, `lat`, `lng`, `isPublic`
4. `user_privacy`: `userId`, `showOnlineStatus`, `allowDirectMessages`, `showExactCity`

### Social Core
5. `posts`: `id`, `userId`, `content`, `mediaUrls`, `mediaType`, `countryCode`, `cityName`, `category`, `likesCount`, `commentsCount`, `sharesCount`, `createdAt`
6. `post_media`: `id`, `postId`, `url`, `type`, `width`, `height`
7. `comments`: `id`, `postId`, `userId`, `content`, `parentId`, `createdAt`
8. `likes`: `id`, `userId`, `targetType` (post/article/video/comment), `targetId`, `createdAt`
9. `follows`: `id`, `followerId`, `followingId`, `createdAt`
10. `notifications`: `id`, `userId`, `actorId`, `type`, `targetId`, `message`, `isRead`, `createdAt`

### Instant Messaging & Realtime
11. `conversations`: `id`, `type` (direct/group/country_room), `name`, `countryCode`, `lastMessageId`, `updatedAt`
12. `conversation_members`: `conversationId`, `userId`, `unreadCount`, `preferredLanguage`
13. `messages`: `id`, `conversationId`, `senderId`, `content`, `translatedContent`, `originalLanguage`, `mediaUrl`, `createdAt`

### Content & Creator Economy
14. `articles`: `id`, `authorId`, `title`, `summary`, `content`, `coverUrl`, `tags`, `clapsCount`, `readTimeMinutes`, `createdAt`
15. `videos`: `id`, `creatorId`, `title`, `description`, `videoUrl`, `thumbnailUrl`, `duration`, `viewsCount`, `likesCount`, `createdAt`
16. `donations`: `id`, `donorId`, `recipientId`, `amount`, `currency`, `targetType`, `targetId`, `message`, `createdAt`
17. `transactions`: `id`, `userId`, `type` (tip_sent/tip_received/ad_payout), `amount`, `status`, `createdAt`

### Communities & Games
18. `communities`: `id`, `name`, `slug`, `description`, `iconUrl`, `bannerUrl`, `category`, `membersCount`, `creatorId`, `createdAt`
19. `community_members`: `communityId`, `userId`, `role` (admin/moderator/member), `joinedAt`
20. `games`: `id`, `slug` (chess/gomoku/trivia/wordle), `title`, `category`, `minPlayers`, `maxPlayers`
21. `game_rooms`: `id`, `gameSlug`, `hostId`, `guestId`, `status` (waiting/active/finished), `currentTurn`, `boardState`, `winnerId`, `createdAt`
22. `game_records`: `id`, `gameSlug`, `player1Id`, `player2Id`, `result`, `movesCount`, `createdAt`

### AI HUB & Commercialization
23. `ai_providers`: `id`, `name`, `endpoint`, `status`
24. `ai_models`: `id`, `providerId`, `modelIdentifier`, `displayName`, `capabilities`, `isFree`
25. `ai_usage_logs`: `id`, `userId`, `modelIdentifier`, `promptTokens`, `completionTokens`, `purpose`, `createdAt`
26. `advertisements`: `id`, `advertiserId`, `title`, `tagline`, `ctaUrl`, `imageUrl`, `category`, `impressions`, `clicks`, `budget`, `status`
27. `reports`: `id`, `reporterId`, `targetType`, `targetId`, `reason`, `status`, `createdAt`
28. `system_settings`: `key`, `value`, `updatedAt`
