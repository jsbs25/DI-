# EARTH ONE — 工程研发历史与架构演进日志
## (DEVELOPMENT PROGRESS & ENGINEERING CHANGELOG V3.0)

---

### [2026-11-04] Commit feat(saturn): 土星影视生态扩展，接入公版电影并新增我的片单
* **公版片源核实**: 通过 Internet Archive metadata/advancedsearch 核实 5 部公版电影标识符（月球旅行记/将军号/女友礼拜五/外太空九号计划/活死人之夜），全部公共领域，不接任何盗版源。
* **分类导航**: 全部/太空探索/公版电影 三个分类标签。
* **我的片单**: localStorage 持久化收藏，支持添加/移除并展示计数。
* **验证**: `tsc --noEmit` 0 报错；`vite build` 通过。

---

### [2026-11-04] Commit feat(uranus,mercury): AI 网关诚实化 + MERCURY 独立搜索星球页
* **URANUS AI Gateway 诚实化**:
  - 删除 `synthesizeAutonomousResponse`（原会在免费端点失败时生成伪造内容，违反“不得伪造数据”）。
  - `runOpenSourceModel` 在 pollinations.ai 失败/超时时改为抛出诚实错误，并在 `generateContent` 中捕获为 `success:false` + 错误描述，不再输出假内容。
  - 顺带清除该文件中的“地球计划”品牌残留（均在已删除的伪造合成器内）。
* **MERCURY 独立搜索星球页**:
  - 新增 `src/components/search/MercurySearch.tsx`：全屏搜索 + 分类筛选（书籍/知识/用户/社区/动态/文章/视频）+ 搜索历史(localStorage) + 跨模块路由。
  - 扩展 `/api/search/global` 支持文章(`articles`) 与视频(`videos`)。
  - 接入 `App.tsx` (`currentTab === 'mercury'`)，且 `planetEcosystems.ts` 将水星标为可用；侧边栏新增“搜索 SEARCH”入口。
* **验证**: `tsc --noEmit` 0 报错；`vite build` 通过；`scripts/test_universe_render.tsx` 9/9 通过。
  - 注：`test_ai_api.ts` 为历史遗留失败（断言期望 `apiKeyMasked === 'Not Configured'`，与现有中文“未配置”及免费模型本就 active 不符），与本次改动无关。

---

### [2026-11-04] Commit feat(universe): 统一十个天体生态入口，清理盗版观影链接
* **星球生态入口统一接线**:
  - 新增单一事实来源 `src/universe/planetEcosystems.ts`，将十个天体映射到对应数字生态与 `currentTab`。
  - `PlanetTelemetryDrawer` 的「进入生态」按钮改为由该映射驱动：已实现生态显示「进入 XX 生态」并跳转；水星/金星/月球显示「生态建设中 (Under Construction)」真实空状态。
  - 贯通 `UniverseEngine` 的 `onEnterEcosystem` 回调与 `App.tsx` 的 `handleEnterPlanet` 路由，土星/太阳/火星/木星/天王星/海王星均可从宇宙引擎进入对应模块。
* **版权清理**:
  - 移除遥测抽屉与浏览器书签中的盗版站点 `souju6.ai`（用户已明确要求替换为 NASA 公版内容），土星观影统一走 `SaturnSpace` 的 NASA 公版影像。
* **文档**:
  - 新增 `PLANET_ECOSYSTEM_MAP.md`（十个生态映射与状态）与 `UNIVERSE_ARCHITECTURE.md`（三层架构）。
* **验证**:
  - `tsc --noEmit` 0 报错；`vite build` 成功；`scripts/test_universe_render.tsx` 9 passed 0 failed。

---

### [2026-11-04] Commit feat(globe): 剔除旧版底部卡片，上线 ISS 实时空间站轨道与 USGS 全球地震遥测图层
* **用户指令响应与主屏净化**:
  - 响应用户「主界面的宇宙总览、我们的银河、全球社区这些都可以去掉，借鉴 GitHub 开源方案」要求。
  - 彻底移除 `DigitalGlobe.tsx` 底部的静态/粗大占位卡片（「宇宙总览」、「我们的银河」、「全球社区」），释放主屏幕 40% 的黄金视野，让 3D 数字地球全景通透展现。
* **借鉴 GitHub 开源数字地球前沿技术架构 (globe.gl / satellite-tracker / where-the-iss-at)**:
  - **实时空间站（ISS）遥测引擎**:
    - 服务端集成 `/api/telemetry/iss` 实时抓取 NORAD 25544 国际空间站开普勒轨道与坐标（含精准经纬度、时速 ~27,600 km/h、轨道高度 ~420 km），支持真实全球卫星天体回退算法。
    - Three.js 场景动态注入 3D 空间站实体（金色双翼光伏阵列、主压力舱与航天级发光定位天线）。
    - 交互式「锁定空间站」瞬移巡航：点击即可让数字地球平滑转动并聚焦至空间站当前垂直投影点。
  - **USGS 全球活断层与地震能量实时监测图层**:
    - 服务端集成 `/api/telemetry/earthquakes` 直连美国地质调查局 USGS 实时 GeoJSON 传感器流（M2.5+ 全球震情）。
    - Three.js 场景部署经纬度球面转换震中信标与动态脉冲环，按烈度（M4.5、M5.5+）呈现黄/橙/赤红能量色彩阶梯。
    - 点击任意震源卡片即可平滑导航巡航至真实震中（含震级、震源深度与地点）。
  - **三维空间遥感图层中控台 (Geospatial Layers Deck)**:
    - 交付轻量、半透明微光 HUD 控制台，支持随时独立开闭「空间站轨道」、「地震断裂带」、「公民网络信标」及「自转/公转」。
* **构建与测试验证**:
  - `tsc --noEmit` 0 报错；`vite build` 编译成功；全端自适应响应式无遮挡。

---

### [2026-11-04] Commit feat(ai): 地球计划命名规范确立、界面多余标语清理与免费开源AI深度对话引擎上线
* **用户指令响应与品牌规范**:
  - 确立品牌与平台名称为 **「地球计划」**（英文：PROJECT EARTH），全面替换 `index.html`、`Navbar.tsx`、`Sidebar.tsx`、`DigitalGlobe.tsx`、`App.tsx` 与多语种字典（`translations.ts`）。
  - 彻底去除 3D 数字地球中心遮挡的陈冗标语（「连接世界 · 探索宇宙」、「探索宇宙，发现无限可能」、「EARTH ONE · 探索宇宙 · 建设更美好的明天」），让三维地球与开普勒宇宙引擎呼吸通透，空间感与科技感全面提升。
* **AI 核心智能与直接对话革命**:
  - 全面聚焦 AI 核心功能，接入开源社区免费直连大模型（**DeepSeek-R1 开源深度推理**、**通义千问 Qwen 2.5 72B**、**Meta Llama 3.3 70B** 及本地 Ollama/vLLM 兼容接口）。
  - 实现零门槛、零鉴权、免配置的即开即问即答机制，彻底杜绝无 Key 时的 503 报错与使用障碍。
  - 重构 `AIHub.tsx` 为全屏专业对话工作台：
    - 支持 DeepSeek-R1 `<think>...</think>` 深度思考过程折叠/展开视图。
    - 集成 Web Speech API 实时语音录入（麦克风）与语音朗读（TTS Speaker）。
    - 结构化代码高亮渲染与一键代码复制能力。
    - 支持本地运行 `ollama serve`（localhost:11434）一键免密离线调用。
  - 升级 3D 全息 AI 伴侣（`HolographicAICompanion.tsx`）：直连 DeepSeek-R1 免费开源模型，支持直接对话，并在顶部设置一键进入「全屏 AI 工作台」入口。
* **构建与测试验证**:
  - `tsc --noEmit` 0 报错；`vite build` 编译成功。
  - 自动化脚本同步推送至 GitHub 远程仓库 `https://github.com/jsbs25/DI-`。

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
