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
that array is what enables them and the array order is the contribution order;
there is no `enabled` flag on the client side.

`client/plugins.ts` and `server/plugins.ts` are the authoritative runtime
registration surfaces. `nocobase.plugins` remains temporarily for CLI,
skills, dev-watch, and workspace build tooling; Server ServiceProviders, routes,
migrations, seeds, and jobs are no longer discovered from it.

Both places are written by the repository commands; do not edit either by hand:

```bash
pnpm plugin:register <name> --app app-template-default
pnpm plugin:inspect <name> --app app-template-default --json
pnpm plugin:unregister <name> --app app-template-default
```

`plugin:register` adds the `devDependencies` entry and the `nocobase.plugins` entry, appends imports and array items to the Client and Server composition roots for the exports the package ships, and copies the plugin's skills into `.agents/skills/`. `--disabled` records `enabled: false` and leaves both composition roots alone; `--no-skills` skips the skills copy. `plugin:unregister` reverses all of it. `pnpm plugin:skills:sync` synchronizes on its own; `pnpm create @nocobase/app` runs it once after the install, and you run it again after a plugin upgrade changes its skills. `plugin:inspect --json` is read-only and verifies the static registration surfaces; it does not replace route-security, runtime, test, or build checks.

Only a plugin that ships a `./client` export reaches `client/plugins.ts`. A server-only plugin is registered in `package.json` and skipped there, because an import of an export it does not have fails to resolve at build time. The check looks for `./client` because that is the specifier registration writes; a plugin carrying only `./client/plugin` predates the barrel and is skipped for the same reason.

Only a plugin that ships a `./server` export reaches `server/plugins.ts`. A client-only plugin is skipped there for the same reason. Server entries are plugin definitions and appear in the array as `auditLog`; Client entries are factories and appear as `auditLog()`.

Those commands run in this repository and find plugins in `packages/`. An application generated from this template runs the same commands without `--app`, and they install from the registry instead:

```bash
pnpm plugin:register <name>
pnpm plugin:inspect <name> --json
pnpm plugin:unregister <name>
```

The editing itself is one implementation in `@nocobase/nb3-cli`, shared by both. See [docs/cli](../../docs/cli/README.md).

The entire `.agents/` directory is ignored local synchronization output and
must not be committed or used as a source of truth. Directories under
`.agents/skills/` whose names start with `nocobase-` are replaced wholesale on
the next sync. Commit plugin-owned Skill sources under the plugin's `skills/`
directory and commit App integrations to the App's normal source directories.

## Keep extension ownership explicit

- Plugin `client/plugin` entries are the static registration surface,
  re-exported as the default from `client/index.ts` and imported as
  `<package>/client`: package name, config, ServiceProviders, React Wrappers,
  routes, locales, and the options the plugin accepts.
- Plugin `client/serviceProviders` entries register Client services and Refine
  capabilities through `ClientApplication.start()`.
- Plugin `client/reactWrappers` entries declare synchronous React wrappers and
  explicit ordering constraints.
- Plugin `client/routes` entries own route ID, path, and authentication mode.
- The application owns its root route, theme, page composition, branding,
  loading states, and final React Wrapper tree.

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

## Write user-facing text through i18n

`@nocobase/app-plugin-i18n` is registered by default, so any string a user reads goes through a translation key rather than a literal.

The application's own copy lives in `client/locales/`. `en-US.ts` states the wording, and `LocaleResource` derives the shape from it — the structure is never written twice. Other locales are annotated with that type, so a key that does not exist there is a compile error:

```ts
// client/locales/en-US.ts
import type { LocaleResource } from '@nocobase/app-i18n';

const enUS = {
  actions: { save: 'Save' },
};

export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
```

```ts
// client/locales/zh-CN.ts
const zhCN: AppResource = {
  actions: { save: '保存' },
};
```

Translate in a component with no namespace — the application's own is the default here:

```tsx
import { useTranslation } from '@nocobase/app-i18n/client';

const { t } = useTranslation();
t('actions.save');
```

Two things are worth knowing:

- A plugin's own strings live in that plugin, not here. To reword one, add an `overrides` block to the application's locale file keyed by the plugin's package name; do not edit the plugin.
- A string rendered where i18n may not be mounted — a component a focused test renders on its own — should pass `defaultValue` so it stays readable: `t('actions.save', { defaultValue: 'Save' })`.

`pnpm i18n:check` at the repository root reports keys a locale is missing. Full reference: [app-i18n README](../app-i18n/README.md).

## Keep the client inspectable

Run the inspector before changing client ownership or contribution wiring:

```bash
pnpm client:inspect
pnpm client:inspect --json
```

The output distinguishes the plugin-owned route entry from the final component
source. When adding an application override, give it a `componentEntry` so the
CLI and future Agents can locate the owning file.

In JSON mode, read `ok`, `status`, and `result.consistent`, then process stable
issue codes. Inspection imports Client declarations and reads static Route,
ServiceProvider, and React Wrapper declarations. It does not instantiate
ServiceProviders, run lifecycle hooks, load Route page components or locale
messages, render React Wrappers, start a browser, or verify Server security.

## Keep the server inspectable

Run the static Server inspector after changing Server plugin composition:

```bash
pnpm server:inspect --json
```

The command imports `server/plugins.ts`, so that module and its declaration
imports must not start runtime services. It does not construct ServiceProviders, run
lifecycle code, execute Route factories, connect to the database, start
workers, or load Queue Job modules. Check `issues`, then cover runtime Route,
ServiceProvider, database, and Job behavior with integration tests.

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
