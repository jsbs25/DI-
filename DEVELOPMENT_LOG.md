# EARTH ONE — 开发日志（DEVELOPMENT LOG）

## 2026-11-04

### 数据层重构：书籍全文抽离（本次核心）

**问题**：`server_data.json` 承载所有书籍全文，已膨胀到 3.6MB；每次写入（点赞/消息/存书）都整文件重写，且随书籍增多会指数级变慢。

**方案**（兼容式，不破坏功能）：
- 书籍章节正文抽离到 `server_data/books/{bookId}.json`（每本书独立文件）。
- `server_data.json` 只保留书籍元数据 + 章节标题（不存正文）。
- 列表/书架接口返回元数据；详情接口返回完整章节。
- 旧数据在启动时自动迁移（抽离正文 + 回写精简主文件）。

**改动文件**：
- `server/store.ts`：新增内容文件读写（`writeBookContent`/`loadBookContent`/`bookContentFile`/`hasInlineContent`）、`stripBookContent` 导出；`saveToDisk` 写元数据版；`loadFromDisk` 迁移+回水；`addBook`/`updateBook`/`deleteBook` 管理内容文件。
- `server.ts`：列表/书架接口返回元数据；导入 `stripBookContent`。
- `src/components/library/DigitalLibrary.tsx`：新增 `loadFullBook`/`openBookDetail`/`openShelfBook`，打开详情/阅读器前拉取完整章节。
- `.gitignore`：忽略 `server_data/`、`server_data.backup.json`。

**验证结果**：
- `server_data.json`：3.6MB → 225KB（40 本，仅元数据）。
- 列表接口：30KB（元数据，章节 content 为空）。
- 详情接口：1.26MB（《تفسير القرطبي》30 章完整正文）。
- 清理 5 本重复测试书。

### 上一轮（同日更早）

- 修复书籍全文分章（`fetchBookFullText` 按真实章节标记拆分，支持单换行/多标记兜底）。
- 新增书源：阿拉伯语维基文库 + Internet Archive（含 OCR 全文文件名解析）。
- 新增知识宇宙知识图谱 + 全局统一搜索。

## 待办

- [ ] 列表/详情分离后，补前端「阅读历史/最近阅读」对详情接口的复用确认。
- [ ] 密码哈希升级 bcrypt/argon2。
- [ ] 登录限流 + 会话过期。
- [ ] 国家/城市详情页。
- [ ] 个人知识库（统一双向链接）。

## 安全加固（2026-11-04 追加）

- 密码哈希：SHA-256+盐 → scrypt（内存困难），旧哈希登录时透明升级。
- 登录/注册限流：内存滑动窗口，登录 10 次/15 分钟、注册 20 次/15 分钟（按 IP）。
- 验证：种子账号登录成功并自动迁移为 scrypt 哈希；错误密码 401。


### WORLD LIBRARY：真实全球图书来源连接器（2026-11-04）

- 建立 `server/integrations/libraries/index.ts` 统一连接器接口、来源注册表、标准书目/权利字段、结果聚合和精确 ISBN/DOI 去重；Open Library、Internet Archive、Project Gutenberg 与既有中文/阿拉伯语 Wikisource 共五个来源可分别由环境变量开关。
- 新增 `/api/library/connectors`、`/api/library/search`，并将 `/api/library/ingest` 改为使用来源 ID 在服务端重新查询官方记录后再判断权利和可用文件；Open Library 元数据、权利未知/借阅受限记录不会伪装为全文。既有本地图书目录、书架、进度、详情和阅读器流程保留。
- Internet Archive 查询按官方 Lucene 语法限制在 `title`、`creator`、`identifier` 字段和 `mediatype:texts`，降低全文索引的无关结果；导入还要求明确可复制权利标记及官方元数据列出的 OCR 文件。Gutenberg 使用官方 OPDS `query` 参数，并在导入时再读取单书 OPDS 验证 TXT/EPUB 链接；公共领域说明带美国法域提醒。OPDS 语言字段从命名空间 XML 读取，不存在时返回 `und`，不再默认误标为英语。
- 新增 `LIBRARY_CONNECTORS.md`、`scripts/test_library_connectors.ts`、`scripts/test_library_connectors_live.ts`，并注册 `test:library-connectors` 与 `test:library-connectors:live` 命令；更新功能清单与项目专项审计。
- 配置只新增可选联系邮箱与五个连接器开关示例，无新增 API 密钥；未实现的学术、Europeana、Google Books 与阿拉伯语资源清楚列为后续事项。
- 验证：TypeScript 检查通过；离线连接器测试通过；隔离图书馆 API 回归 20 项通过；生产构建成功；实时官方来源烟测通过（Open Library、Internet Archive 搜索，以及 Gutenberg 搜索至隔离书目详情链路，未下载 EPUB）。全站浏览器回归和其他待批准权限相关路由未执行。

- UI 搜索卡片/详情页显示来源权利说明及通过 HTTPS 校验的许可原文链接；客户端仅在来源明确返回 `canImport: true` 时提供本地导入按钮，服务器仍再次验证来源记录和权限。该 UI 变更通过类型检查与生产构建，未进行本轮浏览器视觉验收。


- GitHub 同步：实现提交 `2cb84e9f7093cc03aa942a5d2540a3fda96f6a8c` 已从 `4f6fe82c784ad4bf63d63217f971437046684536` 普通快进推送至 `main`；推送后 fetch 和 GitHub connector API 均确认远端、跟踪分支和本地 HEAD 一致。未强推、未持久保存凭据或改变 Git 全局配置。
