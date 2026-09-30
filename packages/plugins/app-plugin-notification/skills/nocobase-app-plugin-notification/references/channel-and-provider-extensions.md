# Channel and Provider Extensions

A Channel definition owns the message contract and recipient expansion. Implement `NotificationChannelDefinition` with a globally unique `type`, optional `validateConfig`, and `createChannel`; the runtime `validateMessage(unknown)` must return a validated message and native recipient snapshots before persistence. `prepare` builds the Provider payload for one Delivery and honors its abort signal. Do not resolve application-user contact fields here.

A Provider definition owns transport configuration and submission. Implement `NotificationProviderDefinition` with a globally unique `type`, `messageType`, optional `validateConfig`, and `createProvider(context, config)`. Provider config has a `provider` discriminator and flat transport options; there is no Provider instance name. Its `send` receives `message`, `notificationId`, `deliveryId`, `attemptId`, `deadline`, and `signal`.

Register definitions from a Server `ServiceProvider.boot()` before any send uses that Channel:

```ts
import { notificationExtensionRegistryToken } from '@nocobase/app-plugin-notification';
import { ServiceProvider } from '@nocobase/service-provider';

export default class SmsProvider extends ServiceProvider {
  override async boot() {
    const registry = this.app.container.resolve(notificationExtensionRegistryToken);
    registry.registerChannel(createSmsChannelDefinition());
    registry.registerProvider(createSmsProviderDefinition());
  }
}
```

Provider definitions reference their reusable message handler through `messageType`. Extend `NotificationChannelSchemas` with the Provider identifier and its recipient/message schema so configured Channel names infer the correct `messages` values. The built-in package exports `registerBuiltInNotificationProviders`, `defineSmtpProviderConfig`, `defineResendProviderConfig`, `defineFeishuWebhookProviderConfig`, and `defineDingTalkWebhookProviderConfig`; config helpers set the `provider` discriminator and return a Channel map value.

## Result classification

Return `accepted` only when the external service confirms it accepted submission; include its Provider message id when available. Return `failed` when the service definitively rejected or did not submit the message, with a sanitized error and disposition: `never` for permanent failures, `same_provider` for bounded transient failures. Set `retryAfterMs` only from a validated Provider hint. Return `submission_unknown` when the request may have reached the Provider but confirmation was lost; this prevents automatic duplicate submissions.

Declare Provider-side duplicate protection with `capabilities.idempotency`. This describes the external Provider contract; it does not make an `unknown` Delivery directly retryable. Omitted capabilities mean idempotency is unsupported. Set `{ supported: true }` only when repeated submissions with the same core-supplied `deliveryId` are idempotent, and include `retentionMs` when the guarantee expires. Resend's built-in guarantee lasts 24 hours; SMTP and built-in Webhook Providers do not claim idempotency.

Use core error categories `authentication`, `channel`, `configuration`, `content`, `network`, `provider`, `rate_limit`, `recipient`, `storage`, `timeout`, or `unknown`. Error messages must be actionable and sanitized.

## Security and lifecycle

- Validate outbound hostnames, schemes, redirects, ports, and payload sizes for Webhook-like Providers.
- Keep credentials in Provider configuration supplied by the host's secret source.
- Redact credentials, authorization headers, Webhook query tokens, message bodies, and personal recipient data from errors and logs.
- Bound Provider execution with the supplied `deadline` and `AbortSignal`; close long-lived transport resources in `close()`.
- Avoid unbounded response bodies and parse only fields needed to classify a result.

Extension checks should cover message validation, recipient expansion, atomic rejection before enqueue, final recipient validation where applicable, result classification, timeout/abort, same-Provider retries, lease recovery, resource cleanup, redacted errors, and globally unique Provider registration. A persisted Delivery cannot move to a replacement Channel or Provider.
