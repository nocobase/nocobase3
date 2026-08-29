# @nocobase/app-plugin-service-provider-example

This server-only plugin demonstrates the v3 ServiceProvider pattern with a
small `HeartbeatService`:

- `server/services/heartbeat.ts` contains the domain implementation.
- `server/tokens.ts` defines the stable service contract and typed token.
- `server/providers/index.ts` composes the Provider collection, while
  `server/providers/service-provider-example.ts` registers the service through
  `this.app.container` and manages its lifecycle.
- `server/routes/index.ts` creates a dedicated API Router and resolves the service
  through `app.container`.
- `server/plugin.ts` explicitly declares the Provider and Route collections.

After enabling the plugin, request `GET /api/service-provider-example/status` to
inspect the service lifecycle state. A fully started application returns a
response like this:

```json
{
  "service": "@nocobase/app-plugin-service-provider-example",
  "status": "ready",
  "startedAt": "2026-08-28T00:00:00.000Z"
}
```
