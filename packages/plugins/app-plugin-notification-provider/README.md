# @nocobase/app-plugin-notification-provider

Client-only App plugin that connects Refine notifications to the Base UI Toast component.

The plugin has three independent client contributions:

- `client/service-provider.ts` registers `refine.setNotificationProvider(...)`.
- `client/react-providers.ts` mounts the global Base UI Toast host.
- `client/routes.ts` exposes a lazy notification test page at
  `/notification-provider`.

Undoable mutation notifications are rendered by the plugin itself and do not
depend on the application's archived `client-old` tree or on Refine context.
The plugin owns the shadcn primitives it needs under `client/components/ui`.
Add more with `pnpm exec shadcn add <name>`, then retain explicit exported
types and relative `.js` imports required by this declaration-emitting ESM
package.

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

Applications that only need notifications can register `notificationProvider({ demo: false })` in `client/plugins.ts`. This omits the demo route while retaining the Refine notification provider and global Base UI Toast host. The same manager is exported from `@nocobase/app-plugin-notification-provider/client/toast` for application notifications outside Refine.
