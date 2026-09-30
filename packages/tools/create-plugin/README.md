# @nocobase/create-plugin

Create a publish-ready NocoBase 3 application plugin inside the `packages/plugins/` directory of a NocoBase 3 source workspace. The command generates only the capabilities explicitly selected by the caller.

```bash
pnpm create @nocobase/plugin audit-log \
  --with server.service-providers \
  --with server.routes \
  --with database \
  --with skills
```

The command accepts either a short kebab-case name such as `audit-log` or the full package name `@nocobase/app-plugin-audit-log`.

```text
USAGE
  create-plugin <name> (--with <capability>... | --empty) [options]

CAPABILITIES
  database
  server.service-providers
  server.routes
  server.jobs
  server.locales
  client.routes
  client.components
  client.service-providers
  client.react-providers
  client.locales
  cli
  registry
  skills

OPTIONS
  --with <capability>          Add a capability; may be repeated
                               all selects every capability listed above
  --empty                      Create only the package foundation
  --display-name <name>        Human-readable package display name
  --description <description>  Package description
  --no-install                 Do not synchronize pnpm-lock.yaml
  --dry-run                    Print the exact generation plan without writing
  --json                       Print a stable JSON result for tools and Agents
  --version                    Show the version
  -h, --help                   Show help
```

`database` includes the migrations and seeds structure. `server.service-providers` includes ServiceProvider, Service, and Token structure. `server.routes` supports both API and Root Route contributions without choosing either one for the plugin. `client.routes` similarly supports App and Settings Routes. `client.service-providers` generates application-owned Client services and lifecycle hooks, while `client.react-providers` generates React context composition owned by the rendered tree.

`cli` adds a CLI plugin in `cli/index.ts`, exported as `./cli`, with one example command under the topic derived from the package name; an application lists it in its `cli/plugins.ts` to get the commands. `--with all` selects every capability at once.

`server.jobs` generates a `@nocobase/jobs` `Job` subclass and submit function in `server/jobs/<name>.ts`, a Provider that owns the plugin's `JobExecutor` in `server/providers/<name>-jobs.ts`, and its `serviceProviders` composition. It works alone or alongside `server.service-providers`; it does not use `queue.jobs` directory discovery. Generated manifests declare the App server, jobs, and ServiceProvider runtime peers without installing a separate runtime copy.

The generator derives Client and Server plugin declarations, package exports, dependencies, tests, publication files, Registry scripts, and Plugin Skill publication from the same capability model. It does not invent business routes or rely on a complete example that must be deleted after generation.

The App registers its core `JobExecutorServiceProvider` before plugin Providers. The generated Provider resolves `jobExecutorServiceToken` and takes the executor for its package-name scope in `start()`, registers the job class before `setup()`, and awaits `executor.shutdown()` in `shutdown()`, which waits for running tasks before their dependencies are released. The submit function adds a task to that executor only after startup; its receipt means acceptance, not completion. The starter job validates its payload at run time and checks cancellation; replace its placeholder domain operation with idempotent business behavior. The built-in memory backend keeps tasks in one process, so a `redis` jobs configuration for multiple instances belongs to the App.

Generated jobs tests start the Provider on a real memory jobs service and await observable task settlement, not synchronous execution after submission. They also verify that two applications' executors stay isolated and that Provider shutdown waits for a running task. The generator's own tests build temporary jobs-only and jobs-plus-services plugins and execute their generated tests without installing dependencies.

Use `--dry-run --json` to inspect the exact read-only generation plan before creating a plugin. Registering or enabling the generated plugin remains an explicit step.

JSON mode emits one document on stdout for both success and failure, in the same envelope as `pnpm nocobase … --json`: `{ schemaVersion: 1, ok, command: "create-plugin", status, result | error, warnings }`. A success has `ok: true` and the plan under `result` — `mode`, `plugin`, `requestedCapabilities`, `capabilities`, `derivedStructure`, `files`, `writes`, `commands` and `nextSteps` — with `status: "success"`, or `"success-noop"` for a `--dry-run`, which writes nothing. A failure keeps a non-zero exit code and returns `ok: false` and `status: "failure"` with a stable `error.code`, the human-readable `error.message`, and `error.suggestions`, each a `{ message }`. `--help --json` and `--version --json` return `result.help` and `result.version`.

## Server resources and compiled database tasks

Generated Server declarations include the required absolute `baseDir`, calculated relative to `import.meta.dirname`. All filesystem contributions resolve against it. Keep source and published Server exports aligned so development loads source contributions and installed or built plugins load compiled contributions.

Plugins with the `database` capability run `nocobase-db-manifests` after TypeScript compilation. This command comes from `@nocobase/dev-config` and seals each migrations or seeds directory with `.manifest.json`. Run it after any JavaScript rewriting, keep generated manifests in the published `dist`, and clean stale output when removing or renaming task files.
