# ONE MUSIC — 阶段一：音乐系统审计

> 审计时间：2026-11-13 (UTC)  
> 审计分支/目录：`/tmp/duyi-one-music`（隔离 worktree），分支 `feature/one-music` @ `b4cb51d`（基于 `origin/main@d5f042fb7e85f080e024805e50f8c76c37883b8f`，已保护性整合本地独有音乐提交 `7bd656e`）。  
> 原始仓库未修改：`/Users/mafucheng/Desktop/EARTH_ONE/earthone`（`sync/fix-core-ux-to-main@400b2e3`, `M server_data.json`, 6 stashes 保持不变）。

## 0. 保护状态与差异基线

- **GitHub 最新 main**：`origin/main = origin/HEAD = d5f042f`（`feat(brand): add one-click brand system entry button on login screen`）。
- **本地独有音乐提交（必须保护）**：`7bd656e` `fix(music): make venus crawler fetch and persist real open audio with status feedback`（作者 2026-11-13 04:24:43 +0300），变更文件 `server.ts`、`server/musicStore.ts`、`src/universe/VenusMusicSpace.tsx`。该提交**不在 `origin/main`**，存在于本地历史（`sync/fix-core-ux-to-main` 含之）。
- **本次处理**：已将 `7bd656e` 以 patch 形式应用到 `feature/one-music` 并提交为 `b4cb51d chore(music): preserve 7bd656e real-audio crawl/persist/status fixes on origin/main baseline`。后续重构**不得删除、替换或破坏**其真实音频获取/持久化/状态反馈能力。
- **本地音乐相关数据**：原仓库 `data/venus_music_catalog.json` 存在（129 行，种子+目录数据）。隔离 worktree 自带同名文件；重构/测试不得破坏用户音乐数据或上传文件。
- **未创建/未修改**：生产环境、DNS、D1、生产 Worker、收费云资源；未执行 `reset --hard`/`clean -fd`/`push --force`。

## 1. 现有音乐前端结构

| 文件 | 职责 | 备注 |
|---|---|---|
| `src/universe/VenusMusicSpace.tsx` (~1019 行, 含 7bd656e 后更大) | 金星音乐馆主界面：曲库加载、搜索、YouTube/B站/双端爬取、固定源爬虫触发、音频播放/嵌入播放、频谱可视化、底部播放器、爬虫控制区、曲目网格 | 当前为单体组件，状态与 UI 强耦合；`tab=venus` 时在 `App.tsx` 中以 `contents/hidden` 常驻挂载 |
| `src/universe/VenusCreativeStudio.tsx` (50 行) | 金星创作工坊（连接 CreatorHub 文章发布/阅读），明确无独立音乐库/授权播放源 | 非播放模块，需区分“音乐馆”与“创作工坊”定位 |
| `src/App.tsx` | 路由/Tab：`venus` → `<VenusMusicSpace lang onBack>`；`isSpaceExperience` 包含 `venus` | 音乐与全局播放器无独立壳层 |
| `src/components/layout/Sidebar.tsx` | 导航项：`{ tab: 'venus', icon: Music2, label: { zh: '音乐馆', en: 'MUSIC' } }` | 需升级为 ONE MUSIC 品牌/信息架构 |
| `src/components/layout/CommandPalette.tsx` | 命令：`venus` → 音乐馆 | 同上 |
| `src/components/globe/globeNav.ts` | 地球仪导航含音乐馆入口 | 需保持可达 |
| `src/components/ai/HolographicAICompanion.tsx` | 语义意图命中“音乐/金星/venus”跳转 `venus` | 需保留 |
| `src/components/crawler/CrawlerDashboard.tsx` | 行星标签含 `venus: 金星·音乐艺术`，资源添加可选 planet=venus | 与发现/爬虫系统弱关联，非播放路径 |

**移动端现状（代码观察）**：顶部 sticky、底部播放器 `fixed bottom-[calc(62px+env(safe-area-inset-bottom))]`（为全局底栏预留）、嵌入浮窗位置适配 safe-area、横向滚动筛选 `overflow-x-auto`、网格 `grid-cols-1 sm:2 lg:4`。但**无独立移动导航/迷你播放器/全屏播放页/底部导航上方分层规范**，播放器与页面内容/嵌入窗易遮挡，桌面侧栏式 IA 不存在。

## 2. 现有音乐后端结构

| 文件 | 职责 |
|---|---|
| `server/musicStore.ts` | `MusicStore`：内存 `tracks[]` + 文件持久化；种子曲目 `SEED_TRACKS`（公开/CC 音频直链）；`getTracks/getTrack/searchTracks`；`crawlExternalMusic`（7bd656e 后改为真实开放音频抓取+持久化+状态/错误返回） |
| `server/youtubeMusicSearch.ts` | 多来源音乐发现（元数据+可嵌入/可播放 URL）：URL 直解析（YouTube/SoundCloud/Mixcloud/Bandcamp/直链音频）、Internet Archive 音频检索、Piped/YouTube 直抓搜索、`searchYouTubeMusic` 并行聚合去重、`resolveMusicEmbedUrl` |
| `server.ts` | 音乐 API 路由 + `searchOnlineMusicStreams`（YouTube 页面抓取流式结果）+ Bilibili 搜索接入；注册 `musicStore`、`searchYouTubeMusic/resolveMusicEmbedUrl` |

**音频文件存储**：当前**无本地音频二进制下载/落盘目录**；持久化对象是**曲目元数据与可播放/嵌入 URL**（写入 `data/venus_music_catalog.json`）。播放依赖远端直链或官方嵌入。

## 3. 爬虫来源与适配器

| 来源/适配器 | 入口 | 类型 | 7bd656e 状态 |
|---|---|---|---|
| Internet Archive（开放音频直链） | `musicStore.crawlExternalMusic` (`archive.org`)；`youtubeMusicSearch.searchInternetArchiveAudio` | 真实抓取 metadata+可播放文件，持久化入 catalog | ✅ 保留并强化（真实抓取、去重、错误/计数返回） |
| FMA/开放集合（经 IA 索引） | `musicStore.crawlExternalMusic` (`freemusicarchive/fma`) → IA 开放集合检索 | 真实抓取可播放项 | ✅ 保留 |
| Jamendo | `musicStore.crawlExternalMusic` | 需官方 `client_id`，当前未配置 → 明确报错/不可用提示 | ✅ 明确状态反馈（不伪造） |
| Bilibili（实时检索/嵌入） | `searchBilibiliMusic` → `/api/bilibili/search`；crawl 入口对 B站/YouTube 提示走实时检索 | 官方嵌入/公开接口，**非持久化音频文件下载** | ✅ 保留 |
| YouTube（实时检索/嵌入） | `searchYouTubeMusic` → `/api/music/youtube-search`（`youtubeMusicSearch` + 直抓/Piped/IA 并行）；`/api/music/search` 内 `searchOnlineMusicStreams` | 官方嵌入/可用流，合规限制下 | ✅ 保留 |
| SoundCloud/Mixcloud/Bandcamp/直链音频 URL | `youtubeMusicSearch.resolveMusicEmbedUrl/trackFromUrl` | URL 解析为嵌入或直链播放 | ✅ 保留（通过 youtube-search/解析能力） |
| 双端并发爬取 | 前端 `searchDualMusic` 并发 `/api/bilibili/search` + `/api/music/youtube-search` | 聚合展示 | ✅ 保留并增强计数/失败反馈 |

## 4. 数据获取流程

1. **本地/持久化曲库**：`GET /api/music/tracks?genre=` → `musicStore.getTracks` 读取内存（启动自 `data/venus_music_catalog.json` 或 seed）。
2. **搜索**：`GET /api/music/search?q=&genre=` → 有 query 时并发/合并 `searchOnlineMusicStreams`(YouTube 页面抓取) + `musicStore.searchTracks`，按 id/videoId 去重；无 query 返回本地/分类。
3. **YouTube/多源解析**：`GET /api/music/youtube-search?q=&limit=` → `resolveMusicEmbedUrl`(直链/URL) 或 `searchYouTubeMusic`(IA+YouTube direct+Piped 并行去重)。
4. **B站检索**：`GET /api/bilibili/search?q=&limit=` → `searchBilibiliVideos`。
5. **持久化爬取/收录**：`POST /api/music/crawl {sourceDomain,keyword}` → `musicStore.crawlExternalMusic`（开放源真实抓取→去重→`save()`；返回 `success/crawledCount/savedCount/newTracks/errors/message`）。
6. **前端加载**：按 genre 分支触发本地加载、B站专搜、YouTube 专搜或通用搜索；支持双端合并与固定爬虫面板。

## 5. 音频持久化流程

- **存储位置**：`const DATA_DIR = path.resolve(process.cwd(), 'data'); const MUSIC_FILE = path.join(DATA_DIR, 'venus_music_catalog.json');`
- **加载**：`init()` 读 JSON → 解析数组成功则用之，否则落回 `SEED_TRACKS` 并 `save()`。
- **保存**：`save()` → `JSON.stringify(tracks, null, 2)` 写入 `MUSIC_FILE`。
- **持久化内容**：曲目对象（id/title/artist/album/genre/duration/audioUrl/embedUrl?/cover/source/sourceUrl/license/crawledAt/bpm/description 等）与可播放/可嵌入链接；**不下载音频文件到本地磁盘**（7bd656e 聚焦“真实开放音频获取+持久化目录条目+状态反馈”）。
- **去重**：按 `id` 或 `sourceUrl`（7bd656e 增强）及标题等避免重复入库；新抓取 `unshift` 后保存。
- **风险**：`DATA_DIR` 绑定 `process.cwd()/data`（相对 cwd），在不同启动目录/部署环境需注意路径一致性；生产 Cloudflare/Worker 环境与本地 Express+文件系统模型不同（本次不改生产）。

## 6. API 清单（音乐相关）

| 方法 | 路径 | 请求 | 响应要点 |
|---|---|---|---|
| GET | `/api/music/tracks` | `?genre=` | `{success, tracks}`（本地/持久化目录） |
| GET | `/api/music/search` | `?q=&genre=` | `{success, query, count, tracks}`（在线流+本地合并去重；异常回退本地） |
| GET | `/api/music/youtube-search` | `?q=&limit=` | `{success, query, tracks, mode}`（embed-url 或 search；失败 502） |
| GET | `/api/bilibili/search` | `?q=&limit=` | `{success, query, count, results, videos}`（兼容字段） |
| POST | `/api/music/crawl` | `{sourceDomain, keyword}` | `{success, crawledCount, savedCount, newTracks, source, keyword, errors, message}`（7bd656e：失败/限制返回 200+success:false+errors，异常 500 带错误信息） |

**兼容性要求**：重构必须保留上述接口契约与前端既有调用能力；可扩展字段但不破坏现有消费者。

## 7. 播放器状态管理

- **位置**：`VenusMusicSpace` 组件内 `useState/useRef`（无全局 store/context/zustand/redux 专用音乐模块）。
- **核心状态**：`tracks, loading, searchQuery, selectedGenre, currentTrackIndex, isPlaying, currentTime, duration, volume, isMuted, isLoop, showEmbedPlayer`，爬虫/搜索状态 `isCrawling, crawlNotice, ytSearching, crawlerSource, crawlerKeyword`。
- **Refs**：`audioRef`(HTMLAudioElement), `canvasRef`, `audioCtxRef/analyserRef/sourceNodeRef`(Web Audio 频谱), `animFrameRef`, `mountedRef`, `noticeTimerRef`, `loadAbortRef`。
- **播放模式**：`playable==='embed' || embedUrl` → iframe 官方嵌入（B站/YouTube 等），提示用户用嵌入控件；`audioUrl` → `<audio crossOrigin="anonymous">` + Web Audio 可视化 + 进度/音量/循环/上下首。
- **不足**：播放状态不跨视图/设备持久化、不与桌面/移动壳层共享、无统一队列模型/收藏/最近播放/Media Session/失败恢复策略的产品级抽象；嵌入与原生音频控制语义不完全统一。

## 8. 桌面与移动端现状

- **桌面**：单页纵向内容（Hero+可视化+爬虫控制+搜索/筛选+网格+底部固定播放器），无左侧导航/多视图（Home/Explore/Search/Library/Playlists/Recently Played）信息架构。
- **移动**：响应式网格与 sticky/固定元素并存，但非独立移动 IA（无底部主导航、无迷你播放器条+全屏播放页分层、触控目标与内容遮挡风险需系统性处理、safe-area 仅局部覆盖）。
- **一致性**：同一组件内状态一致，但缺少可恢复/可同步的播放器与库状态模型；收藏/最近播放/队列等产品能力未成体系。

## 9. 本地独有音乐功能清单（必须保护）

来源：`7bd656e`（已整合为 `b4cb51d`）+ 本地历史实现。

1. **真实开放音频获取**：`crawlExternalMusic` 对 Internet Archive（及 FMA/开放集合索引）执行真实检索→metadata→可播放文件解析（非纯 mock 注入）。
2. **音频持久化/目录收录**：新抓取曲目去重后 `unshift` 入 `tracks` 并 `save()` 到 `data/venus_music_catalog.json`；返回 `savedCount/newTracks`。
3. **获取状态反馈**：返回并展示 `success/crawledCount/savedCount/errors/message`；前端区分成功/空结果/受限/异常提示；`/api/music/crawl` 失败场景返回结构化错误（含 200+errors 与 500 兜底）。
4. **多来源/适配器能力**：IA/FMA 索引抓取、Jamendo 未配置明确提示、B站/YouTube 走实时检索入口提示、`youtubeMusicSearch` 多源并行（IA/YouTube direct/Piped）与 URL 解析、B站搜索嵌入、YouTube 搜索/直链解析、直链音频与多平台嵌入识别。
5. **原有播放能力**：HTMLAudio 直链播放、B站/YouTube 等官方嵌入播放、进度/音量/循环/上下首、频谱可视化、离线 fallback 曲目。
6. **错误处理**：请求 abort/timeout、搜索/爬取异常捕获与用户可见反馈、无结果/受限说明。
7. **数据结构/接口**：`MusicTrack` 字段与 `/api/music/*`、`/api/bilibili/search`、`/api/music/crawl` 行为需向后兼容。

> **禁止**：以 UI 重构为由删除/替换爬虫与真实获取能力；禁止用虚假歌曲、假搜索、假播放状态替代真实功能；未经批准不得放弃本地独有能力。

## 10. 参考项目研究（许可证与可借鉴范围）

| 项目 | 许可证 (GitHub API) | 可借鉴方向（仅理念/交互模式，不复制品牌/商标/图标/整套代码） | 约束 |
|---|---|---|---|
| [lucashanak/music-seeker](https://github.com/lucashanak/music-seeker) | **未检出 license 文件（API 无 license）** → 视为默认保留所有权利 | 仅学习公开 README/界面信息架构思路（多源搜索与状态呈现思路层面）；**不复用代码** | 无明确授权不得复制代码/资源 |
| [ardianryan/Convx-Web](https://github.com/ardianryan/Convx-Web) | **GPL-3.0** | 可研究布局/播放器交互模式；**避免引入其代码片段**，以免触发 GPL 传染与合规风险 | 强 copyleft，代码复用需满足 GPL；本项目优先自研实现 |
| [harshitethic/OpenTune](https://github.com/harshitethic/OpenTune) | **MIT** | 可借鉴首页/搜索/队列/播放状态组织的通用模式（在不复制具体实现与品牌前提下） | 需保留版权与许可声明（若未来明确复用代码）；当前以理念借鉴为主 |
| [monochrome-music/monochrome](https://github.com/monochrome-music/monochrome) | **Apache-2.0** | 可借鉴极简播放器/列表密度与状态反馈模式（理念层面） | 复用代码需保留 NOTICE/License；当前不直接复制代码/品牌 |

**结论**：本阶段以“研究交互与结构模式”为主，不复制任何项目品牌、商标、图标或整套代码；实现采用项目内自研组件与现有技术栈。

## 11. 阶段一结论与下一步（阶段二）

- 已完成：隔离环境、`7bd656e` 保护整合、前后端/API/爬虫/持久化/播放器/桌面移动现状与本地独有能力清单、参考项目许可证核查。
- **待后续阶段**：在不破坏现有 API 与音乐引擎的前提下，设计并实现 ONE MUSIC 产品级 UI/UX（桌面侧栏+主内容+底部播放器、移动独立 IA+迷你/全屏播放器）、统一播放器状态（队列/收藏/最近播放/恢复/Media Session 等可行项）、真实功能与响应式验证、分阶段 lint/build/test/提交推送。
- **生产限制**：未经单独批准不部署生产、不改 DNS/D1/生产 Worker、不创建收费资源。
