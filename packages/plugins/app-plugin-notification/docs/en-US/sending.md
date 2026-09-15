---
title: 'Send notifications'
description: 'Use NocoBase NotificationManager to send in-app, email, and IM Webhook messages and read the results.'
keywords: 'NocoBase,NotificationManager,send notifications,in-app,email,Feishu,DingTalk'
---

# Send notifications

Server-side business code sends notifications through `NotificationManager.send()`. One call can include multiple recipients and send the same notification content through multiple Channels. For a Webhook Channel that does not need a recipient, you can omit `to`.

## Recipients and optional `to`

`to` is an optional notification recipient. A Channel that needs a recipient must receive one; Feishu and DingTalk Webhook Channels can omit `to` and send directly to the selected Provider. The core package supports these recipient shapes, while the recipient resolver of each Channel determines whether a particular shape can actually be sent:

| `to.type` | Example                                           | Description                                                                                             |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `user`    | `{ type: 'user', id: 'user-1' }`                  | Sends through a user ID. The Channel must provide the corresponding user-address resolution capability. |
| `email`   | `{ type: 'email', address: 'alice@example.com' }` | Sends directly to an email address.                                                                     |

The `provider` in Provider routing is the Provider name. `routing.im.providers.provider: 'feishu'` selects the Webhook Provider named `feishu`; you can also use `strategy: 'all'` to select multiple Providers.

## Send an in-app message

An in-app message requires a user ID as its recipient:

```ts
const result = await notification.send({
  idempotencyKey: 'workflow:workflow-42:user-1:in-app',
  source: {
    type: 'workflow',
    referenceId: 'workflow-42',
  },
  to: { type: 'user', id: 'user-1' },
  channels: ['in-app'],
  content: {
    title: 'Approval pending',
    body: 'You have a new approval task.',
    actionUrl: '/approvals/approval-2026-001',
  },
});
```

`source` is an optional business source. Its `type` and `referenceId` are included in notification logs so the server can trace a notification back to a business record.

## Send an email

The Email Channel can receive an email address directly:

```ts
await notification.send({
  idempotencyKey: 'approval:approval-2026-001:alice:email',
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  content: {
    title: 'Approval pending',
    body: 'You have a new approval task.',
  },
});
```

The default renderer maps `content.title` to the email subject and `content.body` to the plain-text body. If the host did not configure a user-ID-to-email resolver for `createEmailChannelDefinition()`, passing only a user ID cannot send an email.

## Multiple recipients and Channels

Multiple recipients can share the same content and Channels:

```ts
await notification.send({
  idempotencyKey: 'approval:approval-2026-001:users-1-2:in-app-email',
  to: [
    { type: 'user', id: 'user-1' },
    { type: 'user', id: 'user-2' },
  ],
  channels: ['in-app', 'email'],
  content: {
    title: 'Approval complete',
    body: 'Review the approval result.',
  },
});
```

The call above creates four Deliveries—2 recipients × 2 Channels. Each Channel's recipient resolver converts the shared recipient into the corresponding address.

If a Channel needs different fields, use `channelOverrides`:

```ts
await notification.send({
  idempotencyKey: 'approval:approval-2026-001:user-1:in-app-email',
  to: { type: 'user', id: 'user-1' },
  channels: ['in-app', 'email'],
  content: {
    title: 'Approval complete',
    body: 'Review the approval result.',
  },
  channelOverrides: {
    email: {
      subject: 'Approval complete | NocoBase',
      html: '<p>Review the approval result.</p>',
    },
  },
});
```

The Channel configuration selects the Provider. Ordinary business code does not need to maintain Provider names or low-level Delivery fields.

## Select a Provider

Provider routing uses the `single` strategy by default. Most of the time you do not need to pass `routing`—the system selects the first enabled Provider in the current Channel configuration.

If a Channel has multiple Providers and you need to select one explicitly, pass its Provider `name`:

```ts
await notification.send({
  idempotencyKey: 'approval:approval-2026-001:alice:primary-smtp',
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  routing: {
    email: {
      providers: {
        provider: 'primary-smtp',
      },
    },
  },
  content: {
    title: 'Approval pending',
    body: 'You have a new approval task.',
  },
});
```

Provider `name` values must be unique within a Channel, so sending does not need to pass the Provider `type`. Omitting `strategy` means `single`, so the example above is equivalent to explicitly passing `strategy: 'single'`.

Provider routing supports these forms:

| Configuration                                                           | Behavior                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Omit `routing`                                                          | Uses `single` by default and selects the first enabled Provider in the configuration. |
| `{ providers: { provider: 'primary-smtp' } }`                           | Uses `single` by default and selects the Provider with the specified name.            |
| `{ providers: { strategy: 'single' } }`                                 | Selects the default Provider.                                                         |
| `{ providers: { strategy: 'all' } }`                                    | Creates one Delivery for every enabled Provider in the current Channel.               |
| `{ providers: { strategy: 'all', providers: ['feishu', 'dingtalk'] } }` | Creates one Delivery for each listed Provider only.                                   |

`single` only means that one Provider is selected for this Channel during one send. A Provider failure does not automatically switch to another Provider.

## Send a Feishu or DingTalk message

Feishu and DingTalk Webhook Providers are the delivery destinations themselves, so an IM send can omit `to`:

```ts
await notification.send({
  idempotencyKey: 'deployment:42:im',
  channels: ['im'],
  content: {
    title: 'Deployment complete',
    body: 'The production environment has been deployed.',
    actionUrl: 'https://example.com/deployments/42',
  },
});
```

To send only to Feishu, select the Provider through routing. The `provider` value must match the Provider `name` in the configuration; it does not use the Provider `type`:

```ts
await notification.send({
  idempotencyKey: 'deployment:42:feishu',
  channels: ['im'],
  routing: {
    im: {
      providers: {
        provider: 'feishu',
      },
    },
  },
  content: {
    title: 'Deployment complete',
    body: 'The production environment has been deployed.',
  },
});
```

If you provide a user-ID-to-external-IM-address resolver through `createImChannelDefinition()`, you can also pass `{ type: 'user', id: 'user-1' }`.

To send to all enabled IM Providers, use `strategy: 'all'`. Each Provider creates an independent Delivery:

```ts
await notification.send({
  idempotencyKey: 'deployment:42:all-im',
  channels: ['im'],
  routing: { im: { providers: { strategy: 'all' } } },
  content: {
    title: 'Deployment complete',
    body: 'The production environment has been deployed.',
  },
});
```

## Read the return value

`send()` returns the Notification ID, the idempotency key supplied by the caller, whether an existing task was reused, and the current snapshot of every Delivery:

```ts
const result = await notification.send(input);

result.notificationId;
result.idempotencyKey;
result.deduplicated;
result.status;
result.deliveries[0]?.id;
result.deliveries[0]?.provider;
```

With an asynchronous queue, a newly created Notification and its Deliveries are usually `pending` or `processing`. This only means the notification has been stored and handed to the queue; it does not mean that a Provider has accepted the message. With a synchronous queue, the return value may already be a terminal status. Query the public service when you need the result:

```ts
const byKey = await notification.getByIdempotencyKey(result.idempotencyKey);
const byId = await notification.getNotification(result.notificationId);
```

Within one process, you can use a non-blocking status listener. If a status already exists when you subscribe, the current snapshot is delivered asynchronously first; later callbacks are best-effort notifications from the current manager process. This is not a persistent event stream, so use the query APIs as a fallback across processes or after a service restart:

```ts
const unsubscribe = notification.onStatusChanged(
  { notificationId: result.notificationId },
  (state) => {
    renderStatus(state);
    if (state.terminal) unsubscribe();
  },
);
```

## Idempotency and Delivery retries

`idempotencyKey` is required. The caller should generate it stably from the business event, recipient scope—or Channel scope when there is no recipient—and, when necessary, Provider scope. Reuse the same key if the same logical send times out, is submitted again, or resumes after service recovery. The same key with equivalent input returns the original Notification and sets `deduplicated` to `true`; the same key with different content throws `IDEMPOTENCY_KEY_CONFLICT`. `idempotencyExpiresAt` is not currently supported, so the key does not expire automatically because the caller waited through a timeout.

For a terminal `failed` Delivery, you can call `retryDelivery` after fixing the problem. If the Delivery already has `nextRunAt`, an automatic retry is scheduled and a manual retry is not allowed. If the recipient type is not supported by the Channel, the original Delivery cannot be corrected in place; start a new business send with the correct recipient instead.

Every manual retry must provide a non-empty `reason`. The server records an internal handling type based on the Delivery status and the Provider's idempotency capability. For `unknown`, if the Provider cannot guarantee safe idempotency, calling retry means accepting the risk of duplicate delivery, and `reason` should state the basis for that decision:

```ts
await notification.retryDelivery({
  deliveryId,
  reason:
    'The Provider dashboard has no matching submission, and the business approved resending.',
});
```

`retry.allowed` in a status snapshot indicates whether the server accepts a manual retry request. An `unknown` Delivery whose idempotency cannot be guaranteed still returns `allowed: true`, while `mode: 'duplicate_risk_confirmation_required'` tells the caller to display the duplication risk and require a `reason`.

A retry first writes a Retry Audit to the original Delivery; it does not create another Notification. The server records `terminal_failure`, `safe_provider_idempotency`, or `duplicate_risk_accepted` internally. A new Attempt is created only when the retry enters the Provider submission stage. If the idempotency window expires after the request is accepted but before Provider submission, the server still performs the manual retry and marks the actual Attempt as `duplicate_risk_accepted`.

## Common input errors

The following situations throw an error immediately:

- The configured Channel or Provider Definition has not been registered by a plugin
- `to` is explicitly an empty array
- No Channel is provided
- An inactive Channel is used
- The Channel does not support generic content
- The Channel has no available Provider
- `idempotencyKey` is empty, has leading or trailing whitespace, or is longer than 191 characters
- The same `idempotencyKey` is used for different request content

If `to` is omitted, a Channel that requires a recipient creates a failed Delivery and does not call an external Provider. A Channel that supports recipient-free sends, such as an IM Webhook, delivers normally.

If a Channel does not support a recipient shape, the corresponding combination creates a failed Delivery while other recipients and Channels can continue. Address resolution, message validation, and Provider calls run in queue tasks; if one of these stages fails, `send()` may already have returned, so inspect the Delivery logs for the result.

## Related links

- [Notification overview](./overview.md) — understand how one send is split into Deliveries
- [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md) — enable Email and IM Providers
- [Manually integrate notifications](./integration.md) — create a manager and register Channels / Providers
- [Notification logs](./logs.md) — inspect the final delivery result
