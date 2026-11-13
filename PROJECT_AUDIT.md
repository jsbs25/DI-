# PROJECT_AUDIT.md
独一 ONE｜全项目资产与状态审查（阶段一）

- **审查时间（UTC）**：2026-11-13
- **审查基准（唯一来源）**：`origin/main` @ `d5f042fb7e85f080e024805e50f8c76c37883b8f`（短 `d5f042f`）
  - 提交时间：2026-11-13 14:25:41 +0000
  - 作者：EARTH ONE Engineer
  - 说明：`feat(brand): add one-click brand system entry button on login screen`
- **远端交叉确认**：`git fetch origin`（EXIT=0）后 `git rev-parse origin/main` 与 `git ls-remote origin refs/heads/main` / `HEAD` 一致，均指向 `d5f042f`。
- **审查方式**：只读（Git/文件树/源码与配置静态检查 + 关键路径 grep）。**未修改源码、未 reset/clean/push、未删 stash、未改 `server_data.json`/`server_data/`/books/uploads/数据库/用户数据、未部署、未改 Cloudflare/DNS。**
- **审查位置**：独立 worktree `/tmp/duyi-one-upgrade`（detached @ `origin/main`，干净）；原始项目 `/Users/mafucheng/Desktop/EARTH_ONE/earthone` 保持原状。

## 0. 环境与保护基线
| 项目 | 状态 |
|---|---|
| 原始本地仓库 | `/Users/mafucheng/Desktop/EARTH_ONE/earthone`，分支 `sync/fix-core-ux-to-main`，`HEAD=400b2e3`，`[ahead 12, behind 6]`，未提交修改 `M server_data.json`，stash 6 条，本地 `main=f6bfd81`（相对 `origin/main` ahead 253/behind 6） |
| 持久化数据（已存在，未触碰） | `server_data/`（含 `discovery.db*`、`books/`、`uploads/` 等）、`server_data.json`（本地改动保留） |
| 独立 worktree | `/tmp/duyi-one-upgrade`（创建前不存在；基于 `origin/main` 创建成功，`git status` 干净） |
| 既有 worktree（记录，不改动） | `/private/tmp/di-brand-worktree` (detached `f248fb0`)、`/private/tmp/di-main-deploy` (detached `359311a`) |

## 1. 提交基线（origin/main）
关键链路（均在 `origin/main`）：`39d8ce7` → `f248fb0` → `a7ef3d4` → `359311a` → `7cff160` → `d5f042f`（最新）。
- `39d8ce7`：3D 地球引擎与完整前后端源码初始基线（含 `DigitalGlobe/earthShaders/proceduralEarthTextures/sceneBuilders/globeNav/useImmersiveMode`、布局改造、server/src 体系）。
- `f248fb0`：`brand-identity/` 品牌文档与设计资产。
- `a7ef3d4`：交互式品牌工作室组件（`BrandIdentitySystem.tsx`/`brandLogos.tsx`）+ 路由/导航集成 + `public/brand-identity/svg(16)`、`png(16)`。
- `359311a`：行星平台/3D 地球/宇宙引擎与实时 feed 完整化（含 `server_data.json` 变更于仓库层面记录）。
- `7cff160`：`?module=brand` 免登录直达预览（`src/App.tsx`）。
- `d5f042f`：登录页品牌一键入口（`src/App.tsx`、`src/components/auth/LoginPage.tsx`）。

## 2. 前端资产清单（origin/main）

### 2.1 入口与构建配置
| 文件 | 状态 | 备注 |
|---|---|---|
| `index.html` | 存在 | Vite SPA 入口，viewport/主题色/PWA meta、预连字体、`/src/main.tsx`；标题/OG 仍为 “EARTH ONE …” 文案（品牌命名与页面层统一需在后续阶段核对） |
| `src/main.tsx` | 存在 | React 19 挂载、PWA `registerSW`、`/api` 基址改写（`apiBase.ts`）与 fetch 封装 |
| `src/App.tsx` | 存在 | 主路由/tab 状态机；含 `globe/universe/chat/browser/aihub/library/knowledge/feed/profile/search/calls/brand` 等；`?module=brand` 直达、品牌工作室渲染、globe/tools/immersive 逻辑 |
| `src/apiBase.ts` | 存在 | `VITE_API_BASE`/同源 API 基址解析 |
| `vite.config.ts` | 存在 | React+Tailwind，`VITE_BASE`，PWA（`vite-plugin-pwa`，manifest/icons/workbox，`navigateFallbackDenylist` 含 `/api/` `/ws`），`@` alias，`dedupe react/react-dom` |
| `tsconfig.json` | 存在 | `strict` 未显式开启、`bundler` 解析、`noEmit`、排除 `dist/cloudflare` |
| `package.json` | 存在 | `dev/start: tsx server.ts`，`build: vite build`，`lint: tsc --noEmit`；依赖含 React19/Vite8/Three/Express/WS/LiveKit/epub/pdf 等 |
| `bun.lock` | 存在 | 锁文件（`package-lock.json` 不在 `origin/main`） |

### 2.2 源码目录结构
- `src/components/`：`ai, auth, brand, browser, chat, commercial, community, crawler, creator, dev, games, globe, intro, knowledge, layout, learning, library, profile, search, social, video`
- `src/universe/`：`UniverseEngine.tsx`、`SolarSystemDirectory.tsx`、`MoonAcademy.tsx`、`MoonSpaceObservatory.tsx`、`PlanetTelemetryDrawer.tsx`、`SaturnSpace.tsx`、`VenusCreativeStudio.tsx`、`VenusMusicSpace.tsx`、`celestialBodies.ts`、`planetEcosystems.ts`、`proceduralPlanets.ts`
- `src/hooks/`：`usePWAInstall.ts`
- `src/services/calls/`：`api.ts`、`media.ts`（LiveKit 客户端侧）
- `src/utils/`：`aiSessionHistory.ts`、`aiStream.ts`、`geoData.ts`
- `src/i18n/translations.ts`、`src/types/`（含 `index.ts`、`electron-browser.d.ts`）

### 2.3 关键模块（存在性/引用线索）
| 模块 | 关键文件 | 静态核验 |
|---|---|---|
| 3D 地球引擎 | `components/globe/DigitalGlobe.tsx`、`earthShaders.ts`、`proceduralEarthTextures.ts`、`sceneBuilders.ts`、`globeNav.ts`、`useImmersiveMode.ts` | 全部存在；`App.tsx` 引用 `DigitalGlobe`/`globeNav`；引擎内引用 shader/纹理/场景构建（实现级渲染/释放/降级需运行时与浏览器验证） |
| 品牌系统 | `components/brand/BrandIdentitySystem.tsx`、`brandLogos.tsx`；`components/auth/LoginPage.tsx`；`layout/Sidebar.tsx`、`layout/CommandPalette.tsx` | 存在并集成（tab/导航/命令面板/登录入口/`?module=brand`）；资源路径 `/brand-identity/svg|png` |
| 认证 UI | `components/auth/{AuthModal,LoginPage,AccountSecurityModal,OnboardingModal}.tsx` | 存在 |
| 即时通信（前端） | `components/chat/GlobalMessenger.tsx`、`services/calls/*`、`server/calls|messengerWs` 对应后端 | 存在（生产可用性取决于后端/Worker 迁移与绑定，见第 4 节） |
| AI（前端） | `components/ai/AIHub.tsx`、`HolographicAICompanion.tsx`、`utils/aiStream.ts`、`aiSessionHistory.ts` | 存在 |
| 搜索/浏览器/图书馆/知识 | `components/search`、`browser/*`(含 PDF/EPUB/音视频/隐私面板)、`library/*`、`knowledge/*`、`crawler/*` | 存在（部分能力依赖后端/外部服务） |
| 宇宙/星球生态 | `universe/*`、`components/games/*`、`components/learning/*`、`components/social/*`、`components/creator/*` | 存在 |
| 布局/PWA/离线 | `layout/{Navbar,Sidebar,AppDock,CommandPalette,OfflineIndicator,PWAInstallButton}.tsx`、`hooks/usePWAInstall.ts` | 存在 |

### 2.4 静态资源与品牌资产
| 位置 | 内容 | 数量/状态 |
|---|---|---|
| `public/brand-identity/svg/` | `duyi-one-*` SVG | **16** 文件（存在） |
| `public/brand-identity/png/` | `duyi-one-*` 2x 透明 PNG | **16** 文件（存在） |
| `brand-identity/` | `BRAND_IDENTITY_SYSTEM.md` + `assets/svg|png-export-notes` 等设计源/导出 | **21** 文件（存在） |
| `public/` 其他 | `favicon.ico/svg`、`apple-touch-icon.png`、`pwa-192x192/512x512/maskable-512x512.png`、`earth-one-*`、`assets/earth/*`、`_redirects`、`saturn_daily.json` 等 | 存在（与“独一 ONE”品牌完全统一程度需逐页/逐资源目视与构建后验证） |

## 3. 后端资产清单（仓库内，origin/main）

### 3.1 运行入口与服务端
- `server.ts`：Express + Vite dev 集成 + `http`/`ws` + 大量 `/api/*` 路由（认证/用户/隐私/AI/搜索/图书馆/音乐/爬虫/发现/知识/通信/上传等），含会话、CORS/Origin 信任、静态/SPA 回退逻辑（生产形态依赖部署目标）。
- `server/` 模块：
  - 认证/隐私/存储：`store.ts`、`privacy.ts`、`privacyPolicy.ts`、`otp.ts`、`smsProvider.ts`、`mailProvider.ts`、`channelIntegrations.ts`、`db/schema.sql`、`db/migrateFromJson.ts`
  - AI：`aiGateway.ts`、`aiConversation.ts`、`ai/providers/openAICompatibleProvider.ts`
  - 通信/通话：`messengerWs.ts`、`calls/{index,service,signals,store,types}.ts`（含 LiveKit token/信令相关服务端逻辑）
  - 内容/检索/爬取：`jupiterSearch.ts`、`webFetcher.ts`、`youtubeSearch.ts`、`youtubeMusicSearch.ts`、`bilibiliCrawler.ts`、`musicStore.ts`、`bookCrawler.ts`、`bookHarvester.ts`、`islamicLibraryCrawler.ts`、`openImageCrawler.ts`、`knowledgeGraph.ts`、`seedKnowledge.ts`、`libraryReadingAi.ts`、`libraryEpubSecurity.ts`、`notificationPolicy.ts`
  - 集成/发现：`integrations/libraries/index.ts`、`discovery/{types,database/db,classifiers,connectors,deduplication,scheduler,search}/*`

### 3.2 脚本与测试（仓库内）
- `scripts/`：`crawl_youtube.py`、`migrate_earth_identity.mjs`、`sync_to_github.sh`（**含 force 推送逻辑，已列为禁用脚本**）及大量 `test_*.ts/jsx/mjs`（API/AI/浏览器/通信/calls/库/搜索/运动可访问性/并发等）与 `tests-security/`。
- **未在本阶段执行**构建、安装依赖或测试（按阶段顺序与只读核验要求）。

## 4. 生产环境与部署形态（已知/可核实范围）

| 组件 | 状态/说明 |
|---|---|
| Cloudflare Worker | `earthone-api`（生产）；ASSETS 托管前端 `dist`；**部分迁移**后端（非完整 Express）。最新核验基线版本 `1ef0789b-ba34-4184-afaa-54a2b0454c5d`（以 Cloudflare 实际为准） |
| 技术/兼容入口 | `https://earthone-api.emilygharrisc58.workers.dev/`、`https://earthone.xn--dqry4os3s3gb.com/` |
| 正式品牌域名目标 | `https://燃灯同学.com`（`https://xn--dqry4os3s3gb.com/`）— **根域未绑定 `earthone-api`**（历史阻塞：DNS 记录冲突/权限可见性限制；当前为 522/超时风险态，需授权与 DNS 侧处理） |
| D1 | `earth-one-db`（绑定存在）；**禁止清空/迁移/改生产数据**（未经授权） |
| Worker 源码/配置在仓库内 | `origin/main` 中**未检出** `wrangler.toml/json` 或专用 Worker 源码目录；`public/_redirects` 存在。生产运行脚本/绑定/变量存在于部署侧与既往部署工件（与仓库 `server.ts` 非同一运行时） |
| R2/Durable Objects/其他 | 仓库未见明确绑定声明；生产是否配置需以 Cloudflare 控制台/部署配置为准（此前健康信号显示 messenger/presence 等能力受限，**不可假定已完整可用**） |
| 环境变量/CORS/Cookie/Session | 生产侧已知含 `COOKIE_SAMESITE`、`CORS_ORIGINS`、`DEV_LOGIN_ENABLED`、`ENVIRONMENT` 等（具体值与密钥不得输出）；同源 API/会话在正确域名与 Worker 行为下工作，根域接入前无法在根域验收 |

## 5. 功能与页面清单（静态审查：存在/接线/风险）

| 区域/功能 | 前端存在 | 后端/生产依赖 | 静态结论 |
|---|---|---|---|
| 首页/3D 地球（DigitalGlobe） | 是 | `/api/globe/*` 等 | 代码与依赖存在；真实 WebGL 渲染/性能/降级/移动端 **未在本阶段实测** |
| 宇宙/星球生态 | 是 | 部分数据/服务 | 模块存在；交互与数据完整性待运行验证 |
| 品牌规范工作室（tab + `?module=brand`）+ 登录入口 | 是 | 静态资产 `/brand-identity/*` | 组件与路由/入口已接入；生产静态资源 MIME/缓存一致性此前存在风险信号，**需构建与线上实测** |
| 认证（登录/注册/会话） | 是 | Worker/D1 或 Express | UI 与 API 路径存在；生产为部分迁移，真实登录/注册/会话保持需按环境验证（禁改真实用户） |
| AI 对话/模型/流式 | 是 | `/api/ai/*`、上游模型 | 前后端代码存在；生产可用性受上游与 Worker 实现影响 |
| 即时通信/在线/历史/WS/WebRTC 通话 | 是（Messenger+calls） | `messengerWs`/`calls`/Express 与 Worker 能力、可能需 DO/媒体服务 | **代码存在但生产等价性高风险/未证实**（部分迁移架构） |
| 图书馆/阅读器/EPUB-PDF/搜索上传下载 | 是 | `server/library*`、存储绑定 | 实现存在；文件持久化与 Worker 兼容性待逐项核验 |
| 搜索/浏览器/爬虫/音乐/知识/发现 | 是 | 多服务与外部源 | 模块丰富；外部依赖与配额/合规/可用性待验证 |
| 个人资料/社区/创作者/商业/游戏/学习 | 是 | 对应 API/存储 | 页面存在；功能完整度与数据真实性需逐页点击与 API 验证 |
| PWA/离线/安装 | 是 | SW/manifest/icons | 配置存在；更新与缓存策略需发布后验证 |
| 导航/命令面板/侧栏/移动端布局 | 是 | — | 组件存在；统一性与可用性需多端测试 |

**已识别风险/待办方向（不在本阶段修改）**：品牌在全站（标题/favicon/PWA 命名与视觉）一致性；HTML 旧资源引用与静态 MIME/缓存；Express↔Worker 功能差异与未迁移 API；实时通信与媒体在免费生产架构下的可行性；本地独有修复（AI/移动端/WS/通话/Safari 等）与 `origin/main` 的合并策略；`?module=brand` 与登录门禁的产品行为一致性校验。

## 6. 审查结论
- `origin/main@d5f042f` 已包含 3D 地球引擎全套模块、独一 ONE 品牌组件与 16+16 资产/文档、登录品牌入口与品牌页路由、主要前端页面与 `server.ts`+`server/*` 后端源码、构建与测试脚本；可作为**阶段二构建基准**（须在独立 worktree 执行并结合后续阶段测试/部署验证）。
- 生产运行形态与仓库 Express 不完全等价；根域名与部分高级后端能力存在明确阻塞/未验证项。
- 本地存在需保护的未提交修改、stash 与独有提交，已在 `LOCAL_FEATURE_PRESERVATION.md` 记录，**不得丢弃或盲目覆盖**。

---
*本报告为阶段一交付物（只读审查结果）。*
