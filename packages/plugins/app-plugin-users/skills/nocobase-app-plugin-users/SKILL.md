---
name: nocobase-app-plugin-users
description: User identity storage and lifecycle services for NocoBase applications.
---

# Users

`@nocobase/app-plugin-users` owns the NocoBase user record, identity normalization, uniqueness constraints, status fields, soft-delete filtering, user locking, and transaction-bound user services. It does not own passwords, accounts, sessions, Better Auth flows, management pages, or role assignment.

Authentication consumes the users storage contract. User management composes users with authentication and authorization to implement administrator-facing workflows. Consumers must use the exported service token and must not write the `user` table directly.

User writes that change disabled or deleted state run the registered lifecycle handlers in the same database transaction. Cache invalidation and realtime disconnects are post-commit effects; callers must treat a post-commit failure as a committed operation and retry the effect, not the user write.
