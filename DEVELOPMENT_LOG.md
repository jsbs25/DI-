# EARTH ONE — 工程研发历史与架构演进日志
## (DEVELOPMENT PROGRESS & ENGINEERING CHANGELOG V3.0)

---

### [2026-11-04] Commit bbba093 - 生产环境 React 依赖解耦与全息智能伴侣发布
* **工程问题排查**:
  - 用户在访问应用时触发 `Invalid hook call: null is not an object (evaluating 'resolveDispatcher().useState')`。
  - 经底层代码与 Vite 预编译分析，定位原因为 `App.tsx` 中使用 `lazy()` 动态加载组件时，Vite 将 `react` 打包进独立分块（`react-DpnUW31M.js`），与全局主 `react-dom` 共享调度器断链。
* **架构重构与修复**:
  - `vite.config.ts`: 引入 `resolve.dedupe: ['react', 'react-dom']`，强制整个项目生命周期单例化单一 React 运行时。
  - `src/App.tsx`: 将动态 `lazy()` 改造为编译期静态统一导入，彻底消除组件间分块的 React 实例分裂风险。
  - 升级 `HolographicAICompanion.tsx`: 部署具备 WebGL 3D 灵动光核的全息伴侣，支持一键语音输入与多城市经纬度飞跃联动。
  - 扩充 `GameCenter.tsx`: 交付 3D 太空避障战机、引力沙盒、星际国象等 5 款完整可玩游戏。
* **验证结果**:
  - `tsc --noEmit` 0 报错；`vite build` 1.2 秒构建成功。
  - 自动向 GitHub 远程仓库 `https://github.com/jsbs25/DI-` 推送提交 `bbba093`。

---

### [2026-11-04] Commit d8380cc - 全球竞技场 3D 游戏中心与 Three.js 物理沙盒发布
* **新增模块**:
  - `src/components/games/SpaceFlight3D.tsx`: 基于 Three.js 粒子星云、小行星碎屑与猎户座-X 飞船模型开发，支持 WASD 键盘和手机端触控虚拟摇杆，集成 Web Audio API 物理合成引擎。
  - `src/components/games/GravitySandbox.tsx`: 基于牛顿万有引力与欧拉积分的 N 体天体沙盒，支持动态拖拽初始速度矢量发射天体。
  - `src/components/games/SpaceChess.tsx`: 具备标准 8x8 棋盘、走子规则校验与局势估值 AI 的星际国际象棋。
* **验证结果**:
  - 5 款游戏逻辑在手机和电脑端全屏视口自适应，UI 遵循深邃宇宙科技质感。

---

### [2026-11-03] Commit ade8239 - 世界数字图书馆多语言与时间跨度过滤
* **新增功能**:
  - 在 `src/components/library/searchFilters.ts` 中引入语言代码归一化（支持 ISO 639-1 / 639-2 / 639-3 多层映射）。
  - 支持多世纪纪元跨度过滤（古代公元前、文艺复兴、启蒙运动、19世纪、20世纪现代）。
  - 集成 `scripts/test_library_search_filters.ts` 自动化回归验证。

---

### [2026-11-03] Commit 88945ce - 中文公版经典正文真实抓取保障
* **底层升级**:
  - 彻底清理任何伪造的预览占位符，采集器连接真实公版经典（包括《论语》、《道德经》、《史记》等）。
  - 拆分大容量书籍全文为单本独立持久化 JSON 文件，保护主数据存储性能。
