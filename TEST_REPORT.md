# TEST_REPORT.md
独一 ONE｜阶段二（最新主线前端构建与基础修复）测试报告

- **报告时间（UTC）**：2026-11-13
- **基准**：`origin/main@d5f042fb7e85f080e024805e50f8c76c37883b8f`（`d5f042f`），独立 worktree `/tmp/duyi-one-upgrade`，分支 `upgrade/phase-2-build-stability`
- **说明**：每项结果标注 **PASS / FAIL / BLOCKED / NOT TESTED**；未虚报通过。未在生产环境造数/修改真实用户/数据库；未部署。
- **证据**：本地浏览器证据保留于 `phase2-evidence/`（截图与 `report.json`，未提交）；敏感信息扫描未发现账号/密码/真实 Cookie/Token/个人信息，截图为本地预览登录/品牌页，无凭证输入。

## 1. 结果总览

| 类别 | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---:|---:|---:|---:|
| 构建与静态完整性 | 6 | 0 | 0 | 0 |
| 本地预览/资源可达性（HTTP 烟雾） | 4 | 0 | 0 | 0 |
| 浏览器（未登录可达范围，Playwright Chromium 158） | 5 | 0 | 0 | 0 |
| 需认证/需真实后端/真实渲染验收 | 0 | 0 | 2 | 9 |

## 2. 明细

| # | 测试项 | 结果 | 证据/说明 |
|---|---|---|---|
| T1 | 依赖安装（npm，可构建） | **PASS** | `npm install --legacy-peer-deps --no-audit --no-fund` 成功（Node v26.13.0 / npm 11.20.0）；peer 冲突通过兼容参数解决 |
| T2 | TypeScript 类型检查 | **PASS** | `npm run lint` → `tsc --noEmit` 退出成功 |
| T3 | 生产构建 | **PASS** | `vite build` 成功（1890 modules，~718ms），PWA precache 58 entries；chunk 体积/动态导入告警非失败 |
| T4 | 品牌静态资产完整性（源码/产物） | **PASS** | `public/dist brand-identity svg=16 png=16`；`brand-identity/` 文档资产 21 文件存在 |
| T5 | 产物关键文件与引用 | **PASS** | `dist/index.html` 引用 `index-mNk_Nse7.js`/`index-Uyyg2bf9.css`；manifest/SW/workbox/`_redirects` 存在；bundle 含品牌路径引用 |
| T6 | 源码路由/入口接线（静态核验） | **PASS** | `App.tsx` 品牌 tab/渲染与 `?module=brand`；`LoginPage.tsx` 品牌入口；globe/brand 模块参与构建 |
| T7 | 本地预览：首页 HTTP | **PASS** | `vite preview` 127.0.0.1:4173：`GET /` → `200 text/html` |
| T8 | 本地预览：品牌 SVG 直链 | **PASS** | `GET /brand-identity/svg/duyi-one-origin-final-symbol-dark.svg` → `200 image/svg+xml` |
| T9 | 本地预览：品牌 PNG 直链 | **PASS** | `GET /brand-identity/png/duyi-one-origin-final-app-icon.png` → `200 image/png` |
| T10 | 本地预览：`?module=brand` 路由响应 | **PASS** | `GET /?module=brand` → `200 text/html`（HTTP 可达；页面内渲染见 T13） |
| T11 | 浏览器自动化（Playwright，无头）— 未登录范围 | **PASS（受限）** | Chromium 158.0.8127.18；`consoleErrors=0`、`pageErrors=0`、`requestFailed=0`、`badResponses=0`（`phase2-evidence/report.json`）。**仅覆盖未登录可达页面**，非全站 E2E |
| T12 | 3D 地球真实 WebGL 渲染/纹理/着色器/交互/释放/降级 | **NOT TESTED（需登录）** | 未登录访问首页/深链均落登录页（`canvasCount=0`），无法进入已认证 globe 视图；**未验证**真实 WebGL 渲染、Shader、纹理、交互与异常降级 |
| T13 | 品牌规范页（未登录）UI/渲染/入口/分辨率 | **PASS** | `/?module=brand` 免登录直达，`hasBrandContent=true`、`hasLoginGate=false`，`svgElements=13`；登录页“浏览品牌视觉识别系统”入口可点击跳转；390×844/430×932/768×1024/1440×900 截图与布局记录均 `overflowX=false`、可滚动内容正常；刷新后 URL/内容保持（证据截图见 `phase2-evidence/`） |
| T14 | 登录/注册/会话保持/页面刷新（认证流程） | **NOT TESTED（需登录）** | 未发现可用本地/专用测试账号与安全测试凭证；登录/注册入口在 UI 可见但**未执行**真实认证、会话保持、退出与刷新验证；禁止猜测凭证/改真实用户 |
| T15 | AI 页面及实际请求 | **NOT TESTED（需登录/后端）** | 需认证进入 AI 模块并对接可用后端/上游；未发起实际 AI 请求 |
| T16 | 全球即时通信及连接状态（WS/WebRTC，双账号） | **NOT TESTED（需登录/后端/双账号）** | 需可用实时后端与隔离测试账号；禁止生产造数；**不能以页面可打开视为通过** |
| T17 | Jupiter 搜索与浏览器（实际搜索/浏览行为） | **NOT TESTED（需登录/后端）** | 深链 `/jupiter/search?q=test` 未认证时回落登录页（`phase2-evidence/desktop-deeproute-jupiter.png`）；未验证认证后搜索结果、导航与内容加载 |
| T18 | 图书馆、文件和媒体模块（上传/下载/持久化） | **NOT TESTED（需登录/后端/存储）** | 需对应 API、存储与可控测试数据；未执行实际上传下载与持久化验证 |
| T19 | 四种分辨率下登录后页面 | **PARTIAL / 未认证后页面未测** | 390×844、430×932、768×1024、1440×900 下**登录页与品牌页**已截图验证（无横向溢出、内容可达）；**登录后各核心页面**因缺认证条件未覆盖 |
| T20 | 线上一致性/Cookie/CORS/SW 更新/桌面全站交互回归 | **NOT TESTED / BLOCKED（部署侧）** | 需对正式入口与真实后端/域名验证；未部署、未改生产配置；本地预览仅作参考 |

## 3. 结论与风险区分

### 已通过（有证据）
- 构建/类型检查/产物与品牌静态资源完整性（T1–T10）。
- 未登录浏览器烟雾与布局：登录页、品牌模块（含 `?module=brand` 免登录入口）、四种分辨率品牌/登录页截图，Playwright 无 console/page/request/HTTP 4xx+ 错误（T11、T13、T19 未登录部分）。

### 未测试（缺条件/未执行）
- **因需登录未测试**：3D 地球真实渲染与交互（T12）、登录/注册/会话保持与刷新（T14）、AI 实际请求（T15）、即时通信与连接状态（T16）、Jupiter 实际搜索/浏览（T17）、图书馆/文件/媒体实际操作（T18）、四种分辨率下**登录后**页面（T19 认证后部分）。
- 其他未覆盖：真实后端联调持久化、线上 Cookie/CORS/SW 行为、iOS Safari 真机与全站交互回归（T20 等）。

### 技术风险（已知/残留）
- 3D 地球（WebGL/Shader/纹理/性能/释放/降级）在认证后真实运行路径**未经浏览器实测**，仍为高风险待验项。
- 生产历史风险（旧资产引用/品牌静态资源 MIME 与缓存/SW 一致性）需部署后真实入口复核。
- 构建告警：大 chunk（~2.93MB 等）与动态/静态混用导入提示，可能影响首屏与缓存策略。
- 前端已建但部分能力依赖 Express/WS/D1/外部服务对齐；**不得以页面可打开视为功能通过**。
- 认证后全链路（消息/通话/上传/搜索/AI）在无专用测试账号与可控后端条件下无法安全验证。

## 4. 复现命令（worktree `/tmp/duyi-one-upgrade`）
```bash
npm install --legacy-peer-deps --no-audit --no-fund
npm run lint
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort
# Playwright 证据脚本输出：phase2-evidence/report.json 与截图（本地保留，不提交）
```
