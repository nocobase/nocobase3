---
name: nocobase-app-plugin-ai-knowledge-base
description: Use when developing a generated NocoBase App that consumes AI Knowledge Base features for knowledge bases, documents, segmentation, retrieval, vector databases, or client integration; do not use it to maintain the dependency package itself.
argument-hint: '[operation: inspect|configure|integrate|verify] [appRoot] [knowledgeBaseKey?]'
allowed-tools: Bash, Read, Write, Grep, Glob
owner: nocobase-platform
version: 1.0.0
risk-level: high
last-reviewed: 2026-04-09
---

# Goal

Guide a coding agent working inside `<appRoot>`, the source directory created by `pnpm create @nocobase/app`, to safely consume and extend the installed `@nocobase/app-plugin-ai-knowledge-base`. This is an application-development skill, not a guide to changing the dependency package.

# Scope

- Verify installation, registration, enablement, migrations, authentication, AI, queue, and storage prerequisites.
- Consume the package's exported client plugin, types, service, hooks, components, routes, and settings-page entry points.
- Call the authenticated `/v2/api` compatibility actions for knowledge-base, document, segment, retrieval, and vector-database operations.
- Configure LOCAL, READONLY, and EXTERNAL knowledge bases, document processing, PGVector, embedding services, and asynchronous vectorization.
- Build application-side integrations with explicit validation, error handling, and production safety checks.
- Install and customize the package-owned Registry items `providers`, `components`, and `workspace` when the generated App must own editable client source.

# Non-Goals

- Do not modify the installed dependency package to customize one application.
- Do not treat internal repositories, hidden bridges, jobs, migrations, or server classes as application APIs.
- Do not edit the plugin's historical migration; use a new application/plugin migration only when a schema change is genuinely required and separately reviewed.
- Do not commit real passwords, connection strings, tokens, or API keys.
- Do not import from unexported package paths. Use only the package root or the documented exported subpaths.
- Do not describe client affordances, `accessAbility`, TypeScript types, or hidden buttons as server authorization.

# Input Contract

| Input                             |                Required | Meaning                                                                                          |
| --------------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------ |
| `task`                            |                     yes | The application change or verification objective.                                                |
| `appRoot`                         |                     yes | Absolute or working-directory path of the generated App.                                         |
| `operation`                       |                     yes | `inspect`, `configure`, `integrate`, or `verify`.                                                |
| `knowledgeBaseType`               |        when configuring | `LOCAL`, `READONLY`, or `EXTERNAL`, case-sensitive.                                              |
| `client/server scope`             |                     yes | Which application layer is allowed to change.                                                    |
| `vector backend`                  |           when relevant | Existing PGVector database/configuration or an explicitly supported external provider.           |
| `plugin owner`                    |                     yes | The application/plugin responsible for the change.                                               |
| `destructive change confirmation` | before destructive work | Explicit confirmation for deletion, rebuild, credential changes, ZIP processing, or schema work. |

# Workflow

1. Confirm `<appRoot>` and read its `package.json`; use only scripts and dependency versions actually present there.
2. Check that `@nocobase/app-plugin-ai-knowledge-base` is installed, registered, and enabled. Check AI Employee, authentication, database, and queue prerequisites before using a feature. Read [installation-and-prerequisites](references/installation-and-prerequisites.md).
3. Load the reference for the task: use [application-contracts](references/application-contracts.md) for exact calls, [http-api](references/http-api.md) for direct HTTP, [client-integration](references/client-integration.md) for React/client work, and the domain references for lifecycle details.
4. Prefer the exported client `KnowledgeBaseService` or authenticated application HTTP adapter. Never couple application code to an unexported implementation path.
5. Implement the smallest application-side change. Preserve credentials in environment variables or the App's secret mechanism, and keep server-side authorization independent of UI state.
6. When editable App-owned source is required, materialize `providers`, then `components`, then `workspace` into their independent `client/extensions/nocobase-ai-knowledge-base-*` targets. Prepare declared npm/shadcn dependencies and plugin enablement first; materialization does none of those tasks and refuses existing targets.
7. Treat the installed Registry copy as application-owned. Merge a newer canonical source with a three-way merge; never overwrite App changes by default.
8. For uploads, validate extension and size before sending; distinguish a document response from `{ taskId, message? }`. For segmentation/vectorization, record status fields and make retries observable.
9. Run the App's real lint, typecheck, test, and build scripts when they exist. Start the App for an authenticated smoke test when the task changes runtime behavior.
10. Report the public entry points used, files changed, prerequisites, async jobs, data/deletion impact, validation commands/results, and remaining deployment risks.

# Reference Loading Map

| Task                                         | Read first                                                                     | Then read                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Any integration                              | [application-contracts](references/application-contracts.md)                   | [troubleshooting](references/troubleshooting.md)       |
| Install/enable/prerequisites                 | [installation-and-prerequisites](references/installation-and-prerequisites.md) | [architecture](references/architecture.md)             |
| Client pages, React, hooks, routes, settings | [client-integration](references/client-integration.md)                         | [public-api](references/public-api.md)                 |
| CRUD, upload, document status                | [knowledge-bases-and-documents](references/knowledge-bases-and-documents.md)   | [lifecycle-and-jobs](references/lifecycle-and-jobs.md) |
| Segments, questions, retrieval               | [segmentation-and-retrieval](references/segmentation-and-retrieval.md)         | [lifecycle-and-jobs](references/lifecycle-and-jobs.md) |
| PGVector or vector-store configuration       | [vector-databases](references/vector-databases.md)                             | [security](references/security.md)                     |
| Schema/data inspection                       | [data-model](references/data-model.md)                                         | [security](references/security.md)                     |
| Direct `/v2/api` calls                       | [http-api](references/http-api.md)                                             | [security](references/security.md)                     |
| Failure diagnosis                            | [troubleshooting](references/troubleshooting.md)                               | the relevant domain reference                          |

# Safety Gate

Obtain explicit confirmation before deleting a knowledge base or document, deleting a vector database, changing vector-store or embedding configuration, changing connection information, rebuilding segmentation or vectors for many documents, processing an untrusted ZIP, changing authentication/permissions, changing schema, or calling a compatibility action against production data. Confirm backups and rollback expectations first.

# Verification Checklist

- App root and actual scripts identified.
- Plugin and required dependencies are installed, registered, enabled, and migrated.
- Authenticated API calls succeed; 401/400/404/409/500 paths are handled.
- Settings and routes are reachable after the client bootstrap loads.
- Knowledge-base CRUD, document upload/status, segment listing/editing, retrieval, and vector-database connection tests behave as expected.
- LLM embedding service/model and queue execution are available.
- Deletes remove dependent files/segments/vectors as documented, and rollback/backup guidance is recorded.
- No credentials appear in source, logs, examples, or Git history.

# Output Contract

Return: `<appRoot>`; public package entries used; changed files; plugin/dependency status; knowledge-base type; vector database and embedding prerequisites; synchronous/asynchronous behavior; data and deletion impact; validation commands and results; and unresolved security, deployment, or version risks.

# References

- [Architecture](references/architecture.md)
- [Application Contracts](references/application-contracts.md)
- [Installation and Prerequisites](references/installation-and-prerequisites.md)
- [Public API](references/public-api.md)
- [HTTP API](references/http-api.md)
- [Client Integration](references/client-integration.md)
- [Knowledge Bases and Documents](references/knowledge-bases-and-documents.md)
- [Segmentation and Retrieval](references/segmentation-and-retrieval.md)
- [Vector Databases](references/vector-databases.md)
- [Data Model](references/data-model.md)
- [Lifecycle and Jobs](references/lifecycle-and-jobs.md)
- [Security](references/security.md)
- [Troubleshooting](references/troubleshooting.md)
- [Official NocoBase Documentation](https://docs.nocobase.com/): use only to confirm generated-App and deployment conventions; this skill's bundled contracts remain version-specific. [verified: 2026-04-09]
