# Client Instructions

This directory is the application's browser client. Read the application's root `AGENTS.md` first; `.agents/skills/nocobase-app-development/references/` holds the detail behind it.

## What lives where

- `routes.ts` declares your page routes. `pages/` holds the components they load.
- `components/` holds your components; `components/ui/` holds shadcn/ui primitives added with `pnpm exec shadcn add`.
- `locales/` holds every user-visible string.
- `runtime.ts` is the composition root. `service-provider.ts` holds startup logic and Refine resources for CRUD integration. `react-providers.ts` holds your React context providers, and `plugins.ts` lists the plugins the browser loads. Sidebar entries come from route `navigation` declarations.
- `routing/`, `layouts/`, and `theme/` are the framework structure: route rendering and access checks, the App, Settings and Dev layouts, their shared components in `layouts/components/`, and the theme provider. The template evolves these, so an edit here is what a future upgrade has to reconcile — prefer the built-in mechanism, and when you do change them, comment why. Do not declare product routes in any of them.
- `extensions/` holds application-owned copies of plugin-published UI. A copy may add an `extension.ts`, which the runtime discovers automatically as a source extension.

## Rules

- Keep every page behind a lazy `componentLoader()`, default-exporting its component. Route metadata stays synchronous.
- All three route surfaces define sidebar entries with `navigation` on routes. Refine resources serve CRUD, not menus. Recursive groups organize navigation; page children require a manually placed `Outlet`. Read `.agents/skills/nocobase-app-development/references/client-child-routes.md` from the application root.
- For URL-addressable dialogs and drawers, first add the child route in `client/routes.ts` inside `defineAppRoutes()`, then place the owning page's `Outlet`, and finally render the child with `RouteDialog` or `RouteDrawer`. Use `useRouteOverlay()` for closing only in a descendant component rendered inside that overlay (including a `footer` component), never in the page component that returns its wrapper. Otherwise the hook throws or, with nested overlays, reads the parent overlay and closes the wrong layer. Read the child-routes guide before implementing overlays or close guards.
- Never write the deployment base path such as `/main` into a route path. The runtime restores it.
- `auth` on a route controls browser navigation only. The endpoint it calls enforces its own authentication.
- `authz` controls the current page's authorization: use `{ resource: { type: 'page', id: 'orders' }, action: 'access' }` or `'skip'`. Omitted rules are normalized at registration: authenticated App pages without a page ancestor check their name as a page resource; child pages, Settings, Dev, guest and optional pages add no check. Parent guards still apply when a child skips. Menus and page loaders consume the same normalized rule; endpoints enforce their own authorization.
- A route's `name` is the stable identifier page grants are stored against. Renaming a route is a data change, not a refactor: every stored grant naming the old name has to be migrated, or it silently stops granting anything and the page disappears for the users who had it.
- Pages declared with `defineDevRoutes()` mount under `/dev` and are absent from a production build. That is a build boundary, not a permission boundary.
- Register plugins with `pnpm plugin:register` and `pnpm plugin:unregister`. Edit `plugins.ts` by hand only to reorder entries or pass a plugin its options; array order is contribution order and presence enables the plugin.
- To customize a page a plugin owns, use a plugin option, an `extensions/*/extension.ts` source extension, or `route-overrides.ts`. Do not declare a duplicate path such as `/install`. An override replaces only `componentLoader`, keeps it lazy, includes a `componentEntry`, and default-exports the component. One route takes one override across all three mechanisms.
- Authentication pages are application routes. Declare `/login`, `/register`, `/forgot-password`, and `/reset-password` in `client/routes.ts` and lazy-load the corresponding default-exported page from `client/pages/auth/`. The pages use relative links so the application's router and basename remain the source of truth; use the plugin's `client/actions` hooks and do not call auth endpoints directly from a page or create a second session store.
- Style with semantic Tailwind tokens — `bg-background`, `text-foreground`, `border-border` — so pages follow both themes. Never hard-code colors, and never restyle one page in isolation; change the tokens in `theme/themes/*.css` if the look must change.
- Every user-visible string goes through a translation key.
- React provider layers are outer-to-inner: `root`, `application`, `extension`. Applications use the first two; plugins own the extension layer. `before` and `after` order only within one layer.

Before finishing, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. Use `pnpm client:inspect` when a contribution does not appear where you expect — it reports composition, not correctness.

For UI styling, use the shared color, font, size, spacing, radius and shadow contract in `.agents/skills/nocobase-app-development/references/theme-tokens.md` (from the application root). Prefer its Tailwind utilities so components respond to theme changes; keep deliberate fixed-size exceptions explicit.

## Layout containers

`layouts/components/layout-header.tsx` and `layouts/components/layout-sidebar.tsx` are presentation containers accepting ordinary children. Each of `AppLayout`, `SettingsLayout`, and `DevLayout` owns its arrangement, sidebar state, permission queries and route rendering. Keep menus, branding, action visibility and page redirects out of the containers. Supply an accessible sidebar label and a mobile close button from the owning layout. Sidebar contents own their scroll regions and their collapsed presentation; the container never rewrites children.
