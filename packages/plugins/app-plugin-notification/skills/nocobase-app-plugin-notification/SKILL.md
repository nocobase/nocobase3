---
name: nocobase-app-plugin-notification
description: "Use when configuring or sending application notifications through email, SMTP, Resend, Feishu, DingTalk, or Webhook channels, or inspecting delivery logs and retries. Use nocobase-app-plugin-notification-in-app for inbox pages, unread counts, and browser notification UI."
argument-hint: '[action: explain|integrate|configure|send|inspect|diagnose] [channel-or-notification-id]'
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
owner: notification
version: 1.0.2
last-reviewed: 2026-09-30
risk-level: medium
metadata:
  domain-owner: '@nocobase/app-plugin-notification'
  current-scope: 'applications that install the notification runtime and the required Channel packages'
---

# Notification development

Inspect the target application's registered plugins and effective notification configuration before changing integration code. A send is an external effect; use only the recipient and Channel scope already authorized in the conversation, and resolve missing details before sending.

1. Read [Notification concepts](references/notification-concepts.md) for package ownership and delivery status semantics.
2. For registration, configuration, migrations, or test sends, read [Integration and configuration](references/integration-and-configuration.md).
3. For service calls and message shapes, read [Sending notifications](references/sending-notifications.md).
4. For failures and retries, read [Delivery diagnostics](references/delivery-diagnostics.md). Preserve Notification, Delivery, Attempt, and retry-audit history; distinguish Provider acceptance from final delivery.
5. For custom transports, read [Channel and Provider extensions](references/channel-and-provider-extensions.md). Register globally unique definitions before the first send and retain the lease and retry lifecycle.
6. Verify changed packages and their consumers with the checks required by the repository.

The test API requires authentication and its test header; submission also requires `notification:test` `send`. Test sends reach real recipients. Keep credentials, Webhook URLs, message bodies, and recipient snapshots out of logs and reports.

An unknown Delivery may already have reached its recipient. Check external Provider evidence before creating a replacement send. A submitted notification cannot be recalled; preserve its history and report whether the outcome is Provider-accepted, failed, or unknown.
