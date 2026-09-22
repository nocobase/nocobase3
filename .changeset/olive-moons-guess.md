---
'@nocobase/app-plugin-ai-employee': patch
---

Remove the unreachable methods from `ModelService`. `requireModel()` validated a model against the service's `enabledModels` and threw `Model is not enabled`, but no route or service ever called it — only its own test did, and keeping an unreachable check around invites the belief that the list is enforced somewhere, which it is not. `getSupportedProvider()` and `randomUuid()` had no callers at all.
