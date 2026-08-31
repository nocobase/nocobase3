# Integration and Configuration

## Prefer plugin composition

For a normal NocoBase application, enable the core plugin plus the Channel packages the application needs. Their server plugins contribute migrations, Service Providers, and routes. The core Provider resolves the existing database, queue, and logger from the shared Application container and registers `notificationServiceToken`.

Apply the owning application's migration command after changing enabled plugins. The core package creates Notification, Delivery, and Attempt tables; the in-app package creates the personal inbox table.

Boot ordering matters:

1. The core notification Provider registers the manager singleton.
2. Optional Channel packages register definitions during boot.
3. The core Provider activates queue registration and reconciliation during application start; Channel runtimes are created lazily on first use.
4. A custom host may call `start()` after registering every definition to initialize all enabled Channel runtimes eagerly.
5. Shutdown calls `close()` so the reconciler and Providers release resources.

Install mode may activate queue registration before notification tables exist, but runtime delivery requires migrations to be complete.

## Built-in configuration

The application's `notification.channels` array is the source of enabled runtime configurations. A default application commonly enables the database-backed in-app Channel and conditionally adds Email or IM Providers from secrets:

```ts
const notification = {
  channels: [
    defineInAppChannelConfig({
      enabled: true,
      providers: [{ type: 'database', name: 'primary' }],
    }),
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'smtp',
          host: secrets.smtpHost,
          port: 587,
          secure: false,
          auth: { user: secrets.smtpUser, pass: secrets.smtpPassword },
          from: 'NocoBase <notifications@example.com>',
        }),
      ],
    }),
  ],
};
```

Use `secure: true` only for immediate TLS as required by the server, commonly port 465. Port 587 commonly starts plaintext and upgrades with STARTTLS. SMTP user/password must both be present or both absent.

Resend requires an API key and sender accepted by the account/domain. Feishu Webhooks must use HTTPS on `open.feishu.cn` or `open.larksuite.com`; DingTalk Webhooks must use HTTPS on `oapi.dingtalk.com`. The built-in Webhook Providers reject redirects. Prefer signature secrets when the platform supports them.

Webhook URLs are credentials. Load Webhook URLs, signature secrets, SMTP passwords, and Resend API keys from the application's runtime secret source. Never commit, print, or return them.

## Stable identities

Each enabled Channel requires at least one enabled Provider. Provider names must be unique within the Channel. The runtime verifies that each created Provider's `name` and `type` match configuration.

Persisted Deliveries record Provider name and type. Configuration changes should preserve those identities until no Delivery is pending, retrying, preparing, or submitting. If a definition disappears, the manager fails that Delivery instead of silently moving it to a different Provider.

## Registration without plugin discovery

Custom hosts can create a registry, register Channel and Provider definitions, create one manager with the host database/queue/logger, then mount routes and own lifecycle. Register definitions before `start()` or the first `send()` for that Channel.

The core `manager.router` exposes `GET /logs` and `GET /logs/:id` without adding authentication itself. The plugin's normal route contribution mounts it at `/api/notifications` with required authentication, authorization middleware, and `page:notification.logs` `access` checks. Custom hosts must provide equivalent protection.

The in-app router must derive the current user from trusted authentication state. Never accept a client-supplied user id as the current identity. Its write endpoints use a CSRF token/cookie pair.

## Provider test surface

The built-in Provider package exposes authenticated `/api/notification-providers/test` routes only when `notification.test.enabled` is true. Sending also requires `x-nocobase-provider-test: 1` and the notification logs page permission. Tests use the real manager and create persistent logs.

Keep the test surface disabled by default in production. A production test is a real external send and requires explicit scope, recipient, Provider, and follow-up verification.

## Configuration verification

- Inspect the application's effective redacted configuration, not only environment files.
- Confirm each configured Channel and Provider definition is registered.
- Confirm migrations exist before starting delivery workers.
- Confirm the queue worker and reconciler are active.
- Confirm logs and test routes reject unauthenticated and unauthorized requests.
- Confirm startup fails clearly for duplicate Provider names, missing definitions, or mismatched runtime identity.
