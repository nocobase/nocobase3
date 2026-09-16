# IMAP / SMTP

Adds a generic, credential-based IMAP mailbox synchronization and SMTP sending Provider to the Mail plugin. It is intended for mail systems that expose standard IMAP and SMTP endpoints but do not have a dedicated OAuth Provider.

## Configuration

The IMAP/SMTP adapter is built into `@nocobase/app-plugin-mail`. Add an `imap-smtp` entry under `mail.providers`:

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
      # sentCopyMode: client # Only when SMTP does not save sent mail itself
      # sentFolder: Sent
      # trashFolder: Trash
      # draftsFolder: Drafts
```

Users enter the mailbox address, username, and password in the Mail account screen. Credentials are stored through Mail's credential vault; they are not stored in application configuration or returned by the API.

## MVP behavior

- manual account connection with IMAP and SMTP credential verification;
- folder listing and initial mailbox import;
- periodic/incremental sync based on IMAP UIDVALIDITY and UIDNEXT;
- compatibility with servers that omit UIDNEXT (including Coremail/163), using a read-only last-message UID lookup instead of treating the mailbox as empty;
- SMTP send with text, HTML, reply headers, and attachments;
- read/unread, starred, hard-delete, and attachment download operations.

Ordinary deletion is rejected without changing the mailbox because this adapter cannot move messages to Trash. Use the mailbox provider’s client for soft deletion. Only an explicit permanent-delete request expunges messages.

Push notifications, provider labels, drafts, aliases, and move-to-folder are intentionally disabled in this MVP. Message identifiers are mailbox/UID locators, so a server-side move or UIDVALIDITY reset should be followed by a fresh sync. Incremental polling currently discovers new UID ranges; it does not reconcile every external flag, deletion, or move.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-mail lint
pnpm --filter @nocobase/app-plugin-mail typecheck
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail build
```

## Sent mail synchronization

Accepted sends durably request a mailbox refresh immediately and again after 5 and 30 seconds to allow for delayed provider visibility. The account uses its normal incremental cursor, or initial synchronization when no cursor exists. A request arriving during an active sync schedules a further pass, including folder metadata. Messages are stored only through synchronization and are upserted by account and provider message ID. Refresh failures never retry SMTP delivery.

`sentCopyMode` defaults to `server`: the SMTP service owns saving the sent copy. For a server that does not save copies, configure `sentCopyMode: client`; Mail appends the message, including its attachments and Bcc header, to the existing IMAP folder selected by `sentFolder` or the server's `\Sent` special-use flag. It checks that folder for the same Message-ID before appending. Use `server` when the provider saves asynchronously, because a check cannot detect a copy that has not appeared yet.

A failed IMAP append preserves the accepted delivery status and records `IMAP_SENT_COPY_FAILED` in the submission log. It does not resend or automatically retry an ambiguous append. Correct the folder or connection configuration before subsequent sends; ordinary synchronization cannot recover a copy that was never saved remotely.
