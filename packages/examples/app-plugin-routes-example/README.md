# @nocobase/app-plugin-routes-example

This full-stack Routes example is the normative reference for the five Route
types contributed by an application plugin:

- `server/routes/root.ts` contributes authenticated
  `GET /routes-example/root` with `defineRootRoutes()`;
- `server/routes/api.ts` contributes authenticated
  `GET /api/routes-example` with `defineApiRoutes()`;
- `client/routes.ts` contributes the authenticated `/routes-example` page with
  `defineAppRoutes()` and `/settings/routes-example` with
  `defineSettingsRoutes()`, plus the development-only `/dev/routes-example`
  page with `defineDevRoutes()`;
- `client/react-providers.ts` contributes a synchronous React Provider with
  `defineClientReactProviders`;
- `client/components/` contains React Provider component implementations;
- `client/contexts/` contains shared React contexts and their hooks;
- `client/pages/routes-example-page.tsx` is loaded only when that page route is
  visited and calls the server route through the Application's API client,
  resolved from `@nocobase/app-client`.

The plugin owns its required shadcn primitives under `client/components/ui`.
Add more with `pnpm exec shadcn add <name>`, then retain explicit exported
types and relative `.js` imports required by this declaration-emitting ESM
package.

The Client plugin declaration statically contributes `routes` and
`reactProviders`; route page components remain lazy through `componentLoader()`.

All three Client route APIs accept `navigation` for menu entries and `children`
for nested pages or navigation groups. Omit `navigation` for a page without a
menu entry, as the App page in this example does. Pages with children must place
`<Outlet />` at the intended content location; pure navigation groups have no
`componentLoader`. Refine resources serve CRUD configuration, not menus.

The Root Route and API Route each resolve the public Authentication Token and
install `auth.required()` on their own router. Neither depends on App
middleware, the other Route, or Server contribution order. The App Route guard
and Settings access independently protect browser navigation; Client checks do
not replace Server authentication or authorization.

The two small Server Routes are declared directly inside their production
contribution factories, and their tests execute the real `createRouter()`
functions with a test container. Complex domains may instead extract a focused
factory that returns its own `Hono`; do not add a helper that mutates a caller's
router only to make tests easier. See the Server and Client Route best-practice
pages under `internal-docs/development/plugin-development/` for the complete patterns.

The Examples template already registers this plugin. To enable it in another
workspace App, run from the repository root, choosing the target with `--app`:

```bash
pnpm plugin:register @nocobase/app-plugin-routes-example --app app-template-default --dry-run --json
pnpm plugin:register @nocobase/app-plugin-routes-example --app app-template-default
```

Registration updates the App's package dependency and adds explicit entries to
`client/plugins.ts` and `server/plugins.ts`. Setting `enabled: true` in
`package.json#nocobase.plugins` alone does not register the routes.

The Client entry imports the factory from
`@nocobase/app-plugin-routes-example/client` and adds `routesExample()` to
`defineClientPlugins()`. The Server entry imports the definition from
`@nocobase/app-plugin-routes-example/server` and adds `routesExample` to
`defineServerPlugins()` without calling it. Keep the App's existing registrations,
including authentication. See the Examples template's
[Client registration](../../templates/app-template-examples/client/plugins.ts)
and [Server registration](../../templates/app-template-examples/server/plugins.ts)
for complete examples.

The page URL includes the App's configured basename. For example, with
`APP_BASE_PATH=/main`, open `/main/routes-example`; its API request is sent to
`/main/api/routes-example`.
