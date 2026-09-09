# @nocobase/app-plugin-mail

This package owns the v3 user-mailbox runtime. It is intentionally separate
from notification delivery: `@nocobase/app-plugin-notification-providers`
sends application notifications, while this package sends mail from
user-connected accounts and synchronizes their mailboxes.

## Current scope

The first runnable vertical slice provides:

- authenticated Mail API routes for sending, starting sync, reading sync
  status, and reading synchronized messages;
- authenticated OAuth start plus a public one-time-state callback;
- a permission-protected Mail Settings group with `/settings/mail/accounts`
  for read-only all-user account visibility, plus
  `/settings/mail/send-logs` for all-user synchronization and delivery
  operation logs;
- a production Mail workspace at `/mail` and current-user account management at
  `/settings/mail/my-accounts`, plus development diagnostics under `/dev/mail`;
- account and folder filtering, refresh, message
  search, conversation detail, account connection, synchronization controls,
  sending, synchronization logs, and delivery submission logs;
- database-backed OAuth credential storage with token-rotation support;
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
- reply and forward behavior using Provider-native conversation APIs;
- Provider-backed draft creation from the production composer;
- Provider-backed editing and sending of existing drafts;
- scheduled delivery persisted through the Outbox and Queue;
- automatic mailbox synchronization every five minutes by default, configurable
  with `MAIL_AUTOMATIC_SYNC_INTERVAL_MS`;
- authenticated Provider push webhooks that coalesce notifications into the
  existing incremental synchronization pipeline;
- automatic Gmail watch and Microsoft Graph subscription creation and renewal;
- read/unread, star, move, archive, soft-delete, and permanent-delete actions;
- private message notes and todo markers that survive Provider resynchronization;
- Gmail custom-label creation plus per-message label assignment and removal;
- ownership-checked inbound attachment streaming and workspace downloads;
- ownership-checked outbound attachment uploads with Gmail MIME and Microsoft Graph delivery;
- Provider-discovered sending aliases and multiple selectable signatures per identity;
- current-user reusable mail templates with composer integration;
- rich-text composition with safe HTML, plain-text fallback, and current-record
  template variable binding;
- debounced Provider draft auto-save, unsaved-change protection, and
  session-scoped recovery after a page reload;
- a top-level Mail navigation entry with a cross-account unread badge;
- filterable operation logs with safe synchronization cancellation and retry;
- bounded bulk delivery as separate per-recipient submissions;
- current-user account default selection, suspend/resume, and disconnect;
- Provider contracts, registry, adapter resolver, database storage, and an
  explicit migration.

The current implementation does not yet provide generic IMAP/SMTP/JMAP
Providers. Gmail and Microsoft implementations live in
separate Provider plugins; Mail Core owns OAuth transactions and a default
plain-JSON credential store, while Provider plugins own protocol calls and
token refresh behavior. Another plugin can register `mailCredentialVaultToken`
before Mail Core to replace the default credential store.

## Documentation

- [Complete feature list and v2 comparison](./docs/zh-CN/feature-list.md)

## Runtime flow

```text
POST /api/mail/messages/send
POST /api/mail/messages/drafts
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

## Push notifications

Push delivery is opt-in. Configure both `MAIL_PUSH_WEBHOOK_URL` (the public URL
ending in `/mail/webhooks`) and a random 32–128 character
`MAIL_PUSH_WEBHOOK_SECRET`. The runtime appends the Provider type, configured
Provider name, and secret to that URL. Notifications schedule the same
idempotent incremental sync used by polling; the five-minute sweep remains a
fallback for delayed or dropped notifications.

For Gmail, set `pushTopicName` on the Provider configuration and configure that
Google Cloud Pub/Sub topic's push subscription endpoint to the generated Gmail
webhook URL. Mail Core calls `users.watch` daily and stores its expiry. Optional
`pushLabelIds` restrict the watch. The topic must already exist and allow the
Gmail push service account to publish.

For Microsoft 365, Mail Core creates the Graph subscription itself, handles the
plain-text `validationToken` challenge, verifies `clientState`, and renews the
subscription before expiry. Disconnecting an account attempts to remove its
Provider subscription; local removal still completes if remote cleanup fails.

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
PATCH /api/mail/accounts/:accountId
DELETE /api/mail/accounts/:accountId
GET  /api/mail/settings/accounts
GET  /api/mail/settings/operation-logs
GET  /api/mail/unread-count
GET  /api/mail/providers
GET  /api/mail/templates
POST /api/mail/templates
PATCH /api/mail/templates/:templateId
DELETE /api/mail/templates/:templateId
POST /api/mail/authorizations
GET  /api/mail/accounts/:accountId/identities
PATCH /api/mail/accounts/:accountId/identities/:identityId
GET  /api/mail/accounts/:accountId/identities/:identityId/signatures
POST /api/mail/accounts/:accountId/identities/:identityId/signatures
PATCH /api/mail/accounts/:accountId/identities/:identityId/signatures/:signatureId
DELETE /api/mail/accounts/:accountId/identities/:identityId/signatures/:signatureId
GET  /api/mail/accounts/:accountId/folders
POST /api/mail/accounts/:accountId/labels
POST /api/mail/attachments
POST /api/mail/messages/send
POST /api/mail/messages/bulk
POST /api/mail/messages/drafts
GET  /api/mail/submissions
POST /api/mail/accounts/:accountId/sync
GET  /api/mail/sync-runs
GET  /api/mail/sync-runs/:syncRunId
POST /api/mail/sync-runs/:syncRunId/retry
POST /api/mail/sync-runs/:syncRunId/cancel
GET  /api/mail/messages
GET  /api/mail/accounts/:accountId/messages/:messageId
GET  /api/mail/accounts/:accountId/messages/:messageId/attachments/:attachmentId
PATCH /api/mail/accounts/:accountId/messages/:messageId
PATCH /api/mail/accounts/:accountId/messages/:messageId/labels
POST /api/mail/accounts/:accountId/messages/:messageId/move
DELETE /api/mail/accounts/:accountId/messages/:messageId
GET  /api/mail/accounts/:accountId/conversations/:conversationId/messages
```

`GET /mail/oauth/callback` is intentionally public because Google and
Microsoft redirect the browser to it. It accepts only a short-lived,
single-use state created by the authenticated start endpoint and redirects the
browser to `/settings/mail/my-accounts` after completion; state and PKCE verifiers are
never returned by account APIs.

`POST /mail/webhooks/:providerType/:providerName/:secret` is intentionally
public because Gmail Pub/Sub and Microsoft Graph cannot use an application
session. The route validates the configured high-entropy URL secret before
parsing the body, limits request size, validates Microsoft `clientState`, maps
only known active accounts, and returns no mailbox data.

Personal Mail APIs require `page:mail.workspace/access`; cross-user account and operation-log
APIs under `/api/mail/settings/*` require `page:mail.admin/access`. Account ownership is enforced again in
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
