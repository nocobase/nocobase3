# Default App Development Guidelines

This package is the reference application for the new `@nocobase/app-client`
and `@nocobase/app-server-kit` architecture. Follow the repository root
`AGENTS.md` first, then these package-specific rules.

## Use the current client architecture

The active browser application is `client/`. `client-old/` is a temporary,
untracked migration archive. Never import from it, copy its routing/provider
architecture, stage it, or treat it as current source. It may be consulted only
as a short-lived visual reference and will be deleted after migration.

A plugin's client extensions are registered in `client/plugins.ts`. Being in
that array is what enables them and the array order is the bootstrap order;
there is no `enabled` flag on the client side.

`nocobase.plugins` in `package.json` still exists and is still authoritative
for everything else: the server bootstrap and server routes, the migration,
seed, and job sources, the dev watch paths, and which workspace packages the
build filters on. This phase moved only the client side out of it, so a plugin
that contributes on the server stays declared there. `devDependencies` still
carries the dependency itself.

Both places are written by the repository commands; do not edit either by hand:

```bash
pnpm plugin:register <name> --app app-template-default
pnpm plugin:unregister <name> --app app-template-default
```

`plugin:register` adds the `devDependencies` entry and the `nocobase.plugins`
entry, appends an import and an array item to `client/plugins.ts`, and copies
the plugin's skills into `.agents/skills/`. `--disabled` records
`enabled: false` and leaves `client/plugins.ts` alone; `--no-skills` skips the
skills copy. `plugin:unregister` reverses all of it. Run
`pnpm plugin:skills:sync` on its own after a plugin upgrade changes its skills.

Directories under `.agents/skills/` whose names start with `nocobase-` are
synchronized output, replaced wholesale on the next sync. Application-owned
skills belong in a directory that does not start with that prefix.

## Keep extension ownership explicit

- Plugin `client/plugin` entries are the registration surface: package name,
  the loaders for the three entries below, and the options the plugin accepts.
- Plugin `client/bootstrap` entries register Refine capabilities such as auth,
  data, notification, and live providers.
- Plugin `client/routes` entries own route ID, path, and authentication mode.
- Plugin `client/providers` entries declare synchronous React providers and
  explicit ordering constraints.
- The application owns its root route, theme, page composition, branding,
  loading states, and final provider tree.

Do not redeclare a plugin route merely to customize its UI. A plugin that
exposes an option for the page takes it through `client/plugins.ts`;
otherwise, application source extensions under
`client/extensions/*/extension.ts` may contribute component replacements and
`client/route-overrides.ts` remains available for direct application
overrides. Overrides may replace only `componentLoader`; route identity, path,
auth mode, and plugin ownership remain unchanged. A route may be overridden
exactly once across all three sources, so pick one rather than layering two.
Keep every route page lazy-loaded and default-export its component.

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
pnpm client:inspect
pnpm client:inspect --json
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
