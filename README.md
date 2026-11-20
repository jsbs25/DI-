# EARTH ONE（地球一号）

<p align="center">
  <strong>Global Digital Sanctuary · World Library · Language Center · Global Messenger · Music Space · ONE AI</strong><br/>
  一个融合 3D 实时生态主世界、全球典籍数字图书馆、多语言学习中心、高清音视频通讯、统一音乐空间与智能悬浮 AI 伴侣的全栈数字世界平台。
</p>

---

## 核心空间模块

| 模块 | 说明 |
| :--- | :--- |
| **3D 天堂花园主世界（Home）** | 原生 Three.js 实时 3D 生态空间，支持 24 小时真实时钟光影同步、11 种实时气象演算、顶部居中实时时钟与高精度 GPS/逆地理编码定位、蝴蝶精灵与多视角漫游。 |
| **全球数字图书馆（Library）** | 统一书库检索（IslamHouse / Internet Archive / Project Gutenberg / Wikisource / 本地导入），内置多卷原版 PDF 高清流式阅读器（完整 JBIG2 / OpenJPEG WASM 解码、阿语原版零错字渲染、全书分页与翻页、点词权威查义、AI 精讲与生词本）。 |
| **语言学习中心（Language）** | 专注多语言沉浸式学习，涵盖阿拉伯语 28 字母与声调、剑桥/权威词典接口、AI 场景口语陪练、实时发音测评与间隔重复记忆。 |
| **全球通讯中心（Messages）** | WebSocket 实时消息、断线自动重连、多语实时互译（含完整阿拉伯语 RTL 排版）、高清 WAV 语音消息与 LiveKit / WebRTC 音视频通话。 |
| **统一音乐空间（Music）** | 沉浸式跨模块音乐播放内核，支持多音源检索、持久歌单与 AI 语音自动避让（说话暂停、结束续播）。 |
| **ONE AI 悬浮伴侣 & 独立工作台** | 主界面纯净悬浮 AI 球（可拖拽、零遮挡、无多余输入框），一键唤醒实时语音或进入纯净 ONE AI 独立界面；支持多模型智能路由与自动容错。 |

---

## 技术架构

- **前端**：React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Three.js · `pdfjs-dist` v6（WASM JBIG2 / OpenJPEG / CMap）· `epubjs` · PWA
- **后端**：Node.js · Express · WebSocket（`ws`）· LiveKit Server SDK · Open-Meteo 实时气象与标准逆地理编码服务 · 统一 AI 多模型路由网关
- **跨端适配**：iPhone / Android 移动浏览器（含安全区适配）、iPad / 平板、macOS / Windows 桌面端、PWA 独立安装及 `electron/` 桌面外壳

---

## 目录结构

```text
.
├── server.ts                  # Express + Vite/Dist + WebSocket 全栈服务入口
├── server/
│   ├── ai/                    # 统一 AI 内核、意图解析、记忆存储与上下文编排
│   ├── oneAi/                 # 多模型发现、路由网关与配额安全控制
│   ├── environmentWeather.ts  # 实时气象、高精度 GPS 逆地理编码与时区定位
│   ├── noorIslamicPdfService.ts # 全球典籍检索、多卷 PDF 精选、流式代理与书架存储
│   ├── languageCoach.ts       # 语言学习中心 AI 陪练、测验与权威查词
│   ├── media/                 # Venus 音乐多源解析与媒体服务
│   └── store.ts               # 核心数据持久化存储
├── src/
│   ├── App.tsx                # 统一状态管理、路由与悬浮 AI 编排
│   ├── components/
│   │   ├── layout/            # 顶部极简栏与底部悬浮玻璃导航坞（Navbar）
│   │   ├── paradise/          # 3D 天堂花园、顶部居中时钟定位与气象引擎
│   │   ├── library/           # 全球数字图书馆与 Apple Books 风格全书阅读器
│   │   ├── browser/           # 高清 PDF 流式电子书阅读器（WASM 解码 + AI 伴读）
│   │   ├── learning/          # 多语言学习中心与阿拉伯语学习模块
│   │   ├── chat/              # 实时即时通讯、语音消息与音视频通话
│   │   └── ai/                # 悬浮全息 AI 球（One.）与 ONE AI 独立界面
│   ├── music/                 # 统一音乐播放内核（PlayerContext）
│   └── utils/                 # 阿语字形校验、PDF 重排提取、阅读偏好与音频引擎
├── electron/                  # Electron 桌面外壳
├── deploy/                    # LiveKit / Coturn / Caddy 生产部署模板
├── native/                    # iOS / Android 原生扩展清单
└── scripts/                   # 自动化验证与回归测试脚本
```

---

## 快速开始

### 1. 安装依赖与配置环境

```bash
npm install
cp .env.example .env
```

按需在 `.env` 中配置以下变量（详见 `.env.example`）：
- `GEMINI_API_KEY`：Gemini 模型与实时语音服务密钥
- `DEEPSEEK_API_KEY`：DeepSeek 对话与翻译密钥（可选）
- `PORT`：服务监听端口（默认 `3000`）

### 2. 本地开发

```bash
npm run dev
```

服务启动后访问：`http://localhost:3000`

### 3. 质量检查与生产部署

```bash
# TypeScript 类型检查
npm run lint

# 构建前端产物（dist/）
npm run build

# 生产模式运行（托管 dist/ 与全量 API / WebSocket / PDF WASM 资源）
NODE_ENV=production npm start
```

---

## 开源许可与致谢

第三方开源依赖与许可声明见 [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md)。
