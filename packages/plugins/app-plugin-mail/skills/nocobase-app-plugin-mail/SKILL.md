---
name: nocobase-app-plugin-mail
description: Integrate and operate NocoBase Mail accounts, OAuth or credential authorization, idempotent sending, and resumable mailbox synchronization. Use when an App needs Gmail, Microsoft 365, or generic IMAP/SMTP mail behavior. Do not use for generic notifications or direct access to the plugin's internal tables.
---

# NocoBase Mail

Use the Mail plugin's public Client, Server, and HTTP contracts. The plugin owns OAuth transactions, credential references, submissions, sync runs, Provider cursors, and the Outbox relay. The App owns Provider configuration, plugin registration, permission grants, and where mail UI is presented. Mail Core's default credential store persists plain JSON; an App that requires encryption must register a separate `mailCredentialVaultToken` implementation before Mail Core.

## Public entry points

- Register `@nocobase/app-plugin-mail/client` and `@nocobase/app-plugin-mail/server` in the App composition roots.
- Import Server contracts from `@nocobase/app-plugin-mail/server`, `@nocobase/app-plugin-mail/server/types`, or `@nocobase/app-plugin-mail/server/tokens`.
- Import public UI from `@nocobase/app-plugin-mail/client/components`, or
  `MailWorkspacePage` and template helpers from `@nocobase/app-plugin-mail/client`.
- Require an authenticated identity with `page:mail.workspace/access` for personal Mail APIs, `page:mail.admin/access` for cross-user account and operation-log APIs, and `page:mail.management/access` for all-user message management APIs.
- Configure the built-in Gmail, Microsoft 365, and IMAP/SMTP Providers through `mail.providers`. Mail registers their definitions automatically; use its public services from App code.

When embedding Mail UI, register the Client plugin in the current `ClientApplication` and obtain its API service with `useMailClient()` in React or `app.services.resolve(mailClientToken)` outside React. Import both from `@nocobase/app-plugin-mail/client`; each application owns its own client. Resolve Server behavior through public Tokens rather than importing default stores, operations, or runtime classes. Preserve the returned draft attachment IDs when editing a draft; Mail Core distinguishes local uploads from remote attachments and keeps uploads alive while a draft references them.

## Configure and connect an account

1. Add an enabled `mail.providers` entry with a stable `type` and `name` plus the Provider OAuth client or IMAP/SMTP endpoint configuration.
2. Register Mail in the Client and Server plugin lists. Its three built-in Providers need no separate plugin registration; third-party Provider plugins can add definitions through `mailProviderRegistryToken`.
3. Grant intended users access to `mail.workspace`; grant only administrators access to `mail.admin` and, when they need the message table or batch actions, `mail.management`.
4. In development, open `/dev/mail/accounts`, use Associate account to select the mail account type, and complete its OAuth redirect or enter the IMAP/SMTP mailbox credentials. The page defaults to the connected-account table; the association drawer also contains the initial sync date, while account signatures, colored NocoBase-owned labels, and reusable templates are managed there as well.
5. Verify that the account appears without credential references or token material in the API response.

The Mail OAuth callback defaults to the app-local `/mail/oauth/callback` path, which becomes `<public-origin><app-base-path>/mail/oauth/callback`. Set `mail.oauthCallbackUrl` or `MAIL_OAUTH_CALLBACK_URL` to override it. Relative values are prefixed with the app public base path; an absolute URL must include that base path so the mounted callback route matches the URL registered with Google or Microsoft.

For push synchronization, set `MAIL_PUSH_WEBHOOK_URL` to the public Mail webhook base URL and `MAIL_PUSH_WEBHOOK_SECRET` to a random 32–128 character secret. Gmail additionally needs `pushTopicName` in its Provider configuration and a Google Cloud Pub/Sub push subscription targeting the generated callback URL. Microsoft Graph subscription creation and endpoint validation are managed by Mail Core.

`/dev/mail/accounts` manages the authenticated user's accounts, including suspend/resume, disconnect, manual synchronization, the received-after date in the account association drawer, signature and NocoBase-owned label management, and reusable templates. The account association control lists registered Providers; a Provider without a `mail.providers` entry is shown as unavailable until the server endpoint or OAuth configuration is added. `/settings/mail/accounts` and `GET /api/mail/settings/accounts` show every connected account to administrators granted `page:mail.admin/access`. The ordinary `GET /api/mail/accounts` endpoint remains scoped to the authenticated user and requires `page:mail.workspace/access`. Do not bypass Mail Core ownership checks for another user's account.

`/settings/mail/operation-logs` and `GET /api/mail/settings/operation-logs` provide an all-user administration view of synchronization and delivery operations. `/dev/mail/management` and `GET /api/mail/management/*` provide an all-user message table and batch actions only to identities granted `page:mail.management/access`; the current implementation does not apply department or organization scope. The UI filters by owner or operation text, account, status, and start time. Failed or cancelled synchronization runs can be retried, and active synchronization runs can be cancelled by their account owner. Do not automatically retry a delivery with an unknown Provider result because that may create a duplicate message. The response includes API-safe account metadata for resolving each operation to its owner; it never includes credentials, idempotency fingerprints, leases, Provider cursors, or internal Provider error messages. The development log pages remain scoped to the authenticated user.

Each row in `/dev/mail/management` opens a read-only message detail drawer with the synchronized body, headers, and attachments. Detail and attachment requests use `/api/mail/management/accounts/:accountId/messages/:messageId` and its `/attachments/:attachmentId` child route, both protected by `page:mail.management/access`. Opening a detail does not change read state. Drafts display their draft status instead of read/unread status; management read-state actions skip drafts and remain disabled when only drafts are selected. The personal message and attachment routes remain owner-scoped.

## Read synchronized mail

Received HTML uses an isolated, script-disabled frame to retain tables, inline styles, embedded stylesheets, and authenticated CID images. Keep received-message rendering separate from the composer/template sanitizer, which intentionally accepts only editor-supported formatting. External stylesheets and active content are blocked.

Open `/dev/mail/center` to filter, refresh, and inspect the authenticated user's synchronized mail. The workspace starts in an all-account view, identifies each message's source account, and lets the user switch to one account when provider folders are needed. Personal mail lists without a folder filter exclude local and synchronized drafts before pagination. Open the Drafts folder to continue editing; its sidebar entry displays no count. The page header exposes the cross-account unread badge. The badge treats `GET /api/mail/unread-count` as authoritative and refetches it after user-scoped realtime invalidations, WebSocket recovery, and browser focus. Opening a message loads its complete Provider conversation when a stable conversation identifier exists. After content loads, unread non-draft messages from active accounts are marked read; successful updates immediately refetch the header unread count. Earlier conversation pages are marked read when opened, and failed read-state updates keep the message unread and show an error. The workspace can update read/starred state, maintain NocoBase-only notes and follow-up markers, move or delete messages, manage colored NocoBase-owned label membership, and securely download inbound attachments. Notes, follow-up markers, and labels are local metadata and are preserved when Provider messages are synchronized again. Development diagnostics remain available under `/dev/mail`.

Do not group unrelated messages by normalized subject. Gmail `threadId` and Microsoft Graph `conversationId` are normalized to `conversationId`; messages without one remain standalone. Provider-folder and NocoBase-label filtering use indexed relations rather than scanning a JSON projection stored on each message.

OAuth callback state is short-lived and single-use. Never bypass it, persist raw tokens in App collections, or expose the Mail Core tables directly.

The generic `imap-smtp` Provider verifies both endpoints before storing the username and password in Mail's credential vault. It uses periodic sync and does not provide push notifications, Provider-native labels, drafts, aliases, or move-to-folder operations in the MVP. Ordinary deletion is rejected because this Provider cannot move messages to Trash; permanent deletion requires explicit confirmation. Its incremental cursor discovers new IMAP UID ranges; external flag, deletion, and move reconciliation, plus provider-side Sent append, are not guaranteed by this MVP.

## Send mail

Translated Mail HTTP errors include `error.code`, `error.message`, `error.ns`, `error.key`, and `error.params`. Use the stable code for programmatic handling; use the namespace, key, and parameters when translating the error again in the current UI locale.

Call `MailService.sendMessage()` through `mailServiceToken`, or `POST /api/mail/messages/send`. Supply an App-stable idempotency key for the same logical message and reuse it on transport retries. Reusing a key for different content is rejected. An `unknown` result means the Provider may have received the request; do not automatically submit it again under a new key.

Review the authenticated user's recent submission results through `MailService.listSubmissions()`, `GET /api/mail/submissions`, or the development-only `/dev/mail/logs/send` page. The public view excludes idempotency fingerprints, leases, and Provider error messages.

Sending supports plain text plus safe rich-text HTML, replies, forwards, local-first draft creation and editing with optional Gmail/Microsoft mirrors, automatic draft saving, outbound attachments, identities and multiple named account-level signatures, reusable templates, durable scheduled delivery, and bounded per-recipient bulk delivery. Each account may have a default signature shared by all its sending addresses; the composer can choose another signature or send without one. When embedding `MailWorkspacePage` in a record-aware surface, pass `{ record }` through `templateVariables`; variables such as `{{record.customer.name}}` are resolved when a template is applied. Unknown variables remain visible so the sender can correct the template before sending.

## Synchronize a mailbox

Start synchronization through `MailService.startSync()` or `POST /api/mail/accounts/:accountId/sync`. The workspace's default sync action starts one run for every active account that supports incremental synchronization; selecting an account narrows it to that mailbox. The runtime also schedules active accounts automatically; configure the shared interval through `mail.automaticSyncIntervalMs` (or `MAIL_AUTOMATIC_SYNC_INTERVAL_MS`), which defaults to five minutes and applies to both new and existing accounts. The account page and account-update API do not configure automatic synchronization. Initial synchronization is resumable and bounded by `receivedAfter`, `maxMessages`, and the server-configured `mail.syncBatchSize` (or `MAIL_SYNC_BATCH_SIZE`, constrained to 1–200); subsequent runs use the Provider cursor. The Outbox relay is the only component that publishes Queue work, and each Job delegates one bounded step to the sync Operation.

When push configuration is present, the same sweep creates and renews Gmail watches and Microsoft Graph subscriptions. A valid notification only schedules the existing incremental synchronization path; duplicate concurrent notices coalesce behind the active-run constraint. Keep periodic synchronization enabled because both Providers document that notifications can be delayed or dropped.

When a Provider cursor expires, Mail Core clears it so the next request starts a fresh initial synchronization. A terminal OAuth failure changes the account to `reauthorizationRequired`; reconnect through `/dev/mail/accounts` before retrying. Review recent runs on the development-only `/dev/mail/logs/sync` page.

## Verify and diagnose

- Observe account status, sync phase, processed message/page counts, and terminal errors through the public API or the development Mail accounts page.
- Verify idempotent send by repeating the same request and confirming one persisted Provider submission result.
- Verify large-mailbox behavior with multiple pages and a message arriving during initial synchronization.
- If the capability is absent, first inspect App Client/Server registration and Provider configuration. Inspectors diagnose composition only; they do not prove OAuth, sending, Queue, or synchronization behavior.

## Workspace interaction

Use `/dev/mail/center` for reading and composing in development. The workspace links to `/dev/mail/accounts` for account setup. The plugin contributes no standalone production Mail page; production excludes both development pages. OAuth callbacks return to the Dev account page. Mailbox navigation stays visible in a desktop three-pane layout alongside the message list and selected conversation. The message list loads 50 messages per page through Previous page and Next page controls fixed at the bottom. Changing filters returns to the first page. The composer owns its draft session and request errors independently from mailbox queries. Closing unsaved content offers Keep editing or Discard unsaved changes; provider acceptance is reported as queued for delivery, not confirmed delivery.

Bulk send logs show one collapsed parent per batch with recipient counts and status totals; expanding a parent reveals per-recipient submissions. History is paginated in groups of 20 complete batches, and retry/cancel actions on a parent apply only to eligible children in that batch. Pending submissions refresh automatically. Failed submissions can be retried using their stored message snapshot; pending submissions can be cancelled until a worker claims delivery. Accepted and unknown results cannot be retried or cancelled. Provider acceptance is not a recipient delivery receipt. The APIs are `GET /api/mail/submissions?bulkOnly=true&groupByBatch=true&offset=0`, `POST /api/mail/submissions/:submissionId/retry`, and `POST /api/mail/submissions/:submissionId/cancel`; access is restricted to the owning user. Scheduled message snapshots are retained for logs and retries. Older records whose snapshots were already cleared can still show status but cannot recover recipient details or be retried.

## Refresh after sending

Accepted submissions persist immediate, 5-second, and 30-second mailbox refresh requests in the Outbox. An active sync records a pending follow-up and refreshes folder metadata before the next incremental pass. Sent mail is populated exclusively from provider synchronization, using the existing account/provider-message identity; refresh failures must never resend an accepted submission. IMAP/SMTP defaults to server-owned sent copies. Set `sentCopyMode: client` with an existing `sentFolder` (or server `\Sent` folder) only when SMTP does not save copies itself. Client archive failures remain accepted deliveries and expose `IMAP_SENT_COPY_FAILED` in the submission log.

## Development sending and logs

`/dev/mail/send` opens one shared Mail center composer with Cc/Bcc, attachments, signatures, templates, scheduled sending, and draft saving and recovery. Its footer offers Send and Send separately; separate sending deduplicates up to 100 recipients and requires empty Cc/Bcc fields. Batch messages own their attachment references and do not consume the shared draft. The former `/dev/mail/send/compose` and `/dev/mail/send/bulk` child URLs redirect to `/dev/mail/send`. `/dev/mail/logs` groups delivery, batch delivery, and synchronization under its `send`, `bulk`, and `sync` child routes. Batch logs retain expandable recipient results, safe retry, cancellation, pagination, and automatic refresh of pending submissions. The former `/dev/mail/bulk-send`, `/dev/mail/send-logs`, and `/dev/mail/sync-logs` URLs redirect to the composer or corresponding log child routes while preserving query parameters. These pages use the authenticated user’s personal Mail APIs and require `page:mail.workspace/access`; the all-user administration logs remain under Settings.
