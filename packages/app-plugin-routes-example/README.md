# @nocobase/app-plugin-routes-example

This full-stack Routes example is the normative reference for the four Route
types contributed by an application plugin:

- `server/routes/root.ts` contributes authenticated
  `GET /routes-example/root` with `defineRootRoutes()`;
- `server/routes/api.ts` contributes authenticated
  `GET /api/routes-example` with `defineApiRoutes()`;
- `client/routes.ts` contributes the authenticated `/routes-example` page with
  `defineAppRoutes()` and `/settings/routes-example` with
  `defineSettingsRoutes()`;
- `client/react-wrappers.ts` contributes a synchronous React Wrapper with
  `defineClientReactWrappers`;
- `client/components/` contains React Wrapper component implementations;
- `client/contexts/` contains shared React contexts and their hooks;
- `client/pages/routes-example-page.tsx` is loaded only when that page route is
  visited and calls the server route through `@nocobase/app-sdk`.

The plugin owns its required shadcn primitives under `client/components/ui`.
Add more with `pnpm exec shadcn add <name>`, then retain explicit exported
types and relative `.js` imports required by this declaration-emitting ESM
package.

The Client plugin declaration statically contributes `routes` and
`reactWrappers`; route page components remain lazy through `componentLoader()`.

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
pages under `docs/development/plugin-development/` for the complete patterns.

Enable the plugin in an App package with:

```json
{
  "devDependencies": {
    "@nocobase/app-plugin-routes-example": "workspace:^"
  },
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-routes-example": {
        "enabled": true
      }
    }
  }
}
```

The page URL includes the App's configured basename. For example, with
`APP_BASE_PATH=/main`, open `/main/routes-example`; its API request is sent to
`/main/api/routes-example`.
