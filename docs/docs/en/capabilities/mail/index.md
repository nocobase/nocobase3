---
title: 'Mail'
description: 'Connect Gmail, Microsoft 365, and IMAP/SMTP accounts to synchronize, read, and send mail in NocoBase 3.'
keywords: 'NocoBase,mail,mailbox,Gmail,Microsoft 365,IMAP,SMTP'
---

# Mail

Mail lets users connect their own mailboxes to an application, read messages, reply to customers, manage drafts, and send attachments from one workspace. Each user can connect multiple accounts, view their synchronized messages together, or filter by account and folder.

For approval results, verification codes, or system alerts, use the email channel in [Notifications](../notification.md). The Mail plugin manages user-connected mailboxes, including authorization, sending, and synchronization. The two capabilities have separate configuration and submission records.

## Mail and built-in Providers

`@nocobase/app-plugin-mail` provides accounts, authorization, synchronization, sending, drafts, the mail workspace, and operation logs. It includes these Providers:

| Built-in Provider | Responsibility                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| Gmail             | Gmail OAuth authorization, Gmail API, and push synchronization               |
| Microsoft 365     | Microsoft 365 OAuth authorization, Microsoft Graph, and push synchronization |
| IMAP/SMTP         | Standard mailboxes connected with a username and password                    |

Register only Mail, then configure Provider instances under `mail.providers` in `config.yml`. Third-party Providers can still register through extension plugins.

## Add Mail to an application

The default application template already registers Mail. Complete [Mail configuration](./configuration.md) before connecting an account. In a custom application, run these commands from the application directory:

```bash
pnpm plugin:register mail
pnpm migrate
```

Run migrations after first enabling Mail to create its tables. Automatic synchronization and scheduled sending require a working application queue.

Grant the intended users access to the mail workspace, configure a Provider, and restart the application. Then follow [Using Mail](./usage.md) to connect an account, synchronize messages, and send a test message.

You can also describe the business requirements to your Coding Agent:

```text
Add NocoBase Mail using our company's IMAP/SMTP mailboxes.
Let users connect their own accounts and read and reply in the mail workspace.
Reuse the workspace on customer detail pages and pass the current customer record to template variables.
Ordinary users may operate only their own accounts; mail administrators may view accounts and operation logs.
Add account, signature, and template management to the production pages.
```

## Pages and permissions

These are application-local route paths. If the application is mounted at `/main`, include that prefix in the browser URL, such as `/main/mail`.

| Entry point                                  | Purpose                                                                    | Required permission           |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| `/mail`                                      | Current user's mail workspace                                              | `page:mail.workspace/access`  |
| `/settings/mail/accounts`                    | Read-only view of all users' connected accounts                            | `page:mail.admin/access`      |
| `/settings/mail/operation-logs`              | All users' synchronization and sending logs                                | `page:mail.admin/access`      |
| `/dev/mail/accounts`                         | Personal account, signature, label, and template management in development | `page:mail.workspace/access`  |
| `/dev/mail/management`                       | All-user message table and batch actions in development                    | `page:mail.management/access` |
| `/dev/mail/sync-logs`, `/dev/mail/send-logs` | Personal synchronization and sending diagnostics in development            | `page:mail.workspace/access`  |

The `/dev/mail/*` pages are development tools and are excluded from production builds. Use the plugin's public components and APIs to provide account management in a production application. Personal APIs check account ownership as well as page permissions. All-user message management can read and operate on every user's messages; it currently has no department or organization scope, so grant it according to actual responsibilities.

## Provider differences

| Capability                                                 | Gmail                          | Microsoft 365                  | IMAP/SMTP                                   |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------- |
| Account connection                                         | OAuth                          | OAuth                          | Username and password                       |
| Receiving, sending, and attachments                        | Supported                      | Supported                      | Supported                                   |
| Automatic synchronization                                  | Supported                      | Supported                      | Supported, primarily discovers new messages |
| Push-triggered synchronization                             | Requires Pub/Sub configuration | Requires a public callback URL | Unsupported                                 |
| Local drafts, signatures, templates, and scheduled sending | Supported                      | Supported                      | Supported                                   |
| Remote draft mirrors                                       | Supported                      | Supported                      | Unsupported                                 |
| Provider sending alias discovery                           | Supported                      | Supported                      | Unsupported                                 |
| Move to folder                                             | Supported                      | Supported                      | Unsupported                                 |
| Provider-native label capability                           | Supported                      | Unsupported                    | Unsupported                                 |
| NocoBase labels, private notes, and todo markers           | Supported                      | Supported                      | Supported                                   |

IMAP/SMTP currently discovers messages through new UID ranges. It does not guarantee full reconciliation of read state, deletions, or moves made in other mail clients. If the SMTP service does not save submitted mail in Sent automatically, the plugin does not append a copy itself; a local Sent copy appears only after the message becomes available through IMAP.

## Next steps

- [Configure Mail](./configuration.md)—Providers, OAuth callbacks, synchronization intervals, and push.
- [Use Mail](./usage.md)—Account connection, reading and sending, drafts, logs, and troubleshooting.
- [Notifications](../notification.md)—Send application notification emails.
- [Application configuration](../../app/configuration.md)—Manage the application's `config.yml`.
