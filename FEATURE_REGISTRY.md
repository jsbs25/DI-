# EARTH ONE 功能保护清单

更新时间：2026-11-04
保护原则：本清单用于防止重构或视觉改版删除现有能力。列为“源码存在”不代表生产级或端到端验证已完成；测试范围见 [`REGRESSION_TESTS.md`](REGRESSION_TESTS.md)。

| 模块 | 现有入口/实现 | 当前记录与保护要求 |
|---|---|---|
| 首页与全局导航 | `src/App.tsx`、`src/components/layout/Navbar.tsx` | 13 个导航模块已按需加载；1274×649 桌面生产构建的地球/动态/图书馆/宇宙切换 smoke 通过，其他模块与移动端/RTL 仍待测。 |
| EARTH ID、注册/登录、引导、资料 | `src/components/auth/`、`src/components/profile/`、`server.ts`、`server/store.ts` | 注册、登录、资料和会话相关代码存在；公开用户接口已使用白名单脱敏；身份查询无有效令牌时返回空用户；引导、资料更新、位置隐私开关要求有效会话；其他 HTTP 权限仍需回归。 |
| 3D 地球与全球节点 | `src/components/globe/`、`/api/globe/*` | Three.js 地球、节点和空间数据路径存在；视觉改版不得替换地球交互或隐私设置。 |
| 宇宙/太阳系探索 | `src/universe/` | 桌面 smoke 已验证场景、地球遥测选择与返回地球；遥测抽屉遮挡部分天体栏已排队，保留所有切换与参数展示能力。 |
| 社交动态与趋势 | `src/components/social/`、`/api/posts*` | 动态发布/筛选/点赞/评论 HTTP 契约通过，桌面列表加载通过；完整 UI、真实鉴权及数据隔离仍待后续验证/批准。 |
| 消息与 AI 翻译 | `src/components/chat/`、`/api/conversations/*` | 消息持久化与翻译路径存在；翻译依赖模型配置，回退内容不能冒充真实翻译。 |
| AI HUB | `src/components/ai/`、`server/aiGateway.ts`、`/api/ai/*` | 多模式及模型网关代码存在；真实模型调用需服务端凭据和服务可用，不提交或暴露密钥。 |
| 创作者中心与文章 | `src/components/creator/`、`/api/articles*` | 发布/阅读路径存在；赞赏统计不等同真实支付。 |
| 视频中心 | `src/components/video/`、`/api/videos` | 视频目录与播放能力存在；HLS 转码/托管尚属基础设施待办，不得宣称已完成。 |
| 游戏中心 | `src/components/games/`、`/api/games/*` | 五子棋/问答与房间路径存在；多人权威 WebSocket 对战需后续实现。 |
| 社区 | `src/components/community/`、`/api/communities*` | 社区列表与加入路径存在；需要验证用户隔离及成员数持久化。 |
| 数字图书馆、阅读器、书架 | `src/components/library/`、`server/bookHarvester.ts`、`/api/library/*` | 图书检索/详情/书架进度 HTTP 契约通过，桌面目录到详情 smoke 通过；阅读器、外部来源、版权和管理权限仍需持续验证。 |
| 网页浏览与收藏 | `src/components/browser/`、`/api/browser/*` | 搜索、预览、书签/保存路径存在；外部网页抓取须继续审查 SSRF、来源限制与隐私。 |
| 爬虫与内容收集 | `src/components/crawler/`、`server/webFetcher.ts`、`/api/crawler/*` | 任务、抓取及审核路径存在；仅限合法公开内容，需权限/目标域约束与 SSRF 安全测试。 |
| 知识图谱/知识宇宙 | `src/components/knowledge/`、`server/knowledgeGraph.ts`、`/api/knowledge/*` | 搜索、节点及关联路径存在；不得将种子/示例内容描述为实时全球知识数据。 |
| 广告与赞助 | `src/components/commercial/`、`/api/ads/*` | 展示及点击统计代码存在；竞价和结算未列为已实现。 |
| 多语言与阿拉伯语 RTL | `src/i18n/translations.ts`、`src/index.css`、应用方向设置 | 中文、英语、阿拉伯语、西班牙语、法语、俄语翻译资源存在；每次导航或布局修改需覆盖 RTL。 |
| 持久化数据与 API | `server/store.ts`、`server.ts`、`server_data.json`（本机忽略文件） | 保留现有 API 与用户数据；测试须使用临时数据文件；未经授权不得清空或不可逆迁移。 |

## 完成度标记

- **代码路径存在**：仓库包含对应 UI/服务端代码或 API 路由。
- **存储层已测**：当前完整性套件覆盖部分数据层逻辑与隔离文件持久化。
- **HTTP/浏览器待测**：除非回归记录明确写明通过，不视为端到端验证。
- **外部依赖待配置**：模型、云存储、支付或流媒体等服务可能需要额外凭据/基础设施。
