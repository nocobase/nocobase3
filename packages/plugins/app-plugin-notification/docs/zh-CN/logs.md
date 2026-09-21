# 投递日志与重试

通知配置使用名称映射，每个 Channel 对应一个扁平化 Provider 配置。发送接口通过 `messages` 的键选择 Channel，值为完整消息。邮件使用原生邮箱，站内信使用应用用户 ID，Webhook 禁止 `to`。所有输入在入队前统一校验，实际投递与重试彼此独立。

完整契约见 [运行时参考](../../skills/nocobase-app-plugin-notification/references/delivery-diagnostics.md)。
