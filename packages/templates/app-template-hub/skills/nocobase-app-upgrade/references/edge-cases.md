# Edge cases

Things that are not ordinary source and do not follow the file-by-file process in `SKILL.md`.

## `package.json`

Merge key by key; never copy the template's manifest over. What the template changed:

```bash
diff <(node -p "JSON.stringify(require('$WORK/$BASE/package.json'), null, 2)") \
     <(node -p "JSON.stringify(require('$WORK/$TARGET/package.json'), null, 2)")
```

| Key                                                              | Rule                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `displayName`, `version`                                 | The application's. Never the template's.                                                                                             |
| `nocobase.templatePackage`, `nocobase.templateKind`              | Leave as they are.                                                                                                                   |
| `nocobase.defaultTemplateVersion`                                | The target — set last, after the merge.                                                                                              |
| `description`, `publishConfig`, `repository`                     | Absent by design; do not reintroduce.                                                                                                |
| `dependencies`, `devDependencies`                                | Add, update, and remove what the template did. Never replace the object: the database driver and the user's own additions live here. |
| `scripts`                                                        | Take the template's changes; keep the user's additions. Ask before overwriting a template script they redefined.                     |
| `files`, `engines`, `packageManager`, `browserslist`, `prettier` | The template's.                                                                                                                      |
| `pnpm`, `overrides`, `resolutions`                               | The user's, unless the template changed the same entry.                                                                              |

Dependency keys get reordered between releases, so most of the raw diff is noise — compare key by key. A dependency the template dropped may be one the user now imports directly; search before deleting, same as a removed export. For plugins, complete the [code and configuration review](#review-a-removed-plugins-usage) and obtain confirmation before removing an apparently unused capability. Keep any retained plugin in the appropriate dependency section together with its required registrations.

Ranges in a published template are already resolved (`pnpm pack` expands `workspace:` and `catalog:`). Take them as published.

Keep the existing application and template identities: changing a Default application into Examples or Hub is a separate source and database migration, and changing the package name does not transfer migration history.

### Dependency resolution conflicts

An existing lockfile may keep an older dependency resolution that still satisfies its declared range. After a template upgrade, the application's direct `@nocobase/db` and the copy used by an authorization dependency can therefore differ, making `DatabaseConnection` types incompatible. The Finish step runs `pnpm dedupe` to consolidate compatible versions; it cannot reconcile incompatible declared ranges.

If the same-package type conflict remains, inspect the paths reported by TypeScript and use `pnpm why <package>` to find which dependency retains the older copy. For the authorization example:

```bash
pnpm why @nocobase/db
pnpm why @nocobase/authorization
pnpm why @nocobase/app-plugin-authorization
```

When a compatible newer version of the retaining dependency is available within its declared range, run `pnpm update <identified-package>`, then `pnpm dedupe`, and inspect the dependency paths again. Update only the package identified by the conflict; do not run an unscoped update or use `--latest`. If the declared ranges or application overrides prevent a shared version, report the conflicting constraints and reconcile them with the target template and the user's custom dependencies instead of forcing a version or deleting the lockfile.

After resolving the conflict, rerun `pnpm plugin:skills:sync` and all Finish checks. Confirm the affected paths use a compatible shared package resolution; unrelated packages may legitimately retain multiple versions. A remaining type error without duplicate package resolutions needs investigation as a source or API compatibility issue.

## `config.yml` and `.env`

A hub reads both, for different things. `.env` carries build-time settings — `APP_NAME`, `APP_BASE_PATH`, the dev server host and port — consumed by `vite.config.ts` and the build scripts. `config.yml` carries runtime settings: database connections, auth, notification channels, snowflake. Neither replaces the other.

Both are gitignored, were written by the generator rather than the template, and are in no diff. Never edit either as part of the merge, and never print them.

Their examples do ship with the template and merge normally, and a new key in one is the only signal the live file needs an edit:

```bash
diff "$WORK/$BASE/config.example.yml" "$WORK/$TARGET/config.example.yml"
diff "$WORK/$BASE/.env.example" "$WORK/$TARGET/.env.example"
```

A new key with a working default needs nothing. One without a default is a startup failure waiting for the next restart: tell the user what to add and let them edit the file. `APP_NAME` and `APP_BASE_PATH` are deployment facts — take neither from the template.

## `client/plugins.ts`, `server/plugins.ts`, `cli/plugins.ts`

Composition roots: the template registers what it ships, `pnpm plugin:register` appends what the user installed. Both sides append to the same region, which is exactly what a text merge gets wrong. Merge them as sets of registrations:

- Added by the template — merge the target's registration and options, preserving any deliberate application customization.
- Removed by the template — complete the usage review below before removing either the registration or dependency. Preserve user-added or used plugins, including those originally enabled by the template. Removal stops registering a capability; it does not delete tables or data.
- Options changed — take the new ones, unless the user deliberately set otherwise.
- Anything the user added — keep it.

Follow the [Finish step](../SKILL.md#8-finish) to install and deduplicate dependencies before synchronizing Skills: the sync reads these files and resolves each plugin out of the final `node_modules`.

An older application may also carry a `nocobase.plugins` array in `package.json`. Remove it after merging the CLI and template scripts that use the Client, Server, and CLI composition roots for plugin discovery. Preserve the user's registrations in those roots, and check application-owned scripts for remaining consumers of the legacy field.

### Review a removed plugin's usage

Registration origin and application usage are separate questions. Review the application's code and configuration even when the plugin's registration is unchanged from BASE.

1. Identify the removed plugin's capabilities from BASE and its public documentation. Search beyond the composition roots for its package name, exported services, API paths, route names, and collection names in application-owned code and configuration.
2. If neither code nor configuration shows usage, treat the plugin as apparently unused and ask the user to confirm its removal in the upgrade plan. This review does not require inspecting running workflows or business data. Remove the dependency and registrations together only after confirmation; otherwise keep them.
3. If references are found or the user says the capability is needed, retain its manifest dependency and required Client, Server, and CLI registrations, and check compatibility with TARGET. Preserve user-added plugins unless the user explicitly chooses to remove them. If retention is incompatible or a replacement is needed, agree on the capability and data migration before removing the old plugin; a similar package name does not establish equivalence.

Before combining a retained plugin with a replacement added by TARGET, check that their dependencies and registrations can coexist. If they conflict, leave that combination unmerged until a migration is agreed.

Apply the agreed outcome to the manifest and composition roots together, then verify the affected application behavior after upgrading.

## Migrations

A release can ship a migration under `database/`. Copy it in like any added file, then `pnpm migrate`.

Never edit a migration that arrives this way, and never edit one already run — a correction goes in a new migration. The user's own migrations and seeds stay byte for byte where they are; an upgrade never rewrites them.

Template cleanup does not authorize deleting previously executed application migrations or seeds, even when they originally came from the template. Preserve their original package owner, paths, contents, and history; do not reset checksums, drop tables, or repoint history to another template. For directory or connection changes, follow [existing application migration rules](../../nocobase-app-development/references/migrations.md#existing-applications) and verify the original sources remain available in the deployment.

Unregistering a plugin leaves its records and migration history intact. Do not roll back a retired plugin's migrations after removing its sources; an intentional rollback requires restoring the original plugin version first.

## Documentation and generated directories

`AGENTS.md`, `CLAUDE.md`, `README.MD`, and `skills/` ship with the template and are updated by it, but the user may have appended to them. Take the template's version where they wrote nothing; merge where they did. A stale `skills/` sends the next agent down a path the application no longer supports.

Older releases may include `MIGRATION.md`. Treat it as historical context and verify each suggestion against BASE → TARGET and the project's state; never remove a capability that TARGET still provides solely because an old note says to. When TARGET removes the document, delete an unchanged template copy, but preserve or relocate the user's own operational notes before removing a customized copy.

`.agents/skills/` is generated, gitignored, and replaced wholesale by `pnpm plugin:skills:sync`. Never merge into it.

`config.yml`, `.env`, `.gitignore`, and `pnpm-workspace.yaml` were written by the generator and appear in no diff at all.

## Where the user's code lives

```text
Rarely touched by the template — a change landing here deserves a careful read
  client/pages/  client/components/  client/locales/  client/routes.ts
  server/routes/  server/providers/  database/  cli/commands/  tests/  e2e/

Template structure — where most of the delta lands
  client/routing/  client/shell/  client/layouts/  client/theme/
  client/app.ts  client/runtime.ts  client/startup.tsx  server/*.ts
  scripts/  vite.config.ts  vitest.config.ts  eslint.config.js
  tsconfig*.json  index.html  components.json

Both sides edit these — the hardest decisions
  client/plugins.ts  server/plugins.ts  cli/plugins.ts
  package.json  config.example.yml  .env.example  AGENTS.md  CLAUDE.md  skills/
```
