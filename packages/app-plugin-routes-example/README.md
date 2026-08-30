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
- `client/providers.ts` contributes a synchronous application Provider with
  `defineClientProviders`;
- `client/components/` contains Provider component implementations;
- `client/contexts/` contains shared React contexts and their hooks;
- `client/pages/routes-example-page.tsx` is loaded only when that page route is
  visited and calls the server route through `@nocobase/app-sdk`.

The plugin owns its required shadcn primitives under `client/components/ui`.
Add more with `pnpm exec shadcn add <name>`, then retain explicit exported
types and relative `.js` imports required by this declaration-emitting ESM
package.

The plugin manifest exposes the client contributions independently:

```json
{
  "client": {
    "routes": "./client/routes",
    "providers": "./client/providers"
  }
}
```

The Root Route and API Route each resolve the public Authentication Token and
install `auth.required()` on their own router. Neither depends on App
middleware, the other Route, or Server contribution order. The App Route guard
and Settings access independently protect browser navigation; Client checks do
not replace Server authentication or authorization.

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
