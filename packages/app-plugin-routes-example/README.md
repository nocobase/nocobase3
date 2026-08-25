# @nocobase/app-plugin-routes-example

This full-stack routes example demonstrates both sides of an application
plugin:

- `server/routes/index.ts` registers `GET /api/routes-example`;
- `client/routes.ts` declares the authenticated `/routes-example` page with
  `defineClientRoutes`;
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

The page and API are both authenticated. The App's shared `/api/*` middleware
remains authoritative for the server route; the client route guard is only the
browser navigation boundary.

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
