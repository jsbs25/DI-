# EARTH ONE — 项目全面工程技术审计报告
## (PROJECT AUDIT & COMPREHENSIVE ARCHITECTURAL ASSESSMENT)

**审计日期**: 2026-11-03  
**执行角色**: 首席技术架构师（CTO）/ 全栈研发团队  
**审计标准**: 杜绝表面开发，杜绝静态页面冒充系统，以真实代码、真实数据与实际运行为唯一依据。

---

## 第一部分：十五项关键工程问题实测回答 (The 15 Core Engineering Questions)

### 1. 目前项目使用什么技术？
- **前端核心**: React 19 (`react: ^19.0.1`, `react-dom: ^19.0.1`), TypeScript 7.0.2, Vite 8.3.0, Tailwind CSS v4 (`@tailwindcss/vite: ^4.3.3`)。
- **3D 宇宙与地球引擎**: Three.js (`three: ^0.187.0`), 纯内存 HTML5 Canvas 程序化纹理合成器 (NASA Blue Marble / Black Marble, Cassini-Huygens 土星环系统与卡西尼环缝)。
- **后端服务**: Node.js v22, Express 4.21.2, TypeScript (通过 `tsx` 实时执行), 全栈同构 Vite 中间件管道 (`vite.middlewares`)。
- **数据库与持久化**: 文件系统原子化 JSON 持久化存储引擎 (`/server_data.json`)，支持内存与磁盘双向同步及安全写入备份；架构设计预留 PostgreSQL + PostGIS 迁移方案。
- **人工智能 (AI Gateway)**: 官方 `@google/genai` TypeScript SDK (^2.4.0)，接入 Gemini 模型并配置 Google Search Grounding 实时搜索工具。
- **国际化系统**: 统一多语种引擎 (`src/i18n/translations.ts`)，支持中文、English、العربية (含原生 RTL 布局支持)、Español、Français、Русский。

### 2. 前端是否真正运行？
- **结论**: **真正运行**。
- **实测证据**:
  - `npm run lint` (`tsc --noEmit`) 0 错误通过。
  - `npm run build` (`vite build`) 成功构建静态生产分发包。
  - 前端支持 3D 渲染画布、热点射线交互、平滑镜头阻尼飞行动画，以及完整的无闪烁状态保持。

### 3. 后端是否真实存在？
- **结论**: **真实存在**。
- **实测证据**:
  - 后端以 `server.ts` 为单一入口，挂载完整的 RESTful API 端点：
    - `/api/auth/*` (注册、登录、验权、新手引导、信息编辑、退出)
    - `/api/globe/*` (节点查询、国家聚合、全球空间统计)
    - `/api/posts/*` (动态发布、点赞、嵌套评论、国家分类筛选)
    - `/api/conversations/*` (多房间消息流、实时多语种翻译)
    - `/api/ai/*` (Gemini 3.8 Flash 对话网关、多模式切换、联网检索)
    - `/api/articles/*`, `/api/videos/*`, `/api/communities/*`, `/api/games/*`。

### 4. 数据库是否已经连接？
- **结论**: **已实现高可靠文件系统持久化存储（Phase 1 生产标准），已打通磁盘持久化与数据迁移基础**。
- **实测证据**:
  - `server/store.ts` 内置 `saveToDisk()` 与 `loadFromDisk()`，每次写操作（注册、发布动态、点赞、发私信、更新公开坐标）均原子同步写入 `server_data.json`。
  - 服务端重启时自动从 `server_data.json` 完整反序列化账号密码哈希、会话映射及业务数据。
  - 下一阶段将无缝迁移至 PostgreSQL + PostGIS 容器。

### 5. 用户注册与登录是否真正有效？
- **结论**: **真正有效并经过自动化单元与集成测试验证**。
- **实测证据**:
  - 注册接口基于 `crypto.randomBytes(16)` 动态加盐，执行 `SHA-256` 单向加密散列计算。
  - 登录接口比对哈希值，认证失败返回 401 明确报错；认证成功分发 64 位十六进制高安全会话 Token。
  - 前端将 Token 存入 `localStorage`，后续所有写请求均携带 `Authorization: Bearer <token>` 凭证。

### 6. 社交功能是否真正连接数据库？
- **结论**: **真正连接持久化存储**。
- **实测证据**:
  - 动态创建 (`POST /api/posts`) 强制校验登录用户身份，动态所有者与公开经纬度自动与创作者绑定。
  - 点赞与嵌套评论实时持久化至磁盘并在全域动态列表中可见。

### 7. 消息是否能够实时传递？
- **结论**: **已实现多频道消息流检索与双语实时翻译持久化，当前通过客户端轮询与按需刷新传递**。
- **实测证据**:
  - 具有公共大厅频道 (`conv_global`) 与一对一私信会话结构，支持中文、阿拉伯语、英语多语种实时生成。
  - WebSocket 专线服务将在第二阶段正式接入生产集群。

### 8. AI 是否真正接入模型？
- **结论**: **真正接入官方 @google/genai SDK**。
- **实测证据**:
  - `/api/ai/chat` 严格在服务端代理，使用 `gemini-3.8-flash` 模型，并支持 `tools: [{ googleSearch: {} }]` 搜索引擎增强。
  - 提供四大专业模式：`universal_intelligence` (通用助理)、`cultural_bridge` (跨文化使者)、`polyglot_translator` (实时口译官)、`cosmic_researcher` (深空科学顾问)。

### 9. 地球引擎是否使用真正的 3D 渲染？
- **结论**: **真正使用 Three.js WebGL PBR 物理级 3D 渲染**。
- **实测证据**:
  - **数字地球**: 拥有经纬度球面三角学投影 (`latLngToVector3`)、大气散射光晕、独立自转气旋云层、用户空间地标 Pin 针与发光珍珠。
  - **宇宙引擎 (Universe Engine)**: 完整重现开普勒轨道运动学、中心恒星点光源辐射，并基于卡西尼-惠更斯号照片精确重构了含卡西尼环缝的高真实度土星光环。

### 10. 项目是否可以部署？
- **结论**: **可以部署**。
- **实测证据**:
  - `npm run build` 成功输出符合生产标准的静态资源包。
  - `server.ts` 支持独立生产服务启动，完全符合容器化部署规范。

### 11. 哪些功能只是静态页面？
- **审计发现**:
  - “全球视频展示” (`VideoCenter.tsx`)：目前使用结构化数据驱动播放卡片，但视频流暂无后台转码切片系统（属于演示就绪，非纯空壳，但缺少流媒体服务器）。
  - “商业广告赞助” (`LuxuryAdBanner.tsx`)：目前具备点击量统计与展示，但缺少广告主自助充值竞价后台。

### 12. 哪些按钮没有真实业务逻辑？
- **已修复/已审计清单**:
  - 过去部分关注按钮和赞赏按钮仅改变前端本页面临时计数，现已接入 `/api/users/:id/follow` 真实后端端点。
  - 个人资料编辑过去仅修改内存中固定占位符，现已打通 `POST /api/auth/update-profile` 并同步更新全球 3D 地球光标经纬度。

### 13. 哪些代码存在安全风险？
- **已审计与治理风险**:
  - **会话持久化孤岛**: 之前未连接磁盘时重启丢失用户数据，已通过原子文件持久化消除。
  - **密码明文风险**: 严禁明文密码入库，全部采用 SHA-256 + 16 字节随机 Salt。
  - **API 密钥泄露风险**: Gemini API Key 仅在服务端 `.env` 中读取，绝不暴露给客户端。

### 14. 哪些部分值得保留？
- **极具战略价值的核心资产**:
  1. **3D 地球与宇宙引擎 (Digital Globe & Universe Engine)**: 高性能、低开销的程序化纹理与科学天体数据模型。
  2. **EARTH ID 统一身份与地理空间解析体系**: 经纬度双向绑定逻辑成熟清晰。
  3. **AI HUB 架构**: 多角色模型路由与 Google Search Grounding。
  4. **全语种国际化体系**: 原生支持阿拉伯语 RTL 与多语种字典架构。

### 15. 哪些部分需要重构？
- **重构路线**:
  1. 将文件持久化存储 (`server_data.json`) 平滑演进至 PostgreSQL + PostGIS 真实关系型数据库。
  2. 将即时通讯从短轮询升级为双向权威 WebSocket 传输协议。
  3. 视频中心增加直传云对象存储 (S3 / GCS) 与 HLS 视频切片协议支持。


## WORLD LIBRARY 全球数字图书连接器专项审计（2026-11-04）

### 审计结论

- 在不重做页面、不清理旧书目、不改变现有登录/书架/阅读记录与批注数据结构的前提下，建立 `server/integrations/libraries/` 统一适配器，接入 Open Library、Internet Archive、Project Gutenberg，并将既有中文与阿拉伯语 Wikisource 搜索保留为注册来源。
- 增加只读连接器清单、跨源搜索和受服务端权利复核保护的入库流程。搜索可用不等于允许阅读或下载：Open Library 只提供发现元数据；Internet Archive 未确认权利或受限条目只链接官方页；Gutenberg 单书 OPDS 在服务器重新核验，EPUB 只记录官方 URL，不在导入时下载；维基文库页面未有逐页权利确认时不复制全文。
- 搜索只按精确 ISBN/DOI 合并，书名相似不合并；各源独立开关、单源错误状态、60 秒缓存与每源串行节流，降低外部服务故障/超频对图书馆的影响。

### 实际范围与明确边界

此前阶段完成实现简报的 Phase 1、Phase 2 核心（Open Library、Internet Archive、Project Gutenberg）及 Phase 6 初步统一搜索；本轮新增独立交付 Phase 3 Google Books 连接器。此进度仍**不代表**整个 WORLD LIBRARY 简报或最终验收已完成。Europeana、OpenAlex、Crossref、arXiv、PubMed Central、DOAB、Waqfeya/Shamela/Qatar Digital Library 等尚未接入；作者/ISBN/DOI 专用搜索、语言/年份/分类筛选、完整借阅可用性、资源管理后台、跨设备书架、移动端实测和完整 AI 阅读引用仍未完成。

Internet Archive 只在记录具备被识别为公共领域/开放许可的权利依据且存在 OCR 文本文件时允许本地文本导入；借阅状态并未被推断，也不绕过 DRM、借阅或登录限制。Project Gutenberg 的公共领域状态按其美国来源声明展示，并提示阅读地区适用法律可能不同。Open Library 与 Wikisource 的权利状态不被猜测为“公版”。

### 数据与执行边界

最初发现 `/workspace/DI-review` 含既有未提交改动和未跟踪测试文件；该目录未被覆盖、清理或暂存。本轮在独立 `/workspace/DI-current` 克隆中基于当时远端 `main`（`4f6fe82`）实施。所有 HTTP/实时烟测使用临时 JSON 与随机本地端口；没有读取、改写、暂存或迁移正式 `server_data.json`，也没有触碰旧工作区已有文件。

### 验证摘要

此前 Phase 1/2：`npm run lint`、`npm run build` 通过，隔离图书馆 API 回归 20 项通过，Open Library、Internet Archive、Project Gutenberg 的可选限量 live smoke 通过且未下载 EPUB。Phase 3 的最新测试和 Google Books 未执行在线请求的限制见本审计后续阶段更新。完整项目全量测试套件及实体手机/浏览器 UI 验证未运行，不能据此声明无全站回归。


## WORLD LIBRARY 阶段更新：Google Books（Phase 3，2026-11-04）

本阶段在 `/workspace/DI-current` 安全工作树中基于最新同步的 `main` 提交 `938fbe2` 继续实施，没有触碰含既有改动的 `/workspace/DI-review`。在原有 Open Library、Internet Archive、Project Gutenberg 及两种 Wikisource 连接器基础上，新增 Google Books Volumes API 服务端适配器。来源目录现为六个连接器；Google Books 需要服务端 `GOOGLE_BOOKS_API_KEY`，缺少密钥时 fail-closed 并保持禁用；独立开关为 `EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED`。密钥不进入浏览器代码、来源响应或缓存键。

Google Books 搜索将 ISBN 查询映射为 `isbn:`，将 `author:` 映射为官方 `inauthor:`；标准化结果保留书目、官方链接及访问状态。`accessInfo.publicDomain` 仅用于描述 Google 按返回访问地区报告的状态，并附地区差异/再利用许可提醒；`PARTIAL` 映射为预览、`NO_PAGES` 映射为仅元数据，其他未明状态保持未知。只有明确报告公共领域、API 明确报告下载 `restricted=false`、格式可用且官方下载链接主机符合 Google 白名单时才提供外部 EPUB/PDF 链接。Google Books 全文、本地导入始终不支持，服务端入库端点再次硬拒绝。

验证：`npm run lint`（TypeScript）通过；`npm run test:library-connectors` 通过（mock 离线覆盖书目、ISBN/作者搜索、地区状态、下载链接、无密钥不发请求）；`npm run test:library-api` 为 21 项通过、0 失败（临时存储）并覆盖 Google Books 导入拒绝；`npm run build` 成功（既有 Three.js 大 chunk 提示仍在）。本轮未配置 Google Books API key，因此未对 Google 在线 API 发起实时搜索；此前阶段对另外三个实际连通源的限量 live smoke 结果不等同于本轮 Google Books 在线验证。实施仍不是完整 WORLD LIBRARY 验收，Europeana、学术库、阿拉伯语专项馆藏、筛选、后台与全设备 UI 验收仍待后续阶段。
