# @nocobase/app-plugin-audit

NocoBase 3 integration for explicit business audit events. Register the Server plugin and supply an `audit.createWriter` factory returning `{ writer, dispose? }`. There is no default table, automatic capture, client service or universal history page.

```ts
import auditPlugin, {
  auditServiceToken,
  logAuditBestEffort,
} from '@nocobase/app-plugin-audit/server';

const audit = app.container.resolve(auditServiceToken).for({
  actor: { type: 'user', id: verifiedSession.user.id },
  source: { type: 'http', requestId },
});
// Complete and commit the business operation before this best-effort record.
await logAuditBestEffort(
  audit,
  {
    action: 'crm.customer.updated',
    target: { type: 'crm.customer', id: customer.id },
    result: 'success',
    data: { changedFields: ['phone'] },
  },
  (diagnostic) => logger.error(diagnostic, 'Audit output failed.'),
);
```

Import the original service token; never recreate it by name. AppAudit is shared, but `for` creates an isolated immutable context for one execution and supplies the host's appName. It does not authenticate or authorize. Pass the resulting Audit explicitly into business services; never retain it on a shared service across users.

The Provider constructs one binding during boot, rejects use before readiness or during shutdown, drains admitted writes, and invokes the binding's optional dispose exactly once. Only dispose factory-owned resources, not the host database. The App supplies `@nocobase/audit`, this plugin and its shared runtime peers as production dependencies.

Plain `audit.log` propagates validation or write failure. `logAuditBestEffort` is for confirmed business results: it reports only code/eventId, contains reporter failure, and never retries. It can lose a postcommit record on output failure; it does not provide atomic business/audit commit or an outbox.

See the [design](docs/proposals/README.md), [usage guide](docs/README.md) and shipped [App Skill](skills/nocobase-app-plugin-audit/SKILL.md). `@nocobase/app-plugin-audit-example` supplies a customer domain, migration, owner authorization, HTTP/Job/App-owned WS integration and UI in the Examples App. Workflow adaptation is excluded from v1.

For application-configured FS or S3 storage, use `createDriveAuditWriter` from `@nocobase/audit/writers/drive` with `services.resolve(driveManagerToken).use(diskName)`; the token is exported by `@nocobase/app-server/drive`. Each event becomes a separate JSONL object requesting private visibility, avoiding shared-object append races. See the [usage guide](docs/README.md) for configuration and read-path implications. Direct local file append remains available through `createJsonlAuditWriter`.

Use a private FS disk outside public static mounts: the current FS driver ignores per-write visibility and does not chmod files. Its root directory permissions and static serving are owned by the App. S3 receives the private ACL when supported; bucket policy governs access when ACLs are disabled.
