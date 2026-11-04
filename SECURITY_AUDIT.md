# EARTH ONE — 生产级网络与数据安全深度审计报告
## (COMPREHENSIVE SECURITY & HARDENING AUDIT REPORT V3.0)

**审计时间**: 2026-11-04  
**合规目标**: 零密钥泄露、零越权访问、强抗爆破、地理位置隐私完全主权。

---

## 1. 认证安全模型 (Authentication Security Model)

### 1.1 密码散列算法实测 (`scrypt` 规范)
* **实现位置**: `server/store.ts` 中的 `hashPassword()` 与 `verifyPassword()`。
* **密码学参数**:
  - 核心算法: `crypto.scryptSync(password, salt, 64)`。
  - 存储格式: `scrypt$<salt>$<derived_hex>`。
  - 内存硬度特性（Memory-hard）: 抵御 ASIC 与 GPU 专用并行破解集群。
* **平滑无感升级策略**:
  - 系统保留对早期旧版本 SHA-256 哈希的兼容验证能力。
  - 一旦老用户凭正确密码登录，系统在验证成功后，毫秒级静默将密码哈希重算并升级为新版 `scrypt` 格式入库。

### 1.2 会话凭证 (Session Management)
* **Token 生成**: 采用密码学安全的 CSPRNG（`crypto.randomBytes(32).toString('hex')`），生成 256 位全局不可伪造会话凭据。
* **传输与存储**: 强制通过 HTTP `Authorization: Bearer <token>` 报头传输，前端存入本地受保护作用域。
* **主动登出撤销**: `POST /api/auth/logout` 立即从服务端 `sessions` 映射表中物理删除，杜绝 Session Replay 攻击。

---

## 2. 防爆破与速率限制防御体系 (Brute-Force & Rate Limiting)

* **实现位置**: `server.ts` 中的 `checkAuthRateLimit()`。
* **防护机制**: 基于客户端 IP 的内存滑动窗口限流器：
  - `/api/auth/login`: 单 IP 限制 15 分钟内最多允许 10 次密码尝试。超出后返回 HTTP 429 Too Many Requests，阻断撞库扫描。
  - `/api/auth/register`: 单 IP 限制 15 分钟内最多允许 20 次注册尝试，防范恶意脚本批量注册僵尸账号。

---

## 3. 地理空间隐私权保护 (Geospatial Privacy Guard)

* **设计原则**: 地理坐标为公民核心隐私资产，未经用户自主明确授权，严禁对外公开发布。
* **实施方案**:
  - 账号模型严格具备 `isPublic` 布尔状态标记。
  - 接口 `/api/globe/nodes` 遍历全球节点时，自动执行严格过滤：`if (!user.location.isPublic) continue;`。
  - 前端顶部导航栏与个人中心均提供一键“位置隐私切换”（`POST /api/auth/toggle-location`），实时隐身生效。
  - 即使用户选择公开，坐标也仅精确至所选城市中心参考坐标（如北京、巴黎），禁止采集和上报移动端原生高精度 GPS 实时轨迹。

---

## 4. API 密钥与第三方集成隔离 (Zero Secret Leakage)

* **服务端专有边界**:
  - 环境变量 `GEMINI_API_KEY`、`OPENAI_API_KEY` 等仅保存在服务端操作系统环境或 `.env` 中。
  - 客户端代码完全不包含任何密钥字符，不向前端下发 `VITE_` 前缀的敏感密钥。
  - 所有模型调用统一由服务端 `/api/ai/chat` 路由进行身份鉴权、配额检查与审计代理。

---

## 5. 文件系统与数据遍历边界安全 (File Storage Boundary)

* **实现位置**: `server/libraryEpubSecurity.ts` 与 `server/store.ts`。
* **防护措施**:
  - 图书章节与 EPUB 文件读取时，强制执行路径归一化（`path.normalize`）与边界检查（`startsWith(ALLOWED_DIR)`），彻底消灭 `../` 任意文件穿越漏洞。
  - 书籍导入严格校验 MIME 类型与文件头 Magic Bytes，禁止上传与执行可执行二进制文件。
