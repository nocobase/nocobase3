---
title: 'Channel 与 Provider 接入规划'
description: 'NocoBase Notification Channel 与 Provider 的边界、主流厂商清单、参考仓库和分批接入路线。'
keywords: 'NocoBase,Notification,Channel,Provider,通知,短信,邮件,推送,企业 IM'
---

# Channel 与 Provider 接入规划

本文基于[飞书调研原文](https://nocobase.feishu.cn/wiki/ZVaWwhU1qib68bkrXrMcryMtnCh)和当前仓库实现整理（调研日期：2026-08-26），回答三个问题：

1. Channel 和 Provider 如何分工；
2. 国内外哪些 Provider 值得接入；
3. 每个 Provider 应参考什么一手仓库，以及大概如何实现。

## 1. 结论摘要

建议继续保持 NocoBase 自己的通知编排，不直接引入 Novu、Knock、Courier 等完整通知平台。外部依赖只放在 Provider adapter 内，用于完成一次具体投递。

推荐的接入顺序：

| 批次                   | 目标                                   | 建议实现                                                                                                   |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **第一批：核心触达**   | 在已有站内信上，优先补齐高需求国内通道 | Email（SMTP、Resend）、飞书、钉钉                                                                          |
| **第二批：平台覆盖**   | 补齐短信、移动推送和 Workspace 平台    | 通用 Webhook、腾讯云短信、阿里云短信、Twilio、企业微信、Slack、Telegram、FCM、APNs、SES、SendGrid、Discord |
| **第三批：运营与长尾** | 提升移动推送到达率、覆盖更多供应商     | OneSignal、极光、个推、华为 Push；Amazon SNS、Mailgun、Postmark、Brevo；高级 Webhook 认证与回执            |

`in-app/database` 与 `email/smtp` 已经存在，可以视为第零批。第一批不是“所有平台都必须默认安装”，而是优先稳定接口和测试矩阵。每个部署只安装并启用需要的 Provider。

## 2. 术语与边界

### 2.1 Channel 是消息语义和接收人模型

Channel 决定：

- 统一接收人如何解析，例如 `user`、`email`、`phone`、设备 token 或 IM 会话 ID；
- 通用 `NotificationContent` 如何渲染为渠道消息；
- 渠道独有字段，例如邮件的 `subject/html`、短信的模板变量、推送的 `data`、IM 的卡片或线程；
- 发送前的准备工作，例如从用户 ID 查询邮箱、补齐签名、生成模板参数。

建议的 Channel：

| Channel   | 统一接收人                     | 渠道消息核心字段                  | 备注                                                          |
| --------- | ------------------------------ | --------------------------------- | ------------------------------------------------------------- |
| `in-app`  | NocoBase user ID               | title/body/actionUrl              | 已有 database Provider，继续作为站内信事实来源                |
| `email`   | email address 或 user ID       | to/subject/text/html/from         | 已有 SMTP Provider；API 邮件复用同一 Channel                  |
| `sms`     | E.164 phone number 或 user ID  | to/body/templateId/templateParams | 国内签名、模板和国际号码规则不能硬编码到核心层                |
| `push`    | device token、topic 或 user ID | token/title/body/data/badge       | FCM、APNs 和国内厂商 payload 差异较大，保留 provider 扩展字段 |
| `im`      | 平台会话/用户标识              | text/markdown/card/media/replyTo  | 飞书、钉钉、企微、Slack 等都属于 IM，但连接和事件模型不同     |
| `webhook` | URL 或 endpoint 名称           | HTTP method/headers/body          | 作为通用逃生舱，不替代有明确语义的官方 Provider               |

### 2.2 Provider 是一次外部投递

Provider 只负责：

1. 接收 Channel 已规范化的 prepared message；
2. 调用一次官方 SDK 或 HTTPS API；
3. 返回 `accepted`、`failed` 或 `submission_unknown`，并尽可能返回供应商 message ID；
4. 将厂商错误映射成稳定的错误类别；
5. 管理连接池、token 缓存和 `close()` 生命周期。

Provider 不负责选择 Channel、展开收件人、写 Notification/Delivery/Attempt、决定下一个 Provider，也不应在业务代码里暴露厂商 SDK 类型。

当前代码中的对应接口见 [`server/types.ts`](../../server/types.ts)、[`server/registry.ts`](../../server/registry.ts) 和 [`server/channel-manager.ts`](../../server/channel-manager.ts)。运行时由 [`server/manager.ts`](../../server/manager.ts) 创建；Delivery 会持久化 Provider `name` 和 `type`，重启后必须精确匹配。

当前已有实现：

- [`app-plugin-notification-in-app`](../../../app-plugin-notification-in-app/server/definition.ts)：`in-app` Channel + `database` Provider；
- [`app-plugin-notification-providers/server/email`](../../../app-plugin-notification-providers/server/email)：`email` Channel + `smtp`、`resend` Provider；Resend 使用官方 `resend.emails.send()` 并记录返回的 `data.id`。
- [`docs/zh-CN/integration.md`](./integration.md)：宿主注册 definition、创建 runtime 和管理生命周期的示例。

### 2.3 推荐发送路径

```text
NotificationManager.send()
  -> 选择 Provider
  -> Channel.resolveRecipient({ recipient, provider })
  -> 创建 Notification / Delivery（保存解析后的 recipient + provider name/type）
  -> Queue
  -> Channel.prepare({ ..., provider })
  -> Provider.send()（一次外部调用）
  -> Attempt + Provider Message ID
  -> accepted / failed / submission_unknown
```

Provider SDK 的内置重试应关闭或限制为单次请求。网络超时、连接重置等无法判断外部是否已接收时，返回 `submission_unknown`，不能继续切换 Provider，否则可能造成重复通知。

### 2.4 公共合同的扩展状态

核心现已支持异步、Provider-aware 的 recipient resolver，`external` recipient 也包含明确 namespace；Provider Context 只暴露 logger 和 clock，数据库、队列等能力应通过具体 definition 的工厂参数注入。错误类别使用固定联合类型，不接受任意字符串。

接入 SMS、Push 和 IM 时还应继续处理这些能力：

| 缺口              | 当前情况                                        | 建议                                                                                                               |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 直接接收人        | 已支持 user/email/phone/external(namespace)     | Push 增加明确的 device/topic recipient；不要把任意平台 ID 都塞进无类型字符串                                       |
| 用户地址簿        | Channel resolver 已支持异步和 Provider identity | 抽象可注入的 contact/device/external-identity resolver；Delivery 继续保存解析后的快照                              |
| Provider 特有字段 | 只有 channel-level `channelOverrides`           | 在 Channel message 内预留有边界的 `extensions`，由对应 Provider 读取；通用业务不直接依赖 SDK request 类型          |
| 最终送达状态      | 当前 `accepted` 只表示供应商接收提交            | 后续增加独立 receipt/event 模型，接收 delivered、bounced、complained、read 等 webhook；不要修改历史 Attempt 的事实 |
| Fallback          | 当前 Delivery 固定一个 `name + type`            | 保持第一阶段不自动 fallback；只有明确失败且有幂等保证时再设计新的 Delivery 策略                                    |
| 双向 IM           | Provider 合同以单次 outbound 为主               | inbound event/webhook 使用独立 router/service，复用 Provider 配置和 identity mapping，不塞入 `send()`              |

## 3. 完整通知平台：只参考设计，不作为一期依赖

| 项目                                                            | 可参考内容                                                                                                                                                                                                                                                          | 不直接采用的原因                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Novu](https://github.com/novuhq/novu)                          | `packages/providers/src/lib/{email,sms,push,chat}` 的 Provider 分层、配置 schema、错误处理和测试组织；仓库 README 还列出了 Email、SMS、Push、Chat 的 Provider 矩阵                                                                                                  | Novu 同时拥有 workflow、subscriber、模板、偏好和 Inbox，会与 NocoBase 的 NotificationManager、Queue、Log、Delivery 重复；仓库是 open-core，`enterprise` 目录有商业许可 |
| [Better Notify](https://github.com/better-notify/better-notify) | `packages/core` 的 typed catalog、`packages/*` 的 Channel/Transport 分离，以及 mock transport 测试方式                                                                                                                                                              | 它是另一套端到端通知运行时；可借鉴类型边界，不应把其 catalog、queue 或 middleware 引入 NocoBase                                                                        |
| [Vercel Chat SDK](https://github.com/vercel/chat)               | `packages/adapter-*` 的 IM adapter、webhook 验签、消息/线程/卡片格式转换；例如 Slack 的 `src/api`、`src/blocks`、`src/webhook`，Teams 的 `src/api`、`src/graph`、`src/webhook`；官方清单覆盖 Slack、Teams、Google Chat、Discord、Telegram、GitHub、Linear、WhatsApp | 面向对话机器人和双向事件，不是 NocoBase 单次通知 Provider；其 state、thread 和事件生命周期应隔离在 IM Channel 内                                                       |
| [OpenAkita](https://github.com/openakita/openakita)             | `src/openakita/channels/adapters` 的多平台 adapter、`docs/im-channels.md` 的连接方式和能力矩阵                                                                                                                                                                      | Python 项目且包含 Agent/Gateway 语义，只参考连接与消息归一化，不复制其业务路由                                                                                         |

## 4. 核心 Provider 方案：In-App、Email、IM 与 Push

### 4.1 In-App / Database（已完成）

- **Channel / Provider**：`in-app` / `database`。
- **参考代码**：[`app-plugin-notification-in-app/server/definition.ts`](../../../app-plugin-notification-in-app/server/definition.ts)、[`store.ts`](../../../app-plugin-notification-in-app/server/store.ts)。
- **实现思路**：消息写入 NocoBase 表；收件箱 API 由同一 `InAppStore` 提供未读数、分页、已读和删除；不调用外部服务。
- **注意事项**：它是站内信的主数据源，不要用 Novu Inbox 或 OneSignal In-App 替换；实时更新可在后续增加 SSE/WebSocket，但不改变 Provider 合同。

### 4.2 Email / SMTP（已完成，默认 Provider）

- **参考仓库**：[Nodemailer](https://github.com/nodemailer/nodemailer)；当前实现位于 [`server/email/providers/smtp.ts`](../../../app-plugin-notification-providers/server/email/providers/smtp.ts)。
- **实现思路**：Channel 将通用内容渲染成 `subject/text/html/from`，Provider 创建 transporter，调用一次 `sendMail()`，返回 message ID（如供应商提供）。保留连接池、TLS、附件等扩展字段。
- **错误分类**：认证、收件人和内容错误通常 `never`；连接暂时失败可 `same_provider`；超时、连接重置和 EPIPE 应视为 `submission_unknown`。
- **测试**：使用 mock transporter 或本地 SMTP；不要在单元测试中发送真实邮件。

### 4.3 Email / Resend

| Provider | 参考仓库/API                                                                             | 适用场景                                 | 实现建议                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `resend` | [resend/resend-node](https://github.com/resend/resend-node)；官方 `resend.emails.send()` | 海外 SaaS、API-first、希望较少 SMTP 运维 | 复用 Email Channel；配置 API key、from/replyTo、tags；把返回的 `data.id` 写入 `providerMessageId`；4xx 配置/内容错误不重试，5xx 可按策略重试 |

第一批 Email Provider 明确为 SMTP 和 Resend，两者复用同一个 Email Channel。SMTP 是通用默认实现，Resend 提供 API-first 方案；业务发送接口不感知二者差异。Amazon SES 下沉到第二批按 AWS 客户需求接入。

### 4.4 Feishu / Lark

- **Provider 类型**：`feishu`，属于 `im` Channel。
- **一手仓库**：[larksuite/node-sdk](https://github.com/larksuite/node-sdk)；如果需要更高层的消息归一化，可参考官方 [channel-sdk-node](https://github.com/larksuite/channel-sdk-node)（重点看 transport、NormalizedMessage、dedup、per-chat serialization、媒体安全和 retry/fallback）。
- **能力**：应用身份发单聊/群聊、文本、富文本、交互卡片；事件接收可用 `EventDispatcher` HTTP，或 `WSClient` 长连接。
- **认证与接收人**：`appId/appSecret`；发送时明确 `receive_id_type`（open_id、user_id、chat_id 等），不要把不同 ID 类型混为一个字符串。
- **实现思路**：
  1. Channel 将 NocoBase user/chat recipient 解析为 `{receiveId, receiveIdType}`；
  2. Provider 创建 SDK Client，调用 `im.message.create`；
  3. 卡片和富文本通过 `channelOverrides` 或 provider-specific message 字段传递；
  4. 需要接收回复时，单独管理事件路由、签名/加密和幂等，不要让 `send()` 等待 inbound 事件。
- **风险**：租户 token、权限 scope、频控、3 秒事件处理窗口，以及同一应用多实例长连接的消费语义；配置校验必须脱敏。

### 4.5 DingTalk

- **Provider 类型**：`dingtalk`，属于 `im` Channel。
- **一手仓库**：[open-dingtalk/dingtalk-stream-sdk-nodejs](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)；卡片场景参考[官方 card examples](https://github.com/open-dingtalk/dingtalk-card-examples)。重点看 `DWClient`、事件/回调 listener、ACK 和并发背压。
- **能力**：机器人消息、事件和卡片回调；Stream 模式使用 WebSocket，减少公网回调配置；也支持基于 sessionWebhook 的被动回复。
- **实现思路**：Provider 维护 Stream client 和重连/心跳；发送文本时优先调用机器人 API；Channel 保存 `conversationId`、`robotCode`、`sessionWebhook` 等平台字段。卡片更新和流式卡片作为后续扩展，不污染普通文本接口。
- **风险**：同一 client-id 不应被多个 Stream 服务同时使用；事件 handler 有并发上限；卡片 callback 与普通消息是不同事件类型。

### 4.6 WeCom / 企业微信

- **Provider 类型**：`wecom`，属于 `im` Channel。
- **一手 Node SDK**：[WecomTeam/aibot-node-sdk](https://github.com/WecomTeam/aibot-node-sdk)；平台 API 仍以[企业微信开发者文档](https://developer.work.weixin.qq.com/)为准。重点看 `WsConnectionManager`、`MessageHandler`、`WeComApiClient`、reply queue 和文件 AES 解密。
- **能力**：AI Bot WebSocket 长连接、文本/Markdown、流式回复、媒体上传；传统自建应用和智能机器人 HTTP 回调属于另一接入模式。
- **实现思路**：第一版优先 AI Bot WebSocket，Provider 启动 `WSClient`，按 frame 类型发送或回复；媒体先走 `uploadMedia` 再发送 `media_id`。如果客户需要传统应用消息，再增加 `wecom-app` Provider，而不是在一个 Provider 内用大量条件分支。
- **风险**：Bot、Agent、群机器人三种产品模型不要混用；媒体下载可能需要 AES 解密；HTTP 回调模式需要公网 URL、签名和加解密。

### 4.7 Slack

- **Provider 类型**：`slack`，属于 `im` Channel。
- **一手仓库**：[slackapi/node-slack-sdk](https://github.com/slackapi/node-slack-sdk)；可选参考 [Vercel Chat Slack adapter](https://github.com/vercel/chat/tree/main/packages/adapter-slack)。
- **能力**：Web API `chat.postMessage`、Incoming Webhook、Socket Mode 事件；线程回复、Block Kit 和按钮交互。
- **实现思路**：普通通知使用 `@slack/web-api` 或 `@slack/webhook`；Channel 负责把 NocoBase recipient 转成 channel/user ID 和 thread timestamp；Block Kit 作为 override。需要双向事件时再启用 `@slack/socket-mode` 和 webhook 验签。
- **风险**：OAuth scope、频道成员权限、thread ts、速率限制；Webhook URL 是凭据，日志必须脱敏。

### 4.8 Telegram

- **Provider 类型**：`telegram`，属于 `im` Channel。
- **一手来源**：[Telegram Bot API](https://core.telegram.org/bots/api)；Node 适配可参考 [Telegraf](https://github.com/telegraf/telegraf) 或 [grammY](https://github.com/grammyjs/grammY)。
- **能力**：Bot API 文本、Markdown/HTML、文件、inline keyboard；Webhook 或 long polling 接收事件。
- **实现思路**：以 `chat_id` 为稳定 recipient；Channel 做 Markdown/HTML 转换和长度分段；Provider 调用 `sendMessage`，记录返回的 message ID。中国大陆网络环境需要部署方配置出口代理，Provider 不内置代理地址。
- **风险**：Bot token、消息长度和 Markdown 转义；429 返回 `retry_after` 时可设置 `retryAfterMs`，超时则不能盲目重发。

### 4.9 Push：FCM 与 APNs

| Provider | 一手仓库/API                                                                                                                                                                                       | 实现重点                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fcm`    | [firebase/firebase-admin-node](https://github.com/firebase/firebase-admin-node)，使用 Admin Messaging API                                                                                          | 服务器持有 service account；支持 token、topic、notification/data；批量发送返回逐 token 成功/失败，Channel 需要保留 token 失效信息                       |
| `apns`   | [Apple APNs HTTP/2 文档](https://developer.apple.com/documentation/usernotifications/establishing-a-connection-to-apns)；Node 封装可参考 [node-apn/node-apn](https://github.com/node-apn/node-apn) | token/keyId/teamId/bundleId、development/production endpoint；HTTP/2 状态码和 `apns-id` 映射为统一结果；如果使用社区 `apn` 包，必须锁版本并补充回归测试 |

建议 `push` Channel 的 message 至少包含 `token/title/body/data`，并允许 provider-specific `aps`、Android priority、collapse key 等扩展。FCM 与 APNs 不能假装成完全相同的 payload；应在 Channel 规范化后由各 Provider 完成最后映射。

## 5. SMS 与第二批商业覆盖 Provider

### 5.1 国内短信：腾讯云与阿里云

| Provider      | 参考来源                                                                                                                                                                        | 认证/协议                                     | 大概实现                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tencent-sms` | [TencentCloud/tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs)，`sms` 产品                                                                     | SecretId/SecretKey、TC3-HMAC-SHA256、地域可选 | Channel 提供手机号、签名、模板 ID 和参数；Provider 调用 `SendSms`，返回 `SerialNo`；把签名/模板审核、频控、错误码映射为配置/recipient/rate/provider 类别 |
| `aliyun-sms`  | [aliyun/alibabacloud-typescript-sdk](https://github.com/aliyun/alibabacloud-typescript-sdk) 和 [Node SMS 安装说明](https://www.alibabacloud.com/help/en/sms/install-nodejs-sdk) | AccessKey 或 RAM/STS、OpenAPI 签名            | Provider 调用 `SendSms`；支持 region、signName、templateCode、templateParam；不要把阿里云 OpenAPI request 类型泄漏到公共 Channel                         |

两者都需要签名和模板审核，不能用“任意正文短信”假设测试成功。建议先实现一家并稳定 `sms` Channel，再复制 adapter 结构接入另一家。阿里云 `SendSms` 不保证幂等，调用超时必须返回 `submission_unknown`，不得自动重试或 fallback，否则可能重复发送和计费。

### 5.2 国际短信：Twilio

- **参考仓库**：[twilio/twilio-node](https://github.com/twilio/twilio-node)。
- **认证**：Account SID + Auth Token，或按 Twilio 新 API 使用 OAuth。
- **实现**：调用 `client.messages.create({ body, to, from/messagingServiceSid })`；把返回 `sid` 写入 Provider Message ID；`RestException` 的 4xx 通常是永久失败，429/5xx 按 Retry-After 和 provider policy 处理。
- **边界**：Twilio 不应作为中国大陆短信唯一方案；号码、国家合规、Sender ID、模板和计费由部署方负责。

### 5.3 海外邮件：SendGrid

- **参考**：[SendGrid Node quickstart](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/quickstart-nodejs)；可使用官方 `@sendgrid/mail`。
- **实现**：复用 Email Channel，Provider 只把 `PreparedEmailMessage` 转成 SendGrid mail payload；保留 categories/custom args；把 API 返回的 message ID 和 webhook 事件关联起来。
- **定位**：第一批已经有 SMTP 和 Resend，因此 SendGrid 不是默认必选项，优先级低于国内短信和企业 IM。

### 5.4 Discord、Microsoft Teams、Google Chat、WhatsApp Business

| Provider      | 参考来源                                                                                                                                                                                                                                                                                                | 接入方式与建议                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discord`     | [Vercel Chat adapter-discord](https://github.com/vercel/chat/tree/main/packages/adapter-discord)；平台 API 以 [Discord Developer Docs](https://discord.com/developers/docs/intro) 为准                                                                                                                  | 第一版支持 Webhook/机器人发消息；Embed、thread、button 通过 override；入站事件再考虑 Gateway                                                                                              |
| `teams`       | [Microsoft Teams SDK](https://github.com/microsoft/teams-sdk)、[主动消息文档](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/send-proactive-messages)；格式转换可参考 [Vercel Chat adapter-teams](https://github.com/vercel/chat/tree/main/packages/adapter-teams) | 新实现优先当前 Teams SDK；保存安装产生的 conversation reference 后发送主动消息。简单告警可使用 Workflows webhook。不要以临近淘汰的 Microsoft 365 Connector 或旧 BotBuilder 作为新架构基础 |
| `google-chat` | [Vercel Chat adapter-gchat](https://github.com/vercel/chat/tree/main/packages/adapter-gchat)；[Google Chat API](https://developers.google.com/chat/api/guides)                                                                                                                                          | Service account/OAuth + space name；Card v2 作为扩展字段；注意 Google Workspace 域权限                                                                                                    |
| `whatsapp`    | [Vercel Chat adapter-whatsapp](https://github.com/vercel/chat/tree/main/packages/adapter-whatsapp)；[Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)                                                                                                                  | Graph API + phone number ID + access token；模板消息、24 小时会话窗口、媒体上传必须显式建模；不要承诺任意文本主动触达                                                                     |

这四类平台适合复用“IM Channel 的事件、线程、卡片、Webhook 验签”设计，但每个平台仍应有独立 Provider type。

## 6. 第三批：运营推送、聚合和长尾

### 6.1 移动推送聚合

- `onesignal`：参考 [OneSignal channel setup](https://documentation.onesignal.com/docs/en/channel-setup)。适合已有 OneSignal 设备订阅、分群和运营统计的客户；不要把 OneSignal 的 Subscription/User 模型写入 NocoBase 核心用户表。
- `jpush`：参考[极光 Push](https://www.jpush.cn/en/push)。国内 Android、iOS、HarmonyOS 兼容面较好；需要 registration ID、平台 tags 和厂商通道配置。
- `getui`：按个推官方 REST API/SDK 实现，适合已有个推账号的国内客户；先验证 Node SDK 维护状态，再决定官方 SDK 或直接 HTTPS。
- `huawei-push`：适合华为生态；建议将 Huawei token、消息分类和 OAuth token 刷新封装在独立 Provider，不把厂商字段塞进 FCM/APNs。

### 6.2 其他邮件/消息 Provider

按客户需求增加：Amazon SNS（短信/移动消息）、Mailgun、Postmark、Brevo、Infobip、Vonage、Plivo、MessageBird。优先选择有官方 Node SDK、稳定 webhook 和清晰错误码的供应商；只为一个客户增加的 provider 不应进入默认安装包。

### 6.3 Webhook / Custom HTTP

建议提供一个低级 `webhook` Provider：配置 URL、method、headers、JSON body 模板、签名方式和超时。它可覆盖内部网关、PagerDuty/自建消息系统和暂未适配的国内平台，但必须：

- 禁止任意 SSRF，限制协议、域名或显式 allowlist；
- Secret 使用密钥存储，不写入日志；
- 支持 HMAC、Bearer 和自定义幂等键；
- 明确 2xx/4xx/5xx 与超时的统一映射；
- 不把 webhook 当作“可靠送达”，回执需要单独 webhook endpoint。

通用 Webhook 放在第二批，因为它虽然能覆盖内部网关和暂未适配平台，但配置面与 SSRF、签名、重放防护等安全边界需要单独稳定。可参考 [CloudEvents HTTP binding](https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/http-protocol-binding.md) 和 [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) 的事件 ID、timestamp、签名和重放窗口约定。

## 7. 公共实现模板

新 Provider 建议按下面的目录组织：

```text
server/<channel>/
├── channel.ts                 # recipient/render/prepare
├── types.ts                   # Channel 与 Provider 配置、prepared message
└── providers/
    └── <provider>.ts          # createProviderDefinition + SDK/API adapter
tests/<channel>-<provider>.test.ts
```

Provider factory 的职责边界：

```ts
export function createProviderDefinition(): NotificationProviderDefinition<
  ProviderConfig,
  PreparedMessage
> {
  return {
    type: 'provider-type',
    async createProvider(context, config) {
      const client = createOfficialClient(config);
      return {
        name: config.name,
        type: 'provider-type',
        async send(input): Promise<ProviderSendResult> {
          // one SDK/API submission; normalize result and errors
        },
        async close(): Promise<void> {
          // close pool/socket when the SDK needs it
        },
      };
    },
  };
}
```

实现时必须覆盖：

1. 配置 schema 和 secret 脱敏；
2. recipient 映射和地址校验；
3. payload 构造与长度/模板/媒体限制；
4. `accepted`、永久失败、可重试失败、`submission_unknown`；
5. provider message ID；
6. AbortSignal、连接/响应超时和资源释放；
7. 单元测试（成功、认证失败、无效收件人、429/5xx、超时、返回 ID）；
8. 若有 inbound webhook：保留 raw body 后再验签、时间窗口、幂等键、重放防护、快速 ACK 和路由隔离。

### 7.1 包拆分建议

不要把所有官方 SDK 都加进现有 `@nocobase/app-plugin-notification-providers` 的必选依赖。建议：

- 核心包 `@nocobase/app-plugin-notification` 只保留 Manager、Registry、Channel/Provider 合同、Queue 和日志；
- 现有 providers 包保留轻量 Channel 定义与 SMTP，或者逐步拆成 channel contract 包；
- 每个重型或可选厂商使用独立包，例如 `@nocobase/app-plugin-notification-provider-feishu`、`...-tencent-sms`、`...-fcm`；
- 厂商包依赖对应官方 SDK，并导出 config helper 和 `create*ProviderDefinition()`；宿主只安装实际启用的包；
- 不依赖 SDK 的简单 Webhook Provider 可以保留在通用 providers 包中。

第一批只在通用 providers 包中保留 SMTP、Resend、飞书和钉钉。后续重型厂商 SDK 使用独立包；简单 Webhook Provider 可在安全模型稳定后保留在通用 providers 包中。

若后续创建新包，应遵循仓库的 `@nocobase/dev-config`、Node `>=24`、公开发布、`files: ["dist"]` 和独立 lint/typecheck/test/build 要求。

## 8. 建议的落地拆分

### Phase 0：稳定现有实现和公共合同

- 保持已有 `in-app/database` 与 `email/smtp`，增加 `email/resend`；
- 保持 `NotificationProviderSendResult` 三态语义；
- 将 recipient resolver 改为异步且传入 Provider identity；
- 收窄 Provider Context，并固定错误类别 taxonomy；
- 为 Channel 增加明确的 message 类型和 provider-specific override；
- 补齐 Provider contract test、mock clock、timeout 和 `submission_unknown` 测试；
- 文档说明 Provider `name/type` 一旦写入 Delivery 不应随意变更。

### Phase 1：第一批

1. Email：SMTP（已有）+ Resend；
2. `im` Channel + Feishu、DingTalk（第一版 webhook outbound）；
3. 每个平台先做文本/Markdown 单次发送，再做卡片、媒体和入站事件。

### Phase 2：第二批

1. 通用 Webhook；
2. `sms` Channel + 腾讯云短信、阿里云短信、Twilio；
3. 企业微信、Slack、Telegram；
4. `push` Channel + FCM、APNs；
5. SES、SendGrid、Discord、Google Chat、WhatsApp；
6. 统一 webhook 签名和回执模型。

### Phase 3：第三批

1. OneSignal、极光、个推、华为 Push；
2. Amazon SNS、SendGrid、Mailgun、Postmark、Brevo；
3. 高级 Webhook 认证/回执和客户自定义 Provider SDK。

## 9. 验收标准与不做事项

每个 Provider 合入前至少通过：

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；
- 真实沙箱/测试账号的一次成功发送；
- 认证错误、无效 recipient、限流、服务端错误、网络超时和重复投递验证；
- 日志不泄露 token、secret、Webhook URL 或完整消息正文；
- Provider 关闭后不会遗留 socket、timer 或连接池。

异步回执必须按状态机单调推进，能够处理批量、重复和乱序事件；Provider API 返回 `accepted` 不能直接当作 `delivered`。回执应作为独立事实记录并关联 Delivery/Attempt，不覆盖已经发生的 Attempt 历史。

一期明确不做：

- 引入完整通知平台接管 workflow、subscriber、template、preference；
- 在公共 `NotificationManager.send()` 暴露厂商 SDK 类型；
- 把一次不确定提交自动 fallback 到另一个 Provider；
- 为每个 Provider 复制一套 Queue、Delivery 或日志表；
- 没有真实客户/部署需求就批量接入长尾供应商。

## 10. 参考来源索引

- [NocoBase 飞书调研原文](https://nocobase.feishu.cn/wiki/ZVaWwhU1qib68bkrXrMcryMtnCh)
- [Novu](https://github.com/novuhq/novu)
- [Better Notify](https://github.com/better-notify/better-notify)
- [Vercel Chat SDK](https://github.com/vercel/chat)
- [OpenAkita IM channels](https://github.com/openakita/openakita/blob/main/docs/im-channels.md)
- [Feishu Node SDK](https://github.com/larksuite/node-sdk)
- [Feishu Channel SDK](https://github.com/larksuite/channel-sdk-node)
- [DingTalk Stream Node SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)
- [WeCom AI Bot Node SDK](https://github.com/WecomTeam/aibot-node-sdk)
- [Slack Node SDK](https://github.com/slackapi/node-slack-sdk)
- [Firebase Admin Node SDK](https://github.com/firebase/firebase-admin-node)
- [APNs HTTP/2 文档](https://developer.apple.com/documentation/usernotifications/establishing-a-connection-to-apns)
- [Tencent Cloud Node SDK](https://github.com/TencentCloud/tencentcloud-sdk-nodejs)
- [Alibaba Cloud TypeScript SDK](https://github.com/aliyun/alibabacloud-typescript-sdk)
- [Twilio Node SDK](https://github.com/twilio/twilio-node)
- [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3)
- [Resend Node SDK](https://github.com/resend/resend-node)
- [Nodemailer](https://github.com/nodemailer/nodemailer)
