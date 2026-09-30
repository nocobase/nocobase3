# Delivery Diagnostics

## Evidence order

1. Resolve the exact Notification id from the send result, business source, or logs page.
2. Read the Notification summary and all Deliveries.
3. For each unexpected Delivery, record Channel, Provider identifier, status, attempt count, `nextRunAt`, and sanitized `lastError`.
4. Read Retry Audits and Attempts in order. A Retry Audit exists for every accepted manual retry request; an Attempt exists only after Provider submission starts. Determine whether failure happened before submission, during a confirmed rejection, or after an uncertain submission.
5. Correlate structured server logs by Notification id, Delivery id, Attempt id, Channel, and Provider identity.
6. Inspect effective configuration and runtime registration only after isolating the failing layer.

The protected logs API omits message and recipient snapshots plus lease tokens and lease expiration. Use server-side business context for content diagnosis; do not weaken redaction or query raw tables to display secrets.

## Status-specific checks

### Pending or processing

- Confirm the jobs executor and worker are started and that the configured jobs adapter is available.
- Look for `notification.delivery.enqueue_failed`; reconciliation should redispatch ready work.
- Confirm the reconciler interval and batch are advancing. Defaults are a 30-second interval and batch size of 100.
- `retrying` means the Delivery is scheduled for retry and `nextRunAt` records its earliest execution time.
- For a long `preparing` or `submitting` state, inspect lease heartbeat, worker health, Provider timeout, and application shutdown.

An expired preparation lease returns to pending. An expired submission lease becomes `unknown` because the worker may have completed the external request before losing persistence.

### Failed

The following are diagnostic categories, not guaranteed one-to-one Provider error messages: `recipient` (unsupported, missing, or invalid address), `configuration` (missing definition, Provider identity, sender, or runtime configuration), `authentication` (credentials rejected), `content` (invalid prepared message), `network`, `rate_limit`, `timeout`, `storage`, `provider`, or `unknown`. Read the sanitized error `code` and `message` for the concrete failure.

A Provider can request a bounded retry with disposition `same_provider`. `never` marks a known permanent failure. Once `notification.retry.maxAttempts` is exhausted, the Delivery becomes terminal `failed`; the runtime does not fail over to another Provider. Resend declares idempotency for 24 hours. Built-in SMTP and Webhook Providers make no idempotency guarantee.

### Built-in Provider signals

| Provider result | Runtime outcome |
| --- | --- |
| SMTP response code `4xx` | Known failure; retry on the same Provider while attempts remain |
| SMTP response code `5xx` or rejected credentials/message | Permanent known failure; no automatic retry |
| SMTP DNS/connect failure before submission | Known pre-submission failure; retry on the same Provider |
| SMTP timeout, reset, or broken pipe after submission may have started | `unknown`; verify with the mail service before replacing the send |
| Resend HTTP `429` or `5xx` | Same-Provider retry; the built-in Provider sends the Delivery id as the idempotency key, retained for 24 hours |
| Resend timeout/reset/broken pipe | `unknown`; the request may have been accepted |
| Feishu/DingTalk HTTP `429` | Same-Provider retry; a valid HTTP `Retry-After` hint overrides the configured interval |
| Feishu/DingTalk HTTP `5xx` | `unknown`; HTTP success with a Provider-body rejection is classified from the returned Provider code |
| Feishu/DingTalk successful HTTP response with a body error code | Rate-limit and known transient Provider codes retry on the same Provider; other body rejections are permanent |

For Webhook network failures, connect/TLS failures known to occur before submission are retryable; failures after a request may have reached the endpoint are `unknown`. Do not infer retryability from a generic `network` category alone; use the recorded Delivery status and sanitized Provider code/message.

### Partial

Treat every Delivery independently. Identify exactly which recipient, Channel, and Provider combinations were accepted and which failed. A new send for failed combinations is a new Notification and requires duplicate-risk review.

### Unknown

Do not retry an unknown Delivery directly. Use Provider message ids when available, external Provider dashboards, target inbox or group evidence, and timestamps to determine whether submission happened. If proof remains unavailable, report an indeterminate external effect. If evidence confirms no message was submitted, create a new logical Notification under the business idempotency policy.

## API errors and common symptoms

The logs endpoints are `GET /api/notifications/logs` and `GET /api/notifications/logs/:id`. The list returns the most recent 100 records and has no pagination or filter parameters. Details include Deliveries, Attempts, and Retry Audits. A missing log returns HTTP `404` with `NOTIFICATION_LOG_NOT_FOUND`; unauthenticated requests return `401`; missing `page:notification.logs` `access` permission returns `403` with `NOTIFICATION_LOGS_FORBIDDEN`.

The test API requires authentication and `x-nocobase-notification-test: 1`. Missing header or missing `notification:test` `send` permission on submission returns `403`; invalid input returns `400`; an unknown status id or another user's test id returns `404`. Test sends are real sends.

| Symptom | Check |
| --- | --- |
| Channel is not enabled | Effective `notification.channels`, `enabled`, and exact Channel name |
| Channel definition is not registered | Optional package installed and plugin boot order before first send |
| Provider definition is not registered | Built-in or custom Provider plugin booted and exact Provider identifier |
| Runtime identity mismatch | Definition returns the registered Provider identifier exactly |
| Unsupported recipient | Native recipient address and message validation contract |
| Queue dispatch warning | Reconciler recovery, worker availability, and persisted ready Delivery |
| Repeated retry | Attempt categories, configured interval, and maximum attempts |
| Submission timeout | Provider timeout, abort handling, remote latency, and unknown risk |
| Logs API 401/403 | Authentication and `page:notification.logs` `access` permission |
| Test API 403 | Authentication, test header, and `notification:test` `send` permission for submission |

## Safe recovery

- Correct configuration or restore the missing definition, restart through the normal lifecycle, and let reconciliation process pending or retryable Deliveries.
- Do not rewrite the Provider identity on a persisted Delivery or mark a failed or unknown Delivery accepted by hand.
- After correcting the cause, retry a terminal failed Delivery with `retryDelivery({ deliveryId, reason })`; `retrying` is already scheduled. An unsupported recipient requires a corrected new logical send.
- For `unknown`, inspect Provider evidence first. If the result remains uncertain, preserve `unknown` and report the external effect as indeterminate.
- Preserve history and document duplicate risk for any recovery after an unknown submission.

A diagnostic report should include Notification id and status, each relevant Delivery id and status, Channel and Provider, Retry Audit reason, Attempt sequence and timestamps, sanitized error category/code/message, `nextRunAt`, queue/reconciler evidence, and safest recovery. State whether final downstream delivery is proven, merely Provider-accepted, failed, or unknown.
