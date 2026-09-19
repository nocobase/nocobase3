# @nocobase/audit

Explicit, immutable business audit events with replaceable output. This library has no application, HTTP, authentication, database-driver or Workflow dependency.

```ts
import { createAudit } from '@nocobase/audit';
import { createJsonlAuditWriter } from '@nocobase/audit/writers/jsonl';

const writer = createJsonlAuditWriter(
  '/absolute/prepared/directory/events.jsonl',
);
const audit = createAudit({
  context: () => ({
    appName: 'crm',
    actor: { type: 'service', id: 'importer' },
    source: { type: 'script' },
  }),
  write: (event) => writer.write(event),
});
await audit.log({
  action: 'customer.imported',
  target: { type: 'customer', id: 'c1' },
  result: 'success',
  data: { changedFields: ['name'] },
});
```

`log` synchronously captures the context and ordinary JSON input before asynchronous output, deep-copies and freezes them, adds a UUID, schemaVersion `1` and UTC occurredAt, and calls write exactly once. It returns `Promise<void>`. Optional fields must be omitted when absent; undefined, cycles, class instances, accessors and non-finite numbers are invalid JSON. Mask sensitive values before recording. No context lookup, automatic CRUD hooks, retry or business mutation occurs in the library.

`AuditContext` requires appName, actor `{ type, id }` and source `{ type, ...JSON metadata }`; tenantId, initiator and operationId are optional. `AuditInput` accepts action, optional target `{ type, id }`, result (`success`, `denied`, `failure`) and optional data (default `{}`). Unknown envelope fields are rejected. An operationId correlates events; it is not an idempotency key.

`AuditError` exposes `AUDIT_INVALID_CONTEXT`, `AUDIT_INVALID_EVENT`, or `AUDIT_WRITE_FAILED`, and an eventId for output failures. Backend exceptions and input values are not retained in diagnostics. Callers decide whether failure should propagate or be reported after an already committed business operation.

## Writers

- `@nocobase/audit/writers/repository`: `createRepositoryAuditWriter({ repository, toValues })` calls the caller-owned repository's `createOne({ values })` and awaits it. The App owns schema, mapping, transactions and querying; no database driver is imported by this adapter.
- `@nocobase/audit/writers/drive`: `createDriveAuditWriter({ disk, prefix? })` accepts a configured `@nocobase/drive` disk (FS or S3, including compatible endpoints). Each event is one JSONL object requesting private visibility at `<prefix>/<base64url-appName>/YYYY/MM/DD/<event-id>.jsonl`; prefix defaults to `audit` and must contain relative path segments using only ASCII letters, digits, hyphens and underscores. It awaits `disk.put`, with no in-memory buffer or writer-level retries. Driver/SDK retry behavior still applies. Object stores do not provide portable append, so this writer never reads and overwrites a shared log object. Each event costs one object write; batching, compaction and retention are application concerns. With ACLs disabled, bucket policy must enforce private access. The structural disk contract keeps the audit runtime independent of Drive and cloud SDKs.
- `@nocobase/audit/writers/jsonl`: `createJsonlAuditWriter(absolutePath)` serializes writes within the instance and resolves after appendFile. Prepare the directory first. It creates new files with mode `0600`, but does not change existing permissions, fsync, rotate files or serialize across processes. A failed append does not poison later calls.

All writers receive the same complete event. A writer's success means its documented completion point, not a universal durability guarantee. Standalone callers own resource disposal; the NocoBase plugin can manage it using `{ writer, dispose? }`.

## Use an application-configured Drive disk

```ts
import { defineAppConfig } from '@nocobase/app-server/config';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';
import { createDriveAuditWriter } from '@nocobase/audit/writers/drive';

export default defineAppConfig((): AuditConfig => ({
  createWriter: (services) => ({
    writer: createDriveAuditWriter({
      disk: services.resolve(driveManagerToken).use('s3'),
      prefix: 'audit',
    }),
  }),
}));
```

The App must configure the `s3` disk in its existing Drive configuration; credentials, endpoint and bucket stay there. Do not dispose the shared host Drive manager. Standalone callers can pass a disk from their own Drive manager. Switching from Repository to Drive also requires a corresponding history read path; the customer example's database page does not query object storage.

Use a private FS disk outside public static mounts: the current FS driver ignores per-write visibility and does not chmod files. Its root directory permissions and static serving are owned by the App. S3 receives the private ACL when supported; bucket policy governs access when ACLs are disabled.
