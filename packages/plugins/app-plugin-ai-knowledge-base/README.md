# @nocobase/app-plugin-ai-knowledge-base

AI knowledge-base plugin for NocoBase Apps. It exposes authenticated action APIs under both `/api` and the compatibility `/v2/api` prefix, persists documents, segments, and shards, registers AI Manager features, provides the built-in PGVector provider, and ships plugin-owned Client management pages.

Server internals are intentionally private. The App container owns lazy RepositoryFactory, ManagerFactory, and ServiceFactory bindings. The ServiceFactory consumes the container-owned ManagerFactory instead of constructing it, while repositories, domain managers, services, AI feature adapters, queue execution, vector stores, and PGVector pools are created and disposed through those internal lifecycle boundaries.

## Declarative startup configuration

The plugin reads `ai.aiKnowledgeBase.vectorDatabases` and `ai.aiKnowledgeBase.manifests` from the application configuration owned by `@nocobase/app-plugin-ai-employee`. At boot it enables the knowledge-base AI features, registers the built-in PGVector provider, synchronizes config-managed vector databases, and only then loads Manifest YAML objects. Configuration reload synchronizes vector databases again but never replays Manifests.

Configured vector databases use their required `name` as both the persisted name and stable key. `provider`, `databaseSpec`, and `enabled` default to `NocobaseDefaultPGVectorProvider`, `PGVector`, and `true`. Environment references such as `${PG_VECTOR_PASSWORD}` are expanded recursively in `connection`. A manual record with the same name is not taken over. Records owned by configuration are exposed as `managedBy: "config"` and cannot be updated or deleted through the public API or settings UI; change them in application configuration instead.

Each configured Manifest `location` is a Drive object key relative to its named disk; leading slashes are removed. Host filesystem absolute paths and storage-provider SDK bypasses are not supported. One YAML object describes one Manifest:

```yaml
key: product-manuals
operation: init
initiate:
  disk: local
  name: Product manuals
  vectorDatabase: pgvector1
  llmService: embedding-service
  embeddingModel: text-embedding-3-small
files:
  - disk: local
    locations:
      - preload/knowledge-base/manual.pdf
```

`init` creates a LOCAL knowledge base, `append` adds documents to an existing LOCAL knowledge base, and `recover` replaces the document previously mapped from the exact source disk/location while preserving its document ID and key. Manifest processing is persisted by Manifest source (`disk + normalized location`). A successful source is permanently terminal even when the YAML later changes. Failed or interrupted sources resume only unfinished files. A file is successful after its object and metadata are persisted and vectorization is successfully dispatched; the Manifest does not wait for segmentation or vector persistence.

Other server plugins can import `knowledgeBaseManifestServiceToken` and the associated contract from `@nocobase/app-plugin-ai-knowledge-base/server`. Callers must provide both the parsed Manifest and its source so direct calls share the same persistent idempotency and recovery semantics as startup configuration. No Manifest HTTP API is provided.
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
