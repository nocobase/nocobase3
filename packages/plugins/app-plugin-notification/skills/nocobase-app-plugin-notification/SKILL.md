---
name: nocobase-app-plugin-notification
description: 'Use when agents need to integrate, configure, send, inspect, or diagnose NocoBase notifications based on app-plugin-notification.'
argument-hint: '[action: explain|integrate|configure|send|inspect|diagnose] [channel-or-notification-id]'
allowed-tools: Bash, Read, Write, Grep, Glob
owner: notification
version: 1.0.1
last-reviewed: 2026-08-31
risk-level: medium
metadata:
  domain-owner: '@nocobase/app-plugin-notification'
  current-scope: 'applications that install the notification runtime and the required Channel packages'
---

# Goal

Integrate, configure, send, inspect, and diagnose NocoBase notifications against the installed notification contracts without exposing credentials, bypassing the queue, or mistaking an accepted submission for final delivery.

# Ownership and Placement

This Skill is published with `@nocobase/app-plugin-notification`. Keep it synchronized with changes to the manager, registry, routing, persistence, retry, logs, or public Channel/Provider contracts. Also review it when the in-app or built-in Provider packages change their integration contract.

# Scope

- Integrate the core runtime, migrations, queue, routes, and lifecycle.
- Configure and use the built-in `in-app`, `email`, and `im` Channels.
- Send notifications through `notificationServiceToken` and select Providers deliberately.
- Inspect Notification, Delivery, and Attempt records and diagnose queue or Provider failures.
- Implement custom Channel or Provider definitions through the public registry contracts.

# Non-Goals

- Do not treat the browser toast package as durable notification delivery.
- Do not call SMTP, Resend, or Webhooks directly when the Notification Manager owns the delivery.
- Do not edit notification tables to send, retry, or mark a Provider submission successful.
- Do not claim that `accepted` means delivered to or read by the final recipient.

# Input Contract

| Input             | Required                   | Default                                                                       | Validation                                                                       | Clarification Question                                                                |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `action`          | yes                        | `inspect` for an existing target; `integrate` for a described new application | `explain/integrate/configure/send/inspect/diagnose`                              | "Should I integrate, configure, send, inspect, or diagnose notifications?"            |
| `target`          | send/inspect/diagnose: yes | infer only from one unambiguous Channel, source reference, or Notification id | Channel name, application path, or persisted Notification id                     | "Which Channel, application, or Notification id should I use?"                        |
| `recipient`       | send: yes                  | none                                                                          | `user`, `email`, `phone`, or `target` shape supported by every requested Channel | "Who should receive the notification, and through which Channels?"                    |
| `content`         | send: yes                  | none                                                                          | non-empty body; title and action URL must match the selected Channel contract    | "What title, body, and optional action URL should be sent?"                           |
| `providerRouting` | no                         | first enabled Provider per Channel                                            | configured Provider name, or explicit `all` fan-out                              | "Should this use the default Provider, one named Provider, or all enabled Providers?" |
| `mutationScope`   | mutation/send: yes         | smallest application-local change or one send                                 | configuration, source files, or one explicit runtime operation                   | "May I change this configuration or send this real notification?"                     |

Rules:

- Resolve the installed package declarations and application configuration before authoring. Optional Channel packages may be absent.
- If a requested Channel cannot resolve a recipient shape, stop before sending or split the operation into explicit compatible sends.
- If the user says "you decide", inspect existing configuration, use the first enabled Provider, and prefer a dry configuration check over a real external send.
- Never infer Notification ids, Provider names, user ids, email addresses, or logical IM targets from examples.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Read-only explanation, configuration inspection, and log diagnosis may proceed when the target is unambiguous.
- Before a real send, confirm recipient, Channels, content, source identity when relevant, Provider routing, and expected external effect.
- Before configuration mutation, confirm the owning application, secret source, enabled Channels, and Provider names/types.
- If required information is absent, stop mutation or sending and report the missing contract.
- Missing required input always blocks mutation or sending; stop and ask for the missing contract before executing.

# Workflow

1. Classify the request and read [Notification Concepts](references/notification-concepts.md) when Channel selection, status meaning, or package ownership is relevant.
2. Inspect the installed packages, public declarations, enabled plugin list, `notification` configuration, migrations, queue runtime, and `notificationServiceToken`. Treat sibling monorepo source as a development aid, not an installed-app dependency.
3. For runtime or application setup, follow [Integration and Configuration](references/integration-and-configuration.md). Register all required definitions before the manager creates a Channel runtime.
4. For a send, follow [Sending Notifications](references/sending-notifications.md). Resolve the notification service from the application's shared container and validate each recipient against every requested Channel.
5. Record the returned Notification id and Delivery ids. The initial result proves persistence and scheduling only.
6. Read back `notification.logs.get(id)` until the relevant Delivery reaches a terminal state or a bounded observation window ends.
7. For failed, retried, stuck, partial, or unknown outcomes, follow [Delivery Diagnostics](references/delivery-diagnostics.md) from Notification to Delivery to Attempt and then correlated server logs.
8. For a new integration type, follow [Channel and Provider Extensions](references/channel-and-provider-extensions.md). Keep rendering/address resolution in the Channel and external submission in the Provider.
9. Run package-local lint, typecheck, test, and build for every package changed; add integration tests for allowed and denied recipients, Provider errors, retry behavior, and credential redaction where applicable.
10. Report the exact Channels, Provider names/types, Notification id, terminal or last-observed statuses, and any uncertainty about downstream delivery.

# Reference Loading Map

| Reference                                                                        | Use When                                                                                             | Notes                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [Notification Concepts](references/notification-concepts.md)                     | choosing packages or interpreting Notification, Delivery, Attempt, Channel, and Provider             | Architecture, status semantics, and boundaries |
| [Integration and Configuration](references/integration-and-configuration.md)     | installing plugins, configuring built-ins, registering definitions, migrations, routes, or lifecycle | Includes secret and Provider identity rules    |
| [Sending Notifications](references/sending-notifications.md)                     | constructing `send()` input, recipients, multi-Channel sends, overrides, or routing                  | Real side-effect path and readback contract    |
| [Delivery Diagnostics](references/delivery-diagnostics.md)                       | inspecting logs or diagnosing pending, failed, partial, retried, or unknown delivery                 | Evidence order and safe recovery               |
| [Channel and Provider Extensions](references/channel-and-provider-extensions.md) | implementing or reviewing a custom Channel or Provider                                               | Public interfaces, ownership split, and tests  |

# Safety Gate

- Treat every `send()` and Provider test as a real side effect that may contact users or external systems.
- Keep SMTP passwords, API keys, Webhook URLs, signing secrets, message bodies, and recipient snapshots out of source control and logs.
- Use authenticated, authorized routes for logs and Provider testing. Keep the test surface disabled in production unless explicitly needed for a controlled verification.
- Preserve Provider `name` and `type` while Deliveries are pending. A missing or changed Provider makes the persisted Delivery fail; it does not safely reroute.
- Treat `unknown` as potentially delivered. Check the external Provider using the Attempt metadata before deciding whether a new send is safe.
- Require explicit secondary confirmation before bulk sends, production Provider tests, changing a live Provider identity, or resending an `unknown` Delivery.

Secondary confirmation template:

- "Confirm execution: {{action}} through {{channels/providers}} to {{recipient scope}}. Expected impact: {{external messages/configuration change}}. Reply `confirm` to continue."

# Rollback for high-impact actions

Trigger rollback when a high-impact configuration or send validation fails, a mutation is rejected, or the user declines the confirmation. Record the previous configuration before mutation and do not silently retry an unknown external submission.

Rollback guidance:

- Restore application configuration from the recorded previous values and restart through the normal lifecycle; then read back enabled Channels and Provider identities.
- Source changes roll back through version control and the application's normal build/deploy path.
- A submitted message cannot be recalled by this plugin. Correct it with a business follow-up or Provider-specific recovery; preserve Notification, Delivery, and Attempt history.

# Verification Checklist

- The owning application and installed notification package versions are identified.
- Core and optional plugins, migrations, queue, authentication, and authorization dependencies match the requested capability.
- Enabled Channel configs have registered Channel and Provider definitions.
- Provider names are unique within each Channel and persisted identities remain stable.
- Secrets originate from an approved runtime source and are absent from diffs, logs, and reports.
- Every requested recipient is supported by every selected Channel; one allowed and one denied case are tested.
- `send()` uses the shared `notificationServiceToken`, not a second manager or direct Provider call.
- Provider routing uses names from enabled configuration and `all` fan-out is intentional.
- Every real send records its Notification id and reads back Delivery/Attempt status.
- `accepted`, `failed` with `nextRunAt`, and `unknown` are interpreted according to the runtime contract.
- Log and test routes enforce authentication and the `page:notification.logs` `access` permission where supplied by the plugin.
- Package lint, typecheck, tests, and build pass for every changed notification package.

# Minimal Test Scenarios

1. Valid send: one supported recipient and enabled Channel creates a Notification and reaches an accepted Delivery in a fake Provider.
2. Valid fan-out: multiple recipients/Channels or `strategy: 'all'` create the expected independent Deliveries with stable Provider identities.
3. Invalid input: an empty recipient/Channel list or unknown Provider is rejected before an external Provider call.
4. Runtime failure: missing definitions, queue failure, retryable Provider failure, and submission timeout produce the documented persisted/reconciled outcome.
5. Authentication and safety: unauthenticated/unauthorized log or test requests are denied, test mode/header gates are enforced, and secret/message snapshots are absent from log API responses.

# Output Contract

Final response must include:

- Requested action and resolved application, Channel, Provider, or Notification id.
- Source/configuration changes and runtime sends as separate items.
- Validation commands and their result.
- Notification and Delivery ids plus terminal or last-observed statuses for a send/inspection.
- Provider error category, retry time, Attempt evidence, and `unknown` uncertainty when diagnosing.
- Defaults and assumptions applied, secret-handling confirmation, and the exact next action when blocked.

# References

- [Notification Concepts](references/notification-concepts.md): use for architecture, terminology, package boundaries, and statuses.
- [Integration and Configuration](references/integration-and-configuration.md): use for runtime setup, built-in configuration, routes, and lifecycle.
- [Sending Notifications](references/sending-notifications.md): use for recipient, content, routing, and readback contracts.
- [Delivery Diagnostics](references/delivery-diagnostics.md): use for evidence-driven failure analysis and safe recovery.
- [Channel and Provider Extensions](references/channel-and-provider-extensions.md): use for custom integration implementation and review.
