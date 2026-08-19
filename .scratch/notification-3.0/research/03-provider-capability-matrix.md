# 目标 Provider 能力、错误与回执矩阵

研究日期：2026-08-17

## 结论

一期和后续 Adapter 不能假设第三方具有共同的幂等、消息 ID 或送达回执语义。核心必须始终先做自己的幂等和 Attempt 持久化；Adapter 只声明并使用 Provider 的附加能力。

- 一期 SMTP 只有协议级接受/拒绝与可选 DSN，没有标准幂等键、统一服务端消息 ID、Webhook 验签或沙箱。`Message-ID` 是消息自身标识，不是 SMTP 服务端接受 ID，也不能证明送达。
- Resend 和飞书发送接口原生支持有时效的幂等键；阿里云短信明确不支持；其余已核实接口没有可依赖的发送幂等承诺。因此核心幂等不能下放给 Provider。
- “提交成功”均不能统一解释为“终端已送达”。Resend、阿里云短信、腾讯云短信和 Twilio 有异步状态；SMTP 只有可选 DSN；飞书发送接口只确认消息创建成功，没有找到面向发送方的送达回执。
- 限流信号不统一：HTTP `429`/重试头、业务错误码、HTTP `400` 加业务码都存在。Adapter 必须归一化 `rate_limited` 并尽可能提供 `retryAfterMs`，核心不能只按 HTTP 状态判断。
- 微信未指明公众号、企业微信还是小程序。本报告将目标暂定为“微信公众号模板消息”，但官方开发文档在本研究环境不可读取；钉钉动态文档也只返回登录/页面壳。两者所有未能由可读官方一手页面确认的字段均记为 `unknown`，不以二手资料补齐。

## 研究范围与判定规则

矩阵只使用 SMTP/IETF 标准以及各厂商官方文档。`not documented` 表示所研究的发送接口没有官方声明该能力，不能据此宣称整个厂商绝对没有该能力；`unknown (access blocked)` 表示官方页面存在但当前环境不能读取正文。

企业消息渠道按可定向到用户/群且能返回平台消息标识的应用机器人接口研究：飞书采用 `POST /open-apis/im/v1/messages`；微信暂定公众号模板消息。钉钉原计划采用企业内部应用工作通知，但官方正文访问受阻。

## 矩阵 A：认证、发送、幂等与外部 ID

| Provider / 接口 | 认证配置 | 发送能力 | Provider 幂等 | 外部消息 ID |
| --- | --- | --- | --- | --- |
| SMTP | 服务器 host/port；可用 SMTP AUTH/SASL，明文口令机制应置于 TLS 层；STARTTLS 是独立扩展。[RFC 4954](https://www.rfc-editor.org/rfc/rfc4954.html) [RFC 3207](https://www.rfc-editor.org/rfc/rfc3207.html) | 标准 envelope sender、逐 recipient 与 RFC 5322/MIME message；服务端在 DATA 结束后返回成功即接手后续交付或失败报告责任。[RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html) | **无标准发送幂等键。** SMTP 的重试边界会产生重复风险；`Message-ID` 只标识某一版本的消息，标准未规定接收服务器按它去重。[RFC 1047](https://www.rfc-editor.org/rfc/rfc1047) [RFC 5322 §3.6.4](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.4) | 可保存调用方生成的 RFC 5322 `Message-ID`，但它不是 Provider acceptance ID。可选 DSN 的 `ENVID`/`Original-Envelope-ID` 用于关联信封，不是通用队列 ID。[RFC 3461](https://www.rfc-editor.org/rfc/rfc3461.html) |
| Resend `POST /emails` | HTTPS `Authorization: Bearer <API key>`；sending-only key 可限制到域名。[API introduction](https://resend.com/docs/api-reference/introduction) [API keys](https://resend.com/docs/dashboard/api-keys/introduction) | 单封邮件，支持 `to/cc/bcc`、HTML、text、模板、自定义 headers、附件；单请求 `to` 最多 50 个。[Send Email](https://resend.com/docs/api-reference/emails/send-email) | **支持。** `Idempotency-Key` 最长 256 字符、保留 24 小时；相同 key 与相同 payload 返回同一响应而不重复发送，payload 不同或并发请求返回 `409`。[Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) [Errors](https://www.resend.com/docs/api-reference/errors) | 成功响应的 `id`；Webhook payload 用 `email_id` 关联邮件。[Send Email](https://resend.com/docs/api-reference/emails/send-email) [Webhooks](https://resend.com/docs/webhooks/introduction) |
| 阿里云短信 `SendSms` | 推荐 RAM 用户/角色；AccessKey ID/Secret 经 ACS3-HMAC-SHA256 签名，官方 SDK 封装签名。[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms) [集成概览](https://help.aliyun.com/zh/sms/developer-reference/using-openapi/) | 单号码或最多 1000 个号码发送相同已审核签名、模板和变量；不同签名/变量使用 `SendBatchSms`，最多 100 个号码。[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms) | **明确不支持。** 国内、国际和多媒体短信均需调用方自行幂等；超时后应先查回执再决定是否重试。[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms) | `BizId` 为发送回执 ID；`RequestId` 是 API 请求 ID，应分别保存。[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms) |
| 腾讯云短信 `SendSms` | `SecretId`/`SecretKey`，推荐 TC3-HMAC-SHA256 或官方 SDK；另有 `SmsSdkAppId`。[签名方法 v3](https://cloud.tencent.com/document/product/382/38768) [SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) | 验证码、通知或营销模板；按 `PhoneNumberSet` 向号码发送，`SessionContext` 可携带调用方上下文并原样返回。[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) | `not documented`。`SessionContext` 是关联上下文，不是去重键；核心不得把它当作幂等能力。[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) | 每号码结果的 `SerialNo`；API 层另有 `RequestId`。状态回调中的 `sid` 对应 `SerialNo`。[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) [状态通知](https://cloud.tencent.com/document/product/382/59178) |
| Twilio Programmable Messaging `Messages` | HTTP Basic；生产推荐 API key/secret，本地可用 Account SID/Auth Token。[Messaging API](https://www.twilio.com/docs/messaging/api) | 创建 Message 发送 SMS/MMS；可用号码、短码、alphanumeric sender 或 Messaging Service；支持状态回调与定时发送等能力。[Message resource](https://www.twilio.com/docs/messaging/api/message-resource) | `not documented` for Message create。必须由核心去重；不要把 Message SID 当请求幂等键。[Message resource](https://www.twilio.com/docs/messaging/api/message-resource) | Twilio Message `sid`，格式为 `SM|MM` 加 32 位十六进制字符。[Message resource](https://www.twilio.com/docs/messaging/api/message-resource) |
| 微信（暂定公众号模板消息） | `unknown (access blocked)`；官方页面 [access token](https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html) 在本研究环境不可读取。 | `unknown (access blocked)`；目标产品尚未在需求中确定，官方 [模板消息接口](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Template_Message_Interface.html) 不可读取。 | `unknown (access blocked)`；不得由记忆或第三方文章推断。 | `unknown (access blocked)`。 |
| 飞书应用机器人 `POST /im/v1/messages` | `Authorization: Bearer tenant_access_token`（应用身份）或 `user_access_token`（用户身份），并需相应消息权限；机器人能力需启用并发布。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) | 向指定用户或群发 text、post、interactive、image、file、audio、video 等；机器人需在可用范围/群内并有发言权。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) | **支持。** 可选 `uuid` 最长 50 字符；相同 `uuid` 在 1 小时内至多成功发送一条消息。[发送消息（含 uuid）](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create) | 成功响应 `data.message_id`；在单租户内唯一。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) [消息概述](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/intro) |
| 钉钉企业内部应用工作通知 | `unknown (access blocked)`；官方 [企业内部应用配置入口](https://open.dingtalk.com/document/org/configure-orgapp) 仅返回动态页面壳。 | `unknown (access blocked)`；无法可靠确认当前工作通知 API 与字段。 | `unknown (access blocked)`。 | `unknown (access blocked)`。 |

## 矩阵 B：限流、错误、回执、测试与内容约束

| Provider | 限流信号 | 错误分类事实 | 回执与验签 | 测试环境 | 内容约束摘要 |
| --- | --- | --- | --- | --- | --- |
| SMTP | 没有统一 `Retry-After`；4yz 是暂时失败、5yz 是永久失败，应保留三位回复及可选 enhanced status。[RFC 5321 §4.2.1](https://www.rfc-editor.org/rfc/rfc5321.html#section-4.2.1) | 先按 2/4/5 类分 success/transient/permanent；enhanced status 的第二段再区分 address、mailbox、system、network、protocol、content、security/policy。[RFC 3463](https://www.rfc-editor.org/rfc/rfc3463.html) | 可选 DSN 扩展允许请求 SUCCESS/FAILURE/DELAY，返回 `multipart/report; report-type=delivery-status` 并可带 `Original-Envelope-ID`。它是邮件，不是签名 Webhook；没有标准回执验签。[RFC 3461](https://www.rfc-editor.org/rfc/rfc3461.html) [RFC 3464](https://www.rfc-editor.org/rfc/rfc3464.html) | 无标准沙箱或魔法收件人；应由 Fake Provider/本地测试 SMTP 覆盖，而不是假设任意 SMTP 服务支持测试模式。 | RFC 5322/MIME 消息；服务端可通过 `SIZE` 扩展声明上限并在 MAIL 阶段拒绝。实际附件/收件人数等限制属于具体 SMTP 服务，不是 SMTP 标准常量。[RFC 1870](https://www.rfc-editor.org/rfc/rfc1870.html) |
| Resend | 默认团队级 5 req/s；超限 HTTP `429`。响应含 `ratelimit-limit/remaining/reset` 与 `retry-after`，另有日/月 quota headers/错误类型。[Usage Limits](https://resend.com/docs/api-reference/rate-limit) | `2xx` success；`4xx` 调用方失败，含 auth/validation/idempotency conflict/quota/rate limit；`5xx` 服务端瞬时错误。官方给出稳定的 `type`，应优先映射 type + HTTP status。[Introduction](https://resend.com/docs/api-reference/introduction) [Errors](https://www.resend.com/docs/api-reference/errors) | email sent/delivered/delivery_delayed/bounced/complained 等 HTTPS Webhook；用 endpoint signing secret 和原始 body 校验 `svix-id/timestamp/signature`。至少一次、可能重复且乱序，按 `svix-id` 去重。[Webhooks](https://resend.com/docs/webhooks/introduction) [Verify](https://resend.com/docs/webhooks/verify-webhooks-requests) | `delivered@resend.dev`、`bounced@resend.dev`、`complained@resend.dev`、`suppressed@resend.dev` 可模拟事件且不损害域名信誉。[Test addresses](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing) | `to` 最多 50；总邮件含 Base64 后附件最大 40 MB；batch 不支持附件；部分附件扩展名禁止。模板与 html/text/react 不能同时提供。[Send Email](https://resend.com/docs/api-reference/emails/send-email) [Attachments](https://resend.com/docs/dashboard/emails/attachments) |
| 阿里云短信 | `SendSms` 5000 QPS；业务频控返回 `isv.BUSINESS_LIMIT_CONTROL`，另有日/月限额码。国内默认验证码同签名同号 1/分、5/时、10/日；通知/推广同签名模板同号 50/日，可配置。[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms) [错误码](https://help.aliyun.com/zh/sms/developer-reference/api-error-codes) [发送规则](https://help.aliyun.com/zh/sms/user-guide/message-rules/) | `Code/Message` 区分参数、签名/模板/内容、权限/账户、频控、通道和终端/运营商失败。Adapter 应按官方码白名单映射，未知码保留 `unknown`，不能仅按 HTTP 状态。[错误码](https://help.aliyun.com/zh/sms/developer-reference/api-error-codes) | SmsReport 可用 MNS 队列拉取或 HTTP POST 批量推送；状态查询也可用 `QuerySendDetails`。可读官方短信文档未说明 HTTP SmsReport 的签名字段，因此 **HTTP 回调验签为 not documented**；高可靠场景优先使用以 AK 认证消费的 MNS。[回执配置](https://help.aliyun.com/zh/sms/developer-reference/configure-delivery-receipts-1/) [MNS 对接](https://help.aliyun.com/zh/mns/user-guide/sms) | 有真实测试发送而非免计费沙箱：仅国内、最多绑定 5 个号码、仍受总量/频控限制且计费。[测试短信](https://help.aliyun.com/zh/sms/user-guide/send-test-messages-1/) | 必须使用已审核签名/模板；国内完整内容最多 500 字，≤70 字一条、长短信 67 字/条；变量通常 1–35 字且不得全变量/相邻变量，链接等受严格审核规则约束。[发送规则](https://help.aliyun.com/zh/sms/user-guide/message-rules/) [通知模板规范](https://help.aliyun.com/zh/sms/user-guide/notification-template-specifications/) |
| 腾讯云短信 | SendSms 官方页面为 3000 req/s；业务 `LimitExceeded.*` 细分应用/国家/号码/频次上限。默认同号同内容 30 秒 1 条、同号自然日 2 条，可配置。[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) [基础配置](https://cloud.tencent.com/document/product/382/37809) | API 返回 HTTP/通用错误和 `SendStatusSet[].Code/Message`，有码族 `AuthFailure`、`InvalidParameter*`、`FailedOperation*`、`LimitExceeded*`、`InternalError*`；运营商回执另有 SUCCESS/FAIL 与具体码。[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) [状态通知](https://cloud.tencent.com/document/product/382/59178) | 配置 URL 后 POST JSON 数组；`sid` 对应发送 `SerialNo`，失败重试 2 次。可读官方页面没有签名/共享密钥字段，只有可查询回调 IP 列表，故 **回调验签 not documented**。[状态通知](https://cloud.tencent.com/document/product/382/59178) | 无免计费沙箱证据；官方要求实际发一条测试短信来测试回调。API Explorer 是在线调用工具，不应视作隔离沙箱。[状态通知](https://cloud.tencent.com/document/product/382/59178) | 必须使用审核通过的签名/正文模板；验证码变量最多 6 位数字，非验证码变量限制以控制台为准，不支持全变量；发送接口还列出 URL/变量格式等拒绝码。[使用须知](https://cloud.tencent.com/document/product/382/13444/) [SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en) |
| Twilio | REST 并发超限为 HTTP `429`/Twilio code `20429`；消息进入 sender 队列，实际吞吐另受 sender 类型与目的地影响。[Rate limits](https://help.twilio.com/articles/115002943027) | 失败响应含 HTTP `status`、Twilio `code`、`message`、`more_info`；官方建议重试逻辑主要依 HTTP 状态而不是枚举所有会变化的细码。Message 后续 `failed/undelivered` 还带 messaging error code。[API responses](https://www.twilio.com/docs/usage/twilios-response) [Error dictionary](https://www.twilio.com/docs/api/errors) | `StatusCallback` 在 Message 初始状态之后的状态变化触发；状态包括 queued/sent/delivered/undelivered/failed 等。Twilio 用 `X-Twilio-Signature` 签请求，官方强烈建议 SDK 校验；表单请求算法以 Auth Token HMAC-SHA1，JSON 使用 bodySHA256 规则。[Status callback](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks) [Security](https://www.twilio.com/docs/usage/security) | Test Account SID/Auth Token + magic numbers：不计费、不连接真实号码，但测试发送 **不会触发 status callbacks**。[Test credentials](https://www.twilio.com/docs/iam/test-credentials) | SMS 单段 GSM-7 160 字符、UCS-2 70；长短信分别常为 153/67 每段，平台最大 1600 字符并按 segment 计费；目的地合规/注册与 AUP 也会导致拒绝。[SMS length](https://www.twilio.com/docs/glossary/what-sms-character-limit) [Messaging API](https://www.twilio.com/docs/messaging/api) |
| 微信（暂定公众号模板消息） | `unknown (access blocked)`。 | `unknown (access blocked)`。 | 官方 [接入指南](https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html) 与 [模板消息接口](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Template_Message_Interface.html) 当前均不可读取；不得声称已有可验证送达回执或验签方案。 | 官方 [公众号测试号入口](https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login) 当前不可读取，能力记 unknown。 | `unknown (access blocked)`；且应先由产品决定是公众号模板消息、公众号订阅通知、企业微信应用消息还是小程序订阅消息。 |
| 飞书应用机器人 | OpenAPI 总限制 1000/分、50/秒；同一用户 5 QPS，同一群为群机器人共享 5 QPS。触发通用限制常为 HTTP `429`（旧接口可能 400）、code `99991400` 与 `x-ogw-ratelimit-reset`；群维度发送限制为 `230020`。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) [频控](https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control?lang=zh-CN) | 响应 `code/msg`；发送接口列出成员/群权限、内容、资源归属、敏感信息、长度、频控等 230xxx 业务码。`230020` 可重试，鉴权/权限/内容/收件人类通常需修正而非盲重试。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) | 发送接口只返回消息资源；可查询/编辑该消息，但没有找到发送到客户端的 delivered/read 回执 API。因此能力为 **无已文档化送达回执，验签 N/A**。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN) [获取消息](https://open.feishu.cn/document/server-docs/im-v1/message/get?lang=zh-CN) | 正式版和测试版是逻辑独立应用；可建测试企业/人员，权限与配置免审生效，需使用测试版 `app_id/app_secret`。[测试企业与人员](https://open.feishu.cn/document/tools-and-resources/test-and-release-app) | `content` 是按 `msg_type` 序列化的 JSON；文本最大 150 KB，卡片/富文本最大 30 KB；媒体需先由机器人上传再用 key 发送。[发送消息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create) |
| 钉钉企业内部应用工作通知 | `unknown (access blocked)`。 | `unknown (access blocked)`。 | `unknown (access blocked)`。不能把自定义机器人 Webhook 的签名规则移植到企业工作通知回执。 | `unknown (access blocked)`。 | 官方文档动态页面在当前环境不可读取；入口仅能确认钉钉把企业机器人、自定义机器人、Webhook 机器人分为不同产品形态。[机器人文档入口](https://open.dingtalk.com/document/orgapp/custom-robot-access) |

## Adapter 契约含义

### 1. 能力必须显式声明

建议 Provider Type 元数据至少包含：

```ts
type ProviderCapabilities = {
  providerIdempotency: 'none' | 'keyed';
  providerIdempotencyTtlMs?: number;
  externalMessageId: 'none' | 'client-generated' | 'provider-generated';
  receipt: 'none' | 'poll' | 'push' | 'dsn';
  receiptVerification: 'none' | 'signed' | 'authenticated-pull' | 'unknown';
  testEnvironment: 'none' | 'live-test' | 'sandbox' | 'test-tenant';
};
```

核心幂等始终执行；Resend/飞书的 key 只是第二层保护。TTL 过期后 Provider 不再保证去重，不能替代核心永久唯一约束。

### 2. 发送结果区分“接受”与“送达”

同步 `send()` 只应返回规范化的提交结果：

```ts
type ProviderSendResult = {
  acceptedAt: string;
  externalMessageId?: string;
  providerRequestId?: string;
  receiptCorrelationId?: string;
};
```

SMTP `Message-ID`、阿里云 `BizId`、腾讯云 `SerialNo`/`RequestId`、Twilio SID、飞书 `message_id` 不应塞进一个含义模糊的 `messageId`。核心至少要区分 Provider 消息/回执关联 ID 与 API request ID。

### 3. 错误归一化仍须保留原始证据

建议最小错误类为：`invalid_request`、`authentication`、`permission`、`invalid_recipient`、`content_rejected`、`rate_limited`、`provider_transient`、`provider_permanent`、`unknown`。规范化错误同时保留 `providerCode`、`httpStatus`/`protocolStatus`、`retryAfterMs` 和脱敏后的 Provider message。

只有明确 transient/rate-limited 才自动重试；认证、权限、模板/签名、内容、收件人错误默认终止。未知错误不能自动变成永久失败，也不能无限重试。SMTP 4yz/5yz、Resend HTTP+type、阿里/腾讯业务码、Twilio HTTP+code 和飞书 HTTP+code 必须在各 Adapter 内映射。

### 4. 超时是单独的“不确定提交”状态

发送请求超时不等于失败。阿里云官方明确要求超时后先查回执；SMTP 在客户端未收到 DATA 最终响应时也存在是否已接收的不确定性。核心应记录 `submission_unknown`，优先以幂等键、状态查询或回执消歧，再决定是否重发/Fallback，避免把一次不确定提交扩散成跨 Provider 重复通知。

### 5. 回执处理是可选接口

Provider 可实现 `parseAndVerifyReceipt()` 或 `pollReceipt()`，输出统一的 `accepted/delivered/delayed/failed/complained/read/unknown` 事件。Resend 与 Twilio 必须验签；阿里云 HTTP/Tencent HTTP 因可读官方文档没有验签字段，不能伪造“已验签”状态，应使用 authenticated pull/查询、网络边界和事件关联降低风险。所有 push receipt 都需自身去重并允许乱序；同步发送响应与异步回执分别留审计记录。

## 分期建议

1. 一期 SMTP Adapter：实现协议回复分类、客户端 `Message-ID`、可选 ENVID/DSN 配置，但默认不宣称 delivered；测试使用 Fake Provider 与项目控制的 SMTP 测试服务。
2. 二期 Resend：透传核心 idempotency key，保存 `id`，实现 Svix 验签和 `svix-id` 去重；测试用官方 test addresses。
3. 二期 SMS：每个 Provider 独立错误表与 receipt parser；阿里/腾讯超时先查状态，Twilio 使用 SID + 已验签 StatusCallback；核心禁止对“不确定提交”立即 Fallback。
4. 二期飞书：使用 `uuid` 和 `message_id`，但状态上限是 `accepted`，没有回执时不得提升为 `delivered`。
5. 微信/钉钉进入开发前新增产品选型/补证票据：明确具体产品接口并在可访问官方文档或已登录开发者后台中补齐所有 unknown，尤其是幂等、回执真实性和频控。

## 一手来源索引

- SMTP/IETF：[RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html)、[RFC 5322](https://www.rfc-editor.org/rfc/rfc5322.html)、[RFC 4954](https://www.rfc-editor.org/rfc/rfc4954.html)、[RFC 3207](https://www.rfc-editor.org/rfc/rfc3207.html)、[RFC 3461](https://www.rfc-editor.org/rfc/rfc3461.html)、[RFC 3463](https://www.rfc-editor.org/rfc/rfc3463.html)、[RFC 3464](https://www.rfc-editor.org/rfc/rfc3464.html)、[RFC 1870](https://www.rfc-editor.org/rfc/rfc1870.html)、[RFC 1047](https://www.rfc-editor.org/rfc/rfc1047)
- Resend：[API introduction](https://resend.com/docs/api-reference/introduction)、[Send Email](https://resend.com/docs/api-reference/emails/send-email)、[Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)、[Usage Limits](https://resend.com/docs/api-reference/rate-limit)、[Errors](https://www.resend.com/docs/api-reference/errors)、[Webhooks](https://resend.com/docs/webhooks/introduction)、[Verify Webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)、[Test addresses](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing)
- 阿里云短信：[SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)、[API 错误码](https://help.aliyun.com/zh/sms/developer-reference/api-error-codes)、[发送规则](https://help.aliyun.com/zh/sms/user-guide/message-rules/)、[回执配置](https://help.aliyun.com/zh/sms/developer-reference/configure-delivery-receipts-1/)、[测试短信](https://help.aliyun.com/zh/sms/user-guide/send-test-messages-1/)
- 腾讯云短信：[TC3 签名](https://cloud.tencent.com/document/product/382/38768)、[SendSms](https://intl.cloud.tencent.com/document/product/382/40536?lang=en)、[状态通知](https://cloud.tencent.com/document/product/382/59178)、[基础配置](https://cloud.tencent.com/document/product/382/37809)、[使用须知](https://cloud.tencent.com/document/product/382/13444/)
- Twilio：[Messaging API](https://www.twilio.com/docs/messaging/api)、[Message resource](https://www.twilio.com/docs/messaging/api/message-resource)、[Status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks)、[Webhook security](https://www.twilio.com/docs/usage/security)、[Test credentials](https://www.twilio.com/docs/iam/test-credentials)、[SMS length](https://www.twilio.com/docs/glossary/what-sms-character-limit)
- 飞书：[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create?lang=zh-CN)、[频控策略](https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control?lang=zh-CN)、[测试企业与人员](https://open.feishu.cn/document/tools-and-resources/test-and-release-app)
- 微信与钉钉：仅列报告中标注 access blocked 的官方入口；未使用二手来源填补正文。
