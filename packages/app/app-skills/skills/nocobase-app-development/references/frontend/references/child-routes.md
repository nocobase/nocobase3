# Child routes

Child pages, page tabs and navigation groups are all declared as routes. Routes are the source of navigation in App, Settings and Dev; how child content is presented (inline, covering, dialog, drawer) is decided by page code.

For the basic rules on route fields, `auth`, `authz`, menus and breadcrumbs, see `page.md`. For dialogs and drawers (`RouteDialog`, `RouteDrawer`, `useRouteOverlay`, `beforeClose`), see `overlay.md`.

## 1. Basic rules

- **Child routes go in the parent route's `children`**, declared in `client/routes.ts`, not in page component files.
- A child route's `path` is relative to its parent and is appended to the parent's path. A leading `/` is stripped before joining, so `new` and `/new` behave the same; this handbook writes the form without `/`.
- **The parent page must place `<Outlet />` itself**, where the child content should appear. Pages do not insert an Outlet automatically, and neither do `RouteChildPage`, `RouteDialog` or `RouteDrawer`; only a plain navigation group gets its Outlet from the route renderer.
- Child routes inherit the entry route's `auth` and cannot change it. A child page renders only after the parent page's authorization check passes; a child page gets an extra check only when it declares `authz` explicitly.
- Link to a child route with a relative path and keep the current query parameters: `<Link to={{ pathname: String(id), search: location.search }}>`.
- Route declarations have no `index` field. Do not invent an index route, and do not register a child route at the parent's own path; when "opening the parent URL shows a particular child page" is needed, use the redirect in section 4.
- Do not change the shell, the route renderer or the ServiceProvider to add a menu entry. Keep the CRUD resources that business code uses, but they produce no menu entries.
- Design paths around business needs; there is no fixed naming format. Do not write the deployment base path `/main`.

## 2. File layout

A page with child routes becomes a folder: the page itself is `index.tsx`, and each child route is named after its path segment and placed beside it. When a child route has children of its own, it becomes a folder too:

```text
client/pages/projects/
  index.tsx                  /projects                     List page; <Outlet context={{ reload }} /> at the end
  new.tsx                    /projects/new                 RouteDialog: new project
  detail/index.tsx           /projects/:projectId          RouteDrawer: project details; <Outlet context={...} /> inside the drawer
  detail/edit.tsx            /projects/:projectId/edit     RouteDialog: edit project, stacked on the drawer
  project-form.tsx           Form component shared by create and edit
  project-delete-dialog.tsx  Delete confirmation (AlertDialog, state inside the component)
  types.ts
```

- A fixed path segment uses a file of the same name: `/projects/new` is `projects/new.tsx`.
- A parameter segment uses a name that describes what the page is for: `:projectId` is `detail/`.
- Components and types used only by these pages stay in the same folder, not in `client/components/` (which holds components shared across the whole application).
- Keep components and constants in separate files: when one file exports both a component and a constant, Fast Refresh stops working and ESLint (`react-refresh/only-export-components`) reports an error. Put constants and types in a separate module such as `types.ts`.

Adding a set of child routes usually changes these files:

| File               | What to change                                                   |
| ------------------ | ---------------------------------------------------------------- |
| `client/routes.ts` | Declare the pages, menu entries and nested `children`            |
| Parent page        | Place `Outlet`; add links or tabs that point to the child routes |
| Child pages        | Default-export the page component                                |
| `client/locales/`  | Menu and page copy (`en-US.ts`, `zh-CN.ts`)                      |
| `tests/`           | The route test (see section 12 of `page.md`) and behavior tests  |

## 3. Four ways to present a child route

A child route renders in the parent page's Outlet. It can be displayed inline, or it can cover the parent page with one of the three components below:

|                 | Inline (tabs, etc.)                      | `RouteChildPage`                             | `RouteDialog`                          | `RouteDrawer`    |
| --------------- | ---------------------------------------- | -------------------------------------------- | -------------------------------------- | ---------------- |
| Position        | Where the Outlet sits in the parent page | Covers the whole content area                | Center of the page                     | Side of the page |
| Modal           | No                                       | No; the sidebar and header remain usable     | Yes                                    | Yes              |
| `breadcrumb`    | Omit                                     | Write (it is a destination)                  | Omit                                   | Omit             |
| `PageContainer` | None; uses the parent page's             | Adds its own                                 | None                                   | None             |
| How to leave    | Switch to another child route            | Breadcrumbs or browser back                  | Close button, Esc, backdrop, `close()` | Same as left     |
| Use for         | Page tabs                                | Child pages with long forms or many sections | Create and edit forms                  | Record details   |

For how to write `RouteDialog` and `RouteDrawer`, see `overlay.md`. Ordinary page routes can also have `breadcrumb`; it is not limited to `RouteChildPage` (see section 7 of `page.md`).

## 4. Page tabs

### Use child routes by default

- When building a page with tabs, each tab is a child route by default; the user does not have to ask for "routes" separately. This is the same for App, Settings and Dev pages, including plugin pages. When the user explicitly asks for a different interaction, follow the user's request.
- A tab is a view of the parent page, not a separate destination: tab routes declare no `breadcrumb` (the breadcrumbs stop at the parent page) and no `navigation`.
- Tab content goes in the parent route's `children`; the parent page places `<Outlet />` in its content area; switching tabs uses route navigation.
- **Derive the selected tab from the URL**; do not keep a separate `activeTab` state. Every tab can be opened directly, survives a reload, and works with the browser's back and forward.
- Fixed tabs (Summary, By owner) and parameterized tabs (for example `:year`) both use this pattern. A child page with parameters reads them with `useParams()`.
- This rule is about tabs on a page. To switch between several panels of the same record inside a dialog or drawer, you can use the `Tabs` component (`@/components/ui/tabs`).

### Default tab redirect

- When the parent page's URL is opened (without a tab), redirect with `replace` to the default tab's URL, keeping the query parameters.
- Default tab: the one the business specifies, if any; otherwise the first accessible tab in display order. When the specified tab is not accessible, also use the first accessible one.
- While permissions or tab data are still loading, show a loading state; when no tab is accessible, show an empty state or a no-permission state, and do not redirect.
- Clicking a tab uses ordinary navigation (without `replace`), so back and forward return to previously selected tabs.
- When a tab's URL is opened directly or reloaded, stay on that tab. Do not redirect an explicit child route URL back to the default tab, even when the user has no permission for that tab or it does not exist; leave those cases to the child route's own permission check and the page's error handling.
- Write the redirect in the parent page with existing React Router APIs: get the parent page's own path with `useResolvedPath('.')` and match it in full against `location.pathname`. Do not decide whether this is the parent URL from "the Outlet is empty" or from a string prefix.

### Complete example

Put the projects list and a new "Project reports" page into the same navigation group. The reports page has two tabs, "Summary" and "By owner":

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  // … existing routes (home, sign-in pages)
  {
    // Navigation group: only name, navigation and children; no componentLoader or authz, and no path here either.
    name: 'project-management',
    navigation: { title: 'navigation.projectManagement', icon: FolderKanban },
    children: [
      {
        name: 'projects',
        path: '/projects',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.projects' },
        componentLoader: () => import('./pages/projects/index.js'),
        // … children as in page.md
      },
      {
        name: 'project-reports',
        path: '/project-reports',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.projectReports' },
        componentLoader: () => import('./pages/project-reports/index.js'),
        children: [
          {
            // Tab: no navigation and no breadcrumb.
            name: 'project-reports-summary',
            path: 'summary',
            componentLoader: () => import('./pages/project-reports/summary.js'),
          },
          {
            name: 'project-reports-owners',
            path: 'owners',
            componentLoader: () => import('./pages/project-reports/owners.js'),
          },
        ],
      },
    ],
  },
]);
```

The group has no `path`, so the pages inside it use full paths: `/projects` and `/project-reports`.

The parent page, `client/pages/project-reports/index.tsx`:

```tsx
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import {
  matchPath,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ProjectReportsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const parentPath = useResolvedPath('.');
  // Redirect to the default tab only when the URL is exactly the parent page (/project-reports or /project-reports/).
  const isParentEntry =
    matchPath({ path: parentPath.pathname, end: true }, location.pathname) !==
    null;

  // The order is the display order. Both tabs use the parent page's access, so the first one is the default tab.
  const tabs = [
    { path: 'summary', label: t('projectReports.tabs.summary') },
    { path: 'owners', label: t('projectReports.tabs.owners') },
  ];

  if (isParentEntry) {
    // replace: leaves no parent URL in the history, so going back does not get redirected again.
    return (
      <Navigate
        replace
        to={{ pathname: tabs[0].path, search: location.search }}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('projectReports.title')}
        description={t('projectReports.description')}
      />
      <nav
        aria-label={t('projectReports.tabs.label')}
        className='flex flex-wrap gap-1 border-b pb-2'
      >
        {tabs.map((tab) => (
          // Tabs are page navigation, so use links. NavLink adds aria-current='page' to the current tab, and the selected style is based on it.
          <NavLink
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
            )}
            key={tab.path}
            to={{ pathname: tab.path, search: location.search }}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {/* Content of the current tab */}
      <Outlet />
    </PageContainer>
  );
}
```

The tab page, `client/pages/project-reports/summary.tsx` (`owners.tsx` is written the same way):

```tsx
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Tab content renders inside the parent page's PageContainer; do not wrap it in another PageContainer.
export default function ProjectReportsSummary(): ReactElement {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('projectReports.summary.title')}</CardTitle>
        <CardDescription>
          {t('projectReports.summary.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>{/* Statistics */}</CardContent>
    </Card>
  );
}
```

Add the copy to `client/locales/en-US.ts` and `zh-CN.ts`:

| key                            | en-US                               | zh-CN                      |
| ------------------------------ | ----------------------------------- | -------------------------- |
| `navigation.projectManagement` | Project management                  | 项目管理                   |
| `navigation.projectReports`    | Project reports                     | 项目报表                   |
| `projectReports.title`         | Project reports                     | 项目报表                   |
| `projectReports.description`   | Track progress by status and owner. | 按状态和负责人查看项目进展 |
| `projectReports.tabs.label`    | Report views                        | 报表视图                   |
| `projectReports.tabs.summary`  | Summary                             | 概览                       |
| `projectReports.tabs.owners`   | By owner                            | 按负责人                   |

Also add `projectReports.summary.title`, `projectReports.summary.description`, `projectReports.owners.title` and `projectReports.owners.description` for the cards of the two tabs.

Behavior:

- Opening `/project-reports?range=30d` redirects with `replace` to `/project-reports/summary?range=30d`.
- Opening `/project-reports/owners` directly stays on "By owner".
- Clicking a tab adds a history entry, and the content renders where the Outlet is; the sidebar keeps "Project reports" highlighted (tab routes have no menu entry, so the nearest ancestor is highlighted).
- This example also keeps the query parameters when switching tabs; on other pages, the business decides which query parameters follow the tab.

Tabs are implemented as links because they are page navigation. To borrow the button look, apply `buttonVariants` to `NavLink`; do not use `<Button render={<NavLink />}>`, which adds `role='button'` to the link. If you switch to an ARIA Tabs component, you must implement the keyboard and focus behavior it requires yourself and keep the selected state in sync with the route.

### When tabs have their own permissions

Child pages get no page authorization check by default. When a tab is only for people who have been granted access, declare `authz` explicitly on its route:

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'project-reports',
    path: '/project-reports',
    // …
    componentLoader: () => import('./pages/project-reports/index.js'),
    children: [
      {
        name: 'project-reports-summary',
        path: 'summary',
        componentLoader: () => import('./pages/project-reports/summary.js'),
      },
      {
        // Child pages get no page authorization check by default; declare authz explicitly when a page is only for people who have been granted access.
        name: 'project-reports-owners',
        path: 'owners',
        authz: {
          resource: { type: 'page', id: 'project-reports-owners' },
          action: 'access',
        },
        componentLoader: () => import('./pages/project-reports/owners.js'),
      },
    ],
  },
]);
```

The parent page checks the same permission with `useCan`: tabs without permission are not shown, and the default tab is decided only after the permission check finishes. The business requirement below is to show "By owner" by default, and "Summary" when the user has no permission for it:

```tsx
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import {
  matchPath,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ProjectReportsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const parentPath = useResolvedPath('.');
  const isParentEntry =
    matchPath({ path: parentPath.pathname, end: true }, location.pathname) !==
    null;
  // Keep in sync with the authz of the owners child route in routes.ts.
  const ownersAccess = useCan({
    resource: { type: 'page', id: 'project-reports-owners' },
    action: 'access',
  });

  // Tabs without permission are not shown; can is false both while the check is pending and when it fails.
  const tabs = [
    { path: 'summary', label: t('projectReports.tabs.summary') },
    ...(ownersAccess.can
      ? [{ path: 'owners', label: t('projectReports.tabs.owners') }]
      : []),
  ];

  if (isParentEntry) {
    // Redirecting before the permission check finishes may land on the wrong tab: show a loading state first.
    if (ownersAccess.isPending) {
      return (
        <Loading
          className='min-h-[calc(100svh-4rem)]'
          label={t('status.loadingPage')}
        />
      );
    }
    // The business specifies "By owner" as the default tab; when it is not accessible, use the first accessible tab.
    const target = tabs.find((tab) => tab.path === 'owners') ?? tabs[0];
    return (
      <Navigate
        replace
        to={{ pathname: target.path, search: location.search }}
      />
    );
  }

  // … the return part is the same as in the example above
}
```

- Here "Summary" uses the parent page's permission, so there is always an accessible tab. When every tab has its own permission and none is accessible, show an empty state or a no-permission state, and do not redirect.
- When a user without permission opens `/project-reports/owners` directly, the child route's permission check shows "Access denied"; do not redirect back to the default tab.
- Call `useCan` at the top level of the component, once for each tab that needs a check, never inside a loop or a condition.

## 5. Covering child pages (RouteChildPage)

When a child page has a lot of content (a long form, many sections) and needs the whole page area, but the parent page's state must be preserved, cover the parent page with `RouteChildPage`. For example, add an "Import projects" page at `/projects/import` under the projects list. It is a destination, so both the parent route and the page declare `breadcrumb`:

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'projects',
    path: '/projects',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.projects', icon: FolderKanban },
    // navigation and breadcrumb do not replace each other: to get both a menu entry and a breadcrumb, write both.
    breadcrumb: { title: 'navigation.projects' },
    componentLoader: () => import('./pages/projects/index.js'),
    children: [
      // … dialogs and drawers such as new and :projectId are not destinations; they get no breadcrumb
      {
        // A covering child page is a destination, so give it a breadcrumb; the title names the page type, not the record.
        name: 'project-import',
        path: 'import',
        breadcrumb: { title: 'projects.import.title' },
        componentLoader: () => import('./pages/projects/import.js'),
      },
    ],
  },
]);
```

`client/pages/projects/import.tsx`:

```tsx
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';

export default function ProjectImportPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <>
      <RouteChildPage>
        {/* A covering child page uses its own PageContainer */}
        <PageContainer>
          <Breadcrumbs />
          <PageHeader
            title={t('projects.import.title')}
            description={t('projects.import.description')}
          />
          {/* The page's own content */}
        </PageContainer>
      </RouteChildPage>
      {/* Deeper child routes: the Outlet goes beside RouteChildPage, not inside it */}
      <Outlet />
    </>
  );
}
```

The list page's `<Outlet />` is already at the end of `PageContainer` (see section 2 of `page.md`), so it needs no change; just add a secondary button that links to `import` in the page header: `<Button variant='outline' nativeButton={false} render={<Link to={{ pathname: 'import', search: location.search }} />}>`.

- The breadcrumbs show "Projects > Import projects". "Projects" links back to the list; "Import projects" is the current page and is not a link.
- Put the deeper `<Outlet />` beside `RouteChildPage`, not inside it: `RouteChildPage` scrolls on its own, so a next level placed inside it would scroll away with it.
- The covered parent page keeps its own DOM, including half-filled form input and the scroll position. While covering, `RouteChildPage` makes the sibling elements before it `inert` (not focusable, not clickable) and restores them when it leaves.
- It is not modal: the sidebar and header remain usable. It has no close button and does not respond to Esc; users go back through the breadcrumbs or the browser's back button.
- Use it only for child pages that cover their parent page, never on a top-level page.

## 6. Navigation groups and clickable parents

- **Group**: only `name`, `navigation` and `children`, with no `componentLoader`. `path` is optional; when present, it becomes the prefix of the child routes' paths; when absent, the group is only a set of entries in the menu.
- A group renders no business component (the route renderer provides its Outlet), cannot declare `authz`, and carries no page permission of its own. A group does not count as "a page above": a root page inside a group that does not declare `authz` is still checked against `page:<name>` by default.
- Groups can contain groups. A group's `name` must be unique, like a route name; settings group names are unique across the whole settings area.
- **Clickable parent**: a page can also have `navigation` and child pages with `navigation`. In the menu it is then both a link and expandable: the link and the expand button are two separate controls. Choose how the child pages are presented according to section 3.
- Pages that should not appear in the menu, such as details and tab content, have no `navigation`. A descendant can still declare `navigation` when its ancestor does not.
- A path with a parameter or a wildcard cannot have `navigation`.
- `navigation.order` sets the order among siblings; lower numbers come first.
- Navigation groups keep their expanded or collapsed state while the navigation tree stays mounted; opening a new page automatically expands its ancestor groups.

## 7. Settings pages and dev pages

- Use `defineSettingsRoutes()` and `defineDevRoutes()`; pages, groups and `children` are written the same way as in App routes. Do not write `/settings` or `/dev` in the path.
- Tabs in settings pages also use child routes (section 4); nested details and tabs usually have no `navigation`.
- Settings pages and dev pages both require sign-in. Without `authz`, no page permission is checked, but the parent page's check still comes before the child page; when a child page needs a different permission, it declares its own `authz`.
- Dev pages, and modules imported only by them, are left out of the production build.
- Navigation groups carry no page permission. Access checks in the browser do not replace server authorization.

## 8. Verify

1. Open the parent page's URL, including the form with a trailing `/` and the form with query parameters: it redirects only once, with `replace`, to the default accessible tab, and keeps the query parameters; going back does not return to the parent URL only to be redirected away again. While loading, or when no tab is accessible, it does not redirect repeatedly.
2. Open each child route, including by typing its URL directly, and reload it at a URL with the deployment base path: it stays on the requested tab and does not return to the default tab.
3. The parent page stays mounted, and child content appears at the expected Outlet position.
4. Use back and forward: the selected tab and the menu highlight match the URL.
5. Check the menu, the copy in each language, the link and expand button of clickable parents, and navigation on narrow screens.
6. Remove permission for the parent page: none of the child pages can load. Then remove permission for just one child page that declares `authz` explicitly.
7. Settings pages and dev pages: the menu position is as expected; dev pages do not appear in the production build.
8. Covering child pages: the breadcrumbs are correct; the covered page keeps its input and scroll position; after going back, it works normally.

Write these behaviors as tests in `tests/`, and add the new route names to the page grant list in `tests/logic/client-routes.test.ts` (see section 12 of `page.md`).
