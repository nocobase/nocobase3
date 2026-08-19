# Notification HTTP API

> Generated from `server/http-contracts.ts`. Run the generator after changing a route contract.

## POST /api/notifications/trigger

Disabled external notification trigger

Authentication: disabled. CSRF: not required.

Response example:

```json
{
  "code": "HTTP_TRIGGER_DISABLED"
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 403 | HTTP_TRIGGER_DISABLED | HTTP triggering is intentionally unavailable in phase one. |

## GET /api/notifications/inbox/csrf

Issue an Inbox CSRF token

Authentication: session. CSRF: not required.

Response example:

```json
{
  "token": "8a72e20e-…"
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_INBOX_UNAUTHENTICATED | The request has no authenticated Portal session. |

## GET /api/notifications/inbox

List the current user Inbox

Authentication: session. CSRF: not required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| channel | query | string | no | Optional in-app or email filter. |
| unreadOnly | query | boolean | no | Return unread items only. |
| limit | query | integer | no | Page size from 1 to 100. |
| cursor | query | string | no | Opaque stable cursor from nextCursor. |

Response example:

```json
{
  "itemId": "item-1",
  "itemTitle": "Order ready",
  "nextCursor": "eyJjcmVhdGVkQXQiOi…"
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_INBOX_UNAUTHENTICATED | The request has no authenticated Portal session. |
| 400 | NOTIFICATION_INBOX_QUERY_INVALID | A filter, page size, or cursor is invalid. |

## GET /api/notifications/inbox/unread-count

Count unread Inbox items

Authentication: session. CSRF: not required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| channel | query | string | no | Optional in-app or email filter. |

Response example:

```json
{
  "count": 3
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_INBOX_UNAUTHENTICATED | The request has no authenticated Portal session. |

## POST /api/notifications/inbox/{itemId}

Read, unread, or delete one Inbox item

Authentication: session. CSRF: required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| itemId | path | string | yes | Inbox item ID. |
| action | body | string | yes | read, unread, or delete. |
| expectedVersion | body | integer | yes | Optimistic concurrency version. |

Request example:

```json
{
  "action": "read",
  "expectedVersion": 2
}
```

Response example:

```json
{
  "id": "item-1",
  "version": 3
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_INBOX_UNAUTHENTICATED | The request has no authenticated Portal session. |
| 403 | NOTIFICATION_CSRF_INVALID | The same-origin double-submit CSRF token is absent or invalid. |
| 404 | NOTIFICATION_INBOX_ITEM_NOT_FOUND | The item is absent or belongs to another user. |
| 409 | NOTIFICATION_INBOX_CONFLICT | The item version changed. |

## POST /api/notifications/inbox/read-all

Mark the current Inbox read

Authentication: session. CSRF: required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| channel | body | string | no | Optional in-app or email filter. |

Request example:

```json
{
  "channel": "in-app"
}
```

Response example:

```json
{
  "updated": 12
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_INBOX_UNAUTHENTICATED | The request has no authenticated Portal session. |
| 403 | NOTIFICATION_CSRF_INVALID | The same-origin double-submit CSRF token is absent or invalid. |

## GET /api/notifications/admin/deliveries

List redacted Delivery summaries

Authentication: session. CSRF: not required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| status | query | string | no | Delivery status filter. |
| channel | query | string | no | Delivery channel filter. |
| search | query | string | no | Prefix search, at most 200 characters. |
| page | query | integer | no | One-based page. |
| pageSize | query | integer | no | Page size from 1 to 100. |

Response example:

```json
{
  "deliveryId": "delivery-1",
  "status": "failed",
  "total": 1
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_ADMIN_UNAUTHENTICATED | The request has no authenticated Portal session. |

## POST /api/notifications/admin/deliveries/{deliveryId}/retry

Manually retry a terminal Delivery

Authentication: session. CSRF: required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| deliveryId | path | string | yes | Delivery ID. |
| expectedVersion | body | integer | yes | Optimistic concurrency version. |
| reason | body | string | yes | Operator audit reason. |
| acknowledgeDuplicateRisk | body | boolean | no | Required for submission_unknown. |

Request example:

```json
{
  "expectedVersion": 4,
  "reason": "Provider recovered",
  "acknowledgeDuplicateRisk": true
}
```

Response example:

```json
{
  "id": "delivery-1",
  "status": "queued",
  "version": 5
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_ADMIN_UNAUTHENTICATED | The request has no authenticated Portal session. |
| 403 | NOTIFICATION_CSRF_INVALID | The same-origin double-submit CSRF token is absent or invalid. |
| 409 | NOTIFICATION_DELIVERY_CONFLICT | The status or version changed. |

## GET /api/notifications/admin/providers

List redacted provider configuration

Authentication: session. CSRF: not required.

Response example:

```json
{
  "providerId": "email/smtp/primary",
  "enabled": true
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_ADMIN_UNAUTHENTICATED | The request has no authenticated Portal session. |

## POST /api/notifications/admin/providers/{providerId}/test

Test provider connectivity without sending

Authentication: session. CSRF: required.

| Field | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| providerId | path | string | yes | Provider instance ID. |

Request example:

```json
{}
```

Response example:

```json
{
  "providerId": "email/smtp/primary",
  "ok": true
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | NOTIFICATION_ADMIN_UNAUTHENTICATED | The request has no authenticated Portal session. |
| 403 | NOTIFICATION_CSRF_INVALID | The same-origin double-submit CSRF token is absent or invalid. |
