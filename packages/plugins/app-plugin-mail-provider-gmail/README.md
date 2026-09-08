# @nocobase/app-plugin-mail-provider-gmail

Adds delegated Gmail OAuth, sending, paginated initial synchronization, Gmail
History incremental synchronization, and Pub/Sub mailbox watches to
`@nocobase/app-plugin-mail`.
When Gmail History records are temporarily unavailable, incremental sync falls
back to a resumable message scan from the last captured synchronization time.
This fallback can import and update messages but cannot detect deletions until
Gmail History becomes available again.

## Configuration

Configure an entry under `mail.providers` with `type: gmail`, a Google OAuth
web client ID, and its client secret. Register the callback URL
`<public-origin><app-base-path>/mail/oauth/callback` in Google Cloud Console.

Push delivery additionally requires a fully qualified `pushTopicName` in the
Provider entry and Mail Core's `MAIL_PUSH_WEBHOOK_URL` and
`MAIL_PUSH_WEBHOOK_SECRET`. Configure the topic's push subscription endpoint to
the generated Gmail webhook URL. The topic must already allow the Gmail push
service account to publish. Optional `pushLabelIds` limit watched labels.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail-provider-gmail lint
pnpm --filter @nocobase/app-plugin-mail-provider-gmail typecheck
pnpm --filter @nocobase/app-plugin-mail-provider-gmail test
pnpm --filter @nocobase/app-plugin-mail-provider-gmail build
```
