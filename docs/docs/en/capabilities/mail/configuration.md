---
title: 'Configure Mail'
description: 'Configure mail Providers, OAuth callbacks, automatic synchronization, and push synchronization.'
---

# Configure Mail

Mail configuration lives under `mail` in the application's `config.yml`. Register Mail Core and the Providers you need as described in the [overview](./index.md), then choose the configuration below. An application can configure multiple instances. Their names are associated with connected accounts and should remain stable once in use.

## Gmail

Add a Gmail instance under `mail.providers`:

```yaml
mail:
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
```

Use credentials from a Google OAuth web application and register the complete OAuth callback URL described below. The plugin requests `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.settings.basic` by default for mail operations and sending identity discovery. Use the instance's `scopes` setting to configure the allowed scopes; account authorization requests cannot exceed that list.

## Microsoft 365

```yaml
mail:
  providers:
    microsoft-365:
      type: microsoft
      tenant: common
      clientId: replace-with-microsoft-entra-client-id
      clientSecret: replace-with-microsoft-entra-client-secret
```

Supply Microsoft Entra application credentials and register the complete OAuth callback URL. `tenant` defaults to `common`; a tenant ID or domain can also be used. The plugin requests `openid`, `profile`, `email`, `offline_access`, and Microsoft Graph's `User.Read`, `Mail.ReadWrite`, and `Mail.Send` by default. Use `scopes` to adjust the allowed list.

## IMAP/SMTP

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

The application configures the receiving and sending servers. Users supply their email address, username, and password when connecting an account. The plugin verifies both endpoints before storing credentials. If the mailbox service requires an authorization code or application password, use that value.

`host`, `port`, and `secure` are required. `secure: true` starts TLS when connecting; the example uses IMAP `993` and SMTP `465`. For an SMTP STARTTLS port, set `secure: false` as required by the server. Certificate verification through `rejectUnauthorized` defaults to `true`. An instance can also specify `sentFolder`, `trashFolder`, and `draftsFolder` as path hints for folder discovery; these hints do not enable remote drafts.

All Provider instances default to `enabled: true`. Setting it to `false` also prevents existing accounts associated with that instance from using it.

## OAuth callback URL

`mail.oauthCallbackUrl` defaults to the application-local path `/mail/oauth/callback`. Mail prefixes it with `app.publicBasePath` and resolves it against `app.publicOrigin`. When no public origin is configured, it uses the request origin.

For a public origin of `https://mail.example.com` and an application mounted at `/main`, register this URL with the OAuth application:

```text
https://mail.example.com/main/mail/oauth/callback
```

Override it with `mail.oauthCallbackUrl` or `MAIL_OAUTH_CALLBACK_URL`. Relative paths still receive the application prefix; absolute URLs must already include that prefix and route to the current application. URLs cannot contain a `#` fragment.

```yaml
mail:
  oauthCallbackUrl: /mail/oauth/callback
```

During local development, make sure the registered hostname and port match the actual address. Set `APP_PUBLIC_ORIGIN` explicitly if you need a fixed origin, using the actual port shown in the startup log. OAuth and push callbacks are separate URLs and cannot replace each other.

## Synchronization settings

| Setting                        | Default  | Environment variable              | Meaning                                                                                        |
| ------------------------------ | -------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `mail.automaticSyncIntervalMs` | `300000` | `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` | Default automatic synchronization interval for new accounts, in milliseconds; at least `60000` |
| `mail.syncBatchSize`           | `100`    | `MAIL_SYNC_BATCH_SIZE`            | Batch size for each Provider synchronization request; an integer from `1–200`                  |

Each account can store its own interval. Adjust it in minutes in the development account table at `/dev/mail/accounts`, with a minimum of one minute. The runtime checks for due accounts every minute. The global setting supplies the default for new accounts and does not rewrite existing account intervals.

When connecting an account, you can choose a starting date for historical mail. For an initial synchronization started through the API, `receivedAfter` and `maxMessages` apply together. The default historical import limit is 10,000 messages; `maxMessages` accepts `1–100000`. A Provider page may slightly exceed the requested size, so the final historical import count may slightly exceed the limit. After importing history, synchronization catches up changes made during the import. This limit is not a cap on the account's future total message count.

## Push synchronization

Push can trigger incremental synchronization sooner for Gmail and Microsoft 365 mailbox changes. Configure both a public callback URL and a secret:

```yaml
mail:
  pushWebhookUrl: https://mail.example.com/main/mail/webhooks
  pushWebhookSecret: replace-with-a-random-secret-at-least-32-characters
```

Replace the example secret with a random value of `32–128` characters using only letters, digits, `_`, and `-`. The environment variables are `MAIL_PUSH_WEBHOOK_URL` and `MAIL_PUSH_WEBHOOK_SECRET`; setting only one does not enable push. The runtime appends the Provider type, instance name, and secret to the base URL:

```text
https://mail.example.com/main/mail/webhooks/gmail/google/<secret>
```

Gmail also requires `pushTopicName: projects/example/topics/mail-push` in the `google` instance. Configure a Google Cloud Pub/Sub push subscription with the complete URL above as its endpoint. The topic must allow the Gmail push service account to publish; use `pushLabelIds` to restrict watched labels if needed. Mail creates and renews the account's Gmail watch.

For Microsoft 365, Mail creates, validates, and renews subscriptions after an account connects. No manual webhook registration in Graph or Entra is needed. The configured URL must be reachable over public HTTPS.

Push only triggers the existing incremental synchronization pipeline. Periodic synchronization continues as a fallback for delayed or dropped notifications. IMAP/SMTP does not support push.

## Configuration and credential storage

The `MAIL_*` environment variables listed above override their corresponding `mail` settings. Provider credentials, endpoints, and scopes are configured through `mail.providers` and have no dedicated `MAIL_*` environment mappings. Restart the application after changing configuration.

Do not commit real OAuth secrets, push secrets, or mailbox passwords to the repository. The core plugin's default credential store saves authorization data as plain JSON in the database. If your application requires encrypted storage, have the Coding Agent register a replacement implementation of `mailCredentialVaultToken` before Mail Core.

After configuration, continue with [connecting accounts and using Mail](./usage.md).
