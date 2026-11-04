# EARTH ONE — 开发日志（DEVELOPMENT LOG）

## 2026-11-04

### 数据层重构：书籍全文抽离（本次核心）

**问题**：`server_data.json` 承载所有书籍全文，已膨胀到 3.6MB；每次写入（点赞/消息/存书）都整文件重写，且随书籍增多会指数级变慢。

**方案**（兼容式，不破坏功能）：
- 书籍章节正文抽离到 `server_data/books/{bookId}.json`（每本书独立文件）。
- `server_data.json` 只保留书籍元数据 + 章节标题（不存正文）。
- 列表/书架接口返回元数据；详情接口返回完整章节。
- 旧数据在启动时自动迁移（抽离正文 + 回写精简主文件）。

**改动文件**：
- `server/store.ts`：新增内容文件读写（`writeBookContent`/`loadBookContent`/`bookContentFile`/`hasInlineContent`）、`stripBookContent` 导出；`saveToDisk` 写元数据版；`loadFromDisk` 迁移+回水；`addBook`/`updateBook`/`deleteBook` 管理内容文件。
- `server.ts`：列表/书架接口返回元数据；导入 `stripBookContent`。
- `src/components/library/DigitalLibrary.tsx`：新增 `loadFullBook`/`openBookDetail`/`openShelfBook`，打开详情/阅读器前拉取完整章节。
- `.gitignore`：忽略 `server_data/`、`server_data.backup.json`。

**验证结果**：
- `server_data.json`：3.6MB → 225KB（40 本，仅元数据）。
- 列表接口：30KB（元数据，章节 content 为空）。
- 详情接口：1.26MB（《تفسير القرطبي》30 章完整正文）。
- 清理 5 本重复测试书。

### 上一轮（同日更早）

- 修复书籍全文分章（`fetchBookFullText` 按真实章节标记拆分，支持单换行/多标记兜底）。
- 新增书源：阿拉伯语维基文库 + Internet Archive（含 OCR 全文文件名解析）。
- 新增知识宇宙知识图谱 + 全局统一搜索。

## 待办

- [ ] 列表/详情分离后，补前端「阅读历史/最近阅读」对详情接口的复用确认。
- [ ] 密码哈希升级 bcrypt/argon2。
- [ ] 登录限流 + 会话过期。
- [ ] 国家/城市详情页。
- [ ] 个人知识库（统一双向链接）。

## 安全加固（2026-11-04 追加）

- 密码哈希：SHA-256+盐 → scrypt（内存困难），旧哈希登录时透明升级。
- 登录/注册限流：内存滑动窗口，登录 10 次/15 分钟、注册 20 次/15 分钟（按 IP）。
- 验证：种子账号登录成功并自动迁移为 scrypt 哈希；错误密码 401。


### WORLD LIBRARY：真实全球图书来源连接器（2026-11-04）

- 建立 `server/integrations/libraries/index.ts` 统一连接器接口、来源注册表、标准书目/权利字段、结果聚合和精确 ISBN/DOI 去重；Open Library、Internet Archive、Project Gutenberg 与既有中文/阿拉伯语 Wikisource 共五个来源可分别由环境变量开关。
- 新增 `/api/library/connectors`、`/api/library/search`，并将 `/api/library/ingest` 改为使用来源 ID 在服务端重新查询官方记录后再判断权利和可用文件；Open Library 元数据、权利未知/借阅受限记录不会伪装为全文。既有本地图书目录、书架、进度、详情和阅读器流程保留。
- Internet Archive 查询按官方 Lucene 语法限制在 `title`、`creator`、`identifier` 字段和 `mediatype:texts`，降低全文索引的无关结果；导入还要求明确可复制权利标记及官方元数据列出的 OCR 文件。Gutenberg 使用官方 OPDS `query` 参数，并在导入时再读取单书 OPDS 验证 TXT/EPUB 链接；公共领域说明带美国法域提醒。OPDS 语言字段从命名空间 XML 读取，不存在时返回 `und`，不再默认误标为英语。
- 新增 `LIBRARY_CONNECTORS.md`、`scripts/test_library_connectors.ts`、`scripts/test_library_connectors_live.ts`，并注册 `test:library-connectors` 与 `test:library-connectors:live` 命令；更新功能清单与项目专项审计。
- 在 Phase 1/2 阶段，配置只新增可选联系邮箱与五个连接器开关示例；当时尚未接入的学术、Europeana、Google Books 与阿拉伯语资源列为后续事项。Google Books 已在下方 Phase 3 独立接入。
- 验证：TypeScript 检查通过；离线连接器测试通过；隔离图书馆 API 回归 20 项通过；生产构建成功；实时官方来源烟测通过（Open Library、Internet Archive 搜索，以及 Gutenberg 搜索至隔离书目详情链路，未下载 EPUB）。全站浏览器回归和其他待批准权限相关路由未执行。

- UI 搜索卡片/详情页显示来源权利说明及通过 HTTPS 校验的许可原文链接；客户端仅在来源明确返回 `canImport: true` 时提供本地导入按钮，服务器仍再次验证来源记录和权限。该 UI 变更通过类型检查与生产构建，未进行本轮浏览器视觉验收。


- GitHub 同步：实现提交 `2cb84e9f7093cc03aa942a5d2540a3fda96f6a8c` 已从 `4f6fe82c784ad4bf63d63217f971437046684536` 普通快进推送至 `main`；推送后 fetch 和 GitHub connector API 均确认远端、跟踪分支和本地 HEAD 一致。未强推、未持久保存凭据或改变 Git 全局配置。


### WORLD LIBRARY Phase 3：Google Books（2026-11-04）

- 基于已同步 `main` 提交 `938fbe2` 在安全工作树中继续；未改动 `/workspace/DI-review`。新增 `GoogleBooksConnector` 并纳入六源注册表、默认聚合搜索、`/api/library/search` 来源白名单和前端来源标签；`.env.example` 增加服务端 `GOOGLE_BOOKS_API_KEY` 与 `EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED`。没有密钥时来源保持禁用；各 Google 请求有官方 API key，但密钥不进入浏览器、缓存键或日志。
- 支持 Google Books Volumes API 书目搜索、ISBN 查询、`author:` 查询、卷详情与访问状态查询；映射作者、出版社、日期、ISBN、语言、描述、封面、官方页面/预览、地区、`viewability` 和下载可用性。
- 权利限制保持 fail-closed：预览/仅元数据/未知状态不会得到下载入口；只在 API 报告当地 public-domain、下载未受限、EPUB/PDF 可用且官方下载 URL 在 Google 主机白名单时返回提供方链接。Google Books 全文复制与本地导入一律不支持，API 入库路由有独立拒绝分支；来源说明区分服务内可见性与再利用许可。
- 更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md`、`LIBRARY_CONNECTORS.md`，记下官方 API/schema 链接和本阶段验证边界。
- 验证：`npm run lint`、`npm run test:library-connectors` 通过；隔离 `npm run test:library-api` 为 21/21；`npm run build` 成功。Google Books API key 未配置，未对 Google Books 执行真实网络请求；其他连接器保持既有实现和数据不变。


### WORLD LIBRARY Phase 3：Europeana（2026-11-04）

- 基于最新同步的 `main`（`e027c4c`）在原有连接器接口中新增 Europeana；现有来源目录增至七个。`/api/library/search` 默认聚合 Europeana，服务端 source allowlist、前端来源名称和 `.env.example` 同步更新；既有本地目录、书架、阅读器和其他来源未删改。
- 使用官方 Search API（`/record/v2/search.json`）与 Record API；支持关键词、`author:`→`proxy_dc_creator` 查询、记录详情及书目字段标准化。继续采用每来源节流/缓存和精确 ISBN/DOI 去重，不做模糊标题合并。
- 新增 `edm:rights` URI 映射：CC0/Public Domain Mark → `PUBLIC_DOMAIN`，已识别 CC 许可 → `OPEN_LICENSE`，已知 InC/NoC 限制声明 → `COPYRIGHT_RESTRICTED`，冲突/未知/CNE → `UNKNOWN`。元数据 CC0 不外推为数字对象许可。只有 PDM/CC0 或 CC BY/CC BY-SA 并且缩略图来自 HTTPS Europeana 域名时返回缩略图；所有结果禁止本地全文导入，不提供直接下载或全文接口。
- `EUROPEANA_API_KEY` 必须由服务器配置，独立开关为 `EARTH_ONE_LIBRARY_EUROPEANA_ENABLED`。密钥缺失时连接器 fail-closed、注册表显示 disabled、搜索不发请求；官方响应可能回显 `apikey`，实现已在共享缓存前去除该字段，同时从缓存键剔除 `wskey`。服务端 `/api/library/ingest` 显式拒绝 Europeana 导入。
- 更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md`、`LIBRARY_CONNECTORS.md`，记录官方 API/rights 文档、密钥申请方式与测试限制。无真实 Europeana API key，本轮未执行在线请求；离线 mock 不是在线可用性证明。
- 验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（23/23）、`npm run test:api`（85/85）及 `npm run build` 均通过。生产构建保留既有 Three.js 大 chunk 提示；未运行全站浏览器视觉回归或移动设备测试。
- 统一搜索卡片同步呈现来源的可用/禁用/失败状态与原因，并展示可用的资源类型、DOI/ISBN、访问和下载状态，避免缺 key 时误呈现为“无搜索结果”；本轮只做类型检查与构建验证，未执行浏览器视觉测试。


### WORLD LIBRARY Phase 4：免密钥学术发现（2026-11-04）

- 从已同步主线基线 `f160fa1825cbf2ac1f534bfec83767ef34110e4c` 开始，起始工作树干净；没有请求 API key，也没有修改用户书架或正式数据。新增 OpenAlex、Crossref、arXiv、Europe PMC 四个无需账号/密钥的官方查询适配器；Google Books 与 Europeana 继续缺 key 即 fail-closed。
- 四源加入注册表、默认统一搜索、服务端白名单和 `.env.example` 独立开关。搜索结果显示来源与官方记录页；在提供方明确返回可访问入口时，UI 另行展示经过 HTTPS 校验的官方全文入口。精确 DOI 去重继续复用。
- 权利安全：四个学术连接器均固定 `canImport: false`、不提供本地下载链接；全文复制/下载 connector 方法明确 `unsupported`；服务端 `/api/library/ingest` 独立拒绝四源导入（403）。开放获取只代表访问，不自动表示可再利用。arXiv 串行请求间隔至少 3 秒。
- 官方接口文档已在 `LIBRARY_CONNECTORS.md` 链接记录。新增离线 fixtures，并将四源加入可重复实时烟测脚本。
- 验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（25 项）、`npm run test:api`（85 项）、`npm run build`、`npm run test:library-connectors:live` 全部通过；实时搜索四源均返回记录。生产构建仍有非阻断的 Three.js 大 chunk 提示；未下载 EPUB 或复制受限全文。


### WORLD LIBRARY Phase 4 follow-up：PMC 与 DOAB（2026-11-04）

本段更新前面的 Phase 4 四源初始快照：新增 PubMed Central 独立来源，当前连接器总数为 12。PMC 使用官方 NCBI E-utilities `ESearch`/`ESummary`，无需 API key；搜索结果链接到 PMC 官方文章页，权利一律保守标记 `UNKNOWN`，全文/下载操作明确 unsupported，服务端入库继续返回 403。每个来源的请求队列串行且间隔至少一秒。尝试使用 NCBI 文档中的旧 `free fulltext[filter]` 示例时，当前在线端点返回 0 条，因此实现改用 PMC 书目检索，不再误称结果已通过该筛选；不会复制全文或推断单篇许可。

DOAB 官方资料确认其元数据为 CC0，并提供 OAI-PMH、公开元数据文件及 PRISM 接口；但 OAI-PMH 是分页记录收割，不是关键词搜索，当前目录 REST 候选接口返回 HTTP 403/429，故没有用未验证路由或批量抓取来冒充实时搜索。没有要求用户提供密钥或进行设置。详细官方来源与边界记录在 `LIBRARY_CONNECTORS.md`。

最终验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（27/27）、`npm run test:api`（85/85）、`npm run build` 和 `npm run test:library-connectors:live` 全部通过；真实限量烟测包含 PMC 且无需密钥。构建仍有既有 Three.js 大 chunk 非阻断提示；测试使用隔离临时数据，没有修改正式用户书架或图书数据。


### WORLD LIBRARY Phase 4 follow-up：PubMed 免密钥检索（2026-11-04）

- 新增 NCBI PubMed 官方 E-utilities 连接器（`db=pubmed`），作为 PMC（`db=pmc`）之外的独立书目索引接入。无需用户密钥/账号，默认参与统一搜索，支持一般关键词、作者、题名、PMID、PMCID 和 DOI 查询；结果标准化为 PubMed 官方记录链接、作者、期刊、年份、PMID 和 DOI。
- PubMed 与 PMC 共用 NCBI 的串行请求限速队列，避免两个连接器并行时超出同一服务的速率策略。PubMed 固定为 `METADATA_ONLY`，即使元数据带 PMCID 也不表示全文已确认；全文、下载和本地导入明确 unsupported / 403。用户可见权利提示还链接 NCBI/NLM 官方免责声明，并提醒摘要可能含受版权保护内容。跨库只按精确 DOI 去重。
- PubMed 加入来源注册、统一搜索、服务端白名单和导入拒绝、搜索卡片来源名称、`.env.example` 的 `EARTH_ONE_LIBRARY_PUBMED_ENABLED` 开关、离线 mock 与真实限量烟测。更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md` 和 `LIBRARY_CONNECTORS.md`；13 个来源保持此前全部功能与本地数据不变。
- 验证：`npm run lint` 与 `npm run test:library-connectors` 通过；隔离图书馆 API 29/29、通用 API 85/85、生产构建通过；限量在线烟测中的 PubMed、PMC、OpenAlex、Crossref、arXiv、Europe PMC 和既有书目来源均返回结果。生产构建仍报告既有 Three.js 大 chunk 提示。未下载论文或改动正式书架数据；未运行浏览器/移动端视觉回归。


### WORLD LIBRARY Phase 5：免密钥阿拉伯语馆藏（2026-11-04）
- 从干净并与远端同步的基线 `32db81455171108c3671d020ac39514ed6894107` 开始，保留所有现有连接器、图书、书架/阅读状态、批注与阅读器数据。
- 新增 Shamela 连接器，使用其[官方 MCP 指南](https://shamela.ws/mcp-guide/)发布的 `https://mcp.shamela.ws` 只读工具 `shamela_find`。无需 API key、Shamela 账号或用户设置，默认参与统一搜索且提供 `EARTH_ONE_LIBRARY_SHAMELA_ENABLED` 开关。为避免误匹配，仅对阿拉伯文查询请求该源；非阿语查询明确返回 `unsupported`，不做无依据的转译。
- MCP 返回可能含有原文的内容，但连接器只规范化书名、作者、书页编号和官方书页链接；响应不缓存、不持久化、不显示正文。权限状态保持 `UNKNOWN`，禁止本地全文导入/下载；连接器全文方法返回 `unsupported`，服务端 `/api/library/ingest` 独立返回 403。未使用 Shamela 的其他 MCP 工具。
- 在首页增加已核实的 [Waqfeya 图书目录](https://waqfeya.net/books)、[Shamela 搜索页](https://shamela.ws/search)和 [QDL 检索页](https://www.qdl.qa/en/search/site/)官方跳转。Waqfeya 与 QDL 未发现可核验的正式机器检索接口；不抓取或批量复制，仅提供官网入口。QDL 官网的“免费使用和复用”声明不替代具体条目权利核验。
- 验证通过：`npm run lint`、`npm run test:library-connectors`、`npm run test:library-api`（31/31）、`npm run test:api`（85/85）、`npm run build`、`npm run test:library-connectors:live`。真实在线测试通过 Shamela 阿语搜索并验证官方 URL、`UNKNOWN` 权利及不能导入。构建保留既有 Three.js 大 chunk 警告；未做浏览器视觉/手机回归，未下载或保存原文。
- GitHub 推送未执行：当前环境 `gh auth status` 显示未登录，且无可用的已授权 GitHub connector。未更换凭证、未修改认证配置、未推送。

### Phase 5 同步续接（2026-11-04）
- 续接执行时先查询 GitHub 仓库默认分支并确认 `main` 仍位于 `32db81455171108c3671d020ac39514ed6894107`，与未提交改动基线一致；没有重置或改写其他 worktree。
- 使用当时已授权的 GitHub 连接器进行普通提交和非强制推送，Phase 5 提交 `8bff41d04390d1a7f3e9366541fa12cfb1d020ae` 已由 GitHub API 确认出现在 `main`。未执行 `gh auth login`、未更改 Git 全局配置或账户凭证。

### WORLD LIBRARY Phase 6：OpenAlex 作者与机构发现（2026-11-04）
- OpenAlex 连接器新增显式查询语法 `author:<name>` 和 `institution:<name>`，分别请求官方 `/authors` 与 `/institutions` 搜索 API；原有不带前缀的学术作品搜索和 DOI 精确查询保持不变。只请求档案展示所需字段，并将 OpenAlex A/I ID 纳入安全校验后的详情读取。
- 作者档案映射 ORCID、计数和最近机构名称；机构档案映射类型、国家代码、作品/引用计数、官网及 ROR 标识。前端搜索提示标明前缀。作者和机构都固定为 `METADATA_ONLY`、`canImport=false`，没有全文下载或本地复制路径。
- 官方文档确认基础 HTTP API 可免费且无需账号或 key。限定实时请求对 `author:Carl Sagan` 和 `institution:University of Jordan` 返回官方档案；未使用任何用户密钥或进行批量查询。
- 离线回归覆盖端点与字段、官方档案链接、detail ID、空凭证和权限；`npm run lint`、`npm run test:library-connectors`、`npm run test:library-api`（31/31）、`npm run test:api`（85/85）、`npm run build` 与 `npm run test:library-connectors:live` 均通过。构建仍有既有 Three.js chunk 大小提示；未运行浏览器视觉/手机回归，未修改正式用户书架或图书数据。


### WORLD LIBRARY Phase 6：统一搜索、去重与版权识别（2026-11-04）
- DOI 规范化统一支持 DOI 标签、`doi.org`/`dx.doi.org` URL 和大小写变体；ISBN 只接受校验有效的 10/13 位编号，并将有效 ISBN-10 规范为对应的 978 ISBN-13。精确 provider ID 以来源命名空间隔离，不因不同数据库恰好使用相同 ID 而合并。
- 去重保留 edition 边界：相同 DOI/source ID 但两边有效 ISBN 集合无交集时拒绝合并；相似题名从不作为去重键。合并时保留原 ISBN 变体和备用官方来源链接。新建版次、错误校验位、来源 ID 碰撞及 DOI URL/大小写 fixture 并通过离线测试。
- Open Library edition `ebook_access=public` / `borrowable` 分别映射为 provider 公开阅读/可借阅状态，但清楚注明不是再利用许可；未知值不推断，所有 Open Library 结果仍禁止本地导入。Internet Archive 发现公版/开放许可与 “All rights reserved” / “In Copyright” 等冲突声明时归为 `UNKNOWN`，保守拒绝本地复制。
- 更新 `PROJECT_AUDIT.md`、`DEVELOPMENT_LOG.md`、`TEST_REPORT.md` 和 `LIBRARY_CONNECTORS.md`，依据 Open Library [Search API](https://openlibrary.org/dev/docs/api/search) 记录 edition 字段解释、边界和来源链接。没有请求或使用用户密钥；没有改变既有连接器接口、正式图书/书架数据或用户配置。
- 最终验证通过：`npm run lint`、`npm run test:library-connectors`、`npm run test:library-api`（31/31）、`npm run test:api`（85/85）、`npm run build`、`npm run test:library-connectors:live`。实时 smoke 保持限量免密钥；生产构建仍有既有 Three.js 大 chunk 提示。未运行浏览器视觉或实体移动设备回归。
### WORLD LIBRARY Phase 7：个人书架章节自动续读（2026-11-04）
- 先审计既有 `DigitalLibrary`、`EpubReader`、书架接口及 `DataStore`：保留章节阅读器、EPUB 阅读器、书架、进度、批注、路由及旧存储格式。本次选择一个明确缺口：已在个人书架中的文本书籍没有自动记录/恢复最近章节。
- 在已有 `BookShelfItem` 加入可选 `lastReadChapterId`，无需数据迁移；新增 `POST /api/library/shelf/:bookId/reading-state`，校验书目与章节、按当前会话用户更新最近章节、百分比和书架状态，并沿用现有原子磁盘保存。开始阅读时从“想读”转为“正在阅读”，达到 100% 时转为“已读完”。
- 文本阅读器章节变化后自动保存，重新打开时按稳定章节 ID 精确恢复；旧书架条目没有章节 ID 时由既有百分比估算恢复位置。书架的读取/新增/删除/续读请求携带已有登录令牌；用户切换时清空旧书架并忽略迟到响应，避免短暂显示旧账户数据。EPUB 和旧进度路由保留原样。
- 测试只使用临时隔离数据文件、应用合成种子书目和两个 `example.invalid` 合成账号；验证账户隔离、章节校验、书架状态与文件落盘，没有触碰真实用户数据，也不需要用户密钥或设置。
- 验证：`npm run lint`、`npm run test:library-connectors`、隔离 `npm run test:library-api`（37 项）、`npm run test:api`（85 项）和 `npm run build` 通过。构建仍有既有 Three.js 约 551.65 kB 的非阻断提示。未运行真实浏览器/手机交互测试，也未重跑外部连接器 live smoke（连接器未改动）。
- 限定范围：该增量只提供书架中文本书的章节级续读；未实现 EPUB CFI/页内续读、未入书架书籍的个人阅读历史或完整 Phase 7 其他验收项。


### WORLD LIBRARY Phase 7 follow-up：EPUB 书架续读（2026-11-04）
- 在原有 epub.js 阅读器中接入准确 CFI 恢复与阅读位置节流保存；用户继续保留既有目录、翻页、字号和全屏功能。位置以 `lastReadEpubCfi` 与既有进度保存到对应个人书架，读取前校验记录归属当前登录账户。
- 新增 `/api/library/shelf/:bookId/epub-reading-state`：只接受有效会话、与会话身份一致的账户 ID、存在的书、格式有效且不超过 2048 字符的 EPUB CFI、有限数值进度，以及属于该账户的书架条目。测试覆盖 401 未登录、403 账户不匹配、400 无效 CFI、双账户隔离和临时数据文件持久化。前端对位置变更做 600 ms 节流，关闭阅读器时冲刷最后一笔待保存状态；账户切换时旧回调不能写入新账户。
- 未替换章节阅读、未触及正式书籍/书架数据，不下载外部 EPUB、不修改任何连接器或用户/密钥设置；使用当前已有 GitHub 授权在前次续读提交后先快进同步 `4feddc60b6cd21ffdfd9e50cdef560a2aa0357a6`，无强推、无全局 Git 配置变更。
- 验证：`npm run lint` 通过；隔离图书馆 API 41/41；离线连接器测试通过；全站 API 85/85；生产构建通过（只有既有 Three.js 551.65 kB chunk 警告）。未做真实 EPUB 网络读取、浏览器视觉、实体手机或跨设备实机验证。


### WORLD LIBRARY Phase 8：正文核验式 AI 阅读与私有知识笔记（2026-11-04）
- 先审计 `DigitalLibrary`、`EpubReader`、`/api/ai/chat`、书籍详情与批注：旧章节 AI 把客户端选中文字直接送入通用聊天 API，缺少服务端正文匹配、版本引用和摘录/全文区分；自动收录器只保存元数据预览。保留通用 AI Hub、连接器、阅读器、书架进度及既有批注流程。
- 在 Book 类型新增 `textAvailability`（`full_text` / `excerpt` / `metadata_only` / `unknown`）。四本种子演示作品标为摘录，Open Library 自动收录预览标为 metadata-only；受权利校验后实际导入的章节正文才标为 full-text，只有 EPUB 文件而无服务端解析章节时标为 metadata-only。未标记的旧数据 fail-closed。
- 新增 `server/libraryReadingAi.ts`：从服务器章节正文中定位并映射规范化空白后的用户选文，只把命中的原文和相邻上下文（每侧最多约 1,200 字符）送给现有 AI 网关。服务端只用存储的书名/作者/来源/版本/章节形成引用；需要 HTTPS 来源页及 ISBN、出版者+年份或来源记录 ID。无法确认正文、选文、来源或版本时不调用模型；不接受客户端的书目字段或伪造页码。
- `DigitalLibrary` 使用专用 `/api/library/books/:id/ai-reading`，显示结构化来源引用与范围披露。全文记录也说明模型仅收到一段上下文、并未分析全书；摘录明确显示不是全书。成功生成且有引用的回答可用新接口保存为用户私有知识笔记；服务端要求有效登录、重新核验证据并按账户过滤返回。没有在此实现中添加新的模型提供商、付费 API、密钥或用户配置步骤；没有可用 AI 配置时诚实返回错误，不伪造生成结果。
- 回归新增 `scripts/test_library_reading_ai.ts` 和 `npm run test:library-reading-ai`，使用纯合成公开文本 fixture，不请求网络、不读写真实用户书架。隔离 API 测试增加正文不匹配/不可核引文/未知图书/未登录笔记拒绝用例。具体通过项与限制见 `TEST_REPORT.md`。
- 未改连接器实现或用户书架数据，未运行实时模型调用；EPUB 全文解析、真实浏览器/手机、真实账户间私有笔记展示及完整 Phase 8 仍需后续工作。


### WORLD LIBRARY Phase 8 follow-up：EPUB 正文证据路径审计（2026-11-04）
- 只读检查 `EpubReader`、Gutenberg 导入、EPUB 代理、AI 阅读 API 和 CFI 续读字段。结论：服务端只按允许主机流式代理 EPUB 到浏览器，epub.js 在浏览器解析；服务器没有抽取/持久化章节正文或核验 CFI 对应的版本。EPUB-only 记录为 `metadata_only` 且无 chapters；因此没有安全依据将 EPUB 选文送入 AI。
- 在 `resolveReadingEvidence` 中为 EPUB-only 记录增加 `EPUB_TEXT_UNAVAILABLE`（409）明确拒绝；即便错误携带全文标记/章节，也不会绕过 EPUB 格式保护。EpubReader 显示清楚说明：保留阅读和续读，AI 解读暂不支持，CFI/百分比不等于可引用章节/页码。现有已验证服务器文本的 AI 解读、来源引用、账户私有笔记、阅读器其余功能均保留。
- 测试仅用合成 EPUB 元数据和合成正文，不读取实际用户 EPUB/书架，不请求外部书源，不调用模型；未新增依赖、连接器、付费模型、API key 或配置。完整检查见 `TEST_REPORT.md`。


### WORLD LIBRARY Phase 9：安全移动适配与浏览器回归（2026-11-04）
- 从远端已同步的 `main`（`145d822`）继续，仅改图书馆页面与阅读器响应式/无障碍交互；没有改 API/连接器能力、存储模型、认证配置或任何真实用户书架数据。
- 补上手机端图书馆首页/书架/管理导航、堆叠品牌栏与搜索标签/状态播报；精选书和书卡可用键盘操作。空查询按钮禁用且处理器已有防空查询保护；搜索结果的来源状态、零结果、未知/受限/公版示例使用不同合成响应验证。导入、来源、全文与许可链接扩为至少 44px，外链新窗口使用 `noopener noreferrer`；书架筛选、返回、详情动作及官方馆藏快捷链接也扩大触控区。
- 文本阅读器窄屏工具栏换行；正文的触屏选区以 `pointerup` 保留现有 AI/批注流程。阅读器补模态语义、Escape 关闭、Tab 首尾循环、焦点返回、可命名控件；手机 AI/批注区域成为可关闭底部抽屉。EPUB 阅读工具栏适配手机，目录改窄屏覆盖抽屉，章节入口至少 44px，并保留 EPUB AI 当前明确拒绝的权利/正文定位说明。
- 使用 headless Chromium + 临时脚本 `/tmp/world_library_phase9_browser.py`，页面服务于本机 Vite；API 全部路由到合成桩，认证桩为未登录，外网拦截，EPUB 由本地合成文件代理。320/360/375/390px 的首页/搜索状态无横向溢出；书架筛选/返回与搜索结果交互目标均为 44px；320px 文本/EPUB 阅读、触屏批注抽屉、目录、Escape/Tab 焦点循环与返回通过；`PAGE_ERRORS=[]`。测试没有访问/写入真实书架、外部源、模型或真实 EPUB。
- 验证：`npm run lint`、`npm run build`、隔离 `npm run test:library-api`（45/45）、合成 `npm run test:library-reading-ai`（19/19）、`npm run test:library-connectors`、`npm run test:api`（85/85）通过。既有 Three.js 551.65 kB 构建提示仍为非阻断。真机/真实登录或账户、实时连接器和真实 EPUB 仍未覆盖。


### WORLD LIBRARY Phase 8/9 follow-up：EPUB AI 保持不可用，收紧读取边界（2026-11-04）

- 复核 Gutenberg 导入后发现：权利在 OPDS 入库时重新核验，但记录没有绑定下载 EPUB 的哈希/版次、OPF spine、章节正文哈希或 CFI-to-spine 映射。因此不增加 AI 抽取路径，继续保留 `409 EPUB_TEXT_UNAVAILABLE`；浏览器 EPUB 阅读和书架续读行为保持可用。
- 阅读器提示补充来源版本、正文、CFI 均未建立可核验关联；明确公版/开放许可标记和续读 CFI 不是 AI 证据；有服务器核验 TXT/正文版本时可改用该版本解读。文本书既有 AI 路径未改。
- 新增 `server/libraryEpubSecurity.ts`：EPUB 代理最大 64 MiB；流式中检查大小并拒绝缺失/截断/非 ZIP local-file 头；服务端 `fetch` 禁止自动重定向，并对每跳重新检查 HTTPS、凭据和获准来源主机，限制跳转次数。此处仅做有界代理/ZIP 前缀检查，不解析、解包、提取或净化 EPUB。
- 续读 API 复用 epub.js CFI parser 校验语法结构、数字偏移和 2048 字符上限；进度范围限制为 0–100%。这是续读输入校验，不是与书籍版次的定位核验；现有会话、用户 ID 和书架归属校验保留。
- 新增本地合成 EPUB `scripts/fixtures/synthetic-world-library.epub`、离线安全回归 `scripts/test_library_epub_security.ts` 和 `test:library-epub-security` 命令。没有添加 npm 依赖、密钥或用户设置。
- 更新 `PROJECT_AUDIT.md`、`TEST_REPORT.md`、`LIBRARY_CONNECTORS.md`。未下载真实 EPUB、访问用户书架/笔记或调用模型；未来服务端解析仍需在版本哈希、解压安全、HTML/XHTML 内容与真实 CFI-to-spine 映射完成后再单独评估。

### WORLD LIBRARY Phase 7/9 follow-up：跨进程重启续读回归（2026-11-04）
- 扩展 `scripts/test_library_api.ts`：测试服务可在相同隔离 `EARTH_ONE_DATA_FILE` 上停止并重新启动，重启时使用新的随机本机端口；临时目录仍由 `finally` 清理。
- 使用两个 `example.invalid` 合成账户及同一本合成书目验证账户隔离。账户 A 保存 `lastReadChapterId`、`lastReadEpubCfi` 和 63% 进度后，服务进程重启；新的 HTTP 请求使用原账户令牌分别读取两份书架，A 恢复完整续读状态，B 仍无章节/CFI 且进度为 0。没有改 API、数据结构或实际存储实现。
- `npm run test:library-api`：49/49 通过；`npm run lint`：通过。未运行全站 API/构建/外部连接器 smoke；本次不访问外部资源、模型或真实用户书架/笔记，不下载 EPUB，也不改配置。
- 此测试覆盖服务端 JSON 跨进程持久化和账户级隔离，不等于实体设备、真实账户或跨部署同步验收。CFI 仅经语法和范围校验，EPUB AI 仍 fail-closed。

### WORLD LIBRARY follow-up：外部来源故障隔离（2026-11-04）
- 复核统一搜索后发现聚合器用 `Promise.all` 直接等待各来源；连接器意外拒绝 Promise 会中断整个搜索并触发 API 502，即使其他免费来源可正常返回。现在在每个连接器的聚合边界捕获拒绝，并仅把该来源标为 `error`（数量为 0，保留异常原因），不中止其余来源。
- 新增 `scripts/test_library_connector_isolation.ts` 与 `npm run test:library-connector-isolation`。离线 mock 覆盖 Open Library 超时、Internet Archive 403、Crossref 429、Europe PMC 成功归一化、Gutenberg 显式禁用/不请求，以及连接器意外拒绝时继续聚合其他免费来源。
- 验证通过：连接器隔离测试、既有离线连接器测试、`npm run lint`、图书馆 API（49/49）、全站 API（85/85）和生产构建。构建只有既有 Three.js 551.65 kB chunk 非阻断提示。没有运行 live smoke、没有真实外部请求、没有使用/索取 API key 或触及真实用户数据。

- 同步基线：提交前发现 `origin/main` 已从 `1b34b9f` 前进至 `88945ce`；远端仅改 `server/bookHarvester.ts`，与本轮文件无交叉，已先普通快进。随后隔离测试、离线连接器、类型检查、图书馆 API 49/49、全站 API 85/85 与 build 均在最新基线上重跑通过。
