# 04 — Messenger 实时通信设计（Phase 2）

- **日期**：2026-11-12
- **现状依据**：`server/messengerWs.ts`（`/ws` token 鉴权、`clientsByUser` 内存连接、多端广播、typing/read/send、presence 由 store+广播）、`server/store.ts`（conversations/messages/friend/blocked/privacy）、`server.ts`（`WebSocketServer` 同进程挂载）。

## 1. 现有能力与约束
- **传输**：同源 WebSocket `ws(s)://<host>/ws?token=`，前端 `GlobalMessenger` 建连。
- **状态**：连接表、typing 定时器均在**单进程内存**；无跨实例共享。
- **持久化**：消息/会话/已读等写入 store 并 `persist()` 到 `server_data.json`（同步全量快照模式，成本高但语义简单）。
- **策略**：隐私/屏蔽/好友/会话访问控制由 store 与 policy 决定；已读回执可配置（代码含 `allowReadReceipt` 路径）。

## 2. 目标需求覆盖矩阵

| 能力 | 设计要点 | 状态 |
|---|---|---|
| 多用户连接 | 按 userId 分片的连接管理；认证后绑定 deviceId | 设计 |
| 多设备登录 | 同 user 多 socket；事件 fan-out 到本人所有设备（必要时排除来源设备） | 设计 |
| 在线状态/presence | 心跳/超时、最后活跃、对好友/会话参与者按隐私脱敏广播 | 设计 |
| 好友/私聊/群聊 | 统一 conversation 模型（direct/group）与成员权限校验 | 设计（复用现有） |
| 消息送达/已读 | 服务端 ack、delivery/read 状态事件、按隐私策略回执 | 设计 |
| 消息撤回/删除 | 幂等操作、广播撤回/删除事件、存储软删/标记与可见性一致 | 设计（对齐现有语义） |
| 离线消息 | 持久化为事实源；上线/重连按游标增量拉取（REST sync + WS 补推） | 设计 |
| 断线重连 | 客户端指数退避重连；服务端按 `lastEventId`/`serverTime`/会话序列补发；会话级去重 | 设计 |
| 消息去重 | `clientMsgId`/`messageId` 幂等键；服务端唯一约束与客户端缓存 | 设计 |
| 消息顺序 | 单会话单调序列号（`seq`）或可靠时间戳+tie-break；客户端按 seq 重排与缺口拉取 | 设计 |
| 通知同步 | 未读计数、通知偏好过滤、WS 推送 + REST 兜底 | 设计 |

## 3. 目标架构选项

### 选项 M1：过渡期 — 保留 Node/Express + `ws` 单实例
- **适用**：方案 B/C 轨 1，最快保功能。
- **实现**：现有 `messengerWs.ts` 逻辑基本保留；外置 session/DB 后仍需单写入点；反向代理开启 WSS 与超时/心跳调优。
- **限制**：免费 PaaS 休眠导致掉线；无法水平扩展；**严格 0 USD 24/7 不可保证**。

### 选项 M2：Cloudflare Durable Objects + WebSocket（目标态）
- **适用**：方案 A/C 轨 2。
- **分片策略**：
  - `ConversationDO(conversationId)`：维护会话内有序事件流、在线成员视图、typing；消息写入 D1（事实）后广播。
  - `UserPresenceDO(userId)`（可选）：聚合多端在线与通知计数；或由 ConversationDO + 轻量状态推导。
- **持久化**：D1 `messages/conversations/read_states/deliveries`；对象存储仅附件。
- **协议**：保留现有消息类型语义（hello/ping/typing/read/send/ack/error/presence/通知事件）并扩展 `seq`、`idempotencyKey`、`resumeToken`。
- **休眠/唤醒**：利用 DO WebSocket hibernation（按官方能力核实）降低空闲成本。

## 4. 消息模型与一致性
- **幂等**：`(conversationId, clientMsgId)` 唯一；重试返回同一 `messageId/seq`。
- **顺序**：服务端分配单会话递增 `seq`；客户端按 `seq` 渲染，检测缺口触发 `GET /api/conversations/:id/messages?afterSeq=`。
- **已读/送达**：`read_states(userId, conversationId, lastReadSeq, readAt)`；群聊按成员独立；回执受隐私设置控制。
- **撤回/删除**：写入事件与状态位，广播 `message_updated`；客户端对已删内容做占位展示（与现有产品一致）。
- **离线**：连接建立后发送 `sync` 请求（含各会话 lastSeq）；服务端返回增量；大 backlog 分页。

## 5. 安全与限流
- 连接鉴权：token 校验失败立即 4401；token 轮换后旧连接失效策略需定义。
- 速率限制：按 user/IP 限制连接频率、消息发送速率、typing 频率（Workers/DO 层与应用层双保险）。
- 授权：每次 send/read/typing 校验会话成员、屏蔽、好友与隐私策略（复用现有 store 规则语义）。
- 传输：生产强制 WSS/HTTPS；Origin 校验与 CSWSH 防护。

## 6. 可观测性与降级
- 指标：连接数、消息延迟、丢包/重连率、DO 唤醒与 D1 错误率。
- 降级：实时不可用时 REST 轮询间隔兜底（受配额约束，需节流）；**不得伪造“已送达/已读”**。

## 7. 测试与验收（阶段 7 前置标准）
- 多客户端（≥2 用户、≥2 设备）真实互通；离线再上线补齐；重复发送去重；乱序/断线恢复；隐私与屏蔽拦截；群聊权限。
- 未实测项标记 **NOT TESTED**。

## 8. 与现有代码映射
| 现有 | 目标动作 |
|---|---|
| `server/messengerWs.ts` | 抽象协议处理器；M1 保留，M2 迁至 DO handler |
| `store.messages/conversations` | 迁移为 D1 事务写入+索引（会话、时间、seq） |
| `GET /api/messenger/sync` 等 | 扩展游标/seq 参数与分页 |
| `GlobalMessenger.tsx` WS 客户端 | 增加重连、ack、去重、seq 对齐（保持 UI 行为） |
