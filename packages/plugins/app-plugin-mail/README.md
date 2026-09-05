# @nocobase/app-plugin-mail

This package owns the v3 user-mailbox runtime. It is intentionally separate
from notification delivery: `@nocobase/app-plugin-notification-providers`
sends application notifications, while this package sends mail from
user-connected accounts and synchronizes their mailboxes.

## MVP scope

The first runnable vertical slice provides:

- authenticated Mail API routes for sending, starting sync, reading sync
  status, and reading synchronized messages;
- authenticated OAuth start plus a public one-time-state callback;
- Settings UI for Provider authorization, connected accounts, and bounded
  initial-sync policy;
- an authenticated Mail workspace with an application-sidebar entry, account
  and folder navigation, message search and filters, and conversation detail;
- a development-only playground for sending mail, triggering sync, and
  inspecting synchronized messages;
- AES-256-GCM encrypted OAuth credential storage with token-rotation support;
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
- resumable Provider folder discovery with cursor reconciliation for folder
  additions and removals;
- idempotent message upserts by `(accountId, providerMessageId)`;
- indexed message-folder relations and Provider-native conversation lookup;
- Provider contracts, registry, adapter resolver, database storage, and an
  explicit migration.

The MVP does not provide message mutations from the workspace, push webhooks,
scheduled sync, subscription renewal, or outbound attachments. Gmail and Microsoft
implementations live in separate Provider plugins; Mail Core owns OAuth
transactions and encrypted credential storage, while Provider plugins own
protocol calls and token refresh behavior.

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

An initial sync first establishes a Provider change watermark, imports bounded
history pages, then catches up changes from that watermark. A Provider may use
empty, resumable preparation pages to establish per-folder watermarks before
returning history. One Queue
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

- `getCurrentSyncCursor()` to initialize the pre-history baseline;
- `listMessages()` for resumable baseline preparation and bounded history
  pagination; it returns the established checkpoint as `syncCursor`;
- `listChanges()` for bounded catch-up and later incremental sync.

Providers with folder hierarchies implement paginated `listFolders()` and
`reconcileSyncCursor()`. A folder page is persisted before another Queue task
is planned, so discovering a large hierarchy remains bounded and resumable.

For sending, it implements `sendMessage()`. A Provider that accepted a message
but cannot return an identifier may omit `providerMessageId`. Network or
protocol ambiguity must return `submission_unknown`; callers must not blindly
resend it.

## HTTP API

All MVP routes require an authenticated application session:

```text
GET  /api/mail/accounts
GET  /api/mail/providers
POST /api/mail/authorizations
GET  /api/mail/accounts/:accountId/identities
GET  /api/mail/accounts/:accountId/folders
POST /api/mail/messages/send
POST /api/mail/accounts/:accountId/sync
GET  /api/mail/sync-runs/:syncRunId
GET  /api/mail/messages
GET  /api/mail/accounts/:accountId/messages/:messageId
GET  /api/mail/accounts/:accountId/conversations/:conversationId/messages
```

`GET /mail/oauth/callback` is intentionally public because Google and
Microsoft redirect the browser to it. It accepts only a short-lived,
single-use state created by the authenticated start endpoint and redirects the
browser to `/settings/mail` after completion; state and PKCE verifiers are
never returned by account APIs.

Mailbox read APIs require `page:mail/access` or
`page:mail.settings/access`. OAuth, synchronization, and sending APIs require
`page:mail.settings/access`. Account ownership is enforced again in
`MailService`; Route authentication is not treated as ownership authorization.
Inactive accounts cannot send or synchronize. Public responses omit credential
references, Provider cursors, leases, and internal error messages.

The `/mail` workspace opens a complete conversation only when a Provider
supplies its stable identifier (`threadId` for Gmail or `conversationId` for
Microsoft Graph). Messages without that identifier open independently; the
core does not infer a conversation from a matching subject.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail lint
pnpm --filter @nocobase/app-plugin-mail typecheck
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail build
```
