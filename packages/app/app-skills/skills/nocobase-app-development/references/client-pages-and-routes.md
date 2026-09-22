# Client pages and routes

Pages are React components in `client/pages/`. Routes and menu entries are declared in `client/routes.ts`. For nested pages, Tabs and groups, also read [child routes](client-child-routes.md).

When `client/pages/reference/` exists, open its `README.md` and read the screen closest to the one you are about to build before writing it — a list starts from `examples/orders`, a record editor from `examples/product-form`, a settings screen from `examples/team-settings`. Those pages are deliberately unrouted, so copy their structure into a page of your own rather than importing or routing them.

## Disable a feature without deleting its pages

Preserve the page modules, reusable components, and recoverable route definition when a user asks to disable or hide a feature. Prefer an application-owned availability setting that conditionally includes the route or gates it with an unavailable/redirect result, and use the same policy to hide links, buttons, and navigation. Use route APIs that actually exist; do not invent a `hidden` or `enabled` route option. Removing navigation alone leaves the URL reachable. Keep the definition in source so restoring availability does not require recreating the page.

A browser setting is presentation, not enforcement. The server must independently reject the disabled operation, including direct API calls. Verify the hidden UI, direct URL behavior, and rejected API operation, and describe how to re-enable both sides. Do not remove page files, dependencies, or feature data unless the user requests permanent removal.

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

The page module must default-export its component and wrap its content in `PageContainer` to use the shared page padding and spacing:

```tsx
// client/pages/orders.tsx
import type { ReactElement } from 'react';
import { PageContainer } from '@/components/page-container';

export default function OrdersPage(): ReactElement {
  return <PageContainer>...</PageContainer>;
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

Descendants inherit their entry route’s auth mode and cannot switch it. Authenticated App pages without a page ancestor retain the default `{ resource: { type: 'page', id: name }, action: 'access' }` check; nested pages add a check only when they declare `authz`. Every parent check must pass before its children render. Registration normalizes every route to an explicit `authz` request or `'skip'`; menus, page loaders, and permission discovery consume that result. Omitted authorization on Settings, Dev, guest, and optional pages resolves to `'skip'`. An explicit request is checked independently of `auth`. Route groups cannot declare `authz`.

### Opting a page out of authorization

`authz: 'skip'` skips only the current page's authorization check. Its authentication mode, parent guards, and server authorization still apply.

```ts
defineAppRoutes([
  {
    authz: 'skip',
    auth: 'required',
    name: 'home',
    path: '/',
    componentLoader: () => import('./pages/home.js'),
  },
]);
```

Use `'skip'` for pages such as the signed-in landing page that need no additional authorization. Replacing it with a permission request restricts the page to users granted that permission.

The Permission Sets page lists page resources from normalized `authz` requests and deduplicates their ids. Default checks use the route's `name` as the page resource id; explicit checks use `authz.resource.id`. Renaming a default-authorized route changes its permission identifier, so stored grants must be migrated.

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
    authz: { resource: { type: 'settings', id: 'orders' }, action: 'read' },
    componentLoader: () => import('./pages/orders-settings.js'),
  },
]);
```

`navigation` puts the page in the settings navigation. The header shows the Settings entry only when at least one such page is accessible. `authz` is checked before the page loads; when it is denied the page disappears from navigation and a direct URL will not load the component.

A settings page without `authz` is open to every signed-in user who can reach the settings area. Declare `authz` explicitly on anything sensitive, and enforce the same rule on the server.

### Dev routes

`defineDevRoutes()` pages are absent from a production build, along with any module only they import. This is a build boundary, not a permission boundary. A page that must be restricted in production is a settings route with `authz`, enforced by the server.

## Putting the page in the sidebar

Declare `navigation: { title: 'navigation.orders' }` on the route. The application sidebar, settings navigation, and dev navigation all read their route declarations. Titles resolve in the owning application's or plugin's translation namespace; `icon` is an optional component accepting `className`.

Omit `navigation` for a reachable page that should not have a menu entry. Menu targets must resolve to concrete paths: dynamic parameter and wildcard pages do not declare `navigation`. Visiting such a page selects its nearest visible menu ancestor.

Do not add a Refine resource just to create a menu. Resources remain useful for CRUD integration, but do not supply application navigation. The home link is also declared in routes rather than hardcoded in the sidebar.

### Groups and page children

All three route functions support recursive `children`. A group has `name`, `navigation`, and `children`, without `componentLoader`. Its optional `path` prefixes descendants; omit it for a menu-only group. A page has `componentLoader` and may also have navigation and children. A clickable page with child menu items has separate link and expand controls.

Groups do not render business components. Pages must place `<Outlet />` explicitly where child content belongs. See [child routes](client-child-routes.md) for complete examples and verification.

A navigable page normally changes `client/routes.ts`, its page component, and `client/locales/`. Do not edit the shell or a ServiceProvider merely to add a menu.

## Putting the page in a breadcrumb trail

The owning layout supplies the route tree: `AppLayout` for business pages, `SettingsLayout` for Settings pages, and `DevLayout` for Dev pages. `StandalonePageLayout` does not currently supply one, so breadcrumbs there render nothing.

`navigation` controls menu entries; `breadcrumb` independently supplies a trail title. Declare both when a route belongs in both. Breadcrumb titles are static translation keys resolved in the owning package's namespace and are allowed on parameterized paths.

```ts
{
  name: 'orders',
  path: '/orders',
  navigation: { title: 'navigation.orders', icon: ShoppingCart },
  breadcrumb: { title: 'navigation.orders' },
  componentLoader: () => import('./pages/orders/index.js'),
}
```

The page places `<Breadcrumbs />` itself, above its heading, inside `PageContainer`, which supplies the shared page spacing:

```tsx
<PageContainer>
  <Breadcrumbs />
  <PageHeader
    title={t('orders.title')}
    actions={<Button>{t('orders.create')}</Button>}
  />
</PageContainer>
```

The trail follows the matched route hierarchy:

- Only routes declaring `breadcrumb` appear; Tab, dialog, and drawer routes leave it unset.
- It renders only when at least two matched routes declare `breadcrumb`. Having a parent route alone is not enough.
- Earlier page entries link to their resolved paths; groups without a component render as plain text. The last entry is the current page and is not a link.
- Titles describe the page type, such as “Order detail”. Record-specific titles, such as “Order #42”, belong in the page heading.

## Customizing a plugin's page

Do not declare a duplicate route for a page a plugin owns. Registering a second `/install` is a conflict, not a customization. Three mechanisms exist, in order of preference:

1. **A plugin option.** If the plugin accepts one for the page, pass it on the plugin's own registration in `client/plugins.ts`.
2. **A source extension.** Add `client/extensions/<name>/extension.ts`; these are discovered automatically.
3. **A route override.** Add an entry to `client/route-overrides.ts`.

An override replaces only `componentLoader`. Route identity, path, auth mode, and plugin ownership are unchanged. Keep the replacement lazy, give it a `componentEntry` so tooling can locate the file, and default-export the component.

**One route takes one override across all three mechanisms.** A second one fails with the route ID. Pick one rather than layering.

Authentication pages are application routes: `/login`, `/register`, `/forgot-password`, and `/reset-password` are declared in `client/routes.ts` and load the corresponding default-exported page from `client/pages/auth/`. Edit those application-owned pages rather than adding another mechanism.

## Where rendering lives

`client/routing/` renders resolved routes, checks access, and handles loading and error states. `client/layouts/` holds the App, Settings and Dev layouts; `client/layouts/components/` holds their shared containers, navigation, branding and account controls. Each layout owns its permissions and route rendering; shared header and sidebar containers render ordinary children.

Do not declare product routes in any of them. They render routes; `client/routes.ts` declares them.

## Verify

- The page renders at its path, and at `/main` plus its path in the browser.
- The sidebar shows the entry, with the right label in every language, and highlights it when open.
- A signed-out visit to a `required` page redirects to sign-in.
- A settings page with `authz` disappears from navigation when denied, and its direct URL does not load the component.
- The page's chunk loads on navigation rather than in the initial bundle.

## Contributing to another plugin's settings group

A root entry passed to `defineSettingsRoutes()` may declare `parent: 'authorization'` to append to an existing settings group by its unique name. The target can be nested and can be declared by a later plugin. The contributed route's path is relative to the target group's path; its package and locale namespace remain those of the contributing plugin. Both pages and groups can be contributed this way.

```ts
defineSettingsRoutes([
  {
    parent: 'authorization',
    name: 'audit-logs',
    path: '/audit-logs',
    navigation: { title: 'navigation.auditLogs' },
    authz: { resource: { type: 'settings', id: 'audit-logs' }, action: 'read' },
    componentLoader: () => import('./pages/audit-logs.js'),
  },
]);
```

Without `parent`, the root entry keeps its existing placement under Settings. Entries inside `children` must not also declare `parent`. Groups can declare empty `children` for extension. Original children precede appended entries, which retain plugin and entry registration order. Missing targets, page targets, cycles, duplicate sibling names and conflicting paths are errors; groups are never silently merged. This extension applies to Settings only, not App or Dev routes.

Account-menu sign-out checks the Better Auth result for an error before refreshing the session. Keep failures visible through the localized error toast; do not simulate sign-out by redirecting while the server session remains valid.

The authorization provider clears the permission snapshot before rendering a new session. Route navigation and page guards subscribe to the authorization revision; preserve these checks when customizing the shell so account changes and permission updates take effect without a reload. Pending checks hide protected content, and failed checks deny access.

## Checking feature visibility

Use `useCan` from `@nocobase/app-plugin-authorization/client` for buttons and other permission-dependent UI: `useCan({ resource: { type: 'page', id: 'orders' }, action: 'access' })`. Its `{ can, isPending, error, retry }` result follows the current session and realtime permission updates; pending and failed checks do not allow access. Non-React consumers resolve `authorizationClientToken` and call `client.can({ resource, action })`. Page guards and navigation use this authorization client directly, without Refine permission hooks. Route `authz` declarations use the same `{ resource: { type, id }, action }` request; no string adapter is involved. Client visibility never replaces authorization on the endpoint.

Resolve the current application authorization client with `useAuthorizationClient()` in React or `authorizationClientToken` from its service container elsewhere. Refine access-control configuration and global authorization client accessors are not supported. Setting routes declare domain actions such as `read` and `update`; there is no `list`/`show`/`edit` translation.
