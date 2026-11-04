# EARTH ONE — 项目审计报告（实测 / 2026-11-04）

> 本报告基于对真实代码、真实数据与运行环境的逐项检查，取代此前过度乐观的 `PROJECT_AUDIT.md`。
> 原则：**如实记录已实现、部分实现与未实现，不虚报。**

---

## 1. 技术栈（真实）

| 层 | 技术 | 证据 |
|---|---|---|
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 | `package.json` |
| 3D | Three.js 0.187（`DigitalGlobe` / `UniverseEngine`） | `src/components/globe/`、`src/universe/` |
| 后端 | Express 4.21 + `tsx` 直跑 `server.ts` | `server.ts`、`package.json` |
| 持久化 | 文件级原子 JSON（`server_data.json`） | `server/store.ts`（`saveToDisk`/`loadFromDisk`） |
| AI | `@google/genai` + 手写 DeepSeek/OpenAI 兼容网关 | `server/aiGateway.ts` |
| 国际化 | 6 语言字典（含阿拉伯语 RTL） | `src/i18n/translations.ts` |

**关键事实**：目前是**单页状态切换（`currentTab`）**，无 React Router。数据库为**单 JSON 文件**，非 PostgreSQL（ROADMAP 中标注为“未来迁移”，尚未实施）。

---

## 2. 前端页面 / 模块清单（真实）

`App.tsx` 通过 `currentTab` 切换以下视图：

| Tab | 组件 | 状态 |
|---|---|---|
| `globe` | `DigitalGlobe`（NASA 级夜景地球 + 轨道 + 飞线 + OrbitControls） | ✅ 已实现 |
| `universe` | `UniverseEngine`（太阳系/土星环/行星遥测） | ✅ 已实现 |
| `feed` | `GlobalFeed`（动态/点赞/评论/发布） | ✅ 已实现 |
| `chat` | `GlobalMessenger`（多频道消息 + AI 翻译） | ✅ 已实现（轮询，非 WebSocket） |
| `aihub` | `AIHub`（多模型对话 + 自定义 Key） | ✅ 已实现 |
| `library` | `DigitalLibrary` + `EpubReader` + `AdminLibrary` | ✅ 已实现 |
| `knowledge` | `KnowledgeUniverse`（知识图谱） | ✅ 本次新增 |
| `browser` | `WebBrowser` | ✅ 已实现 |
| `crawler` | `CrawlerDashboard` | ✅ 已实现 |
| `creator` | `CreatorHub` | ✅ 已实现 |
| `video` | `VideoCenter` | ⚠️ 结构化展示，无真实流媒体转码 |
| `game` | `GameCenter` | ✅ 已实现（五子棋 AI / 知识竞答） |
| `community` | `CommunityList` | ✅ 已实现 |

---

## 3. 后端 API 清单（真实）

- 认证：`/api/auth/register|login|me|current|onboarding|logout|update-profile|toggle-location`
- 用户：`/api/users`、`/api/users/:id`、`/api/users/:id/follow`
- 地球：`/api/globe/nodes|stats|countries`
- 社区：`/api/posts*`、`/api/articles*`、`/api/videos`、`/api/communities*`、`/api/conversations*`、`/api/games/rooms`
- AI：`/api/ai/models|stats|chat|translate`
- 图书馆：`/api/library/search|ingest|books*|shelf*|annotations|epub-proxy`
- 爬虫：`/api/crawler/tasks*|pages*`
- 浏览器：`/api/browser/bookmarks*|saved-articles*|fetch-preview|search`
- 广告：`/api/ads*`
- **知识宇宙（本次新增）**：`/api/knowledge/search|nodes|nodes/:id`
- **全局搜索（本次新增）**：`/api/search/global`

---

## 4. 数据与持久化

- `DataStore` 类（`server/store.ts`）：内存 + `server_data.json` 原子落盘。
- `server_data.json` 已被 `.gitignore` 忽略，未提交仓库。
- 用户密码：SHA-256 + 16 字节随机盐（非 bcrypt/argon2，见“安全风险”）。
- 当前 `server_data.json` 含 10 本正式书目（6 本 Open Library 元数据采集 + 4 本种子书）。

---

## 5. AI 网关（真实）

`server/aiGateway.ts` 支持：
- **Google Gemini**（`@google/genai`，需 `GEMINI_API_KEY`）——**当前未配置**。
- **DeepSeek**（OpenAI 兼容 `/chat/completions`，需 `DEEPSEEK_API_KEY`）——**当前已配置**（`.env` 中存在）。
- **自定义 OpenAI 兼容**（运行时输入 Key/BaseURL/Model）。
- 提供 `callOpenAICompatible` 通用方法，可接 OpenAI/DeepSeek/Moonshot/GLM/Qwen 等。

**安全说明**：`.env` 已 gitignore；`aiGateway` 用 `maskKey` 遮罩密钥，永不回传完整 Key。

---

## 6. 已实现且实测通过（本次）

1. **书籍全文分章修复**：`fetchBookFullText` 按 `CHAPTER/Chapter/BOOK` 标记真实分章，实测《傲慢与偏见》拆为 **61 章**。
2. **知识宇宙（Knowledge Universe）**：
   - 后端 `server/knowledgeGraph.ts`：29 个真实知识节点（文明/历史时期/人物/地点/语言/科学概念/思想/艺术作品），含真实关联边。
   - 前端 `KnowledgeUniverse.tsx`：搜索 + 分类 + 节点卡片 + 详情（相关连接 / 相关书籍）。
   - 跨模块：知识节点 → 相关书籍 → 一键跳转图书馆打开该书。
3. **全局统一搜索（Global Search）**：
   - 后端 `/api/search/global` 跨用户/动态/书籍/社区/知识图谱检索。
   - 前端 Navbar 搜索框 + 分组下拉结果，点击可跳转对应模块并打开具体书目/知识节点。

---

## 7. 未实现 / 部分实现（诚实清单）

| 项 | 状态 |
|---|---|
| PostgreSQL + PostGIS 迁移 | ❌ 未实施（仍为 JSON 文件） |
| WebSocket 实时通信 | ❌ 未实施（聊天为轮询） |
| 视频流媒体转码 / HLS | ❌ 未实施（`VideoCenter` 为展示层） |
| 国家/城市详情页（点击地球进入国家数字空间） | ⚠️ 仅跳转 feed 按国家筛选，无独立国家/城市空间 |
| HUMAN STORIES | ❌ 未做 |
| 个人知识库（My Knowledge Base） | ⚠️ 仅浏览器“保存文章”，无统一知识库 |
| EARTH ONE LIVE / LAB / HUMANITY ARCHIVE | ❌ 未做（PHASE 4/5） |
| 广告主自助充值/竞价后台 | ❌ 未做 |
| 密码哈希升级为 bcrypt/argon2 | ❌ 仍为 SHA-256+盐 |

---

## 8. 安全风险（需后续治理）

1. 密码为 SHA-256 + 盐，建议迁移 bcrypt/argon2id。
2. 会话 Token 为内存 Map + JSON 落盘，未设过期时间。
3. 无速率限制（登录/注册可被暴力尝试）。
4. 无 CSRF 防护（依赖 Bearer Token，但无同源严格校验）。

---

## 9. 运行与构建验证

- `npx tsc --noEmit`：✅ 通过（0 错误）
- `npm run build`（`vite build`）：✅ 成功（1788 模块）
- 服务启动：✅ `http://localhost:3000`
- API 实测：知识搜索 / 节点详情 / 全局搜索均返回真实数据 ✅
