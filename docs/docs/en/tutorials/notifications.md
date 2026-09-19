---
title: '5. Send notifications'
description: 'Deliver approval results to the applicant through a real workflow.'
---

# 5. Send notifications

Notify the applicant when an order is approved or rejected. Start with in-app notifications, so the exercise does not need real email or messaging credentials. The notification should link to that order.

## Goal and starting point

The previous chapter can submit, approve, and reject an order and trigger its result workflow. Connect a notification to that real event: the correct applicant receives it, its link opens the right order, and repeated processing does not send duplicates.

## What a notification needs

| Information        | Source in this example                                |
| ------------------ | ----------------------------------------------------- |
| When to send       | After the supervisor's decision is saved              |
| Recipient          | The order's applicant, `ownerId`                      |
| Content            | Approval or rejection plus the order number           |
| Destination        | The order's detail URL                                |
| Duplicate identity | A stable combination of order ID and decision version |

An in-app notification remains available for the user to open later. A temporary save-success toast only acknowledges the current action. Administrators inspect delivery records; applicants read their own inboxes.

## Enable the in-app channel

Merge this configuration into `config.yml`, preserving other settings:

```yaml
notification:
  channels:
    - type: in-app
      enabled: true
      providers:
        - type: database
          name: default
```

Check that notification, in-app notification, and notification provider plugins are registered. Use the application's `plugin:inspect` command when needed. Restart after configuration changes and check the effective channel. Configure the channel in `config.yml`; `config.example.yml` is only a reference.

## Connect the result workflow

```text
Read the Notification and In-app Notification Skills. Extend the tutorial-order-result Run script.

Read the actual order using orderId and version. Send only for approved or rejected states. Use ownerId as the recipient, a decision title, the order number as the body, and /tutorial-orders/<orderID> as actionUrl.

Resolve the registered notificationServiceToken through options.services and call send(). Do not insert inbox rows or call a Provider directly. Use channels ['in-app'], source.type tutorial-order, and the order ID as source.referenceId.

Use tutorial-order:<orderID>:decision:<version> as idempotencyKey. Repeated execution of the same event must not create a second notification.

Add a production App route /tutorial-inbox with a My notifications menu. Reuse the plugin's public Provider, Inbox components, and i18n namespace. Grant access to salespeople and supervisors; do not rely on the development-only /dev/notification-in-app route.

Check real approval delivery, recipient isolation, repeated dispatch, and unavailable services. Notification failure must not undo a persisted approval.
```

Resolve the service with `options.services.resolve(notificationServiceToken)`. After validating and reading the order ID, revision, and decision, the send call has this shape:

```ts
await notification.send({
  idempotencyKey: `tutorial-order:${order.id}:decision:${order.version}`,
  source: { type: 'tutorial-order', referenceId: order.id },
  to: { type: 'user', id: order.ownerId },
  channels: ['in-app'],
  content: {
    title: order.status === 'approved' ? 'Order approved' : 'Order rejected',
    body: order.number,
    actionUrl: `/tutorial-orders/${order.id}`,
  },
});
```

After changing a workflow, check and enable the deployed current version before testing a new order.

## Inspect the real notification

1. Create and submit a new order as a salesperson.
2. Decide as the supervisor.
3. Return to the applicant account and open My notifications.
4. Check the order number, follow its link, and refresh the detail page.
5. Sign in as salesperson B and confirm that A's notification is not visible.

![The applicant receives an order decision in My notifications; Chinese interface](https://static-docs.nocobase.com/nb3-docs-20260916-tutorial-inbox.png)

Administrators can also inspect Settings → Notifications → Notification logs. Check the overall status, channel, delivery attempts, error, and next retry time. A successful workflow does not necessarily mean the final delivery succeeded. `completed` does not mean the recipient has read the message.

## Check duplicates and failures

Dispatch the same decision again as the supervisor. The event should still have one notification. The workflow `eventKey` deduplicates acceptance; the notification `idempotencyKey` deduplicates creation. Keep both.

If no notification exists, check workflow enablement, acceptance, and Run errors. For a long-lived `pending` or `processing` state, inspect queues and workers. `unknown` means the external result is uncertain, not that nothing was sent.

Add email or messaging later with the appropriate channel, provider, and recipient resolver. External channels send real messages, so validate with an identified test destination first. This tutorial uses in-app notifications.

Next: [Deploy](./deploy).
