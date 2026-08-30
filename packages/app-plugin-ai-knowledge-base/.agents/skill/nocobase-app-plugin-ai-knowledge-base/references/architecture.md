# Architecture

## Contents

- [Application view](#application-view)
- [Automatic lifecycle](#automatic-lifecycle)
- [Public boundary](#public-boundary)
- [Known implementation limits](#known-implementation-limits)

## Application view

A generated App installs and enables `@nocobase/app-plugin-ai-knowledge-base`. The package manifest automatically contributes:

- client bootstrap: loads translations and settings registration;
- server bootstrap: constructs the knowledge-base runtime and enables AI features;
- database migrations: creates six plugin-owned collections;
- `/v2/api` compatibility actions: all routes require an authenticated session.

The runtime depends on AI Manager, Database Manager, Queue Manager, and Authentication. A Drive Manager is optional; without it the server creates an in-memory file manager, which is not suitable for durable production documents or shards.

## Automatic lifecycle

Installation/enablement owns server service construction, PGVector provider registration, AI feature registration, route registration, queue-job runtime registration, client settings tabs, translations, and migrations. Application code must not call feature enablement, route registration, or the hidden server bridge.

The server registers one built-in vector-database provider: `NocobaseDefaultPGVectorProvider`, spec `PGVector`. Its connection fields are `host`, `port`, `user`, optional `password`, `database`, and `tableName`.

## Public boundary

Application code may use package exports and authenticated HTTP actions. The package root re-exports the client API. Exported client subpaths are documented in [public-api](public-api.md).

The server `KnowledgeBaseService`, repositories, PGVector implementation, queue job, migration files, and hidden AI-manager property are implementation details. There is no exported server subpath and no public application registration API for another vector-database provider. EXTERNAL knowledge bases can select an AI Manager vector-store provider only when another enabled plugin has registered it; this package itself exposes no application-side registration hook.

## Known implementation limits

- Current compatibility routes authenticate users but do not perform role/resource ACL checks. Treat this as a material security risk.
- `accessAbility: "readWrite"` is projected by document routes for UI use; it is not authorization.
- The vector-pool disposer is currently a no-op, while PG pools are cached by connection hash.
- `checkVectorStoreChanged` currently returns `changed: false`; confirmation timestamps are recorded but no comparison is implemented.
- ZIP filename-encoding choices are returned to the client, but the current extraction helper uses the ZIP library's decoded names and does not consume the submitted encoding choice.
- Direct server upload of a ZIP creates every supported entry but returns only the first created document. The public client `UploadResult` also allows an async task shape for compatibility, although current server upload/finalize returns a document after queue dispatch.
