# Notification Concepts

A Channel is one configured name mapped to one Provider configuration. The Provider definition declares its globally unique identifier and message type. Message handlers share validation and preparation logic; they are not a second layer of named instances. Multiple Channels may use the same Provider with independent credentials and settings.

A Notification is one logical send identified by `idempotencyKey`. Each Channel and native recipient produces an independent Delivery. Each Provider submission creates an Attempt. All entries in `messages` execute; one failed delivery does not stop the others. The runtime preserves queues, timeouts, leases, automatic retries, manual retry audits, status queries, and realtime inbox invalidations.

`accepted` means the Provider accepted the submission, not that the recipient read it. Known transient failures can schedule a same-Provider retry. `retrying` means the next attempt is scheduled and `nextRunAt` records its earliest execution time. `failed` is a terminal known failure that may be manually retried. `unknown` means submission may have succeeded and must be checked with external Provider evidence before a new logical send. A retry remains bound to the original Channel name and Provider identifier. Removing, disabling, or changing that Provider prevents rerouting.

The core plugin owns delivery orchestration. `@nocobase/app-plugin-notification-providers` supplies SMTP, Resend, Feishu and DingTalk. `@nocobase/app-plugin-notification-in-app` supplies durable application-user inbox messages. Browser toast notifications are a separate capability.
