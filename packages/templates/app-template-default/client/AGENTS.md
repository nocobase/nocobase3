# Client Instructions

This directory is the application's browser client. Read the application's root `AGENTS.md` first; `skills/nocobase-app-development/references/` holds the detail behind it.

## What lives where

- `routes.ts` declares your page routes. `pages/` holds the components they load.
- `components/` holds your components; `components/ui/` holds shadcn/ui primitives added with `pnpm exec shadcn add`.
- `locales/` holds every user-visible string.
- `runtime.ts` is the composition root. `service-provider.ts` holds startup logic and the Refine resources that populate the sidebar, `react-providers.ts` your React context providers, and `plugins.ts` the plugins the browser loads.
- `routing/`, `layouts/`, `shell/`, and `theme/` are the framework structure: route rendering and access checks, the settings and dev shells, the authenticated chrome, and the theme provider. The template evolves these, so an edit here is what a future upgrade has to reconcile — prefer the built-in mechanism, and when you do change them, comment why. Do not declare product routes in any of them.
- `extensions/*/extension.ts` are application-owned copies of plugin-published UI, discovered automatically.

## Rules

- Keep every page behind a lazy `componentLoader()`, default-exporting its component. Route metadata stays synchronous.
- A route makes the URL work; it does not add a sidebar entry. That needs a Refine resource in `service-provider.ts` whose `list` matches the route path, with `meta.label` as a translation key and `meta.i18nNs` set to `APP_NS`. Settings and dev pages instead use the route's own `navigation` field.
- Never write the deployment base path such as `/main` into a route path. The runtime restores it.
- `auth` on a route controls browser navigation only. The endpoint it calls enforces its own authentication.
- Pages declared with `defineDevRoutes()` mount under `/dev` and are absent from a production build. That is a build boundary, not a permission boundary.
- Register plugins with `pnpm plugin:register` and `pnpm plugin:unregister`. Edit `plugins.ts` by hand only to reorder entries or pass a plugin its options; array order is contribution order and presence enables the plugin.
- To customize a plugin's page, use a plugin option, an `extensions/*/extension.ts` source extension, or `route-overrides.ts`. Do not declare a duplicate path such as `/login`. An override replaces only `componentLoader`, keeps it lazy, includes a `componentEntry`, and default-exports the component. One route takes one override across all three mechanisms.
- Authentication UI belongs in `extensions/nocobase-auth-ui/`. Use `AuthLink` from `@nocobase/app-plugin-authentication/client/ui` and the plugin's `client/actions` hooks. Do not call auth endpoints directly from a page or create a second session store.
- Style with semantic Tailwind tokens — `bg-background`, `text-foreground`, `border-border` — so pages follow both themes. Never hard-code colors, and never restyle one page in isolation; change the tokens in `styles.css` if the look must change.
- Every user-visible string goes through a translation key.
- React provider layers are outer-to-inner: `root`, `application`, `extension`. Applications use the first two; plugins own the extension layer. `before` and `after` order only within one layer.

Before finishing, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. Use `pnpm client:inspect` when a contribution does not appear where you expect — it reports composition, not correctness.
