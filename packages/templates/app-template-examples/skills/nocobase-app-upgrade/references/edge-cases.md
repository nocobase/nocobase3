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

Dependency keys get reordered between releases, so most of the raw diff is noise — compare key by key. A dependency the template dropped may be one the user now imports directly; `grep` before deleting, same as a removed export.

Ranges in a published template are already resolved (`pnpm pack` expands `workspace:` and `catalog:`). Take them as published.

## `config.yml` and `config.example.yml`

`config.yml` holds real settings and generated secrets. It is gitignored, was written by the generator rather than the template, and is in no diff. Never edit it as part of the merge, and never print it.

`config.example.yml` ships with the template and merges normally — and a new key there is the only signal `config.yml` needs an edit:

```bash
diff "$WORK/$BASE/config.example.yml" "$WORK/$TARGET/config.example.yml"
```

A new key with a working default needs nothing. One without a default is a startup failure waiting for the next restart: tell the user what to add and let them edit the file.

## `client/plugins.ts`, `server/plugins.ts`, `cli/plugins.ts`

Composition roots: the template registers what it ships, `pnpm plugin:register` appends what the user installed. Both sides append to the same region, which is exactly what a text merge gets wrong. Merge them as sets of registrations:

- Added by the template — add it, unless `MIGRATION.md` says it is optional.
- Removed by the template — remove it, unless the user registered it themselves. Removal stops registering a capability; it does not delete tables or data.
- Options changed — take the new ones, unless the user deliberately set otherwise.
- Anything the user added — keep it.

Then `pnpm install && pnpm plugin:skills:sync`, in that order: the sync reads these files and resolves each plugin out of `node_modules`.

An older application may also carry a `nocobase.plugins` array in `package.json`. It is obsolete — remove it if the target's `MIGRATION.md` says so.

## Migrations

A release can ship a migration under `database/`. Copy it in like any added file, then `pnpm migrate`.

Never edit a migration that arrives this way, and never edit one already run — a correction goes in a new migration. The user's own migrations and seeds stay byte for byte where they are; an upgrade never rewrites them.

## Documentation and generated directories

`AGENTS.md`, `CLAUDE.md`, `MIGRATION.md`, `README.MD`, and `skills/` ship with the template and are updated by it, but the user may have appended to them. Take the template's version where they wrote nothing; merge where they did. A stale `skills/` sends the next agent down a path the application no longer supports.

`.agents/skills/` is generated, gitignored, and replaced wholesale by `pnpm plugin:skills:sync`. Never merge into it.

`config.yml`, `.gitignore`, and `pnpm-workspace.yaml` were written by the generator and appear in no diff at all.

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
  package.json  config.example.yml  AGENTS.md  CLAUDE.md  skills/
```
