# Child routes and route navigation

Use this guide for nested pages, page Tabs, and menu groups. Routes are the source of navigation for App, Settings, and Dev. Business page code decides how child content is presented.

## Default for page Tabs

When asked to build a page with Tabs, use child routes by default; the user does not need to request routing separately. This applies to App, Settings, and Dev pages, including plugin-owned pages. Follow an explicit user request for a different interaction.

Declare Tab content in the parent route's `children`, place `<Outlet />` in the parent's content area, and switch Tabs through router navigation. Both fixed Tabs (such as overview and activity) and parameterized Tabs use this pattern. Derive the selected Tab from the URL rather than an independent `activeTab` state. Keep each Tab directly accessible and restorable on refresh, and verify back/forward navigation. Use the existing route API and choose paths for the business requirement; no fixed path naming format is required.

## Default Tab entry

Opening the exact parent URL redirects to the default Tab's child URL with `replace: true`, preserving the query string. Use the business-specified default when available; otherwise use the first accessible Tab in display order. If the specified default is inaccessible, use the first accessible Tab. While permissions or Tab data are loading, show loading content; when no Tab is accessible, show an empty or access-denied state without redirecting.

Clicking another Tab uses ordinary navigation so back and forward restore previous selections. Direct links and refresh keep the requested Tab; do not redirect an explicit child URL to the default, including when that child is denied or unknown. Child route guards and the page's error handling remain responsible for those cases.

Implement the parent-only redirect in the parent page with existing React Router APIs. Resolve the current page's path with `useResolvedPath('.')` and match it exactly against `location.pathname`; do not use a missing outlet or a string prefix as the redirect condition. The route declaration API does not expose an `index` field, so do not invent an index route or register a child at the parent's path.

## Files to edit

| File                           | Change                                           |
| ------------------------------ | ------------------------------------------------ |
| `client/routes.ts`             | Declare pages, navigation and recursive children |
| Parent page in `client/pages/` | Add navigation and manually place `Outlet`       |
| Child page in `client/pages/`  | Default-export its content component             |
| `client/locales/`              | Translate navigation and page copy               |
| `tests/`                       | Verify actual navigation and access              |

Do not change the shell, route renderer, or ServiceProvider to add a menu. Keep CRUD resources if business code uses them; resources no longer add sidebar entries.

## Complete route and Tab example

This example uses existing React Router components, not an assumed Tabs wrapper. Names and paths are examples, not a mandatory URL format. Design paths for the business requirement, within the supported route syntax. Never include the deployment prefix such as `/main`.

```ts
// client/routes.ts
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'business',
      navigation: { title: 'navigation.business' },
      children: [
        {
          name: 'workspace',
          path: '/workspace',
          navigation: { title: 'navigation.workspace' },
          componentLoader: () => import('./pages/workspace.js'),
          children: [
            {
              name: 'workspaceReport',
              path: 'reports/:reportId',
              componentLoader: () => import('./pages/workspace-report.js'),
            },
          ],
        },
      ],
    },
  ]),
];

export default routes;
```

```tsx
// client/pages/workspace.tsx
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  matchPath,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';

export default function Workspace(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const parentPath = useResolvedPath('.');
  const isParentEntry = matchPath(
    { path: parentPath.pathname, end: true },
    location.pathname,
  );

  // Both report Tabs in this example share the parent's access policy.
  // The first Tab is the default when no business-specific default is given.
  if (isParentEntry) {
    return (
      <Navigate
        to={{ pathname: 'reports/42', search: location.search }}
        replace
      />
    );
  }

  return (
    <section className='space-y-4 p-6'>
      <h1>{t('workspace.title')}</h1>
      <nav aria-label={t('workspace.reports')} className='flex gap-4'>
        <NavLink to={{ pathname: 'reports/42', search: location.search }}>
          {t('workspace.report42')}
        </NavLink>
        <NavLink to={{ pathname: 'reports/43', search: location.search }}>
          {t('workspace.report43')}
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
```

```tsx
// client/pages/workspace-report.tsx
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useParams } from 'react-router';

export default function WorkspaceReport(): ReactElement {
  const { reportId } = useParams();
  const { t } = useTranslation();
  return <h2>{t('workspace.report', { id: reportId })}</h2>;
}
```

Add these keys to the application's locale messages (and translate supported languages):

```json
{
  "navigation": { "business": "Business", "workspace": "Workspace" },
  "workspace": {
    "title": "Workspace",
    "reports": "Reports",
    "report42": "Report 42",
    "report43": "Report 43",
    "report": "Report {{id}}"
  }
}
```

`/workspace?filter=recent` redirects with replace to `/workspace/reports/42?filter=recent`. Opening `/workspace/reports/43` directly keeps report 43. Clicking a report link adds a history entry, and its content renders at the outlet while the sidebar stays on Workspace. This example preserves the query string during Tab switches as well; other pages should define query ownership for their business needs. Report identity and the selected Tab come from the route.

These links are page navigation. If using an ARIA Tabs component instead, implement its keyboard and focus requirements and keep selection synchronized with the router.

## Navigation groups and clickable parents

A group has `navigation` and `children`, with no component loader. Its `path` is optional and prefixes descendants when provided. A page has a component loader and can also have navigation and children. Groups can contain groups; a page can be both a clickable menu item and a parent of child menu items.

Omit `navigation` for details, Tab content, or another page that should not appear in the sidebar. A descendant can have navigation even when an ancestor omits it. Dynamic and wildcard paths are not concrete menu targets, so leave their navigation unset. Paths, route IDs, and component exports must resolve correctly; URL spelling is not otherwise prescribed by this guide.

The route renderer supplies outlets for pure groups. Business pages place their own outlet; no outlet is inserted automatically into a page. Put it where the next page belongs. Route overlays use the wrappers described below, which provide their own nested outlet.

## Route dialogs and drawers

Use `RouteDialog` from `@/components/route-dialog` or `RouteDrawer` from `@/components/route-drawer` when a child page should open as an overlay. The page that owns the `children` route must render `<Outlet />`; otherwise the overlay child has nowhere to render. The overlay page renders the wrapper. Both wrappers automatically render their next child outlet outside the panel, within the underlying dialog context, so overlay pages do not add another outlet themselves.

```ts
// client/routes.ts
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
    name: 'orders',
    navigation: { title: 'navigation.orders' },
    path: '/orders',
    children: [
      {
        name: 'orderEditor',
        path: ':orderId/edit',
        componentLoader: () => import('./pages/order-editor.js'),
        children: [
          {
            name: 'orderDetails',
            path: 'details',
            componentLoader: () => import('./pages/order-details.js'),
          },
        ],
      },
    ],
  },
]);

export default [appRoutes];
```

```tsx
// client/pages/orders.tsx — the page that owns the overlay children
import { Outlet } from 'react-router';

export default function Orders() {
  return (
    <main>
      {/* The order list stays mounted while an overlay child is open. */}
      <h1>Orders</h1>
      <Outlet />
    </main>
  );
}
```

```tsx
// client/pages/order-editor.tsx
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';

function EditorActions() {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button disabled={isClosing} onClick={() => void close()}>
      {t('actions.cancel')}
    </Button>
  );
}

export default function OrderEditor() {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('orders.edit')} footer={<EditorActions />}>
      <Link to='details'>{t('orders.details')}</Link>
    </RouteDialog>
  );
}
```

```tsx
// client/pages/order-details.tsx
import { useTranslation } from '@nocobase/i18n/client';
import { RouteDrawer } from '@/components/route-drawer';

export default function OrderDetails() {
  const { t } = useTranslation();
  return (
    <RouteDrawer title={t('orders.details')}>
      <p>{t('orders.detailsDescription')}</p>
    </RouteDrawer>
  );
}
```

In this example, only `orders.tsx` places an explicit `<Outlet />`. `order-editor.tsx` renders the dialog, and `order-details.tsx` renders the drawer; neither adds an outlet because `RouteDialog` and `RouteDrawer` render their next child outlet internally. Add the example's business translation keys to every supported locale. Opening a child URL directly also renders its ancestors. Parent page and form state stay mounted when child overlays open; only the top layer responds to Escape or its backdrop.

Both wrappers accept `title` (required accessible name), `description`, `children`, `footer`, `closeTo`, `beforeClose`, and `className`. `className` styles the panel, including its width. Dialogs are centered; drawers enter from the right. The header and optional footer stay visible while the body scrolls. There are no default business buttons or controlled `open` props: route matching determines whether the overlay exists.

Closing defaults to `..` with React Router's route-relative resolution and `replace: true`, preserving the current query and clearing the hash. It moves to the parent route, which can differ from removing one URL segment. Explicit `closeTo` accepts React Router's `To` and uses exactly that target without merging the query. Do not include a deployment prefix. Close does not use history back, so directly loaded overlays can close to their parent.

`useRouteOverlay()` returns the nearest wrapper's `close(): Promise<void>` and `isClosing`. It works in the body and footer; calling it outside a wrapper throws. Close buttons, backdrop clicks, Escape and `close()` share `beforeClose?: () => boolean | Promise<boolean>`. Returning false keeps the overlay open. Pending checks set `isClosing` and coalesce repeated close requests. A rejected check leaves the overlay open: callers of `close()` must handle the rejection when their check can throw; built-in controls catch and log it. Checks that finish after navigation away cannot navigate again.

Browser back, forward and other route navigation bypass `beforeClose`. This hook is not a general unsaved-changes navigation blocker. Successful close navigates immediately; exiting pages are not cached for an exit animation.

Verify direct links, deployment prefixes, query preservation, custom targets, nested Dialog/Drawer combinations, parent form state, top-layer Escape and focus restoration. Also check rejected and pending close checks, browser history, long content, narrow screens and both color modes.

## Settings and Dev

Use the same page/group shape with `defineSettingsRoutes()` or `defineDevRoutes()`. Do not write `/settings` or `/dev` in their declared paths. A settings page's nested detail or Tab normally omits navigation. Dev routes and modules reachable only from them are excluded from production.

App entry routes choose auth; descendants inherit it. Settings and Dev require sign-in. Every parent access check must pass before a child is rendered. App entry pages retain their default name/access check; page children add only explicit `access`. A menu group adds no independent page permission. Client access checks do not replace server authorization.

## Verify

1. Open the parent URL, including its trailing-slash form and query string; verify one replace redirect to the default accessible Tab, with queries preserved. Back must not bounce through the parent URL. Verify loading and no-accessible-Tab states do not redirect repeatedly.
2. Navigate to each child, load its URL directly, and refresh with the deployment prefix. Confirm the requested Tab is retained rather than reset to the default.
3. Confirm the parent stays mounted and content appears at the intended outlet.
4. Use back and forward; selected navigation must match the URL.
5. Check menus, translations, clickable parent links, expand buttons and mobile navigation.
6. Deny parent access and verify children cannot load; deny explicit child access independently.
7. For Settings/Dev, verify the intended navigation and Dev production exclusion.

Add behavior tests before implementation, confirm the expected failure, then implement and rerun. Run lint, typecheck, test and build for affected packages. Report commands, outcomes and any skipped checks.
