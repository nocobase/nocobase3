---
title: 'Notification overview'
description: 'Understand NocoBase in-app, email, and IM Webhook delivery and Delivery logs.'
keywords: 'NocoBase,notifications,in-app,email,Feishu,DingTalk,Notification'
---

# Notification overview

NocoBase notifications send in-app messages, emails, or IM Webhook messages to users and record the status of every delivery. The notification packages provide the runtime and extension points. The default template creates `NotificationManager` in the core plugin bootstrap, and the Provider plugin bootstrap then registers the built-in Email and IM definitions; other hosts can complete the same integration manually.

The related notification plugins currently provide three built-in Channel implementations:

- `in-app` — writes messages to a user's in-app inbox
- `email` — sends email through SMTP or Resend
- `im` — sends messages through Feishu or DingTalk group-bot Webhooks

## How a notification is sent

A new `idempotencyKey` creates one Notification. Repeating an equivalent request with the same key returns the original Notification instead of creating another one. Each recipient—or each Channel and Provider combination for a Channel that does not need a recipient—creates an independent Delivery.

```text
Notification
├── Delivery: user-1 / in-app
├── Delivery: user-1 / email / smtp
├── Delivery: user-1 / im / feishu
└── Delivery: user-1 / im / dingtalk
```

Delivery stores the recipient, message, and selected Provider. When a Provider is actually called, the system records one Attempt for each submission. This lets you inspect both the result of the complete notification and the reason a particular Provider call failed.

## Current capabilities

- Send in-app messages, SMTP / Resend emails, and Feishu / DingTalk group messages
- Send one notification to multiple recipients and Channels
- Store Delivery and Provider Attempt logs
- Retry Provider calls that have clearly failed after a delay
- Recover tasks interrupted by a Worker through leases
- View a user's in-app messages, unread count, and read status

## Recipients and Provider identifiers

The `to` field in `NotificationManager.send()` describes the recipient, but it is not required by every Channel. The core package defines a shared recipient shape; each Channel decides whether it supports that shape and resolves it into an address or delivery data that a Provider can use. An IM Webhook Channel can omit `to` and use the selected Provider as the destination; Channels such as in-app and email still require `to`.

The fields are:

| Field                         | Example          | Purpose                                                                                                                   |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `channels[].type`             | `im`             | Identifies the Channel type and determines which notification path is used.                                               |
| `channels[].providers[].type` | `feishu-webhook` | Identifies the Provider implementation type. The system uses it to find and create the corresponding Provider definition. |
| `channels[].providers[].name` | `feishu`         | Identifies one Provider configuration within the current Channel. Sending routes use it to select the Provider.           |
| `to`                          | Optional         | The business recipient. Whether it can be omitted depends on the Channel; built-in IM Webhooks can omit it.               |

`name` and `type` are different fields: `name` is the configuration instance name, while `type` is the implementation type. `type` is not used by business code to select a Provider, but the application uses it at startup to match and create a Provider definition, and uses it to validate the Provider identity during Delivery retries. Sending only needs to route through `name`; `type` does not need to be passed to `send()`. Both `name` and `type` are stored in the Delivery and should remain stable when configuration changes or the application restarts.

Feishu and DingTalk Webhook Providers already represent an external group bot, so they do not need a business recipient. You can configure multiple Providers and route to one of them by its `name`, or use `strategy: 'all'` to send to multiple Providers at once. If a custom IM Channel supports user recipients, a resolver can map `{ type: 'user', id: '...' }` to an external address.

## Provider selection

Each Channel can have multiple enabled Providers. When a Delivery is created, the system stores the Provider's `name` and `type`; later execution and retries must match the same Provider.

If the matching Provider cannot be found after a restart, or the same `name` has been changed to another `type`, the Delivery fails and does not switch to another Provider.

:::warning Note

Provider routing uses the `single` strategy by default. A normal send selects the first enabled Provider in the Channel configuration. To select one explicitly, set the Provider `name` in `routing.<channel>.providers.provider`; Provider `name` values must be unique within a Channel, and `type` does not need to be passed.

Use `strategy: 'all'` only when you need to deliver to multiple Providers at the same time. Omitting `providers` selects all enabled Providers; you can also limit the selection with `providers: ['feishu', 'dingtalk']`. In `single` mode, a Provider failure does not automatically switch to another Provider.

:::

## Documentation map

- [Manually integrate notifications](./integration.md) — integrate migrations, the runtime, routes, and lifecycle
- [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md) — configure SMTP, Resend, Feishu, and DingTalk
- [Send notifications](./sending.md) — send messages from server-side business code
- [Notification logs](./logs.md) — inspect Delivery and Attempt records

## Related links

- [Manually integrate notifications](./integration.md) — create and mount the notification runtime
- [Configure notification Providers](../../../app-plugin-notification-providers/docs/en-US/configuration.md) — build Provider configuration for Email and IM Channels
- [Send notifications](./sending.md) — use `NotificationManager.send()`
- [Notification logs](./logs.md) — inspect Delivery and Attempt records
