---
title: 'Use Mail'
description: 'Connect accounts, read and send messages, manage drafts, signatures, and templates, and inspect synchronization and sending results.'
---

# Use Mail

Before starting, complete [Mail configuration](./configuration.md) and grant the current user `page:mail.workspace/access`. Paths below are relative to the application's mount point. For example, with an application prefix of `/main`, the workspace URL is `/main/mail`.

## Connect a mailbox

In development, open Mail accounts at `/dev/mail/accounts` and select **Associate account**:

1. Choose a configured Gmail, Microsoft 365, or IMAP/SMTP Provider.
2. Optionally choose an initial synchronization starting date to limit imported history.
3. For Gmail or Microsoft 365, follow the redirect to authorize the account. For IMAP/SMTP, enter the email address, username, and password.
4. After returning, confirm that the account is active, start synchronization, and open `/mail` to inspect the results.

The account table lets you adjust each account's automatic synchronization interval, deactivate, reactivate, or remove it. Inactive accounts cannot send or synchronize. Removal clears the application's account, authorization, and locally synchronized data without deleting messages in the Provider mailbox.

These account management pages are development tools. Production applications can reuse public components such as `MailAccountConnector` from `@nocobase/app-plugin-mail/client/components` and the account APIs to provide a suitable entry point.

## Read and organize mail

`/mail` initially displays synchronized messages from all of the current user's accounts and identifies the source account. Search messages or filter by unread state, starred state, or NocoBase labels. Select one account to browse its Provider folders.

**Sync all mailboxes** starts synchronization for every active account supporting incremental synchronization. Selecting an account narrows synchronization to that mailbox. Refreshing displayed data and synchronizing with the Provider are separate steps; if a new message has not been imported, inspect the synchronization run.

Opening a message displays the complete conversation when the Provider supplies a stable conversation identifier. Messages without one open individually; matching subjects alone do not combine messages into a conversation.

Mark messages read or unread, add stars, download attachments, and move, archive, or delete messages according to Provider capabilities. Permanent deletion cannot be undone. NocoBase labels, private notes, and todo markers stay in the application, do not become Provider labels or tasks, and survive subsequent synchronization.

## Compose, save drafts, and schedule sending

Select **Compose**, choose the sending account and address, and enter recipients, a subject, and a body. The composer supports CC, BCC, rich text, attachments, replies, and forwarding. Use the account's default signature, choose another, or send without one.

Drafts are saved to the local database first, with automatic saving during editing and recovery of unfinished editing after a reload. Gmail and Microsoft 365 also support remote draft mirrors. IMAP/SMTP supports local drafts but does not mirror them to the Provider. If a remote draft conflicts with local editing, review the difference before choosing the version to keep.

To send later, enable scheduled sending and choose a time. A persisted task runs through the background queue, so the browser does not need to stay open. The account, Provider connection, and queue must still be available when the task is due.

Sending a separate private message to each recipient supports up to 100 recipients and creates an individual submission record for each. The development page `/dev/mail/bulk-send` also provides recipient review and individual results. If only some submissions fail, handle those failed items individually.

## Signatures, templates, and business records

The development account page provides signature, template, and label management. Each account can have multiple named signatures and one default, shared by its sending addresses. Templates belong to the current user and reuse a subject and body; applying a template replaces existing content.

When reusing `MailWorkspacePage` on a business record page, pass the current record through `templateVariables`:

```tsx
import { MailWorkspacePage } from '@nocobase/app-plugin-mail/client';

<MailWorkspacePage
  templateVariables={{ record: { customer: { name: 'Alex' } } }}
/>;
```

The template variable `{{record.customer.name}}` becomes `Alex` when the template is applied. Unresolved variables remain visible and should be checked before sending. Mount the component within the application's client service and permission context. The default workspace does not automatically know the current customer record.

## Inspect results

Administrators can view synchronization and sending records for all users under **Settings / Mail / Operation logs**, filtering by account, status, time, and other criteria. Personal diagnostic pages are available at `/dev/mail/sync-logs` and `/dev/mail/send-logs`.

Synchronization statuses are pending, running, completed, failed, and cancelled. Logs show the current phase and processed message and batch counts. Account owners can cancel active runs or retry failed and cancelled runs.

Sending records use these statuses:

| Status       | Meaning                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `pending`    | Waiting for execution, including scheduled messages that are not yet due                   |
| `submitting` | Being submitted to the Provider                                                            |
| `accepted`   | The Provider accepted the submission; this does not mean the recipient received or read it |
| `failed`     | Submission failed; inspect the error and address its cause                                 |
| `unknown`    | Whether the Provider accepted the submission is uncertain; the message may have been sent  |

For an `unknown` result, confirm the Provider's result before deciding what to do next. Sending again may create a duplicate. Applications using `MailService.sendMessage()` or `POST /api/mail/messages/send` must reuse a stable `idempotencyKey` for the same logical message. Reusing a key with different content is rejected; do not use a new key merely because a request timed out.

## Troubleshooting

### The Provider is unavailable

Confirm that the corresponding Server Provider plugin is registered and that `mail.providers` contains an enabled instance of the matching type with the required credentials or endpoints. Registering the plugin alone does not configure it.

### The OAuth callback fails

Check that the final URL formed from the public origin, application mount path, and callback configuration matches the URL registered with the Provider. Pay particular attention to the hostname, port, and application prefix such as `/main`. See [Configure Mail](./configuration.md).

### An account requires reauthorization

`reauthorizationRequired` means that the existing authorization can no longer be used. Reconnect and authorize the account before retrying synchronization. Suspended or revoked accounts also cannot send or synchronize.

### Synchronization stays pending or historical mail is incomplete

Check that migrations completed, the background queue is running, and the server logs show no errors. Initial synchronization runs in batches and is constrained by the starting date and historical message limit; it does not download an entire mailbox in a single request. When a Provider cursor expires, the next synchronization starts a fresh initial import.

### Changes in another mail client do not appear locally

First confirm that incremental synchronization has completed. IMAP/SMTP currently does not guarantee complete reconciliation of external read state, deletions, and moves, or append its own Sent copy. See [Provider differences](./index.md#provider-differences).
