# @nocobase/app-plugin-mail-provider-microsoft

Adds delegated Microsoft identity OAuth, Graph `sendMail`, folder traversal,
paginated initial synchronization, per-folder delta synchronization, and Graph
change-notification subscriptions to `@nocobase/app-plugin-mail`.

## Configuration

Configure an entry under `mail.providers` with `type: microsoft`, a Microsoft
Entra application client ID, client secret, and optional tenant. Register the
callback URL `<public-origin><app-base-path>/mail/oauth/callback` as a Web
redirect URI.

Push delivery additionally requires Mail Core's `MAIL_PUSH_WEBHOOK_URL` and a
random 32–128 character `MAIL_PUSH_WEBHOOK_SECRET`. Mail Core creates and
renews the Graph subscription, answers endpoint validation challenges, and
validates notification `clientState`.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft lint
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft typecheck
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft test
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft build
```
