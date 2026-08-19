# Queue integration

Notification uses the shared `NocoBaseQueueManager`. `NotificationDeliveryJob` carries only `{ deliveryId }`; workers reload current persisted state and no-op when a duplicate or late Job no longer applies.

The Dispatcher claims a queued Delivery with a version check, creates an Attempt and `queued → sending` StatusEvent in the same transaction, and owns a bounded lease. Terminal and retry transitions update the Attempt, append a StatusEvent, recompute the Notification summary, expose eligible Inbox items, and clear the lease.

Queue publication is only a wake-up. If publication fails after the trigger or manual retry commits, the Delivery remains queued. The Reconciler runs at startup and periodically, republishes due queued Deliveries, and examines expired sending leases. Work that never began provider invocation is safely returned to queued; work that may have crossed the provider boundary becomes `submission_unknown` and requires an explicit risk acknowledgement before manual retry.

Shutdown order is Portal Live drain, Notification scheduling stop, shared Queue worker drain, Reconciler/provider close under the shared deadline, then cache/logger/session and finally the Runtime-owned database. Notification never destroys the shared QueueManager or DatabaseManager.

```ts
const module = createNotificationModule({
  database,
  queueManager,
  logger,
});

await module.start();
module.beginShutdown();
await queueManager.close();
await module.close({ deadlineAt: Date.now() + 10_000 });
```
