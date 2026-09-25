# The application command line

This page is how to use the application's CLI: which command a task needs, and the rules its `--help` does not state. For a command's flags and arguments, run `pnpm nocobase <topic> <command> --help` rather than guessing; for the whole tree, `pnpm nocobase --help`.

## How to invoke it

`pnpm nocobase <topic> <command>` runs the `nocobase` bin of `@nocobase/app-cli`, which this application depends on. It finds the application from the nearest `package.json` and loads `cli/plugins.ts` and `cli/commands/` itself.

Only `pnpm dev`, `pnpm build`, `pnpm start` and the quality scripts (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm check`, …) are scripts. Every other command is reached through `pnpm nocobase`; there is no `pnpm db:apply` or `pnpm config:init`. Older documentation that names a script alias, or an id under the `app` topic such as `nocobase app db apply`, is describing a removed layout.

Write `pnpm nocobase`, not a bare `nocobase`: a machine may have an unrelated global `nocobase` on its `PATH`, while `pnpm` resolves this application's own bin first.

## Find the command by task

| Task                                                                | Command                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Create `config.yml` for a new checkout                              | `pnpm nocobase config init` (`--dialect <name>` when several drivers are installed)           |
| Change a configuration value, or read a secret from the environment | `pnpm nocobase config set key=value`, `--from-env` for secrets                                |
| Confirm the configuration before starting                           | `pnpm nocobase config check`                                                                  |
| See which environment variables the application reads               | `pnpm nocobase config env`                                                                    |
| Apply new migrations and seeds                                      | `pnpm nocobase db apply`                                                                      |
| Undo or rerun the latest migration batch while its branch is open   | `pnpm nocobase db rollback`, `pnpm nocobase db redo`                                          |
| Start the schema over from empty                                    | `pnpm nocobase db reset` — destructive, see below                                             |
| Clear a checksum warning after a deliberate, schema-neutral edit    | `pnpm nocobase db repair --dry-run`, then without `--dry-run`                                 |
| Release a migration lock a killed run left behind                   | `pnpm nocobase db unlock`                                                                     |
| Read the current data model                                         | the files under `database/<connection>/collections/`, see below                               |
| Find Collection metadata that disagrees with its table              | `pnpm nocobase collections doctor`                                                            |
| Check that client and server declare the same languages             | `pnpm nocobase locales check`                                                                 |
| Add, remove or update a plugin                                      | `pnpm nocobase plugin register`, `plugin unregister`, `plugin update`                         |
| Check a plugin's registration without changing anything             | `pnpm nocobase plugin inspect <name> --json`                                                  |
| Remove a direct NocoBase package that is not a plugin               | `pnpm nocobase package remove <package>`                                                      |
| Refresh `.agents/skills/` after an install or upgrade               | `pnpm nocobase skills sync`                                                                   |
| Build for another platform, or re-check an existing `dist/`         | `pnpm build --target <platform>`; `pnpm nocobase dist retarget`, `dist check`                 |
| Publish a release to a Hub                                          | `pnpm nocobase release upload`, `release deploy` — read the `nocobase-deployment` Skill first |

Every command listed takes `--connection <name>` or `--all` where connections apply; without either it acts on the default connection.

## Conventions an agent relies on

- **`--json`** prints one JSON document on stdout, success or failure; warnings go to stderr. Read its `ok` and `status` together with the exit code rather than parsing text.
- **Exit codes** are `0` for success, `1` for a runtime failure and `2` for invalid usage; `release upload` and `release deploy` add `3` for a result the Hub could not confirm. Keep a non-zero exit visible in your report; do not rerun until it passes by changing flags.
- **Paths** given in a flag resolve from the current directory, as with any command line. A default path a command names in its `--help`, such as the `release upload` archive, is inside the application.
- **Preview first.** `plugin register`, `plugin unregister`, `plugin update`, `package remove`, `skills sync` and `db repair` take `--dry-run`. Use it before any change whose effect you have not already confirmed with the user.
- **Destructive commands need `--force` outside a terminal.** `db reset`, `db rollback`, `db redo` and `db repair` ask for confirmation interactively and refuse without `--force` in CI or any non-interactive shell, which is how an agent runs them. Do not add `--force` on your own initiative to get past that refusal: `db reset` drops every managed table. Ask the user first, and never run it against a database whose data matters. `db unlock --force` releases a lock that is still sending heartbeats, which lets a second run start beside a live one — only do it when the user confirms the other run is gone.
- **Do not start the application to run a command.** CLI commands work on files and the database directly; none of them needs `pnpm dev` running.

## Reading the data model

`database/<connection>/collections/` holds what the database currently resolves each Collection to — `collection.json`, `metadata.json` and `schema.json` per Collection, plus `_manifest.json` — written by `pnpm nocobase collections generate`. Read these files, and search across them, rather than inferring the model from migrations.

The directory is a local cache for every connection, external ones included: gitignored, safe to delete, and never read back. `db apply`, `db redo`, `db rollback` and `db reset` refresh it for each connection whose migrations they change, and `pnpm dev` does the same after its startup migrations; a built `dist/` never writes it. Run `pnpm nocobase collections generate` yourself only when a command ran with `--no-collections` or warned that the refresh failed, after editing an external connection's `metadata/`, or after another system changed an external connection's schema. `--check` exits non-zero when the files are out of date. Never edit them by hand or import them from a migration.

An external connection's metadata — titles, descriptions and relations its schema cannot express — is written by hand in `database/<connection>/metadata/<name>.json`, one metadata document per Collection, and committed. Edit those files, then regenerate so the cache reflects them; the command reports a document whose Collection the database no longer has as unused metadata.

## The application's own commands

A command this application owns is a file under `cli/commands/` that default-exports an oclif `Command` subclass. Its path is its name below the `app` topic: `cli/commands/sync-orders.ts` answers to `pnpm nocobase app sync-orders`, and `cli/commands/orders/sync.ts` to `pnpm nocobase app orders sync`. There is no index to update. Files and directories starting with `_`, and directories named `lib`, are skipped, so helpers can sit beside the commands.

Do not name a directory under `cli/commands/` `dist`, `build`, `coverage` or `generated`: each is ignored by `.gitignore`, Prettier or the shared ESLint preset, so a command inside one would go unlinted, or never reach git, without any warning.

Keep a command module cheap to import — load heavy work inside `run()` — because help loads every command class. Commands are static tooling: they read and write files and packages and must not start the application or resolve its services. `cli/` is compiled into `dist`, so an application command also runs in a deployment and may import only packages in `dependencies`.

## In a built dist/

`pnpm build` writes `dist/cli/index.js`. A deployment runs `node dist/cli/index.js <topic> <command>` from any directory, or `pnpm nocobase <topic> <command>` inside `dist/`. Only runtime commands are registered there — `config`, `db`, `collections`, `locales`, `info`, the application's own commands and plugins' runtime commands. `dev`, `build`, `start`, `dist`, `plugin`, `package`, `release` and `skills` exist only in the source checkout. See the `nocobase-deployment` Skill for production procedure.
