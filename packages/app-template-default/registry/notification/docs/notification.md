# Notification model

Notification 3.0 treats the database as the source of truth. A `Notification` records one trigger, each expanded recipient/channel becomes a `Delivery`, and an authenticated user sees a visible `UserNotificationItem` only after the associated Delivery reaches `accepted` or `delivered`.

The supported phase-one channels are `in-app` and `email`. Internal services call `NotificationService.trigger()` with an explicit service principal, source, targets, and either direct content or a registered template. One trigger atomically persists the Notification, queued Deliveries, and Inbox placeholders before queue wake-ups are published.

The Inbox API derives the user from the Portal session. It supports channel/unread filters, stable cursor pagination, unread count, optimistic-CAS read/unread/delete, and transactional read-all. Delete is irreversible through the public API. The header bell and Inbox page always reconcile over HTTP; Portal Live events only request a refresh.

Phase one deliberately excludes external HTTP triggering, arbitrary recipients selected by a client, editable runtime templates, provider secret administration, delivery cancellation, bounce/webhook processing, and a general real-time event platform. Each exclusion can be removed only after its owning identity, authorization, configuration, or provider-ingress contract exists.
