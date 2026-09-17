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
  registry
  skills

OPTIONS
  --with <capability>          Add a capability; may be repeated
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

`server.jobs` generates an instance channel handler and producer in `server/jobs/<name>.ts`, a consumer Provider in `server/providers/<name>-jobs.ts`, and its `serviceProviders` composition. It works alone or alongside `server.service-providers`; it does not emit a `Job` subclass or `queue.jobs` directory discovery. Generated manifests declare the App server, Queue, and ServiceProvider runtime peers without installing a separate runtime copy.

The App registers its core `QueueServiceProvider` before plugin Providers. The generated Provider resolves `queueServiceToken` during `boot()` and registers a handler; its `shutdown()` awaits unregistration before dependencies can be released. The core Provider owns queue setup in `start()` and shared service shutdown. Producers resolve that same service and publish serializable messages to stable queue/channel names only after startup. The starter handler filters and validates messages and checks cancellation; replace its placeholder domain operation with idempotent business behavior. Default in-memory storage loses queued messages on restart, so durable backend configuration belongs to the App.

Generated jobs tests initialize a real in-memory QueueService and await observable handler settlement, not synchronous execution after publish. They also verify that Provider shutdown waits for an active handler and leaves the shared service available to another consumer. The generator's own tests build temporary jobs-only and jobs-plus-services plugins and execute their generated tests without installing dependencies.

The generator derives Client and Server plugin declarations, package exports, dependencies, tests, publication files, Registry scripts, and Plugin Skill publication from the same capability model. It does not invent business routes or rely on a complete example that must be deleted after generation.

Use `--dry-run --json` to inspect the exact read-only generation plan before creating a plugin. Registering or enabling the generated plugin remains an explicit step.

JSON mode emits one document for both success and failure. Successful results set `ok` to `true`; failures keep a non-zero exit code and return `ok: false` with a stable `error.code`, the human-readable `error.message`, and actionable `error.suggestions`.
