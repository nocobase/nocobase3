# @nocobase/app-plugin-notification-provider

Client-only App plugin that connects Refine notifications to Sonner.

The plugin has three independent client contributions:

- `client/bootstrap.ts` registers `refine.setNotificationProvider(...)`.
- `client/providers.ts` mounts the global Sonner notification host.
- `client/routes.ts` exposes a lazy notification test page at
  `/notification-provider`.

Undoable mutation notifications are rendered by the plugin itself and do not
depend on the application's archived `client-old` tree or on Refine context.

Register the plugin in an application package:

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-notification-provider": {
        "enabled": true
      }
    }
  },
  "devDependencies": {
    "@nocobase/app-plugin-notification-provider": "workspace:^"
  }
}
```

With the default App base path, open `/main/notification-provider` after
signing in. The page can trigger success, error, and undoable notifications.
