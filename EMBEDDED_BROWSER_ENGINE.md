# EARTH ONE 内嵌浏览器引擎原型

## 结论

EARTH ONE 当前是 React/Vite/Express Web 应用；普通网页无法自行捆绑或启动浏览器进程。此原型因此增加了一个**可选桌面运行目标**：Electron 外层承载原有 EARTH ONE 界面，Browser 仍是侧栏中的独立模块，而它的网页内容在桌面目标下由 Electron 的 `WebContentsView` 直接使用 Chromium 渲染。它不是 Google Chrome，也不宣称具有 Chrome 的全部产品能力。

在普通 Web 部署中，Browser 继续保留现有 iframe/正文预览回退，并明确显示“网页预览”；它不会把 iframe 假称为浏览器引擎。Browser 模块可用 `?module=browser` 直接打开，测试/深链可以用 `browserUrl` 指定一个 HTTP(S) 地址。

## 选型与许可

| 方案 | 实际引擎 | 许可证/特点 | 结论 |
| --- | --- | --- | --- |
| Electron `WebContentsView` | 随 Electron 提供的 Chromium，独立于系统默认浏览器 | Electron 主项目 MIT；Chromium 和随附依赖各有上游许可证及通知 | 选用。与目前 TypeScript/React 项目衔接直接，适合先做可选桌面原型。 |
| Chromium Embedded Framework (CEF) | Chromium | CEF 项目 BSD 许可，另需跟踪 Chromium 安全版本；需维护 C/C++/CEF 构建和绑定层 | 可作为未来原生壳替代，但不是此 Web 项目最小落地路径。 |
| Tauri 2 / WRY | 操作系统 WebView（各平台提供的组件） | Tauri MIT/Apache-2.0；体积较小，但不是统一随应用捆绑的 Chromium | 不满足“有自己的 Chromium 引擎”这一明确要求，因此未选。 |

许可核对： [Electron 项目许可证](https://github.com/electron/electron/blob/main/LICENSE)、[Chromium 许可信息](https://www.chromium.org/chromium-os/licensing/)、[CEF 项目及 BSD 许可说明](https://github.com/chromiumembedded/cef)、[Tauri 架构与许可证](https://v2.tauri.app/concept/architecture/)。发布桌面安装包时仍须随对应 Electron/Chromium 二进制保留并分发其版本所需的第三方许可/归属通知；上表不是法律意见。

## 现在能做什么

- Browser 模块在桌面目标内真实加载 HTTP 和 HTTPS 页面，提供 Chromium 渲染、多标签独立的页面历史、地址栏、后退/前进和重载。
- 书签与浏览历史仅保存在当前设备：桌面版通过受限 IPC 写入 Electron `userData/earth-one-browser-data.json`，不依赖启动时的临时端口；普通 Web 回退使用当前浏览器配置的 `localStorage`。上限为 200 个书签和最近 500 条历史。工具栏的“本地记录”面板可打开记录、删除单条书签，并分别清空书签或历史；清除需确认。数据不跨设备同步、不加密，也不会自动迁移旧服务端书签；旧 `/api/browser/bookmarks` API 保留但本 Browser UI 不再读取或写入它。
- 桌面版提供会话内下载管理器：列表显示文件名、来源、进度/状态；下载需通过 Electron 系统保存对话框选择位置，可取消进行中的下载，并可从列表移除已结束记录（不会删除文件）。保存路径仅在 Electron 返回用户已选路径后显示；来源隐藏查询参数和片段。列表不持久化、不同步，普通 Web 模式不显示此功能。
- 已归档文章仍是独立功能，继续使用现有 EARTH ONE 服务。桌面 Chromium 导航不会把目标 URL 发给服务器 `/api/browser/fetch-preview`；因此普通网页正文不会自动提取，AI 总结、翻译和归档只有在标签已有可用正文时才会执行。Web 回退仍保留原有预览路径。
- 在 Chromium 网页焦点下按 `Ctrl+L` 或 `Cmd+L`，会回到 EARTH ONE 地址栏并选中完整网址。
- Chromium 视图由占位框的实际位置和尺寸驱动，切换到其他 EARTH ONE 模块、进入阅读模式或打开覆盖层时会隐藏；Browser 标签的界面与地址栏仍留在 EARTH ONE 内。
- 普通 Web 版继续使用原有回退界面；用户可从工具栏识别当前是“真实 Chromium”还是“网页预览”。

## 安全边界

- 远程网页在无 Node.js 集成、启用 `contextIsolation`、启用渲染器 sandbox 和默认 Web 安全的 Chromium WebContents 中运行；远程网页没有 preload。
- 只有 EARTH ONE 本地壳的 preload 暴露少量导航/尺寸/本机浏览数据 API；主进程校验调用方 WebContents、顶层主框架和来源 origin，并拒绝 `file:`, `javascript:`, `data:`, `ftp:` 等非 HTTP(S) 地址。拒绝网页弹出窗口。本机数据仅能通过固定的 JSON 结构读写；主进程限制字段、条数和 2 MiB 总大小，先同步临时文件再原子替换应用 `userData` 文件。检测到无法解析、版本未知、超限或含无效记录时，会以只读状态保护原文件。数据文件不加密，应按本机个人浏览数据对待。
- 浏览器会话为应用进程内存会话（非 `persist:`），标签共享该会话，应用退出后不保留网站 cookie。通知、定位等网页权限一律默认拒绝；没有权限设置界面。
- 桌面下载使用 Electron 保存文件对话框；生产路径不会预设或静默写入路径。下载记录仅保存在当前会话，通过受限 IPC 只接受记录 ID 执行取消/移除；不接受 renderer 提供的文件路径。文件不会自动打开或执行；没有恶意文件扫描、大小/类型限制、暂停/续传或重启后恢复记录。移除完成记录只影响列表，不删除已保存文件。证书错误不做绕过。桌面 Chromium 在用户设备上直接打开用户输入的 HTTP(S) 地址（包括 localhost/内网地址），不让 EARTH ONE 服务器代访该地址；它不是通用 SSRF 隔离器。**自动化测试只连测试脚本在 127.0.0.1 上创建的合成页面/下载夹具，不探测或访问任意私网目标。**
- 普通 Web 回退仍保留原有服务器端 `/api/browser/fetch-preview` 行为；该旧 API 未纳入本次 SSRF 硬化。若以公网可访问服务部署，需另行校验解析后的目标 IP 与每次重定向，不能把它当作通用公开 URL 代理。桌面 Chromium 不调用此端点。
- 尚无扩展、跨设备 Chrome 同步、密码管理/自动填充、跨重启网站 cookie、完整下载队列或 Chrome 兼容承诺。普通 Web 回退的 localStorage 受浏览器配置/站点数据清理影响；桌面本机书签与历史不包含远程网页 cookie，也不会迁移旧服务端书签。用户可访问的网页可能不受 iframe 回退支持，因此桌面引擎仍是有实质意义的模式差异。

## 本地启动

在该仓库安装依赖后运行：

```sh
bun install
bun run desktop:dev
```

`electron` 已列入 Bun 的 `trustedDependencies`，以运行其必需的安装脚本并下载匹配的桌面 Chromium 二进制。启动器会在本机 loopback 临时端口启动既有 Express/Vite 服务（跳过启动时的书籍抓取），然后打开 Electron 窗口；关闭窗口会结束本地服务。普通 Web 开发仍使用 `bun run dev`，静态构建仍使用 `bun run build`。这次交付的是源码级可运行原型，不包含签名安装包、自动更新器或生产发布配置。

## 测试

```sh
bun run lint
bun run build
bun run test:browser-engine
```

下载管理器单元测试使用合成 DownloadItem 和内存会话，覆盖系统保存对话框默认行为（不预设保存路径）、成功/进度、取消、无效 URL/凭据 URL、非浏览器标签来源拒绝及仅按 ID 移除。引擎集成测试在 Linux 使用 Xvfb 启动真正的 Electron/Chromium 窗口，并验证两个本机合成页面的导航/返回和本机历史写入、收藏写入应用 `userData` 文件、应用页面重载后可从文件恢复、分别清除历史/书签、面板清除控件与隐私说明，以及整轮操作没有请求服务端书签 API；同时覆盖 `Ctrl+L`、`javascript:`/`file:` 拒绝、通知权限默认拒绝、下载状态面板/已批准临时路径/仅移除列表和窄窗口视口同步。测试仅在隔离 smoke 环境以临时目录模拟保存对话框批准；服务端 JSON、Electron 用户配置、下载目录均位于自动清理的临时目录；测试只绑定 `127.0.0.1`，不访问外部网站。Xvfb 环境临时启用 Chromium SwiftShader 软件 WebGL；普通桌面启动不设置该参数。

## 平台与维护

原型需要 Electron 对应的桌面二进制；面向 Windows/macOS/Linux 的可分发包尚未配置/签名。Smoke test 已在 Linux/Xvfb 单一缩放环境运行；Windows/macOS、跨显示器 DPI、签名与自动更新尚未验证。它不能把 Chromium 引擎嵌进普通浏览器网页，也不适用于 iOS/Android 原生容器。Electron/Chromium 必须持续升级以接收安全修复；CEF 也有 Chromium 更新时差。目标 Electron 当前以 `^45.2.2` 声明，维护者应在每次发布前核对实际锁定版本、Chromium 版本和安全公告，并同步第三方通知。
