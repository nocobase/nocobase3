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

The route renderer supplies outlets for pure groups. Business pages place their own outlet; no outlet is inserted automatically into a page, and the route overlay wrappers below insert none either. Put it where the next page belongs.

## Child pages shown as dialogs or drawers

When a feature needs a dialog or drawer that represents a page, form, editor, details view, or another URL-addressable state, implement it as a child route. Do not use local `open` state for this case.

Follow this order:

1. Add the child route.
2. Decide where the owning page renders `<Outlet />`.
3. Render the child with `RouteDialog` or `RouteDrawer`.
4. Use `useRouteOverlay()` to close it.
5. Add `beforeClose` when closing needs confirmation.

### 1. Add a child route

Declare the overlay as a child of the page that should remain mounted underneath it:

```ts
{
  name: 'orders',
  path: '/orders',
  componentLoader: () => import('./pages/orders.js'),
  children: [
    {
      name: 'orderEdit',
      path: ':orderId/edit',
      componentLoader: () => import('./pages/order-edit.js'),
    },
  ],
}
```

The child URL opens the overlay; the parent URL closes it. Direct links and refresh must render the same overlay. Use a child route when the state needs a URL or browser back/forward. Use local state only for a transient interaction that does not need a URL.

### 2. Place the outlet

The page that declares `children` must render `<Outlet />` where the child belongs:

```tsx
import { Outlet } from 'react-router';

export default function OrdersPage() {
  return (
    <main>
      <OrderList />
      <Outlet />
    </main>
  );
}
```

`RouteDialog` and `RouteDrawer` do not insert an outlet. Put the outlet inside an overlay when its child should stack above that overlay. Put it outside when the child should open as a separate layer. An overlay page with children of its own must render another `<Outlet />`.

### 3. Choose the overlay component

```tsx
import { RouteDialog } from '@/components/route-dialog';
import { RouteDrawer } from '@/components/route-drawer';
```

Use `RouteDialog` for focused editing, confirmation, and short forms. Use `RouteDrawer` for details, filters, inspectors, and content that benefits from a side panel. Do not create another route-overlay implementation or add a local `open` prop.

```tsx
import { Outlet } from 'react-router';
import { RouteDialog } from '@/components/route-dialog';

export default function OrderEditPage() {
  return (
    <RouteDialog title='Edit order'>
      <OrderForm />
      <Outlet />
    </RouteDialog>
  );
}
```

Both components accept `title` (required), `description`, `children`, `footer`, `closeTo`, `beforeClose`, and `className`. Route matching controls whether the overlay exists.

### 4. Close the overlay

Use `useRouteOverlay()` inside the overlay page or its descendants:

```tsx
import { useRouteOverlay } from '@/components/use-route-overlay';

function Actions() {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      disabled={isClosing}
      onClick={() => {
        void close().catch((error: unknown) => {
          console.error('Failed to close route overlay', error);
        });
      }}
    >
      Cancel
    </Button>
  );
}
```

The default close target is the parent route. It preserves the current query string and uses route-relative navigation. Use `closeTo` only for a different explicit target. Do not use `navigate(-1)` as the normal close implementation because a directly loaded child may have no meaningful history entry.

### 5. Guard closing when needed

Use `beforeClose` for unsaved changes or other close checks:

```tsx
<RouteDialog
  title='Edit order'
  beforeClose={async () => {
    if (!hasUnsavedChanges) return true;
    return await confirmDiscardChanges();
  }}
>
  <OrderForm />
</RouteDialog>
```

Returning `false` keeps the overlay open. The guard applies to the close button, Escape, backdrop clicks, and `close()`. Browser back and forward do not invoke it. `close()` returns `Promise<void>`; callers must handle rejection when the guard can throw. A rejected close leaves the overlay open.

### Implementation checklist

- Is the overlay represented by a child route?
- Does the owning page render `<Outlet />` in the intended location?
- If the overlay has child routes, does it render its own `<Outlet />`?
- Is `RouteDialog` or `RouteDrawer` selected for the interaction?
- Is `useRouteOverlay()` used for closing, with rejection handled?
- Is `beforeClose` present when unsaved state needs protection?
- Do direct URLs, refresh, query strings, browser back/forward, and nested overlays behave correctly?

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
