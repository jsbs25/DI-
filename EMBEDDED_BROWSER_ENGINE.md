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
- Electron 桌面端进入 Browser 后默认显示本机 Chromium 网页视图；“纯净阅读模式”仍可通过工具栏切换。没有 Electron Browser bridge 的普通 Web 回退继续默认使用现有纯净阅读模式。
- 桌面地址栏只根据当前标签的 Chromium 主框架导航事件显示连接状态：成功的 HTTP 主框架标为“未加密”；成功的 HTTPS 主框架标为“已加密”，其说明限定为 Chromium 已接受该 TLS 证书，不代表网站本身可信或安全。TLS 证书被 Chromium 拒绝时，主框架失败状态明确标为“证书错误 · 已拦截”，导航仍被阻止，也没有“继续访问/绕过”入口。加载中或缺少精确证据时显示中性“状态未知”。子资源、非活动标签、Reader preview 和普通 Web 回退不会提供或继承这项状态。
- 桌面 Chromium 中，网页的 `target="_blank"` 和 `window.open()` 请求经应用确认后，会在 EARTH ONE Browser 标签栏打开并聚焦新标签；Electron 原生弹窗一律拒绝，由应用创建使用同一 Browser 专用会话的独立页面视图。Electron 没有可信的 popup 用户手势标志，且 Chromium disposition 不能证明手势，因此所有网页 popup 都显示确认框；拒绝或没有活动来源标签时不创建新标签。右键安全的 HTTP(S) 链接由用户明确选择“在新标签页中打开链接”后直接打开。
- 书签与浏览历史仅保存在当前设备：桌面版通过受限 IPC 写入 Electron `userData/earth-one-browser-data.json`，不依赖启动时的临时端口；普通 Web 回退使用当前浏览器配置的 `localStorage`。上限为 200 个书签和最近 500 条历史。工具栏的“本地记录”面板可打开记录、删除单条书签，并分别清空书签或历史；清除需确认。数据不跨设备同步、不加密，也不会自动迁移旧服务端书签；旧 `/api/browser/bookmarks` API 保留但本 Browser UI 不再读取或写入它。
- 桌面版提供本机下载管理器：列表显示文件名、来源、进度/状态；下载需通过 Electron 系统保存对话框选择位置，最多在 Electron `userData/earth-one-downloads.json` 中保留最近 50 条已获准路径的记录，重启后恢复；未完成记录会显示为已中断。保存路径只在 Electron 返回用户选择的绝对路径后保存，来源隐藏查询参数和片段。可将单条记录移除或清除已结束记录，这些操作只删元数据、不删除文件，也不取消进行中的任务；“在文件夹中显示”只对再次确认仍存在的普通文件显示。记录不发送到服务器或云端，普通 Web 模式不显示此功能。
- 桌面工具栏提供“启动恢复：开/关”，默认关闭。启用后，单独保存到 Electron `userData/earth-one-browser-session.json` 的最多 12 个标签仅含标签 ID、安全展示用的主机名和 HTTP(S) URL；普通查询参数会保留以便恢复搜索/文章视图，片段会移除；若查询键明显包含 `token`、`auth`、`code`、`key`、`password`、`session`、`credential` 等敏感词，该标签 URL 整体跳过。关闭该开关会清除已保存的标签快照。损坏或超限文件会关闭恢复并保护原文件；若页面恢复失败，标签仍保留且界面显示失败数量和地址栏重试提示。此功能不保存 Cookie、凭据、表单内容、页面正文或网络请求，不向服务器/云端同步；普通 Web 版不显示该设置，行为不变。
- 桌面 Browser 新增“隐私”面板。用户逐项选择本机浏览历史、书签、下载历史记录、启动恢复快照、会话站点权限和当前 Browser 会话的网站数据，并在执行前再次确认。最近一小时、24 小时、7 天、4 周或全部时间只适用于带时间戳的历史与下载记录；无可靠时间戳的其他类别按整类清除。下载记录清除只删已结束记录，保留进行中的下载、下载文件和用户创建的 PDF。恢复快照清除会关闭恢复并删除快照；权限清除会撤销本次运行的授权并拒绝待处理请求。
- 网站数据清除只针对独立的非持久 Chromium Browser session，明确覆盖 Cookie、缓存、文件系统、IndexedDB、localStorage、Service Worker、WebSQL 与 background fetch，并尽可能清除 HTTP 身份验证缓存；按 [Electron Session API](https://www.electronjs.org/docs/latest/api/session) 调用。当前 Browser 标签先暂时卸载，清理后恢复原网址；如果某个标签无法恢复，界面会报告。EARTH ONE app/default session、登录/账号数据、`server_data.json`、Library、已归档文章、下载文件、PDF 与未选项目都不清除、不上传。损坏或不可读的本机数据文件维持只读保护；普通 Web 回退不显示此面板，保持原行为。
- 已归档文章仍是独立功能，继续使用现有 EARTH ONE 服务。桌面 Chromium 导航不会把目标 URL 发给服务器 `/api/browser/fetch-preview`；因此普通网页正文不会自动提取，AI 总结、翻译和归档只有在标签已有可用正文时才会执行。Web 回退仍保留原有预览路径。
- 在 Chromium 网页焦点下按 `Ctrl+L` 或 `Cmd+L`，会回到 EARTH ONE 地址栏并选中完整网址。
- 在 Chromium 网页焦点下按 `Ctrl+F` 或 `Cmd+F`，会把焦点安全转回 EARTH ONE 查找框；按 Enter/Shift+Enter 或前后按钮浏览匹配项，显示当前序号与总数。关闭或按 Esc 会调用 Chromium `stopFindInPage('clearSelection')` 清除高亮并将焦点还给页面；最长查找词为 512 个字符。普通 Web 预览不提供此原生查找接口，工具栏会明确显示不可用，EARTH ONE 不拦截浏览器自己的查找快捷键。
- 标签栏支持拖拽重排；界面与主进程顺序保持一致，因此数字快捷键、Tab 循环和启用时的 URL 会话顺序都遵循当前显示顺序。活动标签与网页焦点不会因仅改变顺序而被主动切换。
- 在活动 Chromium 网页焦点下，`Ctrl/Cmd+T` 新建安全默认页标签，`Ctrl/Cmd+W` 关闭当前标签；关闭最后一个标签会在原标签中打开安全默认页而不退出应用。`Ctrl/Cmd+Shift+T` 或工具栏“恢复最近关闭的标签页”按钮可恢复最近一次真实关闭的标签。恢复仅保留进程内、经过 HTTP(S) 与现有会话隐私规则校验的 URL：普通查询可保留，片段移除，明显敏感的查询 URL 不可恢复；它不会序列化关闭标签的 Cookie、页面/表单状态或缩放，恢复页面使用新的 Chromium WebContents 并从 100% 缩放开始，也不会跨应用重启保留。恢复接口不接受网页传入的标签 ID 或目标 URL。`Ctrl/Cmd+Tab` 与 `Ctrl/Cmd+Shift+Tab` 循环标签，`Ctrl/Cmd+1..8` 选择对应标签，`Ctrl/Cmd+9` 选择最后一个标签。`Ctrl/Cmd+L` 地址栏与 `Ctrl/Cmd+F` 页内查找保持不变；快捷键不接管 EARTH ONE 自有输入框、纯净阅读模式、普通 Web 预览或非 Browser 模块。
- 桌面 Chromium 工具栏显示当前缩放百分比，并提供减小、增大和重置（100%）；缩放限制为 50%–200%。在活动 Chromium 网页焦点下，`Ctrl/Cmd+Plus`、`Ctrl/Cmd+Minus` 和 `Ctrl/Cmd+0` 分别放大、缩小和重置；地址栏、查找框等 EARTH ONE 自有输入框聚焦时不接管这些键。缩放是每标签独立设置（同源标签也隔离），只保存在当前应用运行期间的内存中；关闭普通标签会丢弃其比例。关闭最后一个标签时，应用会在原标签安全替换默认页，因此同一会话内沿用该标签的比例；退出应用/重启后，新建或 URL 恢复的页面从 100% 开始。缩放不会写入可选 URL 标签恢复文件、网站设置或任何持久存储。普通 Web 预览和纯净阅读模式保持原有表现，不显示这些 Chromium 控件。
- Chromium 视图由占位框的实际位置和尺寸驱动，切换到其他 EARTH ONE 模块、进入阅读模式或打开覆盖层时会隐藏；Browser 标签的界面与地址栏仍留在 EARTH ONE 内。
- 桌面 Chromium 工具栏提供“保存 PDF”：只对当前可见、未处于纯净阅读模式的 HTTP(S) Chromium 标签调用 Electron `webContents.printToPDF`。用户先通过系统保存对话框选择本机 `.pdf` 路径，完成后原子写入；取消不会生成文件。路径不回传到网页，不写入历史、会话、下载记录或服务器，也不会自动打开/执行 PDF。普通 Web 预览明确标为不支持 Chromium PDF，不调用网页宿主的打印功能。
- 普通 Web 版继续使用原有回退界面；用户可从工具栏识别当前是“真实 Chromium”还是“网页预览”。

## 安全边界

- 远程网页在无 Node.js 集成、启用 `contextIsolation`、启用渲染器 sandbox 和默认 Web 安全的 Chromium WebContents 中运行；远程网页没有 preload。点击打开和确认打开的弹窗都会被 Electron 拒绝创建原生子窗口，再由主进程建立新的 Browser `WebContentsView`，因此新页没有 `window.opener`、Node 能力或继承的 EARTH ONE preload；新视图明确使用专用的非持久 Browser session。
- 只有 EARTH ONE 本地壳的 preload 暴露少量导航/尺寸/本机浏览数据及会话权限 API；主进程校验调用方 WebContents、顶层主框架和精确应用来源 origin。权限决定通过短期请求令牌绑定主进程记录的活动 Chromium 页面，不接受 renderer 提供的标签 ID；页面切换、导航或退出时待决请求会拒绝。主进程也拒绝 `file:`, `javascript:`, `data:`, `ftp:` 等非 HTTP(S) 导航。弹窗只接受无凭据的 HTTP(S) URL，阻断 EARTH ONE 自身 origin 和带 POST body 的新窗口表单；由于 Electron 不提供可信的用户手势标志，且 disposition 本身不足以证明用户输入，所有网页 popup 请求都会先由应用确认。右键菜单仅对校验通过、来自活动 Browser 标签的 HTTP(S) 链接提供新标签操作。应用路由仍留在 EARTH ONE 主窗口，不由远程 popup 接管。本机数据仅能通过固定的 JSON 结构读写；主进程限制字段、条数和 2 MiB 总大小，先同步临时文件再原子替换应用 `userData` 文件。检测到无法解析、版本未知、超限或含无效记录时，会以只读状态保护原文件。数据文件不加密，应按本机个人浏览数据对待。
- 页内查找 IPC 同样经过主窗口 WebContents、顶层框架和精确应用来源校验；调用不接受标签 ID 或 WebContents ID，只允许主进程针对当前可见活动 Chromium 标签执行受限查询/清除。结果回传前核对标签与最新 Electron `requestId`，过期或非活动页面结果会丢弃。远程 `WebContentsView` 不设置 preload，且维持 Node 集成关闭。
- 标签与缩放快捷键由 Electron 主进程在各 Browser `WebContentsView` 的 `before-input-event` 中处理；主进程再次确认事件来自当前活动且可见标签后才执行。缩放桥接仅接受增大/减小/重置枚举，不接受标签 ID、目标页或任意命令，并且只操作主进程当时认定的活动标签。快捷键不会经由远程页面可调用的 IPC 提交标签 ID；远程页面没有快捷键或缩放控制通道。关闭事件只通过受限 preload 事件通知同步标签栏，Reader Mode/普通 Web/其他模块/应用输入框不会复用这条远程页快捷键路由。
- 保存 PDF 的 IPC 同样只允许主窗口的精确顶层应用来源调用；preload 不接受标签 ID、URL、文件路径或打印选项。主进程只选取引擎当前可见活动标签，验证页面 URL 与主框架同源且为无凭据 HTTP(S)，并在系统保存对话框返回后再次确认标签、WebContents 与 URL 未变化。无效/非本机路径和非 PDF 目标会被拒绝；输出先写入同目录独占临时文件，再原子替换为用户选择的文件。路径只留在主进程内存，不调用任何自动打开或执行 API；整个功能不进行网络抓取或服务器请求。
- 浏览器会话为应用进程内存会话（非 `persist:`），标签共享该会话，应用退出后不保留网站 cookie。上面的可选标签恢复仅保存经过限制的 URL 元数据，不序列化 Chromium session/cookie/cache；URL 使用独立版本化文件和白名单字段，普通查询参数保留、片段移除，明显敏感查询键会令该 URL 不入库。桌面 Chromium 仅支持通知与定位：对 HTTPS 和 HTTP loopback 安全来源的活动顶层页面，EARTH ONE 会显示来源与能力并默认拒绝；用户可明确允许本次应用运行，之后可在工具栏审阅并撤销。授权仅保存在进程内存，重启清空；不安全/非 HTTP(S) 来源、子框架和其他能力均拒绝。摄像头、麦克风、剪贴板与 USB 不在本里程碑支持范围内。普通 Web 回退保持原有行为。
- 桌面下载使用 Electron 保存文件对话框；生产路径不会预设或静默写入路径。下载历史独立保存在 Electron `userData` 下、最多 50 条，原子写入并校验恢复数据；损坏文件以只读状态保护，不会静默覆盖。持久记录只包含保存对话框批准后的绝对路径和脱敏来源，不连接任何服务器 API，也不改动浏览器 cookie/session 设置。受限 IPC 只接受记录 ID；显示文件夹前由主进程重新校验路径存在且为文件，不接受 renderer 提供路径，不调用自动打开/执行 API。移除和清除只删除记录、不删除用户文件；未完成记录重启后标记为已中断。没有恶意文件扫描、大小/类型限制、暂停/续传。证书错误不做绕过。桌面 Chromium 在用户设备上直接打开用户输入的 HTTP(S) 地址（包括 localhost/内网地址），不让 EARTH ONE 服务器代访该地址；它不是通用 SSRF 隔离器。**自动化测试只连测试脚本在 127.0.0.1 上创建的合成页面/下载夹具，不探测或访问任意私网目标。**
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
bun run test:session-store
bun run test:browser-connection-status
bun run test:browser-find
bun run test:browser-shortcuts
bun run test:browser-zoom
bun run test:browser-print-pdf
bun run test:browser-popups
bun run test:browser-ipc-security
bun run test:browser-engine
```

会话存储单元测试覆盖默认关闭、普通查询保留、片段删除、敏感查询键跳过、无效 URL 删除、12 标签/128 KiB 上限和损坏/超限文件不覆盖。`test:browser-find` 使用模拟 WebContents 检查活动标签隔离、前后方向、查询长度/类型、过期结果过滤、清除高亮调用、焦点恢复和隐藏/销毁保护；`test:browser-shortcuts` 检查 Ctrl/Cmd 修饰键、Tab 循环、数字标签和无效组合。`test:browser-zoom` 单测检查安全缩放范围、活动标签目标、同源标签独立状态、最后标签替换保留比例和非法操作拒绝；`test:browser-engine` 的 Xvfb 真实 Electron smoke 验证实际页面比例、工具栏及 Ctrl/Cmd 缩放、地址栏/查找框/Reader Mode 排除、同源和跨来源标签隔离、远程页面无 preload/Node 且收不到缩放快捷键；会话恢复 smoke 另验证缩放不写入 URL 快照且重启恢复到 100%。标签快捷键集成 smoke 另验证新建/关闭/循环/索引选择、UI 标签同步、非 Browser 活动状态不响应，以及远程页未获 preload/Node。`test:browser-popups` 覆盖协议及应用 origin 白名单、手势不明时要求确认、右键链接回调、活动标签焦点及专用 session/no preload/Node 设置。`test:browser-ipc-security` 验证只有精确主窗口顶层应用来源能调用 IPC。完整 Electron 集成测试还会使用独立本机窗口确认不可信 WebContents 的查找 IPC 被拒；在真实 Chromium 合成页验证真实 `target=_blank`/`window.open`、无手势拒绝路径、危险与无效 URL、应用路由边界、焦点、Browser session 复用以及新页没有 opener/preload/Node；查找仍验证匹配项、前后导航、关闭清除与焦点返回。会话与下载 smoke 继续覆盖默认关闭/启用后的 URL-only 恢复、失败页提示、表单/Cookie/凭据不持久化、本机记录及导航下载。所有 fixture 仅绑定 `127.0.0.1`，Chromium 测试策略阻止访问其他来源，临时服务端 JSON、Electron 用户配置和下载目录均自动清理。Xvfb 临时启用 Chromium SwiftShader；普通桌面启动不设置该参数。
PDF 专项单测覆盖跨来源拦截、HTTP(S) 与主框架 origin 边界、非活动标签、对话框取消、路径校验、渲染器无法提供保存路径、切换标签后的中止以及原子写入。Electron 集成 smoke 在仅含 loopback 的双页合成站点上验证取消无输出、真实 `%PDF-` 文件头与页数、对话框指定路径、保存路径不返回 renderer，以及导出期间无网络/API 请求；生产环境始终使用系统原生保存对话框。

连接状态单测与集成 smoke 分别验证主框架 HTTP/最终重定向协议/子框架隔离/每标签状态以及 Chromium 拒绝 TLS 证书后错误提示和继续阻止导航；真实 smoke 还覆盖后续有效页面清错、Reader preview 隐藏指示器。TLS 测试服务只监听 `127.0.0.1`，生成的一日自签证书与私钥写入临时目录并随 smoke 清理，Chromium 不接受该证书，测试不向系统或 Chromium 信任库添加例外，也不访问外部网站。

## 平台与维护

原型需要 Electron 对应的桌面二进制；面向 Windows/macOS/Linux 的可分发包尚未配置/签名。Smoke test 已在 Linux/Xvfb 单一缩放环境运行；Windows/macOS、跨显示器 DPI、签名与自动更新尚未验证。它不能把 Chromium 引擎嵌进普通浏览器网页，也不适用于 iOS/Android 原生容器。Electron/Chromium 必须持续升级以接收安全修复；CEF 也有 Chromium 更新时差。目标 Electron 当前以 `^45.2.2` 声明，维护者应在每次发布前核对实际锁定版本、Chromium 版本和安全公告，并同步第三方通知。
