# Trigger interface

`NotificationService.trigger()` is the internal calling surface for other services (business modules, workflow, etc.) to create notifications. There is no external HTTP surface in the current scope: `POST /api/notifications/trigger` returns `403 HTTP_TRIGGER_DISABLED` and is out of scope until identity/ACL lands (see [server-integration.md](server-integration.md)).

## Input

```ts
interface NotificationTriggerInput {
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly targets: readonly (
    | { readonly kind?: 'user'; readonly userId: string; readonly channels: readonly ('in-app' | 'email')[]; readonly variables?: Record<string, unknown> }
    | { readonly kind: 'email'; readonly address: string; readonly variables?: Record<string, unknown> }
  )[];
  readonly message:
    | { readonly kind: 'content'; readonly content: {
        readonly title?: string; readonly body?: string; readonly actionUrl?: string;
        readonly email?: { readonly subject: string; readonly text: string; readonly html?: string };
      } }
    | { readonly kind: 'template'; readonly templateKey: string; readonly variables?: Record<string, unknown> };
}

interface NotificationSystemPrincipal {
  readonly kind: 'service';
  readonly serviceId: string;
}
```

- `principal`: trusted in-process caller identity, required as a separate first argument. The Host creates it; browser callers and business input cannot choose it.
- `source.type`: business event type, required. It should carry the triggering service namespace, e.g. `workflow.order.created`; `source.referenceId` is the business reference (order number). Together they answer "which service, for which business event" and are the audit attribution dimension.
- `targets`: 1-1000 explicit receivers and at most 2000 expanded Deliveries. User targets choose unique In-app/Email Channels; the host resolves user Email addresses before persistence. Direct Email targets never create Inbox items.
- `message`: direct content and a developer-owned template are mutually exclusive. Template `variables` are common to the notification; target `variables` are validated and rendered per recipient. Every recipient is rendered before persistence, so one invalid recipient rejects the whole trigger.
- Direct In-app content has `title` ≤ 200 chars, `body` ≤ 10,000 chars, and an optional relative `actionUrl`; Email requires a single-line `subject` and `text`, with optional bounded `html`.
- Templates are registered in code. Their key/version and SHA-256 content hash are copied into each immutable Delivery snapshot; workers and retries never rerender.

Register the resulting `NotificationTemplateRegistry` through `createApp({ notificationTemplates })` or pass it directly to `createNotificationModule({ templates })`. There is intentionally no template database or CRUD API.

## Result

```ts
interface NotificationTriggerResult {
  readonly notificationId: string;
  readonly status: 'queued';
  readonly deliveries: readonly { readonly id: string; readonly channel: 'in-app' | 'email'; readonly status: 'queued' }[];
}
```

Trigger returns immediately with `status: 'queued'`; sending is performed asynchronously by the queue. Each delivery transitions independently (queued → sending → accepted / delivered, failure paths failed / submission_unknown); the inbox item becomes visible after delivered/accepted.

No idempotency: repeating the same `source.referenceId` creates another notification (dedup is a future slice).

## Validation errors

Validation failures throw `NotificationModuleError` with an error code:

| Code | Meaning |
| --- | --- |
| `NOTIFICATION_PRINCIPAL_INVALID` | The Host-created service principal is absent or invalid. |
| `NOTIFICATION_TRIGGER_INVALID` | `source.type` missing; targets empty or more than 1000. |
| `NOTIFICATION_CONTENT_INVALID` | `title` / `body` missing; `title` > 200 chars; `body` > 10,000 chars. |
| `NOTIFICATION_RECIPIENT_INVALID` | Missing/duplicate user/channel, invalid or duplicate normalized Email address, or unresolved user Email. |
| `NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE` | Email was requested but no enabled Provider Instance is configured. |
| `NOTIFICATION_ACTION_URL_INVALID` | `actionUrl` not a relative Portal path (must start with `/` and not with `//`). |
| `NOTIFICATION_TEMPLATE_INVALID` | The requested developer template is not registered. |

## Example

```ts
const result = await notificationService.trigger({
  kind: 'service',
  serviceId: 'workflow',
}, {
  source: { type: 'workflow.order.created', referenceId: '1001' },
  targets: [{ userId: 'u_001', channels: ['in-app'] }],
  message: { kind: 'content', content: { title: '订单已创建', body: '您的订单 1001 已创建', actionUrl: '/orders/1001' } },
});
```

## Future slices

- Idempotent dedup on `source.referenceId`.
- Audit query API grouped by `source.type` / `source.referenceId`.
- External HTTP triggering revisited once identity/ACL module lands.
