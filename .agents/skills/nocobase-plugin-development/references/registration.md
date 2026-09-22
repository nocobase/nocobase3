# Registration and Lifecycle

Read this reference when connecting a plugin to an App or changing its installed state. It consolidates the registration overview, workspace/installed workflows, removal guide, and detailed registration reference. Execute only the transition the user requested.

## Registration is several independent facts

| State                           | Evidence                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| Package available               | Target App dependency and resolvable installed package           |
| Client enabled                  | Factory invocation in `client/plugins.ts` when `./client` exists |
| Server enabled                  | Definition in `server/plugins.ts` when `./server` exists         |
| CLI enabled                     | Definition in `cli/plugins.ts` when `./cli` exists               |
| Integration knowledge available | Plugin-owned Skills synchronized into the App                    |
| Feature works                   | Behavior tests and target App runtime verification               |

The current CLI writes the plugin into App `dependencies`, including moving a matching declaration out of `devDependencies`. It discovers registered plugins from the union of explicit Client, Server, and CLI composition roots. Do not recreate the old `nocobase.plugins` management map or treat an `enabled` field as runtime discovery; unregister still cleans legacy entries when present.

The source workspace uses local packages and `workspace:^`; an installed App uses published packages and registry version ranges. Create Plugin is a source-workspace workflow, not a way to generate a local plugin inside an installed App.

## Register a workspace plugin

Run from the repository root, with the chosen App's directory name or full package name:

```bash
pnpm plugin:register audit-log --app app-template-default --dry-run --json
pnpm plugin:register audit-log --app app-template-default --json
```

Inspect the preview before applying it. `--app` defaults to `app-template-default`; specify it explicitly when multiple Apps are relevant. Registration uses actual exports to decide which composition roots to change and synchronizes plugin Skills by default. It appends new registrations rather than resolving business-specific ordering requirements.

Create/register workflows can pass `--no-install` to creation and install once during registration. Registration also accepts `--no-install` when installation is already coordinated separately. Respect the user's dependency-install constraints and report any remaining install requirement.

Client registration calls a factory; Server registration uses the definition itself:

```ts
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import auditLog from '@nocobase/app-plugin-audit-log/client';

export default defineClientPlugins([auditLog()]);
```

```ts
import { defineServerPlugins } from '@nocobase/app-server/plugins';
import auditLog from '@nocobase/app-plugin-audit-log/server';

export default defineServerPlugins([auditLog]);
```

Pass documented typed Client options in the App composition root when needed. Do not copy plugin internals or modify synchronized Skills to configure runtime behavior. For the third composition root, follow [CLI plugins](cli.md).

## Install without enabling

```bash
pnpm plugin:register audit-log --app app-template-default --disabled --json
```

`--disabled` installs the dependency without adding Client, Server, or CLI registrations. Skills still synchronize by default because they are integration knowledge, not runtime code; add `--no-skills` only when that is the intended result. The flag does not neutralize manual registrations already present in composition roots. Inspect those roots when disabling an existing integration and remove only the intended entries.

## Installed Apps and upgrades

From an installed App's root:

```bash
pnpm plugin:register audit-log --version 1.2.0 --json
pnpm plugin:update @nocobase/app-plugin-audit-log --json
```

Use the requested version; the number above is illustrative. Omit the plugin argument to `plugin:update` only when upgrading all registered plugins is requested. Workspace plugins are normally updated through their workspace source and lockfile, not this registry workflow.

Synchronize Skills after a successful package upgrade. If installation fails, do not synchronize from an assumed new version. If package upgrade succeeds but synchronization fails, report the two stages separately. Verify changed exports, typed options, required migrations, App checks, and runtime behavior. Upgrading a plugin does not overwrite App-owned Registry source; use the merge workflow in [Registry](registry.md).

## Synchronize Skills

Run in the target App directory, not the source workspace root:

```bash
pnpm skills:sync
pnpm skills:sync --package @nocobase/app-plugin-audit-log
```

The plugin's top-level `skills/` is the maintained source. The App's `.agents/skills/` is generated, replaced on synchronization, and excluded from Git with the entire App `/.agents/` directory. Do not edit or commit those synchronized copies. `plugin:skills:sync` remains a compatibility alias; use `skills:sync` for new instructions. See [Plugin Skills](plugin-skills.md) for discovery, ownership prefixes, conflict handling, and semantic validation.

## Unregister and remove

Preview unregistering from a workspace App:

```bash
pnpm plugin:unregister audit-log --app app-template-default --dry-run --json
pnpm plugin:unregister audit-log --app app-template-default --json
```

An installed App uses the same commands from its root without `--app`. Unregister cleans the target App dependency, applicable imports/entries in all three composition roots, owned synchronized Skills, and legacy management metadata. `--no-install` defers the package-manager phase. Review the plan for unrelated manually maintained source.

Unregistering an App does not delete the plugin package, migrate away persistent data, or delete App-owned Registry source. Those are separate operations with their own requested scope.

`pnpm plugin:remove audit-log` deletes a source-workspace plugin package. Run it only when source deletion is explicitly requested, all Apps and other consumers have removed their references, the target resolves to the intended package, and there are no user changes or integration assets that must be preserved. Do not equate disabling one App with authorization to delete the plugin. Report what was removed and its recovery path.

## JSON results and optional diagnostics

Lifecycle commands use a JSON envelope such as:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "operation": "plugin:inspect",
  "status": "success",
  "result": {}
}
```

| Status                  | Meaning                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `success`               | Requested operation completed                                                                |
| `success-noop`          | State already matched; no changes were needed                                                |
| `partial-success`       | A phase completed but documented work remains                                                |
| `requires-installation` | Preview needs an installed package before it can calculate the full plan                     |
| `failure`               | `ok: false`; handle `error.code` and `error.suggestions`, preserving the nonzero exit status |

For registration inconsistencies, use `pnpm plugin:inspect audit-log --app app-template-default --json`. Check `ok` and `status`, then `result.consistent`, `issues`, and `suggestions`. A successful inspection can have `ok: true` while reporting inconsistent state. It observes static facts and does not repair them.

Use `pnpm --filter <target-app> client:inspect --json` or `server:inspect --json` only for the corresponding changed composition or diagnostic question. Client inspection does not instantiate Providers, run lifecycle, render React, or load page/locale messages. Server inspection does not execute Providers, Route factories, Jobs, or database operations. Their success cannot prove security, translations, or behavior.

| Symptom                                       | Check and correction                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Package installed but a capability is missing | Match `./client`, `./server`, and `./cli` exports to their explicit roots   |
| Root imports a package that cannot resolve    | Restore the intended dependency/install or remove stale registration        |
| Disabled plugin still runs                    | Remove residual explicit registrations; metadata cannot override imports    |
| Client order or options are wrong             | Adjust the typed entry in `client/plugins.ts` deliberately                  |
| Skills are stale                              | Verify upstream source and run App-scoped synchronization                   |
| Automatic source editing was skipped          | Read the reported reason/manual edits; do not call partial success complete |

Finish with [testing and delivery](testing.md). Source references: [registration planner](../../../../packages/tools/cli/src/lib/plugin-registration.ts) and [lifecycle commands](../../../../packages/tools/cli/src/commands/plugin).
