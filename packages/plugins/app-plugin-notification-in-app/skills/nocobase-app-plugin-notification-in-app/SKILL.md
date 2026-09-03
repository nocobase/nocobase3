---
name: nocobase-app-plugin-notification-in-app
description: 'Use when agents need to integrate, customize, verify, or diagnose the NocoBase durable in-app inbox, its application-owned Registry UI, or realtime refresh behavior.'
argument-hint: '[action: integrate|customize|verify|diagnose] [application]'
allowed-tools: Bash, Read, Write, Grep, Glob
owner: notification
version: 1.0.0
last-reviewed: 2026-09-02
risk-level: medium
---

# Goal

Integrate and maintain the authenticated, user-isolated in-app inbox while keeping durable HTTP state authoritative and realtime events limited to invalidation.

# Ownership and Placement

This Skill is published with `@nocobase/app-plugin-notification-in-app`. The plugin owns the Server plugin, persistence, routes, realtime event contract, and canonical Registry source. The target application owns the materialized UI source, page placement, Provider mounting, wording, and later three-way merges.

# Scope

- Register the Server plugin and its core notification dependency.
- Materialize and integrate the `in-app-ui` Registry item into an application.
- Consume the public realtime topic and event types from the `/realtime` package entry.
- Verify or diagnose inbox HTTP access, mutations, user isolation, and reconnect refresh.

# Non-Goals

- Do not replace durable notifications with transient browser toasts.
- Do not edit inbox tables directly or publish forged realtime events as notification state.
- Do not overwrite an application's existing materialized Registry directory.
- Do not add a Client plugin entry; this package currently exposes application-owned Registry source.

# Input Contract

| Input         | Required       | Default                                                  | Validation                                                     | Clarification Question                                          |
| ------------- | -------------- | -------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `action`      | yes            | `verify` for existing code; `integrate` for a new target | `integrate/customize/verify/diagnose`                          | "Should I integrate, customize, verify, or diagnose the inbox?" |
| `application` | yes            | infer from one unambiguous workspace application         | application root with Server and Client configuration          | "Which application should own the inbox UI?"                    |
| `uiPlacement` | integrate: yes | none                                                     | route and subtree where the Provider can remain mounted        | "Which route and application subtree should show the inbox?"    |
| `apiConfig`   | no             | the target application's injected `AppClient`            | authenticated client with the intended `baseURL`/`realtimeURL` | "Should this application use its default or a custom API host?" |

Rules:

- Resolve package versions and enabled plugins from the target application before changing source.
- Treat the installed Registry copy as application code; never import the plugin's `registry/` source path from an application.
- If the target, route placement, or existing target-directory ownership is ambiguous, stop mutation and ask.
- If the user says "you decide", use the only application in scope and place the page in its existing authenticated navigation pattern.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Read-only inspection and diagnosis may proceed when the application is unambiguous.
- Before materialization, confirm the target application and ensure `client/extensions/nocobase-notification-in-app-ui` does not exist.
- Before UI integration, confirm the authenticated route and subtree that will own `NotificationInAppProvider`.
- Missing required input blocks mutation; report the missing contract instead of guessing.

# Workflow

1. Read [Inbox Integration Contract](references/inbox-integration.md) for package requirements, public surfaces, and runtime semantics.
2. Inspect the target application's Server plugin list, Client composition, authentication setup, `api.baseURL`, `api.realtimeURL`, and installed package versions.
3. Register `@nocobase/app-plugin-notification` before `@nocobase/app-plugin-notification-in-app` when the application needs the `in-app` Channel contribution.
4. Install Registry item `in-app-ui` with its declared npm and Registry dependencies. If using the low-level `registry:materialize` command, install `alert`, `badge`, `button`, and `card` separately because materialization only copies source. Stop if its target directory already exists; reconcile changes with a three-way merge instead of overwriting it.
5. Import only from the application's materialized `client/extensions/nocobase-notification-in-app-ui` path. Mount `NotificationInAppProvider` above the inbox page and add the page to an authenticated application route.
6. Keep inbox reads and mutations on the injected `AppClient`. Do not reconstruct `/api` from the browser location or Portal base.
7. Keep HTTP state authoritative. On a validated `inbox.changed` event, successful subscription acknowledgement, or window focus, trigger a bounded HTTP refetch.
8. Use the public `@nocobase/app-plugin-notification-in-app/realtime` entry for shared topic or event types; do not import Server internals.
9. Test allowed and denied users, CSRF-protected mutations, pagination, custom API hosts, realtime invalidation, and reconnect recovery.
10. Run lint, typecheck, tests, Registry build/materialization validation, and build for the plugin and affected application.

# Reference Loading Map

| Reference                                                     | Use When                                                                            | Notes                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [Inbox Integration Contract](references/inbox-integration.md) | integrating, customizing, verifying, or diagnosing the inbox                        | Required packages, routes, events, ownership, tests  |
| [Plugin README](../../README.md)                              | confirming Server registration, route behavior, pagination, CSRF, or user isolation | Package-level public contract                        |
| [Registry UI README](../../registry/in-app-ui/README.md)      | materializing or mounting the application-owned UI                                  | Provider/page composition and upgrade responsibility |

# Safety Gate

- Inbox mutations affect a real user's durable notification state. Confirm the target user/session before mutation testing outside an isolated test application.
- Never log session cookies, CSRF tokens, notification bodies, or recipient identifiers.
- Use authenticated routes and preserve the Server's per-user filters; do not add a client-supplied user override.
- Do not overwrite an existing Registry target. Diff the canonical recipe against the application-owned copy and apply reviewed changes selectively.
- A realtime event is only an invalidation signal. Never render its payload as authoritative inbox content.
- Require explicit secondary confirmation before bulk mark-read/delete operations against production data.

Secondary confirmation template:

- "Confirm execution: {{mutation}} for {{user/application}}. Expected impact: durable inbox state will change for {{scope}}. Reply `confirm` to continue."

Rollback guidance:

- Revert application source changes through version control and restore the previous route/Provider composition.
- For an unintended read-state mutation, use the authenticated `unread` action when the affected item ids are known; deleted inbox items are not restored by this package.
- If realtime refresh regresses, keep the HTTP page usable and remove only the faulty subscription integration while preserving durable routes.

# Verification Checklist

- The target application and package versions are identified.
- Authentication, database, core notification, and in-app notification Server plugins are registered as required.
- Registry installation creates application-owned files and resolves declared npm and Registry dependencies without overwriting an existing target.
- Application code imports its materialized copy rather than plugin `registry/` source paths.
- The Provider wraps every route or component that consumes its runtime hook.
- HTTP calls use the injected `AppClient` and honor custom `api.baseURL` configuration.
- Realtime connects through the configured application client and uses the public topic constant.
- Subscription acknowledgement, valid invalidation events, and window focus refetch durable state.
- Malformed or unrelated realtime payloads do not alter inbox state.
- Reads and writes remain scoped to the authenticated user.
- Mutations obtain and send the CSRF token; anonymous and invalid-token requests are denied.
- Pagination treats cursors as opaque and preserves stable ordering.
- Plugin and application lint, typecheck, tests, Registry checks, and builds pass.

# Minimal Test Scenarios

1. Happy path: an authenticated user lists messages, reads one item, and observes the unread count decrease.
2. Custom host: an application with a non-default API base sends inbox HTTP and WebSocket traffic to its configured backend.
3. Recovery: a reconnect receives a successful subscription acknowledgement and refetches durable unread state even when no event arrived while offline.
4. Isolation and safety: another user cannot read or mutate the first user's item, and a missing or invalid CSRF token is rejected.
5. Invalid input: a malformed cursor, unsupported mutation action, or unrelated realtime payload is rejected or ignored without corrupting displayed state.

# Output Contract

Final response must include:

- Requested action and resolved application.
- Server registration, materialized UI, route/Provider, and API/realtime changes as separate items.
- Whether any durable user state was mutated and for which confirmed scope.
- Validation commands and results, including Registry materialization and the target application checks.
- Defaults or assumptions applied, remaining integration gaps, and exact recovery steps for failures.

# References

- [Inbox Integration Contract](references/inbox-integration.md): use for the complete application integration and diagnosis contract.
- [Plugin README](../../README.md): use for Server registration, API, pagination, CSRF, and user-isolation behavior.
- [Registry UI README](../../registry/in-app-ui/README.md): use for materialization ownership and UI mounting guidance.
