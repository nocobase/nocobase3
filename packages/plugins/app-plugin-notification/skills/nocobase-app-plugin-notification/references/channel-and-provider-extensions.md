# Channel and Provider Extensions

A message handler implements `NotificationChannelDefinition` with `type`, `createChannel`, and optional safe test-field metadata. Its runtime `validateMessage(unknown)` returns a validated complete message and native recipient snapshots before any persistence. `prepare` builds the Provider payload for one Delivery and honors its abort signal. Resolve no application-user contact fields here.

A Provider implements `NotificationProviderDefinition` with globally unique `type`, `messageType`, optional `validateConfig`, and `createProvider(context, config)`. Configuration has a `provider` discriminator and flat transport options. The runtime exposes the same `type`, `send`, optional capabilities, and optional `close`. There is no Provider instance name.

```ts
const registry = app.container.resolve(notificationExtensionRegistryToken);
registry
  .registerChannel(createSmsChannelDefinition())
  .registerProvider(createExampleSmsProviderDefinition());
```

Provider definitions reference their reusable message handler through `messageType`. Extend `NotificationChannelSchemas` with the Provider identifier and its recipient/message schema so configured Channel names infer the correct `messages` values. Extension plugins register through `notificationExtensionRegistryToken` before activation; consumers send through `notificationServiceToken`.

## Result classification

Return `accepted` only when the external service confirms it accepted the submission. Include a Provider message id when available.

Return `failed` when the service definitively rejected or did not submit the message. Classify the error and choose retry disposition:

- `never` for invalid recipient/content/configuration and other permanent failures.
- `same_provider` for bounded transient failures such as a retryable rate limit or temporary network failure.
- Set `retryAfterMs` only from a validated Provider hint. The notification runtime uses the configured fixed retry interval when this field is absent.

Return `submission_unknown` when the request may have reached the Provider but confirmation was lost. This prevents automatic duplicates.

Declare Provider-side duplicate protection with `capabilities.idempotency`. This describes the external Provider contract only; it does not make an `unknown` Delivery directly retryable. Omitted capabilities are treated as `{ idempotency: { supported: false } }`. Set `{ supported: true }` only when repeated submissions with the same core-supplied `deliveryId` are idempotent; include `retentionMs` when the guarantee expires. The built-in database Provider is durable for the Delivery lifetime, Resend is bounded to its declared retention, and SMTP plus the built-in Webhook Providers omit capabilities because they do not claim idempotency.

Use the core error categories: `authentication`, `channel`, `configuration`, `content`, `network`, `provider`, `rate_limit`, `recipient`, `storage`, `timeout`, or `unknown`. Error messages must be actionable and sanitized.

## Security

- Validate outbound hostnames, schemes, redirects, ports, and payload sizes for Webhook-like Providers.
- Keep credentials in Provider configuration supplied by the host secret source.
- Redact credentials, authorization headers, Webhook query tokens, message bodies, and personal recipient data from errors/logs.
- Bound Provider execution with the supplied `deadline` and `AbortSignal`.
- Avoid unbounded response bodies and parse only the fields needed to classify a result.

## Extension tests

Cover complete message validation, native recipient expansion, atomic rejection before enqueue, final recipient validation where applicable, Provider result classification, timeout/abort, same-Provider retries, lease recovery, resource cleanup, and redacted errors. Verify globally unique Provider registration and that persisted deliveries cannot move to a replacement Channel or Provider. Run package checks and consuming application checks after changing public contracts.
