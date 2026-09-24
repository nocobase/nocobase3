---
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
'@nocobase/app-skills': patch
---

Move `PageContainer`, `PageHeader`, `RouteDialog`, `RouteDrawer`, `RouteChildPage` and `useRouteOverlay` out of the templates' `client/components/` and into the NocoBase UI Library, which now publishes them as the `page-ui` and `route-overlay-ui` items. New applications receive them preinstalled under `client/extensions/nocobase-page-ui/` and `client/extensions/nocobase-route-overlay-ui/`, and import them from there, for example `@/extensions/nocobase-page-ui/components/page-header`; plugins install the same items instead of copying template files. The route overlays' close button is now translated under `routeOverlay.close` rather than `actions.close`. The application development Skill points at the new locations. Existing applications keep their own copies in `client/components/` and need no change; to adopt the library versions, install both items with `npx shadcn@latest add @nocobase/page-ui @nocobase/route-overlay-ui`, update the imports, and add `routeOverlay.close` to `client/locales/`.
