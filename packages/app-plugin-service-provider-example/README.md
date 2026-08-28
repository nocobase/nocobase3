# @nocobase/app-plugin-service-provider-example

This server-only plugin demonstrates the v3 ServiceProvider pattern with a
small `HeartbeatService`:

- `server/service.ts` contains the service implementation.
- `server/token.ts` defines the typed service token.
- `server/provider.ts` registers the service through `this.app.container` and
  manages its lifecycle.
- `server/routes/index.ts` resolves the service through `app.container`.

After enabling the plugin, request `GET /service-provider-example/status` to
inspect the service lifecycle state. A fully started application returns a
response like this:

```json
{
  "service": "@nocobase/app-plugin-service-provider-example",
  "status": "ready",
  "startedAt": "2026-08-28T00:00:00.000Z"
}
```
