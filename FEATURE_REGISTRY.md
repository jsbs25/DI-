# EARTH ONE 功能保护清单

更新时间：2026-11-04
保护原则：本清单用于防止重构或视觉改版删除现有能力。列为“源码存在”不代表生产级或端到端验证已完成；测试范围见 [`REGRESSION_TESTS.md`](REGRESSION_TESTS.md)。

| 模块 | 现有入口/实现 | 当前记录与保护要求 |
|---|---|---|
| 首页与全局导航 | `src/App.tsx`、`src/components/layout/Navbar.tsx`、`src/components/globe/DigitalGlobe.tsx`、`src/i18n/translations.ts` | 13 个导航模块已按需加载；隔离 Chromium 实测桌面地球→宇宙→返回，及 390×844 阿拉伯语 RTL 下移动导航可达的 12 个模块；本轮 18 个视口/模块样本（含桌面 Crawler 仪表盘）均无页面级横向溢出。Crawler 菜单标签已加入六语言字典；总览三列无重叠，六语言静态渲染 30 项通过；其他设备和真实用户数据路径仍待测。 |
| EARTH ID、注册/登录、引导、资料 | `src/components/auth/`、`src/components/profile/`、`server.ts`、`server/store.ts` | 注册、登录、资料和会话相关代码存在；公开用户接口已使用白名单脱敏；身份查询无有效令牌时返回空用户；引导、资料更新、位置隐私开关要求有效会话；其他 HTTP 权限仍需回归。 |
| 3D 地球与全球节点 | `src/components/globe/`、`/api/globe/*` | Three.js 地球与节点路径存在；独立 Chromium 确认 canvas 挂载和地球页面返回路径；API 统计/国家只读契约已有 HTTP 回归。视觉改版不得替换地球交互或隐私设置；实机 GPU 性能未验证。 |
| 宇宙/太阳系探索 | `src/universe/` | 桌面抽屉与天体栏实测净距 9px，隔离 Chromium 地球→宇宙→返回通过。关闭按钮已有双语可访问名称，9 项静态渲染通过；窄屏宇宙、键盘和读屏仍待验证，保留所有切换与参数展示能力。 |
| 社交动态与趋势 | `src/components/social/`、`/api/posts*` | 动态发布/筛选/点赞/评论 HTTP 契约通过，桌面列表加载通过；完整 UI、真实鉴权及数据隔离仍待后续验证/批准。 |
| 消息与 AI 翻译 | `src/components/chat/`、`/api/conversations/*` | 消息持久化与翻译路径存在；翻译依赖模型配置，回退内容不能冒充真实翻译。 |
| AI HUB | `src/components/ai/`、`server/aiGateway.ts`、`/api/ai/*` | 多模式及模型网关代码存在；修复模型状态/选择栏在窄屏的 flex 内在宽度；390×844 阿语 RTL/中文和 1274×649 阿语桌面无页面级横向溢出。真实模型调用未执行，需服务端凭据和服务可用，不提交或暴露密钥。 |
| 创作者中心与文章 | `src/components/creator/`、`/api/articles*` | 综合 HTTP 回归覆盖文章列表和缺少必填正文校验；独立 `test:creator-api` GET-only 回归再检查目录字段、唯一 ID 与既有文章样本。成功写入及完整 UI 仍待验证；赞赏统计不等同真实支付。 |
| 视频中心 | `src/components/video/`、`/api/videos` | 综合 HTTP 回归覆盖视频目录；独立 `test:creator-api` GET-only 回归检查字段、唯一 ID 与既有视频样本，只校验媒体 URL、不发起媒体请求。播放实测及 HLS 转码/托管仍待基础设施验证，不得宣称已完成。 |
| 游戏中心 | `src/components/games/`、`/api/games/*` | 综合 HTTP 回归及独立 `test:catalog-api` GET-only 套件覆盖房间目录和既有样例；未验证房间加入/创建、五子棋/问答对局交互或权威 WebSocket 对战。 |
| 社区 | `src/components/community/`、`/api/communities*` | 独立 `test:catalog-api` GET-only 回归检查目录字段、唯一 ID/slug 与既有样例；加入路径、用户隔离及成员数持久化仍待验证。 |
| 数字图书馆、阅读器、书架 | `src/components/library/`、`server/bookHarvester.ts`、`/api/library/*` | 本地图书目录/详情新增独立 GET-only 回归（12 项，含字段/唯一性、哲学筛选、本地搜索、章节结构与结构化 404）；既有综合套件中的书架进度契约与桌面目录到详情 smoke 仍在记录中。阅读器、外部来源、版权和管理权限仍需持续验证。 |
| 网页浏览与收藏 | `src/components/browser/`、`/api/browser/*` | 搜索、预览、书签/保存路径存在；修复地址栏工具栏与分栏面板 flex 收缩，390×844 阿语 RTL/中文及 1274×649 阿语桌面无页面级横向溢出；窄屏工具栏保留自身横向滚动。未触发搜索/抓取；外部地址须继续审查 SSRF、来源限制与隐私。 |
| 爬虫与内容收集 | `src/components/crawler/`、`server/webFetcher.ts`、`/api/crawler/*` | 新增独立 GET-only 回归（12 项）检查任务/采集页结构、唯一 ID、任务关联和待审核状态；桌面仪表盘只读布局也已覆盖。未创建/运行任务、发起抓取或批准/拒绝页面；执行与审核流程仍需权限、目标域约束及 SSRF 安全测试。 |
| 知识图谱/知识宇宙 | `src/components/knowledge/`、`server/knowledgeGraph.ts`、`/api/knowledge/*` | HTTP 回归覆盖搜索、类别/国家筛选、关联节点、详情与不存在节点 404；不得将种子/示例内容描述为实时全球知识数据。 |
| 广告与赞助 | `src/components/commercial/`、`/api/ads/*` | 独立 `test:catalog-api` GET-only 回归检查广告字段、唯一 ID 与既有样例，不执行点击写操作；竞价和结算未列为已实现。 |
| 多语言与阿拉伯语 RTL | `src/i18n/translations.ts`、`src/index.css`、应用方向设置 | 中文、英语、阿拉伯语、西班牙语、法语、俄语翻译资源存在；真实语言菜单切换后的阿语 RTL 移动导航和关键桌面/窄屏布局已测；其他语言主要有静态结构覆盖，不能据此宣称所有文案/页面均已完成浏览器实测。 |
| 持久化数据与 API | `server/store.ts`、`server.ts`、`server_data.json`（本机忽略文件） | 保留现有 API 与用户数据；测试须使用临时数据文件；未经授权不得清空或不可逆迁移。 |

## 完成度标记

- **代码路径存在**：仓库包含对应 UI/服务端代码或 API 路由。
- **存储层已测**：当前完整性套件覆盖部分数据层逻辑与隔离文件持久化。
- **HTTP/浏览器待测**：除非回归记录明确写明通过，不视为端到端验证。
- **外部依赖待配置**：模型、云存储、支付或流媒体等服务可能需要额外凭据/基础设施。
