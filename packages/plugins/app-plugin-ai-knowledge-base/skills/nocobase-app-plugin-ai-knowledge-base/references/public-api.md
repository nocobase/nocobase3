# Public API

## Contents

- [Exported subpaths](#exported-subpaths)
- [Recommended application APIs](#recommended-application-apis)
- [Internal boundaries](#internal-boundaries)

## Exported subpaths

| Import                                                           | Exports and use                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nocobase/app-plugin-ai-knowledge-base`                         | Same client surface as `/client`; convenient application import.                                                                                                    |
| `@nocobase/app-plugin-ai-knowledge-base/client`                  | Default client plugin, `AIKnowledgeBaseClientOptions`, components, hooks, providers/services/types/utilities, route-path helpers, and AI settings-shell re-exports. |
| `@nocobase/app-plugin-ai-knowledge-base/client/plugin`           | Default `AppClientPluginFactory`; registration entry. Options currently contain only `readonly placeholder?: never`.                                                |
| `@nocobase/app-plugin-ai-knowledge-base/client/bootstrap`        | Default no-op bootstrap that imports locales; normally loaded by plugin lifecycle, not application code.                                                            |
| `@nocobase/app-plugin-ai-knowledge-base/client/routes`           | Default `defineClientRoutes([])` result; currently no standalone route declarations.                                                                                |
| `@nocobase/app-plugin-ai-knowledge-base/client/settings-pages`   | `KnowledgeBaseSettingsPage` and `VectorDatabaseSettingsPage`.                                                                                                       |
| `@nocobase/app-plugin-ai-knowledge-base/client/vector-databases` | `Component` and default export for the vector-database page.                                                                                                        |
| `@nocobase/app-plugin-ai-knowledge-base/package.json`            | Manifest metadata.                                                                                                                                                  |

Client peers are `@nocobase/app-client`, `@refinedev/core`, React 19, and React Router 7.

## Recommended application APIs

Prefer:

- `knowledgeBaseService` for the standard authenticated adapter;
- `KnowledgeBaseServiceProvider` to inject a version-locked proxy or test service;
- `createKnowledgeBaseService(client)` only when adapting a compatible NocoBase action client;
- `useKnowledgeBase`, `useKnowledgeBaseDocument`, and `useKnowledgeBaseSegment` for stale-safe React state;
- exported route-path helpers and settings pages instead of duplicating paths;
- exported DTO types and normalization/error utilities.

The exported component barrel also includes knowledge-base, document, retrieval, segment, upload, common, i18n, prerequisite, and `VectorDatabasesPage` components. Treat page-level UI as version-coupled; service/types/hooks are the narrower integration boundary.

## Internal boundaries

Do not import any unexported file path, including dependency-internal source/build paths or server implementation paths. In particular:

- server `KnowledgeBaseService` is not exported;
- `TableRepository` is internal;
- the hidden AI-manager service bridge is internal;
- migrations and queue jobs are lifecycle-managed;
- AI feature enablement is automatic;
- the built-in PGVector provider has no public application registration API;
- no public API in this package registers additional vector-database providers.
