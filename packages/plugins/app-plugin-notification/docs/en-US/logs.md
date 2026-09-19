---
title: 'Notification logs'
description: 'Query NocoBase Notification Delivery logs and Provider Attempts to inspect delivery status.'
keywords: 'NocoBase,notification logs,Delivery,Attempt,Provider'
---

# Notification logs

`NotificationManager` stores Notification, Delivery, and Provider Attempt records. You can query them through `manager.logs`, or mount `manager.router` under an authenticated application route and use the logs API.

## View delivery status

Notification summary statuses include:

| Status       | Meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `pending`    | All Deliveries are still waiting to run.                                                                |
| `processing` | At least one Delivery has started processing, or is waiting to run, preparing, submitting, or retrying. |
| `completed`  | All Deliveries have been accepted by their Providers.                                                   |
| `partial`    | Among the completed Deliveries, some succeeded and some failed.                                         |
| `failed`     | All Deliveries failed and none is waiting for a retry.                                                  |
| `unknown`    | The result of at least one Provider submission could not be confirmed.                                  |

Deliveries can also have the following statuses:

- `preparing` — validating the recipient and generating the Provider message
- `submitting` — calling the Provider
- `accepted` — the Provider accepted the submission request
- `failed` — delivery failed; if `nextRunAt` exists, it will be retried after that time
- `unknown` — the Provider may already have accepted the message, so it is not retried automatically

`accepted` does not mean that the end user has read the message, and it does not guarantee that the Provider will ultimately deliver it. When a Delivery is `unknown`, check the Provider's records first. Every manual retry must include a reason; if the Provider still supports idempotency, the retry can be safe. Otherwise, calling `retryDelivery()` means accepting the risk of duplicate delivery, and the reason should record the basis for that judgment and the business decision.

## View Attempts

Every Provider call creates one Attempt containing:

- Attempt sequence number
- Provider `name` and `type`
- Attempt status
- Error information

Delivery represents the current delivery result, while Attempt preserves the history of each Provider call.

## Query from the server

Business code can query notification logs directly:

```ts
const recent = await notification.logs.listDetails();
const details = await notification.logs.get(notificationId);
```

`listDetails()` returns Notification, Delivery, and Attempt records. `get()` queries one complete record by Notification ID.

## Mount the logs API

`manager.router` provides these routes:

- `GET /logs`
- `GET /logs/:id`

The router does not add host authentication. Add an authentication middleware outside it when mounting it; see [Manually integrate notifications](./integration.md) for the complete integration.

Log responses do not return message bodies, recipient snapshots, `leaseToken`, or `leaseExpiresAt`. Provider names, statuses, timestamps, and error information are retained for delivery diagnosis.

## Hub settings page

When the plugin's Client contribution is enabled, the notification logs page is registered in the Hub Settings Center through the Settings Route Contribution in `client/routes.ts`:

- Page path: `/hub/settings/notifications/logs`
- Permission resource: `page:notification.logs`
- Permission action: `access`

The Settings Contribution and `GET /api/notifications/logs` use the same permission resource. The Settings Center checks the permission before loading the page, and the server also rejects requests without access.

The logs API uses a stable structured error response: clients can use `error.code` for branching, while `error.message` is generated in the request language; `error.ns`, `error.key`, and the optional `error.params` let a client translate the message again. A request without page permission returns `NOTIFICATION_LOGS_FORBIDDEN`; a missing log returns `NOTIFICATION_LOG_NOT_FOUND`.

The **Send test notification** action in the top-right corner lists the currently enabled notification methods. When only one Provider exists, the option uses a user-facing label such as **In-app (built-in)** instead of internal identifiers such as `default` or `database`; when a Channel has multiple Providers, configuration names are shown to distinguish them. For in-app messages, you can enter a recipient user ID or leave it empty to send to the current user. Email tests require a recipient address. IM tests are sent to the group associated with the selected Webhook and do not need another recipient. After you click **Send** at the bottom of the dialog, the page calls the core plugin's test API, sends a real message through the normal `NotificationManager`, and refreshes the logs automatically.

The **Send test notification** action is always visible. The target API returns only safe Channel, Provider, and form-field metadata; if no Provider is available or loading targets fails, the dialog displays the specific status. The server checks the `notification:test` `send` permission only when a test message is submitted.

## Optional application-owned page

The `logs-ui` Registry item published by `@nocobase/app-plugin-notification` remains available as a copyable `NotificationLogsPage` for applications that need to maintain the page styling entirely themselves. Its canonical source is `packages/plugins/app-plugin-notification/registry/logs-ui`. The default Hub logs page is provided directly by the plugin's Settings Contribution, so you do not need to install this Registry item.

## Related links

- [Notification overview](./overview.md) — understand Notification, Delivery, and Attempt
- [Manually integrate notifications](./integration.md) — mount an authenticated logs API
- [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md) — configure Providers for Email and IM Channels
- [Send notifications](./sending.md) — send messages from server-side business code
