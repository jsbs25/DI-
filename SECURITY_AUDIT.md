# EARTH ONE — 网络与数据安全审计报告
## (SECURITY AUDIT & DATA INTEGRITY REPORT)

---

## 1. 认证安全模型 (Authentication Security Model)

### 1.1 密码哈希与加盐标准 (Password Hashing Standards)
- **实现方案**: 采用 Node.js 原生 `crypto.randomBytes(16)` 动态生成 128 位强随机盐（Salt），结合密码明文进行 `SHA-256` 散列运算。
- **杜绝彩虹表攻击**: 每个注册账号拥有全局唯一的专属 Salt，彻底破坏离线彩虹表检索。
- **存储隔离**: 密码散列值与 Salt 仅保存在服务端安全持久化存储中，任何对外公开的 API (`/api/users`, `/api/auth/me`) 绝不包含 `passwordHash` 与 `salt` 字段。

### 1.2 会话令牌 (Session Tokens)
- **生成机制**: 使用 `crypto.randomBytes(32).toString('hex')` 生成 256 位加密安全随机令牌。
- **传递规范**: 客户端仅在 HTTP Headers 的 `Authorization: Bearer <token>` 中传递，前端采用浏览器隔离作用域与 `localStorage` 安全存储。
- **登出作废**: `POST /api/auth/logout` 立即在服务端会话映射中清除对应 Token，避免重放利用。

---

## 2. API 密钥与敏感资产防御 (Secret Protection)

- **Gemini API Key 隔离**:
  - `GEMINI_API_KEY` 仅在 Node.js 服务端由 `dotenv` 从系统环境变量读取。
  - 前端没有任何包含 API Key 的代码或环境变量暴露（无 `VITE_GEMINI_API_KEY`）。
  - 客户端所有 AI 咨询、跨语言翻译与网页联网检索均通过 `/api/ai/chat` 服务端路由转发。

---

## 3. 地理空间隐私保护体系 (Geospatial Privacy Guard)

- **核心原则**: 不允许未经用户许可公开精确定位。
- **自主隐私权**:
  - 用户注册后可随时通过导航栏或个人中心一键切换 `isPublic` 状态。
  - 当隐私保护开启时，3D 地球节点接口 (`/api/globe/nodes`) 会自动过滤该公民的经纬度光标，防止追踪。
  - 公开位置仅精确至用户自选的公开城市级（如 "Beijing", "San Francisco", "Amman"），不收集和上报移动终端实时 GPS 轨迹。

---

## 4. 生产环境加固路线 (Production Hardening Roadmap)

1. **引入 Bcrypt / Argon2id**: 随生产数据库迁移将密码散列算法升级为自适应计算成本的 Argon2id。
2. **速率限制中间件 (Rate Limiting)**: 在 `/api/auth/login` 与 `/api/ai/chat` 接口上引入 `express-rate-limit`，限制单 IP 请求频率（如 15 分钟内最多 5 次错误登录）。
3. **内容安全策略 (CSP)**: 在响应头中加入严格的 `Content-Security-Policy`，限制内联脚本与非授权媒体源加载。
