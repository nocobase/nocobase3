# Sending Notifications

## Resolve the shared service

Business server code resolves `notificationServiceToken` from the application's ServiceContainer. Do not instantiate a second manager, dispatch the internal delivery job, or call a Provider directly.

## Build the input

Every send needs at least one recipient, one Channel, and the required `body` field. Validate Channel-specific non-empty content rules before sending. Add a stable business source when later correlation matters:

```ts
const notification = app.container.resolve(notificationServiceToken);
const result = await notification.send({
  idempotencyKey: `approval:${approval.id}:approver:${approver.id}:in-app`,
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
  idempotencyKey: `approval:${approval.id}:alice:email`,
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

`send()` persists the Notification and Deliveries and dispatches queue work. Its result contains `notificationId`, the caller's `idempotencyKey`, whether this was a `deduplicated` call, and current Delivery snapshots. With a synchronous queue the current status may already be terminal; with an asynchronous queue it is usually pending or processing. `accepted` proves only Provider acceptance, not final delivery or reading.

Query the public service by business key or Notification id:

```ts
const byBusinessKey = await notification.getByIdempotencyKey(idempotencyKey);
const byNotificationId = await notification.getNotification(
  result.notificationId,
);
```

For in-process observation, subscribe without blocking the caller. The listener immediately receives the current snapshot when it exists and then best-effort changes from this manager process. Always keep a query path because listeners are not durable and do not replay changes from another process:

```ts
const unsubscribe = notification.onStatusChanged(
  { idempotencyKey },
  async (state) => {
    renderStatus(state);
    if (state.terminal) unsubscribe();
  },
);
```

For an operator task, use bounded polling when a process-local listener cannot cover the execution topology. Report the last observed state on timeout; do not call it a failure without Delivery evidence.

## Idempotency and retries

`idempotencyKey` is required. Build it from the stable business event, recipient scope, Channel, and—when one event intentionally targets more than one Provider—the Provider scope. A retry or recovery must reuse exactly the same key. The server stores a `requestFingerprint`; the same key and equivalent input return the original Notification with `deduplicated: true`, while the same key with different input raises `IDEMPOTENCY_KEY_CONFLICT`. There is no expiry field in this contract.

The runtime retries only failures whose Provider returns `disposition: 'same_provider'`, bounded by manager retry settings. It never switches Providers automatically. A `submission_unknown` outcome is terminal `unknown` and is not retried automatically.

A terminal `failed` Delivery can be retried after correcting the cause, except when its recipient was unsupported and must be corrected in a new logical send. Every manual retry requires a non-empty reason. For an `unknown` Delivery without valid Provider idempotency, invoking retry explicitly accepts possible duplication; write the evidence and business decision in the reason:

```ts
await notification.retryDelivery({
  deliveryId,
  reason:
    'The Provider dashboard has no matching submission; the business owner approved resending.',
});
```

The server derives the internal audit type as `terminal_failure`, `safe_provider_idempotency`, or `duplicate_risk_accepted`. Never retry a failed Delivery that already has `nextRunAt`; it is already scheduled for an automatic retry. `retryDelivery` first writes an immutable Retry Audit on the same Delivery. It creates another Attempt only after preparation succeeds and Provider submission starts, so a pre-submission failure retains the decision without claiming that a Provider call occurred.

## Send verification

- Verify the exact resolved recipient scope without exposing recipient details in reports.
- Verify requested Channels are enabled and definitions registered.
- Verify named Provider routing against effective configuration.
- Capture Notification and Delivery ids.
- Read back each Delivery and its latest Attempt.
- Treat `accepted` as Provider acceptance only.
- For `unknown`, check the Provider before any new send.
- For external sends, confirm the intended business source recorded success/failure without duplicating the message.
