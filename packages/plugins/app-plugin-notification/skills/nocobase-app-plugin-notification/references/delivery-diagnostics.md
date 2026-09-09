# Delivery Diagnostics

## Evidence order

1. Resolve the exact Notification id from the send result, business source, or logs page.
2. Read the Notification summary and all Deliveries.
3. For each unexpected Delivery, record Channel, Provider name/type, status, attempt count, `nextRunAt`, and sanitized `lastError`.
4. Read Retry Audits and Attempts in order. A Retry Audit exists for every accepted manual retry request; an Attempt exists only after Provider submission starts. Identify whether failure happened before Provider submission, during a known failed submission, or after an uncertain submission.
5. Correlate structured server logs by Notification id, Delivery id, Attempt id, Channel, and Provider identity.
6. Inspect effective redacted configuration and runtime registration only after fixing the failing layer in the evidence chain.

The protected logs API intentionally omits message and recipient snapshots plus lease tokens. Use server-side business context for content diagnosis; do not weaken redaction or query raw tables merely to display secrets.

## Status-specific checks

### Pending or processing

- Confirm the queue manager and worker are started.
- Look for `notification.delivery.enqueue_failed`; the reconciler should redispatch ready work.
- Confirm the reconciler interval and ready batch are advancing.
- For `failed` with `nextRunAt`, the Delivery is scheduled for retry and the Notification remains processing.
- For a long `preparing`/`submitting` state, inspect lease heartbeat, worker health, Provider timeout, and application shutdown.

An expired preparation lease returns to pending. An expired submission lease becomes unknown because the worker may have completed the external request before losing persistence.

### Failed

- `recipient`: the Channel cannot resolve the recipient or the address/target is invalid.
- `configuration`: definition, Provider identity, sender, or runtime configuration is missing/invalid.
- `authentication`: Provider credentials were rejected.
- `content`: rendered/prepared message violates Provider constraints.
- `network`, `rate_limit`, or `timeout`: inspect retry disposition and `nextRunAt`.
- `storage`: persistence or in-app inbox delivery failed.
- `provider` or `unknown`: inspect the Provider's sanitized response and correlated logs.

A Provider can request same-Provider retry. Once the configured attempt limit is exhausted, the Delivery becomes terminal failed. The runtime does not fail over to another Provider.

### Partial

Treat every Delivery independently. Identify exactly which recipient/Channel/Provider targets were accepted and which failed. A new send for only failed targets is a new Notification and requires duplicate-risk review.

### Unknown

Do not retry automatically. Use Provider message id when available, external Provider dashboards, target inbox/group evidence, and timestamps to determine whether submission happened. `retryDelivery` always requires an auditable reason. It uses the Provider's declared `deliveryId` idempotency when still valid; otherwise invoking it accepts possible duplication. If proof remains unavailable, report an indeterminate external effect and ask the business owner whether a possible duplicate is safer than a possible omission.

## Common symptoms

| Symptom                               | Check                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Channel is not enabled                | Effective `notification.channels`, `enabled`, and exact type            |
| Channel definition is not registered  | Optional plugin installed/enabled and boot order before first send      |
| Provider definition is not registered | Built-in/custom Provider plugin booted and exact Channel/type pair      |
| No matching enabled Provider          | Provider name in routing and effective enabled config                   |
| Runtime identity mismatch             | Definition returns the configured name/type exactly                     |
| Unsupported recipient                 | Recipient union member and Channel resolver contract                    |
| Queue dispatch warning                | Reconciler recovery, worker availability, persistent ready Delivery     |
| Repeated retry                        | Attempt categories, disposition, retry delay, and max attempts          |
| Submission timeout                    | Provider timeout, abort handling, remote latency, and unknown risk      |
| Log route 401/403                     | Authentication and `page:notification.logs` `access` permission         |
| Notification test 403                 | Authentication, test header, and `notification:test/send` on submission |

## Safe recovery

- Correct configuration or restore a missing definition, restart through the normal lifecycle, and allow reconciliation to process pending/retryable Deliveries.
- Do not rewrite Provider name/type on persisted Deliveries.
- Do not mark a failed or unknown Delivery accepted by hand.
- After correcting the cause, retry a terminal failed Delivery with `retryDelivery({ deliveryId, reason })`; do not retry one that already has `nextRunAt`. An unsupported recipient cannot be repaired in-place and requires a corrected new logical send.
- For unknown, use `retryDelivery` only after checking Provider evidence. Valid Provider idempotency makes the retry safe; otherwise the invocation accepts possible duplication and its required reason must record the evidence and decision. Never create a new Notification merely to bypass this gate.
- Preserve all prior history and document possible duplicates for any recovery after an unknown submission.

## Diagnostic report

Report Notification id/status, each relevant Delivery id/status, Channel, Provider name/type, Retry Audit resolution/reason/evidence, Attempt sequence/status/timestamps, sanitized error category/code/message, `nextRunAt`, queue/reconciler evidence, and the safest recovery. State explicitly whether final downstream delivery is proven, merely Provider-accepted, failed, or unknown.
