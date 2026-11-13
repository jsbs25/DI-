# BUILD_REPORT.md
独一 ONE｜阶段二（最新主线前端构建与基础修复）构建报告

- **报告时间（UTC）**：2026-11-13
- **阶段**：第二阶段（进行中）— 依赖安装、生产构建、品牌/静态资源与基础检查；**未执行生产部署、未修改 Cloudflare/DNS/数据库**
- **执行位置（独立 worktree）**：`/tmp/duyi-one-upgrade`（detached），原始仓库 `/Users/mafucheng/Desktop/EARTH_ONE/earthone` 未改动

## 1. 代码基准（再次实时核验）
| 项目 | 值 |
|---|---|
| 远端 | `origin https://github.com/jsbs25/DI-.git` |
| `git fetch origin` | 成功 |
| `origin/main`（`rev-parse` + `ls-remote refs/heads/main` 一致） | **`d5f042fb7e85f080e024805e50f8c76c37883b8f`**（短 `d5f042f`） |
| 最新提交 | 2026-11-13 14:25:41 +0000 — `feat(brand): add one-click brand system entry button on login screen` |
| Worktree HEAD | `d5f042f`（与 `origin/main` 一致） |

## 2. 环境与依赖
| 项目 | 结果 |
|---|---|
| Node | `v26.13.0` |
| npm | `11.20.0` |
| bun | 未安装（系统无 `bun` 命令） |
| 锁文件（`origin/main`） | `bun.lock`（无 `package-lock.json`） |
| 依赖安装 | `npm install --legacy-peer-deps --no-audit --no-fund` **成功**（新增 `node_modules/`；生成 `package-lock.json`，为本地 npm 安装产物，未提交） |
| 说明 | 首次 `npm install` 遇到 `esbuild`/`vite` peer 冲突（ERESOLVE），改用 `--legacy-peer-deps` 后完成；安装过程有若干 deprecated/脚本提示，未影响构建 |

## 3. 类型检查与构建
| 步骤 | 命令 | 结果 |
|---|---|---|
| Lint/类型检查 | `npm run lint`（`tsc --noEmit`） | **PASS**（退出成功，无错误输出） |
| 生产构建 | `npm run build`（`vite build`） | **PASS**（`✓ 1890 modules transformed`，`✓ built in 718ms`） |
| PWA | `vite-plugin-pwa` generateSW | **PASS**（precache 58 entries，生成 `dist/sw.js`、`dist/workbox-835c8c05.js`） |

### 构建告警（非失败，记录）
- Rollup/Vite 报告部分 chunk > 500 kB（如 `dist/assets/index-mNk_Nse7.js` ~2.93 MB，`pdf.worker.min` ~1.27 MB）— 性能优化建议，非本次构建失败。
- 动态导入提示：`src/components/browser/PdfDocumentViewer.tsx` 同时被动态与静态引用，未拆分到独立 chunk — 现有行为告警。

## 4. 构建产物与关键资源检查
| 检查项 | 结果 |
|---|---|
| 入口产物 | `dist/index.html` 引用 `/assets/index-mNk_Nse7.js`、`/assets/index-Uyyg2bf9.css`、`/assets/rolldown-runtime-COiEfhsA.js`、`/manifest.webmanifest` |
| 品牌资产（源码 → dist） | `public/brand-identity/svg` **16**、`png` **16** → `dist/brand-identity/svg` **16**、`dist/brand-identity/png` **16**（计数一致，已进入构建产物） |
| 品牌文档（仓库） | `brand-identity/BRAND_IDENTITY_SYSTEM.md` 及 `brand-identity/assets/*` 共 21 文件存在（文档资产，非前端运行时 dist 必需） |
| 品牌接线（源码） | `src/App.tsx`：`BrandIdentitySystem` 渲染（`currentTab==='brand'`）、`?module=brand` 处理；`src/components/auth/LoginPage.tsx`：品牌入口文案/`BrandMark` 引用；`Sidebar/CommandPalette/globeNav` 含品牌导航项 |
| 品牌引用（bundle） | 产物 bundle 含 `/brand-identity/svg/`、`/brand-identity/png/` 路径及品牌资源文件名引用（静态路径可解析） |
| 3D 地球模块（源码存在） | `src/components/globe/DigitalGlobe.tsx`、`earthShaders.ts`、`proceduralEarthTextures.ts`、`sceneBuilders.ts`、`globeNav.ts`、`useImmersiveMode.ts` 存在并被主应用引用（源码级确认） |
| Manifest | `dist/manifest.webmanifest`（`name/short_name: EARTH ONE`，`start_url/scope/id: /`，图标指向 `/pwa-192x192.png` 等） |
| Service Worker | `dist/sw.js`、`dist/workbox-835c8c05.js` 生成 |
| SPA 回退文件 | `dist/_redirects` 存在（内容 `/* /index.html 200`） |
| 源文件类型 | 品牌 SVG/PNG 源文件类型正确（`SVG Scalable Vector Graphics image` / `PNG image data ... RGBA`） |

## 5. 基础修复
- 本阶段 **未发现需修改源码的构建/类型错误**，`lint` 与 `build` 均通过；**无代码修复提交**。

## 6. Git/部署状态（本阶段归档时）
| 项目 | 状态 |
|---|---|
| 源码变更 | **无**（仅阶段文档归档） |
| 本次提交范围（计划） | `BUILD_REPORT.md`、`TEST_REPORT.md`、`PROJECT_AUDIT.md`、`LOCAL_FEATURE_PRESERVATION.md`（长期保存报告）；`phase2-evidence/` 截图与 `report.json`、`package-lock.json`、`node_modules/`、`dist/` 保留本地不提交 |
| `git push` | **仅当前阶段分支** `upgrade/phase-2-build-stability`（不推送 `main`） |
| 生产部署 / Cloudflare / DNS | **未执行** |

## 7. 已知风险与后续（非本阶段完成项）
- **认证后功能未验证**：3D 地球真实 WebGL/Shader/纹理/交互与降级、登录/注册/会话保持与刷新、AI 实际请求、即时通信与连接状态、Jupiter 实际搜索浏览、图书馆/文件/媒体实际操作、四种分辨率下登录后页面均因缺专用测试账号/可控后端条件而 **NOT TESTED**（详见 `TEST_REPORT.md`）。
- 生产线上历史风险（旧资产引用/品牌静态资源 MIME、缓存/SW 一致性）需部署后真实入口复核。
- 构建告警：大 chunk 与动态/静态混用导入提示；Express↔Worker 后端未全量对齐；`燃灯同学.com` 根域绑定仍受 DNS/权限阻塞（记录性风险）。
