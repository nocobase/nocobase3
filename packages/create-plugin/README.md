# @nocobase/create-plugin

Create a publish-ready NocoBase 3 application plugin inside the `packages/`
directory of a NocoBase 3 source workspace.

```bash
pnpm create @nocobase/plugin audit-log
```

The command accepts either a short kebab-case name such as `audit-log` or the
full package name `@nocobase/app-plugin-audit-log`.

```text
USAGE
  create-plugin <name> [options]

OPTIONS
  --display-name <name>        Human-readable package display name
  --description <description>  Package description
  --no-install                 Do not synchronize pnpm-lock.yaml
  --dry-run                    Validate and print the target without writing
  --version                    Show the version
  -h, --help                   Show help
```

The bundled template is copied as normal source files and only its declared
placeholders are rendered. It includes plugin-owned client and server examples,
shadcn configuration for runtime UI, and an application-owned Registry
component recipe with build and materialize commands. Registering the generated
plugin or installing its Registry item in an application remains an explicit
step.
