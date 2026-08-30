# @nocobase/create-plugin

Create a publish-ready NocoBase 3 application plugin inside the `packages/`
directory of a NocoBase 3 source workspace. The command generates only the
capabilities explicitly selected by the caller.

```bash
pnpm create @nocobase/plugin audit-log \
  --with server.providers \
  --with server.routes \
  --with database \
  --with skills
```

The command accepts either a short kebab-case name such as `audit-log` or the
full package name `@nocobase/app-plugin-audit-log`.

```text
USAGE
  create-plugin <name> (--with <capability>... | --empty) [options]

CAPABILITIES
  database
  server.providers
  server.routes
  server.jobs
  client.routes
  client.components
  client.providers
  client.bootstrap
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

`database` includes the migrations and seeds structure. `server.providers`
includes ServiceProvider, Service, and Token structure. `server.routes`
supports both API and Root Route contributions without choosing either one for
the plugin. `client.routes` similarly supports App and Settings Routes.

The generator derives Client and Server plugin declarations, package exports,
dependencies, tests, publication files, Registry scripts, and Plugin Skill
publication from the same capability model. It does not invent business routes
or rely on a complete example that must be deleted after generation.

Use `--dry-run --json` to inspect the exact read-only generation plan before
creating a plugin. Registering or enabling the generated plugin remains an
explicit step.

JSON mode emits one document for both success and failure. Successful results
set `ok` to `true`; failures keep a non-zero exit code and return `ok: false`
with a stable `error.code`, the human-readable `error.message`, and actionable
`error.suggestions`.
