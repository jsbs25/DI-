# LOCAL_FEATURE_PRESERVATION.md
独一 ONE｜本地独有功能与数据保护报告（阶段一）

- **生成时间（UTC）**：2026-11-13
- **对比基准**：`origin/main@d5f042fb7e85f080e024805e50f8c76c37883b8f`（`d5f042f`）
- **本地核验仓库**：`/Users/mafucheng/Desktop/EARTH_ONE/earthone`
  - 当前分支：`sync/fix-core-ux-to-main`，`HEAD=400b2e3`
  - 相对 `origin/main`：**ahead 12 / behind 6**（分叉）
  - 本地 `main`：`f6bfd81`，相对 `origin/main` **ahead 253 / behind 6**（分叉历史，未纳入本次逐提交移植表，但必须保护）
  - 未提交修改：`M server_data.json`
  - Stash：6 条（全部保留）
  - 未跟踪文件：无
- **原则**：**不丢弃、不强推、不 reset/clean、不删 stash、不覆盖 `server_data.json`/`server_data/`/books/uploads/数据库/用户数据、不直接合并全部本地提交**。所有移植需在独立分支/worktree、逐项对比、逐项测试、逐项提交。

## 1. 必须保护的本地资产

| 资产 | 位置/状态 | 保护措施 |
|---|---|---|
| 原始工作区与分支历史 | `/Users/mafucheng/Desktop/EARTH_ONE/earthone`，`sync/fix-core-ux-to-main`、`main` 及本地独有提交 | 只读作为参照；升级在独立 worktree（`/tmp/duyi-one-upgrade`）进行 |
| 未提交修改 | `server_data.json`（已修改） | 禁止覆盖/回退；后续如需对齐以副本与人工确认处理 |
| 持久化数据 | `server_data/`（`discovery.db*`、`books/`、`uploads/` 等）、`server_data.json` | 禁止删除/清空/迁移覆盖；生产 D1 未经授权不变更 |
| Git stash（6 条） | 见 §4 | 禁止 `stash drop/clear`；逐条审阅后再决定保留/提取 |
| 本地独有提交 | 当前分支 12 个 + 本地 `main` 独有历史 | 逐个审查差异与价值，择优移植，不盲合 |

## 2. 当前分支 12 个本地独有提交（逐项分析）

> 说明：“最新 main 实现情况”基于 `origin/main@d5f042f` 静态核对；`5c44363` 为与远端 `39d8ce7` 不同历史根的初始提交，文件差异极大且大量表现为相对远端的“删除/回退”视图（因分叉），不可直接作为功能增量合入判断。最终“是否已实现/可移植”需在移植阶段结合 `git diff`/`range-diff` 与运行验证确认。

| # | 提交 | 日期/说明 | 主要变更文件（name-status） | 本地意图/价值 | 最新 main 对照（初判） | 差异与风险 | 依赖/环境 | 测试方法建议 | 建议 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `400b2e3` | 2026-11-13 15:52:22 +0300<br>`fix(ai,ui): harden web AI errors and stabilize mobile inputs (16px, safe-area, dvh)` | M `index.html`, `src/components/ai/AIHub.tsx`, `src/components/ai/HolographicAICompanion.tsx`, `src/index.css` | AI 错误兜底/提示与移动端输入（16px 防缩放、safe-area/dvh）体验加固 | `AIHub.tsx`/`HolographicAICompanion.tsx`/`index.css`/`index.html` 在 `origin/main` 均存在且后续有演进 | **高价值候选**；与远端 UI/品牌重构及 AI 流式实现可能冲突，需逐 hunk 对比避免回退远端改动 | 浏览器输入法/移动端视口 | 构建+真实移动端/浏览器：AI 失败提示、输入不缩放、不被键盘遮挡、dvh 布局 | **保留并择优移植**（独立分支，按文件拆分提交） |
| 2 | `07314a1` | 2026-11-13 13:47:19 +0300<br>`Merge branch 'fix/core-ux' into sync/fix-core-ux-to-main` | MM `server.ts` | 合并 `fix/core-ux` 的服务端改动 | `server.ts` 在 `origin/main` 有后续变更 | 合并提交本身不宜 cherry-pick；需追溯其引入的实际 server 差异 | Node/Express 运行环境 | 对比合并引入的 server 变更与 `origin/main`，必要时提取等效补丁并回归 API/WS | **不直接移植合并提交**；提取有效 diff 后单独评估 |
| 3 | `63d22c7` | 2026-11-13 04:45:05 +0300<br>`fix(mobile): restore vertical scrolling for universe and keep canvas touch-pan-y` | M `src/App.tsx`, `src/universe/UniverseEngine.tsx` | 宇宙页移动端纵向滚动与画布 `touch-pan-y` | `App.tsx`/`UniverseEngine.tsx` 在 `origin/main` 已大幅演进（含新模块与品牌） | **高价值候选**；触控与滚动策略易与 3D 交互冲突 | 触屏设备/移动浏览器 | 移动端实测宇宙页滚动、画布拖拽/缩放不互相破坏 | **择优移植**（对照远端交互实现） |
| 4 | `53d27bd` | 2026-11-13 04:27:35 +0300<br>`fix(universe): improve popup sizing, scroll, close and mobile lightbox behavior` | M `src/universe/MoonSpaceObservatory.tsx`, `src/universe/PlanetTelemetryDrawer.tsx` | 弹层尺寸/滚动/关闭与移动端灯箱体验 | 同名文件在 `origin/main` 存在 | 可能与远端 UI 调整重叠 | 移动端 | 弹窗可滚动可关闭、灯箱行为正确、无视口溢出 | **择优移植** |
| 5 | `4028aba` | 2026-11-13 04:27:35 +0300<br>`fix(mobile): reposition universe agent launcher/panel to avoid bottom nav occlusion` | M `src/components/ai/HolographicAICompanion.tsx` | 智能体入口/面板避让底部导航 | 文件在 `origin/main` 存在且有后续改动 | 与 `400b2e3` 同文件相关改动需合并审视 | 移动端安全区/导航布局 | 小屏下入口可点、面板不被遮挡 | **择优移植**（与 #1 联合评估） |
| 6 | `7bd656e` | 2026-11-13 04:24:43 +0300<br>`fix(music): make venus crawler fetch and persist real open audio with status feedback` | M `server.ts`, `server/musicStore.ts`, `src/universe/VenusMusicSpace.tsx` | 金星音乐爬取真实音频、持久化与状态反馈 | `musicStore.ts`/`VenusMusicSpace.tsx` 在 `origin/main` 存在；`server.ts` 演进明显 | **功能价值高但迁移风险高**：依赖服务端运行形态与存储（本地文件 vs Worker/D1/R2）；生产 Worker 为部分迁移 | Node 服务、网络抓取、持久化路径 | 本地 Express 环境验证抓取/保存/状态；生产需单独架构适配（不得假定可用） | **保留，分环境评估**（先本地/Express 路径验证，再谈 Worker 适配） |
| 7 | `7cc28fa` | 2026-11-13 01:22:11 +0000<br>`fix(server): bind Vite ws option to httpServer on port 3000` | M `server.ts` | Vite HMR/WS 绑定修复（dev） | `origin/main` `server.ts` 可能已不同实现 | 仅影响开发体验/特定端口；与生产 Worker 无直接关系 | 本地 dev (`tsx server.ts`) | dev 启动、HMR 正常、无 WS 绑定错误 | **择优移植**（限 dev 场景验证） |
| 8 | `355a651` | 2026-11-13 01:20:07 +0000<br>`fix(server): prevent /ws WebSocketServer from aborting Vite HMR upgrades` | M `server.ts` | 避免 `/ws` 与 HMR upgrade 冲突 | 同上 | 与 #7/#12 相关，需整体看 `server.ts` WS 处理 | dev/WS | HMR 与业务 WS 并存不互断 | **择优移植**（与 #7 联合） |
| 9 | `018b6c2` | 2026-11-13 01:04:55 +0000<br>`fix(layout): restore vertical scrolling in Saturn cinema and scrollable planetary/hub modules` | M `src/App.tsx`, `src/components/browser/WebBrowser.tsx`, `src/universe/UniverseEngine.tsx`, `src/universe/VenusMusicSpace.tsx` | 土星影院/行星与 hub 模块滚动恢复 | 相关文件在 `origin/main` 存在并演进 | 与 #3 有重叠文件（`App.tsx`/`UniverseEngine`） | 多端布局 | 目标页面可纵向滚动、无内容截断 | **择优移植**（合并同文件修复统一回归） |
| 10 | `12ba0d0` | 2026-11-13 00:38:04 +0000<br>`feat(messenger): mobile UI overhaul, friend discovery, real-time WS & WebRTC voice/video calls` | M `.gitignore`, `server.ts`, `server/calls/service.ts`, `server/calls/types.ts`, `server/messengerWs.ts`, `src/App.tsx`, `src/components/auth/LoginPage.tsx`, `src/components/chat/GlobalMessenger.tsx`, `src/main.tsx`, `src/services/calls/api.ts`, `src/services/calls/media.ts`；A `server/calls/signals.ts` | **高价值**：即时通信移动端改造、好友发现、实时 WS、WebRTC 音视频通话 | `origin/main` 亦含 messenger/calls/LiveKit 相关实现（文件存在），但实现细节与完成度可能不同 | **高冲突高收益**：与远端后续认证/品牌/通话架构可能分叉；生产依赖 WS/DO/媒体服务与持久化，**不得假定已可用** | WS 服务、WebRTC/LiveKit 配置、信令/存储、双账号测试环境 | 两测试账号真实收发消息、在线状态、通话建立/挂断、刷新后历史（在可控环境）；禁止生产造数 | **最高优先级审查**：先做 diff 矩阵与功能对照，能移植则分模块（UI/信令/媒体/存储）逐项移植与测试 |
| 11 | `c69b1ac` | 2026-11-13 00:23:47 +0000<br>`fix(main): safely override window.fetch via Object.defineProperty for Safari compatibility` | M `src/main.tsx` | Safari 下 fetch 覆盖兼容 | `src/main.tsx` 在 `origin/main` 已有 fetch 包装逻辑 | 可能与远端实现等价或冲突 | iOS Safari / Safari | Safari 不报 fetch 重定义错误，API 请求正常 | **择优移植**（对比远端现实现后决定） |
| 12 | `5c44363` | 2026-11-13 00:19:44 +0000<br>`feat(earth-one): initial commit of complete global digital world platform` | 大量 A（全量平台初始导入，另含 `.gitignore`） | 本地分叉历史的“全量基线”提交 | `origin/main` 的 `39d8ce7` 为另一条历史的初始完整提交；相对 `origin/main` 视图表现为大量缺失/删除（分叉产物） | **不可直接 cherry-pick/合并**；否则会破坏远端已演进的 3D/品牌/架构。价值在于：可能包含已在后续本地提交中延续的早期实现线索 | — | 仅作溯源对比，不作直接移植 | **不移植**；仅保留历史用于对比审计 |

## 3. 本地 `main` 分支独有历史（保护说明）
- 本地 `main@f6bfd81`（`fix(globe): make immersive mode state toggle explicit with exit and hud fade`）相对 `origin/main` **ahead 253 / behind 6**，包含大量历史提交（迁移/CI/Pages/通信/隐私/通话原型/部署文档等）。
- **处理原则**：视为独立历史资产，**不覆盖、不删除、不强制对齐远端**；后续如需吸收其中有效改动，必须单独挑选并在独立分支与 `origin/main` 逐项对比验证后移植。

## 4. Git Stash 明细（6 条，全部保留）

| Stash | 基线/说明 | 主要文件 | 潜在价值/风险 | 处理建议 |
|---|---|---|---|---|
| `stash@{0}` | On `sync/fix-core-ux-to-main`: `wip-server-data-json-sync-branch` | M `server_data.json` | 可能含本地数据状态差异；**高敏/持久化相关** | 保留；勿自动应用，需人工比对 |
| `stash@{1}` | On `fix/core-ux`: `wip-local-server-data-keep` | M `server_data.json` | 同上 | 保留 |
| `stash@{2}` | On `main`: `wip-before-logo-main-sync` | M `index.html`；A `public/apple-touch-icon.png`、`public/earth-one-cover.jpg`、`public/earth-one-icon.png`；M `public/favicon.ico`、`public/favicon.svg`；A `public/pwa-192x192.png`、`public/pwa-512x512.png`、`public/pwa-maskable-512x512.png`；M `src/components/auth/LoginPage.tsx`、`src/components/browser/WebBrowser.tsx`、`src/components/layout/Navbar.tsx`、`src/main.tsx`、`vite.config.ts` | 品牌/PWA/入口 UI 相关改动，可能与 `origin/main` 已有实现重复或冲突 | 保留；与远端品牌资产/配置逐文件 diff 后择取 |
| `stash@{3}` | On `main`: `temp-unrelated-worker2` | M `cloudflare/worker/src/index.ts` | 本地存在 Worker 源码改动痕迹（仓库 `origin/main` 无该路径）；生产 Worker 实际来源需确认 | 保留；**不擅自应用到生产**，先核实来源与等价性 |
| `stash@{4}` | On `main`: `wip: SaturnSpace.tsx before pull 2026-11-08` | M `src/universe/SaturnSpace.tsx` | 土星页面本地调整 | 保留；对比 `origin/main` 后择取 |
| `stash@{5}` | WIP on `main`: `f52bc5d` test… | M `desktop/browser-engine.cjs`、`desktop/main.cjs`、`server.ts`、`server/aiConversation.ts`、`src/App.tsx`、`src/components/layout/Navbar.tsx`、`src/components/layout/Sidebar.tsx`、`src/index.css`、`src/universe/MoonAcademy.tsx` | 跨桌面/服务端/前端的混合 WIP，范围大、风险高 | 保留；拆分审查，避免整体应用 |

## 5. 移植执行计划（阶段七前置约束）
1. **基准**：一律以 `origin/main` 最新（当前 `d5f042f`，执行前复核）为目标基线，在独立分支/worktree 操作。
2. **顺序（建议）**：先低风险 UI/兼容（#11 Safari、#1 输入体验按需拆分、#4/#5/#3/#9 布局滚动）→ dev 体验（#7/#8）→ 业务能力（#6 音乐、#10 即时通信/通话分模块）→ `server.ts` 相关合并提取（#2）→ stash 择取；#12 仅溯源。
3. **每项流程**：对比差异 → 形成补丁/重实现方案 → 适配 `origin/main` → 本地/隔离环境测试 → 单项提交 → 必要时推送与部署（按环境授权）。
4. **禁止事项**：批量合并 12 提交；用本地旧实现覆盖远端 3D/品牌/架构演进；在生产写入测试数据或改真实用户/密钥/付费资源；以“文件存在/构建成功/HTTP 200”替代功能验收。

## 6. 结论
- 本地存在**明确且可能有价值**的独有修复/功能（尤其移动端 UX、AI 输入/错误处理、滚动与弹层、音乐抓取持久化、WS/HMR dev 修复、即时通信与 WebRTC 方向、Safari 兼容），同时与 `origin/main` 存在结构性分叉与冲突风险。
- **阶段一要求已满足**：已完成保护性盘点与逐项初判记录；后续任何移植均须遵循“保护优先、逐项验证、分批提交”的策略。

---
*本报告为阶段一交付物（保护与移植规划依据），不构成代码变更。*
