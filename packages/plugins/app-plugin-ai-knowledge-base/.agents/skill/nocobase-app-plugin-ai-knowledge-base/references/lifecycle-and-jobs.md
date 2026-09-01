# Lifecycle and Jobs

## Contents

- [Upload to completion](#upload-to-completion)
- [Statuses and versions](#statuses-and-versions)
- [Queue behavior](#queue-behavior)
- [Rebuild and cleanup](#rebuild-and-cleanup)

## Upload to completion

A LOCAL upload creates a document with `indexStatus=PENDING`, `segmentStatus=PENDING`, counts 0, `segmentVersion=0`, `segmentRevision=0`, inherited normalized segment options, and `enabled=true`. It then dispatches vectorization.

A full job sets index and segment status to `PROCESSING`, loads the document, splits it (or creates one segment when segmentation is disabled), replaces old shards/segments, writes JSON shards of at most 100 segments, rebuilds vectors, and marks both statuses `SUCCESS`. It increments segment version and revision, updates counts/timestamp, clears errors, and refreshes knowledge-base statistics.

Failure sets both statuses to `ERROR` and writes the same message to `errorMessage` and `segmentErrorMessage`.

## Statuses and versions

Observed statuses are `PENDING`, `PROCESSING`, `SUCCESS`, and `ERROR`. The client considers PENDING/PROCESSING active, case-insensitively. `segmentVersion` changes on a full re-segmentation. `segmentRevision` increments after successful full vectorization and after a successful rebuild-only job. `segmentUpdatedAt` records success.

Segment UIDs are 32-character nanoids. Questions receive 16-character nanoids and SHA-256 hashes. Segment `contentHash` is an optimistic-concurrency token; stale edits return 409.

## Queue behavior

Job name: `KnowledgeBaseVectorization`; queue: `default`; timeout: 300000 ms. Dispatch uses group and dedup ID `ai-kb-doc:<documentId>` with a 300000 ms dedup TTL. Dispatch itself returns before processing completes.

The current upload HTTP response is a document record after dispatch. The exported client also accepts `{taskId,message?}` for compatible async upload implementations. Always branch with `isAsyncUploadResult()`.

## Rebuild and cleanup

Editing segment content/questions, enabling/disabling a segment, or deleting a segment dispatches a rebuild-only job. Rebuild-only marks index processing, deletes/recreates vectors from current enabled segments/questions, updates counts/revision/timestamp, and marks index success/error; it does not create new shards or segment versions.

Full regeneration can update document segment options and dispatches a full job. Old shard files are deleted best-effort, then segment/shard rows are removed. Source and shard file deletion errors are intentionally swallowed; verify storage cleanup separately.
