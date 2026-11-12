# 01 — 平台与免费额度比较（Phase 2）

- **核实日期（实际查询）**：2026-11-12（UTC）
- **核实方式**：基于官方文档/定价页链接逐项对照；受工具与时效限制，**部分页面动态内容未能在本环境逐字抓取**的项标记 `UNVERIFIED` 并附官方链接，进入阶段 3 前必须再次人工/脚本复核并截图存证。
- **预算硬目标**：基础设施月支出 **0 USD**；不自动升级付费、不购买服务。

## 总览对比（EARTH ONE 适配视角）

| 类别 | 平台 | 官方链接 | 免费要点（需以官网当日为准） | 对 EARTH ONE 适配性 | 风险/限制 | 状态 |
|---|---|---|---|---|---|---|
| 前端 | **Cloudflare Pages** | https://developers.cloudflare.com/pages/ ; https://developers.cloudflare.com/pages/platform/limits/ | Git 集成构建、全球 CDN、HTTPS、自定义域、SPA 重写支持；构建/带宽/请求等存在限额 | 高：纯静态 SPA 构建产物可直接承载；与 Workers/DO/D1/R2 同生态 | 构建次数/并发、函数化边界需核实 | **UNVERIFIED**(额度数值待复核) |
| 前端 | **GitHub Pages** | https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages ; https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits | 静态站点免费托管；仓库/站点大小与带宽有软限制 | 中：仅静态，需外置 API/WS；适合前端兜底 | 无原生边缘后端/DO；自定义域 HTTPS 可配但功能单一 | **UNVERIFIED** |
| 前端 | **Vercel** | https://vercel.com/pricing ; https://vercel.com/docs/limits/overview | Hobby 免费层（个人/非商业条款以官网为准）含构建与边缘网络；带宽/函数调用/并发有限额 | 中：前端易；Serverless 与当前 Express/WS/长任务不匹配 | 商用条款、额度超限与自动策略需严格核实；易触发付费边界认知偏差 | **UNVERIFIED** |
| 前端 | **Netlify** | https://www.netlify.com/pricing/ ; https://docs.netlify.com/platform/limits/ | 免费层含构建分钟数/带宽/函数等配额 | 中：静态托管可行；后端能力需外置 | 配额与计费触发点需核实 | **UNVERIFIED** |
| 后端 | **Cloudflare Workers** | https://developers.cloudflare.com/workers/ ; https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/workers/platform/limits/ | Free 计划含按日请求等额度（具体数值以官网为准）；Fetch 模型、CPU/内存/子请求受限 | 中低（需重构）：当前 Express+`node:fs`+`node:sqlite`+`ws`+内存态+定时任务 **不兼容**，需大规模适配 | 非 Node 服务器语义；长任务/爬取/本地盘不可用 | **UNVERIFIED** |
| 后端 | **Deno Deploy** | https://deno.com/deploy ; https://docs.deno.com/deploy/manual/pricing-and-limits/ | 提供免费额度（请求/带宽/CPU 等以官网为准） | 中低：TS/Fetch 友好但仍非 Express/Node 全兼容；`node:sqlite`/`fs`/`ws` 服务器模型需重写 | 生态与现有依赖兼容性、持久连接与存储需验证 | **UNVERIFIED** |
| 后端 | **Render** | https://render.com/pricing ; https://docs.render.com/free | Free Web Service（可能休眠/冷启动、资源受限） | 中：可运行 Node/Express 形态（较贴近现状）但免费实例行为受限 | **休眠导致 WS/实时不可用**、性能与可用性风险；政策可能变化 | **UNVERIFIED** |
| 后端 | **Koyeb** | https://www.koyeb.com/pricing ; https://www.koyeb.com/docs/faqs/pricing | 免费层/试用与额度以官网为准 | 中：容器化 Node 可行性较高 | 免费持续性与配额需核实 | **UNVERIFIED** |
| 后端 | **Fly.io** | https://fly.io/docs/about/pricing/ | 历史免费额度调整频繁，当前以官网为准 | 中：贴近容器/进程模型 | **可能不再提供稳定零成本常驻**，需谨慎 | **UNVERIFIED** |
| 数据库 | **Cloudflare D1** | https://developers.cloudflare.com/d1/ ; https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/limits/ | 托管 SQLite；免费层含存储/读写行等配额（以官网为准） | 中：与 Workers 同栈；但需从 JSON+内存快照迁移到关系模型，FTS5/特性兼容性待验证 | 配额、事务/批量、FTS 行为、迁移复杂度高 | **UNVERIFIED** |
| 数据库 | **Turso** | https://turso.tech/pricing ; https://docs.turso.tech/introduction | libSQL（SQLite 兼容）云服务，提供免费层 | 中高：若保留 SQLite 语义/FTS 需求可能更平滑（需验证）；可与多后端配合 | 供应商锁定与免费额度变化风险 | **UNVERIFIED** |
| 数据库 | **Neon** | https://neon.tech/pricing ; https://neon.tech/docs/introduction | Serverless Postgres，免费层含存储/计算限制 | 中：Postgres 生态强但与现有 SQLite/JSON 模型差异大；迁移成本高 | 连接/休眠/计算额度限制 | **UNVERIFIED** |
| 数据库 | **Supabase** | https://supabase.com/pricing ; https://supabase.com/docs | Postgres + Auth/Storage/Realtime 等，免费项目有资源限制与暂停策略（以官网为准） | 中：一体化但超出“最小改动”；与现有自研 auth/session/WS 冲突风险 | **项目暂停/额度**、功能绑定、迁移侵入性 | **UNVERIFIED** |
| 文件存储 | **Cloudflare R2** | https://developers.cloudflare.com/r2/ ; https://developers.cloudflare.com/r2/pricing/ | S3 兼容对象存储；免费层含存储与操作额度（以官网为准） | 高：适合替代 `server_data/uploads`、`books` 资源文件；私有桶+签名访问 | 出站/请求与配额需核实；需改造所有 fs 读写 | **UNVERIFIED** |
| 文件存储 | **Supabase Storage** | https://supabase.com/pricing ; https://supabase.com/docs/guides/storage | 含在 Supabase 免费额度内（与项目整体绑定） | 中：若已选 Supabase 栈可用，否则增加耦合 | 额度与暂停策略 | **UNVERIFIED** |
| 实时通信 | **Cloudflare Durable Objects + WebSockets** | https://developers.cloudflare.com/durable-objects/ ; https://developers.cloudflare.com/workers/runtime-apis/websockets/ ; https://developers.cloudflare.com/durable-objects/platform/pricing/ | 有状态协调原语，支持 WebSocket；免费/计费边界以官网为准 | 中：可实现 Messenger 所需有状态连接与分片，但需重写 `messengerWs.ts` 与状态持久化 | 开发复杂度高；DO 请求/存储/时长限制 | **UNVERIFIED** |
| 实时通信 | **托管 WebSocket/Realtime（通用）** | 例：Pusher https://pusher.com/channels/pricing 、Ably https://ably.com/pricing 、Supabase Realtime https://supabase.com/pricing | 多提供有限免费层（连接数/消息数） | 低中：可减轻自建难度但引入第三方协议与数据驻留差异；与现有自研协议需适配 | 免费额度极易触顶；持久化/顺序/离线语义仍需自建 | **UNVERIFIED** |

## 关键结论（对比层面）
1. **不存在单一平台可在“不改架构”的前提下承载当前单体**（本地盘、`node:sqlite`、常驻 `ws`、内存 session、Vite 中间件同进程、后台抓取）。  
2. **Cloudflare 全家桶**生态一致但**迁移与重构成本最高**；**“保留 Express 进程模型的免费 PaaS”**对现有后端兼容度更高但**免费常驻/WS 稳定性与长期零费保障最弱**。  
3. **数据库与实时是决定性约束**：`server_data.json` 的一致性迁移与 Messenger/通话的真实可用性，决定“零月费”是否可持续。  
4. 所有标 `UNVERIFIED` 的额度/限制，**在阶段 3 创建资源前必须完成二次核实并记录证据**。

## 必须遵守的声明
- 不将“免费层”表述为“永久免费/无限量”。  
- 不因比价而修改业务代码或数据（本阶段仅文档）。  
- 未经用户明确批准，不创建云资源、不改 DNS、不开始迁移。
