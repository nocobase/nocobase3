# Knowledge Bases and Documents

## Contents

- [Knowledge-base types](#knowledge-base-types)
- [Creation and update](#creation-and-update)
- [Documents](#documents)
- [Statistics and deletion](#statistics-and-deletion)

## Knowledge-base types

| Type       | Current built-in behavior                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL`    | Accepts multipart single-file document upload; splits/stores segments; builds vectors; search filters vector rows by `knowledgeBaseOuterId`; default provider `NocobaseLocalVectorStore`.                                                         |
| `READONLY` | Upload is rejected. Default provider `NocobaseReadOnlyVectorStore`. Built-in search uses the selected vector database without the LOCAL outer-ID filter. The service's full vector rebuild returns without writing because rebuild is LOCAL-only. |
| `EXTERNAL` | Upload is rejected. Uses the selected vector-store provider registered through `aiManager.features.vectorStoreProvider` and passes `vectorStoreProps` to that provider's service.                                                                 |

The server enforces the LOCAL-only rule before accepting a document.

## Creation and update

Keys and outer IDs default to 32-character nanoids; database uniqueness is on key. `enabled` defaults true. Segment options normalize as documented in [application-contracts](application-contracts.md). Counts initialize to zero. `vectorStoreUpdatedAt` and `confirmVectorStoreChanged` initialize to the same creation time.

LOCAL and READONLY require `vectorDatabaseKey`, `llmService`, and `embeddingModel`. These values are normalized and stored directly on `aiKnowledgeBase`; the server derives a stable SHA-256 `vectorStoreConfigHash`. Updating any of the three fields refreshes the hash and `vectorStoreUpdatedAt` only when the normalized configuration actually changes. Ordinary updates preserve both fields. A configuration change does not automatically re-vectorize documents; obtain confirmation, test the new connection/model, then explicitly dispatch selected rebuilds.
The current service does not validate that a referenced vector database, LLM service, or embedding model exists during base creation/update. Failures surface later during vectorization/retrieval. Validate options first using enabled vector databases and AI model actions.

## Documents

Each request uploads exactly one file as `multipart/form-data`. Supported extensions are exactly `.pdf`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.txt`, `.md`, `.json`, and `.csv`, case-normalized from the filename. MIME type is recorded as metadata, but the filename extension is the acceptance check. Parsing behavior follows the AI document loader: PDF, PowerPoint, Word, Excel, CSV, and text-like formats use their corresponding loader paths; password-protected or malformed documents can fail during asynchronous processing.

The maximum is 104857600 bytes (100 MiB). Both clients and the upload route should reject a larger file, but upstream request-body limits should also be configured so oversized bodies are stopped before full buffering. Extension and size checks are capability checks, not content inspection; scan untrusted files and apply deployment-specific malware and content policies.

The caller selects the knowledge base, not an upload disk. The server uses the allowed disk stored on the knowledge-base record; a missing, unavailable, or disallowed disk causes the upload to fail. One successful request creates and returns one document. Document key defaults to a 32-character nanoid. Initial statuses/counts/versions and the queue lifecycle are in [lifecycle-and-jobs](lifecycle-and-jobs.md). The authenticated user ID is stored as creator for uploads.

## Statistics and deletion

Knowledge-base `documentCount` and `characterCount` refresh after successful vectorization and document deletion. Character count sums document character counts. `aiEmployeeCount` is initialized but is not updated by this service.
Deleting a document removes its LOCAL vector rows by document ID before removing segment rows, shard rows, shard files, source file, and document row. Deleting a base first attempts LOCAL vector cleanup by `knowledgeBaseOuterId`, then performs document cleanup and removes the base. Cleanup failures during base deletion are logged and deletion continues, so deployments should monitor warnings and verify external vector stores separately.
