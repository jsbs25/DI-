# EARTH ONE Browser Blank Start Report

## Scope
- 仅处理 JUPITER 浏览器打开/新标签页时网页内容区域出现大量文字的问题。
- 未修改 Server A、Server B、通信系统、代理/下载/权限/网络配置、Electron 版本（45.2.3）、`persist:one-browser`、Cookie/浏览记录/持久化 Session 逻辑。
- 未删除地址栏、标签页、前进/后退/刷新/搜索/网页加载状态等功能。
- 未执行 `git reset --hard`、`git clean -fd`，未覆盖无关文件，未删除用户数据，未提交敏感/构建产物。

## 1. 根因：多余文字来自哪里
打开浏览器/新标签页初始页为 `jupiter://home`（`JUPITER_HOME_URL`）。当 `activeTab.url === JUPITER_HOME_URL` 时，渲染分支位于：

- **文件/组件**：`src/components/browser/WebBrowser.tsx`
- **位置（修改前）**：内容区渲染中 `activeTab.url === JUPITER_HOME_URL` 分支（约 2827 行起，原实现）
- **初始化/默认逻辑**：
  - `getInitialBrowserUrl()` 默认返回 `JUPITER_HOME_URL`（无有效 deep link 时首次打开即 home）。
  - 初始 tab：`url: initialUrl`，`readerMode: !browserEngine || initialUrl === JUPITER_HOME_URL || ...`，因此首屏进入该分支。
  - `handleNavigate(JUPITER_HOME_URL)`（修改前）会新建并切到 home 标签；`handleNewTab()` 新建 `jupiter://home` 标签。
  - Electron 侧 `browser:selectTab`（`electron/main.ts`，修改前）仅对 `http/https` 创建/加载 WebContentsView，内部 `jupiter://home` 未做内部页专门处理。

**原显示内容（冗长文字/UI文案）**：徽标 `ONE BROWSER`、标题 `Explore Beyond Boundaries.`、说明段落（“JUPITER 统一搜索 EARTH 内容与公开网络来源，并以阅读、查看器或原生 Chromium/网页预览方式打开结果。结果与可用性取决于真实来源与配置。”）、首页搜索表单、快捷站点按钮（NASA Earth/Wikipedia/arXiv/Project Gutenberg/GitHub）、三张说明卡片（“真实搜索”“沉浸阅读与查看”“诚实边界”及其描述）。这些构成“网页内容区域里一大堆文字”。

## 2. 实际修改的文件
- `src/components/browser/WebBrowser.tsx`
  - 将 `JUPITER_HOME_URL` 内容分支替换为干净空白容器：`<div className="h-full min-h-full w-full" aria-label="新标签页" />`（不显示介绍/帮助/占位文字，不自动搜索/结果）。
  - `handleNavigate(JUPITER_HOME_URL)`：改为在当前标签重置为干净 home（不新建标签、不记录访问、不触发搜索/加载），清空地址栏输入与搜索/错误/内容状态，保持 `readerMode: !browserEngine` 以配合内容区渲染。
  - `handleNewTab()`：新建 `jupiter://home` 标签并设 `readerMode: true`、清空输入与搜索/错误状态，不自动访问/记录/加载测试页。
- `electron/main.ts`
  - `browser:selectTab`：识别内部页 `jupiter://home`/`about:blank`，创建/复用 tab 并设置 `url/title(JUPITER)/loading=false/navigated=false`，停止已存在 webContents 加载，避免原生视图对内部页产生异常加载；正常同步布局与状态广播。`http/https` 行为保持不变。
- `electron-dist/main.cjs`、`electron-dist/preload.cjs`（由 `node scripts/build-electron.mjs` 重新生成，反映上述 Electron 侧修复；本次未提交）。
- `dist/*`（由 `npm run build` 重新生成；本次未提交）。

未修改：`electron/preload.ts`、`BrowserFrame.tsx`（经检查无需改动即可满足本问题）、代理/下载/权限/网络相关逻辑、`persist:one-browser`、Server A/B/通信代码。

## 3. 如何解决
- 根治内容区文案来源：移除 `jupiter://home` 渲染分支内所有说明/教程/快捷入口/卡片文字，改为空白容器；地址栏、标签栏、工具栏与导航/搜索能力仍由外围 UI 提供（未删除）。
- 统一 home/new-tab 行为：打开与新建标签均落在干净 `jupiter://home`，不自动导航、搜索、加载测试页或展示调试/接口/状态文本。
- Electron 内部页一致性：主进程对内部 home/blank 做显式状态处理并停止残留加载，配合渲染层 `readerMode`/空白渲染，确保原生 WebContentsView 不覆盖出内容、内容区保持干净。
- 会话/Cookie/持久化：未清除、不改 `persist:one-browser`；会话恢复仍按既有逻辑（仅恢复已保存的有效 http(s) 标签，见原实现）。

## 4. 测试结果

| 测试 | 结果 | 说明 |
|---|---|---|
| A：首次打开（关闭后重开 JUPITER，内容区无多余文字/代码/调试/自动搜索） | BLOCKED | 已完成静态修复与构建（renderer + electron-dist），并确认 dev server `http://127.0.0.1:3000` 返回 200；当前执行环境无法可靠启动并可视化/交互验收 Electron GUI（桌面窗口与 WebContentsView 内容区）以给出“实际通过”。需在本机图形环境执行：启动 web 服务后 `node scripts/start-electron.mjs`，目视确认首次打开内容区空白。 |
| B：新建标签页（内容区干净，无冗长文字） | BLOCKED | 同上；代码路径已改为新建干净 `jupiter://home` 空白标签，但未完成 GUI 实测。 |
| C：输入网址（Google/GitHub 可正常加载显示） | BLOCKED | 未在本次 GUI 环境中实测 Chromium 加载；导航/加载逻辑未针对性删除，仅修复 home/内部页处理。需 GUI 实测确认。 |
| D：关闭后重新打开（初始页干净，会话/Cookie 不被无故清除） | BLOCKED | 未改 Cookie/Session/`persist:one-browser` 清理逻辑，代码层面保持原行为；未完成带持久化会话的重启 GUI 实测。 |
| E：原有功能（地址栏/搜索/标签页/前进/后退/刷新） | BLOCKED | 未删除相关 UI 与处理函数；未完成 GUI 回归实测。 |
| 构建验证：`npm run build` | PASS | Vite 构建成功（`dist/` 已生成）。 |
| 构建验证：`node scripts/build-electron.mjs` | PASS | Electron main/preload/proxy 编译成功（`electron-dist/` 已更新）。 |
| 运行前置：dev server 可达 | PASS | `curl http://127.0.0.1:3000/` 返回 200（本次启动用于前置检查）。 |

## 5. 未完成项与限制
- **GUI 测试 A–E 未实际通过/未完成**：受当前环境对 Electron 桌面 GUI 的可视化与交互验证限制，未能给出 PASS；按要求标记为 BLOCKED/未完成实测。
- 因 GUI 未通过，本次 **未执行 git commit / push**，且不宣称任务完成。

## 6. 其他问题/说明
- 工作区存在大量与本任务无关的既有修改与未跟踪文件（如 `server.ts`、`server/store.ts`、`server_data.json`、globe、备份/数据文件等）；本次仅针对浏览器空白启动问题做最小改动，未触碰这些内容。
- `WebBrowser.tsx` 中仍保留 JUPITER 搜索结果页、阅读/查看器、爬虫视图等既有功能与文案，它们仅在用户主动搜索/打开内容时出现，不属于“浏览器刚打开时网页内容区域自动显示”的场景。
- 若后续 GUI 实测发现 `jupiter://home` 在特定引擎状态下仍有残留显示，可进一步在 `browser:setActive/setBounds` 与 `selectTab` 同步路径上强制隐藏内部页对应原生 view（本次已在 `selectTab` 做 stop/状态清理，通常足够）。

## Git 安全
- 已保护已有修改与用户数据；未进行破坏性 git 操作；未提交 `server_data.json`、备份、密钥、`.env`、构建产物。
