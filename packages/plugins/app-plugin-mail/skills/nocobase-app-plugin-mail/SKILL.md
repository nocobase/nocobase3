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
- Use mailbox read APIs only through an authenticated identity with `page:mail/access` or `page:mail.settings/access`.
- Require `page:mail.settings/access` for OAuth, account management, synchronization, and sending APIs.
- Configure concrete Providers through the Gmail and Microsoft Provider plugins; do not instantiate their adapters from App code.

## Configure and connect an account

1. Add an enabled `mail.providers` entry with a stable `type` and `name` plus the Provider OAuth client configuration.
2. Register the matching Gmail or Microsoft Server Provider plugin.
3. Grant the intended role access to `mail.settings`.
4. Open `/settings/mail`, select the Provider, and complete its OAuth redirect.
5. Verify that the account appears without credential references or token material in the API response.

## Read synchronized mail

Grant `mail/access` and open `/mail` to use the workspace registered in the application sidebar. The workspace lists the authenticated user's accounts and Provider folders, then loads synchronized messages through the public API. Opening a message loads its complete Provider conversation when a stable conversation identifier exists.

Do not group unrelated messages by normalized subject. Gmail `threadId` and Microsoft Graph `conversationId` are normalized to `conversationId`; messages without one remain standalone. Folder filtering uses the indexed message-folder relation rather than scanning the JSON projection stored on each message.

OAuth callback state is short-lived and single-use. Never bypass it, persist raw tokens in App collections, or expose the Mail Core tables directly.

## Send mail

Call `MailService.sendMessage()` through `mailServiceToken`, or `POST /api/mail/messages/send`. Supply an App-stable idempotency key for the same logical message and reuse it on transport retries. Reusing a key for different content is rejected. An `unknown` result means the Provider may have received the request; do not automatically submit it again under a new key.

The first release supports plain text plus optional HTML and intentionally rejects outbound attachments, scheduled send, and bulk send.

## Synchronize a mailbox

Start synchronization through `MailService.startSync()` or `POST /api/mail/accounts/:accountId/sync`. Initial synchronization is resumable and bounded by `receivedAfter`, `maxMessages`, and `batchSize`; subsequent runs use the Provider cursor. The Outbox relay is the only component that publishes Queue work, and each Job delegates one bounded step to the sync Operation.

When a Provider cursor expires, Mail Core clears it so the next request starts a fresh initial synchronization. A terminal OAuth failure changes the account to `reauthorizationRequired`; reconnect through the Settings page before retrying.

## Verify and diagnose

- Observe account status, sync phase, processed message/page counts, and terminal errors through the public API or Settings UI.
- Verify idempotent send by repeating the same request and confirming one persisted Provider submission result.
- Verify large-mailbox behavior with multiple pages and a message arriving during initial synchronization.
- If the capability is absent, first inspect App Client/Server registration and Provider configuration. Inspectors diagnose composition only; they do not prove OAuth, sending, Queue, or synchronization behavior.
