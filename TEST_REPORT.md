# EARTH ONE — 测试报告（TEST REPORT）

更新：2026-11-04

## 本次数据层迁移测试

| # | 测试项 | 结果 |
|---|---|---|
| 1 | `npx tsc --noEmit` | ✅ 通过（0 错误） |
| 2 | `npm run build`（vite build） | ✅ 成功 |
| 3 | 迁移：旧 `server_data.json`（含全文 3.6MB）→ 启动后自动抽离 | ✅ 45 本书全文抽到 `server_data/books/` |
| 4 | 主存储瘦身 | ✅ 3.6MB → 225KB |
| 5 | 列表接口 `/api/library/books` 返回元数据 | ✅ 30KB，章节 `content` 为空 |
| 6 | 详情接口 `/api/library/books/:id` 返回完整正文 | ✅ 《تفسير القرطبي》30 章，首章 22336 字符 |
| 7 | 删除书籍同步删除内容文件 | ✅ 5 本测试书删除成功 |
| 8 | 服务启动 + 定时采集 | ✅ 正常启动，采集器运行 |

## 回归（此前已通过）

- 书籍全文分章：《傲慢与偏见》61 章、《تفسير القرطبي》30 章。
- 知识宇宙搜索 / 节点详情 / 全局搜索：返回真实数据。
- 阿拉伯语维基文库 + Internet Archive 书源：搜索与入库正常。

## 已知问题 / 待办

- 视频中心无真实转码（演示就绪）。
- 聊天为轮询，非 WebSocket。
- 密码哈希仍为 SHA-256 + 盐（待升级）。
- 列表/详情分离后需在真机确认阅读历史与书架交互。

## 安全加固测试（2026-11-04）

| 项 | 结果 |
|---|---|
| 种子账号登录（password123） | ✅ 成功 |
| 错误密码 | ✅ 401 |
| 旧 SHA-256 哈希透明升级 scrypt | ✅ 已迁移 |
| tsc --noEmit | ✅ 通过 |


## WORLD LIBRARY 外部连接器测试（2026-11-04）

| 测试 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript 全项目检查通过（新增 OPDS 命名空间语言解析、连接器和测试脚本均通过）。 |
| `npm run test:library-connectors` | ✅ 离线适配器回归通过：Open Library 元数据只读和 unsupported 能力、Gutenberg OPDS 查询/单书 TXT·EPUB 链接/命名空间语言字段、Internet Archive 未知权利拒绝与开放许可 OCR 样例、权利开关、精确 ISBN 合并及相似书名不误合并。所有外部请求由测试内 mock 拦截。 |
| `npm run test:library-api` | ✅ 20 项通过、0 失败：隔离临时 JSON 与本地 Express 仅验证来源目录/开关、关闭源搜索、空查询/未知源、Open Library 元数据入库拒绝、禁用源入库拒绝和既有本地图书接口；未触碰正式数据。 |
| `npm run test:library-connectors:live` | ✅ 真实官方连通性通过：Open Library 与 Internet Archive 各一次限量只读搜索；Gutenberg 官方 OPDS 搜索、单书 OPDS 二次验证、临时书目入库与本地详情读取通过。只校验 EPUB URL，未下载 EPUB 全文；数据写入隔离临时存储并自动清理。需要联网，属于可选 live smoke。 |
| `npm run build` | ✅ Vite 生产构建成功；原有 `three.module` 约 551.65 KB 分块提示仍存在，未为消除提示而删改 3D 功能。 |

### 本轮未覆盖

此前 Phase 1/2 未验证 Google Books；该连接器已在下方 Phase 3 完成离线/API 回归，但仍因缺少密钥而未做在线 smoke。Europeana 本阶段已通过离线/API 回归，但因未配置密钥没有在线 smoke。全项目全量浏览器/实体移动设备回归、Open Library 借阅可用性（适配器明确返回 unsupported）、学术数据库/阿拉伯语专项数字馆藏与跨设备真实用户书架尚未覆盖；也未通过 IA 借阅接口尝试借阅或下载受限制内容。限量实时检查仅证明当时对应官方搜索端点可返回记录，不保证外部服务长期可用。


UI 补充：搜索结果显示逐源状态/禁用原因、资源类型、DOI/ISBN、阅读/下载状态和 rights note；仅对有效 HTTPS 许可地址提供链接，导入动作仅在 `canImport === true` 时出现，服务端另行复核。`npm run lint` 与 `npm run build` 覆盖编译；本轮没有新增浏览器视觉/交互断言，故不将该 UI 标记为浏览器验收通过。


## WORLD LIBRARY Phase 3：Google Books 回归（2026-11-04）

| 测试 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript 全项目检查通过。 |
| `npm run test:library-connectors` | ✅ 通过；所有网络由 mock 拦截。覆盖 Google Books 元数据字段、ISBN 与 `author:` 搜索、公共领域/预览/仅元数据分类、地区说明、HTTP 封面链接升级到 HTTPS、Google 官方书籍/预览链接、下载格式 gating、无密钥不发请求，以及不支持全文/本地导入；既有来源用例一并通过。 |
| `npm run test:library-api` | ✅ 21 项通过、0 失败；隔离临时存储验证六源目录、启用状态以及 Google Books 不能本地全文入库。 |
| `npm run build` | ✅ Vite 生产构建成功；保留既有 Three.js 大 chunk 提示。 |
| Google Books 在线 API | ⏸️ 未执行：本环境未配置 `GOOGLE_BOOKS_API_KEY`。不把 mock 回归描述成真实 API 连通性证明。 |

配置完成后可另行运行带密钥的限量只读 smoke。当前无实时请求、无正式用户数据写入；Google Books 文本仍留在官方阅读器，测试没有下载任何书籍正文。旧测试报告中的 20 项为此前阶段的基线，本阶段新增隔离 API 回归计数为 21 项。

## WORLD LIBRARY Phase 3：Europeana 回归（2026-11-04）

| 测试 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript 全项目检查通过。 |
| `npm run test:library-connectors` | ✅ 离线 mock 通过；覆盖搜索与 `author:` 字段、Search/Record API 字段映射、PDM/CC0、CC BY、CC BY-NC、InC、未知/冲突 rights、缩略图域名与许可门控、详情、明确 unsupported 的全文/下载、ISBN 去重、无 key 不发请求；外部请求全部被拦截。 |
| `npm run test:library-api` | ✅ 23 项通过、0 失败；临时存储下验证七源目录、Europeana 缺 key 时 disabled、搜索不发外部请求和导入返回 503。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；既有 Three.js 大 chunk 提示仍存在。 |
| Europeana 在线 API | ⏸️ 未执行：没有配置 `EUROPEANA_API_KEY`。官方接口资料与离线 fixtures 已核验，但不把 mock 结果描述为在线连通证明。 |

Europeana 当前仅可在服务器配置真实 API key 后启用；本地无密钥时 fail-closed。未进行新增浏览器视觉/交互或移动端测试；未修改正式用户数据，也未下载或复制任何 Europeana 图片/全文。


## WORLD LIBRARY Phase 4：免密钥学术连接器回归（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线 mock 通过，覆盖 OpenAlex、Crossref、arXiv、Europe PMC 字段、官方链接、权利状态、无密钥查询、unsupported 全文/下载和 DOI 精确去重。 |
| `npm run test:library-api` | ✅ 25 项通过；临时隔离存储验证 11 个来源注册、新来源白名单、无密钥启用状态和学术论文入库 403 拒绝。 |
| `npm run test:api` | ✅ 85 项通过。 |
| `npm run build` | ✅ Vite 生产构建成功；保留既有非阻断 Three.js chunk >500 kB 提示。 |
| `npm run test:library-connectors:live` | ✅ 实时限量烟测通过；OpenAlex、Crossref、arXiv、Europe PMC 均返回记录，同时既有 Open Library、Internet Archive 和 Gutenberg 检查通过。 |

真实查询仅证明烟测当时各搜索端点可返回结果，不代表目录完整或每篇文章均有全文入口。Europe PMC 只有具体记录同时满足开放获取和有效 PMCID 条件时才提供官方全文页；示例查询可能仅返回元数据。未下载 EPUB，也未复制受限全文或改动正式图书数据。


## WORLD LIBRARY Phase 4 follow-up：PMC / DOAB（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线 mock 通过；覆盖 PMC ESearch/ESummary 映射、无密钥请求、官方文章页链接、`UNKNOWN` 权利分类及禁止本地复制。 |
| `npm run test:library-api` | ✅ 27 项通过、0 失败；临时隔离存储验证 12 个注册来源、7 个启用来源、PMC 白名单及全文入库 403。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；既有 Three.js >500 kB chunk 提示仍存在且不阻断。 |
| `npm run test:library-connectors:live` | ✅ 限量实时烟测通过；OpenAlex、Crossref、arXiv、Europe PMC、PMC 均返回真实记录，旧 Open Library、Internet Archive 和 Gutenberg 检查也通过。PMC 未使用 API key。 |
| DOAB 关键词搜索 | ⚠️ 未接入：官方资料确认元数据开放且提供 OAI-PMH，但其分页收割不等同关键词搜索；当前环境候选目录 REST 路径返回 HTTP 403/429，未改用批量抓取或未验证接口。 |

PMC 的当前实时搜索不依赖 NCBI 文档里一个在本环境返回 0 条的旧 `free fulltext[filter]` 查询示例；适配器因此将 PMC 项目权利保守标为 `UNKNOWN`，只提供官方文章页，并禁止全文下载/本地导入。实时结果不代表每篇文章均有相同阅读权限或再利用许可。所有自动化测试使用 mock 或临时隔离存储，未修改正式图书数据，也未下载或复制论文全文。


## WORLD LIBRARY Phase 4 follow-up：PubMed（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ 全项目 TypeScript 检查通过。 |
| `npm run test:library-connectors` | ✅ 离线 mock 通过；覆盖 PubMed ESearch/ESummary 书目字段、作者/PMID/PMCID/DOI 查询、无密钥请求、官方 PubMed 链接、NCBI/NLM 免责声明权利提示、`METADATA_ONLY` 权利、明确 unsupported 全文/下载，以及跨 OpenAlex/Crossref/PubMed 的精确 DOI 去重。 |
| `npm run test:library-api` | ✅ 29 项通过、0 失败；隔离数据验证 13 个注册来源、8 个启用来源、PubMed 白名单和全文导入 403。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；既有 Three.js chunk >500 kB 提示仍存在且不阻断。 |
| `npm run test:library-connectors:live` | ✅ 限量真实烟测通过；PubMed 返回真实记录，并用该记录的 DOI 回查到同一篇文章；既有 Open Library、Internet Archive、Project Gutenberg、OpenAlex、Crossref、arXiv、Europe PMC、PMC 检查也通过。 |

PubMed 与 PMC 使用同一串行 NCBI 请求队列。在线烟测只证明本次受限查询可从官方端点返回书目记录，不代表 PubMed 记录拥有全文或复用许可。没有下载或复制论文，也没有触碰正式书架/图书数据；本轮未做浏览器视觉或移动设备回归。


## WORLD LIBRARY Phase 5：阿拉伯语连接器与入口回归（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线测试通过；Shamela 测试覆盖 MCP `tools/call`、阿语查询、非阿语不发请求、同书多页归并、正文/预览不泄漏、`UNKNOWN` 权利、官方页 URL、无全文/下载及来源认证为 none。 |
| `npm run test:library-api` | ✅ 31 项通过；隔离存储核验 14 个来源、9 个启用来源、Shamela allowlist 和全文导入 403。 |
| `npm run test:api` | ✅ 85 项通过。 |
| `npm run build` | ✅ Vite 生产构建成功；保留既有 Three.js >500 kB chunk 非阻断提示。 |
| `npm run test:library-connectors:live` | ✅ 限量实时 smoke 通过；Shamela 官方 MCP 的阿语搜索返回记录，官方页域名与路径有效，权利仍为 `UNKNOWN` 且不能导入；既有 Open Library、Internet Archive、Gutenberg、OpenAlex、Crossref、arXiv、Europe PMC、PMC 与 PubMed 检查也通过。 |

Waqfeya 与 Qatar Digital Library 只验证官网和官方检索/目录页面，不自动查询、抓取或复制馆藏。自动化 API 测试使用临时隔离数据；在线 Shamela 请求只处理短暂搜索响应并仅向 API 输出书目与官方链接，没有保存或显示全文。未运行浏览器视觉、移动设备或全站人工 UI 回归。前次运行环境没有授权写入路径，故当时未推送；续接时确认 GitHub `main` 仍处于原始基线，并通过既有授权连接器普通推送 Phase 5 提交 `8bff41d04390d1a7f3e9366541fa12cfb1d020ae`，随后由 GitHub API 核验远端一致。未更换或新增认证配置。


## WORLD LIBRARY Phase 6：OpenAlex 作者与机构搜索回归（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线连接器测试通过；OpenAlex 覆盖普通作品检索、`author:` 与 `institution:` 路由、所需字段选择、官方档案 URL、A/I ID 详情查询、无 API key、`METADATA_ONLY` 与全文/下载/导入关闭。 |
| `npm run test:library-api` | ✅ 31 项通过、0 失败。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；仍有既有 Three.js chunk >500 kB 非阻断提示。 |
| `npm run test:library-connectors:live` | ✅ 限量真实 smoke 通过；OpenAlex `author:Carl Sagan` 与 `institution:University of Jordan` 均返回官方资料页，权限仍是仅元数据且不能导入；既有书目/学术连接器和 Shamela 检查也通过。 |

OpenAlex 官方说明基础 API 可免费且无需账号或 key。本次仅进行有界查询，没有复制全文或触碰正式图书/书架数据。未做浏览器视觉、移动设备或全站人工 UI 回归。


## WORLD LIBRARY Phase 6：统一搜索、去重与版权识别（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线回归通过：Open Library `public` / `borrowable` / unknown 状态、`canImport=false`、Internet Archive 公版/许可与限制语句冲突回退 `UNKNOWN`。 |
| 精确身份去重回归 | ✅ 覆盖 DOI URL/大小写规范化、ISBN-10→等价 ISBN-13、无效 ISBN 校验位、同一 source ID 重复、跨来源相同 raw ID、相同题名不同 ISBN、相同 work ID 但 ISBN 不相交的独立版次；标题相似不触发合并。 |
| `npm run test:library-api` | ✅ 31 项通过、0 失败。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；原有 Three.js 大 chunk（约 551.65 kB）提示仍为非阻断警告。 |
| `npm run test:library-connectors:live` | ✅ 限量官方来源 smoke 通过：Open Library、Internet Archive、OpenAlex、Crossref、arXiv、Europe PMC、PMC、PubMed、OpenAlex 作者/机构档案、Shamela 阿语检索及 Gutenberg 官方 OPDS 链路。未下载 EPUB/论文全文。 |

版权提示仍以来源条目为准：Open Library `ebook_access` 是服务访问状态而非再利用许可；所有 Open Library 记录均不可本地导入。冲突权利声明 fail-closed；未知来源状态保持未知。测试使用 mock 或隔离临时数据，没有改动正式图书/书架数据。本轮未做浏览器视觉、实体手机或全站人工 UI 回归。


## WORLD LIBRARY Phase 7：个人书架章节续读回归（2026-11-04）
| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript `--noEmit` 通过。 |
| `npm run test:library-connectors` | ✅ 离线 connector 回归通过；Phase 7 未修改来源适配器。 |
| `npm run test:library-api` | ✅ 37 项通过；临时隔离服务验证两个合成账户、同书不同书架、章节归属校验、续读章节/进度保存、账户间不可见及 JSON 文件落盘。 |
| `npm run test:api` | ✅ 85 项通过、0 失败。 |
| `npm run build` | ✅ Vite 生产构建成功；既有 Three.js 551.65 kB chunk >500 kB 提示不阻断。 |
| 外部 live connector smoke | ⏸️ 本阶段未重跑：连接器代码未改动；不把此前 smoke 结果当作本阶段测试。 |
| 浏览器视觉/交互与实体手机 | ⏸️ 未运行。 |
本阶段仅使用临时测试 JSON、合成账号及测试服务器，未读取或修改正式用户书架或真实图书数据。旧书架记录没有章节 ID 时使用百分比估算；EPUB 页内位置和未入书架的个人阅读历史不在本次范围内。


## WORLD LIBRARY Phase 7 follow-up：EPUB 个人续读（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run lint` | ✅ TypeScript 全项目检查通过。 |
| `npm run test:library-api` | ✅ 41 项通过；使用隔离临时数据/合成账户，覆盖 EPUB CFI 保存、畸形 CFI 拒绝、未登录 401、账户 ID 与会话不匹配时 403、两账户进度隔离及数据文件持久化。 |
| `npm run test:library-connectors` | ✅ 离线连接器回归通过；本次未修改任何连接器。 |
| `npm run test:api` | ✅ 85 项通过。 |
| `npm run build` | ✅ 生产构建成功；保留既有 Three.js 551.65 kB 分块提示。 |

### 本轮边界

阅读器的恢复/节流保存由代码构建及 API 合约测试覆盖；没有下载或请求真实 EPUB，没有浏览器视觉、实体手机或两台设备实机验收。服务端已有 JSON 持久化可供同账户后续会话读取，但不把隔离 API 测试描述成真实跨设备验收。未写入正式账户数据，也无需 API key 或额外配置。
