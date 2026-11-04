# EARTH ONE — 功能清单（FEATURE INVENTORY）

> 如实记录当前已实现 / 部分实现 / 未实现的功能。更新于 2026-11-04。

## 已实现（真实可用）

| 模块 | 功能 | 前端 | 后端/数据 |
|---|---|---|---|
| EARTH HOME | 写实 3D 夜景地球（NASA 蓝理石/黑理石纹理、大气 Fresnel、三维轨道、数据飞线、OrbitControls 禁缩放） | `DigitalGlobe` | `/api/globe/*` |
| UNIVERSE | 太阳系/土星环/行星遥测 | `UniverseEngine` | — |
| AI INTELLIGENCE | 多模型对话（Gemini/DeepSeek/自定义 OpenAI 兼容）、翻译、模型状态 | `AIHub` | `/api/ai/*`、`aiGateway` |
| WORLD LIBRARY | 首页/分类/搜索/详情/书架/阅读器（诵读+AI 解读+三模式）/PDF·EPUB/后台管理 | `DigitalLibrary` 等 | `/api/library/*` |
| 图书馆书源 | Gutenberg + 中文/阿拉伯语维基文库 + Internet Archive | — | `webFetcher` |
| KNOWLEDGE UNIVERSE | 知识图谱（文明/人物/地点/语言/概念/思想/艺术）+ 全局搜索 | `KnowledgeUniverse` | `/api/knowledge/*`、`/api/search/global` |
| EARTH COMMUNITY | 动态/点赞/评论/发布/社区 | `GlobalFeed`、`CommunityList` | `/api/posts*`、`/api/communities*` |
| MESSAGES | 多频道消息 + AI 翻译 | `GlobalMessenger` | `/api/conversations*` |
| EARTH BROWSER | 搜索/网页预览/翻译/书签/保存文章 | `WebBrowser` | `/api/browser/*` |
| WEB CRAWLER | 采集任务/正文提取/审核入库 | `CrawlerDashboard` | `/api/crawler/*` |
| CREATOR | 文章/视频展示 | `CreatorHub`、`VideoCenter` | `/api/articles*`、`/api/videos` |
| 身份认证 | 注册/登录/新手引导/资料编辑 | `AuthModal` 等 | `/api/auth/*` |

## 数据层（2026-11-04 重构）

- 主存储：`server_data.json`（元数据，约 225KB）。
- 书籍全文：`server_data/books/{bookId}.json`（每本书独立文件）。
- 列表/书架接口只返回元数据；详情接口返回完整章节。
- 迁移为兼容式：旧数据自动抽离，不丢内容。

## 部分实现（能力边界）

- 视频中心：结构化展示，无真实流媒体转码/HLS。
- 聊天：轮询实现，非 WebSocket 实时。
- 地图：3D 地球 + 国家筛选，无独立 2D 地图/图层/卫星影像。
- 个人知识库：仅浏览器「保存文章」，未做统一双向链接知识库。

## 未实现

- EARTH ACADEMY、WORLD NEWS、DEVELOPER CENTER、PERSONAL SPACE（独立模块）。
- HUMAN STORIES、EARTH ONE LIVE、LAB、HUMANITY ARCHIVE。
- PostgreSQL + PostGIS 迁移（仍为文件持久化）。
- 密码哈希升级（仍 SHA-256 + 盐）。
