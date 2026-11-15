# ONE（独一 / EARTH ONE）通信中心与网络中心验收与部署手册

## 1. 系统分层与严格边界
1. **ONE Communication（通信中心）**：
   - 信令与身份权限归 ONE 服务端所有（`server/calls/`），前端仅通过认证会话获取 10 分钟短期 Room Token（`LIVEKIT_API_SECRET` 与 `TURN_CREDENTIAL` 仅存服务端环境变量）。
   - 正常网络走 LiveKit SFU（`h720` + VP8 simulcast）或点对点 WebRTC；NAT 受限或阻断 UDP 时，通过 `coturn` **TURN/TCP 3478 / TURN/TLS 443·5349** 中继，并内置断网 ICE 自动重启恢复及“强转 TURN 中继”手动切换。
2. **ONE Network（网络中心）双模式严格分离**：
   - **模式 A · 内置浏览器代理**：通过 Electron `BrowserWindow` 与独立 `WebContentsView` 会话分区 `persist:one-browser` 设置 HTTP/HTTPS/SOCKS5（`socks5h://` 远程 DNS）代理。仅影响 ONE 桌面端内置浏览器网页标签，不修改宿主机全局代理，不干扰 ONE 实时音视频通话。
   - **模式 B · 系统级 VPN（WireGuard）**：由独立 VPS 宿主机运行 `wg-quick@wg0`，ONE 控制面（`server/network/`）只登记设备 **Curve25519 公钥** 并分配 `10.66.x.x/32` 隧道 IP。**私钥仅在设备本地（iOS Keychain / Android Keystore / 客户端本地）生成，API 强制拒收 `privateKey` 字段。**

## 2. 独立服务器部署与端口矩阵
| 角色 | 推荐配置 | 必须开放端口 | 可否部署于 Enzonic/Render 容器 |
| --- | --- | --- | --- |
| ONE 主站 Web/API/WS | 1–2 vCPU / 1–2 GB RAM + 持久化磁盘 (`server_data.json`, `data/`, `discovery.db*`) | `443/tcp` (HTTPS + WSS) | 可 |
| LiveKit SFU + coturn 媒体节点 | 2+ vCPU / 4 GB RAM / 公网独立 IPv4 | `443/tcp` (TLS/TURN), `3478/udp,tcp` (STUN/TURN), `7881/tcp` (RTC TCP fallback), `50000-50100/udp`, `49152-65535/udp` | **不可**（PaaS 不开放大范围 UDP 端口与直通公网主机路由） |
| WireGuard VPN 节点 | 1+ vCPU / 1 GB RAM / KVM Linux VPS | `51820/udp` (`wg0`), `443/tcp` (可选健康探针 `/health`) | **不可**（PaaS 无 `CAP_NET_ADMIN` / `/dev/net/tun` 与 UDP 51820 入口） |

## 3. 已完成自动化验证 vs 待真实硬件与公网节点验收项

### A. 本机与容器内已实际执行并通过的验证
1. **构建与静态类型检查**：`vite build` 与 `tsc --noEmit` 全部通过（覆盖前端、后端、`server/network/` 及 `/electron/*.ts`）。
2. **ONE Communication（Stage 1–2）**：
   - 未登录访问 `/api/calls/capabilities` 返回 `401`。
   - 双 Chromium 无头浏览器端到端隔离实测：来电弹窗、非房间成员调用 `/token` 被 `403/404` 拒绝、接听/拒绝/挂断、静音/扬声器/前后摄翻转、视频开关、未接来电记录 (`?filter=missed`) 与已读消除、移动视口 `390x844` 零横向溢出、ICE STUN/TURN 探测及一键切换 TURN 中继模式。
3. **ONE Electron 内置浏览器代理（Stage 3）**：
   - `proxyConfig.ts` 严格端口/主机验证、ONE 内网域名自动 `bypassRules`、`socks5h://` 远程 DNS 防泄漏及凭据脱敏单元测试。
   - Web 沙盒诚实提示验证 + Electron API 桥接模拟下 `SOCKS5` 配置保存、连通探针与状态栏实时标识验证。
4. **ONE Network 控制面与 UI（Stage 4 & Stage 7）**：
   - 服务端 `isValidWireGuardPublicKey`、私钥字段 `400` 强制拦截、SSRF 内网健康探针默认阻断、跨用户配置隔离 `403`、多设备唯一隧道 IP (`10.66.0.2/32`, `10.66.0.3/32`) 分配、原子持久化到独立测试库及吊销验证。
   - Playwright 桌面与手机 `390x844` 实测：模式 A / 模式 B 分离渲染、节点在线探测、浏览器本地生成 Curve25519 密钥对（网络包实测不含私钥）、`.conf` 预览导出、跳转内置浏览器代理弹窗。

### B. 需真实公网 VPS 与实体手机硬件完成的验收（受限于当前 Linux 无头容器环境未直接执行）
以下项目必须在接入公网 VPS（LiveKit/coturn + WireGuard 节点）及真机打包后最终勾选验收（完整步骤见 `deploy/communication/VERIFY_CALLS.md`）：
1. 两台物理电脑、两部实体手机及手机-电脑跨端真实麦克风/摄像头语音与视频通话。
2. 4G/5G <-> Wi-Fi 真实网络切换断线重连，及阻断 UDP 防火墙下 `TURN/TLS 443` 实网中继测试。
3. VPN（Mode B `wg0`）全程开启状态下发起 ONE 1:1 语音/视频通话（验证 `MTU=1280` 与 `PersistentKeepalive=25` 下通话不掉线）。
4. macOS/Windows Electron 真实桌面打包运行 `WebContentsView` + 真实代理认证。
5. macOS + Xcode 编译签名 `native/ios/` 真机验证 `NEPacketTunnelProvider` 与 APNs VoIP + `CallKit` 锁屏拉起。
6. Android Studio 编译签名 `native/android/` 真机验证 `GoBackend VpnService`、`Notification.CallStyle` 锁屏来电及后台通话保活。
