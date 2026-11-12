# 07 — 免费额度与长期成本分析（Phase 2）

- **日期**：2026-11-12
- **目标**：月基础设施支出 **$0**（尽最大努力）；所有不确定项标注 **UNVERIFIED**，不得宣称永久免费。
- **核实要求**：下表为“需核实维度清单 + 已知风险”，数值必须在阶段 3 前按官方页面复核。

## 1. 成本维度总表

| 组件 | 供应商/选项 | 计费/限额维度（需核实） | 免费层风险 | 付费触发点示例 | 状态 |
|---|---|---|---|---|---|
| 前端托管/CDN | Cloudflare Pages | 构建次数/并发/分钟、带宽、请求、函数 | 超额可能受限或需升级 | 高频 CI、超大流量 | UNVERIFIED https://developers.cloudflare.com/pages/platform/limits/ |
| 边缘计算/API | Cloudflare Workers | 日请求数、CPU ms、内存、子请求、脚本大小 | 重逻辑/爬取易超 CPU；超额计费或失败 | 搜索聚合、代理抓取 | UNVERIFIED https://developers.cloudflare.com/workers/platform/pricing/ |
| 关系/文档数据 | D1 | 存储 GB、行读取/写入/日 | 消息与 discovery 写放大 | 高频聊天、批量导入 | UNVERIFIED https://developers.cloudflare.com/d1/platform/pricing/ |
| 对象存储 | R2 | 存储、Class A/B 操作、出站流量 | 大文件与高频下载 | 媒体增长、公开分享 | UNVERIFIED https://developers.cloudflare.com/r2/pricing/ |
| 有状态实时 | Durable Objects | 请求、duration、存储、WebSocket 连接/消息计量 | 群聊与在线人数增长 | 大量并发 WS | UNVERIFIED https://developers.cloudflare.com/durable-objects/platform/pricing/ |
| 替代 DB | Turso/Neon/Supabase | 行/存储/计算/暂停策略 | 项目暂停或限流 | 增长与后台任务 | UNVERIFIED（见各官网 pricing） |
| 通话 STUN | 公共 STUN | 通常免费但 ToS 限制 | 可用性无 SLA | 运营商变更 | UNVERIFIED |
| 通话 TURN/SFU | coturn/LiveKit/Cloudflare Calls | 带宽、中继分钟、实例成本 | **P2P 失败场景下成本核心** | 跨 NAT 中继、多方 | UNVERIFIED https://livekit.io/pricing https://developers.cloudflare.com/calls/ |
| 邮件 | SMTP/Resend/SendGrid 等免费层 | 月发送量、发件域验证 | 超额或需付费 | 验证/通知增长 | UNVERIFIED |
| SMS | Twilio 等 | 按条计费，免费试用有限 | **几乎不可长期 $0** | 任何真实短信 | **高风险** UNVERIFIED |
| OAuth | Google/WeChat 等 | 通常登录免费 | 配置与审核成本非基础设施但存在 | - | UNVERIFIED |
| AI | Gemini/OpenAI-compatible/托管推理 | token/请求计费 | 超出免费额度即付费 | 高频对话/长上下文 | UNVERIFIED |
| 搜索/外部数据 | Serper/YouTube API/爬取目标站 | 配额与封禁风险 | 失败降级 | 批量抓取 | UNVERIFIED |

## 2. 分阶段用量与成本情景（估算模型，非承诺）

> 假设：文本为主、媒体受控、无滥用；实际以监控为准。

| 阶段 | 用户规模/行为 | 前端 | 后端 | DB | 文件 | WS/DO | 通话 | 其他 | 月费预估 |
|---|---|---|---|---|---|---|---|---|---|
| A 初期 | 1-20 人，功能验证，低并发 | Pages 免费层内 | Workers 低请求 或 单实例过渡后端 | D1 小库/或现有 JSON 演练 | R2 少量对象 | 少量连接 | 1v1 P2P 为主 | OAuth/AI 按需 | **$0 可能** UNVERIFIED |
| B 成长期 | 50-300 人，日常消息与少量媒体 | 仍可能免费 | 请求与 CPU 上升 | 行读写显著增长 | 存储/操作增长 | 常驻连接增多 | TURN 需求上升 | 邮件/搜索配额紧张 | **$0 有压力** UNVERIFIED |
| C 扩展期 | 500+，群聊活跃、媒体与通话增多 | 可能触顶 | 可能超 Workers/DO 免费层 | 需扩容或付费 | 出站与存储增长 | DO 成本敏感 | SFU/TURN 成本主导 | AI/短信几乎必付费 | **难以维持 $0** UNVERIFIED |

## 3. 必须明确的“非永久免费/高风险付费”项
- **短信验证码（SMS）**：全球可达与合规成本高，长期 $0 **不现实**（未配置时必须保持阻塞，不伪造）。
- **TURN 中继与多人 SFU 媒体**：跨网通话成功率依赖中继带宽，$0 **不可保证**。
- **第三方 AI/搜索付费 API**：按量计费；需开关与配额保护。
- **邮件送达**：免费层通常有量与信誉限制。
- **超出 Cloudflare/DB/存储免费额度**：平台可能限流或要求升级—必须监控。

## 4. 成本控制设计（实现阶段要求）
- 请求级限流、缓存、去重、分页；禁止无界轮询与重试风暴。
- 上传大小/类型/频率限制；对象生命周期与去重（免费范围内）。
- WS 心跳与空闲回收；批量写库与索引优化。
- 功能开关：未配置/超配额时降级为明确错误提示（**BLOCKED/UNAVAILABLE**）。
- 用量仪表：定期导出 Workers/D1/R2/DO 用量快照并告警阈值（如 70/90%）。

## 5. 结论
- **初期（A）在严格工程约束下有机会实现 $0**，但依赖真实免费额度与低负载 — **UNVERIFIED**。
- **成长期/扩展期**对实时、通话中继、存储与 AI/短信极可能产生费用；必须提前定义降级策略与用户告知，**不得承诺永久免费**。
