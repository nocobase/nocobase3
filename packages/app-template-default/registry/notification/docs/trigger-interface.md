# Trigger interface

`NotificationService.trigger()` is the internal calling surface for other services (business modules, workflow, etc.) to create notifications. There is no external HTTP surface in the current scope: `POST /api/notifications/trigger` returns `403 HTTP_TRIGGER_DISABLED` and is out of scope until identity/ACL lands (see [server-integration.md](server-integration.md)).

## Input

```ts
interface NotificationTriggerInput {
  readonly principalService: string;
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly targets: readonly { readonly userId: string; readonly channels: readonly ['in-app'] }[];
  readonly content: { readonly title: string; readonly body: string; readonly actionUrl?: string };
}
```

- `principalService`: trusted in-process caller identity, required. The host integration supplies it; browser callers cannot choose it.
- `source.type`: business event type, required. It should carry the triggering service namespace, e.g. `workflow.order.created`; `source.referenceId` is the business reference (order number). Together they answer "which service, for which business event" and are the audit attribution dimension.
- `targets`: 1-1000 receivers, unique `userId`, `channels` is currently exactly `['in-app']`.
- `content`: `title` ≤ 200 chars, `body` ≤ 10,000 chars, `actionUrl` optional relative Portal path.

## Result

```ts
interface NotificationTriggerResult {
  readonly notificationId: string;
  readonly status: 'queued';
  readonly deliveries: readonly { readonly id: string; readonly channel: 'in-app'; readonly status: 'queued' }[];
}
```

Trigger returns immediately with `status: 'queued'`; sending is performed asynchronously by the queue. Each delivery transitions independently (queued → sending → accepted / delivered, failure paths failed / submission_unknown); the inbox item becomes visible after delivered/accepted.

No idempotency: repeating the same `source.referenceId` creates another notification (dedup is a future slice).

## Validation errors

Validation failures throw `NotificationModuleError` with an error code:

| Code | Meaning |
| --- | --- |
| `NOTIFICATION_TRIGGER_INVALID` | `source.type` missing; targets empty or more than 1000. |
| `NOTIFICATION_CONTENT_INVALID` | `title` / `body` missing; `title` > 200 chars; `body` > 10,000 chars. |
| `NOTIFICATION_RECIPIENT_INVALID` | `target.userId` missing or duplicate; `channels` not exactly `['in-app']`. |
| `NOTIFICATION_ACTION_URL_INVALID` | `actionUrl` not a relative Portal path (must start with `/` and not with `//`). |

## Example

```ts
const result = await notificationService.trigger({
  principalService: 'workflow',
  source: { type: 'workflow.order.created', referenceId: '1001' },
  targets: [{ userId: 'u_001', channels: ['in-app'] }],
  content: { title: '订单已创建', body: '您的订单 1001 已创建', actionUrl: '/orders/1001' },
});
```

## Future slices

- Idempotent dedup on `source.referenceId`.
- Audit query API grouped by `source.type` / `source.referenceId`.
- External HTTP triggering revisited once identity/ACL module lands.
