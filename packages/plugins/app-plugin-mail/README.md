# @nocobase/app-plugin-mail

This package owns the v3 user-mailbox runtime. It is intentionally separate from notification delivery: `@nocobase/app-plugin-notification-providers` sends application notifications, while this package sends mail from user-connected accounts and synchronizes their mailboxes.

## Current scope

The first runnable vertical slice provides:

- authenticated Mail API routes for sending, starting sync, reading sync
  status, and reading synchronized messages;
- authenticated OAuth start plus a public one-time-state callback;
- a permission-protected Mail Settings group with `/settings/mail/accounts` for read-only all-user account visibility; owners display their username, falling back to their name or user ID when unavailable;
- a separately permissioned `/dev/mail/management` table for all-user message search and per-message batch actions; moving messages to a folder is available only in the personal Mail center;
- a development Mail center at `/dev/mail/center`, account connection under `/dev/mail/accounts`, and development diagnostics under `/dev/mail`; `/dev/mail/accounts` defaults to a connected-account table and also exposes account association (including the initial sync date), signature and NocoBase-owned label management, and reusable-template management;
- an all-account workspace view with account and folder filtering, refresh, message search, conversation detail, account connection, synchronization controls, sending, synchronization logs, and delivery submission logs; the composer remembers its last selected account in browser storage and the default synchronization action covers every active account;
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
- indexed Provider message-folder and NocoBase message-label relations;
- reply and forward behavior using Provider-native conversation APIs;
- forwarded HTML preserves embedded CSS, inline styles and table layouts in an isolated preview, with a separate editable comment; saved drafts and session recovery preserve this separation; external stylesheets are not loaded;
- local-first draft creation, editing, automatic saving, recovery, and sending for every Provider that supports sending;
- optional Gmail and Microsoft remote draft mirrors with local conflict protection;
- scheduled delivery persisted through the Outbox and Queue;
- automatic mailbox synchronization every five minutes by default, configurable
  with `MAIL_AUTOMATIC_SYNC_INTERVAL_MS`;
- automatic synchronization configured centrally through `mail.automaticSyncIntervalMs`;
- authenticated Provider push webhooks that coalesce notifications into the
  existing incremental synchronization pipeline;
- automatic Gmail watch and Microsoft Graph subscription creation and renewal;
- read/unread, star, move, archive, soft-delete, and permanent-delete actions;
- private message notes and todo markers that survive Provider resynchronization;
- NocoBase-owned colored label creation, editing, and deletion plus per-message
  label assignment and removal;
- ownership-checked inbound attachment streaming and workspace downloads;
- ownership-checked outbound attachment uploads with Gmail MIME and Microsoft Graph delivery;
- Provider-discovered sending aliases and multiple selectable signatures shared by
  every address in an account;
- current-user reusable mail templates with composer integration;
- rich signature editing with safe HTML formatting and inline image references in synchronized message bodies;
- rich-text composition with safe HTML, plain-text fallback, and current-record
  template variable binding;
- debounced local draft auto-save, optional remote mirroring, unsaved-change protection, and
  session-scoped recovery after a page reload;
- a Mail center at `/dev/mail/center` with a cross-account unread badge that
  refreshes on user-scoped realtime mail invalidations and WebSocket recovery;
- personal synchronization and delivery logs;
- bounded bulk delivery as separate per-recipient submissions, with expandable batch parents, recipient details, pagination of complete batches, automatic status refresh, batch-scoped retries for failed deliveries, and cancellation before a worker claims sending;
- current-user account selection, account deactivation/reactivation, and removal with local data cleanup;
- Provider contracts, registry, adapter resolver, database storage, and an
  explicit migration.

Gmail, Microsoft 365, and generic IMAP/SMTP adapters are built into this package and registered automatically. Register only `mail` in an application, then configure instances under `mail.providers`. Mail Core owns account lifecycle, synchronization, and the credential store; the adapters own protocol calls and token refresh. Third-party plugins can still register additional definitions through `mailProviderRegistryToken`.

The generic IMAP/SMTP adapter uses periodic sync and discovers new UID ranges. Push notifications, provider-native labels, drafts, aliases, move-to-folder, and complete external flag/deletion reconciliation remain unsupported. Accepted sends trigger durable mailbox refreshes immediately and after 5 and 30 seconds. SMTP services that do not automatically save sent copies can use `sentCopyMode: client` with an existing `sentFolder` or a server-designated Sent folder; the default `server` mode leaves archiving to the provider. Another plugin can register `mailCredentialVaultToken` before Mail Core to replace the default plain-JSON credential store.

## Documentation

- [Gmail adapter](./docs/providers/gmail.md)
- [Microsoft 365 adapter](./docs/providers/microsoft.md)
- [IMAP/SMTP adapter](./docs/providers/imap-smtp.md)

- [Configuration](./docs/zh-CN/configuration.md)
- [Complete feature list and v2 comparison](./docs/zh-CN/feature-list.md)
- [Third-party Provider development guide](./docs/zh-CN/provider-development.md)

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

An initial sync first establishes a Provider change watermark, imports bounded history pages, then catches up changes from that watermark. A Provider may use empty, resumable preparation pages to establish per-folder watermarks before returning history. One Queue execution advances one state-machine step, so a large mailbox never requires one unbounded HTTP request or one unbounded Job.

Initial history uses `receivedAfter` as its date boundary and continues until the Provider has no more matching messages. The server-side page size is configured through `mail.syncBatchSize` or `MAIL_SYNC_BATCH_SIZE` and is constrained to 1–200; the default is 100. There is no total message cap. Provider cursors remain internal to Mail Core. See Synchronization and recovery below for restart, expiry, and incomplete-content behavior.

## OAuth callback URL

The default `mail.oauthCallbackUrl` is the app-local path `/mail/oauth/callback`. Mail Core prefixes it with the app's public base path and resolves it against `app.publicOrigin` (or the request origin when no public origin is configured). For example, an app mounted at `/main` produces `https://mail.example.com/main/mail/oauth/callback`.

Override the callback with `mail.oauthCallbackUrl` or `MAIL_OAUTH_CALLBACK_URL`. Relative values are app-local paths and are prefixed with `app.publicBasePath`; absolute `http` or `https` URLs must include the application public base path so the mounted Root Route can receive the request. Register the resulting exact URL with the Provider's OAuth application.

## Synchronization and recovery

Initial synchronization imports every message on or after the configured start date, or all history if no date is configured. The default batch size is 100 (`mail.syncBatchSize` can configure up to 200); there is no cumulative message limit. The legacy `maxMessages` request property is ignored. History pages and incremental pages alternate after the Provider baseline is ready, with separate persisted cursors and serialized account writes. History cannot overwrite a newer synchronized message or resurrect a message deleted during the same scan.

Each batch saves messages, progress, and its next Outbox task atomically. Startup and minute-based maintenance recover expired worker leases and published queue deliveries with no progress for two minutes. Recovery increments the task revision, preventing an old worker from committing after takeover. Pending delayed retries retain their schedule. Recovery requires the same application database and an enabled Mail runtime after restart.

An expired Provider cursor restarts a date-scoped initial scan with a fresh baseline captured before scanning; it never advances directly to the current cursor. Existing local messages and user metadata are retained. Gmail uses the mailbox profile history ID, IMAP checks UIDVALIDITY during both history and incremental reads, and Microsoft reconstructs folder delta checkpoints. Recovery currently rescans the account's configured scope, including unaffected folders, to avoid trusting incomplete checkpoints. A rescan does not reconcile remote deletions that are no longer represented in Provider history.

IMAP messages over 16 MiB retain their envelope, receipt time, size, and attachment metadata with `contentStatus: deferred`. Per-message parsing errors retain a durable identity with `contentStatus: failed`. These records count as processed and do not block later mail. The owner can load or retry content from the message body or `POST /api/mail/accounts/:accountId/messages/:messageId/content/retry`; a retry preserves current read state and local metadata. Sync logs distinguish recovery and history import, and report `partial` with `pendingMessages` when content remains unresolved. Counts in completed logs describe the completion snapshot; a later synchronization refreshes them.

## Push notifications

Push delivery is opt-in. Configure both `MAIL_PUSH_WEBHOOK_URL` (the public URL ending in `/mail/webhooks`) and a random 32–128 character `MAIL_PUSH_WEBHOOK_SECRET`. The runtime appends the Provider type, configured Provider name, and secret to that URL. The same base URL and secret can be shared by multiple Provider instances because each instance gets a distinct callback path. Notifications schedule the same idempotent incremental sync used by polling; the five-minute sweep remains a fallback for delayed or dropped notifications.

For Gmail, manually configure the Google Cloud Pub/Sub topic's push subscription endpoint to the generated Gmail webhook URL, and set `pushTopicName` on the Provider configuration. Mail Core calls `users.watch` daily and stores its expiry. Optional `pushLabelIds` restrict the watch. The topic must already exist and allow the Gmail push service account to publish.

For Microsoft 365, no manual webhook URL registration in Microsoft Graph or Microsoft Entra is required. After an account is connected, Mail Core creates the Graph subscription, handles the plain-text `validationToken` challenge, verifies `clientState`, and renews the subscription before expiry. Removing an account attempts to remove its Provider subscription and credential, then deletes its local synchronized data; the local removal still completes if remote cleanup fails and never deletes mail from the Provider mailbox.

The Push callback URL is separate from the OAuth callback URL. Register the OAuth callback URL with the Provider's OAuth application as described above.

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

Providers with folder hierarchies implement paginated `listFolders()` and `reconcileSyncCursor()`. A folder page is persisted before another Queue task is planned, so discovering a large hierarchy remains bounded and resumable.

For sending, it implements `sendMessage()`. A Provider that accepted a message but cannot return an identifier may omit `providerMessageId`. Network or protocol ambiguity must return `submission_unknown`; callers must not blindly resend it.

## HTTP API

Translated Mail errors preserve `error.code`, `error.message`, `error.ns`, `error.key`, and `error.params`. The message uses the request locale; consumers can use the namespace, key, and parameters to translate the same error in another locale. Internal provider and database error details remain private.

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
POST /api/mail/accounts/connect
GET  /api/mail/accounts/:accountId/identities
PATCH /api/mail/accounts/:accountId/identities/:identityId
GET  /api/mail/accounts/:accountId/signatures
POST /api/mail/accounts/:accountId/signatures
PATCH /api/mail/accounts/:accountId/signatures/:signatureId
DELETE /api/mail/accounts/:accountId/signatures/:signatureId
GET  /api/mail/accounts/:accountId/folders
GET  /api/mail/labels
POST /api/mail/labels
PATCH /api/mail/labels/:labelId
DELETE /api/mail/labels/:labelId
POST /api/mail/attachments
POST /api/mail/messages/send
POST /api/mail/messages/bulk
GET /api/mail/submissions?bulkOnly=true&groupByBatch=true&offset=0
POST /api/mail/submissions/:submissionId/retry
POST /api/mail/submissions/:submissionId/cancel
POST /api/mail/messages/drafts
GET  /api/mail/submissions
POST /api/mail/accounts/:accountId/sync
GET  /api/mail/sync-runs
GET  /api/mail/sync-runs/:syncRunId
POST /api/mail/sync-runs/:syncRunId/retry
POST /api/mail/sync-runs/:syncRunId/cancel
GET  /api/mail/messages
GET  /api/mail/management/accounts
GET  /api/mail/management/accounts/:accountId/folders
GET  /api/mail/management/messages
POST /api/mail/management/messages/actions
GET  /api/mail/accounts/:accountId/messages/:messageId
GET  /api/mail/accounts/:accountId/messages/:messageId/attachments/:attachmentId
PATCH /api/mail/accounts/:accountId/messages/:messageId
PATCH /api/mail/accounts/:accountId/messages/:messageId/labels
POST /api/mail/accounts/:accountId/messages/:messageId/move
DELETE /api/mail/accounts/:accountId/messages/:messageId
GET  /api/mail/accounts/:accountId/conversations/:conversationId/messages
```

The configured OAuth callback route is intentionally public because Google and Microsoft redirect the browser to it. It accepts only a short-lived, single-use state created by the authenticated start endpoint and redirects the browser to `/dev/mail/accounts` after completion; state and PKCE verifiers are never returned by account APIs.

`POST /mail/webhooks/:providerType/:providerName/:secret` is intentionally public because Gmail Pub/Sub and Microsoft Graph cannot use an application session. The route validates the configured high-entropy URL secret before parsing the body, limits request size, validates Microsoft `clientState`, maps only known active accounts, and returns no mailbox data.

Personal Mail APIs require `page:mail.workspace/access`; cross-user account and operation-log APIs under `/api/mail/settings/*` require `page:mail.admin/access`; the all-user message management APIs under `/api/mail/management/*` require `page:mail.management/access`. Account ownership is enforced again in `MailService`; Route authentication is not treated as ownership authorization. Inactive accounts cannot send or synchronize. Public responses omit credential references, Provider cursors, leases, and internal error messages.

The `/dev/mail/center` workspace opens a complete conversation only when a Provider supplies its stable identifier (`threadId` for Gmail or `conversationId` for Microsoft Graph). Messages without that identifier open independently; the core does not infer a conversation from a matching subject.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail lint
pnpm --filter @nocobase/app-plugin-mail typecheck
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail build
```

The query and search-migration regressions also run on PostgreSQL with `PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=postgres PGUSER=postgres pnpm --filter @nocobase/app-plugin-mail test:postgres` (set `PGPASSWORD` when required). Use a test database role allowed to create schemas. Each test creates and drops only its own randomly named `mail_test_*` schema; the normal test command continues to use SQLite.

## Application-owned client and draft attachments

Register the Mail Client plugin before rendering its public components. Each `ClientApplication` owns one lazy `MailClient`; React consumers use `useMailClient()` and imperative consumers resolve `mailClientToken` from that application's services. Both are exported by `@nocobase/app-plugin-mail/client`. Do not create or retain a module-global client. Public label and template managers explicitly use the Mail translation namespace when embedded in an application-owned page.

The Server entry point exposes the plugin factory, `mailConfig`, `createMailProviderRegistry`, Tokens, and contract types. Default persistence, operation, and runtime implementations remain internal; resolve the supported service through its Token instead of constructing those implementations.

Local draft attachments retain their upload identity separately from Provider attachment identifiers until successful remote mirroring replaces them with the Provider’s current attachment references. Reopening or rescheduling a local-only draft sends the retained local file contents. Upload cleanup preserves files referenced by live drafts and reclaims them after the final draft reference is removed and the upload expires. Editing a synchronized draft keeps its local record ID stable while updating the remote message and attachment IDs returned by the Provider.

## Mail workspace UI

Received HTML is rendered in a script-disabled sandboxed frame that preserves tables, inline formatting, embedded stylesheets, and authenticated CID images. Sender styles are isolated from the application theme. Scripts, forms, embedded frames, and external stylesheets are blocked.

`/dev/mail/center` links to My mailboxes at `/dev/mail/accounts`, where signed-in users with `mail.workspace/access` connect and manage their own accounts, signatures, templates, and labels. The administrator overview remains at `/settings/mail/accounts` with `mail.admin/access`. Account setup links are visible only in development. OAuth success and failure redirects return to the development account page.

The workspace uses a desktop three-pane layout with mailbox navigation, the message list, and the conversation visible together. The message list loads 50 messages per page, with Previous page and Next page controls fixed at the bottom. Changing a mailbox filter returns to the first page. Successfully opening a message marks its loaded, non-draft conversation messages as read for active accounts and immediately refreshes the header unread badge. A failed read-state update leaves the content visible and reports the error without clearing its unread state. The non-modal desktop composer becomes full-screen on phones; its errors and draft state are independent of mailbox refreshes, and unsaved edits require an explicit close confirmation.

### Development sending and logs

The development Compose mail page (`/dev/mail/send`) uses one Mail center composer with Send and Send separately actions in its footer. Both actions share recipients, content, attachments, signatures, templates, and scheduling; ordinary sending supports Cc/Bcc, while separate sending requires those fields to be empty and deduplicates up to 100 recipients. Draft saving and recovery are shared. The From address selector lists sendable addresses across accounts, including aliases, without a separate account selector; each account retains its own unfinished message while the page remains open. The inline composer has no cancel or close action and opens a fresh message after sending or saving a draft. Mail logs (`/dev/mail/logs`) brings sending, batch delivery, and synchronization into one page with directly accessible child views; the former standalone URLs redirect to their corresponding views.

Mail account tables, the management message table, and log views share page buttons, direct page entry, previous/next navigation, and a page-size selector (20, 50, or 100; default 20). Changing filters or page size resets the view to the first page. Personal sending and synchronization histories request bounded pages from the server; bulk history paginates complete batches with expandable recipient results. Administration logs paginate the filtered recent-history results. The shared controls include the last page number. Message queries with `withTotal=true` return the matching message count; synchronization and submission history queries with `withTotal=true` return `{ items, total }`, with bulk history totals counting batches. The Mail center retains its original cursor pagination and 50-message page size. Message APIs accept a nonnegative `offset` for direct page selection, mutually exclusive with `cursor`; existing cursor consumers remain supported.

### Runtime logging

Mail uses the application's default logger with `module: mail`. The default application configuration prints development logs to the console and rotates production files under `storage/logs/`. Sending, synchronization progress and completion, retry scheduling, cursor recovery, background maintenance failures, and realtime publishing failures use structured logs alongside the database-backed Mail histories. Filter by `event`, `accountId`, `submissionId`, or `syncRunId` to correlate operations; result records include status and duration where applicable. Exceptions retain their message and stack under `err`; SDK request objects, credentials, recipients, and message bodies are not copied into log fields. Logging transport failures do not change delivery or persistence outcomes.
