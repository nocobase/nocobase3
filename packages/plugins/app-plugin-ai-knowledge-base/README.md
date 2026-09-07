# @nocobase/app-plugin-ai-knowledge-base

App-owned AI knowledge-base compatibility plugin. It exposes the current action contract under `/v2/api`, persists document segments and shards, registers AI Manager features, provides the built-in PGVector provider, and ships plugin-owned Client management pages.

## Runtime and editable Registry source

The package has three distinct ownership layers:

- `client/**`, `server/**`, and `database/**` are plugin runtime owned by this package;
- `registry/providers`, `registry/components`, and `registry/workspace` are the canonical App-editable recipes owned by this package;
- after materialization, `client/extensions/nocobase-ai-knowledge-base-*` belongs to the consuming App.

The Registry items are independent:

| Item         | Target                                                    | Purpose                                                                                                                 |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `providers`  | `client/extensions/nocobase-ai-knowledge-base-providers`  | Current DTOs, transport adapter, error/pagination normalization, Provider, and stale-safe resource hooks                |
| `components` | `client/extensions/nocobase-ai-knowledge-base-components` | Controlled knowledge-base, document, upload, retrieval, and segment UI plus locale resources                            |
| `workspace`  | `client/extensions/nocobase-ai-knowledge-base-workspace`  | Complete management and document workspace composition, URL state, conflict handling, notifications, and route surfaces |

All three use `ownership: application` and `upgradePolicy: three-way-merge`. Installing an item does not register or enable the plugin, install repository-materialized npm/shadcn dependencies, add App routes, or overwrite an existing target. Server authorization, storage credentials, migrations, queues, vectorization, and database logic remain in the plugin.

## Build and install

Build distributable shadcn Registry JSON:

```bash
pnpm --filter @nocobase/app-plugin-ai-knowledge-base registry:build
```

The generated `public/r/registry.json`, `providers.json`, `components.json`, and `workspace.json` are recreated by `prepack`; do not maintain them by hand.

Materialize one item from a source workspace:

```bash
pnpm --filter @nocobase/app-plugin-ai-knowledge-base registry:materialize -- \
  --item providers \
  --output-root /path/to/generated-app
```

Prepare the plugin and declared dependencies first, then materialize `components` and `workspace`. For remote installation, serve `public/r` over HTTP and pass the item URL to `shadcn add`; remote shadcn resolves versioned npm and Registry dependencies.

Validate canonical source separately from the plugin declaration graph:

```bash
pnpm --filter @nocobase/app-plugin-ai-knowledge-base typecheck:registry
```

## Development showcases

Development-only routes are declared with `defineDevRoutes()` under `/dev/ai-knowledge-base`. They contain five deterministic, API-free component workflows and a live plugin-owned workspace. These pages reuse plugin runtime components and locale resources; they do not execute canonical source under `registry/**` and are absent from production application bundles.

## App Agent guidance

The App-facing skill source is `skills/nocobase-app-plugin-ai-knowledge-base/`. It documents prerequisites, public contracts, safe operations, Registry installation targets, and the application-owned three-way-merge upgrade model. An App's synchronized `.agents/skills` directory is generated output, not a source of truth.
