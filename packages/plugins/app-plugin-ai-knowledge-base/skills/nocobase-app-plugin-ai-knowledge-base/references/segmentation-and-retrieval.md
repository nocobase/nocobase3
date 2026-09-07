# Segmentation and Retrieval

## Contents

- [Segmentation](#segmentation)
- [Shards and content](#shards-and-content)
- [Editing and questions](#editing-and-questions)
- [Retrieval](#retrieval)

## Segmentation

Defaults are `enabled:true`, `chunkSize:6000`, `chunkOverlap:1200`. Chunk size is clamped 1..100000; overlap 0..size-1 after numeric coercion. Current normalization treats numeric zero overlap as missing and substitutes 1200 before clamping; applications that require zero overlap cannot rely on this version's server normalizer.

When enabled, LangChain `RecursiveCharacterTextSplitter` splits loaded documents. When disabled, all loaded pages are joined with two newlines into one segment. Positions are zero-based. A full run deletes old segments/shards, increments segment version, and makes shards of up to 100 segments.

Each segment has a 32-character UID, content key equal to UID, position, preview (whitespace-normalized first 200 characters), SHA-256 content hash, character length, enabled flag, version, and metadata. Initial hash uses `"\n" + content`; after an edit it uses `title + "\n" + content`.

## Shards and content

Content and questions live in shard JSON/`meta.segments`, while the segment table stores searchable metadata and a shard pointer. `getSegment` merges both. Shard JSON records schema version 1, base key, document ID, segment version, shard number, and content map.

A full regeneration deletes old shard files best-effort. A single segment deletion currently deletes only its table row and leaves its content entry in shard metadata; vectors are rebuilt without the removed row. A later full regeneration replaces the shard.

## Editing and questions

Content/question update requires the current `contentHash`; mismatch is 409. Content edit recomputes preview/hash/length/question count and dispatches rebuild-only. Question count includes questions whose `enabled` is not false.

Initial `relatedQuestions` supplied to the job create questions with 16-character ID, enabled true, and SHA-256 hash. The public vectorization action does not accept related questions. Question update accepts caller-provided arrays and does not regenerate missing IDs/hashes; preserve returned fields or have an authorized application service generate them consistently.

Enable/disable and delete dispatch rebuild-only. Regenerate optionally persists normalized segment options and dispatches a full run. These operations are LOCAL-write experiences but current routes do not enforce base type or ACL; an application proxy must.

## Retrieval

`runHitTest`/`runRetrieval` require `knowledgeBaseKey` and a nonblank query. `topK` defaults inside AI search to 3 when omitted. No route-level range exists. Score is a minimum similarity threshold; PGVector uses cosine distance with similarity score normalization, and results with score below the numeric threshold are removed. Results sort descending by score.

Only enabled bases are searched. EXTERNAL bases are skipped by the built-in feature. LOCAL search adds `{knowledgeBaseOuterId}` as vector metadata filter; READONLY does not. Vector rebuild indexes only enabled segments and enabled questions. Paragraph vectors have `sourceType:'paragraph'`; question vectors have `sourceType:'question'`. Result `matchedQuestions` comes from vector metadata when present, but the current rebuild metadata does not itself populate that property.

Missing vector config/database/LLM/model generally results in no vectors being rebuilt or no rows in search; embedding/provider/network errors reject and become 500 through the route guard. Validate prerequisites and document statuses before interpreting an empty result as a legitimate miss.
