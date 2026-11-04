# EARTH ONE 开发进度

更新时间：2026-11-04
仓库：`https://github.com/jsbs25/DI-`
分支基线：`main` / `origin/main`，提交 `9d5d0aa`（首页与地球体验改版）。

## 本轮已完成

1. 检查仓库状态：以 `/workspace/DI-review` 为最新主副本；开始时工作区干净，`main` 与 `origin/main` 同步。较旧的 `/workspace/di-review` 未修改。
2. 基线 `npm run lint` 与 `npm run build` 均通过。构建仍提示主 JavaScript chunk 大于 500 KB，当前最大 chunk 约 1.16 MB（gzip 约 306 KB）。
3. 修复测试数据污染风险：`server/store.ts` 支持 `EARTH_ONE_DATA_FILE` 覆盖数据文件；`scripts/test_earth_one.ts` 在临时目录运行并于成功/失败后清理。
4. 修复公开用户资料隐私：用户列表、资料页和全局搜索改用白名单序列化，排除邮箱及内部 onboarding 状态；关闭位置公开时不返回真实坐标。
5. 使用临时数据库启动真实 Express 实例，验证三种公开响应的邮箱/坐标脱敏。
6. 为 onboarding、资料更新和位置隐私开关要求有效会话；位置隐私开关变更会原子写入持久存储。
7. 新增 `npm run test:api`：自动启动临时 Express 实例，覆盖身份会话、未授权身份写操作和公开资料隐私。
8. 澄清测试范围：存储层完整性套件与 HTTP 套件分别验证各自范围；两者都不是浏览器端到端测试。
9. 更新 README 与 CHANGELOG；新增持续任务队列、功能保护清单和回归测试说明。

## 验证结果

- `npx tsx scripts/test_earth_one.ts`：44 项通过，0 项失败。
- `npm run test:api`：28 项 HTTP 断言通过，0 项失败；测试服务器只写临时 JSON 文件，并关闭后台采集；合法用户引导、资料更新和位置开关仍可用。
- 临时 Express 实例 HTTP smoke：用户列表、用户资料、全局搜索均未返回邮箱/内部 onboarding 字段；私密位置的纬经度为屏蔽值。
- 测试运行前后忽略文件 `server_data.json` 的 SHA-256 校验值一致；本轮未改动该文件。
- `npm run lint`：通过。
- `npm run build`：通过；仍有 chunk 体积警告。
- 本轮没有启动浏览器或线上实例，因此未声称完成 HTTP、登录、移动端或 RTL 实机验证。

## 当前未解决/阻塞

- `server.ts` 仍需系统性复核剩余写路由和私信读取的会话/角色权限。部分遗留内容/管理路由继续使用访客回退或缺少所有权校验；调整前需梳理前端调用与匿名浏览契约，确保不破坏功能。
- 当前自动化测试不启动 Express，不验证 HTTP 状态码、浏览器交互或登录权限。
- 生产构建存在大 chunk 警告；需评估安全的代码分割。
- WebSocket、HLS、支付网关、PostgreSQL/PostGIS 依赖独立设计/配置；相关高风险或费用操作暂不执行。

## 下一步具体操作

1. 在 `server.ts` 建立所有写路由的权限矩阵：公开/登录用户/管理员，并追踪各 UI 的 Authorization 请求。
2. 为既有 API 添加临时存储的 HTTP 集成测试，先锁定当前兼容行为，再逐项收紧权限。
3. 增加未授权与用户数据隔离测试；确认合法账号仍可完成相同业务后再提交修复。
4. 测量并优化首页首屏 chunk，保持所有页面和 3D 地球功能。
5. 复测移动窄屏及阿拉伯语 RTL，并记录真实运行结果。
