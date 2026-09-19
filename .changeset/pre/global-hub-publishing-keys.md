---
'@nocobase/app-plugin-hub': patch
---

Move publishing API key management to the Hub navigation and allow each key to bind multiple existing Apps or all current and future Apps. Reuse the existing upload-release and deploy actions, enforce owner permissions for every selected App, and migrate legacy bindings without promoting read permissions to writes.

Allow creators to retrieve active Hub publishing keys through an authenticated, audited copy action backed by encrypted storage. Preserve hash-only authentication in the generic plugin and mark legacy keys as unrecoverable.
