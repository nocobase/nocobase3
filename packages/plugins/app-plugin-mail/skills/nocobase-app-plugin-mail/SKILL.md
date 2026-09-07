---
name: nocobase-app-plugin-mail
description: Integrate and operate NocoBase Mail accounts, OAuth authorization, idempotent sending, and resumable mailbox synchronization. Use when an App needs Gmail or Microsoft 365 mail behavior. Do not use for generic notifications or direct access to the plugin's internal tables.
---

# NocoBase Mail

Use the Mail plugin's public Client, Server, and HTTP contracts. The plugin owns OAuth transactions, encrypted credential references, submissions, sync runs, Provider cursors, and the Outbox relay. The App owns Provider configuration, plugin registration, permission grants, and where mail UI is presented.

## Public entry points

- Register `@nocobase/app-plugin-mail/client` and `@nocobase/app-plugin-mail/server` in the App composition roots.
- Import Server contracts from `@nocobase/app-plugin-mail/server`, `@nocobase/app-plugin-mail/server/types`, or `@nocobase/app-plugin-mail/server/tokens`.
- Import public UI from `@nocobase/app-plugin-mail/client/components`.
- Require an authenticated identity with `page:mail.settings/access` for every Mail API.
- Configure concrete Providers through the Gmail and Microsoft Provider plugins; do not instantiate their adapters from App code.

## Configure and connect an account

1. Add an enabled `mail.providers` entry with a stable `type` and `name` plus the Provider OAuth client configuration.
2. Register the matching Gmail or Microsoft Server Provider plugin.
3. Grant the intended role access to `mail.settings`.
4. Open `/dev/mail/accounts`, select the mail account type, and complete its OAuth redirect.
5. Verify that the account appears without credential references or token material in the API response.

`/settings/mail/accounts` and `GET /api/mail/settings/accounts` show every connected account to users granted `page:mail.settings/access`. This Settings page is read-only. The ordinary `GET /api/mail/accounts` endpoint remains scoped to the authenticated user. Configure initial sync limits and trigger synchronization from `/dev/mail/accounts`; do not bypass Mail Core ownership checks for another user's account.

`/settings/mail/send-logs` and `GET /api/mail/settings/operation-logs` provide an all-user administration view of synchronization and delivery operations. The response includes API-safe account metadata for resolving each operation to its owner; it never includes credentials, idempotency fingerprints, leases, Provider cursors, or internal Provider error messages. The development log pages remain scoped to the authenticated user.

## Read synchronized mail

Open `/dev/mail/center` in development to filter, refresh, and inspect the Mail workspace. It lists the authenticated user's accounts and Provider folders, then loads synchronized messages through the public API. Use `/dev/mail/management` to browse the complete synchronized message set across accounts in a paginated table, and `/dev/mail/send` to exercise sending with a connected account and identity. Opening a message in Mail center loads its complete Provider conversation when a stable conversation identifier exists. The plugin intentionally does not register a production `/mail` route or application-sidebar resource.

Do not group unrelated messages by normalized subject. Gmail `threadId` and Microsoft Graph `conversationId` are normalized to `conversationId`; messages without one remain standalone. Folder filtering uses the indexed message-folder relation rather than scanning the JSON projection stored on each message.

OAuth callback state is short-lived and single-use. Never bypass it, persist raw tokens in App collections, or expose the Mail Core tables directly.

## Send mail

Call `MailService.sendMessage()` through `mailServiceToken`, or `POST /api/mail/messages/send`. Supply an App-stable idempotency key for the same logical message and reuse it on transport retries. Reusing a key for different content is rejected. An `unknown` result means the Provider may have received the request; do not automatically submit it again under a new key.

Review the authenticated user's recent submission results through `MailService.listSubmissions()`, `GET /api/mail/submissions`, or the development-only `/dev/mail/send-logs` page. The public view excludes idempotency fingerprints, leases, and Provider error messages.

The first release supports plain text plus optional HTML and intentionally rejects outbound attachments, scheduled send, and bulk send.

## Synchronize a mailbox

Start synchronization through `MailService.startSync()` or `POST /api/mail/accounts/:accountId/sync`. Initial synchronization is resumable and bounded by `receivedAfter`, `maxMessages`, and `batchSize`; subsequent runs use the Provider cursor. The Outbox relay is the only component that publishes Queue work, and each Job delegates one bounded step to the sync Operation.

When a Provider cursor expires, Mail Core clears it so the next request starts a fresh initial synchronization. A terminal OAuth failure changes the account to `reauthorizationRequired`; reconnect through `/dev/mail/accounts` before retrying. Review recent runs on the development-only `/dev/mail/sync-logs` page.

## Verify and diagnose

- Observe account status, sync phase, processed message/page counts, and terminal errors through the public API or the development Mail accounts page.
- Verify idempotent send by repeating the same request and confirming one persisted Provider submission result.
- Verify large-mailbox behavior with multiple pages and a message arriving during initial synchronization.
- If the capability is absent, first inspect App Client/Server registration and Provider configuration. Inspectors diagnose composition only; they do not prove OAuth, sending, Queue, or synchronization behavior.
