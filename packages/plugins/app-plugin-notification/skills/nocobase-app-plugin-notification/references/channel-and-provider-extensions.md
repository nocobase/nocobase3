# Channel and Provider Extensions

## Ownership split

A Channel defines the business-to-delivery adaptation:

- Resolve an optional generic `NotificationRecipient` into a Channel recipient; return a recipient directly when the Channel supports recipientless delivery.
- Render common `NotificationContent` plus a Channel override into a Channel message.
- Prepare a Provider-ready payload with an abort signal.

A Channel may also contribute a narrow test adapter: safe field descriptors and conversion/validation into the normal send inputs. A Provider may contribute a public label and server-only configuration validation. Never place Provider configuration or secrets in a test descriptor.

A Provider defines one transport implementation:

- Expose stable `name` and `type` matching configuration.
- Submit the prepared payload before the deadline and honor cancellation.
- Return `accepted`, known `failed`, or `submission_unknown` without throwing transport details across the contract.
- Close network resources when the manager shuts down.
- Declare whether repeated submission with the same `deliveryId` is idempotent and, if applicable, the retention window.

Keep network I/O and credentials in the Provider. Keep user/address resolution, message rendering, and Provider-independent validation in the Channel. Keep persistence, queueing, leases, retries, and logs in the core manager.

## Definition contracts

Implement a `NotificationChannelDefinition<TConfig, TRecipient, TMessage, TPrepared>` with a stable `type` and `createChannel(context, config)`. Its optional `test` adapter owns only safe fields and `toSendInput()`. Implement a `NotificationProviderDefinition<TConfig, TPrepared>` with a stable Provider `type` and `createProvider(context, config)`. Reuse the same validation helper from optional `validateConfig()` and `createProvider()` so activation and runtime creation cannot disagree.

Register the Channel once, then register every Provider definition under that Channel type before the first runtime creation:

```ts
import { notificationExtensionRegistryToken } from '@nocobase/app-plugin-notification';

const notificationRegistry = app.container.resolve(
  notificationExtensionRegistryToken,
);
notificationRegistry
  .registerChannel(createSmsChannelDefinition())
  .registerProvider('sms', createExampleSmsProviderDefinition());
```

Extension plugins use `notificationExtensionRegistryToken`; they do not
resolve `notificationServiceToken` or depend on the manager lifecycle and
route surface.

Duplicate Channel types and duplicate Provider types within a Channel are rejected. At runtime, Provider names from configuration must be unique within the Channel.

## Result classification

Return `accepted` only when the external service confirms it accepted the submission. Include a Provider message id when available.

Return `failed` when the service definitively rejected or did not submit the message. Classify the error and choose retry disposition:

- `never` for invalid recipient/content/configuration and other permanent failures.
- `same_provider` for bounded transient failures such as a retryable rate limit or temporary network failure.
- Set `retryAfterMs` only from a validated Provider hint or bounded local policy.

Return `submission_unknown` when the request may have reached the Provider but confirmation was lost. This prevents automatic duplicates.

Declare Provider retry safety with `capabilities.idempotency`. Omitted capabilities are treated as `{ idempotency: { supported: false } }`. Set `{ supported: true }` only when repeated submissions with the same core-supplied `deliveryId` are idempotent; include `retentionMs` when the guarantee expires. The built-in database Provider is durable for the Delivery lifetime, Resend is bounded to its declared retention, and SMTP plus the built-in Webhook Providers omit capabilities because they do not claim idempotency.

Use the core error categories: `authentication`, `channel`, `configuration`, `content`, `network`, `provider`, `rate_limit`, `recipient`, `storage`, `timeout`, or `unknown`. Error messages must be actionable and sanitized.

## Security

- Validate outbound hostnames, schemes, redirects, ports, and payload sizes for Webhook-like Providers.
- Keep credentials in Provider configuration supplied by the host secret source.
- Redact credentials, authorization headers, Webhook query tokens, message bodies, and personal recipient data from errors/logs.
- Bound Provider execution with the supplied `deadline` and `AbortSignal`.
- Avoid unbounded response bodies and parse only the fields needed to classify a result.

## Extension tests

- Channel resolves each allowed recipient, supports an omitted recipient when applicable, and rejects unsupported shapes without external I/O.
- Renderer merges common content and overrides without mutating input.
- Preparation validates payload and honors abort.
- Provider returns accepted with the external id on a confirmed success.
- Permanent errors use `never`; transient errors use bounded `same_provider` retry; uncertain timeouts return `submission_unknown`.
- Provider identity matches configuration and duplicates are rejected.
- Credentials and message/recipient secrets do not appear in logs or errors.
- Manager integration persists Deliveries/Attempts, retries correctly, recovers leases, and closes Provider resources.
- Authentication and authorization protect any extension-owned management or test routes.

Run lint, typecheck, test, and build in both the extension package and the consuming application package when public types or registration change.
