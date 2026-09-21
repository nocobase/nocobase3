# 发送通知

通知配置使用名称映射，每个 Channel 对应一个扁平化 Provider 配置。发送接口通过 `messages` 的键选择 Channel，值为完整消息。邮件使用原生邮箱，站内信使用应用用户 ID，Webhook 禁止 `to`。所有输入在入队前统一校验，实际投递与重试彼此独立。

```yaml
notification:
  channels:
    system-email:
      provider: smtp
      host: smtp.example.com
      port: 587
      auth: { user: '${SMTP_USER}', pass: '${SMTP_PASSWORD}' }
      from: notifications@example.com
    marketing-email:
      provider: resend
      apiKey: '${RESEND_API_KEY}'
      from: marketing@example.com
    ops-feishu:
      provider: feishu-webhook
      webhookUrl: '${FEISHU_WEBHOOK_URL}'
    inbox:
      provider: in-app
```

```ts
const notification = app.container.resolve(notificationServiceToken);
await notification.send({
  idempotencyKey: 'approval-123',
  source: { type: 'approval', referenceId: '123' },
  messages: {
    'system-email': {
      to: ['customer@example.com', 'reviewer@example.com'],
      subject: 'Approval result',
      html: '<p>Approved</p>',
    },
    'ops-feishu': {
      text: 'Approved',
      target: { type: 'url', url: 'https://example.com/main/approvals/123' },
    },
    inbox: {
      to: '123',
      title: 'Approval result',
      body: 'Approved',
      target: { type: 'route', path: '/approvals/123' },
    },
  },
});
```

完整契约见 [运行时参考](../../skills/nocobase-app-plugin-notification/references/sending-notifications.md)。
