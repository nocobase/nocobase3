# Default App Development Guidelines

This package is the reference application for the new `@nocobase/app-client`
and `@nocobase/app-server` architecture. Follow the repository root
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

Do not redeclare a plugin route merely to customize its UI. Put application
component replacements in `client/route-overrides.ts`. Overrides may replace
only `componentLoader`; route identity, path, auth mode, and plugin ownership
remain unchanged. Keep every route page lazy-loaded and default-export its
component.

Authentication-specific UI customization belongs in `client/auth/`. Reuse the
stable `@nocobase/app-plugin-authentication/client/ui` exports for forms and
links. Do not call Better Auth endpoints directly from page components or
duplicate session state; use the Refine authentication hooks exposed by those
components. See `client/auth/README.md` for the edit map.

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
