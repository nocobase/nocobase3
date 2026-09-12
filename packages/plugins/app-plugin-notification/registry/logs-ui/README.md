# NocoBase Notification Logs UI

This Registry item provides application-owned delivery and Provider attempt
log source. It calls the authenticated `/api/notifications/logs` route exposed
by `@nocobase/app-plugin-notification`.

The item currently has no `extension.ts` because the plugin does not yet expose
a stable client route contract. After installation, import
`NotificationLogsPage` from this item's `index.ts` and wire it into an
application-owned route. Add a source extension only after the plugin provides
a default client route that can be overridden by ID.

Installed source belongs to the application. Review future recipe updates with
a three-way merge instead of overwriting local changes.
