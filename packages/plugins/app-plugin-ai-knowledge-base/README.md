# @nocobase/app-plugin-ai-knowledge-base

AI knowledge-base plugin for NocoBase Apps. It exposes authenticated action APIs under both `/api` and the compatibility `/v2/api` prefix, persists documents, segments, and shards, registers AI Manager features, provides the built-in PGVector provider, and ships plugin-owned Client management pages.

Server internals are intentionally private. The App container owns lazy RepositoryFactory, ManagerFactory, and ServiceFactory bindings. The ServiceFactory consumes the container-owned ManagerFactory instead of constructing it, while repositories, domain managers, services, AI feature adapters, queue execution, vector stores, and PGVector pools are created and disposed through those internal lifecycle boundaries.

Document upload is an authenticated, multipart, single-file operation for LOCAL knowledge bases. The accepted filename extensions are exactly `.pdf`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.txt`, `.md`, `.json`, and `.csv`; the maximum file size is 100 MiB. The server stores the file on the disk configured for the knowledge base, creates one document, and attempts to dispatch vectorization to the asynchronous queue. It always returns that single document after successful storage; a queue-dispatch failure marks the document `ERROR` with a retryable message rather than turning the completed upload into a 500. Parsing, segmentation, embedding, and vector persistence remain asynchronous, so clients must observe document status until it reaches `SUCCESS` or `ERROR`.

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
