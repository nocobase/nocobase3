# Configuration and accounts

## Registration and configuration ownership

Inspect the application's composition roots before adding Mail; the default template already registers it. In an application that needs registration, use `pnpm plugin:register mail` and complete the required migrations through the application's migration workflow. Configuration and credential work alone do not require creating another plugin or another migration. Background synchronization and scheduled sending require the application queue.

`mail.providers` is a map keyed by stable instance names. The map key is the provider name; each value contains `type` and provider-specific options. Multiple instances of the same type can coexist. Renaming an instance breaks its existing account association. `enabled` defaults to `true`; disabling an instance also makes it unavailable to existing accounts.

```yaml
mail:
  providers:
    company-mail:
      type: imap-smtp
      imap:
        host: imap.example.com
        port: 993
        secure: true
      smtp:
        host: smtp.example.com
        port: 465
        secure: true
```

Use one of the following instance shapes; inspect the installed provider types for optional settings rather than copying internal adapter code.

| Type        | Required configuration and connection                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail`     | `clientId`, `clientSecret`; connect through Google OAuth                                                                              |
| `microsoft` | `clientId`, `clientSecret`; optional `tenant` defaults to `common`; connect through Microsoft OAuth                                   |
| `imap-smtp` | `imap` and `smtp`, each with `host`, `port`, and `secure`; the user supplies mailbox address, username and password during connection |

For IMAP/SMTP, `secure: true` means TLS from connection start; STARTTLS endpoints use the service's prescribed settings. TLS certificate verification defaults to enabled. Mail validates both endpoints before saving account credentials. Use the provider-required app password or authorization code where applicable.

Provider secrets, endpoints and allowed OAuth `scopes` live in `mail.providers`. The top-level `MAIL_*` overrides below do not create per-provider credential environment mappings. Do not assume generic `${NAME}` interpolation in YAML; use the target application's supported server configuration mechanism. Keep actual secrets out of committed examples and client bundles, and restart after changing configuration.

## Connect and manage accounts

Development account setup is at `/dev/mail/accounts`, relative to the application's public base path. It contains connection with an optional history start date, account suspend/resume and removal, and signature, template and NocoBase label management. A registered provider without a configured instance is unavailable for connection.

Use public account and authorization APIs or the existing client flow. OAuth starts with an authenticated request to `POST /api/mail/authorizations`; credential-based connection uses `POST /api/mail/accounts/connect`. Preserve the plugin's short-lived, single-use OAuth state. Account and log responses must remain free of credentials and tokens.

Personal account operations use `/api/mail/accounts`. `/settings/mail/accounts` is a read-only overview backed by `/api/mail/settings/accounts`, with owner names and a user-ID fallback. Suspending prevents sending and synchronization. Removing an account clears its local data and authorization without deleting provider mailbox messages; remote subscription cleanup can fail without preventing local removal.

## OAuth callback and return page

The default callback is the app-local `/mail/oauth/callback`. Mail combines `app.publicOrigin` (or the request origin) with `app.publicBasePath` and that path. An application mounted at `/main` with origin `https://mail.example.com` uses:

```text
https://mail.example.com/main/mail/oauth/callback
```

Override through `mail.oauthCallbackUrl` or `MAIL_OAUTH_CALLBACK_URL`. A relative path receives the application prefix; an absolute HTTP(S) URL must already include it and reach the mounted callback. Register the exact resulting URL with the OAuth provider. Fragments are invalid.

The callback endpoint and the page shown after authorization are different concerns. The current callback redirects to `/dev/mail/accounts` on success or failure. Changing `oauthCallbackUrl` changes the callback endpoint, not this return destination. Before claiming production account connection works, inspect the installed callback contract and verify an application-supported return path; report a missing extension point instead of inventing a `returnTo` option or bypassing OAuth state.

## Push synchronization

Push is optional and supplements periodic synchronization. Configure both `mail.pushWebhookUrl` and `mail.pushWebhookSecret`, or their overrides `MAIL_PUSH_WEBHOOK_URL` and `MAIL_PUSH_WEBHOOK_SECRET`. The base URL must reach the public Mail webhook route; the secret is 32–128 characters using letters, digits, `_`, or `-`.

For example, base `https://mail.example.com/main/mail/webhooks`, type `gmail`, and instance `google` produce `https://mail.example.com/main/mail/webhooks/gmail/google/<secret>`.

- Gmail also needs `pushTopicName` and a Pub/Sub push subscription targeting the complete URL. The topic must allow Gmail's push service to publish. Optional `pushLabelIds` narrows the watch; Mail creates and renews account watches.
- Microsoft Graph subscriptions, endpoint validation, `clientState` checks and renewal are handled by Mail. The endpoint must be publicly reachable over HTTPS.
- IMAP/SMTP has no push support.

Preserve webhook secret validation and the provider-specific boundary; external webhook callers have no application session. A notification schedules the existing incremental path rather than writing messages directly. Keep periodic sync enabled as the fallback.

## IMAP/SMTP boundaries and sent copies

The generic adapter supports periodic new-UID discovery, sending, attachments, read/star updates and explicit permanent deletion. It does not support remote draft mirrors, discovered aliases, provider-native labels, move-to-folder, or complete external flag/deletion/move reconciliation. Local drafts and NocoBase metadata remain supported. Ordinary deletion is rejected because this adapter cannot move mail to Trash; do not substitute permanent deletion for that action.

`sentCopyMode` defaults to `server`, leaving sent-mail archiving to SMTP. When the service does not save sent copies, set `sentCopyMode: client` and use an existing `sentFolder` or server-designated Sent folder. The plugin appends the sent content and checks Message-ID before append. Keep `server` when the service saves asynchronously: an immediate duplicate check cannot see a future server copy.

A failed append records `IMAP_SENT_COPY_FAILED` while retaining the accepted submission. Fix the archive configuration without resending the accepted mail. The client does not automatically retry an ambiguous append. Folder hints `sentFolder`, `trashFolder`, and `draftsFolder` do not enable unsupported move or remote-draft capabilities.

## Credential storage and provider extensions

The default `mailCredentialVaultToken` implementation persists plain JSON. For encryption, register a compatible replacement before Mail Core and verify save, load, token rotation, and removal through account operations. Preserve ownership checks and API redaction; encryption does not replace either.

Third-party provider definitions register through `mailProviderRegistryToken`. For a requested extension, inspect the installed `MailProviderDefinition` and `MailProviderAdapter` types and the package's shipped provider documentation. Implement the capabilities actually advertised, including resumable page and cursor contracts where synchronization is supported. Built-in provider configuration alone needs no extension.

## Verify this path

Confirm registration, migrations, provider availability, and connection with the intended account. Check that the account API returns no token material, an unrelated user cannot operate it, and disabling it blocks send/sync. For OAuth changes, verify exact callback matching, rejection of reused state, and the destination after both success and failure. For push changes, verify the generated endpoint and an actual sync trigger separately from periodic polling.
