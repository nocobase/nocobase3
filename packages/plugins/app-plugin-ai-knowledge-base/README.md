# @nocobase/app-plugin-ai-knowledge-base

AI knowledge-base plugin for NocoBase Apps. It exposes authenticated action APIs under both `/api` and the compatibility `/v2/api` prefix, persists documents, segments, and shards, registers AI Manager features, and provides the built-in PGVector integration.

The default App Template explicitly registers the canonical `@nocobase/app-plugin-ai-knowledge-base/server` export in `server/plugins.ts`. `./server/plugin` remains a compatibility alias. Package metadata records the conventional server and migration entries for plugin tooling; it is not runtime discovery.

Server internals are intentionally private. The App container owns only lazy RepositoryFactory and ServiceFactory bindings. The ServiceFactory owns a property-cached ManagerFactory, while repositories, domain managers, services, AI feature adapters, queue execution, vector stores, and PGVector pools are created and disposed through those internal lifecycle boundaries.
