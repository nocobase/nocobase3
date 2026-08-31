---
name: nocobase-app-plugin-file
description: Provide focused example patterns for integrating @nocobase/app-plugin-file into NocoBase 3 business modules. Use when designing one-to-one or one-to-many file tables, scoped API routes, authorization, private access tokens, or reusable file UI.
metadata:
  short-description: Integrate file attachments into NocoBase 3 modules
---

# File attachments

Treat every snippet as an example. Adapt collection and resource names,
authorization actions, visibility, limits, and UI behavior to the module. The
business module owns its tables, relations, route registration, form
submission, and authorization policy.

## Core rules

- Resolve the host's database, Drive manager, authentication, and authorization
  from the shared `ServiceContainer`. Read typed host configuration with
  `config.get(appConfig)`, `config.get(driveConfig)`, and
  `config.get(sessionConfig)`; do not create duplicate services.
- Store stable metadata only. Never persist final URLs or access tokens.
- Keep table names and scope fields in server code. Derive scope from validated
  route parameters, and apply it to every list, read, create, and delete query.
- Use a unique owner key for one-to-one relations and an indexed owner key for
  one-to-many relations. Keep `UNIQUE (disk, key)` on every file table.
- Protect management operations with the application's existing authorization
  model. Public content and short-lived private token URLs follow the route's
  configured visibility contract.
- Declare business HTTP routes with `defineApiRoutes()`. Paths inside its Hono
  router are relative to `/api`; export the contribution in the plugin's
  `routes` array.
- Keep Registry source limited to application-owned UI. It must not contain
  database, Drive, token, or authorization logic.
- Do not use the legacy `storages:*` protocol, direct storage-driver calls from
  business modules, or an upload-intent/complete flow.

## References

Read only the guide needed for the current task:

- Start an integration: [quick start](reference/quick-start.md)
- Design tables and relations: [data model](reference/data-model.md)
- Configure or review HTTP behavior: [Route API](reference/route-api.md)
