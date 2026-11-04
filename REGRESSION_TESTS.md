# EARTH ONE 回归测试清单

更新时间：2026-11-05

## 自动化检查

| 命令 | 覆盖范围 | 当前结果/注意事项 |
|---|---|---|
| `npm run lint` | TypeScript 类型检查（`tsc --noEmit`） | 2026-11-05：通过。 |
| `npm run build` | Vite 生产构建 | 2026-11-05：通过；Vite 8.3.5 最大 chunk 1,342.07 KB（gzip 358.07 KB），触发大 chunk 警告；本次未修改依赖声明或锁文件。 |
| `npx tsx scripts/test_earth_one.ts` | 天体常数、地理坐标、公开资料脱敏、存储层注册/登录/引导、动态/互动、消息、JSON 持久化与趋势种子检查 | 2026-11-04：44 项通过、0 失败；使用系统临时数据文件，成功或失败后清理。它不调用 Express HTTP 路由，也不测试浏览器 UI。 |
| `npm run test:api` | 临时 Express 服务的身份/隐私核心路径，以及动态发布/互动/最新 feed 排序、图书检索/详情/类别筛选/书架、浏览器书签、爬虫任务排队、文章/视频列表、知识图谱搜索/筛选/详情、社区/游戏房间/广告列表、地球节点及位置分享/国家/统计、AI 模型/统计、爬虫任务/页面及已保存文章列表 | 最新完整执行为 83 项通过、0 失败；脚本现含 85 项断言，新增约旦国家元数据与目录/统计跨端点一致性两项。本次两项经独立临时服务 GET smoke 验证；未重跑会命中待授权会话读取路径的完整套件。使用临时 JSON，不触碰正式数据、不发起 AI、外部抓取或媒体请求。未变更私信访问控制及管理授权策略。 |
| `npm run test:globe-api` | 隔离临时 Express 服务中 `/api/globe/nodes`、`/api/globe/countries`、`/api/globe/stats` 的 GET-only 契约；检查公开/私密位置节点、节点字段白名单、私密坐标不泄漏、国家目录及统计一致性，以及三端点重复 GET 的完整状态/JSON 一致性 | 2026-11-04：14 项通过、0 失败；仅使用合成用户与临时 JSON、随机端口；请求被限于三个白名单 GET，不访问身份/会话/消息路径、正式数据或既有服务。 |
| `npm run test:ai-api` | 独立临时 Express 服务中 `/api/ai/models` 与 `/api/ai/stats` 的 GET-only 契约；检查模型元数据、唯一 ID、未配置状态/掩码、用量汇总及两个端点重复 GET 的完整响应一致性 | 2026-11-04：11 项通过、0 失败；子进程模型密钥置空、临时 JSON 自动清理，不调用模型、不触及会话/消息接口、正式数据或既有服务。 |
| `npm run test:knowledge-api` | 独立临时 Express 服务中的知识图谱只读契约：目录/33 个节点详情、关联边和书籍映射、别名搜索、类别/国家筛选、无匹配搜索成功返回空数组、目录和 Avicenna 别名搜索重复 GET 的完整状态/JSON 一致性，以及未知节点 404；请求仅限白名单 GET | 2026-11-04：14 项通过、0 失败；临时 JSON 自动清理，后台采集及模型密钥关闭。仅验证 HTTP 数据契约，不覆盖 UI、权限策略或完整 API 套件；不访问会话/消息路径、外部服务、正式数据或既有服务。 |
| `npm run test:library-api` | 独立临时 Express 服务的本地图书目录与详情 GET-only 契约：核心字段/ID 唯一、哲学类别过滤、未知类别空集合、Plato 本地目录搜索、已知图书章节结构、未知图书 404，以及目录和已知详情重复 GET 的完整状态/JSON 一致性；端点白名单不含外部搜索、书架或写操作 | 2026-11-04：14 项通过、0 失败；使用自动清理的临时 JSON、随机端口并关闭后台采集/模型密钥；不访问会话/消息路径、外部服务、正式数据或既有服务。 |
| `npm run test:crawler-api` | 独立临时 Express 服务中 `/api/crawler/tasks` 与 `/api/crawler/pages` 的 GET-only 契约；检查字段/ID 唯一、页任务关联、状态、pending-review 样例及重复 GET 响应一致性，端点白名单不含任务创建、执行或审核 | 2026-11-04：14 项通过、0 失败；使用自动清理的临时 JSON 和随机本地端口；不执行抓取、不访问外部来源、正式数据、会话/消息路径或既有服务。 |
| `npm run test:creator-api` | 独立临时 Express 服务中 `/api/articles` 与 `/api/videos` 的 GET-only 目录契约；检查字段、ID 唯一性、既有文章/视频条目及重复 GET 完整响应一致性；不包含写操作或媒体获取 | 2026-11-04：13 项通过、0 失败；使用自动清理的临时 JSON 和随机本地端口，后台采集及模型密钥关闭；不访问会话/消息路径、外部媒体、正式数据或既有服务。 |
| `npm run test:catalog-api` | 独立临时 Express 服务中 `/api/communities`、`/api/games/rooms` 与 `/api/ads` 的 GET-only 目录契约；检查字段、唯一 ID/slug、预置样例及重复读取不改变成员/棋盘/回合/曝光/点击状态；不包含加入、游戏状态变更或广告点击 | 2026-11-04：19 项通过、0 失败；使用自动清理的临时 JSON 和随机端口；不访问会话/消息路径、外部媒体、正式数据或既有服务。 |
| `npm run test:social-feed-api` | 独立临时 Express 服务的公开 `/api/posts` GET-only 契约；检查字段/种子、默认与最新排序、默认和最新 feed 重复 GET 的完整状态/JSON 一致性、热门评分、国家大小写、类别与国家组合筛选、`all`/`ALL` 兼容及内容搜索；只允许十种预设查询 | 2026-11-04：21 项通过、0 失败；自动清理临时 JSON 与随机端口；不触发写接口、媒体 URL、身份/会话/消息路径、外部来源、正式数据或既有服务。 |
| `npm run test:public-users-api` | 使用临时合成用户数据，独立验证 `/api/users` 目录筛选、`/api/users/:id` 公开资料、`/api/search/global` 用户检索；检查目录/资料/搜索重复 GET 的状态与完整 JSON 一致性；仅允许白名单 GET | 2026-11-04：24 项通过、0 失败；覆盖邮箱/onboarding 脱敏、私密坐标遮蔽、筛选、结构化 404、搜索边界和三项重复 GET 一致性；自动清理临时 JSON/随机端口，未访问身份、会话/消息路径、写接口、外部来源、正式数据或既有服务。 |
| `npm run test:browser-api` | 独立临时 Express 服务中 `/api/browser/bookmarks` 与 `/api/browser/saved-articles` 的 GET-only 兼容契约；使用合成记录检查集合字段、书签 ID 唯一性及两个列表重复读取时完整状态/JSON 一致性；请求白名单不含写操作、预览或删除 | 2026-11-05：12 项通过、0 失败；自动清理临时 JSON 和随机本地端口，仅请求两个列表 GET；未访问会话/消息路径、外部 URL、正式数据或既有服务。该旧 API 保留，但当前 Browser UI 不再调用书签端点。 |
| `npm run test:browser-find` | 模拟 WebContents 查找控制：仅活动可见标签、`new/next/previous`、非字符串/超长查询拒绝、过期结果过滤、清除高亮/焦点恢复、隐藏/销毁保护、切换活动标签聚焦页面，以及 Ctrl/Cmd+F 路由 | 2026-11-05：`BROWSER_FIND_ENGINE_TEST_PASS`；通过。 |
| `npm run test:browser-popups` | 模拟 popup 安全策略与 Browser engine：危险/无效/凭据 URL、EARTH ONE 应用 origin、所有 Electron disposition 必须确认、POST popup 拒绝、右键链接回调、活动标签焦点、关闭活动 popup 后恢复并聚焦剩余标签、专用 Browser session 复用、无 preload/Node | 2026-11-05：`BROWSER_POPUP_SECURITY_TEST_PASS`；通过。 |
| `npm run test:browser-ipc-security` | 合成 IPC 事件验证精确主窗口 WebContents、顶层 frame 和应用 origin；拒绝其他 WebContents、子框架及错误/畸形来源 | 2026-11-05：`BROWSER_IPC_SECURITY_TEST_PASS`；通过。 |
| `npm run test:browser-permissions` | 权限状态机单测：默认拒绝、仅通知/定位、HTTPS/loopback 安全来源、显式会话允许、能力与 origin 隔离、拒绝/撤销、超时/导航取消、重建状态机后清空；无网络 | 2026-11-05：`BROWSER_PERMISSIONS_TEST_PASS`；通过。 |
| `npm run test:download-manager` | 合成 DownloadItem/临时 userData：保存对话框批准前不落盘、成功/进度/完成、重启后恢复并将进行中的任务标为已中断、取消、来源 query 脱敏、最近 50 条限制、损坏存储只读保护、批准文件后来删除后的可用状态、写入失败时 remove/clear 回滚、清理保留活动传输、移除/清理不删除文件、无效 URL 与非浏览器来源拒绝 | 2026-11-05：`DOWNLOAD_MANAGER_TEST_PASS`；仅临时目录，无网络。 |
| `npm run test:browser-engine` | Linux/Xvfb 实际 Electron/Chromium：断言首次进入 Browser 默认挂载并聚焦 Chromium，再切换 Reader Mode 隐藏并恢复 Chromium；含合成 `target=_blank` 和 `window.open()` 的确认拒绝/通过、无手势 popup 确认、真实点击 `javascript:`/`file:`/无效来源与 EARTH ONE 路由边界、新标签 session/opener/preload/Node/焦点隔离、关闭 popup 后回到并聚焦剩余标签；既有导航、下载、收藏/历史、恢复、查找、权限与 `Ctrl+L` 回归。所有非夹具 HTTP(S) 请求在请求层取消 | 2026-11-05：基于最新 main 的最终串行验证退出码 0；默认 Chromium/Reader hide-show、popup/find、permissions、downloads 和 session 全部通过。 |
| `npm run test:i18n` | 纯本地静态检查六种支持语言的字典键集合一致且所有翻译值非空 | 2026-11-04：13 项通过、0 失败；发现每种语言均有 104 个共用键；不调用 API，不验证翻译准确度、浏览器表现或 RTL 几何。 |
| `npm run test:globe` | React 静态渲染：六种语言的总览标题/标签、Crawler 菜单翻译键、三个原有指标值、三列网格/逻辑边框和波形独立行 | 2026-11-04：30 项通过、0 失败；不运行 effect、WebGL、浏览器输入或 API，不证明实际视觉几何、交互或 RTL 布局。 |
| `npm run test:universe` | 地球/土星/空选择的遥测静态渲染：关闭按钮名称和类型、天体双语名称、对焦文字、条件地球入口 | 2026-11-04：9 项通过、0 失败；不测试浏览器点击、键盘、读屏或相机行为，原关闭回调未更改。 |
| `npm run test:motion` | 静态检查全局 CSS 在 `prefers-reduced-motion: reduce` 媒体查询中覆盖元素与伪元素，并缩短动画/过渡、关闭平滑滚动 | 2026-11-04：6 项通过、0 失败；只检查源码规则，不证明浏览器运行时、实体设备或辅助技术行为。 |
| `npm run test:motion:browser` | Chromium 计算样式回归：模拟系统 reduce 偏好，并在宿主默认为 no-preference 时确认原有动画、过渡及平滑滚动未改变；同时检查静态状态文字仍存在 | 2026-11-04：12 项通过（Chrome for Testing 151.0.7922.34；宿主默认 no-preference）；只加载内嵌 data URL，不启动应用/API 服务。实体设备和辅助技术仍未覆盖；若宿主默认 reduce，不适用的 no-preference 基线项会跳过。 |
| `npm run test:motion:build` | 运行 Vite 生产构建，再检查构建 CSS 中减少动态效果媒体查询、全局元素/伪元素选择器、动画/过渡时长、迭代次数及滚动覆盖 | 2026-11-04：构建通过；9 项产物断言通过，覆盖 1 个 CSS 文件。Three.js 551.65 KB chunk 警告仍显示；构建产物 `dist` 被忽略，不调用 API 或启动服务。 |

## 本轮生产构建桌面 smoke

- 环境：1274×649 视口，Vite 生产构建预览，API 只写临时 JSON 数据，后台采集和外部 AI 关闭。
- 通过：地球 canvas/导航渲染、进入动态列表、进入图书馆并打开《理想国》详情、切换宇宙引擎、选择地球查看遥测、返回数字地球。
- 初次观察到：遥测抽屉遮挡部分天体按钮；控制台有 `/favicon.ico` 404，所测路径未见 chunk 加载或脚本错误。
- 后续修复与实测：初版 `md:top-28` 仍与天体栏外框重叠 7px；改为 `md:top-32` 后，天体栏下沿 119px、抽屉上沿 128px，净距 9px。抽屉打开时选择地球、查看更新后的遥测并返回数字地球通过；所测路径控制台无错误。窄屏定位保持 `top-18`。
- 图标：新增 SVG 与 ICO；生产预览 `/favicon.ico` 为 200 `image/x-icon`、`/favicon.svg` 为 200 `image/svg+xml`，本轮应用桌面复测无 favicon 控制台错误。
- 这不是全模块或登录端到端测试；其余模块、RTL、外部服务及首屏真实资源统计仍待验证。

## 390×844 响应式视口尝试

- 在独立测试页的 390×844 iframe 内观察到地球首屏、语言入口、横向导航及地球控件；不是实体移动设备测试。
- 语言按钮点击在浏览器输入准备阶段超时；同标签重连成功，但工具仍将原操作因果标为未确认。未重复点击、未绕过控制，不将语言切换、RTL 或窄屏宇宙交互标记通过。
- 在那次测试结束时，测试服务只写独立临时 JSON，后台采集和 AI 凭据关闭；端口 4320/4321/4322 均已停止，正式文件校验值与当时基线一致。

## 总览卡片修复与环境边界

- 总览改为三列指标网格与波形独立行，保留数值、翻译与原有控件；六语言静态渲染 24 项、类型检查和构建通过。下方隔离 Chromium 已进一步复测桌面/窄屏视觉，但不能把静态测试称为浏览器回归。
- 正式数据在 04:55 校验仍一致，04:57 再查时发现其修改时间为 04:56:30，早于静态渲染测试。既有 3000 端口服务从 03:56 运行，使用默认数据文件且后台每小时采集开启，时序一致但未直接证明写入归属。本轮测试服务早已停止，未覆盖/回滚数据，也未停止既有服务；前后哈希证据保留在本轮独立临时目录。
- 本次续作的测试只使用临时 JSON 与内存空 API；未读取、修改或暂存正式数据，也未停止/配置既有 3000/3001 服务。04:56:30 的写入与定时采集在时间上相关，但目前没有证据证明其写入来源，归属仍未查明。

## 隔离 Chromium 生产构建视觉回归

- 环境：仓库外临时生产构建；系统 Chromium headless 与 SwiftShader；本地 HTTP 服务只对 GET API 返回内存空数据，并拒绝所有非 GET。未登录、未调用真实 API/AI、未读取或写入正式数据；这里只验证展示层、canvas 挂载与导航，不声称完整后端端到端通过。
- 1274×649 中文桌面：总览卡片 x=220、宽 328px；网格宽 286px，三列各 90px，指标之间无重叠；地球页面挂载一个 canvas，无运行时异常。
- 1274×649 阿拉伯语：真实点击语言菜单后文档方向为 RTL；总览卡片 x=908，指标列按 RTL 方向排列且没有横向溢出。
- 390×844 中文窄屏：总览卡片 x=20、宽 350px，三列各 100px；视口 scrollWidth=390px，无横向溢出。页面总高 1285px，指标卡需向下滚动查看，不固定在首屏内。
- 首页“我们的银河”进入宇宙引擎、引擎返回控件回到地球均通过；两种视图均挂载 canvas。SwiftShader 不证明真实硬件 GPU 性能或视觉质量；窄屏 RTL、其他模块与表单/API 写入仍待验证。
- 首次首页载入的脚本响应：Three.js 551,943 bytes、首页入口 316,969 bytes、DigitalGlobe 72,209 bytes；对应构建文件 gzip 估算分别为 137.29 KB、97.92 KB、18.06 KB。测试 HTTP 服务未压缩，部署 CDN 的压缩行为未在此验证。
- Three.js 仍随首页 3D 地球首次导航下载；尚未拆分复杂场景初始化/清理。下一步先评估安全延迟加载，不隐藏警告或删减地球/宇宙功能。

## 2026-11-04 窄屏 RTL 模块回归与布局修复

- 环境：隔离系统 Chromium、本地临时生产构建与独立临时 JSON API 服务；真实点击语言菜单切换为阿拉伯语 RTL。API 仅转发 GET，所有非本地外部请求被拦截；未登录、未调用 AI/外部搜索、未读写正式 `server_data.json`。
- 在 390×844 下实测移动导航可达的 12 个模块：首页地球、动态、宇宙、社区、消息、AI HUB、图书馆、知识、浏览器、创作者、视频、游戏；另测 AI HUB 与浏览器 1274×649 RTL 桌面、两者 390×844 中文移动状态，以及地球侧栏打开的桌面 Crawler 仪表盘。共 18 个视口/模块样本，`documentElement.scrollWidth` 和 `body.scrollWidth` 均等于视口宽度。
- 首轮发现 AI HUB 模型状态/选择栏撑宽至 499px，网页浏览器内容面板撑宽至 621px。分别通过 flex 子项 `min-w-0`、模型选择器限宽、浏览器地址栏工具条内部滚动修复；没有删控件或以全局裁切掩盖问题。修复后上述样本无页面级水平溢出。
- 本次测试过程中 43 个外部资源请求被按设计阻断，产生的网络加载提示来自拦截；JavaScript 页面错误为 0，非 GET 请求尝试为 0。浏览器内容/远程图像完整性不在本次结论内。
- 单次隔离生产 Chromium Resource Timing：首屏 7 个 JS encoded body 合计 253,077 B/decoded 942,755 B，CSS 为 16,324/112,399 B；Three.js 单块为 136,323/551,656 B。另 12 个页面 JS 块在首次导航到对应模块后才请求，CrawlerDashboard 为 4,849/17,678 B。此为单次模拟器本地资源快照，不含响应头、外部资源、网络带宽或实体设备性能。
- 隐私范围更正：App 启动会自动读取 `/api/conversations`；访问 Messenger 时，预置的 `conv_global` 会触发消息列表 GET。DigitalLibrary 与 WebBrowser 挂载也请求 `/api/library/shelf`、`/api/browser/bookmarks`、`/api/browser/saved-articles`。这些请求只到本轮隔离 API 的合成种子/空数据，没有连接正式数据或既有服务；会话/消息读取不是本轮授权测试，未记录响应内容或逐请求计数。后续视觉回归应在代理层先 stub 这些路径。
- Crawler 从地球侧栏进入桌面仪表盘；挂载只发出 `/api/crawler/tasks` 与 `/api/crawler/pages` 的 GET。没有点击新建、运行、批准或拒绝控件，因此抓取执行与审核流程仍未验证。
- 地球与宇宙页面均挂载 canvas；此检查只验证展示、导航和视口几何，不证明真实 GPU 画质、完整业务交互或真实后端端到端通过。实体设备仍待验证。

## 每次相关改动必须保留的回归点

- **身份与隐私**：注册/登录/登出；正确和错误凭据；无令牌/无效令牌调用 `/api/auth/me` 与 `/current` 返回空用户；未登录时 onboarding、资料更新、位置开关返回 401；公开位置变更持久化；私有用户字段不得出现在公开 API。
- **数字地球与宇宙**：地球页面可交互、节点遵守位置隐私设置；地理坐标映射；天体选择、遥测和返回地球功能。
- **社交与消息**：动态发布、筛选、点赞、评论；消息读写；翻译失败时明确显示真实状态，不能伪装成功。
- **AI 与外部服务**：无凭据时的错误提示/降级；服务端密钥不进入客户端构建；搜索和引用来源在可用时正确展示。
- **图书馆、浏览器、爬虫、知识图谱**：搜索/导入/阅读进度/注释/书签读写；外部地址校验、版权与抓取限制；管理端点访问控制。
- **创作者、视频、游戏、社区和广告**：保存与读取真实数据；未接入支付、流媒体转码或实时对战的能力需明确标记，不得用演示数据冒充真实生产功能。
- **兼容性**：桌面、窄屏移动布局；中文/英语/阿拉伯语 RTL/西班牙语/法语/俄语；已有 URL、API 和业务逻辑保持兼容。

## 尚需自动化/人工实测

- Express HTTP 回归只补充无外部副作用的普通响应契约，没有将会话/消息读取（待批准的私信边界）、非空图书搜索、EPUB 代理或网页搜索纳入断言。视觉预览对合成会话/消息 fixture 的读取见上方范围更正；后续不主动重放这些路径。
- 浏览器端到端：登录、导航、真实表单提交、按需加载后的页面切换、3D WebGL 交互与 API 数据展示。
- 实体设备、其他语言的完整浏览器覆盖及未列入移动导航的 Crawler 模块。
- 长时间运行、并发访问、外部数据源失败/超时及服务重启后数据完整性。

## 2026-11-04 地球国家目录只读契约续测

- 在 12 个国家的临时目录上定向请求 `/api/globe/countries` 与 `/api/globe/stats`；确认约旦条目保留英文名、本地名称和数值坐标，且统计国家数等于目录长度。
- 两项新增断言的定向 smoke 通过，`npm run lint` 通过。没有运行完整 `test:api`，因为其余既有测试会触及当前等待批准的会话读取路径；没有调用会话/消息 API、外部服务或正式数据。
- 新增可重复命令 `npm run test:globe-api`：独立临时 Express 服务仅接受白名单地球国家目录/统计 GET；7 项检查覆盖目录结构、唯一国家代码、名称/坐标边界、约旦元数据及跨端点国家数量一致性。该命令通过；本轮完整 `npm run test:api` 未运行。

任何测试都必须使用独立临时数据文件，避免对仓库忽略的本机 `server_data.json` 或用户数据执行写操作。

注：纯视觉回归不涉及持久化时可使用不落盘的隔离内存 API 模拟；所有涉及数据读写的测试仍必须使用独立临时数据文件。

## 2026-11-04 公开社交动态 GET-only 回归续测

- 运行 `npm run test:social-feed-api`：19 项通过、0 失败；`npm run lint` 通过。
- 服务端使用自动清理的临时 JSON 和随机本地端口。请求严格限于 `/api/posts` 的十种预设 GET 查询；验证默认/最新排序、热门排序、约旦国家筛选和大小写兼容、类别与组合筛选、`all`/`ALL` 及文本搜索。
- 未发起写操作、请求媒体 URL、访问会话/消息或身份端点、外部来源、正式数据或既有服务。完整 `npm run test:api` 未运行，因为其中包含待批准的会话读取路径；本轮亦未运行构建或浏览器测试。

## 2026-11-04 公开社交 feed 重复 GET 一致性续测

- `npm run test:social-feed-api`：21 项通过、0 失败。新增公开默认 feed 与 `feed=latest` 的重复 GET 检查，分别比较 HTTP 状态和完整 JSON 响应。
- 测试请求仍严格限于固定 `/api/posts` GET 白名单，服务使用随机本地端口和自动清理的临时 JSON；`npm run lint` 与 `git diff --check` 通过。
- 未触及身份、会话/消息路径、写接口、外部来源、正式数据或既有服务。完整 `npm run test:api` 未运行，因为其中包含待批准的会话读取路径；本轮未运行构建或浏览器测试。


## 2026-11-04 地球节点公开位置隐私 GET-only 续测
- 扩展 `npm run test:globe-api`，以一个公开位置合成用户和一个关闭位置分享的合成用户，验证公开节点标识、共享坐标与响应字段集合；关闭分享用户及其坐标哨兵不得出现。原国家目录、约旦元数据和统计数量断言保留。
- 本次专项运行 11 项通过、0 失败；`npm run lint` 与 `git diff --check` 通过。测试仅 GET `/api/globe/nodes`、`/api/globe/countries`、`/api/globe/stats`，运行于随机本地端口及自动清理的临时 JSON；未请求会话/消息、身份或写接口，未访问正式数据或既有服务。
- 完整 `npm run test:api` 因包含待批准会话读取路径而未运行；本次也未运行生产构建或浏览器测试。


## 2026-11-04 知识图谱无匹配搜索 GET-only 续测

- `npm run test:knowledge-api` 现为 12 项通过、0 失败（33 个节点详情）。新增断言对 `GET /api/knowledge/search?q=no-such-earth-one-node-9f31` 检查 HTTP 200、`success: true`、查询字符串原样回显及空 `nodes` 数组。
- 本测试固定白名单为 `GET /api/knowledge/nodes`、`GET /api/knowledge/nodes?country=sa`、`GET /api/knowledge/search?q=Avicenna`、`GET /api/knowledge/search?q=Islamic&category=civilization`、`GET /api/knowledge/search?q=no-such-earth-one-node-9f31`、`GET /api/knowledge/nodes/not-a-real-node`；另外仅对本地目录返回的 33 个 ID 请求 `GET /api/knowledge/nodes/:id`。所有非白名单路径及非 GET 方法均被测试辅助函数拒绝。
- `npm run test:globe-api` 复跑 11 项通过；`npm run lint` 与 `git diff --check` 通过。临时 JSON 自动清理，随机本地端口；完整 `npm run test:api` 未运行，因为其中含有尚待批准的会话读取路径。未访问身份、会话/消息或写接口、外部来源、正式数据或既有服务。


## 2026-11-04 爬虫任务与页面列表重复 GET 幂等性续测

- `npm run test:crawler-api` 现为 14 项通过、0 失败。新断言分别重复读取 `/api/crawler/tasks` 与 `/api/crawler/pages`，验证 HTTP 200 及完整 JSON 响应一致，保护任务状态/进度和页面审核状态不因 GET 改变。
- 固定端点白名单只有上述两个 GET；服务使用随机本地端口、自动清理的临时 JSON，模型密钥为空并关闭后台书籍采集。未创建或运行抓取任务、批准/拒绝页面、执行写操作、请求外部来源或会话/消息路径。
- `npm run lint` 与 `git diff --check` 通过。完整 `npm run test:api` 因含待批准的会话读取路径未运行；本次也未运行生产构建或浏览器测试，未访问正式数据或既有服务。


## 2026-11-04 创作者目录重复 GET 幂等性续测

- `npm run test:creator-api` 现为 13 项通过、0 失败。分别重复读取 `/api/articles` 与 `/api/videos`，验证 HTTP 200 和完整 JSON 响应与首次读取一致。
- 固定端点白名单仅含上述两个 GET；服务运行于随机本地端口，使用自动清理的临时 JSON。没有写入文章、请求媒体、触及正式数据或既有服务。
- `npm run lint` 与 `git diff --check` 通过。完整 `npm run test:api` 因含待批准会话读取路径未运行；本次也未运行构建或浏览器测试，未访问身份或会话/消息路径。


## 2026-11-04 六语言窄屏移动模块矩阵回归

- 环境：`npm run build` 生成的隔离静态生产构建；Vite preview 仅服务构建文件，系统 Chromium 151 / SwiftShader；视口 390×844 CSS px。真实点击语言菜单切换中文、英语、阿拉伯语 RTL、西班牙语、法语、俄语。
- 逐语言访问移动导航的 12 个入口：地球、动态、宇宙、社区、Messenger、AI HUB、图书馆、知识、网页浏览器、创作者、视频、游戏；共 72 个语言/模块样本。所有样本的文档 `lang`/`dir` 正确，`documentElement.scrollWidth` 与 `body.scrollWidth` 均等于 390px；无页面级横向溢出和 JavaScript page error。
- 应用发出的 48 个 API GET 全部由浏览器侧 Playwright 路由在送达网络前截获，返回合成空 fixture；没有启动 Express/API 后端。包含的身份、会话目录、书架/书签/保存文章等 GET 仅收到本地合成响应；没有测试认证/授权或私信行为，未请求消息详情接口。非 GET 请求数为 0；外网请求数为 1 且被阻断；唯一控制台错误是阻断资源对应的 `net::ERR_FAILED` 提示。
- 未读取或写入正式 `server_data.json`，未触及既有服务、配置或日志。结论限于模拟器中的语言方向和页面级宽度；不代表实体设备、真实 GPU、完整页面业务功能、翻译准确性或真实 API 的通过。


## 2026-11-04 系统减少动态效果偏好续测

- 全局 `prefers-reduced-motion: reduce` 仅在用户系统偏好开启时缩短动画和过渡并关闭平滑滚动，不删除控件或静态提示。
- `npm run test:motion`：6 项静态 CSS 契约检查通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。单独检查生成文件，确认发布 CSS 含媒体查询及四项覆盖声明。
- 本地 Chromium 计算样式尝试未在工具等待限时内完成，未记为浏览器实测通过；实体设备、屏幕阅读器及其他辅助技术仍待验证。未访问 API、正式数据或既有服务。


## 2026-11-04 WORLD LIBRARY 外部来源连接器

| 命令 | 覆盖范围 | 当前结果/注意事项 |
|---|---|---|
| `npm run test:library-connectors` | 全离线 provider 回归：Open Library 元数据权限边界，Gutenberg 官方 OPDS 查询、单书详情、命名空间语言/下载链接，Internet Archive 字段化 Advanced Search、权利与 OCR 门控，来源开关、限流缓存、精确 ISBN/DOI 去重；`fetch` 被 mock，未发起外网请求。 | 2026-11-04：通过。相似标题不会模糊合并；缺失权利默认不允许本地复制。 |
| `npm run test:library-api` | 随机本地端口和临时 JSON 下的连接器目录、逐源开关、统一搜索路由校验、空/未知源处理、metadata-only 与已禁用来源入库拒绝，以及本地图书目录/详情既有契约。 | 2026-11-04：20 项通过、0 失败。仅对白名单本地路由发请求，未读写正式数据；测试禁用外部源。 |
| `npm run test:library-connectors:live` | 需联网的有限实时烟测：Open Library 与 Internet Archive 各一次限量检索；Project Gutenberg 官方 OPDS 检索→单书 OPDS 核验→临时 EPUB 书目保存→本地详情读取。 | 2026-11-04：通过。临时文件自动清理；不下载 EPUB 正文、不访问真实用户书架、不修改正式数据库。外部 API 瞬时不可用时可失败，故不作为默认离线测试。 |

上述测试未验证全站 UI、实体手机、完整学术/文化遗产资源矩阵或所有现有功能的端到端路径；其结果不可表述为 WORLD LIBRARY 总体验收完成。
