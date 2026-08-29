# **NOCOBASE_PACKAGE_NAME**

**NOCOBASE_DESCRIPTION**

This scaffold includes disabled database migration and seed examples, an
explicit server plugin entry, a ServiceProvider, an API route at
`/api/__NOCOBASE_SHORT_NAME__`, a `client/plugin.ts` registration entry
re-exported as the default from `client/index.ts`, and working client examples
for bootstrap, routes, settings, and providers.

The server structure is intentionally small:

```text
server/
├── plugin.ts
├── provider.ts
├── routes.ts
├── service.ts
└── token.ts
```

- `server/plugin.ts` is the server registration entry and composes the
  Provider and route contributions.
- `server/provider.ts` registers the service as a lazy singleton and owns its
  lifecycle work.
- `server/service.ts` defines the service contract and its default
  implementation.
- `server/token.ts` exports the stable token used to resolve or replace the
  service.
- `server/routes.ts` directly defines the API route contribution and resolves
  the service through that token.

Register the package with the target application's plugin command. It detects
the `./server/plugin` export and adds it to `server/plugins.ts` alongside the
client registration. See [database/README.md](database/README.md) before
enabling either database example.

The client example registers a Refine resource, exposes a lazy page at
`/__NOCOBASE_SHORT_NAME__`, adds a lazy settings page at
`/settings/__NOCOBASE_SHORT_NAME__`, and contributes a React context Provider.
The route page calls `GET /api/__NOCOBASE_SHORT_NAME__`, so it also demonstrates
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
