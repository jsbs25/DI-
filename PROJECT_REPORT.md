# EARTH ONE 全球资源发现与智能搜索引擎技术实施报告

## 1. 当前 EARTH ONE 代码架构能否支持这套系统？
可以支持。当前项目基于 React + TypeScript 前端、Vite 构建，以及基于 Node.js/Express 的后端（`server.ts`）。
当前项目中存在 `data/` 和 `server_data/` 等本地存储数据的部分，后端具备基础的 REST API 能力，并且已经在使用诸如 SQLite 或文件系统的方式进行数据持久化。
我们需要在现有后端中增设一个独立的 `src/discovery` 模块作为"全球资源发现引擎"（Discovery Engine），它独立于具体的星球页面，作为一个底层的数据聚合、清洗和提供层。

## 2. 现有搜索功能能否复用？
目前的搜索主要分布在特定的星球组件中（如木星 JUPITER, 土星 SATURN 影视，水星 MERCURY 搜索），大部分依赖于静态数据或特定的第三方API。这套 UI 和交互（如 JUPITER 的搜索框、AI 对话界面）可以**完全保留并复用**，但底层的**数据请求流需要重构**，从直接请求外部 API 改为请求统一的 Discovery Engine。

## 3. 现有 Electron 浏览器如何与搜索系统整合？
项目中存在 `EMBEDDED_BROWSER_ENGINE.md` 和对应的浏览器封装组件。整合方式是：Discovery Engine 返回的搜索结果中包含真实的 `url` 字段，前端点击资源时，优先利用原生的 Electron IPC 机制通过内置浏览器标签页（WebView 或 BrowserView）打开，而不是在当前的 React 路由内用简单的 iframe（遇到 X-Frame-Options 限制时会失效）。

## 4. Ollama 和 Qwen3:8B 应该如何接入？
项目中已有的 `src/components/ai/HolographicAICompanion.tsx` (AI 助手) 和 `AI_HUB_ARCHITECTURE.md` 展示了通过流式 API (`readAIStream`) 调用后端的结构。我们可以在 Discovery Engine 中新增一个 `classifiers` 或 `search/ai_agent.ts` 模块，通过 HTTP/REST 方式与本地的 Ollama API（默认 `http://localhost:11434/api/generate` 或 `/api/chat`）通信。用户提交自然语言查询时，后端先请求 Ollama (Qwen3:8B) 解析意图并生成结构化的查询条件，再利用这些条件去查询数据库。

## 5. 数据库应该如何设计？
当前以 SQLite 为主，是非常合适的选择。需要新建一个统一资源表 `resources`：
- `id`: UUID
- `name`, `url`, `domain`, `description`, `resource_type`, `planet`
- `category`, `tags` (JSON), `language`, `country`, `icon`
- `source` (如 RSS, OpenLibrary, UserSubmit), `copyright_status`, `access_type`
- `created_at`, `updated_at`, `last_checked_at`, `status`, `quality_score`
使用 SQLite 的 **FTS5** (Full-Text Search) 扩展来支持基础全文搜索。

## 6. 如何从外部网站持续收集资源？
通过 `scheduler` (定时任务，如 Node.js 中的 `node-cron`) 定期触发 `collectors`。
- **RSS**: 解析 XML（如 `rss-parser` 库）。
- **Open API**: 定时抓取并存入 DB。
- **网页提取**: 使用 `axios` + `cheerio` (类似 BeautifulSoup) 进行轻量级的 HTML 解析，提取 Title, Meta Description, OG:Image。

## 7. 如何做到不依赖昂贵的商业 API？
- 图书：Open Library, Project Gutenberg API (免费公开)。
- 影视：TMDB 免费 API（需合规使用并附带鸣谢）。
- 新闻/文章：RSS 订阅（完全免费），聚合公共站点的 RSS。
- 搜索：在本地 DB 查不到时，可备用配置如 SearXNG 等开源元搜索引擎获取第一手网址，然后入库。

## 8. 如何将统一资源库分配给十个星球？
在 `resources` 表中，每个资源拥有明确的 `planet`（所属星球）字段或多对多关联（如通过 `tags` 或 `category` 映射）。
当 JUPITER 发起请求，API 为 `/api/discovery/search?planet=jupiter`；
当 SATURN 发起请求，API 为 `/api/discovery/search?planet=saturn&resource_type=movie`。
数据库引擎统一处理，各星球只需要关心展示。

## 9. 如何避免重复采集和无效数据？
- **去重 (deduplication)**：建立 URL 归一化（去除 hash, utm 参数），将归一化后的 URL 作为 UNIQUE 约束或利用哈希对比。
- **无效数据**：通过 `scheduler` 定期发送 HEAD 请求检测 `url` 的 HTTP 状态码，若为 404/5xx 超过一定次数，更新 `status = 'invalid'`。

## 10. 哪些功能可以完全本地运行？
- UI 渲染，所有 React 交互。
- 基础的数据库全文搜索 (SQLite FTS5)。
- AI 意图理解和结果归纳 (依托本地 Ollama + Qwen3:8B)。
- RSS/API 的采集后台任务及本地解析。

## 11. 哪些功能需要联网？
- `collectors` 从目标源拉取 RSS、API 数据或 HTML 页面。
- 用户在 Electron 浏览器中实际访问被检索到的资源网页。
- 第三方封面图、Icon 等静态媒体的加载（或者采集时转存本地代理）。

## 12. 哪些功能可能产生费用？
- 如果未来本地网络带宽不足，或者由于 IP 限制被迫需要代理池 (Proxies) 去抓取 HTML 时。
- 只有明确购买某些商业 API 密钥时。但按上述设计，优先使用公开免费数据，故开发阶段无直接开销。

## 13. 哪些功能存在版权、访问权限或服务条款限制？
- 大多数直接抓取网页正文的操作存在服务条款 (ToS) 风险。只提取 metadata (og:title, og:image, description) 并附带原始链接跳转，符合通用搜索引擎规范。
- 对于电子书（NEPTUNE），不能提供侵权的 PDF 直接下载，应当引导至公共领域（如 Project Gutenberg）或提供图书的购买/借阅原链接。
- 对于影视（SATURN），不提供非法解析接口，仅展示预告片（YouTube embed 等）和合法来源指引（如 Netflix, Amazon 页面）。

## 14. 第一阶段最少需要修改哪些文件？
此阶段为架构设计阶段，代码层面**不需要**大幅修改现有功能。我们主要需要：
- 创建 `src/discovery/` 目录树（已创建）。
- 创建统一资源库的建表脚本（基于 SQLite，在 `server.ts` 旁配置 DB 模块）。
- 梳理目前的 `/api/` 路由结构，并为 Discovery Engine 预留接口。
