# @nocobase/create-app

Creates a NocoBase 3 application.

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app crm
```

`pnpm create @nocobase/app` resolves to the `@nocobase/create-app` package and runs it, forwarding every argument after the package name verbatim.

## Why `npm_config_registry` is needed

Two downloads happen, at different stages, each reading a different setting:

```
Stage 1  pnpm resolves the @nocobase/create-app package from a registry
         ← npm_config_registry decides this, before any of our code runs

Stage 2  create-app runs and downloads the application template
         ← --registry decides this, and already defaults to https://npm.nocobase.ai
```

This package is published only to the self-hosted registry, while `pnpm create` resolves package names from the public npm by default, so stage 1 has to be pointed at it or the command fails outright:

```
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@nocobase%2Fcreate-app: Not Found
```

`pnpm create` does not accept `--registry` itself — after the package name it is forwarded to this program, and before the package name it is read as part of the name. So it has to be an environment variable, or a one-time entry in `~/.npmrc`:

```
@nocobase:registry=https://npm.nocobase.ai
```

After that the prefix is no longer needed. This whole section stops applying once the package is published to the public npm.

Note that `--registry` is not a substitute: that flag belongs to this program and is parsed only after the process starts, whereas a stage 1 failure means the process never started. Conversely, stage 2 already defaults to the self-hosted registry, so `--registry` is rarely needed day to day.

## About dist-tags

**Do not append `@beta` to the package name.** For now the `beta` tag points at the oldest published version rather than the newest:

```
latest: 0.1.0-beta.1   ← the most recent release
beta:   0.1.0-beta.0   ← the first release, untouched since
```

This is changesets behavior: a package whose published versions are all prereleases is treated as publishing for the first time, so the tag goes to `latest` to keep the package installable with `npm install`, and not to `beta`. That holds on every release until a stable version ships, which is why `beta` stayed on the first one and `latest` is the newest.

The problem resolves itself once a stable version is published, at which point `beta` starts tracking again.

To check the current state:

```bash
npm view @nocobase/create-app dist-tags --registry=https://npm.nocobase.ai
```

For the same reason, `--template-tag` also defaults to `latest`.

## Interactive use

With no arguments, the command asks for the directory and nothing else:

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app
```

## Flags

| Flag             | Description                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `[directory]`    | Application directory, relative to the current one. Prompted for when omitted            |
| `--no-install`   | Skip installing dependencies after scaffolding                                           |
| `--template`     | Template, `default` by default. Also accepts a published package or a local package path |
| `--template-tag` | Channel a named template is fetched from: `latest` (default) or `beta`                   |
| `--registry`     | Registry the template is downloaded from, `https://npm.nocobase.ai` by default           |
| `-h, --help`     | Show help                                                                                |
| `--version`      | Show the version                                                                         |

`--template` supports three names: `default` (the default application), `examples` (the example application), and `hub` (an application hub), each pointing at the corresponding `@nocobase/app-template-*` package.

```bash
pnpm create @nocobase/app crm --template=default   # the default, can be omitted
pnpm create @nocobase/app examples --template=examples
pnpm create @nocobase/app hub --template=hub
```

`--template-tag` decides which channel a named template is fetched from, `latest` by default:

```bash
pnpm create @nocobase/app crm --template-tag=beta
```

**Note that `beta` currently fetches the oldest version rather than the newest**, for the reason described above. Use it only when you specifically want that version.

Any other value is used as given, so a specific version or a local directory works as usual. `--template-tag` is ignored in that case: you have already said which version you want, and appending a channel would override the more specific request.

```bash
pnpm create @nocobase/app crm --template=@nocobase/app-template-default@1.0.0-beta.24
pnpm create @nocobase/app crm --template=./packages/templates/app-template-default
```

Dependencies are installed automatically; `--no-install` skips that.

## What gets generated

The template is downloaded (`@nocobase/app-template-default@latest` by default) and, on top of it:

- `package.json` is rewritten: the application's own name and display name, publish metadata dropped so it cannot be released by accident, and `packageManager` pinned to a pnpm that reads `allowBuilds`
- `config.yml` is generated from the template's `config.example.yml`, with `auth.secret` and `session.secret` filled in
- `.gitignore` is written when the template ships none, so the secrets in `config.yml` cannot be committed
- `pnpm-workspace.yaml` gets its `allowBuilds` decisions (see below)
- A hub additionally gets `.env`, derived from the template's `.env.example` with `APP_NAME` set
- Dependencies are installed (skip with `--no-install`)
- The application's own `pnpm plugin:skills:sync` runs, copying the bundled plugins' skills into `.agents/skills/`. This has to come after the install, because the sync resolves plugins out of `node_modules`. A failure is only a warning; the generated application still runs, and the command can be re-run in the application directory at any time

## Choosing a database

There is no flag for it. A generated application runs on SQLite, which needs no server, and the database is part of the application's source rather than a setup-time question:

```ts
// server/config/database.ts
import sqlite from '@nocobase/db-sqlite';

drivers: { sqlite },
```

To use another database, add its dialect package (`@nocobase/db-postgres`, `@nocobase/db-mysql`, `@nocobase/db-oracle`, `@nocobase/db-mssql`, `@nocobase/db-kingbase`, `@nocobase/db-oceanbase`, `@nocobase/db-dameng`), register it in `drivers`, and point the connection at it — in that file, or in `config.yml` for the host and credentials. A dialect that is not registered fails at startup with `Database dialect "…" is not registered.`, because drivers are code rather than settings and `config.yml` cannot introduce one.

Each dialect package brings its own driver, so nothing has to be installed by name.

## About native install scripts

pnpm 11 does not run a dependency's install script unless the package is listed under `allowBuilds` in `pnpm-workspace.yaml`. The `pnpm` field in `package.json` was removed in pnpm 11 and `.npmrc` has never carried build settings, so that file is the only entry point.

Without it `better-sqlite3` — which every template pulls in through `@nocobase/db-sqlite` — installs without compiling its native addon, `pnpm install` still reports success, and the first query throws `Could not locate the bindings file`. The generated `allowBuilds` also covers `oracledb`, so switching the application to Oracle later just works, and `esbuild`. `pg`, `mysql2`, and `tedious` are pure JavaScript and need no build permission.

There is one more failure mode: `ignore-scripts=true` in an npm configuration suppresses install scripts globally and outranks `allowBuilds`. After installing, create-app loads the driver once to verify it, and re-runs `pnpm rebuild <driver>` when it installed but will not load — `pnpm rebuild` targets one package and works without changing the global setting. Only if that fails is the user told, with a command they can run themselves.

(Note that `pnpm install --config.ignore-scripts=false` does not help here: the package is already in the store, so pnpm skips it and reports success without compiling anything. It has to be `pnpm rebuild`.)

## Development

```bash
node ./bin/run.js crm            # runs the sources directly; Node 24 strips the types
pnpm --filter @nocobase/create-app build
pnpm --filter @nocobase/create-app check    # lint + format + typecheck + test + build
```

`bin/run.js` picks its mode automatically: it loads `src/` when `src/create.ts` is present, and `dist/` once the package is installed from a registry. A published install has to use `dist`, because Node refuses to strip types from a file under `node_modules`. Set `NOCOBASE_CREATE_APP_USE_DIST=1` to force the published shape from a source checkout.

When developing a template, point `--template` at a local directory:

```bash
node ./bin/run.js crm --template ../../templates/app-template-default
```

A local directory is packed with `pnpm pack`, which resolves `workspace:` and `catalog:` into real version ranges, so the generated project installs outside the repository too.
