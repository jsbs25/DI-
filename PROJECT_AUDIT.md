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

此前阶段完成实现简报的 Phase 1、Phase 2 核心（Open Library、Internet Archive、Project Gutenberg）及 Phase 6 初步统一搜索，并完成 Phase 3 的 Google Books 与 Europeana 连接器。此进度仍**不代表**整个 WORLD LIBRARY 简报或最终验收已完成。OpenAlex、Crossref、arXiv、PubMed Central、DOAB、Waqfeya/Shamela/Qatar Digital Library 等尚未接入；作者/ISBN/DOI 专用筛选、语言/年份/分类筛选、完整借阅可用性、资源管理后台、跨设备书架、移动端实测和完整 AI 阅读引用仍未完成。

Internet Archive 只在记录具备被识别为公共领域/开放许可的权利依据且存在 OCR 文本文件时允许本地文本导入；借阅状态并未被推断，也不绕过 DRM、借阅或登录限制。Project Gutenberg 的公共领域状态按其美国来源声明展示，并提示阅读地区适用法律可能不同。Open Library 与 Wikisource 的权利状态不被猜测为“公版”。

### 数据与执行边界

最初发现 `/workspace/DI-review` 含既有未提交改动和未跟踪测试文件；该目录未被覆盖、清理或暂存。本轮在独立 `/workspace/DI-current` 克隆中基于当时远端 `main`（`4f6fe82`）实施。所有 HTTP/实时烟测使用临时 JSON 与随机本地端口；没有读取、改写、暂存或迁移正式 `server_data.json`，也没有触碰旧工作区已有文件。

### 验证摘要

此前 Phase 1/2：`npm run lint`、`npm run build` 通过，隔离图书馆 API 回归 20 项通过，Open Library、Internet Archive、Project Gutenberg 的可选限量 live smoke 通过且未下载 EPUB。Phase 3 的最新测试和 Google Books 未执行在线请求的限制见本审计后续阶段更新。完整项目全量测试套件及实体手机/浏览器 UI 验证未运行，不能据此声明无全站回归。


## WORLD LIBRARY 阶段更新：Google Books（Phase 3，2026-11-04）

本阶段在 `/workspace/DI-current` 安全工作树中基于最新同步的 `main` 提交 `938fbe2` 继续实施，没有触碰含既有改动的 `/workspace/DI-review`。在原有 Open Library、Internet Archive、Project Gutenberg 及两种 Wikisource 连接器基础上，新增 Google Books Volumes API 服务端适配器。来源目录现为六个连接器；Google Books 需要服务端 `GOOGLE_BOOKS_API_KEY`，缺少密钥时 fail-closed 并保持禁用；独立开关为 `EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED`。密钥不进入浏览器代码、来源响应或缓存键。

Google Books 搜索将 ISBN 查询映射为 `isbn:`，将 `author:` 映射为官方 `inauthor:`；标准化结果保留书目、官方链接及访问状态。`accessInfo.publicDomain` 仅用于描述 Google 按返回访问地区报告的状态，并附地区差异/再利用许可提醒；`PARTIAL` 映射为预览、`NO_PAGES` 映射为仅元数据，其他未明状态保持未知。只有明确报告公共领域、API 明确报告下载 `restricted=false`、格式可用且官方下载链接主机符合 Google 白名单时才提供外部 EPUB/PDF 链接。Google Books 全文、本地导入始终不支持，服务端入库端点再次硬拒绝。

Google Books 阶段当时的验证记录：`npm run lint`、连接器 mock、隔离图书馆 API 21 项和 `npm run build` 通过；当时未配置 Google API key，故未做在线请求。Europeana 已在下方独立阶段接入；更晚的测试数量、密钥状态和验收缺口以其阶段记录为准。学术库、阿拉伯语专项馆藏、筛选、后台与全设备 UI 验收仍待后续阶段。

## WORLD LIBRARY 阶段更新：Europeana（Phase 3，2026-11-04）

在干净且与 `origin/main` 同步的 `e027c4c` 工作树上增量实现，没有清理、覆盖或迁移任何既有图书、书架、阅读进度、批注或阅读器数据。现有连接器注册数增至七个；Europeana 接入原有 `/api/library/connectors` 与 `/api/library/search` 聚合，不替换现有来源。支持多语言关键词和 `author:` 查询；记录详情使用官方 Record API；结果继续按精确 ISBN/DOI 去重，不对相似标题做合并。

版权映射取自 Europeana 每个数字对象的 `edm:rights`，不把 Europeana 元数据的 CC0 误当作对象授权：CC0/Public Domain Mark 映射为 `PUBLIC_DOMAIN`，可识别的 CC 许可映射为 `OPEN_LICENSE`，已知 InC/NoC 限制语句映射为 `COPYRIGHT_RESTRICTED`，冲突、CNE 或未识别语句保持 `UNKNOWN`。只在 PDM/CC0 或 CC BY/CC BY-SA 且缩略图 HTTPS 主机属于 Europeana 时显示缩略图；所有 Europeana 结果 `canImport=false`，全文和直接下载明确 `unsupported`，服务端入库路由另行硬拒绝。

Europeana 需要服务器环境变量 `EUROPEANA_API_KEY`（请求以 `wskey` 发送）；未配置时即使启用开关也报告 `disabled`，无外部请求。API 响应可能回显 `apikey`，已在缓存前移除；密钥不进入响应或缓存键。当前未提供真实密钥，因此没有进行 Europeana 在线 smoke，离线 mock 通过不代表已验证服务端实际连通性。统一搜索卡片增加逐源状态/禁用原因、资源类型、DOI/ISBN、访问与下载状态；本阶段未进行浏览器视觉验收。验证通过：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（23/23）、`npm run test:api`（85/85）与 `npm run build`；生产构建仍显示原有 Three.js 大 chunk 提示。全球学术库、移动端/浏览器 UI、个人书架跨设备同步和最终 WORLD LIBRARY 验收仍未完成。


## WORLD LIBRARY Phase 4：免密钥学术发现（2026-11-04）

**基线与保全。** 本阶段从已同步 main 提交 `f160fa1825cbf2ac1f534bfec83767ef34110e4c` 开始，起始工作树干净；没有迁移、改写或清理正式图书数据。

**实现。** 新增 OpenAlex、Crossref、arXiv、Europe PMC 四个官方免密钥发现源，接入来源注册表、统一搜索默认值、服务端搜索/入库白名单、环境开关、搜索卡片和实时烟测脚本。四源查询免费且无需用户设置，但受各提供方条款、配额和可用性限制。Google Books 和 Europeana 仍需服务端密钥，缺少时保持 fail-closed。

**版权边界。** 检索元数据、开放获取标记、官方阅读入口与再利用许可分开处理。新源记录一律 `canImport: false`，不返回本地下载链接，connector 侧全文/下载操作为 `unsupported`；服务器另以 403 拒绝学术源全文入库。只在安全 HTTPS 官方链接可确认时提供外链。arXiv 请求至少间隔 3 秒；沿用精确 DOI/ISBN 去重与共享缓存。

**验证。** 全项目 TypeScript 检查、离线连接器 mock、隔离图书馆 API（25 项）、全站 API（85 项）、生产构建及实时连接器烟测均通过。四个新来源的真实搜索各返回至少一条记录。构建保留非阻断的现有 Three.js 大 chunk 提示。官方 API 文档链接、具体映射、配置及剩余范围见 `LIBRARY_CONNECTORS.md`。

**未包含。** 本阶段不接入 PubMed Central 独立全文 API、DOAB 或其他阿拉伯语/文化遗产馆藏，也不实现更丰富的跨源过滤、定时刷新或管理后台；没有要求用户提供密钥或进行额外设置。


## WORLD LIBRARY Phase 4 当前状态复核：PMC 与 DOAB（2026-11-04）

此前 Phase 4 审计段记录的是 OpenAlex、Crossref、arXiv、Europe PMC 四源的初始实现。后续已加入 PubMed Central 和 PubMed，统一连接器注册表现有 13 个来源。PMC 使用 NCBI 官方 E-utilities 无密钥搜索和书目详情接口，结果仅链接 PMC 官方文章页；因检索元数据本身不包含可复核的单篇许可，权利标记为 `UNKNOWN`，全文/下载 unsupported，服务端独立拒绝本地导入。PubMed 使用独立的 `db=pubmed` 查询，标为 `METADATA_ONLY`，不会将 PubMed 书目记录视为全文。两个 NCBI 来源共用串行限速队列，至少间隔一秒。旧文档所示 PMC `free fulltext[filter]` 在当前在线端点实测返回 0 条，故 PMC 实现不依赖该筛选，也不把结果描述为已验证开放许可。

DOAB 的官方元数据说明确认其书目元数据为 CC0，并提供 OAI-PMH 与若干导出/PRISM 服务；但 OAI-PMH 为分页收割接口，并非按用户关键词检索。当前环境对目录候选 REST 路径返回 HTTP 403/429，尚无可复核的稳定、限量关键词搜索接口，因此没有接入未验证路由或做整库抓取。DOAB 仍列为未完成项，不需要用户配置密钥。

回归结果：TypeScript 检查、离线连接器 mock、隔离图书馆 API（27 项）、通用 API（85 项）、生产构建和限量实时来源烟测均通过；PMC 实时查询成功。构建保留原有 Three.js 大 chunk 提示。学术全文的许可复核、DOAB 搜索、阿拉伯语专项馆藏、管理后台、跨设备书架及移动端/浏览器验收仍不代表完成。


## WORLD LIBRARY Phase 4 follow-up：PubMed 书目检索（2026-11-04）

在已集成 PMC 的基础上新增 NCBI PubMed 独立连接器，使用官方 E-utilities `ESearch` / `ESummary` 查询 `db=pubmed`。无需用户注册、密钥或环境配置；默认加入统一搜索并可用 `EARTH_ONE_LIBRARY_PUBMED_ENABLED` 单独关闭。支持普通关键词、作者/题名字段以及 PMID、PMCID、DOI 查询，归一化作者、期刊、年份、DOI 和 PMID，并通过精确 DOI 规则与其他书目来源去重。PubMed 和 PMC 共用 NCBI 限速队列，避免并行搜索绕过同一服务的请求节流。

PubMed 只提供书目检索与官方 PubMed 记录页，固定为 `METADATA_ONLY`；即使记录含有关联 PMCID，也不声称该 PubMed 结果已验证全文可用。全文、下载和本地导入明确不支持，API 对导入独立返回 403。结果权利提示也指出摘要可能含受版权保护内容，并链接 NCBI/NLM 官方免责声明。PMC 的 `UNKNOWN` 版权状态和其官方文章页流程保持不变。新增了搜索卡片来源标签、环境示例、离线接口/权限/去重测试及实时烟测用例。

验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（29 项）、`npm run test:api`（85 项）、`npm run build` 和 `npm run test:library-connectors:live` 均通过；实时 PubMed 查询返回真实记录。生产构建仍有既有 Three.js 大 chunk 警告。测试使用 mock 或临时隔离存储，未修改正式用户书架或本地图书数据；未进行浏览器视觉或移动设备回归。


## WORLD LIBRARY Phase 5：官方阿拉伯语资源（2026-11-04）

**本阶段基线与保全。** 从干净、已同步的 `main` 提交 `32db81455171108c3671d020ac39514ed6894107` 增量推进。保留原有 13 个连接器、图书目录、登录、书架、阅读记录、批注和阅读器；未修改正式用户数据。

**Shamela：真实接入。** [Shamela 官方 MCP 指南](https://shamela.ws/mcp-guide/)公开只读服务 `https://mcp.shamela.ws`，明确说明免费且无需 API key 或 Shamela 账号。新增第 14 个正式连接器，默认启用、可用 `EARTH_ONE_LIBRARY_SHAMELA_ENABLED=false` 关闭；采用官方 `shamela_find` 工具，不使用未经说明的接口。只在查询包含阿拉伯文时发出请求；非阿语时返回 `unsupported`，不擅自翻译或制造假匹配。结果仅保留书名、作者、页码和 Shamela 官方页面链接。响应正文不返回、不写入本地书目、不进入缓存；权利状态始终为 `UNKNOWN`，`canImport=false`，全文、下载及入库接口明确拒绝。每源串行、最短 2 秒间隔。

**Waqfeya 与 Qatar Digital Library：官方跳转。** [Waqfeya 官方图书目录](https://waqfeya.net/books)和 [QDL 官方检索页](https://www.qdl.qa/en/search/site/)已核实并加入首页入口。当前没有找到 Waqfeya 可公开核验的正式机器检索 API，也没有找到 QDL 官方发布的机器检索 API 文档，因此没有抓取、批量索引或复制全文；两者只跳转到官网。QDL 官网声明资源免费使用与复用，但每件数字资源仍须遵循其具体权利信息；EARTH ONE 不据此批量复制媒体或全文。

**验证。** 离线连接器 mock、隔离图书馆 API（31 项）、通用 API（85 项）、TypeScript 检查、生产构建及限量在线 connector smoke 均通过；真实 Shamela 阿语搜索有返回记录，结果仅含书目字段和官方页链接。生产构建仍有既有 Three.js 大 chunk 非阻断提示。没有做浏览器视觉或手机设备验收。前次运行环境无已授权写入路径，所以当时未推送；本次续接确认 GitHub `main` 仍是 `32db814`，使用现有授权连接器正常提交并推送 Phase 5 的 `8bff41d04390d1a7f3e9366541fa12cfb1d020ae`，并通过 GitHub API 核实远端提交。未更换或新增账户凭证。

**仍未完成。** Waqfeya/QDL 的机器接口接入、将中文/英文查询可靠映射为阿拉伯语、更多阿语馆藏、馆藏筛选、个人书架跨设备验证、移动端实测和基于具体许可的全文阅读仍待后续阶段。


## WORLD LIBRARY Phase 6：OpenAlex 作者与机构发现（2026-11-04）

**新增能力。** OpenAlex 除原有作品与 DOI 搜索外，现在支持 `author:姓名` 及 `institution:机构名` 显式前缀，分别调用官方 Authors 与 Institutions 列表端点；OpenAlex A/I 实体 ID 也可用于统一连接器详情查询。搜索卡片展示作者/机构档案类别、作者 ORCID/当前机构提示，或机构类别、国家代码、作品/引用计数。普通搜索和 DOI 查询仍按原逻辑查作品，搜索框同步提示两种前缀。

**官方接口与边界。** 依据 [OpenAlex API 概览](https://help.openalex.org/api/)、[作者搜索文档](https://github.com/ourresearch/openalex-docs/blob/main/api-entities/authors/search-authors.md)及[机构搜索文档](https://github.com/ourresearch/openalex-docs/blob/main/api-entities/institutions/search-institutions.md)，使用官方 `/authors?search=` 与 `/institutions?search=`，仅请求所需字段、限制每次最多 25 项。OpenAlex 基础 API 可免账号及 API key 使用。档案仅标为 `METADATA_ONLY`；没有全文、下载或本地导入入口，OpenAlex 对元数据的 CC0 声明不被当成研究文章全文的许可。

**验证与限制。** 离线 mock 覆盖两类搜索端点、选取字段、官方 URL、A/I 详情 ID、免密钥、元数据权限及拒绝导入；限量在线 smoke 对 `author:Carl Sagan` 和 `institution:University of Jordan` 均实际返回官方档案。TypeScript 检查、连接器离线测试、图书馆 API（31 项）、全站 API（85 项）、生产构建与连接器实时 smoke 全部通过。构建仍有既有 Three.js 大 chunk 提示。未进行浏览器视觉/移动设备回归。当前只在用户明确输入前缀时搜索作者或机构，未建立完整作者—作品关系浏览、年份/学科筛选或研究机构地图。


## WORLD LIBRARY Phase 6：统一搜索、去重与版权识别（2026-11-04）

**实现改进。** 统一结果现在只根据经规范化的精确身份匹配：DOI、校验有效的 ISBN，或带来源命名空间的精确 provider ID；从不按相似标题合并。DOI 统一移除 `doi:` / `doi.org` / `dx.doi.org` 前缀并转小写。ISBN-10 校验通过后转为等价的 978 ISBN-13，ISBN-13 校验位错误及其他无效值不参与去重。同一 source ID 只在同一连接器内有效；当两条记录具有互不重叠的有效 ISBN 时，即使 work ID 或 DOI 相同，也保留为不同版次。合并记录会保留两端 ISBN 写法及备用官方来源链接。

**权利/访问状态。** Open Library Search API 的 edition-level `ebook_access` 仅在明确值为 `public` 或 `borrowable` 时分别标为 `OPEN_ACCESS` 或 `BORROWABLE`；其他值保持 `UNKNOWN`。这仅表示 Open Library 服务上的阅读/借阅状态，不是版权许可，所有记录依然 `canImport=false`、不提供本地全文或下载。Internet Archive 若同一条权利信息中同时出现已识别的许可/公版声明与限制声明，分类回退 `UNKNOWN`；相互冲突的 Public Domain 与开放许可声明也 fail-closed。详情参见[官方 Open Library Search API 文档](https://openlibrary.org/dev/docs/api/search)。

**验证与保全。** 新增离线回归涵盖 DOI URL/大小写、ISBN-10/13 对应、无效校验位、provider ID 命名空间、同一 work ID 下的版次冲突、相似标题不误合并、Open Library `public`/`borrowable`/未知状态，以及 Internet Archive 矛盾权利声明。最终通过 `npm run lint`、`npm run test:library-connectors`、`npm run test:library-api`（31/31）、`npm run test:api`（85/85）、`npm run build` 和限量 `npm run test:library-connectors:live`。构建仍显示既有 Three.js 大 chunk 非阻断警告。未要求或使用用户密钥、未做批量抓取、未下载/保存原文，没有修改正式用户书架或图书数据；未进行浏览器/移动端视觉验收。
## WORLD LIBRARY Phase 7（限定范围）：个人书架章节续读（2026-11-04）
复核现有代码后确认：WORLD LIBRARY 已有章节阅读器、独立 EPUB 阅读器、书架状态、服务端 JSON 持久化、章节批注和阅读进度接口。原章节阅读器的进度需手动保存，打开书籍时总是回到第一章；书架已有百分比，但没有准确章节标记；书架前端请求也没有显式携带登录令牌，服务端可能回退到进程级 guest 用户。本次只补足“已加入个人书架的文本书籍自动保存并恢复最近章节”，不替换阅读器、不迁移或清理数据、不改 EPUB 与连接器。
新阅读状态存入既有 `BookShelfItem`（新增可选 `lastReadChapterId`，旧数据无需迁移），通过按用户身份筛选的书架 API 持久化。阅读器章节选择变化时自动保存章节标识和百分比；再次从书架或详情打开时优先恢复准确章节，旧书架记录则按旧百分比做兼容性估算。登录书架请求现携带现有 session token，切换账户时清空旧书架并忽略过期响应。服务器验证章节属于该书，未加入当前用户书架时不写入。
验证使用临时隔离的 API 数据文件及 `.invalid` 合成账号；两账户将同一本书放入各自书架，验证一方的阅读章节/进度持久化且另一方不可见。没有读取或修改正式用户书架/真实图书数据，没有新增 API key 或用户设置。EPUB 的 CFI/页内位置续读、非书架阅读历史、浏览器视觉/实体手机测试仍未包含；因此 Phase 7 仅完成这一项增量能力，不能代表完整读者验收。


## WORLD LIBRARY Phase 7 follow-up：EPUB 个人续读（2026-11-04）

保留既有 `epub.js` 阅读器、目录、分页、字号与全屏交互；本次为已加入个人书架的 EPUB 补上精确位置恢复。阅读器从 EPUB.js 的 `relocated` 事件读取 CFI，节流保存到对应 `BookShelfItem.lastReadEpubCfi`，重新打开时优先恢复该位置。未加入书架或未登录用户仍可阅读，但不保存个人进度。新 API 要求有效会话、请求账户 ID 与会话身份一致，并确认该书属于当前账户；客户端在切换账户时按账户 ID 隔离恢复位置和待保存回调。

此增量不改变既有阅读器格式/权限、不下载或复制外部 EPUB、不改连接器或用户配置，也不要求 API key。存储沿用现有服务端 JSON 持久化。隔离 API 测试用合成 CFI 和两个临时账户验证保存、无效 CFI 拒绝、未登录及账户不匹配拒绝、账户隔离与磁盘持久化。`npm run lint`、`npm run test:library-api`（41 项）、`npm run test:library-connectors`、`npm run test:api`（85 项）、`npm run build` 均通过；构建保留既有 Three.js 551.65 kB chunk 警告。没有做真实 EPUB 下载、浏览器视觉/实体设备或两台设备同步验收；因此跨设备实际体验仍需后续验证。


## WORLD LIBRARY Phase 8（限定范围）：正文核验式 AI 阅读与私有知识笔记（2026-11-04）
复核发现，旧章节 AI 解读把浏览器提交的选中文字直接交给通用 `/api/ai/chat`，服务端既不核验该文字是否属于所选图书，也没有可信版本/章节引用。另有两类内容必须区分：真实导入正文、种子演示摘录，以及自动收录器生成的书目预览。本轮保留既有阅读器、通用 AI Hub、连接器与旧批注功能，只替换图书 AI 解读的证据入口。

新增 `Book.textAvailability`：已核实章节全文标记为 `full_text`，有限摘录标记为 `excerpt`，自动书目预览及仅 EPUB/元数据记录标记为 `metadata_only`；缺失标记的旧记录按未核实处理。AI 阅读端点 `/api/library/books/:id/ai-reading` 只从服务端书目取书名、正文、章节和来源；要求章节存在、所选文字（允许空白规范化）确实出现在保存正文中，并要求 HTTPS 来源页与 ISBN、出版者/年份或来源记录 ID 等版本依据。伪造选文、元数据预览、缺来源或版本记录均在调用模型前失败。

每次解读的模型输入限于服务器原文中的所选段落及邻近上下文（每侧最多约 1,200 字符），提示词禁止声称读过整本书、补造页码/版本/引文。界面独立呈现由服务端构造的《书名》、作者、版本标识、章节定位和来源链接；仅有摘录时明确说明不能代表全文。若版本/来源不可核查则不生成带引用回答；若现有 AI 网关没有可用模型则返回明确未生成状态。没有新增付费服务、连接器、密钥或 API key 要求。

知识库连接采用安全的最小增量：`POST /api/library/books/:id/knowledge-notes` 重新核验同一正文/引用后，将成功 AI 解读及用户笔记存入现有批注持久层，但记录带当前登录用户 ID，仅该账户在书籍详情中可见；旧批注保持旧有读取兼容。EPUB 仍走原阅读器，因当前尚无其可核实的服务器正文提取路径，不接入此 AI 入口，也不假称已读过 EPUB 全文。

本轮只完成 Phase 8 的可验证纵向增量，不代表完整 AI 阅读阶段完成。仍未实现 EPUB 文本选择/解读、整本或整章总结、跨版本比较、研究论文检索、对全局知识图谱的自动关系写入；带来源笔记也尚未完成真实设备/账户端到端验证。测试和最新验收结果见 `TEST_REPORT.md`。


### WORLD LIBRARY Phase 8 follow-up：EPUB 正文 provenance 与明确拒绝（2026-11-04）

**结论：当前没有可供 AI 安全核验的 EPUB 服务器正文路径，因此不接入 EPUB 段落解读。** 受权利复核的 EPUB-only 导入会保存书目和官方 EPUB URL，但章节数组为空、`textAvailability` 为 `metadata_only`、`formatType` 为 `epub`。`EpubReader` 将官方文件经 `/api/library/epub-proxy` 流式转给浏览器，由 epub.js 在浏览器内解析目录与正文；服务端没有解包 EPUB、保存章文本、建立内容哈希或把 CFI 校验到具体版本。用户书籍仅保存续读 CFI/百分比，不是正文或引用定位；不能把百分比称为页码。审计期间未打开或读取真实用户书籍。

新增证据解析器的 EPUB-only 专用 `409 EPUB_TEXT_UNAVAILABLE` fail-closed 分支，即使记录错误标记为全文或带未核验章节，也不调用模型；EPUB 阅读器同时显示限制说明。现有服务器正文文本书籍的 AI 解读、引用和私有笔记流程不变，EPUB 阅读与书架续读保留。未新增连接器、依赖、付费服务、密钥或配置；若要日后支持 EPUB AI，需先实现有权利依据的服务器端解析与版本绑定的章节/内容 provenance，不能用 CFI 或猜测页码代替。

合成 EPUB 回归与 Phase 8 全套检查结果见 `TEST_REPORT.md`。无真实 EPUB 网络读取、模型调用、用户书架访问、浏览器视觉/手机或实际账户验收；本轮不宣称 EPUB AI 已完成。


## WORLD LIBRARY Phase 9：安全移动适配与浏览器回归（2026-11-04）

从已与 GitHub `main` 同步的 `145d822` 继续；工作范围仅为 WORLD LIBRARY 前端手机窄屏和可访问性交互，没有改连接器协议、真实用户数据或书架存储结构。修复移动视口缺少图书馆内导航、首页/搜索状态及卡片的语义与焦点不足、空白搜索控件可用性提示、搜索结果操作触控目标过小等问题。书架筛选/返回、保存与来源链接、首页官方馆藏入口均设为至少 44px 触控高度；外开链接显式带 `noopener noreferrer`。

文本阅读器在窄屏改为可换行的双行控制区，增加命名控件、模态语义、Escape 关闭、Tab 焦点循环及关闭后返回焦点；触屏选文通过 `pointerup` 继续触发现有批注面板。EPUB 阅读器工具栏适配手机，目录在窄屏变为覆盖式抽屉，章节目录项至少 44px；保留并显式显示 EPUB AI 证据不足时的拒绝说明，未扩大 EPUB AI 能力。

无登录浏览器运行在合成 API 桩上，`/api/auth/me` 明确返回未认证，浏览器阻断外网，使用合成文本书、虚构搜索来源及本地合成 EPUB。320、360、375、390px：首页、全球搜索（来源禁用、零结果/来源错误、有结果、权利未知/受限/来源声明公版）没有横向页面溢出；测量了空查询禁用、权利受限条目不出现导入按钮、书架控件和搜索操作达到 44px。320px 文本/EPUB 阅读器、触屏批注抽屉、EPUB 目录、Escape/Tab 焦点循环与关闭后焦点回返通过；浏览器无页面异常。所有 API 请求由本地合成桩响应。

验证：`npm run lint`、`npm run build`、图书馆 API（45/45）、合成阅读 AI 证据（19/19）、离线连接器、通用 API（85/85）均通过；构建保留既有 Three.js 551.65 kB 非阻断 chunk 警告。未做实体手机、真实登录、真实账户书架、在线连接器、实际 EPUB 下载或模型调用；不把仿真视口验收描述成真机/生产用户验收。


### WORLD LIBRARY Phase 8/9 follow-up：EPUB 权利、文件边界与 CFI 安全复核（2026-11-04）

**决策：EPUB AI 仍保持 fail-closed。** Gutenberg 入库会按官方数值 ebook ID 重新核验 OPDS 记录和可复制权利，但书目目前只保存 EPUB URL、来源/记录 ID 与权利说明；没有保存该文件的 SHA-256、OPF/manifest/spine、解析章节正文或章节哈希。同一来源 ID 也不能证明后来代理到的具体文件版本未变化。`epub.js` 在浏览器端读取目录与正文；其 CFI parser 本轮仅用于校验个人续读 CFI 的语法，未对照某一 EPUB 的 spine/DOM，因此仍不能作为 AI 引用定位。只靠公版/开放许可标记、客户端选文或语法有效的 CFI，均不足以证明来源版本和正文相符。

本轮没有新增服务器 EPUB 解包器、依赖、配置或模型路径；保留浏览器阅读与账户书架续读。阅读器提示现在明确说明：本版正文/CFI 尚无可核验关联，选文不会发送给 AI；若馆藏另有已核实的 TXT/正文版本，可以使用该版本。服务端 EPUB 代理增加 64 MiB 响应上限、拒绝缺失/截断/非 ZIP local-file 头，并禁用自动重定向、逐跳校验 HTTPS 和获准馆藏主机。续读 API 通过项目现有 epub.js CFI parser 检查结构语法、偏移和长度，并限制进度为 0–100%；此检查**不**验证该 CFI 是否属于目标书籍/版次，也不改变原进度的账户/书架所有权逻辑。代理只检查 ZIP 前缀，不是完整 EPUB/ZIP 校验、解压、DNS/IP 私网隔离或净化器；本轮仍不把它作为正文提取入口或通用 SSRF 防护。

继续开放 EPUB AI 前，仍需设计并验证绑定来源授权、具体文件哈希、受限解包与恶意文档防护、章节/文本哈希和同版 CFI/spine 映射的服务端证据流程，并覆盖压缩炸弹、路径/脚本/外链、重定向目标与版本替换等测试。完整回归和具体测试边界见 `TEST_REPORT.md`。本轮只用合成 EPUB fixture 和临时隔离 API 数据；没有下载或解析真实 EPUB、访问/修改用户书架或笔记、调用模型或要求新增配置。

### WORLD LIBRARY Phase 7/9 follow-up：服务器重启后的续读持久性与账户隔离（2026-11-04）
本次仅扩展隔离 API 回归测试，不修改阅读器、服务端读写逻辑、书架 schema、用户配置或正式书架数据。测试显式将 `EARTH_ONE_DATA_FILE` 指向操作系统临时目录，在随机本机回环端口启动服务，并使用两个 `example.invalid` 合成账户把同一本合成书目加入各自书架。账户 A 保存文本章节 ID 与 EPUB CFI 后，停止并重启服务进程，使用新建 HTTP 请求及原账户令牌从同一临时文件重新读取：A 恢复章节、CFI 和 63% 进度；B 仍无章节/CFI 且进度为 0。两账户令牌也能在重启后通过认证读取，说明会话与书架状态均由测试 JSON 文件持久化，而非进程内存。
本次 `npm run test:library-api` 49/49 通过，`npm run lint`（`tsc --noEmit`）通过。没有运行完整服务测试或外部连接器请求，没有下载 EPUB、调用 AI、访问或修改真实用户书架/笔记，也没有新增配置。该结果证明服务端跨进程持久化与账户级隔离；不是实体设备、真实账户或跨部署同步验收。EPUB CFI 仍仅做语法/边界校验，不构成版本定位或 AI 正文证据。

## WORLD LIBRARY 外部来源故障隔离验收（2026-11-04）
从已同步的 `1b34b9f`、干净的 `main` 工作区继续检查统一搜索。各适配器原本会把常见 HTTP/网络异常转换成自己的 `error` 响应，但聚合器仍直接使用 `Promise.all`；若某个连接器异常拒绝 Promise 而未自行捕获，整次统一搜索会被拒绝，API 顶层随即返回 502。此行为不符合“一个外部来源不可用时其他来源继续工作”的隔离要求。
现已在聚合边界按来源捕获异常：拒绝的适配器仅得到 `status: error`、`count: 0` 和该异常原因；其他来源仍参与结果归一化与去重，环境禁用来源继续返回 `disabled`，不会发出请求。新增的离线隔离回归同时模拟 Open Library 超时、Internet Archive HTTP 403、Crossref HTTP 429、Europe PMC 正常返回和 Project Gutenberg 配置禁用，并验证规范化结果、来源状态、错误原因与禁用来源零请求。另验证一个 connector `search()` Promise 意外拒绝时，其余免费来源仍返回结果。
验证通过：`npm run test:library-connector-isolation`、`npm run test:library-connectors`、`npm run lint`、`npm run test:library-api`（49/49）、`npm run test:api`（85/85）和 `npm run build`。构建保留既有 Three.js 551.65 kB 非阻断 chunk 警告。测试全程用本地合成 `fetch`，没有真实外部请求、用户数据访问、密钥新增、批量查询或服务条款变更；因此测试证明故障隔离逻辑，不证明数据源此刻在线。

同步基线补充：开始时本地 `main` 为 `1b34b9f`；提交前 fetch 发现 `origin/main` 新增 `88945ce`（只改 `server/bookHarvester.ts`），核对与本轮文件无重叠后以 `--ff-only` 快进，没有覆盖或重置其他更改。上述测试在快进后的 `88945ce` 上全部重跑通过。

## WORLD LIBRARY Phase 6：统一搜索来源与权利筛选（2026-11-04）
统一搜索结果新增动态筛选：来源选项及计数来自当前真实结果的 `source` / `sourceName` 字段；权利选项及计数来自服务端 `rightsClassification`。来源与权利条件可组合，未识别或缺少权利分类的结果仅归入“权利状态未知”，不推断开放阅读、借阅或再利用许可。筛选只改变卡片列表；服务端返回的来源健康状态徽标（成功、失败、禁用、不适用）继续完整显示。API、连接器和书目/用户数据均未改；无密钥或配置要求。
验证：`npm run test:library-search-filters`、连接器隔离/离线回归、图书馆 API（49/49）、全站 API（85/85）、`npm run lint`、`npm run build` 通过。测试仅使用合成筛选记录与既有本地 mock；没有实时来源请求或数据写入。构建仍有既有 Three.js 大 chunk 非阻断提示；本次未做浏览器视觉或实体设备回归。
