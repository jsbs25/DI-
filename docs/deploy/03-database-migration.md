# 03 — 数据库迁移与数据映射设计（Phase 2）

- **日期**：2026-11-12
- **来源**：`server/store.ts`（DataStore/persist/load）、`server_data.json` 结构、`server_data/books/*.json`、`server/discovery/database/db.ts` + `server_data/discovery.db*`、`server_data/uploads/**`
- **原则**：不清空、不重建身份、不改 ID/时间戳/关系；先映射与校验设计，**未执行迁移**。

## 1. 存储资产清单

| 资产 | 类型 | 内容 | 迁移目标候选 | 备注 |
|---|---|---|---|---|
| `server_data.json` | JSON 快照（整库） | 见字段级映射 | D1 / Turso / Postgres(Neon,Supabase) | 主业务事实源（当前） |
| `server_data/books/<bookId>.json` | JSON 分片 | `{ chapters: [{id,title,content}] }` | R2(对象) + D1 元数据 或 DB 大文本分表 | 已从主 JSON 剥离正文 |
| `server_data/uploads/**` | 文件系统 | 消息附件、头像、其他上传 | R2 私有桶 | 路径与元数据需保留映射 |
| `server_data/discovery.db` (+wal/shm) | SQLite (node:sqlite, WAL, FTS5) | resources/FTS/planet关联/crawl_sources/crawl_logs | D1(需FTS兼容PoC) 或 Turso 或 保留独立服务 | 搜索/采集子系统 |
| `.env` | 配置 | 密钥与开关 | 云端 Secret | **不入库** |

## 2. `server_data.json` 顶层字段级映射（逻辑→目标关系模型）

> 说明：当前为内存对象图序列化；目标建议“规范化表 + 必要 JSON 列”混合，保证可查询性与迁移可逆。类型为设计建议，落地前需以实际样本行校准。

| 源字段(JSON) | 含义 | 建议目标表/存储 | 主键/关键列 | 关联与约束 | 迁移注意 |
|---|---|---|---|---|---|
| `users[]` | 用户档案 | `users` | `id`(保留) | 关联 accounts/sessions/posts/messages/friends/privacy 等 | 保留 `id, username, displayName, earthId/标识字段, joinedAt, isOnline/lastActive*` 等全部业务字段；**不重生 ID** |
| `accounts`(map序列化) | 认证凭据索引 | `auth_accounts` + `auth_identities` | `account_key`/`user_id` | 指向 user；含 email/username/userId 多键 | **保留 passwordHash,salt,token(若存),linked identities**；兼容既有哈希算法与校验逻辑 |
| `sessions`(map token→userId) | 会话 | `sessions` | `token` 或 `session_id` | `user_id`, expires/createdAt(若有) | 迁移时可选择“全量导入”或“强制重登”（需产品确认）；**不得泄露 token**；云端建议签名/短期化但需兼容策略 |
| `posts[]` | 动态 | `posts` | `id` | `author_id`→users, 媒体引用 | 保留时间戳、计数、可见性字段 |
| `articles[]` | 创作者文章 | `articles` | `id` | `author_id` | 保留正文/元数据 |
| `videos[]` | 视频条目 | `videos` | `id` | `creator_id`/来源 | 外链与元数据 |
| `communities[]` | 社区 | `communities` + `community_members` | `id` | 成员关系 | 保留加入状态 |
| `conversations[]` | 会话容器 | `conversations` | `id` | 类型(direct/group)、participantIds、群元信息/管理员 | **保留 participant 顺序语义若业务依赖** |
| `messages[]` | 消息 | `messages` | `id` (+ `client_msg_id` 幂等) | `conversation_id`, `sender_id`, reply/recall/delete/read 状态、时间戳 | **消息 ID/时间戳/状态必须原样保留**；附件引用 uploads 对象键 |
| `gameRooms[]` | 游戏房间 | `game_rooms` | `id` | 参与者 | 视活跃度可后迁 |
| `ads[]` | 广告/赞助 | `ads` | `id` | - | 配置/内容数据 |
| `countries[]` | 地球统计 | `globe_countries` | `code/id` | - | 可重建但建议保留快照 |
| `books[]`(元数据，已 strip 正文) | 书籍元信息 | `books` | `id` | 章节索引元数据、来源/版权字段 | 正文在 `books/<id>.json`；需建立 `book_content_object_key` 映射 |
| `bookAnnotations[]` | 标注 | `book_annotations` | `id` | `book_id`,`user_id`, CFI/位置 | 保留用户数据 |
| `bookShelf[]` | 书架/收藏状态 | `bookshelf_items` | 复合或`id` | `user_id`,`book_id`, status | 保留状态枚举 |
| `crawlerTasks[]` | 爬虫任务 | `crawler_tasks` | `id` | - | 运维数据，可分批迁移 |
| `crawledPages[]` | 抓取页 | `crawled_pages` | `id/url` | 去重键 | 量大则分阶段 |
| `browserBookmarks[]` | 书签 | `browser_bookmarks` | `id` | `user_id`(如有) | 与桌面/云同步策略对齐 |
| `savedArticles[]` | 保存文章 | `saved_articles` | `id` | `user_id` |  |
| `friendRequests[]` | 好友申请 | `friend_requests` | `id` | from/to, status, timestamps | **保留状态机与时间** |
| `blockedBy`(map userId→[]) | 屏蔽关系 | `user_blocks` | `(blocker_id,blocked_id)` | 双向查询需求 |  |
| `securityAudit[]` | 安全审计 | `security_audit_events` | `id` | `user_id?`, ip, event, time | 可归档分区 |
| `loginFailures`(map) | 登录失败/锁定 | `login_failures` | `key` | count/lockedUntil | 可迁移或重置策略（需确认） |
| `notifications[]` | 通知 | `notifications` | `id` | `user_id`, type, read, time, payload |  |
| `notificationPrefs`(map) | 通知偏好 | `notification_preferences` | `user_id` | JSON/列 |  |
| `privacySettings`(map) | 隐私设置 | `privacy_settings` | `user_id` | JSON/列 |  |
| `calls[]` | 通话记录 | `calls` + `call_participants` | `id` | conversation/initiator/participants/status/timestamps/provider | **保留 callId/roomName/状态历史语义** |
| `nextEarthSequence` | Earth ID 序列 | `sequences` 或 `app_state` | key=`earth` | 单调递增 | **绝不回退/重用** |
| `earthIdMap` | 历史ID映射 | `earth_id_map` | `legacy_id` | `earth_id` | 兼容必需 |
| `currentUser` | 运行态指针 | （不迁移为事实） | - | - | 由 session 推导 |
| `lastSavedAt` | 元数据 | `migration_meta` | - | - | 校验用 |

## 3. 书籍正文与上传文件映射

| 源 | 键/路径规则 | 目标对象键建议 | 元数据保留 |
|---|---|---|---|
| `server_data/books/<id>.json` | bookId 文件名 | `books/content/<id>.json` (R2) | 与 `books` 表 `id` 1:1，记录 checksum/size |
| `server_data/uploads/<owner>/<file>` + meta | 现有目录/ID | `uploads/<owner>/<yyyy>/<fileId>` + `upload_meta` 表 | owner、conversationId、mime、size、原名、鉴权策略、创建时间 |
| `server_data/uploads/avatars/<userId>/<file>` | 头像 | `avatars/<userId>/<fileId>` | 当前头像指针、历史策略 |

## 4. Discovery SQLite（`discovery.db`）映射

| 源表 | 目标 | 说明 |
|---|---|---|
| `resources` | `discovery_resources` | 保留 canonical_url 唯一、planet/type/status/quality/时间戳/extra_meta |
| `resource_planets` | `discovery_resource_planets` | 多对多 |
| `resources_fts` (FTS5) | D1 FTS5 或外部搜索索引 | **需 PoC：D1 对 FTS5/分词/触发器支持**；不支持则改为 LIKE/应用层或 Turso/独立 SQLite 服务（违背全托管目标需权衡） |
| `crawl_sources` | `discovery_crawl_sources` |  |
| `crawl_logs` | `discovery_crawl_logs` |  |

## 5. 密码与身份兼容性
- **保留** `passwordHash`、`salt`、算法与迭代参数（以 store 实现为准）— 迁移后验证逻辑必须字节/语义兼容，**不重置密码**。
- **保留** 用户 `id`、`username`、`email`/手机号绑定、`linkedIdentities`、`earthId` 与 `earthIdMap`、`nextEarthSequence`。
- OAuth 绑定与 providerUserId 原样迁移；回调域名变更不改变已绑定身份。

## 6. 迁移流程设计（不执行，仅方案）

1. **冻结与备份**：停写窗口（或维护模式）→ 复制 `server_data.json`、`books/`、`uploads/`、`discovery.db*`、校验和清单（SHA256）→ 离线只读。
2. **Schema 准备**：目标库建表/索引/约束（外键可分阶段启用）→ 预置 `app_state/earth_sequence`。
3. **抽取与转换**：流式/分块解析 JSON → 规范化行 → 写入 staging 表；文件上传至 R2 并记录 key 映射。
4. **一致性校验**：
   - 计数：users/posts/messages/conversations/friends/requests/blocks/notifications/calls/books/annotations/shelf 等逐表对账。
   - 抽样：随机与边界用户（含多会话、多设备、群聊、撤回/删除消息）字段级比对。
   - 关系：外键可达性、会话成员与消息归属、好友/屏蔽对称性（按业务规则）。
   - 完整性：消息时间戳单调/原值、附件可解析到对象、Earth 序列 ≥ 源最大值。
5. **切换**：只读验证 → 应用配置指向新存储 → 灰度写入 → 监控错误与审计日志。
6. **回滚**：任一校验失败即中止；切换后异常则切回旧存储/旧配置并恢复备份（见 08）。

## 7. 回滚设计要点
- 旧数据 **只读保留** 至少一个稳定周期；R2 对象可版本化/保留副本（在免费额度内）。
- 迁移脚本必须幂等或具备“清空 staging 重跑”能力（**禁止触碰源数据**）。
- 提供 `down` 逻辑：从目标导出回 JSON/文件布局的可选工具（阶段 6 实现前完成设计与演练）。

## 8. 未决项（需阶段 3 前确认）
- 会话 token 迁移策略（导入 vs 失效重登）— 影响体验与安全。
- FTS5 目标兼容性（D1 vs Turso vs 保留 discovery 独立）— **UNVERIFIED**。
- 大体量 `messages`/`crawledPages` 分批与性能窗口。
