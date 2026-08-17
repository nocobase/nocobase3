# Default Template migrations

This guide describes source changes that derived Portal applications must merge
from new releases of `@nocobase/portal-template-default`. Updating
`nocobase.defaultTemplateVersion` records a completed source upgrade; changing
the value alone does not apply template changes.

## Upgrade checklist

1. Commit or back up application-owned changes.
2. Review every skipped template release below and plan how its source changes
   fit the application.
3. Merge template runtime and composition changes without overwriting business
   pages, translations, or customized installed extensions.
4. Update `nocobase.defaultTemplateVersion` only after the corresponding source
   changes have been incorporated.
5. Update `@nocobase/portal-sdk` when the release requires a new compatible SDK.
6. Run `pnpm sdk:check`, install dependencies, build, and verify direct URLs,
   nested route surfaces, authentication, ACL, and locale switching.

## Default Template 3.0

Template 3 uses the Portal SDK 2 route contract. Read the
[Portal SDK migration guide](../portal-sdk/MIGRATION.md) when upgrading Registry
extensions or other code that consumes SDK routing APIs.

### Lazy-load application pages

Migrate application-owned page routes as part of the Template 3 source merge,
not only Registry extension routes. Keep route, resource, menu, and access
metadata synchronous in `src/routes.tsx`, but remove eager business-page imports
and load their renderers through `lazy`:

```tsx
{
  name: "customers",
  path: "/customers",
  resource: { meta: { label: "Customers" } },
  lazy: () =>
    import("./pages/customers").then((module) => ({
      default: module.CustomersPage,
    })),
}
```

When a route needs resource/action ACL, route params, or contextual composition,
put that boundary in a small default-exported route component and lazy-load the
component. Do not keep the business page eagerly imported in `src/routes.tsx`
only to wrap it. `element` and `lazy` are mutually exclusive. Lightweight
redirects, outlets, and inline layouts may continue to use `element`.

### Keep loading feedback inside its surface

The Template 3 host leaves the shared route `lazyFallback` empty. A visible
global fallback is rendered at the active `<Outlet />`; for a lazy drawer or
dialog child route, that places a page-level loading indicator under the parent
page before the overlay opens.

Put meaningful loading UI inside the loaded page or route surface instead,
where it can use the correct page, drawer, dialog, or region presentation.
