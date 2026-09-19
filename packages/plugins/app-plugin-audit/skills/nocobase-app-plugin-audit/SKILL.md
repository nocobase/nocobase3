---
name: nocobase-app-plugin-audit
description: Add explicit business audit events to a NocoBase 3 App using AppAudit.for and audit.log, choose Repository, Drive or local JSONL output, and verify identity, masking, and application-owned history. Use for business operation audit integration, not automatic CRUD capture or Workflow adaptation.
---

# Business audit integration

Use the installed package's public exports. Do not edit the generated App `.agents/skills/` copy; this Skill is owned by `@nocobase/app-plugin-audit/skills/`.

## Before editing

Find the actual business completion point and list the actions that require records. Follow the host App's authentication, authorization, database and plugin conventions. Audit does not authenticate a caller, authorize a mutation, or discover operations automatically.

The App supplies `@nocobase/audit`, `@nocobase/app-plugin-audit`, `@nocobase/app-server` and `@nocobase/service-provider` as production dependencies. Consumers import the original `auditServiceToken` from `@nocobase/app-plugin-audit/server`; never recreate a token by name. Register the default Server plugin in `server/plugins.ts`.

## Assemble output once

Add an `audit` config factory to the App's existing `defaultAppConfigs`. Its `createWriter(services)` returns `{ writer, dispose? }`, possibly asynchronously. The writer implements `write(event): Promise<void>`. Missing configuration is a startup error, not a reason to inject a fallback silently.

```ts
import { defineAppConfig } from '@nocobase/app-server/config';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';

export default defineAppConfig((): AuditConfig => ({
  createWriter: (services) => ({ writer: createBusinessWriter(services) }),
}));
```

`createBusinessWriter` is App-owned. Use `createRepositoryAuditWriter` from `@nocobase/audit/writers/repository` with `{ repository, toValues }`; create the table through an explicit App migration and map every required column. Or use `createJsonlAuditWriter(absoluteFilePath)` from `@nocobase/audit/writers/jsonl`, preparing its directory first. JSONL resolves after appendFile, without an fsync guarantee. A different output requires a corresponding read path; the plugin supplies no universal history API.

For application-configured file or cloud storage, use `createDriveAuditWriter({ disk: services.resolve(driveManagerToken).use('s3'), prefix: 'audit' })` from `@nocobase/audit/writers/drive`; import the original `driveManagerToken` from `@nocobase/app-server/drive`. Select an existing FS or S3 disk (including compatible endpoints), keeping credentials and bucket configuration in Drive. The writer awaits put for one JSONL object requesting private visibility per event at `<prefix>/<base64url-appName>/YYYY/MM/DD/<event-id>.jsonl`. Never emulate append by reading and overwriting one shared object. There is no writer buffer or retry; driver retries may apply. Account for per-object costs and application-owned retention/read paths. When ACLs are disabled, enforce privacy through bucket policy. Do not dispose the host Drive manager.

Provider shutdown rejects new writes, drains admitted writes, and calls the binding's `dispose` once. Include a disposer only for resources the factory created; never close the host's shared database or logger.

## Bind at the trusted entry, record at the business fact

```ts
import {
  auditServiceToken,
  logAuditBestEffort,
} from '@nocobase/app-plugin-audit/server';

const audit = app.container.resolve(auditServiceToken).for({
  actor: { type: 'user', id: verifiedSession.user.id },
  source: { type: 'http', requestId: serverRequestId },
});
const result = await updateCustomer(identity, validatedInput, audit);
```

`for` snapshots and freezes trusted context. It does not write an event. The host supplies `appName`; business inputs cannot override it or the actor. Pass Audit as an explicit parameter, never store a request-bound Audit on a shared Service.

At the actual completion point, construct `{ action, target?, result, data? }` and call `audit.log`. Results are `success`, `denied`, or `failure`. Use stable semantic action/target identifiers, e.g. `crm.customer.updated` and `{ type: 'crm.customer', id }`. Select fields and mask sensitive values before calling log; do not pass forms, headers, session tokens or whole ORM records. Data must be ordinary finite JSON; omit absent optional fields rather than sending undefined. No-op edits need no success event. An event is copied before asynchronous output and invokes its writer once, with no retry.

If business work has already committed, use `logAuditBestEffort(audit, input, report)` to report only its safe code and optional eventId. It also contains reporter failures. Do not retry the business operation to compensate for a failed audit write. When the caller owns an outer transaction, move recording to after that outer commit. Plain `audit.log` rejects on failure; choose deliberately at the business boundary.

HTTP binds verified session identity per request. An App-owned authenticated WS handler must revalidate identity and bind per message; do not extend the built-in Realtime subscription protocol. Jobs bind per attempt using actual `this.context.jobId` and `attempt`, a service actor and, when applicable, a trusted initiator retained by the server-side dispatcher. Cross-process execution must bind anew.

## Own the read path

The App owns tables, retention, queries, permissions and UI. Filter history by the trusted user's scope and application/target; do not trust browser-supplied owner or tenant values. Preserve log access deliberately after target deletion. Use the host `useApiClient` for the page. History refresh failure must not prompt repeating a saved mutation.

The repository's `@nocobase/app-plugin-audit-example` demonstrates private customer CRUD, phone masking, real HTTP/Job/WS entries and retained history. It is an example domain, not a required schema or generic audit administration interface.

## Verify the integration

Exercise create, update and delete through the real entry and query the actual output. Check actor/source/target and masked changes; verify no-op, conflict, authorization denial and rolled-back work do not produce success records. Confirm another user cannot read or mutate the customer's records. Inject an output failure after commit and verify the business result remains successful and is not retried. Verify each enabled entry, writer replacement, and resource disposal separately.

V1 excludes Workflow adaptation, automatic repository/HTTP rules, ALS, a universal runtime, event DSL, mandatory tables, generic history UI, version restore, automatic compensation/outbox, and tamper-proof guarantees.

Use a private FS disk outside public static mounts: the current FS driver ignores per-write visibility and does not chmod files. Its root directory permissions and static serving are owned by the App. S3 receives the private ACL when supported; bucket policy governs access when ACLs are disabled.
