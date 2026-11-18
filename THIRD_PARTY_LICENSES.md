# ONE Third-Party Open-Source Software & License Disclosure

ONE（独一 / EARTH ONE）在升级 **ONE Communication（通信中心）** 与 **ONE Network（网络中心）** 过程中，严格复用成熟开源基础设施与规范授权组件，未重复造轮子，亦未将开源协议条款混同隐藏。

| 组件名称 | 用途模块 | 开源仓库 | 许可证 | 使用边界声明 |
| --- | --- | --- | --- | --- |
| LiveKit Server & SDKs | ONE Communication SFU 媒体服务器与前端/服务端 Token 签发 | `https://github.com/livekit/livekit` / `livekit-client` / `livekit-server-sdk` | Apache-2.0 | 前端与服务端依赖包已在 `package.json` 声明；独立部署模板见 `deploy/communication/` |
| coturn | ONE Communication STUN / TURN (UDP/TCP/TLS) 穿透中继 | `https://github.com/coturn/coturn` | BSD-3-Clause | 仅做独立媒体服务器配置模板 (`deploy/communication/turnserver.conf.example`)，未将二进制打包入仓库 |
| Caddy Server | LiveKit / WebSocket TLS 443 反向代理参考 | `https://github.com/caddyserver/caddy` | Apache-2.0 | 可选自动 TLS 反代方案，文档见 `deploy/communication/README.md` |
| Electron | ONE 桌面浏览器壳与 `WebContentsView` (`persist:one-browser`) 隔离代理 | `https://github.com/electron/electron` | MIT | 仅通过 `electron/main.ts` 运行时桥接调用，未在仓库冗余存储二进制 |
| WireGuard (`wireguard-apple`) | ONE Network Mode B iOS 系统级 `NEPacketTunnelProvider` (`WireGuardKit`) | `https://github.com/WireGuard/wireguard-apple` | MIT | 通过 Swift Package Manager 接入（源码集成清单见 `native/ios/`） |
| WireGuard (`wireguard-android`) | ONE Network Mode B Android 系统级 `VpnService` (`GoBackend`) | `https://github.com/WireGuard/wireguard-android` | Apache-2.0 | 通过 Maven `com.wireguard.android:tunnel` 接入（见 `native/android/`） |
| WireGuard Linux Kernel / Tools | ONE Network Mode B 服务端 `wg0` 网关隧道 | `https://www.wireguard.com/` | GPLv2 (`wg0` 服务端独立运行) | 独立运行于 Linux VPS 内核与用户态 `wg-quick`，与 ONE Node.js 进程完全进程隔离 |
| Lucide Icons / cmdk / Tailwind CSS / Express / ws | UI 图标、命令面板、样式、Web 与信令后端 | npm dependencies (`package.json`) | MIT / ISC | 现有项目基础技术栈保留未更换 |
| Three.js (`mrdoob/three.js`) | EARTH ONE 3D 地球/月球/宇宙中央入口、太阳系引擎与 WebGL 渲染 | `https://github.com/mrdoob/three.js` | MIT | 核心 3D 场景、GPU 着色器、`EffectComposer` 与硬件分级渲染 |
| galaxy-explorer | 对数螺旋星系结构、星尘 GPU 着色与流星机制技术参考 | `https://github.com/zjoooooo/galaxy-explorer` | MIT | 仅作着色器架构与粒子性能优化参考，由 EARTH ONE 原创重写 GLSL/TS |
| space-3d (Nebularity) | 程序化 3D 星云噪声架构与多深度星场参考 | `https://github.com/wwwtyro/space-3d` | Unlicense | 公共领域算法参考；核心 3D FBM 星云壳与星团由 EARTH ONE 独立实现 |
| wormhole-extreme | 空间纵深视差与漂浮感动态技术参考 | `https://github.com/rainner/wormhole-extreme` | MIT | 仅作空间纵深交互概念参考；未复用 AGPL-3.0 协议项目代码 |
