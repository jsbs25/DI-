# ONE iOS 原生模块说明（WireGuard VPN + CallKit/APNs）

本目录提供 **ONE 系统级 VPN（Mode B）** 与 **ONE Communication 后台来电唤醒** 的 iOS 原生 Swift 核心模块骨架，基于官方开源项目 `WireGuard/wireguard-apple`（MIT 协议）与 Apple 原生 `NetworkExtension` / `PushKit` / `CallKit` 框架。

## 1. 模块清单
- `OnePacketTunnel/PacketTunnelProvider.swift`：`NEPacketTunnelProvider` 扩展进程，使用 `WireGuardKit.WireGuardAdapter` 启动/停止系统级 `utun` 隧道，并从 App Group Keychain 本地读取私钥。
- `OneApp/OneKeychainStore.swift`：设备本地 Curve25519 密钥对管理（`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`），确保私钥永不上传 ONE 服务端。
- `OneApp/WireGuardManager.swift`：主 App 中的 `NETunnelProviderManager` 控制器，负责对接 ONE `/api/network/devices` 注册公钥并拉取模板拉起系统 VPN。
- `OneApp/CallKitPushManager.swift`：`PKPushRegistry`（APNs VoIP）+ `CXProvider`（CallKit），保证 App 处于后台/锁屏/被系统回收后仍可响应来电铃声与系统接听界面。

## 2. Xcode 工程配置步骤（需在 macOS + Xcode 中完成）
1. **Targets 结构**：
   - Target 1：`OneApp`（主 iOS App，Bundle ID 如 `com.earthone.app`，iOS Deployment Target `15.0+`）
   - Target 2：`OnePacketTunnel`（Network Extension -> Packet Tunnel Provider，Bundle ID 必须为 `com.earthone.app.PacketTunnel`）
2. **Swift Package Manager (SPM)**：
   - 添加官方仓库：`https://github.com/WireGuard/wireguard-apple`
   - 将 `WireGuardKit` 库同时链接到 `OneApp` 和 `OnePacketTunnel` 两个 Target。
   - 如需接入 LiveKit iOS 原生 SDK，可同步添加 `https://github.com/livekit/client-sdk-swift`。
3. **Capabilities 与 Entitlements**（两个 Target 均需勾选 **App Groups**: `group.com.earthone.app` 和 **Keychain Sharing**: `group.com.earthone.app`）：
   - `OneApp.entitlements`：
     - `com.apple.developer.networking.networkextension`: `["packet-tunnel-provider"]`
     - `com.apple.security.application-groups`: `["group.com.earthone.app"]`
     - `aps-environment`: `production`（调试期 `development`）
   - `OnePacketTunnel.entitlements`：
     - `com.apple.developer.networking.networkextension`: `["packet-tunnel-provider"]`
     - `com.apple.security.application-groups`: `["group.com.earthone.app"]`
4. **`Info.plist` 权限**：
   - `UIBackgroundModes`: `["voip", "audio", "fetch", "remote-notification"]`
   - `NSMicrophoneUsageDescription`：ONE 语音和视频通话需要访问您的麦克风
   - `NSCameraUsageDescription`：ONE 视频通话需要访问您的摄像头

## 3. 编译与真实能力边界声明
- 当前开发环境为 Linux/Node.js 容器，**无法编译 iOS `.ipa` 或真机运行 `NEPacketTunnelProvider` / `CallKit` / `APNs`**。
- Apple 规定：普通 Safari / PWA **禁止** 使用系统 `utun` VPN 和 `PushKit` VoIP 后台强唤醒；必须通过付费 Apple Developer 账号在 macOS Xcode 中签名上述 `NetworkExtension` 权限并安装真机后，系统级 VPN 与锁屏来电才可生效。
