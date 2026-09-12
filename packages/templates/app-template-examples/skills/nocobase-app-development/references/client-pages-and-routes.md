# Client pages and routes

Pages are React components in `client/pages/`. Routes and menu entries are declared in `client/routes.ts`. For nested pages, Tabs and groups, also read [child routes](client-child-routes.md).

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

| Mode       | For                                                                           |
| ---------- | ----------------------------------------------------------------------------- |
| `required` | Pages only signed-in users may open. The default for root routes when omitted |
| `guest`    | Sign-in, registration, password reset. A signed-in user is redirected away    |
| `optional` | Pages that work signed in or out and adapt themselves                         |

Descendants inherit their entry route’s auth mode and cannot switch it. App pages without a page ancestor retain the default `resource: name, action: access` check; nested pages add a check only when they declare `access`. Every parent check must pass before its children render.

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

Declare `navigation: { title: 'navigation.orders' }` on the route. The application sidebar, settings navigation, and dev navigation all read their route declarations. Titles resolve in the owning application's or plugin's translation namespace; `icon` is an optional component accepting `className`.

Omit `navigation` for a reachable page that should not have a menu entry. Menu targets must resolve to concrete paths: dynamic parameter and wildcard pages do not declare `navigation`. Visiting such a page selects its nearest visible menu ancestor.

Do not add a Refine resource just to create a menu. Resources remain useful for CRUD integration, but do not supply application navigation. The home link is also declared in routes rather than hardcoded in the sidebar.

### Groups and page children

All three route functions support recursive `children`. A group has `name`, `navigation`, and `children`, without `componentLoader`. Its optional `path` prefixes descendants; omit it for a menu-only group. A page has `componentLoader` and may also have navigation and children. A clickable page with child menu items has separate link and expand controls.

Groups do not render business components. Pages must place `<Outlet />` explicitly where child content belongs. See [child routes](client-child-routes.md) for complete examples and verification.

A navigable page normally changes `client/routes.ts`, its page component, and `client/locales/`. Do not edit the shell or a ServiceProvider merely to add a menu.

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
