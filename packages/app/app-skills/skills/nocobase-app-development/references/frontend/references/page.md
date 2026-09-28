# Pages, menus and routes

A page is a React component under `client/pages/`; routes and menus are declared in `client/routes.ts`. For child pages, tabs and navigation groups, see `child-routes.md`; for dialogs and drawers, see `overlay.md`.

Before writing a new page, use "Read the reference pages first" in `styling.md` to find the closest example: start a list page from `examples/orders`, record editing from `examples/product-form`, and a settings page from `examples/team-settings`. Follow its structure in your own page; do not import files from `client/pages/reference/`, and do not add routes for them (`tests/logic/client-routes.test.ts` checks this).

## 1. Declare the route

Append an entry to the end of the existing `defineAppRoutes([...])` array in `client/routes.ts`. Leave the existing routes (home, sign-in pages) as they are, and do not overwrite the whole file. Add the icon to the existing `lucide-react` import at the top of the file:

```ts
import { FolderKanban, Home } from 'lucide-react';
```

The projects list page to append, with three child routes for create, detail and edit:

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  // … existing routes (home, sign-in pages); keep them
  {
    name: 'projects',
    path: '/projects',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.projects', icon: FolderKanban },
    componentLoader: () => import('./pages/projects/index.js'),
    children: [
      {
        // /projects/new: create dialog (RouteDialog)
        name: 'project-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/projects/new.js'),
      },
      {
        // /projects/:projectId: detail drawer (RouteDrawer)
        name: 'project-detail',
        path: ':projectId',
        authz: 'skip',
        componentLoader: () => import('./pages/projects/detail/index.js'),
        children: [
          {
            // /projects/:projectId/edit: edit dialog, stacked on the detail drawer
            name: 'project-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () => import('./pages/projects/detail/edit.js'),
          },
        ],
      },
    ],
  },
]);
```

| Field             | Description                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | Route name. Only letters, digits, `.`, `_` and `-` are allowed; kebab-case is recommended. Unique among the application's App routes. It is the target of route overrides, so do not change it after release |
| `path`            | A root route starts with `/`; a child route is one segment relative to its parent (`new`, `:projectId`). It cannot contain query parameters, `#`, `*` or `..`                                                |
| `auth`            | Who can open the page; see section 3. Defaults to `'required'`                                                                                                                                               |
| `authz`           | Page authorization; declare it on the first page of every path, nested pages inherit it; see section 4                                                                                                       |
| `navigation`      | Menu entry: `title` (translation key), `icon`, `order`; see section 6. Omit it when the page needs no menu entry                                                                                             |
| `breadcrumb`      | Breadcrumb title (translation key); see section 7                                                                                                                                                            |
| `componentLoader` | Lazily loads the page module; the module must `export default` the page component                                                                                                                            |
| `children`        | Child routes; see `child-routes.md`                                                                                                                                                                          |

Rules:

- **Keep `componentLoader` lazy**. Route information is declared synchronously, so the router can resolve navigation without downloading every page; page code is downloaded only when the page is visited.
- **Write import paths with the `.js` extension**, even when the source file is `.tsx`. This is how this project resolves modules, not a typo.
- **Paths are internal to the application**: do not write the deployment base path `/main`. The application is mounted under a base path (`/main` by default), and the runtime adds it automatically: `/projects` is `/main/projects` in the browser.
- **Reserved paths**: `/login`, `/register`, `/forgot-password` and `/reset-password` can only use `auth: 'guest'`. They are already declared in `client/routes.ts`, and their pages are in `client/pages/auth/`.
- App routes share one path space with settings pages and dev pages: do not declare an App route that starts with `/settings` or `/dev`, or it will conflict with them.

## 2. The page component

Put the page in `client/pages/<feature>/index.tsx`, default-export the component, and build its skeleton with `PageContainer` and `PageHeader`:

```tsx
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function ProjectsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <PageContainer>
      <PageHeader
        title={t('projects.title')}
        description={t('projects.description')}
        actions={
          // Create is the child route /projects/new; keep the query parameters so the filters survive closing the dialog.
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projects.create.action')}
          </Button>
        }
      />
      {/* Toolbar, table… */}
      {/* Child routes (create dialog, detail drawer) render here */}
      <Outlet />
    </PageContainer>
  );
}
```

- **`PageContainer`** (`@/components/page-container`) provides the page padding and the spacing between sections (`space-y-6`). Do not add another padded wrapper div.
- **`PageContainer` is provided by the component that owns the page, one per page**:
  - An inline child page (including tab content) renders inside the parent page's `PageContainer`; do not add another one.
  - A covering child page uses its own `PageContainer` inside `RouteChildPage` (see `child-routes.md`).
  - Dialog and drawer content uses the overlay's own container; do not add `PageContainer`.
- **`PageHeader`** (`@/components/page-header`) props: `title` (required), `description`, `actions` (on the right, for page-level actions). The title matches the menu name (guidelines L1, L3 and L5).
- A page with child routes must place `<Outlet />` itself, or the child route content does not render; put it at the end of `PageContainer`. For how to write child routes, see `child-routes.md` and `overlay.md`.
- Navigate to a child route with a relative path and keep the current query parameters: `new` for create, `String(id)` for detail, `` `${id}/edit` `` for edit, for example `<Link to={{ pathname: String(id), search: location.search }}>`.

## 3. auth: who can open the page

| Value      | Use for                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `required` | Only signed-in users can open it. A root route without `auth` gets this                              |
| `guest`    | Sign-in, registration, password reset. Signed-in users who visit are sent away                       |
| `optional` | Opens whether or not the user is signed in; the page adjusts its content to the sign-in state itself |

- Child routes inherit the entry route's `auth` and cannot change it (a different value raises an error at registration).
- Settings pages and dev pages always require sign-in; do not write `auth` on them.
- A signed-out user who visits a `required` page is taken to the sign-in page.
- **`auth` only governs navigation in the browser; it is not server security**. The endpoints the page calls must do their own authentication.

## 4. authz: page authorization

`authz` is a `{ resource: { type, id }, action }` request, `'skip'`, or `'unrestricted'`. Nothing is inferred from the route name. Menus, page loading and the permission set page all read the resolved value, which comes from the root down:

- **A page that declares `authz`** uses it. A malformed value raises an error at registration.
- **A nested page that omits it** inherits the value of its nearest ancestor page, through navigation groups and any number of levels. A child that declares its own value overrides it for itself and its descendants.
- **The first page on a path that omits it** still registers, and the application still starts, with a development warning naming the route, its path and the default applied. A protected App page (`auth: 'required'`) or a settings page becomes `'unrestricted'`: only identities with unrestricted access, such as root, may open it, and it is hidden from everyone else's menus. A `guest` or `optional` App page, or a dev page, becomes `'skip'`.

**Always declare `authz` on the first page of every path.** The default keeps an omission from stopping the application; it is not a design choice. `'unrestricted'` may also be declared explicitly for a page only root may open; nothing grants it, so it never appears in the permission set page.

**Rules:**

- The check follows `authz`, regardless of `auth`.
- A navigation group cannot have `authz` (it raises an error at registration) and carries no permission of its own.
- A child page renders only after the parent page's check passes. Writing `'skip'` on a child page does not bypass the parent page's check.
- Without permission, the menu entry is hidden, and opening the URL directly shows "Access denied" without loading the page component. While the check is pending, protected content is not shown; a failed check is treated as no permission.
- Administrators hold every page permission by default, and pages can be assigned to other people through the page grants of a permission set.
- **`auth` and `authz` both act only in the browser**. Endpoints must do their own authentication and authorization (`auth.required()`, `authorization.middleware()`) and cannot rely on the page's settings.

**How to choose:**

| Situation                                                                                            | What to write                                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Every signed-in user may use it (the home page; its endpoints are also open to every signed-in user) | `authz: 'skip'`                                                       |
| Only for people who have been granted access                                                         | `authz: { resource: { type: 'page', id: '<id>' }, action: 'access' }` |
| A child page that needs nothing beyond its parent's check                                            | Omit `authz` to inherit the parent's value, or write `authz: 'skip'`  |
| Only root, never assignable                                                                          | `authz: 'unrestricted'`                                               |
| A child page that needs its own authorization                                                        | `authz: { resource: { type: 'page', id: '<id>' }, action: 'access' }` |

A page and the endpoints it calls must agree: the example's `/api/projects` is open to every signed-in user, so the projects page uses `authz: 'skip'`.

**`authz: 'skip'` skips only this page's own check**; the sign-in requirement, the parent page's check and server authorization all still apply.

**The resource id is the permission identifier**: the permission set page lists every route whose `authz` checks `page` `access`, keyed by `authz.resource.id` (deduplicated), under the Pages entry with its navigation groups in menu order. Stored grants reference that id, so changing it requires migrating them; renaming the route alone does not.

## 5. Three kinds of routes

| Function                 | Mounted at         | For                                    |
| ------------------------ | ------------------ | -------------------------------------- |
| `defineAppRoutes()`      | `/projects`        | Ordinary business pages                |
| `defineSettingsRoutes()` | `/settings/<path>` | Administration and configuration pages |
| `defineDevRoutes()`      | `/dev/<path>`      | Tool pages used only in development    |

Do not repeat `/settings` or `/dev` in the path; writing `/projects` mounts it under the matching prefix. Settings pages and dev pages are two separate path spaces and can use the same relative path. All three kinds are declared the same way (pages, groups, `children`), and all of them go in `client/routes.ts`.

### Settings pages

The template's `settingsRoutes` is an empty array by default. Add an entry to it, and again add the icon to the `lucide-react` import at the top of the file (here `SlidersHorizontal`):

```ts
const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    // Only administrators and people assigned this page can open it.
    authz: {
      resource: { type: 'page', id: 'project-settings' },
      action: 'access',
    },
    componentLoader: () => import('./pages/settings/projects.js'),
    name: 'project-settings',
    navigation: {
      title: 'navigation.projectSettings',
      icon: SlidersHorizontal,
      order: 100,
    },
    // Mounted at /settings/projects.
    path: '/projects',
  },
]);
```

- **Declare a settings page's check**, or `'skip'` for a page every signed-in user who can enter the settings area may open, and have its server endpoints check the same rule. A settings page that omits it defaults to `'unrestricted'`, which only root may open.
- How to write `authz`:
  - An ordinary application settings page uses a page permission, `{ resource: { type: 'page', id: '<route-name>' }, action: 'access' }` (as in the example above). Administrators hold it by default, and it can be assigned through the page grants of a permission set.
  - A feature that must distinguish "view" from "modify", with the server checking the same management resource, uses a resource of type `settings` (for example `{ resource: { type: 'settings', id: '<resource-name>' }, action: 'read' }`) and registers that resource on the server; read the `nocobase-app-plugin-authorization` Skill first. Actions are business actions (`read`, `update`); there is no conversion such as `list`, `show` or `edit`.
- `authz` is checked before the page loads; without permission the page disappears from the settings menu, and opening its URL directly does not load the component either.
- The header shows the "Settings" entry only when the user can open at least one settings page.
- `navigation.order` sets the position in the menu; lower numbers come first.
- For tabs and detail child pages in settings pages, see `child-routes.md`.

### Dev pages

Pages declared with `defineDevRoutes()`, and modules imported only by them, are left out of the production build. This is a build boundary, not a permission boundary: a page whose access must also be restricted in production should be a settings page with `authz`, checked on the server.

### Contribute pages to another plugin's settings group

A root settings entry can declare `parent: '<group-name>'` to be appended to an existing settings group, such as the authorization plugin's `authorization` group:

```ts
const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  // … existing settings pages
  {
    // Appended to the authorization plugin's authorization group; path is relative to that group, so the actual URL is /settings/authorization/audit-logs.
    parent: 'authorization',
    name: 'audit-logs',
    path: '/audit-logs',
    navigation: { title: 'navigation.auditLogs' },
    authz: { resource: { type: 'page', id: 'audit-logs' }, action: 'access' },
    componentLoader: () => import('./pages/settings/audit-logs.js'),
  },
]);
```

- The target group is referenced by its unique name. It can be a nested group, and it can be declared by a plugin registered later.
- An appended route's `path` is relative to the target group; its translation namespace remains the contributor's own (the application's).
- Both pages and groups can be appended this way. Only root entries can declare `parent`; entries inside `children` cannot.
- A group can declare empty `children` for others to append to. Its own children come first, and appended entries follow in plugin and entry registration order.
- A missing target, a target that is a page rather than a group, a cycle, a duplicate name among siblings, and a path conflict all raise an error; groups are never silently merged.
- Root entries without `parent` still sit directly under the settings menu.
- `parent` is not limited to settings pages: root entries of `defineAppRoutes()` and `defineDevRoutes()` also accept `parent`, whose value is a group name in the same package or `package-name:group-name`.

## 6. Menus

Write `navigation` on the route. The application sidebar, the settings menu and the dev menu all read their menu entries from route declarations.

| Field   | Description                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------- |
| `title` | Translation key, resolved in the namespace that owns the route (`client/locales/` for application routes) |
| `icon`  | Optional. An icon component that accepts `className`; use `lucide-react` icons directly                   |
| `order` | Optional. Lower numbers come first among siblings; defaults to 0. Equal values keep registration order    |

- Add the translations to the existing `navigation` group in `client/locales/en-US.ts` and `zh-CN.ts`, for example `projects: 'Projects'` and `projects: '项目'`.
- Pages that should not appear in the menu (details, tab content and so on) have no `navigation`. When such a page is open, the menu highlights the nearest ancestor that has a menu entry.
- **A path with a parameter (`:projectId`) or a wildcard cannot have `navigation`**; registration raises an error, because a menu entry must point to a fixed URL.
- Navigation group: write only `name`, `navigation` and `children`, without `componentLoader`. For groups and clickable parents, see `child-routes.md`.
- Do not change the shell (`client/layouts/`) or the ServiceProvider to add a menu entry, and do not add a Refine resource for a menu. Refine resources are only for CRUD integration and produce no menu entries; the home page entry is declared in the routes as well.
- A new page with a menu entry usually touches only three places: `client/routes.ts`, the page component and `client/locales/`.

## 7. Breadcrumbs

The route tree behind the breadcrumbs is provided by the layout the page is in: `AppLayout` for business pages, `SettingsLayout` for settings pages and `DevLayout` for dev pages. `StandalonePageLayout` does not provide one at present, so breadcrumbs placed there show nothing.

`navigation` defines the menu entry and `breadcrumb` defines the breadcrumb title; neither replaces the other. To get both a menu entry and a breadcrumb, write both. `breadcrumb.title` is a static translation key and can be used on a path with parameters:

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
        authz: 'skip',
        componentLoader: () => import('./pages/projects/import.js'),
      },
    ],
  },
]);
```

The page places `<Breadcrumbs />` (`@/components/breadcrumbs`) itself: inside `PageContainer`, above `PageHeader`. For a complete page, see "Covering child pages" in `child-routes.md`.

Breadcrumbs are generated from the matched route levels:

- Only routes with `breadcrumb` appear. Tab, dialog and drawer routes do not declare it.
- The trail is shown only when at least two matched routes declare `breadcrumb`. The parent route alone is not enough.
- Earlier page levels link to their actual URLs; a group without a component is shown as plain text. The last level is the current page and is not a link.
- The title names the page type ("Project details"), not a specific record ("Project #42"); the record name goes in the page title.

## 8. Show actions by permission (useCan)

Use `useCan` from `@nocobase/app-plugin-authorization/client` to decide whether buttons and other UI elements are shown:

```tsx
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { DownloadIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

export interface ExportProjectsButtonProps {
  readonly onExport: () => void;
}

export function ExportProjectsButton({
  onExport,
}: ExportProjectsButtonProps): ReactElement | null {
  const { t } = useTranslation();
  // resource and action must match exactly what the server registers and the endpoint checks.
  const { can } = useCan({
    resource: { type: 'resource', id: 'projects' },
    action: 'export',
  });

  // can is false while the check is pending and when it fails: the button is not shown, so it never appears and then disappears.
  if (!can) return null;

  return (
    <Button variant='outline' onClick={onExport}>
      <DownloadIcon data-icon='inline-start' />
      {t('projects.export.action')}
    </Button>
  );
}
```

- It returns `{ can, isPending, error, retry }` and follows live updates to the current session and permissions. `can` is `false` both while the check is pending and when it fails.
- Like any other hook, call it only at the top level of a component, never inside a condition; when no check is needed, pass `{ enabled: false }` as the second argument.
- When a whole block of content depends on the permission, show a loading state for `isPending` and a retryable error for `error` (calling `retry`); do not show stale actions.
- Use it for page permissions too, for example for an entry on the home page that points to a page: `useCan({ resource: { type: 'page', id: 'projects' }, action: 'access' })`. A route's `authz` uses the same `{ resource: { type, id }, action }`.
- **`useCan` answers "does this user have this feature", not "can this record be acted on"**. For actions that depend on record state or data scope, the server returns the actions available for each record in the list or detail response, and the UI shows them accordingly; the endpoint checks again when it executes.
- Hide actions the user has no permission for; disable actions that are temporarily unavailable and explain why in a tooltip (guideline I7).
- In a component, get the authorization client with `useAuthorizationClient()`; outside React, resolve `authorizationClientToken` from the application container and call `client.can({ resource, action })`. When state you maintain yourself must reload after permissions change, use `useAuthorizationRevision()`. Do not use Refine's permission configuration or a global authorization client, and do not store permission results in module-level variables (they linger after switching accounts).
- **Hiding something in the UI does not replace endpoint authorization.**
- When the business has different job responsibilities, data scopes or field permissions, read the `nocobase-app-plugin-authorization` Skill first, then design the pages, business actions and record scopes.

## 9. Disable a feature (keep the page)

When the user asks to disable or hide a feature, make it reversible by default:

- Keep the page module, components and route definition; do not delete page files, dependencies or business data (unless the user explicitly asks for permanent removal).
- Control it with a flag the application owns: use the flag to decide whether the route goes into `defineAppRoutes([...])`, or keep the route and have the page show "Unavailable" or redirect. Hide links, buttons and menu entries with the same flag.
- Use only route APIs that actually exist: routes have no option such as `hidden` or `enabled`; do not invent one.
- **If only the menu entry is removed, the URL can still be opened directly.**
- A flag in the browser only affects what is shown; it enforces nothing. The server must reject disabled operations independently, including direct endpoint calls.
- Verify that the UI is hidden, what happens when the URL is opened directly, and that endpoint calls are rejected; also tell the user how to re-enable the feature on the frontend and on the backend.

## 10. Customize a plugin's pages

Do not declare a plugin's own page route a second time: registering another `/install` is a conflict, not a customization. Pick one of these, in order of preference:

1. **Plugin options**: when the plugin supports them, pass options where the plugin is registered in `client/plugins.ts`, for example `users({ mount: 'settings', path: '/users' })`.
2. **Source extension**: create `client/extensions/<name>/extension.ts`; it is discovered automatically.
3. **Route override**: add an entry to `client/route-overrides.ts`; its `routeId` is `<plugin-package>:<route-name>`.

- An override replaces only `componentLoader`. The route identity, path, `auth` and owning plugin stay the same.
- Source extensions and route overrides apply only to App routes (those declared with `defineAppRoutes()`); a plugin's settings pages and dev pages are not covered.
- Keep the replacement page lazy, declare `componentEntry` so tools can find the source file, and default-export the component.
- **A route can be overridden only once across the three mechanisms**; a second override raises an error that names the route id. Pick one; do not stack them.
- Sign-in, registration, forgot password and reset password are the application's own routes, not the plugin's: edit the matching page in `client/pages/auth/` directly, and do not add another mechanism.

## 11. Where rendering happens

- `client/routing/` renders routes, checks access, and handles loading and error states.
- `client/layouts/` holds the three layouts: App, Settings and Dev; `client/layouts/components/` holds the containers, navigation, branding and account controls they share. Each layout owns its own permissions and route rendering.
- Declare business routes only in `client/routes.ts`, never in the directories above.

When customizing the shell, preserve these existing behaviors:

- The header's "Settings" entry appears only when the user can open at least one settings page; the "Dev tools" entry appears only in development and must not reach the production build.
- Navigation groups keep their expanded or collapsed state while the navigation tree stays mounted; opening a new page expands its ancestor groups without collapsing the others. Keep App, Settings and Dev consistent.
- The authorization provider clears the permission snapshot before rendering a new session; route navigation and page guards subscribe to the authorization revision, so account switches and permission changes take effect without a reload.
- When signing out, the account menu checks the result from Better Auth and shows a localized error message on failure; do not treat navigating away as having signed out.

## 12. Update the route test

`tests/logic/client-routes.test.ts` checks the application's routes:

- `keeps the landing page and the authentication pages`: the home page and the four authentication pages still exist. Adding a page does not require changing it.
- `loads every page component`: calls every page's `componentLoader` in turn (including child routes at every level, settings pages and dev pages) and confirms that the module default-exports a component. Adding a page does not require changing it; it fails when a page file has no default export.
- `never imports or routes a reference page`: application code neither imports nor routes files under `client/pages/reference/`. Do not change it.
- `pins the route names page grants are stored against`: lists, in depth-first order, every page in the app routes that requires sign-in, including child routes (settings pages and dev pages excluded). **When you add a page that requires sign-in, add it here**: `authorizedAs` is `null` for a page whose resolved `authz` is `'skip'`, `'unrestricted'` for an unrestricted-only page, and the resource id for a page that checks page access; a nested page that omits `authz` shows its parent's value. The example's projects routes add `projects`, `project-new`, `project-detail` and `project-edit`, all `null`. Stored page grants reference the resource id, and changing one requires migrating existing grants, so this list is deliberately pinned.

After the change, run `pnpm exec vitest run tests/logic/client-routes.test.ts`.

## 13. Verify

- The page opens at its path, including with the deployment base path in the browser (for example `/main/projects`); after a reload it stays on the current page.
- The menu entry appears in the sidebar, its text is correct in every language, and it is highlighted when the page is open.
- Visiting a `required` page while signed out redirects to the sign-in page.
- Without permission, a page with `authz` disappears from the menu, and opening its URL directly does not load the page component.
- Opening a child route URL directly (for example `/projects/1` or `/projects/1/edit`) shows both the parent page and the child route correctly.
- Page code loads only on navigation and is not in the initial bundle.
- Call the endpoints the page uses directly as an ordinary user, and confirm that server authorization matches the page settings.
