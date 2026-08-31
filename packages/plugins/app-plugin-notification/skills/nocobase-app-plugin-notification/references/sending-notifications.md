# Sending Notifications

## Resolve the shared service

Business server code resolves `notificationServiceToken` from the application's ServiceContainer. Do not instantiate a second manager, dispatch the internal delivery job, or call a Provider directly.

## Build the input

Every send needs at least one recipient, one Channel, and the required `body` field. Validate Channel-specific non-empty content rules before sending. Add a stable business source when later correlation matters:

```ts
const notification = app.container.resolve(notificationServiceToken);
const result = await notification.send({
  source: { type: 'approval', referenceId: approval.id },
  to: { type: 'user', id: approver.id },
  channels: ['in-app'],
  content: {
    title: 'Approval required',
    body: 'Review the purchase request.',
    actionUrl: `/approvals/${approval.id}`,
  },
});
```

Validate `actionUrl` as application-owned navigation before including it. The common content renderer maps `title`, `body`, and `actionUrl` to Channel messages. Use `channelOverrides` only for fields owned by a specific Channel, such as an Email subject or HTML body.

## Recipient rules

Use the most direct supported identity:

- Personal inbox: `{ type: 'user', id: userId }` with `in-app`.
- Direct Email: `{ type: 'email', address }` with `email`.
- Webhook group: `{ type: 'target', id: configuredTarget }` with `im`.
- User-to-Email/IM sends require resolver functions registered in those Channel definitions.

For multiple recipients and Channels, the manager expands the Cartesian product. Confirm the expected Delivery count before a large send. If one Channel cannot resolve all recipients, split the send or accept explicit failed Deliveries for unsupported combinations.

## Select Providers deliberately

Omitting `routing` selects the first enabled Provider for each Channel. Select a configured Provider by name when the business contract requires it:

```ts
await notification.send({
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  routing: {
    email: { providers: { provider: 'primary-smtp' } },
  },
  content: { title: 'Approved', body: 'The request was approved.' },
});
```

To fan out one IM message, use `strategy: 'all'`. Add `providers: ['feishu', 'dingtalk']` to bound the names. The manager creates independent Deliveries; it does not treat them as failover candidates.

## Interpret the result

`send()` persists the Notification and Deliveries and dispatches queue work. Its result contains Notification and Delivery ids plus their initial status. Usually that status is pending. It does not prove a Provider call or final delivery.

Read back the audit record:

```ts
const details = await notification.logs.get(result.notificationId);
```

For a synchronous operator task, poll with a bounded interval until the Notification is `completed`, `partial`, `failed`, or `unknown`, or until the agreed observation window ends. Report the last observed state on timeout; do not call it a failure without Delivery evidence.

## Idempotency and retries

The public send contract has no caller-supplied idempotency key. Repeating `send()` creates a new Notification. Business callers must prevent duplicate logical sends using their own transactional/outbox state or source-level idempotency.

The runtime retries only failures whose Provider returns `disposition: 'same_provider'`, bounded by manager retry settings. It never switches Providers automatically. A `submission_unknown` outcome is terminal `unknown` and is not retried automatically.

## Send verification

- Verify the exact resolved recipient scope without exposing recipient details in reports.
- Verify requested Channels are enabled and definitions registered.
- Verify named Provider routing against effective configuration.
- Capture Notification and Delivery ids.
- Read back each Delivery and its latest Attempt.
- Treat `accepted` as Provider acceptance only.
- For `unknown`, check the Provider before any new send.
- For external sends, confirm the intended business source recorded success/failure without duplicating the message.
