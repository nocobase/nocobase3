# App Client Instructions

This directory is the active Default App browser client.

- Never import from or edit `../client-old/`; it is a temporary migration
  archive, not a source dependency.
- Keep the Default App contribution boundary explicit in `application.ts`.
- Put application startup contributions in `bootstrap.ts`, application-owned
  route declarations in `routes.ts`, and application Provider declarations in
  `providers.ts`.
- Register plugin client extensions in `plugins.ts`. Array order is bootstrap
  order and presence in the array is what enables a plugin. Let
  `pnpm plugin:register` and `pnpm plugin:unregister` write this file; edit it
  by hand only to reorder entries or to pass a plugin its options.
- Keep plugin capability setup in plugin `client/bootstrap` entries.
- Keep plugin route path and auth metadata in plugin `client/routes` entries.
- A plugin's own `client/plugin.ts` should not statically import its business
  implementation, because `plugins.ts` imports it statically and pulls whatever
  it references into the entry chunk. Reference the entries with
  `() => import()` and use `import type` for types. This is a recommendation,
  not a validated rule.
- Keep route rendering, auth grouping, loading, and error handling under
  `routing/`; do not declare product routes there.
- Put application-only page composition and branding here.
- Customize a plugin route through an option on the plugin's own registration
  in `plugins.ts`, a discovered `extensions/*/extension.ts` source extension,
  or `route-overrides.ts`; do not register a duplicate path such as `/login`.
- A route override may replace only `componentLoader`. Keep it lazy, include an
  inspectable `componentEntry`, and default-export the page component. One
  route takes one override across all three sources; a second one fails with
  the route ID.
- Authentication UI belongs in `extensions/nocobase-auth-ui/`. Use `AuthLink`
  from `@nocobase/app-plugin-authentication/client/ui`, keep final password
  forms local under the Registry `forms/` directory, and use
  `@nocobase/app-plugin-authentication/client/actions` for custom variants.
  This directory is the Default Template's preinstalled, application-owned
  snapshot; its upstream recipe lives in the authentication plugin.
- Use Refine hooks and providers for authentication state. Do not call Better
  Auth endpoints directly from pages or create another session store.
- Keep app-wide theme and loading behavior applicable to plugin pages.
- Provider layers are outer-to-inner: `root`, `application`, `extension`.
  Application providers may use the first two; plugins own the extension
  layer. Use `before` and `after` only inside one layer.

Before finishing client changes, run the Default App lint, typecheck, tests,
build, and `pnpm client:inspect`.
