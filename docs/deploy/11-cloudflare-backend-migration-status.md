# 11 — Cloudflare 免费云端后端迁移状态（执行中）

- 日期：2026-11-12
- 前端：`https://jsbs25.github.io/DI-/`（Pages，run 43286001514 / commit c336614 已上线）
- 仓库：`https://github.com/jsbs25/DI-`
- 目标：在 $0、无付费/无绑卡/无按量计费前提下，逐步为已上线前端提供真实云端后端（Workers + D1 + R2 + Durable Objects），保持现有功能/数据/API 语义兼容。

## 1. 已完成（本轮，可本地/代码侧，不依赖账号）

### 1.1 现有后端检查与接口基线
- 审计范围：`server.ts`、`server/store.ts`、`server/messengerWs.ts`、`server/otp.ts`、`server/smsProvider.ts`、`server/mailProvider.ts`、`server/calls/*`、上传/头像/书籍存储、`node:sqlite` discovery、`src/apiBase.ts`、`src/main.tsx`、`GlobalMessenger.tsx`。
- 真实接口清单：`docs/deploy/10-api-inventory.md`（172 条路由 + `/ws`，来源 `server.ts` 静态提取）。
- 关键事实：单体 Express + 进程内状态 + `server_data.json` 全量落盘 + `fs` 上传/书籍 + `node:sqlite` FTS5 discovery + `ws` 内存连接表 + LiveKit token/信令相关逻辑；与 Workers 运行时存在本质差异（见审计/`docs/deploy/01-04`）。

### 1.2 兼容迁移骨架（`cloudflare/`）
- `cloudflare/wrangler.toml.example`：Worker/D1/R2/DO 绑定模板（不含真实 ID/密钥，`workers_dev`/本地持久化说明）。
- `cloudflare/worker/src/index.ts`：最小 Worker 入口（`/api/health`、`/api/integrations` 安全状态、其余 `/api/*` 与 `/ws` 返回明确 `501 NOT_IMPLEMENTED_IN_CLOUDFLARE_WORKER`，不伪造业务成功）、CORS 处理（受 `CORS_ORIGINS` 控制）。
- `cloudflare/worker/src/storage.ts`：R2 存储适配契约与 key 规则（attachments/avatar/book），强调私有对象不得公开、必须走鉴权读取。
- `cloudflare/worker/src/messenger-do.ts`：`MessengerRoom`/`UserPresence` Durable Object 脚手架与迁移约束（鉴权、成员/隐私/已读、seq+幂等、持久化后 fanout、多端）。
- `cloudflare/migrations/0001_initial.sql` + `README`：D1 草案 schema（users/auth/sessions/posts/conversations/messages/friends/blocks/notifications/privacy/calls/files/books/app_state 等），保留 ID/时间戳导入原则；**未应用到任何真实库**。
- `cloudflare/README.md`：本地检查、授权后操作、成本/安全约束。

### 1.3 前端连接准备（已存在能力，待云端 API）
- 前端已支持 `VITE_API_BASE` 与 `/api` fetch 重写、可配置 WS 地址（此前提交）；Pages workflow 支持通过仓库变量注入 `VITE_API_BASE` 构建。**当前未配置云端 API，线上仍无真实后端。**

## 2. 账号/授权检查
- `npx wrangler whoami`: **未认证**（需账号持有人 `wrangler login`）。
- `gh` CLI：未安装/未认证；本仓库 git credential 可用于 push，但**不能**代表 Cloudflare 资源权限。
- 结论：**BLOCKED（仅资源创建/部署/真实云端验证环节）** — 无法在未授权情况下创建 D1/R2/DO/Worker 或绑定域名。

## 3. 测试结果
- Worker/D1/R2/DO 代码：**NOT TESTED**（未执行 `wrangler dev`/D1 apply/集成测试；下一步在本地/临时环境补测，不影响现有服务）。
- 云端部署/连通性/注册登录/消息/上传/WS/持久化：**NOT TESTED / BLOCKED**（无已授权 Cloudflare 资源与持久化后端）。
- 现有生产数据 `server_data.json`/`server_data/*`：未读取修改写入迁移目标，**未受影响**。

## 4. 下一步（按优先级，继续执行）
1. **本地/离线可完成**：将 Express 路由按域拆分适配层（auth/users/messenger/files/calls/library 等）并实现 Worker 端处理器；用 D1 本地模式（`--local --persist-to`）+ 临时 R2/DO 仿真做兼容测试（不触碰 `server_data/*`）。
2. **数据库适配**：基于 `0001_initial.sql` 编写从 `server_data.json`/`books/*.json`（只读）到本地测试 D1 的导入与校验脚本（计数/抽样/完整性），全程使用副本。
3. **Messenger/文件**：实现 DO WebSocket 协议兼容层与 R2 私有读写+权限校验，保留消息协议/好友/多端同步语义。
4. **唯一需账号持有人动作（阻塞点）**：在 https://dash.cloudflare.com 完成登录授权后执行 `npx wrangler login`，并确认仅使用免费计划；随后创建 D1/R2/Worker/DO 测试资源并部署。此前我将持续完成不依赖权限的代码与本地测试。
5. **上线联调**：配置 `VITE_API_BASE` 指向 Worker，验证 CORS/HTTPS/认证/WebSocket/持久化；逐项标记 PASS/FAIL。

## 5. 成本控制声明
- 本轮未创建任何 Cloudflare 资源、未启用任何付费/试用/按量功能、未绑定支付方式。后续每项资源创建前需核对免费计划限制并记录。
