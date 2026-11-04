# EARTH ONE — UNIVERSE ARCHITECTURE

EARTH ONE 是一个由多个数字世界组成的统一平台，分三层：

```
EARTH ONE
├── A. UNIVERSE LAYER      太阳系与数字生态入口
│   └── src/universe/UniverseEngine.tsx (Three.js)
│       ├── Sun / Mercury / Venus / Earth / Moon
│       ├── Mars / Jupiter / Saturn / Uranus / Neptune
│       └── PlanetTelemetryDrawer.tsx (遥测 + 进入生态入口)
│
├── B. PLANET ECOSYSTEM LAYER  每颗天体对应一个独立业务生态
│   ├── SUN      → DigitalLibrary  (library)
│   ├── EARTH    → DigitalGlobe / GlobalFeed / GlobalMessenger / CommunityList
│   ├── MARS     → GameCenter     (game)
│   ├── JUPITER  → WebBrowser     (browser)
│   ├── SATURN   → SaturnSpace    (saturn)
│   ├── URANUS   → AIHub          (aihub)
│   └── NEPTUNE  → CreatorHub / VideoCenter (creator / video)
│
└── C. GLOBAL CORE   所有生态共享的底层系统
    ├── EARTH ID        统一身份 (server/auth)
    ├── AI GATEWAY      统一多模型 (server/aiGateway.ts)
    ├── GLOBAL SEARCH   全局搜索 (GLOBAL_SEARCH)
    ├── NOTIFICATION    通知中心
    ├── CLOUD STORAGE   文件存储
    ├── USER PERMISSION 权限系统
    ├── TRANSLATION     翻译引擎 (i18n)
    └── DATA ENGINE     JSON 持久化 (server/store.ts)
```

## 关键约束

- 所有星球共享同一个 EARTH ID，切换生态无需重新注册。
- 每个星球拥有独立视觉气质与业务边界，但通过 `GLOBAL CORE` 互联。
- 已实现的生态通过 `src/universe/planetEcosystems.ts` 映射到 `currentTab`。
- 未实现的生态（水星/金星/月球）在 UI 中诚实显示「生态建设中」。

## 技术栈（保留现有，不擅自替换）

- 前端：React 19 + TypeScript + Vite 8 + Tailwind v4
- 3D 引擎：Three.js 0.187（`UniverseEngine`）
- 后端：Express + `tsx`
- 持久化：JSON（`server_data.json` + `server_data/books/*.json` 全文分文件）
- AI：统一 AI Gateway（`server/aiGateway.ts`），密钥仅存服务端环境变量

## 下一步建设优先级（见 DEVELOPMENT_ROADMAP.md）

1. SATURN 影视生态（分类/详情/片单，仅公共领域内容）
2. SUN 图书馆中文书籍体验（多页阅读、中文书源）
3. JUPITER 浏览器真实能力边界
4. URANUS AI Gateway 完善
5. 其余生态逐步接入
