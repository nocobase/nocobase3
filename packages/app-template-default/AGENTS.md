# Default App Development Guidelines

This package is the reference application for the new `@nocobase/app-client`
and `@nocobase/app-server-kit` architecture. Follow the repository root
`AGENTS.md` first, then these package-specific rules.

## Use the current client architecture

The active browser application is `client/`. `client-old/` is a temporary,
untracked migration archive. Never import from it, copy its routing/provider
architecture, stage it, or treat it as current source. It may be consulted only
as a short-lived visual reference and will be deleted after migration.

Enabled App plugins are declared in `package.json` under both
`devDependencies` and `nocobase.plugins`. Use the repository commands to change
that registry:

```bash
pnpm plugin:register <name> --app app-template-default
pnpm plugin:unregister <name> --app app-template-default
```

## Keep extension ownership explicit

- Plugin `client/bootstrap` entries register Refine capabilities such as auth,
  data, notification, and live providers.
- Plugin `client/routes` entries own route ID, path, and authentication mode.
- Plugin `client/providers` entries declare synchronous React providers and
  explicit ordering constraints.
- The application owns its root route, theme, page composition, branding,
  loading states, and final provider tree.

Do not redeclare a plugin route merely to customize its UI. Application source
extensions under `client/extensions/*/extension.ts` may contribute component
replacements; `client/route-overrides.ts` remains available for direct
application overrides. Overrides may replace only `componentLoader`; route
identity, path, auth mode, and plugin ownership remain unchanged. Keep every
route page lazy-loaded and default-export its component.

Authentication-specific UI customization belongs in the installed
`client/extensions/nocobase-auth-ui/` Registry source. Reuse `AuthLink` from the
stable `@nocobase/app-plugin-authentication/client/ui` export, keep the final
password forms in the Registry `forms/` directory, and use `client/actions` for
a fully custom form. Do not call Better Auth endpoints directly from page
components or duplicate session state. See
`client/extensions/nocobase-auth-ui/README.md` for the edit map.
The upstream recipe is published by
`@nocobase/app-plugin-authentication/registry/auth-ui`; do not restore a second
canonical copy under this package's `registry/` directory.

## Keep the client inspectable

Run the inspector before changing client ownership or contribution wiring:

```bash
pnpm app:client:inspect --app app-template-default
pnpm app:client:inspect --app app-template-default --json
```

The output distinguishes the plugin-owned route entry from the final component
source. When adding an application override, give it a `componentEntry` so the
CLI and future Agents can locate the owning file.

## Dependencies and tests

This application ships built output, so browser build-time packages belong in
`devDependencies`. Use `workspace:` for internal packages and `catalog:` for
shared critical dependencies. After dependency changes, run:

```bash
CI=true pnpm install --no-frozen-lockfile
```

Keep tests under `tests/logic` or `e2e`, never beside client source. After a
change, run at least:

```bash
pnpm --filter @nocobase/app-template-default lint
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```
