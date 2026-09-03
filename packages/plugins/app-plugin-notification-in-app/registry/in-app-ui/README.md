# NocoBase In-app Notification UI

This Registry item provides an application-owned personal inbox, unread-count
runtime Provider, and client API adapter. It calls the authenticated
`/api/notifications/in-app` routes exposed by
`@nocobase/app-plugin-notification-in-app`.

The item currently has no `extension.ts` because the notification plugins do
not yet expose stable client route and Provider contribution contracts. After
installation, ensure the Registry dependencies (`alert`, `badge`, `button`,
and `card`) and declared npm dependencies were installed. The low-level
`registry:materialize` command only copies source and does not install them.
Then wrap the required application subtree with
`NotificationInAppProvider` and wire `NotificationInAppPage` into an
application-owned route.

Installed source belongs to the application. Review future recipe updates with
a three-way merge instead of overwriting local changes.
