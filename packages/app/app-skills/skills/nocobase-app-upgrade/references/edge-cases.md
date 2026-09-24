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

Dependency keys get reordered between releases, so most of the raw diff is noise — compare key by key. A dependency the template dropped may be one the user now imports directly; search application code, configuration, tests, and build scripts before deleting it, same as a removed export. For plugins, complete the [code and configuration review](#review-a-removed-plugins-usage). Obtain confirmation before removing any apparently unused `@nocobase/*` capability, and keep each retained package in the appropriate dependency section together with any required registrations.

After its references have been migrated and the user has confirmed the removal, run `pnpm package:remove @nocobase/example` instead of deleting only the manifest key. Use `--dry-run` to preview or `--json` for structured output. The command invokes the application's package manager so `package.json` and the lockfile stay consistent, then removes only synchronized Skills recorded as owned by that package. For an `@nocobase/app-plugin-*` target it delegates to the plugin unregister workflow and removes Client, Server, and CLI registrations together; `pnpm plugin:unregister <name>` remains available as the plugin-specific entry point. The removal command does not edit business code or configuration, which is why the usage review and any migration happen first.

An older application with a recent CLI but no `package:remove` script can run `pnpm nocobase package remove @nocobase/example`. If the installed CLI predates the command, merge the target `@nocobase/nb3-cli` dependency and install it before removal; where `skills:sync` is already available, the compatibility fallback is the application's package-manager remove followed by `pnpm skills:sync`. With the current CLI, after an interrupted or manual removal, confirm that the final manifest no longer declares the package and run a full `pnpm skills:sync` to reconcile stale package-owned output. `package:remove` can also clean recorded historical Skill ownership for a named package already absent from the manifest, and it does not uninstall or clean Skills belonging to another package.

Ranges in a published template are already resolved (`pnpm pack` expands `workspace:` and `catalog:`). Take them as published.

Keep the existing application and template identities: changing from one template lineage to another is a separate source and database migration, and changing the package name does not transfer migration history.

### Dependency resolution conflicts

An existing lockfile may keep an older dependency resolution that still satisfies its declared range. After a template upgrade, the application's direct `@nocobase/db` and the copy used by an authorization dependency can therefore differ, making `DatabaseConnection` types incompatible. The Finish step runs `pnpm dedupe` to consolidate compatible versions; it cannot reconcile incompatible declared ranges.

If the same-package type conflict remains, inspect the paths reported by TypeScript and use `pnpm why <package>` to find which dependency retains the older copy. For the authorization example:

```bash
pnpm why @nocobase/db
pnpm why @nocobase/authorization
pnpm why @nocobase/app-plugin-authorization
```

When a compatible newer version of the retaining dependency is available within its declared range, run `pnpm update <identified-package>`, then `pnpm dedupe`, and inspect the dependency paths again. Update only the package identified by the conflict; do not run an unscoped update or use `--latest`. If the declared ranges or application overrides prevent a shared version, report the conflicting constraints and reconcile them with the target template and the user's custom dependencies instead of forcing a version or deleting the lockfile.

After resolving the conflict, rerun `pnpm skills:sync` and all Finish checks. Confirm the affected paths use a compatible shared package resolution; unrelated packages may legitimately retain multiple versions. A remaining type error without duplicate package resolutions needs investigation as a source or API compatibility issue.

## Generated configuration and committed examples

`config.yml` holds real settings and generated secrets. A template may also generate `.env` for build-time deployment facts. These live files are gitignored, were written by `pnpm config:init` and the generator rather than copied from the template, and are absent from the release diff. Never print or replace them as part of the merge. `config:init` refuses to overwrite an existing configuration, so it is safe to run during an upgrade; `--force` replaces one and is never part of a merge.

`config.example.yml` ships with every current official template and merges normally. A template may also ship `.env.example`. Changes to these examples are the signal that a corresponding live file may need a manual edit:

```bash
diff "$WORK/$BASE/config.example.yml" "$WORK/$TARGET/config.example.yml"
if [ -f "$WORK/$BASE/.env.example" ] || [ -f "$WORK/$TARGET/.env.example" ]; then
  diff "$WORK/$BASE/.env.example" "$WORK/$TARGET/.env.example"
fi
```

A new key with a working default needs nothing. One without a default is a startup failure waiting for the next restart: tell the user what to add and let them edit the live file. Preserve application identity, public paths, ports, credentials, and other deployment facts rather than copying values from an example.

### A removed plugin the diff cannot remove for you

A target release that drops `@nocobase/app-plugin-install` leaves an upgrading application still importing it. Remove the dependency from `package.json` and its entries from `client/plugins.ts` and `server/plugins.ts`; there is nothing to migrate, because the installation page only ever appeared for an application that had no configuration file, and a configured one never reached it. An application that did rely on that page configures itself with `pnpm config:init` instead.

## `client/plugins.ts`, `server/plugins.ts`, `cli/plugins.ts`

Composition roots: the template registers what it ships, `pnpm plugin:register` appends what the user installed. Both sides append to the same region, which is exactly what a text merge gets wrong. Merge them as sets of registrations:

- Added by the template — merge the target's registration and options, preserving any deliberate application customization.
- Removed by the template — complete the usage review below before removing either the registration or dependency. Preserve user-added or used plugins, including those originally enabled by the template. Removal stops registering a capability; it does not delete tables or data.
- Options changed — take the new ones, unless the user deliberately set otherwise.
- Anything the user added — keep it.

Follow the [Finish step](../SKILL.md#8-finish) to install and deduplicate dependencies before synchronizing Skills: the sync resolves direct `@nocobase/*` dependencies from the final `node_modules` and retains compatibility with registered plugins.

An older application may also carry a `nocobase.plugins` array in `package.json`. Remove it after merging the CLI and template scripts that use the Client, Server, and CLI composition roots for plugin discovery. Preserve the user's registrations in those roots, and check application-owned scripts for remaining consumers of the legacy field.

### Review a removed plugin's usage

Registration origin and application usage are separate questions. Review the application's code and configuration even when the plugin's registration is unchanged from BASE.

1. Identify the removed plugin's capabilities from BASE and its public documentation. Search beyond the composition roots for its package name, exported services, API paths, route names, and collection names in application-owned code and configuration.
2. If neither code nor configuration shows usage, treat the plugin as apparently unused and ask the user to confirm its removal in the upgrade plan. This review does not require inspecting running workflows or business data. Remove the dependency and registrations together only after confirmation; otherwise keep them.
3. If references are found or the user says the capability is needed, retain its manifest dependency and required Client, Server, and CLI registrations, and check compatibility with TARGET. Preserve user-added plugins unless the user explicitly chooses to remove them. If retention is incompatible or a replacement is needed, agree on the capability and data migration before removing the old plugin; a similar package name does not establish equivalence.

Before combining a retained plugin with a replacement added by TARGET, check that their dependencies and registrations can coexist. If they conflict, leave that combination unmerged until a migration is agreed.

Apply the agreed outcome to the manifest and composition roots together, then verify the affected application behavior after upgrading.

## Migrations

A release can ship a migration under `database/`. Copy it in like any added file, then `pnpm db:apply`.

Never edit a migration that arrives this way, and never edit one already run — a correction goes in a new migration. The user's own migrations and seeds stay byte for byte where they are; an upgrade never rewrites them.

Template cleanup does not authorize deleting previously executed application migrations or seeds, even when they originally came from the template. Preserve their original package owner, paths, contents, and history; do not reset checksums, drop tables, or repoint history to another template. For directory or connection changes, follow [existing application migration rules](../../nocobase-app-development/references/migrations.md#existing-applications) and verify the original sources remain available in the deployment.

Unregistering a plugin leaves its records and migration history intact. Do not roll back a retired plugin's migrations after removing its sources; an intentional rollback requires restoring the original plugin version first.

## Documentation and generated directories

`AGENTS.md`, `CLAUDE.md`, and `README.MD` ship with the template and may contain user additions. Take the template's version where the user wrote nothing and merge where they did.

Older template releases also shipped a committed `skills/` directory. A target release that moves those Skills into `@nocobase/app-skills` does not authorize deleting local changes. Compare each legacy file with the BASE template: an unchanged template copy may be removed only after install and `pnpm skills:sync` produce the corresponding package-owned Skill under `.agents/skills/`; a modified or added file is application-owned and must be preserved. Keep a customized legacy directory with explicit links from `AGENTS.md`, or move its rules into `AGENTS.md` or another committed application-owned source after showing the user the exact relocation. Never silently fold custom content into a generated copy.

Older releases may include `MIGRATION.md`. Treat it as historical context and verify each suggestion against BASE → TARGET and the project's state; never remove a capability that TARGET still provides solely because an old note says to. When TARGET removes the document, delete an unchanged template copy, but preserve or relocate the user's own operational notes before removing a customized copy.

`.agents/skills/` is generated and gitignored. `pnpm skills:sync` replaces each synchronized package-owned Skill directory wholesale, so never merge into or edit it. Local custom guidance belongs in committed application-owned files outside this generated directory.

`config.yml`, optional generated `.env`, `.gitignore`, `.npmrc`, and `pnpm-workspace.yaml` were written by the generator or by `pnpm config:init` and appear in no diff at all.

## Where the user's code lives

```text
Rarely touched by the template — a change landing here deserves a careful read
  client/pages/  client/components/  client/locales/  client/routes.ts
  server/routes/  server/providers/  database/  cli/commands/  tests/  e2e/

Template structure — where most of the delta lands
  client/routing/  client/layouts/  client/theme/
  client/app.ts  client/runtime.ts  client/startup.tsx  server/*.ts
  scripts/  vite.config.ts  vitest.config.ts  eslint.config.js
  tsconfig*.json  index.html  components.json

Both sides edit these — the hardest decisions
  client/plugins.ts  server/plugins.ts  cli/plugins.ts
  package.json  config.example.yml  optional .env.example  AGENTS.md  CLAUDE.md

Legacy application-owned guidance, when present
  skills/
```

## Shared application scripts and commands

When a target template delegates scripts to `@nocobase/app-tools` and commands to `@nocobase/app-cli`, add the former to `devDependencies` and the latter to `dependencies`. Merge the thin script entries and `cli/standard-commands.ts` while retaining application command registrations, plugin composition, and custom commands. Compare any locally modified script implementation before replacing it; move application-specific behavior to supported CLI hooks or retain a deliberate local override.
