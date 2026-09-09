# Child routes and route navigation

Use this guide for nested pages, page Tabs, and menu groups. Routes are the source of navigation for App, Settings, and Dev. Business page code decides how child content is presented.

## Default for page Tabs

When asked to build a page with Tabs, use child routes by default; the user does not need to request routing separately. This applies to App, Settings, and Dev pages, including plugin-owned pages. Follow an explicit user request for a different interaction.

Declare Tab content in the parent route's `children`, place `<Outlet />` in the parent's content area, and switch Tabs through router navigation. Both fixed Tabs (such as overview and activity) and parameterized Tabs use this pattern. Derive the selected Tab from the URL rather than an independent `activeTab` state. Keep each Tab directly accessible and restorable on refresh, and verify back/forward navigation. Use the existing route API and choose paths for the business requirement; no fixed path naming format is required.

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
import { NavLink, Outlet } from 'react-router';

export default function Workspace(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='space-y-4 p-6'>
      <h1>{t('workspace.title')}</h1>
      <nav aria-label={t('workspace.reports')} className='flex gap-4'>
        <NavLink to='reports/42'>{t('workspace.report42')}</NavLink>
        <NavLink to='reports/43'>{t('workspace.report43')}</NavLink>
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

`/workspace` shows the title and report links without child content. `/workspace/reports/42` also renders report 42 at the outlet. The sidebar stays on Workspace. Report identity is taken from the route; do not maintain a second selected-tab state. If a page needs a default child, design that behavior explicitly rather than assuming index routes are available.

These links are page navigation. If using an ARIA Tabs component instead, implement its keyboard and focus requirements and keep selection synchronized with the router.

## Navigation groups and clickable parents

A group has `navigation` and `children`, with no component loader. Its `path` is optional and prefixes descendants when provided. A page has a component loader and can also have navigation and children. Groups can contain groups; a page can be both a clickable menu item and a parent of child menu items.

Omit `navigation` for details, Tab content, or another page that should not appear in the sidebar. A descendant can have navigation even when an ancestor omits it. Dynamic and wildcard paths are not concrete menu targets, so leave their navigation unset. Paths, route IDs, and component exports must resolve correctly; URL spelling is not otherwise prescribed by this guide.

The route renderer supplies outlets for pure groups. Business pages place their own outlet; no outlet is inserted automatically into a page. Put it where the next page belongs. For future business dialog wrappers, put nested content outside the parent's dialog panel; this change does not provide `RouteDialog` or `RouteDrawer`.

## Settings and Dev

Use the same page/group shape with `defineSettingsRoutes()` or `defineDevRoutes()`. Do not write `/settings` or `/dev` in their declared paths. A settings page's nested detail or Tab normally omits navigation. Dev routes and modules reachable only from them are excluded from production.

App entry routes choose auth; descendants inherit it. Settings and Dev require sign-in. Every parent access check must pass before a child is rendered. App entry pages retain their default name/access check; page children add only explicit `access`. A menu group adds no independent page permission. Client access checks do not replace server authorization.

## Verify

1. Navigate to each child, load its URL directly, and refresh with the deployment prefix.
2. Confirm the parent stays mounted and content appears at the intended outlet.
3. Use back and forward; selected navigation must match the URL.
4. Check menus, translations, clickable parent links, expand buttons and mobile navigation.
5. Deny parent access and verify children cannot load; deny explicit child access independently.
6. For Settings/Dev, verify the intended navigation and Dev production exclusion.

Add behavior tests before implementation, confirm the expected failure, then implement and rerun. Run lint, typecheck, test and build for affected packages. Report commands, outcomes and any skipped checks.
