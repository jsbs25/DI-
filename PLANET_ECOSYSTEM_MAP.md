# EARTH ONE — PLANET ECOSYSTEM MAP

> 十个天体 ↔ 十个数字生态 的权威映射。
> 本表同时反映代码中的单一事实来源 `src/universe/planetEcosystems.ts`。

## 总体结构

```
UNIVERSE LAYER (src/universe/UniverseEngine.tsx)
        │ 点击天体 → 遥测抽屉 → 进入生态
        ▼
PLANET ECOSYSTEM LAYER (每个天体对应一个独立生态)
        │
        ▼
GLOBAL CORE (EARTH ID / AI Gateway / 搜索 / 通知 / 存储 / 权限)
```

## 映射表

| 天体 | 生态 | 定位 | 前端入口 (App.tsx `currentTab`) | 状态 | 说明 |
|---|---|---|---|---|---|
| ☀️ SUN 太阳 | WORLD LIBRARY | 全球数字图书馆与知识中心 | `library` → `DigitalLibrary` | ✅ 已实现 | 多书源 Connector、EPUB/PDF 阅读器、AI 阅读、中文经典采集器 |
| ☿ MERCURY 水星 | WORLD SEARCH | 全球搜索与信息发现中心 | `mercury` → `MercurySearch` | ✅ 已实现 | 独立搜索星球页：分类筛选 + 搜索历史 + 跨模块路由 |
| ♀ VENUS 金星 | MUSIC & ART | 音乐与艺术生态 | — | ❌ 未实现 | 无模块 |
| 🌍 EARTH 地球 | HUMANITY | 全球社交与人类连接 | `globe`/`feed`/`chat`/`community` | ✅ 已实现 | 社区、消息、身份、动态 |
| 🌙 MOON 月球 | GLOBAL ACADEMY | 全球教育与学习中心 | — | ❌ 未实现 | 外部仓库 `rengdeng-student` 未接入 |
| ♂ MARS 火星 | GAME UNIVERSE | 游戏与互动娱乐中心 | `game` → `GameCenter` | ✅ 已实现 | 棋类/问答等开源小游戏 |
| ♃ JUPITER 木星 | COSMIC BROWSER | 全球智能浏览器 | `browser` → `WebBrowser` | ✅ 已实现 | 标签/书签/历史/下载管理 + 桌面 Electron 原型 |
| ♄ SATURN 土星 | CINEMA UNIVERSE | 全球影视娱乐中心 | `saturn` → `SaturnSpace` | ✅ 已实现 | NASA 公版影像 + Internet Archive 公版电影，分类 + 我的片单(localStorage) |
| ♅ URANUS 天王星 | AI INTELLIGENCE | 全球人工智能中枢 | `aihub` → `AIHub` | ✅ 已实现 | 多模型 AI Gateway、Deep Research、工具集 |
| ♆ NEPTUNE 海王星 | CREATOR UNIVERSE | 全球创作者与数字媒体中心 | `creator`/`video` | ✅ 已实现 | CreatorHub + VideoCenter |

> 状态图例：✅ 已实现 / 🚧 骨架(部分功能) / ⚠️ 部分(无独立页) / ❌ 未实现

## 入口接线（本次改动）

`PlanetTelemetryDrawer` 中的「进入生态」按钮统一由 `PLANET_ECOSYSTEMS` 驱动：

- **已实现的生态** → 显示「进入 XX 生态」按钮，点击跳转到对应 `currentTab`。
- **未实现的生态**（水星/金星/月球）→ 显示「生态建设中 (Under Construction)」真实空状态，不伪造页面。

## 版权与数据红线

- 未配置的 API 必须显示「未配置」，不伪造在线数据。
- 影视/音乐/书籍仅用公共领域、开放许可或用户自有内容。
- 不接入盗版源、不绕过 DRM / 付费墙 / robots.txt。
