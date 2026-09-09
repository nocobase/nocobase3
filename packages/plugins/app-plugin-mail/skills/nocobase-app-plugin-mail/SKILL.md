---
name: nocobase-app-plugin-mail
description: Integrate and operate NocoBase Mail accounts, OAuth authorization, idempotent sending, and resumable mailbox synchronization. Use when an App needs Gmail or Microsoft 365 mail behavior. Do not use for generic notifications or direct access to the plugin's internal tables.
---

# NocoBase Mail

Use the Mail plugin's public Client, Server, and HTTP contracts. The plugin owns OAuth transactions, credential references, submissions, sync runs, Provider cursors, and the Outbox relay. The App owns Provider configuration, plugin registration, permission grants, and where mail UI is presented. Mail Core's default credential store persists plain JSON; an App that requires encryption must register a separate `mailCredentialVaultToken` implementation before Mail Core.

## Public entry points

- Register `@nocobase/app-plugin-mail/client` and `@nocobase/app-plugin-mail/server` in the App composition roots.
- Import Server contracts from `@nocobase/app-plugin-mail/server`, `@nocobase/app-plugin-mail/server/types`, or `@nocobase/app-plugin-mail/server/tokens`.
- Import public UI from `@nocobase/app-plugin-mail/client/components`, or
  `MailWorkspacePage` and template helpers from
  `@nocobase/app-plugin-mail/client`.
- Require an authenticated identity with `page:mail.workspace/access` for personal Mail APIs and `page:mail.admin/access` for cross-user administration APIs.
- Configure concrete Providers through the Gmail and Microsoft Provider plugins; do not instantiate their adapters from App code.

## Configure and connect an account

1. Add an enabled `mail.providers` entry with a stable `type` and `name` plus the Provider OAuth client configuration.
2. Register the matching Gmail or Microsoft Server Provider plugin.
3. Grant intended users access to `mail.workspace`; grant only administrators access to `mail.admin`.
4. Open `/settings/mail/my-accounts`, select the mail account type, and complete its OAuth redirect.
5. Verify that the account appears without credential references or token material in the API response.

For push synchronization, set `MAIL_PUSH_WEBHOOK_URL` to the public Mail
webhook base URL and `MAIL_PUSH_WEBHOOK_SECRET` to a random 32–128 character
secret. Gmail additionally needs `pushTopicName` in its Provider configuration
and a Google Cloud Pub/Sub push subscription targeting the generated callback
URL. Microsoft Graph subscription creation and endpoint validation are managed
by Mail Core.

`/settings/mail/my-accounts` manages the authenticated user's accounts, including default selection, suspend/resume, disconnect, and manual synchronization. `/settings/mail/accounts` and `GET /api/mail/settings/accounts` show every connected account to administrators granted `page:mail.admin/access`. The ordinary `GET /api/mail/accounts` endpoint remains scoped to the authenticated user and requires `page:mail.workspace/access`. Do not bypass Mail Core ownership checks for another user's account.

`/settings/mail/send-logs` and `GET /api/mail/settings/operation-logs` provide an all-user administration view of synchronization and delivery operations. The UI filters by owner or operation text, account, status, and start time. Failed or cancelled synchronization runs can be retried, and active synchronization runs can be cancelled by their account owner. Do not automatically retry a delivery with an unknown Provider result because that may create a duplicate message. The response includes API-safe account metadata for resolving each operation to its owner; it never includes credentials, idempotency fingerprints, leases, Provider cursors, or internal Provider error messages. The development log pages remain scoped to the authenticated user.

## Read synchronized mail

Open `/mail` to filter, refresh, and inspect the authenticated user's synchronized mail. The application header and top-level resource expose the same route with a cross-account unread badge. Opening a message loads its complete Provider conversation when a stable conversation identifier exists. The workspace can update read/starred state, maintain NocoBase-only notes and follow-up markers, move or delete messages, manage Gmail custom-label membership, and securely download inbound attachments. Notes and follow-up markers are local metadata and are preserved when Provider messages are synchronized again. Development diagnostics remain available under `/dev/mail`.

Do not group unrelated messages by normalized subject. Gmail `threadId` and Microsoft Graph `conversationId` are normalized to `conversationId`; messages without one remain standalone. Folder filtering uses the indexed message-folder relation rather than scanning the JSON projection stored on each message.

OAuth callback state is short-lived and single-use. Never bypass it, persist raw tokens in App collections, or expose the Mail Core tables directly.

## Send mail

Call `MailService.sendMessage()` through `mailServiceToken`, or `POST /api/mail/messages/send`. Supply an App-stable idempotency key for the same logical message and reuse it on transport retries. Reusing a key for different content is rejected. An `unknown` result means the Provider may have received the request; do not automatically submit it again under a new key.

Review the authenticated user's recent submission results through `MailService.listSubmissions()`, `GET /api/mail/submissions`, or the development-only `/dev/mail/send-logs` page. The public view excludes idempotency fingerprints, leases, and Provider error messages.

Sending supports plain text plus safe rich-text HTML, replies, forwards, Provider-backed draft creation and editing, automatic draft saving, outbound attachments, identities and multiple named signatures, reusable templates, durable scheduled delivery, and bounded per-recipient bulk delivery. Each identity may have a default signature; the composer can choose another signature or send without one. When embedding `MailWorkspacePage` in a record-aware surface, pass `{ record }` through `templateVariables`; variables such as `{{record.customer.name}}` are resolved when a template is applied. Unknown variables remain visible so the sender can correct the template before sending.

## Synchronize a mailbox

Start synchronization through `MailService.startSync()` or `POST /api/mail/accounts/:accountId/sync`. The runtime also schedules active accounts automatically; the default interval is five minutes and `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` configures it. Initial synchronization is resumable and bounded by `receivedAfter`, `maxMessages`, and `batchSize`; subsequent runs use the Provider cursor. The Outbox relay is the only component that publishes Queue work, and each Job delegates one bounded step to the sync Operation.

When push configuration is present, the same sweep creates and renews Gmail
watches and Microsoft Graph subscriptions. A valid notification only schedules
the existing incremental synchronization path; duplicate concurrent notices
coalesce behind the active-run constraint. Keep periodic synchronization
enabled because both Providers document that notifications can be delayed or
dropped.

When a Provider cursor expires, Mail Core clears it so the next request starts a fresh initial synchronization. A terminal OAuth failure changes the account to `reauthorizationRequired`; reconnect through `/settings/mail/my-accounts` before retrying. Review recent runs on the development-only `/dev/mail/sync-logs` page.

## Verify and diagnose

- Observe account status, sync phase, processed message/page counts, and terminal errors through the public API or the development Mail accounts page.
- Verify idempotent send by repeating the same request and confirming one persisted Provider submission result.
- Verify large-mailbox behavior with multiple pages and a message arriving during initial synchronization.
- If the capability is absent, first inspect App Client/Server registration and Provider configuration. Inspectors diagnose composition only; they do not prove OAuth, sending, Queue, or synchronization behavior.
