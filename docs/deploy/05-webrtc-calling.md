# 05 — 音视频通话方案（WebRTC/LiveKit）设计（Phase 2）

- **日期**：2026-11-12
- **现状依据**：`server/calls/{types,service,index,store}.ts`、`server.ts` `/api/calls/*`（invite/accept/reject/cancel/end/leave/token/state/list/get）、`mediaProvider: 'livekit'|'none'`、依赖 `livekit-client`、`livekit-server-sdk`（`package.json`）。

## 1. 现有实现摘要
- **信令与状态**：服务端维护 CallRecord（scope direct/group、kind audio/video、participants 状态机 ringing/connecting/active/reconnecting/ended/rejected/missed/busy/failed/canceled）、roomName 生成、权限/会话校验、busy 检测。
- **媒体层**：通过 LiveKit token/URL 下发（`CallTokenResponse` 含 provider/url/token）；实际媒体转发能力取决于 LiveKit 服务部署与配置（当前环境 **UNVERIFIED**）。
- **能力标记**：audio/video/screenShare/multiParty/switchCamera。

## 2. 目标：保留现有通话功能的分层方案

| 层 | 方案 | 说明 |
|---|---|---|
| 信令 | 保留 `/api/calls/*` + WS/事件通知语义 | 可运行于 Express(过渡) 或 Workers/DO(目标)；需幂等与鉴权 |
| 媒体(P2P) | **WebRTC Mesh/P2P**（1v1 优先） | 浏览器原生 RTCPeerConnection；SDP/ICE 经信令交换（现有或扩展通道） |
| NAT 穿透 | **STUN** | 仅用于发现公网候选地址，**不转发媒体** |
| 中继 | **TURN**（UDP/TCP/TLS） | 对称 NAT/严格防火墙场景必需；**通常产生带宽/服务器成本** |
| 多方/弱网增强 | **SFU（如 LiveKit/mediasoup/Janus）** | 群聊与大规模更稳；LiveKit 已集成在依赖与类型中 |

## 3. 免费可行性与限制（必须诚实披露）

| 组件 | 免费可能性 | 限制/风险 | 状态 |
|---|---|---|---|
| STUN（公共） | 多数可零费使用（如 Google/Cloudflare 提供的公共 STUN 服务需逐一核实 ToS/可用性） | 可用性与隐私策略依运营商；仅辅助打洞 | **UNVERIFIED**（需选定并实测） |
| TURN（公共免费） | **不可靠/不合规风险高** | 未授权公共 TURN 不得使用；稳定 TURN 通常付费或自建带宽成本 | **BLOCKED（作为产品依赖）** |
| 自建 TURN（coturn） | 软件免费 | 需常驻服务器与**中继流量**，严格 0 USD 难以保证 | **UNVERIFIED**（取决于后端托管） |
| Cloudflare TURN 服务/Calls 产品 | 以官方当前定价为准 | 历史与套餐变化快；不得假设永久免费 | https://developers.cloudflare.com/calls/ **UNVERIFIED** |
| LiveKit Cloud | 有免费/开发额度可能性（以官网为准） | 并发参与者、分钟数、带宽限制；生产 SLA 与合规需评估 | https://livekit.io/pricing **UNVERIFIED** |
| 自建 LiveKit SFU | 开源可自托管 | 需要服务器/带宽/运维；免费 PaaS 难承载 | **UNVERIFIED** |
| Cloudflare Stream WebRTC | **非永久免费通话方案**（按用户要求与常规计费模式强调） | 视频交付/用量计费；不得用于“零成本通话”承诺 | https://developers.cloudflare.com/stream/pricing/ **UNVERIFIED** |

## 4. 网络场景分类（预期行为）

| 场景 | STUN | TURN | 预期 |
|---|---|---|---|
| 家庭/移动网络，锥形 NAT | 需要 | 通常不需要 | P2P 直连成功率较高 |
| 对称 NAT / 企业防火墙 / 部分运营商 CGNAT | 需要 | **通常需要** | 无 TURN 时可能失败或仅单向 |
| 严格 UDP 封锁，仅 TCP/443 出站 | 需要 | 需要 TURN over TLS/443（若可用） | 依赖中继部署能力 |
| 多方群聊 | 可选 | 可选但常需 SFU | Mesh 质量随人数下降，SFU 更优 |

> **结论**：无法在不引入可控中继资源的前提下保证“所有网络环境”通话可用；必须在 UI/文档中对受限场景降级提示（如仅音频/稍后重试/网络受限）。

## 5. 推荐实施策略（与方案 C 对齐）
1. **保留现有信令与 Call 状态机**，确保桌面端与 Web 共用语义。
2. **1v1 优先 P2P + 可配置 STUN 列表**；TURN 配置项预留但默认不指向未授权服务，未配置时明确 **UNVERIFIED/BLOCKED for relay**。
3. **群聊/录制/高可靠**：评估 LiveKit（云免费额度或自建）作为可选媒体后端，通过 `provider` 抽象切换；未配置时 `mediaProvider='none'` 或回退能力需明确。
4. **质量**：网络质量检测、重连（reconnecting 状态已存在）、设备切换与权限处理保留。

## 6. 信令与媒体时序（逻辑）
1. Caller `POST /api/calls/invite` → 服务端校验/创建 `ringing` → 通知被叫。
2. Callee accept/reject → 状态流转 `connecting/active` 或 `rejected/missed`。
3. 双端获取媒体凭据（LiveKit token 或 P2P 信令参数）→ ICE/SDP 交换 → 媒体建立。
4. leave/end/cancel/timeout → `ended/failed/canceled` + 持久化与通知。

## 7. 安全与合规
- 信令鉴权与会话成员校验（复用现有 `canSendDirectMessageBetween`/会话访问）。
- TURN 凭据短期化、地域与访问控制；不得嵌入前端长期密钥。
- 录制/转码（若未来）涉及存储与隐私，默认关闭并核实成本。

## 8. 测试清单（阶段 8）
- 同局域网/跨网络 1v1 音频、视频；权限拒绝；中途挂断/重连；群聊（若启用）；桌面端与 Web 互通 — **各项 PASS/FAIL/NOT TESTED**，无 TURN 场景需单列。
