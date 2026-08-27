# NocoBase Notification

Notification registry components are grouped by product feature:

- `logs/` renders Delivery state and sequential Provider Attempts.
- `in-app/` renders the current user's message center and unread count.
- `extension.tsx` contributes the menu and routes.

The Registry item is optional application source. It expects authenticated
notification APIs at `/api/notifications/logs` and
`/api/notifications/in-app`; it does not create or configure the server
runtime.

The registry contains application-owned client pages only. Notification
orchestration, storage, Channel factories, the Realtime client Provider, and
the data client remain in `@nocobase/app-plugin-notification-in-app`.
