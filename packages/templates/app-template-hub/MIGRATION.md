# Hub Template migrations

This guide describes source changes that derived Portal applications must merge
from new releases of `@nocobase/app-template-hub`. In a derived
application, `nocobase.defaultTemplateVersion` records a completed source
upgrade; changing the value alone does not apply template changes.

In this package the field means something different: it mirrors the package's
own `version`, and the release workflow keeps the two aligned through
`scripts/sync-template-version.mjs`. Do not edit it by hand here — a release
will overwrite it.

## System information plugin removed

`@nocobase/app-plugin-system-info` has been removed from the source workspace and template registrations. Remove its manifest entry and client/server registrations when upgrading a derived application, then reinstall dependencies and synchronize plugin Skills. The `/system-info` page and `/api/system-info` endpoint are no longer available.

## File plugin removed from template registration

The template no longer registers or directly depends on `@nocobase/app-plugin-file`. Its file inventory settings page and related API are no longer provided by default. When merging this update, remove the package from the manifest and both client/server plugin lists, then install dependencies and synchronize plugin Skills. This registration change does not delete stored files or database records. Independently registered file Repository capabilities remain unchanged.

## Remove duplicate plugin metadata

Remove `nocobase.plugins` from the application manifest after upgrading the CLI and template scripts together. Keep `templateKind` and `defaultTemplateVersion`. Client, Server, and CLI composition roots now determine registered plugins for bulk Skills synchronization and updates. Development watches read Server registrations; deployment packaging follows server imports. Registration still copies plugin Skills, and unregistration cleans up legacy metadata when present.

## Upgrade checklist

1. Commit or back up application-owned changes.
2. Review every skipped template release below and plan how its source changes
   fit the application.
3. Merge template runtime and composition changes without overwriting business
   pages, translations, or customized installed extensions.
4. Update `nocobase.defaultTemplateVersion` in the derived application only
   after the corresponding source changes have been incorporated.
5. Install dependencies, build, and verify direct URLs, nested route surfaces,
   authentication, ACL, and locale switching.

## Hub Template 3.0

Template 3 uses the Portal SDK 2 route contract. That SDK's routing APIs have
since been removed; upgrade Registry extensions and other consumers to the
route contract this template ships.

### Lazy-load application pages

Migrate application-owned page routes as part of the Template 3 source merge,
not only Registry extension routes. Keep route metadata synchronous in
`client/routes.ts`, but remove eager business-page imports and load their
renderers through `componentLoader`:

```ts
const routes = defineAppRoutes([
  {
    name: 'customers',
    path: '/customers',
    auth: 'required',
    componentLoader: () => import('./pages/customers.js'),
  },
]);
```

The loaded module must default-export its page component. Keep route placement,
authentication boundaries, loading, and error presentation in `client/routing/`;
do not add product routes there. Plugin-owned routes continue to be declared by
the plugin and may be customized by the application through
`client/extensions/*/extension.ts` or `client/route-overrides.ts`.

### Keep loading feedback inside its surface

The Template 3 host leaves the shared route `lazyFallback` empty. A visible
global fallback is rendered at the active `<Outlet />`; for a lazy drawer or
dialog child route, that places a page-level loading indicator under the parent
page before the overlay opens.

Put meaningful loading UI inside the loaded page or route surface instead,
where it can use the correct page, drawer, dialog, or region presentation.

## Database connections

New applications keep database source under `database/<connectionName>/{migrations,seeds}`. The default connection is also the system/plugin database. Existing top-level task configuration and old directories remain compatible; no automatic source move occurs. See [migration and seed upgrade rules](skills/nocobase-app-development/references/migrations.md#existing-applications) before moving existing files. Use `pnpm migrate --connection <name>` or `--all` to select managed connections explicitly.
