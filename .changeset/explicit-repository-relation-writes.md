---
"@nocobase/db": minor
"@nocobase/repository-input": patch
"@nocobase/app-server": minor
"@nocobase/app-plugin-repository-example": patch
---

Add server-owned writePolicy for single and bulk creates/updates, root upserts and
mutation preflight. Internal Repository calls default to true. Explicit policies
restrict scalar fields, each relation operation, nested create/update/upsert branches
and through payloads before any writes. Add buildWritePolicy, buildUpsertWritePolicy
and synchronous callback input, frozen snapshots and structured policy errors.

Replace defineRepositoryApiRoutes action arrays with configuration objects and move
maxLimit to actions.findMany. API create/update actions default to writePolicy false
and require explicit allowlists; true and client-supplied policies are rejected.
Return HTTP 403 for forbidden writes and migrate the Repository example's routes,
fixtures and integration guidance to field and relationship policies.
