# Sending Notifications

Resolve `notificationServiceToken` from the application container. `messages` is keyed by configured Channel name, and each value is the complete message for that Channel's registered message type.

```ts
const notification = app.container.resolve(notificationServiceToken);
const result = await notification.send({
  idempotencyKey: `approval:${approval.id}:result`,
  source: { type: 'approval', referenceId: approval.id },
  messages: {
    'system-email': {
      to: ['customer@example.com', 'reviewer@example.com'],
      subject: 'Approval result',
      text: 'The request was approved.',
      html: '<p>The request was approved.</p>',
      replyTo: 'support@example.com',
    },
    'ops-feishu': {
      title: 'Approval result',
      text: 'The request was approved.',
      format: 'markdown',
      target: { type: 'url', url: 'https://example.com/main/approvals/123' },
      payloads: { feishu: { msg_type: 'text', content: { text: 'Approved' } } },
    },
    inbox: {
      to: '123',
      title: 'Approval result',
      body: 'The request was approved.',
      target: { type: 'route', path: '/approvals/123' },
    },
  },
});
```

Email requires `to`, `subject`, and at least one of `text` or `html`; optional `from` and `replyTo` override the Channel defaults. Each address becomes an independent Delivery. In-app messages require application user IDs, `title`, and `body`; the final delivery checks that each user still exists. Webhook messages do not accept `to`; they require non-empty `text` and may carry Provider-specific payloads; their optional target must be a full HTTP(S) URL. IM `format` accepts `text` or `markdown`; `payloads.feishu` and `payloads.dingtalk` allow Provider-specific objects.

Recipients are native addresses or user IDs. The service does not resolve application users into email addresses or phone numbers and does not default to the current user. Email and in-app `to` may be one string or a non-empty readonly array. IM targets accept complete HTTP(S) URLs only. In-app targets accept a route without the deployment prefix or a complete HTTP(S) URL; React Router adds the basename to route targets. Legacy `actionUrl` is ignored.

Unknown or disabled Channels and invalid messages reject the whole request before persistence or queue dispatch. Delivery-time failures are recorded independently. The `idempotencyKey` must be a non-empty, trimmed string of at most 191 characters. Reuse it for the same logical request: an identical request returns the original Notification with `deduplicated: true`; different content with that key throws `IDEMPOTENCY_KEY_CONFLICT`. Optional `source` adds business correlation.

Use `getByIdempotencyKey`, `getNotification`, or `onStatusChanged` to observe results. `retryDelivery({ deliveryId, reason })` only accepts terminal `failed` Deliveries and requires a reason; unsupported recipients must be corrected in a new logical send. `retrying` is already scheduled. Check Provider evidence for an `unknown` Delivery before creating a replacement send.

For a typed custom host, pass a literal Channel map to `createNotificationManager`. `ConfiguredNotificationChannels<typeof channels>` maps each configured Provider identifier to its registered message contract; import the relevant Provider package so its declaration merging is loaded.

There is no shared content renderer, per-Channel override, Provider routing, grouping, condition selection, or cross-Channel fallback. Every entry in `messages` is sent independently; intentional multi-send uses multiple entries.
