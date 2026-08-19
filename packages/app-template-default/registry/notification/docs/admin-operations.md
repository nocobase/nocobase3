# Notification administration

The Portal exposes two authenticated operational pages at `/notifications`: **Delivery log** and **Providers**. This is an operational surface, not a template editor, manual-send tool, queue console, or provider configuration editor.

## Temporary authorization boundary

`TEMPORARY`: until the Notification `AuthorizationPolicy` is connected to the dedicated ACL module, every authenticated Portal user may list and inspect Deliveries, retry terminal Deliveries, inspect the redacted Provider projection, and test Provider connectivity. Both API responses and the UI display this boundary. Remove it when notification Operator/Admin capabilities are available.

Unauthenticated requests fail with `401`. Cookie-authenticated mutations use a same-origin double-submit token obtained from `GET /api/notifications/admin/csrf`; the token must be supplied in both the `notification_csrf` cookie and `x-csrf-token` header. A mismatched or cross-origin request fails with `403 NOTIFICATION_CSRF_INVALID`.

## Delivery log

`GET /api/notifications/admin/deliveries` accepts only `status`, `channel`, prefix `search`, `page`, and `pageSize` (maximum 100). Results use the stable order `updatedAt DESC, id DESC`. Recipient identifiers, normalized errors, and content are redacted: the detail response exposes immutable snapshot field names, byte lengths, schema version, message ID, and template key/version/hash, but never title, body, text, HTML, or a complete address.

`POST /api/notifications/admin/deliveries/:id/retry` requires `expectedVersion` and a 3–500 character `reason`. Only `failed` and `submission_unknown` are eligible. An uncertain submission additionally requires `acknowledgeDuplicateRisk: true`. The Store CAS changes the existing Delivery to `queued`, resets its Provider cursor, clears its previous error and lease, records actor/reason in a StatusEvent, and republishes a queue wake-up. Concurrent or stale requests return a stable `409` conflict and do not create duplicate state transitions.

## Providers

`GET /api/notifications/admin/providers` projects the ordered definitions from `registry/notification/config/providers.ts`. It returns instance ID, type, enabled/active state, host/port/security mode, secret reference names and configuration state, and the redacted configuration revision. Secret values are never retained in or returned by this DTO.

`POST /api/notifications/admin/providers/:id/test` invokes `checkConnection()`. SMTP therefore verifies connection, TLS policy, and authentication without calling `send()` and without creating a Notification, Delivery, or Attempt. The response contains a redacted success/failure result for the current operation.
