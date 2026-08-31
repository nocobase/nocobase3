# Notification Concepts

## Package ownership

| Package                                       | Responsibility                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@nocobase/app-plugin-notification`           | Manager, registry, persistent Notification/Delivery/Attempt records, queue job, reconciler, logs, and protected logs UI/API |
| `@nocobase/app-plugin-notification-in-app`    | `in-app` Channel, database Provider, personal inbox store/API, and optional Registry UI                                     |
| `@nocobase/app-plugin-notification-providers` | `email` and `im` Channels; SMTP, Resend, Feishu, and DingTalk Provider definitions; protected Provider test API             |
| `@nocobase/app-plugin-notification-provider`  | Browser toast adapter for Refine; not durable server delivery                                                               |

The application owns which packages are installed, plugin ordering, configuration, secret loading, user-address resolution, and business send calls. Use the shared Application container and `notificationServiceToken`; do not create a parallel manager inside a business module.

## Delivery model

One `send()` creates one Notification. Each resolved recipient/Channel/Provider target creates an independent Delivery. Each actual Provider submission creates an Attempt.

```text
Notification
├── Delivery: user-1 / in-app / primary
├── Delivery: alice@example.com / email / smtp
├── Delivery: ops / im / feishu
└── Delivery: ops / im / dingtalk
```

The Channel owns recipient resolution, common-content rendering, and preparation. The Provider owns one external submission and returns `accepted`, `failed`, or `submission_unknown`.

## Recipient and Channel compatibility

- `in-app` accepts `{ type: 'user', id }`.
- `email` accepts `{ type: 'email', address }`; it can accept `user` only when the Channel definition has a user-to-email resolver.
- `im` accepts `{ type: 'target', id }`; it can accept `user` only when the Channel definition has a user-to-target resolver.
- `phone` is part of the core recipient union but no built-in Channel currently consumes it.

An unsupported recipient creates a failed Delivery for that recipient/Channel target; compatible targets in the same Notification may continue.

## Provider routing

Provider names are unique within a Channel. The default `single` strategy uses the first enabled Provider. A named single route selects `routing.<channel>.providers.provider`. The `all` strategy creates one Delivery for every enabled or explicitly listed Provider name.

Provider failure in `single` mode does not fail over to another Provider. Names and types are persisted on Deliveries and must remain stable while work is pending.

## Status model

Notification status summarizes its Deliveries:

| Status       | Meaning                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| `pending`    | All Deliveries are waiting to run                                             |
| `processing` | At least one Delivery is preparing, submitting, pending, or waiting for retry |
| `completed`  | Every Delivery was accepted by its Provider                                   |
| `partial`    | Terminal Deliveries include both accepted and failed results                  |
| `failed`     | Every Delivery failed with no scheduled retry                                 |
| `unknown`    | At least one Provider submission may have happened but confirmation was lost  |

Delivery adds `preparing`, `submitting`, and `accepted`. A failed Delivery with `nextRunAt` remains processing and is eligible for reconciliation. `accepted` means the Provider accepted submission; it does not prove final delivery or user read. `unknown` suppresses automatic retry because a retry may duplicate a message.

## Persistence and recovery

The manager persists work before dispatching the queue job. If queue dispatch fails, the reconciler can enqueue ready Deliveries later. Leases protect concurrent workers. An expired lease during preparation returns the Delivery to pending; an expired lease during submission becomes unknown because the external effect cannot be proven absent.

Use Notification, Delivery, and Attempt records as the audit trail. Preserve them during diagnosis and recovery.
