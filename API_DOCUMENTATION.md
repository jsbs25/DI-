# EARTH ONE - REST & REAL-TIME API DOCUMENTATION

Base Path: `/api`

## 1. Authentication & Profile
- `GET /api/auth/current`: Returns active user profile with location and verification status.
- `POST /api/auth/update-profile`: Update display name, bio, city, or interests.
- `POST /api/auth/toggle-location`: Toggle whether user's coordinates are mapped on the 3D globe.
- `GET /api/users`: Search global users by query or country code.
- `GET /api/users/:id`: Get full citizen profile and their authored posts.
- `POST /api/users/:id/follow`: Follow or increment citizen follower count.

## 2. 3D Digital Globe Spatial Service
- `GET /api/globe/nodes`: Returns array of 3D user nodes currently mapped (filtered by privacy setting).
- `GET /api/globe/stats`: Returns worldwide online metrics, node counts, and country clusters.
- `GET /api/globe/countries`: Returns country coordinates and stats.

## 3. Global Social Network
- `GET /api/posts`: List posts with query parameters:
  - `feed`: `global` | `trending` | `latest` | `following`
  - `country`: ISO country code (e.g. `CN`, `US`, `JO`, `SA`, `FR`, `RU`)
  - `category`: `life` | `culture` | `tech` | `travel` | `thought`
- `POST /api/posts`: Publish post (`content`, `mediaUrl`, `category`).
- `POST /api/posts/:id/like`: Toggle like reaction.
- `POST /api/posts/:id/comment`: Submit comment (`content`).

## 4. Instant Messaging & AI Real-Time Translation
- `GET /api/conversations`: Returns conversation list with unread counts.
- `GET /api/conversations/:id/messages`: List chronological messages.
- `POST /api/conversations/:id/messages`: Send message with auto AI translation:
  - Payload: `{ content, targetLanguage, autoTranslate: boolean }`
  - Response includes translated content and original text.

## 5. Creator Hub & Video Platform
- `GET /api/articles`: List long-form creator essays and stories.
- `POST /api/articles`: Author and publish new article.
- `POST /api/articles/:id/tip`: Send voluntary creator tip.
- `GET /api/videos`: List global short and long-form video stories.

## 6. Intellectual Game Center & Communities
- `GET /api/games/rooms`: List active chess and gomoku rooms.
- `GET /api/communities`: List global interest collectives.
- `POST /api/communities/:id/join`: Toggle membership in a community.

## 7. EARTH ONE AI HUB Gateway
- `POST /api/ai/chat`: Query Gemini 2.5 with prompt, mode (`general`, `translator`, `writer`, `tutor`), and model (`gemini-2.5-flash`, `gemini-2.5-pro`).
- `POST /api/ai/translate`: Direct translation of arbitrary text to target language.

## 8. High-End Sponsor Network
- `GET /api/ads`: Returns active luxury sponsor campaigns.
- `POST /api/ads/:id/click`: Logs CTR analytics.
