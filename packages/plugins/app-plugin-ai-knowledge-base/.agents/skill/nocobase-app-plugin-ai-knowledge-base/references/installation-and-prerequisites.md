# Installation and Prerequisites

## Contents

- [Check the App](#check-the-app)
- [Required runtime services](#required-runtime-services)
- [Storage and PGVector](#storage-and-pgvector)
- [Client prerequisite gate](#client-prerequisite-gate)

## Check the App

From `<appRoot>`, inspect the actual manifest and plugin configuration; do not assume scripts or file layout beyond what the generated App contains.

```bash
node -e "const p=require('./package.json'); console.log(p.dependencies?.['@nocobase/app-plugin-ai-knowledge-base'] ?? p.devDependencies?.['@nocobase/app-plugin-ai-knowledge-base'] ?? 'not installed')"
```

Use the App's supported plugin-management command or admin UI to confirm installation, explicit Client/Server registration, and enablement. For source Apps, verify that `client/plugins.ts` imports the Client export and `server/plugins.ts` imports the canonical `/server` export. At runtime an authenticated client can inspect enabled plugins through the normal plugin-manager action (`pm:listEnabledV2` for the `client-v2` lane or `pm:listEnabled` for `client`). Do not use that list as an authorization decision.

## Required runtime services

The package declares and uses:

- `@nocobase/app-plugin-ai-employee`: provides AI Manager, AI settings shell/routes, LLM service/model actions, and knowledge-base feature contracts;
- database manager/connection: required for plugin tables and migrations;
- queue manager: all document vectorization is dispatched to queue `default`;
- an enabled LLM service with an `EMBEDDING` model for vector creation/search.

The server resolves these required services when its lazy ServiceFactory is first used during provider boot. Missing AI, queue, file-storage, or database bindings are startup/configuration errors, not recoverable client states.

## Storage and PGVector

Drive Manager is optional in dependency injection. When present, files are stored through a drive-backed manager in the `ai-knowledge-base` scope. When absent, a memory manager is used: uploaded source files and shard files can disappear on process restart and are not shared across replicas.

PGVector prerequisites:

- reachable PostgreSQL;
- credentials with permission to connect and create/use the configured vector table;
- `vector` support required by the LangChain PGVector store;
- a table name matching `^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$`;
- an embedding-capable LLM service and selected model.

## Client prerequisite gate

Exported prerequisite helpers can query enabled plugins with a 60-second cache and optional read-only probes. Modes are `all` and `any`; lanes are `client` and `client-v2`. States are `checking`, `available`, `unavailable`, and `error`, with a force-refresh `retry()`.

This gate is only a loading/empty/error experience. The server must independently authenticate and authorize every operation.
