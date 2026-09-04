# @nocobase/app-plugin-mail

This package owns the v3 user-mailbox runtime. It is intentionally separate
from notification delivery: `@nocobase/app-plugin-notification-providers`
sends application notifications, while this package sends mail from
user-connected accounts and synchronizes their mailboxes.

## MVP scope

The first runnable vertical slice provides:

- authenticated Mail API routes for sending, starting sync, reading sync
  status, and reading synchronized messages;
- a synchronous `SendMailOperation` with a persisted idempotency key and an
  explicit `unknown` result for indeterminate Provider submissions;
- resumable initial and incremental mailbox synchronization;
- a persisted `MailSyncRun`, transactional Mail Outbox, Outbox Relay, Queue
  Job adapter, and `SyncMailboxOperation`;
- revision- and lease-fenced Queue steps so stale deliveries and workers become
  no-ops instead of advancing newer state;
- request-fingerprinted send idempotency and lease-fenced submission results;
- bounded history pages followed by catch-up from the watermark captured
  before history import;
- idempotent message upserts by `(accountId, providerMessageId)`;
- Provider contracts, registry, adapter resolver, database storage, and an
  explicit migration.

The MVP does not provide UI, OAuth routes, Provider credentials, attachment
downloads, push webhooks, scheduled sync, subscription renewal, or concrete
Gmail/Microsoft Provider implementations. Provider plugins register a
`MailProviderDefinition` and own their credentials and external API calls.

## Runtime flow

```text
POST /api/mail/messages/send
  -> MailService -> SendMailOperation -> Provider Adapter
                 -> mailSubmissions

POST /api/mail/accounts/:accountId/sync
  -> MailService
  -> mailSyncRuns + mailOutbox in one transaction
  -> Mail Outbox Relay
  -> mail Queue
  -> SyncMailboxJob
  -> SyncMailboxOperation
  -> one bounded Provider page
  -> messages + checkpoint + next Outbox in one transaction
```

An initial sync first captures a Provider change watermark, imports bounded
history pages, then catches up changes from that watermark. One Queue
execution advances one state-machine step, so a large mailbox never requires
one unbounded HTTP request or one unbounded Job.

The default initial policy is 10,000 messages with pages of 200; API callers
may choose 1–100,000 messages and pages of 1–500. Provider cursors are opaque
and are never returned by the HTTP API as standalone Queue payloads.

## Provider integration

```ts
import {
  mailProviderRegistryToken,
  type MailProviderDefinition,
} from '@nocobase/app-plugin-mail';

const definition: MailProviderDefinition = createProviderDefinition();
app.container.resolve(mailProviderRegistryToken).register(definition);
```

For safe initial sync, a Provider adapter implements:

- `getCurrentSyncCursor()` to capture the pre-history watermark;
- `listMessages()` for bounded history pagination;
- `listChanges()` for bounded catch-up and later incremental sync.

For sending, it implements `sendMessage()`. A Provider that accepted a message
but cannot return an identifier may omit `providerMessageId`. Network or
protocol ambiguity must return `submission_unknown`; callers must not blindly
resend it.

## HTTP API

All MVP routes require an authenticated application session:

```text
GET  /api/mail/accounts
GET  /api/mail/accounts/:accountId/identities
POST /api/mail/messages/send
POST /api/mail/accounts/:accountId/sync
GET  /api/mail/sync-runs/:syncRunId
GET  /api/mail/messages
GET  /api/mail/accounts/:accountId/messages/:messageId
```

Account ownership is enforced again in `MailService`; Route authentication is
not treated as ownership authorization. Inactive accounts cannot send or
synchronize. Public responses omit credential references, Provider cursors,
leases, and internal error messages.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail lint
pnpm --filter @nocobase/app-plugin-mail typecheck
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail build
```
