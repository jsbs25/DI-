# EARTH ONE — 研发工程进阶路线图 V3.0
## (GLOBAL DIGITAL WORLD — 10-PHASE MASTER ENGINEERING ROADMAP)

**总纲理念**: 从宇宙进入地球，从地球进入人类，从人类连接整个世界。  
**技术愿景**: 建立真正可运行、具备万级并发、科学严谨且具有国际顶级科技质感的全球数字空间。

---

## 路线图总览 (Ten Engineering Phases)

```
[Phase 1: 全域工程审计与修复] (COMPLETED ✅)
       ↓
[Phase 2: PostgreSQL + PostGIS 空间数据基础设施] (SCHEMA READY 🟡)
       ↓
[Phase 3: 全球双向实时 WebSocket 通讯] (PLANNED 🚀)
       ↓
[Phase 4: EARTH ONE 统一多模型 AI 网关] (FUNCTIONAL 🟢)
       ↓
[Phase 5: 全球公版世界数字图书馆 (11 大学术公版源)] (ADVANCED 🟢)
       ↓
[Phase 6: 全站统一跨语种混合搜索引擎] (PARTIAL 🟡)
       ↓
[Phase 7: 3D 地球与开普勒宇宙引擎超写实渲染] (ADVANCED 🟢)
       ↓
[Phase 8: 全球社区治理与真实内容防护网络] (FUNCTIONAL 🟢)
       ↓
[Phase 9: 创作者中心与 HLS 流媒体服务集群] (PLANNED 🚀)
       ↓
[Phase 10: 生产级安全体系与全球高可用灾备] (ACTIVE 🟢)
```

---

### 第一阶段：完整工程审计与核心业务闭环 (Phase 1) — 【已完成并通过验收】
* **现状与成果**:
  - 完成对 `src/`、`server/`、`scripts/` 与存储层的逐行代码审计，建立 6 大技术规范报告。
  - 修复 React 19 多副本依赖冲突，配置 `resolve.dedupe: ['react', 'react-dom']`。
  - 交付 5 款高品质互动游戏（3D 太空避障战机、引力沙盒、星际国象、五子棋、地理答题）。
  - 部署 3D 全息 AI 伴侣，实现语音交互与三维空间镜头飞跃联动。
  - 44 项全栈数据完整性测试 100% 通过，`npm run build` 成功。

---

### 第二阶段：数据基础设施升级 (Phase 2: PostgreSQL + PostGIS) — 【Schema 就绪，逐步实施】
* **工程目标**:
  - 由当前单节点文件系统持久化，升级为分布式 PostgreSQL 16 关系型数据库与 PostGIS 空间引擎。
* **交付内容**:
  - 生产 Schema 已在 `server/db/schema.sql` 规范完毕：
    - `users` 表集成 PostGIS 几何点 `location_point GEOMETRY(Point, 4326)`。
    - 建立 GIST 空间索引，支持 $O(\log N)$ 全球邻近公民探测与距离范围聚合。
    - 设计完整外键级联约束、会话表、帖子表、书籍元数据与章节表。
  - 数据迁移工具 `server/db/migrateFromJson.ts` 支持零丢失平滑导入现有 `server_data.json`。

---

### 第三阶段：全球实时通信体系 (Phase 3: Real-Time WebSockets) — 【重点演进】
* **工程目标**:
  - 将当前 HTTP 客户端轮询升级为低延迟双向 WebSocket 长连接通道。
* **规划能力**:
  - 一对一私信与跨国频道实时推送（<100ms 延迟）。
  - 正在输入指示（Typing indicator）、消息送达（Delivered）与已读回执（Read receipt）。
  - 双人实时在线对战同步（五子棋与国际象棋支持跨洋即时连线）。
  - 断线指数退避重连机制，离线消息本地 IndexedDB 缓存与重放。

---

### 第四阶段：EARTH ONE AI 智能网关 (Phase 4: Unified AI Gateway) — 【功能完备，逐步扩充】
* **工程目标**:
  - 建立统一标准的多大模型分发适配层。
* **规划能力**:
  - 当前已打通 Gemini 3.8 Flash 与 Google Search Grounding 实时联网搜索。
  - 抽象适配层 `server/aiGateway.ts` 支持标准 OpenAI 格式、Anthropic Claude、DeepSeek 接口。
  - 服务端脱敏 Key 管理，未配置密钥的模型在前端明确提示“未配置”，严禁伪造回答。
  - 流式打字机响应、书籍选段深度研读评注、跨语种自动对译保留原文。

---

### 第五阶段：全球世界数字图书馆 (Phase 5: World Library) — 【高阶演进】
* **工程目标**:
  - 接入合法的公版经典与开放学术文献，杜绝伪造书籍。
* **接入源**:
  - Open Library、Internet Archive、Project Gutenberg、Wikisource、arXiv、Europeana。
* **核心功能**:
  - 统一跨源搜索、个人书架（想读/在读/已读）、EPUB 原生渲染器、AI 阅读助手、阅读进度双端同步。

---

### 第六阶段：全站统一混合搜索 (Phase 6: Global Search)
* **工程目标**:
  - 统一顶栏与底栏全局搜索，一次搜索聚合公民、动态、国家、城市、图书、论文与社区。
* **核心功能**:
  - 多语言分词、拼音/英文字母前缀建议、分类过滤、隐私权限过滤（私人笔记与隐身用户不暴露）。

---

### 第七阶段：地球与宇宙引擎超写实渲染 (Phase 7: Earth Map & Universe Engine)
* **工程目标**:
  - 在 Three.js 基础上追求顶级物理真实感与移动端高帧率平衡。
* **核心功能**:
  - NASA 卫星真实高分辨率反射率纹理。
  - 大气分子瑞利散射与米氏散射着色器。
  - 昼夜分界线动态计算与夜间城市光网。
  - 开普勒行星运动学轨道计算、自转倾角与土星卡西尼环缝精确建模。

---

### 第八阶段：全球社区与内容安全治理 (Phase 8: Global Community)
* **工程目标**:
  - 建立健康、多元、跨文化的全球人类交流网络。
* **核心功能**:
  - 真实发帖、嵌套评论、点赞、收藏。
  - 跨文化举报与违规内容屏蔽系统，敏感词过滤与真实空状态展示。

---

### 第九阶段：创作者中心与流媒体处理 (Phase 9: Creator & Planetary Video)
* **工程目标**:
  - 支持创作者发布深度文章与真实高质量视频。
* **核心功能**:
  - 文章富文本编辑器、版权标记。
  - 视频对象存储分块上传、后台异步转码切片与 HLS 自适应码率流媒体播放。

---

### 第十阶段：安全、合规与生产加固 (Phase 10: Security & Production)
* **工程目标**:
  - 银行级数据安全与全球合规。
* **核心功能**:
  - `scrypt` / `Argon2id` 密码散列。
  - 速率限制防御（Rate limiting）、严格 CSP 头、XSS/CSRF 免疫。
  - 地理隐私模糊化机制、每日原子化灾备。
