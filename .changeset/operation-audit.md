---
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/app-plugin-ai-knowledge-base': patch
'@nocobase/app-plugin-audit': minor
'@nocobase/app-plugin-authentication': minor
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-i18n': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/app-plugin-workflow': minor
'@nocobase/app-server': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
'@nocobase/create-app': patch
'@nocobase/db': minor
---

Add operation auditing for HTTP requests, database writes, workflows, and AI activity, with permission-aware views, capture settings, health reporting, and retention. Keep pagination valid across service instances and reject conflicting HTTP audit declarations at startup. Preserve business outcomes and transactional guarantees while excluding sensitive payloads.

Integrate official plugins and application templates through public APIs, with unambiguous notification routes and verified object-scoped integration guidance. Support full-stack Hub scaffolding, include required template client dependencies, and constrain Better Auth to releases compatible with the account schema. Ensure packaged AI plugins load compiled migrations and queue discovery excludes TypeScript declarations.
