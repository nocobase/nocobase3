# Client pages and routes

Pages are React components in `client/pages/`. Routes that point at them are declared in `client/routes.ts`.

## Add a page

Declare the route with a lazy `componentLoader`:

```ts
// client/routes.ts
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
```

The page module must default-export its component:

```tsx
// client/pages/orders.tsx
export default function OrdersPage(): ReactElement {
  return <section className='p-6'>...</section>;
}
```

Keep `componentLoader` lazy. The route metadata stays synchronous so the router can resolve navigation without downloading every page; the component is fetched when someone navigates to it.

Import paths use the `.js` extension even though the file is `.tsx`. That is the module resolution this project uses, not a mistake.

## Route paths are application-internal

Never write the deployment base path into a route. The application is mounted somewhere — `/main` by default — and the runtime restores that prefix. A path of `/orders` is reachable at `/main/orders` in the browser.

## Choosing an auth mode

| Mode       | For                                                                        |
| ---------- | -------------------------------------------------------------------------- |
| `required` | Pages only signed-in users may open. The default when omitted              |
| `guest`    | Sign-in, registration, password reset. A signed-in user is redirected away |
| `optional` | Pages that work signed in or out and adapt themselves                      |

`auth` governs browser navigation. It is not server security: an endpoint the page calls must authenticate independently. See [server routes](server-routes.md).

## The three route kinds

| Function                 | Mounts at          | For                                    |
| ------------------------ | ------------------ | -------------------------------------- |
| `defineAppRoutes()`      | `/orders`          | Ordinary product pages                 |
| `defineSettingsRoutes()` | `/settings/orders` | Administrative and configuration pages |
| `defineDevRoutes()`      | `/dev/orders`      | Development-only tools                 |

Do not repeat `/settings` or `/dev` in the path — write `/orders` and it resolves under the surface's prefix. Settings and dev are separate path spaces, so the same relative path may exist in both.

### Settings pages

```ts
defineSettingsRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'Orders' },
    access: { resource: 'orders.settings', action: 'read' },
    componentLoader: () => import('./pages/orders-settings.js'),
  },
]);
```

`navigation` puts the page in the settings navigation. `access` is checked before the page loads; when it is denied the page disappears from navigation and a direct URL will not load the component.

A settings page without `access` is open to every signed-in user who can reach the settings area. Declare `access` explicitly on anything sensitive, and enforce the same rule on the server.

### Dev routes

`defineDevRoutes()` pages are absent from a production build, along with any module only they import. This is a build boundary, not a permission boundary. A page that must be restricted in production is a settings route with `access`, enforced by the server.

## Putting the page in the sidebar

**Declaring a route does not put it in the sidebar.** The two are separate concerns: the route makes the URL work, and a **Refine resource** makes the entry appear. A page added to `client/routes.ts` alone is reachable by URL but invisible in navigation — this is the most common thing to get wrong.

The sidebar is built from Refine's `useMenu()` hook, which reads the `resources` array passed to Refine's `<Refine>` component. This application collects that array through `app.refine`, so registering a resource is how anything reaches navigation.

Register it in the application's client service provider:

```ts
// client/service-provider.ts
import { APP_NS } from '@nocobase/i18n';

public override boot(): Promise<void> {
  this.app.refine.addResources([
    {
      name: 'orders',
      list: '/orders',
      meta: { label: 'navigation.orders', i18nNs: APP_NS },
    },
  ]);
  return Promise.resolve();
}
```

### What the fields mean

These are Refine's own `ResourceProps`, not a NocoBase invention. The type is exported from `@refinedev/core`, and the full set of fields is documented in Refine's resource reference:

| Field                    | Meaning                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `name`                   | The resource identifier Refine uses internally. Keep it stable; other Refine hooks address the resource by it |
| `list`                   | The path the sidebar entry links to. Must match the route's `path`                                            |
| `create`, `edit`, `show` | Optional paths for the other CRUD screens, if the resource has them                                           |
| `identifier`             | Use when two resources would otherwise share a `name`                                                         |
| `meta.label`             | What the entry displays. See the note below — this is a translation key here                                  |
| `meta.icon`              | A React node, typically a `lucide-react` icon. Entries without one get a default list icon                    |
| `meta.parent`            | The `name` of another resource, to nest this one beneath it                                                   |

**`meta.label` is a translation key, not finished text.** A resource is registered at startup, before any language is known, so pass the key and set `meta.i18nNs` to the namespace holding it — `APP_NS` for the application's own strings. Add the key to `client/locales/`. A label with no `i18nNs` is rendered literally, which is only correct for text that never needs translating.

`meta.i18nNs` is this application's convention, read by `useMenuLabel` in `client/shell/app-sidebar.tsx`; everything else in the table is standard Refine.

Reference: <https://refine.dev/docs/core/refine-component/#resources> and the `useMenu` hook at <https://refine.dev/docs/core/hooks/utilities/use-menu/>. The `ResourceProps` type ships with `@refinedev/core`, so your editor will complete the remaining fields.

### A navigable page is three edits

```text
client/routes.ts           the route    → the URL works
client/service-provider.ts the resource → it appears in the sidebar
client/locales/            the label    → it reads correctly in every language
```

Settings and dev pages do not need a resource — they get their navigation from the `navigation` field on the route itself.

The sidebar renders these entries in `client/shell/app-sidebar.tsx`, alongside the home item from `client/shell/navigation.ts`. Adding a page should not require editing either.

## Customizing a plugin's page

Do not declare a duplicate route. Registering a second `/login` is a conflict, not a customization. Three mechanisms exist, in order of preference:

1. **A plugin option.** If the plugin accepts one for the page, pass it on the plugin's own registration in `client/plugins.ts`.
2. **A source extension.** Add `client/extensions/<name>/extension.ts`; these are discovered automatically.
3. **A route override.** Add an entry to `client/route-overrides.ts`.

An override replaces only `componentLoader`. Route identity, path, auth mode, and plugin ownership are unchanged. Keep the replacement lazy, give it a `componentEntry` so tooling can locate the file, and default-export the component.

**One route takes one override across all three mechanisms.** A second one fails with the route ID. Pick one rather than layering.

Authentication UI is already materialized under `client/extensions/nocobase-auth-ui/` — edit that application-owned copy rather than adding a fourth mechanism.

## Where rendering lives

`client/routing/` renders resolved routes, checks access, and handles loading and error states. `client/layouts/` holds the settings and dev shells. `client/shell/` is the authenticated application chrome.

Do not declare product routes in any of them. They render routes; `client/routes.ts` declares them.

## Verify

- The page renders at its path, and at `/main` plus its path in the browser.
- The sidebar shows the entry, with the right label in every language, and highlights it when open.
- A signed-out visit to a `required` page redirects to sign-in.
- A settings page with `access` disappears from navigation when denied, and its direct URL does not load the component.
- The page's chunk loads on navigation rather than in the initial bundle.
