# Gmail

Adds delegated Gmail OAuth, sending, paginated initial synchronization, Gmail History incremental synchronization, and Pub/Sub mailbox watches to `@nocobase/app-plugin-mail`. When Gmail History expires, Mail Core restarts the configured history range with a fresh mailbox-profile baseline and catches subsequent changes. It does not skip to a new cursor or restrict recovery to a recent-time window.

## Configuration

Configure an entry under `mail.providers` with `type: gmail`, a Google OAuth web client ID, and its client secret. Register the callback URL `<public-origin><app-base-path>/mail/oauth/callback` in Google Cloud Console by default. Override it with Mail Core's `mail.oauthCallbackUrl` or `MAIL_OAUTH_CALLBACK_URL` and register that exact URL instead.

Push delivery additionally requires a fully qualified `pushTopicName` in the Provider entry and Mail Core's `MAIL_PUSH_WEBHOOK_URL` and `MAIL_PUSH_WEBHOOK_SECRET`. Manually configure the topic's push subscription endpoint to the generated Gmail webhook URL. The topic must already allow the Gmail push service account to publish. Optional `pushLabelIds` limit watched labels.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail lint
pnpm --filter @nocobase/app-plugin-mail typecheck
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail build
```
