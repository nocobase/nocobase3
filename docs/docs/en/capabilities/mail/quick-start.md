---
title: 'Quick Start'
description: 'Ask AI to build a mail center, connect your first account, and read and send messages.'
keywords: 'NocoBase,mail,quick start,IMAP,SMTP'
---

# Quick Start

This guide uses an IMAP/SMTP mailbox to take you from building a mail center to sending and receiving your first messages. If your application already provides mail features, start at step 2.

## Step 1: Ask AI to build a mail center

In an existing NocoBase 3 application, give AI the following request, adding your mailbox provider and where you want mail to appear:

> Add a mail center to my application for our company mailboxes. Let everyone connect their own accounts, read, reply to, and send messages, and manage signatures and templates. Tell me which mailbox settings I need to provide and where to open the feature once it is ready.

Tell AI which provider you use and let it guide you through the required information and configuration. IMAP/SMTP requires server addresses and connection settings. Gmail and Microsoft 365 require an OAuth application on the provider's platform; follow [AI-guided setup](./configuration.md#recommended-ai-guided-setup) step by step.

Enter your mailbox password or authorization code yourself when connecting the account. Once setup is complete, open mail from the location AI identifies. This guide uses "account management" and "mail center" to refer to these features; their actual names depend on your application.

## Step 2: Connect a mailbox

Open account management and click "Connect account":

1. Select a configured mailbox provider.
2. Choose the starting date for the initial synchronization. For your first connection, choosing the last few days reduces the wait.
3. Enter your email address, username, and password. If your provider requires an authorization code or app password, use that value.
4. Complete the connection and confirm that the account is active.

For Gmail or Microsoft 365 authorization, follow the prompts to authorize on the provider's site.

After the first successful connection, the system automatically synchronizes messages within the selected date range in the background. Initial synchronization takes time, especially for larger mailboxes. Check progress in the synchronization records provided by your application.

## Step 3: Read messages

Open the mail center to view synchronized messages. Select a message to read its body and view attachments. If you have connected multiple mailboxes, switch accounts to view each one.

You can read imported messages before synchronization finishes. If no messages appear yet, refresh the list later. See [Synchronize mailboxes](./usage.md#synchronize-mailboxes) for everyday synchronization use.

## Step 4: Send a message

Click compose, choose the sending account, and enter a recipient, subject, and body. Send the message to another mailbox you can check.

Confirm that the receiving mailbox has the message and that its body and attachments look correct. You can also reply to an incoming message to try handling mail in the application. If sending fails, check the send records provided by your application for the reason.

## Next steps

- [Use Mail](./usage.md): Manage multiple accounts and use signatures, templates, drafts, and scheduled sending.
- [Application Development](./development.md): Integrate mail further into customer, project, and other business pages.
