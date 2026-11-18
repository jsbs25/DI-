# EARTH ONE（地球一号 · 一个世界，无限可能）

> **THE NEXT GENERATION GLOBAL DIGITAL WORLD**
> **ONE EARTH. ONE WORLD. ONE HUMANITY.**

**EARTH ONE** 是一个融合了 **3D 宇宙与地球数字入口、全双工自然情感 AI 伴侣、统一音乐空间（Venus）、全球即时通讯与音视频通话、数字图书馆、视频门户、多语言学习中心、跨端 PWA 与 Electron 桌面浏览外壳** 的全栈数字世界平台。

---

## ✨ 核心功能体系

### 1. 3D 空间与行星数字入口
- **Home 3D 中央入口（`ProductCulture3D`）**：Three.js 实时渲染地球、月球、太阳系与对数螺旋宇宙背景引擎（`cosmosBackdrop` + `EffectComposer`），支持拖拽交互、视角重置与沉浸全屏观赏。
- **3D 数字地球（`DigitalGlobe`）**：球面地理坐标映射、国家/城市节点、发光连线弧、日夜程序化着色器、大气瑞利散射边缘光与镜头飞跃。
- **太阳系与天体探索（`UniverseEngine` / `SolarSystemDirectory`）**：10 个天体物理模拟（太阳、水星、金星、地球与月球、火星、土星环、天王星、海王星等）、月球观测站与金星音乐空间。

### 2. 全双工自然情感 AI 系统（`One.` 悬浮伴侣 & `AIHub`）
- **自然拟人化对话引擎**：基于多轮上下文管理与反机械化系统提示词，支持口语、错别字与上下文承接理解，按问题复杂度动态调整简答或深析。
- **长期记忆系统**：持久化记录用户长期目标、习惯与偏好，按需唤醒历史上下文并避免错误信息污染。
- **单一自然甜美声线与连续语音交互**：内置语速优化、唤醒与打断处理（Barge-in）、实时流式输出（DeepSeek + Gemini 双通道路由与 WebSocket 实时音频通信）。
- **悬浮一体音乐联动**：主界面悬浮 AI 球（`One.`）与音乐播放器无缝融合——说话时自动暂停音乐，结束回复后自动恢复续播。

### 3. Venus 统一音乐空间 & 媒体中心
- **Venus Music Space**：沉浸式音乐播放空间、持久化播放列表与跨模块统一音频会话管理，集成 Bilibili / YouTube 音乐检索与元数据聚合。
- **数字图书馆（`DigitalLibrary`）**：支持 EPUB 与 PDF 在线阅读器、AI 伴读分析、安全沙箱解析与多来源图书检索。
- **全球视频与发现中心（`VideoPortal` / `JupiterSearch`）**：视频流浏览、跨源发现引擎与知识图谱检索。

### 4. 全球即时通讯与音视频通话（`GlobalMessenger`）
- **实时聊天与 AI 多语互译**：1 对 1 私聊、公共频道、国家群组、引用回复、已读回执及中文 / 英文 / 阿拉伯语（完整 RTL 排版）/ 西班牙语 / 法语 / 俄语实时互译。
- **清晰语音消息**：高质量 WAV 语音录制与倍速播放控件。
- **LiveKit / WebRTC 音视频通话**：支持语音/视频通话、屏幕共享、断线自动重连、TURN/STUN 中继保底与桌面通知推送。

### 5. 多语言学习与娱乐中心
- **语言学习工作区**：沉浸式多语练习平台（`DuolingoImmersionPlatform`）与阿拉伯语 28 字母间隔重复记忆系统（`ArabicLearningHub`）。
- **全球游戏中心（`GameCenter`）**：在线国际象棋、五子棋与知识挑战。

### 6. 跨端支持（Web · 手机 PWA · Electron 桌面端）
- **手机端 PWA 安装与独立子界面**：支持“添加到主屏幕”及桌面快捷方式直接跳转对应独立全屏界面，内置返回导航。
- **Electron 桌面外壳（`electron/`）**：支持 `WebContentsView` 隔离浏览器会话及代理配置；`native/` 与 `deploy/` 包含 iOS / Android WireGuard 与 LiveKit / Coturn / Caddy 部署模板。

---

## 📂 项目结构概览

```text
.
├── server.ts                  # Express + Vite/Dist + WebSocket 全栈服务入口
├── server/                    # 后端模块：AI 网关、DeepSeek/Gemini 路由、通讯信令、爬虫与存储
├── src/
│   ├── App.tsx                # 应用主路由、导航与全局状态编排
│   ├── components/
│   │   ├── ai/                # HolographicAICompanion (One.) 与 AIHub
│   │   ├── auth/              # 登录、注册与引导流程（支持中文及多语言用户名）
│   │   ├── brand/             # 品牌视觉与 Home 3D 中央入口 (ProductCulture3D)
│   │   ├── chat/              # 全球实时通讯、语音消息与 LiveKit 通话中心
│   │   ├── globe/             # 3D 数字地球与地理节点交互
│   │   ├── home/              # 主页入口容器 (OneHome)
│   │   ├── learning/          # 多语沉浸学习与阿拉伯语学习中心
│   │   ├── library/           # 数字图书馆与 EPUB/PDF 阅读器
│   │   ├── network/           # ONE Network 网络与代理中心
│   │   ├── spatial/           # 宇宙背景引擎与硬件分级 WebGL 能力工具
│   │   └── video/             # 视频门户与流媒体视图
│   ├── music/                 # 统一音乐播放器内核与上下文 (PlayerContext)
│   ├── universe/              # 太阳系引擎、Venus 音乐空间与月球观测站
│   └── utils/                 # 语音录制、情感分析、流式读取等工具
├── electron/                  # Electron 桌面外壳主进程与预加载桥接
├── deploy/                    # LiveKit / Coturn / Caddy 生产部署配置模板
├── native/                    # iOS / Android 原生网络扩展集成清单
├── scripts/                   # 自动化回归与完整性验证脚本
├── vite.config.ts             # Vite 8 + Tailwind v4 + PWA 配置
├── Dockerfile                 # 容器化构建配置
└── THIRD_PARTY_LICENSES.md    # 第三方开源组件与许可声明
```

---

## 🚀 本地开发与生产部署

### 本地开发
```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（参考 .env.example）
cp .env.example .env

# 3. 启动全栈开发服务器（默认监听 http://0.0.0.0:3000）
npm run dev
```

### 生产构建与启动
```bash
# 1. 类型检查
npm run lint

# 2. 打包前端产物到 dist/（含 PWA Service Worker）
npm run build

# 3. 以生产模式启动全栈服务（NODE_ENV=production 将自动托管 dist/ 与所有 API/WebSocket）
NODE_ENV=production npm start
```

> **环境变量说明**（见 `.env.example`）：
> - `DEEPSEEK_API_KEY`：DeepSeek 模型核心密钥（用于日常智能对话、翻译与记忆总结）
> - `GEMINI_API_KEY`：Google Gemini 模型与 Live 实时语音密钥（可选，未配置时自动降级兼容）
> - `PORT`：服务监听端口（默认 `3000`）

### 常用校验脚本
```bash
# 类型校验
npm run lint

# 完整后端/领域逻辑测试
npx tsx scripts/test_earth_one.ts

# AI 接口与流式响应回归测试
npx tsx scripts/test_ai_api.ts
npx tsx scripts/test_ai_stream.ts
```

---

## 🛠️ 技术栈

- **前端**：React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · `vite-plugin-pwa` · Three.js · Lucide Icons
- **后端**：Node.js · Express · `tsx` · WebSocket (`ws`) · LiveKit Server SDK
- **AI 引擎**：DeepSeek API + `@google/genai` (Gemini Live / Text / Audio)
- **3D 渲染**：Three.js (`EffectComposer`、自定义 GLSL 着色器、球面大气散射与多深度宇宙粒子)
- **实时通讯**：WebSocket + LiveKit / WebRTC (`STUN/TURN`)

---

## 📄 开源许可声明

项目使用的开源组件与协议声明详见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
