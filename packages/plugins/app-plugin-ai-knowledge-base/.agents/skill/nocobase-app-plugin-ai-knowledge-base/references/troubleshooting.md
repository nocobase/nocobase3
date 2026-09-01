# Troubleshooting

## Contents

- [HTTP errors](#http-errors)
- [Processing failures](#processing-failures)
- [Vector failures](#vector-failures)
- [UI and route failures](#ui-and-route-failures)

## HTTP errors

- 401 `Authentication required`: send the App's authenticated session headers/cookies.
- 400: required query/body field missing, or validation exposed a 400 status. Read `errors[0].message`.
- 404: base/document/segment/vector database missing, or a thrown message matched “not found”.
- 409: vector table already exists or segment content hash is stale; reload before retrying. Vector database in-use deletion also returns 409.
- 500: unclassified validation, parser, queue, embedding, database, storage, or provider failure. The route currently returns the thrown message; avoid exposing this raw detail to untrusted clients.

Use exported `normalizeKnowledgeBaseError(error, fallback)`. It returns `{status?,message,conflict,forbidden,unavailable}`; unavailable is true for 204/404 and forbidden for 403, even though current plugin routes do not emit 403 themselves.

## Processing failures

Poll or refresh document fields. `PENDING` means queued; `PROCESSING` means executing; `ERROR` includes `errorMessage` and `segmentErrorMessage`. Verify the `default` queue worker, the 300-second job timeout, source-file durability, document loader availability, and dedup behavior. A retry can call `vectorizeDocuments` for selected IDs; large retries require confirmation.

## Vector failures

Validate provider name exactly (`NocobaseDefaultPGVectorProvider`), positive integer port, required host/user/database/table, and table-name regex. `testConnection` only runs `SELECT 1`; create additionally checks whether the configured table exists unless `skipTableExistedCheck=true`. Confirm PostgreSQL vector capability, embedding service/model, enabled vector database, and network access.

If retrieval returns no rows, verify enabled base, non-EXTERNAL type, vector config, enabled segments/questions, successful vectorization, threshold, and LOCAL metadata filter. The current search skips EXTERNAL bases in the built-in feature.

## UI and route failures

Confirm AI Employee client plugin/settings shell is enabled and translations have loaded. Settings tabs are registered as `knowledge-base` and `vector-database`. The exported standalone routes file is intentionally empty; settings pages use an internal memory router. Use exported path helpers instead of guessing URLs.

If prerequisite state is stale, call its `retry()`; enabled-plugin/probe results are cached for 60 seconds.
