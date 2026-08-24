# @nocobase/app-plugin-data-provider

Client-only App plugin that registers the NocoBase Refine `dataProvider`.

The implementation currently reuses `@nocobase/portal-sdk/data`. This package
owns only the App client bootstrap integration; it does not manage database
connections, schemas, or server-side data sources.

Register the plugin in an application package:

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-data-provider": {
        "enabled": true
      }
    }
  },
  "devDependencies": {
    "@nocobase/app-plugin-data-provider": "workspace:^"
  }
}
```

At startup, `client/bootstrap.ts` registers the provider through the
plugin-scoped Refine registry:

```ts
refine.setDataProvider(dataProvider);
```
