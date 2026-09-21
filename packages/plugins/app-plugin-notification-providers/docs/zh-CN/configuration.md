# Provider 配置

每个 Channel 使用一个 Provider，配置直接放在 Channel 名称下面。`enabled` 默认是 `true`。同一 Provider 可以配置为多个独立 Channel。

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

邮件消息提供 `to`、`subject` 和 `text` 或 `html`；收件人数组逐人发送。Webhook 消息提供 `text`，禁止 `to`，可选 `target` 只接受完整 HTTP(S) URL。
