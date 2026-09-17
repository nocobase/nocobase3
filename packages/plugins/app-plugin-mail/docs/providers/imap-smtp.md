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

## Gmail with an app password

Add a separate Provider instance alongside any existing entries in `mail.providers`:

```yaml
mail:
  providers:
    gmail-imap:
      type: imap-smtp
      imap:
        host: imap.gmail.com
        port: 993
        secure: true
      smtp:
        host: smtp.gmail.com
        port: 465
        secure: true
      sentCopyMode: server
```

Restart the application after changing configuration. On `/dev/mail/accounts`, select `IMAP / SMTP · gmail-imap`, enter the full Gmail address as both the mailbox address and username, and enter a Google app password in the password field. Enable Google Account 2-Step Verification first, then [create an app password](https://myaccount.google.com/apppasswords); enter its 16 characters without the display spaces. Do not use the ordinary Google Account password or put account credentials in `config.yml`.

App passwords may be unavailable for managed accounts, security-key-only 2-Step Verification, or Advanced Protection. If unavailable, use the existing [Gmail OAuth Provider](gmail.md); managed accounts also require the administrator to allow IMAP access. See [Google's app password requirements](https://support.google.com/accounts/answer/185833).

Gmail automatically saves messages sent through SMTP, so keep `sentCopyMode: server` to avoid extra sent copies. See [Google's IMAP client settings](https://support.google.com/mail/answer/78892) and [IMAP/SMTP endpoints](https://developers.google.com/workspace/gmail/imap/imap-smtp). This instance uses the generic adapter's capabilities and periodic synchronization; Gmail API and Pub/Sub features still require `type: gmail`.

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

## Partial SMTP delivery

If SMTP accepts some recipients and rejects others, the submission remains `accepted` to prevent duplicate delivery to the accepted recipients. Its error has code `SMTP_RECIPIENTS_REJECTED`, `retryable: false`, and `recipients.accepted` / `recipients.rejected` address lists. The composer and delivery logs show partial delivery; only rejected addresses should be used for a new send. Raw SMTP diagnostics are not included in public responses.

## Interrupted synchronization and large messages

Initial synchronization has no total message cap and persists progress after every batch. History reads alternate with incremental UID reads. Service restarts recover abandoned tasks after their lease or delivery grace period expires. A UIDVALIDITY change restarts the configured history range; a stale locator cannot download a different message with a reused UID.

Messages larger than 16 MiB save envelope, size, and MIME attachment metadata without parsing the truncated body. They remain visible with a deferred-content notice. Owners explicitly load the full content from the message detail, outside the background sync size cap; this can consume memory proportional to the message size. Malformed messages retain a failed-content record for independent retry. Network or authentication failures still stop the affected batch instead of advancing its cursor.
