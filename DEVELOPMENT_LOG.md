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
