# 建立目标 Provider 的能力与回执矩阵

Type: research
Status: resolved

## Question

根据 SMTP、Resend、阿里云短信、腾讯云短信、Twilio、微信、飞书和钉钉的官方文档，逐一确定认证配置、发送能力、幂等支持、限流信号、错误分类、外部消息 ID、回执/验签、测试环境和内容约束，为分阶段 Adapter 契约提供事实矩阵。

## Answer

研究结论见[《目标 Provider 能力、错误与回执矩阵》](../research/03-provider-capability-matrix.md)。核心幂等和 Attempt 持久化必须独立于 Provider；同步发送成功只能表示 Provider 接受，是否送达由可选回执/查询推进。SMTP 无标准幂等、统一服务端消息 ID、Webhook 验签或沙箱；Resend 和飞书有时效幂等键；阿里云短信明确不支持幂等；Resend/Twilio 有官方验签回执，阿里/腾讯可读官方短信回调文档未给出签名字段。微信产品形态尚未确定且微信、钉钉官方正文访问受阻，相关项已明确记为 unknown，需在 Adapter 开发前补证。

后续范围收缩后，本期只使用矩阵中的 SMTP 事实：同步成功只能视为 `accepted`，且 SMTP 没有标准送达回调。研究中的 Provider 幂等、其他 Channel 与通用回调结论保留作历史参考，不进入本期实现契约。
