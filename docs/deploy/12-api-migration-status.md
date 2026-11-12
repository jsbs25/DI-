# 12 — API 迁移状态表（172 HTTP 路由 + WS）

- 生成/基线时间：2026-11-12
- 来源：`server.ts` 静态路由扫描
- 状态定义：`NOT_STARTED` | `IN_PROGRESS` | `LOCAL_TESTED` | `D1_LOCAL_VERIFIED` | `CLOUDFLARE_TESTED` | `PROD_VERIFIED` | `BLOCKED`
- 规则：501≠完成；每条需真实业务逻辑+对应测试后才可升级状态。

| # | Method | Path | Module | Status | Test | Notes |
|---:|---|---|---|---|---|---|
| 1 | GET | `/api/integrations` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | wrangler dev local: 200 safe status |
| 2 | POST | `/api/auth/register` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: creates user+accounts+session, earthId allocated, persisted in local D1 |
| 3 | POST | `/api/auth/login` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: username/email/id login, legacy hash verify/upgrade path supported, wrong pw 401 |
| 4 | GET | `/api/account/me` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: Bearer session required, returns self profile |
| 5 | GET | `/api/auth/me` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: returns null without token, user with valid session |
| 6 | GET | `/api/auth/status` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: runtime status, dev login flags from env |
| 7 | POST | `/api/auth/dev-login` | auth/account | LOCAL_TESTED | PASS (local wrangler+D1) | local D1 logic implemented (demo user lookup/session/audit), disabled by env in local config; enable-path needs env-specific test |
| 8 | POST | `/api/auth/phone/send-code` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 9 | POST | `/api/auth/phone/verify` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 10 | GET | `/api/auth/wechat/start` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 11 | GET | `/api/auth/wechat/callback` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 12 | POST | `/api/auth/email/send-verification` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 13 | POST | `/api/auth/email/verify` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 14 | POST | `/api/auth/password/forgot` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 15 | POST | `/api/auth/password/reset` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 16 | GET | `/api/auth/security` | auth/account | LOCAL_TESTED | PASS (local wrangler+D1) | local D1: minimal security/binding view from DB; provider bind flows remain 501 |
| 17 | POST | `/api/auth/password/change` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 18 | POST | `/api/auth/bind/email/request` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 19 | POST | `/api/auth/bind/email/confirm` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 20 | POST | `/api/auth/bind/phone/request` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 21 | POST | `/api/auth/bind/phone/confirm` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 22 | POST | `/api/auth/unlink` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 23 | GET | `/api/auth/google/start` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 24 | GET | `/api/auth/google/callback` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 25 | GET | `/api/auth/current` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: alias behavior matches /api/auth/me |
| 26 | POST | `/api/auth/onboarding` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: updates profile fields and sets hasCompletedOnboarding |
| 27 | GET | `/api/dev/status` | auth/account | NOT_STARTED | NOT TESTED | Express source line 818 |
| 28 | POST | `/api/auth/logout` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: deletes session token, subsequent /me returns null |
| 29 | POST | `/api/auth/update-profile` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: profile field updates (partial coverage vs Express, needs parity expansion) |
| 30 | POST | `/api/auth/toggle-location` | auth/account | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: toggles location public flag |
| 31 | GET | `/api/users` | social/content | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: query search + privacy-aware filtering/best-effort list; needs deeper parity tests |
| 32 | GET | `/api/users/:id` | social/content | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: public/self profile view with privacy checks |
| 33 | POST | `/api/users/:id/follow` | social/content | LOCAL_TESTED | PASS (local wrangler+D1) | compat no-op success until social follow graph migrated |
| 34 | POST | `/api/messenger/upload` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1117 |
| 35 | POST | `/api/messenger/upload/stream` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1136 |
| 36 | GET | `/api/messenger/files/:id` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1197 |
| 37 | POST | `/api/conversations/:id/rename` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1226 |
| 38 | POST | `/api/conversations/:id/admins` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1237 |
| 39 | POST | `/api/auth/email/change/request` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 40 | POST | `/api/auth/email/change/confirm` | auth/account | BLOCKED | BLOCKED/NOT TESTED | Explicit 501 in worker: requires provider secrets/config/compat logic (no fake success) |
| 41 | GET | `/api/notifications` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1368 |
| 42 | GET | `/api/notifications/unread-count` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1377 |
| 43 | POST | `/api/notifications/:id/read` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1383 |
| 44 | POST | `/api/notifications/read-all` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1393 |
| 45 | DELETE | `/api/notifications/:id` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1402 |
| 46 | GET | `/api/notifications/preferences` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1412 |
| 47 | PUT | `/api/notifications/preferences` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1418 |
| 48 | GET | `/api/messenger/privacy` | messenger/notifications | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: reads normalized privacy settings |
| 49 | PUT | `/api/messenger/privacy` | messenger/notifications | D1_LOCAL_VERIFIED | PASS (local wrangler+D1) | local D1: updates normalized privacy settings |
| 50 | GET | `/api/messenger/users/search` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1444 |
| 51 | GET | `/api/messenger/friends` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1456 |
| 52 | GET | `/api/messenger/friend-requests` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1470 |
| 53 | POST | `/api/messenger/friend-requests` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1492 |
| 54 | POST | `/api/messenger/friend-requests/:id/respond` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1530 |
| 55 | DELETE | `/api/messenger/friends/:id` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1555 |
| 56 | POST | `/api/messenger/block` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1563 |
| 57 | POST | `/api/messenger/unblock` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1573 |
| 58 | GET | `/api/messenger/blocked` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1582 |
| 59 | GET | `/api/messenger/recent` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1590 |
| 60 | GET | `/api/messenger/sync` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1597 |
| 61 | GET | `/api/messenger/profile/me` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1631 |
| 62 | GET | `/api/messenger/username/check` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1639 |
| 63 | GET | `/api/messenger/profile/:id` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1650 |
| 64 | POST | `/api/messenger/profile/update` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1685 |
| 65 | POST | `/api/messenger/profile/avatar` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1711 |
| 66 | DELETE | `/api/messenger/profile/avatar` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1761 |
| 67 | GET | `/api/messenger/avatar/:userId/:file` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 1779 |
| 68 | GET | `/api/calls` | calls | NOT_STARTED | NOT TESTED | Express source line 1803 |
| 69 | GET | `/api/calls/:id` | calls | NOT_STARTED | NOT TESTED | Express source line 1810 |
| 70 | POST | `/api/calls/invite` | calls | NOT_STARTED | NOT TESTED | Express source line 1817 |
| 71 | POST | `/api/calls/:id/accept` | calls | NOT_STARTED | NOT TESTED | Express source line 1851 |
| 72 | POST | `/api/calls/:id/reject` | calls | NOT_STARTED | NOT TESTED | Express source line 1872 |
| 73 | POST | `/api/calls/:id/cancel` | calls | NOT_STARTED | NOT TESTED | Express source line 1892 |
| 74 | POST | `/api/calls/:id/end` | calls | NOT_STARTED | NOT TESTED | Express source line 1912 |
| 75 | POST | `/api/calls/:id/leave` | calls | NOT_STARTED | NOT TESTED | Express source line 1933 |
| 76 | POST | `/api/calls/:id/token` | calls | NOT_STARTED | NOT TESTED | Express source line 1953 |
| 77 | POST | `/api/calls/:id/state` | calls | NOT_STARTED | NOT TESTED | Express source line 1962 |
| 78 | GET | `/api/globe/nodes` | social/content | NOT_STARTED | NOT TESTED | Express source line 1999 |
| 79 | GET | `/api/globe/stats` | social/content | NOT_STARTED | NOT TESTED | Express source line 2004 |
| 80 | GET | `/api/globe/countries` | social/content | NOT_STARTED | NOT TESTED | Express source line 2020 |
| 81 | GET | `/api/telemetry/iss` | social/content | NOT_STARTED | NOT TESTED | Express source line 2025 |
| 82 | GET | `/api/telemetry/earthquakes` | social/content | NOT_STARTED | NOT TESTED | Express source line 2074 |
| 83 | GET | `/api/posts` | social/content | NOT_STARTED | NOT TESTED | Express source line 2114 |
| 84 | POST | `/api/posts` | social/content | NOT_STARTED | NOT TESTED | Express source line 2147 |
| 85 | POST | `/api/posts/:id/like` | social/content | NOT_STARTED | NOT TESTED | Express source line 2157 |
| 86 | POST | `/api/posts/:id/comment` | social/content | NOT_STARTED | NOT TESTED | Express source line 2163 |
| 87 | GET | `/api/conversations` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2175 |
| 88 | POST | `/api/conversations/direct` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2182 |
| 89 | POST | `/api/conversations/group` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2202 |
| 90 | POST | `/api/conversations/:id/members` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2228 |
| 91 | POST | `/api/conversations/:id/transfer-owner` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2271 |
| 92 | POST | `/api/conversations/:id/leave` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2298 |
| 93 | GET | `/api/conversations/:id` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2324 |
| 94 | GET | `/api/conversations/:id/messages` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2347 |
| 95 | POST | `/api/conversations/:id/messages` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2386 |
| 96 | POST | `/api/conversations/:id/read` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2448 |
| 97 | POST | `/api/conversations/:id/messages/:messageId/recall` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2465 |
| 98 | POST | `/api/conversations/:id/messages/:messageId/delete` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2479 |
| 99 | POST | `/api/conversations/:id/clear` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2492 |
| 100 | GET | `/api/conversations/:id/search` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2508 |
| 101 | GET | `/api/messenger/messages/search` | messenger/notifications | NOT_STARTED | NOT TESTED | Express source line 2526 |
| 102 | GET | `/api/articles` | social/content | NOT_STARTED | NOT TESTED | Express source line 2554 |
| 103 | POST | `/api/articles` | social/content | NOT_STARTED | NOT TESTED | Express source line 2558 |
| 104 | POST | `/api/articles/:id/tip` | social/content | NOT_STARTED | NOT TESTED | Express source line 2587 |
| 105 | GET | `/api/videos` | social/content | NOT_STARTED | NOT TESTED | Express source line 2595 |
| 106 | GET | `/api/communities` | social/content | NOT_STARTED | NOT TESTED | Express source line 2602 |
| 107 | POST | `/api/communities/:id/join` | social/content | NOT_STARTED | NOT TESTED | Express source line 2606 |
| 108 | GET | `/api/games/rooms` | social/content | NOT_STARTED | NOT TESTED | Express source line 2614 |
| 109 | GET | `/api/ai/models` | ai | NOT_STARTED | NOT TESTED | Express source line 2621 |
| 110 | GET | `/api/ai/ollama/roles` | ai | NOT_STARTED | NOT TESTED | Express source line 2626 |
| 111 | POST | `/api/ai/ollama/roles` | ai | NOT_STARTED | NOT TESTED | Express source line 2630 |
| 112 | GET | `/api/ai/stats` | ai | NOT_STARTED | NOT TESTED | Express source line 2636 |
| 113 | POST | `/api/ai/chat` | ai | NOT_STARTED | NOT TESTED | Express source line 2643 |
| 114 | POST | `/api/ai/translate` | ai | NOT_STARTED | NOT TESTED | Express source line 2721 |
| 115 | GET | `/api/music/tracks` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 2738 |
| 116 | GET | `/api/music/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 2808 |
| 117 | GET | `/api/music/youtube-search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 2842 |
| 118 | GET | `/api/bilibili/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 2856 |
| 119 | POST | `/api/music/crawl` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 2868 |
| 120 | GET | `/api/library/connectors` | library | NOT_STARTED | NOT TESTED | Express source line 2883 |
| 121 | GET | `/api/library/search` | library | NOT_STARTED | NOT TESTED | Express source line 2889 |
| 122 | POST | `/api/library/ingest` | library | NOT_STARTED | NOT TESTED | Express source line 2917 |
| 123 | GET | `/api/library/epub-proxy` | library | NOT_STARTED | NOT TESTED | Express source line 3028 |
| 124 | PUT | `/api/library/books/:id` | library | NOT_STARTED | NOT TESTED | Express source line 3070 |
| 125 | DELETE | `/api/library/books/:id` | library | NOT_STARTED | NOT TESTED | Express source line 3091 |
| 126 | GET | `/api/library/shelf` | library | NOT_STARTED | NOT TESTED | Express source line 3101 |
| 127 | POST | `/api/library/shelf` | library | NOT_STARTED | NOT TESTED | Express source line 3114 |
| 128 | DELETE | `/api/library/shelf/:bookId` | library | NOT_STARTED | NOT TESTED | Express source line 3123 |
| 129 | POST | `/api/library/shelf/:bookId/progress` | library | NOT_STARTED | NOT TESTED | Express source line 3130 |
| 130 | POST | `/api/library/shelf/:bookId/reading-state` | library | NOT_STARTED | NOT TESTED | Express source line 3138 |
| 131 | POST | `/api/library/shelf/:bookId/epub-reading-state` | library | NOT_STARTED | NOT TESTED | Express source line 3156 |
| 132 | GET | `/api/library/books` | library | NOT_STARTED | NOT TESTED | Express source line 3176 |
| 133 | GET | `/api/library/books/:id` | library | NOT_STARTED | NOT TESTED | Express source line 3190 |
| 134 | POST | `/api/library/books/:id/ai-reading` | library | NOT_STARTED | NOT TESTED | Express source line 3199 |
| 135 | POST | `/api/library/books/:id/knowledge-notes` | library | NOT_STARTED | NOT TESTED | Express source line 3231 |
| 136 | POST | `/api/library/books/:id/progress` | library | NOT_STARTED | NOT TESTED | Express source line 3257 |
| 137 | POST | `/api/library/books/:id/annotations` | library | NOT_STARTED | NOT TESTED | Express source line 3264 |
| 138 | GET | `/api/crawler/tasks` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3276 |
| 139 | POST | `/api/crawler/tasks` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3280 |
| 140 | POST | `/api/crawler/tasks/:id/run` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3289 |
| 141 | POST | `/api/crawler/ai-extract` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3310 |
| 142 | GET | `/api/crawler/pages` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3321 |
| 143 | POST | `/api/crawler/pages/:id/approve` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3325 |
| 144 | GET | `/api/browser/bookmarks` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3334 |
| 145 | POST | `/api/browser/bookmarks` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3338 |
| 146 | GET | `/api/browser/saved-articles` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3345 |
| 147 | POST | `/api/browser/save-article` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3349 |
| 148 | DELETE | `/api/browser/saved-articles/:id` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3355 |
| 149 | POST | `/api/browser/fetch-preview` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3360 |
| 150 | GET | `/api/browser/proxy` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3373 |
| 151 | GET | `/api/browser/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3472 |
| 152 | GET | `/api/library/crawl` | library | NOT_STARTED | NOT TESTED | Express source line 3488 |
| 153 | GET | `/api/images/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3503 |
| 154 | GET | `/api/discovery/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3520 |
| 155 | GET | `/api/discovery/stats` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3551 |
| 156 | GET | `/api/discovery/resources` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3562 |
| 157 | POST | `/api/discovery/resources/add` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3585 |
| 158 | POST | `/api/discovery/crawl-url` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3608 |
| 159 | GET | `/api/discovery/sources` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3621 |
| 160 | POST | `/api/discovery/tasks/run-health` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3630 |
| 161 | POST | `/api/discovery/tasks/run-rss` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3639 |
| 162 | GET | `/api/jupiter/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3648 |
| 163 | GET | `/api/jupiter/content/:kind/:id` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3760 |
| 164 | GET | `/api/ads` | social/content | NOT_STARTED | NOT TESTED | Express source line 3773 |
| 165 | POST | `/api/ads/:id/click` | social/content | NOT_STARTED | NOT TESTED | Express source line 3777 |
| 166 | GET | `/api/knowledge/search` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3786 |
| 167 | GET | `/api/knowledge/nodes` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3795 |
| 168 | GET | `/api/knowledge/nodes/:id` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3807 |
| 169 | GET | `/api/learning/arabic/islamic-libraries` | other | NOT_STARTED | NOT TESTED | Express source line 3822 |
| 170 | GET | `/api/learning/arabic/islamic-libraries/featured` | other | NOT_STARTED | NOT TESTED | Express source line 3836 |
| 171 | POST | `/api/learning/arabic/islamic-libraries/crawl` | other | NOT_STARTED | NOT TESTED | Express source line 3841 |
| 172 | GET | `/api/search/global` | search/discovery/media | NOT_STARTED | NOT TESTED | Express source line 3860 |

## WebSocket
| Endpoint | Module | Status | Test | Notes |
|---|---|---|---|---|
| `/ws` | messenger/realtime | NOT_STARTED | NOT TESTED | DO scaffold exists; protocol/auth/ordering/multi-device/offline sync not implemented |
