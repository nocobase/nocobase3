# Architecture

## Contents

- [Application view](#application-view)
- [Automatic lifecycle](#automatic-lifecycle)
- [Public boundary](#public-boundary)
- [Known implementation limits](#known-implementation-limits)

## Application view

An enabled App imports the plugin's canonical `./server` export in its explicit `server/plugins.ts` composition root. The default App Template includes that registration. The plugin contributes:

- client settings and locale integration;
- two lazy internal container factories for repositories and services;
- a property-cached internal ManagerFactory that owns domain managers;
- a ServiceProvider that binds queue execution and enables AI Manager features;
- database migrations for the plugin-owned collections;
- authenticated action APIs under `/api` and the compatibility `/v2/api` prefix.
  The runtime depends on AI Manager, Database Manager, Queue Manager, and Authentication. A Drive Manager is optional; without it the server creates an in-memory file manager, which is not suitable for durable production documents or shards.

## Automatic lifecycle

The ServiceProvider registers lazy RepositoryFactory and ServiceFactory bindings. The ServiceFactory owns a ManagerFactory whose domain managers handle knowledge bases, documents, segment storage, vectorization, and vector-store resolution. During boot the provider constructs and enables the four AI feature adapters, then registers the built-in providers through `aiManager.features`; during shutdown it disables those features, unbinds the executor, disposes the factories, and closes created PGVector pools. Application code must not call internal feature, manager, route, or job adapters directly.
The server registers one built-in vector-database provider: `NocobaseDefaultPGVectorProvider`, spec `PGVector`, plus LOCAL and READONLY vector-store providers. Its connection fields are `host`, `port`, `user`, optional `password`, `database`, and `tableName`.

## Public boundary

Application code may use package exports and authenticated HTTP actions. The package root re-exports the client API. Exported client subpaths are documented in [public-api](public-api.md).

The `./server` export is the canonical Server plugin definition, and `./server/plugin` is a compatibility alias. Package metadata records conventional server and migration paths for plugin tooling, but the Server runtime is enabled only by explicit App composition. RepositoryFactory, ManagerFactory, ServiceFactory, all repositories, managers and services, feature implementations, the PGVector implementation, and queue adapters remain private implementation details. Another enabled plugin can register an EXTERNAL vector-store provider through `aiManager.features.vectorStoreProvider`.

## Known implementation limits

- Current compatibility routes authenticate users but do not perform role/resource ACL checks. Treat this as a material security risk.
- `accessAbility: "readWrite"` is projected by document routes for UI use; it is not authorization.
- PGVector pools are instance-owned by the provider, shared across tables with the same connection settings, and closed idempotently during provider shutdown.
- `checkVectorStoreChanged` currently returns `changed: false`; confirmation timestamps are recorded but no comparison is implemented.
- ZIP filename-encoding choices are returned to the client, but the current extraction helper uses the ZIP library's decoded names and does not consume the submitted encoding choice.
- Direct server upload of a ZIP creates every supported entry but returns only the first created document. The public client `UploadResult` also allows an async task shape for compatibility, although current server upload/finalize returns a document after queue dispatch.
