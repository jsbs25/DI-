# EARTH ONE 开发进度

更新时间：2026-11-04
仓库：`https://github.com/jsbs25/DI-`
分支：`main` / `origin/main`；本轮续作基线 `78a8605`，更早阶段以 Git 提交历史为准；当前实现、验证与阻塞见下。

## 本轮已完成

1. 检查仓库状态：以 `/workspace/DI-review` 为最新主副本；开始时工作区干净，`main` 与 `origin/main` 同步。较旧的 `/workspace/di-review` 未修改。
2. 基线 `npm run lint` 与 `npm run build` 均通过。构建仍提示主 JavaScript chunk 大于 500 KB，当前最大 chunk 约 1.16 MB（gzip 约 306 KB）。
3. 修复测试数据污染风险：`server/store.ts` 支持 `EARTH_ONE_DATA_FILE` 覆盖数据文件；`scripts/test_earth_one.ts` 在临时目录运行并于成功/失败后清理。
4. 修复公开用户资料隐私：用户列表、资料页和全局搜索改用白名单序列化，排除邮箱及内部 onboarding 状态；关闭位置公开时不返回真实坐标。
5. 使用临时数据库启动真实 Express 实例，验证三种公开响应的邮箱/坐标脱敏。
6. 为 onboarding、资料更新和位置隐私开关要求有效会话；位置隐私开关变更会原子写入持久存储。
7. 新增 `npm run test:api`：自动启动临时 Express 实例，覆盖身份会话、未授权身份写操作和公开资料隐私。
8. 澄清测试范围：存储层完整性套件与 HTTP 套件分别验证各自范围；两者都不是浏览器端到端测试。
9. 更新 README 与 CHANGELOG；新增持续任务队列、功能保护清单和回归测试说明。
10. 扩展隔离式 HTTP 回归：覆盖动态发布/筛选/点赞/评论、图书检索与详情、书架进度、浏览器书签及爬虫任务排队；基线 51 项断言。未运行私信访问控制或管理授权变更，也未触发网络抓取。
11. 将 13 个导航模块切换为 React 按需加载，给主视图增加可访问的加载状态；保持导航、模块 props 和业务实现不变。
12. 在生产构建预览与隔离临时 API 存储下完成有界桌面 smoke：地球、动态列表、图书馆详情、宇宙引擎、地球遥测选择和返回地球。测试未使用真实账号或触发外部 AI/抓取。
13. 调整宇宙遥测抽屉在桌面断点的上沿至 `md:top-28`，避开全局导航下方的天体选择栏；窄屏 `top-18` 保持不变。
14. 新增项目自有 `public/favicon.svg` 与多尺寸 `public/favicon.ico`，并在 HTML 入口引用；生产预览中两种 URL 均返回 200。
15. 将 HTTP API 回归扩展至 64 项：覆盖文章/视频列表、文章缺字段校验、知识图谱搜索、类别/国家筛选、节点详情和 404；不写入文章内容、不抓取或请求外部媒体。
16. 追加社区、游戏房间、广告三个只读列表 API 契约断言，当前 HTTP 回归共 67 项；未执行加入、创建、点击或其他写操作。
17. 桌面视觉复测发现 `md:top-28` 仍与天体栏外框重叠 7px，进一步调整为 `md:top-32`。1274×649 视口实测净距 9px；抽屉打开时选择地球并返回数字地球通过，所测路径无控制台错误。
18. 390×844 iframe 已显示窄屏地球首屏和导航；语言点击准备超时，同标签重连成功但原操作结果仍未确认，未重放，不将 RTL 或窄屏宇宙交互计为通过。
19. 修复总览指标挤压的布局结构：三列指标、波形独立行、响应式字号、可换行标签和逻辑方向边框；保留全部数值、翻译、交互及波形原有小屏断点。浏览器视觉复测待做。
20. 新增 `npm run test:globe`，六语言静态渲染 24 项通过；只验证内容与结构契约，不触发 WebGL、effect 或 API，不冒充 RTL/浏览器实测。
21. 为遥测图标关闭按钮补充双语可访问名称、提示和非提交类型，原 `onClose` 不变。新增 `npm run test:universe`，地球/土星/空选择共 9 项静态断言通过；读屏、键盘和实际关闭交互仍待实测。
22. HTTP API 回归从 67 项扩展到 73 项：覆盖 `/api/globe/countries`、`/api/globe/stats`、`/api/ai/models`、`/api/ai/stats`、`/api/crawler/pages` 与 `/api/browser/saved-articles` 的只读响应；不触发 AI、网络抓取或写操作。
23. 在系统 Chromium 中对独立临时生产构建进行限定视觉回归：桌面中文、阿拉伯语 RTL 与 390×844 中文窄屏下，总览三列指标边界互不重叠，页面无水平溢出；语言菜单真实切换方向成功。
24. 同一隔离浏览器通过首页“我们的银河”进入宇宙引擎，再用返回控件回到地球；两页均挂载 canvas，所测路径无运行时异常。Chromium 使用 SwiftShader，结论限于 DOM/模块挂载，不代表真实 GPU 画质或性能。
25. 采集首次首页脚本响应：Three.js 551,943 bytes、首页入口 316,969 bytes、DigitalGlobe 72,209 bytes；独立构建的 gzip 估算分别约 137.29 KB、97.92 KB、18.06 KB。由于首页本身是 3D 地球，Three.js 仍在首次导航载入；尚未改动生命周期复杂的场景初始化。
26. 扩展隔离生产 Chromium 回归：实际切换阿拉伯语 RTL 后测试移动导航可达的 12 个模块；在 390×844 下页面宽度均等于视口。额外验证 AI HUB/网页浏览器在 1274×649 RTL 桌面和 390×844 中文窄屏，并从地球侧栏打开桌面 Crawler 仪表盘；所有 18 个视口/模块样本均无页面级横向溢出。
27. 修复 AI HUB 模型选择状态栏与网页浏览器 flex 面板的窄屏内在最小宽度问题；所有原控件、内容与导航保留。视觉回归仅检查导航和展示，不调用真实 AI、外部搜索或表单写入。
28. `scripts/test_api.ts` 新增五项无副作用 GET 契约：地球节点列表集合、图书详情标注集合、未知图书的结构化 404、Crawler 任务列表集合、未知公开资料的结构化 404；HTTP 回归现为 78 项，未访问私信边界或外部搜索/代理。
29. Crawler 仅从地球侧栏打开桌面仪表盘；挂载时的任务/页面 GET 通过隔离临时 API 响应。未点击新建、运行、通过/拒绝等写操作；抓取执行与内容审核仍未验证。
30. 将地球侧栏现有 Crawler 标签加入六语言字典，并以阿拉伯语 RTL 实际打开该菜单项；六语言静态回归增加六项非空标签检查，现为 30 项通过，未新增入口或采集操作。
31. 单次隔离生产 Chromium Resource Timing 观测到首屏 7 个 JS 资源 encoded body 共 253,077 B、decoded 942,755 B，CSS 共 16,324/112,399 B；Three.js 单块为 136,323/551,656 B。其余 12 个页面块在首次导航后才下载，CrawlerDashboard 为 4,849/17,678 B。该值是模拟器单次本地资源快照，不计响应头，也不是网络带宽或实机性能测试。
32. 没有继续延迟 Three.js：当前首页默认显示交互式 3D 地球，先占位或要求点击会改变行为；未经明确产品取舍，不改默认首屏或场景生命周期。
33. 范围更正：浏览器会话的 App 启动自动 GET `/api/conversations`；切换到 Messenger 后，合成 `conv_global` 会使组件 GET `/api/conversations/conv_global/messages`。图书馆和网页浏览器挂载也 GET 了临时服务的书架、书签与保存文章列表。它们只访问临时 DataStore 的合成种子/空集合，没有正式用户数据或既有服务；这些读取并未作为权限测试或断言。
34. 延续普通 API 回归覆盖：为本地 `/api/library/books` 增加哲学类别筛选与无匹配类别空集合两项契约断言。`npm run test:api` 曾为 80 项通过、0 失败，`npm run lint` 通过；测试使用脚本创建并清理的临时 JSON，不访问外部服务、私信读取路径或正式数据。随后位置隐私回归增至 82 项（见第 35 项）。相关变更已通过现有授权连接器快进推送，fetch 核验本地与远端一致，未修改账户设置。
35. 再补两项位置分享回归：有效会话打开位置分享后，`GET /api/globe/nodes` 会返回该用户及数值坐标；关闭分享后节点消失。当前 `npm run test:api` 为 82 项通过、0 失败，`npm run lint` 通过；仅使用隔离临时存储和本地请求，不调整权限策略或生产路由。
36. 增加社交列表 GET 排序契约：刚创建的测试动态应排在 `/api/posts?feed=latest` 首位。当前 API 回归为 83 项通过、0 失败；本次完整复核 `npm run lint`、`npm run test:globe`（30 项）、`npm run test:universe`（9 项）、`npx tsx scripts/test_earth_one.ts`（44 项）及 `npm run build` 均通过。生产构建保留既有 551.65 KB Three.js chunk 警告，未为规避警告改变地球/宇宙行为；所有 API 测试用临时数据。
37. 为地球国家目录增加两项只读 HTTP 回归：验证约旦英文/本地化名称与坐标字段，以及 `/api/globe/stats` 国家总数与 `/api/globe/countries` 目录长度一致。`npm run lint` 通过；仅在临时 JSON 服务上定向请求这两个 GET，结果通过（12 个国家、约旦元数据存在、统计数量一致）。完整 `test:api` 未重跑，因为现有全量脚本包含待用户批准的会话读取测试；未请求会话/消息端点。
38. 将上一轮手动定向 smoke 固化为 `npm run test:globe-api` 独立脚本：国家目录非空、国家代码唯一且格式合理、名称/坐标字段与边界有效、约旦本地化元数据正确、统计结构和目录数量一致；脚本白名单只含 `/api/globe/countries`、`/api/globe/stats` 两个 GET 接口，使用独立临时 JSON 并关闭后台书籍采集。本轮 7 项通过，`npm run lint` 通过；没有运行完整 API 套件。
39. 新增 `npm run test:ai-api`，为 `/api/ai/models` 与 `/api/ai/stats` 建立独立 GET-only 回归；使用临时 JSON、在测试子进程清空模型密钥并关闭后台采集，检查元数据结构、模型 ID 唯一性、未配置掩码和统计汇总。9 项通过；`npm run lint` 与 `npm run test:globe-api`（7 项）通过。未调用模型或会话/消息路由，未运行包含待批准读取路径的完整 `test:api`。
40. 静态巡检确认六种支持语言各有 104 个非空翻译值；新增 `npm run test:i18n`，检查支持语言集合、字典键一致性与非空值，共 13 项通过。`npm run lint` 与 `npm run test:globe`（30 项）通过。此测试不证明翻译质量、RTL 几何或浏览器交互。
41. 新增 `npm run test:knowledge-api` 独立 GET-only 回归：11 项通过，逐一验证 33 个知识节点详情的边与关联书籍一致，并检查节点唯一性/完整性、Avicenna 别名搜索、类别与国家筛选及未知节点结构化 404。服务器使用自动清理的临时 JSON，禁用模型密钥和后台采集，请求严格限制于 `/api/knowledge/nodes`、目录节点详情与两种本地搜索契约；未触及会话/消息路径、外部服务、正式数据或既有服务。与该套件同时复核的 `npm run test:globe-api`（7 项）、`test:ai-api`（9 项）、`test:i18n`（13 项）及 `npm run lint` 均通过；没有运行完整 `test:api` 或前端构建。GitHub 内置连接器已启用，但当前运行时没有其 CLI/credential helper，系统 `gh` 未登录；本次本地提交，待现有授权入口可用后再快进同步，未使用仓库内强制推送脚本。
42. 新增 `npm run test:library-api`，以随机本地端口和自动清理的临时 JSON 只读验证本地图书目录、核心字段/ID 唯一性、哲学类别过滤、未知类别空集合、Plato 标题/作者搜索、`book_republic` 详情章节结构及未知图书结构化 404；12 项通过，`npm run lint` 通过。请求严格限制为图书目录和单本详情 GET；未调用外部图书搜索、书架、写操作、会话/消息路由，未访问正式数据或既有服务。未运行完整 `test:api`、生产构建或浏览器测试；GitHub 同步仍受当前运行时缺少已授权 CLI/credential helper 阻塞。
43. 新增 `npm run test:crawler-api` 独立 GET-only 契约：使用随机本地端口、临时 JSON，严格请求任务和采集页列表；12 项通过，验证字段/ID 唯一、任务关联、日期/状态结构及保留 pending-review 状态。首次运行暴露测试自己的启动重试计数假设过严，调整为只验证端点白名单及方法后重跑通过；`npm run lint` 通过。未创建/运行任务、抓取网页、批准/拒绝采集页或访问外部来源；没有触及私信路由、正式数据或既有服务，也未运行完整 `test:api`、浏览器测试或构建。
44. 新增 `npm run test:creator-api` 独立 GET-only 契约：只请求本地文章/视频目录，检查响应字段、唯一标识及 `art_1`、`art_2`、`vid_1`、`vid_2` 保留；11 项通过，`npm run lint` 通过。使用临时 JSON 与随机端口，未写文章、获取外部媒体、请求会话/消息路径或访问正式数据/既有服务；完整 API 套件、构建和浏览器测试未运行。
45. 新增 `npm run test:catalog-api`，只对社区、游戏房间、广告三项目录发送白名单 GET；16 项通过，覆盖响应字段、唯一标识及隔离存储中的现有样例。未加入社区、写入游戏/广告状态、获取媒体、访问会话/消息、正式数据或既有服务；`npm run lint` 通过。未运行完整 `test:api`、构建或浏览器测试。两套新回归及项目记录已包含于 `e4403a8`，经现有 GitHub connector wrapper 快进推送；推送后 fetch 确认 `main` 与 `origin/main` 一致，没有强推或修改账户设置。

## 验证结果

- `npx tsx scripts/test_earth_one.ts`：44 项通过，0 项失败。
- `npm run test:api`：67 项 HTTP 断言通过，0 项失败；测试服务器只写临时 JSON 文件，并关闭后台采集；覆盖身份/隐私、普通内容业务及文章/视频/知识图谱/社区/游戏房间/广告读取契约。
- `npm run test:api` 上次续作结果：73 项 HTTP 断言通过，0 项失败；后续新增五项只读契约后曾为 78 项，本次再增加两项图书类别过滤契约，最新结果为 80 项通过、0 失败。
- 后续补充图书目录类别与地球节点位置分享断言后，`npm run test:api` 最新为 82 项通过、0 失败；同次 `npm run lint` 通过。
- 最新完整 API 套件在本次增补前为 83 项通过；脚本现在含 85 项断言。本次新增两项仅通过定向临时服务 GET 验证，不把它们表述为全量套件通过。
- 本次地球国家目录定向 smoke：国家目录 200，约旦本地化名称/坐标字段有效，统计端点国家数等于目录长度；`npm run lint` 通过。该检查未调用 AI、外部网络、会话/消息路由、正式数据或既有服务。
- 临时 Express 实例 HTTP smoke：用户列表、用户资料、全局搜索均未返回邮箱/内部 onboarding 字段；私密位置的纬经度为屏蔽值。
- 正式 `server_data.json` 在 04:55 校验仍与本轮测试前一致；04:57 再查发现其于 04:56:30 变化。该时间早于静态渲染测试、晚于本轮服务停止；已有默认路径的 3000 服务且每小时采集开启，时间相符但未直接证明归属。未覆盖、回滚或提交该文件，不再笼统宣称整轮哈希不变。
- `npm run test:globe`：六语言共 30 项通过；只验证静态内容、Crawler 菜单标签翻译键及网格/逻辑边框/波形行的结构契约。
- `npm run test:universe`：9 项静态断言通过；关闭名称/类型和原有天体条件操作文字保留，类型检查与生产构建通过。
- `npm run lint`：通过。
- `npm run build`：通过；入口 chunk 从既有约 1,160.76 KB（gzip 306.07 KB）降至 316.71 KB（gzip 97.92 KB）。仍有 `three.module` 共享 chunk 551.65 KB 的体积警告。
- 本轮 `npm run lint`、`npm run build`、`npm run test:api`（扩展后 67 项）与 `npx tsx scripts/test_earth_one.ts`（44 项）均通过；构建 CSS 已包含 `md:top-32` 响应式规则。
- 生产预览静态请求验证：`/favicon.ico` → `200 image/x-icon`，`/favicon.svg` → `200 image/svg+xml`；HTML 返回两个显式图标链接。
- 1274×649 桌面生产预览已确认抽屉净距和地球选择/返回流程；favicon 已修复，所测路径控制台无错误。其余模块、首屏实际资源统计、窄屏交互与 RTL 仍未验证。
- 隔离 Chromium 生产构建实测：首页 1274×649 的中文指标卡 x=220、宽 328px，三个单元各宽 90px且互不重叠；阿拉伯语 RTL 卡片 x=908，列顺序按 RTL 反转，宽度仍无溢出。390×844 中文指标卡宽 350px、三列各 100px，页面可纵向滚动且横向宽度为 390px。地球→宇宙→地球交互通过；API 响应为空的内存模拟，任何非 GET 均被拒绝。
- 本轮 `npm run lint`、`npm run test:globe`（30 项）、`npm run test:universe`（9 项）以及独立目录生产构建均通过；构建警告仍提示 Three.js 551.65 KB。
- 前序隔离 Chromium 续作的 `npm run test:api`（78 项）、`npx tsx scripts/test_earth_one.ts`（44 项）、`npm run lint`、`npm run test:globe`（30 项）、`npm run test:universe`（9 项）及独立目录生产构建均通过。18 个视口/模块样本均无页面宽度溢出，page errors=0，非 GET=0；43 个外部资源请求按设计阻断。
- 本次新增图书类别契约后 `npm run test:api`（80 项）与 `npm run lint` 均通过；临时 HTTP 测试未访问外部服务、私信读取路径或正式数据。

## 当前未解决/阻塞

- `server.ts` 仍有待审计的权限边界。依用户明确限制，本轮不得新增身份验证、授权、权限策略或私信访问控制变更；相关实现待明确批准。
- HTTP 测试与桌面 smoke 仅覆盖列明的业务路径，不是全面浏览器端到端回归；不将未批准的管理授权/私信隔离策略伪装成通过。
- 首屏入口已拆小，但首页因默认 3D 地球实际下载共享 Three.js chunk；其他模块首屏资源与是否能安全延迟 3D 依赖仍待评估。不得为消除体积警告而损伤地球/宇宙能力。
- 已修复并实测：宇宙遥测抽屉桌面遮挡；favicon 资源已由生产预览 HTTP 200 和桌面控制台验证。
- 首页总览指标挤压已完成结构修正；桌面中文/阿拉伯语 RTL、窄屏中文与窄屏 RTL 导航视口已复测。AI HUB 与网页浏览器移动溢出已修复；Crawler 仪表盘仅只读加载通过，实体设备、其余语言视觉、抓取执行与真实表单行为仍待验证。
- WebSocket、HLS、支付网关、PostgreSQL/PostGIS 依赖独立设计/配置；相关高风险或费用操作暂不执行。

## 下一步具体操作

1. 继续扩展无权限策略影响、无外部副作用的 HTTP 契约；不主动再调用会话/消息路径，先前视觉预览对临时合成 fixture 的读取见第 33 项。网页/图书搜索与 EPUB 代理依赖外部请求，当前不调用。
2. 继续实测尚未覆盖的其他设备/语言和跨视口首屏资源；Crawler 创建、执行与审核流程另待权限/目标域风险评估，不在只读布局检查中触发。
3. 评估 Three.js 共享 chunk 的进一步延迟/拆分，先审查组件生命周期并建立地球/宇宙回归，不隐藏警告或移除功能。
4. 身份验证、授权策略、管理访问控制及私信隔离实现继续等待用户明确批准。

## 执行环境交接

- 本轮临时 API/预览端口 4318/4317 已停止并确认无监听；正式 `server_data.json` 哈希仍与测试前一致。
- `/tmp/earth-one-browser-smoke-50acb7e` 为本轮测试目录，未纳入仓库；删除受到工具安全拦截后保留，没有绕过拦截。
- 浏览器恢复空白页的动作被权限拒绝，未继续重试或扩大权限；测试标签仍停留于已停止的本机预览页。
- 后续视觉回归使用 `/tmp/earth-one-regression-e327ac9-8rvNm1`，未访问或删除上述受限旧目录。端口 4319 的本轮静态预览遗留进程已停止；4320/4321/4322 已通过终端中断退出并确认无监听，正式数据 SHA-256 校验一致。
- 浏览器同标签已重连并停留在已停止的窄屏测试容器页；原语言点击结果未确认，未重放，也未关闭用户所属标签。
- 既有 3000/3001 开发服务在本轮开始前已运行，未停止或改配置。正式数据 04:56:30 变化的前后哈希保留在 `/tmp/earth-one-regression-e327ac9-8rvNm1/formal-data-before.sha256` 和 `formal-data-after.sha256`；这不等于已查明写入归属，后续不可用本轮旧哈希判断其他阶段的数据状态。本次续作未读取、修改或暂存该文件，也未检查现有服务配置/日志；其变更归属仍未明，等待用户对只读检查的回复。
- 本次 API/领域测试使用隔离临时 JSON；视觉测试使用独立 Chromium、本地临时生产构建与隔离 API 临时 JSON，仅路由 GET 并阻断外部请求。视觉页曾读取该临时服务的合成会话/消息与个人列表 fixture（详见第 33 项），不应描述为完全未触及私有读取；正式数据未读写，现有 3000/3001 服务未改动；本轮自有测试服务及预览进程均已退出。

## 2026-11-04 公开社交动态只读回归续作

- 新增 `scripts/test_social_feed_api.ts` 和 `npm run test:social-feed-api`。测试使用随机本地端口与自动清理的临时 JSON，仅请求公开 `/api/posts` 的十种预设 GET 变体。
- 19 项断言通过：响应字段与既有隔离种子、默认列表和最新排序、热门互动评分顺序、约旦国家筛选（含小写代码）、类别筛选、`all`/`ALL` 兼容、国家与类别组合筛选、大小写不敏感的内容搜索，以及端点/方法白名单。
- `npm run lint` 通过。未触发任何写接口、媒体 URL、会话/消息或身份接口；未访问正式数据、既有服务或外部来源。未运行包含待批准会话读取路径的完整 `npm run test:api`，也未运行构建或浏览器测试。
- GitHub 同步：回归与项目记录提交 `72f7f96` 经现有授权 connector 快进推送；随后 `git fetch` 和 connector API 回读均显示远端 `main` 为 `72f7f96`，本地 `main`/`origin/main`/`HEAD` 对齐，工作区干净；未强推或更改账户设置。


## 2026-11-04 公开用户目录与资料 GET-only 回归

- 从 `main` / `798781d` 的干净工作区继续；新增 `scripts/test_public_users_api.ts` 与 `npm run test:public-users-api`，未改动生产路由或现有服务。
- 测试在系统临时目录预置一个合成用户：含测试用邮箱、未完成 onboarding 标记及关闭分享的坐标；启动独立随机端口 Express 服务，模型凭据置空并关闭后台书籍采集。
- 21 项断言通过，覆盖用户目录字段/隐私、大小写无关的国家与文字筛选、无匹配结果、公开资料帖子关联、未知资料结构化 404、私密坐标在目录/资料/全局搜索中的遮蔽，以及全局搜索 trim/空查询处理。请求白名单只含 `/api/users`、`/api/users/:id` 与 `/api/search/global` 的预设 GET；没有请求身份、会话/消息路径或写接口。
- 初次尝试用城市名匹配全局搜索未命中；源码契约仅按用户显示名、用户名和国家名查找。回归遂使用合成用户的国家名验证既有行为；未扩展或改变产品搜索逻辑。
- `npm run lint` 通过；完整 `npm run test:api`（包含待批准会话读取路径）、构建及浏览器回归未运行。测试使用独立临时 JSON，服务停止后脚本自动清理；未读取、修改或暂存正式 `server_data.json`，未检查或修改既有 3000/3001 服务配置/日志。
- GitHub 同步：提交 `cdc89404973f8dbee303940bff245aa02144b8b7` 使用现有授权 connector 的 credential helper 正常快进推送；推送前远端 `main` 与提交父节点同为 `798781d`，推送后 `git fetch` 的 `origin/main` 与 connector API 回读均为 `cdc8940`。未强推、未使用会暂存全部文件的仓库同步脚本，也未更改全局 Git 配置；工作区干净。


## 2026-11-04 地球节点公开位置 GET-only 隐私回归续作
- 从干净的 `main` / `3cf4386` 继续；只扩展 `scripts/test_globe_api.ts`，没有修改 `server.ts` 路由、登录/会话/消息授权策略、正式数据或现有服务配置。
- `npm run test:globe-api` 现使用临时合成用户文件覆盖 `/api/globe/nodes`、`/api/globe/countries`、`/api/globe/stats` 三个 GET 白名单端点；11 项通过。新增检查确保公开位置用户节点及预期共享字段保留、关闭位置分享的用户和坐标哨兵不出现在响应中。
- `npm run lint` 与 `git diff --check` 通过。测试服务使用随机本地端口，后台书籍采集关闭；不运行完整 `test:api`（其含待批准会话读取路径），不运行构建或浏览器测试，不访问外部来源、正式 `server_data.json` 或既有服务。
- 下一步继续选择普通、无外部副作用、无权限策略变更的回归任务；会话/消息边界、既有服务配置/日志和正式数据继续保持未触碰。
- GitHub 同步：回归代码与项目记录提交 `17561300293bf7782445e7f80bf0a43bf665faa6` 从父提交 `3cf4386ddd978fcfd0036fd6bcf7c9679b59e2ea` 正常快进推送到 `main`；推送后 `git fetch` 与授权 connector API 回读均确认远端 `main`、`origin/main`、本地 `HEAD` 同为 `1756130`，工作区干净。未强推、未更改账户设置或全局 Git 配置。


## 2026-11-04 知识图谱无匹配搜索 GET-only 续测

- 从 `main` / `11f36c2` 继续，仅扩展 `scripts/test_knowledge_api.ts` 的白名单与断言；没有改动服务端路由、业务数据或权限策略。
- 专项回归现为 12 项通过，包含 33 个知识节点详情。新断言只增加 `GET /api/knowledge/search?q=no-such-earth-one-node-9f31`，要求返回 HTTP 200、`success: true`、原查询字符串及空 `nodes` 数组。
- `npm run test:knowledge-api` 的固定 GET 白名单为 `/api/knowledge/nodes`、`/api/knowledge/nodes?country=sa`、`/api/knowledge/search?q=Avicenna`、`/api/knowledge/search?q=Islamic&category=civilization`、`/api/knowledge/search?q=no-such-earth-one-node-9f31` 与 `/api/knowledge/nodes/not-a-real-node`；另对目录返回的 33 个 ID 各请求一次 `/api/knowledge/nodes/:id`。测试内端点/方法白名单检查仍启用。
- `npm run test:globe-api` 复跑 11 项通过；`npm run lint` 与 `git diff --check` 通过。两项专项测试均使用自动清理的临时 JSON 与随机本地端口；未运行包含待批准会话读取路径的完整 `npm run test:api`、构建或浏览器回归。
- 未请求身份、会话/消息接口或写接口；未访问外部来源、正式 `server_data.json` 或既有服务，也未检查现有服务日志/配置。
- GitHub 同步：提交 `88eb83f4b2760ffb79b60f6314ff88ff509bc2df` 从父提交 `11f36c2` 正常快进推送至 `main`；推送后再次 fetch，`HEAD` 与 `origin/main` 均为该提交，工作区干净。使用当前已授权的连接入口，未强推或更改账户/全局 Git 配置。


## 2026-11-04 社区、游戏房间与广告目录重复 GET 幂等性续测

- 从干净的 `main` / `97e6234` 继续；仅扩展 `scripts/test_catalogs_api.ts`，未修改服务端路由或业务数据。
- 为 `/api/communities`、`/api/games/rooms`、`/api/ads` 各增加一次重复 GET 比对，确保读取目录不会改变社区加入状态、游戏棋盘/回合或广告曝光/点击计数。
- `npm run test:catalog-api`：19 项通过、0 失败；`npm run lint` 与 `git diff --check` 通过。服务运行于随机本地端口，使用自动清理的临时 JSON，端点白名单仅包含三个目录 GET。
- 未运行完整 `npm run test:api`（该套件含等待批准的会话读取路径）、构建或浏览器测试；未访问会话/消息接口、写接口、外部服务、正式 `server_data.json` 或既有服务，也未检查既有服务配置/日志。
- GitHub 同步：提交 `386fcf6c32a7cf1da12b903fc8e18666ea5103fe` 从 `97e6234` 经现有授权连接器普通快进推送至 `main`；推送后 fetch 与 connector API 回读均确认 `HEAD`、`origin/main` 和远端一致，工作区干净。未强推或修改账户/全局 Git 配置。


## 2026-11-04 爬虫只读列表重复 GET 幂等性续测

- 从干净的 `main` / `3555a74` 继续；只扩展 `scripts/test_crawler_api.ts` 与测试/进度文档，没有改动服务端路由、爬虫行为、权限策略或业务数据。
- 对固定白名单 `GET /api/crawler/tasks` 与 `GET /api/crawler/pages` 各增加重复读取比对，要求 HTTP 200 且完整 JSON 响应与首次读取一致，以保护任务进度、状态和页面审核状态不被 GET 改变。
- `npm run test:crawler-api`：14 项通过、0 失败；`npm run lint` 与 `git diff --check` 通过。测试使用随机本地端口及脚本自动清理的临时 JSON，仅发送 GET。
- 未执行任务创建/抓取/审核、外部网络请求、身份或会话/消息接口；未读写正式 `server_data.json`，未检查或修改既有服务、配置或日志。完整 `npm run test:api` 因包含待批准会话读取路径未运行；本次也未运行构建或浏览器测试。
- GitHub 同步：提交 `58472a1ceb6f2525658b76538bec6bdc4cb09a0a` 已通过已授权 connector 普通快进推送至 `main`；推送后 fetch 与 connector API 均确认 `HEAD`、`origin/main` 和远端一致。未强推或更改全局 Git 配置。


## 2026-11-04 创作者目录重复 GET 幂等性续测

- 从干净的 `main` / `78a8605` 继续；仅扩展 `scripts/test_creator_api.ts` 和项目进度/回归文档，没有改动服务端路由、创作者业务逻辑、权限策略或业务数据。
- 对白名单 `GET /api/articles` 与 `GET /api/videos` 分别增加重复读取比对，要求 HTTP 200 且完整 JSON 响应与首次读取一致，保护文章/视频目录不因 GET 改变。
- `npm run test:creator-api`：13 项通过、0 失败；`npm run lint` 与 `git diff --check` 通过。服务使用随机本地端口和脚本自动清理的临时 JSON，仅发送 GET。
- 未写入文章、获取外部媒体、访问身份或会话/消息接口、读取正式 `server_data.json`，也未检查或更改既有服务、配置或日志。完整 `npm run test:api` 因包含待批准的会话读取路径未运行；本次未运行构建或浏览器测试。
- GitHub 同步：提交 `e9414282ea378edf4ccf654c184a38634da5837d` 已使用已授权 connector 进行普通快进推送；推送后的 fetch 与 connector API 均确认远端 `main`、`origin/main` 和本地 `HEAD` 一致。未强推或修改全局 Git 配置。
