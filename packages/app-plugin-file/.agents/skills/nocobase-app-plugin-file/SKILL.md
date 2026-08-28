---
name: nocobase-app-plugin-file
description: Add one-to-one or one-to-many file attachments to NocoBase 3 business modules with @nocobase/app-plugin-file. Use for file tables, scoped routes, access control, tokens, and reusable file UI.
metadata:
  short-description: Add file attachments to NocoBase 3 modules
---

# File attachments

Use the plugin for storage, file access, scoped routes, client APIs, and reusable
UI. The business module remains responsible for its tables, relations, route
mounting, form submission, and authorization.

## Core rules

- Reuse the host's existing database, Drive manager, authentication,
  authorization, base path, and token secret. Do not create a second connection
  or a file-specific service registry.
- Store stable metadata only. Never persist final URLs or access tokens.
- Keep table names and scope fields in server code. Derive scope from validated
  route parameters, and apply it to every list, read, create, and delete query.
- Use a unique owner key for one-to-one relations and an indexed owner key for
  one-to-many relations. Keep `UNIQUE (disk, key)` on every file table.
- Protect management operations with the application's existing authorization
  model. Public content and short-lived private token URLs follow the route's
  configured visibility contract.
- Keep Registry source limited to application-owned UI. It must not contain
  database, Drive, token, or authorization logic.
- Prefer the one-call `database + table + scope` Route configuration. The
  database Store factory is internal; `FileStore` remains the advanced public
  extension point.
- File components accept relative and HTTP(S) content/access URLs only. Use
  upload status to block form submission and preserve cancellation on unmount.

## References

Read only the guide needed for the current task:

- Start an integration: [quick start](reference/quick-start.md)
- Design tables and relations: [data model](reference/data-model.md)
- Configure or review HTTP behavior: [Route API](reference/route-api.md)
- Implement a single file relation: [one-to-one recipe](reference/recipes/one-to-one.md)
- Implement multiple attachments: [one-to-many recipe](reference/recipes/one-to-many.md)

For business authorization rules, also read the
[authorization development Skill](../../../../authorization/skills/authorization-development/SKILL.md).

Do not use the legacy `storages:*` protocol, direct storage-driver calls from
business modules, or an upload-intent/complete flow.
