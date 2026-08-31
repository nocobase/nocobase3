# @nocobase/app-plugin-notification-provider

Client-only App plugin that connects Refine notifications to Sonner.

The plugin has three independent client contributions:

- `client/service-provider.ts` registers `refine.setNotificationProvider(...)`.
- `client/react-providers.ts` mounts the global Sonner notification host.
- `client/routes.ts` can expose a lazy notification test page at
  `/notification-provider` when `enableDemoRoute: true` is passed explicitly.

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

The default registration does not expose the demonstration route. A development
App may opt in explicitly:

```ts
notificationProvider({ enableDemoRoute: true });
```

With the default App base path, the page is then available at
`/main/notification-provider` after signing in. It can trigger success, error,
and undoable notifications and should not be enabled in production.
