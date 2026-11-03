# EARTH ONE — 核心技术架构设计规格书
## (TECHNICAL ARCHITECTURE SPECIFICATION)

---

## 1. 总体系统拓扑 (System Topology)

```
[ Client Tier: React 19 SPA + Three.js PBR Engine ]
                    │
         HTTP / REST API (Bearer Token)
                    ▼
[ Application Server Tier: Express + Vite Middleware Pipeline ]
     ├── Auth & Earth ID Router (/api/auth)
     ├── Geospatial Globe Router (/api/globe)
     ├── Social Graph & Content Router (/api/posts, /api/users)
     ├── Messenger Router (/api/conversations)
     └── AI Gateway Router (/api/ai)
                    │
                    ├── Server Data Store Engine (server_data.json / PostGIS Ready)
                    └── Google Gemini 3.8 Flash SDK (with Search Grounding)
```

---

## 2. 核心架构分层标准 (Architectural Tiers)

### 2.1 表现层 (Presentation Tier)
- **React 19 + TypeScript**: 采用函数式组件与强类型 Hooks 状态治理。
- **Three.js WebGL 视口**:
  - `DigitalGlobe.tsx`: 地球三维数字孪生体。包含球面三角学投影 (`latLngToVector3`)、用户光标、数据流飞线、平滑镜头阻尼跟踪。
  - `UniverseEngine.tsx`: 日心太阳系全景视口。支持开普勒相对运动学模拟、多行星开普勒轨道线、NASA 科学常量对焦。
- **Tailwind CSS v4 + 响应式布局**: 具备 Apple 级别的留白、字阶与暗黑空间美学，全面杜绝廉价渐变与过饱和元素。

### 2.2 业务逻辑与接口层 (API & Controller Tier)
- **认证中间件 (`getAuthUser`)**: 从请求头的 `Authorization: Bearer <token>` 提取会话 Token 并解析出真实用户记录。
- **地理信息反向解析 (`resolveCoordinates`)**: 根据国家代码与城市名称精确反查全球坐标，自动处理经纬度偏置与隐私保护。
- **AI 安全代理 (`/api/ai/chat`)**: 客户端禁止直接调用大模型，由服务端统一管理 API Key、上下文提示词与多模态模型调用。

### 2.3 数据持久化层 (Persistence Tier)
- **Phase 1 (现已运行)**: 基于 Node.js 文件系统的原子化 JSON 事务引擎 (`server_data.json`)。通过临时文件写入和重命名，避免并发写入损坏数据。
- **Phase 2 (演进目标)**: 标准 PostgreSQL 16 关系数据库 + PostGIS 空间拓展，使用 Drizzle ORM 管理空间索引与关系外键。

---

## 3. 核心天体物理数据库规范 (Universe Engine Celestial Architecture)

所有太阳系天体均通过 `src/universe/celestialBodies.ts` 强类型统一注册：
- 严格记录天体物理事实：半径 (km)、质量 (kg)、重力 ($m/s^2$)、公转周期 (天)、自转周期 (小时)、轴倾角 (度)、已知卫星数量。
- 土星光环采用 Cassini-Huygens 测绘反照率参数，生成包含卡西尼环缝的高真实度同心微环结构。
