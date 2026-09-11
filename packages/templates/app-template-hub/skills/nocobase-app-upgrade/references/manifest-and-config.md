# The manifest, config, and plugin roots

Three things are not ordinary source and do not follow the file-by-file process. Each has its own rule.

## `package.json`

The application's manifest and the template's have been different since generation: the name, the publish metadata, the database driver, and everything the user has added since. Merge it key by key, using the two releases to see what the template actually changed:

```bash
diff <(node -p "JSON.stringify(require('$WORK/$BASE/package.json'), null, 2)") \
     <(node -p "JSON.stringify(require('$WORK/$TARGET/package.json'), null, 2)")
```

That is `BASE → TARGET` for the manifest — what the template changed. Bring in only those changes, and only where the rule below says to. Never copy the template's manifest over the application's.

| Key                                                              | Rule                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `displayName`                                            | The application's. Never take the template's.                                                                                                                        |
| `version`                                                        | The user's. It is unrelated to the template.                                                                                                                         |
| `nocobase.templatePackage`, `nocobase.templateKind`              | Keep as they are.                                                                                                                                                    |
| `nocobase.defaultTemplateVersion`                                | Set to the target — in the last step, after the source is merged.                                                                                                    |
| `description`, `publishConfig`, `repository`                     | Absent by design. Do not reintroduce them.                                                                                                                           |
| `dependencies`, `devDependencies`                                | Add what the template added, update what it upgraded, remove what it removed. Never replace the object: the database driver and everything the user added live here. |
| `scripts`                                                        | Add and update what the template changed. Keep scripts the user added. If the user redefined a template script, ask before overwriting.                              |
| `files`, `engines`, `packageManager`, `browserslist`, `prettier` | Take the template's. These describe how the application is built and run.                                                                                            |
| `pnpm`, `overrides`, `resolutions`                               | The user's unless the template changed the same entry.                                                                                                               |

Two traps in the dependency merge. The template's keys get reordered between releases, so most of the raw diff is noise — compare key by key, not line by line. And a dependency the template removed may be one the user now imports directly, which is the same invisible breakage as a removed export; `grep` for it before deleting it.

A published template's ranges are already resolved — `workspace:` and `catalog:` are expanded by `pnpm pack`. Take the resolved range as published.

## `.env` and `.env.example`

A hub is configured through the environment rather than through `config.yml`. `.env` holds its real settings, it is gitignored, it was written by the generator rather than copied from the template, and it appears in no delta. Never edit it as part of the merge, and never print its contents.

`.env.example` does ship with the template and is merged like any other file — and a new key there is the only signal that `.env` needs a corresponding edit:

```bash
diff "$WORK/$BASE/.env.example" "$WORK/$TARGET/.env.example"
```

For every key the target added, check whether the running `.env` needs it. A new key with a working default needs nothing. A new key with no default is a startup failure waiting for the first restart — tell the user what to add and where, and let them edit the file, since it may hold credentials they do not want read back.

`APP_BASE_PATH` is the path the hub is served under and `APP_NAME` identifies this hub; both are deployment facts. Take neither from the template.

## `client/plugins.ts`, `server/plugins.ts`, `cli/plugins.ts`

These are composition roots: the template registers the plugins it ships, and `pnpm plugin:register` appends the ones the user installed. Both sides edit the same lists, in the same region of the same files, so they conflict more than anything else in the tree.

Merge them as sets of registrations rather than as text — this is exactly the case a text merge gets wrong, since both sides append to the same region. Read the template's `BASE → TARGET` change and ask what it did to the list:

- **A registration the template added** — add it, unless the delta or `MIGRATION.md` says it is optional.
- **A registration the template removed** — remove it, but only if the user did not register it themselves. `MIGRATION.md` usually explains what removal costs; a removal generally stops registering a capability without deleting its tables or data.
- **A registration whose options the template changed** — take the new options, unless the user deliberately set them otherwise.
- **Anything the user added** — keep it. Every entry the template does not own is theirs.

Then reinstall and resynchronize, in this order:

```bash
pnpm install
pnpm plugin:skills:sync
```

The skills sync reads these files, so it has to run after the merge and after the install — it resolves each plugin out of `node_modules`.

Older applications may also carry a `nocobase.plugins` array in `package.json`. It is obsolete: the composition roots are the source of truth. Remove it if the target release's `MIGRATION.md` says to.

## `app-dist/` and the built apps a hub serves

`app-dist/` holds the applications this hub serves. The generator creates it empty, and everything in it since is deployment output rather than source. It is in no diff and a template upgrade never touches it.

A hub is built before it runs, so `pnpm build` then `pnpm start` is what proves the upgrade. Whether the apps under `app-dist/` also need rebuilding depends on what the release changed; the target's `MIGRATION.md` says when it does.

## Migrations the target release introduces

A hub owns no database of its own, so a migration arriving in a template release is unusual. If one does arrive, copy it in like any other added file and run it:

```bash
pnpm migrate
```

Never edit a migration that arrives this way, and never edit one the application already ran. A migration is immutable history; a correction goes in a new migration. Existing migrations and seeds the user owns stay exactly where they are, byte for byte — a template upgrade never rewrites them.
