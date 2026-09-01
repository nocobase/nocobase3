# @nocobase/app-plugin-hub

Provides a frontend-only Hub management experience for NocoBase applications.
It is registered by the default application template and contributes authenticated
application, deployment, audit, and member-management routes.

## Client capabilities

- `client.routes`
- `client.service-providers`
- `client.react-providers`
- `client.locales`

The plugin provides `/apps`, `/deployments`, `/audit`, and `/members`, plus
application and deployment detail routes. It includes runtime and release actions,
deployment retry simulation, audit export and inspection, member invitations,
application permissions, Agent credentials, built-in roles, responsive layouts,
theme support, and English and Chinese resources.

All records and mutations are browser-memory fixtures. They intentionally reset
after a full page reload because this package does not contribute a Server plugin.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```
