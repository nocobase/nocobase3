# Knowledge Bases and Documents

## Contents

- [Knowledge-base types](#knowledge-base-types)
- [Creation and update](#creation-and-update)
- [Documents and ZIP](#documents-and-zip)
- [Statistics and deletion](#statistics-and-deletion)

## Knowledge-base types

| Type       | Current built-in behavior                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL`    | Accepts direct document upload; splits/stores segments; builds vectors; search filters vector rows by `knowledgeBaseOuterId`; default provider `NocobaseLocalVectorStoreProvider`.                                                                               |
| `READONLY` | Direct upload is rejected. Default provider `NocobaseReadonlyVectorStoreProvider`. Built-in search uses the selected vector database without the LOCAL outer-ID filter. The service's full vector rebuild returns without writing because rebuild is LOCAL-only. |
| `EXTERNAL` | Direct upload is rejected. Uses supplied `externalProvider`. The built-in `KnowledgeBaseFeatureService.search` skips EXTERNAL bases, so retrieval requires another integrated external provider path; this package does not expose a provider-registration API.  |

Only the direct upload method explicitly enforces LOCAL. The compatibility JSON finalize route currently lacks that check; do not use it to bypass type behavior.

## Creation and update

Keys and outer IDs default to 32-character nanoids; database uniqueness is on key. `enabled` defaults true. Segment options normalize as documented in [application-contracts](application-contracts.md). Counts initialize to zero. `confirmVectorStoreChanged` initializes to the creation time.

For non-EXTERNAL create, supplying any vector/embedding config field creates `aiVectorStoreConfig`. Updating LLM service, embedding model, or vector database updates/creates that config. Changing these fields does not automatically re-vectorize existing documents. Obtain confirmation, test the new connection/model, then explicitly dispatch selected rebuilds.

The current service does not validate that a referenced vector database, LLM service, or embedding model exists during base creation/update. Failures surface later during vectorization/retrieval. Validate options first using enabled vector databases and AI model actions.

## Documents and ZIP

Supported extensions are exactly `.doc`, `.docx`, `.md`, `.pdf`, `.txt`, `.zip`, case-normalized from the filename. The server's actual parsing quality depends on the AI document loader. If no raw loader is registered, it falls back to UTF-8 bytes, which is only appropriate for text-like data and not a faithful DOC/PDF parser.

The advertised maximum is 104857600 bytes. The default client enforces it after `getUploadStorage`; server multipart does not. MIME is recorded but extension is the acceptance check.

ZIP behavior:

- directory entries and path segments equal to `..` are skipped;
- backslashes normalize to slashes and only basename is retained;
- supported non-ZIP entries are recursively uploaded;
- an archive with no supported documents fails;
- nested ZIPs are ignored;
- all extracted docs are created, but the response is only the first;
- no bomb/aggregate limits exist.

Document key defaults to a 32-character nanoid. Initial statuses/counts/versions and the queue lifecycle are in [lifecycle-and-jobs](lifecycle-and-jobs.md). The authenticated user ID is stored as creator for uploads.

## Statistics and deletion

Knowledge-base `documentCount` and `characterCount` refresh after successful vectorization and document deletion. Character count sums document character counts. `aiEmployeeCount` is initialized but is not updated by this service.

Deleting a document removes its segment rows, shard rows, shard files, source file, and document row; file errors are swallowed. Deleting a base performs document cleanup then removes the base. Neither path deletes the vector-store config record, and direct delete does not explicitly remove vector-store rows. Verify and clean orphaned external vector/config data through an approved migration/maintenance operation rather than direct application table writes.
