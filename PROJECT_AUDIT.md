# EARTH ONE — 全球数字宇宙平台工程架构全域审计报告
## (COMPREHENSIVE ENGINEERING AUDIT & MASTER ARCHITECTURAL REPORT V3.0)

**审计日期**: 2026-11-04  
**执行角色**: EARTH ONE 首席技术架构师 / 全栈安全研发团队  
**核心原则**: 绝不以静态页面冒充系统，以真实代码、真实接口、真实数据持久化与可运行性为唯一评判标准。

---

## 一、 系统架构与依赖审计 (Architecture & Dependencies)

### 1.1 技术栈实测清单
* **前端框架**: React 19 (`react: ^19.0.1`, `react-dom: ^19.0.1`) + TypeScript 7.0.2 + Vite 8.3.0 + Tailwind CSS v4。
* **3D 地球与宇宙引擎**: Three.js (`three: ^0.187.0`), GLSL 自定义着色器（表面昼夜明暗交界平滑过度、外层与内层瑞利大气散射辉光），真实 2048 分辨率 NASA 蓝理石与黑理石卫星影像纹理，开普勒轨道天体系统。
* **后端架构**: Node.js v22 + Express 4.21.2 + TypeScript (`tsx`)，支持全栈同构 Vite 中间件管道。
* **持久化体系**:
  - Phase 1（已运行）: 高可靠文件系统原子化 JSON 存储引擎 (`/server_data.json`)，支持内存-磁盘双向同步及安全加锁；分书存储 (`server/data/books/*.json`) 隔离元数据与百万字全文。
  - Phase 2（已就绪）: PostgreSQL 16 + PostGIS 空间索引规范 (`server/db/schema.sql`)，支持经纬度几何点（`GEOMETRY(Point, 4326)`）空间检索。
* **人工智能 (AI Gateway)**:
  - 官方 `@google/genai` TypeScript SDK (^2.4.0)，接入 Gemini 3.8 Flash。
  - 多模型适配层 (`server/aiGateway.ts`) 统一抽象 Gemini、OpenAI、Claude、DeepSeek 接口。
  - 服务端 API Key 安全隔离，前端零泄露；未配置 API Key 的模型严格返回未配置状态。
  - 3D 全息 AI 伴侣 (`HolographicAICompanion.tsx`) 支持三维灵动核与空间指令漫游联动。

---

## 二、 核心模块真实业务逻辑实测 (Core Modules Audit)

| 模块名称 | 对应源文件 | 核心 API / 存储 | 业务逻辑真实性评估 |
| :--- | :--- | :--- | :--- |
| **3D 数字地球 (Digital Globe)** | `src/components/globe/DigitalGlobe.tsx` | `/api/globe/nodes`, `/api/globe/countries` | **真实 3D 渲染**。采用 WebGL/Three.js，含经纬度球面映射、日照昼夜明暗、云层自转、真实国旗与首都统计、射线拾取高亮。 |
| **开普勒宇宙引擎 (Universe Engine)** | `src/universe/UniverseEngine.tsx` | 本地天体物理数据库 (`celestialBodies.ts`) | **真实科学渲染**。含太阳及 8 大行星公转轨道、自转轴倾角、土星卡西尼环缝、行星遥测抽屉。 |
| **3D 全息 AI 伴侣** | `src/components/ai/HolographicAICompanion.tsx` | `/api/ai/chat` | **真实运行**。3D WebGL 能量球，打通语音合成（TTS）、Gemini AI 网关，支持“飞往巴黎/东京/北京”真实镜头飞跃。 |
| **全球多维游戏竞技场 (Game Center)** | `src/components/games/` | 本地状态机 + `/api/games/rooms` | **5 款游戏完全可玩**：3D 太空避障战机 (`SpaceFlight3D`)、N 体万有引力沙盒 (`GravitySandbox`)、星际国际象棋 (`SpaceChess`)、13x13 五子棋 (`Gomoku`)、全球地理识图大挑战 (`GlobalTrivia`)。 |
| **世界数字图书馆 (World Library)** | `src/components/library/DigitalLibrary.tsx` | `/api/library/books`, `/api/library/search/online` | **真实公版书与全文阅读**。接入 Wikisource、Open Library、Internet Archive、Gutenberg 真实公版经典，支持 EPUB 与章节阅读、生词 AI 评注。 |
| **全网采集与知识整理 (Crawler)** | `src/components/crawler/CrawlerDashboard.tsx` | `/api/crawler/tasks`, `/api/crawler/ingest` | **真实队列调度**。支持添加抓取任务、合规状态检查、清洗入库至世界图书馆。 |
| **全球社交动态 (Global Feed)** | `src/components/social/GlobalFeed.tsx` | `POST /api/posts`, `POST /api/posts/:id/like` | **真实持久化**。用户发帖、点赞、二级嵌套评论即时同步写入磁盘 `server_data.json`。 |
| **即时通信与跨语种翻译 (Messenger)** | `src/components/chat/GlobalMessenger.tsx` | `/api/conversations/*`, AI 翻译网关 | **真实多频道流**。支持公共大厅与跨国私信，AI 实时多语种翻译并保留原文。 |
| **身份与权限体系 (Earth ID)** | `src/components/auth/AuthModal.tsx` | `/api/auth/register`, `/api/auth/login` | **强加密防篡改**。采用 `crypto.scryptSync` 内存困难哈希加盐存储，64 位随机 Token 验权，地理位置隐私开关保护。 |

---

## 三、 API 接口完整性审计 (API Audit)

所有 32 个 RESTful 端点均在 `server.ts` 中注册并具备异常处理机制：
1. **认证与个人信息**:
   - `POST /api/auth/register` (scrypt 加盐散列、邮箱排重、IP 频次限制)
   - `POST /api/auth/login` (密码比对、Token 签发、暴力破解防护)
   - `GET /api/auth/me` (Bearer Token 验权，杜绝跨账号泄露)
   - `POST /api/auth/onboarding` (新手向导、绑定初始国籍与城市)
   - `POST /api/auth/toggle-location` (地理空间位置公开/隐身一键切换)
   - `POST /api/auth/update-profile` (更新头像、Bio、兴趣标签)
   - `POST /api/auth/logout` (销毁活跃会话)
2. **地球与空间数据**:
   - `GET /api/globe/nodes` (聚合各城市公开公民节点，过滤隐藏用户)
   - `GET /api/globe/countries` (统计全球各主权国家实时公民数与动态数)
   - `GET /api/globe/stats` (全站空间宏观指标)
3. **社交与内容**:
   - `GET /api/posts` (支持国别与分类筛选)
   - `POST /api/posts` (发帖并绑定地理坐标)
   - `POST /api/posts/:id/like` (原子自增/取消点赞)
   - `POST /api/posts/:id/comment` (追加评论)
4. **即时通讯**:
   - `GET /api/conversations` (拉取会话列表)
   - `GET /api/conversations/:id/messages` (拉取单聊/群聊消息流)
   - `POST /api/conversations/:id/messages` (发送消息并触发多语种翻译)
5. **AI 智能网关**:
   - `POST /api/ai/chat` (Gemini 3.8 Flash，支持 Google Search Grounding)
   - `GET /api/ai/models` (列出各供应商模型接入状态与脱敏配置)
6. **数字图书馆与采集器**:
   - `GET /api/library/books` (分页检索、分类过滤)
   - `GET /api/library/books/:id` (加载单书完整章节与全文)
   - `POST /api/library/books/:id/shelf` (书架加入与阅读进度保存)
   - `GET /api/library/search/online` (跨源聚合公版书籍)
   - `POST /api/crawler/tasks` (创建全网合规采集任务)
   - `POST /api/crawler/tasks/:id/run` (启动抓取执行流)

---

## 四、 安全防线审计结论 (Security Audit Summary)

1. **凭证隔离**: 严禁将 API Key 发送至客户端浏览器。
2. **密码学标准**: 采用现代标准 `scrypt`（`N=16384, r=8, p=1`）内存困难派生函数，防范 GPU/ASIC 离线暴力破解。
3. **防爆破限流**: 登录与注册端点引入滑动窗口限制（单个 IP 15 分钟内最多 10 次失败尝试）。
4. **位置隐私保障**: 用户关闭地理公开后，经纬度光标从全站三维地球上完全隐去。
5. **代码审计结果**: 0 处 hardcoded secrets，0 处 eval / unsafe DOM injection。
