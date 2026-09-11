# @nocobase/app-plugin-mail-provider-imap-smtp

Adds a generic, credential-based IMAP mailbox synchronization and SMTP sending
Provider to the Mail plugin. It is intended for mail systems that expose
standard IMAP and SMTP endpoints but do not have a dedicated OAuth Provider.

## Configuration

Register the server plugin together with `@nocobase/app-plugin-mail`, then add
an `imap-smtp` entry under `mail.providers`:

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
      # sentFolder: Sent
      # trashFolder: Trash
      # draftsFolder: Drafts
```

Users enter the mailbox address, username, and password in the Mail account
screen. Credentials are stored through Mail's credential vault; they are not
stored in application configuration or returned by the API.

## MVP behavior

- manual account connection with IMAP and SMTP credential verification;
- folder listing and initial mailbox import;
- periodic/incremental sync based on IMAP UIDVALIDITY and UIDNEXT;
- SMTP send with text, HTML, reply headers, and attachments;
- read/unread, starred, hard-delete, and attachment download operations.

Push notifications, provider labels, drafts, aliases, and move-to-folder are
intentionally disabled in this MVP. Message identifiers are mailbox/UID
locators, so a server-side move or UIDVALIDITY reset should be followed by a
fresh sync. Incremental polling currently discovers new UID ranges; it does
not reconcile every external flag, deletion, or move. SMTP delivery also does
not append a copy to the provider's Sent folder when the SMTP service does not
do that automatically.

Implement only the public behavior this plugin owns. Keep declarations, exports, dependencies, tests, README, and Plugin Skills aligned when capabilities change. Every concrete Server Route must own and test its authentication and authorization boundary.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail-provider-imap-smtp lint
pnpm --filter @nocobase/app-plugin-mail-provider-imap-smtp typecheck
pnpm --filter @nocobase/app-plugin-mail-provider-imap-smtp test
pnpm --filter @nocobase/app-plugin-mail-provider-imap-smtp build
```
