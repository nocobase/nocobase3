---
name: nocobase-app-plugin-notification-in-app
description: 'Use when building or debugging durable in-app notification inboxes, unread counts, bell badges, NotificationInAppInbox pages, or realtime refresh. Use nocobase-app-plugin-notification for email, SMTP, Resend, Feishu, DingTalk, Webhook, and delivery-log work.'
argument-hint: '[action: integrate|customize|diagnose] [application-or-surface]'
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
owner: notification
version: 1.0.1
last-reviewed: 2026-09-30
risk-level: medium
metadata:
  domain-owner: '@nocobase/app-plugin-notification-in-app'
  current-scope: 'NocoBase 3 durable in-app notification inbox and UI integration'
---

# In-app notification integration

The plugin provides a durable, per-user inbox API and public Client components/helpers. The target application owns production routes, navigation, and plugin registration. Read [Inbox integration](references/inbox-integration.md) for the public exports, Server/Client setup, HTTP contract, authorization, and realtime behavior.

1. Inspect the target application's installed packages, auth/session model, Server plugin list, Client composition, and route conventions.
2. Register `@nocobase/app-plugin-notification-in-app/server` for persistence and routes. Register `@nocobase/app-plugin-notification/server` before it when sends use the `in-app` Channel.
3. Register `@nocobase/app-plugin-notification-in-app/client` for package routes/locales, and use its public `/client` exports to build a production inbox page or user-keyed unread bell.
4. Keep the authenticated HTTP API as the source of inbox state. Realtime is optional invalidation; after reconnect, focus, or a valid event, refetch HTTP state.
5. Derive user identity from trusted authentication state. Preserve user scoping and the CSRF cookie/header check on every mutation.
6. Verify list, count, pagination, mutation, user isolation, and reconnect behavior in the target app; run package and application checks when implementation changes require them.

Inbox mutations change durable user state. Keep tests on an isolated application or an explicitly scoped test user, and never log session cookies, CSRF tokens, message bodies, or recipient identifiers.

## References

- [Inbox integration](references/inbox-integration.md): registration, public Client API, production page and bell examples, HTTP contract, auth, CSRF, and realtime.
