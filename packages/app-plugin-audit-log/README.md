# @nocobase/app-plugin-audit-log

Audit Log App Plugin.

This scaffold includes disabled database migration and seed examples, an
explicit server plugin entry, a ServiceProvider, an API route at
`/api/audit-log`, a `client/plugin.ts` registration entry
re-exported as the default from `client/index.ts`, and working client examples
for bootstrap, unified application and settings routes, and providers.

The server structure is intentionally small:

```text
server/
├── plugin.ts
├── providers/
│   ├── audit-log.ts
│   └── index.ts
├── routes/
│   └── index.ts
├── services/
│   └── audit-log.ts
└── tokens.ts
```

- `server/plugin.ts` is the server registration entry and composes the
  Provider and route contributions.
- `server/providers/index.ts` composes the Provider collection; the domain
  Provider registers the service as a lazy singleton and owns lifecycle work.
- `server/services/audit-log.ts` contains the default domain
  implementation.
- `server/tokens.ts` defines the stable service contract and token used to
  resolve or replace the service.
- `server/routes/index.ts` uses `defineApiRoutes()` to create and return its own Hono
  router, declares paths relative to the automatic `/api` mount, and resolves
  the service through that token.
- `server/plugin.ts` declares database migrations, seeds, and queue jobs by
  default. Missing directories and disabled `.ts.example` files contribute
  nothing, so these declarations can remain until the corresponding feature is
  added.

Register the package with the target application's plugin command. It detects
the `./server/plugin` export and adds it to `server/plugins.ts` alongside the
client registration. See [database/README.md](database/README.md) before
enabling either database example.

The client example registers a Refine resource, exposes a lazy page at
`/audit-log`, adds a lazy settings page at
`/settings/audit-log`, and contributes a React context Provider.
The route page calls `GET /api/audit-log`, so it also demonstrates
the connection between the client and server entries. Replace or remove the
examples that your plugin does not need.

The root `components.json` configures shadcn for plugin-owned runtime UI. Add a
primitive from the plugin directory with:

```bash
pnpm exec shadcn add button
```

Generated components belong under `client/components/ui/` and use the `@/`
alias defined in `tsconfig.json`. The accompanying `client/styles.css` is a
generation entrypoint; the host application continues to own runtime theme
tokens.

## Editable Registry source

The scaffold also includes `registry/component-ui`, a small application-owned
component recipe. It is deliberately separate from the plugin runtime:

- `client/**` remains plugin-owned and follows plugin upgrades;
- `registry/component-ui/**` is canonical source published by the plugin;
- after installation, its copy under an application's `client/extensions/**`
  belongs to that application and can be edited there.

Build the shadcn Registry JSON before publishing:

```bash
pnpm registry:build
```

This creates `public/r/registry.json` and `public/r/component-ui.json`.
`prepack` runs the same command automatically. To copy the example directly
into a monorepo application without first building JSON, run:

```bash
pnpm registry:materialize --output-root ../../packages/app-template-default
```

The item declares the shadcn `button` Registry dependency. The remote
`shadcn add` flow installs it automatically; the repository `materialize`
command only copies canonical source, so prepare the Button in the target
application first. See `registry/component-ui/README.md` and
`docs/plugin-registry.md` for the ownership, publishing, and upgrade model.
