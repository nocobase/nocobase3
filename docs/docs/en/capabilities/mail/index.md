---
title: 'Overview'
description: 'Use AI to add mail to your application, connect your accounts, and read, organize, and send messages from business pages.'
keywords: 'NocoBase,mail,email,Gmail,Microsoft 365,IMAP,SMTP'
---

# Mail

The Mail plugin manages users' connected email accounts, including authorization, sending and receiving messages, and mail records. Ask AI to build a standalone mail center with the mail components, or add them to customer and project pages so you can read and reply while working with business records.

Use the email channel in [Notifications](../notification.md) for approval results, verification codes, or system alerts. The Mail plugin handles user-connected mailboxes; Notifications handles messages sent by the application. Their configuration and records are separate.

## What you can do

- **Manage multiple accounts**: Each user connects their own accounts, views incoming mail in one place, and filters by account and folder.
- **Read and organize messages**: Search mail, view conversations and attachments, and use read status, stars, labels, private notes, and to-do markers.
- **Compose and send messages**: Write, reply, and forward with attachments, CC, BCC, signatures, and templates.
- **Plan your sending**: Save drafts, schedule messages, or send a separate message to each recipient.
- **Connect mail to your business**: Ask AI to link messages to customers, contacts, projects, and other records according to your requirements. View and reply to related messages on record detail pages and use business data in mail templates.

## Link mail to business data

Mail can become part of your business records. For example, display correspondence with contacts on a customer detail page, bring project discussions together on a project page, or compose a message from an order page with the customer name and order number filled into a template. This reduces page switching and repeated data entry.

When building the feature, tell AI how messages should relate to records: match correspondence by a contact's email address, for example, or let users manually link messages to a project. AI implements the relationships, filtering, and interactions according to these rules while preserving mailbox access permissions. See [Application Development](./development.md) for integration details.

For example:

> Add mail to the customer detail page. Use the customer's contact email addresses to show correspondence that the current user is allowed to access, with support for reading and replying directly. When composing, let users select a customer contact as the recipient and fill the customer and contact names into mail templates.

## Supported mailboxes

Connect Gmail and Microsoft 365 accounts through OAuth, or use IMAP/SMTP for other mailboxes. Prefer OAuth when the provider offers a supported built-in connection; use IMAP/SMTP when it does not.

| Capability                                        | Gmail         | Microsoft 365   | IMAP/SMTP                                                   |
| ------------------------------------------------- | ------------- | --------------- | ----------------------------------------------------------- |
| Account connection                                | OAuth         | OAuth           | Email address, username, and password or authorization code |
| Receiving, sending, and attachments               | Supported     | Supported       | Supported                                                   |
| Automatic and manual synchronization              | Supported     | Supported       | Supported, primarily discovers new messages                 |
| Push synchronization                              | Gmail Pub/Sub | Microsoft Graph | Not supported                                               |
| Provider draft synchronization                    | Supported     | Supported       | Not supported                                               |
| Sending aliases                                   | Supported     | Supported       | Not supported                                               |
| Moving to provider folders                        | Supported     | Supported       | Not supported                                               |
| NocoBase labels, private notes, and to-do markers | Supported     | Supported       | Supported                                                   |

For complete configuration, see [Mailbox Setup](./configuration.md). For usage limitations, see [Use Mail](./usage.md).

## Quick index

Tell AI where mail should appear, which mailbox service you use, and who needs access. Once AI has built the feature, users connect their own accounts in the application and start sending and receiving mail. Page names and navigation depend on your application.

| I want to…                                                       | Read                                        |
| ---------------------------------------------------------------- | ------------------------------------------- |
| Build a mail center and complete a first send and receive        | [Quick Start](./quick-start.md)             |
| Connect mailboxes, organize messages, compose, and manage drafts | [Use Mail](./usage.md)                      |
| Configure Gmail, Microsoft 365, or IMAP/SMTP                     | [Mailbox Setup](./configuration.md)         |
| Add mail to customer, project, or other business pages           | [Application Development](./development.md) |
