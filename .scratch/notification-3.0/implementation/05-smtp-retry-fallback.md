# Deliver email through SMTP with retry and fallback

Type: implementation / AFK
Status: in_progress
Label: needs-triage
Blocked by: [01](01-module-shell-mount-lifecycle.md), [02](02-notification-store-schema-contract.md)

## What to build

Add the Provider extension boundary, config-owned SMTP and Fake Provider Instances, Email Delivery execution, fixed Provider Chain, retry, fallback, and conservative uncertain-submission recovery. Complete the path with user Email items and delivery query APIs.

## Acceptance criteria

- [x] Provider implementations and Provider Instance configuration remain separated under the approved directories.
- [x] Credentials resolve from environment/Secret references and never appear in persistence, API output, Live payloads, or logs.
- [x] SMTP success becomes accepted, in-app success remains delivered, and no SMTP result is mislabeled delivered.
- [x] Transient, permanent, disabled, misconfigured, and uncertain errors follow the approved retry/fallback matrix.
- [x] Attempts persist Provider identity/revision, invocation boundary, external message ID when available, and redacted results.
- [x] Email user targets produce independent Email UserNotificationItems at accepted; direct Email targets remain outside every Inbox.
- [ ] Local SMTP and Fake tests cover success, three-attempt retry, fallback, timeout, crash before invocation, and submission unknown.
- [x] Notification and Delivery detail/query DTOs expose only the approved redacted projections.
