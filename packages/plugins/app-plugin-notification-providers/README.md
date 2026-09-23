# Notification Providers App Plugin

Built-in Provider identifiers are `smtp`, `resend`, `feishu-webhook`, and `dingtalk-webhook`. SMTP and Resend use the email message handler; the Webhooks use the IM message handler. Register the Server plugin after the core notification plugin, or call `registerBuiltInNotificationProviders(registry)` in a custom host.

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

Each Channel owns one flat Provider configuration and defaults to enabled. Multiple Channels can use the same Provider with independent credentials. The host owns secret loading. Feishu and DingTalk accept their official HTTPS Webhook hosts and reject redirects.

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

Email requires native email addresses and subject plus text or HTML. Arrays create separate emails and retries. Webhooks forbid recipients and accept only complete HTTP(S) targets. There is no user-to-address resolution, common content renderer, Provider instance name, or Provider routing. The core test API exposes Channel names and safe message fields, never configuration or secrets.

Configuration helpers such as `defineSmtpProviderConfig` set the `provider` discriminator; their result is directly a Channel map value. Definition registration uses `registry.registerProvider(definition)`, and each definition declares its message type.
