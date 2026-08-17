# @nocobase/portal-sdk

Stable, upgradeable runtime APIs for applications based on the NocoBase
Default Portal Template. Application composition, pages, visual components,
themes, and Registry implementations remain owned by the template project.

Use documented package exports only. Imports from `src/` are not public API.

## Public entry points

- `@nocobase/portal-sdk/runtime` — Portal base, API URL, callback, and settings URL resolution.
- `@nocobase/portal-sdk/client` — authenticated NocoBase client, session storage, and HTTP errors.
- `@nocobase/portal-sdk/auth` — Refine authentication provider, callback capture, authenticator types, and headless hooks.
- `@nocobase/portal-sdk/data` — NocoBase Refine data provider.
- `@nocobase/portal-sdk/acl` — ACL store, evaluator, record permissions, hooks, and access-control provider.
- `@nocobase/portal-sdk/routing` — application route definitions, Refine resource compilation, and route-surface lifecycle state.
- `@nocobase/portal-sdk/extensions` — stable `AppExtension` ABI and pure contribution collection.
- `@nocobase/portal-sdk/i18n` — translation registration, configurable i18next runtime, locale state, and Refine adapter.
- `@nocobase/portal-sdk/system-settings` — cached System Settings access, context, and hooks.
- `@nocobase/portal-sdk/vite` — build compatibility and raw Portal HTML plugins.

## Lazy application routes

`defineAppRoutes` keeps route, Refine resource, navigation, and role metadata in
one synchronous definition while allowing the rendered page to load on demand:

```tsx
export const appRoutes = defineAppRoutes([
  {
    name: "customers",
    path: "/customers",
    resource: { meta: { label: "Customers" } },
    lazy: () => import("./pages/customers"),
  },
]);
```

The imported module must default-export a component. `renderAppRoutes` applies
the host-provided loading fallback and existing access guard without loading
the page module for unvisited routes or routes denied by that guard. A route may
declare either `element` or `lazy`, not both.

`AppExtension.routes` and `AppExtension.dev.routes` use this same definition
format. Registry extensions declare route metadata and lazy page modules only;
the application and development hosts own route rendering and loading UI.

## Workspace development

The workspace manifest resolves public SDK entry points directly from `src/`,
so the Portal Template's Vite process compiles and watches SDK changes without a
separate SDK watcher. During `pnpm pack` and `pnpm publish`, pnpm applies
`publishConfig.exports` and rewrites those entry points to the compiled `dist/`
files. SDK releases must therefore use the repository's pnpm release workflow.

The release workflow verifies every packed export before publishing, including
the corresponding JavaScript and declaration files.

## Compatibility

The SDK package declares `nocobase.supportedDefaultTemplateRange`. Projects
preserve their inherited base template version as
`nocobase.defaultTemplateVersion`, even when they use a custom package name and
version. `portal-sdk check`, the SDK install script, and the Vite plugin enforce
the same compatibility decision.

See [MIGRATION.md](./MIGRATION.md) for the breaking-change version policy and
the coordinated template, Registry, and application upgrade process.

## Ownership boundary

The SDK intentionally excludes shadcn components, Tailwind styling, App Shell,
branding, business routes and pages, login UI, visual Registry components,
application locale configuration, and translation content. Those remain source
assets owned by each Portal project.
