# @nocobase/app-plugin-mail-provider-gmail

Adds delegated Gmail OAuth, sending, paginated initial synchronization, and
Gmail History incremental synchronization to `@nocobase/app-plugin-mail`.

## Configuration

Configure an entry under `mail.providers` with `type: gmail`, a Google OAuth
web client ID, and its client secret. Register the callback URL
`<public-origin><app-base-path>/mail/oauth/callback` in Google Cloud Console.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail-provider-gmail lint
pnpm --filter @nocobase/app-plugin-mail-provider-gmail typecheck
pnpm --filter @nocobase/app-plugin-mail-provider-gmail test
pnpm --filter @nocobase/app-plugin-mail-provider-gmail build
```
