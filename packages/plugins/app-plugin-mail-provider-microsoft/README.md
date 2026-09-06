# @nocobase/app-plugin-mail-provider-microsoft

Adds delegated Microsoft identity OAuth, Graph `sendMail`, folder traversal,
paginated initial synchronization, and per-folder delta synchronization to
`@nocobase/app-plugin-mail`.

## Configuration

Configure an entry under `mail.providers` with `type: microsoft`, a Microsoft
Entra application client ID, client secret, and optional tenant. Register the
callback URL `<public-origin><app-base-path>/mail/oauth/callback` as a Web
redirect URI.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft lint
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft typecheck
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft test
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft build
```
