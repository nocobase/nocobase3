# @nocobase/app-tools

## 0.1.0-beta.5

### Patch Changes

- c2aceaa: Carry an application's AI Skills into its build, and load the plugin once

  - **Skills in the build.** `tsc` emits only TypeScript, so an application's `ai/skills` never reached `dist`, where a deployed server looks for them; they worked in development and disappeared once deployed, logged only at debug level. `@nocobase/app-tools` now copies the Markdown under `ai/skills` into the build, `references/` included. An application without `ai/` copies nothing.
  - **An import cycle at start.** The plugin's tools imported their container tokens from the modules that register those tools, so an application loading the plugin through its provider stopped with `Cannot access 'aiManagerToken' before initialization`. The tokens now live in a module of their own; each keeps its identity and its export paths.
  - **One copy in a source workspace.** Inside a workspace that links the plugin, `@nocobase/app-plugin-ai-employee` and its `./server` entry resolved to the built `dist/` while `./server/plugin` resolved to source, so an application importing `aiManagerToken` from `./server` loaded a second copy whose tokens never matched, and a stale `dist/` stopped the server. Both now resolve to source there. Published packages are unchanged.

- d18e964: Declare environment variables on the configuration section they set, list them with `pnpm config:env`, and stop shipping environment variables nothing reads.

  `defineAppConfig` takes `env`, a map from variable to a mapping relative to the section, such as `{ APP_SERVER_PORT: envInteger('port') }`. The runtime loads these above the configuration file once the sections are known, and refuses one variable declared for two different fields. `defineAuthConfig` maps `AUTH_SECRET` itself, and the templates declare the rest in `server/config/session.ts`, `server.ts`, `app.ts`, `i18n.ts`, `snowflake.ts` and `spa.ts`. `server/environment.ts` is gone and `server/config.ts` loads only the configuration file. An existing application that keeps its own `server/environment.ts` still works, since a variable mapped twice to the same field is harmless; to move over, copy the `env` of each section file from the new template version and delete the mapping file.

  `pnpm config:env`, also in a built `dist/`, lists every variable the application reads — those its sections declare, with the configuration path each sets, and those the runtime reads itself, `APP_BASE_PATH`, `APP_CONFIG_FILE` and `NOCOBASE_STRICT_STARTUP` — and whether each is set, never its value. `--json` prints the same list. `RUNTIME_ENVIRONMENT_VARIABLES` in `@nocobase/app-server/config` names the runtime-read ones.

  `APP_NAME` is gone from the Hub's `.env.example` and from the `.env` that `create-app` writes for a Hub, which used to set it to the project directory's name: nothing read it, and an application's name follows from `APP_BASE_PATH`. The commented `API_CLIENT_*` lines are gone for the same reason. The Hub template gains a test that every variable `.env.example` names is one `config:env` lists. `pnpm build` no longer copies `DB_*`, `QUEUE_*`, `REDIS_*`, `SMTP_*`, `API_CLIENT_*` and the notification provider variables into `dist/.env`; nothing reads any of them.

- Updated dependencies [f6c3cd8]
- Updated dependencies [f3917b6]
- Updated dependencies [d18e964]
  - @nocobase/app-server@1.0.0-beta.26

## 0.1.0-beta.4

### Patch Changes

- d5a18ff: Ship a `Dockerfile` and `Dockerfile.dockerignore` with every application template. The image builds the application from its own sources with `pnpm build`, cross-targets native modules for multi-platform builds, and runs `node dist/server/standalone.js` as the `node` user without pnpm, with configuration at `/app/config.yml` and storage at `/app/storage`. Set the mount path with `--build-arg APP_BASE_PATH=...`; `.env` is not copied into the image. `--build-arg DIST=prebuilt` packages a `dist/` built beforehand with `pnpm build --target linux-<arch>` instead, after checking that it matches the image's platform, Node major and mount path, and without its `dist/.env`. Existing applications do not receive these files on upgrade: copy both from the new template version. The official Hub image is now built from the Hub template's Dockerfile, keeps its data in `/app/storage`, and no longer fails to start with `EACCES` when `HUB_STORAGE_DIR` is unset; a deployment that mounted `/app/dist/storage` should mount the same volume at `/app/storage` instead.

## 0.1.0-beta.3

### Minor Changes

- 4e58fe3: Add `nocobase app config check` and `nocobase app config set`, run in an application as `pnpm config:check` and `pnpm config:set`, so a configuration is written by `config:init`, changed by `config:set` and verified by `config:check`.

  `config:check` loads the configuration through the application itself — its files, its environment and its code defaults — without starting it. A file that fails to parse, or a database driver that is not installed, fails here for the same reason it would fail a start. It then reports what loading alone does not show: a secret missing or still the placeholder, a `session.secret` that is regenerated at every start and so ends every session with the process, a top-level section nothing reads with the name that was probably meant, and a `${NAME}` written where it is not expanded and would be used as literal text. Databases other than SQLite are connected to, one connection each taken from the pool and handed back, without running SQL or migrating anything; `--connect` includes SQLite and `--no-connect` stays offline. Each finding carries the key and, where there is one, a command that fixes it, and the command exits non-zero on any error, or on any warning with `--strict`.

  `config:set` sets `key=value` assignments in the file the application reads, keeping its comments, and writes it once. A key under a section the application does not know is refused with the nearest known one, so a typo fails instead of being written where nothing reads it. With `--from-env` each value names an environment variable to read, so a secret stays out of the command line. After writing it loads the configuration again and reports any key an environment variable overrides.

  `config:init` now returns its `nextCommands` and, for a database other than SQLite, the `requiredSettings` still at a placeholder. On a terminal it asks for them, reading the password without echo, and tries the connection before writing. Run on an application that is already configured it leaves the file alone and reports `unchanged`, failing only when `--dialect` asks for a different database than the one configured.

  A built `dist/package.json` carries `config:check` and `config:set` scripts, and its `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`, so running one of a deployment's own scripts never makes pnpm install first. `create-app` includes `pnpm config:check` in the `nextCommands` it returns.

  `AppConfig` gains `layers()`, which returns the code defaults and the values the application's own sources supply as separate read-only copies — the distinction a check needs to tell a known section from a misspelled one.

- 4e58fe3: Stop `pnpm dev` before it launches an application that has nowhere to read its configuration from, and say how to create one.

  Without configuration the server throws on startup, which `pnpm dev` then hides: it runs the server under `tsx watch`, which prints the error and waits for a file to change rather than exiting, while Vite carries on and prints a URL. The command looks like it succeeded, exits with nothing, and the page it points at has no API behind it. The check runs before anything is spawned and names `pnpm config:init`.

  What it checks is that a configuration source exists, not that its contents are valid — a file beside the application, a path in `APP_CONFIG_FILE`, or `AUTH_SECRET` in the environment as the application loads it, `.env` files included, all count, so an application configured entirely through the environment still starts. Validity stays with the runtime, which already reports a placeholder secret, a missing `auth.secret` and a dialect with no driver, each with the key and the command that fixes it.

  `pnpm start` — in the application and in a built `dist` alike — stops at once for the same reason, because a server with no `auth.secret` refuses to start. That failure is now an `ApplicationNotConfiguredError`, exported from `@nocobase/app-server/config`, which states only what is missing — the key, and the environment variable that can supply it. A standalone start prints it with the instruction to run `pnpm config:init` in place of a stack trace; the instruction is added there rather than carried by the error, because a Hub showing the same failure to an operator configures its applications itself. `build` is left alone as well — compiling the client and server, generating `dist/package.json` and installing production dependencies never reads a secret, and requiring one would break both an application's own `pnpm check` and any image build that builds before its configuration exists.

  A built `dist/package.json` now has a `config:init` script, so a deployment is configured with `pnpm config:init` inside `dist/` — the same step development uses — and the configuration lands beside `dist/`, where the built runtime reads it.

  The missing-driver error now says to add the driver to the application's dependencies and to build a deployment again afterwards, rather than implying it can be installed wherever the error appeared — in a deployment that runs from a built `dist`, installing one there is undone by the next build.

### Patch Changes

- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
- Updated dependencies [9e8fc3e]
- Updated dependencies [cde9a8e]
- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
  - @nocobase/app-server@1.0.0-beta.25
  - @nocobase/dev-config@0.1.0-beta.12
  - @nocobase/nb3-cli@1.0.0-beta.11

## 0.1.0-beta.2

### Minor Changes

- b00290d: Declare `tsx` and `typescript` as peer dependencies of `@nocobase/app-tools`, and stop loading the TypeScript compiler on every `pnpm dev`.

  `dev` spawns three executables it never imports — `vite`, `tsx`, and `nocobase` — and only two of them were declared. `tsx` sat in `devDependencies`, which are not installed for a consumer, so an application that installed `@nocobase/app-tools` from a registry carried no statement that it needed one. Nothing caught it: every template declares `tsx` for its own use, so the binary resolves in this repository and in any application generated from a template, and is absent only in an application that never installed it. Neither `pnpm deps:check` nor `pnpm peers:check` could have caught it either, because both read import specifiers and a spawned binary has none. Both checks now cover `packages/tools`, the package README carries a table of the executables these scripts spawn, and AGENTS.md records that a spawned tool is a dependency too.

  `typescript` moves from `dependencies` to `peerDependencies` for a different reason. It is imported directly, to parse `server/plugins.ts` without running it, while the build compiles through the application's own `pnpm exec tsc`. That is two copies, and a version split between them fails silently: the application compiles syntax the older parser then cannot read, `resolvePluginWatchIncludes` returns nothing, and editing a workspace plugin quietly stops restarting the server. **An application that does not already declare `typescript` must add it** — every template does, so an application generated from one needs no change.

  That parse is now gated as well. It can only ever name a workspace neighbour, so a `server/plugins.ts` naming none of them is answered without importing the compiler at all. Every `pnpm dev` in a generated application was loading 24 MB of TypeScript to be told there was nothing to watch. `resolvePluginWatchIncludes` is asynchronous as a result.

  `cross-spawn` and `tar` move to the workspace catalog, which also settles `tar` on a single range: `@nocobase/app-host` and `@nocobase/app-plugin-hub` were one minor version behind the four other declarations. The three templates drop their own `cross-spawn` and `tar` entries, which nothing in them has imported since these scripts moved into `@nocobase/app-tools`.

- 77d34b6: Stop a dependency install from restarting the development server mid-way, refuse a second development server for one application root, and shorten the development shutdown budget so a restart is not force-killed.

  `package.json` was handed to the file watcher as an `--include`, so an install restarted the server on its first write and again on the later ones. The server came back against a half-installed `node_modules`, and a write arriving while it was still shutting down is where the watcher escalates SIGTERM to SIGKILL — which skips releasing the migration lock. The manifest, the lockfile and the package manager's install state are now watched here instead, and the restart waits for all of them to stay quiet, so one install produces one restart.

  A second `pnpm dev` for the same application root is refused, naming the first one's process id. Nothing else caught it: the port check advances to the next free port, and the duplicate then failed on the migration lock the first server holds, before it bound anything — an error that names neither cause nor remedy. `NOCOBASE_DEV_ALLOW_MULTIPLE=true` starts one anyway, a run that only proxies a remote backend does not take the lock, and a lock left by a killed run is taken over rather than reported.

  `APP_SHUTDOWN_TIMEOUT_MS` sets the total shutdown budget: the force exit lands on it and the HTTP drain a second earlier. `pnpm dev` supplies four seconds, inside the five the watcher waits before force-killing, so a development restart shuts down on its own and releases its locks. A deployment keeps the 30 second drain and 35 second force exit, which suit a load balancer. `resolveNodeShutdownTimeouts` is exported and `StandaloneServer` carries the resolved `shutdownOptions`.

  Checksum drift now names both ways out instead of one. `db repair` was the only suggestion, and it is the wrong one whenever the edit changed what the migration does: repair records that the source and the schema agree, so using it there makes an un-applied change look applied. The CLI and the startup log now point at `db repair` for an edit that left the schema identical and at `db redo` for one that did not.

### Patch Changes

- Updated dependencies [8f1ead4]
- Updated dependencies [77d34b6]
- Updated dependencies [a1a8690]
  - @nocobase/app-server@1.0.0-beta.24

## 0.0.2-beta.1

### Patch Changes

- 56613b2: Choose a development port that nothing already answers on, not merely one that can be bound. macOS lets a wildcard listener and a specific-address listener share a port, so binding loopback succeeds while the other process receives the loopback traffic — and readiness, which is probed over loopback, then observes a service that is not ours and waits forever. The port probe now connects before accepting a candidate, so `pnpm dev` moves to the next port instead of hanging.
- dd0e02c: Use Execa to manage development process trees, preserve cleanup on repeated termination signals and launcher exit, and report startup progress. Remove automatic native watcher probes; polling is now explicitly configured.

  Exclude installed dependencies from server file watching, including pnpm dependencies outside the application's directory.

- Updated dependencies [fa01814]
- Updated dependencies [ca3188e]
- Updated dependencies [fa01814]
- Updated dependencies [7bde7bd]
- Updated dependencies [56613b2]
- Updated dependencies [ea91af0]
- Updated dependencies [fc34a66]
- Updated dependencies [5380642]
- Updated dependencies [3187ace]
  - @nocobase/app-server@1.0.0-beta.23
  - @nocobase/dev-config@0.1.0-beta.11
  - @nocobase/nb3-cli@1.0.0-beta.11

## 0.0.2-beta.0

### Patch Changes

- 5e3c802: Extract shared application development and build tooling into app-tools and runtime CLI commands into app-cli. Keep template entry points and application composition local, preserve supported commands and development restart behavior, and document customization and upgrade boundaries.

  Remove the application client and server inspection commands, their development-only CLI registration, and related guidance.

- 5e3c802: Replace template development forwarding files with a single dev entry and a direct proxy helper import. Expose the dev lifecycle through the tools launcher and keep development implementation modules and tests inside app-tools.

  Consolidate standalone server dependency operations into one template entry and keep build utility implementations and exports private to app-tools.

  Organize template scripts by purpose and remove redundant test:all, refine, template pack:check, and plugin:skills:sync shortcuts. Keep the application CLI entry and legacy CLI compatibility command unchanged.

- Updated dependencies [8124b03]
  - @nocobase/nb3-cli@1.0.0-beta.10

## 0.0.1

### Patch Changes

- Extract shared application tooling from the application templates.
