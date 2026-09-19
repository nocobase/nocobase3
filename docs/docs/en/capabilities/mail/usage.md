---
title: 'Use Mail'
description: 'Connect and manage mailboxes, read and organize messages, and use signatures, templates, drafts, and scheduled sending.'
---

# Use Mail

AI integrates mail components into your application, so navigation and available features depend on your application. The following operations apply to the current user's connected mailboxes. If mail has not been added yet, follow the [Quick Start](./quick-start.md).

## Manage mailbox accounts

Connect mailboxes in account management. Each user can connect multiple accounts, authorize them separately, and choose a starting date for the initial synchronization. See [Quick Start](./quick-start.md#step-2-connect-a-mailbox) for connection steps.

Disable an account when you do not need it temporarily. It will stop sending and synchronizing until you enable it again. If authorization expires, reconnect the account and authorize it again.

Removing an account clears its information and locally synchronized data from the application. It does not delete messages at the mailbox provider.

## Read and find messages

The mail center shows messages from multiple accounts and identifies the source account. Switch accounts and folders, search messages, or filter by unread status, stars, and labels.

Select a message to read its body and view or download attachments. Messages in the same conversation are grouped using information from the provider. Opening a message marks it as read; you can mark it unread again manually.

Some message bodies may not have finished loading. Follow the prompts to load them or retry.

## Synchronize mailboxes

When you first connect a mailbox, the system automatically synchronizes messages within the selected date range, then periodically synchronizes new messages. Initial synchronization can take time; you can read imported messages while it continues.

Use the synchronization action when you want to fetch new messages. With one account selected, it synchronizes that mailbox. "Sync all mailboxes" synchronizes available accounts. Refreshing the list only displays data already synchronized to the application; it does not fetch new messages from the provider.

Check progress and errors in the synchronization records provided by your application. The application configures the automatic synchronization interval for all accounts, with a default of every five minutes.

IMAP/SMTP primarily synchronizes new messages. Read status changes, deletions, and moves made in other clients are not yet fully synchronized.

## Organize messages

Mark messages read or unread, add stars, and move, archive, or delete messages according to your mailbox's capabilities. IMAP/SMTP does not yet support moving messages to folders or trash; use your provider's client for those operations. Permanent deletion removes messages from the provider, so check the content before proceeding.

Labels, private notes, and to-do markers organize messages within the application and remain after synchronization. They are not synchronized as labels, notes, or tasks in the provider's mailbox.

## Compose, reply, and forward

Click compose, choose the sending account, and enter recipients, a subject, and a body. Add attachments, CC, or BCC as needed. If the account has available sending aliases, you can choose one to send from.

Reply or forward directly while reading a message. Forwarding preserves the original content and lets you add your own text before it.

### Use signatures and templates

Set up signatures and templates in account management. Each mailbox can have multiple signatures and a default. Switch signatures while composing or choose not to use one.

Templates reuse message subjects and bodies and belong to the current user. Applying a template replaces the current subject and body, so check whether you need to keep existing content first.

If the application integrates business data, templates can also fill in values such as customer names. Check the result before sending; unmatched variables remain unchanged.

### Save drafts

Drafts are saved automatically as you compose, so you can continue editing after reopening the page. Gmail and Microsoft 365 also support synchronizing drafts to the provider. IMAP/SMTP drafts are stored only in the application.

If draft versions conflict, follow the prompts to compare them and choose which version to keep. When closing the composer, resolve any unsaved-change prompt first.

### Schedule sending

Enable scheduled sending and choose a time. Once saved, the system sends at that time even if you close the browser. The application services and mailbox account must still be available when the message is due.

### Send separately

Use separate sending when you want each recipient to receive an individual message.

Check each recipient's result in the bulk send records. If some fail, retry only the failed items to avoid duplicate messages.

## View send results

Regular, scheduled, and separate sending all create records, available through your application's send records feature.

A provider accepting a message (`accepted`) does not guarantee that the recipient has received or read it. Check the error reason after a failed send. If the result is uncertain (`unknown`), confirm whether the message was sent before retrying.
